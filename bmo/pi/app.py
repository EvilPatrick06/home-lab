"""BMO — AI Voice + Vision Assistant for Raspberry Pi 5.

Main Flask application with WebSocket support. Serves the touchscreen UI
and provides API endpoints for all services.

Usage:
    source ~/home-lab/bmo/pi/venv/bin/activate
    python app.py
"""

from gevent import monkey
monkey.patch_all()

import json
import os
import re
import secrets
import shutil
import subprocess
import threading
import time
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import Flask, Response, jsonify, render_template, request, send_from_directory
from flask_socketio import SocketIO
from services.bmo_logging import get_logger
log = get_logger("bmo")

from state import STATE

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
    if "text/html" in response.content_type:
        # 'unsafe-eval' is REQUIRED: Alpine.js compiles its `x-data` / `@click`
        # / `x-show` expressions via `new AsyncFunction(expr)` at runtime, which
        # CSP classifies as `eval`. Without it the kiosk buttons silently fail.
        # 'unsafe-inline' covers inline <script> blocks in the IDE template.
        # CDN hosts cover the IDE's xterm / marked / monaco / socket.io scripts.
        response.headers.setdefault(
            "Content-Security-Policy",
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdn.socket.io; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "img-src 'self' data: blob:; "
            "font-src 'self' data: https://cdn.jsdelivr.net; "
            "connect-src 'self' ws: wss:; "
            "frame-ancestors 'self'; "
            "base-uri 'self'; "
            "object-src 'none'",
        )
    return response


# /api/chat input limits. Per-handler size cap + speaker allowlist + per-IP
# rate-limit (see Limiter setup below) block the worst economic-attack shape.
MAX_CHAT_MESSAGE_LEN = int(os.environ.get("BMO_MAX_CHAT_MESSAGE_LEN", "16384"))
ALLOWED_CHAT_SPEAKERS = {"player", "dm", "discord", "kiosk", "user", "unknown"}


# ── Rate limiting (cost-sensitive routes) ─────────────────────────────
# flask-limiter caps per-IP request rate on routes that hit billable cloud
# LLMs (Anthropic / Gemini / Groq / Fish Audio). Pairs with the MAX_CHAT_*
# size cap (per-request cost) + the BMO_API_KEY auth (front door) — together
# they bound the worst-case bill from a hostile / buggy LAN client.
#
# Per-route limits are env-overridable via BMO_*_RATE_LIMIT (e.g.
# `BMO_CHAT_RATE_LIMIT="30 per minute"`). Localhost (kiosk + bot internal
# loopback) is exempt so the kiosk's natural request rate doesn't trip it.
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
# attach to the Flask app — done after `app = Flask(...)` above
limiter.init_app(app)


# Per-route limits (set as constants so they're env-overridable in one place)
RATE_LIMIT_CHAT = os.environ.get("BMO_CHAT_RATE_LIMIT", "30 per minute")
RATE_LIMIT_DND_LOAD = os.environ.get("BMO_DND_LOAD_RATE_LIMIT", "15 per minute")
RATE_LIMIT_IDE_JOBS = os.environ.get("BMO_IDE_JOBS_RATE_LIMIT", "10 per minute")
RATE_LIMIT_NARRATE = os.environ.get("BMO_NARRATE_RATE_LIMIT", "30 per minute")


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

# Optional LAN/internet hardening: when set, require Authorization: Bearer for non-localhost HTTP
# and SocketIO connects (kiosk on 127.0.0.1 is exempt). See docs/SECURITY.md.
BMO_API_KEY = (os.environ.get("BMO_API_KEY") or "").strip()


def _bmo_client_is_trusted_localhost() -> bool:
    addr = (getattr(request, "remote_addr", None) or "") or ""
    return addr in ("127.0.0.1", "::1", "localhost")


def _bmo_bearer_authorized() -> bool:
    if not BMO_API_KEY:
        return True
    if _bmo_client_is_trusted_localhost():
        return True
    auth = (request.headers.get("Authorization", "") or "").strip()
    return auth == f"Bearer {BMO_API_KEY}"


@app.before_request
def _bmo_optional_api_key():
    if not BMO_API_KEY:
        return None
    p = request.path or ""
    if p in ("/health", "/favicon.ico") or p.startswith("/static/"):
        return None
    if _bmo_client_is_trusted_localhost():
        return None
    if request.headers.get("Authorization", "") == f"Bearer {BMO_API_KEY}":
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
    try:
        from hardware.led_controller import LedController
        led_controller = LedController()
        led_controller.start()
        service_map["leds"] = led_controller
        log.info("[bmo]   LED controller: OK")
    except Exception as e:
        log.exception(f"[bmo]   LED controller: SKIPPED")

    # OLED face display
    oled_face = None
    try:
        from hardware.oled_face import OledFace
        oled_face = OledFace(socketio=socketio)
        oled_face.start()
        service_map["oled_face"] = oled_face
        oled_face.set_expression("warmup")
        log.info("[bmo]   OLED face: OK (warmup)")
    except Exception as e:
        log.exception(f"[bmo]   OLED face: SKIPPED")

    # Voice pipeline (requires pyaudio/mic hardware)
    try:
        from services.voice_pipeline import VoicePipeline
        voice = VoicePipeline(socketio=socketio)
        saved_voice_vol = _load_setting("volume.voice", None)
        if saved_voice_vol is not None:
            voice._speak_volume = int(saved_voice_vol)
        service_map["voice"] = voice
        log.info("[bmo]   Voice pipeline: OK")
    except Exception as e:
        log.exception(f"[bmo]   Voice pipeline: SKIPPED")

    # Camera (requires picamera2)
    try:
        from hardware.camera_service import CameraService
        camera = CameraService(socketio=socketio)
        service_map["camera"] = camera
        log.info("[bmo]   Camera: OK")
    except Exception as e:
        log.exception(f"[bmo]   Camera: SKIPPED")

    # Smart home / Chromecast
    try:
        from services.smart_home import SmartHomeService
        smart_home = SmartHomeService(socketio=socketio)
        service_map["smart_home"] = smart_home
        log.info("[bmo]   Smart home: OK")
    except Exception as e:
        log.exception(f"[bmo]   Smart home: SKIPPED")

    # Calendar (Google API)
    try:
        from services.calendar_service import CalendarService
        calendar = CalendarService(socketio=socketio)
        service_map["calendar"] = calendar
        log.info("[bmo]   Calendar: OK")
    except Exception as e:
        log.exception(f"[bmo]   Calendar: SKIPPED")

    # Dynamic location/timezone
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
    try:
        from services.weather_service import WeatherService
        weather = WeatherService(socketio=socketio, location_service=location_service)
        service_map["weather"] = weather
        log.info("[bmo]   Weather: OK")
    except Exception as e:
        log.exception(f"[bmo]   Weather: SKIPPED")

    # Audio output routing (before music so music can use it)
    try:
        from services.audio_output_service import AudioOutputService
        audio_service = AudioOutputService()
        service_map["audio"] = audio_service
        log.info("[bmo]   Audio output: OK")
    except Exception as e:
        log.exception(f"[bmo]   Audio output: SKIPPED")

    # Music (requires ytmusicapi/vlc)
    try:
        from services.music_service import MusicService
        music = MusicService(smart_home=smart_home, socketio=socketio, audio_service=audio_service)
        service_map["music"] = music
        log.info("[bmo]   Music: OK")
    except Exception as e:
        log.exception(f"[bmo]   Music: SKIPPED")

    # Timers
    try:
        from services.timer_service import TimerService
        timers = TimerService(voice_pipeline=voice, socketio=socketio,
                              agent_fn=lambda: agent)
        saved_alarm_vol = _load_setting("volume.alarms", None)
        if saved_alarm_vol is not None:
            timers.alarm_volume = int(saved_alarm_vol)
        service_map["timers"] = timers
        log.info("[bmo]   Timers: OK")
    except Exception as e:
        log.exception(f"[bmo]   Timers: SKIPPED")

    # Agent (core — always required)
    log.info("[bmo]   Creating agent...")
    agent = BmoAgent(services=service_map, socketio=socketio)
    log.info("[bmo]   Agent: OK")

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
    # Boost mic gain for cross-room pickup (PipeWire, persists until reboot)
    try:
        subprocess.run(
            ["wpctl", "set-volume", "@DEFAULT_SOURCE@", "1.5"],
            capture_output=True, timeout=3,
            env={**os.environ, "XDG_RUNTIME_DIR": "/run/user/1000",
                 "DBUS_SESSION_BUS_ADDRESS": "unix:path=/run/user/1000/bus"},
        )
        log.info("[bmo]   Mic gain: 150%")
    except Exception as e:
        log.exception(f"[bmo]   Mic gain set failed")

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
            except Exception as e:
                log.exception(f"[voice] Chat error")
                return ""
        voice._chat_callback = _voice_chat

        def _voice_chat_stream(text, speaker="unknown"):
            """Streaming voice chat — yields text chunks for faster TTS start."""
            try:
                return agent.chat_stream(text, speaker=speaker, client_timezone=_pi_timezone())
            except Exception as e:
                log.exception(f"[voice] Stream chat error")
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
            # Save voice transcriptions (user messages) to chat history
            elif event == "transcription":
                _save_chat_message({
                    "role": "user",
                    "text": data.get("text", ""),
                    "speaker": data.get("speaker", "unknown"),
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

    # Try to connect to TV (non-blocking — don't hold up startup)
    threading.Thread(target=init_tv_remote, daemon=True).start()

    # Health checker (monitoring + Discord alerts)
    try:
        from services.monitoring import HealthChecker
        health_checker = HealthChecker(socketio=socketio, check_interval=60)
        health_checker.start()
        log.info("[bmo]   Health checker: OK (60s interval)")
    except Exception as e:
        log.exception(f"[bmo]   Health checker: SKIPPED")

    # Start KDE Connect daemon (needed for notification bridge)
    try:
        import shutil
        if shutil.which("kdeconnectd"):
            subprocess.Popen(["kdeconnectd"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            log.info("[bmo]   KDE Connect daemon: started")
        else:
            log.info("[bmo]   KDE Connect daemon: not installed")
    except Exception as e:
        log.exception(f"[bmo]   KDE Connect daemon: SKIPPED")

    # Notification service (KDE Connect bridge)
    try:
        from services.notification_service import NotificationService
        notifier = NotificationService(voice_pipeline=voice, socketio=socketio)
        notifier.start()
        service_map["notifier"] = notifier
        log.info("[bmo]   Notifications: OK")
    except Exception as e:
        log.exception(f"[bmo]   Notifications: SKIPPED")

    # Scene mode engine
    def _scene_tv_send_key(key):
        if _tv_remote or os.path.exists(_TV_CERTFILE):
            r = _tv_cmd("send_key", key=key)
            if r.get("error"):
                log.info(f"[scene] TV key failed: {r['error']}")

    def _scene_tv_launch(app_name):
        url = TV_APPS.get(app_name, "")
        if url and (_tv_remote or os.path.exists(_TV_CERTFILE)):
            r = _tv_cmd("launch_app", uri=url)
            if r.get("error"):
                log.info(f"[scene] TV launch failed: {r['error']}")

    def _scene_tv_power_on():
        """Turn TV on only if it's currently off (queries live status)."""
        global _tv_is_on
        if not (_tv_remote or os.path.exists(_TV_CERTFILE)):
            log.info("[scene] TV not connected — pair first")
            return False
        status = _tv_cmd("status")
        is_on = status.get("is_on")
        if is_on is True:
            log.info("[scene] TV already on, skipping POWER")
            return True
        r = _tv_cmd("send_key", key="POWER")
        if not r.get("error"):
            _tv_is_on = True
            log.info("[scene] TV powered on")
            return True
        log.info(f"[scene] TV power on failed: {r.get('error')}")
        return False

    def _scene_tv_power_off():
        """Turn TV off only if it's currently on (queries live status)."""
        global _tv_is_on
        if not (_tv_remote or os.path.exists(_TV_CERTFILE)):
            log.info("[scene] TV not connected — pair first")
            return False
        status = _tv_cmd("status")
        is_on = status.get("is_on")
        if is_on is False:
            log.info("[scene] TV already off, skipping POWER")
            return True
        r = _tv_cmd("send_key", key="POWER")
        if not r.get("error"):
            _tv_is_on = False
            log.info("[scene] TV powered off")
            return True
        log.info(f"[scene] TV power off failed: {r.get('error')}")
        return False

    service_map["tv_send_key"] = _scene_tv_send_key
    service_map["tv_launch"] = _scene_tv_launch
    service_map["tv_is_on"] = lambda: _tv_is_on
    service_map["tv_power_on"] = _scene_tv_power_on
    service_map["tv_power_off"] = _scene_tv_power_off

    try:
        from services.scene_service import SceneService
        scene_service = SceneService(services=service_map, socketio=socketio)
        service_map["scenes"] = scene_service
        if voice:
            voice._scene_service = scene_service
        log.info("[bmo]   Scene engine: OK")
    except Exception as e:
        log.exception(f"[bmo]   Scene engine: SKIPPED")

    # List service
    try:
        from services.list_service import ListService
        list_service = ListService()
        service_map["lists"] = list_service
        log.info("[bmo]   List service: OK")
    except Exception as e:
        log.exception(f"[bmo]   List service: SKIPPED")

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
    except Exception as e:
        log.exception(f"[bmo]   Alert service: SKIPPED")

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
    except Exception as e:
        log.exception(f"[bmo]   Routine service: SKIPPED")

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
    except Exception as e:
        log.exception(f"[bmo]   Personality engine: SKIPPED")

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
    except Exception as e:
        log.exception(f"[bmo]   Ollama warmup skipped")

    # Set OLED to warmup expression during init, then idle
    if oled_face:
        oled_face.set_expression("idle")


def _sync_expression(expression: str):
    """Sync OLED face + LED controller to match expression, emit to web clients."""
    if oled_face:
        oled_face.set_expression(expression)
    if led_controller:
        from hardware.led_controller import led_state_for_expression
        led_state = led_state_for_expression(expression)
        led_controller.set_state(led_state)
    socketio.emit("expression", {"expression": expression})


# ── Pages ────────────────────────────────────────────────────────────

@app.route("/favicon.ico")
def favicon():
    resp = send_from_directory(app.static_folder, "favicon.ico", mimetype="image/x-icon")
    resp.headers["Cache-Control"] = "public, max-age=86400"
    return resp


@app.route("/")
def index():
    kiosk_mode = request.args.get("kiosk", "").strip().lower() in {"1", "true", "yes", "on"}
    asset_v = int(time.time())
    return render_template("index.html", kiosk_mode=kiosk_mode, asset_v=asset_v)


@app.route("/ide")
def ide_page():
    """Serve the IDE as a full-page standalone app."""
    return render_template("ide.html")


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/api/health/full")
def api_health_full():
    """Return full health status from HealthChecker (Pi stats + service checks)."""
    if health_checker:
        return jsonify(health_checker.get_status())
    return jsonify({"overall": "unknown", "services": {}, "pi_stats": {}})


def _wifi_interface() -> str:
    """Return primary wireless interface name."""
    try:
        for iface in os.listdir("/sys/class/net"):
            if iface.startswith("wl"):
                return iface
    except OSError:
        pass
    return "wlan0"


def _wifi_status() -> dict:
    """Collect current Wi-Fi status for settings UI."""
    iface = _wifi_interface()
    ssid = ""
    wpa_state = ""
    ip_address = ""
    internet = False
    tailscale_ip = ""

    try:
        result = subprocess.run(
            ["wpa_cli", "-i", iface, "status"],
            capture_output=True,
            text=True,
            timeout=4,
        )
        if result.returncode == 0:
            for line in result.stdout.splitlines():
                if line.startswith("ssid="):
                    ssid = line.split("=", 1)[1].strip()
                elif line.startswith("wpa_state="):
                    wpa_state = line.split("=", 1)[1].strip()
    except (OSError, subprocess.SubprocessError):
        pass

    if not ssid and shutil.which("iwgetid"):
        try:
            result = subprocess.run(
                ["iwgetid", "-r"],
                capture_output=True,
                text=True,
                timeout=3,
            )
            if result.returncode == 0:
                ssid = result.stdout.strip()
        except (OSError, subprocess.SubprocessError):
            pass

    try:
        result = subprocess.run(
            ["ip", "-4", "-o", "addr", "show", iface],
            capture_output=True,
            text=True,
            timeout=3,
        )
        if result.returncode == 0 and result.stdout.strip():
            m = re.search(r"inet\s+([0-9.]+)/", result.stdout)
            if m:
                ip_address = m.group(1)
    except (OSError, subprocess.SubprocessError):
        pass

    try:
        ping = subprocess.run(
            ["ping", "-c", "1", "-W", "1", "1.1.1.1"],
            capture_output=True,
            text=True,
            timeout=3,
        )
        internet = ping.returncode == 0
    except (OSError, subprocess.SubprocessError):
        internet = False

    if shutil.which("tailscale"):
        try:
            result = subprocess.run(
                ["tailscale", "ip", "-4"],
                capture_output=True,
                text=True,
                timeout=4,
            )
            if result.returncode == 0:
                tailscale_ip = (result.stdout.strip().splitlines() or [""])[0]
        except (OSError, subprocess.SubprocessError):
            pass

    return {
        "interface": iface,
        "current_ssid": ssid,
        "wpa_state": wpa_state,
        "ip_address": ip_address,
        "internet": internet,
        "tailscale_ip": tailscale_ip,
        "saved_networks": _wifi_saved_networks(),
    }


def _wifi_saved_networks() -> list[dict]:
    """Return saved Wi-Fi connections from NetworkManager."""
    if not shutil.which("nmcli"):
        return []

    try:
        result = subprocess.run(
            ["nmcli", "-t", "-f", "NAME,TYPE,AUTOCONNECT", "connection", "show"],
            capture_output=True,
            text=True,
            timeout=8,
        )
    except (OSError, subprocess.SubprocessError):
        return []

    if result.returncode != 0:
        return []

    saved = []
    for row in result.stdout.splitlines():
        if not row.strip():
            continue
        try:
            name, conn_type, auto = row.rsplit(":", 2)
        except ValueError:
            continue
        if conn_type != "802-11-wireless":
            continue
        saved.append({"name": name.strip(), "autoconnect": auto.strip().lower() == "yes"})

    saved.sort(key=lambda s: s["name"].lower())
    return saved


def _wifi_scan_networks(iface: str) -> list[dict]:
    """Scan available Wi-Fi networks via nmcli and return deduplicated list."""
    if not shutil.which("nmcli"):
        return []

    cmd = ["nmcli", "-t", "-f", "IN-USE,SSID,SIGNAL,SECURITY", "dev", "wifi", "list", "ifname", iface]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    if result.returncode != 0:
        result = subprocess.run(["sudo", "-n", *cmd], capture_output=True, text=True, timeout=15)
        if result.returncode != 0:
            raise RuntimeError((result.stderr or result.stdout or "Wi-Fi scan failed").strip())

    best_by_ssid: dict[str, dict] = {}
    for row in result.stdout.splitlines():
        if not row.strip() or ":" not in row:
            continue
        in_use, rest = row.split(":", 1)
        try:
            ssid_raw, signal_raw, security_raw = rest.rsplit(":", 2)
        except ValueError:
            continue
        ssid = ssid_raw.replace(r"\:", ":").strip()
        if not ssid:
            continue
        try:
            signal = int(signal_raw)
        except ValueError:
            signal = 0
        security = security_raw.strip()
        item = {
            "ssid": ssid,
            "signal": signal,
            "security": security,
            "secure": bool(security and security != "--"),
            "in_use": in_use.strip() == "*",
        }
        prev = best_by_ssid.get(ssid)
        if not prev or item["signal"] > prev["signal"] or item["in_use"]:
            best_by_ssid[ssid] = item

    networks = list(best_by_ssid.values())
    networks.sort(key=lambda n: (not n["in_use"], -n["signal"], n["ssid"].lower()))
    return networks


def _wifi_connect(ssid: str, password: str, iface: str) -> tuple[bool, str]:
    """Create/update NetworkManager profile and connect."""
    if not shutil.which("nmcli"):
        return False, "NetworkManager (nmcli) is not available on this system."

    safe_name = re.sub(r"[^A-Za-z0-9._-]+", "-", ssid).strip("-") or "network"
    conn_name = f"bmo-ui-{safe_name}"[:64]

    subprocess.run(["sudo", "-n", "nmcli", "connection", "delete", conn_name], capture_output=True, text=True, timeout=8)

    create = subprocess.run(
        ["sudo", "-n", "nmcli", "connection", "add", "type", "wifi", "ifname", iface, "con-name", conn_name, "ssid", ssid],
        capture_output=True,
        text=True,
        timeout=12,
    )
    if create.returncode != 0:
        return False, (create.stderr or create.stdout or "Failed to create Wi-Fi profile").strip()

    if password.strip():
        secure_args = ["wifi-sec.key-mgmt", "wpa-psk", "wifi-sec.psk", password.strip()]
    else:
        secure_args = ["wifi-sec.key-mgmt", "none"]

    modify = subprocess.run(
        [
            "sudo",
            "-n",
            "nmcli",
            "connection",
            "modify",
            conn_name,
            *secure_args,
            "connection.autoconnect",
            "yes",
            "connection.autoconnect-priority",
            "200",
            "ipv4.method",
            "auto",
            "ipv6.method",
            "auto",
        ],
        capture_output=True,
        text=True,
        timeout=12,
    )
    if modify.returncode != 0:
        return False, (modify.stderr or modify.stdout or "Failed to update Wi-Fi profile").strip()

    up = subprocess.run(
        ["sudo", "-n", "nmcli", "connection", "up", conn_name],
        capture_output=True,
        text=True,
        timeout=20,
    )
    if up.returncode != 0:
        return False, (up.stderr or up.stdout or "Failed to connect to Wi-Fi network").strip()

    return True, f"Connecting to {ssid}"


def _wifi_connect_saved(connection_name: str) -> tuple[bool, str]:
    """Activate a previously saved NetworkManager Wi-Fi profile."""
    if not shutil.which("nmcli"):
        return False, "NetworkManager (nmcli) is not available on this system."

    up = subprocess.run(
        ["sudo", "-n", "nmcli", "connection", "up", connection_name],
        capture_output=True,
        text=True,
        timeout=20,
    )
    if up.returncode != 0:
        return False, (up.stderr or up.stdout or "Failed to activate saved Wi-Fi profile").strip()
    return True, f"Connecting using saved network profile: {connection_name}"


@app.route("/api/wifi/status")
def api_wifi_status():
    return jsonify(_wifi_status())


@app.route("/api/wifi/scan")
def api_wifi_scan():
    iface = _wifi_interface()
    try:
        networks = _wifi_scan_networks(iface)
        return jsonify({"interface": iface, "networks": networks})
    except RuntimeError as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/wifi/connect", methods=["POST"])
def api_wifi_connect():
    data = request.json or {}
    ssid = str(data.get("ssid", "")).strip()
    password = str(data.get("password", ""))
    if not ssid:
        return jsonify({"error": "SSID is required"}), 400

    iface = _wifi_interface()
    ok, message = _wifi_connect(ssid, password, iface)
    status = _wifi_status()
    if ok:
        return jsonify({"ok": True, "message": message, "status": status})
    return jsonify({"ok": False, "error": message, "status": status}), 500


@app.route("/api/wifi/connect_saved", methods=["POST"])
def api_wifi_connect_saved():
    data = request.json or {}
    name = str(data.get("name", "")).strip()
    if not name:
        return jsonify({"error": "Saved network name is required"}), 400
    ok, message = _wifi_connect_saved(name)
    status = _wifi_status()
    if ok:
        return jsonify({"ok": True, "message": message, "status": status})
    return jsonify({"ok": False, "error": message, "status": status}), 500


@app.route("/api/service/restart", methods=["POST"])
def api_service_restart():
    """Restart a single service or Docker container."""
    import subprocess
    data = request.get_json() or {}
    target = data.get("target", "")
    if not target:
        return jsonify({"error": "Missing target"}), 400

    # Allowed systemd services
    allowed_svcs = ["bmo", "bmo-dm-bot", "bmo-social-bot", "bmo-kiosk", "bmo-fan", "cloudflared"]
    # Allowed Docker containers
    allowed_docker = ["bmo-pihole", "bmo-ollama", "bmo-coturn", "bmo-peerjs"]

    try:
        if target in allowed_svcs:
            result = subprocess.run(
                ["sudo", "systemctl", "restart", f"{target}.service"],
                capture_output=True, text=True, timeout=15,
            )
            if result.returncode == 0:
                return jsonify({"ok": True, "message": f"{target} restarted"})
            return jsonify({"ok": False, "message": result.stderr.strip()}), 500
        elif target in allowed_docker:
            result = subprocess.run(
                ["docker", "restart", target],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode == 0:
                return jsonify({"ok": True, "message": f"{target} restarted"})
            return jsonify({"ok": False, "message": result.stderr.strip()}), 500
        else:
            return jsonify({"error": f"Unknown target: {target}"}), 400
    except Exception as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/service/restart-all", methods=["POST"])
def api_service_restart_all():
    """Restart all services and Docker containers."""
    import subprocess
    results = {}
    for svc in ["bmo", "bmo-dm-bot", "bmo-social-bot", "bmo-kiosk", "bmo-fan"]:
        try:
            r = subprocess.run(["sudo", "systemctl", "restart", f"{svc}.service"],
                               capture_output=True, text=True, timeout=15)
            results[svc] = "ok" if r.returncode == 0 else r.stderr.strip()
        except Exception as e:
            results[svc] = str(e)
    for c in ["bmo-pihole", "bmo-ollama", "bmo-coturn", "bmo-peerjs"]:
        try:
            r = subprocess.run(["docker", "restart", c],
                               capture_output=True, text=True, timeout=30)
            results[c] = "ok" if r.returncode == 0 else r.stderr.strip()
        except Exception as e:
            results[c] = str(e)
    return jsonify({"ok": True, "results": results})


@app.route("/api/status/summary")
def api_status_summary():
    """Human-readable status summary for TTS and voice queries."""
    if not health_checker:
        return jsonify({"summary": "I can't check my status right now — monitoring isn't running."})

    status = health_checker.get_status()
    overall = status.get("overall", "unknown")
    pi = status.get("pi_stats", {})
    down = status.get("down_services", [])
    down_required = status.get("down_required_services", down)
    down_noncritical = status.get("down_noncritical_services", [])
    degraded = status.get("degraded_services", [])
    info_services = status.get("info_services", [])
    services = status.get("services", {})

    from services.monitoring import HealthChecker as _HC
    label_map = getattr(_HC, '_SERVICE_LABELS', None)
    def _label(name):
        if label_map and name in label_map:
            return label_map[name].split("(")[0].strip().lstrip("🤖🌐🔑🐋📡🎮 ")
        return name.replace("_", " ").title()

    parts = []
    if overall == "healthy":
        total = len(services)
        parts.append(f"All {total} services are running normally.")
    elif overall == "critical":
        labels = [_label(s) for s in down_required or down]
        parts.append(f"Critical: {', '.join(labels)} {'is' if len(labels)==1 else 'are'} down.")
    elif overall == "warning":
        warning_bits = []
        if down_noncritical:
            warning_bits.append(f"down: {', '.join(_label(s) for s in down_noncritical)}")
        if degraded:
            warning_bits.append(f"degraded: {', '.join(_label(s) for s in degraded)}")
        if warning_bits:
            parts.append(f"Warning: {'; '.join(warning_bits)}.")

    # Pi stats
    cpu = pi.get("cpu_percent")
    ram = pi.get("ram_percent")
    temp = pi.get("cpu_temp")
    disk = pi.get("disk_percent")

    if cpu is not None:
        parts.append(f"CPU is at {cpu}%.")
    if ram is not None:
        parts.append(f"Memory: {ram}% used.")
    if temp is not None:
        parts.append(f"Temperature: {temp}°C.")
        if temp > 70:
            parts.append("That's running hot!")
    if disk is not None:
        parts.append(f"Disk: {disk}% used.")

    power = services.get("pi_power", {})
    if power and power.get("status") != "up":
        parts.append(f"Power issue: {power.get('message', 'check pi_power')}.")

    # Internet
    inet = services.get("internet", {})
    if inet:
        if inet.get("status") == "up":
            parts.append("Internet connection is good.")
        else:
            parts.append("Internet is down!")

    # Docker
    docker_down = [name for name, info in services.items() if name.startswith("docker_") and info.get("status") == "down"]
    if docker_down:
        parts.append("Docker containers have issues.")

    if info_services:
        parts.append(f"Info: {', '.join(_label(s) for s in info_services)}.")

    summary = " ".join(parts)
    return jsonify({"summary": summary, "overall": overall, "raw": status})


# ── Chat API ─────────────────────────────────────────────────────────

def _strip_markdown(text: str) -> str:
    """Remove markdown formatting so the web UI shows plain English."""
    from services.voice_pipeline import VoicePipeline
    return VoicePipeline._strip_markdown(text)

@app.route("/api/chat", methods=["POST"])
@limiter.limit(RATE_LIMIT_CHAT)
def api_chat():
    data = request.json or {}
    message = data.get("message", "")
    speaker = data.get("speaker", "unknown")

    if not isinstance(message, str) or not message:
        return jsonify({"error": "No message provided"}), 400
    if len(message) > MAX_CHAT_MESSAGE_LEN:
        return jsonify({
            "error": f"message too large (max {MAX_CHAT_MESSAGE_LEN} chars)"
        }), 413
    # Speaker allowlist — prevents downstream agents from being tricked by
    # a spoofed `speaker == "DM"` / `"system"` field.
    if not isinstance(speaker, str) or speaker.lower() not in ALLOWED_CHAT_SPEAKERS:
        speaker = "unknown"

    # Save user message immediately
    _save_chat_message({"role": "user", "text": message, "speaker": speaker, "ts": time.time()})

    client_tz = _request_client_timezone(default_to_pi=True)
    result = agent.chat(message, speaker=speaker, client_timezone=client_tz)
    result["text"] = _strip_markdown(result["text"])

    # Save assistant response immediately
    _save_chat_message({"role": "assistant", "text": result["text"], "ts": time.time()})

    # Speak the response (in background so API returns immediately)
    if voice:
        threading.Thread(target=voice.speak, args=(result["text"],), daemon=True).start()

    return jsonify(result)


_DND_ALLOWED_DATA_ROOTS = [
    os.path.realpath(os.path.expanduser("~/home-lab/bmo/pi/data")),
    os.path.realpath(os.path.expanduser("~/home-lab/dnd-app/src/renderer/public/data")),
]


def _safe_dnd_path(raw: str) -> str:
    """Realpath-jail a DnD asset path to ~/home-lab/bmo/pi/data or the
    dnd-app shared data tree. Anything else (especially `/etc/passwd`,
    `~/.ssh/...`, `~/home-lab/bmo/pi/.env`, `/home/patrick/home-lab/bmo/pi/config/token.json`)
    is rejected. Allows `..` segments inside the allowed roots — load_dnd_context
    needs that for nested character files."""
    if not isinstance(raw, str) or not raw:
        raise PermissionError("path is required")
    resolved = os.path.realpath(os.path.expanduser(raw))
    for root in _DND_ALLOWED_DATA_ROOTS:
        if resolved == root or resolved.startswith(root + os.sep):
            return resolved
    raise PermissionError(f"path outside DnD content sandbox: {resolved}")


@app.route("/api/dnd/load", methods=["POST"])
@limiter.limit(RATE_LIMIT_DND_LOAD)
def api_dnd_load():
    """Manually load DnD context with character files and map selection."""
    data = request.json or {}
    char_paths = data.get("characters", [])
    maps_dir = data.get("maps_dir", "")
    chosen_map = data.get("map", None)

    if not char_paths or not isinstance(char_paths, list):
        return jsonify({"error": "No character file paths provided"}), 400
    if len(char_paths) > 32:
        return jsonify({"error": "Too many character paths (max 32)"}), 400

    try:
        safe_chars = [_safe_dnd_path(p) for p in char_paths]
        safe_maps_dir = _safe_dnd_path(maps_dir) if maps_dir else ""
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403

    selected_map = agent.load_dnd_context(safe_chars, safe_maps_dir, chosen_map)
    return jsonify({"ok": True, "map": selected_map})


@app.route("/api/dnd/sessions")
def api_dnd_sessions():
    """List all saved DnD session log files."""
    if not os.path.isdir(DND_LOG_DIR):
        return jsonify([])
    sessions = []
    for fname in sorted(os.listdir(DND_LOG_DIR), reverse=True):
        if fname.startswith("session_") and fname.endswith(".json"):
            date = fname.replace("session_", "").replace(".json", "")
            fpath = os.path.join(DND_LOG_DIR, fname)
            try:
                with open(fpath, encoding="utf-8") as f:
                    messages = json.load(f)
                # Get first assistant message as preview
                preview = ""
                for m in messages:
                    if m.get("role") == "assistant":
                        preview = m.get("text", "")[:100]
                        break
                sessions.append({"date": date, "messages": len(messages), "preview": preview})
            except Exception:
                sessions.append({"date": date, "messages": 0, "preview": ""})
    return jsonify(sessions)


@app.route("/api/dnd/sessions/<date>")
def api_dnd_session_get(date):
    """Get a specific DnD session log by date."""
    fpath = os.path.join(DND_LOG_DIR, f"session_{date}.json")
    if not os.path.exists(fpath):
        return jsonify({"error": f"No session found for {date}"}), 404
    try:
        with open(fpath, encoding="utf-8") as f:
            messages = json.load(f)
        return jsonify(messages)
    except Exception as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/dnd/sessions/<date>/restore", methods=["POST"])
def api_dnd_session_restore(date):
    """Restore a DnD session into the agent's conversation history."""
    fpath = os.path.join(DND_LOG_DIR, f"session_{date}.json")
    if not os.path.exists(fpath):
        return jsonify({"error": f"No session found for {date}"}), 404
    try:
        with open(fpath, encoding="utf-8") as f:
            messages = json.load(f)
        # Clear current history and reload
        agent.conversation_history.clear()
        for msg in messages:
            role = msg.get("role", "user")
            text = msg.get("text", "")
            agent.conversation_history.append({"role": role, "content": text})
        # Re-detect DnD context
        for msg in messages:
            if msg.get("role") == "user" and agent._is_dnd_request(msg.get("text", "")):
                agent._auto_load_dnd(msg["text"])
                break
        # Generate a narrative recap
        recap = ""
        try:
            recap = agent.generate_session_recap(messages)
        except Exception as e:
            log.exception(f"[chat] Recap generation failed")
        return jsonify({"ok": True, "messages_restored": len(messages), "recap": recap})
    except Exception as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/dnd/gamestate")
def api_dnd_gamestate():
    """Return the current D&D game state (HP, spell slots, conditions, etc.)."""
    if agent:
        return jsonify(agent.get_gamestate())
    return jsonify({"date": None, "characters": {}})


@app.route("/api/dnd/players")
def api_dnd_players():
    """Return player character names from the active DnD context."""
    if agent:
        return jsonify({"players": agent.get_player_names()})
    return jsonify({"players": []})


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


@app.route("/api/scratchpad")
def api_scratchpad():
    """Read the shared scratchpad."""
    if agent and agent.orchestrator:
        return jsonify(agent.orchestrator.scratchpad.to_dict())
    return jsonify({})


@app.route("/api/scratchpad", methods=["POST"])
def api_scratchpad_write():
    """Write to the shared scratchpad."""
    data = request.json or {}
    section = data.get("section", "Notes")
    content = data.get("content", "")
    append = data.get("append", False)
    if agent and agent.orchestrator:
        agent.orchestrator.scratchpad.write(section, content, append)
        return jsonify({"success": True})
    return jsonify({"error": "Agent not initialized"}), 500


@app.route("/api/scratchpad", methods=["DELETE"])
def api_scratchpad_clear():
    """Clear scratchpad section(s)."""
    data = request.json or {}
    section = data.get("section")
    if agent and agent.orchestrator:
        agent.orchestrator.scratchpad.clear(section)
        return jsonify({"success": True})
    return jsonify({"error": "Agent not initialized"}), 500


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
        return jsonify({"success": False, "error": str(e)}), 500


# ── Music API ────────────────────────────────────────────────────────

@app.route("/api/music/search")
def api_music_search():
    query = request.args.get("q", "")
    if not query:
        return jsonify({"error": "No query"}), 400
    results = music.search(query)
    return jsonify(results)


@app.route("/api/music/play", methods=["POST"])
def api_music_play():
    data = request.get_json(silent=True) or {}
    song = data.get("song")
    if song:
        music.play(song)
    else:
        music.play()  # Resume
    return jsonify({"ok": True})


@app.route("/api/music/play-queue", methods=["POST"])
def api_music_play_queue():
    data = request.json or {}
    songs = data.get("songs", [])
    music.play_queue(songs)
    return jsonify({"ok": True})


@app.route("/api/music/pause", methods=["POST"])
def api_music_pause():
    music.pause()
    return jsonify({"ok": True})


@app.route("/api/music/pause-only", methods=["POST"])
def api_music_pause_only():
    music.pause_only()
    return jsonify({"ok": True})


@app.route("/api/music/stop", methods=["POST"])
def api_music_stop():
    music.stop()
    return jsonify({"ok": True})


@app.route("/api/music/next", methods=["POST"])
def api_music_next():
    music.next_track()
    return jsonify({"ok": True})


@app.route("/api/music/previous", methods=["POST"])
def api_music_previous():
    music.previous_track()
    return jsonify({"ok": True})


@app.route("/api/music/seek", methods=["POST"])
def api_music_seek():
    data = request.json or {}
    music.seek(data.get("position", 0))
    return jsonify({"ok": True})


@app.route("/api/music/volume", methods=["POST"])
def api_music_volume():
    data = request.json or {}
    music.set_volume(data.get("volume", data.get("level", 50)))
    return jsonify({"ok": True})


@app.route("/api/music/state")
def api_music_state():
    return jsonify(music.get_state())


@app.route("/api/music/devices")
def api_music_devices():
    return jsonify(music.get_devices())


@app.route("/api/music/cast", methods=["POST"])
def api_music_cast():
    data = request.json or {}
    music.set_output_device(data.get("device", "pi"))
    return jsonify({"ok": True})


@app.route("/api/music/shuffle", methods=["POST"])
def api_music_shuffle():
    music.shuffle = not music.shuffle
    return jsonify({"shuffle": music.shuffle})


@app.route("/api/music/repeat", methods=["POST"])
def api_music_repeat():
    cycle = {"off": "all", "all": "one", "one": "off"}
    music.repeat = cycle.get(music.repeat, "off")
    return jsonify({"repeat": music.repeat})


@app.route("/api/music/autoplay", methods=["POST"])
def api_music_autoplay():
    music.autoplay = not music.autoplay
    return jsonify({"autoplay": music.autoplay})


@app.route("/api/music/queue/add", methods=["POST"])
def api_music_queue_add():
    data = request.json or {}
    song = data.get("song")
    if not song:
        return jsonify({"error": "No song provided"}), 400
    music.add_to_queue(song)
    return jsonify({"ok": True, "queue_length": len(music.queue)})


@app.route("/api/music/queue/remove", methods=["POST"])
def api_music_queue_remove():
    data = request.json or {}
    index = data.get("index")
    if index is None:
        return jsonify({"error": "No index provided"}), 400
    if not music.remove_from_queue(index):
        return jsonify({"error": "Cannot remove that item"}), 400
    return jsonify({"ok": True, "queue_length": len(music.queue)})


@app.route("/api/music/queue")
def api_music_queue():
    return jsonify(music.get_queue())


@app.route("/api/music/album/<browse_id>")
def api_music_album(browse_id):
    try:
        return jsonify(music.get_album(browse_id))
    except Exception as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/music/playlist/<browse_id>")
def api_music_playlist(browse_id):
    try:
        return jsonify(music.get_playlist(browse_id))
    except Exception as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/music/search/playlists")
def api_music_search_playlists():
    query = request.args.get("q", "")
    if not query:
        return jsonify([])
    try:
        return jsonify(music.search_playlists(query))
    except Exception as e:
        log.exception(f"[music] Playlist search error")
        return jsonify([])


@app.route("/api/music/history")
def api_music_history():
    return jsonify(music.get_history())


@app.route("/api/music/most-played")
def api_music_most_played():
    return jsonify(music.get_most_played())


@app.route("/api/music/lyrics/<video_id>")
def api_music_lyrics(video_id):
    try:
        return jsonify(music.get_lyrics(video_id))
    except Exception as e:
        return jsonify({"lyrics": None, "error": str(e)})


# ── Calendar API ─────────────────────────────────────────────────────

@app.route("/api/calendar/events")
def api_calendar_events():
    days = int(request.args.get("days", 7))
    try:
        events = calendar.get_upcoming_events(days_ahead=days)
        return jsonify({"events": events})
    except RuntimeError:
        return jsonify({"offline": True, "events": [], "needs_auth": True})


@app.route("/api/calendar/today")
def api_calendar_today():
    return jsonify(calendar.get_today_events())


@app.route("/api/calendar/next")
def api_calendar_next():
    event = calendar.get_next_event()
    return jsonify(event or {})


@app.route("/api/calendar/create", methods=["POST"])
def api_calendar_create():
    data = request.json or {}
    import datetime
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


@app.route("/api/calendar/update/<event_id>", methods=["PUT"])
def api_calendar_update(event_id):
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


@app.route("/api/calendar/delete/<event_id>", methods=["DELETE"])
def api_calendar_delete(event_id):
    calendar.delete_event(event_id)
    return jsonify({"ok": True})


def _calendar_config_dir() -> str:
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "config")


def _calendar_legacy_config_dir() -> str:
    # Back-compat: older setup layouts used bmo/config instead of bmo/pi/config.
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "config")


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
        except OSError as e:
            log.exception(f"[calendar] failed to migrate credentials.json")
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
        except OSError as e:
            log.exception(f"[calendar] failed to migrate token.json")
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


@app.route("/api/calendar/auth/url")
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
            redirect_uri = (
                request.args.get("redirect_uri", "").strip()
                or f"{request.host_url.rstrip('/')}/api/calendar/auth/callback"
            )
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
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


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


@app.route("/api/calendar/auth/status")
def api_calendar_auth_status():
    """Quick auth status probe used by UI while waiting for OAuth callback."""
    now = time.time()
    try:
        resolved_token_path = _ensure_calendar_token_path()
        if not os.path.exists(resolved_token_path):
            return jsonify({"authorized": False, "message": "token.json missing", "checked_at": now})

        if calendar:
            calendar._service = None
            calendar.get_next_event()
        return jsonify({"authorized": True, "message": "Calendar token is valid", "checked_at": now})
    except Exception as e:
        return jsonify({"authorized": False, "message": str(e), "checked_at": now}), 200


@app.route("/api/calendar/auth/callback", methods=["GET", "POST"])
def api_calendar_auth_callback():
    """Exchange auth code for token and save it. Accepts full URL or raw code."""
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

        redirect_uri = (
            f"{request.host_url.rstrip('/')}/api/calendar/auth/callback"
            if browser_callback
            else "urn:ietf:wg:oauth:2.0:oob"
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
            message = f"Token exchange failed ({token_resp.status_code}): {detail}"
            if browser_callback:
                html = _calendar_auth_html(False, message)
                return Response(html, mimetype="text/html"), 400
            return jsonify({"error": message}), 400

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

        log.info(f"[calendar] Exchanging auth code: {code[:20]}...")
        _calendar_write_token_file(token_path, creds.to_json())

        # Reset calendar service to pick up new token
        if calendar:
            calendar._service = None
            calendar._cache = []

            # Verify token immediately so status flips from DOWN as soon as possible.
            try:
                calendar.get_next_event()
            except Exception as calendar_err:
                message = (
                    "Token saved but calendar validation failed: "
                    f"{calendar_err}"
                )
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
        log.exception(f"[calendar] Auth failed")
        if browser_callback:
            html = _calendar_auth_html(False, str(e))
            return Response(html, mimetype="text/html"), 500
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


# ── Camera API ───────────────────────────────────────────────────────

@app.route("/api/camera/stream")
def api_camera_stream():
    return Response(
        camera.generate_mjpeg(),
        mimetype="multipart/x-mixed-replace; boundary=frame",
    )


@app.route("/api/camera/snapshot", methods=["POST"])
def api_camera_snapshot():
    path = camera.take_snapshot()
    return jsonify({"path": path})


@app.route("/api/camera/describe", methods=["POST"])
def api_camera_describe():
    data = request.json or {}
    prompt = data.get("prompt", "What do you see?")

    def _do_describe():
        log.info("[vision] Starting describe thread...")
        try:
            description = camera.describe_scene(prompt)
            log.info(f"[vision] Got: {description[:80]}...")
        except Exception as e:
            import traceback
            log.info(f"[vision] Error: {e}")
            traceback.print_exc()
            description = "Gemini vision failed or you are offline"
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
    data = request.json or {}
    if data.get("enabled", True):
        camera.start_motion_detection()
    else:
        camera.stop_motion_detection()
    return jsonify({"ok": True})


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
        log.info(f"[bmo] api error: {e!r}")
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


# ── Discord DM Bot Bridge API ─────────────────────────────────────

@app.route("/api/discord/dm/start", methods=["POST"])
def api_discord_dm_start():
    """Tell the DM bot to start a session (join Dungeon VC)."""
    data = request.json or {}
    campaign_id = data.get("campaign_id", "vtt_campaign")

    try:
        from bots.discord_dm_bot import get_dm_bot
        bot = get_dm_bot()
        if not bot:
            return jsonify({"error": "DM bot not running"}), 503

        if bot.session.active:
            return jsonify({"error": "Session already active"}), 409

        # Find guild and dungeon channel, then start session via asyncio
        import asyncio

        async def _start():
            for guild in bot.guilds:
                channel = await bot.find_dungeon_channel(guild)
                if channel:
                    vc = await bot.join_voice(channel)
                    if vc:
                        bot.session.active = True
                        bot.session.text_channel_id = None
                        from datetime import datetime, timezone
                        bot.session.start_time = datetime.now(timezone.utc)
                        bot.session.messages.clear()
                        bot.session.combat_log.clear()

                        if bot._campaign_memory:
                            bot._campaign_name = campaign_id
                            bot._session_id = bot._campaign_memory.start_session(campaign_id)

                        for member in channel.members:
                            if not member.bot:
                                bot.session.players.add(member.display_name)

                        await bot.start_voice_listen()

                        greeting = "BMO is ready to be your Dungeon Master! The adventure begins!"
                        await bot._speak(greeting, emotion="excited")
                        return True
            return False

        future = asyncio.run_coroutine_threadsafe(_start(), bot.loop)
        result = future.result(timeout=15)

        if result:
            return jsonify({"ok": True, "campaign_id": campaign_id})
        return jsonify({"error": "Could not find Dungeon voice channel"}), 404

    except Exception as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/discord/dm/stop", methods=["POST"])
def api_discord_dm_stop():
    """Tell the DM bot to stop the session."""
    try:
        from bots.discord_dm_bot import get_dm_bot
        bot = get_dm_bot()
        if not bot or not bot.session.active:
            return jsonify({"error": "No active session"}), 404

        import asyncio

        async def _stop():
            from bots.discord_dm_bot import _generate_recap
            recap = await _generate_recap(bot.session)

            if bot._campaign_memory and bot._session_id and recap:
                bot._campaign_memory.end_session(bot._session_id, recap)

            farewell = "The adventure concludes for now. Until next time, friends!"
            await bot._speak(farewell, emotion="happy")

            vc = bot.session.voice_client
            if vc and vc.is_connected():
                while vc.is_playing():
                    await asyncio.sleep(0.1)

            await bot.leave_voice()
            bot.session.reset()
            bot._campaign_name = None
            bot._session_id = None
            return recap

        future = asyncio.run_coroutine_threadsafe(_stop(), bot.loop)
        recap = future.result(timeout=30)

        return jsonify({"ok": True, "recap": recap or ""})

    except Exception as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/discord/dm/narrate", methods=["POST"])
@limiter.limit(RATE_LIMIT_NARRATE)
def api_discord_dm_narrate():
    """Forward narration text to the DM bot for TTS in Discord VC."""
    data = request.json or {}
    text = data.get("text", "")
    npc = data.get("npc")
    emotion = data.get("emotion")

    if not text:
        return jsonify({"error": "No text provided"}), 400

    try:
        from bots.discord_dm_bot import get_dm_bot
        bot = get_dm_bot()
        if not bot or not bot.session.active:
            return jsonify({"error": "No active DM session"}), 404

        import asyncio
        future = asyncio.run_coroutine_threadsafe(
            bot._speak(text, npc=npc, emotion=emotion), bot.loop
        )
        future.result(timeout=15)
        return jsonify({"ok": True})

    except Exception as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/discord/dm/status")
def api_discord_dm_status():
    """Get the current DM bot session status."""
    try:
        from bots.discord_dm_bot import get_dm_bot
        bot = get_dm_bot()
        if not bot:
            return jsonify({"running": False, "active": False})

        session = bot.session
        status = {
            "running": True,
            "active": session.active,
            "players": sorted(session.players) if session.players else [],
            "start_time": session.start_time.isoformat() if session.start_time else None,
            "message_count": len(session.messages),
            "combat_log_count": len(session.combat_log),
            "initiative_round": session.initiative_round,
        }
        return jsonify(status)

    except Exception as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


# ── Volume API ───────────────────────────────────────────────────────

def _get_system_volume() -> int:
    """Read PipeWire system volume as 0-100 integer."""
    try:
        import subprocess
        env = os.environ.copy()
        env["XDG_RUNTIME_DIR"] = "/run/user/1000"
        r = subprocess.run(["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"],
                           capture_output=True, text=True, timeout=5, env=env)
        # Output: "Volume: 0.25" or "Volume: 0.25 [MUTED]"
        parts = r.stdout.strip().split()
        if len(parts) >= 2:
            return int(float(parts[1]) * 100)
    except Exception:
        pass
    return _load_setting("volume.system", 25)


def _set_system_volume(level: int):
    """Set PipeWire system volume (0-100)."""
    try:
        import subprocess
        env = os.environ.copy()
        env["XDG_RUNTIME_DIR"] = "/run/user/1000"
        vol = max(0.0, min(1.5, level / 100.0))  # allow up to 150% for extra headroom
        subprocess.run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", str(vol)],
                       capture_output=True, timeout=5, env=env)
    except Exception as e:
        log.exception(f"[volume] Failed to set system volume")


@app.route("/api/volume")
def api_volume_get():
    """Get all volume levels."""
    music_vol = _load_setting("volume.music", 50)
    if music:
        try:
            live_vol = music._player.audio_get_volume() if music._player else -1
            if live_vol > 0:
                music_vol = live_vol
        except Exception:
            pass
    alarm_vol = timers.alarm_volume if timers and timers.alarm_volume is not None else _load_setting("volume.alarms", 80)
    return jsonify({
        "system": _get_system_volume(),
        "music": music_vol,
        "voice": getattr(voice, "_speak_volume", 80) if voice else 80,
        "effects": _load_setting("volume.effects", 80),
        "notifications": _load_setting("volume.notifications", 80),
        "alarms": alarm_vol,
    })


@app.route("/api/volume", methods=["POST"])
def api_volume_set():
    """Set volume for a specific category."""
    data = request.json or {}
    category = data.get("category", "")
    max_level = 150 if category == "system" else 100
    level = max(0, min(max_level, data.get("level", 50)))

    if category == "system":
        _set_system_volume(level)
    elif category == "music" and music:
        music.set_volume(level)
    elif category == "voice" and voice:
        voice._speak_volume = level
    elif category == "effects":
        pass  # Sound effects volume applied at play time
    elif category == "notifications":
        pass  # Notification volume applied at announce time
    elif category == "alarms" and timers:
        timers.alarm_volume = level
    else:
        return jsonify({"ok": False, "error": f"Unknown category: {category}"})

    _save_setting(f"volume.{category}", level)
    socketio.emit("volume_update", {"category": category, "level": level})
    return jsonify({"ok": True, "category": category, "level": level})


# ── Audio Output API ─────────────────────────────────────────────────

@app.route("/api/audio/devices")
def api_audio_devices():
    """List active audio output devices."""
    if not audio_service:
        return jsonify({"error": "Audio service not available"}), 503
    sinks = audio_service.list_sinks()
    return jsonify({"devices": [s.to_dict() for s in sinks]})


@app.route("/api/audio/status")
def api_audio_status():
    """Full audio status: devices, routing, bluetooth."""
    if not audio_service:
        return jsonify({"error": "Audio service not available"}), 503
    return jsonify(audio_service.get_status())


@app.route("/api/audio/output", methods=["POST"])
def api_audio_set_output():
    """Set audio output for a function or all. Body: {function, device_id}."""
    if not audio_service:
        return jsonify({"error": "Audio service not available"}), 503
    data = request.json or {}
    function = data.get("function", "all")
    device_id = data.get("device_id")
    if device_id is None:
        return jsonify({"error": "device_id required"}), 400
    ok = audio_service.set_function_output(function, int(device_id))
    if ok:
        socketio.emit("audio_routing_update", audio_service.get_all_routing())
    return jsonify({"ok": ok})


@app.route("/api/audio/inputs")
def api_audio_inputs():
    """List active audio input devices (sources)."""
    if not audio_service:
        return jsonify({"error": "Audio service not available"}), 503
    sources = audio_service.list_sources()
    return jsonify({"sources": [s.to_dict() for s in sources]})


@app.route("/api/audio/input", methods=["POST"])
def api_audio_set_input():
    """Set the default audio input device. Body: {device_id}."""
    if not audio_service:
        return jsonify({"error": "Audio service not available"}), 503
    device_id = (request.json or {}).get("device_id")
    if device_id is None:
        return jsonify({"error": "device_id required"}), 400
    ok = audio_service.set_default_input(int(device_id))
    return jsonify({"ok": ok})


@app.route("/api/audio/bluetooth/scan", methods=["POST"])
def api_audio_bt_scan():
    """Scan for Bluetooth devices. Returns immediately, emits results via socket."""
    if not audio_service:
        return jsonify({"error": "Audio service not available"}), 503
    duration = (request.get_json(silent=True) or {}).get("duration", 10)

    def _scan():
        devices = audio_service.bluetooth_scan(duration=duration)
        socketio.emit("bt_scan_result", {"devices": devices})

    threading.Thread(target=_scan, daemon=True).start()
    return jsonify({"ok": True, "message": "Scanning..."})


@app.route("/api/audio/bluetooth/pair", methods=["POST"])
def api_audio_bt_pair():
    """Pair + connect Bluetooth device. Body: {address: "XX:XX:..."}."""
    if not audio_service:
        return jsonify({"error": "Audio service not available"}), 503
    data = request.get_json(force=True, silent=True) or {}
    address = data.get("address")
    if not address:
        return jsonify({"error": "address required"}), 400
    ok, msg = audio_service.bluetooth_pair(address)
    return jsonify({"ok": ok, "message": msg})


@app.route("/api/audio/bluetooth/disconnect", methods=["POST"])
def api_audio_bt_disconnect():
    """Disconnect a Bluetooth device. Body: {address: "XX:XX:..."}."""
    if not audio_service:
        return jsonify({"error": "Audio service not available"}), 503
    data = request.get_json(force=True, silent=True) or {}
    address = data.get("address")
    if not address:
        return jsonify({"error": "address required"}), 400
    ok, msg = audio_service.bluetooth_disconnect(address)
    return jsonify({"ok": ok, "message": msg})


# Global TTS output setting: "pi" (local ffplay) or "browser" (serve to web client)
_tts_output = "pi"
# Queue of TTS audio files waiting to be played in browser
_tts_browser_queue: list[str] = []


@app.route("/api/tts/output", methods=["GET"])
def api_tts_output_get():
    """Get current TTS output target."""
    return jsonify({"output": _tts_output})


@app.route("/api/tts/output", methods=["POST"])
def api_tts_output_set():
    """Set TTS output target. Body: {output: "pi" | "browser"}."""
    global _tts_output
    data = request.json or {}
    output = data.get("output", "pi")
    if output not in ("pi", "browser"):
        return jsonify({"error": "Invalid output, must be 'pi' or 'browser'"}), 400
    _tts_output = output
    # Update voice pipeline's output mode
    if voice:
        voice._tts_output_mode = output
    log.info(f"[tts] Output set to: {output}")
    return jsonify({"ok": True, "output": output})


@app.route("/api/tts/audio/<path:filename>")
def api_tts_audio_file(filename):
    """Serve a TTS audio file for browser playback."""
    import tempfile
    tts_dir = tempfile.gettempdir()
    return send_from_directory(tts_dir, filename)


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
    log.info(f"[scene-api] Activating scene: {name}")

    def _do_activate():
        try:
            scene_service.activate(name)
        except Exception as e:
            log.exception(f"[scene-api] Activate failed")
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
        except Exception as e:
            log.exception(f"[scene-api] Deactivate failed")
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
        log.info(f"[bmo] api error: {e!r}")
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
        log.info(f"[bmo] api error: {e!r}")
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
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


def _load_setting(key: str, default=None):
    """Load a dotted key from data/settings.json."""
    try:
        settings_path = os.path.join(os.path.dirname(__file__), "data", "settings.json")
        if os.path.exists(settings_path):
            with open(settings_path, "r") as f:
                settings = json.load(f)
            parts = key.split(".")
            obj = settings
            for part in parts:
                obj = obj.get(part, {})
            return obj if obj != {} else default
    except Exception:
        pass
    return default


def _save_setting(key: str, value):
    """Save a dotted key to data/settings.json."""
    try:
        settings_path = os.path.join(os.path.dirname(__file__), "data", "settings.json")
        os.makedirs(os.path.dirname(settings_path), exist_ok=True)
        settings = {}
        if os.path.exists(settings_path):
            with open(settings_path, "r", encoding="utf-8") as f:
                settings = json.load(f)
        parts = key.split(".")
        obj = settings
        for part in parts[:-1]:
            obj = obj.setdefault(part, {})
        obj[parts[-1]] = value
        with open(settings_path, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
    except Exception as e:
        log.exception(f"[settings] Save failed for {key}")


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
            updated.get("location_label", ""),
            updated.get("accuracy_m", "n/a"),
            remote_addr or "?",
            user_agent[:120],
        )
        return jsonify(updated)
    except (TypeError, ValueError, KeyError) as exc:
        keys = ",".join(sorted(data.keys())) if isinstance(data, dict) else "n/a"
        log.warning(
            "[location] Device update rejected: %s keys=%s from=%s ua=%s",
            str(exc),
            keys,
            remote_addr or "?",
            user_agent[:120],
        )
        return jsonify({"error": "Invalid location payload", "detail": str(exc)}), 400


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
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/devices/<device_name>/pause", methods=["POST"])
def api_device_pause(device_name):
    if not smart_home:
        return jsonify({"error": "Smart home not available"}), 503
    try:
        smart_home.pause(device_name)
        return jsonify({"ok": True})
    except Exception as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/devices/<device_name>/stop", methods=["POST"])
def api_device_stop(device_name):
    if not smart_home:
        return jsonify({"error": "Smart home not available"}), 503
    try:
        smart_home.stop(device_name)
        return jsonify({"ok": True})
    except Exception as e:
        log.info(f"[bmo] api error: {e!r}")
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
        log.info(f"[bmo] api error: {e!r}")
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
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/devices/<device_name>/quit", methods=["POST"])
def api_device_quit(device_name):
    if not smart_home:
        return jsonify({"error": "Smart home not available"}), 503
    try:
        smart_home.quit_app(device_name)
        return jsonify({"ok": True})
    except Exception as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/devices/refresh", methods=["POST"])
def api_devices_refresh():
    if not smart_home:
        return jsonify({"error": "Smart home not available"}), 503
    try:
        smart_home.start_discovery()
        return jsonify({"ok": True})
    except Exception as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


# ── Chat Persistence ─────────────────────────────────────────────────

# Recent chat buffer — kept in memory, served to frontend on refresh
RECENT_CHAT_FILE = os.path.expanduser("~/home-lab/bmo/pi/data/recent_chat.json")
_MAX_RECENT = 200  # Rolling buffer of recent messages

# DnD session log — permanently saved to its own file
DND_LOG_DIR = os.path.expanduser("~/home-lab/bmo/pi/data/dnd_sessions")


def _load_recent_chat() -> list[dict]:
    """Load the recent chat buffer from disk."""
    try:
        if os.path.exists(RECENT_CHAT_FILE):
            with open(RECENT_CHAT_FILE, encoding="utf-8") as f:
                return json.load(f)
    except Exception as e:
        log.exception(f"[chat] Failed to load recent chat")
    return []


# (moved to state.STATE.chat_lock)

def _save_recent_message(msg: dict):
    """Append a message to the recent chat buffer (rolling, all chats)."""
    with STATE.chat_lock:
        try:
            messages = _load_recent_chat()
            messages.append(msg)
            if len(messages) > _MAX_RECENT:
                messages = messages[-_MAX_RECENT:]
            os.makedirs(os.path.dirname(RECENT_CHAT_FILE), exist_ok=True)
            with open(RECENT_CHAT_FILE, "w", encoding="utf-8") as f:
                json.dump(messages, f, ensure_ascii=False)
        except Exception as e:
            log.exception(f"[chat] Failed to save recent chat")


def _save_dnd_message(msg: dict):
    """Append a message to the permanent DnD session log."""
    os.makedirs(DND_LOG_DIR, exist_ok=True)
    # One file per day so sessions are easy to find
    date_str = time.strftime("%Y-%m-%d")
    log_file = os.path.join(DND_LOG_DIR, f"session_{date_str}.json")
    messages = []
    try:
        if os.path.exists(log_file):
            with open(log_file, encoding="utf-8") as f:
                messages = json.load(f)
    except Exception:
        messages = []
    messages.append(msg)
    with open(log_file, "w", encoding="utf-8") as f:
        json.dump(messages, f, ensure_ascii=False)


def _save_chat_message(msg: dict):
    """Save a chat message — always to recent buffer, also to DnD log if in DM mode."""
    _save_recent_message(msg)
    if agent and agent._dnd_context:
        _save_dnd_message(msg)


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
    except Exception as e:
        log.exception(f"[chat] Auto-resume failed")


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


@app.route("/api/chat/history")
def api_chat_history():
    """Return recent chat messages for the frontend to restore on refresh."""
    messages = _load_recent_chat()
    return jsonify(messages)


@app.route("/api/chat/clear", methods=["POST"])
def api_chat_clear():
    """Clear chat. If a DnD session is active, save it to the permanent log first."""
    dnd_was_active = agent and agent._dnd_context is not None

    # If DnD session was active, save the full conversation to the session log
    if dnd_was_active:
        try:
            recent = _load_recent_chat()
            if recent:
                # Write the full session as one batch (avoids duplicates from per-message saves)
                os.makedirs(DND_LOG_DIR, exist_ok=True)
                date_str = time.strftime("%Y-%m-%d")
                log_file = os.path.join(DND_LOG_DIR, f"session_{date_str}.json")
                # Merge with any existing messages for today
                existing = []
                try:
                    if os.path.exists(log_file):
                        with open(log_file, encoding="utf-8") as f:
                            existing = json.load(f)
                except Exception:
                    pass
                # Deduplicate by timestamp
                existing_ts = {m.get("ts") for m in existing if m.get("ts")}
                new_msgs = [m for m in recent if m.get("ts") not in existing_ts]
                combined = existing + new_msgs
                with open(log_file, "w", encoding="utf-8") as f:
                    json.dump(combined, f, ensure_ascii=False)
                log.info(f"[chat] Saved {len(new_msgs)} new messages to DnD session log")
        except Exception as e:
            log.exception(f"[chat] Failed to save DnD session on clear")

    # Clear the recent chat buffer
    try:
        if os.path.exists(RECENT_CHAT_FILE):
            os.remove(RECENT_CHAT_FILE)
    except Exception:
        pass

    # Save game state alongside session log if DnD was active
    if dnd_was_active and agent and agent._gamestate:
        try:
            date_str = time.strftime("%Y-%m-%d")
            gs_file = os.path.join(DND_LOG_DIR, f"gamestate_{date_str}.json")
            os.makedirs(DND_LOG_DIR, exist_ok=True)
            with open(gs_file, "w", encoding="utf-8") as f:
                json.dump(agent._gamestate, f, ensure_ascii=False, indent=2)
            log.info(f"[chat] Saved game state to {gs_file}")
        except Exception as e:
            log.exception(f"[chat] Failed to save game state on clear")

    # Reset agent state
    if agent:
        agent.conversation_history.clear()
        agent._dnd_context = None
        agent._dnd_pending = None
        agent._gamestate = None

    return jsonify({"ok": True, "dnd_saved": dnd_was_active})


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
    data = request.json or {}
    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "No text provided"}), 400
    note = {
        "id": str(int(time.time() * 1000)),
        "text": text,
        "done": False,
        "created": time.time(),
    }
    with STATE.notes_lock:
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


# ── TV Remote API ────────────────────────────────────────────────────

_tv_remote = None
_tv_is_on = True  # Track TV power state
_tv_loop = None
_tv_pairing_remote = None

TV_IP = os.environ.get("BMO_TV_HOST", "10.10.20.194").strip() or "10.10.20.194"
_TV_CERT_DIR = os.path.dirname(os.path.abspath(__file__))
_TV_CERTFILE = os.path.join(_TV_CERT_DIR, "tv_cert.pem")
_TV_KEYFILE = os.path.join(_TV_CERT_DIR, "tv_key.pem")

TV_KEYS = {
    "up": "DPAD_UP", "down": "DPAD_DOWN", "left": "DPAD_LEFT", "right": "DPAD_RIGHT",
    "select": "DPAD_CENTER", "enter": "DPAD_CENTER", "back": "BACK", "home": "HOME",
    "play_pause": "MEDIA_PLAY_PAUSE", "play": "MEDIA_PLAY", "pause": "MEDIA_PAUSE",
    "rewind": "MEDIA_REWIND", "fast_forward": "MEDIA_FAST_FORWARD",
    "previous": "MEDIA_PREVIOUS", "next": "MEDIA_NEXT",
    "forward": "MEDIA_NEXT",  # alias
    "power": "POWER", "volume_up": "VOLUME_UP", "volume_down": "VOLUME_DOWN", "mute": "VOLUME_MUTE",
    "input": "TV_INPUT", "settings": "SETTINGS",
}

TV_APPS = {
    "youtube": "vnd.youtube://",
    "netflix": "netflix://",
    "prime": "https://app.primevideo.com",
    "crunchyroll": "crunchyroll://",
    "twitch": "twitch://",
    "plex": "plex://",
}


_tv_loop = None
_tv_loop_thread = None

# Path to the standalone TV worker script (runs outside gevent)
_TV_WORKER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tv_worker.py")
_TV_PYTHON = os.path.join(os.path.dirname(os.path.abspath(__file__)), "venv", "bin", "python3")
_tv_proc = None
# (moved to state.STATE.tv_proc_lock)


def _ensure_tv_worker():
    """Start the long-lived TV worker subprocess if not running."""
    global _tv_proc
    with STATE.tv_proc_lock:
        if _tv_proc is not None and _tv_proc.poll() is None:
            return True
        try:
            config = json.dumps({
                "certfile": _TV_CERTFILE,
                "keyfile": _TV_KEYFILE,
                "host": TV_IP,
            })
            _tv_proc = subprocess.Popen(
                [_TV_PYTHON, _TV_WORKER, config],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
            return True
        except Exception as e:
            log.exception(f"[tv] Failed to start worker")
            _tv_proc = None
            return False


def _tv_cmd(action, **kwargs):
    """Send a command to the long-lived TV worker and get the response."""
    global _tv_proc
    if not _ensure_tv_worker():
        return {"error": "TV worker not running"}
    cmd_data = {"action": action, **kwargs}
    try:
        with STATE.tv_proc_lock:
            if _tv_proc is None or _tv_proc.poll() is not None:
                _tv_proc = None
                if not _ensure_tv_worker():
                    return {"error": "TV worker died"}
            _tv_proc.stdin.write(json.dumps(cmd_data) + "\n")
            _tv_proc.stdin.flush()
            line = _tv_proc.stdout.readline().strip()
            if line:
                return json.loads(line)
            return {"error": "TV worker returned empty response"}
    except (BrokenPipeError, OSError):
        _tv_proc = None
        return {"error": "TV worker connection lost"}
    except Exception as e:
        return {"error": str(e)}


def init_tv_remote():
    """Try to connect to TV using existing certs (persistent worker)."""
    global _tv_remote, _tv_is_on
    # Connect ADB for media title queries
    try:
        subprocess.run(
            ["adb", "connect", f"{TV_IP}:5555"],
            capture_output=True, timeout=5,
        )
        log.info(f"[tv] ADB connected to {TV_IP}:5555")
    except Exception as e:
        log.exception(f"[tv] ADB connect failed")

    if not os.path.exists(_TV_CERTFILE) or not os.path.exists(_TV_KEYFILE):
        log.info("[tv] No cert files found — pair via the TV tab first")
        return

    if not _ensure_tv_worker():
        log.info("[tv] Could not start TV worker")
        return

    result = _tv_cmd("connect_test")
    if result.get("ok"):
        _tv_remote = True
        _tv_is_on = result.get("is_on")
        log.info(f"[tv] Connected to TV at {TV_IP} (is_on={_tv_is_on})")
    else:
        log.info(f"[tv] Connection failed: {result.get('error', '?')} — try pairing via the TV tab")

    # Background task: retry TV connection every 60s if not connected
    def _tv_bg_reconnect():
        global _tv_remote, _tv_is_on
        import time as _time
        while True:
            _time.sleep(60)
            if _tv_remote is None:
                try:
                    r = _tv_cmd("connect_test")
                    if r.get("ok"):
                        _tv_remote = True
                        _tv_is_on = r.get("is_on")
                        log.info(f"[tv] Background reconnect OK — {TV_IP}")
                except Exception:
                    pass
    threading.Thread(target=_tv_bg_reconnect, daemon=True).start()



# STATE.tv_media_cache, STATE.tv_media_lock — moved to state.STATE.tv_media_cache / state.STATE.tv_media_lock


def _parse_media_description(desc: str) -> tuple[str, str]:
    """Parse media_session description field: 'title, artist, album'.

    The description format is 3 comma-separated fields (title, subtitle, description).
    Trailing 'null' or empty fields are stripped first, then we split from the RIGHT
    to avoid breaking titles that contain commas (e.g. 'Training, Part 1').
    """
    # Strip trailing null/empty fields from right
    # e.g. "Make It! Training, Part 1, null, " -> "Make It! Training, Part 1"
    while desc.endswith(", ") or desc.endswith(","):
        desc = desc.rstrip(", ").rstrip(",")
    parts = [p.strip() for p in desc.rsplit(", ", 2)]
    # Filter nulls
    parts = [p if p != "null" else "" for p in parts]
    if len(parts) == 3:
        return parts[0], parts[1]  # title, artist (ignore album/description)
    elif len(parts) == 2:
        return parts[0], parts[1]
    elif len(parts) == 1:
        return parts[0], ""
    return "", ""


def _get_tv_media_title(current_app: str = "") -> dict:
    """Query ADB for currently playing media title. Cached for 3s.

    Only returns media info if the media session belongs to the current
    foreground app. Stale sessions from background apps are ignored.
    """
    now = time.time()
    with STATE.tv_media_lock:
        if now - STATE.tv_media_cache["ts"] < 3:
            return {"title": STATE.tv_media_cache["title"], "artist": STATE.tv_media_cache["artist"]}
    try:
        # Get media_session: package, state, and description for each session
        r = subprocess.run(
            ["adb", "-s", f"{TV_IP}:5555", "shell",
             "dumpsys media_session | grep -E 'package=|state=PlaybackState|description='"],
            capture_output=True, text=True, timeout=3,
        )
        lines = r.stdout.strip().split("\n")
        pkg = ""
        is_playing = False
        session_title = ""
        session_artist = ""
        matched = False
        for line in lines:
            line = line.strip()
            if line.startswith("package="):
                pkg = line.split("=", 1)[1].strip()
                is_playing = False
            elif "state=PlaybackState" in line:
                is_playing = "state=3" in line or "state=2" in line
            elif "description=" in line and is_playing:
                # Only use this session if it belongs to the foreground app
                if current_app and pkg != current_app:
                    is_playing = False
                    continue
                desc = line.split("description=", 1)[1].strip()
                session_title, session_artist = _parse_media_description(desc)
                matched = True
                break

        if not matched:
            # No active playback from the foreground app — clear stale titles
            with STATE.tv_media_lock:
                STATE.tv_media_cache.update({"title": "", "artist": "", "app": "", "ts": now})
            return {"title": "", "artist": ""}

        # Got a title from media_session description
        if session_title:
            with STATE.tv_media_lock:
                STATE.tv_media_cache.update({"title": session_title, "artist": session_artist, "app": pkg, "ts": now})
            return {"title": session_title, "artist": session_artist}

        # Null description (Plex does this) — try notification for this specific app
        if pkg:
            try:
                r2 = subprocess.run(
                    ["adb", "-s", f"{TV_IP}:5555", "shell",
                     "dumpsys notification --noredact | grep -E "
                     f"'pkg={pkg}|android\\.title=|android\\.text='"],
                    capture_output=True, text=True, timeout=3,
                )
                lines2 = r2.stdout.strip().split("\n")
                in_app = False
                notif_title = ""
                for line2 in lines2:
                    line2 = line2.strip()
                    if f"pkg={pkg}" in line2:
                        in_app = True
                        notif_title = ""
                    elif in_app and "android.title=" in line2:
                        m = line2.split("(", 1)
                        if len(m) > 1:
                            notif_title = m[1].rstrip(")")
                    elif in_app and "android.text=" in line2:
                        notif_text = ""
                        m = line2.split("(", 1)
                        if len(m) > 1:
                            notif_text = m[1].rstrip(")")
                        if notif_title and notif_title != "null":
                            artist = notif_text if notif_text and notif_text != "null" else ""
                            with STATE.tv_media_lock:
                                STATE.tv_media_cache.update({"title": notif_title, "artist": artist, "app": pkg, "ts": now})
                            return {"title": notif_title, "artist": artist}
                        in_app = False
            except Exception:
                pass

        # Active playback but no title found — keep cached if same app, else clear
        with STATE.tv_media_lock:
            if pkg == STATE.tv_media_cache.get("app"):
                STATE.tv_media_cache["ts"] = now
            else:
                STATE.tv_media_cache.update({"title": "", "artist": "", "app": pkg, "ts": now})
    except Exception:
        pass
    with STATE.tv_media_lock:
        return {"title": STATE.tv_media_cache["title"], "artist": STATE.tv_media_cache["artist"]}


@app.route("/api/tv/status")
def api_tv_status():
    connected = _tv_remote is not None
    needs_pairing = not os.path.exists(_TV_CERTFILE)
    # Quick connect test if we think we're connected
    current_app = ""
    volume_level = -1
    if connected:
        r = _tv_cmd("connect_test")
        if r.get("ok"):
            current_app = r.get("current_app", "")
            volume_level = r.get("volume_level", -1)
        else:
            connected = False
    # Get media title via ADB
    media = _get_tv_media_title(current_app) if connected else {"title": "", "artist": ""}
    return jsonify({
        "connected": connected,
        "current_app": current_app,
        "volume_level": volume_level,
        "media_title": media["title"],
        "media_artist": media["artist"],
        "needs_pairing": needs_pairing,
    })


@app.route("/api/tv/pair/start", methods=["POST"])
def api_tv_pair_start():
    """Start pairing — TV will show a PIN code."""
    result = _tv_cmd("pair_start")
    if result.get("error"):
        log.info(f"[tv] Pairing start failed: {result['error']}")
        return jsonify(result), 500
    log.info("[tv] Pairing started — TV should show PIN")
    return jsonify(result)


@app.route("/api/tv/pair/finish", methods=["POST"])
def api_tv_pair_finish():
    """Finish pairing with the PIN shown on TV, then connect."""
    global _tv_remote
    data = request.json or {}
    pin = data.get("pin", "")
    if not pin:
        return jsonify({"error": "No PIN provided"}), 400

    result = _tv_cmd("pair_finish", pin=pin)
    if result.get("error"):
        log.info(f"[tv] Pairing finish failed: {result['error']}")
        return jsonify(result), 500
    _tv_remote = True
    log.info(f"[tv] Paired and connected to TV at {TV_IP}!")
    return jsonify(result)


@app.route("/api/tv/key", methods=["POST"])
def api_tv_key():
    data = request.json or {}
    key = data.get("key", "")
    mapped = TV_KEYS.get(key, key)
    if not os.path.exists(_TV_CERTFILE):
        return jsonify({"error": "TV not paired — pair first"}), 503
    result = _tv_cmd("send_key", key=mapped)
    if result.get("error"):
        return jsonify(result), 500
    return jsonify(result)


@app.route("/api/tv/launch", methods=["POST"])
def api_tv_launch():
    data = request.json or {}
    app_name = data.get("app", "")
    url = TV_APPS.get(app_name, "")
    if not url:
        return jsonify({"error": f"Unknown app: {app_name}"}), 400
    if not os.path.exists(_TV_CERTFILE):
        return jsonify({"error": "TV not paired — pair first"}), 503
    result = _tv_cmd("launch_app", uri=url)
    if result.get("error"):
        return jsonify(result), 500
    return jsonify(result)


@app.route("/api/tv/volume", methods=["POST"])
def api_tv_volume():
    data = request.json or {}
    level = data.get("level")
    direction = data.get("direction", "up")
    if not os.path.exists(_TV_CERTFILE):
        return jsonify({"error": "TV not paired — pair first"}), 503
    if level is not None:
        # Volume level setting: send multiple volume key presses
        key = "VOLUME_UP" if level > 50 else "VOLUME_DOWN"
        result = _tv_cmd("send_key", key=key)
        return jsonify(result) if not result.get("error") else (jsonify(result), 500)
    else:
        key_map = {"up": "VOLUME_UP", "down": "VOLUME_DOWN", "mute": "VOLUME_MUTE"}
        key = key_map.get(direction, "VOLUME_UP")
        result = _tv_cmd("send_key", key=key)
        return jsonify(result) if not result.get("error") else (jsonify(result), 500)


@app.route("/api/tv/power", methods=["POST"])
def api_tv_power():
    if not os.path.exists(_TV_CERTFILE):
        return jsonify({"error": "TV not paired — pair first"}), 503
    data = request.json or {}
    state = data.get("state", "toggle")

    if state == "on":
        # Check if TV is already on to avoid toggling it off
        status = _tv_cmd("status")
        if status.get("is_on") is True:
            return jsonify({"ok": True, "message": "TV already on"})
    elif state == "off":
        # Check if TV is already off to avoid toggling it on
        status = _tv_cmd("status")
        if status.get("is_on") is False:
            return jsonify({"ok": True, "message": "TV already off"})

    result = _tv_cmd("send_key", key="POWER")
    return jsonify(result) if not result.get("error") else (jsonify(result), 500)


_HDMI1_URI = ("content://android.media.tv/passthrough/"
              "com.realtek.tv.passthrough/.hdmiinput.HDMITvInputService/HW151519232")


@app.route("/api/tv/input", methods=["POST"])
def api_tv_input():
    """Switch TV to HDMI 1 via Live TV passthrough URI."""
    try:
        subprocess.run(
            [
                "adb",
                "-s",
                f"{TV_IP}:5555",
                "shell",
                "am",
                "force-stop",
                "com.android.tv",
            ],
            shell=False,
            capture_output=True,
            text=True,
            timeout=5,
        )
        time.sleep(1)
        r = subprocess.run(
            [
                "adb",
                "-s",
                f"{TV_IP}:5555",
                "shell",
                "am",
                "start",
                "-a",
                "android.intent.action.VIEW",
                "-d",
                "content://android.media.tv/passthrough/com.realtek.tv.passthrough%2F"
                ".hdmiinput.HDMITvInputService%2FHW151519232",
                "-n",
                "com.android.tv/.MainActivity",
                "-f",
                "0x10020000",
                "--ei",
                "from_launcher",
                "1",
            ],
            shell=False,
            capture_output=True,
            text=True,
            timeout=10,
        )
        if r.returncode == 0:
            return jsonify({"ok": True})
        return jsonify({"error": f"ADB failed: {r.stderr.strip()}"}), 500
    except Exception as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@app.route("/api/tv/navigate", methods=["POST"])
def api_tv_navigate():
    """D-pad navigation: up, down, left, right, select, back, home."""
    data = request.json or {}
    direction = data.get("direction", "select")
    mapped = TV_KEYS.get(direction, direction)
    if not os.path.exists(_TV_CERTFILE):
        return jsonify({"error": "TV not paired — pair first"}), 503
    result = _tv_cmd("send_key", key=mapped)
    return jsonify(result) if not result.get("error") else (jsonify(result), 500)


@app.route("/api/tv/mute", methods=["POST"])
def api_tv_mute():
    """Toggle mute."""
    if not os.path.exists(_TV_CERTFILE):
        return jsonify({"error": "TV not paired — pair first"}), 503
    result = _tv_cmd("send_key", key="VOLUME_MUTE")
    return jsonify(result) if not result.get("error") else (jsonify(result), 500)


@app.route("/api/tv/apps")
def api_tv_apps():
    """List available TV apps."""
    return jsonify({"apps": list(TV_APPS.keys())})


# ── TV Auto-Skip ──────────────────────────────────────────────────────

_tv_auto_skip = False
_tv_auto_skip_thread = None


def _auto_skip_loop():
    """Background thread that periodically checks for skip buttons via ADB uiautomator."""
    global _tv_auto_skip
    while _tv_auto_skip:
        try:
            result = subprocess.run(
                ["adb", "shell", "uiautomator", "dump", "/dev/tty"],
                capture_output=True, text=True, timeout=5,
            )
            xml = result.stdout or ""
            # Look for common skip button patterns
            skip_match = re.search(
                r'text="(Skip|Skip Ad|Skip Ads|Skip Intro)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"',
                xml,
            )
            if skip_match:
                x1, y1, x2, y2 = int(skip_match.group(2)), int(skip_match.group(3)), int(skip_match.group(4)), int(skip_match.group(5))
                cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                subprocess.run(["adb", "shell", "input", "tap", str(cx), str(cy)], timeout=3)
                log.info(f"[tv-autoskip] Tapped skip button at ({cx}, {cy})")
        except Exception as e:
            log.exception(f"[tv-autoskip] Error")
        time.sleep(3)


@app.route("/api/tv/auto-skip", methods=["GET"])
def api_tv_auto_skip_get():
    """Get auto-skip state."""
    return jsonify({"enabled": _tv_auto_skip})


@app.route("/api/tv/auto-skip", methods=["POST"])
def api_tv_auto_skip_toggle():
    """Toggle auto-skip feature."""
    global _tv_auto_skip, _tv_auto_skip_thread
    _tv_auto_skip = not _tv_auto_skip
    if _tv_auto_skip:
        if _tv_auto_skip_thread is None or not _tv_auto_skip_thread.is_alive():
            _tv_auto_skip_thread = threading.Thread(target=_auto_skip_loop, daemon=True)
            _tv_auto_skip_thread.start()
            log.info("[tv-autoskip] Started auto-skip thread")
    else:
        log.info("[tv-autoskip] Stopped auto-skip")
    return jsonify({"enabled": _tv_auto_skip})


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
            log.info(f"[bmo] api error: {e!r}")
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


# ── Settings API ────────────────────────────────────────────────────

@app.route("/api/settings")
def api_settings():
    """Return full merged settings with secrets redacted."""
    from agents.settings import get_settings
    settings = get_settings()
    if not settings:
        return jsonify({"error": "Settings not initialized"}), 500
    return jsonify(settings.to_dict_redacted())


@app.route("/api/settings", methods=["POST"])
def api_settings_set():
    """Set a setting value. Body: {key, value, level?}."""
    from agents.settings import get_settings
    settings = get_settings()
    if not settings:
        return jsonify({"error": "Settings not initialized"}), 500

    data = request.json or {}
    key = data.get("key", "")
    value = data.get("value")
    level = data.get("level", "user")

    if not key:
        return jsonify({"error": "No key provided"}), 400

    settings.set(key, value, level=level)
    return jsonify({"success": True, "key": key, "value": value, "level": level})


@app.route("/api/settings/reload", methods=["POST"])
def api_settings_reload():
    """Force reload settings from disk."""
    from agents.settings import get_settings
    settings = get_settings()
    if not settings:
        return jsonify({"error": "Settings not initialized"}), 500
    settings.reload()
    return jsonify({"success": True})


@app.route("/api/config")
def api_config():
    """Expose non-secret config to the frontend (settings-backed)."""
    from agents.settings import get_settings
    settings = get_settings()
    if settings:
        maps_key = settings.get("services.maps_api_key", "")
    else:
        maps_key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    location = {}
    if location_service:
        location = location_service.get_location()
    return jsonify({"maps_api_key": maps_key, "location": location})


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


# ── Compact API ─────────────────────────────────────────────────────

@app.route("/api/chat/compact", methods=["POST"])
def api_chat_compact():
    """Compact conversation history."""
    if agent:
        msg = agent.compact()
        return jsonify({"success": True, "message": msg, "history_length": len(agent.conversation_history)})
    return jsonify({"error": "Agent not initialized"}), 500


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


# ── WebSocket Events ────────────────────────────────────────────────

def _bmo_websocket_authorized(auth: object | None) -> bool:
    """HTTP Bearer and/or Socket.IO `auth: { bmo_api_key: ... }` for non-local clients."""
    if not BMO_API_KEY:
        return True
    if _bmo_client_is_trusted_localhost():
        return True
    if (request.headers.get("Authorization", "") or "").strip() == f"Bearer {BMO_API_KEY}":
        return True
    if isinstance(auth, dict) and auth.get("bmo_api_key") == BMO_API_KEY:
        return True
    return False


@socketio.on("connect")
def on_connect(auth=None):
    if not _bmo_websocket_authorized(auth):
        log.info("[ws] Rejected: BMO_API_KEY required for this client")
        return False
    log.info("[ws] Client connected")
    client_tz = _normalize_timezone((auth or {}).get("client_timezone") if isinstance(auth, dict) else None) or _request_client_timezone(default_to_pi=True)
    if timers:
        timers.set_client_timezone(request.sid, client_tz)
    # Send initial state for available services — wrapped in try/except
    # so a failing service doesn't kill the WebSocket connection
    try:
        if weather:
            socketio.emit("weather_update", weather.get_current())
    except Exception as e:
        log.exception(f"[ws] Weather init failed")
    try:
        if music:
            socketio.emit("music_state", music.get_state())
    except Exception as e:
        log.exception(f"[ws] Music init failed")
    try:
        if timers:
            socketio.emit("timers_tick", timers.get_all(viewer_timezone=client_tz), room=request.sid)
    except Exception as e:
        log.exception(f"[ws] Timers init failed")
    try:
        if calendar:
            next_event = calendar.get_next_event()
            if next_event:
                socketio.emit("next_event", next_event)
    except Exception as e:
        log.exception(f"[ws] Calendar init failed")
    try:
        expr = oled_face.current_expression if oled_face else "idle"
        socketio.emit("expression", {"expression": expr})
    except Exception as e:
        log.exception(f"[ws] Expression init failed")
    try:
        if alert_service:
            recent = alert_service.get_history(5)
            if recent:
                socketio.emit("recent_alerts", recent)
    except Exception as e:
        log.exception(f"[ws] Alerts init failed")


def _finish_chat_response(sid, result, model_override, voice, speaker):
    """Emit chat_response and run TTS. Called from main handler or background thread."""
    from services.voice_pipeline import VoicePipeline

    raw_text = result.get("text", "").strip()
    agent_used = result.get("agent_used", "")
    if not raw_text:
        if agent_used == "code":
            raw_text = "The Code Agent looked into it but didn't produce a summary. Try asking again or rephrasing."
        else:
            raw_text = "Hmm, BMO doesn't know what to say about that."

    clean_text = VoicePipeline._strip_markdown(raw_text)

    # Detect likely truncated Code Agent response (ends mid-thought)
    if agent_used == "code" and len(clean_text) > 100:
        tail = clean_text[-120:].lower().rstrip()
        truncated = (
            tail.endswith(":") or
            tail.endswith("let me") or tail.endswith("i'll") or tail.endswith("i will") or
            tail.endswith("so ") or tail.endswith("then ") or tail.endswith("next,") or
            tail.endswith("to see") or tail.endswith("to check") or tail.endswith("if ")
        )
        if truncated:
            clean_text += "\n\n_Response may have been cut off — try asking again to continue._"
            result["incomplete"] = True

    result["text"] = clean_text

    assistant_msg = {"role": "assistant", "text": clean_text, "ts": time.time()}
    if agent_used:
        assistant_msg["agent_used"] = agent_used
    if model_override and model_override != "auto":
        assistant_msg["model"] = model_override
    _save_chat_message(assistant_msg)

    with app.app_context():
        # Code Agent: chat-only, no speak, no OLED expression changes
        if agent_used != "code":
            socketio.emit("status", {"state": "yapping"})
            _sync_expression("speaking")
        # Broadcast to ALL connected clients so other devices see the response
        socketio.emit("chat_response", result)
        if agent_used != "code":
            _sync_expression("idle")

    # Code Agent output is chat-only (no TTS) — summaries are long and technical
    if voice and clean_text and agent_used != "code":
        threading.Thread(target=voice.speak, args=(clean_text,), daemon=True).start()


@socketio.on("chat_message")
def on_chat_message(data):
    from flask_socketio import emit
    message = data.get("message", "")
    speaker = data.get("speaker", "unknown")
    agent_override = data.get("agent")
    model_override = data.get("model")
    client_tz = _normalize_timezone(data.get("client_timezone")) or _pi_timezone()
    if timers:
        timers.set_client_timezone(request.sid, client_tz)

    try:
        user_msg = {"role": "user", "text": message, "speaker": speaker, "ts": time.time()}
        if agent_override and agent_override != "auto":
            user_msg["agent"] = agent_override
        if model_override and model_override != "auto":
            user_msg["model"] = model_override
        _save_chat_message(user_msg)

        emit("status", {"state": "thinking"})
        if agent_override != "code":
            _sync_expression("thinking")

        if agent_override == "code":
            emit("agent_ack", {"text": "I'm on it! The Code Agent is investigating your request.", "agent": "code"})
            emit("agent_progress", {"agent": "code", "label": "Analyzing request", "status": "running"})

        prev_model_override = agent.model_override
        if model_override and model_override != "auto":
            agent.model_override = model_override
            log.info(f"[chat] Model override: {model_override} (agent={agent_override or 'auto'})")
        else:
            agent.model_override = None

        # Code Agent runs in background so the user isn't blocked for minutes
        if agent_override == "code":
            sid = request.sid

            def _code_agent_task():
                try:
                    result = agent.chat(message, speaker=speaker, agent_override=agent_override, client_timezone=client_tz)
                    if model_override and model_override != "auto":
                        agent.model_override = prev_model_override
                    _finish_chat_response(sid, result, model_override, voice, speaker)
                except Exception as e:
                    log.exception(f"[chat] Code Agent error")
                    import traceback
                    traceback.print_exc()
                    with app.app_context():
                        socketio.emit(
                            "chat_response",
                            {"text": f"Oops! BMO's brain got fuzzy: {e}", "speaker": speaker, "commands_executed": []},
                            room=sid,
                        )
                    # Code Agent: no OLED expression change on error
                finally:
                    if model_override and model_override != "auto":
                        agent.model_override = prev_model_override

            threading.Thread(target=_code_agent_task, daemon=True).start()
            return  # Handler exits; response will be emitted when the task completes

        # Non-Code-Agent: run synchronously
        result = agent.chat(message, speaker=speaker, agent_override=agent_override, client_timezone=client_tz)

        if model_override and model_override != "auto":
            agent.model_override = prev_model_override

        _finish_chat_response(request.sid, result, model_override, voice, speaker)
    except Exception as e:
        log.exception(f"[chat] ERROR in chat_message handler")
        import traceback
        traceback.print_exc()
        emit("chat_response", {"text": f"Oops! BMO's brain got fuzzy: {e}", "speaker": speaker, "commands_executed": []})
        if agent_override != "code":
            _sync_expression("error")


@socketio.on("client_timezone")
def on_client_timezone(data):
    if not timers:
        return
    client_tz = _normalize_timezone((data or {}).get("client_timezone")) if isinstance(data, dict) else None
    client_tz = client_tz or _pi_timezone()
    timers.set_client_timezone(request.sid, client_tz)
    socketio.emit("timers_tick", timers.get_all(viewer_timezone=client_tz), room=request.sid)


@socketio.on("scratchpad_read")
def on_scratchpad_read(data):
    """Read scratchpad sections for the web UI."""
    from flask_socketio import emit
    if agent and agent.orchestrator:
        sections = agent.orchestrator.scratchpad.to_dict()
        emit("scratchpad_update", sections)


@socketio.on("scratchpad_write")
def on_scratchpad_write(data):
    """Write to scratchpad from the web UI."""
    from flask_socketio import emit
    if agent and agent.orchestrator:
        section = data.get("section", "Notes")
        content = data.get("content", "")
        append = data.get("append", False)
        agent.orchestrator.scratchpad.write(section, content, append)
        emit("scratchpad_update", agent.orchestrator.scratchpad.to_dict())


@socketio.on("scratchpad_clear")
def on_scratchpad_clear(data):
    """Clear scratchpad section(s) from the web UI."""
    from flask_socketio import emit
    if agent and agent.orchestrator:
        section = data.get("section")  # None = clear all
        agent.orchestrator.scratchpad.clear(section)
        emit("scratchpad_update", agent.orchestrator.scratchpad.to_dict())


@socketio.on("disconnect")
def on_disconnect():
    log.info("[ws] Client disconnected")
    if timers:
        timers.clear_client(request.sid)
    # IDE owns its own per-client state (terminal + Windows-proxy).
    cleanup_client_session(request.sid)


# ── IDE Tab API ──────────────────────────────────────────────────────
# Routes + helpers + globals + SocketIO handlers all live in routes/ide.py.
# `register_ide(app, socketio, agent)` is called below after init_services()
# so the blueprint can resolve a live agent reference.
from routes.ide import register_ide, cleanup_client_session

# ── Main ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_services()
    # Wire the IDE blueprint + SocketIO handlers now that `agent` is live.
    register_ide(app, socketio, agent)
    # Restore music playback from last session (if any)
    if music:
        try:
            music.restore_playback()
        except Exception as e:
            log.exception(f"[bmo] Music restore failed")
    log.info("[bmo] BMO is ready! Access at http://0.0.0.0:5000")
    socketio.run(app, host="0.0.0.0", port=5000, debug=False)
