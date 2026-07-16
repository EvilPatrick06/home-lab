"""/api/camera/describe must 503 when the camera service is absent.

BMO-ISSUES 2026-07-02: without the guard the endpoint returned 200
"Describing..." and the background thread raised a NoneType AttributeError
that leaked raw Python to the user via the vision_result socket event.
"""

import app as app_module


def test_describe_returns_503_without_camera(monkeypatch):
    monkeypatch.setattr(app_module, "camera", None)
    client = app_module.app.test_client()
    resp = client.post("/api/camera/describe", json={"prompt": "what do you see"})
    assert resp.status_code == 503
    assert "Camera service not available" in resp.get_json()["error"]


def test_describe_teardown_never_leaks_raw_nonetype(monkeypatch):
    """PHASE-19 19C: if the camera service goes away AFTER the route guard
    passes (mid-flight teardown), the describe thread's classifier must map
    the NoneType/describe_scene AttributeError to friendly copy — the raw
    exception text must never reach the UI via vision_result."""

    class _TornDownCamera:
        def describe_scene(self, prompt):
            raise AttributeError("'NoneType' object has no attribute 'describe_scene'")

    monkeypatch.setattr(app_module, "camera", _TornDownCamera())

    emitted = []
    monkeypatch.setattr(
        app_module.socketio, "emit",
        lambda evt, data, **kw: emitted.append((evt, data)),
    )

    class _SyncThread:
        """Run the describe worker inline so the test can assert its emit."""

        def __init__(self, target=None, daemon=None, **kw):
            self._target = target

        def start(self):
            self._target()

    monkeypatch.setattr(app_module.threading, "Thread", _SyncThread)

    client = app_module.app.test_client()
    resp = client.post("/api/camera/describe", json={"prompt": "x"})
    assert resp.status_code == 200
    assert emitted, "expected a vision_result emit"
    desc = emitted[-1][1]["description"]
    assert "NoneType" not in desc
    assert "describe_scene" not in desc
    assert desc == "Vision unavailable: camera hardware not detected."
