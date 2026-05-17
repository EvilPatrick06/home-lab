"""Tests for routes/ide.py blueprint endpoints (QA #8, #9, #10, 2026-05-17).

The /api/ide/* surface inside the main BMO app:
- file/create silently dropped `content` (#9) — now writes it.
- folder-only creates returned 500 on trailing-slash paths (#10) — now /folder/create.
- /tree didn't surface which sandbox roots it accepts (#8) — now embeds sandbox_roots.

The blueprint requires _ide_safe_path to validate against _IDE_ALLOWED_ROOTS.
We patch the allow-list to include tmp_path so tests work without touching
~/home-lab on the Pi.
"""

import json
import sys
from unittest.mock import MagicMock, patch

import pytest

# Mock the heavyweight imports the blueprint pulls in.
_terminal_service_stub = MagicMock()
_terminal_service_stub.TerminalManager = MagicMock
sys.modules.setdefault("dev.terminal_service", _terminal_service_stub)


@pytest.fixture()
def ide_client(tmp_path):
    """Flask test client with the blueprint mounted and tmp_path whitelisted."""
    from flask import Flask
    import routes.ide as ide_module

    # Whitelist tmp_path so _ide_safe_path accepts files inside it.
    original_roots = list(ide_module._IDE_ALLOWED_ROOTS)
    ide_module._IDE_ALLOWED_ROOTS = original_roots + [str(tmp_path.resolve())]

    app = Flask(__name__)
    app.config["TESTING"] = True
    app.register_blueprint(ide_module.ide_bp)

    try:
        with app.test_client() as c:
            yield c, tmp_path
    finally:
        ide_module._IDE_ALLOWED_ROOTS = original_roots


def _json(response):
    return json.loads(response.data)


# ── QA #9: file/create honors content ─────────────────────────────────────────

def test_file_create_writes_content(ide_client):
    client, tmp_path = ide_client
    target = tmp_path / "hello.txt"
    res = client.post("/api/ide/file/create", json={"path": str(target), "content": "hello world"})
    assert res.status_code == 200, _json(res)
    body = _json(res)
    assert body["success"] is True
    assert body["bytes_written"] == len("hello world".encode("utf-8"))
    assert target.read_text(encoding="utf-8") == "hello world"


def test_file_create_without_content_creates_empty(ide_client):
    client, tmp_path = ide_client
    target = tmp_path / "empty.txt"
    res = client.post("/api/ide/file/create", json={"path": str(target)})
    assert res.status_code == 200
    body = _json(res)
    assert body["bytes_written"] == 0
    assert target.read_text() == ""


def test_file_create_refuses_to_clobber(ide_client):
    client, tmp_path = ide_client
    target = tmp_path / "existing.txt"
    target.write_text("keep me", encoding="utf-8")
    res = client.post("/api/ide/file/create", json={"path": str(target), "content": "OVERWRITE"})
    assert res.status_code == 409
    assert target.read_text() == "keep me"


def test_file_create_missing_path_returns_400(ide_client):
    client, _ = ide_client
    res = client.post("/api/ide/file/create", json={})
    assert res.status_code == 400


def test_file_create_unicode_content_byte_count(ide_client):
    """bytes_written counts UTF-8 bytes, not Python str length."""
    client, tmp_path = ide_client
    target = tmp_path / "emoji.txt"
    res = client.post("/api/ide/file/create", json={"path": str(target), "content": "rocket🚀"})
    assert res.status_code == 200
    body = _json(res)
    assert body["bytes_written"] == len("rocket🚀".encode("utf-8"))


# ── QA #10: folder/create handles trailing slash ──────────────────────────────

def test_folder_create_handles_trailing_slash(ide_client):
    client, tmp_path = ide_client
    target = tmp_path / "newdir"
    res = client.post("/api/ide/folder/create", json={"path": str(target) + "/"})
    assert res.status_code == 200, _json(res)
    body = _json(res)
    assert body["success"] is True
    assert body["is_dir"] is True
    assert target.is_dir()


def test_folder_create_idempotent(ide_client):
    client, tmp_path = ide_client
    target = tmp_path / "existing-folder"
    target.mkdir()
    res = client.post("/api/ide/folder/create", json={"path": str(target)})
    assert res.status_code == 200
    assert target.is_dir()


def test_folder_create_missing_path_returns_400(ide_client):
    client, _ = ide_client
    res = client.post("/api/ide/folder/create", json={"path": ""})
    assert res.status_code == 400
    res = client.post("/api/ide/folder/create", json={"path": "/"})
    # rstrip("/") of "/" yields "" — also a missing-path case.
    assert res.status_code == 400


# ── QA #8: tree surfaces sandbox_roots + sandbox-roots endpoint ───────────────

def test_sandbox_roots_endpoint(ide_client):
    client, tmp_path = ide_client
    res = client.get("/api/ide/sandbox/roots")
    assert res.status_code == 200
    body = _json(res)
    assert "roots" in body
    assert str(tmp_path.resolve()) in body["roots"]
