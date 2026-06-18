"""Chat + DnD HTTP surface (/api/chat*, /api/dnd/*).

Extracted from app.py 2026-06-10, PHASE-16 16G. Blueprint carries absolute paths (no
url_prefix). Services resolved late via `_app()`; persistence + speaker normalization come
from services.chat_history; rate limits from extensions (the deferred-init limiter).
"""

import json
import logging
import os
import threading
import time

from flask import Blueprint, jsonify, request

from extensions import RATE_LIMIT_CHAT, RATE_LIMIT_DND_LOAD, limiter
from services import chat_history
from services.bmo_logging import fail

log = logging.getLogger("bmo")

chat_bp = Blueprint("chat", __name__)


def _app():
    import app
    return app


def _strip_markdown(text: str) -> str:
    """Remove markdown formatting so the web UI shows plain English."""
    from services.voice_pipeline import VoicePipeline
    return VoicePipeline._strip_markdown(text)


@chat_bp.route("/api/chat", methods=["POST"])
@limiter.limit(RATE_LIMIT_CHAT)
def api_chat():
    data = request.json or {}
    message = data.get("message", "")
    raw_speaker = data.get("speaker", "unknown")
    source_voice = bool(data.get("source_voice"))

    if not isinstance(message, str) or not message:
        return jsonify({"error": "No message provided"}), 400
    if len(message) > chat_history.MAX_CHAT_MESSAGE_LEN:
        return jsonify({
            "error": f"message too large (max {chat_history.MAX_CHAT_MESSAGE_LEN} chars)"
        }), 413
    # Drops voice-attribution claims that didn't come from the voice pipeline
    # (QA #2: typed messages were being tagged with voice profile "gavin"),
    # then enforces the speaker enum.
    speaker = chat_history.normalize_chat_speaker(raw_speaker, source_voice=source_voice)

    # Save user message immediately
    chat_history.save_chat_message({"role": "user", "text": message, "speaker": speaker, "ts": time.time()})

    client_tz = _app()._request_client_timezone(default_to_pi=True)
    result = _app().agent.chat(message, speaker=speaker, client_timezone=client_tz)
    result["text"] = _strip_markdown(result["text"])

    # Save assistant response immediately
    chat_history.save_chat_message({"role": "assistant", "text": result["text"], "ts": time.time()})

    # Speak the response (in background so API returns immediately)
    voice = _app().voice
    if voice:
        threading.Thread(target=voice.speak, args=(result["text"],), daemon=True).start()

    return jsonify(result)


_DND_ALLOWED_DATA_ROOTS = [
    os.path.realpath(os.path.expanduser("~/home-lab/bmo/pi/data")),
    os.path.realpath(os.path.expanduser("~/home-lab/dnd-app/src/renderer/public/data")),
]


def _safe_dnd_path(raw: str) -> str:
    """Realpath-jail a DnD asset path to ~/home-lab/bmo/pi/data or the
    dnd-app shared data tree. Anything else (especially `/etc/passwd`,
    `~/.ssh/...`, `~/home-lab/bmo/pi/.env`, `/home/patrick/home-lab/bmo/pi/config/token.json`)
    is rejected. Allows `..` segments inside the allowed roots — load_dnd_context
    needs that for nested character files."""
    if not isinstance(raw, str) or not raw:
        raise PermissionError("path is required")
    resolved = os.path.realpath(os.path.expanduser(raw))
    for root in _DND_ALLOWED_DATA_ROOTS:
        if resolved == root or resolved.startswith(root + os.sep):
            return resolved
    raise PermissionError(f"path outside DnD content sandbox: {resolved}")


@chat_bp.route("/api/dnd/load", methods=["POST"])
@limiter.limit(RATE_LIMIT_DND_LOAD)
def api_dnd_load():
    """Manually load DnD context with character files and map selection."""
    data = request.json or {}
    char_paths = data.get("characters", [])
    maps_dir = data.get("maps_dir", "")
    chosen_map = data.get("map", None)

    if not char_paths or not isinstance(char_paths, list):
        return jsonify({"error": "No character file paths provided"}), 400
    if len(char_paths) > 32:
        return jsonify({"error": "Too many character paths (max 32)"}), 400

    try:
        safe_chars = [_safe_dnd_path(p) for p in char_paths]
        safe_maps_dir = _safe_dnd_path(maps_dir) if maps_dir else ""
    except PermissionError as e:
        return fail(log, e, 403, "path outside DnD content sandbox")

    selected_map = _app().agent.load_dnd_context(safe_chars, safe_maps_dir, chosen_map)
    return jsonify({"ok": True, "map": selected_map})


@chat_bp.route("/api/dnd/sessions")
def api_dnd_sessions():
    """List all saved DnD session log files."""
    dnd_log_dir = chat_history.DND_LOG_DIR
    if not os.path.isdir(dnd_log_dir):
        return jsonify([])
    sessions = []
    for fname in sorted(os.listdir(dnd_log_dir), reverse=True):
        if fname.startswith("session_") and fname.endswith(".json"):
            date = fname.replace("session_", "").replace(".json", "")
            fpath = os.path.join(dnd_log_dir, fname)
            try:
                with open(fpath, encoding="utf-8") as f:
                    messages = json.load(f)
                # Get first assistant message as preview
                preview = ""
                for m in messages:
                    if m.get("role") == "assistant":
                        preview = m.get("text", "")[:100]
                        break
                sessions.append({"date": date, "messages": len(messages), "preview": preview})
            except Exception:
                sessions.append({"date": date, "messages": 0, "preview": ""})
    return jsonify(sessions)


@chat_bp.route("/api/dnd/sessions/<date>")
def api_dnd_session_get(date):
    """Get a specific DnD session log by date."""
    fpath = os.path.join(chat_history.DND_LOG_DIR, f"session_{date}.json")
    if not os.path.exists(fpath):
        return jsonify({"error": f"No session found for {date}"}), 404
    try:
        with open(fpath, encoding="utf-8") as f:
            messages = json.load(f)
        return jsonify(messages)
    except Exception as e:
        return fail(log, e, 500, "internal server error")


@chat_bp.route("/api/dnd/sessions/<date>/restore", methods=["POST"])
def api_dnd_session_restore(date):
    """Restore a DnD session into the agent's conversation history."""
    agent = _app().agent
    fpath = os.path.join(chat_history.DND_LOG_DIR, f"session_{date}.json")
    if not os.path.exists(fpath):
        return jsonify({"error": f"No session found for {date}"}), 404
    try:
        with open(fpath, encoding="utf-8") as f:
            messages = json.load(f)
        # Clear current history and reload
        agent.conversation_history.clear()
        for msg in messages:
            role = msg.get("role", "user")
            text = msg.get("text", "")
            agent.conversation_history.append({"role": role, "content": text})
        # Re-detect DnD context
        for msg in messages:
            if msg.get("role") == "user" and agent._is_dnd_request(msg.get("text", "")):
                agent._auto_load_dnd(msg["text"])
                break
        # Generate a narrative recap
        recap = ""
        try:
            recap = agent.generate_session_recap(messages)
        except Exception:
            log.exception("[chat] Recap generation failed")
        return jsonify({"ok": True, "messages_restored": len(messages), "recap": recap})
    except Exception as e:
        return fail(log, e, 500, "internal server error")


@chat_bp.route("/api/dnd/gamestate")
def api_dnd_gamestate():
    """Return the current D&D game state (HP, spell slots, conditions, etc.)."""
    agent = _app().agent
    if agent:
        return jsonify(agent.get_gamestate())
    return jsonify({"date": None, "characters": {}})


@chat_bp.route("/api/dnd/players")
def api_dnd_players():
    """Return player character names from the active DnD context."""
    agent = _app().agent
    if agent:
        return jsonify({"players": agent.get_player_names()})
    return jsonify({"players": []})


@chat_bp.route("/api/chat/history")
def api_chat_history():
    """Return recent chat messages for the frontend to restore on refresh."""
    messages = chat_history.load_recent_chat()
    return jsonify(messages)


@chat_bp.route("/api/chat/clear", methods=["POST"])
def api_chat_clear():
    """Clear chat. If a DnD session is active, save it to the permanent log first."""
    agent = _app().agent
    dnd_log_dir = chat_history.DND_LOG_DIR
    dnd_was_active = agent and agent._dnd_context is not None

    # If DnD session was active, save the full conversation to the session log
    if dnd_was_active:
        try:
            recent = chat_history.load_recent_chat()
            if recent:
                # Write the full session as one batch (avoids duplicates from per-message saves)
                os.makedirs(dnd_log_dir, exist_ok=True)
                date_str = time.strftime("%Y-%m-%d")
                log_file = os.path.join(dnd_log_dir, f"session_{date_str}.json")
                # Merge with any existing messages for today
                existing = []
                try:
                    if os.path.exists(log_file):
                        with open(log_file, encoding="utf-8") as f:
                            existing = json.load(f)
                except Exception:
                    pass
                # Deduplicate by timestamp
                existing_ts = {m.get("ts") for m in existing if m.get("ts")}
                new_msgs = [m for m in recent if m.get("ts") not in existing_ts]
                combined = existing + new_msgs
                with open(log_file, "w", encoding="utf-8") as f:
                    json.dump(combined, f, ensure_ascii=False)
                log.info(f"[chat] Saved {len(new_msgs)} new messages to DnD session log")
        except Exception:
            log.exception("[chat] Failed to save DnD session on clear")

    # Clear the recent chat buffer
    try:
        if os.path.exists(chat_history.RECENT_CHAT_FILE):
            os.remove(chat_history.RECENT_CHAT_FILE)
    except Exception:
        pass

    # Save game state alongside session log if DnD was active
    if dnd_was_active and agent and agent._gamestate:
        try:
            date_str = time.strftime("%Y-%m-%d")
            gs_file = os.path.join(dnd_log_dir, f"gamestate_{date_str}.json")
            os.makedirs(dnd_log_dir, exist_ok=True)
            with open(gs_file, "w", encoding="utf-8") as f:
                json.dump(agent._gamestate, f, ensure_ascii=False, indent=2)
            log.info(f"[chat] Saved game state to {gs_file}")
        except Exception:
            log.exception("[chat] Failed to save game state on clear")

    # Reset agent state
    if agent:
        agent.conversation_history.clear()
        agent._dnd_context = None
        agent._dnd_pending = None
        agent._gamestate = None

    # Round 2 #22 (2026-05-17): broadcast so every connected tab clears
    # its message list without a manual refresh.
    try:
        _app().socketio.emit("chat_cleared", {"ts": time.time(), "dnd_saved": dnd_was_active})
    except Exception:
        log.exception("[chat] failed to emit chat_cleared")
    # Round 3 #30 (2026-05-17): only include dnd_saved when meaningful.
    # Previously always returned `false`, which read as "we tried and
    # failed" rather than "no DnD context existed".
    payload = {"ok": True}
    if dnd_was_active:
        payload["dnd_saved"] = True
    return jsonify(payload)


@chat_bp.route("/api/chat/compact", methods=["POST"])
def api_chat_compact():
    """Compact conversation history."""
    agent = _app().agent
    if agent:
        msg = agent.compact()
        return jsonify({"success": True, "message": msg, "history_length": len(agent.conversation_history)})
    return jsonify({"error": "Agent not initialized"}), 500


def register_chat(flask_app):
    """Register the chat blueprint. PHASE-16 16G."""
    flask_app.register_blueprint(chat_bp)
