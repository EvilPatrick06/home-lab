"""BMO — AI Voice + Vision Assistant for Raspberry Pi 5.

Main Flask application with WebSocket support. Constructs `app`/`socketio`, the
auth gate, and `init_services()`. Still hosts the un-extracted domains: camera,
voice enroll, timers/alarms, LED + OLED face, Discord DM bridge, scenes, weather,
smart-home, notes, lists, alerts, routines, personality, notifications, MCP,
commands, memory, voice-settings, models, and the games registry SSE.

PHASE-16 moved the HTTP/WS surface into routes/ (see the registration block at the
bottom): system_api (/health, /api/wifi|volume|audio|tts|settings|config|status|service),
music_api (/api/music/*), calendar_api (/api/calendar/* + OAuth), tv_api (/api/tv/*),
chat_api (/api/chat*, /api/dnd/*), realtime_ws (core SocketIO handlers), ide (/api/ide/*).
Shared mutable state → state.py (STATE); cross-cutting helpers → services/.

Usage:
    source ~/home-lab/bmo/pi/venv/bin/activate
    python app.py
"""

from gevent import monkey
monkey.patch_all()

import json
import os
import secrets
import subprocess
import threading
import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import Flask, Response, jsonify, render_template, request, send_from_directory, stream_with_context
from flask_socketio import SocketIO
from services.bmo_logging import _s, fail, get_logger
log = get_logger("bmo")

from state import STATE

# Canary boot + configurable bind port. BMO_PORT lets the entrypoint bind any
# port (default 5000); BMO_CANARY=1 boots a validation-only path that imports
# every service module + registers all routes + answers /health WITHOUT touching
# hardware/audio/alarms/pollers — catches the dominant deploy-break class
# (syntax/import errors) without standing up the live assistant.
BMO_PORT = int(os.environ.get("BMO_PORT", "5000"))
BMO_CANARY = os.environ.get("BMO_CANARY", "").lower() in ("1", "true", "yes")

# ── App Setup ────────────────────────────────────────────────────────

app = Flask(__name__, template_folder="web/templates", static_folder="web/static")

# Hard cap on inbound request body size — prevents a single bad client from
# OOM-ing the Pi by streaming an unbounded POST. Per-route validators (for
# /api/chat etc.) enforce tighter limits on top of this.
app.config["MAX_CONTENT_LENGTH"] = int(
    os.environ.get("BMO_MAX_REQUEST_SIZE", str(32 * 1024 * 1024))
)


@app.after_request
def _cache_policy(response):
    """Cache + security headers.

    Cache: static assets cached 1 h, HTML revalidates each load.
    Security: baseline CSP / frame-options / sniff / referrer / permissions
    headers so a stray XSS in any rendered field has browser-side mitigation.
    """
    if "text/html" in response.content_type:
        # HTML: always revalidate (browser still uses ETag / 304)
        response.headers["Cache-Control"] = "no-cache"
    elif request.path.startswith("/static/"):
        # JS / CSS / images: cache 1 hour, revalidate after
        response.headers["Cache-Control"] = "public, max-age=3600, must-revalidate"

    # Defense-in-depth headers (setdefault so per-route can override if needed)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Permissions-Policy",
        "camera=(self), microphone=(self), geolocation=()",
    )

    # Phase 29g registry CORS: the dnd-app Electron renderer fetches the
    # /api/games* endpoints from a `file://` origin (or a different LAN
    # IP than the Pi). Without ACAO, browsers refuse the response and
    # the GameList shows "No Pi registry connected" even though the Pi
    # is reachable. The registry surface is intentionally LAN-public
    # (announce/list/stream are how clients discover hosted games), so
    # `*` is the correct policy here — auth on these routes is gated by
    # the optional BMO_REGISTRY_API_KEY header check, not by origin.
    if (request.path or "").startswith("/api/games"):
        response.headers.setdefault("Access-Control-Allow-Origin", "*")
        response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
        response.headers.setdefault(
            "Access-Control-Allow-Headers", "Content-Type, X-Registry-Key, Authorization"
        )
        response.headers.setdefault("Access-Control-Max-Age", "600")
    # Phase 36: the dnd-app fetches the read-only 5e library (/api/library*) from
    # a file:// origin too. Same LAN-public rationale as the registry — non-sensitive
    # content, GET-only, `*` is correct.
    if (request.path or "").startswith("/api/library"):
        response.headers.setdefault("Access-Control-Allow-Origin", "*")
        response.headers.setdefault("Access-Control-Allow-Methods", "GET, OPTIONS")
        response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type, Authorization")
        response.headers.setdefault("Access-Control-Max-Age", "86400")
    # Cloud-backup API (/api/rclone*): the dnd-app's MAIN process (Node, no CORS)
    # normally calls these, but set ACAO for parity + any future renderer use.
    # The CF Access service-token headers are forwarded from cloudflared off-LAN.
    if (request.path or "").startswith("/api/rclone"):
        response.headers.setdefault("Access-Control-Allow-Origin", "*")
        response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        response.headers.setdefault(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization, CF-Access-Client-Id, CF-Access-Client-Secret",
        )
        response.headers.setdefault("Access-Control-Max-Age", "600")
    # Pi-hosted bundled sounds (/api/sounds*): renderer fetches from file:// —
    # read-only audio, GET-only, `*` is correct.
    if (request.path or "").startswith("/api/sounds"):
        response.headers.setdefault("Access-Control-Allow-Origin", "*")
        response.headers.setdefault("Access-Control-Allow-Methods", "GET, OPTIONS")
        response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type, Authorization")
        response.headers.setdefault("Access-Control-Max-Age", "86400")
    if "text/html" in response.content_type:
        # 'unsafe-eval' is REQUIRED: Alpine.js compiles its `x-data` / `@click`
        # / `x-show` expressions via `new AsyncFunction(expr)` at runtime, which
        # CSP classifies as `eval`. Without it the kiosk buttons silently fail.
        # 'unsafe-inline' covers inline <script> blocks in the IDE template.
        # CDN hosts cover the IDE's xterm / marked / monaco / socket.io scripts.
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; "
            # Round 4 #20 (2026-05-17): added `blob:` to script-src so
            # Monaco's worker shim (URL.createObjectURL(Blob([...]))) can
            # actually load under CF Access. Without it the shim fails
            # silently and Monaco falls back to main-thread workers (the
            # "Could not create web worker(s)" warning). worker-src is
            # added separately for completeness — modern browsers split
            # worker URLs into their own directive.
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net https://cdn.socket.io; "
            "worker-src 'self' blob: https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            # Round 3 #14 (2026-05-17): allow YouTube + Google Calendar
            # thumbnail hosts so Music + Calendar cards aren't broken-image
            # icons under our restrictive CSP. Limited to the specific
            # hosts BMO renders from, not a wildcard.
            "img-src 'self' data: blob: "
            "https://yt3.googleusercontent.com "
            "https://lh3.googleusercontent.com "
            "https://i.ytimg.com; "
            "font-src 'self' data: https://cdn.jsdelivr.net; "
            "connect-src 'self' ws: wss:; "
            "frame-ancestors 'self'; "
            "base-uri 'self'; "
            "object-src 'none'",
        )
    return response


# PHASE-16 16B — chat persistence + speaker normalization live in services/chat_history.py;
# this one alias survives for the init_services voice hook below.
from services import chat_history  # noqa: E402

_normalize_chat_speaker = chat_history.normalize_chat_speaker

# PHASE-16 16C — system-audio helpers moved to services/system_audio.py; init_services'
# volume restore is the last in-app caller.
from services.system_audio import set_system_volume as _set_system_volume  # noqa: E402


# ── Rate limiting (cost-sensitive routes) ─────────────────────────────
# PHASE-16 16A — the deferred-init limiter + per-route constants live in extensions.py;
# init_app binds it here, after `app = Flask(...)`. Only the two constants for routes that
# stayed in app.py are imported (narrate ×1, games ×4); the rest moved with their routes.
from extensions import RATE_LIMIT_GAMES, RATE_LIMIT_NARRATE, RATE_LIMIT_PBP, RATE_LIMIT_RECAP, limiter  # noqa: E402
from services.settings_store import load_setting as _load_setting  # noqa: E402

limiter.init_app(app)


def _get_secret_key() -> str:
    """Return a stable SECRET_KEY: env var > persisted file > generate + persist."""
    env = os.environ.get("SECRET_KEY")
    if env:
        return env
    key_path = os.path.join(os.path.expanduser("~"), ".bmo_secret_key")
    try:
        with open(key_path, "r") as f:
            key = f.read().strip()
        if key:
            return key
    except FileNotFoundError:
        pass
    key = secrets.token_hex(32)
    with open(key_path, "w") as f:
        f.write(key)
    os.chmod(key_path, 0o600)
    return key


app.config["SECRET_KEY"] = _get_secret_key()


# Optional LAN/internet hardening (OPT-IN): when BMO_API_KEY is set in the env,
# non-localhost HTTP + SocketIO connects must present `Authorization: Bearer <key>`
# (the kiosk on 127.0.0.1 is exempt). When UNSET (the default), the app is open —
# any client can reach the Pi without a key, which is what the VTT relies on so it
# works out of the box. Set the env var only if you expose the Cloudflare tunnel to
# the public internet and want to lock it down. See docs/SECURITY.md.
BMO_API_KEY = (os.environ.get("BMO_API_KEY") or "").strip()
# Optional STRICTER second credential for the registry mutation routes
# (announce/heartbeat/deregister). Opt-in (env-only): when unset, those routes fall
# back to the front-door BMO_API_KEY gate (which is itself open unless BMO_API_KEY
# is set).
BMO_REGISTRY_API_KEY = (os.environ.get("BMO_REGISTRY_API_KEY") or "").strip()


def _bmo_client_is_trusted_localhost() -> bool:
    addr = (getattr(request, "remote_addr", None) or "") or ""
    if addr not in ("127.0.0.1", "::1", "localhost"):
        return False
    # A loopback remote_addr is only genuinely local when the request did NOT
    # arrive through a reverse proxy / tunnel. cloudflared (the Cloudflare
    # tunnel) proxies to 127.0.0.1 but stamps forwarding headers — without this
    # check a tunnelled request would masquerade as trusted localhost and bypass
    # the API key entirely. Treat any forwarding header as "not local".
    for header in ("X-Forwarded-For", "X-Forwarded-Host", "X-Real-IP", "CF-Connecting-IP", "Forwarded"):
        if request.headers.get(header):
            return False
    return True


def _bmo_bearer_authorized() -> bool:
    if not BMO_API_KEY:
        return True
    if _bmo_client_is_trusted_localhost():
        return True
    auth = (request.headers.get("Authorization", "") or "").strip()
    return auth == f"Bearer {BMO_API_KEY}"


@app.before_request
def _bmo_optional_api_key():
    p = request.path or ""
    # Phase 29g registry CORS preflight: browsers fire OPTIONS for any
    # POST/PATCH/DELETE with non-simple headers (Content-Type:
    # application/json, X-Registry-Key, etc.). Short-circuit those so
    # the actual route's method allowlist doesn't 405 them.
    if request.method == "OPTIONS" and (
        p.startswith("/api/games") or p.startswith("/api/rclone") or p.startswith("/api/sounds")
    ):
        return ("", 204)
    # Default (no BMO_API_KEY env set): the app is OPEN — the VTT and any LAN
    # client reach the Pi without a key. The gate below only engages when the
    # owner opts in by setting BMO_API_KEY (then non-localhost callers need the
    # Bearer; health/static + trusted localhost stay exempt).
    if not BMO_API_KEY:
        return None
    if p in ("/health", "/favicon.ico") or p.startswith("/static/"):
        return None
    if _bmo_client_is_trusted_localhost():
        return None
    if request.headers.get("Authorization", "") == f"Bearer {BMO_API_KEY}":
        return None
    # EventSource (the VTT's game-registry SSE subscription) can't set an
    # Authorization header, so accept the key as an `api_key` query param for
    # that one streaming route. Confined to /api/games/stream so the less-safe
    # query-param credential isn't accepted app-wide.
    if p == "/api/games/stream" and (request.args.get("api_key") or "") == BMO_API_KEY:
        return None
    return (
        jsonify(
            {
                "error": "unauthorized",
                "message": "Set BMO_API_KEY in the client as Authorization: Bearer, or use localhost.",
            }
        ),
        401,
    )


# Production: gevent. Tests: conftest sets BMO_SOCKETIO_ASYNC_MODE=threading
# so `import app` works without a real gevent stack when a test file loads
# app before any module that mocks flask_socketio.
_sio_mode = os.environ.get("BMO_SOCKETIO_ASYNC_MODE", "gevent")
if _sio_mode not in ("gevent", "threading", "eventlet"):
    _sio_mode = "gevent"
socketio = SocketIO(app, async_mode=_sio_mode, cors_allowed_origins="*")

# QA #28 (2026-05-17): unified face state machine. Initialized before
# init_services() runs so _sync_expression can hand off cleanly. Singleton
# accessed as services.face_state.FACE; emits `face_state` SocketIO events.
from services.face_state import init_face_state
init_face_state(socketio=socketio)

# ── Services (lazy-initialized) ─────────────────────────────────────

voice = None
camera = None
calendar = None
music = None
smart_home = None
weather = None
timers = None
agent = None
led_controller = None
health_checker = None
notifier = None
audio_service = None
scene_service = None
oled_face = None
list_service = None
alert_service = None
routine_service = None
personality_engine = None
location_service = None


def _normalize_timezone(name: str | None) -> str | None:
    tz_name = str(name or "").strip()
    if not tz_name:
        return None
    try:
        ZoneInfo(tz_name)
        return tz_name
    except ZoneInfoNotFoundError:
        return None


def _pi_timezone() -> str:
    try:
        proc = subprocess.run(
            ["timedatectl", "show", "--property=Timezone", "--value"],
            capture_output=True, text=True, timeout=5, check=False,
        )
        tz = _normalize_timezone(proc.stdout.strip())
        if tz:
            return tz
    except (OSError, subprocess.SubprocessError):
        pass
    loc_tz = _normalize_timezone((location_service or {}).get("timezone") if isinstance(location_service, dict) else None)
    if loc_tz:
        return loc_tz
    return "America/New_York"


def _request_client_timezone(default_to_pi: bool = True) -> str | None:
    explicit = _normalize_timezone(
        request.args.get("client_timezone")
        or request.headers.get("X-Client-Timezone")
        or (request.get_json(silent=True) or {}).get("client_timezone")
    )
    if explicit:
        return explicit
    return _pi_timezone() if default_to_pi else None


def init_services():
    """Initialize all services. Called once on startup.
    Gracefully skips hardware-dependent services when running on non-Pi platforms.
    """
    global voice, camera, calendar, music, smart_home, weather, timers, agent, led_controller, health_checker, notifier, audio_service, scene_service, oled_face, list_service, alert_service, routine_service, personality_engine, location_service

    from agent import BmoAgent

    log.info("[bmo] Initializing services...")

    service_map = {}

    # Show warmup face during initialization
    # (oled_face gets set below, so we set warmup after OLED init)

    # LED controller (RGB LEDs)
    led_controller = None
    if BMO_CANARY:
        from hardware.led_controller import LedController  # noqa: F401 — canary import check
        log.info("[bmo]   LED controller: CANARY (import-only)")
    else:
        try:
            from hardware.led_controller import LedController
            led_controller = LedController()
            led_controller.start()
            service_map["leds"] = led_controller
            log.info("[bmo]   LED controller: OK")
        except Exception:
            log.exception("[bmo]   LED controller: SKIPPED")

    # OLED face display (BMO_DISABLE_OLED=1 skips init — e.g. while display
    # hardware is broken/disconnected; every consumer None-guards oled_face)
    oled_face = None
    if BMO_CANARY:
        from hardware.oled_face import OledFace  # noqa: F401 — canary import check
        log.info("[bmo]   OLED face: CANARY (import-only)")
    elif os.environ.get("BMO_DISABLE_OLED", "").lower() in ("1", "true", "yes"):
        log.info("[bmo]   OLED face: DISABLED (BMO_DISABLE_OLED)")
    else:
        try:
            from hardware.oled_face import OledFace
            oled_face = OledFace(socketio=socketio)
            oled_face.start()
            service_map["oled_face"] = oled_face
            oled_face.set_expression("warmup")
            log.info("[bmo]   OLED face: OK (warmup)")
        except Exception:
            log.exception("[bmo]   OLED face: SKIPPED")

    # Voice pipeline (requires pyaudio/mic hardware)
    if BMO_CANARY:
        from services.voice_pipeline import VoicePipeline  # noqa: F401 — canary import check
        voice = None
        log.info("[bmo]   Voice pipeline: CANARY (import-only)")
    else:
        try:
            from services.voice_pipeline import VoicePipeline
            voice = VoicePipeline(socketio=socketio)
            saved_voice_vol = _load_setting("volume.voice", None)
            if saved_voice_vol is not None:
                voice._speak_volume = int(saved_voice_vol)
            service_map["voice"] = voice
            log.info("[bmo]   Voice pipeline: OK")
        except Exception:
            log.exception("[bmo]   Voice pipeline: SKIPPED")

    # Camera (requires picamera2; BMO_DISABLE_CAMERA=1 skips init — camera
    # API routes already 503 when the service is absent)
    if BMO_CANARY:
        from hardware.camera_service import CameraService  # noqa: F401 — canary import check
        camera = None
        log.info("[bmo]   Camera: CANARY (import-only)")
    elif os.environ.get("BMO_DISABLE_CAMERA", "").lower() in ("1", "true", "yes"):
        log.info("[bmo]   Camera: DISABLED (BMO_DISABLE_CAMERA)")
    else:
        try:
            from hardware.camera_service import CameraService
            camera = CameraService(socketio=socketio)
            service_map["camera"] = camera
            log.info("[bmo]   Camera: OK")
        except Exception:
            log.exception("[bmo]   Camera: SKIPPED")

    # Smart home / Chromecast
    if BMO_CANARY:
        from services.smart_home import SmartHomeService  # noqa: F401 — canary import check
        smart_home = None
        log.info("[bmo]   Smart home: CANARY (import-only)")
    else:
        try:
            from services.smart_home import SmartHomeService
            smart_home = SmartHomeService(socketio=socketio)
            service_map["smart_home"] = smart_home
            log.info("[bmo]   Smart home: OK")
        except Exception:
            log.exception("[bmo]   Smart home: SKIPPED")

    # Calendar (Google API)
    if BMO_CANARY:
        from services.calendar_service import CalendarService  # noqa: F401 — canary import check
        calendar = None
        log.info("[bmo]   Calendar: CANARY (import-only)")
    else:
        try:
            from services.calendar_service import CalendarService
            calendar = CalendarService(socketio=socketio)
            service_map["calendar"] = calendar
            log.info("[bmo]   Calendar: OK")
        except Exception:
            log.exception("[bmo]   Calendar: SKIPPED")

    # Dynamic location/timezone
    if BMO_CANARY:
        from services.location_service import LocationService  # noqa: F401 — canary import check
        location_service = None
        log.info("[bmo]   Location: CANARY (import-only)")
    else:
        try:
            from services.location_service import LocationService
            location_service = LocationService()
            location_service.start_polling()
            current_loc = location_service.get_location()
            log.info(
                "[bmo]   Location: OK (%s)",
                current_loc.get("location_label") or current_loc.get("timezone", "unknown"),
            )
        except Exception:
            location_service = None
            log.exception("[bmo]   Location: SKIPPED")

    # Weather
    if BMO_CANARY:
        from services.weather_service import WeatherService  # noqa: F401 — canary import check
        weather = None
        log.info("[bmo]   Weather: CANARY (import-only)")
    else:
        try:
            from services.weather_service import WeatherService
            weather = WeatherService(socketio=socketio, location_service=location_service)
            service_map["weather"] = weather
            log.info("[bmo]   Weather: OK")
        except Exception:
            log.exception("[bmo]   Weather: SKIPPED")

    # Audio output routing (before music so music can use it)
    if BMO_CANARY:
        from services.audio_output_service import AudioOutputService  # noqa: F401 — canary import check
        audio_service = None
        log.info("[bmo]   Audio output: CANARY (import-only)")
    else:
        try:
            from services.audio_output_service import AudioOutputService
            audio_service = AudioOutputService()
            service_map["audio"] = audio_service
            log.info("[bmo]   Audio output: OK")
        except Exception:
            log.exception("[bmo]   Audio output: SKIPPED")

    # Music (requires ytmusicapi/vlc)
    if BMO_CANARY:
        from services.music_service import MusicService  # noqa: F401 — canary import check
        music = None
        log.info("[bmo]   Music: CANARY (import-only)")
    else:
        try:
            from services.music_service import MusicService
            music = MusicService(smart_home=smart_home, socketio=socketio, audio_service=audio_service)
            service_map["music"] = music
            log.info("[bmo]   Music: OK")
        except Exception:
            log.exception("[bmo]   Music: SKIPPED")

    # Timers
    if BMO_CANARY:
        from services.timer_service import TimerService  # noqa: F401 — canary import check
        timers = None
        log.info("[bmo]   Timers: CANARY (import-only)")
    else:
        try:
            from services.timer_service import TimerService
            timers = TimerService(voice_pipeline=voice, socketio=socketio,
                                  agent_fn=lambda: agent)
            saved_alarm_vol = _load_setting("volume.alarms", None)
            if saved_alarm_vol is not None:
                timers.alarm_volume = int(saved_alarm_vol)
            service_map["timers"] = timers
            log.info("[bmo]   Timers: OK")
        except Exception:
            log.exception("[bmo]   Timers: SKIPPED")

    # Agent (core — always required)
    if BMO_CANARY:
        # `from agent import BmoAgent` already ran at the top of init_services as
        # the import check; do NOT instantiate in canary (no LLM/orchestrator boot).
        agent = None
        log.info("[bmo]   Agent: CANARY (import-only)")
    else:
        log.info("[bmo]   Creating agent...")
        agent = BmoAgent(services=service_map, socketio=socketio)
        log.info("[bmo]   Agent: OK")

    if BMO_CANARY:
        # Canary stops here — everything below this point starts pollers/threads,
        # spawns subprocesses, or makes network calls (background starters, the
        # wpctl mic gain, the TV-remote/health-checker/notifier/scheduler threads,
        # KDE Connect, the Ollama warmup). Import-check the remaining service
        # modules (the dominant deploy-break class) without instantiating any of
        # them, then return — leaving every service global None.
        from routes.tv_api import init_tv_remote  # noqa: F401 — canary import check
        from services.monitoring import HealthChecker  # noqa: F401 — canary import check
        from services.notification_service import NotificationService  # noqa: F401 — canary import check
        from services.scene_service import SceneService  # noqa: F401 — canary import check
        from services.list_service import ListService  # noqa: F401 — canary import check
        from services.alert_service import AlertService  # noqa: F401 — canary import check
        from services.routine_service import RoutineService  # noqa: F401 — canary import check
        from services.personality_engine import PersonalityEngine  # noqa: F401 — canary import check
        log.info("[bmo] All services CANARY-checked (import-only) — boot validated.")
        return

    # Start background services that loaded successfully
    if smart_home:
        # Chromecast discovery disabled at boot — zeroconf ServiceBrowser
        # crashes repeatedly and disrupts PipeWire/Bluetooth audio.
        # Discovery runs lazily on first Cast API call instead.
        # smart_home.start_discovery()
        log.info("[bmo]   Smart home: ready (discovery on-demand)")
    if calendar:
        calendar.start_polling()
    if weather:
        weather.start_polling()
    # Boost mic gain for cross-room pickup (PipeWire, persists until reboot).
    # Skipped in canary — the canary must never shell out to the audio stack.
    if not BMO_CANARY:
        try:
            subprocess.run(
                ["wpctl", "set-volume", "@DEFAULT_SOURCE@", "1.5"],
                capture_output=True, timeout=3,
                env={**os.environ, "XDG_RUNTIME_DIR": "/run/user/1000",
                     "DBUS_SESSION_BUS_ADDRESS": "unix:path=/run/user/1000/bus"},
            )
            log.info("[bmo]   Mic gain: 150%")
        except Exception:
            log.exception("[bmo]   Mic gain set failed")

    if voice:
        log.info("[bmo]   Starting voice listener...")
        def _voice_chat(text, speaker="unknown"):
            """Process voice input through the chat agent."""
            try:
                # Check routine voice triggers first
                if routine_service:
                    triggered = routine_service.check_voice_trigger(text)
                    if triggered:
                        routine_service.trigger_routine(triggered["id"])
                        return f"Running {triggered.get('name', 'unknown')} routine!"
                # Check personality Easter eggs
                if personality_engine:
                    easter_egg = personality_engine.check_easter_egg(text)
                    if easter_egg:
                        return easter_egg
                result = agent.chat(text, speaker=speaker, client_timezone=_pi_timezone())
                return result.get("text", "")
            except Exception:
                log.exception("[voice] Chat error")
                return ""
        voice._chat_callback = _voice_chat

        def _voice_chat_stream(text, speaker="unknown"):
            """Streaming voice chat — yields text chunks for faster TTS start."""
            try:
                return agent.chat_stream(text, speaker=speaker, client_timezone=_pi_timezone())
            except Exception:
                log.exception("[voice] Stream chat error")
                return iter([])
        voice._chat_stream_callback = _voice_chat_stream

        voice.start_listening()

    if voice:
        # Wire voice state → OLED + LED sync
        _original_voice_emit = voice._emit
        _VOICE_STATE_TO_EXPRESSION = {
            "listening": "listening",
            "thinking": "thinking",
            "speaking": "speaking",
            "idle": "idle",
            "follow_up": "listening",
        }
        def _voice_emit_with_oled(event, data):
            _original_voice_emit(event, data)
            if event == "status":
                state = data.get("state", "")
                expression = _VOICE_STATE_TO_EXPRESSION.get(state)
                if expression:
                    _sync_expression(expression)
            # Save voice transcriptions (user messages) to chat history.
            # Round 2 #16 (2026-05-17): only persist when the voice pipeline
            # is genuinely listening (not muted) AND the transcription has
            # non-empty text AND a recognized speaker. Earlier we persisted
            # every "transcription" emit, which let STT/wake-word/false-
            # positive turns pollute history as `role: user`.
            elif event == "transcription":
                text = (data.get("text") or "").strip()
                speaker = data.get("speaker", "unknown")
                mic_muted = bool(getattr(voice, "_mic_muted", False)) if voice else False
                if not text:
                    pass  # drop empty
                elif mic_muted:
                    log.info("[chat] dropped transcription while mic muted: speaker=%s text=%r",
                             _s(speaker), _s(text[:40]))
                elif speaker in ("", "unknown"):
                    log.info("[chat] dropped transcription from unknown speaker: text=%r",
                             _s(text[:40]))
                else:
                    _save_chat_message({
                        "role": "user",
                        "text": text,
                        "speaker": _normalize_chat_speaker(f"voice:{speaker}", source_voice=True),
                        "ts": time.time(),
                    })
            # Save voice responses (assistant messages) to chat history
            # and emit as chat_response so the frontend shows them
            elif event == "response":
                from services.voice_pipeline import VoicePipeline
                response_text = data.get("text", "")
                if response_text:
                    clean_text = VoicePipeline._strip_markdown(response_text)
                    _save_chat_message({
                        "role": "assistant",
                        "text": clean_text,
                        "ts": time.time(),
                    })
                    socketio.emit("chat_response", {
                        "text": clean_text,
                        "speaker": data.get("speaker", ""),
                        "agent_used": "",
                    })
        voice._emit = _voice_emit_with_oled

    # Load notes from disk
    _load_notes()

    # Restore chat history into agent memory
    _restore_agent_history()

    # Auto-resume after Code Agent restart (runs shortly after startup)
    threading.Thread(target=_auto_resume_after_restart, daemon=True).start()

    # Try to connect to TV (non-blocking — don't hold up startup). PHASE-16 16F — the TV
    # subsystem lives in routes/tv_api.py; import its seam function-locally (init_services
    # runs after module load, so this is fine and matches the file's lazy-import style).
    from routes.tv_api import (
        TV_APPS,
        init_tv_remote,
        set_tv_is_on,
        tv_cmd,
        tv_connected,
        tv_is_on,
    )
    threading.Thread(target=init_tv_remote, daemon=True).start()

    # Health checker (monitoring + Discord alerts)
    try:
        from services.monitoring import HealthChecker
        health_checker = HealthChecker(socketio=socketio, check_interval=60)
        health_checker.start()
        log.info("[bmo]   Health checker: OK (60s interval)")
    except Exception:
        log.exception("[bmo]   Health checker: SKIPPED")

    # Start KDE Connect daemon (needed for notification bridge)
    try:
        import shutil
        if shutil.which("kdeconnectd"):
            subprocess.Popen(["kdeconnectd"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            log.info("[bmo]   KDE Connect daemon: started")
        else:
            log.info("[bmo]   KDE Connect daemon: not installed")
    except Exception:
        log.exception("[bmo]   KDE Connect daemon: SKIPPED")

    # Notification service (KDE Connect bridge)
    try:
        from services.notification_service import NotificationService
        notifier = NotificationService(voice_pipeline=voice, socketio=socketio)
        notifier.start()
        service_map["notifier"] = notifier
        log.info("[bmo]   Notifications: OK")
    except Exception:
        log.exception("[bmo]   Notifications: SKIPPED")

    # Scene mode engine (PHASE-16 16F — TV access via routes/tv_api.py seam)
    def _scene_tv_send_key(key):
        if tv_connected():
            r = tv_cmd("send_key", key=key)
            if r.get("error"):
                log.info("[scene] TV key failed: %s", _s(r["error"]))

    def _scene_tv_launch(app_name):
        url = TV_APPS.get(app_name, "")
        if url and tv_connected():
            r = tv_cmd("launch_app", uri=url)
            if r.get("error"):
                log.info("[scene] TV launch failed: %s", _s(r["error"]))

    def _scene_tv_power_on():
        """Turn TV on only if it's currently off (queries live status)."""
        if not tv_connected():
            log.info("[scene] TV not connected — pair first")
            return False
        status = tv_cmd("status")
        is_on = status.get("is_on")
        if is_on is True:
            log.info("[scene] TV already on, skipping POWER")
            return True
        r = tv_cmd("send_key", key="POWER")
        if not r.get("error"):
            set_tv_is_on(True)
            log.info("[scene] TV powered on")
            return True
        log.info("[scene] TV power on failed: %s", _s(r.get("error")))
        return False

    def _scene_tv_power_off():
        """Turn TV off only if it's currently on (queries live status)."""
        if not tv_connected():
            log.info("[scene] TV not connected — pair first")
            return False
        status = tv_cmd("status")
        is_on = status.get("is_on")
        if is_on is False:
            log.info("[scene] TV already off, skipping POWER")
            return True
        r = tv_cmd("send_key", key="POWER")
        if not r.get("error"):
            set_tv_is_on(False)
            log.info("[scene] TV powered off")
            return True
        log.info("[scene] TV power off failed: %s", _s(r.get("error")))
        return False

    service_map["tv_send_key"] = _scene_tv_send_key
    service_map["tv_launch"] = _scene_tv_launch
    service_map["tv_is_on"] = lambda: tv_is_on()
    service_map["tv_power_on"] = _scene_tv_power_on
    service_map["tv_power_off"] = _scene_tv_power_off

    try:
        from services.scene_service import SceneService
        scene_service = SceneService(services=service_map, socketio=socketio)
        service_map["scenes"] = scene_service
        if voice:
            voice._scene_service = scene_service
        log.info("[bmo]   Scene engine: OK")
    except Exception:
        log.exception("[bmo]   Scene engine: SKIPPED")

    # List service
    try:
        from services.list_service import ListService
        list_service = ListService()
        service_map["lists"] = list_service
        log.info("[bmo]   List service: OK")
    except Exception:
        log.exception("[bmo]   List service: SKIPPED")

    # Alert service
    try:
        from services.alert_service import AlertService
        alert_service = AlertService(voice_pipeline=voice, socketio=socketio)
        service_map["alerts"] = alert_service
        log.info("[bmo]   Alert service: OK")
        # Wire alert service into existing services (created earlier)
        if weather:
            weather.alert_service = alert_service
        if calendar:
            calendar.alert_service = alert_service
        if notifier:
            notifier.alert_service = alert_service
    except Exception:
        log.exception("[bmo]   Alert service: SKIPPED")

    # Routine service
    try:
        from services.routine_service import RoutineService
        routine_service = RoutineService(
            agent=lambda: agent,
            voice=voice,
            socketio=socketio,
        )
        service_map["routines"] = routine_service
        log.info("[bmo]   Routine service: OK")
    except Exception:
        log.exception("[bmo]   Routine service: SKIPPED")

    # Start routine scheduler
    if routine_service:
        routine_service.start()
        log.info("[bmo]   Routine scheduler: started")

    # Personality engine
    try:
        from services.personality_engine import PersonalityEngine
        personality_engine = PersonalityEngine(
            voice=voice,
            socketio=socketio,
            music_service=music,
            weather_service=weather,
        )
        personality_engine.start()
        service_map["personality"] = personality_engine
        log.info("[bmo]   Personality engine: OK")
    except Exception:
        log.exception("[bmo]   Personality engine: SKIPPED")

    # Restore system (PipeWire) volume from saved settings
    saved_sys_vol = _load_setting("volume.system", None)
    if saved_sys_vol is not None:
        _set_system_volume(int(saved_sys_vol))
        log.info(f"[bmo]   System volume restored: {saved_sys_vol}%")

    log.info("[bmo] All services initialized!")

    # Warm up Ollama models at startup (brenpoly pattern: keep_alive=-1 preloads into RAM)
    try:
        import ollama as _ollama
        from agent import LOCAL_MODEL
        _ollama.generate(model=LOCAL_MODEL, prompt="", keep_alive=-1)
        log.info(f"[bmo]   Ollama model warmed up: {LOCAL_MODEL}")
    except Exception:
        log.exception("[bmo]   Ollama warmup skipped")

    # Set OLED to warmup expression during init, then idle
    if oled_face:
        oled_face.set_expression("idle")


def _sync_expression(expression: str):
    """Sync OLED face + LED controller to match expression, emit to web clients.

    QA #28 (2026-05-17): also routes through services.face_state so the web
    ambient renderer and OLED both derive from a single normalized
    expression. Legacy `expression` event still emitted for older clients.
    """
    from services.face_state import FACE
    norm = FACE.set(expression) if FACE else (expression or "idle")
    if oled_face:
        oled_face.set_expression(norm)
    if led_controller:
        from hardware.led_controller import led_state_for_expression
        led_state = led_state_for_expression(norm)
        led_controller.set_state(led_state)
    socketio.emit("expression", {"expression": norm})


# ── Pages ────────────────────────────────────────────────────────────

@app.route("/favicon.ico")
def favicon():
    resp = send_from_directory(app.static_folder, "favicon.ico", mimetype="image/x-icon")
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


def _static_mtime(rel_path: str) -> int:
    """Return mtime of a static file (for cache-busting URLs). Round 4+1
    (2026-05-17): use per-file mtime so browsers only refetch when the
    file actually changed — not every page load (which defeated caching)
    and not stale-for-an-hour either."""
    try:
        return int(os.path.getmtime(
            os.path.join(app.static_folder, rel_path)
        ))
    except OSError:
        return int(time.time())  # safe fallback — always-fresh


@app.route("/")
def index():
    kiosk_mode = request.args.get("kiosk", "").strip().lower() in {"1", "true", "yes", "on"}
    # Per-file mtime as cache-bust. Each restart of BMO that changed any
    # static file gets a fresh URL; unchanged files keep their cache hit.
    asset_v = _static_mtime("js/bmo.js")  # legacy single token for css already in template
    return render_template(
        "index.html",
        kiosk_mode=kiosk_mode,
        asset_v=asset_v,
        js_v=_static_mtime("js/bmo.js"),
        css_v=_static_mtime("css/bmo.css"),
        tailwind_v=_static_mtime("css/tailwind.css"),
    )


@app.route("/ide")
def ide_page():
    """Serve the IDE as a full-page standalone app."""
    return render_template("ide.html")



# ── Agent System API ─────────────────────────────────────────────────

@app.route("/api/agents")
def api_agents():
    """List all registered agents."""
    if agent and agent.orchestrator:
        agents_list = []
        for name, a in agent.orchestrator.agents.items():
            agents_list.append({
                "name": a.config.name,
                "display_name": a.config.display_name,
                "temperature": a.config.temperature,
                "can_nest": a.config.can_nest,
                "tools": a.config.tools,
            })
        return jsonify({"agents": agents_list, "mode": agent.orchestrator.mode.value})
    return jsonify({"agents": [], "mode": "normal"})


# QA #22 (2026-05-17): Scratchpad request/response schema.
#
#   GET  /api/scratchpad
#     → 200 { "sections": { <section_name: str>: <content: str>, ... } }
#     The wrapping `sections` envelope replaces the bare flat dict so future
#     metadata (last_updated, version) can be added without breaking clients.
#
#   POST /api/scratchpad
#     ← { "section": <str, required, max 64 chars>,
#         "content": <str, required, max 32 KB>,
#         "append":  <bool, optional, default false> }
#     → 200 { "success": true, "section": <str>, "bytes": <int> }
#     → 400 on missing/invalid fields, 503 on no-agent.
#
#   DELETE /api/scratchpad
#     ← { "section": <str, optional> }   omit to clear all sections.
#     → 200 { "success": true }
#
# Documented inline so any future renderer / integration can call it
# without spelunking through bmo.js. The handlers below enforce the
# contract; payloads outside it return 400 (was: silent default to
# section="Notes", content="").
_SCRATCHPAD_MAX_SECTION_LEN = 64
_SCRATCHPAD_MAX_CONTENT_LEN = 32 * 1024


def _scratchpad_validate(data: dict) -> tuple[str | None, str | None, bool, str | None]:
    """Validate write payload. Returns (section, content, append, error)."""
    section = data.get("section")
    content = data.get("content", "")
    append = bool(data.get("append", False))
    if not isinstance(section, str) or not section.strip():
        return None, None, False, "`section` is required and must be a non-empty string"
    if len(section) > _SCRATCHPAD_MAX_SECTION_LEN:
        return None, None, False, f"`section` exceeds {_SCRATCHPAD_MAX_SECTION_LEN} chars"
    if not isinstance(content, str):
        return None, None, False, "`content` must be a string"
    if len(content) > _SCRATCHPAD_MAX_CONTENT_LEN:
        return None, None, False, f"`content` exceeds {_SCRATCHPAD_MAX_CONTENT_LEN} chars"
    return section.strip(), content, append, None


@app.route("/api/scratchpad")
def api_scratchpad():
    """Read the shared scratchpad. Response shape:
       { sections: {<name>: <content>, ...} }   (QA #22 envelope)."""
    if agent and agent.orchestrator:
        return jsonify({"sections": agent.orchestrator.scratchpad.to_dict()})
    return jsonify({"sections": {}})


@app.route("/api/scratchpad", methods=["POST"])
def api_scratchpad_write():
    """Write to the shared scratchpad. See schema doc above."""
    if not (agent and agent.orchestrator):
        return jsonify({"error": "Agent not initialized"}), 503
    data = request.json or {}
    section, content, append, err = _scratchpad_validate(data)
    if err:
        return jsonify({"error": err}), 400
    agent.orchestrator.scratchpad.write(section, content, append)
    return jsonify({
        "success": True,
        "section": section,
        "bytes": len(content.encode("utf-8")),
    })


@app.route("/api/scratchpad", methods=["DELETE"])
def api_scratchpad_clear():
    """Clear scratchpad section(s). Body: {section: str} optional."""
    if not (agent and agent.orchestrator):
        return jsonify({"error": "Agent not initialized"}), 503
    data = request.json or {}
    section = data.get("section")
    if section is not None and (not isinstance(section, str) or not section.strip()):
        return jsonify({"error": "`section` must be a non-empty string if provided"}), 400
    agent.orchestrator.scratchpad.clear(section.strip() if section else None)
    return jsonify({"success": True})


@app.route("/api/init", methods=["POST"])
def api_init():
    """Create a BMO.md file in the specified directory (/init slash command)."""
    data = request.json or {}
    directory = data.get("directory", ".")
    try:
        from agents.project_context import create_bmo_md
        import os
        # Resolve relative paths
        if not os.path.isabs(directory):
            directory = os.path.abspath(directory)
        path = create_bmo_md(directory)
        return jsonify({"success": True, "path": path})
    except Exception as e:
        return fail(log, e, 500)


# ── Camera API ───────────────────────────────────────────────────────

@app.route("/api/camera/stream")
def api_camera_stream():
    if not camera:
        return jsonify({"error": "Camera service not available"}), 503
    return Response(
        camera.generate_mjpeg(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


@app.route("/api/camera/snapshot", methods=["POST"])
def api_camera_snapshot():
    if not camera:
        return jsonify({"error": "Camera service not available"}), 503
    # Round 3 #8 (2026-05-17): catch hardware-absent / capture-failure
    # raises so the frontend gets a clean JSON error with the real
    # reason instead of a generic Flask 500 HTML page.
    try:
        path = camera.take_snapshot()
    except Exception as e:
        return fail(log, e, 503, "Camera error")
    # QA #19 (2026-05-17): returns the new /api/camera/snapshot/last URL
    # so the frontend can show an inline preview without guessing the path.
    return jsonify({"path": path, "preview_url": "/api/camera/snapshot/last"})


# Round 3 #8 (2026-05-17): aliases for shorter/legacy URL forms QA
# reported hitting. /snap and /capture both route to /snapshot now so
# any stale or migrated caller gets a real response (not 404).
app.add_url_rule("/api/camera/snap", view_func=api_camera_snapshot,
                 methods=["POST"], endpoint="camera_snap_alias")
app.add_url_rule("/api/camera/capture", view_func=api_camera_snapshot,
                 methods=["POST"], endpoint="camera_capture_alias")


@app.route("/api/camera/snapshot/last")
def api_camera_snapshot_last():
    """Serve the most-recent snapshot. QA #19 (2026-05-17): replaces the
    legacy `GET /api/camera/snapshot?download=1` which returned 405 because
    the POST-only handler swallowed GET."""
    if not camera:
        return jsonify({"error": "Camera service not available"}), 503
    path = getattr(camera, "last_snapshot_path", None)
    if not path or not os.path.exists(path):
        return jsonify({"error": "no snapshot available — call POST /api/camera/snapshot first"}), 404
    return send_from_directory(
        os.path.dirname(path),
        os.path.basename(path),
        mimetype="image/jpeg",
    )


@app.route("/api/camera/describe", methods=["POST"])
def api_camera_describe():
    data = request.json or {}
    prompt = data.get("prompt", "What do you see?")

    def _do_describe():
        log.info("[vision] Starting describe thread...")
        try:
            description = camera.describe_scene(prompt)
            log.info("[vision] Got: %s...", _s(description[:80]))
        except Exception as e:
            import traceback
            log.info("[vision] Error: %s", _s(e))
            traceback.print_exc()
            # Round 3 #9 (2026-05-17): split conflated "failed or offline"
            # into specific failure-mode messaging so the user knows what
            # action to take.
            err_text = str(e).lower()
            if "api key" in err_text or "credentials" in err_text:
                description = "Vision unavailable: Gemini API key not configured. Ask the Pi admin."
            elif "connection" in err_text or "network" in err_text or "timeout" in err_text or "resolve" in err_text:
                description = "Vision unavailable: can't reach Gemini (network/timeout). Check internet."
            elif "no camera" in err_text or "camera available" in err_text:
                description = "Vision unavailable: camera hardware not detected."
            elif "frame" in err_text:
                description = "Vision unavailable: couldn't capture a camera frame."
            else:
                description = f"Vision failed: {str(e)[:120]}"
        socketio.emit("vision_result", {"description": description})
        log.info("[vision] Emitted vision_result")

    threading.Thread(target=_do_describe, daemon=True).start()
    return jsonify({"ok": True, "message": "Describing..."})


@app.route("/api/camera/faces")
def api_camera_faces():
    faces = camera.identify_faces()
    return jsonify(faces)


@app.route("/api/camera/objects")
def api_camera_objects():
    objects = camera.detect_objects()
    return jsonify(objects)


@app.route("/api/camera/ocr", methods=["POST"])
def api_camera_ocr():
    text = camera.read_text()
    return jsonify({"text": text})


@app.route("/api/camera/motion", methods=["POST"])
def api_camera_motion():
    """Toggle motion detection. Round 3 #10 (2026-05-17): return the
    actual enabled state so the frontend can confirm against server
    reality (UI was drifting from server on the second click)."""
    if not camera:
        return jsonify({"ok": False, "enabled": False, "error": "Camera service not available"}), 503
    data = request.json or {}
    want = bool(data.get("enabled", True))
    if want:
        camera.start_motion_detection()
    else:
        camera.stop_motion_detection()
    # Read back if camera exposes the state; else trust the requested value.
    actual = bool(getattr(camera, "motion_active", want))
    return jsonify({"ok": True, "enabled": actual})


# ── Voice Enrollment API ──────────────────────────────────────────────

@app.route("/api/voice/enroll", methods=["POST"])
def api_voice_enroll():
    """Record audio and enroll a speaker by name.

    JSON body: {"name": "Gavin", "duration": 5}
    Records `duration` seconds of audio from the mic, then enrolls the speaker.
    Call this 3 times with different speech samples for best accuracy.
    """
    if not voice:
        return jsonify({"error": "Voice pipeline not available"}), 503

    data = request.json or {}
    name = data.get("name", "").strip()
    duration = data.get("duration", 5)
    if not name:
        return jsonify({"error": "Name is required"}), 400

    try:
        clip_path = voice.record_clip(duration=duration)
        # Validate clip has actual speech
        import numpy as _np
        import wave as _wave
        with open(clip_path, "rb") as f:
            with _wave.open(f, "rb") as wf:
                raw = wf.readframes(wf.getnframes())
                audio = _np.frombuffer(raw, dtype=_np.int16)
        if not voice._validate_enrollment_clip(audio):
            if os.path.exists(clip_path):
                os.unlink(clip_path)
            return jsonify({"error": "Not enough speech detected. Speak louder or closer and try again."}), 422
        voice.enroll_speaker(name, [clip_path])
        if os.path.exists(clip_path):
            os.unlink(clip_path)
        return jsonify({"ok": True, "name": name, "profiles": voice.get_enrolled_speakers()})
    except Exception as e:
        log.info("[bmo] api error: %s", _s(repr(e)))
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/voice/profiles")
def api_voice_profiles():
    """List all enrolled voice profiles."""
    if not voice:
        return jsonify({"profiles": []})
    return jsonify({"profiles": voice.get_enrolled_speakers()})


@app.route("/api/voice/profiles/<name>", methods=["DELETE"])
def api_voice_profile_delete(name):
    """Remove a voice profile by name."""
    if not voice:
        return jsonify({"error": "Voice pipeline not available"}), 503
    removed = voice.remove_speaker(name)
    if removed:
        return jsonify({"ok": True, "profiles": voice.get_enrolled_speakers()})
    return jsonify({"error": f"Profile '{name}' not found"}), 404


# ── Timer API ────────────────────────────────────────────────────────

@app.route("/api/timers")
def api_timers():
    viewer_tz = _request_client_timezone(default_to_pi=True)
    return jsonify(timers.get_all(viewer_timezone=viewer_tz))


@app.route("/api/timers/create", methods=["POST"])
def api_timer_create():
    data = request.json or {}
    timer = timers.create_timer(data.get("seconds", 300), data.get("label", ""))
    return jsonify(timer)


@app.route("/api/timers/<timer_id>/cancel", methods=["POST"])
def api_timer_cancel(timer_id):
    timers.cancel_timer(timer_id)
    return jsonify({"ok": True})


@app.route("/api/timers/<timer_id>/pause", methods=["POST"])
def api_timer_pause(timer_id):
    timers.pause_timer(timer_id)
    return jsonify({"ok": True})


@app.route("/api/alarms/create", methods=["POST"])
def api_alarm_create():
    data = request.json or {}
    tz_name = _request_client_timezone(default_to_pi=True)
    alarm = timers.create_alarm(
        data.get("hour", 7),
        data.get("minute", 0),
        data.get("label", ""),
        date=data.get("date", ""),
        repeat=data.get("repeat", "none"),
        repeat_days=data.get("repeat_days"),
        tag=data.get("tag", "reminder"),
        timezone_name=tz_name,
    )
    return jsonify(alarm)


@app.route("/api/alarms/<alarm_id>/cancel", methods=["POST"])
def api_alarm_cancel(alarm_id):
    timers.cancel_alarm(alarm_id)
    return jsonify({"ok": True})


@app.route("/api/alarms/<alarm_id>/snooze", methods=["POST"])
def api_alarm_snooze(alarm_id):
    data = request.json or {}
    timers.snooze_alarm(alarm_id, data.get("minutes", 5))
    return jsonify({"ok": True})


@app.route("/api/alarms/<alarm_id>/enabled", methods=["POST"])
def api_alarm_enabled(alarm_id):
    data = request.json or {}
    if "enabled" not in data:
        return jsonify({"error": "Missing 'enabled' boolean"}), 400
    enabled_raw = data.get("enabled")
    if isinstance(enabled_raw, bool):
        enabled = enabled_raw
    elif isinstance(enabled_raw, str):
        lowered = enabled_raw.strip().lower()
        if lowered in {"true", "1", "yes", "on"}:
            enabled = True
        elif lowered in {"false", "0", "no", "off"}:
            enabled = False
        else:
            return jsonify({"error": "Invalid 'enabled' value"}), 400
    else:
        return jsonify({"error": "Invalid 'enabled' value"}), 400
    updated = timers.set_alarm_enabled(alarm_id, enabled)
    if not updated:
        return jsonify({"error": "Alarm not found"}), 404
    viewer_tz = _request_client_timezone(default_to_pi=True)
    alarm = timers.get_alarm(alarm_id, viewer_timezone=viewer_tz)
    return jsonify(alarm or updated)


@app.route("/api/alarms/volume", methods=["GET", "POST"])
def api_alarm_volume():
    """Get or set alarm volume. None = use system volume."""
    if request.method == "GET":
        return jsonify({"volume": timers.alarm_volume})
    data = request.json or {}
    vol = data.get("volume")  # None or int 0-100
    timers.alarm_volume = int(vol) if vol is not None else None
    return jsonify({"ok": True, "volume": timers.alarm_volume})


# ── LED API ──────────────────────────────────────────────────────────

@app.route("/api/led/wake", methods=["POST"])
def api_led_wake():
    """Restore LEDs to ready state after idle sleep."""
    if led_controller:
        led_controller.set_state("ready")
    return jsonify({"ok": True})


@app.route("/api/led/state", methods=["POST"])
def api_led_state():
    data = request.json or {}
    state = data.get("state", "ready")
    if led_controller:
        led_controller.set_state(state)
    return jsonify({"ok": True, "state": state})


@app.route("/api/led/color", methods=["POST"])
def api_led_color():
    """Set LED color directly by name or RGB values."""
    data = request.json or {}
    if not led_controller:
        return jsonify({"ok": False, "error": "LED controller not available"})
    if "color" in data:
        if not led_controller.set_color_by_name(data["color"]):
            return jsonify({"ok": False, "error": f"Unknown color: {data['color']}"})
    else:
        r, g, b = data.get("r", 0), data.get("g", 0), data.get("b", 0)
        led_controller.set_color(r, g, b)
    socketio.emit("led_state", led_controller.get_full_state())
    return jsonify({"ok": True, **led_controller.get_full_state()})


@app.route("/api/led/mode", methods=["POST"])
def api_led_mode():
    """Set LED mode (static, breathing, chase, rainbow, off)."""
    data = request.json or {}
    if not led_controller:
        return jsonify({"ok": False, "error": "LED controller not available"})
    mode = data.get("mode", "static")
    if not led_controller.set_mode(mode):
        return jsonify({"ok": False, "error": f"Unknown mode: {mode}"})
    socketio.emit("led_state", led_controller.get_full_state())
    return jsonify({"ok": True, **led_controller.get_full_state()})


@app.route("/api/led/brightness", methods=["POST"])
def api_led_brightness():
    """Set LED brightness (0-100)."""
    data = request.json or {}
    if not led_controller:
        return jsonify({"ok": False, "error": "LED controller not available"})
    led_controller.set_brightness(data.get("brightness", 100))
    socketio.emit("led_state", led_controller.get_full_state())
    return jsonify({"ok": True, **led_controller.get_full_state()})


@app.route("/api/led/status")
def api_led_status():
    """Get current LED state."""
    if not led_controller:
        return jsonify({"ok": False, "error": "LED controller not available"})
    return jsonify({"ok": True, **led_controller.get_full_state()})


# ── OLED Face API ────────────────────────────────────────────────────

@app.route("/api/oled/expression")
def api_oled_expression_get():
    """Get current OLED expression."""
    expr = oled_face.current_expression if oled_face else "idle"
    return jsonify({"expression": expr})


@app.route("/api/oled/expression", methods=["POST"])
def api_oled_expression_set():
    """Set OLED expression (syncs LED too)."""
    data = request.json or {}
    expression = data.get("expression", "idle")
    _sync_expression(expression)
    return jsonify({"ok": True, "expression": expression})


# ── Phase 31f LED + face plural aliases (QA #21, 2026-05-17) ──────────
# The 2026-05-17 QA report expected /api/leds/* and /api/face/* to exist
# alongside the original singular /api/led/* and /api/oled/* surfaces.
# These url_rule aliases preserve back-compat while documenting the
# canonical pluralized names. New integrators should prefer the plural
# forms; the singular forms stay forever for the existing UI + bots.
app.add_url_rule("/api/leds", view_func=api_led_status, endpoint="leds_status_alias")
app.add_url_rule("/api/leds/status", view_func=api_led_status, endpoint="leds_status_alt_alias")
app.add_url_rule("/api/leds/state", view_func=api_led_state,
                 methods=["POST"], endpoint="leds_state_alias")
app.add_url_rule("/api/leds/color", view_func=api_led_color,
                 methods=["POST"], endpoint="leds_color_alias")
app.add_url_rule("/api/leds/mode", view_func=api_led_mode,
                 methods=["POST"], endpoint="leds_mode_alias")
app.add_url_rule("/api/leds/brightness", view_func=api_led_brightness,
                 methods=["POST"], endpoint="leds_brightness_alias")
app.add_url_rule("/api/face/expression", view_func=api_oled_expression_get,
                 endpoint="face_expression_get_alias")
app.add_url_rule("/api/face/expression", view_func=api_oled_expression_set,
                 methods=["POST"], endpoint="face_expression_post_alias")


# ── Discord DM Bot Bridge API ─────────────────────────────────────

# PHASE-20 20C: the DM bot runs as its own systemd unit (bmo-dm-bot), so the
# live bot lives in a DIFFERENT process than Flask — the old get_dm_bot() always
# returned None here (F1, the bridge was dead by topology). These routes now
# proxy to a loopback control server inside the bot process. A connection error
# means the bot process is genuinely down (the 503 is finally truthful).
DM_BOT_CONTROL_PORT = os.environ.get("DM_BOT_CONTROL_PORT", "5006")


def _proxy_to_dm_control(path: str, method: str = "POST", json_body=None, read_timeout: float = 12):
    import requests as http_requests
    url = f"http://127.0.0.1:{DM_BOT_CONTROL_PORT}/control/{path}"
    try:
        if method == "GET":
            resp = http_requests.get(url, timeout=(2, read_timeout))
        else:
            resp = http_requests.post(url, json=json_body or {}, timeout=(2, read_timeout))
    except (http_requests.ConnectionError, http_requests.Timeout):
        return jsonify({"error": "DM bot not running"}), 503
    try:
        body = resp.json()
    except ValueError:
        body = {"error": "bad control response"}
    return jsonify(body), resp.status_code


@app.route("/api/discord/dm/start", methods=["POST"])
@app.route("/api/v1/discord/dm/start", methods=["POST"])
def api_discord_dm_start():
    """Proxy: start a Discord DM session in the bot process (PHASE-20 20C)."""
    return _proxy_to_dm_control("start", "POST", request.json or {})


@app.route("/api/discord/dm/stop", methods=["POST"])
@app.route("/api/v1/discord/dm/stop", methods=["POST"])
def api_discord_dm_stop():
    """Proxy: stop the Discord DM session (idempotent, bounded — PHASE-20 20C)."""
    return _proxy_to_dm_control("stop", "POST", request.json or {})


@app.route("/api/discord/dm/narrate", methods=["POST"])
@app.route("/api/v1/discord/dm/narrate", methods=["POST"])
@limiter.limit(RATE_LIMIT_NARRATE)
def api_discord_dm_narrate():
    """Proxy: forward narration to the DM bot (idempotent via event_id — 20C)."""
    data = request.json or {}
    if not data.get("text"):
        return jsonify({"error": "No text provided"}), 400
    return _proxy_to_dm_control("narrate", "POST", data)


@app.route("/api/discord/dm/narrate/cancel", methods=["POST"])
@app.route("/api/v1/discord/dm/narrate/cancel", methods=["POST"])
@limiter.limit(RATE_LIMIT_NARRATE)
def api_discord_dm_narrate_cancel():
    """Proxy: barge-in — flush the narration queue + stop playback (PHASE-21 21B)."""
    return _proxy_to_dm_control("narrate/cancel", "POST", request.json or {})


@app.route("/api/discord/dm/status")
@app.route("/api/v1/discord/dm/status")
def api_discord_dm_status():
    """Proxy: current DM bot session status (PHASE-20 20C)."""
    return _proxy_to_dm_control("status", "GET")


# ── PHASE-36 36C: play-by-post proxies (forward to the bot's /control/pbp/*) ──
@app.route("/api/discord/pbp/start", methods=["POST"])
@app.route("/api/v1/discord/pbp/start", methods=["POST"])
@limiter.limit(RATE_LIMIT_PBP)
def api_discord_pbp_start():
    return _proxy_to_dm_control("pbp/start", "POST", request.json or {})


@app.route("/api/discord/pbp/advance", methods=["POST"])
@app.route("/api/v1/discord/pbp/advance", methods=["POST"])
@limiter.limit(RATE_LIMIT_PBP)
def api_discord_pbp_advance():
    return _proxy_to_dm_control("pbp/advance", "POST", request.json or {})


@app.route("/api/discord/pbp/skip", methods=["POST"])
@app.route("/api/v1/discord/pbp/skip", methods=["POST"])
@limiter.limit(RATE_LIMIT_PBP)
def api_discord_pbp_skip():
    return _proxy_to_dm_control("pbp/skip", "POST", request.json or {})


@app.route("/api/discord/pbp/scene", methods=["POST"])
@app.route("/api/v1/discord/pbp/scene", methods=["POST"])
@limiter.limit(RATE_LIMIT_PBP)
def api_discord_pbp_scene():
    return _proxy_to_dm_control("pbp/scene", "POST", request.json or {})


@app.route("/api/discord/pbp/stop", methods=["POST"])
@app.route("/api/v1/discord/pbp/stop", methods=["POST"])
@limiter.limit(RATE_LIMIT_PBP)
def api_discord_pbp_stop():
    return _proxy_to_dm_control("pbp/stop", "POST", request.json or {})


@app.route("/api/discord/pbp/status", methods=["GET"])
@app.route("/api/v1/discord/pbp/status", methods=["GET"])
def api_discord_pbp_status():
    campaign_id = request.args.get("campaign_id", "")
    from urllib.parse import quote
    return _proxy_to_dm_control(f"pbp/status?campaign_id={quote(campaign_id)}", "GET")


@app.route("/api/discord/dm/recap", methods=["GET"])
@app.route("/api/v1/discord/dm/recap", methods=["GET"])
@limiter.limit(RATE_LIMIT_RECAP)
def api_discord_dm_recap():
    """PHASE-31 31E — recap the ACTIVE Discord DM session WITHOUT ending it.

    ``?mode=last`` returns the most recent stored session summary instead (no LLM call).
    Live mode generates a fresh recap; the read timeout (50s) outlives the bot's 45s
    generation budget so the proxy doesn't cut a valid recap short.
    """
    mode = request.args.get("mode", "live")
    qs = f"recap?mode={mode}"
    campaign = request.args.get("campaign")
    if campaign:
        qs += f"&campaign={campaign}"
    return _proxy_to_dm_control(qs, "GET", read_timeout=50)


# ── PHASE-22 22B: VTT→Pi state sync — proxy into the bot's control plane ──
# These are the exact paths sendInitiativeToPi / sendGameStateToPi already POST to.


@app.route("/api/discord/dm/sync/initiative", methods=["POST"])
@app.route("/api/v1/discord/dm/sync/initiative", methods=["POST"])
def api_discord_dm_sync_initiative():
    """Proxy: push VTT initiative into the bot process (PHASE-22 22B)."""
    return _proxy_to_dm_control("sync/initiative", "POST", request.json or {})


@app.route("/api/discord/dm/sync/state", methods=["POST"])
@app.route("/api/v1/discord/dm/sync/state", methods=["POST"])
def api_discord_dm_sync_state():
    """Proxy: push VTT game state into the bot process (PHASE-22 22B)."""
    return _proxy_to_dm_control("sync/state", "POST", request.json or {})


# ── PHASE-21 21C: per-NPC voice casting ──────────────────────────────
# These operate on the shared voice_cast.json directly (no bot round-trip) — both
# the Flask and bot processes re-read it on mtime change. voice_casting is
# stdlib-only (resolve_backend does no network), so it's safe in the gevent app.


@app.route("/api/discord/dm/voices", methods=["GET"])
@app.route("/api/v1/discord/dm/voices", methods=["GET"])
def api_discord_dm_voices_get():
    from services.discord_tts import resolve_backend
    from services.voice_casting import VoiceCasting

    campaign_id = request.args.get("campaign_id", "")
    if not campaign_id:
        return jsonify({"error": "campaign_id required"}), 400
    casting = VoiceCasting()
    backend = resolve_backend()
    return jsonify({
        "ok": True,
        "cast": casting.list_cast(campaign_id),
        "pool": casting.pool_for_backend(backend),
        "backend": backend,
    })


@app.route("/api/discord/dm/voices", methods=["POST"])
@app.route("/api/v1/discord/dm/voices", methods=["POST"])
@limiter.limit(RATE_LIMIT_NARRATE)
def api_discord_dm_voices_set():
    from dataclasses import asdict

    from services.voice_casting import VoiceCasting

    data = request.json or {}
    campaign_id = data.get("campaign_id")
    speaker = data.get("speaker")
    if not campaign_id or not speaker:
        return jsonify({"error": "campaign_id and speaker required"}), 400
    entry = VoiceCasting().set_voice(
        campaign_id, speaker,
        voice_id=data.get("voice_id"), speed=data.get("speed"), pitch=data.get("pitch"),
    )
    return jsonify({"ok": True, "entry": asdict(entry)})


@app.route("/api/discord/dm/voices", methods=["DELETE"])
@app.route("/api/v1/discord/dm/voices", methods=["DELETE"])
@limiter.limit(RATE_LIMIT_NARRATE)
def api_discord_dm_voices_delete():
    from services.voice_casting import VoiceCasting

    data = request.json or {}
    campaign_id = data.get("campaign_id")
    speaker = data.get("speaker")
    if not campaign_id or not speaker:
        return jsonify({"error": "campaign_id and speaker required"}), 400
    reset = VoiceCasting().reset_voice(campaign_id, speaker)
    return jsonify({"ok": True, "reset": reset})


# ── Scene Mode Endpoints ─────────────────────────────────────────────

@app.route("/api/scenes")
def api_scenes():
    """List all scenes with active status."""
    if not scene_service:
        return jsonify({"error": "Scene service not available"}), 503
    return jsonify(scene_service.get_status())


@app.route("/api/scene/activate", methods=["POST"])
def api_scene_activate():
    """Activate a scene. Body: {scene: "anime"}."""
    if not scene_service:
        return jsonify({"error": "Scene service not available"}), 503
    name = (request.json or {}).get("scene", "")
    if not name:
        return jsonify({"error": "scene name required"}), 400
    log.info("[scene-api] Activating scene: %s", _s(name))

    def _do_activate():
        try:
            scene_service.activate(name)
        except Exception:
            log.exception("[scene-api] Activate failed")
            import traceback
            traceback.print_exc()

    threading.Thread(target=_do_activate, daemon=True).start()
    return jsonify({"ok": True, "message": f"Activating {name}..."})


@app.route("/api/scene/deactivate", methods=["POST"])
def api_scene_deactivate():
    """Deactivate current scene and restore previous state."""
    if not scene_service:
        return jsonify({"error": "Scene service not available"}), 503

    def _do_deactivate():
        try:
            scene_service.deactivate()
        except Exception:
            log.exception("[scene-api] Deactivate failed")
            import traceback
            traceback.print_exc()

    threading.Thread(target=_do_deactivate, daemon=True).start()
    return jsonify({"ok": True, "message": "Deactivating..."})


@app.route("/api/scene/create", methods=["POST"])
def api_scene_create():
    """Create a custom scene. Body: {name: str, config: {...}}."""
    if not scene_service:
        return jsonify({"error": "Scene service not available"}), 503
    data = request.json or {}
    name = data.get("name", "").strip()
    config = data.get("config", {})
    if not name:
        return jsonify({"error": "Scene name required"}), 400
    try:
        ok, msg = scene_service.create_scene(name, config)
        if ok:
            return jsonify({"ok": True, "message": msg})
        return jsonify({"error": msg}), 400
    except Exception as e:
        log.info("[bmo] api error: %s", _s(repr(e)))
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/scene/<name>", methods=["PUT"])
def api_scene_update(name):
    """Update a custom scene. Body: {config: {...}}."""
    if not scene_service:
        return jsonify({"error": "Scene service not available"}), 503
    data = request.json or {}
    config = data.get("config", {})
    try:
        ok, msg = scene_service.update_scene(name, config)
        if ok:
            return jsonify({"ok": True, "message": msg})
        return jsonify({"error": msg}), 400
    except Exception as e:
        log.info("[bmo] api error: %s", _s(repr(e)))
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/scene/<name>", methods=["DELETE"])
def api_scene_delete(name):
    """Delete a custom scene."""
    if not scene_service:
        return jsonify({"error": "Scene service not available"}), 503
    try:
        ok, msg = scene_service.delete_scene(name)
        if ok:
            return jsonify({"ok": True, "message": msg})
        return jsonify({"error": msg}), 400
    except Exception as e:
        log.info("[bmo] api error: %s", _s(repr(e)))
        return jsonify({"error": "internal server error"}), 500


# ── Weather API ──────────────────────────────────────────────────────

@app.route("/api/weather")
def api_weather():
    force = str(request.args.get("force", "")).strip().lower() in {"1", "true", "yes", "on"}
    return jsonify(weather.get_current(force_refresh=force))


@app.route("/api/location")
def api_location():
    if location_service:
        force = str(request.args.get("force", "")).strip().lower() in {"1", "true", "yes", "on"}
        return jsonify(location_service.get_location(force_refresh=force))
    return jsonify({"error": "Location service unavailable"}), 503


@app.route("/api/location/device", methods=["POST"])
def api_location_device():
    if not location_service:
        return jsonify({"error": "Location service unavailable"}), 503
    data = request.get_json(silent=True) or {}
    user_agent = (request.headers.get("User-Agent") or "").strip()
    forwarded_for = (request.headers.get("X-Forwarded-For") or "").strip()
    remote_addr = forwarded_for.split(",")[0].strip() if forwarded_for else (request.remote_addr or "")
    try:
        updated = location_service.update_from_device(data)
        if weather:
            weather.invalidate_cache()
        if socketio:
            socketio.emit("location_update", updated)
        log.info(
            "[location] Device update accepted: %s (accuracy_m=%s) from=%s ua=%s",
            _s(updated.get("location_label", "")),
            _s(updated.get("accuracy_m", "n/a")),
            _s(remote_addr or "?"),
            _s(user_agent[:120]),
        )
        return jsonify(updated)
    except (TypeError, ValueError, KeyError) as exc:
        keys = ",".join(sorted(data.keys())) if isinstance(data, dict) else "n/a"
        log.warning(
            "[location] Device update rejected: %s keys=%s from=%s ua=%s",
            _s(exc),
            _s(keys),
            _s(remote_addr or "?"),
            _s(user_agent[:120]),
        )
        return fail(log, exc, 400, "Invalid location payload")


# ── Smart Home API ───────────────────────────────────────────────────

@app.route("/api/devices")
def api_devices():
    return jsonify(smart_home.get_devices())


@app.route("/api/devices/<device_name>/status")
def api_device_status(device_name):
    return jsonify(smart_home.get_status(device_name))


@app.route("/api/devices/<device_name>/volume", methods=["POST"])
def api_device_volume(device_name):
    data = request.json or {}
    smart_home.set_volume(device_name, data.get("level", 0.5))
    return jsonify({"ok": True})


@app.route("/api/devices/<device_name>/play", methods=["POST"])
def api_device_play(device_name):
    if not smart_home:
        return jsonify({"error": "Smart home not available"}), 503
    try:
        smart_home.play(device_name)
        return jsonify({"ok": True})
    except Exception as e:
        log.info("[bmo] api error: %s", _s(repr(e)))
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/devices/<device_name>/pause", methods=["POST"])
def api_device_pause(device_name):
    if not smart_home:
        return jsonify({"error": "Smart home not available"}), 503
    try:
        smart_home.pause(device_name)
        return jsonify({"ok": True})
    except Exception as e:
        log.info("[bmo] api error: %s", _s(repr(e)))
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/devices/<device_name>/stop", methods=["POST"])
def api_device_stop(device_name):
    if not smart_home:
        return jsonify({"error": "Smart home not available"}), 503
    try:
        smart_home.stop(device_name)
        return jsonify({"ok": True})
    except Exception as e:
        log.info("[bmo] api error: %s", _s(repr(e)))
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/devices/<device_name>/mute", methods=["POST"])
def api_device_mute(device_name):
    if not smart_home:
        return jsonify({"error": "Smart home not available"}), 503
    try:
        data = request.json or {}
        smart_home.mute(device_name, data.get("muted", True))
        return jsonify({"ok": True})
    except Exception as e:
        log.info("[bmo] api error: %s", _s(repr(e)))
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/devices/<device_name>/launch", methods=["POST"])
def api_device_launch(device_name):
    if not smart_home:
        return jsonify({"error": "Smart home not available"}), 503
    try:
        data = request.json or {}
        smart_home.launch_app(device_name, data.get("app_id", ""))
        return jsonify({"ok": True})
    except Exception as e:
        log.info("[bmo] api error: %s", _s(repr(e)))
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/devices/<device_name>/quit", methods=["POST"])
def api_device_quit(device_name):
    if not smart_home:
        return jsonify({"error": "Smart home not available"}), 503
    try:
        smart_home.quit_app(device_name)
        return jsonify({"ok": True})
    except Exception as e:
        log.info("[bmo] api error: %s", _s(repr(e)))
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/devices/refresh", methods=["POST"])
def api_devices_refresh():
    if not smart_home:
        return jsonify({"error": "Smart home not available"}), 503
    try:
        smart_home.start_discovery()
        return jsonify({"ok": True})
    except Exception as e:
        log.info("[bmo] api error: %s", _s(repr(e)))
        return jsonify({"error": "internal server error"}), 500


# ── Chat Persistence ─────────────────────────────────────────────────
# PHASE-16 16B — moved to services/chat_history.py. The agent resolver lets
# save_chat_message see the live `agent` global (assigned by init_services) without
# chat_history importing app.py. The two surviving aliases (voice hook + startup restore)
# are the only ones still called from app.py; the rest moved with the chat/WS routes.
chat_history.set_agent_resolver(lambda: agent)

_load_recent_chat = chat_history.load_recent_chat
_save_chat_message = chat_history.save_chat_message


def _auto_resume_after_restart():
    """If BMO restarted after a Code Agent task, auto-generate resume message and push to clients."""
    time.sleep(4)
    try:
        summary = agent._read_and_clear_resume()
        if not summary:
            return
        log.info("[chat] Auto-resuming after Code Agent restart")

        with app.app_context():
            result = agent.chat(
                f"[Auto-resume] BMO just came back up. You restarted to apply changes. "
                f"Context: {summary[:400]}. Confirm the restart completed and briefly summarize what was done.",
                speaker="system",
                agent_override="code",
            )
            text = result.get("text", "")
            if text:
                _save_chat_message({"role": "assistant", "text": text, "ts": time.time()})
                socketio.emit("chat_response", {
                    "text": text,
                    "speaker": "system",
                    "agent_used": "code",
                })
    except Exception:
        log.exception("[chat] Auto-resume failed")


def _restore_agent_history():
    """On startup, restore the agent's conversation history from the recent chat buffer."""
    messages = _load_recent_chat()
    if not messages or not agent:
        return
    for msg in messages:
        role = msg.get("role", "user")
        text = msg.get("text", "")
        if role == "user":
            agent.conversation_history.append({"role": "user", "content": text})
        elif role == "assistant":
            agent.conversation_history.append({"role": "assistant", "content": text})
    # Re-detect DnD context if it was active
    for msg in messages:
        if msg.get("role") == "user" and agent._is_dnd_request(msg.get("text", "")):
            agent._auto_load_dnd(msg["text"])
            break
    log.info(f"[chat] Restored {len(messages)} messages into agent history")


# ── Notes API ────────────────────────────────────────────────────────

NOTES_FILE = os.path.expanduser("~/home-lab/bmo/pi/data/notes.json")
# STATE.notes_list, STATE.notes_lock — moved to state.STATE.notes_list / state.STATE.notes_lock


def _load_notes():
    with STATE.notes_lock:
        try:
            if os.path.exists(NOTES_FILE):
                with open(NOTES_FILE, "r", encoding="utf-8") as f:
                    STATE.notes_list = json.load(f)
        except Exception:
            STATE.notes_list = []


def _save_notes_locked():
    """Caller must hold STATE.notes_lock."""
    os.makedirs(os.path.dirname(NOTES_FILE), exist_ok=True)
    with open(NOTES_FILE, "w", encoding="utf-8") as f:
        json.dump(STATE.notes_list, f, ensure_ascii=False)


@app.route("/api/notes")
def api_notes():
    with STATE.notes_lock:
        return jsonify(list(STATE.notes_list))


@app.route("/api/notes", methods=["POST"])
def api_notes_create():
    """Create a note. QA #31 (2026-05-17): returns 409 when a duplicate
    (case-insensitive text match) already exists, unless the request
    body sets `allow_duplicate=true`. The 409 body includes the matching
    note so the UI can offer "add anyway" without a second lookup."""
    data = request.json or {}
    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "No text provided"}), 400
    allow_dup = bool(data.get("allow_duplicate", False))
    with STATE.notes_lock:
        if not allow_dup:
            lowered = text.lower()
            for existing in STATE.notes_list:
                if isinstance(existing, dict) and existing.get("text", "").strip().lower() == lowered:
                    return jsonify({
                        "error": "duplicate",
                        "message": "A note with this text already exists.",
                        "existing": existing,
                    }), 409
        note = {
            "id": str(int(time.time() * 1000)),
            "text": text,
            "done": False,
            "created": time.time(),
        }
        STATE.notes_list.append(note)
        _save_notes_locked()
    return jsonify(note)


@app.route("/api/notes/<note_id>", methods=["PUT"])
def api_notes_update(note_id):
    data = request.json or {}
    with STATE.notes_lock:
        for note in STATE.notes_list:
            if note["id"] == note_id:
                if "done" in data:
                    note["done"] = bool(data["done"])
                if "text" in data:
                    note["text"] = data["text"]
                _save_notes_locked()
                return jsonify(note)
    return jsonify({"error": "Not found"}), 404


@app.route("/api/notes/<note_id>", methods=["DELETE"])
def api_notes_delete(note_id):
    with STATE.notes_lock:
        STATE.notes_list = [n for n in STATE.notes_list if n["id"] != note_id]
        _save_notes_locked()
    return jsonify({"ok": True})


# ── List API ────────────────────────────────────────────────────────

@app.route("/api/lists")
def api_lists():
    """Get all lists."""
    if not list_service:
        return jsonify({"error": "List service not available"}), 503
    return jsonify({"lists": list_service.get_all_lists()})


@app.route("/api/lists", methods=["POST"])
def api_lists_create():
    """Create a new list. Body: {name: str}."""
    if not list_service:
        return jsonify({"error": "List service not available"}), 503
    data = request.json or {}
    name = data.get("name", "").strip()
    if not name:
        return jsonify({"error": "List name required"}), 400
    lst = list_service.create_list(name)
    return jsonify(lst)


@app.route("/api/lists/<name>")
def api_list_get(name):
    """Get a specific list."""
    if not list_service:
        return jsonify({"error": "List service not available"}), 503
    lst = list_service.get_list(name)
    if lst is None:
        return jsonify({"error": f"List '{name}' not found"}), 404
    return jsonify(lst)


@app.route("/api/lists/<name>", methods=["DELETE"])
def api_list_delete(name):
    """Delete a list."""
    if not list_service:
        return jsonify({"error": "List service not available"}), 503
    if list_service.delete_list(name):
        return jsonify({"ok": True})
    return jsonify({"error": f"List '{name}' not found"}), 404


@app.route("/api/lists/<name>/items", methods=["POST"])
def api_list_add_item(name):
    """Add item to a list. Body: {text: str}."""
    if not list_service:
        return jsonify({"error": "List service not available"}), 503
    data = request.json or {}
    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "Item text required"}), 400
    item = list_service.add_item(name, text)
    return jsonify(item)


@app.route("/api/lists/<name>/items/<item_id>", methods=["DELETE"])
def api_list_remove_item(name, item_id):
    """Remove item from a list."""
    if not list_service:
        return jsonify({"error": "List service not available"}), 503
    if list_service.remove_item(name, item_id):
        return jsonify({"ok": True})
    return jsonify({"error": "Item not found"}), 404


@app.route("/api/lists/<name>/items/<item_id>/check", methods=["POST"])
def api_list_check_item(name, item_id):
    """Toggle item done status. Body: {done: bool}."""
    if not list_service:
        return jsonify({"error": "List service not available"}), 503
    data = request.json or {}
    done = data.get("done", True)
    if list_service.check_item(name, item_id, done):
        return jsonify({"ok": True})
    return jsonify({"error": "Item not found"}), 404


@app.route("/api/lists/<name>/clear", methods=["POST"])
def api_list_clear(name):
    """Clear a list. Body: {done_only: bool}."""
    if not list_service:
        return jsonify({"error": "List service not available"}), 503
    data = request.json or {}
    done_only = data.get("done_only", False)
    list_service.clear_list(name, done_only=done_only)
    return jsonify({"ok": True})


# ── Alert API ───────────────────────────────────────────────────────

@app.route("/api/alerts/history")
def api_alerts_history():
    """Get recent alert history."""
    if not alert_service:
        return jsonify({"error": "Alert service not available"}), 503
    limit = request.args.get("limit", 50, type=int)
    return jsonify({"alerts": alert_service.get_history(limit)})


@app.route("/api/alerts/config")
def api_alerts_config():
    """Get alert configuration."""
    if not alert_service:
        return jsonify({"error": "Alert service not available"}), 503
    return jsonify(alert_service.get_config())


@app.route("/api/alerts/config", methods=["POST"])
def api_alerts_config_update():
    """Update alert configuration. Body: partial config dict."""
    if not alert_service:
        return jsonify({"error": "Alert service not available"}), 503
    data = request.json or {}
    alert_service.update_config(data)
    return jsonify(alert_service.get_config())


@app.route("/api/alerts/send", methods=["POST"])
def api_alerts_send():
    """Send a test alert. Body: {source, title, body, priority}."""
    if not alert_service:
        return jsonify({"error": "Alert service not available"}), 503
    data = request.json or {}
    alert_service.send_alert(
        source=data.get("source", "test"),
        title=data.get("title", "Test Alert"),
        body=data.get("body", ""),
        priority=data.get("priority", "medium"),
    )
    return jsonify({"ok": True})


# ── Routine API ─────────────────────────────────────────────────────

@app.route("/api/routines")
def api_routines():
    """List all routines."""
    if not routine_service:
        return jsonify({"error": "Routine service not available"}), 503
    return jsonify({"routines": routine_service.get_all()})


@app.route("/api/routines", methods=["POST"])
def api_routines_create():
    """Create a new routine. Body: routine schema dict."""
    if not routine_service:
        return jsonify({"error": "Routine service not available"}), 503
    data = request.json or {}
    routine = routine_service.create_routine(
        name=data.get("name", ""),
        triggers=data.get("triggers", []),
        actions=data.get("actions", []),
        conditions=data.get("conditions"),
    )
    return jsonify(routine)


@app.route("/api/routines/<routine_id>", methods=["PUT"])
def api_routines_update(routine_id):
    """Update a routine. Body: partial update dict."""
    if not routine_service:
        return jsonify({"error": "Routine service not available"}), 503
    data = request.json or {}
    routine = routine_service.update_routine(routine_id, **data)
    if routine:
        return jsonify(routine)
    return jsonify({"error": "Routine not found"}), 404


@app.route("/api/routines/<routine_id>", methods=["DELETE"])
def api_routines_delete(routine_id):
    """Delete a routine."""
    if not routine_service:
        return jsonify({"error": "Routine service not available"}), 503
    if routine_service.delete_routine(routine_id):
        return jsonify({"ok": True})
    return jsonify({"error": "Routine not found"}), 404


@app.route("/api/routines/<routine_id>/trigger", methods=["POST"])
def api_routines_trigger(routine_id):
    """Manually trigger a routine."""
    if not routine_service:
        return jsonify({"error": "Routine service not available"}), 503
    if routine_service.trigger_routine(routine_id):
        return jsonify({"ok": True})
    return jsonify({"error": "Routine not found or disabled"}), 404


@app.route("/api/routines/<routine_id>/toggle", methods=["POST"])
def api_routines_toggle(routine_id):
    """Enable/disable a routine."""
    if not routine_service:
        return jsonify({"error": "Routine service not available"}), 503
    data = request.json or {}
    enabled = data.get("enabled", True)
    if routine_service.enable_routine(routine_id, enabled):
        return jsonify({"ok": True, "enabled": enabled})
    return jsonify({"error": "Routine not found"}), 404


# ── Personality API ─────────────────────────────────────────────────

@app.route("/api/personality/settings")
def api_personality_settings():
    """Get personality engine settings."""
    if not personality_engine:
        return jsonify({"error": "Personality engine not available"}), 503
    return jsonify(personality_engine.get_settings())


@app.route("/api/personality/settings", methods=["POST"])
def api_personality_settings_update():
    """Update personality settings. Body: partial settings dict."""
    if not personality_engine:
        return jsonify({"error": "Personality engine not available"}), 503
    data = request.json or {}
    personality_engine.update_settings(updates=data)
    return jsonify(personality_engine.get_settings())


# ── Notification API ─────────────────────────────────────────────────

@app.route("/api/notifications")
def api_notifications():
    """Get recent notification history."""
    if notifier:
        limit = request.args.get("limit", 50, type=int)
        return jsonify({"notifications": notifier.get_history(limit)})
    return jsonify({"notifications": []})


@app.route("/api/notifications/settings")
def api_notification_settings():
    if notifier:
        return jsonify(notifier.get_settings())
    return jsonify({"enabled": False, "blocklist": [], "devices": {}})


@app.route("/api/notifications/settings", methods=["POST"])
def api_notification_settings_update():
    if notifier:
        data = request.json or {}
        notifier.update_settings(
            enabled=data.get("enabled"),
            blocklist=data.get("blocklist"),
        )
        settings = notifier.get_settings()
        if socketio:
            socketio.emit("notification_settings", settings)
        return jsonify(settings)
    return jsonify({"error": "Notification service not available"}), 503


@app.route("/api/notifications/devices/refresh", methods=["POST"])
def api_notification_devices_refresh():
    """Re-discover KDE Connect devices."""
    if notifier:
        try:
            notifier._discover_devices()
            settings = notifier.get_settings()
            if socketio:
                socketio.emit("notification_settings", settings)
            return jsonify(settings)
        except Exception as e:
            log.info("[bmo] api error: %s", _s(repr(e)))
            return jsonify({"error": "internal server error"}), 500
    return jsonify({"error": "Notification service not available"}), 503


@app.route("/api/notifications/clear", methods=["POST"])
def api_notification_clear():
    if notifier:
        notifier.clear_history()
        return jsonify({"ok": True})
    return jsonify({"error": "Notification service not available"}), 503


@app.route("/api/notifications/reply", methods=["POST"])
def api_notification_reply():
    """Reply to a notification via KDE Connect."""
    if notifier:
        data = request.json or {}
        notif_id = data.get("id", "")
        message = data.get("message", "")
        device_id = data.get("device_id", "")
        if not message:
            return jsonify({"error": "No message provided"}), 400
        ok = notifier.reply(notif_id, message, device_id)
        return jsonify({"ok": ok})
    return jsonify({"error": "Notification service not available"}), 503


# ── MCP API ─────────────────────────────────────────────────────────

@app.route("/api/mcp/servers")
def api_mcp_servers():
    """List all MCP servers with connection status."""
    if agent and agent.orchestrator and agent.orchestrator.mcp_manager:
        return jsonify(agent.orchestrator.mcp_manager.get_status())
    return jsonify({"servers": {}, "total_tools": 0, "connected": 0, "total": 0})


@app.route("/api/mcp/servers", methods=["POST"])
def api_mcp_servers_add():
    """Add a new MCP server. Body: {name, config}."""
    data = request.json or {}
    name = data.get("name", "")
    config = data.get("config", {})
    if not name or not config:
        return jsonify({"error": "name and config required"}), 400

    if agent and agent.orchestrator:
        if not agent.orchestrator.mcp_manager:
            from agents.mcp_manager import McpManager
            agent.orchestrator.mcp_manager = McpManager(agent.settings)

        success = agent.orchestrator.mcp_manager.add_server(name, config)
        return jsonify({"success": success, "name": name})
    return jsonify({"error": "Agent not initialized"}), 500


@app.route("/api/mcp/servers/<name>", methods=["DELETE"])
def api_mcp_servers_remove(name):
    """Remove an MCP server."""
    if agent and agent.orchestrator and agent.orchestrator.mcp_manager:
        agent.orchestrator.mcp_manager.remove_server(name)
        return jsonify({"success": True})
    return jsonify({"error": "MCP not initialized"}), 500


@app.route("/api/mcp/connect", methods=["POST"])
def api_mcp_connect():
    """Connect/reconnect an MCP server. Body: {server}."""
    data = request.json or {}
    server = data.get("server", "")
    if not server:
        return jsonify({"error": "server name required"}), 400

    if agent and agent.orchestrator and agent.orchestrator.mcp_manager:
        success = agent.orchestrator.mcp_manager.connect_server(server)
        return jsonify({"success": success})
    return jsonify({"error": "MCP not initialized"}), 500


@app.route("/api/mcp/disconnect", methods=["POST"])
def api_mcp_disconnect():
    """Disconnect an MCP server. Body: {server}."""
    data = request.json or {}
    server = data.get("server", "")
    if not server:
        return jsonify({"error": "server name required"}), 400

    if agent and agent.orchestrator and agent.orchestrator.mcp_manager:
        success = agent.orchestrator.mcp_manager.disconnect_server(server)
        return jsonify({"success": success})
    return jsonify({"error": "MCP not initialized"}), 500


@app.route("/api/mcp/tools")
def api_mcp_tools():
    """List all MCP tools."""
    if agent and agent.orchestrator and agent.orchestrator.mcp_manager:
        tools = agent.orchestrator.mcp_manager.get_all_tools()
        return jsonify({"tools": tools})
    return jsonify({"tools": []})


@app.route("/api/mcp/tools/<path:name>/call", methods=["POST"])
def api_mcp_tool_call(name):
    """Call an MCP tool directly. Body: {args: {}}."""
    data = request.json or {}
    args = data.get("args", {})

    if agent and agent.orchestrator and agent.orchestrator.mcp_manager:
        result = agent.orchestrator.mcp_manager.dispatch_tool(name, args)
        return jsonify(result)
    return jsonify({"error": "MCP not initialized"}), 500


# ── Custom Commands API ─────────────────────────────────────────────

@app.route("/api/commands")
def api_commands():
    """List available custom commands."""
    try:
        from agents.custom_commands import list_commands
        commands = list_commands(os.getcwd())
        return jsonify({"commands": commands})
    except ImportError:
        return jsonify({"commands": []})


@app.route("/api/commands/<name>", methods=["POST"])
def api_commands_execute(name):
    """Execute a custom command. Body: {args: ""}."""
    data = request.json or {}
    args = data.get("args", "")

    try:
        from agents.custom_commands import discover_commands, load_command
        commands = discover_commands(os.getcwd())

        if name not in commands:
            return jsonify({"error": f"Command not found: {name}"}), 404

        expanded = load_command(commands[name], args)
        result = agent.chat(expanded)
        return jsonify(result)
    except ImportError:
        return jsonify({"error": "Custom commands not available"}), 500


# ── Memory API ──────────────────────────────────────────────────────

@app.route("/api/memory")
def api_memory():
    """Read auto-memory for the current project."""
    try:
        from agents.memory import load_memory, get_memory_path
        content = load_memory(os.getcwd())
        path = get_memory_path(os.getcwd())
        return jsonify({"content": content, "path": path})
    except ImportError:
        return jsonify({"content": "", "path": ""})


@app.route("/api/memory", methods=["POST"])
def api_memory_write():
    """Write to auto-memory. Body: {section, content}."""
    data = request.json or {}
    section = data.get("section", "Notes")
    content = data.get("content", "")

    if not content:
        return jsonify({"error": "No content provided"}), 400

    try:
        from agents.memory import update_memory_section
        update_memory_section(os.getcwd(), section, content)
        return jsonify({"success": True})
    except ImportError:
        return jsonify({"error": "Memory module not available"}), 500


@app.route("/api/memory", methods=["DELETE"])
def api_memory_clear():
    """Clear auto-memory for the current project."""
    try:
        from agents.memory import clear_memory
        cleared = clear_memory(os.getcwd())
        return jsonify({"success": True, "cleared": cleared})
    except ImportError:
        return jsonify({"error": "Memory module not available"}), 500



# ── Voice Settings API ──────────────────────────────────────────────

@app.route("/api/voice/settings")
def api_voice_settings():
    """Get voice pipeline settings."""
    if not voice:
        return jsonify({
            "wake_enabled": False, "silence_threshold": 600,
            "vad_sensitivity": 1.8, "tts_provider": "auto",
            "stt_provider": "auto", "bmo_tts_enabled": True, "wake_variants": [],
            "available": False
        })
    return jsonify({**voice.get_voice_settings(), "available": True})


@app.route("/api/voice/settings", methods=["POST"])
def api_voice_settings_update():
    """Update voice settings. Body: partial dict of settings."""
    if not voice:
        return jsonify({"error": "Voice pipeline not available"}), 503
    data = request.json or {}
    for key, value in data.items():
        voice.update_voice_setting(key, value)
    return jsonify({"ok": True, **voice.get_voice_settings()})


@app.route("/api/voice/wake", methods=["POST"])
def api_voice_wake():
    """Enable/disable wake word listening."""
    if not voice:
        return jsonify({"error": "Voice pipeline not available"}), 503
    data = request.json or {}
    enabled = data.get("enabled", True)
    voice.update_voice_setting("wake_enabled", enabled)
    if enabled:
        voice.start_listening()
    else:
        voice.stop_listening()
    return jsonify({"ok": True, "wake_enabled": enabled})


# ── AI/Agent Controls API ──────────────────────────────────────────

@app.route("/api/models")
def api_models():
    """List available models with tiers."""
    models = [
        {"id": "flash", "name": "Flash", "tier": "fast", "description": "Quick responses"},
        {"id": "pro", "name": "Pro", "tier": "balanced", "description": "General purpose"},
        {"id": "opus", "name": "Opus", "tier": "premium", "description": "Creative & complex"},
        {"id": "local", "name": "Local", "tier": "offline", "description": "Ollama fallback"},
    ]
    return jsonify({"models": models})


@app.route("/api/model", methods=["POST"])
def api_model_set():
    """Set session-level model override."""
    if not agent:
        return jsonify({"error": "Agent not available"}), 503
    data = request.json or {}
    model_id = data.get("model")
    if model_id == "auto" or model_id is None:
        agent._model_override = None
    else:
        agent._model_override = model_id
    return jsonify({"ok": True, "model": model_id})


# ── Game Registry (dnd-app multiplayer game directory, Phase 29f) ────
# Lazy-import + lazy-resolve the singleton so test fixtures that swap the
# module after import still see their own instance.

def _games_registry():
    from services.game_registry import get_registry
    return get_registry()


# Optional second-key gate for the announce/heartbeat routes. Hosts on
# trusted LAN can omit it; if the env var is set, non-localhost callers
# must present it. Orthogonal to BMO_API_KEY (which gates the whole
# Flask app at `_bmo_optional_api_key`).
def _registry_authorized() -> bool:
    if _bmo_client_is_trusted_localhost():
        return True
    # No separate registry key configured: defer to the front-door gate. By the
    # time we reach a mutation route the before_request hook has already required
    # a valid BMO_API_KEY Bearer for any non-localhost caller, so this is no
    # longer a fail-OPEN path (the old `return True` let anyone mutate).
    if not BMO_REGISTRY_API_KEY:
        return _bmo_bearer_authorized()
    presented = (request.headers.get("X-Registry-Key", "") or "").strip()
    return presented == BMO_REGISTRY_API_KEY


# Hard cap on inbound POST body size for registry routes — game entries
# are small JSON, anything bigger is abuse.
MAX_GAMES_BODY_BYTES = 4096
MAX_GAMES_MAX_PLAYERS = 20


def _games_validate_body(data: dict) -> tuple[bool, str | None]:
    if not isinstance(data, dict):
        return False, "request body must be a JSON object"
    try:
        max_p = int(data.get("max_players", 0))
        max_s = int(data.get("max_spectators", 0))
    except (TypeError, ValueError):
        return False, "max_players/max_spectators must be integers"
    if max_p < 1 or max_p > MAX_GAMES_MAX_PLAYERS:
        return False, f"max_players must be 1..{MAX_GAMES_MAX_PLAYERS}"
    if max_s < 0 or max_s > MAX_GAMES_MAX_PLAYERS:
        return False, f"max_spectators must be 0..{MAX_GAMES_MAX_PLAYERS}"
    return True, None


@app.route("/api/games", methods=["GET"])
def api_games_list():
    """List active games, optionally annotated for a given client_id."""
    client_id = (request.args.get("client_id") or "").strip() or None
    return jsonify({"games": _games_registry().list(filter_client_id=client_id)})


@app.route("/api/games", methods=["POST"])
@limiter.limit(RATE_LIMIT_GAMES)
def api_games_announce():
    """Register or update a hosted game."""
    if not _registry_authorized():
        return jsonify({"error": "unauthorized"}), 401
    if request.content_length is not None and request.content_length > MAX_GAMES_BODY_BYTES:
        return jsonify({"error": "payload too large"}), 413
    data = request.get_json(silent=True) or {}
    ok, err = _games_validate_body(data)
    if not ok:
        return jsonify({"error": err}), 400
    try:
        entry = _games_registry().register(data)
    except ValueError as exc:
        return fail(log, exc, 400, "invalid game registration")
    return jsonify({"ok": True, "game": entry["invite_code"]}), 201


@app.route("/api/games/<code>", methods=["PATCH"])
@limiter.limit(RATE_LIMIT_GAMES)
def api_games_update(code: str):
    """Patch fields on an existing entry (typically player/spectator counts)."""
    if not _registry_authorized():
        return jsonify({"error": "unauthorized"}), 401
    if request.content_length is not None and request.content_length > MAX_GAMES_BODY_BYTES:
        return jsonify({"error": "payload too large"}), 413
    data = request.get_json(silent=True) or {}
    if not isinstance(data, dict):
        return jsonify({"error": "request body must be a JSON object"}), 400
    updated = _games_registry().update(code, data)
    if updated is None:
        return jsonify({"error": "not found"}), 404
    return jsonify({"ok": True})


@app.route("/api/games/<code>", methods=["DELETE"])
@limiter.limit(RATE_LIMIT_GAMES)
def api_games_deregister(code: str):
    """Remove an entry (host shutting down)."""
    if not _registry_authorized():
        return jsonify({"error": "unauthorized"}), 401
    removed = _games_registry().deregister(code)
    return jsonify({"ok": removed}), (200 if removed else 404)


@app.route("/api/games/<code>/heartbeat", methods=["POST"])
@limiter.limit(RATE_LIMIT_GAMES)
def api_games_heartbeat(code: str):
    """Refresh the entry's TTL. Hosts call this every ~30s."""
    if not _registry_authorized():
        return jsonify({"error": "unauthorized"}), 401
    ok = _games_registry().heartbeat(code)
    return jsonify({"ok": ok}), (200 if ok else 404)


@app.route("/api/games/stream", methods=["GET"])
def api_games_stream():
    """SSE stream of registry events: initial snapshot + add/update/remove."""
    client_id = (request.args.get("client_id") or "").strip() or None
    registry = _games_registry()
    sub = registry.subscribe(filter_client_id=client_id)

    def _format(event: dict) -> str:
        # SSE keep-alive comments are `: text\n\n`; real events are
        # `event:` + `data:` blocks separated by a blank line.
        if event["event"] == "heartbeat":
            return ": heartbeat\n\n"
        payload = json.dumps(event["data"])
        return f"event: {event['event']}\ndata: {payload}\n\n"

    @stream_with_context
    def _gen():
        try:
            for evt in sub.iter_events():
                yield _format(evt)
        finally:
            sub.close()

    resp = Response(_gen(), mimetype="text/event-stream")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["X-Accel-Buffering"] = "no"
    return resp


# ── Blueprint registration ───────────────────────────────────────────
# PHASE-16 blueprints register at MODULE scope (import time): they late-bind services via
# `import app` inside the handlers, so `import app` in the test suite mounts them without
# running __main__. register_ide / game_relay / library / rclone / sounds predate that and
# take a live agent/socketio by value, so they still run in __main__ after init_services().
from routes.ide import register_ide
from routes.game_relay_ws import register_game_relay
from routes.library_api import register_library
from routes.rclone_api import register_rclone
from routes.sounds_api import register_sounds
from routes.system_api import register_system  # noqa: E402
from routes.music_api import register_music  # noqa: E402
from routes.calendar_api import register_calendar  # noqa: E402
from routes.tv_api import register_tv  # noqa: E402
from routes.chat_api import register_chat  # noqa: E402
from routes.realtime_ws import register_realtime  # noqa: E402
from routes.webapp_api import register_webapp  # noqa: E402

register_system(app)    # /health, /api/wifi, /api/volume, /api/audio, /api/tts, /api/settings, …
register_music(app)     # /api/music/*
register_calendar(app)  # /api/calendar/* + OAuth flow
register_tv(app)        # /api/tv/*
register_chat(app)      # /api/chat*, /api/dnd/*
register_realtime(socketio)  # SocketIO connect/chat_message/plan_*/scratchpad_*/disconnect
register_webapp(app)    # /DungeonTableOnline/* — dnd-app web build (SPA)

# ── Main ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_services()
    # Wire the IDE blueprint + SocketIO handlers now that `agent` is live.
    register_ide(app, socketio, agent)
    # Phase 32 — cloud multiplayer relay on the `/game` Socket.IO namespace.
    register_game_relay(socketio, api_key=BMO_API_KEY)
    # Phase 36 — read-only 5e library API (/api/library) serving the seeded
    # bmo/pi/data/5e-library/ tree (empty/dormant until seed-5e-library.sh runs).
    register_library(app)
    # Cloud-backup API (/api/rclone) — receives a campaign archive from the
    # dnd-app and pushes it to gdrive:DND-VTT-Backups/ (restore streams it back).
    register_rclone(app)
    # Pi-hosted bundled-sound serving (/api/sounds) — audio offload seam.
    register_sounds(app)
    # Restore music playback from last session (if any)
    if music:
        try:
            music.restore_playback()
        except Exception:
            log.exception("[bmo] Music restore failed")
    if BMO_CANARY:
        log.info("[bmo] CANARY boot — hardware/services skipped")
    log.info(f"[bmo] BMO is ready! Access at http://0.0.0.0:{BMO_PORT}")
    socketio.run(app, host="0.0.0.0", port=BMO_PORT, debug=False)
