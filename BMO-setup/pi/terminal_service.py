"""BMO Terminal Service — Multi-session PTY management for the IDE tab.

Provides TerminalSession (single bash PTY) and TerminalManager (tracks
multiple named sessions per SocketIO client).
"""

import fcntl
import os
import pty
import select
import struct
import subprocess
import termios
import threading
import time


class TerminalSession:
    """A single interactive bash session backed by a PTY."""

    def __init__(self, term_id: str, cols: int = 80, rows: int = 24):
        self.term_id = term_id
        self.cols = cols
        self.rows = rows
        self.alive = False
        self._master_fd = None
        self._pid = None
        self._reader_thread = None
        self._output_callback = None

    def start_pty(self, output_callback):
        """Fork a bash PTY and start the reader thread."""
        self._output_callback = output_callback
        master_fd, slave_fd = pty.openpty()
        self._master_fd = master_fd

        # Set initial window size
        winsize = struct.pack("HHHH", self.rows, self.cols, 0, 0)
        fcntl.ioctl(slave_fd, termios.TIOCSWINSZ, winsize)

        self._pid = os.fork()
        if self._pid == 0:
            # Child process
            os.setsid()
            os.dup2(slave_fd, 0)
            os.dup2(slave_fd, 1)
            os.dup2(slave_fd, 2)
            os.close(master_fd)
            os.close(slave_fd)
            os.environ["TERM"] = "xterm-256color"
            os.execvp("/bin/bash", ["/bin/bash", "--login"])
        else:
            # Parent
            os.close(slave_fd)
            self.alive = True
            self._start_reader()

    def _start_reader(self):
        """Background thread that reads PTY output and calls the callback."""
        def _read_loop():
            try:
                while self.alive:
                    fd = self._master_fd
                    if fd is None:
                        break
                    ready, _, _ = select.select([fd], [], [], 0.05)
                    if ready:
                        try:
                            data = os.read(fd, 4096)
                            if data and self._output_callback:
                                self._output_callback(self.term_id, data)
                            elif not data:
                                break
                        except OSError:
                            break
            finally:
                self.alive = False

        self._reader_thread = threading.Thread(target=_read_loop, daemon=True)
        self._reader_thread.start()

    def write(self, data: bytes):
        """Send keystrokes to the PTY."""
        if self.alive and self._master_fd is not None:
            try:
                os.write(self._master_fd, data)
            except OSError:
                self.alive = False

    def resize(self, cols: int, rows: int):
        """Resize the PTY window."""
        self.cols = cols
        self.rows = rows
        if self._master_fd is not None:
            try:
                winsize = struct.pack("HHHH", rows, cols, 0, 0)
                fcntl.ioctl(self._master_fd, termios.TIOCSWINSZ, winsize)
            except OSError:
                pass

    def kill(self):
        """Terminate the PTY session."""
        self.alive = False
        if self._master_fd is not None:
            try:
                os.close(self._master_fd)
            except OSError:
                pass
            self._master_fd = None
        if self._pid and self._pid > 0:
            try:
                os.kill(self._pid, 9)
                os.waitpid(self._pid, os.WNOHANG)
            except (OSError, ChildProcessError):
                pass
            self._pid = None


class TerminalManager:
    """Manages multiple terminal sessions per SocketIO client."""

    def __init__(self):
        self._sessions: dict[str, dict[str, TerminalSession]] = {}
        self._lock = threading.Lock()

    def open_terminal(self, sid: str, term_id: str, cols: int, rows: int,
                      output_callback) -> TerminalSession:
        """Create and start a new terminal session.

        Args:
            sid: SocketIO session ID.
            term_id: Unique terminal identifier (e.g., 'term-1').
            cols: Terminal width.
            rows: Terminal height.
            output_callback: Called with (term_id, data_bytes).

        Returns:
            The new TerminalSession.
        """
        session = TerminalSession(term_id, cols, rows)
        session.start_pty(output_callback)

        with self._lock:
            if sid not in self._sessions:
                self._sessions[sid] = {}
            self._sessions[sid][term_id] = session

        return session

    def get_session(self, sid: str, term_id: str) -> TerminalSession | None:
        """Get a terminal session by SID and term_id."""
        with self._lock:
            return self._sessions.get(sid, {}).get(term_id)

    def close_terminal(self, sid: str, term_id: str):
        """Close a specific terminal session."""
        with self._lock:
            sessions = self._sessions.get(sid, {})
            session = sessions.pop(term_id, None)
        if session:
            session.kill()

    def close_all(self, sid: str):
        """Close all terminal sessions for a client (on disconnect)."""
        with self._lock:
            sessions = self._sessions.pop(sid, {})
        for session in sessions.values():
            session.kill()

    def list_sessions(self, sid: str) -> list[str]:
        """List active terminal IDs for a client."""
        with self._lock:
            return list(self._sessions.get(sid, {}).keys())
