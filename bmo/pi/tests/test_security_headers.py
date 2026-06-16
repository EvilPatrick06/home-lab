"""PHASE-15 15F — security-header regression lock.

The headers are hand-rolled in ``app.py::_cache_policy`` (an ``@app.after_request`` hook):
nosniff / frame-options / referrer-policy / permissions-policy on every response, a tuned
CSP + cache policy on HTML, and per-prefix CORS carve-outs. ``flask-talisman`` was evaluated
2026-06-10 and REJECTED — the upstream repo was archived 2026-04-18, the community fork is
dormant, and its ``force_https`` default is incompatible with BMO's LAN-HTTP serving. This
test is the regression lock and MUST survive PHASE-16's blueprint refactor of ``app.py`` (if
that refactor drops the after-request hook, these go red).

Reuses the deferred-import app fixture from test_app_endpoints (the established pattern for
app-importing tests — importing it installs the required module-level mocks).
"""

from tests.test_app_endpoints import bmo_app, client  # noqa: F401 (pytest fixtures)


def test_nosniff_on_all_responses(client):
    r = client.get("/health")
    assert r.headers.get("X-Content-Type-Options") == "nosniff"


def test_frame_options(client):
    r = client.get("/health")
    assert r.headers.get("X-Frame-Options") == "SAMEORIGIN"


def test_referrer_policy(client):
    r = client.get("/health")
    assert r.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


def test_permissions_policy(client):
    r = client.get("/health")
    pp = r.headers.get("Permissions-Policy", "")
    assert "camera=(self)" in pp
    assert "microphone=(self)" in pp


def test_csp_on_html(client):
    # The default Flask 404 page is text/html and still passes through @app.after_request —
    # a robust HTML probe that avoids rendering the heavy kiosk template.
    r = client.get("/__no_such_route__")
    csp = r.headers.get("Content-Security-Policy", "")
    assert "default-src 'self'" in csp
    # 'unsafe-eval' is the Alpine.js requirement — if a future change drops it, kiosk buttons
    # break silently; this assertion is the early warning.
    assert "script-src" in csp
    assert "'unsafe-eval'" in csp


def test_html_cache_policy(client):
    r = client.get("/__no_such_route__")
    assert r.headers.get("Cache-Control") == "no-cache"


def test_games_api_cors(client):
    r = client.get("/api/games")
    assert r.headers.get("Access-Control-Allow-Origin") == "*"
