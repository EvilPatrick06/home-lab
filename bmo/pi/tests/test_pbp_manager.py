"""PHASE-36 36B — tests for PbpManager (pings, reminders, auto-skip) + /pbp commands.

Hardware-free: discord is real (venv dep), the bot/channel are MagicMocks with AsyncMock send.
pytest.ini sets asyncio_mode=auto, so async tests need no decorator.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import discord

from bots.pbp import PbpManager, pbp_done, pbp_skip
from services.pbp_store import PbpStore


def _channel(cid=42, name="play-by-post"):
    ch = MagicMock(spec=discord.TextChannel)
    ch.id = cid
    ch.name = name
    ch.send = AsyncMock()
    return ch


def _bot(channel=None, guilds=None):
    bot = MagicMock()
    bot._guild_id = None  # so _candidate_guilds returns bot.guilds
    bot.get_channel = MagicMock(return_value=channel)
    bot.guilds = guilds or []
    return bot


def _participants(n=3):
    return [{"name": f"P{i}", "character": f"Char{i}"} for i in range(n)]


def _mgr(tmp_path, channel=None, guilds=None):
    store = PbpStore(path=str(tmp_path / "pbp.json"))
    return PbpManager(_bot(channel, guilds), store=store), store


def test_resolve_channel_precedence(tmp_path):
    ch = _channel(cid=100)
    mgr, _ = _mgr(tmp_path, channel=ch)
    assert mgr.resolve_channel("100") is ch  # explicit id
    # name scan when no explicit/env id
    guild = MagicMock()
    guild.text_channels = [ch]
    mgr2, _ = _mgr(tmp_path, channel=None, guilds=[guild])
    assert mgr2.resolve_channel(None) is ch
    # nothing matches → None
    mgr3, _ = _mgr(tmp_path, channel=None, guilds=[])
    assert mgr3.resolve_channel(None) is None


async def test_announce_turn_mention_in_content_not_embed(tmp_path):
    ch = _channel()
    mgr, store = _mgr(tmp_path, channel=ch)
    store.start_session("c1", "Crypt", _participants(2), channel_id=str(ch.id))
    store.claim("c1", "P0", "111", "Alice")
    ch.send.reset_mock()
    ok = await mgr.announce_turn(store.get("c1"))
    assert ok
    kwargs = ch.send.call_args.kwargs
    assert "<@111>" in kwargs["content"]  # the ping lives in content
    # never in the embed
    embed_text = " ".join(f.value for f in kwargs["embed"].fields) + (kwargs["embed"].description or "")
    assert "<@111>" not in embed_text


async def test_announce_unclaimed_is_bold_no_ping(tmp_path):
    ch = _channel()
    mgr, store = _mgr(tmp_path, channel=ch)
    store.start_session("c1", "Crypt", _participants(2), channel_id=str(ch.id))  # nobody claimed
    ch.send.reset_mock()
    await mgr.announce_turn(store.get("c1"))
    content = ch.send.call_args.kwargs["content"]
    assert "**P0**" in content and "<@" not in content


async def test_start_paths(tmp_path):
    ch = _channel()
    mgr, store = _mgr(tmp_path, channel=ch)
    res = await mgr.start("c1", "Crypt", _participants(2), str(ch.id), 24.0, False)
    assert res["ok"] and store.get("c1")["active"]
    assert ch.send.await_count == 1  # kickoff
    res2 = await mgr.start("c1", "Again", _participants(2), str(ch.id), 24.0, False)
    assert res2 == {"ok": False, "error": "already_active"}
    # channel_not_found when nothing resolves
    mgr2, _ = _mgr(tmp_path, channel=None, guilds=[])
    res3 = await mgr2.start("c2", "X", _participants(2), None, 24.0, False)
    assert res3["ok"] is False and res3["error"] == "channel_not_found"


async def test_advance_announce_duplicate_stale(tmp_path):
    ch = _channel()
    mgr, store = _mgr(tmp_path, channel=ch)
    store.start_session("c1", "Crypt", _participants(3), channel_id=str(ch.id))
    ch.send.reset_mock()
    r = await mgr.advance("c1", "e1")
    assert r["result"] == "advanced" and ch.send.await_count == 1
    r2 = await mgr.advance("c1", "e1")  # duplicate
    assert r2["result"] == "duplicate" and ch.send.await_count == 1  # no second announce
    r3 = await mgr.advance("c1", "e2", expected_turn_index=0)  # stale (really at 1)
    assert r3["ok"] is False and r3["result"] == "stale_turn"


async def test_reminder_tick_single_reminder_then_silent(tmp_path):
    ch = _channel()
    mgr, store = _mgr(tmp_path, channel=ch)
    store.start_session("c1", "Crypt", _participants(2), channel_id=str(ch.id), reminder_hours=1.0)
    # Freeze the turn start 5h in the past (overdue for a 1h cadence).
    store._data["c1"]["turn_started_at"] = (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat()
    store._save()
    ch.send.reset_mock()
    await mgr.reminder_tick()
    assert ch.send.await_count == 1  # one reminder
    assert store.get("c1")["reminded_at"] is not None
    await mgr.reminder_tick()
    assert ch.send.await_count == 1  # no duplicate reminder


async def test_reminder_tick_auto_skip_at_2x(tmp_path):
    ch = _channel()
    mgr, store = _mgr(tmp_path, channel=ch)
    store.start_session("c1", "Crypt", _participants(2), channel_id=str(ch.id), reminder_hours=1.0, auto_skip=True)
    store._data["c1"]["turn_started_at"] = (datetime.now(timezone.utc) - timedelta(hours=3)).isoformat()  # > 2×
    store._save()
    await mgr.reminder_tick()
    sess = store.get("c1")
    assert sess["turn_index"] == 1  # advanced
    assert any(h["kind"] == "timeout_skip" for h in sess["history"])


async def test_reminder_tick_silent_when_not_overdue(tmp_path):
    ch = _channel()
    mgr, store = _mgr(tmp_path, channel=ch)
    store.start_session("c1", "Crypt", _participants(2), channel_id=str(ch.id), reminder_hours=24.0)
    ch.send.reset_mock()
    await mgr.reminder_tick()  # fresh turn, not overdue
    assert ch.send.await_count == 0


async def test_pbp_done_rejects_non_current_claimant(tmp_path):
    ch = _channel()
    mgr, store = _mgr(tmp_path, channel=ch)
    store.start_session("c1", "Crypt", _participants(2), channel_id=str(ch.id))
    store.claim("c1", "P0", "999", "Owner")  # current turn belongs to user 999
    bot = mgr.bot
    bot.pbp = mgr
    interaction = MagicMock()
    interaction.client = bot
    interaction.channel_id = ch.id
    interaction.user.id = 111  # NOT the current claimant
    interaction.response.send_message = AsyncMock()
    await pbp_done.callback(interaction, note=None)
    msg = interaction.response.send_message.call_args
    assert msg.kwargs.get("ephemeral") is True
    assert "not yours" in msg.args[0]
    assert store.get("c1")["turn_index"] == 0  # not advanced


async def test_pbp_skip_requires_manage_guild(tmp_path):
    ch = _channel()
    mgr, store = _mgr(tmp_path, channel=ch)
    store.start_session("c1", "Crypt", _participants(2), channel_id=str(ch.id))
    bot = mgr.bot
    bot.pbp = mgr
    interaction = MagicMock()
    interaction.client = bot
    interaction.channel_id = ch.id
    interaction.user.guild_permissions.manage_guild = False
    interaction.response.send_message = AsyncMock()
    await pbp_skip.callback(interaction)
    assert store.get("c1")["turn_index"] == 0  # refused, not advanced
    assert interaction.response.send_message.call_args.kwargs.get("ephemeral") is True


async def test_reminder_marks_before_send_so_a_send_failure_never_double_pings(tmp_path):
    # Regression (PHASE-36 review): if channel.send fails AFTER the flag is set, the next tick
    # must NOT re-send. mark_reminded is now called before send.
    ch = _channel()
    ch.send = AsyncMock(side_effect=RuntimeError("discord down"))
    mgr, store = _mgr(tmp_path, channel=ch)
    store.start_session("c1", "Crypt", _participants(2), channel_id=str(ch.id), reminder_hours=1.0)
    store._data["c1"]["turn_started_at"] = (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat()
    store._save()
    await mgr.reminder_tick()  # send raises, but the flag was set first
    assert store.get("c1")["reminded_at"] is not None
    assert ch.send.await_count == 1
    await mgr.reminder_tick()  # already reminded → no second attempt
    assert ch.send.await_count == 1
