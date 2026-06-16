"""PHASE-16 16D — routes/music_api.py blueprint, mounted on a fresh Flask app."""

from unittest.mock import MagicMock

import pytest
from flask import Flask

from routes import music_api


@pytest.fixture()
def client(monkeypatch):
    music = MagicMock()
    monkeypatch.setattr(music_api, "_music", lambda: music)
    monkeypatch.setattr(music_api, "unmute_sink", MagicMock())
    monkeypatch.setattr(music_api, "get_system_audio_state", lambda: {"volume": 50, "muted": False})
    flask_app = Flask(__name__)
    music_api.register_music(flask_app)
    flask_app.config["TESTING"] = True
    c = flask_app.test_client()
    c._music = music  # expose for assertions
    return c


def test_search_requires_query(client):
    assert client.get("/api/music/search").status_code == 400


def test_play_returns_full_state_shape(client, monkeypatch):
    client._music.get_state.return_value = {"is_playing": True}
    r = client.post("/api/music/play", json={"song": {"id": "x"}})
    body = r.get_json()
    assert body["ok"] is True
    assert body["is_playing"] is True
    assert body["muted"] is False
    assert body["volume"] == 50
    assert "warning" in body
    music_api.unmute_sink.assert_called()  # auto-unmute on play


def test_play_warns_on_muted_sink(client, monkeypatch):
    client._music.get_state.return_value = {"is_playing": True}
    monkeypatch.setattr(music_api, "get_system_audio_state", lambda: {"volume": 0, "muted": True})
    r = client.post("/api/music/play", json={})
    assert "muted" in r.get_json()["warning"]


def test_play_no_unmute_skips_unmute(client):
    client._music.get_state.return_value = {"is_playing": True}
    client.post("/api/music/play", json={"no_unmute": True})
    music_api.unmute_sink.assert_not_called()


def test_queue_add_requires_song(client):
    assert client.post("/api/music/queue/add", json={}).status_code == 400
