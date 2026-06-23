"""Tests for the Dungeon Table Online SPA blueprint (routes/webapp_api.py)."""

from __future__ import annotations

import importlib
import os

from flask import Flask


def _make_app(dist_dir):
    # The blueprint binds static_folder at import, so the serve root must be set
    # via env BEFORE the module is (re)loaded.
    os.environ["DND_WEB_DIST"] = str(dist_dir)
    import routes.webapp_api as mod

    importlib.reload(mod)
    app = Flask(__name__)
    mod.register_webapp(app)
    return app


def test_index_served_when_deployed(tmp_path):
    (tmp_path / "index.html").write_text("<!doctype html><title>DTO</title>")
    client = _make_app(tmp_path).test_client()
    resp = client.get("/DungeonTableOnline/")
    assert resp.status_code == 200
    assert b"DTO" in resp.data


def test_asset_served(tmp_path):
    (tmp_path / "index.html").write_text("x")
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "app.js").write_text("console.log(1)")
    resp = _make_app(tmp_path).test_client().get("/DungeonTableOnline/assets/app.js")
    assert resp.status_code == 200
    assert b"console.log" in resp.data


def test_unknown_path_404(tmp_path):
    # In-memory router -> no server-side deep links; unknown asset paths 404.
    (tmp_path / "index.html").write_text("INDEX")
    resp = _make_app(tmp_path).test_client().get("/DungeonTableOnline/assets/missing.js")
    assert resp.status_code == 404


def test_path_traversal_rejected(tmp_path):
    (tmp_path / "index.html").write_text("INDEX")
    secret = tmp_path.parent / "secret.txt"
    secret.write_text("TOPSECRET")
    resp = _make_app(tmp_path).test_client().get("/DungeonTableOnline/../secret.txt")
    assert b"TOPSECRET" not in resp.data


def test_not_deployed_returns_friendly_404(tmp_path):
    resp = _make_app(tmp_path / "missing").test_client().get("/DungeonTableOnline/")
    assert resp.status_code == 404
    assert b"not deployed" in resp.data.lower()
