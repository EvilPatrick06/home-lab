"""Unit tests for routes.library_api (Phase 36b).

Covers the /api/library manifest + path-jailed file serve, traversal rejection,
404/400 paths, and the empty-dir (un-seeded) case. Each test builds its own
Flask app pointed at a fixture library dir.
"""

from __future__ import annotations

import json

import pytest
from flask import Flask

from routes.library_api import register_library, reset_library_for_tests


@pytest.fixture
def lib_client(tmp_path):
    reset_library_for_tests()
    (tmp_path / "spells").mkdir()
    (tmp_path / "spells" / "spells.json").write_text(
        json.dumps([{"id": "fireball", "name": "Fireball"}]), encoding="utf-8"
    )
    (tmp_path / "conditions.json").write_text(
        json.dumps([{"id": "blinded"}]), encoding="utf-8"
    )
    app = Flask(__name__)
    app.config["TESTING"] = True
    register_library(app, library_dir=str(tmp_path))
    yield app.test_client()
    reset_library_for_tests()


def test_manifest_lists_files_with_hash_and_size(lib_client):
    r = lib_client.get("/api/library/manifest")
    assert r.status_code == 200
    data = r.get_json()
    assert data["version"]  # non-empty deterministic version
    assert "spells/spells.json" in data["files"]
    assert "conditions.json" in data["files"]
    entry = data["files"]["conditions.json"]
    assert len(entry["sha256"]) == 64
    assert entry["size"] > 0


def test_manifest_version_is_content_derived(tmp_path):
    # Same content → same version; changed content → different version.
    reset_library_for_tests()
    (tmp_path / "a.json").write_text('{"x":1}', encoding="utf-8")
    app1 = Flask(__name__)
    register_library(app1, library_dir=str(tmp_path))
    v1 = app1.test_client().get("/api/library/manifest").get_json()["version"]
    reset_library_for_tests()
    (tmp_path / "a.json").write_text('{"x":2}', encoding="utf-8")
    app2 = Flask(__name__)
    register_library(app2, library_dir=str(tmp_path))
    v2 = app2.test_client().get("/api/library/manifest").get_json()["version"]
    reset_library_for_tests()
    assert v1 != v2


def test_file_serves_json_with_etag_and_cache(lib_client):
    r = lib_client.get("/api/library/file?path=spells/spells.json")
    assert r.status_code == 200
    assert r.get_json()[0]["id"] == "fireball"
    assert r.headers.get("ETag")
    assert "max-age" in (r.headers.get("Cache-Control") or "")


def test_file_missing_is_404(lib_client):
    assert lib_client.get("/api/library/file?path=nope/missing.json").status_code == 404


def test_missing_path_param_is_400(lib_client):
    assert lib_client.get("/api/library/file").status_code == 400


def test_non_json_path_is_400(lib_client):
    assert lib_client.get("/api/library/file?path=spells/spells").status_code == 400


def test_traversal_escape_rejected(lib_client):
    # A .json-suffixed path that escapes the jail → 403 (or 404 if it lands nowhere).
    r = lib_client.get("/api/library/file?path=../../secrets.json")
    assert r.status_code in (403, 404)


def test_empty_library_dir_yields_empty_manifest(tmp_path):
    reset_library_for_tests()
    app = Flask(__name__)
    app.config["TESTING"] = True
    register_library(app, library_dir=str(tmp_path / "absent"))
    data = app.test_client().get("/api/library/manifest").get_json()
    assert data["files"] == {}
    reset_library_for_tests()
