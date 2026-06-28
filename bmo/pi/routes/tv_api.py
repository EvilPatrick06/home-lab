"""TV remote subsystem (/api/tv/*) — worker subprocess, pairing, keys, media title, auto-skip.

Extracted from app.py 2026-06-10, PHASE-16 16F. The TV process/connection handles
(`_tv_proc`, `_tv_remote`, `_tv_pairing_remote`, thread handles) are module-level service
state here; the single-value `tv_is_on`/`tv_auto_skip` toggles live on `STATE`. `__file__` is
now bmo/pi/routes/tv_api.py, so the cert/worker/python path constants gain one extra `dirname`
to keep resolving under bmo/pi/. The public seam (tv_cmd/tv_connected/TV_APPS/init_tv_remote/
tv_is_on/set_tv_is_on) is what app.py's init_services scene closures call.
"""

import json
import logging
import os
import re
import subprocess
import threading
import time

from flask import Blueprint, jsonify, request

from services.bmo_logging import _s
from state import STATE

log = logging.getLogger("bmo")

tv_bp = Blueprint("tv", __name__, url_prefix="/api/tv")

_tv_remote = None
_tv_loop = None
_tv_pairing_remote = None

TV_IP = os.environ.get("BMO_TV_HOST", "10.10.20.194").strip() or "10.10.20.194"
_TV_CERT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
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
    # QA #12 (2026-05-17): `vnd.youtube://` was a no-op on Google TV —
    # AndroidTVRemote.send_launch_app_command expects an http(s) deeplink
    # or a package URI. The TV YouTube app responds to https://www.youtube.com/tv.
    "youtube": "https://www.youtube.com/tv",
    "netflix": "https://www.netflix.com/title",
    "prime": "https://app.primevideo.com",
    "crunchyroll": "crunchyroll://",
    "twitch": "twitch://",
    "plex": "plex://",
}


_tv_loop_thread = None

# Path to the standalone TV worker script (runs outside gevent).
# Discovered during QA #11 / #12 (2026-05-17) testing: the worker had moved
# to services/ but this constant still pointed at pi root, so subprocess
# spawned python with a missing script — Popen returned a handle whose
# process died immediately, and _tv_cmd hung on readline() of the empty
# stdout. All TV interactions (pair, key, launch) silently broke.
_TV_WORKER = os.path.join(_TV_CERT_DIR, "services", "tv_worker.py")
_TV_PYTHON = os.path.join(_TV_CERT_DIR, "venv", "bin", "python3")
_tv_proc = None
# (lock lives on state.STATE.tv_proc_lock)


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
        except Exception:
            log.exception("[tv] Failed to start worker")
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
    except Exception:
        log.exception("[tv] command failed")
        return {"error": "TV command failed"}


def init_tv_remote():
    """Try to connect to TV using existing certs (persistent worker)."""
    global _tv_remote
    # ADB (media-title queries) is best-effort and the TV is off much of the day.
    # A synchronous `adb connect` blocked startup ~5s and logged an ERROR traceback
    # every boot for the expected "TV unreachable" case (delaying the Flask bind).
    # Run it off the startup path in a daemon thread; log the timeout at INFO.
    def _adb_connect():
        try:
            subprocess.run(
                ["adb", "connect", f"{TV_IP}:5555"],
                capture_output=True, timeout=5,
            )
            log.info(f"[tv] ADB connected to {TV_IP}:5555")
        except Exception as e:
            log.info("[tv] ADB connect skipped — TV unreachable (%s)", e.__class__.__name__)
    threading.Thread(target=_adb_connect, daemon=True).start()

    if not os.path.exists(_TV_CERTFILE) or not os.path.exists(_TV_KEYFILE):
        log.info("[tv] No cert files found — pair via the TV tab first")
        return

    if not _ensure_tv_worker():
        log.info("[tv] Could not start TV worker")
        return

    result = _tv_cmd("connect_test")
    if result.get("ok"):
        _tv_remote = True
        STATE.tv_is_on = result.get("is_on")
        log.info(f"[tv] Connected to TV at {TV_IP} (is_on={STATE.tv_is_on})")
    else:
        log.info("[tv] Connection failed: %s — try pairing via the TV tab",
                 _s(result.get("error", "?")))

    # Background task: retry TV connection every 60s if not connected
    def _tv_bg_reconnect():
        global _tv_remote
        import time as _time
        while True:
            _time.sleep(60)
            if _tv_remote is None:
                try:
                    r = _tv_cmd("connect_test")
                    if r.get("ok"):
                        _tv_remote = True
                        STATE.tv_is_on = r.get("is_on")
                        log.info(f"[tv] Background reconnect OK — {TV_IP}")
                except Exception:
                    pass
    threading.Thread(target=_tv_bg_reconnect, daemon=True).start()


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


@tv_bp.route("/status")
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


@tv_bp.route("/pair/start", methods=["POST"])
def api_tv_pair_start():
    """Start pairing — TV will show a PIN code."""
    result = _tv_cmd("pair_start")
    if result.get("error"):
        log.info("[tv] Pairing start failed: %s", _s(result["error"]))
        return jsonify(result), 500
    log.info("[tv] Pairing started — TV should show PIN")
    return jsonify(result)


@tv_bp.route("/pair/finish", methods=["POST"])
def api_tv_pair_finish():
    """Finish pairing with the PIN shown on TV, then connect."""
    global _tv_remote
    data = request.json or {}
    pin = data.get("pin", "")
    if not pin:
        return jsonify({"error": "No PIN provided"}), 400

    result = _tv_cmd("pair_finish", pin=pin)
    if result.get("error"):
        log.info("[tv] Pairing finish failed: %s", _s(result["error"]))
        return jsonify(result), 500
    _tv_remote = True
    log.info(f"[tv] Paired and connected to TV at {TV_IP}!")
    return jsonify(result)


@tv_bp.route("/pair/cancel", methods=["POST"])
def api_tv_pair_cancel():
    """Cancel an in-flight pairing handshake (QA #11, 2026-05-17).

    The user dismissed the PIN dialog. Without this the next pair_start
    can fail silently because the worker's `pairing_remote` is still
    half-initialized in the long-lived worker subprocess. We terminate
    the worker outright; the next pair_start respawns it with a fresh
    `pairing_remote=None`. Idempotent — safe when no pairing is open."""
    global _tv_proc
    with STATE.tv_proc_lock:
        if _tv_proc is not None:
            try:
                _tv_proc.terminate()
                _tv_proc.wait(timeout=2)
            except Exception:
                try:
                    _tv_proc.kill()
                except Exception:
                    pass
            _tv_proc = None
    return jsonify({"ok": True, "message": "Pairing cancelled"})


@tv_bp.route("/key", methods=["POST"])
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


@tv_bp.route("/launch", methods=["POST"])
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


@tv_bp.route("/volume", methods=["POST"])
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


@tv_bp.route("/power", methods=["POST"])
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


@tv_bp.route("/input", methods=["POST"])
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
        log.warning("[tv] ADB failed: %s", _s(r.stderr.strip()))
        return jsonify({"error": "ADB command failed"}), 500
    except Exception as e:
        log.info("[bmo] api error: %r", e)
        return jsonify({"error": "internal server error"}), 500


@tv_bp.route("/navigate", methods=["POST"])
def api_tv_navigate():
    """D-pad navigation: up, down, left, right, select, back, home."""
    data = request.json or {}
    direction = data.get("direction", "select")
    mapped = TV_KEYS.get(direction, direction)
    if not os.path.exists(_TV_CERTFILE):
        return jsonify({"error": "TV not paired — pair first"}), 503
    result = _tv_cmd("send_key", key=mapped)
    return jsonify(result) if not result.get("error") else (jsonify(result), 500)


@tv_bp.route("/mute", methods=["POST"])
def api_tv_mute():
    """Toggle mute."""
    if not os.path.exists(_TV_CERTFILE):
        return jsonify({"error": "TV not paired — pair first"}), 503
    result = _tv_cmd("send_key", key="VOLUME_MUTE")
    return jsonify(result) if not result.get("error") else (jsonify(result), 500)


@tv_bp.route("/apps")
def api_tv_apps():
    """List available TV apps."""
    return jsonify({"apps": list(TV_APPS.keys())})


# ── TV Auto-Skip ──────────────────────────────────────────────────────

_tv_auto_skip_thread = None


def _auto_skip_loop():
    """Background thread that periodically checks for skip buttons via ADB uiautomator."""
    while STATE.tv_auto_skip:
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
        except Exception:
            log.exception("[tv-autoskip] Error")
        time.sleep(3)


@tv_bp.route("/auto-skip", methods=["GET"])
def api_tv_auto_skip_get():
    """Get auto-skip state."""
    return jsonify({"enabled": STATE.tv_auto_skip})


@tv_bp.route("/auto-skip", methods=["POST"])
def api_tv_auto_skip_toggle():
    """Toggle auto-skip feature."""
    global _tv_auto_skip_thread
    STATE.tv_auto_skip = not STATE.tv_auto_skip
    if STATE.tv_auto_skip:
        if _tv_auto_skip_thread is None or not _tv_auto_skip_thread.is_alive():
            _tv_auto_skip_thread = threading.Thread(target=_auto_skip_loop, daemon=True)
            _tv_auto_skip_thread.start()
            log.info("[tv-autoskip] Started auto-skip thread")
    else:
        log.info("[tv-autoskip] Stopped auto-skip")
    return jsonify({"enabled": STATE.tv_auto_skip})


# ── Public seam for app.py's init_services scene closures ─────────────

def tv_cmd(action, **kwargs):
    return _tv_cmd(action, **kwargs)


def tv_connected() -> bool:
    return _tv_remote is not None or os.path.exists(_TV_CERTFILE)


def tv_is_on() -> bool:
    return STATE.tv_is_on


def set_tv_is_on(value) -> None:
    STATE.tv_is_on = value


def register_tv(flask_app):
    """Register the TV blueprint. PHASE-16 16F."""
    flask_app.register_blueprint(tv_bp)
