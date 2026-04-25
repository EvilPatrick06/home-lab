"""BMO Monitoring & Alerting — Health checks, Pi stats, Discord webhooks.

Periodically checks the health of all BMO infrastructure components:
Cloud APIs, Cloudflare Tunnel, PeerJS signaling, local Ollama, Pi resources.
Routes alerts to OLED face, SocketIO, and optional Discord webhook.

Usage:
    from services.monitoring import HealthChecker
    checker = HealthChecker(socketio=socketio)
    checker.start()
"""

import json
import os
import re
import threading
import time
from enum import Enum

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    print("[monitor] requests not installed — HTTP health checks disabled")

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False

# ── Configuration ────────────────────────────────────────────────────

DISCORD_WEBHOOK_URL = os.environ.get("DISCORD_WEBHOOK_URL", "")
PI_HOSTNAME = os.environ.get("PI_HOSTNAME", "bmo").strip() or "bmo"

# API keys for cloud health checks
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY", "")
FISH_AUDIO_API_KEY = os.environ.get("FISH_AUDIO_API_KEY", "")
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")
PIHOLE_API_PASSWORD = os.environ.get("PIHOLE_API_PASSWORD", "bmo-ads-begone")

# Calendar token path + canonical data dir (bmo/pi/data — not services/data)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
_PI_ROOT = os.path.dirname(_SCRIPT_DIR)
_DATA_DIR = os.path.join(_PI_ROOT, "data")
_LEGACY_CONFIG_DIR = os.path.join(_PI_ROOT, "config")
CALENDAR_TOKEN_PATH = os.path.join(_SCRIPT_DIR, "config", "token.json")
CALENDAR_CREDENTIALS_PATH = os.path.join(_SCRIPT_DIR, "config", "credentials.json")
LEGACY_CALENDAR_TOKEN_PATH = os.path.join(_LEGACY_CONFIG_DIR, "token.json")
LEGACY_CALENDAR_CREDENTIALS_PATH = os.path.join(_LEGACY_CONFIG_DIR, "credentials.json")

# Health check targets: service name → config
HEALTH_CHECKS = {
    "ollama_local": {"url": "http://localhost:11434/api/tags", "timeout": 3},
    "peerjs": {"url": "http://localhost:9000/myapp", "timeout": 3},
    # "bmo_app" self-check removed: causes gevent deadlock when monitoring
    # thread blocks on HTTP to the same Flask app it's running inside of.
}

# Cloud API health checks (checked separately with auth headers)
CLOUD_HEALTH_CHECKS = {
    "gemini_api": {
        "url": f"https://generativelanguage.googleapis.com/v1beta/models?key={GEMINI_API_KEY}",
        "timeout": 5,
        "enabled": bool(GEMINI_API_KEY),
    },
    "groq_api": {
        "url": "https://api.groq.com/openai/v1/models",
        "timeout": 5,
        "headers": {"Authorization": f"Bearer {GROQ_API_KEY}"},
        "enabled": bool(GROQ_API_KEY),
    },
    "fish_audio_api": {
        "url": "https://api.fish.audio/model",
        "timeout": 5,
        "headers": {"Authorization": f"Bearer {FISH_AUDIO_API_KEY}"},
        "enabled": bool(FISH_AUDIO_API_KEY),
    },
    "google_maps_api": {
        "url": f"https://maps.googleapis.com/maps/api/geocode/json?address=test&key={GOOGLE_MAPS_API_KEY}",
        "timeout": 5,
        "enabled": bool(GOOGLE_MAPS_API_KEY),
    },
}

# Default check interval (seconds)
DEFAULT_CHECK_INTERVAL = 60

# Legacy cooldown setting (kept for compatibility/documentation).
DISCORD_COOLDOWN = 300  # 5 minutes


# ── Severity Levels ──────────────────────────────────────────────────

class Severity(Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


# ── Pi System Stats ──────────────────────────────────────────────────

def get_pi_stats() -> dict:
    """Read Raspberry Pi system resource stats.

    Tries /sys/class/thermal for CPU temp (Pi-specific), falls back to psutil,
    then falls back to parsing /proc/ files directly.

    Returns:
        Dict with cpu_temp, cpu_percent, ram_percent, disk_percent.
    """
    stats = {
        "cpu_temp": _read_cpu_temp(),
        "cpu_percent": _read_cpu_percent(),
        "ram_percent": _read_ram_percent(),
        "disk_percent": _read_disk_percent(),
    }
    return stats


def _read_cpu_temp() -> float | None:
    """Read CPU temperature in Celsius."""
    # Pi-specific: /sys/class/thermal/thermal_zone0/temp
    try:
        with open("/sys/class/thermal/thermal_zone0/temp") as f:
            raw = f.read().strip()
            return round(int(raw) / 1000.0, 1)
    except (FileNotFoundError, ValueError, PermissionError):
        pass

    # Fallback: psutil
    if PSUTIL_AVAILABLE:
        try:
            temps = psutil.sensors_temperatures()
            if temps:
                # Use the first available sensor
                for name, entries in temps.items():
                    if entries:
                        return round(entries[0].current, 1)
        except Exception:
            pass

    return None


def _read_cpu_percent() -> float | None:
    """Read CPU usage percentage."""
    if PSUTIL_AVAILABLE:
        try:
            return psutil.cpu_percent(interval=0.5)
        except Exception:
            pass

    # Fallback: parse /proc/stat
    try:
        with open("/proc/stat") as f:
            line = f.readline()
        parts = line.split()
        if parts[0] == "cpu":
            idle = int(parts[4])
            total = sum(int(p) for p in parts[1:])
            # This is an instantaneous snapshot — not a delta.
            # For accuracy, psutil is preferred.
            usage = 100.0 * (1.0 - idle / total) if total > 0 else 0.0
            return round(usage, 1)
    except (FileNotFoundError, ValueError, IndexError):
        pass

    return None


def _read_ram_percent() -> float | None:
    """Read RAM usage percentage."""
    if PSUTIL_AVAILABLE:
        try:
            mem = psutil.virtual_memory()
            return round(mem.percent, 1)
        except Exception:
            pass

    # Fallback: parse /proc/meminfo
    try:
        meminfo = {}
        with open("/proc/meminfo") as f:
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    key = parts[0].rstrip(":")
                    meminfo[key] = int(parts[1])  # kB

        total = meminfo.get("MemTotal", 0)
        available = meminfo.get("MemAvailable", 0)
        if total > 0:
            used_pct = 100.0 * (1.0 - available / total)
            return round(used_pct, 1)
    except (FileNotFoundError, ValueError, KeyError):
        pass

    return None


def _read_disk_percent() -> float | None:
    """Read root partition disk usage percentage."""
    if PSUTIL_AVAILABLE:
        try:
            disk = psutil.disk_usage("/")
            return round(disk.percent, 1)
        except Exception:
            pass

    # Fallback: os.statvfs
    try:
        stat = os.statvfs("/")
        total = stat.f_blocks * stat.f_frsize
        free = stat.f_bfree * stat.f_frsize
        if total > 0:
            used_pct = 100.0 * (1.0 - free / total)
            return round(used_pct, 1)
    except (OSError, AttributeError):
        pass

    return None


# ── Alert Routing ────────────────────────────────────────────────────

def _send_discord_webhook(level: Severity, service: str, message: str) -> bool:
    """Send a Discord webhook notification for critical alerts.

    Returns True if sent successfully, False otherwise.
    """
    if not DISCORD_WEBHOOK_URL or not REQUESTS_AVAILABLE:
        return False

    color_map = {
        Severity.CRITICAL: 0xFF0000,  # Red
        Severity.WARNING: 0xFFA500,   # Orange
        Severity.INFO: 0x00BFFF,      # Light blue
    }

    payload = {
        "embeds": [{
            "title": f"BMO Alert: {service}",
            "description": message,
            "color": color_map.get(level, 0x808080),
            "footer": {"text": f"Severity: {level.value}"},
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }]
    }

    try:
        r = requests.post(
            DISCORD_WEBHOOK_URL,
            json=payload,
            timeout=5,
        )
        return r.status_code in (200, 204)
    except Exception as e:
        print(f"[monitor] Discord webhook failed: {e}")
        return False


# ── Health Checker ───────────────────────────────────────────────────

class HealthChecker:
    """Periodic health checker for all BMO infrastructure.

    Checks local Ollama, PeerJS signaling, and Pi system resources.
    Routes alerts via print logging, SocketIO events, OLED face, and Discord.

    Args:
        socketio: Flask-SocketIO instance for emitting alerts.
        check_interval: Seconds between health check cycles (default 60).
    """

    def __init__(self, socketio=None, check_interval: int = DEFAULT_CHECK_INTERVAL):
        self.socketio = socketio
        self.check_interval = check_interval
        self._running = False
        self._thread: threading.Thread | None = None

        # Reuse a single requests.Session to avoid leaking file descriptors.
        # Each standalone requests.get() creates a new urllib3 connection pool
        # that may not close promptly under gevent monkey-patching.
        self._session: "requests.Session | None" = None
        if REQUESTS_AVAILABLE:
            self._session = requests.Session()

        # Current service status: service_name → {status, last_check, message, response_time}
        self._service_status: dict[str, dict] = {}

        # Previous status for detecting state transitions (recovery detection)
        # Load from disk so recovery alerts work across restarts
        self._state_file = os.path.join(_DATA_DIR, "monitor_state.json")
        self._prev_status: dict[str, str] = self._load_prev_status()
        self._service_meta: dict[str, dict] = {}

        # Discord dedupe tracker persisted across restarts:
        # service_name -> last alert fingerprint
        self._alert_state_file = os.path.join(_DATA_DIR, "monitor_alert_state.json")
        self._discord_last_fingerprint: dict[str, str] = self._load_discord_alert_state()

    def _load_prev_status(self) -> dict[str, str]:
        """Load previous service status from disk (survives restarts)."""
        try:
            if os.path.exists(self._state_file):
                with open(self._state_file, "r") as f:
                    return json.load(f)
        except Exception as e:
            print(f"[monitor] Could not load saved state: {e}")
        return {}

    def _save_prev_status(self):
        """Persist current service status to disk for recovery detection."""
        try:
            os.makedirs(os.path.dirname(self._state_file), exist_ok=True)
            with open(self._state_file, "w") as f:
                json.dump(self._prev_status, f)
        except Exception as e:
            print(f"[monitor] Could not save state: {e}")

    def _load_discord_alert_state(self) -> dict[str, str]:
        """Load persisted Discord dedupe state across restarts."""
        try:
            if os.path.exists(self._alert_state_file):
                with open(self._alert_state_file, "r", encoding="utf-8") as f:
                    payload = json.load(f)
                if isinstance(payload, dict):
                    fingerprints = payload.get("fingerprints")
                    if isinstance(fingerprints, dict):
                        return {str(k): str(v) for k, v in fingerprints.items()}
        except Exception as e:
            print(f"[monitor] Could not load alert state: {e}")
        return {}

    def _save_discord_alert_state(self):
        try:
            os.makedirs(os.path.dirname(self._alert_state_file), exist_ok=True)
            payload = {"fingerprints": self._discord_last_fingerprint}
            with open(self._alert_state_file, "w", encoding="utf-8") as f:
                json.dump(payload, f)
        except Exception as e:
            print(f"[monitor] Could not save alert state: {e}")

    # ── Lifecycle ────────────────────────────────────────────────────

    def start(self):
        """Start the background health check daemon thread."""
        if self._running:
            print("[monitor] Already running")
            return

        self._running = True
        self._thread = threading.Thread(target=self._check_loop, daemon=True)
        self._thread.start()
        print(f"[monitor] Health checker started (interval={self.check_interval}s)")

    def stop(self):
        """Stop the health check daemon."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        print("[monitor] Health checker stopped")

    # ── Main Check Loop ──────────────────────────────────────────────

    def _check_loop(self):
        """Background loop that runs health checks at the configured interval."""
        # Run first check immediately
        self.check_all()

        while self._running:
            time.sleep(self.check_interval)
            if not self._running:
                break
            try:
                self.check_all()
            except Exception as e:
                print(f"[monitor] Check loop error: {e}")

    def check_all(self):
        """Run all health checks and process results."""
        # Check local HTTP services
        for service_name, config in HEALTH_CHECKS.items():
            self._check_http_service(service_name, config)

        # Check cloud API services
        for service_name, config in CLOUD_HEALTH_CHECKS.items():
            if config.get("enabled", False):
                self._check_http_service(service_name, config)

        # Check Docker containers
        self._check_docker_containers()

        # Check Pi-hole DNS health
        self._check_pihole()

        # Check systemd services
        self._check_systemd_services()

        # Check network interfaces
        self._check_network()

        # Check critical ports are bound
        self._check_ports()

        # Check internet connectivity
        self._check_internet()

        # Check Pi system resources (CPU, RAM, disk, swap, load)
        self._check_pi_resources()

        # Check Pi power supply / throttle status
        self._check_pi_power()

        # Check Google Calendar token
        self._check_calendar_token()

        # Check Cloudflare Tunnel
        self._check_cloudflared()

        # Check mDNS and optional Tailscale
        self._check_remote_access()

        # Check rclone remotes
        self._check_rclone()

        # Enrich service entries with metadata for diagnostics UI / copy output
        self._enrich_service_metadata()

        # Detect state transitions and emit recovery events
        self._process_state_transitions()

        # Update previous status snapshot and persist to disk
        for name, info in self._service_status.items():
            self._prev_status[name] = info.get("status", "unknown")
        self._save_prev_status()

    def _source_check_for_service(self, name: str) -> str:
        if name.startswith("svc_"):
            return "systemd"
        if name.startswith("docker_"):
            return "docker"
        if name.startswith("net_"):
            return "network"
        if name.startswith("pi_"):
            return "pi_resource"
        if name.endswith("_api") or name in {"ollama_local", "peerjs"}:
            return "http"
        if name in {"google_calendar"}:
            return "calendar_auth"
        if name in {"cloudflared", "mdns", "tailscale", "rclone", "internet", "ports"}:
            return "system_probe"
        return "monitor"

    def _recommended_action_for_service(self, name: str, status: str, message: str) -> str:
        if status in {"up", "info"}:
            return ""
        msg = (message or "").lower()
        if name == "google_calendar":
            if "credentials.json" in msg:
                return "Add credentials.json to bmo/pi/config and re-check."
            if "token.json missing" in msg:
                return "Open Calendar tab and run Authorize Calendar."
            if "refresh token" in msg:
                return "Re-authorize calendar with consent to restore refresh_token."
            if "invalid" in msg or "expired" in msg:
                return "Re-authorize calendar and verify token.json is valid JSON."
            return "Check calendar auth settings and re-run authorization."
        if name.startswith("svc_"):
            svc = name[4:].replace("_", "-")
            return f"sudo systemctl restart {svc}.service"
        if name.startswith("docker_"):
            container = name[7:]
            return f"docker restart {container}"
        if name == "internet":
            return "Check Wi-Fi/hotspot uplink and DHCP/default route."
        if name == "net_wlan0":
            return "Reconnect Wi-Fi and verify wlan0 has IPv4 address."
        if name == "ports":
            return "Restart missing service(s) and confirm expected ports are listening."
        if name == "cloudflared":
            return "sudo systemctl restart cloudflared && verify /etc/cloudflared/config.yml target."
        if name == "pihole":
            return "Check pihole-FTL and API auth password, then restart Pi-hole container."
        if name == "pihole_dns":
            return "Verify Pi-hole DNS service and upstream resolver reachability."
        return "Inspect service logs for root cause."

    def _enrich_service_metadata(self):
        now = time.time()
        stale = set(self._service_meta.keys()) - set(self._service_status.keys())
        for key in stale:
            self._service_meta.pop(key, None)

        for name, info in self._service_status.items():
            status = info.get("status", "unknown")
            message = str(info.get("message", ""))
            prev = self._service_meta.get(name, {})
            prev_status = prev.get("status")
            prev_message = prev.get("message")

            if status in {"down", "degraded"}:
                if prev_status == status and prev_message == message:
                    failure_count = int(prev.get("failure_count", 0)) + 1
                else:
                    failure_count = 1
                last_error = message
            else:
                failure_count = 0
                last_error = ""

            if prev_status != status or prev_message != message:
                last_change = now
            else:
                last_change = prev.get("last_change", now)

            info["source_check"] = info.get("source_check") or self._source_check_for_service(name)
            info["recommended_action"] = info.get("recommended_action") or self._recommended_action_for_service(
                name, status, message
            )
            info["failure_count"] = failure_count
            info["last_error"] = last_error
            info["last_change"] = last_change

            self._service_meta[name] = {
                "status": status,
                "message": message,
                "failure_count": failure_count,
                "last_change": last_change,
            }

    @staticmethod
    def _normalize_alert_message(message: str) -> str:
        normalized = (message or "").lower().strip()
        normalized = re.sub(r"\s+", " ", normalized)
        # Suppress noisy numeric/token jitter while preserving core meaning.
        normalized = re.sub(r"\b\d+(\.\d+)?\b", "<n>", normalized)
        return normalized

    def _alert_fingerprint(self, level: Severity, service: str, status: str, message: str) -> str:
        normalized = self._normalize_alert_message(message)
        return f"{level.value}|{service}|{status}|{normalized}"

    # ── HTTP Service Checks ──────────────────────────────────────────

    # Human-readable names for Discord/log messages
    _SERVICE_LABELS = {
        "ollama_local": "🤖 Ollama (local LLM fallback)",
        "peerjs": "🌐 PeerJS (D&D multiplayer signaling)",
        "pihole": "🛡️ Pi-hole (ad blocker DNS)",
        "pihole_lists": "🛡️ Pi-hole blocklists",
        "pihole_dns": "🛡️ Pi-hole DNS resolution",
        "bmo_app": "🏠 BMO Flask App (web UI + API)",
        "gemini_api": "☁️ Gemini API (primary LLM)",
        "groq_api": "☁️ Groq API (speech-to-text)",
        "fish_audio_api": "🔊 Fish Audio API (text-to-speech)",
        "svc_bmo": "🏠 BMO systemd service",
        "svc_docker": "🐳 Docker engine",
        "svc_bmo_dm_bot": "🐉 DM Discord Bot",
        "svc_bmo_social_bot": "🎵 Social Discord Bot",
        "svc_bmo_kiosk": "🖥️ BMO Kiosk (touchscreen UI)",
        "svc_bmo_fan": "🌀 BMO Fan Controller",
        "net_wlan0": "📶 Wi-Fi (wlan0)",
        "net_eth0": "🔌 Ethernet (eth0)",
        "pi_load": "📊 System load",
        "pi_swap": "💿 Swap usage",
        "pi_boot_disk": "🗂️ Boot partition",
        "internet": "🌐 Internet connectivity",
        "pi_cpu_temp": "🌡️ CPU temperature",
        "pi_ram": "🧠 RAM usage",
        "pi_disk": "💾 Disk usage",
        "pi_power": "⚡ Power supply",
        "pi_resources": "📊 Pi resources",
        "google_maps_api": "🗺️ Google Maps API",
        "google_calendar": "📅 Google Calendar",
        "cloudflared": "🌐 Cloudflare Tunnel",
        "mdns": "📡 mDNS hostname",
        "tailscale": "🔐 Tailscale",
        "rclone": "☁️ Rclone (Google Drive)",
    }

    # Services that should drive overall=critical when they are down.
    _REQUIRED_FOR_OVERALL = {
        "svc_bmo",
        "svc_docker",
        "internet",
        "net_wlan0",
        "google_calendar",
        "pihole",
        "pihole_dns",
        "cloudflared",
    }
    _OPTIONAL_DISABLED_SERVICES = {"bmo-fan"}

    def _service_label(self, name: str) -> str:
        if name in self._SERVICE_LABELS:
            return self._SERVICE_LABELS[name]
        # Auto-generate friendly label for docker containers
        if name.startswith("docker_"):
            container = name[7:]  # strip "docker_"
            return f"🐳 {container}"
        return name

    def _check_http_service(self, name: str, config: dict):
        """Check a single HTTP service endpoint."""
        if not self._session:
            self._service_status[name] = {
                "status": "unknown",
                "last_check": time.time(),
                "message": "requests library not available",
                "response_time": None,
            }
            return

        url = config["url"]
        timeout = config.get("timeout", 5)
        label = self._service_label(name)

        try:
            start = time.monotonic()
            headers = config.get("headers", {})
            r = self._session.get(url, timeout=timeout, headers=headers)
            elapsed = round(time.monotonic() - start, 3)

            if r.status_code == 200:
                self._service_status[name] = {
                    "status": "up",
                    "last_check": time.time(),
                    "message": "OK",
                    "response_time": elapsed,
                }
            else:
                self._service_status[name] = {
                    "status": "down",
                    "last_check": time.time(),
                    "message": f"HTTP {r.status_code}",
                    "response_time": elapsed,
                }
                self._emit_alert(
                    Severity.WARNING, name,
                    f"{label} returned HTTP {r.status_code}",
                )

        except requests.exceptions.Timeout:
            self._service_status[name] = {
                "status": "down",
                "last_check": time.time(),
                "message": f"Timeout after {timeout}s",
                "response_time": None,
            }
            self._emit_alert(
                Severity.CRITICAL, name,
                f"{label} is not responding (timed out after {timeout}s)",
            )

        except requests.exceptions.ConnectionError:
            self._service_status[name] = {
                "status": "down",
                "last_check": time.time(),
                "message": "Connection refused",
                "response_time": None,
            }
            self._emit_alert(
                Severity.CRITICAL, name,
                f"{label} is DOWN — connection refused. Service may have crashed.",
            )

        except Exception as e:
            self._service_status[name] = {
                "status": "down",
                "last_check": time.time(),
                "message": str(e),
                "response_time": None,
            }
            self._emit_alert(Severity.WARNING, name, f"{label} check failed: {e}")

    # ── Pi Resource Checks ───────────────────────────────────────────

    def _check_pi_resources(self):
        """Check Pi system resources and emit alerts for thresholds."""
        stats = get_pi_stats()
        now = time.time()

        # Store as a pseudo-service for status reporting
        self._service_status["pi_resources"] = {
            "status": "up",
            "last_check": now,
            "message": "OK",
            "stats": stats,
        }

        # CPU temperature thresholds
        temp = stats.get("cpu_temp")
        if temp is not None:
            if temp > 80.0:
                self._service_status["pi_resources"]["status"] = "degraded"
                self._emit_alert(
                    Severity.CRITICAL, "pi_cpu_temp",
                    f"🌡️ CPU temperature critical: {temp}°C — risk of thermal throttling",
                )
            elif temp > 70.0:
                self._emit_alert(
                    Severity.WARNING, "pi_cpu_temp",
                    f"🌡️ CPU temperature elevated: {temp}°C",
                )

        # RAM usage thresholds
        ram = stats.get("ram_percent")
        if ram is not None and ram > 85.0:
            self._service_status["pi_resources"]["status"] = "degraded"
            self._emit_alert(
                Severity.WARNING, "pi_ram",
                f"🧠 RAM usage high: {ram}% — may cause OOM kills",
            )

        # Disk usage thresholds
        disk = stats.get("disk_percent")
        if disk is not None:
            if disk > 95.0:
                self._service_status["pi_resources"]["status"] = "degraded"
                self._emit_alert(
                    Severity.CRITICAL, "pi_disk",
                    f"💾 Disk usage critical: {disk}% — BMO may stop writing data",
                )
            elif disk > 85.0:
                self._emit_alert(
                    Severity.WARNING, "pi_disk",
                    f"💾 Disk usage high: {disk}%",
                )

        # Swap usage
        if PSUTIL_AVAILABLE:
            try:
                swap = psutil.swap_memory()
                swap_pct = swap.percent
                self._service_status["pi_swap"] = {
                    "status": "up", "last_check": now,
                    "message": f"{swap_pct}% ({swap.used // (1024*1024)}MB / {swap.total // (1024*1024)}MB)",
                    "response_time": None,
                }
                if swap_pct > 80.0:
                    self._service_status["pi_swap"]["status"] = "degraded"
                    self._emit_alert(
                        Severity.WARNING, "pi_swap",
                        f"💿 Swap usage high: {swap_pct}% — system may be thrashing",
                    )
            except Exception:
                pass

        # Load average
        try:
            load1, load5, load15 = os.getloadavg()
            cpu_count = os.cpu_count() or 4
            self._service_status["pi_load"] = {
                "status": "up", "last_check": now,
                "message": f"{load1:.1f} / {load5:.1f} / {load15:.1f} (1/5/15 min)",
                "response_time": None,
            }
            if load5 > cpu_count * 2:
                self._service_status["pi_load"]["status"] = "degraded"
                self._emit_alert(
                    Severity.CRITICAL, "pi_load",
                    f"📊 System overloaded: load {load5:.1f} (>{cpu_count * 2} threshold for {cpu_count} cores)",
                )
            elif load5 > cpu_count * 1.5:
                self._emit_alert(
                    Severity.WARNING, "pi_load",
                    f"📊 System load elevated: {load5:.1f} ({cpu_count} cores)",
                )
        except (OSError, AttributeError):
            pass

        # Boot partition (/boot/firmware)
        if PSUTIL_AVAILABLE:
            try:
                for part in psutil.disk_partitions():
                    if "/boot" in part.mountpoint:
                        usage = psutil.disk_usage(part.mountpoint)
                        boot_pct = usage.percent
                        self._service_status["pi_boot_disk"] = {
                            "status": "up", "last_check": now,
                            "message": f"{boot_pct}% ({usage.used // (1024*1024)}MB / {usage.total // (1024*1024)}MB)",
                            "response_time": None,
                        }
                        if boot_pct > 90.0:
                            self._service_status["pi_boot_disk"]["status"] = "degraded"
                            self._emit_alert(
                                Severity.WARNING, "pi_boot_disk",
                                f"🗂️ Boot partition {boot_pct}% full — kernel updates may fail",
                            )
                        break
            except Exception:
                pass

    # ── Docker Container Checks ──────────────────────────────────────

    def _check_docker_containers(self):
        """Check ALL Docker container status via auto-discovery."""
        import subprocess

        # Auto-discover all containers (running and stopped)
        try:
            result = subprocess.run(
                ["docker", "ps", "-a", "--format", "{{.Names}}"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode != 0:
                print(f"[monitor] Docker ps failed: {result.stderr.strip()}")
                return
            containers = [n.strip() for n in result.stdout.strip().split("\n") if n.strip()]
        except Exception as e:
            print(f"[monitor] Docker discovery failed: {e}")
            return

        if not containers:
            return

        for name in containers:
            try:
                result = subprocess.run(
                    ["docker", "inspect", "--format",
                     '{"running":{{.State.Running}},"status":"{{.State.Status}}","restarts":{{.RestartCount}}}',
                     name],
                    capture_output=True, text=True, timeout=5,
                )
                if result.returncode != 0:
                    self._service_status[f"docker_{name}"] = {
                        "status": "down",
                        "last_check": time.time(),
                        "message": "Container not found",
                        "response_time": None,
                    }
                    self._emit_alert(
                        Severity.CRITICAL, f"docker_{name}",
                        f"🐳 Docker container '{name}' not found — run: docker compose up -d",
                    )
                    continue

                info = json.loads(result.stdout.strip())
                if info.get("running"):
                    status_msg = f"Running (restarts: {info.get('restarts', 0)})"
                    # Get container start time
                    started_at = None
                    try:
                        ts_result = subprocess.run(
                            ["docker", "inspect", "--format", "{{.State.StartedAt}}", name],
                            capture_output=True, text=True, timeout=3,
                        )
                        ts_str = ts_result.stdout.strip()
                        if ts_str:
                            from datetime import datetime, timezone
                            # Docker uses ISO 8601 in UTC with nanoseconds
                            ts_str = ts_str.split(".")[0]  # strip nanoseconds
                            dt = datetime.strptime(ts_str, "%Y-%m-%dT%H:%M:%S")
                            # Mark as UTC, then convert to epoch
                            dt = dt.replace(tzinfo=timezone.utc)
                            started_at = dt.timestamp()
                    except Exception:
                        pass
                    self._service_status[f"docker_{name}"] = {
                        "status": "up",
                        "last_check": time.time(),
                        "message": status_msg,
                        "response_time": None,
                        "started_at": started_at,
                    }
                    restarts = info.get("restarts", 0)
                    if restarts > 5:
                        self._emit_alert(
                            Severity.WARNING, f"docker_{name}",
                            f"🐳 Container '{name}' has restarted {restarts} times — check logs: docker logs {name}",
                        )
                else:
                    state = info.get("status", "unknown")
                    self._service_status[f"docker_{name}"] = {
                        "status": "down",
                        "last_check": time.time(),
                        "message": f"State: {state}",
                        "response_time": None,
                    }
                    self._emit_alert(
                        Severity.CRITICAL, f"docker_{name}",
                        f"🐳 Docker container '{name}' is {state} — run: docker start {name}",
                    )
            except subprocess.TimeoutExpired:
                self._service_status[f"docker_{name}"] = {
                    "status": "unknown",
                    "last_check": time.time(),
                    "message": "Docker inspect timed out",
                    "response_time": None,
                }
            except Exception as e:
                self._service_status[f"docker_{name}"] = {
                    "status": "unknown",
                    "last_check": time.time(),
                    "message": str(e),
                    "response_time": None,
                }

    # ── Pi-hole Health Check ─────────────────────────────────────────

    def _check_pihole(self):
        """Check Pi-hole DNS health: API reachable, blocking active, gravity status."""
        if not self._session:
            return

        now = time.time()
        pihole_api = "http://localhost:80/api"

        # 1. Authenticate (reuse cached session, re-auth if expired)
        sid = getattr(self, "_pihole_sid", "")
        if sid:
            # Test if session is still valid
            try:
                r = self._session.get(f"{pihole_api}/dns/blocking", headers={"sid": sid}, timeout=3)
                if r.status_code == 401:
                    sid = ""  # expired, re-auth below
            except Exception:
                sid = ""

        if not sid:
            try:
                r = self._session.post(
                    f"{pihole_api}/auth",
                    json={"password": PIHOLE_API_PASSWORD},
                    timeout=5,
                )
                if r.status_code != 200:
                    err_msg = "API auth failed"
                    try:
                        err_msg = r.json().get("error", {}).get("message", err_msg)
                    except Exception:
                        pass
                    err_lower = str(err_msg).lower()
                    # Pi-hole v6 can hit an API session-seat ceiling while DNS still works.
                    if "seats exceeded" in err_lower:
                        self._service_status["pihole"] = {
                            "status": "degraded", "last_check": now,
                            "message": "API seats exceeded", "response_time": None,
                        }
                        self._emit_alert(
                            Severity.WARNING, "pihole",
                            "🛡️ Pi-hole API seats exceeded; DNS may still be active",
                        )
                        sid = ""
                    else:
                        self._service_status["pihole"] = {
                            "status": "down", "last_check": now,
                            "message": err_msg, "response_time": None,
                        }
                        self._emit_alert(
                            Severity.CRITICAL, "pihole",
                            f"🛡️ Pi-hole API auth failed: {err_msg}",
                        )
                        return
                else:
                    sid = r.json().get("session", {}).get("sid", "")
                    self._pihole_sid = sid
            except Exception as e:
                self._service_status["pihole"] = {
                    "status": "down", "last_check": now,
                    "message": f"API unreachable: {e}", "response_time": None,
                }
                self._emit_alert(
                    Severity.CRITICAL, "pihole",
                    "🛡️ Pi-hole API unreachable — DNS ad blocking is offline",
                )
                return

        # 2. Check blocking status/stats only if API session is available.
        if sid:
            try:
                # Get blocking state
                r_block = self._session.get(
                    f"{pihole_api}/dns/blocking",
                    headers={"sid": sid},
                    timeout=5,
                )
                if r_block.status_code == 200:
                    block_data = r_block.json()
                    blocking_enabled = block_data.get("blocking") == "enabled"
                    if not blocking_enabled:
                        self._service_status["pihole"] = {
                            "status": "degraded", "last_check": now,
                            "message": "Blocking DISABLED",
                            "response_time": None,
                        }
                        self._emit_alert(
                            Severity.WARNING, "pihole",
                            "🛡️ Pi-hole blocking is DISABLED — ads/trackers are not being filtered",
                        )
                        return

                # Get gravity stats
                r_ftl = self._session.get(
                    f"{pihole_api}/info/ftl",
                    headers={"sid": sid},
                    timeout=5,
                )
                if r_ftl.status_code == 200:
                    ftl = r_ftl.json().get("ftl", {})
                    gravity_count = ftl.get("database", {}).get("gravity", 0)
                    num_lists = ftl.get("database", {}).get("lists", 0)

                    self._service_status["pihole"] = {
                        "status": "up", "last_check": now,
                        "message": f"Blocking {gravity_count:,} domains ({num_lists} lists)",
                        "response_time": None,
                    }
            except Exception as e:
                self._service_status["pihole"] = {
                    "status": "unknown", "last_check": now,
                    "message": f"Stats check failed: {e}", "response_time": None,
                }

            # 3. Check for inaccessible blocklists
            # Pi-hole v6 status: 1=new/pending, 2=OK, 3=inaccessible, 4=disabled
            try:
                r = self._session.get(
                    f"{pihole_api}/lists?type=block",
                    headers={"sid": sid},
                    timeout=10,
                )
                if r.status_code == 200:
                    lists_data = r.json()
                    blocklists = lists_data.get("lists", lists_data) if isinstance(lists_data, dict) else lists_data
                    if isinstance(blocklists, list):
                        failed = [bl for bl in blocklists if bl.get("status") == 3]
                        if failed:
                            names = ", ".join(bl.get("comment", bl.get("address", "?"))[:30] for bl in failed[:5])
                            self._emit_alert(
                                Severity.WARNING, "pihole_lists",
                                f"🛡️ {len(failed)} Pi-hole blocklist(s) failed to update: {names}",
                            )
                            self._service_status["pihole_lists"] = {
                                "status": "degraded", "last_check": now,
                                "message": f"{len(failed)} list(s) inaccessible",
                                "response_time": None,
                            }
                        else:
                            enabled = [bl for bl in blocklists if bl.get("enabled")]
                            self._service_status["pihole_lists"] = {
                                "status": "up", "last_check": now,
                                "message": f"All {len(enabled)} active lists OK",
                                "response_time": None,
                            }
            except Exception:
                pass  # Non-critical — main status already set

        # 4. Quick DNS resolution test
        try:
            import subprocess
            result = subprocess.run(
                ["dig", "@127.0.0.1", "google.com", "+short", "+time=2", "+tries=1"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode != 0 or not result.stdout.strip():
                # Try nslookup as fallback
                result = subprocess.run(
                    ["nslookup", "google.com", "127.0.0.1"],
                    capture_output=True, text=True, timeout=5,
                )
                if result.returncode != 0:
                    self._service_status["pihole_dns"] = {
                        "status": "down", "last_check": now,
                        "message": "DNS resolution failing",
                        "response_time": None,
                    }
                    self._emit_alert(
                        Severity.CRITICAL, "pihole_dns",
                        "🛡️ Pi-hole DNS resolution is FAILING — devices can't resolve domains",
                    )
                    return
            self._service_status["pihole_dns"] = {
                "status": "up", "last_check": now,
                "message": "DNS resolving OK",
                "response_time": None,
            }
        except FileNotFoundError:
            pass  # dig/nslookup not installed — skip DNS test
        except Exception:
            pass

    # ── Systemd Service Checks ───────────────────────────────────────

    _CRITICAL_SERVICES = ["bmo", "docker"]
    _MONITORED_SERVICES = ["bmo", "docker", "bmo-dm-bot", "bmo-social-bot", "bmo-kiosk", "bmo-fan"]

    def _check_systemd_services(self):
        """Check critical systemd service units are active."""
        import subprocess
        now = time.time()

        for svc in self._MONITORED_SERVICES:
            key = f"svc_{svc.replace('-', '_')}"
            try:
                result = subprocess.run(
                    ["systemctl", "is-active", f"{svc}.service"],
                    capture_output=True, text=True, timeout=5,
                )
                state = result.stdout.strip()
                enabled_state = "unknown"
                try:
                    enabled_result = subprocess.run(
                        ["systemctl", "is-enabled", f"{svc}.service"],
                        capture_output=True, text=True, timeout=3,
                    )
                    enabled_state = enabled_result.stdout.strip() or "unknown"
                except Exception:
                    pass
                # Get service start time
                started_at = None
                try:
                    ts_result = subprocess.run(
                        ["systemctl", "show", f"{svc}.service", "--property=ActiveEnterTimestamp"],
                        capture_output=True, text=True, timeout=3,
                    )
                    ts_str = ts_result.stdout.strip().split("=", 1)[-1].strip()
                    if ts_str:
                        from datetime import datetime
                        dt = datetime.strptime(ts_str, "%a %Y-%m-%d %H:%M:%S %Z")
                        started_at = dt.timestamp()
                except Exception:
                    pass
                if state == "active":
                    self._service_status[key] = {
                        "status": "up", "last_check": now,
                        "message": "Running", "response_time": None,
                        "started_at": started_at,
                    }
                elif svc in self._OPTIONAL_DISABLED_SERVICES and enabled_state in {"disabled", "masked"}:
                    self._service_status[key] = {
                        "status": "info", "last_check": now,
                        "message": f"State: {state} (disabled by configuration)",
                        "response_time": None,
                    }
                else:
                    self._service_status[key] = {
                        "status": "down", "last_check": now,
                        "message": f"State: {state}", "response_time": None,
                    }
                    severity = Severity.CRITICAL if svc in self._CRITICAL_SERVICES else Severity.WARNING
                    label = self._service_label(key)
                    self._emit_alert(
                        severity, key,
                        f"⚙️ {label} is {state} — run: sudo systemctl restart {svc}",
                    )
            except Exception as e:
                self._service_status[key] = {
                    "status": "unknown", "last_check": now,
                    "message": str(e), "response_time": None,
                }

    # ── Network Interface Checks ─────────────────────────────────────

    def _check_network(self):
        """Check network interfaces are up and have IP addresses."""
        import subprocess
        now = time.time()

        for iface in ["wlan0", "eth0"]:
            key = f"net_{iface}"
            try:
                result = subprocess.run(
                    ["ip", "-j", "addr", "show", iface],
                    capture_output=True, text=True, timeout=5,
                )
                if result.returncode != 0:
                    self._service_status[key] = {
                        "status": "unknown", "last_check": now,
                        "message": "Interface not found", "response_time": None,
                    }
                    continue

                info = json.loads(result.stdout)
                if not info:
                    continue

                iface_info = info[0]
                operstate = iface_info.get("operstate", "UNKNOWN")
                ipv4_addrs = [
                    a["local"] for a in iface_info.get("addr_info", [])
                    if a.get("family") == "inet"
                ]

                if operstate == "UP" and ipv4_addrs:
                    self._service_status[key] = {
                        "status": "up", "last_check": now,
                        "message": f"{operstate} — {', '.join(ipv4_addrs)}",
                        "response_time": None,
                    }
                elif operstate == "UP" and not ipv4_addrs:
                    self._service_status[key] = {
                        "status": "degraded", "last_check": now,
                        "message": "UP but no IPv4 address",
                        "response_time": None,
                    }
                    if iface == "wlan0":
                        self._emit_alert(
                            Severity.CRITICAL, key,
                            f"📶 {iface} is UP but has no IP address — DHCP may have failed",
                        )
                else:
                    # eth0 DOWN is normal on Wi-Fi-only setups; do not treat as outage.
                    self._service_status[key] = {
                        "status": "down" if iface == "wlan0" else "info",
                        "last_check": now,
                        "message": (
                            f"{operstate} (no cable; expected if Wi-Fi is primary)"
                            if iface == "eth0"
                            else operstate
                        ),
                        "response_time": None,
                    }
                    if iface == "wlan0" and operstate != "UP":
                        self._emit_alert(
                            Severity.CRITICAL, key,
                            f"📶 Wi-Fi ({iface}) is {operstate} — Pi may be offline",
                        )
            except Exception as e:
                self._service_status[key] = {
                    "status": "unknown", "last_check": now,
                    "message": str(e), "response_time": None,
                }

    # ── Port Binding Checks ──────────────────────────────────────────

    _EXPECTED_PORTS = {
        53: "Pi-hole DNS",
        80: "Pi-hole Web",
        5000: "BMO Flask",
        9000: "PeerJS",
        11434: "Ollama",
    }

    @staticmethod
    def _is_local_port_reachable(port: int, host: str = "127.0.0.1", timeout: float = 0.5) -> bool:
        """Best-effort TCP connect check used to reduce false negatives from ss parsing."""
        import socket

        try:
            with socket.create_connection((host, port), timeout=timeout):
                return True
        except Exception:
            return False

    def _check_ports(self):
        """Verify critical ports are bound and listening."""
        import subprocess
        now = time.time()

        try:
            result = subprocess.run(
                ["ss", "-tlnH"],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode != 0:
                return

            listening_ports = set()
            for line in result.stdout.strip().split("\n"):
                parts = line.split()
                if len(parts) >= 4:
                    # local address is field 3, format: 0.0.0.0:PORT or [::]:PORT or *:PORT
                    addr = parts[3]
                    port_str = addr.rsplit(":", 1)[-1]
                    try:
                        listening_ports.add(int(port_str))
                    except ValueError:
                        pass

            missing = []
            for port, service in self._EXPECTED_PORTS.items():
                if port not in listening_ports:
                    if port == 5000 and self._is_local_port_reachable(5000):
                        continue
                    missing.append(f"{service} (:{port})")

            if missing:
                self._service_status["ports"] = {
                    "status": "degraded", "last_check": now,
                    "message": f"Not listening: {', '.join(missing)}",
                    "response_time": None,
                }
                self._emit_alert(
                    Severity.WARNING, "ports",
                    f"🔌 Expected ports not listening: {', '.join(missing)}",
                )
            else:
                self._service_status["ports"] = {
                    "status": "up", "last_check": now,
                    "message": f"All {len(self._EXPECTED_PORTS)} ports bound",
                    "response_time": None,
                }
        except Exception:
            pass

    # ── Internet Connectivity Check ──────────────────────────────────

    def _check_internet(self):
        """Check internet connectivity by pinging reliable endpoints."""
        targets = [
            ("dns_google", "https://dns.google/resolve?name=google.com&type=A"),
            ("cloudflare", "https://1.1.1.1/cdn-cgi/trace"),
        ]

        any_reachable = False
        for name, url in targets:
            if not self._session:
                break
            try:
                start = time.monotonic()
                r = self._session.get(url, timeout=5)
                elapsed = round(time.monotonic() - start, 3)
                if r.status_code == 200:
                    any_reachable = True
                    break
            except Exception:
                pass

        now = time.time()
        if any_reachable:
            self._service_status["internet"] = {
                "status": "up",
                "last_check": now,
                "message": "OK",
                "response_time": elapsed,
            }
        else:
            self._service_status["internet"] = {
                "status": "down",
                "last_check": now,
                "message": "No internet — all cloud APIs will fail",
                "response_time": None,
            }
            self._emit_alert(
                Severity.CRITICAL, "internet",
                "🌐 Internet is DOWN — cloud LLMs, STT, TTS, Calendar, Vision all offline. "
                "BMO will fall back to local Ollama.",
            )

    # ── Pi Power / Throttle Check ────────────────────────────────────

    def _check_pi_power(self):
        """Check Pi voltage/throttle flags via vcgencmd or /sys."""
        import subprocess

        now = time.time()
        throttle_flags = None

        try:
            result = subprocess.run(
                ["vcgencmd", "get_throttled"],
                capture_output=True, text=True, timeout=3,
            )
            if result.returncode == 0:
                # Output: throttled=0x50000 (or similar hex)
                val = result.stdout.strip().split("=")[-1]
                throttle_flags = int(val, 16)
        except (subprocess.TimeoutExpired, FileNotFoundError, ValueError):
            pass

        if throttle_flags is None:
            # Try sysfs fallback
            try:
                with open("/sys/devices/platform/soc/soc:firmware/get_throttled") as f:
                    throttle_flags = int(f.read().strip(), 16)
            except (FileNotFoundError, ValueError, PermissionError):
                self._service_status["pi_power"] = {
                    "status": "unknown",
                    "last_check": now,
                    "message": "Cannot read throttle status",
                    "response_time": None,
                }
                return

        # Decode throttle flags (bits):
        # 0: under-voltage detected
        # 1: arm frequency capped
        # 2: currently throttled
        # 3: soft temperature limit active
        # 16: under-voltage has occurred since boot
        # 17: arm frequency capped has occurred
        # 18: throttling has occurred
        # 19: soft temperature limit has occurred

        issues = []
        if throttle_flags & 0x1:
            issues.append("⚡ UNDER-VOLTAGE NOW — power supply too weak")
        if throttle_flags & 0x4:
            issues.append("🔥 THROTTLED NOW — CPU frequency reduced")
        if throttle_flags & 0x2:
            issues.append("⚠️ ARM frequency capped NOW")
        if throttle_flags & 0x8:
            issues.append("🌡️ Soft temperature limit active NOW")

        historical = []
        if throttle_flags & 0x10000:
            historical.append("under-voltage since boot")
        if throttle_flags & 0x40000:
            historical.append("throttled since boot")

        if issues:
            self._service_status["pi_power"] = {
                "status": "degraded",
                "last_check": now,
                "message": "; ".join(issues),
                "throttle_flags": hex(throttle_flags),
            }
            self._emit_alert(
                Severity.CRITICAL, "pi_power",
                " | ".join(issues) + (f" (flags: {hex(throttle_flags)})" if historical else ""),
            )
        else:
            msg = "OK"
            if historical:
                msg = f"OK now (past issues: {', '.join(historical)})"
            self._service_status["pi_power"] = {
                "status": "up",
                "last_check": now,
                "message": msg,
                "throttle_flags": hex(throttle_flags),
            }

    # ── Google Calendar Token Check ───────────────────────────────────

    def _check_calendar_token(self):
        """Check if Google Calendar OAuth token is present and valid."""
        now = time.time()
        try:
            credentials_path = (
                CALENDAR_CREDENTIALS_PATH
                if os.path.exists(CALENDAR_CREDENTIALS_PATH)
                else LEGACY_CALENDAR_CREDENTIALS_PATH
            )
            if not os.path.exists(credentials_path):
                self._service_status["google_calendar"] = {
                    "status": "down", "last_check": now,
                    "message": "credentials.json missing — add Google OAuth client credentials",
                    "response_time": None,
                }
                self._emit_alert(
                    Severity.CRITICAL, "google_calendar",
                    "📅 Google Calendar credentials.json missing — cannot authorize calendar",
                )
                return

            token_path = CALENDAR_TOKEN_PATH if os.path.exists(CALENDAR_TOKEN_PATH) else LEGACY_CALENDAR_TOKEN_PATH
            if not os.path.exists(token_path):
                self._service_status["google_calendar"] = {
                    "status": "down", "last_check": now,
                    "message": (
                        "token.json missing — use Calendar tab 'Authorize Calendar' "
                        "or run authorize_calendar.py"
                    ),
                    "response_time": None,
                }
                self._emit_alert(
                    Severity.CRITICAL, "google_calendar",
                    "📅 Google Calendar token missing — calendar features are down",
                )
                return

            # Check token age and validity
            stat = os.stat(token_path)
            age_days = (now - stat.st_mtime) / 86400

            # Try to parse token to check expiry
            try:
                with open(token_path, "r", encoding="utf-8") as f:
                    token_data = json.load(f)
                if not isinstance(token_data, dict):
                    raise ValueError("token.json root must be an object")

                refresh_token = token_data.get("refresh_token")
                access_token = token_data.get("token")
                if not access_token:
                    self._service_status["google_calendar"] = {
                        "status": "down", "last_check": now,
                        "message": "token.json missing access token — re-authorize calendar",
                        "response_time": None,
                    }
                    self._emit_alert(
                        Severity.CRITICAL, "google_calendar",
                        "📅 Calendar token missing access token — re-authorize required",
                    )
                    return
                expiry = token_data.get("expiry", "")
                if expiry:
                    from datetime import datetime
                    exp_dt = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
                    if exp_dt.timestamp() < now:
                        if not refresh_token:
                            self._service_status["google_calendar"] = {
                                "status": "down", "last_check": now,
                                "message": "Token expired and refresh token is missing",
                                "response_time": None,
                            }
                            self._emit_alert(
                                Severity.CRITICAL, "google_calendar",
                                "📅 Calendar token expired and cannot auto-refresh",
                            )
                            return
                        self._service_status["google_calendar"] = {
                            "status": "degraded", "last_check": now,
                            "message": "Token expired — waiting for auto-refresh",
                            "response_time": None,
                        }
                        self._emit_alert(
                            Severity.WARNING, "google_calendar",
                            "📅 Calendar token expired — waiting for refresh",
                        )
                        return

                if not refresh_token:
                    self._service_status["google_calendar"] = {
                        "status": "down", "last_check": now,
                        "message": "Token present but refresh token missing — re-authorize required",
                        "response_time": None,
                    }
                    self._emit_alert(
                        Severity.CRITICAL, "google_calendar",
                        "📅 Calendar token missing refresh token — re-authorization required",
                    )
                    return
            except Exception:
                self._service_status["google_calendar"] = {
                    "status": "down", "last_check": now,
                    "message": "token.json invalid — re-authorize calendar",
                    "response_time": None,
                }
                self._emit_alert(
                    Severity.CRITICAL, "google_calendar",
                    "📅 Calendar token is invalid — re-authorize required",
                )
                return

            self._service_status["google_calendar"] = {
                "status": "up", "last_check": now,
                "message": f"Token OK (modified {age_days:.0f}d ago)",
                "response_time": None,
            }
        except Exception as e:
            self._service_status["google_calendar"] = {
                "status": "unknown", "last_check": now,
                "message": str(e), "response_time": None,
            }

    # ── Cloudflare Tunnel Check ───────────────────────────────────────

    def _check_cloudflared(self):
        """Check if cloudflared tunnel service is running."""
        import subprocess
        now = time.time()
        try:
            result = subprocess.run(
                ["systemctl", "is-active", "cloudflared.service"],
                capture_output=True, text=True, timeout=5,
            )
            state = result.stdout.strip()
            if state == "active":
                config_ok = True
                config_msg = "Tunnel active"
                try:
                    with open("/etc/cloudflared/config.yml", "r", encoding="utf-8") as cfg:
                        cfg_text = cfg.read()
                    if "service: http://localhost:5000" not in cfg_text:
                        config_ok = False
                        config_msg = "Tunnel active, but ingress target is not localhost:5000"
                except FileNotFoundError:
                    config_ok = False
                    config_msg = "Tunnel active, but /etc/cloudflared/config.yml is missing"
                except Exception as cfg_err:
                    config_ok = False
                    config_msg = f"Tunnel active, config check failed: {cfg_err}"

                self._service_status["cloudflared"] = {
                    "status": "up" if config_ok else "degraded",
                    "last_check": now,
                    "message": config_msg,
                    "response_time": None,
                }
                if not config_ok:
                    self._emit_alert(
                        Severity.WARNING,
                        "cloudflared",
                        f"🌐 {config_msg}",
                    )
            else:
                self._service_status["cloudflared"] = {
                    "status": "down", "last_check": now,
                    "message": f"State: {state}", "response_time": None,
                }
        except Exception as e:
            self._service_status["cloudflared"] = {
                "status": "unknown", "last_check": now,
                "message": str(e), "response_time": None,
            }

    def _check_remote_access(self):
        """Check mDNS reachability and optional Tailscale status."""
        import subprocess

        now = time.time()
        mdns_host = f"{PI_HOSTNAME}.local"

        try:
            result = subprocess.run(
                ["avahi-resolve-host-name", mdns_host],
                capture_output=True, text=True, timeout=5,
            )
            if result.returncode == 0 and result.stdout.strip():
                self._service_status["mdns"] = {
                    "status": "up",
                    "last_check": now,
                    "message": result.stdout.strip(),
                    "response_time": None,
                }
            else:
                self._service_status["mdns"] = {
                    "status": "degraded",
                    "last_check": now,
                    "message": f"{mdns_host} not resolving",
                    "response_time": None,
                }
                self._emit_alert(
                    Severity.WARNING,
                    "mdns",
                    f"📡 {mdns_host} is not resolving via mDNS",
                )
        except FileNotFoundError:
            self._service_status["mdns"] = {
                "status": "unknown",
                "last_check": now,
                "message": "avahi-resolve-host-name not installed",
                "response_time": None,
            }
        except Exception as e:
            self._service_status["mdns"] = {
                "status": "unknown",
                "last_check": now,
                "message": str(e),
                "response_time": None,
            }

        try:
            status = subprocess.run(
                ["tailscale", "status", "--json"],
                capture_output=True, text=True, timeout=8,
            )
            if status.returncode == 0:
                self._service_status["tailscale"] = {
                    "status": "up",
                    "last_check": now,
                    "message": "Connected",
                    "response_time": None,
                }
            else:
                self._service_status["tailscale"] = {
                    "status": "degraded",
                    "last_check": now,
                    "message": status.stderr.strip() or "Installed but not connected",
                    "response_time": None,
                }
                self._emit_alert(
                    Severity.WARNING,
                    "tailscale",
                    "🔐 Tailscale is installed but not connected",
                )
        except FileNotFoundError:
            # Optional component: unknown is informational, not an error.
            self._service_status["tailscale"] = {
                "status": "unknown",
                "last_check": now,
                "message": "tailscale not installed",
                "response_time": None,
            }
        except Exception as e:
            self._service_status["tailscale"] = {
                "status": "unknown",
                "last_check": now,
                "message": str(e),
                "response_time": None,
            }

    # ── Rclone Check ─────────────────────────────────────────────────

    def _check_rclone(self):
        """Check if rclone is configured with remotes."""
        import subprocess
        now = time.time()
        try:
            result = subprocess.run(
                ["rclone", "listremotes"],
                capture_output=True, text=True, timeout=5,
            )
            remotes = [r.strip() for r in result.stdout.strip().split("\n") if r.strip()]
            if remotes:
                self._service_status["rclone"] = {
                    "status": "up", "last_check": now,
                    "message": f"{len(remotes)} remote(s): {', '.join(remotes)}",
                    "response_time": None,
                }
            else:
                self._service_status["rclone"] = {
                    "status": "down", "last_check": now,
                    "message": "No remotes configured",
                    "response_time": None,
                }
        except FileNotFoundError:
            self._service_status["rclone"] = {
                "status": "down", "last_check": now,
                "message": "rclone not installed",
                "response_time": None,
            }
        except Exception as e:
            self._service_status["rclone"] = {
                "status": "unknown", "last_check": now,
                "message": str(e), "response_time": None,
            }

    # ── State Transition Detection ───────────────────────────────────

    def _process_state_transitions(self):
        """Detect recovery events — service went from down/degraded to up."""
        for name, info in self._service_status.items():
            current = info.get("status", "unknown")
            previous = self._prev_status.get(name, "unknown")

            # Recovery: was down or degraded, now up
            if previous in ("down", "degraded") and current == "up":
                label = self._service_label(name)
                recovery_msg = f"✅ {label} has recovered and is back online"
                print(f"[monitor] RECOVERY: {name} is back up")

                if _send_discord_webhook(Severity.INFO, name, recovery_msg):
                    self._discord_last_fingerprint.pop(name, None)
                    self._save_discord_alert_state()

                if self.socketio:
                    self.socketio.emit("alert", {
                        "level": "info",
                        "service": name,
                        "message": recovery_msg,
                        "recovery": True,
                    })
                    self.socketio.emit("bmo_status", {"expression": "idle"})

    # ── Alert Emission ───────────────────────────────────────────────

    def _emit_alert(self, level: Severity, service: str, message: str):
        """Route an alert to all configured destinations.

        Routing rules:
        - All alerts: print log with [monitor] prefix
        - Critical + Warning: SocketIO 'alert' event
        - Critical: OLED face expression change (bmo_status: error)
        - Discord webhook: state-change-only dedupe (no repeated spam)
        - When service recovers: handled by _process_state_transitions
        """
        # Always log
        prefix = level.value.upper()
        print(f"[monitor] [{prefix}] {service}: {message}")

        # SocketIO for critical and warning
        if level in (Severity.CRITICAL, Severity.WARNING) and self.socketio:
            self.socketio.emit("alert", {
                "level": level.value,
                "service": service,
                "message": message,
            })

        # OLED face change for critical
        if level == Severity.CRITICAL and self.socketio:
            self.socketio.emit("bmo_status", {"expression": "error"})

        # Discord webhook for critical and warning (state-change dedupe)
        if level in (Severity.CRITICAL, Severity.WARNING):
            self._send_discord_if_allowed(level, service, message)

    def _send_discord_if_allowed(self, level: Severity, service: str, message: str):
        """Send Discord webhook only on state-change/new fingerprint."""
        status = self._service_status.get(service, {}).get("status", "unknown")
        fingerprint = self._alert_fingerprint(level, service, status, message)
        if self._discord_last_fingerprint.get(service) == fingerprint:
            return
        if _send_discord_webhook(level, service, message):
            self._discord_last_fingerprint[service] = fingerprint
            self._save_discord_alert_state()

    # ── Status Summary ───────────────────────────────────────────────

    def get_status(self) -> dict:
        """Return current status of all services plus Pi stats.

        Returns:
            Dict with per-service status (up/down/degraded), Pi resource stats,
            Docker container status, internet status, power status,
            and overall health summary.

        Used by the web UI status bar and /api/health/full endpoint.
        """
        services = {}
        for name, info in self._service_status.items():
            entry = {
                "status": info.get("status", "unknown"),
                "last_check": info.get("last_check"),
                "message": info.get("message", ""),
                "response_time": info.get("response_time"),
            }
            # Include extra fields if present
            if "stats" in info:
                entry["stats"] = info["stats"]
            if "throttle_flags" in info:
                entry["throttle_flags"] = info["throttle_flags"]
            if "started_at" in info:
                entry["started_at"] = info["started_at"]
            if "source_check" in info:
                entry["source_check"] = info["source_check"]
            if "recommended_action" in info:
                entry["recommended_action"] = info["recommended_action"]
            if "failure_count" in info:
                entry["failure_count"] = info["failure_count"]
            if "last_error" in info:
                entry["last_error"] = info["last_error"]
            if "last_change" in info:
                entry["last_change"] = info["last_change"]
            entry["label"] = self._service_label(name)
            services[name] = entry

        # Collect recent errors for services and containers
        import subprocess
        for name in list(services.keys()):
            errors = []
            try:
                if name.startswith("svc_"):
                    svc = name[4:].replace("_", "-")
                    r = subprocess.run(
                        ["journalctl", "-u", f"{svc}.service", "--no-pager",
                         "-n", "50", "--since", "-1h", "-p", "err"],
                        capture_output=True, text=True, timeout=5,
                    )
                    lines = [l.strip() for l in r.stdout.strip().split("\n")
                             if l.strip() and "-- No entries --" not in l
                             and not l.startswith("--")]
                    errors = lines[-3:] if lines else []
                elif name.startswith("docker_"):
                    container = name[7:]
                    r = subprocess.run(
                        ["docker", "logs", "--tail", "20", "--since", "1h", container],
                        capture_output=True, text=True, timeout=5,
                    )
                    combined = r.stdout + r.stderr
                    err_lines = [l.strip() for l in combined.split("\n")
                                 if any(w in l.lower() for w in ["error", "fail", "traceback", "exception", "critical"])
                                 and "npm warn" not in l.lower()
                                 and "deprecated" not in l.lower()
                                 and "info" not in l.lower().split()[0:1]]
                    errors = err_lines[-3:] if err_lines else []
            except Exception:
                pass
            if errors:
                services[name]["recent_errors"] = errors

        pi_stats = get_pi_stats()

        # Overall health:
        # - critical: required services are down
        # - warning: any non-required service is down OR any service is degraded
        # - healthy: no down/degraded services
        overall = "healthy"
        down_services = []
        down_required_services = []
        down_noncritical_services = []
        degraded_services = []
        info_services = []
        for name, info in self._service_status.items():
            status = info.get("status", "unknown")
            if status == "down":
                down_services.append(name)
                if name in self._REQUIRED_FOR_OVERALL:
                    down_required_services.append(name)
                else:
                    down_noncritical_services.append(name)
            elif status == "degraded":
                degraded_services.append(name)
            elif status == "info":
                info_services.append(name)

        if down_required_services:
            overall = "critical"
        elif down_noncritical_services or degraded_services:
            overall = "warning"

        # Get Pi uptime
        pi_uptime = None
        try:
            with open("/proc/uptime") as f:
                pi_uptime = float(f.read().split()[0])
        except Exception:
            pass

        return {
            "overall": overall,
            "down_services": down_services,
            "down_required_services": down_required_services,
            "down_noncritical_services": down_noncritical_services,
            "degraded_services": degraded_services,
            "info_services": info_services,
            "services": services,
            "pi_stats": pi_stats,
            "check_interval": self.check_interval,
            "pi_uptime": pi_uptime,
            "server_time": time.time(),
        }

    # ── Manual Alert Injection ───────────────────────────────────────

    def inject_alert(self, level: Severity, service: str, message: str):
        """Manually inject an alert into the system (e.g., from SNS handler).

        Args:
            level: Severity level (info/warning/critical).
            service: Service name that triggered the alert.
            message: Human-readable alert message.
        """
        self._emit_alert(level, service, message)

        # Also update service status
        status = "down" if level == Severity.CRITICAL else "degraded"
        self._service_status[service] = {
            "status": status,
            "last_check": time.time(),
            "message": message,
            "response_time": None,
        }
