"""Tests for the Dungeon Table Online SPA blueprint (routes/webapp_api.py)."""

from __future__ import annotations

import importlib
import os

from flask import Flask


def _make_app(dist_dir):
    import routes.webapp_api as mod

    importlib.reload(mod)
    mod._DIST_DIR = os.path.realpath(str(dist_dir))
    app = Flask(__name__)
    mod.register_webapp(app)
    return app


def test_index_served_when_deployed(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>DTO</title>")
    app = _make_app(tmp_path)
    client = app.test_client()
    resp = client.get("/DungeonTableOnline/")
    assert resp.status_code == 200
    assert b"DTO" in resp.data


def test_asset_served(tmp_path):
    (tmp_path / "index.html").write_text("x")
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "app.js").write_text("console.log(1)")
    app = _make_app(tmp_path)
    resp = app.test_client().get("/DungeonTableOnline/assets/app.js")
    assert resp.status_code == 200
    assert b"console.log" in resp.data


def test_spa_fallback_for_unknown_path(tmp_path):
    (tmp_path / "index.html").write_text("INDEX")
    app = _make_app(tmp_path)
    resp = app.test_client().get("/DungeonTableOnline/some/deep/route")
    assert resp.status_code == 200
    assert b"INDEX" in resp.data


def test_path_traversal_rejected(tmp_path):
    (tmp_path / "index.html").write_text("INDEX")
    secret = tmp_path.parent / "secret.txt"
    secret.write_text("TOPSECRET")
    app = _make_app(tmp_path)
    resp = app.test_client().get("/DungeonTableOnline/../secret.txt")
    # Flask normalizes ../ — either 404 or the SPA fallback, never the secret.
    assert b"TOPSECRET" not in resp.data


def test_not_deployed_returns_friendly_404(tmp_path):
    app = _make_app(tmp_path / "missing")
    resp = app.test_client().get("/DungeonTableOnline/")
    assert resp.status_code == 404
    assert b"not deployed" in resp.data.lower()
