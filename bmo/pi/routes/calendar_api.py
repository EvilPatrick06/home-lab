"""Google Calendar HTTP surface (/api/calendar/*) + OAuth flow.

Extracted from app.py 2026-06-10, PHASE-16 16E. Module name carries the `_api` suffix (repo
gotcha: never shadow stdlib `calendar`). The calendar service is resolved late via
`_calendar()`. `__file__` is now bmo/pi/routes/calendar_api.py, so the config-dir helpers gain
one extra `dirname` each vs app.py to keep `bmo/pi/config` (+ legacy `bmo/config`) resolving
identically. google-auth + requests stay function-local imports as before.
"""

import json
import logging
import os
import shutil
import time

from flask import Blueprint, Response, jsonify, request

from services.bmo_logging import _s, fail

log = logging.getLogger("bmo")

calendar_bp = Blueprint("calendar_api", __name__, url_prefix="/api/calendar")


def _calendar():
    # app.py runs as __main__ (ExecStart: python app.py) and init_services() sets the
    # service singletons as __main__ globals; the route blueprints reach this module via
    # `import app` — a SEPARATE module object whose `calendar` stays None. Prefer the live
    # service from __main__, falling back to app.calendar (which the test suite mocks).
    import sys

    live = getattr(sys.modules.get("__main__"), "calendar", None)
    if live is not None:
        return live
    import app

    return app.calendar


@calendar_bp.before_request
def _require_calendar_service():
    # app.calendar is None when the service init failed (e.g. missing/expired Google
    # OAuth). Without this guard, routes call a method on None → AttributeError → 500.
    # Return the same graceful "offline" shape the /events RuntimeError path uses, so
    # the dashboard shows "calendar unavailable" instead of erroring on a 500 HTML page.
    if _calendar() is None:
        return jsonify({"offline": True, "needs_auth": True, "events": []})


@calendar_bp.route("/events")
def api_calendar_events():
    calendar = _calendar()
    days = int(request.args.get("days", 7))
    # Optional window start (ISO-8601). The dashboard passes start-of-today so the view
    # isn't a rolling-from-now window. `max` is bumped for the Year view (a year of
    # events easily exceeds the default cap); clamped so a bad value can't hammer the API.
    max_results = max(1, min(int(request.args.get("max", 20)), 2500))
    time_min = request.args.get("from") or None
    try:
        events = calendar.get_upcoming_events(days_ahead=days, max_results=max_results, time_min=time_min)
        return jsonify({"events": events})
    except RuntimeError:
        return jsonify({"offline": True, "events": [], "needs_auth": True})
    except Exception:
        log.exception("[calendar] /events failed")
        return jsonify({"offline": True, "events": [], "error": "calendar unavailable"})


@calendar_bp.route("/today")
def api_calendar_today():
    try:
        return jsonify(_calendar().get_today_events())
    except RuntimeError:
        return jsonify({"offline": True, "events": [], "needs_auth": True})
    except Exception:
        log.exception("[calendar] /today failed")
        return jsonify({"offline": True, "events": [], "error": "calendar unavailable"})


@calendar_bp.route("/next")
def api_calendar_next():
    try:
        event = _calendar().get_next_event()
        return jsonify(event or {})
    except RuntimeError:
        return jsonify({"offline": True, "needs_auth": True})
    except Exception:
        log.exception("[calendar] /next failed")
        return jsonify({"offline": True, "error": "calendar unavailable"})


@calendar_bp.route("/create", methods=["POST"])
def api_calendar_create():
    calendar = _calendar()
    data = request.json or {}
    import datetime
    try:
        start = datetime.datetime.fromisoformat(data["start"])
        end = datetime.datetime.fromisoformat(data["end"])
        event = calendar.create_event(
            summary=data.get("summary", ""),
            start_dt=start,
            end_dt=end,
            description=data.get("description", ""),
            location=data.get("location", ""),
        )
        return jsonify(event)
    except RuntimeError:
        return jsonify({"error": "calendar not authorized"}), 503
    except Exception as e:
        return fail(log, e, 500, "could not create event")


@calendar_bp.route("/update/<event_id>", methods=["PUT"])
def api_calendar_update(event_id):
    calendar = _calendar()
    data = request.json or {}
    import datetime as _dt
    kwargs = {}
    if "summary" in data:
        kwargs["summary"] = data["summary"]
    if "description" in data:
        kwargs["description"] = data["description"]
    if "location" in data:
        kwargs["location"] = data["location"]
    if "start" in data:
        kwargs["start"] = _dt.datetime.fromisoformat(data["start"])
    if "end" in data:
        kwargs["end"] = _dt.datetime.fromisoformat(data["end"])
    updated = calendar.update_event(event_id, **kwargs)
    return jsonify(updated)


@calendar_bp.route("/delete/<event_id>", methods=["DELETE"])
def api_calendar_delete(event_id):
    _calendar().delete_event(event_id)
    return jsonify({"ok": True})


def _calendar_config_dir() -> str:
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")


def _calendar_legacy_config_dir() -> str:
    # Back-compat: older setup layouts used bmo/config instead of bmo/pi/config.
    return os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "config"
    )


def _ensure_calendar_credentials_path() -> str:
    config_dir = _calendar_config_dir()
    os.makedirs(config_dir, exist_ok=True)
    local_path = os.path.join(config_dir, "credentials.json")
    if os.path.exists(local_path):
        return local_path

    legacy_path = os.path.join(_calendar_legacy_config_dir(), "credentials.json")
    if os.path.exists(legacy_path):
        try:
            shutil.copy2(legacy_path, local_path)
            log.info(f"[calendar] migrated credentials.json from legacy path: {legacy_path}")
            return local_path
        except OSError:
            log.exception("[calendar] failed to migrate credentials.json")
            return legacy_path

    return local_path


def _ensure_calendar_token_path() -> str:
    config_dir = _calendar_config_dir()
    os.makedirs(config_dir, exist_ok=True)
    local_path = os.path.join(config_dir, "token.json")
    if os.path.exists(local_path):
        return local_path

    legacy_path = os.path.join(_calendar_legacy_config_dir(), "token.json")
    if os.path.exists(legacy_path):
        try:
            shutil.copy2(legacy_path, local_path)
            log.info(f"[calendar] migrated token.json from legacy path: {legacy_path}")
            return local_path
        except OSError:
            log.exception("[calendar] failed to migrate token.json")
            return legacy_path

    return local_path


def _calendar_read_token_file(path: str) -> dict | None:
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _calendar_merge_token_data(new_token_data: dict, existing_token_data: dict | None) -> dict:
    merged = dict(new_token_data or {})
    existing = existing_token_data or {}
    if not merged.get("refresh_token") and existing.get("refresh_token"):
        merged["refresh_token"] = existing["refresh_token"]
        log.info("[calendar] preserving existing refresh_token from prior token.json")
    return merged


def _calendar_write_token_file(path: str, payload_json: str):
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    tmp_path = f"{path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        f.write(payload_json)
    os.replace(tmp_path, path)


def _calendar_client_config(credentials_path: str) -> dict:
    with open(credentials_path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    client = raw.get("installed") or raw.get("web")
    if not client:
        raise RuntimeError("credentials.json must contain an 'installed' or 'web' OAuth client")
    return client


@calendar_bp.route("/auth/url")
def api_calendar_auth_url():
    """Generate a stateless OAuth URL for Google Calendar authorization."""
    try:
        import urllib.parse

        creds_path = _ensure_calendar_credentials_path()
        if not os.path.exists(creds_path):
            return jsonify(
                {
                    "error": (
                        "credentials.json not found. Add it to bmo/pi/config "
                        "(or legacy bmo/config), then try again."
                    )
                }
            ), 400

        client = _calendar_client_config(creds_path)
        client_id = client.get("client_id", "").strip()
        if not client_id:
            return jsonify({"error": "credentials.json missing client_id"}), 400

        mode = (request.args.get("mode") or "auto").strip().lower()
        if mode == "manual":
            redirect_uri = "urn:ietf:wg:oauth:2.0:oob"
        else:
            # QA #5 (2026-05-17): request.host_url returns http:// because gevent
            # terminates plain HTTP — but the user's browser is on https://
            # behind Cloudflare Tunnel. Honor X-Forwarded-Proto / X-Forwarded-Host
            # so the redirect_uri Google sees matches what's whitelisted in the
            # OAuth client (the cause of "redirect_uri_mismatch").
            fwd_proto = (request.headers.get("X-Forwarded-Proto") or "").strip().lower()
            scheme = fwd_proto if fwd_proto in ("http", "https") else (request.scheme or "http")
            fwd_host = (request.headers.get("X-Forwarded-Host") or "").strip()
            host = fwd_host or request.host
            default_uri = f"{scheme}://{host}/api/calendar/auth/callback"
            redirect_uri = (request.args.get("redirect_uri", "").strip() or default_uri)
        scope = urllib.parse.quote("https://www.googleapis.com/auth/calendar", safe="")
        auth_url = (
            "https://accounts.google.com/o/oauth2/auth"
            f"?client_id={urllib.parse.quote(client_id, safe='')}"
            f"&redirect_uri={urllib.parse.quote(redirect_uri, safe='')}"
            "&response_type=code"
            f"&scope={scope}"
            "&access_type=offline"
            + ("&prompt=consent" if mode == "manual" else "")
            + "&include_granted_scopes=true"
        )
        manual_redirect_uri = "urn:ietf:wg:oauth:2.0:oob"
        manual_auth_url = (
            "https://accounts.google.com/o/oauth2/auth"
            f"?client_id={urllib.parse.quote(client_id, safe='')}"
            f"&redirect_uri={urllib.parse.quote(manual_redirect_uri, safe='')}"
            "&response_type=code"
            f"&scope={scope}"
            "&access_type=offline"
            "&prompt=consent"
            "&include_granted_scopes=true"
        )
        return jsonify(
            {
                "url": auth_url,
                "redirect_uri": redirect_uri,
                "manual_url": manual_auth_url,
                "mode": mode,
            }
        )
    except Exception as e:
        return fail(log, e, 500, "internal server error")


def _calendar_auth_html(success: bool, message: str) -> str:
    title = "Calendar Authorized" if success else "Calendar Authorization Failed"
    status_color = "#22c55e" if success else "#ef4444"
    event_payload = "true" if success else "false"
    safe_message = (message or "").replace("<", "&lt;").replace(">", "&gt;")
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <style>
      body {{
        background: #0f172a;
        color: #e2e8f0;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
      }}
      .card {{
        width: min(92vw, 560px);
        background: #111827;
        border: 1px solid #1f2937;
        border-radius: 12px;
        padding: 18px 16px;
      }}
      .dot {{
        width: 10px;
        height: 10px;
        border-radius: 9999px;
        display: inline-block;
        background: {status_color};
        margin-right: 8px;
      }}
      code {{
        background: #0b1220;
        padding: 2px 6px;
        border-radius: 6px;
      }}
    </style>
  </head>
  <body>
    <div class="card">
      <h2><span class="dot"></span>{title}</h2>
      <p>{safe_message}</p>
      <p>You can close this tab and return to BMO.</p>
    </div>
    <script>
      try {{
        if (window.opener && !window.opener.closed) {{
          window.opener.postMessage({{ type: "bmo-calendar-auth", ok: {event_payload}, message: {json.dumps(message)} }}, "*");
        }}
      }} catch (e) {{}}
      setTimeout(() => window.close(), 1200);
    </script>
  </body>
</html>"""


@calendar_bp.route("/auth/status")
def api_calendar_auth_status():
    """Quick auth status probe used by UI while waiting for OAuth callback."""
    calendar = _calendar()
    now = time.time()
    try:
        resolved_token_path = _ensure_calendar_token_path()
        if not os.path.exists(resolved_token_path):
            return jsonify({"authorized": False, "message": "token.json missing", "checked_at": now})

        if calendar:
            calendar._service = None
            calendar.get_next_event()
        return jsonify({"authorized": True, "message": "Calendar token is valid", "checked_at": now})
    except Exception:
        log.exception("calendar auth check failed")
        return jsonify({"authorized": False, "message": "calendar not authorized", "checked_at": now}), 200


@calendar_bp.route("/auth/callback", methods=["GET", "POST"])
def api_calendar_auth_callback():
    """Exchange auth code for token and save it. Accepts full URL or raw code."""
    calendar = _calendar()
    browser_callback = request.method == "GET"
    if browser_callback:
        raw = (request.args.get("code") or "").strip()
    else:
        raw = (request.json or {}).get("code", "").strip()

    oauth_error = (request.args.get("error") or "").strip() if browser_callback else ""
    if browser_callback and oauth_error:
        html = _calendar_auth_html(False, f"Google OAuth error: {oauth_error}")
        return Response(html, mimetype="text/html")

    if not raw:
        if browser_callback:
            html = _calendar_auth_html(False, "No auth code was provided by Google.")
            return Response(html, mimetype="text/html")
        return jsonify({"error": "No code provided"}), 400
    try:
        import urllib.parse
        import requests as http_requests
        from google.oauth2.credentials import Credentials

        creds_path = _ensure_calendar_credentials_path()
        if not os.path.exists(creds_path):
            return jsonify({"error": "credentials.json not found. Add it, then retry auth."}), 400

        client = _calendar_client_config(creds_path)
        client_id = client.get("client_id", "").strip()
        client_secret = client.get("client_secret", "").strip()
        if not client_id or not client_secret:
            return jsonify({"error": "credentials.json missing client_id/client_secret"}), 400

        token_path = _ensure_calendar_token_path()
        existing_token_data = _calendar_read_token_file(token_path)

        # User may paste full redirect URL or just the code
        if "code=" in raw:
            parsed = urllib.parse.urlparse(raw)
            params = urllib.parse.parse_qs(parsed.query)
            code = params.get("code", [""])[0].strip()
        else:
            code = raw
        if not code:
            return jsonify({"error": "Could not extract auth code"}), 400

        # Same X-Forwarded-Proto / X-Forwarded-Host handling as the auth/url
        # builder (31b). Without this the token-exchange redirect_uri sends
        # http:// while Google saw https:// during the initial /auth — they
        # must match byte-for-byte or Google returns invalid_grant.
        if browser_callback:
            fwd_proto = (request.headers.get("X-Forwarded-Proto") or "").strip().lower()
            scheme = fwd_proto if fwd_proto in ("http", "https") else (request.scheme or "http")
            fwd_host = (request.headers.get("X-Forwarded-Host") or "").strip()
            host = fwd_host or request.host
            redirect_uri = f"{scheme}://{host}/api/calendar/auth/callback"
        else:
            redirect_uri = "urn:ietf:wg:oauth:2.0:oob"
        log.info(
            "[calendar] Token-exchange POST: client_id_tail=...%s, redirect_uri=%s, code_tail=...%s",
            _s(client_id[-15:]), _s(redirect_uri), _s(code[-6:]),
        )
        token_resp = http_requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=15,
        )
        if token_resp.status_code != 200:
            detail = token_resp.text[:600]
            log.info("[calendar] Token exchange failed (%s): %s", token_resp.status_code, _s(detail))
            message = f"Token exchange failed ({token_resp.status_code})"
            if browser_callback:
                html = _calendar_auth_html(False, message)
                return Response(html, mimetype="text/html"), 400
            return jsonify({"error": message}), 400
        log.info("[calendar] Token exchange succeeded — writing token.json")

        token_data = token_resp.json()
        merged_token_data = _calendar_merge_token_data(token_data, existing_token_data)
        if not merged_token_data.get("refresh_token"):
            message = (
                "Google did not return a refresh token. Re-authorize with consent "
                "so BMO can stay connected permanently."
            )
            if browser_callback:
                html = _calendar_auth_html(False, message)
                return Response(html, mimetype="text/html"), 400
            return jsonify({"error": message}), 400
        creds = Credentials(
            token=merged_token_data.get("access_token"),
            refresh_token=merged_token_data.get("refresh_token"),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret,
            scopes=["https://www.googleapis.com/auth/calendar"],
        )
        if not creds.token:
            return jsonify({"error": "Token exchange returned no access token"}), 400

        log.info("[calendar] Exchanging auth code: %s...", _s(code[:20]))
        _calendar_write_token_file(token_path, creds.to_json())

        # Reset calendar service to pick up new token
        if calendar:
            calendar._service = None
            calendar._cache = []

            # Verify token immediately so status flips from DOWN as soon as possible.
            try:
                calendar.get_next_event()
            except Exception:
                log.exception("[calendar] token saved but validation failed")
                message = "Token saved but calendar validation failed"
                if browser_callback:
                    html = _calendar_auth_html(False, message)
                    return Response(html, mimetype="text/html"), 400
                return jsonify({"error": message}), 400

        success_message = "Calendar authorized!"
        if browser_callback:
            html = _calendar_auth_html(True, success_message)
            return Response(html, mimetype="text/html")
        return jsonify({"ok": True, "message": success_message})
    except Exception as e:
        if browser_callback:
            log.exception("[calendar] Auth failed")
            html = _calendar_auth_html(False, "Calendar authorization failed")
            return Response(html, mimetype="text/html"), 500
        return fail(log, e, 500, "internal server error")


def register_calendar(flask_app):
    """Register the calendar blueprint. PHASE-16 16E."""
    flask_app.register_blueprint(calendar_bp)
