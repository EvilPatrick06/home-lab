"""PHASE-21 21A: sentence splitting + backend ladder + prosody post-processing.

Splitting tests force the regex fallback (deterministic regardless of whether
`pysbd` is installed) by stubbing the module to None.
"""

import subprocess
import sys


from services import discord_tts


def _force_regex(monkeypatch):
    # None in sys.modules makes `import pysbd` raise ImportError, forcing regex.
    monkeypatch.setitem(sys.modules, "pysbd", None)


# ── splitting ───────────────────────────────────────────────────────


def test_split_empty(monkeypatch):
    _force_regex(monkeypatch)
    assert discord_tts.split_sentences("") == []
    assert discord_tts.split_sentences("   \n  ") == []


def test_split_two_sentences(monkeypatch):
    _force_regex(monkeypatch)
    out = discord_tts.split_sentences(
        "The goblin snarls and lunges forward. The hero parries the blow cleanly."
    )
    assert len(out) == 2
    assert "goblin" in out[0] and "parries" in out[1]


def test_split_full_text_coverage(monkeypatch):
    _force_regex(monkeypatch)
    text = "Dr. Vex nods slowly at the party. She smiles with quiet menace."
    out = discord_tts.split_sentences(text)
    assert out
    joined = " ".join(out)
    for word in ("Vex", "smiles", "menace"):
        assert word in joined


def test_long_sentence_hard_split(monkeypatch):
    _force_regex(monkeypatch)
    long = ("word " * 200).strip()  # ~1000 chars, no sentence punctuation
    out = discord_tts.split_sentences(long, max_chars=100)
    assert len(out) >= 5
    assert all(len(c) <= 100 for c in out)
    # nothing dropped — rejoining covers the original word count
    assert sum(c.count("word") for c in out) == 200


def test_tiny_fragment_merged(monkeypatch):
    _force_regex(monkeypatch)
    out = discord_tts.split_sentences("Go. The ancient stone door grinds open before you.", min_chars=24)
    assert out
    assert not any(c == "Go." for c in out)  # the stub fragment rode along


# ── backend ladder ──────────────────────────────────────────────────


def test_resolve_backend_kokoro(monkeypatch):
    monkeypatch.setenv("KOKORO_TTS_URL", "http://gpu:8880")
    assert discord_tts.resolve_backend() == "kokoro"


def test_resolve_backend_fish_when_no_model(monkeypatch):
    monkeypatch.delenv("KOKORO_TTS_URL", raising=False)
    monkeypatch.setattr(discord_tts, "_piper_model_path", lambda: "/nonexistent/model.onnx")
    assert discord_tts.resolve_backend() == "fish"


def test_resolve_backend_piper_when_model_exists(monkeypatch, tmp_path):
    monkeypatch.delenv("KOKORO_TTS_URL", raising=False)
    model = tmp_path / "m.onnx"
    model.write_bytes(b"x")
    monkeypatch.setattr(discord_tts, "_piper_model_path", lambda: str(model))
    assert discord_tts.resolve_backend() == "piper"


def test_synthesize_kokoro_body(monkeypatch):
    monkeypatch.setenv("KOKORO_TTS_URL", "http://gpu:8880")
    captured = {}

    class _Resp:
        content = b"WAVDATA"

        def raise_for_status(self):
            pass

    import requests

    def fake_post(url, json, timeout):
        captured["url"] = url
        captured["json"] = json
        return _Resp()

    monkeypatch.setattr(requests, "post", fake_post)
    out = discord_tts.synthesize_chunk(
        "hello there", discord_tts.VoiceSpec(backend="kokoro", kokoro_voice="af_bella", speed=1.1)
    )
    assert out == b"WAVDATA"
    assert captured["url"].endswith("/v1/audio/speech")
    assert captured["json"]["input"] == "hello there"
    assert captured["json"]["voice"] == "af_bella"
    assert captured["json"]["speed"] == 1.1


def test_synthesize_fish_fallback(monkeypatch):
    # Replace the whole module entry so this is robust to other tests that install
    # a MagicMock cloud_providers in sys.modules (e.g. test_claude_tools).
    import types

    fake_cp = types.SimpleNamespace(fish_audio_tts=lambda text, vid, fmt, speed, pitch: b"FISH")
    monkeypatch.setitem(sys.modules, "services.cloud_providers", fake_cp)
    out = discord_tts.synthesize_chunk("hello", discord_tts.VoiceSpec(backend="fish"))
    assert out == b"FISH"


# ── prosody post-processing ─────────────────────────────────────────


def test_apply_prosody_noop_no_subprocess(monkeypatch):
    called = []
    monkeypatch.setattr(subprocess, "run", lambda *a, **k: called.append(1))
    assert discord_tts.apply_prosody(b"WAV", 1.0, 0) == b"WAV"
    assert not called  # identity values → sox never spawned


def test_apply_prosody_skip_speed_only_pitch(monkeypatch):
    seen = {}

    def fake_run(cmd, **kwargs):
        seen["cmd"] = cmd

        class _R:
            stdout = b"PITCHED"

        return _R()

    monkeypatch.setattr(subprocess, "run", fake_run)
    out = discord_tts.apply_prosody(b"WAV", 1.2, 3, skip_speed=True)
    assert out == b"PITCHED"
    assert "tempo" not in seen["cmd"]  # speed skipped (native backend)
    assert "pitch" in seen["cmd"]


def test_apply_prosody_missing_sox_returns_input(monkeypatch):
    def boom(*a, **k):
        raise FileNotFoundError()

    monkeypatch.setattr(subprocess, "run", boom)
    assert discord_tts.apply_prosody(b"WAV", 1.2, 3) == b"WAV"  # graceful
