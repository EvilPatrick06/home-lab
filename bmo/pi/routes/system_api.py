"""System-management HTTP surface — health, wifi, service restart, status summary,
volume/audio/bluetooth/TTS-output, settings/config.

Extracted from app.py 2026-06-10, PHASE-16 16C. The blueprint carries ABSOLUTE paths
(spanning /health + /api/...), so it has no url_prefix. Service singletons are resolved
late via `_app()` (so app.py's test-suite `app.<svc> = mock` monkeypatching keeps working);
volume helpers come from services.voice.system_audio, dotted settings from services.settings_store.
"""

import logging
import os
import re
import shutil
import subprocess
import threading

from flask import Blueprint, jsonify, request, send_from_directory

from services.voice import system_audio
from services.settings_store import load_setting, save_setting
from state import STATE

log = logging.getLogger("bmo")

system_bp = Blueprint("system", __name__)


def _app():
    # app.py runs as __main__ (ExecStart: python app.py) and init_services() sets the
    # service singletons as __main__ globals. Reaching this module via `import app` gives
    # a SEPARATE copy whose service globals (audio_service, etc.) stay None, so HTTP routes
    # would never see the live services. Under `python app.py`, __main__ IS app.py (it has
    # init_services), so return it; under pytest/import, fall back to the `import app`
    # copy the tests mount + mock.
    import sys

    main = sys.modules.get("__main__")
    if main is not None and hasattr(main, "init_services"):
        return main
    import app

    return app


# Queue of TTS audio files waiting to be played in browser (preserved from app.py).
_tts_browser_queue: list[str] = []


# ── Health ────────────────────────────────────────────────────────────

@system_bp.route("/health")
@system_bp.route("/api/v1/health")
def health():
    # `api_version` advertises the versioned-endpoint contract; the bare `status` key is kept
    # verbatim so existing unversioned probes (dnd-app lan-discovery.ts) are unaffected.
    # PHASE-08 08A: additive running-code identity so deploy<->restart skew is visible in one
    # GET. Each added field degrades to null on error — the health route must never 500.
    a = _app()
    commit = getattr(a, "_RUNNING_COMMIT", None)
    started = getattr(a, "_PROCESS_STARTED_AT", None)
    try:
        asset_build = a._static_mtime("js/bmo.js")
    except Exception:
        asset_build = None
    started_at = started.isoformat() if started is not None else None
    uptime_s = None
    if started is not None:
        try:
            from datetime import datetime, timezone
            uptime_s = int((datetime.now(timezone.utc) - started).total_seconds())
        except Exception:
            uptime_s = None
    return jsonify({
        "status": "ok",
        "api_version": "v1",
        "commit": commit,
        "asset_build": asset_build,
        "started_at": started_at,
        "uptime_s": uptime_s,
    })


_HEALTH_SCHEMA_VERSION = 1
_HEALTH_REQUIRED_KEYS = ("overall", "services", "pi_stats", "down_services", "down_required_services")


@system_bp.route("/api/health/full")
@system_bp.route("/api/v1/health/full")
def api_health_full():
    """Return full health status from HealthChecker (Pi stats + service checks).

    Round 2 #30 (2026-05-17): stable, versioned schema. Every documented
    key is guaranteed present (with sensible defaults). Schema version is
    in the `schema_version` field; consumers should treat absence of any
    documented key as `null`/empty, never as "feature removed"."""
    health_checker = _app().health_checker
    raw = health_checker.get_status() if health_checker else {}
    payload = {
        "schema_version": _HEALTH_SCHEMA_VERSION,
        "overall": raw.get("overall", "unknown"),
        "services": raw.get("services", {}) or {},
        "pi_stats": raw.get("pi_stats", {}) or {},
        "down_services": raw.get("down_services", []) or [],
        "down_required_services": raw.get("down_required_services", []) or [],
    }
    # Config preflight summary (provider keys + Calendar token). Cheap, no logging.
    try:
        from services.config_preflight import run_preflight
        payload["config"] = run_preflight()
    except Exception:
        payload["config"] = {}
    # Pass through any additional keys the checker emits (forward-compat)
    # but document the canonical set above.
    for k, v in raw.items():
        if k not in payload:
            payload[k] = v
    return jsonify(payload)


# ── WiFi ──────────────────────────────────────────────────────────────

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

    # Round 4 #14 (2026-05-17): wpa_cli + iwgetid both return empty on
    # NetworkManager-managed setups. Fall back to `iw dev <iface> link`
    # which reports the actual associated SSID regardless of who's
    # managing the interface.
    if not ssid and shutil.which("iw"):
        try:
            result = subprocess.run(
                ["iw", "dev", iface, "link"],
                capture_output=True, text=True, timeout=3,
            )
            if result.returncode == 0:
                for line in result.stdout.splitlines():
                    line = line.strip()
                    if line.startswith("SSID:"):
                        ssid = line.split(":", 1)[1].strip()
                        break
        except (OSError, subprocess.SubprocessError):
            pass

    # Try nmcli as a last resort (works on NetworkManager systems).
    if not ssid and shutil.which("nmcli"):
        try:
            result = subprocess.run(
                ["nmcli", "-t", "-f", "IN-USE,SSID,DEVICE", "dev", "wifi"],
                capture_output=True, text=True, timeout=3,
            )
            if result.returncode == 0:
                for line in result.stdout.splitlines():
                    parts = line.split(":")
                    if len(parts) >= 3 and parts[0] == "*" and parts[2] == iface:
                        ssid = parts[1]
                        break
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


@system_bp.route("/api/wifi/status")
def api_wifi_status():
    # QA #33 (2026-05-17): dashboard only renders {ssid, connected}; full
    # detail (BSSID/signal/channel/IP) is reachable behind CF Access via
    # /api/wifi/status/detail. Minimizes attack surface on a public hostname.
    #
    # QA Round 2 #6 (2026-05-17): the trim referenced `ssid`/`connected`
    # keys that _wifi_status() doesn't return — it actually emits
    # `current_ssid` + `wpa_state`. Map correctly here: connected ==
    # wpa_state COMPLETED (handshake done) OR a non-empty SSID with an
    # IP (catches non-WPA configs).
    full = _wifi_status()
    ssid = (full.get("current_ssid") or full.get("ssid") or "").strip()
    wpa_state = (full.get("wpa_state") or "").strip().upper()
    has_ip = bool((full.get("ip_address") or "").strip())
    connected = wpa_state == "COMPLETED" or (bool(ssid) and has_ip) or bool(full.get("internet"))
    return jsonify({"ssid": ssid, "connected": connected})


@system_bp.route("/api/wifi/status/detail")
def api_wifi_status_detail():
    """Full Wi-Fi diagnostics (BSSID/signal/channel/IP). Settings tab only."""
    return jsonify(_wifi_status())


@system_bp.route("/api/wifi/scan")
def api_wifi_scan():
    iface = _wifi_interface()
    try:
        networks = _wifi_scan_networks(iface)
        return jsonify({"interface": iface, "networks": networks})
    except RuntimeError as e:
        log.info(f"[bmo] api error: {e!r}")
        return jsonify({"error": "internal server error"}), 500


@system_bp.route("/api/wifi/connect", methods=["POST"])
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


@system_bp.route("/api/wifi/connect_saved", methods=["POST"])
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


# ── Service restart ─────────────────────────────────────────────────

@system_bp.route("/api/service/restart", methods=["POST"])
def api_service_restart():
    """Restart a single service or Docker container."""
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


@system_bp.route("/api/service/restart-all", methods=["POST"])
def api_service_restart_all():
    """Restart all services and Docker containers."""
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


@system_bp.route("/api/status/summary")
def api_status_summary():
    """Human-readable status summary for TTS and voice queries."""
    health_checker = _app().health_checker
    if not health_checker:
        err = getattr(_app(), "health_checker_error", None)
        if err:
            return jsonify({"summary": "Monitoring failed to start - check the service logs.",
                            "monitoring": "error", "detail": err})
        return jsonify({"summary": "Monitoring is not enabled.",
                        "monitoring": "off"})

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
    return jsonify({"summary": summary, "overall": overall, "raw": status, "monitoring": "ok"})


# ── Volume / audio ──────────────────────────────────────────────────

@system_bp.route("/api/volume")
def api_volume_get():
    """Get all volume levels + system audio mute state (Round 2 #1)."""
    music = _app().music
    voice = _app().voice
    timers = _app().timers
    music_vol = load_setting("volume.music", 50)
    if music:
        try:
            live_vol = music._player.audio_get_volume() if music._player else -1
            if live_vol > 0:
                music_vol = live_vol
        except Exception:
            pass
    alarm_vol = timers.alarm_volume if timers and timers.alarm_volume is not None else load_setting("volume.alarms", 80)
    audio_state = system_audio.get_system_audio_state()
    return jsonify({
        "system": audio_state["volume"],
        "muted": audio_state["muted"],  # Round 2 #1: surface mute state
        "music": music_vol,
        "voice": getattr(voice, "_speak_volume", 80) if voice else 80,
        "effects": load_setting("volume.effects", 80),
        "notifications": load_setting("volume.notifications", 80),
        "alarms": alarm_vol,
    })


@system_bp.route("/api/audio/unmute", methods=["POST"])
def api_audio_unmute():
    """Unmute the default PipeWire sink (Round 2 #1 helper)."""
    if not system_audio.unmute_sink():
        return jsonify({"ok": False, "error": "wpctl set-mute failed"}), 500
    state = system_audio.get_system_audio_state()
    return jsonify({"ok": True, "muted": state["muted"], "volume": state["volume"]})


@system_bp.route("/api/volume", methods=["POST"])
def api_volume_set():
    """Set volume for a specific category."""
    music = _app().music
    voice = _app().voice
    timers = _app().timers
    data = request.json or {}
    category = data.get("category", "")
    max_level = 150 if category == "system" else 100
    level = max(0, min(max_level, data.get("level", 50)))

    if category == "system":
        system_audio.set_system_volume(level)
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

    save_setting(f"volume.{category}", level)
    _app().socketio.emit("volume_update", {"category": category, "level": level})
    return jsonify({"ok": True, "category": category, "level": level})


# ── Audio Output API ─────────────────────────────────────────────────

@system_bp.route("/api/audio/devices")
def api_audio_devices():
    """List active audio output devices."""
    audio_service = _app().audio_service
    if not audio_service:
        return jsonify({"error": "Audio service not available"}), 503
    sinks = audio_service.list_sinks()
    return jsonify({"devices": [s.to_dict() for s in sinks]})


@system_bp.route("/api/audio/status")
def api_audio_status():
    """Full audio status: devices, routing, bluetooth."""
    audio_service = _app().audio_service
    if not audio_service:
        return jsonify({"error": "Audio service not available"}), 503
    return jsonify(audio_service.get_status())


@system_bp.route("/api/audio/output", methods=["POST"])
def api_audio_set_output():
    """Set audio output for a function or all. Body: {function, device_id}."""
    audio_service = _app().audio_service
    if not audio_service:
        return jsonify({"error": "Audio service not available"}), 503
    data = request.json or {}
    function = data.get("function", "all")
    device_id = data.get("device_id")
    if device_id is None:
        return jsonify({"error": "device_id required"}), 400
    ok = audio_service.set_function_output(function, int(device_id))
    if ok:
        _app().socketio.emit("audio_routing_update", audio_service.get_all_routing())
    return jsonify({"ok": ok})


@system_bp.route("/api/audio/inputs")
def api_audio_inputs():
    """List active audio input devices (sources)."""
    audio_service = _app().audio_service
    if not audio_service:
        return jsonify({"error": "Audio service not available"}), 503
    sources = audio_service.list_sources()
    return jsonify({"sources": [s.to_dict() for s in sources]})


@system_bp.route("/api/audio/input", methods=["POST"])
def api_audio_set_input():
    """Set the default audio input device. Body: {device_id}."""
    audio_service = _app().audio_service
    if not audio_service:
        return jsonify({"error": "Audio service not available"}), 503
    device_id = (request.json or {}).get("device_id")
    if device_id is None:
        return jsonify({"error": "device_id required"}), 400
    ok = audio_service.set_default_input(int(device_id))
    return jsonify({"ok": ok})


@system_bp.route("/api/audio/bluetooth/scan", methods=["POST"])
def api_audio_bt_scan():
    """Scan for Bluetooth devices. Returns immediately, emits results via socket."""
    audio_service = _app().audio_service
    if not audio_service:
        return jsonify({"error": "Audio service not available"}), 503
    duration = (request.get_json(silent=True) or {}).get("duration", 10)

    def _scan():
        devices = audio_service.bluetooth_scan(duration=duration)
        _app().socketio.emit("bt_scan_result", {"devices": devices})

    threading.Thread(target=_scan, daemon=True).start()
    return jsonify({"ok": True, "message": "Scanning..."})


@system_bp.route("/api/audio/bluetooth/pair", methods=["POST"])
def api_audio_bt_pair():
    """Pair + connect Bluetooth device. Body: {address: "XX:XX:..."}."""
    audio_service = _app().audio_service
    if not audio_service:
        return jsonify({"error": "Audio service not available"}), 503
    data = request.get_json(force=True, silent=True) or {}
    address = data.get("address")
    if not address:
        return jsonify({"error": "address required"}), 400
    ok, msg = audio_service.bluetooth_pair(address)
    return jsonify({"ok": ok, "message": msg})


@system_bp.route("/api/audio/bluetooth/disconnect", methods=["POST"])
def api_audio_bt_disconnect():
    """Disconnect a Bluetooth device. Body: {address: "XX:XX:..."}."""
    audio_service = _app().audio_service
    if not audio_service:
        return jsonify({"error": "Audio service not available"}), 503
    data = request.get_json(force=True, silent=True) or {}
    address = data.get("address")
    if not address:
        return jsonify({"error": "address required"}), 400
    ok, msg = audio_service.bluetooth_disconnect(address)
    return jsonify({"ok": ok, "message": msg})


@system_bp.route("/api/tts/output", methods=["GET"])
def api_tts_output_get():
    """Get current TTS output target."""
    return jsonify({"output": STATE.tts_output})


@system_bp.route("/api/tts/output", methods=["POST"])
def api_tts_output_set():
    """Set TTS output target. Body: {output: "pi" | "browser"}."""
    data = request.json or {}
    output = data.get("output", "pi")
    if output not in ("pi", "browser"):
        return jsonify({"error": "Invalid output, must be 'pi' or 'browser'"}), 400
    STATE.tts_output = output
    # Update voice pipeline's output mode
    voice = _app().voice
    if voice:
        voice._tts_output_mode = output
    log.info(f"[tts] Output set to: {output}")
    return jsonify({"ok": True, "output": output})


@system_bp.route("/api/tts/audio/<path:filename>")
def api_tts_audio_file(filename):
    """Serve a TTS audio file for browser playback.

    Only audio-typed basenames are served — never an arbitrary file from the
    shared system temp dir. send_from_directory already blocks ../ traversal;
    this also stops the route being a confused deputy over everything in /tmp.
    (SECURITY-LOG 2026-06-22.)
    """
    import tempfile
    base = os.path.basename(filename)
    if base != filename or not re.match(r"^[A-Za-z0-9._-]+\.(wav|mp3|ogg|opus|webm)$", base):
        return jsonify({"error": "not found"}), 404
    tts_dir = tempfile.gettempdir()
    return send_from_directory(tts_dir, base)


def _prom_escape(v: str) -> str:
    return str(v).replace("\\", "\\\\").replace('"', '\\"').replace("\n", " ")


def _prometheus_text() -> str:
    """Hand-rolled Prometheus text-exposition (no prometheus_client dependency).

    Cheap by design: reads the in-memory voice-metric rings, process counters,
    the health-checker's CACHED service-status dict (NOT get_status(), which
    shells out per service), and a single get_pi_stats() sample. Safe to scrape.
    """
    lines: list[str] = []

    # Voice pipeline stage latency aggregates
    try:
        from services.voice import voice_metrics
        m = voice_metrics.get_metrics()
        if m:
            lines.append("# HELP bmo_voice_stage_seconds Voice pipeline stage latency (seconds)")
            lines.append("# TYPE bmo_voice_stage_seconds gauge")
            for stage, agg in m.items():
                st = _prom_escape(stage)
                for label, key in (("avg", "avg_s"), ("p50", "p50_s"), ("p95", "p95_s"), ("max", "max_s")):
                    lines.append(f'bmo_voice_stage_seconds{{stage="{st}",stat="{label}"}} {agg.get(key, 0.0)}')
            lines.append("# HELP bmo_voice_stage_samples Samples currently in each stage ring")
            lines.append("# TYPE bmo_voice_stage_samples gauge")
            for stage, agg in m.items():
                lines.append(f'bmo_voice_stage_samples{{stage="{_prom_escape(stage)}"}} {agg.get("count", 0)}')
    except Exception:
        pass

    # Pi resource stats (single cheap sample)
    try:
        from services import monitoring
        stats = monitoring.get_pi_stats() or {}
        gauges = {
            "bmo_pi_cpu_temp_celsius": stats.get("cpu_temp"),
            "bmo_pi_cpu_percent": stats.get("cpu_percent"),
            "bmo_pi_ram_percent": stats.get("ram_percent"),
            "bmo_pi_disk_percent": stats.get("disk_percent"),
        }
        for name, val in gauges.items():
            if val is None:
                continue
            lines.append(f"# TYPE {name} gauge")
            lines.append(f"{name} {val}")
    except Exception:
        pass

    # Service up/down gauges from the CACHED status dict (no subprocess)
    try:
        hc = _app().health_checker
        cached = getattr(hc, "_service_status", {}) if hc else {}
        if cached:
            lines.append("# HELP bmo_service_up Service health (1=up, 0=down/degraded/unknown)")
            lines.append("# TYPE bmo_service_up gauge")
            for name, info in cached.items():
                status = (info or {}).get("status", "unknown")
                up = 1 if status == "up" else 0
                lines.append(f'bmo_service_up{{service="{_prom_escape(name)}",status="{_prom_escape(status)}"}} {up}')
    except Exception:
        pass

    # Process-lifetime counters (provider fallbacks, etc.)
    try:
        from services import metrics_counters
        counters = metrics_counters.get_all()
        for name, val in sorted(counters.items()):
            metric = name if name.startswith("bmo_") else f"bmo_{name}"
            lines.append(f"# TYPE {metric} counter")
            lines.append(f"{metric} {val}")
    except Exception:
        pass

    return "\n".join(lines) + "\n"


@system_bp.route("/metrics")
def api_metrics_prometheus():
    """Prometheus text-exposition endpoint (voice latency, Pi stats, service
    up/down, fallback counters). Hand-rolled; see _prometheus_text."""
    from flask import Response
    return Response(_prometheus_text(), mimetype="text/plain; version=0.0.4; charset=utf-8")


@system_bp.route("/api/metrics/voice")
def api_metrics_voice():
    """Per-stage voice-pipeline latency aggregates (count/avg/p50/p95/max seconds)."""
    from services.voice import voice_metrics
    return jsonify({"stages": voice_metrics.get_metrics()})


# ── Settings / config ─────────────────────────────────────────────────

@system_bp.route("/api/settings")
def api_settings():
    """Return full merged settings with secrets redacted."""
    from agents.settings import get_settings
    settings = get_settings()
    if not settings:
        return jsonify({"error": "Settings not initialized"}), 500
    return jsonify(settings.to_dict_redacted())


# Keys a remote/UI client must never write over HTTP: anything whose value is
# later executed as a shell command (hooks.*) or any secret-bearing key. Writing
# these via POST /api/settings is a privilege-escalation-to-RCE / secret-tamper
# primitive (hooks run via subprocess shell=True on the next agent tool call), so
# reject them with 403. (SECURITY-LOG 2026-06-22.) Denylist, not allowlist: it
# closes the dangerous keys without breaking legitimate UI-pref writes.
_SETTINGS_HTTP_BLOCKED_PREFIXES = ("hooks.", "hooks")
_SETTINGS_HTTP_SECRET_MARKERS = (
    "api_key", "apikey", "token", "secret", "password", "passwd",
    "credential", "private_key",
)


def _settings_key_blocked_for_http(key):
    k = (key or "").strip().lower()
    if k == "hooks" or k.startswith("hooks."):
        return True
    return any(marker in k for marker in _SETTINGS_HTTP_SECRET_MARKERS)


@system_bp.route("/api/settings", methods=["POST"])
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

    if _settings_key_blocked_for_http(key):
        log.warning("[settings] Rejected HTTP write to protected key: %s", key)
        return jsonify({
            "error": "forbidden",
            "message": "This settings key cannot be modified over HTTP (executable or secret key).",
            "key": key,
        }), 403

    settings.set(key, value, level=level)
    return jsonify({"success": True, "key": key, "value": value, "level": level})


@system_bp.route("/api/settings/reload", methods=["POST"])
def api_settings_reload():
    """Force reload settings from disk."""
    from agents.settings import get_settings
    settings = get_settings()
    if not settings:
        return jsonify({"error": "Settings not initialized"}), 500
    settings.reload()
    return jsonify({"success": True})


@system_bp.route("/api/config")
def api_config():
    """Expose non-secret config to the frontend (settings-backed)."""
    from agents.settings import get_settings
    settings = get_settings()
    if settings:
        maps_key = settings.get("services.maps_api_key", "")
    else:
        maps_key = os.environ.get("GOOGLE_MAPS_API_KEY", "")
    location = {}
    location_service = _app().location_service
    if location_service:
        location = location_service.get_location()
    return jsonify({"maps_api_key": maps_key, "location": location})


def register_system(flask_app):
    """Register the system blueprint. PHASE-16 16C."""
    flask_app.register_blueprint(system_bp)
