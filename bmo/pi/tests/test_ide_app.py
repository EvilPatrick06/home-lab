"""Tests for BMO IDE Flask app (ide_app/ide_app.py).

Tests run on any OS without a real Pi, Raspberry Pi hardware, or running
Flask server — all file I/O uses tmp_path, and the TerminalManager is
mocked to avoid PTY/pty dependencies.
"""

import json
import os
import sys
from unittest.mock import MagicMock, patch

import pytest

# ── Stub out TerminalManager before importing ide_app ─────────────────────────
# terminal_service may import pty/fcntl which are Linux-only.
_terminal_service_stub = MagicMock()
_terminal_service_stub.TerminalManager = MagicMock
sys.modules.setdefault("terminal_service", _terminal_service_stub)

# Also stub flask_socketio if not installed
try:
    import flask_socketio  # noqa: F401
except ImportError:
    _sio_stub = MagicMock()
    _sio_stub.SocketIO = MagicMock
    _sio_stub.emit = MagicMock()
    sys.modules["flask_socketio"] = _sio_stub


# ── Import the module under test ───────────────────────────────────────────────

# Patch SocketIO at class level so socketio.run() is a no-op
with patch.dict(sys.modules):
    # We need the real Flask but a stub SocketIO
    import flask_socketio as _fsk

    _orig_socketio_cls = getattr(_fsk, "SocketIO", None)

    class _StubSocketIO:
        def __init__(self, *a, **kw):
            pass

        def on(self, *a, **kw):
            return lambda f: f

        def emit(self, *a, **kw):
            pass

        def run(self, *a, **kw):
            pass

    _fsk.SocketIO = _StubSocketIO

    # Ensure sys.path includes the pi root so `terminal_service` import works
    _pi_root = os.path.join(os.path.dirname(__file__), "..")
    if _pi_root not in sys.path:
        sys.path.insert(0, _pi_root)

    # Ensure the ide_app package dir is on path
    _ide_dir = os.path.join(_pi_root, "ide_app")
    if _ide_dir not in sys.path:
        sys.path.insert(0, _ide_dir)

    import ide_app as _ide_module  # type: ignore

    # Restore original SocketIO so other tests aren't affected
    if _orig_socketio_cls is not None:
        _fsk.SocketIO = _orig_socketio_cls


# Grab the Flask app object
_app = _ide_module.app
_app.config["TESTING"] = True


@pytest.fixture()
def client():
    """Flask test client with a fresh application context."""
    with _app.test_client() as c:
        yield c


# ── Helpers ───────────────────────────────────────────────────────────────────


def _json(response):
    return json.loads(response.data)


# ═════════════════════════════════════════════════════════════════════════════
# GET /api/files/tree
# ═════════════════════════════════════════════════════════════════════════════


class TestFileTree:
    def test_returns_dirs_and_files(self, client, tmp_path):
        (tmp_path / "subdir").mkdir()
        (tmp_path / "hello.py").write_text("print('hi')")
        (tmp_path / "readme.md").write_text("# README")

        resp = client.get(f"/api/files/tree?path={tmp_path}")
        assert resp.status_code == 200
        data = _json(resp)
        assert "dirs" in data
        assert "files" in data
        assert "subdir/" in data["dirs"]
        names = [f["name"] for f in data["files"]]
        assert "hello.py" in names
        assert "readme.md" in names

    def test_hidden_dirs_excluded(self, client, tmp_path):
        (tmp_path / "node_modules").mkdir()
        (tmp_path / "__pycache__").mkdir()
        (tmp_path / ".git").mkdir()
        (tmp_path / "src").mkdir()

        resp = client.get(f"/api/files/tree?path={tmp_path}")
        assert resp.status_code == 200
        data = _json(resp)
        hidden = {"node_modules/", "__pycache__/", ".git/"}
        for h in hidden:
            assert h not in data["dirs"], f"{h!r} should be hidden"
        assert "src/" in data["dirs"]

    def test_invalid_path_returns_400(self, client, tmp_path):
        nonexistent = str(tmp_path / "does_not_exist")
        resp = client.get(f"/api/files/tree?path={nonexistent}")
        assert resp.status_code == 400
        assert "error" in _json(resp)

    def test_files_include_size(self, client, tmp_path):
        content = "x" * 42
        (tmp_path / "sample.txt").write_text(content)

        resp = client.get(f"/api/files/tree?path={tmp_path}")
        data = _json(resp)
        sample = next(f for f in data["files"] if f["name"] == "sample.txt")
        assert sample["size"] == 42

    def test_dirs_sorted_case_insensitive(self, client, tmp_path):
        for name in ("Zebra", "apple", "Mango"):
            (tmp_path / name).mkdir()

        resp = client.get(f"/api/files/tree?path={tmp_path}")
        dirs = [d.rstrip("/") for d in _json(resp)["dirs"]]
        assert dirs == sorted(dirs, key=str.lower)


# ═════════════════════════════════════════════════════════════════════════════
# POST /api/files/read
# ═════════════════════════════════════════════════════════════════════════════


class TestFileRead:
    def test_returns_content_and_language(self, client, tmp_path):
        f = tmp_path / "script.py"
        f.write_text("print('hello')")

        resp = client.post(
            "/api/files/read",
            data=json.dumps({"path": str(f)}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        data = _json(resp)
        assert data["content"] == "print('hello')"
        assert data["language"] == "python"
        assert data["size"] == len("print('hello')")

    def test_binary_file_returns_error(self, client, tmp_path):
        png = tmp_path / "image.png"
        png.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)

        resp = client.post(
            "/api/files/read",
            data=json.dumps({"path": str(png)}),
            content_type="application/json",
        )
        assert resp.status_code == 400
        data = _json(resp)
        assert data.get("binary") is True
        assert "error" in data

    def test_pyc_file_returns_binary_error(self, client, tmp_path):
        pyc = tmp_path / "module.pyc"
        pyc.write_bytes(b"\x00\x01\x02\x03compiled")

        resp = client.post(
            "/api/files/read",
            data=json.dumps({"path": str(pyc)}),
            content_type="application/json",
        )
        assert resp.status_code == 400
        assert _json(resp).get("binary") is True

    def test_nonexistent_file_returns_404(self, client, tmp_path):
        missing = str(tmp_path / "ghost.py")
        resp = client.post(
            "/api/files/read",
            data=json.dumps({"path": missing}),
            content_type="application/json",
        )
        assert resp.status_code == 404
        assert "error" in _json(resp)

    def test_javascript_language_detected(self, client, tmp_path):
        f = tmp_path / "app.js"
        f.write_text("console.log('hi')")

        resp = client.post(
            "/api/files/read",
            data=json.dumps({"path": str(f)}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert _json(resp)["language"] == "javascript"

    def test_typescript_language_detected(self, client, tmp_path):
        f = tmp_path / "component.ts"
        f.write_text("const x: number = 1;")

        resp = client.post(
            "/api/files/read",
            data=json.dumps({"path": str(f)}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert _json(resp)["language"] == "typescript"


# ═════════════════════════════════════════════════════════════════════════════
# POST /api/files/write
# ═════════════════════════════════════════════════════════════════════════════


class TestFileWrite:
    def test_saves_file_content(self, client, tmp_path):
        target = tmp_path / "output.py"
        payload = {"path": str(target), "content": "x = 1\n"}

        resp = client.post(
            "/api/files/write",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert _json(resp)["success"] is True
        assert target.read_text() == "x = 1\n"

    def test_creates_missing_parent_dirs(self, client, tmp_path):
        target = tmp_path / "deep" / "nested" / "file.txt"
        payload = {"path": str(target), "content": "hello"}

        resp = client.post(
            "/api/files/write",
            data=json.dumps(payload),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert target.read_text() == "hello"

    def test_overwrites_existing_file(self, client, tmp_path):
        target = tmp_path / "existing.txt"
        target.write_text("old content")

        resp = client.post(
            "/api/files/write",
            data=json.dumps({"path": str(target), "content": "new content"}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert target.read_text() == "new content"


# ═════════════════════════════════════════════════════════════════════════════
# POST /api/files/create
# ═════════════════════════════════════════════════════════════════════════════


class TestFileCreate:
    def test_creates_new_file(self, client, tmp_path):
        new_file = tmp_path / "new.txt"
        resp = client.post(
            "/api/files/create",
            data=json.dumps({"path": str(new_file), "is_dir": False}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert new_file.exists()
        assert new_file.is_file()

    def test_creates_directory(self, client, tmp_path):
        new_dir = tmp_path / "mydir"
        resp = client.post(
            "/api/files/create",
            data=json.dumps({"path": str(new_dir), "is_dir": True}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert new_dir.is_dir()


# ═════════════════════════════════════════════════════════════════════════════
# POST /api/files/delete
# ═════════════════════════════════════════════════════════════════════════════


class TestFileDelete:
    def test_deletes_file(self, client, tmp_path):
        f = tmp_path / "todelete.txt"
        f.write_text("bye")

        resp = client.post(
            "/api/files/delete",
            data=json.dumps({"path": str(f)}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert not f.exists()

    def test_deletes_empty_directory(self, client, tmp_path):
        d = tmp_path / "emptydir"
        d.mkdir()

        resp = client.post(
            "/api/files/delete",
            data=json.dumps({"path": str(d)}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert not d.exists()

    def test_nonexistent_path_returns_404(self, client, tmp_path):
        resp = client.post(
            "/api/files/delete",
            data=json.dumps({"path": str(tmp_path / "nope")}),
            content_type="application/json",
        )
        assert resp.status_code == 404


# ═════════════════════════════════════════════════════════════════════════════
# POST /api/files/rename
# ═════════════════════════════════════════════════════════════════════════════


class TestFileRename:
    def test_renames_file(self, client, tmp_path):
        src = tmp_path / "old.txt"
        dst = tmp_path / "new.txt"
        src.write_text("content")

        resp = client.post(
            "/api/files/rename",
            data=json.dumps({"old_path": str(src), "new_path": str(dst)}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert not src.exists()
        assert dst.read_text() == "content"


# ═════════════════════════════════════════════════════════════════════════════
# Language detection (_detect_language)
# ═════════════════════════════════════════════════════════════════════════════


class TestLanguageDetection:
    """Unit-test the _detect_language helper directly."""

    @pytest.mark.parametrize(
        "filename, expected",
        [
            ("script.py", "python"),
            ("app.js", "javascript"),
            ("component.ts", "typescript"),
            ("page.tsx", "typescript"),
            ("view.jsx", "javascript"),
            ("style.css", "css"),
            ("index.html", "html"),
            ("config.json", "json"),
            ("notes.md", "markdown"),
            ("deploy.sh", "shell"),
            ("setup.bash", "shell"),
            ("docker-compose.yml", "yaml"),
            ("settings.yaml", "yaml"),
            ("Cargo.toml", "toml"),
            ("pom.xml", "xml"),
            ("query.sql", "sql"),
            ("main.rs", "rust"),
            ("server.go", "go"),
            ("main.c", "c"),
            ("module.cpp", "cpp"),
            ("header.h", "c"),
            ("Header.hpp", "cpp"),
            ("Main.java", "java"),
            ("app.rb", "ruby"),
            ("index.php", "php"),
            ("notes.txt", "plaintext"),
            ("app.log", "plaintext"),
            (".env", "plaintext"),
            (".gitignore", "plaintext"),
            ("bmo.service", "ini"),
            ("nginx.conf", "ini"),
            ("settings.ini", "ini"),
            ("Dockerfile", "dockerfile"),
            ("dockerfile", "dockerfile"),
            ("Makefile", "makefile"),
            ("icon.svg", "xml"),
            ("unknown.xyz", "plaintext"),
        ],
    )
    def test_language_map(self, filename, expected):
        assert _ide_module._detect_language(filename) == expected


# ═════════════════════════════════════════════════════════════════════════════
# Binary detection (_is_binary)
# ═════════════════════════════════════════════════════════════════════════════


class TestBinaryDetection:
    @pytest.mark.parametrize(
        "filename",
        [
            "photo.png", "image.jpg", "image.jpeg", "anim.gif",
            "icon.bmp", "favicon.ico", "pic.webp",
            "song.mp3", "video.mp4", "audio.wav", "sound.ogg", "music.flac",
            "archive.zip", "tarball.tar", "compressed.gz",
            "packed.bz2", "archive.7z", "compressed.rar",
            "document.pdf", "office.doc", "spreadsheet.xlsx",
            "program.exe", "library.dll", "shared.so", "object.o",
            "bytecode.pyc", "wheel.whl",
            "font.woff", "font.woff2", "font.ttf", "font.eot",
        ],
    )
    def test_known_binary_extensions(self, filename):
        assert _ide_module._is_binary(filename) is True

    @pytest.mark.parametrize(
        "filename",
        [
            "script.py", "app.js", "style.css", "index.html",
            "config.json", "notes.md", "deploy.sh", "Makefile",
        ],
    )
    def test_text_files_not_binary(self, filename):
        assert _ide_module._is_binary(filename) is False


# ═════════════════════════════════════════════════════════════════════════════
# GET /api/agents  &  agent management
# ═════════════════════════════════════════════════════════════════════════════


class TestAgentEndpoints:
    def test_agent_list_returns_list(self, client):
        resp = client.get("/api/agents")
        assert resp.status_code == 200
        data = _json(resp)
        assert "agents" in data
        assert isinstance(data["agents"], list)

    def test_agent_history_initially_empty_or_list(self, client):
        resp = client.get("/api/agents/history")
        assert resp.status_code == 200
        data = _json(resp)
        assert "history" in data
        assert isinstance(data["history"], list)

    def test_agent_clear_history(self, client):
        resp = client.delete("/api/agents/history")
        assert resp.status_code == 200
        assert _json(resp)["success"] is True

    def test_agent_set_override(self, client):
        resp = client.post(
            "/api/agents/override",
            data=json.dumps({"agent": "code"}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert _json(resp)["override"] == "code"

    def test_agent_clear_override(self, client):
        resp = client.post(
            "/api/agents/override",
            data=json.dumps({}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert _json(resp)["override"] is None

    def test_agent_set_model(self, client):
        resp = client.post(
            "/api/agents/model",
            data=json.dumps({"model": "flash"}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        assert _json(resp)["model"] == "flash"

    def test_agent_chat_empty_message_returns_400(self, client):
        resp = client.post(
            "/api/agents/chat",
            data=json.dumps({"message": "  "}),
            content_type="application/json",
        )
        assert resp.status_code == 400
        assert "error" in _json(resp)

    def test_agent_chat_with_message_returns_response(self, client):
        """Chat endpoint should return text even when main BMO app is unreachable."""
        resp = client.post(
            "/api/agents/chat",
            data=json.dumps({"message": "Hello BMO"}),
            content_type="application/json",
        )
        assert resp.status_code == 200
        data = _json(resp)
        assert "text" in data
        assert "agent" in data
        assert isinstance(data["text"], str)
        assert len(data["text"]) > 0


# ═════════════════════════════════════════════════════════════════════════════
# POST /api/run
# ═════════════════════════════════════════════════════════════════════════════


class TestRunFile:
    def test_nonexistent_file_returns_404(self, client, tmp_path):
        resp = client.post(
            "/api/run",
            data=json.dumps({"path": str(tmp_path / "missing.py")}),
            content_type="application/json",
        )
        assert resp.status_code == 404

    def test_unsupported_extension_returns_400(self, client, tmp_path):
        f = tmp_path / "data.csv"
        f.write_text("a,b,c")

        resp = client.post(
            "/api/run",
            data=json.dumps({"path": str(f)}),
            content_type="application/json",
        )
        assert resp.status_code == 400
        assert "Unsupported" in _json(resp)["error"]

    def test_supported_extensions_accepted(self, client, tmp_path):
        """Supported extensions should not return 400 (may fail to run, but won't 400)."""
        for ext in (".py", ".sh", ".js"):
            # Avoid "test" in basename — /api/run treats *test*.* as test-discovery mode
            f = tmp_path / f"script{ext}"
            f.write_text("# placeholder")
            resp = client.post(
                "/api/run",
                data=json.dumps({"path": str(f)}),
                content_type="application/json",
            )
            # 400 = unsupported type — should NOT happen for known extensions
            assert resp.status_code != 400, f"Extension {ext} should be supported"


# ═════════════════════════════════════════════════════════════════════════════
# GET / (IDE index page)
# ═════════════════════════════════════════════════════════════════════════════


class TestIndexRoute:
    def test_index_returns_200_or_template_error(self, client):
        """The route exists — template may be missing in test env, that's OK."""
        resp = client.get("/")
        # 200 = template found, 500 = template missing (still means route exists)
        assert resp.status_code in (200, 500)


# ═════════════════════════════════════════════════════════════════════════════
# _resolve_path helper
# ═════════════════════════════════════════════════════════════════════════════


class TestResolvePath:
    def test_path_inside_jail_resolved(self):
        """A path inside ~/home-lab/ resolves to its absolute realpath."""
        result = _ide_module._resolve_path("~/home-lab/bmo/pi/data")
        assert os.path.isabs(result)
        assert "home-lab" in result

    def test_tmp_allowed(self, tmp_path):
        """/tmp/* is in the allowlist — used for ephemeral IDE workspaces."""
        # tmp_path is under /tmp so it's allowed
        if str(tmp_path).startswith("/tmp"):
            result = _ide_module._resolve_path(str(tmp_path))
            assert result == str(tmp_path)

    def test_outside_jail_raises_permission(self):
        """Paths outside the IDE allowlist (/etc, ~/, etc.) raise PermissionError."""
        import pytest
        with pytest.raises(PermissionError):
            _ide_module._resolve_path("/etc/passwd")
        with pytest.raises(PermissionError):
            _ide_module._resolve_path("~/somefile")  # ~/ → /home/patrick (outside ~/home-lab)

    def test_empty_path_raises(self):
        import pytest
        with pytest.raises(PermissionError):
            _ide_module._resolve_path("")
