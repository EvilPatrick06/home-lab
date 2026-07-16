"""PHASE-19 19D — /api/oled/expression POST must report reality.

With BMO_DISABLE_OLED (``oled_face is None``) the face half of
``_sync_expression`` is a no-op, but the endpoint used to echo the REQUEST
back as an unconditional success — which the very next GET (which reads
reality) contradicted, and the dashboard face picker then toasted a false
"Face set to happy". The POST now carries ``applied``/``disabled`` flags.
"""

import app as app_module


def test_expression_post_reports_disabled_without_face(monkeypatch):
    monkeypatch.setattr(app_module, "oled_face", None)
    monkeypatch.setattr(app_module, "led_controller", None)
    client = app_module.app.test_client()
    resp = client.post("/api/oled/expression", json={"expression": "happy"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True          # nothing *failed* — the face is just off
    assert data["applied"] is False
    assert data["disabled"] is True
    assert data["expression"] == "happy"
    # GET keeps reading reality: no face -> idle (must not contradict POST now)
    got = client.get("/api/oled/expression").get_json()
    assert got["expression"] == "idle"


def test_expression_post_applied_with_face(monkeypatch):
    class _FakeFace:
        current_expression = "idle"

        def set_expression(self, expr):
            self.current_expression = expr

    face = _FakeFace()
    monkeypatch.setattr(app_module, "oled_face", face)
    monkeypatch.setattr(app_module, "led_controller", None)
    client = app_module.app.test_client()
    resp = client.post("/api/oled/expression", json={"expression": "happy"})
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["ok"] is True
    assert data["applied"] is True
    assert "disabled" not in data
    assert face.current_expression == "happy"
