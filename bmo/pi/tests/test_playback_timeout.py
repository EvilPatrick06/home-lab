"""ffplay playback timeout sizing + wedge recovery (BMO-ISSUES 2026-07-02).

A stuck ffplay used to block speak() for a flat 120s and surface as
"All TTS failed"; the timeout is now sized to the clip via ffprobe with a
120s fallback, clamped to [15, 120].
"""

import subprocess
from types import SimpleNamespace

import services.voice.voice_pipeline as vp_mod
from services.voice.voice_pipeline import VoicePipeline


def _vp():
    return VoicePipeline.__new__(VoicePipeline)


def test_timeout_sized_from_duration_with_grace(monkeypatch):
    def fake_run(*a, **k):
        return SimpleNamespace(stdout=b"42.0\n", returncode=0)
    monkeypatch.setattr(vp_mod.subprocess, "run", fake_run)
    assert _vp()._playback_timeout_s("x.opus") == 52.0


def test_timeout_clamped_to_floor(monkeypatch):
    def fake_run(*a, **k):
        return SimpleNamespace(stdout=b"2.5\n", returncode=0)
    monkeypatch.setattr(vp_mod.subprocess, "run", fake_run)
    assert _vp()._playback_timeout_s("x.opus") == 15.0


def test_timeout_clamped_to_old_ceiling(monkeypatch):
    def fake_run(*a, **k):
        return SimpleNamespace(stdout=b"600\n", returncode=0)
    monkeypatch.setattr(vp_mod.subprocess, "run", fake_run)
    assert _vp()._playback_timeout_s("x.opus") == 120.0


def test_timeout_falls_back_when_ffprobe_missing(monkeypatch):
    def fake_run(*a, **k):
        raise FileNotFoundError("no ffprobe")
    monkeypatch.setattr(vp_mod.subprocess, "run", fake_run)
    assert _vp()._playback_timeout_s("x.opus") == 120.0
