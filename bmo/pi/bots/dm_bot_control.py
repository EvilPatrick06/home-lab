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
    bot = request.app["bot"]
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
    bot = request.app["bot"]
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
        return web.json_response({"ok": True, "recap": recap})
    finally:
        bot._stopping = False


async def _handle_narrate(request: web.Request) -> web.Response:
    bot = request.app["bot"]
    body = await _json(request)
    text = body.get("text")
    if not text:
        return web.json_response({"error": "no_text"}, status=400)
    if _seen_event(body.get("event_id")):
        return web.json_response({"ok": True, "result": "duplicate"})
    result = bot.queue_narration(text, body.get("npc"), body.get("emotion"))
    # Always HTTP 200 — the body's `result` is the truth channel; a non-2xx would
    # make the VTT client retry, double-speaking once the cooldown lapses (F4).
    return web.json_response({"ok": result == "queued", "result": result})


async def _handle_status(request: web.Request) -> web.Response:
    bot = request.app["bot"]
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
    })


def build_control_app(bot) -> web.Application:
    """Build the control aiohttp app for `bot` (no port binding — testable)."""
    app = web.Application()
    app["bot"] = bot
    app.router.add_post("/control/start", _handle_start)
    app.router.add_post("/control/stop", _handle_stop)
    app.router.add_post("/control/narrate", _handle_narrate)
    app.router.add_get("/control/status", _handle_status)
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
