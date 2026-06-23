"""routes/auth_api.py — Discord OAuth2 login + account API for dnd-app cloud accounts.

Blueprints:
- ``auth_bp``    (/api/auth)    — the login flow + session lifecycle.
- ``account_bp`` (/api/account) — the signed-in user's profile.

Login flow (works for BOTH the Electron desktop app and the same-origin browser
VTT at /DungeonTableOnline/):

  GET /api/auth/discord/start?return_to=<client-url>
      → validate return_to against an allowlist, sign it into ``state``,
        302 to Discord's authorize screen.
  GET /api/auth/discord/callback?code&state
      → verify state, exchange code → Discord token → /users/@me, upsert the
        user, mint a session JWT + sessions row, then DELIVER the token to the
        validated return_to:
          • web    (https origin)  → 302 to "<return_to>#token=<jwt>"  (SPA reads the fragment)
          • desktop (127.0.0.1 loopback) → 302 to "<return_to>?token=<jwt>" (the main
            process' one-shot loopback server reads the query — fragments aren't
            sent to servers).

These routes skip the shared BMO_API_KEY front door (see app._bmo_optional_api_key)
because anonymous browsers carry no owner key; /api/account is then gated by the
per-user JWT (services.auth_guard.require_user). KEEP /api/auth + /api/account in
lockstep with the Cloudflare Access edge bypass.
"""

from __future__ import annotations

import os
from urllib.parse import urlencode, urlparse

import requests
from flask import Blueprint, Response, current_app, g, jsonify, redirect, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from extensions import limiter
from services import accounts, jwt_util
from services.auth_guard import require_user
from services.bmo_logging import _s, get_logger

log = get_logger("auth_api")

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
account_bp = Blueprint("account", __name__, url_prefix="/api/account")

# ── Config (env) ──────────────────────────────────────────────────────
DISCORD_CLIENT_ID = (os.environ.get("DISCORD_OAUTH_CLIENT_ID") or "").strip()
DISCORD_CLIENT_SECRET = (os.environ.get("DISCORD_OAUTH_CLIENT_SECRET") or "").strip()
DISCORD_REDIRECT_URI = (
    os.environ.get("DISCORD_OAUTH_REDIRECT_URI")
    or "https://bmo.mybmoai.work/api/auth/discord/callback"
).strip()
TOKEN_TTL = int(os.environ.get("BMO_ACCOUNT_TOKEN_TTL", str(jwt_util.DEFAULT_TTL_SECONDS)))

DEFAULT_WEB_RETURN = (
    os.environ.get("BMO_ACCOUNT_WEB_RETURN") or "https://bmo.mybmoai.work/DungeonTableOnline/"
).strip()

# Hosts a token may be delivered to. The production web VTT origin + loopback for
# the desktop app. Prevents an open-redirect that could hand a token to an
# attacker-controlled origin.
ALLOWED_RETURN_HOSTS = frozenset({"bmo.mybmoai.work", "localhost", "127.0.0.1"})
_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})

DISCORD_AUTHORIZE = "https://discord.com/oauth2/authorize"
DISCORD_TOKEN_URL = "https://discord.com/api/oauth2/token"
DISCORD_ME_URL = "https://discord.com/api/users/@me"
STATE_MAX_AGE = 600  # seconds a signed state stays valid (login must finish in 10 min)
_OAUTH_SCOPES = "identify email"
_HTTP_TIMEOUT = 10
# Tighter than the app-wide default — the callback does a Discord token exchange.
# Localhost is exempt (the limiter's default_limits_exempt_when).
AUTH_RATE_LIMIT = os.environ.get("BMO_AUTH_RATE_LIMIT", "20 per minute")


# ── Helpers ───────────────────────────────────────────────────────────


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt="bmo-discord-oauth")


def _allowed_return(url: str) -> bool:
    try:
        p = urlparse(url)
    except ValueError:
        return False
    if p.scheme not in ("http", "https"):
        return False
    return (p.hostname or "").lower() in ALLOWED_RETURN_HOSTS


def _is_loopback(url: str) -> bool:
    return (urlparse(url).hostname or "").lower() in _LOOPBACK_HOSTS


def _deliver(return_to: str, *, token: str | None = None, error: str | None = None) -> Response:
    """302 the browser back to the client with the token/error attached. Desktop
    (loopback) gets it as a query param (its local server reads it); web gets it
    in the URL fragment (the SPA reads location.hash, server never sees it)."""
    params = {}
    if token:
        params["token"] = token
    if error:
        params["error"] = error
    qs = urlencode(params)
    if _is_loopback(return_to):
        sep = "&" if urlparse(return_to).query else "?"
        return redirect(f"{return_to}{sep}{qs}")
    return redirect(f"{return_to}#{qs}")


def _error_page(message: str, code: int = 400) -> Response:
    # message is a fixed developer string (never request-derived) — safe to inline.
    html = (
        "<!doctype html><html><head><meta charset='utf-8'><title>Sign-in</title></head>"
        "<body style='font-family:system-ui;max-width:30rem;margin:4rem auto;text-align:center'>"
        f"<h3>Sign-in error</h3><p>{message}</p><p>You can close this window.</p></body></html>"
    )
    return Response(html, status=code, mimetype="text/html")


# ── Routes: auth ──────────────────────────────────────────────────────


@auth_bp.route("/status", methods=["GET"])
def auth_status():
    """Lets clients show/hide the 'Sign in with Discord' button."""
    return jsonify({"configured": bool(DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET)})


@auth_bp.route("/discord/start", methods=["GET"])
@limiter.limit(AUTH_RATE_LIMIT)
def discord_start():
    if not (DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET):
        return jsonify({"error": "discord_login_not_configured"}), 503
    return_to = (request.args.get("return_to") or DEFAULT_WEB_RETURN).strip()
    if not _allowed_return(return_to):
        return jsonify({"error": "invalid_return_to"}), 400
    state = _serializer().dumps({"r": return_to})
    params = {
        "client_id": DISCORD_CLIENT_ID,
        "response_type": "code",
        "redirect_uri": DISCORD_REDIRECT_URI,
        "scope": _OAUTH_SCOPES,
        "state": state,
        "prompt": "consent",
    }
    return redirect(f"{DISCORD_AUTHORIZE}?{urlencode(params)}")


@auth_bp.route("/discord/callback", methods=["GET"])
@limiter.limit(AUTH_RATE_LIMIT)
def discord_callback():
    code = request.args.get("code")
    state = request.args.get("state")
    if not code or not state:
        return _error_page("Missing authorization code.")
    try:
        data = _serializer().loads(state, max_age=STATE_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return _error_page("Login link expired — please try again.")
    return_to = data.get("r") or DEFAULT_WEB_RETURN
    if not _allowed_return(return_to):
        return _error_page("Invalid return target.")

    # Exchange the code for an access token, then read the user profile.
    try:
        tok = requests.post(
            DISCORD_TOKEN_URL,
            data={
                "client_id": DISCORD_CLIENT_ID,
                "client_secret": DISCORD_CLIENT_SECRET,
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": DISCORD_REDIRECT_URI,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            timeout=_HTTP_TIMEOUT,
        )
    except requests.RequestException:
        log.warning("[auth] discord token endpoint unreachable")
        return _deliver(return_to, error="discord_unreachable")
    if tok.status_code != 200:
        log.warning("[auth] token exchange failed: %s", tok.status_code)
        return _deliver(return_to, error="token_exchange_failed")
    access_token = (tok.json() or {}).get("access_token")
    if not access_token:
        return _deliver(return_to, error="token_exchange_failed")

    try:
        me = requests.get(
            DISCORD_ME_URL,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=_HTTP_TIMEOUT,
        )
    except requests.RequestException:
        return _deliver(return_to, error="discord_unreachable")
    if me.status_code != 200:
        return _deliver(return_to, error="userinfo_failed")
    u = me.json() or {}
    if not u.get("id"):
        return _deliver(return_to, error="userinfo_failed")

    user = accounts.upsert_user(
        {
            "discord_id": u["id"],
            "username": u.get("username"),
            "global_name": u.get("global_name"),
            "avatar": u.get("avatar"),
            "email": u.get("email"),
        }
    )
    display = user.get("global_name") or user.get("username") or user["discord_id"]
    token, payload = jwt_util.mint_token(
        sub=user["discord_id"],
        name=display,
        secret=current_app.config["SECRET_KEY"],
        token_version=user["token_version"],
        ttl_seconds=TOKEN_TTL,
    )
    accounts.create_session(
        jti=payload["jti"],
        user_id=user["discord_id"],
        issued_at=payload["iat"],
        expires_at=payload["exp"],
        device_label="desktop" if _is_loopback(return_to) else "web",
    )
    log.info("[auth] signed in user %s", _s(user["discord_id"]))
    return _deliver(return_to, token=token)


@auth_bp.route("/logout", methods=["POST"])
@require_user
def logout():
    accounts.revoke_session(g.bmo_claims.get("jti"))
    return jsonify({"ok": True})


# ── Routes: account ───────────────────────────────────────────────────


@account_bp.route("/me", methods=["GET"])
@require_user
def account_me():
    u = g.bmo_user
    return jsonify(
        {
            "id": u["discord_id"],
            "username": u["username"],
            "global_name": u["global_name"],
            "avatar": u["avatar"],
            "email": u["email"],
            "quota_bytes": u["quota_bytes"],
            "used_bytes": u["used_bytes"],
            "created_at": u["created_at"],
        }
    )


def register_auth(flask_app, db_path: str | None = None) -> None:
    """Mount the auth + account blueprints. ``db_path`` (tests) points the
    accounts store at a throwaway DB; production uses the default lazy path."""
    if db_path is not None:
        accounts.configure(db_path)
    flask_app.register_blueprint(auth_bp)
    flask_app.register_blueprint(account_bp)
