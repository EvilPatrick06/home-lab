#!/usr/bin/env python3
"""BMO Windows Proxy — Runs on Windows PC to expose filesystem to BMO IDE.

Connects to BMO's Flask-SocketIO server and handles file operations
so the IDE tab can browse and edit Windows files remotely.

Usage:
    python win_proxy.py --bmo-url http://bmo:5000 --root C:\\Users\\evilp
"""

import argparse
import fnmatch
import os
import re
import subprocess
import sys
import time

try:
    import socketio
except ImportError:
    print("ERROR: python-socketio[client] required. Install with:")
    print("  pip install 'python-socketio[client]'")
    sys.exit(1)


class WindowsProxy:
    """SocketIO client that proxies file operations from BMO to Windows."""

    def __init__(self, bmo_url: str, root: str):
        self.bmo_url = bmo_url
        self.root = os.path.abspath(root)
        self.sio = socketio.Client(reconnection=True, reconnection_delay=2)
        self._setup_handlers()

    def _setup_handlers(self):
        @self.sio.on("connect")
        def on_connect():
            print(f"[win-proxy] Connected to {self.bmo_url}")
            self.sio.emit("win_proxy_register", {"root": self.root})

        @self.sio.on("disconnect")
        def on_disconnect():
            print("[win-proxy] Disconnected from BMO")

        @self.sio.on("win_proxy_request")
        def on_request(data):
            request_id = data.get("request_id", "")
            op = data.get("op", "")
            params = data.get("params", {})

            try:
                result = self._handle_op(op, params)
            except Exception as e:
                result = {"error": str(e)}

            self.sio.emit("win_proxy_response", {
                "request_id": request_id,
                "result": result,
            })

    def _safe_path(self, path: str) -> str:
        """Resolve path relative to root, preventing directory traversal."""
        if path.startswith("~"):
            path = os.path.expanduser(path)
        if not os.path.isabs(path):
            path = os.path.join(self.root, path)
        path = os.path.abspath(path)
        # Allow paths under root
        if not path.startswith(self.root):
            raise ValueError(f"Path outside root: {path}")
        return path

    def _handle_op(self, op: str, params: dict) -> dict:
        """Dispatch a file operation."""
        handlers = {
            "list_directory": self._list_directory,
            "read_file": self._read_file,
            "write_file": self._write_file,
            "edit_file": self._edit_file,
            "grep_files": self._grep_files,
            "find_files": self._find_files,
            "create_file": self._create_file,
            "rename_file": self._rename_file,
            "delete_file": self._delete_file,
        }
        handler = handlers.get(op)
        if not handler:
            return {"error": f"Unknown operation: {op}"}
        return handler(params)

    def _list_directory(self, params: dict) -> dict:
        path = self._safe_path(params.get("path", self.root))
        try:
            entries = os.listdir(path)
            files = []
            dirs = []
            for entry in sorted(entries):
                full = os.path.join(path, entry)
                if os.path.isdir(full):
                    dirs.append(entry + "/")
                else:
                    try:
                        size = os.path.getsize(full)
                    except OSError:
                        size = 0
                    files.append({"name": entry, "size": size})
            return {"dirs": dirs, "files": files, "total": len(entries)}
        except Exception as e:
            return {"error": str(e)}

    def _read_file(self, params: dict) -> dict:
        path = self._safe_path(params.get("path", ""))
        offset = params.get("offset", 0)
        limit = params.get("limit", 2000)
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                lines = f.readlines()
            total = len(lines)
            selected = lines[offset:offset + limit]
            return {
                "content": "".join(selected),
                "total_lines": total,
                "truncated": total > offset + limit,
            }
        except Exception as e:
            return {"error": str(e)}

    def _write_file(self, params: dict) -> dict:
        path = self._safe_path(params.get("path", ""))
        content = params.get("content", "")
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
            return {"success": True, "path": path}
        except Exception as e:
            return {"error": str(e)}

    def _edit_file(self, params: dict) -> dict:
        path = self._safe_path(params.get("path", ""))
        old_string = params.get("old_string", "")
        new_string = params.get("new_string", "")
        try:
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            if old_string not in content:
                return {"error": f"String not found in {path}"}
            new_content = content.replace(old_string, new_string, 1)
            with open(path, "w", encoding="utf-8") as f:
                f.write(new_content)
            return {"success": True}
        except Exception as e:
            return {"error": str(e)}

    def _grep_files(self, params: dict) -> dict:
        path = self._safe_path(params.get("path", self.root))
        pattern = params.get("pattern", "")
        file_glob = params.get("file_glob", "*")
        matches = []
        compiled = re.compile(pattern, re.IGNORECASE)
        for root, dirs, files in os.walk(path):
            # Skip hidden/large dirs
            dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("node_modules", "__pycache__", ".git")]
            for filename in files:
                if not fnmatch.fnmatch(filename, file_glob):
                    continue
                filepath = os.path.join(root, filename)
                try:
                    with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                        for i, line in enumerate(f, 1):
                            if compiled.search(line):
                                matches.append({
                                    "file": filepath,
                                    "line": i,
                                    "content": line.strip()[:200],
                                })
                                if len(matches) >= 50:
                                    return {"matches": matches, "count": len(matches), "truncated": True}
                except (PermissionError, OSError):
                    continue
        return {"matches": matches, "count": len(matches)}

    def _find_files(self, params: dict) -> dict:
        path = self._safe_path(params.get("path", self.root))
        pattern = params.get("pattern", "*")
        matches = []
        for root, dirs, files in os.walk(path):
            dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("node_modules", "__pycache__", ".git")]
            for filename in files:
                if fnmatch.fnmatch(filename, pattern):
                    matches.append(os.path.join(root, filename))
                    if len(matches) >= 100:
                        return {"matches": matches, "count": len(matches), "truncated": True}
        return {"matches": matches, "count": len(matches)}

    def _create_file(self, params: dict) -> dict:
        path = self._safe_path(params.get("path", ""))
        is_dir = params.get("is_dir", False)
        try:
            if is_dir:
                os.makedirs(path, exist_ok=True)
            else:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                with open(path, "w") as f:
                    pass
            return {"success": True, "path": path}
        except Exception as e:
            return {"error": str(e)}

    def _rename_file(self, params: dict) -> dict:
        old_path = self._safe_path(params.get("old_path", ""))
        new_path = self._safe_path(params.get("new_path", ""))
        try:
            os.rename(old_path, new_path)
            return {"success": True}
        except Exception as e:
            return {"error": str(e)}

    def _delete_file(self, params: dict) -> dict:
        path = self._safe_path(params.get("path", ""))
        try:
            if os.path.isdir(path):
                import shutil
                shutil.rmtree(path)
            else:
                os.remove(path)
            return {"success": True}
        except Exception as e:
            return {"error": str(e)}

    def connect(self):
        """Connect to BMO and block forever."""
        print(f"[win-proxy] Connecting to {self.bmo_url} (root: {self.root})")
        while True:
            try:
                self.sio.connect(self.bmo_url, transports=["websocket"])
                self.sio.wait()
            except Exception as e:
                print(f"[win-proxy] Connection error: {e}, retrying in 5s...")
                time.sleep(5)


def main():
    parser = argparse.ArgumentParser(description="BMO Windows Proxy Client")
    parser.add_argument("--bmo-url", default="http://bmo:5000",
                        help="BMO server URL (default: http://bmo:5000)")
    parser.add_argument("--root", default=os.path.expanduser("~"),
                        help="Root directory to expose (default: home dir)")
    args = parser.parse_args()

    proxy = WindowsProxy(args.bmo_url, args.root)
    proxy.connect()


if __name__ == "__main__":
    main()
