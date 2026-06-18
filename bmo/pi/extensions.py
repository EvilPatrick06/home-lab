"""Flask extensions with deferred initialization.

Extracted from app.py 2026-06-10, PHASE-16 16A.

The rate limiter lives here so blueprint modules (routes/chat_api.py) can
`from extensions import limiter` and decorate their view functions at import time
WITHOUT importing app.py (which would be circular). The limiter is constructed without
an app; `app.py` calls `limiter.init_app(app)` exactly once. flask-limiter binds
`@limiter.limit(...)` decorators to the limiter INSTANCE, not the app, so decorate-before-
init is supported.
"""

import os

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address


def _rate_limit_key():
    """Per-IP key. Localhost returns a sentinel so the @limiter.exempt
    test below skips counting kiosk / loopback traffic."""
    addr = (get_remote_address() or "")
    if addr in ("127.0.0.1", "::1", "localhost"):
        return "__localhost_exempt__"
    return addr


def _is_localhost_request():
    """Used by limiter `default_limits_exempt_when` to skip ALL limits for
    requests originating on localhost."""
    addr = (get_remote_address() or "")
    return addr in ("127.0.0.1", "::1", "localhost")


limiter = Limiter(
    key_func=_rate_limit_key,
    default_limits=[os.environ.get("BMO_DEFAULT_RATE_LIMIT", "120 per minute")],
    default_limits_exempt_when=_is_localhost_request,
    storage_uri="memory://",  # single-process gevent — fine
    headers_enabled=True,     # adds X-RateLimit-* response headers
    swallow_errors=True,      # if storage fails, log + allow (don't deny)
)
# NOTE: no limiter.init_app(app) here — app.py owns that (deferred-init pattern).


# Per-route limits (set as constants so they're env-overridable in one place)
RATE_LIMIT_CHAT = os.environ.get("BMO_CHAT_RATE_LIMIT", "30 per minute")
RATE_LIMIT_DND_LOAD = os.environ.get("BMO_DND_LOAD_RATE_LIMIT", "15 per minute")
RATE_LIMIT_IDE_JOBS = os.environ.get("BMO_IDE_JOBS_RATE_LIMIT", "10 per minute")
RATE_LIMIT_NARRATE = os.environ.get("BMO_NARRATE_RATE_LIMIT", "30 per minute")
RATE_LIMIT_GAMES = os.environ.get("BMO_GAMES_RATE_LIMIT", "30 per minute")
# PHASE-31 31E — live recap is a billable cloud LLM call; keep it tight.
RATE_LIMIT_RECAP = os.environ.get("BMO_RECAP_RATE_LIMIT", "6 per minute")
# PHASE-36 36C — play-by-post control proxies (start/advance/skip/scene/stop).
RATE_LIMIT_PBP = os.environ.get("BMO_PBP_RATE_LIMIT", "60 per minute")
