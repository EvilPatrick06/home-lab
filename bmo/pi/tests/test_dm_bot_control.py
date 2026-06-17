"""PHASE-20 — DM-bot control plane + bot-hygiene fixes.

20A covered here: `_log` accepts exc_info without raising (F9); find_dungeon_channel
honors the numeric-ID override (F8); join_voice returns (vc, reason) and reports
the failure reason on a raising connect (F8). Later sub-phases (20B–20E) extend
this file. Hardware-free (conftest mocks); pytest.ini sets asyncio_mode=auto.
"""

import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

for _mod in ("vlc", "pychromecast", "androidtvremote2", "spidev"):
    sys.modules.setdefault(_mod, MagicMock())

import bots.discord_dm_bot as dm
from bots.discord_dm_bot import (
    DMBot,
    _candidate_guilds,
    _format_initiative_order,
    _log,
    _roll_cmd,
    _try_push,
    _upsert_initiative,
)


@pytest.fixture()
def dm_bot():
    return DMBot()


# ── 20A: _log exc_info (F9) ─────────────────────────────────────────

def test_log_accepts_exc_info_without_raising(capsys):
    # on_app_command_error calls _log(..., exc_info=error) — must not TypeError.
    _log("Command /%s failed: %s", "roll", ValueError("boom"), exc_info=ValueError("boom"))
    out = capsys.readouterr().out
    assert "Command /roll failed" in out
    assert "ValueError" in out  # traceback appended


# ── 20A: find_dungeon_channel ID override (F8) ──────────────────────

async def test_find_dungeon_channel_honors_id_override(dm_bot, monkeypatch):
    import discord
    target = MagicMock(spec=discord.VoiceChannel)
    guild = MagicMock()
    guild.get_channel = MagicMock(return_value=target)
    guild.voice_channels = []
    monkeypatch.setattr(dm, "DUNGEON_CHANNEL_ID", "12345")
    found = await dm_bot.find_dungeon_channel(guild)
    assert found is target
    guild.get_channel.assert_called_once_with(12345)


async def test_find_dungeon_channel_falls_back_to_name(dm_bot, monkeypatch):
    monkeypatch.setattr(dm, "DUNGEON_CHANNEL_ID", "")
    monkeypatch.setattr(dm, "DUNGEON_CHANNEL_NAME", "Dungeon")
    match = MagicMock(); match.name = "Dungeon"
    other = MagicMock(); other.name = "General"
    guild = MagicMock(); guild.voice_channels = [other, match]
    assert (await dm_bot.find_dungeon_channel(guild)) is match


# ── 20A: join_voice failure reason (F8) ─────────────────────────────

async def test_join_voice_returns_reason_on_failure(dm_bot):
    channel = MagicMock()
    channel.connect = AsyncMock(side_effect=RuntimeError("already connected"))
    vc, reason = await dm_bot.join_voice(channel)
    assert vc is None
    assert "RuntimeError" in reason and "already connected" in reason


async def test_join_voice_returns_vc_on_success(dm_bot):
    channel = MagicMock(); channel.id = 99
    fake_vc = MagicMock()
    channel.connect = AsyncMock(return_value=fake_vc)
    vc, reason = await dm_bot.join_voice(channel)
    assert vc is fake_vc and reason is None
    assert dm_bot.session.voice_channel_id == 99


# ── 20A: _candidate_guilds (F8) ─────────────────────────────────────

def test_candidate_guilds_all_when_no_guild_id():
    bot = MagicMock(); bot._guild_id = None; bot.guilds = ["g1", "g2"]
    assert _candidate_guilds(bot) == ["g1", "g2"]


def test_candidate_guilds_scopes_to_configured_guild():
    bot = MagicMock(); bot._guild_id = 7
    bot.get_guild = MagicMock(return_value="only")
    assert _candidate_guilds(bot) == ["only"]
    bot.get_guild.assert_called_once_with(7)


# ── 20B: queue_narration statuses + FIFO worker (F3/F4) ─────────────

def _connected_vc():
    vc = MagicMock(); vc.is_connected = MagicMock(return_value=True)
    return vc


def test_queue_narration_no_voice(dm_bot):
    dm_bot.session.voice_client = None
    assert dm_bot.queue_narration("hi") == "no_voice"


def test_queue_narration_queued(dm_bot):
    dm_bot.session.voice_client = _connected_vc()
    assert dm_bot.queue_narration("hi", npc="goblin", emotion="angry") == "queued"
    assert dm_bot.session.narration_queue.qsize() == 1


def test_queue_narration_dropped_when_full(dm_bot):
    dm_bot.session.voice_client = _connected_vc()
    for _ in range(20):
        dm_bot.session.narration_queue.put_nowait(("x", None, None))
    assert dm_bot.queue_narration("overflow") == "dropped_queue_full"


async def test_narration_worker_consumes_fifo(dm_bot, monkeypatch):
    import asyncio
    dm_bot.session.voice_client = _connected_vc()
    spoken = []
    async def fake_play(text, npc, emotion, speaker=None):
        spoken.append(text)
        return "spoken"
    monkeypatch.setattr(dm_bot, "_synthesize_and_play", fake_play)
    dm_bot.queue_narration("first")
    dm_bot.queue_narration("second")
    worker = asyncio.create_task(dm_bot._narration_worker())
    await asyncio.wait_for(dm_bot.session.narration_queue.join(), timeout=2)
    worker.cancel()
    assert spoken == ["first", "second"]
    assert dm_bot.session.last_narration_status == "spoken"


# ── 20C: control HTTP app (F1/F4/F7/F8) ─────────────────────────────

import bots.dm_bot_control as ctrl
from aiohttp.test_utils import TestClient, TestServer


def _vc(connected=True):
    vc = MagicMock(); vc.is_connected = MagicMock(return_value=connected)
    vc.is_playing = MagicMock(return_value=False)
    return vc


async def _client(bot):
    server = TestServer(ctrl.build_control_app(bot))
    client = TestClient(server)
    await client.start_server()
    return client


def _start_bot(monkeypatch):
    """A DMBot wired for a successful /control/start (channel + join mocked)."""
    bot = DMBot()
    bot._campaign_memory = None
    channel = MagicMock(); channel.id = 4242; channel.members = []
    channel.guild = MagicMock(); channel.guild.id = 99
    monkeypatch.setattr(bot, "find_dungeon_channel", AsyncMock(return_value=channel))
    monkeypatch.setattr(bot, "join_voice", AsyncMock(return_value=(_vc(), None)))
    monkeypatch.setattr(bot, "start_voice_listen", AsyncMock())
    monkeypatch.setattr(bot, "_candidate_guilds_value", [MagicMock()], raising=False)
    monkeypatch.setattr(ctrl, "_candidate_guilds", lambda b: [MagicMock()])
    return bot


async def test_control_start_parity(monkeypatch):
    bot = _start_bot(monkeypatch)
    bot.session.initiative_order.append({"name": "stale", "total": 1})
    bot.session.initiative_round = 5
    client = await _client(bot)
    try:
        resp = await client.post("/control/start", json={})
        body = await resp.json()
        assert resp.status == 200 and body["ok"] is True
        assert bot.session.active is True
        assert bot.session.initiative_order == []        # F7: cleared
        assert bot.session.initiative_round == 0
        assert bot.session.text_channel_id == 4242        # F7: VC chat
        assert body["voice_channel_id"] == 4242
    finally:
        await client.close()


async def test_control_start_channel_not_found(monkeypatch):
    bot = DMBot()
    monkeypatch.setattr(ctrl, "_candidate_guilds", lambda b: [MagicMock()])
    monkeypatch.setattr(bot, "find_dungeon_channel", AsyncMock(return_value=None))
    client = await _client(bot)
    try:
        resp = await client.post("/control/start", json={})
        assert resp.status == 404 and (await resp.json())["error"] == "channel_not_found"
    finally:
        await client.close()


async def test_control_start_join_failed(monkeypatch):
    bot = DMBot()
    channel = MagicMock()
    monkeypatch.setattr(ctrl, "_candidate_guilds", lambda b: [MagicMock()])
    monkeypatch.setattr(bot, "find_dungeon_channel", AsyncMock(return_value=channel))
    monkeypatch.setattr(bot, "join_voice", AsyncMock(return_value=(None, "RuntimeError: nope")))
    client = await _client(bot)
    try:
        resp = await client.post("/control/start", json={})
        body = await resp.json()
        assert resp.status == 502 and body["error"] == "join_failed" and "nope" in body["reason"]
    finally:
        await client.close()


async def test_control_start_session_active(monkeypatch):
    bot = DMBot(); bot.session.active = True
    client = await _client(bot)
    try:
        resp = await client.post("/control/start", json={})
        assert resp.status == 409 and (await resp.json())["error"] == "session_active"
    finally:
        await client.close()


async def test_control_narrate_duplicate_event_id(monkeypatch):
    bot = DMBot(); bot.session.voice_client = _vc()
    monkeypatch.setattr(ctrl, "_RECENT_EVENT_IDS", []); monkeypatch.setattr(ctrl, "_RECENT_EVENT_SET", set())
    client = await _client(bot)
    try:
        r1 = await client.post("/control/narrate", json={"text": "hi", "event_id": "e1"})
        assert (await r1.json())["result"] == "queued"
        depth = bot.session.narration_queue.qsize()
        r2 = await client.post("/control/narrate", json={"text": "hi", "event_id": "e1"})
        assert (await r2.json())["result"] == "duplicate"
        assert bot.session.narration_queue.qsize() == depth  # not re-queued
    finally:
        await client.close()


async def test_control_narrate_no_voice_is_ok_false(monkeypatch):
    bot = DMBot(); bot.session.voice_client = None
    client = await _client(bot)
    try:
        resp = await client.post("/control/narrate", json={"text": "hi"})
        body = await resp.json()
        assert resp.status == 200 and body["ok"] is False and body["result"] == "no_voice"
    finally:
        await client.close()


async def test_control_stop_idempotent(monkeypatch):
    bot = DMBot(); bot.session.active = True; bot._stopping = True
    client = await _client(bot)
    try:
        resp = await client.post("/control/stop", json={})
        body = await resp.json()
        assert resp.status == 200 and body.get("already_stopping") is True
    finally:
        await client.close()


async def test_control_narrate_interrupt_cancels_first(monkeypatch):
    """PHASE-21 21B: interrupt=true fires cancel_narration before enqueueing."""
    bot = DMBot(); bot.session.voice_client = _vc()
    monkeypatch.setattr(ctrl, "_RECENT_EVENT_IDS", []); monkeypatch.setattr(ctrl, "_RECENT_EVENT_SET", set())
    cancelled = []

    async def fake_cancel(flush=True):
        cancelled.append(flush)
        return {"cancelled": True, "flushed": 0}

    monkeypatch.setattr(bot, "cancel_narration", fake_cancel)
    client = await _client(bot)
    try:
        r = await client.post("/control/narrate", json={"text": "hi", "interrupt": True})
        assert (await r.json())["result"] == "queued"
        assert cancelled == [True]  # cancelled before enqueue
    finally:
        await client.close()


async def test_control_narrate_cancel_route(monkeypatch):
    """PHASE-21 21B: /control/narrate/cancel flushes the queue and reports counts."""
    bot = DMBot(); bot.session.voice_client = _vc()
    bot.queue_narration("a"); bot.queue_narration("b")
    client = await _client(bot)
    try:
        r = await client.post("/control/narrate/cancel", json={})
        body = await r.json()
        assert r.status == 200 and body["ok"] is True
        assert body["flushed"] == 2 and body["cancelled"] is True
        assert bot.session.narration_queue.qsize() == 0
    finally:
        await client.close()


async def test_control_status_shape(monkeypatch):
    bot = DMBot(); bot.session.active = True; bot.session.voice_client = _vc()
    bot.session.initiative_order.append({"name": "A", "total": 17})
    client = await _client(bot)
    try:
        resp = await client.get("/control/status")
        body = await resp.json()
        assert body["voice_connected"] is True
        assert body["queue_len"] == 0
        assert body["initiative_order"] == [{"name": "A", "total": 17}]
    finally:
        await client.close()


# ── 20D: voice-health rejoin + auto-leave parity (F10/F11) ──────────

async def test_voice_health_tick_rejoins_on_drop(monkeypatch):
    bot = DMBot(); bot.session.active = True
    dropped = MagicMock(); dropped.is_connected = MagicMock(return_value=False)
    dropped.disconnect = AsyncMock()
    bot.session.voice_client = dropped

    async def fake_listen():
        good = MagicMock(); good.is_connected = MagicMock(return_value=True)
        bot.session.voice_client = good
    monkeypatch.setattr(bot, "start_voice_listen", AsyncMock(side_effect=fake_listen))

    assert await bot._voice_health_tick() is True
    bot.start_voice_listen.assert_awaited_once()
    dropped.disconnect.assert_awaited_once()


async def test_voice_health_tick_noop_when_no_session(monkeypatch):
    bot = DMBot(); bot.session.active = False
    monkeypatch.setattr(bot, "start_voice_listen", AsyncMock())
    assert await bot._voice_health_tick() is True
    bot.start_voice_listen.assert_not_awaited()


async def test_auto_leave_ends_session_with_trace(monkeypatch):
    import asyncio as _aio
    bot = DMBot(); bot.session.active = True
    vc = _vc(); vc.channel = MagicMock(); vc.channel.members = []
    bot.session.voice_client = vc
    mem = MagicMock(); bot._campaign_memory = mem; bot._session_id = 7
    monkeypatch.setattr(dm, "_generate_recap", AsyncMock(return_value="the recap"))
    monkeypatch.setattr(bot, "leave_voice", AsyncMock())
    monkeypatch.setattr(_aio, "sleep", AsyncMock())
    await bot._auto_leave_if_empty()
    assert bot.session.active is False                       # reset
    assert bot._last_session_end["reason"] == "auto_leave_empty"
    assert bot._last_session_end["recap"] == "the recap"
    mem.end_session.assert_called_once_with(7, "the recap")


async def test_auto_leave_skips_when_stopping(monkeypatch):
    import asyncio as _aio
    bot = DMBot(); bot.session.active = True; bot._stopping = True
    vc = _vc(); vc.channel = MagicMock(); vc.channel.members = []
    bot.session.voice_client = vc
    monkeypatch.setattr(bot, "leave_voice", AsyncMock())
    monkeypatch.setattr(_aio, "sleep", AsyncMock())
    await bot._auto_leave_if_empty()
    bot.leave_voice.assert_not_awaited()                     # bailed on _stopping


# ── 20E: initiative tracking (F12) ──────────────────────────────────

def test_upsert_initiative_records_and_sorts():
    s = DMBot().session
    _upsert_initiative(s, "Aria", 12)
    _upsert_initiative(s, "Borg", 17)
    assert [e["name"] for e in s.initiative_order] == ["Borg", "Aria"]  # desc by total


def test_upsert_initiative_replaces_same_player():
    s = DMBot().session
    _upsert_initiative(s, "Aria", 5)
    _upsert_initiative(s, "Aria", 20)  # re-roll
    assert s.initiative_order == [{"name": "Aria", "total": 20}]  # replaced, not duplicated


def test_format_initiative_order():
    assert _format_initiative_order([]) == "No rolls yet"
    out = _format_initiative_order([{"name": "Borg", "total": 17}, {"name": "Aria", "total": 12}])
    assert out == "1. Borg — 17\n2. Aria — 12"


# ── 22B: VTT→Pi state sync through the control plane ─────────────────

import datetime as _dt

from agents import vtt_sync as _vs


def _reset_vtt_state():
    _vs.vtt_state.initiative = None
    _vs.vtt_state.game_state = None
    _vs.vtt_state.last_updated = None


async def test_control_sync_initiative_updates_state(monkeypatch):
    _reset_vtt_state()
    bot = DMBot(); bot.session.active = False
    client = await _client(bot)
    try:
        body = {"entries": [{"entityName": "A", "entityType": "player", "isActive": True}], "currentIndex": 0, "round": 2}
        r = await client.post("/control/sync/initiative", json=body)
        assert (await r.json())["ok"] is True
        assert _vs.vtt_state.initiative == body
    finally:
        await client.close()


async def test_control_sync_initiative_schedules_embed_only_when_active(monkeypatch):
    import asyncio
    _reset_vtt_state()
    bot = DMBot()
    called = []

    async def fake_embed():
        called.append(1)

    monkeypatch.setattr(bot, "post_initiative_embed", fake_embed)
    body = {"entries": [{"entityName": "A", "entityType": "player", "isActive": True}], "currentIndex": 0, "round": 1}

    bot.session.active = False  # no session → no embed
    client = await _client(bot)
    try:
        await client.post("/control/sync/initiative", json=body)
        await asyncio.sleep(0)
        assert called == []
        bot.session.active = True; bot.session.text_channel_id = 42
        await client.post("/control/sync/initiative", json=body)
        await asyncio.sleep(0)
        assert called == [1]
    finally:
        await client.close()


async def test_control_sync_state_updates_state(monkeypatch):
    _reset_vtt_state()
    bot = DMBot()
    client = await _client(bot)
    try:
        r = await client.post("/control/sync/state", json={"mapName": "Cavern"})
        assert (await r.json())["ok"] is True
        assert _vs.vtt_state.game_state == {"mapName": "Cavern"}
    finally:
        await client.close()


async def test_post_initiative_embed_sends_then_edits(monkeypatch):
    _reset_vtt_state()
    _vs.vtt_state.initiative = {"entries": [{"entityName": "A", "entityType": "player"}], "currentIndex": 0, "round": 1}
    monkeypatch.setattr(dm.asyncio, "sleep", AsyncMock())  # no real spacing wait
    bot = DMBot(); bot.session.text_channel_id = 123
    msg = MagicMock(); msg.edit = AsyncMock()
    channel = MagicMock(); channel.send = AsyncMock(return_value=msg)
    monkeypatch.setattr(bot, "get_channel", lambda cid: channel)

    await bot.post_initiative_embed()
    channel.send.assert_awaited_once()  # first call sends
    await bot.post_initiative_embed()
    msg.edit.assert_awaited_once()      # subsequent calls edit the same message
    _reset_vtt_state()


async def test_control_status_has_vtt_sync_block_without_probe(monkeypatch):
    _reset_vtt_state()
    get = MagicMock()
    monkeypatch.setattr(_vs.requests, "get", get)
    bot = DMBot()
    client = await _client(bot)
    try:
        body = await (await client.get("/control/status")).json()
        assert "vtt_sync" in body
        assert set(body["vtt_sync"]) >= {
            "enabled", "url", "auth", "last_push", "has_initiative", "has_game_state", "state_age_s"
        }
        get.assert_not_called()  # status never probes the network
    finally:
        await client.close()


def test_vtt_state_context_fresh_then_stale(monkeypatch):
    _reset_vtt_state()
    bot = DMBot()
    _vs.vtt_state.game_state = {
        "mapName": "Cavern",
        "partyHp": [{"name": "Aria", "currentHP": 10, "maxHP": 12, "conditions": ["poisoned"]}],
    }
    _vs.vtt_state.last_updated = _dt.datetime.now()
    line = bot._vtt_state_context()
    assert line and "map=Cavern" in line and "Aria 10/12(poisoned)" in line
    _vs.vtt_state.last_updated = _dt.datetime.now() - _dt.timedelta(minutes=11)
    assert bot._vtt_state_context() is None
    _reset_vtt_state()


# ── 22C: bot event push wiring ──────────────────────────────────────


def _push_spies(monkeypatch):
    spies = {}
    for name in ("push_discord_message", "push_discord_roll", "push_player_join", "push_player_leave"):
        s = MagicMock()
        monkeypatch.setattr(f"bots.discord_dm_bot.{name}", s)
        spies[name] = s
    return spies


async def test_on_message_pushes_player_text(monkeypatch):
    spies = _push_spies(monkeypatch)
    bot = DMBot(); bot.session.active = True; bot.session.text_channel_id = 5
    monkeypatch.setattr(bot, "_handle_player_input", AsyncMock())
    monkeypatch.setattr(bot, "process_commands", AsyncMock())
    msg = MagicMock()
    msg.author.bot = False; msg.author.display_name = "alice"
    msg.channel.id = 5; msg.content = "I attack the goblin"
    await bot.on_message(msg)
    spies["push_discord_message"].assert_called_once_with("alice", "I attack the goblin")


async def test_handle_player_input_pushes_dm_reply(monkeypatch):
    _reset_vtt_state()
    spies = _push_spies(monkeypatch)
    bot = DMBot(); bot.session.active = True
    monkeypatch.setattr(dm, "cloud_chat", lambda *a, **k: "The goblin snarls and lunges.")
    channel = MagicMock(); channel.send = AsyncMock()
    await bot._handle_player_input("alice", "hi", channel)
    assert any(c.args[0] == "DM" for c in spies["push_discord_message"].call_args_list)


async def test_roll_pushes_when_active(monkeypatch):
    spies = _push_spies(monkeypatch)
    bot = DMBot(); bot.session.active = True
    interaction = MagicMock(); interaction.client = bot
    interaction.user.display_name = "bob"
    interaction.response.send_message = AsyncMock()
    await _roll_cmd.callback(interaction, "1d20")
    spies["push_discord_roll"].assert_called_once()
    assert spies["push_discord_roll"].call_args.args[0] == "bob"


async def test_roll_no_push_when_inactive(monkeypatch):
    spies = _push_spies(monkeypatch)
    bot = DMBot(); bot.session.active = False
    interaction = MagicMock(); interaction.client = bot
    interaction.user.display_name = "bob"
    interaction.response.send_message = AsyncMock()
    await _roll_cmd.callback(interaction, "1d20")
    spies["push_discord_roll"].assert_not_called()


async def test_voice_state_pushes_join_and_leave(monkeypatch):
    spies = _push_spies(monkeypatch)
    bot = DMBot(); bot.session.active = True; bot.session.voice_channel_id = 9
    bot.session.voice_client = None  # keep _auto_leave scheduling out of the way
    member = MagicMock(); member.bot = False; member.display_name = "carol"
    join_after = MagicMock(); join_after.channel = MagicMock(); join_after.channel.id = 9
    no_chan = MagicMock(); no_chan.channel = None
    await bot.on_voice_state_update(member, no_chan, join_after)
    spies["push_player_join"].assert_called_once_with("carol")
    leave_before = MagicMock(); leave_before.channel = MagicMock(); leave_before.channel.id = 9
    no_chan2 = MagicMock(); no_chan2.channel = None
    await bot.on_voice_state_update(member, leave_before, no_chan2)
    spies["push_player_leave"].assert_called_once_with("carol")


def test_try_push_swallows_errors():
    def boom(*_a):
        raise RuntimeError("sync down")

    _try_push(boom, "x")  # must not raise
