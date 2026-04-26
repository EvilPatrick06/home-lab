"""routes/ide.py — Blueprint for the BMO IDE Tab API.

Extracted from `app.py` 2026-04-25 as the first proof-of-concept of the
Flask-blueprint refactor (BMO-SUGGESTIONS-LOG entry: "Refactor `app.py`
into Flask blueprints"). Houses ALL `/api/ide/*` HTTP routes plus the IDE
SocketIO event handlers (terminal_*, ide_*, win_proxy_*).

How it wires up:
- `app.py` does `from routes.ide import register_ide; register_ide(app, socketio, agent)`.
- That call (a) sets module-level `socketio` and `agent` names so the route
  bodies + helpers can reach them, (b) registers the blueprint on `app`,
  and (c) attaches the SocketIO event handlers to the passed `socketio`.
- `app.py:on_disconnect` calls `routes.ide.cleanup_client_session(sid)` to
  let this module clean up its terminal sessions + Windows-proxy state.

The blueprint is mounted under `url_prefix="/api/ide"` so the route paths
inside this file are relative (e.g., `/tree`, `/file/read`, `/git/commit`).
"""

from __future__ import annotations

import json
import os
import re
import shutil as _shutil
import threading
import time
import uuid

from flask import Blueprint, jsonify, render_template, request
from gevent.event import AsyncResult as _AsyncResult

from services.bmo_logging import get_logger

log = get_logger("ide")

# Module-level handles set by register_ide(). These start as None so the
# import-time decoration of routes still works; SocketIO handlers and any
# call site that needs `_resolve_agent().chat(...)` resolves them at request time
# (not at import time).
socketio = None
agent = None

ide_bp = Blueprint("ide", __name__, url_prefix="/api/ide")


def _resolve_agent():
    """Late-bind the BmoAgent instance from app.py.

    The blueprint imports before `init_services()` runs (which is when
    `app.agent` is assigned). Resolving lazily lets us decorate routes at
    import time while still picking up the live agent at request time.
    """
    import app  # local import to avoid circular at module load
    return app.agent

# Path-jail for IDE filesystem endpoints. Realpath of the request path must
# resolve under one of these roots, otherwise the handler returns 403.
# Pi-side: only the monorepo + venv + a couple of system temp dirs IDE may
# legitimately touch. The Windows proxy handles its own path validation
# server-side.
_IDE_ALLOWED_ROOTS = [
    os.path.realpath(os.path.expanduser("~/home-lab")),
    os.path.realpath(os.path.expanduser("~/.bmo_ide_workspace")),  # opt-in scratch dir
    "/tmp",
]


def _ide_safe_path(raw_path: str) -> str:
    """Resolve raw_path through expanduser+realpath; raise PermissionError if
    outside _IDE_ALLOWED_ROOTS. Used by the IDE file/* + git endpoints."""
    if not raw_path:
        raise PermissionError("path is required")
    resolved = os.path.realpath(os.path.expanduser(raw_path))
    for root in _IDE_ALLOWED_ROOTS:
        if resolved == root or resolved.startswith(root + os.sep):
            return resolved
    raise PermissionError(f"path outside IDE sandbox: {resolved}")


# Terminal manager (lazy init)
_terminal_mgr = None

def _get_terminal_mgr():
    global _terminal_mgr
    if _terminal_mgr is None:
        from dev.terminal_service import TerminalManager
        _terminal_mgr = TerminalManager()
    return _terminal_mgr

# File watcher (lazy init)
_file_watcher = None

def _get_file_watcher():
    global _file_watcher
    if _file_watcher is None:
        from dev.file_watcher import FileWatcher
        def _on_file_change(path, mtime):
            socketio.emit("ide_file_changed", {"path": path, "mtime": mtime})
        _file_watcher = FileWatcher(_on_file_change)
    return _file_watcher

# Windows proxy state
_win_proxy_sid = None
_win_proxy_pending: dict[str, _AsyncResult] = {}

# IDE agent jobs
_ide_jobs: dict[str, dict] = {}


def _job_update(job_id: str, **fields) -> None:
    """Apply per-key writes to `_ide_jobs[job_id]` under its per-job RLock.
    Falls back silently if the job no longer exists (already cancelled/cleaned)."""
    job = _ide_jobs.get(job_id)
    if not job:
        return
    lock = job.get("_lock")
    if lock is None:
        # Pre-lock job — should not happen for new jobs but tolerate
        job.update(fields)
        return
    with lock:
        job.update(fields)


def _job_append(job_id: str, list_field: str, item) -> None:
    """Append `item` to `_ide_jobs[job_id][list_field]` under per-job RLock."""
    job = _ide_jobs.get(job_id)
    if not job:
        return
    lock = job.get("_lock")
    if lock is None:
        job.setdefault(list_field, []).append(item)
        return
    with lock:
        job.setdefault(list_field, []).append(item)


def _job_get(job_id: str, key: str, default=None):
    """Read `_ide_jobs[job_id][key]` under per-job RLock — guards against
    a teardown elsewhere replacing the dict mid-read."""
    job = _ide_jobs.get(job_id)
    if not job:
        return default
    lock = job.get("_lock")
    if lock is None:
        return job.get(key, default)
    with lock:
        return job.get(key, default)
_ide_job_counter = 0
_current_running_job_id = None
_IDE_JOBS_FILE = os.path.expanduser("~/home-lab/bmo/pi/data/ide_jobs.json")


_ide_jobs_lock = threading.Lock()

def _save_ide_jobs():
    """Persist IDE jobs to disk, keeping only the last 50."""
    with _ide_jobs_lock:
        try:
            os.makedirs(os.path.dirname(_IDE_JOBS_FILE), exist_ok=True)
            serializable = {}
            items = list(_ide_jobs.items())
            # Keep last 50
            if len(items) > 50:
                items = items[-50:]
            for jid, job in items:
                # Shallow copy of the job keys
                s_job = {k: v for k, v in job.items() if not k.startswith("_")}
                # Make shallow copies of lists to avoid iteration errors during json.dump
                if "messages" in s_job:
                    s_job["messages"] = list(s_job["messages"])
                if "activity_log" in s_job:
                    s_job["activity_log"] = list(s_job["activity_log"])
                if "files_touched" in s_job:
                    s_job["files_touched"] = list(s_job["files_touched"])
                serializable[jid] = s_job
            with open(_IDE_JOBS_FILE, "w", encoding="utf-8") as f:
                json.dump(serializable, f, ensure_ascii=False)
        except Exception as e:
            log.exception(f"[ide] Failed to save jobs")


def _load_ide_jobs():
    """Restore IDE jobs from disk on startup."""
    global _ide_job_counter
    try:
        if os.path.exists(_IDE_JOBS_FILE):
            with open(_IDE_JOBS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            for jid, job in data.items():
                # Don't restore running jobs — they're dead
                if job.get("status") == "running":
                    job["status"] = "failed"
                    job.setdefault("error", "Server restarted")
                _ide_jobs[jid] = job
                # Update counter to avoid ID collisions
                try:
                    num = int(jid.split("-")[-1])
                    if num > _ide_job_counter:
                        _ide_job_counter = num
                except (ValueError, IndexError):
                    pass
    except Exception:
        pass


_load_ide_jobs()

# Language detection for Monaco
_LANG_MAP = {
    ".py": "python", ".js": "javascript", ".ts": "typescript", ".tsx": "typescript",
    ".jsx": "javascript", ".html": "html", ".htm": "html", ".css": "css",
    ".scss": "scss", ".less": "less", ".json": "json", ".yaml": "yaml",
    ".yml": "yaml", ".xml": "xml", ".md": "markdown", ".sh": "shell",
    ".bash": "shell", ".zsh": "shell", ".sql": "sql", ".rs": "rust",
    ".go": "go", ".java": "java", ".c": "c", ".cpp": "cpp", ".h": "c",
    ".hpp": "cpp", ".rb": "ruby", ".php": "php", ".lua": "lua",
    ".toml": "toml", ".ini": "ini", ".cfg": "ini", ".conf": "ini",
    ".dockerfile": "dockerfile", ".r": "r", ".swift": "swift",
    ".kt": "kotlin", ".dart": "dart", ".vue": "html",
}

def _detect_language(path: str) -> str:
    """Map file extension to Monaco language ID."""
    basename = os.path.basename(path).lower()
    if basename == "dockerfile":
        return "dockerfile"
    if basename in ("makefile", "gnumakefile"):
        return "makefile"
    _, ext = os.path.splitext(basename)
    return _LANG_MAP.get(ext, "plaintext")


def _proxy_to_windows(op: str, params: dict, timeout: float = 10.0) -> dict:
    """Send a request to the Windows proxy and wait for the response."""
    if not _win_proxy_sid:
        return {"error": "Windows proxy not connected"}
    import uuid
    request_id = str(uuid.uuid4())
    result_event = _AsyncResult()
    _win_proxy_pending[request_id] = result_event
    try:
        socketio.emit("win_proxy_request", {
            "request_id": request_id,
            "op": op,
            "params": params,
        }, room=_win_proxy_sid)
        result = result_event.get(timeout=timeout)
        return result
    except Exception:
        return {"error": "Windows proxy request timed out"}
    finally:
        _win_proxy_pending.pop(request_id, None)


# ── IDE File API routes ──────────────────────────────────────────────

@ide_bp.route("/tree")
def api_ide_tree():
    """List directory contents for the file tree."""
    path = request.args.get("path", "~")
    machine = request.args.get("machine", "pi")
    if machine == "win":
        return jsonify(_proxy_to_windows("list_directory", {"path": path}))
    try:
        path = _ide_safe_path(path)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    from dev.dev_tools import list_directory
    return jsonify(list_directory(path))


@ide_bp.route("/file/read", methods=["POST"])
def api_ide_file_read():
    """Read a file's contents."""
    data = request.json or {}
    path = data.get("path", "")
    machine = data.get("machine", "pi")
    if machine == "win":
        result = _proxy_to_windows("read_file", {"path": path, "limit": 50000})
    else:
        try:
            path = _ide_safe_path(path)
        except PermissionError as e:
            return jsonify({"error": str(e)}), 403
        from dev.dev_tools import read_file
        result = read_file(path, limit=50000)
    if "error" not in result:
        result["language"] = _detect_language(path)
    return jsonify(result)


@ide_bp.route("/file/write", methods=["POST"])
def api_ide_file_write():
    """Write/overwrite a file (IDE save bypasses confirmation)."""
    data = request.json or {}
    path = data.get("path", "")
    content = data.get("content", "")
    machine = data.get("machine", "pi")
    if machine == "win":
        return jsonify(_proxy_to_windows("write_file", {"path": path, "content": content}))
    try:
        path = _ide_safe_path(path)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        watcher = _get_file_watcher()
        watcher.notify_change(path)
        return jsonify({"success": True, "path": path})
    except Exception:
        log.info("[ide.file.write] error")
        return jsonify({"error": "write failed"}), 500


@ide_bp.route("/file/edit", methods=["POST"])
def api_ide_file_edit():
    """Find & replace in a file."""
    data = request.json or {}
    path = data.get("path", "")
    machine = data.get("machine", "pi")
    if machine == "win":
        return jsonify(_proxy_to_windows("edit_file", {
            "path": path,
            "old_string": data.get("old_string", ""),
            "new_string": data.get("new_string", ""),
        }))
    try:
        path = _ide_safe_path(path)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    from dev.dev_tools import edit_file
    result = edit_file(path, data.get("old_string", ""), data.get("new_string", ""))
    if result.get("success"):
        watcher = _get_file_watcher()
        watcher.notify_change(path)
    return jsonify(result)


@ide_bp.route("/file/create", methods=["POST"])
def api_ide_file_create():
    """Create a new file or directory."""
    data = request.json or {}
    path = data.get("path", "")
    is_dir = data.get("is_dir", False)
    machine = data.get("machine", "pi")
    if machine == "win":
        return jsonify(_proxy_to_windows("create_file", {"path": path, "is_dir": is_dir}))
    try:
        path = _ide_safe_path(path)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    try:
        if is_dir:
            os.makedirs(path, exist_ok=True)
        else:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                pass
        return jsonify({"success": True, "path": path})
    except Exception:
        log.info("[ide.file.create] error")
        return jsonify({"error": "create failed"}), 500


@ide_bp.route("/file/rename", methods=["POST"])
def api_ide_file_rename():
    """Rename a file or directory."""
    data = request.json or {}
    machine = data.get("machine", "pi")
    if machine == "win":
        return jsonify(_proxy_to_windows("rename_file", {
            "old_path": data.get("old_path", ""),
            "new_path": data.get("new_path", ""),
        }))
    try:
        old = _ide_safe_path(data.get("old_path", ""))
        new = _ide_safe_path(data.get("new_path", ""))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    try:
        os.rename(old, new)
        return jsonify({"success": True})
    except Exception:
        log.info("[ide.file.rename] error")
        return jsonify({"error": "rename failed"}), 500


@ide_bp.route("/file/delete", methods=["POST"])
def api_ide_file_delete():
    """Delete a file or directory."""
    data = request.json or {}
    path = data.get("path", "")
    machine = data.get("machine", "pi")
    if machine == "win":
        return jsonify(_proxy_to_windows("delete_file", {"path": path}))
    try:
        path = _ide_safe_path(path)
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    try:
        if os.path.isdir(path):
            _shutil.rmtree(path)
        else:
            os.remove(path)
        return jsonify({"success": True})
    except Exception:
        log.info("[ide.file.delete] error")
        return jsonify({"error": "delete failed"}), 500


@ide_bp.route("/search")
def api_ide_search():
    """Global grep search."""
    pattern = request.args.get("pattern", "")
    path = request.args.get("path", "~")
    file_glob = request.args.get("file_glob", "*")
    machine = request.args.get("machine", "pi")
    if machine == "win":
        return jsonify(_proxy_to_windows("grep_files", {
            "pattern": pattern, "path": path, "file_glob": file_glob,
        }))
    from dev.dev_tools import grep_files
    return jsonify(grep_files(pattern, path, file_glob))


@ide_bp.route("/js-error", methods=["POST"])
def api_ide_js_error():
    """Log client-side JS errors for debugging."""
    data = request.json or {}
    log.info(f"[js-error] {data.get('msg', '?')} at {data.get('file', '?')}:{data.get('line', '?')}:{data.get('col', '?')}")
    if data.get("stack"):
        for line in data["stack"].split("\n")[:5]:
            log.info(f"[js-error]   {line}")
    return jsonify({"ok": True})


@ide_bp.route("/find")
def api_ide_find():
    """Find files by name pattern (for Ctrl+P quick open)."""
    pattern = request.args.get("pattern", "*")
    path = request.args.get("path", "~")
    machine = request.args.get("machine", "pi")
    if machine == "win":
        return jsonify(_proxy_to_windows("find_files", {"path": path, "pattern": f"*{pattern}*"}))
    from dev.dev_tools import find_files
    return jsonify(find_files(f"**/*{pattern}*", path))


# ── IDE Git API ──────────────────────────────────────────────────────

def _safe_repo(raw: str) -> str:
    """Path-jail a repo argument to the IDE allowlist."""
    return _ide_safe_path(raw or "~")


@ide_bp.route("/git/status")
def api_ide_git_status():
    """Get git branch and changed files."""
    try:
        repo = _safe_repo(request.args.get("path", "~"))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    from dev.dev_tools import git_command_args
    branch_result = git_command_args(["rev-parse", "--abbrev-ref", "HEAD"], repo)
    status_result = git_command_args(["status", "--porcelain"], repo)
    branch = ""
    if branch_result.get("exit_code", 1) == 0:
        branch = branch_result.get("output", "").strip()
    changes = []
    status_output = ""
    if status_result.get("exit_code", 1) == 0:
        status_output = status_result.get("output", "") or ""
    for line in status_output.splitlines():
        if len(line) >= 4:
            status_code = line[:2].strip()
            filepath = line[3:].strip()
            changes.append({"status": status_code, "path": filepath})
    return jsonify({"branch": branch, "changes": changes})


@ide_bp.route("/git/stage", methods=["POST"])
def api_ide_git_stage():
    """Stage a file."""
    data = request.json or {}
    try:
        repo = _safe_repo(data.get("repo", "~"))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    path = data.get("path", "")
    if not path or path.startswith("-"):
        return jsonify({"error": "invalid path"}), 400
    from dev.dev_tools import git_command_args
    return jsonify(git_command_args(["add", "--", path], repo))


@ide_bp.route("/git/unstage", methods=["POST"])
def api_ide_git_unstage():
    """Unstage a file."""
    data = request.json or {}
    try:
        repo = _safe_repo(data.get("repo", "~"))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    path = data.get("path", "")
    if not path or path.startswith("-"):
        return jsonify({"error": "invalid path"}), 400
    from dev.dev_tools import git_command_args
    return jsonify(git_command_args(["restore", "--staged", "--", path], repo))


@ide_bp.route("/git/commit", methods=["POST"])
def api_ide_git_commit():
    """Commit staged changes."""
    data = request.json or {}
    msg = data.get("message", "")
    if not msg:
        return jsonify({"error": "commit message required"}), 400
    try:
        repo = _safe_repo(data.get("repo", "~"))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    from dev.dev_tools import git_command_args
    return jsonify(git_command_args(["commit", "-m", msg], repo))


@ide_bp.route("/git/log")
def api_ide_git_log():
    """Get recent commits."""
    try:
        repo = _safe_repo(request.args.get("path", "~"))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    count_raw = request.args.get("count", "20")
    try:
        count = max(1, min(int(count_raw), 1000))
    except (TypeError, ValueError):
        count = 20
    from dev.dev_tools import git_command_args
    result = git_command_args(["log", "--oneline", "-n", str(count)], repo)
    commits = []
    for line in (result.get("output", "") or "").splitlines():
        parts = line.split(" ", 1)
        if len(parts) == 2:
            commits.append({"hash": parts[0], "message": parts[1]})
    return jsonify({"commits": commits})


@ide_bp.route("/git/diff")
def api_ide_git_diff():
    """Get diff for a file."""
    try:
        repo = _safe_repo(request.args.get("repo", "~"))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    path = request.args.get("path", "")
    args = ["diff"]
    if path and not path.startswith("-"):
        args.extend(["--", path])
    from dev.dev_tools import git_command_args
    return jsonify(git_command_args(args, repo))


@ide_bp.route("/git/checkout", methods=["POST"])
def api_ide_git_checkout():
    """Switch branch."""
    data = request.json or {}
    branch = data.get("branch", "")
    if not branch or branch.startswith("-"):
        return jsonify({"error": "invalid branch"}), 400
    try:
        repo = _safe_repo(data.get("repo", "~"))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    from dev.dev_tools import git_command_args
    return jsonify(git_command_args(["checkout", branch], repo))


@ide_bp.route("/git/branches")
def api_ide_git_branches():
    """List branches."""
    try:
        repo = _safe_repo(request.args.get("path", "~"))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    from dev.dev_tools import git_command_args
    result = git_command_args(["branch", "-a"], repo)
    branches = []
    current = ""
    for line in (result.get("output", "") or "").splitlines():
        line = line.strip()
        if line.startswith("* "):
            current = line[2:]
            branches.append(current)
        elif line:
            branches.append(line)
    return jsonify({"branches": branches, "current": current})


@ide_bp.route("/git/push", methods=["POST"])
def api_ide_git_push():
    """Push to remote."""
    data = request.json or {}
    try:
        repo = _safe_repo(data.get("repo", "~"))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    from dev.dev_tools import git_command_args
    return jsonify(git_command_args(["push"], repo))


@ide_bp.route("/git/pull", methods=["POST"])
def api_ide_git_pull():
    """Pull from remote."""
    data = request.json or {}
    try:
        repo = _safe_repo(data.get("repo", "~"))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    from dev.dev_tools import git_command_args
    return jsonify(git_command_args(["pull"], repo))


@ide_bp.route("/git/fetch", methods=["POST"])
def api_ide_git_fetch():
    """Fetch from remote."""
    data = request.json or {}
    try:
        repo = _safe_repo(data.get("repo", "~"))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    from dev.dev_tools import git_command_args
    return jsonify(git_command_args(["fetch", "--all"], repo))


@ide_bp.route("/git/stash", methods=["POST"])
def api_ide_git_stash():
    """Stash operations: save, pop, list, drop."""
    data = request.json or {}
    action = data.get("action", "save")
    try:
        repo = _safe_repo(data.get("repo", "~"))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    from dev.dev_tools import git_command_args
    if action == "save":
        msg = data.get("message", "")
        args = ["stash", "push"] + (["-m", msg] if msg else [])
    elif action == "pop":
        args = ["stash", "pop"]
    elif action == "list":
        args = ["stash", "list"]
    elif action == "drop":
        try:
            idx = int(data.get("index", 0))
        except (TypeError, ValueError):
            return jsonify({"error": "invalid stash index"}), 400
        args = ["stash", "drop", f"stash@{{{idx}}}"]
    else:
        return jsonify({"error": "Invalid action"}), 400
    return jsonify(git_command_args(args, repo))


@ide_bp.route("/git/branch/create", methods=["POST"])
def api_ide_git_branch_create():
    """Create and switch to a new branch."""
    data = request.json or {}
    name = data.get("name", "")
    if not name or name.startswith("-"):
        return jsonify({"error": "invalid branch name"}), 400
    try:
        repo = _safe_repo(data.get("repo", "~"))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    from dev.dev_tools import git_command_args
    return jsonify(git_command_args(["checkout", "-b", name], repo))


@ide_bp.route("/git/branch/delete", methods=["POST"])
def api_ide_git_branch_delete():
    """Delete a branch."""
    data = request.json or {}
    name = data.get("name", "")
    if not name or name.startswith("-"):
        return jsonify({"error": "invalid branch name"}), 400
    try:
        repo = _safe_repo(data.get("repo", "~"))
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    from dev.dev_tools import git_command_args
    return jsonify(git_command_args(["branch", "-d", name], repo))


# ── IDE Agent Jobs API ───────────────────────────────────────────────

@ide_bp.route("/jobs", methods=["GET"])
def api_ide_jobs_list():
    """List all IDE agent jobs."""
    jobs = []
    # Snapshot under the lock — prevents RuntimeError("dictionary changed size
    # during iteration") if a job-runner greenlet appends to _ide_jobs mid-iter.
    with _ide_jobs_lock:
        snapshot = list(_ide_jobs.items())
    for jid, job in snapshot:
        # Shallow messages: just role + text, no heavy content
        messages = [{"role": m.get("role", ""), "text": m.get("text", "")} for m in job.get("messages", [])]
        jobs.append({
            "id": jid,
            "task": job.get("task", ""),
            "status": job.get("status", "pending"),
            "mode": job.get("mode", "normal"),
            "files_touched": job.get("files_touched", []),
            "created": job.get("created", 0),
            "agent_name": job.get("agent_name", "code"),
            "custom_name": job.get("custom_name"),
            "archived": job.get("archived", False),
            "auto_approve": job.get("auto_approve", False),
            "messages": messages,
        })
    return jsonify({"jobs": jobs})


@ide_bp.route("/jobs", methods=["POST"])
def api_ide_jobs_create():
    """Spawn a new IDE agent job."""
    global _ide_job_counter
    data = request.json or {}
    task = data.get("task", "")
    auto_approve = data.get("auto_approve", False)
    if not task:
        return jsonify({"error": "No task provided"}), 400

    with _ide_jobs_lock:
        _ide_job_counter += 1
        job_id = f"ide-job-{_ide_job_counter}"
        agent_name = data.get("agent") or "code"
        job_mode = data.get("mode", "normal")
        # `_lock` is a per-job RLock — agent task body wraps every mutation
        # of `_ide_jobs[job_id]` with `with _ide_jobs[job_id]["_lock"]:` so
        # concurrent reads/writes on the same job don't tear, while writes
        # on different jobs run in parallel under gevent's cooperative
        # scheduling.
        _ide_jobs[job_id] = {
            "task": task,
            "status": "running",
            "mode": job_mode,
            "auto_approve": auto_approve,
            "files_touched": [],
            "created": time.time(),
            "agent_name": agent_name,
            "custom_name": None,
            "messages": [{"role": "user", "text": task, "ts": time.time()}],
            "activity_log": [],
            "archived": False,
            "_cancel": threading.Event(),
            "_lock": threading.RLock(),
        }

    socketio.emit("ide_job_started", {"id": job_id, "task": task, "agent": agent_name})

    def _run_job():
        global _current_running_job_id
        _current_running_job_id = job_id

        def _emit_activity(activity_type, content, **extra):
            """Emit a structured activity event for the IDE job chat."""
            entry = {"type": activity_type, "content": content, "ts": time.time(), **extra}
            _job_append(job_id, "activity_log", entry)
            payload = {"id": job_id, **entry}
            socketio.emit("ide_job_activity", payload)

        # Capture stdout/stderr to stream all agent output live
        # Thread-local: only capture output from the job thread
        _job_thread_id = threading.current_thread().ident

        class _IdeJobWriter:
            """Intercepts print() from job thread and streams to IDE chat."""
            def __init__(self, original, stream_name="stdout"):
                self._original = original
                self._stream_name = stream_name

            def write(self, text):
                self._original.write(text)
                # Only capture output from the job thread, not voice/timer/etc.
                if text.strip() and threading.current_thread().ident == _job_thread_id:
                    _emit_activity("log", text.rstrip("\n"))
                return len(text)

            def flush(self):
                self._original.flush()

            def __getattr__(self, name):
                return getattr(self._original, name)

        import sys as _sys
        _old_stdout = _sys.stdout
        _old_stderr = _sys.stderr
        _sys.stdout = _IdeJobWriter(_old_stdout, "stdout")
        _sys.stderr = _IdeJobWriter(_old_stderr, "stderr")

        try:
            resolved_agent = data.get("agent") or "code"
            model_tier = data.get("model")
            job_mode = _job_get(job_id, "mode", "normal")
            _job_update(job_id, agent_name=resolved_agent)
            socketio.emit("ide_job_agent", {"id": job_id, "agent": resolved_agent})
            _emit_activity("status", f"Using {resolved_agent} agent (mode: {job_mode})")

            # ── Mode-dependent agent execution ──────────────────────────
            # Autopilot: auto-continue up to MAX turns, no confirmation
            # Normal:    single turn, pause for user follow-up
            # Plan:      first turn = plan only, pause for approval, then execute

            DONE_PHRASES = [
                "all tasks complete", "all todos complete", "i've completed all",
                "all done", "everything is done", "finished all", "completed all 8",
                "that covers all", "all changes have been", "all tasks are done",
                "i have completed", "tasks are complete",
            ]

            if job_mode == "autopilot":
                # ── AUTOPILOT: loop until agent is done or cancelled ──
                from dev.claude_tools import set_auto_approve
                set_auto_approve(True)  # Auto-approve destructive commands
                all_responses = []
                current_message = task
                turn = 0

                while True:
                    turn += 1
                    cancel_ev = _job_get(job_id, "_cancel")
                    if cancel_ev and cancel_ev.is_set():
                        break

                    _emit_activity("thinking", f"🚀 Autopilot turn {turn}...")

                    result = _resolve_agent().chat(
                        current_message,
                        speaker="ide",
                        agent_override=resolved_agent,
                    )
                    response_text = result.get("text", "") if isinstance(result, dict) else str(result)
                    all_responses.append(response_text)

                    _job_append(job_id, "messages", {
                        "role": "assistant", "text": response_text, "ts": time.time(),
                    })
                    _emit_activity("status", f"Turn {turn} done ({len(response_text)} chars)")

                    socketio.emit("ide_job_progress", {
                        "id": job_id, "text": response_text[-200:], "chunk": response_text,
                    })

                    response_lower = response_text.lower()
                    if any(p in response_lower for p in DONE_PHRASES):
                        _emit_activity("status", "Agent signaled completion")
                        break
                    if len(response_text.strip()) < 50 and turn > 1:
                        _emit_activity("status", "Short response — done")
                        break

                    current_message = (
                        "Continue working on the remaining tasks. "
                        "Do NOT summarize — just keep implementing. "
                        "When ALL tasks are fully complete, say 'All tasks complete'."
                    )
                    _job_append(job_id, "messages", {
                        "role": "user", "text": current_message, "ts": time.time(),
                    })

                full_text = "\n\n---\n\n".join(all_responses)

            elif job_mode == "plan":
                # ── PLAN: first get a plan, then wait for approval ──
                plan_prompt = (
                    f"Create a DETAILED implementation plan for the following task. "
                    f"Do NOT implement anything yet — just plan. List every file you'll "
                    f"change, what you'll change, and in what order. "
                    f"When the plan is ready, say 'Plan ready for approval'.\n\n{task}"
                )
                _emit_activity("thinking", "📋 Plan mode — creating plan...")

                result = _resolve_agent().chat(
                    plan_prompt,
                    speaker="ide",
                    agent_override=resolved_agent,
                )
                full_text = result.get("text", "") if isinstance(result, dict) else str(result)

                _job_append(job_id, "messages", {
                    "role": "assistant", "text": full_text, "ts": time.time(),
                })
                socketio.emit("ide_job_progress", {
                    "id": job_id, "text": full_text[-200:], "chunk": full_text,
                })
                _emit_activity("status", "📋 Plan ready — waiting for your approval via follow-up. Say 'approve' or 'go' to start execution.")

                # Mark as waiting — user sends follow-up to continue
                _job_update(job_id, status="waiting", _waiting_for="plan_approval")
                socketio.emit("ide_job_done", {
                    "id": job_id, "status": "waiting",
                    "result": full_text, "waiting_for": "plan_approval",
                })
                _save_ide_jobs()
                return  # Exit — follow-up handler will resume

            else:
                # ── NORMAL: single turn, confirm before changes ──
                _emit_activity("thinking", "🛡️ Normal mode — executing with confirmation...")

                normal_prompt = (
                    f"Work on the following task. Before making any destructive changes "
                    f"(deleting files, overwriting code), describe what you're about to do "
                    f"and ask for confirmation.\n\n{task}"
                )
                result = _resolve_agent().chat(
                    normal_prompt,
                    speaker="ide",
                    agent_override=resolved_agent,
                )
                full_text = result.get("text", "") if isinstance(result, dict) else str(result)

                _job_append(job_id, "messages", {
                    "role": "assistant", "text": full_text, "ts": time.time(),
                })
                socketio.emit("ide_job_progress", {
                    "id": job_id, "text": full_text[-200:], "chunk": full_text,
                })

            cancel_ev = _job_get(job_id, "_cancel")
            if cancel_ev and cancel_ev.is_set():
                _job_update(job_id, status="cancelled")
                _emit_activity("status", "Job cancelled")
                socketio.emit("ide_job_done", {"id": job_id, "status": "cancelled"})
                _save_ide_jobs()
            else:
                _job_update(job_id, status="done", result=full_text)
                _emit_activity("done", f"Completed in {len(all_responses)} turns")
                socketio.emit("ide_job_done", {
                    "id": job_id,
                    "status": "done",
                    "result": full_text,
                })
                _save_ide_jobs()
        except Exception as e:
            _job_update(job_id, status="failed", error=str(e))
            _job_append(job_id, "messages", {"role": "assistant", "text": f"Error: {e}", "ts": time.time()})
            _emit_activity("error", str(e))
            socketio.emit("ide_job_done", {
                "id": job_id,
                "status": "failed",
                "error": str(e),
            })
            _save_ide_jobs()
        finally:
            _sys.stdout = _old_stdout
            _sys.stderr = _old_stderr
            _current_running_job_id = None
            try:
                from dev.claude_tools import set_auto_approve
                set_auto_approve(False)
            except Exception:
                pass

    threading.Thread(target=_run_job, daemon=True).start()
    return jsonify({"id": job_id, "status": "running"})


@ide_bp.route("/jobs/<job_id>/cancel", methods=["POST"])
def api_ide_jobs_cancel(job_id):
    """Cancel a running job."""
    job = _ide_jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    cancel_ev = job.get("_cancel")
    if cancel_ev:
        cancel_ev.set()
    job["status"] = "cancelled"
    socketio.emit("ide_job_done", {"id": job_id, "status": "cancelled"})
    _save_ide_jobs()
    return jsonify({"ok": True})


@ide_bp.route("/jobs/<job_id>/followup", methods=["POST"])
def api_ide_jobs_followup(job_id):
    """Send a follow-up message to a specific job."""
    job = _ide_jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    data = request.json or {}
    msg = data.get("message", "")
    if not msg:
        return jsonify({"error": "No message"}), 400
    job["messages"].append({"role": "user", "text": msg, "ts": time.time()})
    job["status"] = "running"
    job["_cancel"] = threading.Event()  # fresh cancel event

    def _run_followup():
        global _current_running_job_id
        _current_running_job_id = job_id
        resolved_agent = job.get("agent_name", "code")
        job_mode = job.get("mode", "normal")

        def _emit_activity(activity_type, content, **extra):
            entry = {"type": activity_type, "content": content, "ts": time.time(), **extra}
            job.setdefault("activity_log", []).append(entry)
            socketio.emit("ide_job_activity", {"id": job_id, **entry})

        # Thread-local stdout capture
        _job_thread_id = threading.current_thread().ident
        class _FUWriter:
            def __init__(self, orig):
                self._original = orig
            def write(self, text):
                self._original.write(text)
                if text.strip() and threading.current_thread().ident == _job_thread_id:
                    _emit_activity("log", text.rstrip("\n"))
                return len(text)
            def flush(self):
                self._original.flush()
            def __getattr__(self, name):
                return getattr(self._original, name)

        import sys as _sys
        _old_stdout, _old_stderr = _sys.stdout, _sys.stderr
        _sys.stdout = _FUWriter(_old_stdout)
        _sys.stderr = _FUWriter(_old_stderr)

        try:
            # Plan approval → switch to autopilot execution
            waiting_for = job.get("_waiting_for", "")
            msg_lower = msg.lower().strip()
            is_plan_approval = waiting_for == "plan_approval" and msg_lower in (
                "approve", "approved", "go", "do it", "yes", "execute", "start", "lgtm",
            )

            if is_plan_approval:
                _emit_activity("status", "📋 Plan approved! Switching to autopilot execution...")
                job["mode"] = "autopilot"
                job.pop("_waiting_for", None)

                from dev.claude_tools import set_auto_approve
                set_auto_approve(True)

                # Execute the original task in autopilot mode
                original_task = job.get("task", "")
                current_message = (
                    f"The plan has been approved. Now IMPLEMENT everything from the plan. "
                    f"Original task: {original_task}\n\n"
                    f"Do NOT re-plan. Start implementing immediately. "
                    f"When ALL tasks are fully complete, say 'All tasks complete'."
                )

                DONE_PHRASES = [
                    "all tasks complete", "all todos complete", "i've completed all",
                    "all done", "everything is done", "finished all",
                    "all changes have been", "all tasks are done",
                    "i have completed", "tasks are complete",
                ]

                turn = 0
                all_responses = []
                while True:
                    turn += 1
                    if job["_cancel"].is_set():
                        break
                    _emit_activity("thinking", f"🚀 Autopilot turn {turn}...")
                    result = _resolve_agent().chat(current_message, speaker="ide", agent_override=resolved_agent)
                    response_text = result.get("text", "") if isinstance(result, dict) else str(result)
                    all_responses.append(response_text)
                    job["messages"].append({"role": "assistant", "text": response_text, "ts": time.time()})
                    _emit_activity("status", f"Turn {turn} done ({len(response_text)} chars)")
                    socketio.emit("ide_job_progress", {"id": job_id, "text": response_text[-200:], "chunk": response_text})

                    if any(p in response_text.lower() for p in DONE_PHRASES):
                        _emit_activity("status", "Agent signaled completion")
                        break
                    if len(response_text.strip()) < 50 and turn > 1:
                        break

                    current_message = (
                        "Continue working on the remaining tasks. "
                        "Do NOT summarize — just keep implementing. "
                        "When ALL tasks are fully complete, say 'All tasks complete'."
                    )
                    job["messages"].append({"role": "user", "text": current_message, "ts": time.time()})

                full_text = "\n\n---\n\n".join(all_responses)
            else:
                # Regular follow-up — single agent call with context
                _emit_activity("thinking", "Processing follow-up...")
                result = _resolve_agent().chat(msg, speaker="ide", agent_override=resolved_agent)
                full_text = result.get("text", "") if isinstance(result, dict) else str(result)
                job["messages"].append({"role": "assistant", "text": full_text, "ts": time.time()})
                socketio.emit("ide_job_progress", {"id": job_id, "text": full_text[-200:], "chunk": full_text})

            if job["_cancel"].is_set():
                job["status"] = "cancelled"
                socketio.emit("ide_job_done", {"id": job_id, "status": "cancelled"})
            else:
                job["status"] = "done"
                job["result"] = full_text
                _emit_activity("done", "Follow-up complete")
                socketio.emit("ide_job_done", {"id": job_id, "status": "done", "result": full_text})
            _save_ide_jobs()
        except Exception as e:
            job["status"] = "failed"
            job["error"] = str(e)
            job["messages"].append({"role": "assistant", "text": f"Error: {e}", "ts": time.time()})
            _emit_activity("error", str(e))
            socketio.emit("ide_job_done", {"id": job_id, "status": "failed", "error": str(e)})
            _save_ide_jobs()
        finally:
            _sys.stdout = _old_stdout
            _sys.stderr = _old_stderr
            _current_running_job_id = None

    socketio.emit("ide_job_started", {"id": job_id, "task": msg, "agent": job.get("agent_name", "code"), "followup": True})
    threading.Thread(target=_run_followup, daemon=True).start()
    return jsonify({"ok": True})


@ide_bp.route("/jobs/<job_id>/messages", methods=["GET"])
def api_ide_jobs_messages(job_id):
    """Return conversation history for a job."""
    job = _ide_jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    messages = [{"role": m.get("role", ""), "text": m.get("text", ""), "ts": m.get("ts", 0)} for m in job.get("messages", [])]
    activity_log = job.get("activity_log", [])
    return jsonify({"messages": messages, "activity_log": activity_log, "status": job.get("status", "pending")})


@ide_bp.route("/jobs/<job_id>/rename", methods=["POST"])
def api_ide_jobs_rename(job_id):
    """Set a custom name for a job."""
    job = _ide_jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    data = request.json or {}
    job["custom_name"] = data.get("name")
    _save_ide_jobs()
    return jsonify({"ok": True})


@ide_bp.route("/jobs/<job_id>/mode", methods=["POST"])
def api_ide_jobs_mode(job_id):
    """Update the mode for a job (autopilot/normal/plan)."""
    job = _ide_jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    data = request.json or {}
    new_mode = data.get("mode", "normal")
    if new_mode not in ("autopilot", "normal", "plan"):
        return jsonify({"error": "Invalid mode"}), 400
    job["mode"] = new_mode
    _save_ide_jobs()
    return jsonify({"ok": True, "mode": new_mode})


@ide_bp.route("/jobs/<job_id>/archive", methods=["POST"])
def api_ide_jobs_archive(job_id):
    """Archive a job."""
    job = _ide_jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    job["archived"] = True
    socketio.emit("ide_job_archived", {"id": job_id})
    _save_ide_jobs()
    return jsonify({"ok": True})


@ide_bp.route("/jobs/<job_id>/auto-approve", methods=["POST"])
def api_ide_jobs_auto_approve(job_id):
    """Toggle auto-approve for a job."""
    job = _ide_jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    job["auto_approve"] = not job.get("auto_approve", False)
    return jsonify({"ok": True, "auto_approve": job["auto_approve"]})


@ide_bp.route("/jobs/<job_id>/delete", methods=["DELETE"])
def api_ide_jobs_delete(job_id):
    """Permanently delete a job."""
    with _ide_jobs_lock:
        existed = _ide_jobs.pop(job_id, None) is not None
    if existed:
        socketio.emit("ide_job_deleted", {"id": job_id})
        _save_ide_jobs()
        return jsonify({"ok": True})
    return jsonify({"error": "Job not found"}), 404


@ide_bp.route("/jobs/<job_id>/unarchive", methods=["POST"])
def api_ide_jobs_unarchive(job_id):
    """Restore an archived job."""
    job = _ide_jobs.get(job_id)
    if not job:
        return jsonify({"error": "Job not found"}), 404
    job["archived"] = False
    job["status"] = "done"
    socketio.emit("ide_job_unarchived", {"id": job_id})
    _save_ide_jobs()
    return jsonify({"ok": True})


# ── IDE State Persistence ────────────────────────────────────────────

_IDE_STATE_FILE = os.path.expanduser("~/home-lab/bmo/pi/data/ide_state.json")


@ide_bp.route("/state", methods=["GET"])
def api_ide_state_get():
    """Load IDE state (tabs, cursor positions, settings, etc.)."""
    if os.path.exists(_IDE_STATE_FILE):
        try:
            with open(_IDE_STATE_FILE, "r", encoding="utf-8") as f:
                return jsonify(json.load(f))
        except Exception:
            pass
    return jsonify({
        "workspaces": ["~/home-lab"],
        "openTabs": [],
        "activeTab": None,
        "cursorPositions": {},
        "scrollPositions": {},
        "settings": {
            "fontSize": 14,
            "tabSize": 4,
            "theme": "dark",
            "autoSave": True,
            "wordWrap": False,
        },
        "activePanel": "explorer",
        "agentMode": "autopilot",
        "terminalHistory": [],
    })


@ide_bp.route("/state", methods=["POST"])
def api_ide_state_save():
    """Save IDE state to disk."""
    data = request.json or {}
    try:
        os.makedirs(os.path.dirname(_IDE_STATE_FILE), exist_ok=True)
        with open(_IDE_STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)})

# ── IDE Terminal SocketIO events ─────────────────────────────────────


def register_ide(flask_app, socketio_obj, agent_obj):
    """Wire this blueprint + its SocketIO handlers into the Flask app.

    Called once from `app.py` after `app` and `socketio` are constructed.
    Stamps module-level `socketio` and `agent` references so the route
    handlers above (which reference them by bare name) resolve correctly.
    """
    global socketio, agent
    socketio = socketio_obj
    agent = agent_obj
    flask_app.register_blueprint(ide_bp)

    # SocketIO event handlers. Defined inside register_ide() so the
    # decorators close over the live `socketio` object.
    @socketio.on("terminal_open")
    def on_terminal_open(data):
        """Open a new PTY terminal session."""
        term_id = data.get("term_id", "term-1")
        cols = data.get("cols", 80)
        rows = data.get("rows", 24)
        sid = request.sid
        mgr = _get_terminal_mgr()

        def _output_cb(tid, raw_data):
            socketio.emit("terminal_output", {
                "term_id": tid,
                "data": raw_data.decode("utf-8", errors="replace"),
            }, room=sid)

        mgr.open_terminal(sid, term_id, cols, rows, _output_cb)



    @socketio.on("terminal_input")
    def on_terminal_input(data):
        """Send keystrokes to a terminal."""
        term_id = data.get("term_id", "term-1")
        input_data = data.get("data", "")
        mgr = _get_terminal_mgr()
        session = mgr.get_session(request.sid, term_id)
        if session:
            session.write(input_data.encode("utf-8"))



    @socketio.on("terminal_resize")
    def on_terminal_resize(data):
        """Resize a terminal."""
        term_id = data.get("term_id", "term-1")
        mgr = _get_terminal_mgr()
        session = mgr.get_session(request.sid, term_id)
        if session:
            session.resize(data.get("cols", 80), data.get("rows", 24))



    @socketio.on("terminal_close")
    def on_terminal_close(data):
        """Close a specific terminal session."""
        term_id = data.get("term_id", "term-1")
        mgr = _get_terminal_mgr()
        mgr.close_terminal(request.sid, term_id)


    # ── IDE File Watch SocketIO events ───────────────────────────────────


    @socketio.on("ide_watch_file")
    def on_ide_watch_file(data):
        """Start watching a file for changes."""
        path = data.get("path", "")
        if path:
            watcher = _get_file_watcher()
            watcher.watch(path)



    @socketio.on("ide_unwatch_file")
    def on_ide_unwatch_file(data):
        """Stop watching a file."""
        path = data.get("path", "")
        if path:
            watcher = _get_file_watcher()
            watcher.unwatch(path)


    # ── IDE Agent Diff SocketIO events ───────────────────────────────────


    @socketio.on("ide_agent_diff_response")
    def on_ide_agent_diff_response(data):
        """Handle accept/reject of agent edit."""
        accepted = data.get("accepted", False)
        path = data.get("path", "")
        new_content = data.get("new_content", "")
        if accepted and path and new_content:
            path = os.path.expanduser(path)
            try:
                with open(path, "w", encoding="utf-8") as f:
                    f.write(new_content)
                watcher = _get_file_watcher()
                watcher.notify_change(path)
            except Exception as e:
                log.exception(f"[ide] Failed to apply agent edit")


    # ── Windows Proxy SocketIO events ────────────────────────────────────


    @socketio.on("win_proxy_register")
    def on_win_proxy_register(data):
        """Windows proxy client registers itself."""
        global _win_proxy_sid
        _win_proxy_sid = request.sid
        log.info(f"[ide] Windows proxy connected (root: {data.get('root', '?')})")
        socketio.emit("ide_win_proxy_status", {"connected": True, "root": data.get("root", "")})



    @socketio.on("win_proxy_response")
    def on_win_proxy_response(data):
        """Windows proxy responds to a request."""
        request_id = data.get("request_id", "")
        result = data.get("result", {})
        pending = _win_proxy_pending.get(request_id)
        if pending:
            pending.set(result)




def cleanup_client_session(sid: str) -> None:
    """Called from `app.py:on_disconnect` so the IDE module can release its
    own per-client state (terminal sessions, Windows-proxy registration)
    when a SocketIO client disconnects."""
    global _win_proxy_sid
    if _terminal_mgr is not None:
        try:
            _terminal_mgr.close_all(sid)
        except Exception:
            log.exception("[ide] terminal cleanup on disconnect failed")
    if sid == _win_proxy_sid:
        _win_proxy_sid = None
        if socketio is not None:
            socketio.emit("ide_win_proxy_status", {"connected": False})
