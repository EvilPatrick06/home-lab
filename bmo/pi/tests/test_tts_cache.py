"""Regression tests for the on-disk TTS phrase cache.

Recurring utterances (quips, timer/greeting announcements) are cached on disk
keyed by hash(text + speaker) so they play instantly and survive a Fish Audio
outage. These tests lock in the content-addressed keying, the write-through +
read path, the bounded LRU eviction, and the cache-hit short-circuit in
``speak()`` (which is what keeps BMO speaking while the TTS API is timing out).

Hardware/cloud are pre-mocked by conftest.py (same setup as test_voice_pipeline).
"""
import io
import sys
import wave
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

# Mirror test_voice_pipeline's pre-import stubs so voice_pipeline loads headless.
if "edge_tts" not in sys.modules:
    sys.modules["edge_tts"] = MagicMock()
try:
    import scipy.signal  # noqa: F401
except ImportError:
    sys.modules.setdefault("scipy", MagicMock())
    sys.modules.setdefault("scipy.signal", MagicMock())
if "faster_whisper" not in sys.modules:
    sys.modules["faster_whisper"] = MagicMock()
if "cloud_providers" not in sys.modules:
    _cloud_mod = MagicMock()
    _cloud_mod.groq_stt = MagicMock(return_value={"text": "", "segments": []})
    _cloud_mod.fish_audio_tts = MagicMock(return_value=b"")
    _cloud_mod.GROQ_API_KEY = "test-key"
    sys.modules["cloud_providers"] = _cloud_mod
if "agent" not in sys.modules:
    _agent_mod = MagicMock()
    _agent_mod._check_cloud_available = MagicMock(return_value=False)
    sys.modules["agent"] = _agent_mod


@pytest.fixture
def pipeline():
    with patch("sounddevice.InputStream"), \
         patch("sounddevice.query_devices", return_value={"default_samplerate": 48000}), \
         patch("sounddevice.rec", return_value=np.zeros((16000, 1), dtype="int16")), \
         patch("sounddevice.wait"), \
         patch("os.makedirs"):
        from services.voice.voice_pipeline import VoicePipeline
        return VoicePipeline(socketio=None, chat_callback=None)


@pytest.fixture
def cache_dir(tmp_path, monkeypatch):
    import services.voice.voice_pipeline as vp
    d = tmp_path / "tts"
    d.mkdir()
    monkeypatch.setattr(vp, "TTS_CACHE_DIR", str(d))
    return d


class TestCacheKey:
    def test_key_is_content_addressed(self, pipeline):
        k1 = pipeline._tts_cache_key("Good morning!", "bmo_calm")
        k2 = pipeline._tts_cache_key("Good morning!", "bmo_calm")
        assert k1 == k2                      # deterministic

    def test_key_differs_by_text(self, pipeline):
        assert pipeline._tts_cache_key("hello", "v") != pipeline._tts_cache_key("world", "v")

    def test_key_differs_by_voice(self, pipeline):
        assert pipeline._tts_cache_key("hello", "v1") != pipeline._tts_cache_key("hello", "v2")


class TestPutGet:
    def test_put_then_get_returns_path(self, pipeline, cache_dir):
        assert pipeline._tts_cache_get("One moment.", "bmo") is None   # cold
        pipeline._tts_cache_put("One moment.", "bmo", b"AUDIODATA", ext=".opus")
        path = pipeline._tts_cache_get("One moment.", "bmo")
        assert path is not None and path.endswith(".opus")
        with open(path, "rb") as f:
            assert f.read() == b"AUDIODATA"

    def test_miss_for_different_text(self, pipeline, cache_dir):
        pipeline._tts_cache_put("hi", "bmo", b"x", ext=".opus")
        assert pipeline._tts_cache_get("bye", "bmo") is None


class TestEviction:
    def test_eviction_bounds_total_size(self, pipeline, cache_dir, monkeypatch):
        import services.voice.voice_pipeline as vp
        # Tiny cap so a couple of writes trip eviction.
        monkeypatch.setattr(vp, "TTS_CACHE_MAX_MB", 0.001)  # ~1 KB
        blob = b"z" * 800
        for i in range(6):
            pipeline._tts_cache_put(f"phrase-{i}", "bmo", blob, ext=".opus")
        total = sum(f.stat().st_size for f in cache_dir.iterdir())
        # After eviction total must not exceed (cap + one entry) — i.e. it is bounded.
        assert total <= int(0.001 * 1024 * 1024) + len(blob)

    def test_eviction_keeps_most_recent(self, pipeline, cache_dir, monkeypatch):
        import os
        import services.voice.voice_pipeline as vp
        monkeypatch.setattr(vp, "TTS_CACHE_MAX_MB", 0.001)
        blob = b"z" * 800
        pipeline._tts_cache_put("old", "bmo", blob, ext=".opus")
        # Age the first entry so it is the LRU victim.
        old_path = pipeline._tts_cache_get("old", "bmo")
        os.utime(old_path, (1, 1))
        pipeline._tts_cache_put("new", "bmo", blob, ext=".opus")
        # The freshly written entry survives; the aged one is evicted.
        assert pipeline._tts_cache_get("new", "bmo") is not None
        assert pipeline._tts_cache_get("old", "bmo") is None


class TestSpeakShortCircuit:
    def test_speak_uses_cache_and_skips_synthesis(self, pipeline, cache_dir, monkeypatch):
        """A cache hit plays the cached file and never calls a TTS provider —
        this is what keeps BMO speaking during a Fish Audio outage."""
        pipeline._tts_cache_put("All done!", "bmo_calm", b"CACHED", ext=".opus")

        played = []
        monkeypatch.setattr(pipeline, "_play_audio", lambda p: played.append(p))
        # If synthesis were reached these would raise / record — they must not run.
        for name in ("_bmo_speak", "_cloud_speak", "_edge_speak", "_local_speak"):
            monkeypatch.setattr(pipeline, name, MagicMock(side_effect=AssertionError(f"{name} called on cache hit")))
        monkeypatch.setattr(pipeline, "_mute_mic", lambda *a, **k: None)
        monkeypatch.setattr(pipeline, "_emit", lambda *a, **k: None)

        pipeline.speak("All done!", speaker="bmo_calm")
        assert len(played) == 1
        assert played[0].endswith(".opus")
