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

from flask import Blueprint, Response, send_file

webapp_bp = Blueprint("webapp", __name__)

# Canonical (symlink-resolved) absolute serve root. Resolving once at import
# time means the per-request guard compares against a stable real path.
_DIST_DIR: str = os.path.realpath(os.environ.get("DND_WEB_DIST", "/home/patrick/web-apps/DungeonTableOnline"))

_NOT_DEPLOYED = (
    "Dungeon Table Online is not deployed yet. "
    "The web build is published here automatically when dnd-app changes land on master."
)


def _resolve_within_dist(rel: str) -> str | None:
    """Map a request-supplied relative path to an absolute path JAILED under the
    serve root, or None if it escapes.

    Uses the path-injection barrier CodeQL recognizes (CWE-022/023/036/073/099):
    normalize with ``os.path.realpath`` FIRST (collapsing ``..`` and following
    symlinks), then require the result to stay within the real serve root. The
    *normalized* value is what callers use at the file sink — never the raw
    request string — so traversal and absolute-path inputs cannot escape.
    """
    full = os.path.realpath(os.path.join(_DIST_DIR, rel))
    if full == _DIST_DIR or full.startswith(_DIST_DIR + os.sep):
        return full
    return None


def _serve_index() -> Response:
    index = os.path.join(_DIST_DIR, "index.html")
    if not os.path.isfile(index):
        return Response(_NOT_DEPLOYED, status=404, mimetype="text/plain")
    return send_file(index)


@webapp_bp.route("/DungeonTableOnline/")
@webapp_bp.route("/DungeonTableOnline")
def webapp_index() -> Response:
    return _serve_index()


@webapp_bp.route("/DungeonTableOnline/<path:filename>")
def webapp_asset(filename: str) -> Response:
    full = _resolve_within_dist(filename)
    if full is not None and os.path.isfile(full):
        return send_file(full)
    # SPA fallback — unknown path under the app base serves index.html so deep
    # links / refreshes load the app instead of 404ing.
    return _serve_index()


def register_webapp(flask_app) -> None:
    """Mount the Dungeon Table Online SPA blueprint."""
    flask_app.register_blueprint(webapp_bp)
