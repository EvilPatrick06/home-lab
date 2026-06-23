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
from services.voice.voice_personality import NPC_PROSODY, get_prosody, normalize_emotion


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
    join = AsyncMock(return_value=(MagicMock(), None))  # PHASE-20 20A: join_voice now returns (vc, reason)
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


# ── PHASE-21 21A: sentence-chunked streaming queue ──────────────────


def _connected_vc():
    vc = MagicMock()
    vc.is_connected.return_value = True
    vc.is_playing.return_value = False
    return vc


def test_queue_narration_enqueues_job(dm_bot):
    """queue_narration builds a NarrationJob carrying the tags."""
    dm_bot.session.voice_client = _connected_vc()
    assert dm_bot.queue_narration("hello", npc="goblin", emotion="angry") == "queued"
    job = dm_bot.session.narration_queue.get_nowait()
    assert job.text == "hello" and job.npc == "goblin" and job.emotion == "angry"


async def test_speak_no_voice_does_not_enqueue(dm_bot):
    """No connected VC -> no_voice and nothing queued."""
    dm_bot.session.voice_client = None
    assert await dm_bot._speak("hi") == "no_voice"
    assert dm_bot.session.narration_queue.qsize() == 0


async def test_long_narration_not_truncated(dm_bot, monkeypatch):
    """A >500-char narration is fully chunked — no text[:500] cutoff."""
    import bots.discord_dm_bot as dm

    dm_bot.session.voice_client = _connected_vc()
    monkeypatch.setattr(dm, "synthesize_chunk", lambda text, voice: text.encode())
    monkeypatch.setattr(dm, "resolve_backend", lambda: "fish")  # fish skips apply_prosody
    played: list[str] = []

    async def fake_play(wav):
        played.append(wav.decode())
        return True

    monkeypatch.setattr(dm_bot, "_play_chunk", fake_play)

    long_text = " ".join(f"Sentence number {i} of the long tale." for i in range(40))
    assert len(long_text) > 500
    status = await dm_bot._synthesize_and_play(long_text)
    assert status == "spoken"
    rejoined = " ".join(played)
    assert "number 0 " in rejoined and "number 39" in rejoined  # head and tail both spoken


async def test_worker_plays_queue_in_fifo_order(dm_bot, monkeypatch):
    """The worker dequeues NarrationJobs and plays them in order."""
    import asyncio

    import bots.discord_dm_bot as dm

    dm_bot.session.voice_client = _connected_vc()
    monkeypatch.setattr(dm, "synthesize_chunk", lambda text, voice: text.encode())
    monkeypatch.setattr(dm, "resolve_backend", lambda: "fish")
    played: list[str] = []

    async def fake_play(wav):
        played.append(wav.decode())
        return True

    monkeypatch.setattr(dm_bot, "_play_chunk", fake_play)

    assert await dm_bot._speak("Alpha leads the charge.") == "queued"
    assert await dm_bot._speak("Bravo holds the rear.") == "queued"
    worker = asyncio.create_task(dm_bot._narration_worker())
    await asyncio.wait_for(dm_bot.session.narration_queue.join(), timeout=3)
    worker.cancel()
    assert played[0].startswith("Alpha")
    assert played[-1].startswith("Bravo")
    assert dm_bot.session.last_narration_status == "spoken"


# ── PHASE-21 21D: emotion-prosody map completion + normalization ────

# The full vocabulary the VTT prompt (voice-narration.ts) asks the model to emit.
VTT_EMOTIONS = ["neutral", "calm", "happy", "sad", "angry", "excited", "fearful", "menacing"]


@pytest.mark.parametrize("emotion", VTT_EMOTIONS)
def test_every_vtt_emotion_maps(emotion):
    """Every VTT mood resolves to a real profile; only `neutral` is flat."""
    prosody = get_prosody(emotion=emotion)
    assert set(prosody) >= {"speed", "pitch"}
    if emotion == "neutral":
        assert prosody == {"speed": 1.0, "pitch": 0}
    else:
        assert prosody != {"speed": 1.0, "pitch": 0}  # actually modulates


def test_fearful_aliases_to_scared():
    assert get_prosody(emotion="fearful") == get_prosody(emotion="scared")


def test_npc_and_emotion_combine_with_clamp():
    """booming_dragon (0.7 / -8) + angry (×1.08 / -2) combines and clamps pitch."""
    prosody = get_prosody(npc="booming_dragon", emotion="angry")
    assert prosody["speed"] == round(0.7 * 1.08, 3)  # 0.756
    assert prosody["pitch"] == -10  # -8 + -2 clamped to the -10 floor


def test_prosody_clamps_within_bounds():
    for npc in NPC_PROSODY:
        for emotion in VTT_EMOTIONS:
            p = get_prosody(npc=npc, emotion=emotion)
            assert 0.6 <= p["speed"] <= 1.4
            assert -10 <= p["pitch"] <= 8


def test_normalize_emotion_unknown_is_none():
    assert normalize_emotion("definitely_not_a_mood") is None
    assert normalize_emotion(None) is None
    assert normalize_emotion("fearful") == "scared"
    assert normalize_emotion("ANGRY") == "angry"


# ── PHASE-21 21B: barge-in cancellation ─────────────────────────────


async def test_cancel_narration_flushes_and_stops(dm_bot):
    """cancel_narration drains the queue, stops playback, sets the cancel flag."""
    vc = _connected_vc()
    vc.is_playing.return_value = True
    dm_bot.session.voice_client = vc
    for _ in range(3):
        assert dm_bot.queue_narration("x") == "queued"
    result = await dm_bot.cancel_narration(flush=True)
    assert result["flushed"] == 3
    assert result["cancelled"] is True
    vc.stop.assert_called_once()
    assert dm_bot.session.narration_queue.qsize() == 0
    assert dm_bot.session.narration_cancel.is_set()


async def test_cancel_narration_noop_when_idle(dm_bot):
    """Nothing playing, nothing queued -> cancelled False, flushed 0."""
    vc = _connected_vc()  # is_playing False
    dm_bot.session.voice_client = vc
    result = await dm_bot.cancel_narration(flush=True)
    assert result == {"cancelled": False, "flushed": 0}
    vc.stop.assert_not_called()
