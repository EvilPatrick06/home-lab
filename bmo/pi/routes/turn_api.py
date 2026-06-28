"""routes/turn_api.py — ephemeral TURN credential minting (PHASE-53B).

Issues short-lived coturn credentials so the dnd-app self-host path can offer a
TURN relay candidate WITHOUT shipping any long-term secret in the (public)
repo. coturn runs in `--use-auth-secret` mode with a shared secret that lives
only on the host (`/home/patrick/.secrets/turn_shared_secret`); this endpoint
mints the credential coturn's REST-API scheme expects:

    username   = "<unix-expiry>:<id>"
    credential = base64( HMAC-SHA1( shared_secret, username ) )

The credential expires at `<unix-expiry>` (now + ttl), so it can't be embedded
or reused indefinitely, and rotating the host secret invalidates everything.
This deliberately REPLACES the Phase-20c static `dndvtt:dndvtt-relay` cred that
was removed from the app for being repo-visible.

Route (LAN-public, same stance as /api/games — off-LAN it sits behind the same
Cloudflare Access tunnel as the rest of /api):
- `GET /api/turn-credentials?ttl=<secs>&id=<opaque>`
    -> 200 {username, credential, ttl, urls, realm}
    -> 503 {error} when no shared secret is configured (app falls back to STUN)
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import re
import time

from flask import Blueprint, jsonify, request

from services.bmo_logging import get_logger

log = get_logger("turn_api")

turn_bp = Blueprint("turn", __name__)

_DEFAULT_SECRET_FILE = "/home/patrick/.secrets/turn_shared_secret"
_TTL_MIN, _TTL_MAX, _TTL_DEFAULT = 60, 86400, 3600
_ID_RE = re.compile(r"[^A-Za-z0-9_-]")

# Test override (set by register_turn(shared_secret=...)); when None the secret
# is resolved from the env / host file at request time and cached.
_secret_override: str | None = None
_secret_cache: str | None = None


def reset_turn_for_tests() -> None:
    """Clear the override + cache so each test starts clean."""
    global _secret_override, _secret_cache
    _secret_override = None
    _secret_cache = None


def _load_secret() -> str | None:
    """Resolve the coturn shared secret: test override > env > host file (cached)."""
    global _secret_cache
    if _secret_override is not None:
        return _secret_override
    if _secret_cache is not None:
        return _secret_cache
    env = (os.environ.get("TURN_SHARED_SECRET") or "").strip()
    if env:
        _secret_cache = env
        return env
    path = os.environ.get("TURN_SHARED_SECRET_FILE", _DEFAULT_SECRET_FILE)
    try:
        with open(path, encoding="utf-8") as fh:
            val = fh.read().strip()
        if val:
            _secret_cache = val
            return val
    except OSError:
        pass
    return None


def _public_host() -> str:
    host = (os.environ.get("TURN_PUBLIC_HOST") or "").strip()
    if host:
        return host
    # request.host includes a port (e.g. "bmo.local:5000"); strip it.
    return (request.host or os.environ.get("TURN_REALM", "dndvtt")).split(":")[0]


@turn_bp.route("/api/turn-credentials", methods=["GET"])
def turn_credentials():
    secret = _load_secret()
    if not secret:
        # No relay configured — the client keeps STUN-only + the cloud-relay
        # fallback (PHASE-53A). Not an error worth alarming on.
        return jsonify({"error": "turn-not-configured"}), 503

    try:
        ttl = int(request.args.get("ttl", _TTL_DEFAULT))
    except (TypeError, ValueError):
        ttl = _TTL_DEFAULT
    ttl = max(_TTL_MIN, min(_TTL_MAX, ttl))

    raw_id = request.args.get("id", "dndvtt") or "dndvtt"
    user_id = _ID_RE.sub("", raw_id)[:64] or "dndvtt"

    expiry = int(time.time()) + ttl
    username = f"{expiry}:{user_id}"
    credential = base64.b64encode(
        hmac.new(secret.encode("utf-8"), username.encode("utf-8"), hashlib.sha1).digest()
    ).decode("ascii")

    realm = os.environ.get("TURN_REALM", "dndvtt")
    host = _public_host()
    try:
        port = int(os.environ.get("TURN_PORT", "3478"))
    except (TypeError, ValueError):
        port = 3478
    urls = [f"turn:{host}:{port}", f"turn:{host}:{port}?transport=tcp"]

    return jsonify(
        {"username": username, "credential": credential, "ttl": ttl, "urls": urls, "realm": realm}
    )


def register_turn(flask_app, *, shared_secret: str | None = None) -> None:
    """Mount the TURN-credential blueprint. `shared_secret` overrides resolution (tests)."""
    global _secret_override
    if shared_secret is not None:
        _secret_override = shared_secret
    flask_app.register_blueprint(turn_bp)
