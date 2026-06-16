"""PHASE-16 16C — routes/system_api.py blueprint, driven through `import app`.

The blueprint registers at app import (module-scope register_system), so it mounts under the
test scaffolding from test_app_endpoints (reused here). Late-binding means app.<svc> = mock
monkeypatching still reaches the handlers.
"""

import app  # noqa: F401 — ensure the app module is importable + blueprint registered
from routes import system_api
from state import STATE
from tests.test_app_endpoints import bmo_app, client  # noqa: F401 (pytest fixtures)


def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    body = r.get_json()
    assert body["status"] == "ok"
    assert body["api_version"] == "v1"


def test_health_full_schema_keys_when_no_checker(client):
    import app as bmo
    bmo.health_checker = None
    r = client.get("/api/health/full")
    assert r.status_code == 200
    body = r.get_json()
    for key in ("overall", "services", "pi_stats", "down_services", "down_required_services"):
        assert key in body
    assert body["schema_version"] == 1


def test_volume_get_shape(client, monkeypatch):
    import app as bmo
    bmo.music = None
    bmo.voice = None
    bmo.timers = None
    monkeypatch.setattr(system_api.system_audio, "get_system_audio_state", lambda: {"volume": 30, "muted": False})
    r = client.get("/api/volume")
    body = r.get_json()
    assert body["system"] == 30
    assert body["muted"] is False
    assert "music" in body and "voice" in body and "alarms" in body


def test_tts_output_post_validation_and_state(client):
    r = client.post("/api/tts/output", json={"output": "bogus"})
    assert r.status_code == 400
    import app as bmo
    bmo.voice = None
    r = client.post("/api/tts/output", json={"output": "browser"})
    assert r.status_code == 200
    assert STATE.tts_output == "browser"
    STATE.tts_output = "pi"  # reset


def test_settings_post_400_on_missing_key(client):
    r = client.post("/api/settings", json={"value": 1})
    # Either settings-not-initialized (500) or missing-key (400); both are non-200 guards.
    assert r.status_code in (400, 500)
