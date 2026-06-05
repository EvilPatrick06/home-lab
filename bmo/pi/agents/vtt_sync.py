"""
BMO Pi Sync Patch — VTT State Sync endpoints for discord_dm_bot.

Deploy: Copy this file to ~/home-lab/bmo/pi/agents/ on the Pi and import from dnd_dm.py

This module adds:
  1. HTTP endpoints on BMO's Flask server to receive sync data from the VTT
  2. Callback functions to push Discord events to the VTT sync receiver
  3. Initiative display formatting for Discord

Requires: requests, flask (already installed on BMO)

VTT Sync Receiver runs at: http://<VTT_IP>:5001
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

logger = logging.getLogger("bmo.vtt_sync")

# The VTT's sync receiver URL — set via env or auto-discover
VTT_SYNC_URL = os.environ.get("VTT_SYNC_URL", "http://vtt.local:5001").strip() or "http://vtt.local:5001"
SYNC_TIMEOUT = 5  # seconds
# Backoff delays (seconds) between the retries that follow the initial attempt;
# 3 retries → 4 attempts total. The VTT dedups on eventId, so a retry that lands
# after the VTT already processed the event is acked-and-ignored, not double-applied.
RETRY_DELAYS = (0.5, 1.5, 3.0)


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
        logger.info(f"Initiative updated: round {data.get('round', '?')}")

    def update_game_state(self, data: Dict[str, Any]):
        self.game_state = data
        self.last_updated = datetime.now()
        logger.info(f"Game state updated: map={data.get('mapName', 'unknown')}")

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


def register_sync_routes(app):
    """Register Flask routes for receiving VTT sync data.

    Call this from your main Flask app setup:
        from agents.vtt_sync import register_sync_routes
        register_sync_routes(app)
    """
    from flask import jsonify, request as flask_request

    def _parse_json():
        """Parse JSON body in a gevent-safe way."""
        # Try multiple approaches for compatibility with gevent async_mode
        try:
            # 1. Try Flask's built-in JSON parser
            data = flask_request.get_json(silent=True)
            if data is not None:
                return data
        except Exception:
            pass
        try:
            # 2. Try reading raw data
            raw = flask_request.data
            if raw:
                return json.loads(raw if isinstance(raw, str) else raw.decode("utf-8"))
        except Exception:
            pass
        try:
            # 3. Try reading from stream directly
            content_length = flask_request.content_length or 0
            if content_length > 0:
                raw = flask_request.stream.read(content_length)
                return json.loads(raw if isinstance(raw, str) else raw.decode("utf-8"))
        except Exception:
            pass
        return {}

    @app.route("/api/discord/dm/sync/initiative", methods=["POST"])
    def receive_initiative():
        data = _parse_json()
        vtt_state.update_initiative(data)
        return jsonify({"ok": True})

    @app.route("/api/discord/dm/sync/state", methods=["POST"])
    def receive_state():
        data = _parse_json()
        vtt_state.update_game_state(data)
        return jsonify({"ok": True})

    logger.info("VTT sync routes registered")


# ─── Pi → VTT: Push events to VTT ───

def _send_with_retry(url: str, payload: Dict[str, Any]) -> bool:
    """POST with bounded retry + backoff. Returns True once the VTT acks (200).

    Safe to retry: the payload carries a stable `eventId` and the VTT dedups on
    it, so re-delivering an event the VTT already applied is a no-op there.
    """
    attempts = len(RETRY_DELAYS) + 1
    for attempt in range(attempts):
        try:
            resp = requests.post(url, json=payload, timeout=SYNC_TIMEOUT)
            if resp.status_code == 200:
                return True
            logger.warning(f"VTT sync {url} HTTP {resp.status_code} (attempt {attempt + 1}/{attempts})")
        except requests.RequestException as e:
            logger.warning(f"VTT sync {url} error (attempt {attempt + 1}/{attempts}): {e}")
        if attempt < len(RETRY_DELAYS):
            time.sleep(RETRY_DELAYS[attempt])
    logger.warning(f"VTT sync {url} dropped after {attempts} attempts (eventId={payload.get('eventId')})")
    return False


def _post_to_vtt(path: str, data: Dict[str, Any]) -> bool:
    """Send a POST to the VTT sync receiver off the request thread.

    Stamps a stable `eventId` (one per event, reused across retries) so the VTT
    can dedup, then dispatches `_send_with_retry` on a daemon thread.
    """
    event_id = data.get("eventId") or str(uuid4())
    payload = {**data, "eventId": event_id}
    url = f"{VTT_SYNC_URL}{path}"
    threading.Thread(target=_send_with_retry, args=(url, payload), daemon=True).start()
    return True


def push_discord_message(
    username: str, content: str, character_name: Optional[str] = None
):
    """Forward a Discord message to the VTT for AI processing."""
    _post_to_vtt("/api/sync", {
        "type": "discord_message",
        "payload": {
            "username": username,
            "content": content,
            "characterName": character_name,
        },
        "timestamp": int(datetime.now().timestamp() * 1000),
    })


def push_discord_roll(
    username: str,
    roll_expression: str,
    result: int,
    character_name: Optional[str] = None,
):
    """Forward a Discord dice roll to the VTT."""
    _post_to_vtt("/api/sync", {
        "type": "discord_roll",
        "payload": {
            "username": username,
            "expression": roll_expression,
            "result": result,
            "characterName": character_name,
        },
        "timestamp": int(datetime.now().timestamp() * 1000),
    })


def push_player_join(username: str, character_name: Optional[str] = None):
    """Notify VTT that a Discord player has joined."""
    _post_to_vtt("/api/sync", {
        "type": "player_join",
        "payload": {"username": username, "characterName": character_name},
        "timestamp": int(datetime.now().timestamp() * 1000),
    })


def push_player_leave(username: str):
    """Notify VTT that a Discord player has left."""
    _post_to_vtt("/api/sync", {
        "type": "player_leave",
        "payload": {"username": username},
        "timestamp": int(datetime.now().timestamp() * 1000),
    })


def request_vtt_state():
    """Ask the VTT for its current state (initiative, map, party HP)."""
    try:
        resp = requests.get(
            f"{VTT_SYNC_URL}/api/sync/state", timeout=SYNC_TIMEOUT
        )
        return resp.status_code == 200
    except requests.RequestException as e:
        logger.warning(f"VTT state request failed: {e}")
        return False


def check_vtt_health() -> bool:
    """Check if the VTT sync receiver is online."""
    try:
        resp = requests.get(
            f"{VTT_SYNC_URL}/api/sync/health", timeout=SYNC_TIMEOUT
        )
        return resp.status_code == 200
    except requests.RequestException:
        return False
