"""PHASE-20 20C — loopback control server inside the bmo-dm-bot process.

The DM bot runs as its own systemd unit, so Flask (the `bmo` unit) cannot reach
the live bot via the old in-process `get_dm_bot()` singleton (F1 — the bridge was
dead by topology). This aiohttp app, bound to 127.0.0.1 only, gives the bot
process an HTTP control plane that `app.py`'s `/api/discord/dm/*` routes proxy to.
Trust boundary = the Pi box (loopback), same as the old in-process call.

Build the app with `build_control_app(bot)` (testable without binding a port);
serve it with `start_control_server(bot)`.
"""

import asyncio
import os
from datetime import datetime, timezone

from aiohttp import web
from discord.ext import commands

# Typed aiohttp app key (replaces the plain-string bot key; silences NotAppKeyWarning).
BOT_KEY = web.AppKey("bot", commands.Bot)

from agents import vtt_sync
from agents.vtt_sync import request_vtt_state, validate_sync_config, vtt_state
from bots.discord_dm_bot import (
    DUNGEON_CHANNEL_NAME,
    _candidate_guilds,
    _generate_recap,
    _log,
)

CONTROL_PORT = int(os.environ.get("DM_BOT_CONTROL_PORT", "5006"))

# Idempotency: bounded, insertion-ordered set of seen narrate event_ids (F4),
# mirroring the Pi→VTT dedup in dnd-app/src/main/bmo-bridge.ts.
_RECENT_EVENT_IDS: list[str] = []
_RECENT_EVENT_SET: set[str] = set()
_EVENT_CAP = 500


def _seen_event(event_id: str | None) -> bool:
    """True if this event_id was already processed; registers new ones."""
    if not event_id:
        return False
    if event_id in _RECENT_EVENT_SET:
        return True
    _RECENT_EVENT_IDS.append(event_id)
    _RECENT_EVENT_SET.add(event_id)
    if len(_RECENT_EVENT_IDS) > _EVENT_CAP:
        old = _RECENT_EVENT_IDS.pop(0)
        _RECENT_EVENT_SET.discard(old)
    return False


async def _json(request: web.Request) -> dict:
    try:
        return await request.json()
    except Exception:
        return {}


async def _handle_start(request: web.Request) -> web.Response:
    bot = request.app[BOT_KEY]
    if bot.session.active:
        return web.json_response({"error": "session_active"}, status=409)
    body = await _json(request)
    campaign_id = body.get("campaign_id") or "vtt_campaign"

    channel = None
    for guild in _candidate_guilds(bot):
        ch = await bot.find_dungeon_channel(guild)
        if ch:
            channel = ch
            break
    if channel is None:
        return web.json_response(
            {"error": "channel_not_found", "channel": DUNGEON_CHANNEL_NAME}, status=404
        )

    vc, reason = await bot.join_voice(channel)
    if vc is None:
        return web.json_response({"error": "join_failed", "reason": reason}, status=502)

    # Full parity with the slash /dm start (F7): clear initiative too, and give
    # the session a usable text channel — the VC's own chat — so Discord players
    # typing get DM responses during VTT-driven sessions.
    bot.session.active = True
    bot.session.start_time = datetime.now(timezone.utc)
    bot.session.messages.clear()
    bot.session.combat_log.clear()
    bot.session.initiative_order.clear()
    bot.session.initiative_round = 0
    bot.session.text_channel_id = int(body.get("text_channel_id") or channel.id)

    if bot._campaign_memory:
        try:
            bot._campaign_name = campaign_id
            bot._session_id = bot._campaign_memory.start_session(campaign_id)
        except Exception as e:
            _log("Campaign memory start failed: %s", e)

    for member in channel.members:
        if not getattr(member, "bot", False):
            bot.session.players.add(member.display_name)

    await bot.start_voice_listen()
    # PHASE-22 22B: pull the VTT's current state on session start (blocking
    # requests.get → worker thread, never the loop). No-op when sync is disabled.
    asyncio.create_task(asyncio.to_thread(request_vtt_state))
    bot.queue_narration(
        "BMO is ready to be your Dungeon Master! The adventure begins!", emotion="excited"
    )
    return web.json_response({
        "ok": True,
        "campaign_id": campaign_id,
        "guild_id": channel.guild.id,
        "voice_channel_id": channel.id,
        "text_channel_id": bot.session.text_channel_id,
    })


async def _handle_stop(request: web.Request) -> web.Response:
    bot = request.app[BOT_KEY]
    if bot._stopping:
        return web.json_response({"ok": True, "already_stopping": True})
    if not bot.session.active:
        return web.json_response({"error": "no_session"}, status=404)
    bot._stopping = True
    try:
        try:
            recap = await asyncio.wait_for(_generate_recap(bot.session), timeout=10)
        except (asyncio.TimeoutError, Exception):
            recap = ""
        if bot._campaign_memory and bot._session_id and recap:
            try:
                bot._campaign_memory.end_session(bot._session_id, recap)
            except Exception as e:
                _log("Campaign memory end failed: %s", e)
        # Farewell synthesized DIRECTLY (not queued) so it plays before we leave —
        # session.reset() drains the queue, so a queued farewell would be lost.
        # Bounded so the whole handler stays under the VTT's 15s abort (F4).
        try:
            await asyncio.wait_for(bot._synthesize_and_play(
                "The adventure concludes for now. Until next time, friends!", None, "happy"
            ), timeout=4)
        except (asyncio.TimeoutError, Exception):
            pass
        await bot.leave_voice()
        bot._last_session_end = {
            "reason": "stopped",
            "at": datetime.now(timezone.utc).isoformat(),
            "recap": recap,
        }
        bot.session.reset()
        bot._campaign_name = None
        bot._session_id = None
        bot._initiative_message = None  # 22B: reset the live initiative tracker
        return web.json_response({"ok": True, "recap": recap})
    finally:
        bot._stopping = False


async def _handle_narrate(request: web.Request) -> web.Response:
    bot = request.app[BOT_KEY]
    body = await _json(request)
    text = body.get("text")
    if not text:
        return web.json_response({"error": "no_text"}, status=400)
    if _seen_event(body.get("event_id")):
        return web.json_response({"ok": True, "result": "duplicate"})
    # PHASE-21 21B (F7): barge-in — cut stale narration before enqueueing the new one.
    if body.get("interrupt"):
        await bot.cancel_narration(flush=True)
    result = bot.queue_narration(
        text, body.get("npc"), body.get("emotion"), speaker=body.get("speaker")
    )
    # Always HTTP 200 — the body's `result` is the truth channel; a non-2xx would
    # make the VTT client retry, double-speaking once the cooldown lapses (F4).
    return web.json_response({"ok": result == "queued", "result": result})


async def _handle_narrate_cancel(request: web.Request) -> web.Response:
    """PHASE-21 21B (F7): flush the queue + stop current playback. Idempotent."""
    bot = request.app[BOT_KEY]
    result = await bot.cancel_narration(flush=True)
    return web.json_response({"ok": True, **result})


# ── PHASE-22 22B: VTT→Pi state sync (lands in the BOT process, not Flask) ──


async def _handle_sync_initiative(request: web.Request) -> web.Response:
    """Cache the VTT's initiative + (if a live session) edit the Discord embed."""
    bot = request.app[BOT_KEY]
    body = await _json(request)
    vtt_state.update_initiative(body)
    if bot.session.active and bot.session.text_channel_id:
        asyncio.create_task(bot.post_initiative_embed())
    return web.json_response({"ok": True})


async def _handle_sync_state(request: web.Request) -> web.Response:
    """Cache the VTT's condensed game state (consumed in the DM prompt, 22B)."""
    bot = request.app[BOT_KEY]
    body = await _json(request)
    vtt_state.update_game_state(body)
    return web.json_response({"ok": True})


def _state_age_s() -> float | None:
    if vtt_state.last_updated is None:
        return None
    return (datetime.now() - vtt_state.last_updated).total_seconds()


async def _handle_status(request: web.Request) -> web.Response:
    bot = request.app[BOT_KEY]
    s = bot.session
    vc = s.voice_client
    return web.json_response({
        "running": True,
        "active": s.active,
        "players": sorted(s.players) if s.players else [],
        "start_time": s.start_time.isoformat() if s.start_time else None,
        "message_count": len(s.messages),
        "combat_log_count": len(s.combat_log),
        "initiative_round": s.initiative_round,
        "initiative_order": [
            {"name": e.get("name"), "total": e.get("total")} for e in s.initiative_order
        ],
        "voice_connected": bool(vc and vc.is_connected()),
        "voice_channel_id": s.voice_channel_id,
        "queue_len": s.narration_queue.qsize(),
        "last_narration_status": s.last_narration_status,
        "last_session_end": bot._last_session_end,
        # 22B: read-only sync status — never a blocking health probe.
        "vtt_sync": {
            **validate_sync_config(),
            "last_push": vtt_sync.last_push,
            "has_initiative": vtt_state.initiative is not None,
            "has_game_state": vtt_state.game_state is not None,
            "state_age_s": _state_age_s(),
        },
    })


async def _handle_recap(request: web.Request) -> web.Response:
    """PHASE-31 31E — recap of the ACTIVE session WITHOUT ending it, or the most recent
    stored summary (``?mode=last``). Live mode is a billable LLM call, so the coroutine is
    cancelled on timeout (never left running — F6) and the client must not retry."""
    bot = request.app[BOT_KEY]
    mode = request.query.get("mode", "live")

    if mode == "last":
        if not bot._campaign_memory:
            return web.json_response({"error": "no_campaign_memory"}, status=404)
        campaign = request.query.get("campaign") or bot._campaign_name or "vtt_campaign"
        try:
            sessions = bot._campaign_memory.get_recent_sessions(campaign, limit=1)
        except Exception as e:
            _log("recap(last) failed: %s", e)
            sessions = []
        if not sessions:
            return web.json_response({"error": "no_sessions"}, status=404)
        s = sessions[0]
        return web.json_response({
            "ok": True,
            "recap": s.get("summary") or "",
            "session_id": s.get("id"),
            "ended_at": s.get("ended_at"),
        })

    # live
    if not bot.session.active:
        return web.json_response({"error": "no_session"}, status=404)
    if not bot.session.combat_log:
        return web.json_response({"ok": True, "recap": ""})  # matches _generate_recap's empty-log contract
    try:
        # asyncio.wait_for cancels the coroutine on timeout — no orphaned LLM call.
        recap = await asyncio.wait_for(_generate_recap(bot.session), timeout=45)
    except asyncio.TimeoutError:
        return web.json_response({"error": "recap_timeout"}, status=504)
    except Exception as e:
        _log("recap(live) failed: %s", e)
        return web.json_response({"error": "recap_failed"}, status=500)
    return web.json_response({"ok": True, "recap": recap})


# ── PHASE-36 36C: play-by-post control routes ────────────────────
async def _handle_pbp_start(request: web.Request) -> web.Response:
    bot = request.app[BOT_KEY]
    body = await _json(request)
    if not body.get("campaign_id") or not body.get("scene") or not body.get("participants"):
        return web.json_response({"error": "missing_fields"}, status=400)
    result = await bot.pbp.start(
        body["campaign_id"], body["scene"], body["participants"],
        body.get("channel_id"), body.get("reminder_hours", 24.0), bool(body.get("auto_skip", False)),
    )
    if result.get("ok"):
        return web.json_response(result, status=200)
    code = result.get("error")
    status = {"channel_not_found": 404, "already_active": 409}.get(code, 400)
    return web.json_response(result, status=status)


async def _handle_pbp_advance(request: web.Request) -> web.Response:
    bot = request.app[BOT_KEY]
    body = await _json(request)
    if not body.get("campaign_id") or not body.get("event_id"):
        return web.json_response({"error": "missing_fields"}, status=400)
    result = await bot.pbp.advance(
        body["campaign_id"], body["event_id"],
        expected_turn_index=body.get("expected_turn_index"), excerpt=body.get("excerpt"),
    )
    if result.get("error") == "not_active":
        return web.json_response(result, status=404)
    # advanced / duplicate / stale_turn all return HTTP 200 — the body is the truth channel
    # (a 4xx/5xx would trigger the VTT's retry, which can't fix a semantic stale-turn anyway).
    return web.json_response(result, status=200)


async def _handle_pbp_skip(request: web.Request) -> web.Response:
    bot = request.app[BOT_KEY]
    body = await _json(request)
    if not body.get("campaign_id") or not body.get("event_id"):
        return web.json_response({"error": "missing_fields"}, status=400)
    result = await bot.pbp.advance(
        body["campaign_id"], body["event_id"],
        expected_turn_index=body.get("expected_turn_index"), reason="skip",
    )
    if result.get("error") == "not_active":
        return web.json_response(result, status=404)
    return web.json_response(result, status=200)


async def _handle_pbp_scene(request: web.Request) -> web.Response:
    bot = request.app[BOT_KEY]
    body = await _json(request)
    if not body.get("campaign_id") or not body.get("scene"):
        return web.json_response({"error": "missing_fields"}, status=400)
    result = await bot.pbp.set_scene(body["campaign_id"], body["scene"], participants=body.get("participants"))
    if result.get("error") == "not_active":
        return web.json_response(result, status=404)
    if not result.get("ok"):
        return web.json_response(result, status=400)
    return web.json_response(result, status=200)


async def _handle_pbp_stop(request: web.Request) -> web.Response:
    bot = request.app[BOT_KEY]
    body = await _json(request)
    if not body.get("campaign_id"):
        return web.json_response({"error": "missing_fields"}, status=400)
    result = await bot.pbp.stop(body["campaign_id"])
    return web.json_response(result, status=200)  # idempotent


async def _handle_pbp_status(request: web.Request) -> web.Response:
    bot = request.app[BOT_KEY]
    campaign_id = request.query.get("campaign_id")
    if not campaign_id:
        return web.json_response({"error": "missing_fields"}, status=400)
    return web.json_response(bot.pbp.status(campaign_id), status=200)


def build_control_app(bot) -> web.Application:
    """Build the control aiohttp app for `bot` (no port binding — testable)."""
    app = web.Application()
    app[BOT_KEY] = bot
    app.router.add_post("/control/start", _handle_start)
    app.router.add_post("/control/stop", _handle_stop)
    app.router.add_post("/control/narrate", _handle_narrate)
    app.router.add_post("/control/narrate/cancel", _handle_narrate_cancel)
    app.router.add_post("/control/sync/initiative", _handle_sync_initiative)
    app.router.add_post("/control/sync/state", _handle_sync_state)
    app.router.add_get("/control/status", _handle_status)
    app.router.add_get("/control/recap", _handle_recap)
    # PHASE-36 36C: play-by-post
    app.router.add_post("/control/pbp/start", _handle_pbp_start)
    app.router.add_post("/control/pbp/advance", _handle_pbp_advance)
    app.router.add_post("/control/pbp/skip", _handle_pbp_skip)
    app.router.add_post("/control/pbp/scene", _handle_pbp_scene)
    app.router.add_post("/control/pbp/stop", _handle_pbp_stop)
    app.router.add_get("/control/pbp/status", _handle_pbp_status)
    return app


async def start_control_server(bot) -> web.AppRunner:
    """Serve the control app on 127.0.0.1:CONTROL_PORT; return the runner."""
    app = build_control_app(bot)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", CONTROL_PORT)
    await site.start()
    _log("Control server listening on 127.0.0.1:%d", CONTROL_PORT)
    return runner
