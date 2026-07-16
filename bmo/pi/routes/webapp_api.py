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

# PHASE-63 (63A): everything under assets/ is content-hashed by the Vite build
# (a changed chunk gets a new URL), so those files are immutable and safe to
# cache forever. Flask's `max_age=` kwarg emits `public, max-age=...` but never
# `immutable`, so the header is set explicitly on the response instead. Scope
# this to assets/ ONLY: index.html, sw.js, manifest.webmanifest, icons/** and
# data/** are stable-named (the build copies public/ verbatim) and must keep
# revalidating — long-caching data/** would pin stale game data, and
# long-caching sw.js would slow service-worker updates.
_IMMUTABLE_CACHE = "public, max-age=31536000, immutable"

# PHASE-63 (63B): route-scoped CSP for VTT HTML. The site-wide policy set in
# app.py's `_cache_policy` is kiosk/IDE-oriented (Alpine.js needs 'unsafe-eval',
# Monaco/xterm load from CDNs, Music/Calendar cards render YouTube/Google
# thumbnails) — none of which the Vite-built VTT needs: the deployed shell
# references zero external script/style origins. `_cache_policy` applies its
# CSP via `setdefault`, so a CSP set here inside the view (headers set on the
# returned response always precede after-request hooks) wins for VTT HTML while
# kiosk/IDE HTML keeps the site-wide policy byte-identical.
#
# Kept allowances (runtime-required, verified in PHASE-63):
# - worker-src blob:                 pdf.js loads its worker via a blob URL
# - connect-src data:                PixiJS ImageBitmap probe (1x1 data: PNG fetch)
# - connect-src ws:/wss:             PeerJS signalling (/myapp) + relay websockets
# - static.cloudflareinsights.com /  the CF Web Analytics beacon the tunnel
#   cloudflareinsights.com           auto-injects (script host + RUM endpoint)
# - style-src 'unsafe-inline'        React style={{}} / Tailwind runtime styles
# - img/font data: blob:             uploaded maps + portraits render from blob/data
# Dropped (kiosk/IDE-only): 'unsafe-eval', script-src 'unsafe-inline' + blob:,
# cdn.jsdelivr.net, cdn.socket.io, the YouTube/Google image hosts, and both
# Google Fonts origins. Further tightening (e.g. narrowing ws:/wss:) is gated
# on a browser-connected CSP-violation sweep (63B step 3); if that sweep shows
# a legitimate load blocked, restore the specific allowance with a
# justification comment matching the kiosk CSP's style.
_VTT_CSP = (
    "default-src 'self'; "
    "script-src 'self' https://static.cloudflareinsights.com; "
    "worker-src 'self' blob:; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "font-src 'self' data:; "
    "connect-src 'self' data: ws: wss: https://cloudflareinsights.com; "
    "frame-ancestors 'self'; "
    "base-uri 'self'; "
    "object-src 'none'"
)


def _serve_index() -> Response:
    # Constant filename -- no request data in this path, so no traversal risk.
    index = os.path.join(_DIST_DIR, "index.html")
    if not os.path.isfile(index):
        return Response(_NOT_DEPLOYED, status=404, mimetype="text/plain")
    response = send_file(index)
    # PHASE-63 (63B): both the index route and the SPA fallback flow through
    # this one chokepoint, so setting the CSP here covers ALL VTT HTML.
    response.headers["Content-Security-Policy"] = _VTT_CSP
    return response


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
        response = send_from_directory(_DIST_DIR, subpath)
    except NotFound:
        return _serve_index()
    if subpath.startswith("assets/"):
        # PHASE-63 (63A): content-hashed chunk — cache forever (_IMMUTABLE_CACHE
        # above). The SPA fallback is exempt by construction: a miss (even one
        # under assets/) raises NotFound and returns HTML via _serve_index(),
        # and _cache_policy's text/html branch ASSIGNS Cache-Control: no-cache
        # (`=`, not setdefault), so this immutable header can only ever stick
        # to a real asset hit.
        response.headers["Cache-Control"] = _IMMUTABLE_CACHE
    return response


def register_webapp(flask_app) -> None:
    """Mount the Dungeon Table Online SPA blueprint."""
    flask_app.register_blueprint(webapp_bp)
