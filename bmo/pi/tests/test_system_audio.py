"""PHASE-16 16C — services/system_audio.py wpctl wrappers."""

from unittest.mock import MagicMock

from services.voice import system_audio


def _fake_run(stdout="", returncode=0):
    m = MagicMock()
    m.stdout = stdout
    m.returncode = returncode
    return MagicMock(return_value=m)


def test_get_audio_state_parses_unmuted(monkeypatch):
    monkeypatch.setattr(system_audio.subprocess, "run", _fake_run("Volume: 0.25"))
    assert system_audio.get_system_audio_state() == {"volume": 25, "muted": False}


def test_get_audio_state_parses_muted(monkeypatch):
    monkeypatch.setattr(system_audio.subprocess, "run", _fake_run("Volume: 0.40 [MUTED]"))
    state = system_audio.get_system_audio_state()
    assert state["volume"] == 40
    assert state["muted"] is True


def test_get_system_volume_returns_int(monkeypatch):
    monkeypatch.setattr(system_audio.subprocess, "run", _fake_run("Volume: 0.75"))
    assert system_audio.get_system_volume() == 75


def test_set_volume_clamps_to_1_5(monkeypatch):
    captured = {}

    def run(cmd, **kw):
        captured["cmd"] = cmd
        return MagicMock(returncode=0)

    monkeypatch.setattr(system_audio.subprocess, "run", run)
    system_audio.set_system_volume(200)  # 200% → clamp to 1.5
    assert captured["cmd"][-1] == "1.5"


def test_unmute_sink_returns_false_on_exception(monkeypatch):
    def boom(*a, **k):
        raise OSError("no wpctl")

    monkeypatch.setattr(system_audio.subprocess, "run", boom)
    assert system_audio.unmute_sink() is False
