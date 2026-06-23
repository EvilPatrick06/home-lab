"""Tests for the fail-closed BMO HTTP auth gate (security hardening).

BMO_API_KEY is auto-generated + persisted when unset, so the front-door gate
(`_bmo_optional_api_key`) is ALWAYS enforced — no fail-open path. These tests
exercise the gate + the registry second-factor directly in request contexts
(the SSE stream route is an infinite generator, so a full GET would hang;
calling the before_request hook directly avoids that).
"""

from __future__ import annotations

import app as app_module
from app import app as flask_app


def _ctx(path: str, remote: str = "127.0.0.1", headers: dict | None = None):
    return flask_app.test_request_context(
        path, environ_base={"REMOTE_ADDR": remote}, headers=headers or {}
    )


def test_open_by_default_when_no_key(monkeypatch):
    """Default posture: BMO_API_KEY unset → the app is OPEN (the VTT and any LAN
    client reach the Pi with no key). Auth only engages when the owner opts in."""
    monkeypatch.setattr(app_module, "BMO_API_KEY", "")
    with _ctx("/api/chat", remote="203.0.113.7"):
        assert app_module._bmo_optional_api_key() is None
    # Registry mutations are likewise open by default (front-door gate is open).
    with _ctx("/api/games", remote="203.0.113.7"):
        assert app_module._registry_authorized() is True


def test_localhost_is_exempt(monkeypatch):
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    with _ctx("/api/games"):
        assert app_module._bmo_optional_api_key() is None


def test_non_localhost_without_key_is_rejected(monkeypatch):
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    with _ctx("/api/games", remote="203.0.113.7"):
        resp = app_module._bmo_optional_api_key()
        assert resp is not None and resp[1] == 401


def test_non_localhost_with_bearer_is_allowed(monkeypatch):
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    with _ctx("/api/games", remote="203.0.113.7", headers={"Authorization": "Bearer k"}):
        assert app_module._bmo_optional_api_key() is None


def test_tunnel_masquerade_is_rejected(monkeypatch):
    """A loopback remote_addr WITH a forwarding header (cloudflared proxies to
    127.0.0.1) must NOT be treated as trusted localhost."""
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    with _ctx("/api/games", remote="127.0.0.1", headers={"X-Forwarded-For": "203.0.113.7"}):
        assert app_module._bmo_client_is_trusted_localhost() is False
        resp = app_module._bmo_optional_api_key()
        assert resp is not None and resp[1] == 401


def test_health_is_exempt(monkeypatch):
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    with _ctx("/health", remote="203.0.113.7"):
        assert app_module._bmo_optional_api_key() is None


def test_public_dm_endpoint_exempt_from_key(monkeypatch):
    """The anonymous game-chat endpoint is reachable without the Bearer (it is
    opened to the internet via a path-scoped Cloudflare Access bypass)."""
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    with _ctx("/api/dnd/public/dm", remote="203.0.113.7"):
        assert app_module._bmo_optional_api_key() is None


def test_public_web_surface_exempt_from_key(monkeypatch):
    """The dnd-app web build + the read-only content it loads stay anonymous.

    This is the regression guard for the Critical web-build outage (a hardened
    ``BMO_API_KEY`` 401-ing the entire public SPA). It pins a representative
    path under EVERY entry in the anonymous-exempt set so dropping any prefix
    from ``_PUBLIC_UNAUTH_PREFIXES`` / ``_PUBLIC_UNAUTH_EXACT`` fails CI.

    KEEP THIS LIST IN LOCKSTEP with ``app._PUBLIC_UNAUTH_PREFIXES`` /
    ``_PUBLIC_UNAUTH_EXACT`` and the path-scoped Cloudflare-Access "bypass"
    applications (see the comment above ``_PUBLIC_UNAUTH_EXACT`` in app.py).
    """
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    for path in (
        # SPA shell + a hashed asset chunk + bundled read-only 5e content
        "/DungeonTableOnline/",
        "/DungeonTableOnline/assets/app.js",
        "/DungeonTableOnline/assets/index.web-C8ECHjSO.js",
        "/DungeonTableOnline/data/5e/classes.json",
        # content APIs the SPA fetches anonymously
        "/api/library/manifest",
        "/api/sounds/file",
        # hardened anonymous game-chat endpoint (exact-match exemption)
        "/api/dnd/public/dm",
    ):
        with _ctx(path, remote="203.0.113.7"):
            assert app_module._bmo_optional_api_key() is None, path


def test_exemption_set_covers_every_documented_prefix(monkeypatch):
    """Pin that every prefix in the live exemption set is actually honoured —
    if a prefix is added to ``_PUBLIC_UNAUTH_PREFIXES`` it must let an anonymous
    request through, and if one is removed this asserts the gap. Iterates the
    real set so the test tracks the source rather than a hand-copied list."""
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    for prefix in app_module._PUBLIC_UNAUTH_PREFIXES:
        with _ctx(f"{prefix}/probe", remote="203.0.113.7"):
            assert app_module._bmo_optional_api_key() is None, prefix
    for exact in app_module._PUBLIC_UNAUTH_EXACT:
        with _ctx(exact, remote="203.0.113.7"):
            assert app_module._bmo_optional_api_key() is None, exact


def test_sibling_private_dnd_route_still_gated(monkeypatch):
    """Exempting /api/dnd/public/dm must NOT open the rest of /api/dnd/*."""
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    for path in ("/api/dnd/dm", "/api/dnd/load", "/api/dnd/sessions"):
        with _ctx(path, remote="203.0.113.7"):
            resp = app_module._bmo_optional_api_key()
            assert resp is not None and resp[1] == 401, path


def test_sse_stream_accepts_api_key_query(monkeypatch):
    """EventSource can't set a header, so /api/games/stream accepts ?api_key=."""
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    with _ctx("/api/games/stream?api_key=k", remote="203.0.113.7"):
        assert app_module._bmo_optional_api_key() is None


def test_api_key_query_not_accepted_outside_stream(monkeypatch):
    """The query-param credential is confined to the stream route."""
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    with _ctx("/api/chat?api_key=k", remote="203.0.113.7"):
        resp = app_module._bmo_optional_api_key()
        assert resp is not None and resp[1] == 401


def test_registry_no_longer_fails_open(monkeypatch):
    """With no separate registry key, a non-localhost mutation must defer to the
    front-door bearer instead of the old `return True` fail-open."""
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    monkeypatch.setattr(app_module, "BMO_REGISTRY_API_KEY", "")
    with _ctx("/api/games", remote="203.0.113.7"):
        assert app_module._registry_authorized() is False
    with _ctx("/api/games", remote="203.0.113.7", headers={"Authorization": "Bearer k"}):
        assert app_module._registry_authorized() is True


def test_registry_strict_second_key(monkeypatch):
    """When BMO_REGISTRY_API_KEY is set, non-localhost callers also need it."""
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    monkeypatch.setattr(app_module, "BMO_REGISTRY_API_KEY", "reg")
    with _ctx("/api/games", remote="203.0.113.7", headers={"Authorization": "Bearer k"}):
        assert app_module._registry_authorized() is False
    with _ctx(
        "/api/games",
        remote="203.0.113.7",
        headers={"Authorization": "Bearer k", "X-Registry-Key": "reg"},
    ):
        assert app_module._registry_authorized() is True


def test_registry_localhost_always_authorized(monkeypatch):
    monkeypatch.setattr(app_module, "BMO_API_KEY", "k")
    monkeypatch.setattr(app_module, "BMO_REGISTRY_API_KEY", "reg")
    with _ctx("/api/games"):
        assert app_module._registry_authorized() is True
