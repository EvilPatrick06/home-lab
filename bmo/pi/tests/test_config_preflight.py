"""Tests for the startup config preflight (services/config_preflight.py)."""

import importlib

import pytest


@pytest.fixture
def preflight():
    mod = importlib.import_module("services.config_preflight")
    return mod


def _clear_keys(monkeypatch, mod):
    for key, *_ in mod._KEY_REGISTRY:
        monkeypatch.delenv(key, raising=False)


def test_missing_required_is_not_ok(monkeypatch, preflight):
    _clear_keys(monkeypatch, preflight)
    r = preflight.run_preflight()
    assert r["ok"] is False
    assert any(m["key"] == "GEMINI_API_KEY" for m in r["missing_required"])
    assert "MISSING REQUIRED" in r["banner"]


def test_all_required_present_is_ok(monkeypatch, preflight):
    _clear_keys(monkeypatch, preflight)
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    r = preflight.run_preflight()
    assert r["ok"] is True
    assert r["required_ok"] == r["required_total"]
    # optional keys still absent → degraded list non-empty
    assert r["degraded"]


def test_blank_value_counts_as_missing(monkeypatch, preflight):
    _clear_keys(monkeypatch, preflight)
    monkeypatch.setenv("GEMINI_API_KEY", "   ")
    r = preflight.run_preflight()
    assert r["ok"] is False


def test_strict_mode_raises_on_missing_required(monkeypatch, preflight):
    _clear_keys(monkeypatch, preflight)
    monkeypatch.setenv("BMO_PREFLIGHT_STRICT", "1")
    with pytest.raises(RuntimeError):
        preflight.run_preflight()


def test_optional_present_moves_out_of_degraded(monkeypatch, preflight):
    _clear_keys(monkeypatch, preflight)
    monkeypatch.setenv("GEMINI_API_KEY", "x")
    monkeypatch.setenv("FISH_AUDIO_API_KEY", "y")
    r = preflight.run_preflight()
    assert "TTS (Fish Audio)" in r["configured"]
    assert all(d["key"] != "FISH_AUDIO_API_KEY" for d in r["degraded"])


def test_logger_is_optional_and_called(monkeypatch, preflight):
    _clear_keys(monkeypatch, preflight)
    monkeypatch.setenv("GEMINI_API_KEY", "x")

    class _Log:
        def __init__(self):
            self.msgs = []
        def info(self, m):
            self.msgs.append(("info", m))
        def warning(self, m):
            self.msgs.append(("warning", m))
        def error(self, m):
            self.msgs.append(("error", m))

    log = _Log()
    preflight.run_preflight(logger=log)
    assert log.msgs  # something was logged


# ── PHASE-10 10A — calendar token TTL carries an explicit basis label ──


def test_calendar_token_ttl_basis_label_present(monkeypatch, preflight):
    r = preflight.run_preflight()
    assert "calendar_token_ttl_basis" in r
    assert "credential file" in r["calendar_token_ttl_basis"]
