"""Tests for services/thermal_gate.py — the local-LLM thermal admission gate.

Covers the BMO-ISSUES [2026-06-29] thermal-throttle mitigation: cool SoC and
unreadable-zone no-ops, the bounded cooldown wait, the hot-clamp of
``num_predict``, and the disable escape hatch. Temperature reads and sleeps
are monkeypatched — no hardware, no real waiting.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services import thermal_gate  # noqa: E402

OPTS = {"num_ctx": 8192, "num_predict": 1024, "temperature": 0.8}


def _no_sleep(monkeypatch):
    monkeypatch.setattr(thermal_gate.time, "sleep", lambda _s: None)


def test_cool_soc_is_a_no_op(monkeypatch):
    monkeypatch.setattr(thermal_gate, "read_soc_temp", lambda: 55.0)
    out = thermal_gate.gate_local_llm_options(OPTS)
    assert out is OPTS  # same object, untouched


def test_unreadable_zone_is_a_no_op(monkeypatch):
    monkeypatch.setattr(thermal_gate, "read_soc_temp", lambda: None)
    assert thermal_gate.gate_local_llm_options(OPTS) is OPTS


def test_none_options_pass_through_when_cool(monkeypatch):
    monkeypatch.setattr(thermal_gate, "read_soc_temp", lambda: 40.0)
    assert thermal_gate.gate_local_llm_options(None) is None


def test_hot_soc_waits_then_proceeds_after_cooldown(monkeypatch):
    _no_sleep(monkeypatch)
    temps = iter([84.8, 82.0, 75.0])  # engage, still hot, cooled below resume
    monkeypatch.setattr(thermal_gate, "read_soc_temp", lambda: next(temps))
    out = thermal_gate.gate_local_llm_options(OPTS)
    assert out is OPTS  # cooled in time -> normal options, unmodified


def test_hot_soc_clamps_num_predict_after_bounded_wait(monkeypatch):
    _no_sleep(monkeypatch)
    monkeypatch.setattr(thermal_gate, "read_soc_temp", lambda: 85.0)
    # collapse the wait window so the deadline expires immediately-ish
    monkeypatch.setattr(thermal_gate, "MAX_WAIT_S", 0.01)
    monkeypatch.setattr(thermal_gate, "POLL_S", 0.0)
    out = thermal_gate.gate_local_llm_options(OPTS)
    assert out is not OPTS  # copy, original untouched
    assert OPTS["num_predict"] == 1024
    assert out["num_predict"] == thermal_gate.HOT_NUM_PREDICT
    assert out["num_ctx"] == 8192  # everything else preserved


def test_clamp_never_raises_num_predict(monkeypatch):
    _no_sleep(monkeypatch)
    monkeypatch.setattr(thermal_gate, "read_soc_temp", lambda: 85.0)
    monkeypatch.setattr(thermal_gate, "MAX_WAIT_S", 0.01)
    monkeypatch.setattr(thermal_gate, "POLL_S", 0.0)
    small = {"num_predict": 64}
    out = thermal_gate.gate_local_llm_options(small)
    assert out["num_predict"] == 64  # min(base, clamp), never raised


def test_clamp_with_missing_num_predict_sets_budget(monkeypatch):
    _no_sleep(monkeypatch)
    monkeypatch.setattr(thermal_gate, "read_soc_temp", lambda: 85.0)
    monkeypatch.setattr(thermal_gate, "MAX_WAIT_S", 0.01)
    monkeypatch.setattr(thermal_gate, "POLL_S", 0.0)
    out = thermal_gate.gate_local_llm_options({})
    assert out["num_predict"] == thermal_gate.HOT_NUM_PREDICT


def test_disable_env_skips_gate_entirely(monkeypatch):
    monkeypatch.setenv("BMO_THERMAL_GATE_DISABLE", "1")

    def _boom():  # gate must not even read the temperature
        raise AssertionError("read_soc_temp called while disabled")

    monkeypatch.setattr(thermal_gate, "read_soc_temp", _boom)
    assert thermal_gate.gate_local_llm_options(OPTS) is OPTS


def test_read_soc_temp_parses_millidegrees(tmp_path, monkeypatch):
    zone = tmp_path / "temp"
    zone.write_text("84800\n")
    monkeypatch.setattr(thermal_gate, "THERMAL_ZONE", str(zone))
    assert thermal_gate.read_soc_temp() == pytest.approx(84.8)


def test_read_soc_temp_missing_zone_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(thermal_gate, "THERMAL_ZONE",
                        str(tmp_path / "nope"))
    assert thermal_gate.read_soc_temp() is None


def test_read_soc_temp_garbage_returns_none(tmp_path, monkeypatch):
    zone = tmp_path / "temp"
    zone.write_text("not-a-number")
    monkeypatch.setattr(thermal_gate, "THERMAL_ZONE", str(zone))
    assert thermal_gate.read_soc_temp() is None
