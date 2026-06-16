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
