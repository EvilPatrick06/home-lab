"""PHASE-16 16F — routes/tv_api.py blueprint + state/path relocation."""

import os
from unittest.mock import MagicMock

import pytest
from flask import Flask

from routes import tv_api
from state import STATE


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(tv_api, "_tv_cmd", lambda action, **kw: {"ok": True})
    flask_app = Flask(__name__)
    tv_api.register_tv(flask_app)
    flask_app.config["TESTING"] = True
    yield flask_app.test_client()
    STATE.tv_auto_skip = False
    STATE.tv_is_on = True


def test_auto_skip_get_reflects_state(client):
    STATE.tv_auto_skip = False
    assert client.get("/api/tv/auto-skip").get_json()["enabled"] is False
    STATE.tv_auto_skip = True
    assert client.get("/api/tv/auto-skip").get_json()["enabled"] is True


def test_auto_skip_toggle_flips_state(client, monkeypatch):
    monkeypatch.setattr(tv_api.threading, "Thread", MagicMock())  # don't spawn the real loop
    STATE.tv_auto_skip = False
    r = client.post("/api/tv/auto-skip")
    assert r.get_json()["enabled"] is True
    assert STATE.tv_auto_skip is True
    r = client.post("/api/tv/auto-skip")
    assert r.get_json()["enabled"] is False


def test_launch_rejects_unknown_app(client):
    r = client.post("/api/tv/launch", json={"app": "nope"})
    assert r.status_code == 400
    assert "Unknown app" in r.get_json()["error"]


def test_key_requires_pairing_when_no_cert(client, monkeypatch):
    monkeypatch.setattr(tv_api.os.path, "exists", lambda p: False)
    r = client.post("/api/tv/key", json={"key": "up"})
    assert r.status_code == 503


def test_apps_lists_known_apps(client):
    apps = client.get("/api/tv/apps").get_json()["apps"]
    assert "youtube" in apps and "netflix" in apps


def test_path_constants_resolve_under_bmo_pi():
    # __file__ relocation: routes/tv_api.py → +1 dirname keeps the worker under bmo/pi/services.
    assert tv_api._TV_WORKER.endswith(os.path.join("services", "tv_worker.py"))
    assert os.path.basename(tv_api._TV_CERT_DIR) == "pi"
    assert tv_api._TV_PYTHON.endswith(os.path.join("venv", "bin", "python3"))


# ── PHASE-11 11D — pair flow pre-flights TV reachability ─────────────


def test_pair_start_unreachable_returns_handled_signal(client, monkeypatch):
    """A powered-off / unreachable TV must surface a handled 'unreachable'
    result (not a PIN prompt / 500)."""
    monkeypatch.setattr(tv_api, "_tv_reachable", lambda *a, **k: False)
    r = client.post("/api/tv/pair/start")
    assert r.status_code == 200
    data = r.get_json()
    assert data.get("unreachable") is True
    assert "power" in data.get("error", "").lower() or "reach" in data.get("error", "").lower()


def test_pair_start_reachable_proceeds(client, monkeypatch):
    """When the TV is reachable the pair flow proceeds to the PIN step."""
    monkeypatch.setattr(tv_api, "_tv_reachable", lambda *a, **k: True)
    # client fixture stubs _tv_cmd -> {"ok": True}
    r = client.post("/api/tv/pair/start")
    assert r.status_code == 200
    data = r.get_json()
    assert not data.get("unreachable")
    assert data.get("ok") is True


# ── PHASE-13 13A: TV worker read-timeout (fail fast, not ~30s hang) ──

def test_tv_cmd_times_out_and_resets_worker(monkeypatch):
    """13A: when the worker stdout never becomes ready (TV off), _tv_cmd must
    fail fast via the select() gate, never block on readline(), and reset the
    worker so a half-open handshake can't wedge the next attempt."""
    monkeypatch.setattr(tv_api, "_ensure_tv_worker", lambda: True)
    fake = MagicMock()
    fake.poll.return_value = None
    monkeypatch.setattr(tv_api, "_tv_proc", fake)
    monkeypatch.setattr(tv_api.select, "select", lambda r, w, x, t: ([], [], []))
    r = tv_api._tv_cmd("pair_start", timeout=0.01)
    assert r == {"error": "TV unreachable", "timeout": True}
    fake.stdout.readline.assert_not_called()
    assert tv_api._tv_proc is None


def test_pair_start_timeout_returns_503(client, monkeypatch):
    """13A: a TV-off pairing that times out returns a fast 503 'unreachable',
    not a ~30s hang or a generic 500."""
    monkeypatch.setattr(tv_api, "_tv_reachable", lambda *a, **k: True)
    monkeypatch.setattr(tv_api, "_tv_cmd",
                        lambda action, **kw: {"error": "TV unreachable", "timeout": True})
    r = client.post("/api/tv/pair/start")
    assert r.status_code == 503
    assert r.get_json().get("unreachable") is True


def test_pair_finish_timeout_returns_503(client, monkeypatch):
    """13A: a pair_finish that times out also returns 503 'unreachable'."""
    monkeypatch.setattr(tv_api, "_tv_cmd",
                        lambda action, **kw: {"error": "TV unreachable", "timeout": True})
    r = client.post("/api/tv/pair/finish", json={"pin": "1234"})
    assert r.status_code == 503
    assert r.get_json().get("unreachable") is True
