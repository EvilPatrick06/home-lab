"""Tests for the social-bot music queue: invisible autoplay radio + the fast
queue-clear / jump tools.

Covers the two guarantees the features must hold:
  * Autoplay "radio" picks fill empty-queue dead air but stay OUT of the visible
    queue (never added to MusicQueue.tracks, so never displayed or persisted)
    and NEVER preempt a real user request.
  * The new clear / remove-range / play-now tools exist and the V2 panel exposes
    the Clear-Queue and Autoplay buttons.

All Discord / yt-dlp / DB dependencies are mocked (conftest stubs the heavy
modules), so these run anywhere.
"""

import asyncio
from unittest.mock import MagicMock

import bots.social.bot as bot
from bots.social.music_ui import MusicQueue, build_music_panel


def _track(vid, title="T"):
    return {"id": vid, "title": title, "webpage_url": f"https://y/{vid}", "duration": 100}


def _fake_vc():
    vc = MagicMock()
    vc.is_connected.return_value = True
    vc.is_playing.return_value = True
    vc.is_paused.return_value = False
    vc.guild = MagicMock()
    return vc


# ── MusicQueue defaults / clear ────────────────────────────────────────────────

def test_autoplay_default_on_and_reservoir_present():
    q = MusicQueue()
    assert q.autoplay is True
    assert q.autoplay_pool == []
    assert q.autoplay_seen == set()


def test_clear_drops_invisible_reservoir():
    q = MusicQueue()
    q.tracks.append(_track("a"))
    q.autoplay_pool.append(_track("b"))
    q.autoplay_seen.add("c")
    q.clear()
    assert q.tracks == []
    assert q.autoplay_pool == []
    assert q.autoplay_seen == set()


# ── _fill_autoplay_pool: invisible reservoir, never touches the visible queue ──

def test_fill_pool_excludes_seed_and_skips_seen(monkeypatch):
    q = MusicQueue()
    q.autoplay_seen.add("seen1")
    mix = [_track("seed"), _track("seen1"), _track("r1"), _track("r2")]
    monkeypatch.setattr(bot, "_extract_playlist_tracks", lambda url: ("Mix", mix))
    bot._fill_autoplay_pool(q, _track("seed"))
    ids = [t["id"] for t in q.autoplay_pool]
    assert "seed" not in ids        # seed song excluded
    assert "seen1" not in ids       # already-played excluded
    assert ids == ["r1", "r2"]
    assert q.tracks == []           # CRITICAL: visible queue untouched


def test_fill_pool_falls_back_to_search(monkeypatch):
    q = MusicQueue()
    monkeypatch.setattr(bot, "_extract_playlist_tracks", lambda url: ("Mix", []))
    monkeypatch.setattr(bot, "_search_youtube", lambda query: _track("s1", "radio hit"))
    bot._fill_autoplay_pool(q, _track("seed"))
    assert [t["id"] for t in q.autoplay_pool] == ["s1"]
    assert q.tracks == []


# ── _autoplay_next: invisible + labelled + off-switch honoured ─────────────────

def test_autoplay_next_plays_invisible_radio(monkeypatch):
    q = MusicQueue()
    q.voice_client = _fake_vc()
    played = {}

    async def fake_start(queue, track, gid, ch):
        played["track"] = track

    monkeypatch.setattr(bot, "_extract_playlist_tracks", lambda url: ("Mix", [_track("r1")]))
    monkeypatch.setattr(bot, "_start_playing", fake_start)

    asyncio.run(bot._autoplay_next(q, _track("seed"), 1, MagicMock()))

    assert played["track"]["id"] == "r1"
    assert played["track"]["_autoplay"] is True
    assert played["track"]["requester"] == "📻 Radio"
    assert q.tracks == []                 # CRITICAL: radio pick NOT in visible queue
    assert "r1" in q.autoplay_seen        # de-dupe bookkeeping


def test_autoplay_off_short_circuits(monkeypatch):
    q = MusicQueue()
    q.autoplay = False
    q.voice_client = _fake_vc()
    called = {"start": False}

    async def fake_start(*a, **k):
        called["start"] = True

    monkeypatch.setattr(bot, "_start_playing", fake_start)
    asyncio.run(bot._autoplay_next(q, _track("seed"), 1, MagicMock()))
    assert called["start"] is False
    assert q.current is None


# ── Request priority: a real queued song always wins over autoplay ─────────────

def test_real_request_preempts_autoplay(monkeypatch):
    q = MusicQueue()
    bot._music_queues[4242001] = q   # _on_track_end fetches via _get_queue(gid)
    q.voice_client = _fake_vc()
    q.current = _track("now")
    q.tracks.append(_track("req"))   # a real user request is waiting

    started = {}
    autoplay_called = {"v": False}

    async def fake_start(queue, track, gid, ch):
        started["track"] = track

    async def fake_autoplay(*a, **k):
        autoplay_called["v"] = True

    monkeypatch.setattr(bot, "_start_playing", fake_start)
    monkeypatch.setattr(bot, "_autoplay_next", fake_autoplay)
    monkeypatch.setattr(bot, "_get_db", lambda: MagicMock())

    asyncio.run(bot._on_track_end(4242001))

    assert started["track"]["id"] == "req"   # the request played next
    assert autoplay_called["v"] is False     # autoplay never consulted


def test_autoplay_only_on_empty_queue(monkeypatch):
    q = MusicQueue()
    bot._music_queues[4242002] = q   # _on_track_end fetches via _get_queue(gid)
    q.voice_client = _fake_vc()
    q.current = _track("now")
    # no upcoming real tracks

    autoplay_called = {"v": False}

    async def fake_autoplay(queue, last, gid, ch):
        autoplay_called["v"] = True

    async def fake_start(*a, **k):
        pass

    monkeypatch.setattr(bot, "_autoplay_next", fake_autoplay)
    monkeypatch.setattr(bot, "_start_playing", fake_start)
    monkeypatch.setattr(bot, "_get_db", lambda: MagicMock())

    asyncio.run(bot._on_track_end(4242002))
    assert autoplay_called["v"] is True


# ── Commands + panel surface ───────────────────────────────────────────────────

def test_new_commands_registered(monkeypatch):
    monkeypatch.setattr(bot, "GUILD_ID", "")
    monkeypatch.setattr(bot, "BOT_TOKEN", "")
    b = bot.SocialBot()
    names = {c.name for c in b.tree.get_commands()}
    for expected in ("clearqueue", "removerange", "playnow", "autoplay", "skipto"):
        assert expected in names, f"missing /{expected}"


def test_panel_exposes_queue_tool_buttons():
    q = bot._get_queue(987654321)
    q.current = _track("now")
    view = build_music_panel(987654321)
    ids = []

    def walk(items):
        for it in items:
            cid = getattr(it, "custom_id", None)
            if cid:
                ids.append(cid)
            ch = getattr(it, "children", None)
            if ch:
                walk(ch)

    walk(view.children)
    assert "music_clear_queue" in ids
    assert "music_autoplay" in ids
