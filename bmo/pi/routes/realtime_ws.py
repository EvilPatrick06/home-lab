"""Real-time chat + presence SocketIO surface.

Extracted from app.py 2026-06-10, PHASE-16 16H. Houses the core WebSocket event
handlers (connect / chat_message / plan_approve / plan_reject / client_timezone /
scratchpad_* / disconnect) plus their helpers `_bmo_websocket_authorized` and
`_finish_chat_response`.

How it wires up:
- `app.py` does `from routes.realtime_ws import register_realtime; register_realtime(socketio)`
  at module scope (the socketio object exists by then). That call stamps the module-level
  `socketio` name and attaches every `@socketio.on(...)` handler.
- Services (agent, voice, timers, weather, …) are assigned in app.init_services(), which runs
  AFTER this module imports, so they are resolved lazily via `_app()` at event time.
- Chat persistence + speaker normalization come from services.chat_history.
- `on_disconnect` defers IDE per-client cleanup to routes.ide.cleanup_client_session.
"""

import secrets
import threading
import time

from flask import request

from services import chat_history

import logging

log = logging.getLogger("bmo")

# Stamped by register_realtime(); handlers close over the live socketio object.
socketio = None


def _app():
    import app
    return app


def _bmo_websocket_authorized(auth: object | None) -> bool:
    """HTTP Bearer and/or Socket.IO `auth: { bmo_api_key: ... }` for non-local clients."""
    a = _app()
    if not a.BMO_API_KEY:
        return True
    if a._bmo_client_is_trusted_localhost():
        return True
    if (request.headers.get("Authorization", "") or "").strip() == f"Bearer {a.BMO_API_KEY}":
        return True
    if isinstance(auth, dict) and auth.get("bmo_api_key") == a.BMO_API_KEY:
        return True
    return False


def _finish_chat_response(sid, result, model_override, voice, speaker, pending_id=None):
    """Emit chat_response and run TTS. Called from main handler or background thread."""
    from services.voice_pipeline import VoicePipeline

    a = _app()

    raw_text = result.get("text", "").strip()
    agent_used = result.get("agent_used", "")
    if not raw_text:
        if agent_used == "code":
            raw_text = "The Code Agent looked into it but didn't produce a summary. Try asking again or rephrasing."
        else:
            raw_text = "Hmm, BMO doesn't know what to say about that."

    # Round 2 #15 (2026-05-17): strip leading agent-routing tags like
    # `[conversation] ...` / `[plan] ...` / `[router] ...` that some
    # router paths leak into the visible reply. Matches a single
    # bracketed alphanumeric tag (≤16 chars) at the very start.
    import re as _re
    raw_text = _re.sub(r'^\s*\[[a-zA-Z0-9_-]{1,16}\]\s*', '', raw_text, count=1)

    clean_text = VoicePipeline._strip_markdown(raw_text)

    # Detect likely truncated Code Agent response (ends mid-thought)
    if agent_used == "code" and len(clean_text) > 100:
        tail = clean_text[-120:].lower().rstrip()
        truncated = (
            tail.endswith(":") or
            tail.endswith("let me") or tail.endswith("i'll") or tail.endswith("i will") or
            tail.endswith("so ") or tail.endswith("then ") or tail.endswith("next,") or
            tail.endswith("to see") or tail.endswith("to check") or tail.endswith("if ")
        )
        if truncated:
            clean_text += "\n\n_Response may have been cut off — try asking again to continue._"
            result["incomplete"] = True

    result["text"] = clean_text

    assistant_msg = {"role": "assistant", "text": clean_text, "ts": time.time()}
    if agent_used:
        assistant_msg["agent_used"] = agent_used
    if model_override and model_override != "auto":
        assistant_msg["model"] = model_override
    # Round 2 N (2026-05-17): finalize the pending stub from on_chat_message
    # if one was created; falls back to a fresh append if no stub existed
    # (covers callers that didn't go through on_chat_message).
    if pending_id and chat_history.finalize_pending_assistant(pending_id, assistant_msg):
        pass
    else:
        chat_history.save_chat_message(assistant_msg)

    with a.app.app_context():
        # Code Agent: chat-only, no speak, no OLED expression changes
        if agent_used != "code":
            socketio.emit("status", {"state": "yapping"})
            a._sync_expression("speaking")
        # Broadcast to ALL connected clients so other devices see the response
        socketio.emit("chat_response", result)
        if agent_used != "code":
            a._sync_expression("idle")

    # Code Agent output is chat-only (no TTS) — summaries are long and technical
    if voice and clean_text and agent_used != "code":
        threading.Thread(target=voice.speak, args=(clean_text,), daemon=True).start()


def register_realtime(socketio_obj):
    """Wire the real-time chat/presence SocketIO handlers. PHASE-16 16H.

    Stamps module-level `socketio` so the helpers above + the handlers below resolve
    the live object, then attaches every event handler via `@socketio.on(...)`.
    """
    global socketio
    socketio = socketio_obj

    @socketio.on("connect")
    def on_connect(auth=None):
        a = _app()
        if not _bmo_websocket_authorized(auth):
            log.info("[ws] Rejected: BMO_API_KEY required for this client")
            return False
        log.info("[ws] Client connected")
        client_tz = a._normalize_timezone((auth or {}).get("client_timezone") if isinstance(auth, dict) else None) or a._request_client_timezone(default_to_pi=True)
        if a.timers:
            a.timers.set_client_timezone(request.sid, client_tz)
        # Send initial state for available services — wrapped in try/except
        # so a failing service doesn't kill the WebSocket connection
        try:
            if a.weather:
                socketio.emit("weather_update", a.weather.get_current())
        except Exception:
            log.exception("[ws] Weather init failed")
        try:
            if a.music:
                socketio.emit("music_state", a.music.get_state())
        except Exception:
            log.exception("[ws] Music init failed")
        try:
            if a.timers:
                socketio.emit("timers_tick", a.timers.get_all(viewer_timezone=client_tz), room=request.sid)
        except Exception:
            log.exception("[ws] Timers init failed")
        try:
            if a.calendar:
                next_event = a.calendar.get_next_event()
                if next_event:
                    socketio.emit("next_event", next_event)
        except Exception:
            log.exception("[ws] Calendar init failed")
        try:
            expr = a.oled_face.current_expression if a.oled_face else "idle"
            socketio.emit("expression", {"expression": expr})
        except Exception:
            log.exception("[ws] Expression init failed")
        try:
            if a.alert_service:
                recent = a.alert_service.get_history(5)
                if recent:
                    socketio.emit("recent_alerts", recent)
        except Exception:
            log.exception("[ws] Alerts init failed")

    @socketio.on("chat_message")
    def on_chat_message(data):
        from flask_socketio import emit
        a = _app()
        agent = a.agent
        voice = a.voice
        message = data.get("message", "")
        # QA #1/#2: drop voice-attribution claims that didn't come from the voice
        # pipeline (the typed-chat UI used to default to speaker:"gavin"),
        # then enforce the speaker enum before anything else persists.
        speaker = chat_history.normalize_chat_speaker(data.get("speaker", "unknown"),
                                                      source_voice=bool(data.get("source_voice")))
        agent_override = data.get("agent")
        model_override = data.get("model")
        client_tz = a._normalize_timezone(data.get("client_timezone")) or a._pi_timezone()
        if a.timers:
            a.timers.set_client_timezone(request.sid, client_tz)

        try:
            user_msg = {"role": "user", "text": message, "speaker": speaker, "ts": time.time()}
            if agent_override and agent_override != "auto":
                user_msg["agent"] = agent_override
            if model_override and model_override != "auto":
                user_msg["model"] = model_override
            chat_history.save_chat_message(user_msg)

            # Round 2 N (2026-05-17): write a placeholder assistant turn marked
            # incomplete so if the request dies (refresh / server crash) the
            # frontend can render an "(interrupted)" pill on reload. The
            # placeholder gets overwritten by finalize_pending_assistant on
            # successful completion.
            pending_id = f"pa-{int(time.time()*1000)}-{secrets.token_hex(4)}"
            chat_history.save_pending_assistant_stub(pending_id)

            emit("status", {"state": "thinking"})
            if agent_override != "code":
                a._sync_expression("thinking")

            if agent_override == "code":
                emit("agent_ack", {"text": "I'm on it! The Code Agent is investigating your request.", "agent": "code"})
                emit("agent_progress", {"agent": "code", "label": "Analyzing request", "status": "running"})

            prev_model_override = agent.model_override
            if model_override and model_override != "auto":
                agent.model_override = model_override
                log.info(f"[chat] Model override: {model_override} (agent={agent_override or 'auto'})")
            else:
                agent.model_override = None

            # Code Agent runs in background so the user isn't blocked for minutes
            if agent_override == "code":
                sid = request.sid
                captured_pending = pending_id

                def _code_agent_task():
                    try:
                        result = agent.chat(message, speaker=speaker, agent_override=agent_override, client_timezone=client_tz)
                        if model_override and model_override != "auto":
                            agent.model_override = prev_model_override
                        _finish_chat_response(sid, result, model_override, voice, speaker, pending_id=captured_pending)
                    except Exception as e:
                        log.exception("[chat] Code Agent error")
                        import traceback
                        traceback.print_exc()
                        with a.app.app_context():
                            socketio.emit(
                                "chat_response",
                                {"text": f"Oops! BMO's brain got fuzzy: {e}", "speaker": speaker, "commands_executed": []},
                                room=sid,
                            )
                        # Code Agent: no OLED expression change on error
                    finally:
                        if model_override and model_override != "auto":
                            agent.model_override = prev_model_override

                threading.Thread(target=_code_agent_task, daemon=True).start()
                return  # Handler exits; response will be emitted when the task completes

            # Non-Code-Agent: run synchronously
            result = agent.chat(message, speaker=speaker, agent_override=agent_override, client_timezone=client_tz)

            if model_override and model_override != "auto":
                agent.model_override = prev_model_override

            _finish_chat_response(request.sid, result, model_override, voice, speaker, pending_id=pending_id)
        except Exception as e:
            log.exception("[chat] ERROR in chat_message handler")
            import traceback
            traceback.print_exc()
            emit("chat_response", {"text": f"Oops! BMO's brain got fuzzy: {e}", "speaker": speaker, "commands_executed": []})
            if agent_override != "code":
                a._sync_expression("error")
            # Round 2 N: error path doesn't finalize the stub; the (interrupted)
            # marker will surface on next history load, which is correct UX
            # signaling that the request didn't produce a clean reply.

    # QA #3: Plan-mode Approve / Reject sent literal "yes"/"no" as chat_message
    # turns, polluting history + persona memory. These dedicated events route the
    # decision through the agent's plan controller without persisting a user turn.
    @socketio.on("plan_approve")
    def on_plan_approve(data):
        """User approved the current plan — resume plan execution WITHOUT writing a chat turn."""
        from flask_socketio import emit
        a = _app()
        agent = a.agent
        if not agent:
            return
        log.info("[plan] user approved plan")
        sid = request.sid
        client_tz = a._normalize_timezone((data or {}).get("client_timezone")) or a._pi_timezone()
        try:
            result = agent.chat("yes", speaker="system", client_timezone=client_tz)
            _finish_chat_response(sid, result, None, a.voice, "system")
        except Exception as e:
            log.exception("[plan] approve failed")
            emit("chat_response", {"text": f"Plan resume failed: {e}", "speaker": "system", "commands_executed": []})

    @socketio.on("plan_reject")
    def on_plan_reject(data):
        """User rejected the current plan — abort planning WITHOUT writing a chat turn."""
        from flask_socketio import emit
        a = _app()
        agent = a.agent
        if not agent:
            return
        log.info("[plan] user rejected plan")
        sid = request.sid
        client_tz = a._normalize_timezone((data or {}).get("client_timezone")) or a._pi_timezone()
        try:
            result = agent.chat("no", speaker="system", client_timezone=client_tz)
            _finish_chat_response(sid, result, None, a.voice, "system")
        except Exception as e:
            log.exception("[plan] reject failed")
            emit("chat_response", {"text": f"Plan reject failed: {e}", "speaker": "system", "commands_executed": []})

    @socketio.on("client_timezone")
    def on_client_timezone(data):
        a = _app()
        if not a.timers:
            return
        client_tz = a._normalize_timezone((data or {}).get("client_timezone")) if isinstance(data, dict) else None
        client_tz = client_tz or a._pi_timezone()
        a.timers.set_client_timezone(request.sid, client_tz)
        socketio.emit("timers_tick", a.timers.get_all(viewer_timezone=client_tz), room=request.sid)

    @socketio.on("scratchpad_read")
    def on_scratchpad_read(data):
        """Read scratchpad sections for the web UI."""
        from flask_socketio import emit
        agent = _app().agent
        if agent and agent.orchestrator:
            sections = agent.orchestrator.scratchpad.to_dict()
            emit("scratchpad_update", sections)

    @socketio.on("scratchpad_write")
    def on_scratchpad_write(data):
        """Write to scratchpad from the web UI."""
        from flask_socketio import emit
        agent = _app().agent
        if agent and agent.orchestrator:
            section = data.get("section", "Notes")
            content = data.get("content", "")
            append = data.get("append", False)
            agent.orchestrator.scratchpad.write(section, content, append)
            emit("scratchpad_update", agent.orchestrator.scratchpad.to_dict())

    @socketio.on("scratchpad_clear")
    def on_scratchpad_clear(data):
        """Clear scratchpad section(s) from the web UI."""
        from flask_socketio import emit
        agent = _app().agent
        if agent and agent.orchestrator:
            section = data.get("section")  # None = clear all
            agent.orchestrator.scratchpad.clear(section)
            emit("scratchpad_update", agent.orchestrator.scratchpad.to_dict())

    @socketio.on("disconnect")
    def on_disconnect():
        from routes.ide import cleanup_client_session
        a = _app()
        log.info("[ws] Client disconnected")
        if a.timers:
            a.timers.clear_client(request.sid)
        # IDE owns its own per-client state (terminal + Windows-proxy).
        cleanup_client_session(request.sid)
