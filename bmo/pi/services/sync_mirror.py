"""services/sync_mirror.py — debounced mirror of each user's sync dir to Drive.

The Pi is the hot sync hub; Google Drive is the durable backup. After a push or
delete, ``schedule(user_id)`` (re)arms a per-user debounce timer; when it fires
it writes a fresh ``manifest.json`` snapshot and runs a single
``rclone sync data/sync/<uid>/ -> gdrive:DND-VTT-Accounts/<uid>/`` (efficient
bulk delta — reuses the same rclone remote as the legacy campaign backup, under
a separate top-level folder).

The rclone runner is injectable (tests pass a fake; production shells out), and
the whole mirror can be disabled (tests) so no timers/subprocess run.
"""

from __future__ import annotations

import os
import re
import subprocess
import threading

from services import sync_store
from services.bmo_logging import _s, get_logger

log = get_logger("sync_mirror")

REMOTE = os.environ.get("BMO_VTT_BACKUP_REMOTE", "gdrive")
ACCOUNTS_ROOT = "DND-VTT-Accounts"
DEBOUNCE_SECONDS = float(os.environ.get("BMO_SYNC_MIRROR_DEBOUNCE", "10"))
MIRROR_TIMEOUT = int(os.environ.get("BMO_SYNC_MIRROR_TIMEOUT", "600"))

# user_id is the Discord snowflake (digits) — guard anyway before using it as a
# remote path segment.
_UID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

_enabled = True
_runner = None  # type: ignore[var-annotated]
_timers: dict[str, threading.Timer] = {}
_lock = threading.Lock()


def configure(enabled: bool = True, runner=None) -> None:
    global _enabled, _runner
    _enabled = enabled
    _runner = runner
    with _lock:
        for t in _timers.values():
            t.cancel()
        _timers.clear()


def _rclone(args: list[str], timeout: int) -> tuple[int, str, str]:
    if _runner is not None:
        return _runner(args, timeout)
    try:
        proc = subprocess.run(["rclone", *args], capture_output=True, text=True, timeout=timeout, check=False)
        return proc.returncode, proc.stdout, proc.stderr
    except FileNotFoundError:
        return 127, "", "rclone not installed"
    except subprocess.TimeoutExpired:
        return 124, "", f"rclone timed out after {timeout}s"


def mirror_now(user_id: str) -> tuple[int, str, str] | None:
    """Run the rclone sync synchronously. Returns the rclone result, or None if
    the user has no local dir / an invalid id."""
    uid = str(user_id)
    if not _UID_RE.match(uid):
        return None
    local = os.path.join(sync_store._root(), uid)
    if not os.path.isdir(local):
        return None
    sync_store.snapshot_manifest(uid)
    rc, out, err = _rclone(["sync", local, f"{REMOTE}:{ACCOUNTS_ROOT}/{uid}"], MIRROR_TIMEOUT)
    if rc != 0:
        log.warning("[sync] mirror failed for %s: %s", _s(uid), _s(err.strip()))
    return rc, out, err


def schedule(user_id: str) -> None:
    """Debounced mirror — coalesces a burst of changes into one rclone sync."""
    if not _enabled:
        return
    uid = str(user_id)
    with _lock:
        existing = _timers.get(uid)
        if existing:
            existing.cancel()
        timer = threading.Timer(DEBOUNCE_SECONDS, _fire, args=(uid,))
        timer.daemon = True
        _timers[uid] = timer
        timer.start()


def _fire(user_id: str) -> None:
    with _lock:
        _timers.pop(user_id, None)
    try:
        mirror_now(user_id)
    except Exception:
        log.exception("[sync] mirror error for %s", _s(str(user_id)))
