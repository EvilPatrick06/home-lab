"""BMO TV Controller — ADB-based Android TV control with auto-skip.

Connects to an Android TV over WiFi via ADB for deep app control:
media playback, volume, app launching, navigation, and automatic
skip intro/outro/credits detection.
"""

import os
import re
import threading
import time
import xml.etree.ElementTree as ET

try:
    from ppadb.client import Client as AdbClient
    ADB_AVAILABLE = True
except ImportError:
    ADB_AVAILABLE = False


# ── Configuration ────────────────────────────────────────────────────

TV_IP = os.environ.get("TV_IP", "")
ADB_PORT = 5555
ADB_HOST = "127.0.0.1"       # Local ADB server address
ADB_SERVER_PORT = 5037        # Local ADB server port
RECONNECT_INTERVAL = 10       # Seconds between reconnect attempts
AUTO_SKIP_POLL_INTERVAL = 3   # Seconds between UI tree polls


# ── App Package Mapping ──────────────────────────────────────────────

APP_PACKAGES = {
    "netflix": "com.netflix.ninja/.MainActivity",
    "crunchyroll": "com.crunchyroll.crunchyroid/.Main",
    "youtube": "com.google.android.youtube.tv/com.google.android.apps.youtube.tv.activity.ShellActivity",
    "disney": "com.disney.disneyplus/.MainEntryPointActivity",
    "hulu": "com.hulu.plus/.WelcomeActivity",
    "plex": "com.plexapp.android/.activity.SplashActivity",
    "spotify": "com.spotify.tv.android/.SpotifyTVActivity",
}


# ── Skip Button Patterns ────────────────────────────────────────────
# Maps app package prefixes to regex patterns matching skip button text

SKIP_PATTERNS = {
    "com.netflix": re.compile(
        r"(?i)(skip\s+intro|skip\s+recap|skip\s+credits|skip\s+outro)", re.IGNORECASE
    ),
    "com.crunchyroll": re.compile(
        r"(?i)(skip|skip\s+opening|skip\s+ending)", re.IGNORECASE
    ),
    "com.google.android.youtube": re.compile(
        r"(?i)(skip\s+ad[s]?|skip)", re.IGNORECASE
    ),
    "com.disney": re.compile(
        r"(?i)(skip\s+intro|skip\s+recap)", re.IGNORECASE
    ),
    "com.hulu": re.compile(
        r"(?i)(skip|skip\s+intro|skip\s+credits)", re.IGNORECASE
    ),
}

# Fallback pattern for any app not explicitly listed
_FALLBACK_SKIP_PATTERN = re.compile(
    r"(?i)(skip\s+intro|skip\s+recap|skip\s+credits|skip\s+outro|skip\s+ad[s]?|skip\s+opening|skip\s+ending)",
    re.IGNORECASE,
)


# ── Bounds Parser ────────────────────────────────────────────────────

def _parse_bounds(bounds_str: str) -> tuple[int, int, int, int] | None:
    """Parse Android UI bounds string '[x1,y1][x2,y2]' into (x1, y1, x2, y2)."""
    match = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", bounds_str)
    if match:
        return tuple(int(v) for v in match.groups())
    return None


def _bounds_center(x1: int, y1: int, x2: int, y2: int) -> tuple[int, int]:
    """Return the center point of a bounds rectangle."""
    return (x1 + x2) // 2, (y1 + y2) // 2


class TvController:
    """ADB-based Android TV controller with auto-skip support.

    Connects to an Android TV over WiFi and provides media control,
    app launching, navigation, and automatic skip intro/credits detection.
    """

    def __init__(self):
        self._client = None
        self._device = None
        self._connected = False
        self._lock = threading.Lock()

        # Auto-skip state
        self._auto_skip_enabled = False
        self._auto_skip_apps: set[str] = set()
        self._auto_skip_thread = None

    # ── Connection Management ────────────────────────────────────────

    def connect(self, tv_ip: str = "") -> bool:
        """Connect to the Android TV via ADB over WiFi.

        Args:
            tv_ip: IP address of the TV. Falls back to TV_IP env var.

        Returns:
            True if connection succeeded.
        """
        if not ADB_AVAILABLE:
            print("[tv] pure-python-adb not available — install with: pip install pure-python-adb")
            return False

        ip = tv_ip or TV_IP
        if not ip:
            print("[tv] No TV IP configured — set TV_IP environment variable")
            return False

        try:
            self._client = AdbClient(host=ADB_HOST, port=ADB_SERVER_PORT)
            self._client.remote_connect(ip, ADB_PORT)
            devices = self._client.devices()

            # Find our device in the connected list
            target = f"{ip}:{ADB_PORT}"
            for device in devices:
                if device.serial == target:
                    self._device = device
                    self._connected = True
                    print(f"[tv] Connected to {target}")
                    return True

            print(f"[tv] Device {target} not found after connect")
            return False

        except Exception as e:
            print(f"[tv] Connection failed: {e}")
            self._connected = False
            return False

    def disconnect(self):
        """Disconnect from the TV."""
        if self._client and TV_IP:
            try:
                self._client.remote_disconnect(TV_IP, ADB_PORT)
            except Exception:
                pass
        self._device = None
        self._connected = False
        self.stop_auto_skip()
        print("[tv] Disconnected")

    def _ensure_connected(self) -> bool:
        """Check connection and attempt reconnect if needed."""
        if self._connected and self._device:
            try:
                # Quick health check — list packages is lightweight
                self._device.shell("echo ok")
                return True
            except Exception:
                print("[tv] Connection lost, attempting reconnect...")
                self._connected = False

        return self.connect()

    def _shell(self, command: str) -> str:
        """Execute an ADB shell command. Returns output or empty string on failure."""
        with self._lock:
            if not self._ensure_connected():
                return ""
            try:
                result = self._device.shell(command)
                return result if result else ""
            except Exception as e:
                print(f"[tv] Shell command failed: {e}")
                self._connected = False
                return ""

    # ── Key Input ────────────────────────────────────────────────────

    def _send_key(self, keycode: str):
        """Send a keycode event to the TV."""
        self._shell(f"input keyevent {keycode}")

    def _tap(self, x: int, y: int):
        """Tap a point on the screen."""
        self._shell(f"input tap {x} {y}")

    # ── Power ────────────────────────────────────────────────────────

    def power_toggle(self):
        """Toggle TV power on/off."""
        self._send_key("KEYCODE_POWER")
        print("[tv] Power toggled")

    # ── App Launching ────────────────────────────────────────────────

    def open_app(self, app_name: str) -> bool:
        """Launch an app by friendly name.

        Args:
            app_name: Friendly name like 'netflix', 'youtube', etc.

        Returns:
            True if the app launch command was sent.
        """
        name = app_name.lower().strip()
        package = APP_PACKAGES.get(name)
        if not package:
            print(f"[tv] Unknown app: {app_name}")
            print(f"[tv] Available apps: {', '.join(sorted(APP_PACKAGES.keys()))}")
            return False

        result = self._shell(f"am start -n {package}")
        if "Error" in result:
            print(f"[tv] Failed to launch {app_name}: {result}")
            return False

        print(f"[tv] Launched {app_name}")
        return True

    # ── Media Playback ───────────────────────────────────────────────

    def pause(self):
        """Pause media playback."""
        self._send_key("KEYCODE_MEDIA_PAUSE")
        print("[tv] Paused")

    def play(self):
        """Resume media playback."""
        self._send_key("KEYCODE_MEDIA_PLAY")
        print("[tv] Playing")

    def next_episode(self):
        """Skip to the next episode/track."""
        self._send_key("KEYCODE_MEDIA_NEXT")
        print("[tv] Next episode")

    # ── Volume ───────────────────────────────────────────────────────

    def volume_up(self):
        """Increase volume by one step."""
        self._send_key("KEYCODE_VOLUME_UP")

    def volume_down(self):
        """Decrease volume by one step."""
        self._send_key("KEYCODE_VOLUME_DOWN")

    def mute(self):
        """Toggle mute/unmute."""
        self._send_key("KEYCODE_VOLUME_MUTE")
        print("[tv] Mute toggled")

    def set_volume(self, level: int):
        """Set volume to a specific level (0-100).

        Works by first muting (volume 0) then pressing volume up
        the appropriate number of times. Android TV typically has
        ~15 volume steps, so we scale accordingly.
        """
        level = max(0, min(100, level))

        # Most Android TVs have 15 volume steps — scale 0-100 to 0-15
        max_steps = 15
        target_steps = round(level / 100 * max_steps)

        # Set to 0 first by pressing volume down many times
        for _ in range(max_steps + 5):
            self._shell("input keyevent KEYCODE_VOLUME_DOWN")
            time.sleep(0.05)

        # Press volume up to target
        for _ in range(target_steps):
            self._shell("input keyevent KEYCODE_VOLUME_UP")
            time.sleep(0.05)

        print(f"[tv] Volume set to ~{level}%")

    def get_volume(self) -> int | None:
        """Get current volume level (0-15 scale). Returns None if unavailable."""
        result = self._shell("dumpsys audio | grep -A5 'STREAM_MUSIC'")
        if result:
            match = re.search(r"volume:\s*(\d+)", result)
            if match:
                return int(match.group(1))
        return None

    # ── Navigation ───────────────────────────────────────────────────

    def back(self):
        """Press the back button."""
        self._send_key("KEYCODE_BACK")

    def home(self):
        """Press the home button."""
        self._send_key("KEYCODE_HOME")

    def navigate(self, direction: str):
        """Navigate with d-pad: up, down, left, right, enter/select."""
        key_map = {
            "up": "KEYCODE_DPAD_UP",
            "down": "KEYCODE_DPAD_DOWN",
            "left": "KEYCODE_DPAD_LEFT",
            "right": "KEYCODE_DPAD_RIGHT",
            "enter": "KEYCODE_DPAD_CENTER",
            "select": "KEYCODE_DPAD_CENTER",
            "ok": "KEYCODE_DPAD_CENTER",
        }
        keycode = key_map.get(direction.lower())
        if keycode:
            self._send_key(keycode)
        else:
            print(f"[tv] Unknown direction: {direction}")

    def switch_input(self):
        """Cycle TV input sources."""
        self._send_key("KEYCODE_TV_INPUT")
        print("[tv] Input switched")

    def rewind(self):
        """Rewind media playback."""
        self._send_key("KEYCODE_MEDIA_REWIND")
        print("[tv] Rewinding")

    def fast_forward(self):
        """Fast forward media playback."""
        self._send_key("KEYCODE_MEDIA_FAST_FORWARD")
        print("[tv] Fast forwarding")

    def previous(self):
        """Go to previous track/episode."""
        self._send_key("KEYCODE_MEDIA_PREVIOUS")
        print("[tv] Previous")

    def get_installed_apps(self) -> list[dict]:
        """List installed third-party apps on the TV."""
        result = self._shell("pm list packages -3")
        if not result:
            return []
        apps = []
        for line in result.strip().split("\n"):
            pkg = line.replace("package:", "").strip()
            if pkg:
                # Map known packages to friendly names
                friendly = None
                for name, full_pkg in APP_PACKAGES.items():
                    if pkg == full_pkg.split("/")[0]:
                        friendly = name
                        break
                apps.append({"package": pkg, "name": friendly or pkg})
        return apps

    # ── Skip Button Detection ────────────────────────────────────────

    def _get_ui_tree(self) -> str:
        """Dump the current UI hierarchy XML from the TV."""
        # uiautomator dump writes to a file on the device, then we read it
        self._shell("uiautomator dump /dev/tty")
        # Some devices need the file-based approach
        result = self._shell("uiautomator dump /sdcard/ui_dump.xml && cat /sdcard/ui_dump.xml")
        if result and "<?xml" in result:
            # Extract just the XML portion
            xml_start = result.index("<?xml")
            return result[xml_start:]
        return ""

    def _detect_skip_button(self) -> tuple[int, int] | None:
        """Scan the TV UI tree for a skip button and return its tap coordinates.

        Returns:
            (x, y) center coordinates of the skip button, or None if not found.
        """
        xml_str = self._get_ui_tree()
        if not xml_str:
            return None

        try:
            root = ET.fromstring(xml_str)
        except ET.ParseError:
            return None

        # Determine which skip pattern to use based on current app
        current_app = self.get_current_app()
        pattern = _FALLBACK_SKIP_PATTERN
        for prefix, p in SKIP_PATTERNS.items():
            if current_app.startswith(prefix):
                pattern = p
                break

        # Search all nodes for skip button text
        for node in root.iter("node"):
            text = node.get("text", "")
            content_desc = node.get("content-desc", "")
            resource_id = node.get("resource-id", "")

            # Check text, content description, and resource ID
            searchable = f"{text} {content_desc} {resource_id}"
            if pattern.search(searchable):
                bounds_str = node.get("bounds", "")
                bounds = _parse_bounds(bounds_str)
                if bounds:
                    cx, cy = _bounds_center(*bounds)
                    print(f"[tv] Skip button found: '{text or content_desc}' at ({cx}, {cy})")
                    return (cx, cy)

        return None

    def skip_button(self) -> bool:
        """Detect and tap the skip intro/outro/credits button.

        Returns:
            True if a skip button was found and tapped.
        """
        coords = self._detect_skip_button()
        if coords:
            self._tap(*coords)
            print(f"[tv] Tapped skip button at {coords}")
            return True
        return False

    # ── Auto-Skip Mode ───────────────────────────────────────────────

    def start_auto_skip(self, apps: list[str] | None = None):
        """Enable auto-skip mode. Polls the UI for skip buttons during playback.

        Args:
            apps: List of app names to auto-skip for (e.g. ['netflix', 'crunchyroll']).
                  If None, auto-skips for all known apps.
        """
        if apps is not None:
            self._auto_skip_apps = {a.lower().strip() for a in apps}
        else:
            self._auto_skip_apps = set(APP_PACKAGES.keys())

        if self._auto_skip_enabled:
            print(f"[tv] Auto-skip already running, updated apps: {self._auto_skip_apps}")
            return

        self._auto_skip_enabled = True
        self._auto_skip_thread = threading.Thread(target=self._auto_skip_loop, daemon=True)
        self._auto_skip_thread.start()
        print(f"[tv] Auto-skip started for: {', '.join(sorted(self._auto_skip_apps))}")

    def stop_auto_skip(self):
        """Disable auto-skip mode."""
        if not self._auto_skip_enabled:
            return
        self._auto_skip_enabled = False
        print("[tv] Auto-skip stopped")

    def set_auto_skip_app(self, app: str, enabled: bool):
        """Enable or disable auto-skip for a specific app.

        Args:
            app: App friendly name (e.g. 'netflix').
            enabled: Whether to auto-skip for this app.
        """
        name = app.lower().strip()
        if enabled:
            self._auto_skip_apps.add(name)
            print(f"[tv] Auto-skip enabled for {name}")
        else:
            self._auto_skip_apps.discard(name)
            print(f"[tv] Auto-skip disabled for {name}")

    def _auto_skip_loop(self):
        """Background loop that polls the UI tree for skip buttons."""
        while self._auto_skip_enabled:
            try:
                if not self._connected:
                    time.sleep(RECONNECT_INTERVAL)
                    continue

                # Check if current app is in the auto-skip list
                current_app = self.get_current_app()
                app_matched = False
                for friendly_name, package in APP_PACKAGES.items():
                    pkg_prefix = package.split("/")[0]
                    if current_app.startswith(pkg_prefix) and friendly_name in self._auto_skip_apps:
                        app_matched = True
                        break

                if app_matched and self.is_playing():
                    coords = self._detect_skip_button()
                    if coords:
                        self._tap(*coords)
                        print(f"[tv] Auto-skipped intro at {coords}")
                        # Brief cooldown after a skip to avoid double-taps
                        time.sleep(5)
                        continue

            except Exception as e:
                print(f"[tv] Auto-skip error: {e}")

            time.sleep(AUTO_SKIP_POLL_INTERVAL)

    # ── TV Status ────────────────────────────────────────────────────

    def get_current_app(self) -> str:
        """Get the package name of the current foreground app.

        Returns:
            Package name string, or empty string if unavailable.
        """
        result = self._shell("dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'")
        if not result:
            return ""

        # Extract package name from window dump
        # Format: "mCurrentFocus=Window{... com.netflix.ninja/com.netflix.ninja.MainActivity}"
        match = re.search(r"(\S+/\S+)\}", result)
        if match:
            # Return just the package name (before the /)
            full = match.group(1)
            return full.split("/")[0]

        # Try alternative format
        match = re.search(r"u0\s+(\S+)/", result)
        if match:
            return match.group(1)

        return ""

    def get_current_media(self) -> dict:
        """Get information about currently playing media.

        Returns:
            Dict with keys: app, title, state, artist, album.
            Empty dict if no media session is active.
        """
        result = self._shell("dumpsys media_session")
        if not result:
            return {}

        info = {}

        # Extract active session package
        pkg_match = re.search(r"package=(\S+)", result)
        if pkg_match:
            info["app"] = pkg_match.group(1)

        # Extract metadata
        title_match = re.search(r"description=([^\n,]+)", result)
        if title_match:
            info["title"] = title_match.group(1).strip()

        # Try more specific metadata fields
        for field in ("METADATA_KEY_TITLE", "android.media.metadata.TITLE"):
            match = re.search(rf"{field}=([^\n,]+)", result)
            if match:
                info["title"] = match.group(1).strip()
                break

        for field in ("METADATA_KEY_ARTIST", "android.media.metadata.ARTIST"):
            match = re.search(rf"{field}=([^\n,]+)", result)
            if match:
                info["artist"] = match.group(1).strip()
                break

        for field in ("METADATA_KEY_ALBUM", "android.media.metadata.ALBUM"):
            match = re.search(rf"{field}=([^\n,]+)", result)
            if match:
                info["album"] = match.group(1).strip()
                break

        # Extract playback state
        state_match = re.search(r"state=PlaybackState\{state=(\d+)", result)
        if state_match:
            state_code = int(state_match.group(1))
            state_names = {
                0: "none",
                1: "stopped",
                2: "paused",
                3: "playing",
                4: "fast_forwarding",
                5: "rewinding",
                6: "buffering",
                7: "error",
                8: "connecting",
                9: "skipping_to_previous",
                10: "skipping_to_next",
                11: "skipping_to_queue_item",
            }
            info["state"] = state_names.get(state_code, f"unknown({state_code})")

        return info

    def is_playing(self) -> bool:
        """Check if media is currently playing.

        Returns:
            True if an active media session is in the 'playing' state.
        """
        media = self.get_current_media()
        return media.get("state") == "playing"

    # ── Status Summary ───────────────────────────────────────────────

    def get_status(self) -> dict:
        """Get a full status summary of the TV.

        Returns:
            Dict with connection state, current app, media info, and auto-skip state.
        """
        status = {
            "connected": self._connected,
            "auto_skip_enabled": self._auto_skip_enabled,
            "auto_skip_apps": sorted(self._auto_skip_apps),
        }

        if self._connected:
            status["current_app"] = self.get_current_app()
            status["media"] = self.get_current_media()

        return status

    # ── Cleanup ──────────────────────────────────────────────────────

    def cleanup(self):
        """Stop all background tasks and disconnect."""
        self.stop_auto_skip()
        self.disconnect()
        print("[tv] Cleaned up")
