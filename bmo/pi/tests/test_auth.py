"""Tests for the Discord-OAuth account API (routes.auth_api) + JWT/accounts.

The Discord HTTP calls are monkeypatched, so the suite never hits the network.
Each test gets a fresh throwaway accounts DB via ``register_auth(app, db_path=...)``.
"""

from __future__ import annotations

import pytest
from flask import Flask

import routes.auth_api as auth_api
from routes.auth_api import register_auth
from services import accounts, jwt_util


@pytest.fixture
def app_client(tmp_path, monkeypatch):
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["SECRET_KEY"] = "test-secret"
    register_auth(app, db_path=str(tmp_path / "accounts.db"))
    # Pretend Discord OAuth is configured (module-level constants read env at import).
    monkeypatch.setattr(auth_api, "DISCORD_CLIENT_ID", "cid")
    monkeypatch.setattr(auth_api, "DISCORD_CLIENT_SECRET", "csecret")
    monkeypatch.setattr(
        auth_api, "DISCORD_REDIRECT_URI", "https://bmo.mybmoai.work/api/auth/discord/callback"
    )
    return app, app.test_client()


# ── jwt_util ──────────────────────────────────────────────────────────


def test_jwt_roundtrip():
    tok, payload = jwt_util.mint_token(sub="123", name="Bob", secret="s", token_version=2, ttl_seconds=60)
    claims = jwt_util.verify_token(tok, "s")
    assert claims["sub"] == "123"
    assert claims["jti"] == payload["jti"]
    assert claims["tv"] == 2
    # wrong key / tampering → None, never raises
    assert jwt_util.verify_token(tok, "wrong-secret") is None
    assert jwt_util.verify_token("not-a-jwt", "s") is None


def test_jwt_expired():
    tok, _ = jwt_util.mint_token(sub="1", name="x", secret="s", token_version=1, ttl_seconds=-1)
    assert jwt_util.verify_token(tok, "s") is None


# ── accounts store ────────────────────────────────────────────────────


def test_account_store_upsert_and_session(app_client):
    accounts.upsert_user({"discord_id": "9", "username": "neo", "global_name": "Neo", "avatar": None, "email": None})
    again = accounts.upsert_user({"discord_id": "9", "username": "neo2", "global_name": "Neo", "avatar": "a", "email": "n@x"})
    assert again["username"] == "neo2"
    assert again["token_version"] == 1  # preserved across upsert

    _, payload = jwt_util.mint_token(sub="9", name="Neo", secret="s", token_version=1, ttl_seconds=60)
    accounts.create_session(
        jti=payload["jti"], user_id="9", issued_at=payload["iat"], expires_at=payload["exp"]
    )
    assert accounts.session_active(payload["jti"]) is True
    accounts.revoke_session(payload["jti"])
    assert accounts.session_active(payload["jti"]) is False
    assert accounts.session_active("nonexistent") is False


# ── /api/auth ─────────────────────────────────────────────────────────


def test_status_reports_configured(app_client):
    _, client = app_client
    assert client.get("/api/auth/status").get_json()["configured"] is True


def test_start_redirects_to_discord(app_client):
    _, client = app_client
    r = client.get("/api/auth/discord/start")
    assert r.status_code == 302
    loc = r.headers["Location"]
    assert loc.startswith("https://discord.com/oauth2/authorize")
    assert "state=" in loc and "client_id=cid" in loc


def test_start_rejects_offlist_return_to(app_client):
    _, client = app_client
    r = client.get("/api/auth/discord/start?return_to=https://evil.example/steal")
    assert r.status_code == 400


def test_callback_creates_user_and_delivers_token(app_client, monkeypatch):
    app, client = app_client

    class _Resp:
        def __init__(self, status, payload):
            self.status_code = status
            self._p = payload

        def json(self):
            return self._p

    monkeypatch.setattr(auth_api.requests, "post", lambda url, **kw: _Resp(200, {"access_token": "abc"}))
    monkeypatch.setattr(
        auth_api.requests,
        "get",
        lambda url, **kw: _Resp(200, {"id": "42", "username": "bob", "global_name": "Bob", "avatar": "av", "email": "b@x"}),
    )
    with app.app_context():
        state = auth_api._serializer().dumps({"r": "https://bmo.mybmoai.work/DungeonTableOnline/"})

    r = client.get(f"/api/auth/discord/callback?code=thecode&state={state}")
    assert r.status_code == 302
    assert "#token=" in r.headers["Location"]
    saved = accounts.get_user("42")
    assert saved and saved["username"] == "bob" and saved["email"] == "b@x"


def test_callback_desktop_loopback_uses_query_token(app_client, monkeypatch):
    app, client = app_client

    class _Resp:
        def __init__(self, status, payload):
            self.status_code = status
            self._p = payload

        def json(self):
            return self._p

    monkeypatch.setattr(auth_api.requests, "post", lambda url, **kw: _Resp(200, {"access_token": "abc"}))
    monkeypatch.setattr(
        auth_api.requests, "get", lambda url, **kw: _Resp(200, {"id": "55", "username": "dm", "global_name": None, "avatar": None, "email": None})
    )
    with app.app_context():
        state = auth_api._serializer().dumps({"r": "http://127.0.0.1:53217/cb"})

    r = client.get(f"/api/auth/discord/callback?code=c&state={state}")
    assert r.status_code == 302
    # loopback delivery uses a query param (the local server reads it), not a fragment
    assert "?token=" in r.headers["Location"]
    assert "#token=" not in r.headers["Location"]


def test_callback_rejects_tampered_state(app_client):
    _, client = app_client
    r = client.get("/api/auth/discord/callback?code=c&state=garbage")
    assert r.status_code == 400  # _error_page


# ── /api/account + logout ─────────────────────────────────────────────


def test_account_me_requires_token(app_client):
    _, client = app_client
    assert client.get("/api/account/me").status_code == 401


def test_account_me_and_logout_lifecycle(app_client):
    app, client = app_client
    accounts.upsert_user({"discord_id": "7", "username": "u", "global_name": "U", "avatar": None, "email": None})
    tok, payload = jwt_util.mint_token(sub="7", name="U", secret="test-secret", token_version=1, ttl_seconds=60)
    accounts.create_session(jti=payload["jti"], user_id="7", issued_at=payload["iat"], expires_at=payload["exp"], device_label="web")
    headers = {"Authorization": f"Bearer {tok}"}

    me = client.get("/api/account/me", headers=headers)
    assert me.status_code == 200 and me.get_json()["id"] == "7"

    assert client.post("/api/auth/logout", headers=headers).status_code == 200
    # session revoked → token no longer valid
    assert client.get("/api/account/me", headers=headers).status_code == 401


def test_token_version_mismatch_is_rejected(app_client):
    app, client = app_client
    accounts.upsert_user({"discord_id": "8", "username": "v", "global_name": "V", "avatar": None, "email": None})
    tok, payload = jwt_util.mint_token(sub="8", name="V", secret="test-secret", token_version=1, ttl_seconds=60)
    accounts.create_session(jti=payload["jti"], user_id="8", issued_at=payload["iat"], expires_at=payload["exp"])
    accounts.bump_token_version("8")  # logout-everywhere
    assert client.get("/api/account/me", headers={"Authorization": f"Bearer {tok}"}).status_code == 401
