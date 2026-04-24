"""BMO File Watcher — Mtime-based file change detection for the IDE tab.

Polls currently watched files every 2 seconds and emits change events
when modifications are detected. Agent edits bypass polling by calling
notify_change() directly.
"""

import os
import threading
import time


class FileWatcher:
    """Watches files for changes and notifies via callback."""

    def __init__(self, callback, interval: float = 2.0):
        """
        Args:
            callback: Called with (path, mtime) when a file changes.
            interval: Polling interval in seconds.
        """
        self._callback = callback
        self._interval = interval
        self._watched: dict[str, float] = {}  # path → last known mtime
        self._lock = threading.Lock()
        self._running = False
        self._thread = None

    def watch(self, path: str):
        """Start watching a file."""
        path = os.path.expanduser(path)
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            mtime = 0
        with self._lock:
            self._watched[path] = mtime
        self._ensure_running()

    def unwatch(self, path: str):
        """Stop watching a file."""
        path = os.path.expanduser(path)
        with self._lock:
            self._watched.pop(path, None)

    def notify_change(self, path: str):
        """Immediately notify that a file changed (called after agent edits).

        This bypasses polling so the UI updates instantly.
        """
        path = os.path.expanduser(path)
        try:
            mtime = os.path.getmtime(path)
        except OSError:
            mtime = time.time()
        with self._lock:
            self._watched[path] = mtime
        if self._callback:
            self._callback(path, mtime)

    def _ensure_running(self):
        """Start the polling thread if not already running."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._thread.start()

    def _poll_loop(self):
        """Background polling loop."""
        while self._running:
            time.sleep(self._interval)
            with self._lock:
                paths = dict(self._watched)
            for path, last_mtime in paths.items():
                try:
                    current_mtime = os.path.getmtime(path)
                    if current_mtime > last_mtime:
                        with self._lock:
                            self._watched[path] = current_mtime
                        if self._callback:
                            self._callback(path, current_mtime)
                except OSError:
                    pass

    def stop(self):
        """Stop the watcher."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=3)
