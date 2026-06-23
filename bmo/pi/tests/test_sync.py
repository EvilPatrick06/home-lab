"""Tests for the per-user cloud-sync API (routes.sync_api + services.sync_store).

The Drive mirror is disabled (no rclone, no timers). Each test gets fresh
throwaway accounts + sync DBs and a real bearer token, exercising LWW, quota,
tombstones, validation, and — critically — per-user isolation.
"""

from __future__ import annotations

from contextlib import closing
from io import BytesIO

import pytest
from flask import Flask

from routes.auth_api import register_auth
from routes.sync_api import register_sync
from services import accounts, jwt_util

SECRET = "test-secret"


def _make_user_token(uid: str) -> dict:
    accounts.upsert_user(
        {"discord_id": uid, "username": f"u{uid}", "global_name": None, "avatar": None, "email": None}
    )
    tok, payload = jwt_util.mint_token(sub=uid, name="u", secret=SECRET, token_version=1, ttl_seconds=300)
    accounts.create_session(jti=payload["jti"], user_id=uid, issued_at=payload["iat"], expires_at=payload["exp"])
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture
def env(tmp_path):
    app = Flask(__name__)
    app.config["TESTING"] = True
    app.config["SECRET_KEY"] = SECRET
    register_auth(app, db_path=str(tmp_path / "accounts.db"))
    register_sync(
        app, base_dir=str(tmp_path / "sync"), db_path=str(tmp_path / "manifest.db"), mirror_enabled=False
    )
    client = app.test_client()
    headers = _make_user_token("111")
    return client, headers


def _put(client, headers, domain, eid, version, blob, mtime="100", h="hash"):
    return client.post(
        "/api/sync/object",
        data={
            "domain": domain,
            "id": eid,
            "version": str(version),
            "mtime": mtime,
            "hash": h,
            "blob": (BytesIO(blob), "b.bin"),
        },
        content_type="multipart/form-data",
        headers=headers,
    )


def test_requires_auth(env):
    client, _ = env
    assert client.get("/api/sync/manifest").status_code == 401
    assert _put(client, {}, "characters", "c1", 1, b"x").status_code == 401


def test_empty_manifest(env):
    client, h = env
    assert client.get("/api/sync/manifest", headers=h).get_json()["objects"] == []


def test_put_get_roundtrip(env):
    client, h = env
    r = _put(client, h, "characters", "c1", 1, b"hello")
    assert r.status_code == 200 and r.get_json()["accepted"] is True
    objects = client.get("/api/sync/manifest", headers=h).get_json()["objects"]
    assert len(objects) == 1 and objects[0]["id"] == "c1" and objects[0]["version"] == 1
    got = client.get("/api/sync/object?domain=characters&id=c1", headers=h)
    assert got.status_code == 200 and got.data == b"hello"
    assert got.headers["X-Sync-Version"] == "1"


def test_lww_rejects_older(env):
    client, h = env
    _put(client, h, "characters", "c1", 2, b"v2")
    j = _put(client, h, "characters", "c1", 1, b"older").get_json()
    assert j["accepted"] is False and j["winner"]["version"] == 2
    assert client.get("/api/sync/object?domain=characters&id=c1", headers=h).data == b"v2"


def test_lww_accepts_newer(env):
    client, h = env
    _put(client, h, "characters", "c1", 1, b"v1")
    assert _put(client, h, "characters", "c1", 2, b"v2").get_json()["accepted"] is True
    assert client.get("/api/sync/object?domain=characters&id=c1", headers=h).data == b"v2"


def test_delete_tombstones(env):
    client, h = env
    _put(client, h, "characters", "c1", 1, b"v1")
    r = client.delete("/api/sync/object?domain=characters&id=c1&version=2", headers=h)
    assert r.get_json()["accepted"] is True
    assert client.get("/api/sync/object?domain=characters&id=c1", headers=h).status_code == 404
    objects = client.get("/api/sync/manifest", headers=h).get_json()["objects"]
    assert len(objects) == 1 and objects[0]["deleted"] is True


def test_composite_and_binary_ids(env):
    """Keys with slashes/colons (homebrew `cat/id`, audio `cid/file`) are stored
    safely (base64url filename) and round-trip."""
    client, h = env
    assert _put(client, h, "homebrew", "spells/fireball", 1, b"\x00\x01\x02binary").get_json()["accepted"] is True
    got = client.get("/api/sync/object?domain=homebrew&id=spells/fireball", headers=h)
    assert got.status_code == 200 and got.data == b"\x00\x01\x02binary"


def test_invalid_domain_rejected(env):
    client, h = env
    assert _put(client, h, "Bad Domain!", "c1", 1, b"x").status_code == 400


def test_quota_exceeded(env):
    client, h = env
    with closing(accounts._connect()) as c:
        c.execute("UPDATE users SET quota_bytes=? WHERE discord_id=?", (10, "111"))
        c.commit()
    r = _put(client, h, "characters", "big", 1, b"x" * 50)
    assert r.status_code == 413 and r.get_json()["error"] == "quota_exceeded"


def test_user_isolation(env):
    client, h = env
    _put(client, h, "characters", "c1", 1, b"secret")
    h2 = _make_user_token("222")
    # user 222 sees none of user 111's data, and can't read their object
    assert client.get("/api/sync/manifest", headers=h2).get_json()["objects"] == []
    assert client.get("/api/sync/object?domain=characters&id=c1", headers=h2).status_code == 404
