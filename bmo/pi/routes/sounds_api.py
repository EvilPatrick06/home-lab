"""routes/sounds_api.py — Pi-hosted bundled-sound serving (audio offload).

The dnd-app bundles ~130 MP3s under its `public/sounds/`. `remote-sounds.ts`
prefers Pi-hosted copies when reachable (bundled fallback otherwise), to keep the
installer thin. This serves them from the repo's sound tree (same files, present
on the Pi via the monorepo checkout — no separate seed needed).

Routes (all under `/api/sounds`, read-only):
- `GET /manifest`            → {version, files: {"<rel>": {size}}}
                               (`<rel>` is the path WITHOUT a leading `sounds/`,
                                e.g. `dice/d20-1.mp3` — matches the client's
                                `mapSoundPathToRel`).
- `GET /file?path=<rel>`     → the raw audio bytes (path-jailed under the sound
                               dir; Content-Type audio/mpeg).

If the sound dir is absent the manifest is empty and `file` 404s — the app then
uses its bundled clips. Mirrors library_api.py (filesystem + hashing, so it's
unit-testable by pointing `register_sounds` at a fixture dir).
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Any

from flask import Blueprint, Response, jsonify, request, send_file

from services.bmo_logging import get_logger

log = get_logger("sounds_api")

sounds_bp = Blueprint("sounds", __name__, url_prefix="/api/sounds")

_sounds_dir: Path | None = None
_manifest_cache: dict[str, Any] | None = None

# Audio extensions the dnd-app ships. The client maps `./sounds/<rel>.mp3`, but
# serve the other web-audio types too in case clips are added.
_AUDIO_EXTS = (".mp3", ".ogg", ".wav", ".webm")


def _default_sounds_dir() -> Path:
    # routes/ -> pi/ -> bmo/ -> repo-root -> dnd-app/src/renderer/public/sounds
    here = Path(__file__).resolve()
    return here.parents[3] / "dnd-app" / "src" / "renderer" / "public" / "sounds"


def _build_manifest(base: Path) -> dict[str, Any]:
    """Walk `base` for audio files → {version, files:{rel:{size}}}. The version
    is a deterministic hash of the per-file (rel,size) pairs so it changes iff
    the served set changes (drives client cache invalidation)."""
    files: dict[str, dict[str, Any]] = {}
    if base.is_dir():
        for root, _dirs, names in os.walk(base):
            for name in names:
                if not name.lower().endswith(_AUDIO_EXTS):
                    continue
                full = Path(root) / name
                rel = str(full.relative_to(base)).replace(os.sep, "/")
                try:
                    files[rel] = {"size": full.stat().st_size}
                except OSError:
                    continue
    digest = hashlib.sha256()
    for rel in sorted(files):
        digest.update(f"{rel}:{files[rel]['size']}".encode())
    return {"version": digest.hexdigest()[:16], "files": files}


def _manifest() -> dict[str, Any]:
    global _manifest_cache
    if _manifest_cache is None:
        _manifest_cache = _build_manifest(_sounds_dir or _default_sounds_dir())
    return _manifest_cache


def _resolve_jailed(rel: str) -> Path | None:
    base = (_sounds_dir or _default_sounds_dir()).resolve()
    target = (base / rel).resolve()
    if not target.is_relative_to(base):
        return None
    return target


@sounds_bp.route("/manifest")
def api_sounds_manifest() -> Response:
    return jsonify(_manifest())


@sounds_bp.route("/file")
def api_sounds_file():
    rel = (request.args.get("path") or "").strip()
    if not rel or not rel.lower().endswith(_AUDIO_EXTS):
        return jsonify({"error": "path query param (an audio relpath) is required"}), 400
    target = _resolve_jailed(rel)
    if target is None:
        return jsonify({"error": "path escapes the sound root"}), 403
    if not target.is_file():
        return jsonify({"error": "not found"}), 404
    resp = send_file(str(target), mimetype="audio/mpeg", conditional=True)
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


def register_sounds(flask_app, sounds_dir: str | os.PathLike | None = None) -> None:
    """Wire the sounds blueprint into the Flask app. `sounds_dir` overrides the
    served dir (used by tests); defaults to the dnd-app's `public/sounds/`."""
    global _sounds_dir, _manifest_cache
    _sounds_dir = Path(sounds_dir) if sounds_dir is not None else _default_sounds_dir()
    _manifest_cache = None
    flask_app.register_blueprint(sounds_bp)


def reset_sounds_for_tests() -> None:
    global _sounds_dir, _manifest_cache
    _sounds_dir = None
    _manifest_cache = None
