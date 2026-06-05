"""Tests for the DM Discord bot's voice/narration plumbing.

Covers:
  * get_prosody returns valid {speed, pitch} for known archetypes, an unknown
    NPC (safe fallback), and emotion-based modulation.
  * DMBot.start_voice_listen is a defined coroutine that returns without
    raising — Phase 1 narrate-only behavior:
      - already connected  -> no-op, returns
      - not connected      -> joins the Dungeon channel via existing primitives
      - no Dungeon channel -> logs + returns cleanly (never raises)

conftest.py mocks the Pi-hardware modules; discord.py itself is importable, so
DMBot can be constructed directly and its voice-join primitives monkeypatched.
"""

import sys
from unittest.mock import AsyncMock, MagicMock

import pytest

# Belt-and-suspenders: conftest mocks these, but importing bots.discord_dm_bot
# also pulls in services.cloud_providers etc. Keep the optional Pi modules mocked
# so this file is import-safe even if run in isolation.
for _mod in ("vlc", "pychromecast", "androidtvremote2", "spidev"):
    sys.modules.setdefault(_mod, MagicMock())

from bots.discord_dm_bot import DMBot
from services.voice_personality import NPC_PROSODY, get_prosody


# ── get_prosody ────────────────────────────────────────────────────


@pytest.mark.parametrize("archetype", list(NPC_PROSODY.keys()))
def test_get_prosody_known_archetypes(archetype):
    """Every mapped NPC archetype yields a valid {speed, pitch} pair."""
    prosody = get_prosody(npc=archetype)
    assert set(prosody) >= {"speed", "pitch"}
    assert isinstance(prosody["speed"], (int, float))
    assert isinstance(prosody["pitch"], (int, float))
    # Sanity bounds — speed positive, pitch within a reasonable semitone range.
    assert prosody["speed"] > 0
    assert -12 <= prosody["pitch"] <= 12


def test_get_prosody_unknown_npc_falls_back():
    """An unknown NPC must not crash — returns the neutral default."""
    prosody = get_prosody(npc="totally_made_up_archetype")
    assert prosody == {"speed": 1.0, "pitch": 0}


def test_get_prosody_emotion_modulation():
    """Emotion-only calls return a valid prosody profile."""
    prosody = get_prosody(emotion="dramatic")
    assert set(prosody) >= {"speed", "pitch"}
    assert prosody["speed"] > 0


def test_get_prosody_no_args_is_neutral():
    """No npc and no emotion -> neutral default, never raises."""
    assert get_prosody() == {"speed": 1.0, "pitch": 0}


# ── start_voice_listen ─────────────────────────────────────────────


@pytest.fixture
def dm_bot():
    """A constructed DMBot with its slash-command tree wired up."""
    return DMBot()


async def test_start_voice_listen_is_coroutine_and_returns_when_connected(dm_bot, monkeypatch):
    """Already-connected path: returns without raising, no join attempted."""
    vc = MagicMock()
    vc.is_connected.return_value = True
    dm_bot.session.voice_client = vc

    join = AsyncMock()
    monkeypatch.setattr(dm_bot, "join_voice", join)

    result = await dm_bot.start_voice_listen()
    assert result is None
    join.assert_not_awaited()  # already connected -> no re-join


async def test_start_voice_listen_joins_when_disconnected(dm_bot, monkeypatch):
    """Disconnected path: joins the Dungeon channel via existing primitives."""
    dm_bot.session.voice_client = None

    fake_channel = MagicMock(name="dungeon-channel")
    fake_guild = MagicMock(name="guild")

    monkeypatch.setattr(type(dm_bot), "guilds", property(lambda self: [fake_guild]))
    find = AsyncMock(return_value=fake_channel)
    join = AsyncMock(return_value=MagicMock())
    monkeypatch.setattr(dm_bot, "find_dungeon_channel", find)
    monkeypatch.setattr(dm_bot, "join_voice", join)

    result = await dm_bot.start_voice_listen()
    assert result is None
    find.assert_awaited_once_with(fake_guild)
    join.assert_awaited_once_with(fake_channel)


async def test_start_voice_listen_no_channel_returns_cleanly(dm_bot, monkeypatch):
    """No Dungeon channel anywhere: logs + returns, must NOT raise."""
    dm_bot.session.voice_client = None
    fake_guild = MagicMock(name="guild")

    monkeypatch.setattr(type(dm_bot), "guilds", property(lambda self: [fake_guild]))
    monkeypatch.setattr(dm_bot, "find_dungeon_channel", AsyncMock(return_value=None))
    join = AsyncMock()
    monkeypatch.setattr(dm_bot, "join_voice", join)

    result = await dm_bot.start_voice_listen()
    assert result is None
    join.assert_not_awaited()


async def test_start_voice_listen_no_guilds_returns_cleanly(dm_bot, monkeypatch):
    """No guilds at all: returns cleanly without raising."""
    dm_bot.session.voice_client = None
    monkeypatch.setattr(type(dm_bot), "guilds", property(lambda self: []))
    join = AsyncMock()
    monkeypatch.setattr(dm_bot, "join_voice", join)

    assert await dm_bot.start_voice_listen() is None
    join.assert_not_awaited()
