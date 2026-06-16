"""PHASE-16 16G — routes/chat_api.py (chat + DnD), driven through `import app`."""

import json

import app  # noqa: F401 — ensure blueprint registered at import
from services import chat_history
from tests.test_app_endpoints import bmo_app, client  # noqa: F401 (pytest fixtures)


def test_chat_requires_message(client):
    assert client.post("/api/chat", json={}).status_code == 400
    assert client.post("/api/chat", json={"message": ""}).status_code == 400


def test_chat_413_over_max_len(client):
    big = "x" * (chat_history.MAX_CHAT_MESSAGE_LEN + 1)
    assert client.post("/api/chat", json={"message": big}).status_code == 413


def test_chat_happy_path_normalizes_spoofed_voice_speaker(client, tmp_path, monkeypatch):
    monkeypatch.setattr(chat_history, "RECENT_CHAT_FILE", str(tmp_path / "recent.json"))
    chat_history.set_agent_resolver(lambda: None)  # avoid DnD-log writes
    r = client.post("/api/chat", json={"message": "hi", "speaker": "voice:gavin"})
    assert r.status_code == 200
    saved = json.loads((tmp_path / "recent.json").read_text())
    user_msg = next(m for m in saved if m["role"] == "user")
    # voice:gavin without source_voice → demoted to "text" (QA #2 spoof guard)
    assert user_msg["speaker"] == "text"


def test_dnd_load_rejects_out_of_jail_path(client):
    r = client.post("/api/dnd/load", json={"characters": ["/etc/passwd"]})
    assert r.status_code == 403


def test_dnd_load_400_on_empty_characters(client):
    assert client.post("/api/dnd/load", json={"characters": []}).status_code == 400


def test_chat_history_returns_list(client, tmp_path, monkeypatch):
    monkeypatch.setattr(chat_history, "RECENT_CHAT_FILE", str(tmp_path / "recent.json"))
    r = client.get("/api/chat/history")
    assert r.status_code == 200
    assert isinstance(r.get_json(), list)
