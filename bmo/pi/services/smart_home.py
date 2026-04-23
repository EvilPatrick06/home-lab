"""BMO Smart Home — PyChromecast control for Google TV, Google Home speakers."""

import threading
import time

import pychromecast


class SmartHomeService:
    """Discovers and controls Chromecast-compatible devices (Google TV, Nest speakers, etc.)."""

    def __init__(self, socketio=None):
        self.socketio = socketio
        self._chromecasts: dict[str, pychromecast.Chromecast] = {}
        self._browser = None
        self._discovery_thread = None

    # ── Discovery ────────────────────────────────────────────────────

    def discover(self, timeout: float = 10.0):
        """Discover Chromecast devices on the local network."""
        services, browser = pychromecast.discovery.discover_chromecasts()
        pychromecast.discovery.stop_discovery(browser)

        chromecasts, self._browser = pychromecast.get_chromecasts()
        for cc in chromecasts:
            cc.wait(timeout=5)
            self._chromecasts[cc.cast_info.friendly_name] = cc
            print(f"[cast] Found: {cc.cast_info.friendly_name} ({cc.cast_info.model_name})")

    def start_discovery(self):
        """Start background discovery (re-discovers every 60 seconds)."""
        self._discovery_thread = threading.Thread(target=self._discovery_loop, daemon=True)
        self._discovery_thread.start()

    def _discovery_loop(self):
        while True:
            try:
                self.discover()
            except Exception as e:
                print(f"[cast] Discovery error: {e}")
            time.sleep(60)

    def get_devices(self) -> list[dict]:
        """Return list of discovered Chromecast devices."""
        devices = []
        for name, cc in self._chromecasts.items():
            devices.append({
                "name": name,
                "model": cc.cast_info.model_name,
                "uuid": str(cc.cast_info.uuid),
                "host": cc.cast_info.host,
                "port": cc.cast_info.port,
                "status": self._get_device_status(cc),
            })
        return devices

    def get_cast(self, friendly_name: str) -> pychromecast.Chromecast | None:
        """Get a Chromecast instance by its friendly name."""
        return self._chromecasts.get(friendly_name)

    # ── Playback Control ─────────────────────────────────────────────

    def play(self, device_name: str):
        """Resume playback on a device."""
        cc = self.get_cast(device_name)
        if cc:
            cc.media_controller.play()

    def pause(self, device_name: str):
        """Pause playback on a device."""
        cc = self.get_cast(device_name)
        if cc:
            cc.media_controller.pause()

    def stop(self, device_name: str):
        """Stop playback on a device."""
        cc = self.get_cast(device_name)
        if cc:
            cc.media_controller.stop()

    def play_media(self, device_name: str, url: str, content_type: str = "video/mp4", **kwargs):
        """Cast media to a device."""
        cc = self.get_cast(device_name)
        if cc:
            mc = cc.media_controller
            mc.play_media(url, content_type, **kwargs)
            mc.block_until_active(timeout=10)

    # ── Volume ───────────────────────────────────────────────────────

    def set_volume(self, device_name: str, level: float):
        """Set volume (0.0 to 1.0) on a device."""
        cc = self.get_cast(device_name)
        if cc:
            cc.set_volume(max(0.0, min(1.0, level)))

    def get_volume(self, device_name: str) -> float:
        """Get current volume level of a device."""
        cc = self.get_cast(device_name)
        if cc:
            return cc.status.volume_level
        return 0.0

    def mute(self, device_name: str, muted: bool = True):
        """Mute or unmute a device."""
        cc = self.get_cast(device_name)
        if cc:
            cc.set_volume_muted(muted)

    # ── App Control ──────────────────────────────────────────────────

    def launch_app(self, device_name: str, app_id: str):
        """Launch an app on a Chromecast device."""
        cc = self.get_cast(device_name)
        if cc:
            cc.start_app(app_id)

    def quit_app(self, device_name: str):
        """Quit the current app (turn off casting)."""
        cc = self.get_cast(device_name)
        if cc:
            cc.quit_app()

    # ── Status ───────────────────────────────────────────────────────

    def get_status(self, device_name: str) -> dict:
        """Get the current status of a device."""
        cc = self.get_cast(device_name)
        if not cc:
            return {"error": f"Device '{device_name}' not found"}

        status = cc.status
        media_status = cc.media_controller.status if cc.media_controller else None

        result = {
            "name": device_name,
            "volume": status.volume_level,
            "muted": status.volume_muted,
            "app": status.display_name,
            "is_idle": status.is_stand_by,
        }

        if media_status and media_status.player_state:
            result["media"] = {
                "state": media_status.player_state,
                "title": media_status.title,
                "artist": media_status.artist,
                "album": media_status.album_name,
                "duration": media_status.duration,
                "position": media_status.current_time,
                "content_type": media_status.content_type,
            }

        return result

    # ── Helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _get_device_status(cc: pychromecast.Chromecast) -> str:
        if cc.status.is_stand_by:
            return "idle"
        if cc.status.display_name:
            return f"running: {cc.status.display_name}"
        return "active"

    def cleanup(self):
        """Disconnect from all devices."""
        if self._browser:
            pychromecast.discovery.stop_discovery(self._browser)
        for cc in self._chromecasts.values():
            cc.disconnect()
        self._chromecasts.clear()
