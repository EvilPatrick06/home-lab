"""VTT↔Discord sync plane (Pi side). PHASE-22.

  1. `VTTState`/`vtt_state` — in-memory cache of state the VTT pushes; the bot's
     loopback control server (dm_bot_control.py) writes it and renders the
     initiative embed (`format_initiative_embed`).
  2. Push helpers (`push_discord_message`/`push_discord_roll`/`push_player_join`/
     `push_player_leave`) — emit schema-valid events to the VTT sync receiver at
     `VTT_SYNC_URL` (default unset = disabled), bearer-authed with `VTT_SYNC_TOKEN`.

Push payload keys match the VTT's zod contract (dnd-app/src/shared/ipc-schemas.ts).
Requires: requests.
"""

import json
import logging
import os
import threading
import time
from datetime import datetime
from typing import Any, Dict, Optional
from uuid import uuid4

import requests

from services.bmo_logging import _s

logger = logging.getLogger("bmo.vtt_sync")

# PHASE-22 22A: the VTT's sync receiver URL. NO `vtt.local` fallback — an unset
# URL disables Pi→VTT sync entirely (logged once) instead of spawning doomed
# 4×5s retry threads against a host that isn't there.
VTT_SYNC_URL = (os.environ.get("VTT_SYNC_URL") or "").strip().rstrip("/")
# Shared secret for the VTT receiver's bearer gate; falls back to the Pi's own
# front-door BMO_API_KEY so one secret serves both directions.
VTT_SYNC_TOKEN = (os.environ.get("VTT_SYNC_TOKEN") or os.environ.get("BMO_API_KEY") or "").strip()
SYNC_TIMEOUT = 5  # seconds
# Backoff delays (seconds) between the retries that follow the initial attempt;
# 3 retries → 4 attempts total. The VTT dedups on eventId, so a retry that lands
# after the VTT already processed the event is acked-and-ignored, not double-applied.
RETRY_DELAYS = (0.5, 1.5, 3.0)

# One-shot "sync disabled" log guard, and a read-only last-push status for the
# control server's /control/status (no blocking health probe needed — 22B).
_disabled_logged = False
last_push: Dict[str, Any] = {"ok": None, "at": None, "url": None, "status": None}

# Durable outbox (PHASE-22 reliability): when a push exhausts its bounded retry
# (VTT down longer than the few-second window), append the event here instead of
# dropping it, then replay in order once /api/sync/health is healthy again. The
# stable eventId makes replay safe (VTT dedups). Stale events expire so an old
# roll never replays into a later session.
_OUTBOX_PATH = os.path.expanduser("~/home-lab/bmo/pi/data/vtt_sync_outbox.jsonl")
_OUTBOX_LOCK = threading.Lock()
_OUTBOX_TTL = 6 * 3600
_DRAIN_INTERVAL = 30
_drainer_started = False


def sync_enabled() -> bool:
    """True when a VTT sync target is configured."""
    return bool(VTT_SYNC_URL)


def _log_disabled_once() -> None:
    global _disabled_logged
    if not _disabled_logged:
        logger.info("VTT sync disabled — VTT_SYNC_URL not set")
        _disabled_logged = True


def validate_sync_config() -> Dict[str, Any]:
    """Resolved Pi→VTT sync config (logged at bot startup; REPL-friendly)."""
    cfg = {"enabled": sync_enabled(), "url": VTT_SYNC_URL or None, "auth": bool(VTT_SYNC_TOKEN)}
    if cfg["enabled"]:
        logger.info("VTT sync → %s (auth=%s)", cfg["url"], cfg["auth"])
    else:
        _log_disabled_once()
    return cfg


# ─── VTT → Pi: Receive state from VTT ───

class VTTState:
    """In-memory cache of the latest state received from VTT."""

    def __init__(self):
        self.initiative: Optional[Dict[str, Any]] = None
        self.game_state: Optional[Dict[str, Any]] = None
        self.last_updated: Optional[datetime] = None

    def update_initiative(self, data: Dict[str, Any]):
        self.initiative = data
        self.last_updated = datetime.now()
        logger.info("Initiative updated: round %s", _s(data.get("round", "?")))

    def update_game_state(self, data: Dict[str, Any]):
        self.game_state = data
        self.last_updated = datetime.now()
        logger.info("Game state updated: map=%s", _s(data.get("mapName", "unknown")))

    def format_initiative_embed(self) -> Optional[Dict[str, Any]]:
        """Format initiative order as a Discord embed dict."""
        if not self.initiative or not self.initiative.get("entries"):
            return None

        entries = self.initiative["entries"]
        current_idx = self.initiative.get("currentIndex", 0)
        round_num = self.initiative.get("round", 1)

        lines = []
        for i, entry in enumerate(entries):
            marker = "▶ " if i == current_idx else "  "
            name = entry.get("entityName", "???")
            etype = entry.get("entityType", "")
            icon = "⚔️" if etype == "enemy" else "🛡️" if etype == "player" else "🤝"
            lines.append(f"{marker}{icon} {name}")

        return {
            "title": f"⚔️ Initiative — Round {round_num}",
            "description": "```\n" + "\n".join(lines) + "\n```",
            "color": 0xE74C3C,
            "footer": {"text": f"Updated {datetime.now().strftime('%H:%M:%S')}"},
        }


# Singleton state cache
vtt_state = VTTState()


# PHASE-22 22A: `register_sync_routes` was deleted — it cached state in the wrong
# (Flask) process where the bot could never read it. VTT→Pi state now lands in the
# bot process via the loopback control server (dm_bot_control.py, 22B); VTTState /
# vtt_state / format_initiative_embed above are consumed there.


# ─── Pi → VTT: Push events to VTT ───

def _auth_headers() -> Dict[str, str]:
    """Bearer header when a token is configured (22A/F6); empty otherwise."""
    return {"Authorization": f"Bearer {VTT_SYNC_TOKEN}"} if VTT_SYNC_TOKEN else {}


def _send_with_retry(url: str, payload: Dict[str, Any]) -> bool:
    """POST with bounded retry + backoff. Returns True once the VTT acks (200).

    Safe to retry: the payload carries a stable `eventId` and the VTT dedups on
    it, so re-delivering an event the VTT already applied is a no-op there.
    Updates the module-level `last_push` status on the final outcome (22A).
    """
    headers = _auth_headers()
    attempts = len(RETRY_DELAYS) + 1
    final_status: Any = None
    for attempt in range(attempts):
        try:
            resp = requests.post(url, json=payload, timeout=SYNC_TIMEOUT, headers=headers)
            final_status = resp.status_code
            if resp.status_code == 200:
                last_push.update({"ok": True, "at": time.time(), "url": url, "status": 200})
                return True
            logger.warning("VTT sync %s HTTP %s (attempt %d/%d)", _s(url), resp.status_code, attempt + 1, attempts)
        except requests.RequestException as e:
            final_status = str(e)
            logger.warning("VTT sync %s error (attempt %d/%d): %s", _s(url), attempt + 1, attempts, _s(e))
        if attempt < len(RETRY_DELAYS):
            time.sleep(RETRY_DELAYS[attempt])
    logger.warning("VTT sync %s dropped after %d attempts (eventId=%s) — buffering to outbox", _s(url), attempts, _s(payload.get("eventId")))
    _outbox_append(url, payload)
    last_push.update({"ok": False, "at": time.time(), "url": url, "status": final_status})
    return False


def _outbox_append(url: str, payload: Dict[str, Any]) -> None:
    """Append a dropped event to the durable outbox and ensure the drainer runs."""
    rec = {"url": url, "payload": payload, "queued_at": time.time()}
    try:
        with _OUTBOX_LOCK:
            os.makedirs(os.path.dirname(_OUTBOX_PATH), exist_ok=True)
            with open(_OUTBOX_PATH, "a", encoding="utf-8") as f:
                f.write(json.dumps(rec) + "\n")
        _ensure_drainer()
    except OSError as e:
        logger.warning("VTT sync outbox append failed: %s", _s(e))


def outbox_depth() -> int:
    """Number of buffered events awaiting replay (for a degraded-state indicator)."""
    try:
        with _OUTBOX_LOCK:
            if not os.path.exists(_OUTBOX_PATH):
                return 0
            with open(_OUTBOX_PATH, encoding="utf-8") as f:
                return sum(1 for line in f if line.strip())
    except OSError:
        return 0


def _send_once(url: str, payload: Dict[str, Any]) -> bool:
    try:
        resp = requests.post(url, json=payload, timeout=SYNC_TIMEOUT, headers=_auth_headers())
        return resp.status_code == 200
    except requests.RequestException:
        return False


def _vtt_healthy() -> bool:
    try:
        resp = requests.get(f"{VTT_SYNC_URL}/api/sync/health", timeout=SYNC_TIMEOUT, headers=_auth_headers())
        return resp.status_code == 200
    except requests.RequestException:
        return False


def _drain_outbox() -> None:
    """Replay buffered events in order; expire stale ones; stop on first failure
    (VTT went away again) and keep the remainder for the next drain pass."""
    with _OUTBOX_LOCK:
        if not os.path.exists(_OUTBOX_PATH):
            return
        try:
            with open(_OUTBOX_PATH, encoding="utf-8") as f:
                lines = [line for line in f if line.strip()]
        except OSError:
            return
    now = time.time()
    remaining: list[str] = []
    stop = False
    for line in lines:
        if stop:
            remaining.append(line)
            continue
        try:
            rec = json.loads(line)
        except ValueError:
            continue  # drop corrupt line
        if now - rec.get("queued_at", 0) > _OUTBOX_TTL:
            continue  # expire stale event
        if _send_once(rec.get("url", ""), rec.get("payload", {})):
            continue
        remaining.append(line)
        stop = True
    with _OUTBOX_LOCK:
        try:
            if remaining:
                with open(_OUTBOX_PATH, "w", encoding="utf-8") as f:
                    f.writelines(ln if ln.endswith("\n") else ln + "\n" for ln in remaining)
            elif os.path.exists(_OUTBOX_PATH):
                os.remove(_OUTBOX_PATH)
        except OSError:
            pass


def _ensure_drainer() -> None:
    global _drainer_started
    if _drainer_started or not sync_enabled():
        return
    _drainer_started = True

    def _loop():
        while True:
            time.sleep(_DRAIN_INTERVAL)
            try:
                if outbox_depth() > 0 and _vtt_healthy():
                    _drain_outbox()
            except Exception:
                pass

    threading.Thread(target=_loop, daemon=True, name="vtt-outbox-drainer").start()


def _post_to_vtt(path: str, data: Dict[str, Any]) -> bool:
    """Send a POST to the VTT sync receiver off the request thread.

    No-op (logged once) when sync is unconfigured (22A) — no thread, no network.
    Stamps a stable `eventId` (one per event, reused across retries) so the VTT
    can dedup, then dispatches `_send_with_retry` on a daemon thread.
    """
    if not sync_enabled():
        _log_disabled_once()
        return False
    event_id = data.get("eventId") or str(uuid4())
    payload = {**data, "eventId": event_id}
    url = f"{VTT_SYNC_URL}{path}"
    threading.Thread(target=_send_with_retry, args=(url, payload), daemon=True).start()
    return True


# PHASE-22 22A: payload keys aligned to the VTT's zod contract (ipc-schemas.ts) —
# discord_message needs `text`, discord_roll needs `formula`+`total`, join/leave
# need `playerName`. Function signatures are unchanged; only the wire keys move.
def push_discord_message(
    username: str, content: str, character_name: Optional[str] = None
):
    """Forward a Discord message to the VTT for AI processing."""
    _post_to_vtt("/api/sync", {
        "type": "discord_message",
        "payload": {
            "text": content,
            "author": username,
            "characterName": character_name,
        },
        "timestamp": int(datetime.now().timestamp() * 1000),
    })


def push_discord_roll(
    username: str,
    roll_expression: str,
    result: int,
    character_name: Optional[str] = None,
    rolls: Optional[list] = None,
):
    """Forward a Discord dice roll to the VTT."""
    payload: Dict[str, Any] = {
        "formula": roll_expression,
        "total": result,
        "rollerName": username,
        "characterName": character_name,
    }
    if rolls is not None:
        payload["rolls"] = rolls
    _post_to_vtt("/api/sync", {
        "type": "discord_roll",
        "payload": payload,
        "timestamp": int(datetime.now().timestamp() * 1000),
    })


def push_player_join(username: str, character_name: Optional[str] = None):
    """Notify VTT that a Discord player has joined."""
    _post_to_vtt("/api/sync", {
        "type": "player_join",
        "payload": {"playerName": username, "characterName": character_name},
        "timestamp": int(datetime.now().timestamp() * 1000),
    })


def push_player_leave(username: str):
    """Notify VTT that a Discord player has left."""
    _post_to_vtt("/api/sync", {
        "type": "player_leave",
        "payload": {"playerName": username},
        "timestamp": int(datetime.now().timestamp() * 1000),
    })


def request_vtt_state():
    """Ask the VTT for its current state (initiative, map, party HP).

    Blocking — call via asyncio.to_thread from the bot loop. No-op when disabled.
    """
    if not sync_enabled():
        _log_disabled_once()
        return False
    try:
        resp = requests.get(
            f"{VTT_SYNC_URL}/api/sync/state", timeout=SYNC_TIMEOUT, headers=_auth_headers()
        )
        return resp.status_code == 200
    except requests.RequestException as e:
        logger.warning(f"VTT state request failed: {e}")
        return False


def check_vtt_health() -> bool:
    """Check if the VTT sync receiver is online. Blocking; no-op when disabled."""
    if not sync_enabled():
        return False
    try:
        resp = requests.get(
            f"{VTT_SYNC_URL}/api/sync/health", timeout=SYNC_TIMEOUT, headers=_auth_headers()
        )
        return resp.status_code == 200
    except requests.RequestException:
        return False
