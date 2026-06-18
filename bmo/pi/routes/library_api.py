"""routes/library_api.py — D&D 5e library HTTP API (Phase 36).

Serves the read-only 5e JSON library (seeded by `scripts/seed-5e-library.sh`
into `bmo/pi/data/5e-library/`) so the dnd-app can OPTIONALLY load library
content from the Pi instead of its bundled copy. The app always falls back to
its bundled (canonical) data, so this is a best-effort cache/CDN, not a source
of truth.

Routes (all under `/api/library`, read-only):
- `GET /manifest`            → {version, files: {<relpath>: {sha256, size}}}
- `GET /file?path=<relpath>` → the JSON file (path-jailed under the library dir),
                               with ETag: <sha256>.

The manifest is computed once and cached for the process lifetime — the served
dir is static at runtime (a re-seed requires a restart). If the library dir is
absent (never seeded), the manifest is empty and `file` returns 404 — the app
then uses its bundled data. Pure-ish module: the heavy lifting is filesystem +
hashing, so it's unit-testable by pointing `register_library` at a fixture dir.
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

from flask import Blueprint, Response, jsonify, request

from services.bmo_logging import _s, get_logger

log = get_logger("library_api")

library_bp = Blueprint("library", __name__, url_prefix="/api/library")

# Set by register_library(); the absolute dir the library is served from.
_library_dir: Path | None = None
# Process-lifetime manifest cache (the served dir is static at runtime).
_manifest_cache: dict[str, Any] | None = None


def _default_library_dir() -> Path:
    # routes/ -> pi/ -> data/5e-library
    here = Path(__file__).resolve()
    return here.parent.parent / "data" / "5e-library"


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _build_manifest(base: Path) -> dict[str, Any]:
    """Walk `base` and return {version, files:{relpath:{sha256,size}}}. The
    version is a deterministic hash of the per-file hashes, so it changes iff
    any served file changes (drives client cache invalidation)."""
    files: dict[str, dict[str, Any]] = {}
    if base.is_dir():
        for root, _dirs, names in os.walk(base):
            for name in names:
                if not name.endswith(".json"):
                    continue
                full = Path(root) / name
                rel = str(full.relative_to(base)).replace(os.sep, "/")
                try:
                    files[rel] = {"sha256": _sha256(full), "size": full.stat().st_size}
                except OSError:
                    continue
    digest = hashlib.sha256()
    for rel in sorted(files):
        digest.update(f"{rel}:{files[rel]['sha256']}".encode())
    return {"version": digest.hexdigest()[:16], "files": files}


def _manifest() -> dict[str, Any]:
    global _manifest_cache
    if _manifest_cache is None:
        base = _library_dir or _default_library_dir()
        _manifest_cache = _build_manifest(base)
    return _manifest_cache


def _resolve_jailed(rel: str) -> Path | None:
    """Resolve `rel` under the library dir, rejecting traversal escapes."""
    base = (_library_dir or _default_library_dir()).resolve()
    target = (base / rel).resolve()
    if not target.is_relative_to(base):
        return None
    return target


@library_bp.route("/manifest")
def api_library_manifest() -> Response:
    return jsonify(_manifest())


@library_bp.route("/file")
def api_library_file():
    rel = (request.args.get("path") or "").strip()
    if not rel or not rel.endswith(".json"):
        return jsonify({"error": "path query param (a .json relpath) is required"}), 400
    target = _resolve_jailed(rel)
    if target is None:
        return jsonify({"error": "path escapes the library root"}), 403
    if not target.is_file():
        return jsonify({"error": "not found"}), 404
    try:
        with open(target, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        log.warning("[library] failed to read %s: %s", _s(rel), e)
        return jsonify({"error": "failed to read file"}), 500
    resp = jsonify(data)
    sha = _manifest()["files"].get(rel.replace(os.sep, "/"), {}).get("sha256")
    if sha:
        resp.headers["ETag"] = f'"{sha}"'
    resp.headers["Cache-Control"] = "public, max-age=3600, must-revalidate"
    return resp


def register_library(flask_app, library_dir: str | os.PathLike | None = None) -> None:
    """Wire the library blueprint into the Flask app. `library_dir` overrides the
    served dir (used by tests); defaults to `bmo/pi/data/5e-library/`."""
    global _library_dir, _manifest_cache
    _library_dir = Path(library_dir) if library_dir is not None else _default_library_dir()
    _manifest_cache = None  # rebuild lazily for the configured dir
    flask_app.register_blueprint(library_bp)


def reset_library_for_tests() -> None:
    """Test-only — drop the dir + manifest cache so the next register rebuilds."""
    global _library_dir, _manifest_cache
    _library_dir = None
    _manifest_cache = None
