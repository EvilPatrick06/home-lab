"""Unit tests for routes.sounds_api — Pi-hosted bundled-sound serving.

Each test points `register_sounds` at a fixture dir (no dependency on the real
dnd-app sound tree).
"""

from __future__ import annotations

import pytest
from flask import Flask

from routes.sounds_api import register_sounds, reset_sounds_for_tests


@pytest.fixture
def snd_client(tmp_path):
    reset_sounds_for_tests()
    (tmp_path / "dice").mkdir()
    (tmp_path / "dice" / "d20-1.mp3").write_bytes(b"ID3fake-mp3-bytes")
    (tmp_path / "ambient").mkdir()
    (tmp_path / "ambient" / "tavern.mp3").write_bytes(b"fake-ogg")
    (tmp_path / "notes.txt").write_text("ignored", encoding="utf-8")  # non-audio skipped
    app = Flask(__name__)
    app.config["TESTING"] = True
    register_sounds(app, sounds_dir=str(tmp_path))
    yield app.test_client()
    reset_sounds_for_tests()


def test_manifest_lists_audio_with_size(snd_client):
    data = snd_client.get("/api/sounds/manifest").get_json()
    assert data["version"]
    assert set(data["files"].keys()) == {"dice/d20-1.mp3", "ambient/tavern.mp3"}
    assert data["files"]["dice/d20-1.mp3"]["size"] == len(b"ID3fake-mp3-bytes")
    assert "notes.txt" not in data["files"]


def test_file_serves_bytes(snd_client):
    r = snd_client.get("/api/sounds/file?path=dice/d20-1.mp3")
    assert r.status_code == 200
    assert r.data == b"ID3fake-mp3-bytes"


def test_file_rejects_traversal(snd_client):
    r = snd_client.get("/api/sounds/file?path=../secret.mp3")
    assert r.status_code in (400, 403)


def test_file_requires_audio_ext(snd_client):
    assert snd_client.get("/api/sounds/file?path=notes.txt").status_code == 400


def test_file_404_when_missing(snd_client):
    assert snd_client.get("/api/sounds/file?path=dice/nope.mp3").status_code == 404


def test_empty_when_dir_absent(tmp_path):
    reset_sounds_for_tests()
    app = Flask(__name__)
    register_sounds(app, sounds_dir=str(tmp_path / "does-not-exist"))
    data = app.test_client().get("/api/sounds/manifest").get_json()
    assert data["files"] == {}
    reset_sounds_for_tests()
