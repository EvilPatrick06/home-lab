"""Tests for the public web-build AI DM tool endpoints (routes.chat_api):
/api/dnd/public/{battlemap,analyze-map,recap,qa}. cloud_chat is mocked so the
suite never calls a real LLM."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from flask import Flask

from routes.chat_api import register_chat


@pytest.fixture
def client():
    # Isolate endpoint-LOGIC tests from the shared per-IP rate limiter (in the full
    # suite another test init_app's the limiter, so all our calls share one 127.0.0.1
    # bucket and would hit the public cap). Restore after.
    from extensions import limiter

    prev = limiter.enabled
    limiter.enabled = False
    app = Flask(__name__)
    app.config["TESTING"] = True
    register_chat(app)
    yield app.test_client()
    limiter.enabled = prev


def _mock_chat(text):
    return patch("services.cloud_providers.cloud_chat", return_value=text)


# ── battlemap ─────────────────────────────────────────────────────────


def test_battlemap_returns_spec(client):
    spec = (
        '{"name":"Crypt","theme":"crypt","width":20,"height":20,"ambientLight":"dim",'
        '"rooms":[],"corridors":[],"doors":[],"spawns":{"party":[1,1],"enemies":[]}}'
    )
    with _mock_chat(spec):
        r = client.post("/api/dnd/public/battlemap", json={"prompt": "a crypt"})
    assert r.status_code == 200
    j = r.get_json()
    assert j["success"] is True and j["spec"]["name"] == "Crypt"


def test_battlemap_strips_markdown_fence(client):
    with _mock_chat('```json\n{"name":"X","width":10,"height":10}\n```'):
        r = client.post("/api/dnd/public/battlemap", json={"prompt": "x"})
    assert r.status_code == 200 and r.get_json()["spec"]["name"] == "X"


def test_battlemap_requires_prompt(client):
    assert client.post("/api/dnd/public/battlemap", json={}).status_code == 400


def test_battlemap_rejects_non_json_model_output(client):
    with _mock_chat("sorry, here is a description but no JSON"):
        r = client.post("/api/dnd/public/battlemap", json={"prompt": "x"})
    assert r.status_code == 502


# ── analyze-map ───────────────────────────────────────────────────────


def test_analyze_map(client):
    with _mock_chat("Tactical analysis: hold the chokepoint."):
        r = client.post("/api/dnd/public/analyze-map", json={"mapDescription": "Map: Foo (10x10)"})
    assert r.status_code == 200 and r.get_json()["analysis"].startswith("Tactical")


def test_analyze_map_requires_description(client):
    assert client.post("/api/dnd/public/analyze-map", json={}).status_code == 400


# ── recap ─────────────────────────────────────────────────────────────


def test_recap_start(client):
    with _mock_chat("Previously on... the heroes fled the crypt."):
        r = client.post("/api/dnd/public/recap", json={"kind": "start", "context": "[CONVERSATION]\nPlayer: hi"})
    assert r.status_code == 200 and r.get_json()["text"].startswith("Previously")


def test_recap_requires_context(client):
    assert client.post("/api/dnd/public/recap", json={"kind": "end"}).status_code == 400


# ── qa ────────────────────────────────────────────────────────────────


def test_qa(client):
    with _mock_chat("Per the JOURNAL, the door is locked."):
        r = client.post("/api/dnd/public/qa", json={"question": "is the door locked?", "context": "[JOURNAL]\nlocked door"})
    assert r.status_code == 200 and "JOURNAL" in r.get_json()["answer"]


def test_qa_requires_question(client):
    assert client.post("/api/dnd/public/qa", json={"context": "x"}).status_code == 400
