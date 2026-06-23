"""routes/webapp_api.py — serve the dnd-app WEB build (Dungeon Table Online).

The dnd-app renderer is built as a standalone browser SPA (see
`dnd-app/vite.web.config.ts`, base `/DungeonTableOnline/`) and deployed to the
Pi. Serving it from the same Cloudflare-tunnel origin as the BMO API means the
browser app reaches `/api/*` same-origin (no CORS) and is already authenticated
to Cloudflare Access (so the Access-protected AI DM endpoints work).

Routes (all under `/DungeonTableOnline`):
- `GET /DungeonTableOnline/`        -> index.html (the SPA shell)
- `GET /DungeonTableOnline/<path>`  -> the built asset, served by the blueprint
                                      static handler, which jails the request
                                      path under the serve root (so the
                                      file-access sink lives in framework code,
                                      not here -- no hand-rolled path joining of
                                      request data).

The renderer uses an in-memory router, so the browser URL never leaves
`/DungeonTableOnline/`; there are no server-side deep links to fall back for.

Serve dir: `$DND_WEB_DIST` (default `/home/patrick/web-apps/DungeonTableOnline`),
resolved once at import. If absent, the index route 404s with a friendly note
until the first deploy lands.
"""

from __future__ import annotations

import os

from flask import Blueprint, Response, send_file

# Canonical (symlink-resolved) absolute serve root.
_DIST_DIR: str = os.path.realpath(os.environ.get("DND_WEB_DIST", "/home/patrick/web-apps/DungeonTableOnline"))

# The blueprint static handler serves /DungeonTableOnline/<path> from the serve
# root and safely rejects traversal/absolute paths internally -- the only place
# untrusted request paths touch the filesystem, and it is framework code.
webapp_bp = Blueprint("webapp", __name__, static_folder=_DIST_DIR, static_url_path="/DungeonTableOnline")

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


def register_webapp(flask_app) -> None:
    """Mount the Dungeon Table Online SPA blueprint."""
    flask_app.register_blueprint(webapp_bp)
