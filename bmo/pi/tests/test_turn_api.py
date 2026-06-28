"""Unit tests for routes.turn_api — ephemeral TURN credential minting (PHASE-53B).

Verifies the credential is the coturn REST-API long-term form
(`username = "<expiry>:<id>"`, `credential = base64(HMAC-SHA1(secret, username))`),
that ttl is clamped, the id is sanitised, and that a missing secret yields 503.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time

import pytest
from flask import Flask

from routes.turn_api import register_turn, reset_turn_for_tests

_SECRET = "test-shared-secret-deadbeef"


@pytest.fixture
def turn_client():
    reset_turn_for_tests()
    app = Flask(__name__)
    app.config["TESTING"] = True
    register_turn(app, shared_secret=_SECRET)
    yield app.test_client()
    reset_turn_for_tests()


def _expected_credential(username: str) -> str:
    return base64.b64encode(
        hmac.new(_SECRET.encode(), username.encode(), hashlib.sha1).digest()
    ).decode()


def test_mints_valid_hmac_credential(turn_client):
    before = int(time.time())
    data = turn_client.get("/api/turn-credentials?ttl=3600&id=alice").get_json()
    after = int(time.time())

    assert data["ttl"] == 3600
    assert data["realm"] == "dndvtt"
    assert any(u.startswith("turn:") for u in data["urls"])

    expiry_str, uid = data["username"].split(":", 1)
    expiry = int(expiry_str)
    assert uid == "alice"
    # expiry is now + ttl (within the test's wall-clock window)
    assert before + 3600 <= expiry <= after + 3600
    # credential is the exact HMAC the server claims (so coturn will accept it)
    assert data["credential"] == _expected_credential(data["username"])


def test_ttl_is_clamped(turn_client):
    assert turn_client.get("/api/turn-credentials?ttl=5").get_json()["ttl"] == 60
    assert turn_client.get("/api/turn-credentials?ttl=999999").get_json()["ttl"] == 86400
    assert turn_client.get("/api/turn-credentials?ttl=notanint").get_json()["ttl"] == 3600


def test_id_is_sanitised_to_prevent_colon_injection(turn_client):
    # A ':' in the id would corrupt the "<expiry>:<id>" username grammar.
    data = turn_client.get("/api/turn-credentials?id=ev:il/../x").get_json()
    _, uid = data["username"].split(":", 1)
    assert uid == "evilx"
    assert data["credential"] == _expected_credential(data["username"])


def test_default_id_when_missing(turn_client):
    data = turn_client.get("/api/turn-credentials").get_json()
    assert data["username"].split(":", 1)[1] == "dndvtt"


def test_503_when_no_secret_configured():
    reset_turn_for_tests()
    app = Flask(__name__)
    app.config["TESTING"] = True
    # No shared_secret override, and point the file lookup at a path that won't exist.
    import os

    os.environ["TURN_SHARED_SECRET_FILE"] = "/nonexistent/turn-secret"
    os.environ.pop("TURN_SHARED_SECRET", None)
    register_turn(app)
    try:
        r = app.test_client().get("/api/turn-credentials")
        assert r.status_code == 503
        assert r.get_json()["error"] == "turn-not-configured"
    finally:
        os.environ.pop("TURN_SHARED_SECRET_FILE", None)
        reset_turn_for_tests()
