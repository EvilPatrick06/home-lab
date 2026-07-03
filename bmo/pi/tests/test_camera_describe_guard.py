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
