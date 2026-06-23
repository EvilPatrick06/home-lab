"""routes/webapp_api.py — serve the dnd-app WEB build (Dungeon Table Online).

The dnd-app renderer is built as a standalone browser SPA (see
`dnd-app/vite.web.config.ts`, base `/DungeonTableOnline/`) and deployed to the
Pi. Serving it from the same Cloudflare-tunnel origin as the BMO API means the
browser app reaches `/api/*` same-origin (no CORS) and is already authenticated
to Cloudflare Access (so the Access-protected AI DM endpoints work).

Routes (all under `/DungeonTableOnline`):
- `GET /DungeonTableOnline/`               → index.html
- `GET /DungeonTableOnline/<path>`         → the built asset, or index.html
                                             fallback for client-side routes
                                             (the app uses an in-memory router,
                                             but deep links / refreshes still 200).

Serve dir: `$DND_WEB_DIST` (default `/home/patrick/web-apps/DungeonTableOnline`).
If absent, every route 404s with a friendly note until the first deploy lands.
"""

from __future__ import annotations

import os
from pathlib import Path

from flask import Blueprint, Response, send_from_directory

webapp_bp = Blueprint("webapp", __name__)

_DIST_DIR: Path = Path(os.environ.get("DND_WEB_DIST", "/home/patrick/web-apps/DungeonTableOnline")).resolve()

_NOT_DEPLOYED = (
    "Dungeon Table Online is not deployed yet. "
    "The web build is published here automatically when dnd-app changes land on master."
)


def _safe_under_dist(rel: str) -> Path | None:
    """Resolve `rel` under the dist dir, rejecting path traversal."""
    candidate = (_DIST_DIR / rel).resolve()
    if candidate == _DIST_DIR or _DIST_DIR in candidate.parents:
        return candidate
    return None


def _serve_index() -> Response:
    index = _DIST_DIR / "index.html"
    if not index.is_file():
        return Response(_NOT_DEPLOYED, status=404, mimetype="text/plain")
    return send_from_directory(str(_DIST_DIR), "index.html")


@webapp_bp.route("/DungeonTableOnline/")
@webapp_bp.route("/DungeonTableOnline")
def webapp_index() -> Response:
    return _serve_index()


@webapp_bp.route("/DungeonTableOnline/<path:filename>")
def webapp_asset(filename: str) -> Response:
    target = _safe_under_dist(filename)
    if target is not None and target.is_file():
        return send_from_directory(str(_DIST_DIR), filename)
    # SPA fallback — unknown path under the app base serves index.html so deep
    # links / refreshes load the app instead of 404ing.
    return _serve_index()


def register_webapp(flask_app) -> None:
    """Mount the Dungeon Table Online SPA blueprint."""
    flask_app.register_blueprint(webapp_bp)
