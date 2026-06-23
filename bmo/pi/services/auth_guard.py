"""services/auth_guard.py — per-request account auth for the cloud-account API.

``require_user`` is the decorator the ``/api/account/*`` and (Phase-C)
``/api/sync/*`` routes wear. It verifies the bearer JWT against the Flask
``SECRET_KEY``, confirms the session is still active (not revoked/expired) and the
token's ``tv`` still matches the user's ``token_version``, loads the user row, and
stashes it on flask ``g`` (``g.bmo_user`` / ``g.bmo_claims``). On any failure it
short-circuits with a 401 — the server NEVER trusts a user id from the request
body or path, only from the verified token.
"""

from __future__ import annotations

from functools import wraps

from flask import current_app, g, jsonify, request

from services import accounts, jwt_util


def _extract_bearer() -> str:
    auth = (request.headers.get("Authorization", "") or "").strip()
    if auth.startswith("Bearer "):
        return auth[len("Bearer "):].strip()
    return ""


def authenticate() -> tuple[dict | None, dict | None]:
    """Resolve the current request's user. Returns ``(user, claims)`` or
    ``(None, None)``. Also caches the result on ``g`` for the request."""
    token = _extract_bearer()
    if not token:
        return None, None
    claims = jwt_util.verify_token(token, current_app.config["SECRET_KEY"])
    if not claims:
        return None, None
    if not accounts.session_active(claims.get("jti")):
        return None, None
    user = accounts.get_user(claims.get("sub", ""))
    if not user:
        return None, None
    if int(claims.get("tv", 0)) != int(user.get("token_version", 1)):
        return None, None
    g.bmo_user = user
    g.bmo_claims = claims
    return user, claims


def current_user() -> dict | None:
    return getattr(g, "bmo_user", None)


def require_user(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user, _ = authenticate()
        if not user:
            return jsonify({"error": "unauthorized"}), 401
        return fn(*args, **kwargs)

    return wrapper
