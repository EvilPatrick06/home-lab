"""Regression: onnxruntime GPU device-discovery warnings are quieted at wake /
Piper model load (BMO-ISSUES 2026-06-29).

The onnxruntime C++ device_discovery layer logs a pair of W-level "Failed to
detect devices under /sys/class/drm/cardN" warnings on every InferenceSession
creation on the headless Pi. `_quiet_onnxruntime()` raises the default logger
severity to ERROR before the first session is built so those lines stop
spamming the journal. These tests inject a fake `onnxruntime` module (the real
one is not a test dep) and assert the severity call happens, is configurable,
and is idempotent.
"""

import importlib
import sys
import types

import pytest


@pytest.fixture()
def vp_with_fake_onnx(monkeypatch):
    """Import voice_pipeline with a fake onnxruntime injected, resetting the
    module-level quieted flag so each test starts fresh."""
    fake = types.ModuleType("onnxruntime")
    calls = []
    fake.set_default_logger_severity = lambda level: calls.append(level)
    monkeypatch.setitem(sys.modules, "onnxruntime", fake)

    import services.voice.voice_pipeline as vp

    monkeypatch.setattr(vp, "_ONNX_LOG_QUIETED", False, raising=False)
    return vp, calls


def test_quiet_onnxruntime_sets_error_severity(vp_with_fake_onnx, monkeypatch):
    vp, calls = vp_with_fake_onnx
    monkeypatch.delenv("BMO_ONNX_LOG_SEVERITY", raising=False)
    vp._quiet_onnxruntime()
    assert calls == [3], "default severity must be ERROR (3)"


def test_quiet_onnxruntime_is_idempotent(vp_with_fake_onnx, monkeypatch):
    vp, calls = vp_with_fake_onnx
    monkeypatch.delenv("BMO_ONNX_LOG_SEVERITY", raising=False)
    vp._quiet_onnxruntime()
    vp._quiet_onnxruntime()
    vp._quiet_onnxruntime()
    assert calls == [3], "severity must be set exactly once, not on every load"


def test_quiet_onnxruntime_env_override(vp_with_fake_onnx, monkeypatch):
    vp, calls = vp_with_fake_onnx
    monkeypatch.setenv("BMO_ONNX_LOG_SEVERITY", "4")
    vp._quiet_onnxruntime()
    assert calls == [4]


def test_quiet_onnxruntime_no_onnx_is_noop(monkeypatch):
    """If onnxruntime is not importable, quieting is a silent no-op (never
    raises into the model-load path)."""
    monkeypatch.setitem(sys.modules, "onnxruntime", None)  # forces ImportError
    import services.voice.voice_pipeline as vp

    monkeypatch.setattr(vp, "_ONNX_LOG_QUIETED", False, raising=False)
    vp._quiet_onnxruntime()  # must not raise
