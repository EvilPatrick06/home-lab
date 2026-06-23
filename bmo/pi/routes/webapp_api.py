"""routes/webapp_api.py — serve the dnd-app WEB build (Dungeon Table Online).

The dnd-app renderer is built as a standalone browser SPA (see
`dnd-app/vite.web.config.ts`, base `/DungeonTableOnline/`) and deployed to the
Pi. Serving it from the same Cloudflare-tunnel origin as the BMO API means the
browser app reaches `/api/*` same-origin (no CORS) and is already authenticated
to Cloudflare Access (so the Access-protected AI DM endpoints work).

Routes (all under `/DungeonTableOnline`):
- `GET /DungeonTableOnline/`        -> index.html (the SPA shell)
- `GET /DungeonTableOnline/<path>`  -> the built asset if it exists (served by
                                      `send_from_directory`, which jails the
                                      request path under the serve root), else
                                      index.html as the SPA fallback.

The web build uses BrowserRouter (basename `/DungeonTableOnline`), so deep links
like `/DungeonTableOnline/settings` or `/game/<id>` are real URLs. On refresh /
direct navigation the unknown sub-path isn't a file, so it falls back to
index.html and the client-side router renders the right page.

Serve dir: `$DND_WEB_DIST` (default `/home/patrick/web-apps/DungeonTableOnline`),
resolved once at import. If absent, the index route 404s with a friendly note
until the first deploy lands.
"""

from __future__ import annotations

import os

from flask import Blueprint, Response, send_file, send_from_directory
from werkzeug.exceptions import NotFound

# Canonical (symlink-resolved) absolute serve root.
_DIST_DIR: str = os.path.realpath(os.environ.get("DND_WEB_DIST", "/home/patrick/web-apps/DungeonTableOnline"))

# No static_folder: the catch-all below owns /DungeonTableOnline/<path> so it can
# serve real assets AND fall back to index.html for client-router deep links.
webapp_bp = Blueprint("webapp", __name__)

_NOT_DEPLOYED = (
    "Dungeon Table Online is not deployed yet. "
    "The web build is published here automatically when dnd-app changes land on master."
)


def _serve_index() -> Response:
    # Constant filename -- no request data in this path, so no traversal risk.
    index = os.path.join(_DIST_DIR, "index.html")
    if not os.path.isfile(index):
        return Response(_NOT_DEPLOYED, status=404, mimetype="text/plain")
    return send_file(index)


@webapp_bp.route("/DungeonTableOnline/")
@webapp_bp.route("/DungeonTableOnline")
def webapp_index() -> Response:
    return _serve_index()


@webapp_bp.route("/DungeonTableOnline/<path:subpath>")
def webapp_asset(subpath: str) -> Response:
    """Serve a built asset if it exists, else fall back to index.html.

    ``send_from_directory`` jails ``subpath`` under ``_DIST_DIR`` (rejecting
    traversal/absolute paths) -- the only place untrusted request paths touch the
    filesystem, and it is framework code. A miss (a BrowserRouter deep link like
    ``/settings`` or ``/game/<id>``, or a traversal attempt) raises NotFound, which
    we turn into the SPA shell so a refresh / direct navigation boots the app
    instead of 404ing.
    """
    try:
        return send_from_directory(_DIST_DIR, subpath)
    except NotFound:
        return _serve_index()


def register_webapp(flask_app) -> None:
    """Mount the Dungeon Table Online SPA blueprint."""
    flask_app.register_blueprint(webapp_bp)
