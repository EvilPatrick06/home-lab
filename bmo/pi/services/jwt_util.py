"""services/jwt_util.py — sign + verify the account session bearer token.

The dnd-app cloud-account system authenticates each request with a short JWT
(HS256) signed by the Flask ``SECRET_KEY`` (the same stable key
``app._get_secret_key()`` already persists). The token carries the Discord user
id (``sub``), a display ``name``, a ``jti`` (so a single session can be revoked
via the ``sessions`` table) and ``tv`` (the user's ``token_version`` — bump it to
revoke ALL of a user's tokens at once). Verification is offline (signature + exp);
revocation/identity are then checked against ``services.accounts``.

Kept dependency-free of Flask so it can be unit-tested in isolation — the caller
passes the secret (``current_app.config['SECRET_KEY']``) in.
"""

from __future__ import annotations

import secrets
import time

import jwt  # PyJWT

ALGORITHM = "HS256"
DEFAULT_TTL_SECONDS = 30 * 24 * 3600  # 30 days


def mint_token(
    *,
    sub: str,
    name: str,
    secret: str,
    token_version: int = 1,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
    jti: str | None = None,
    now: float | None = None,
) -> tuple[str, dict]:
    """Return ``(token, payload)``. ``payload`` is handed back so the caller can
    persist the matching ``sessions`` row (jti / iat / exp)."""
    issued = int(now if now is not None else time.time())
    jti = jti or secrets.token_hex(16)
    payload = {
        "sub": str(sub),
        "name": name,
        "tv": int(token_version),
        "iat": issued,
        "exp": issued + int(ttl_seconds),
        "jti": jti,
    }
    token = jwt.encode(payload, secret, algorithm=ALGORITHM)
    return token, payload


def verify_token(token: str, secret: str) -> dict | None:
    """Return the decoded claims, or ``None`` if the token is malformed, has a
    bad signature, or is expired. Never raises."""
    if not token:
        return None
    try:
        return jwt.decode(token, secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
