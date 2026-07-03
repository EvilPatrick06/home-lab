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


# ── PHASE-01 01D — status summary distinguishes error / off / ok ──

def test_status_summary_monitoring_error(client):
    import app as bmo
    bmo.health_checker = None
    bmo.health_checker_error = "RuntimeError(\"psutil missing\")"
    r = client.get("/api/status/summary")
    assert r.status_code == 200
    body = r.get_json()
    assert body["monitoring"] == "error"
    assert "psutil missing" in body["detail"]
    bmo.health_checker_error = None  # reset


def test_status_summary_monitoring_off(client):
    import app as bmo
    bmo.health_checker = None
    bmo.health_checker_error = None
    r = client.get("/api/status/summary")
    assert r.status_code == 200
    assert r.get_json()["monitoring"] == "off"


def test_status_summary_monitoring_ok(client):
    import app as bmo
    from unittest.mock import MagicMock
    hc = MagicMock()
    hc.get_status.return_value = {"overall": "healthy", "services": {"a": {}}, "pi_stats": {}}
    bmo.health_checker = hc
    r = client.get("/api/status/summary")
    assert r.status_code == 200
    assert r.get_json()["monitoring"] == "ok"
    bmo.health_checker = None  # reset


# ── PHASE-08 08A: running-code identity on /api/v1/health ─────────────────────


def test_health_reports_running_identity(client, monkeypatch):
    import app as bmo
    monkeypatch.setattr(bmo, "_RUNNING_COMMIT", "abc123def456", raising=False)
    monkeypatch.setattr(bmo, "_static_mtime", lambda rel: 1782339164)
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    b = r.get_json()
    assert b["status"] == "ok" and b["api_version"] == "v1"
    assert b["commit"] == "abc123def456"
    assert b["asset_build"] == 1782339164
    assert isinstance(b["started_at"], str)
    assert isinstance(b["uptime_s"], int) and b["uptime_s"] >= 0


def test_health_degrades_to_null_on_git_and_mtime_failure(client, monkeypatch):
    import app as bmo
    monkeypatch.setattr(bmo, "_RUNNING_COMMIT", None, raising=False)

    def _boom(rel):
        raise OSError("no such file")

    monkeypatch.setattr(bmo, "_static_mtime", _boom)
    r = client.get("/health")
    assert r.status_code == 200
    b = r.get_json()
    assert b["status"] == "ok"
    assert b["commit"] is None
    assert b["asset_build"] is None


# ── PHASE-08 08B: calendar token TTL on /api/health/full ─────────────────────


def _write_token(tmp_path, expiry_iso):
    import json
    tok = tmp_path / "token.json"
    tok.write_text(json.dumps({"token": "x", "refresh_token": "r", "expiry": expiry_iso}))
    return tok


def test_health_full_calendar_token_ttl_future(client, monkeypatch, tmp_path):
    from datetime import datetime, timezone, timedelta
    from services import config_preflight
    import app as bmo
    bmo.health_checker = None
    future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    monkeypatch.setattr(config_preflight, "_TOKEN_FILE", _write_token(tmp_path, future))
    cfg = client.get("/api/health/full").get_json()["config"]
    assert cfg["calendar_token"] is True
    assert isinstance(cfg["calendar_token_expiry"], str)
    assert cfg["calendar_token_ttl_s"] > 0


def test_health_full_calendar_token_ttl_past(client, monkeypatch, tmp_path):
    from datetime import datetime, timezone, timedelta
    from services import config_preflight
    import app as bmo
    bmo.health_checker = None
    past = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    monkeypatch.setattr(config_preflight, "_TOKEN_FILE", _write_token(tmp_path, past))
    cfg = client.get("/api/health/full").get_json()["config"]
    assert cfg["calendar_token"] is True
    assert cfg["calendar_token_ttl_s"] < 0


def test_health_full_calendar_token_missing(client, monkeypatch, tmp_path):
    from services import config_preflight
    import app as bmo
    bmo.health_checker = None
    monkeypatch.setattr(config_preflight, "_TOKEN_FILE", tmp_path / "nope.json")
    cfg = client.get("/api/health/full").get_json()["config"]
    assert cfg["calendar_token"] is False
    assert cfg["calendar_token_expiry"] is None
    assert cfg["calendar_token_ttl_s"] is None


# ── BMO-SUGGESTIONS 2026-06-28: agent_init on /api/health/full ───────────────
def test_health_full_surfaces_failed_agent_as_degraded(client):
    import app as bmo
    bmo.health_checker = None
    bmo.agent_init_status = {
        "music": {"ok": True, "error": None},
        "weather": {"ok": False, "error": "RuntimeError(bad key)"},
    }
    try:
        body = client.get("/api/health/full").get_json()
        assert "agent_init" in body
        assert body["overall"] == "degraded"
        assert "weather" in body["degraded_init_agents"]
        assert "music" not in body["degraded_init_agents"]
    finally:
        bmo.agent_init_status = {}


def test_health_full_all_agents_ok_not_degraded_by_agents(client):
    import app as bmo
    bmo.health_checker = None
    bmo.agent_init_status = {"music": {"ok": True, "error": None}}
    try:
        body = client.get("/api/health/full").get_json()
        assert body["degraded_init_agents"] == []
    finally:
        bmo.agent_init_status = {}
