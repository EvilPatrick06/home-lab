"""bmo/pi/state.py — Single source of truth for shared mutable state.

Before this module: ~15 module-level globals scattered across `app.py` (and
formerly more before the routes/ide.py extraction). Lock discipline was
inconsistent — some had locks, some didn't, and locks were not always taken
at the mutation site.

After this module: every shared lock + collection + counter lives on a
single `AppState` dataclass. Handlers do:

    from state import STATE
    with STATE.notes_lock:
        STATE.notes_list.append(note)

Why a singleton vs a factory: Flask-with-gevent runs as one process. There
is exactly one process-wide state. A singleton avoids every handler having
to look up `current_app.config["STATE"]` at request time. Tests can mock
the singleton or instantiate `_State()` directly.

What lives here:
- **Locks** (`*_lock`) — gevent-monkey-patched `threading.Lock` so they
  work as cooperative-yield primitives.
- **Collections** that get mutated by multiple call sites — `notes_list`,
  `tv_media_cache`, `ide_jobs`, `win_proxy_pending`.
- **Counters / single-value state** — `ide_job_counter`,
  `current_running_job_id`, `win_proxy_sid`. These mutate via attribute
  reassignment on the singleton; that works because every reader goes
  through `STATE.<attr>` (no module-level `global` declarations needed).

What does NOT live here:
- **Singleton service objects** (`_terminal_mgr`, `_file_watcher`,
  `voice`, `weather`, `agent`, etc.) — those are lazy-initialized service
  handles, not "state." They live in their owning module.
- **TV remote / Pairing remote / Bluetooth** — also singletons, in
  `app.py` for now (will move to `routes/tv.py` when that blueprint
  extracts).
- **App config** — env-var-driven constants (`MAX_CHAT_MESSAGE_LEN`,
  `BMO_API_KEY`, etc.) live next to the handlers that use them.

Pairs with the planned remaining-blueprint splits — `routes/chat.py`,
`routes/calendar.py`, etc. all import `from state import STATE` instead
of growing back the same globals each in their own file.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from typing import Any, Optional


def _new_tv_media_cache() -> dict:
    return {"title": "", "artist": "", "app": "", "ts": 0}


@dataclass
class AppState:
    """All shared mutable BMO state. Singleton — see `STATE` below."""

    # ── Locks (gevent-aware via monkey.patch_all) ──────────────────────
    chat_lock: threading.Lock = field(default_factory=threading.Lock)
    notes_lock: threading.Lock = field(default_factory=threading.Lock)
    tv_media_lock: threading.Lock = field(default_factory=threading.Lock)
    tv_proc_lock: threading.Lock = field(default_factory=threading.Lock)
    ide_jobs_lock: threading.Lock = field(default_factory=threading.Lock)

    # ── Collections mutated by multiple handlers ──────────────────────
    notes_list: list[dict] = field(default_factory=list)
    tv_media_cache: dict = field(default_factory=_new_tv_media_cache)
    ide_jobs: dict[str, dict] = field(default_factory=dict)
    # Windows-proxy pending request_id → AsyncResult map. Not type-hinted
    # against gevent's AsyncResult to keep this module gevent-import-free.
    win_proxy_pending: dict[str, Any] = field(default_factory=dict)

    # ── Single-value state (set via STATE.attr = ...) ─────────────────
    ide_job_counter: int = 0
    current_running_job_id: Optional[str] = None
    win_proxy_sid: Optional[str] = None


# The single canonical instance. Import as `from state import STATE`.
STATE = AppState()
