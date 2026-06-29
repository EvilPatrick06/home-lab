"""Chat persistence + speaker normalization.

Extracted from app.py 2026-06-10, PHASE-16 16B. Imported by the chat blueprint
(routes/chat_api.py), the realtime SocketIO module (routes/realtime_ws.py), and app.py's
voice hook + startup-resume — replacing the former three-way in-app duplication.

`save_chat_message` needs the live agent (to decide DnD-log writes) but must not import
app.py at module load. It calls `_agent_resolver()`; app.py installs a resolver via
`set_agent_resolver(lambda: agent)` so the lambda reads the agent global at call time.
"""

import json
import logging
import os
from services.paths import DATA_DIR as _P_DATA_DIR
import time
from typing import Any, Callable

from state import STATE

log = logging.getLogger("bmo")

# /api/chat input limit (per-handler size cap).
MAX_CHAT_MESSAGE_LEN = int(os.environ.get("BMO_MAX_CHAT_MESSAGE_LEN", "16384"))
# Source-of-input enum. Every persisted chat turn carries one of these (or a
# `voice:<profile>` prefix). The legacy `player/dm/user/gavin` entries stay
# for D&D-mode back-compat, but new typed UI traffic now uses `text` and
# voice-pipeline writes use `voice:<profile>` — see is_voice_speaker below.
ALLOWED_CHAT_SPEAKERS = {
    "text", "system", "discord", "kiosk", "unknown",
    "player", "dm", "user", "gavin",
}


def is_voice_speaker(speaker: str) -> bool:
    """True iff this speaker tag claims voice-profile attribution (`voice:<name>`)."""
    return isinstance(speaker, str) and speaker.startswith("voice:") and len(speaker) > len("voice:")


def normalize_chat_speaker(speaker, source_voice: bool = False) -> str:
    """Drop voice-attribution claims that didn't come from the voice pipeline,
    then map anything outside the enum to `unknown`. Defends the persisted
    history (and downstream agent memory) from spoofed `speaker` fields.

    `source_voice=True` is set ONLY by the voice pipeline and trusted internal
    callers; QA #2 root cause was the typed-chat UI sending `speaker:'gavin'`
    by default, which polluted per-profile memory."""
    if not isinstance(speaker, str) or not speaker:
        return "unknown"
    if is_voice_speaker(speaker) and not source_voice:
        return "text"
    if is_voice_speaker(speaker):
        return speaker
    if speaker.lower() in ALLOWED_CHAT_SPEAKERS:
        return speaker.lower()
    return "unknown"


# ── Chat Persistence ─────────────────────────────────────────────────

# Recent chat buffer — kept in memory, served to frontend on refresh
RECENT_CHAT_FILE = str(_P_DATA_DIR / "recent_chat.json")
MAX_RECENT = 200  # Rolling buffer of recent messages

# DnD session log — permanently saved to its own file
DND_LOG_DIR = str(_P_DATA_DIR / "dnd_sessions")

# Late-bound agent accessor (app.py installs the real one via set_agent_resolver).
_agent_resolver: Callable[[], Any] = lambda: None


def set_agent_resolver(fn: Callable[[], Any]) -> None:
    """app.py installs `lambda: agent` so save_chat_message sees the live agent."""
    global _agent_resolver
    _agent_resolver = fn


def load_recent_chat() -> list[dict]:
    """Load the recent chat buffer from disk."""
    try:
        if os.path.exists(RECENT_CHAT_FILE):
            with open(RECENT_CHAT_FILE, encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        log.exception("[chat] Failed to load recent chat")
    return []


def save_recent_message(msg: dict):
    """Append a message to the recent chat buffer (rolling, all chats)."""
    # Defense-in-depth (PHASE-01 01E): never write the live store under pytest.
    # The autouse conftest fixture redirects RECENT_CHAT_FILE to a tmp path; if a
    # test ever forgot that redirect, refuse the real-path write rather than leak
    # fixture rows (the "Hello from BMO!" seed) into the production buffer.
    if os.environ.get("PYTEST_CURRENT_TEST") and RECENT_CHAT_FILE.endswith(
        "/home-lab/bmo/pi/data/recent_chat.json"
    ):
        log.debug("[chat] refusing real-path recent-chat write under pytest")
        return
    with STATE.chat_lock:
        try:
            messages = load_recent_chat()
            messages.append(msg)
            if len(messages) > MAX_RECENT:
                messages = messages[-MAX_RECENT:]
            os.makedirs(os.path.dirname(RECENT_CHAT_FILE), exist_ok=True)
            with open(RECENT_CHAT_FILE, "w", encoding="utf-8") as f:
                json.dump(messages, f, ensure_ascii=False)
        except Exception:
            log.exception("[chat] Failed to save recent chat")


def save_dnd_message(msg: dict):
    """Append a message to the permanent DnD session log."""
    os.makedirs(DND_LOG_DIR, exist_ok=True)
    # One file per day so sessions are easy to find
    date_str = time.strftime("%Y-%m-%d")
    log_file = os.path.join(DND_LOG_DIR, f"session_{date_str}.json")
    messages = []
    try:
        if os.path.exists(log_file):
            with open(log_file, encoding="utf-8") as f:
                messages = json.load(f)
    except Exception:
        messages = []
    messages.append(msg)
    with open(log_file, "w", encoding="utf-8") as f:
        json.dump(messages, f, ensure_ascii=False)


def save_chat_message(msg: dict):
    """Save a chat message — always to recent buffer, also to DnD log if in DM mode."""
    save_recent_message(msg)
    agent = _agent_resolver()
    if agent and agent._dnd_context:
        save_dnd_message(msg)


def save_pending_assistant_stub(pending_id: str) -> None:
    """Round 2 N (2026-05-17): write a placeholder assistant turn at chat
    start. Marked incomplete + pending_id so finalize_pending_assistant
    can overwrite it on completion. If the request dies (server crash,
    user refresh) before completion, the stub stays as `incomplete:true`
    and the frontend renders an "(interrupted)" pill."""
    save_chat_message({
        "role": "assistant",
        "text": "",
        "incomplete": True,
        "pending_id": pending_id,
        "ts": time.time(),
    })


def finalize_pending_assistant(pending_id: str, final_msg: dict) -> bool:
    """Overwrite the most recent pending stub matching pending_id with the
    completed assistant turn. Returns True if a stub was replaced, False
    otherwise (caller should then save normally as a fallback)."""
    with STATE.chat_lock:
        try:
            messages = load_recent_chat()
            for i in range(len(messages) - 1, -1, -1):
                m = messages[i]
                if m.get("role") == "assistant" and m.get("pending_id") == pending_id:
                    messages[i] = {**final_msg, "pending_id": pending_id, "incomplete": False}
                    messages[i].pop("incomplete", None)  # final shape has no incomplete flag
                    with open(RECENT_CHAT_FILE, "w", encoding="utf-8") as f:
                        json.dump(messages, f, ensure_ascii=False)
                    return True
        except Exception:
            log.exception("[chat] finalize_pending_assistant failed")
    return False


# ── PHASE-09 09C: orphan-stub hygiene ────────────────────────────────
# A pending assistant stub (save_pending_assistant_stub) that is never
# reconciled by finalize_pending_assistant is a turn that died mid-flight
# (server crash / user refresh). It must not render as a real/canned reply or
# pollute the agent memory. The RAW load_recent_chat above is deliberately
# unchanged (the write + finalize path depends on seeing the stub); the display
# loader and the startup sweep below are the only consumers that drop them.


def _is_orphan_stub(msg: Any) -> bool:
    """True for a never-completed assistant placeholder."""
    return (
        isinstance(msg, dict)
        and msg.get("role") == "assistant"
        and msg.get("incomplete") is True
    )


def load_recent_chat_for_display() -> list[dict]:
    """Like load_recent_chat but drops never-completed assistant stubs so the
    rendered transcript is not polluted by orphan "(interrupted)" / empty pills.
    Used by the /api/chat/history endpoint and the startup agent-memory restore."""
    return [m for m in load_recent_chat() if not _is_orphan_stub(m)]


def sweep_orphan_stubs() -> int:
    """One-time startup repair: permanently drop orphan assistant stubs from the
    recent-chat file. Safe at startup because nothing is in flight -- any
    incomplete assistant turn is a casualty of a prior crash/refresh. Returns the
    count removed; user turns and completed replies are preserved."""
    with STATE.chat_lock:
        try:
            messages = load_recent_chat()
            kept = [m for m in messages if not _is_orphan_stub(m)]
            removed = len(messages) - len(kept)
            if removed:
                # Never write the live store under pytest (mirrors save_recent_message).
                if os.environ.get("PYTEST_CURRENT_TEST") and RECENT_CHAT_FILE.endswith(
                    "/home-lab/bmo/pi/data/recent_chat.json"
                ):
                    return removed
                os.makedirs(os.path.dirname(RECENT_CHAT_FILE), exist_ok=True)
                with open(RECENT_CHAT_FILE, "w", encoding="utf-8") as f:
                    json.dump(kept, f, ensure_ascii=False)
            return removed
        except Exception:
            log.exception("[chat] sweep_orphan_stubs failed")
            return 0
