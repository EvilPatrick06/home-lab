"""Scene mode engine for BMO.

Manages scene activation/deactivation with state save/restore.
Built-in scenes: anime, bedtime, movie, party.
"""

import json
import os
import threading
import time

from services.bmo_logging import get_logger
log = get_logger("scene_service")

SETTINGS_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "settings.json")

BUILTIN_SCENES = {
    "anime": {
        "label": "🎌 Anime Mode",
        "rgb_off": True,
        "tv_app": "crunchyroll",
        "tv_on": True,
        "music_stop": True,
    },
    "bedtime": {
        "label": "🌙 Bedtime",
        "rgb_off": True,
        "tv_off": True,
        "music_stop": True,
    },
    "movie": {
        "label": "🎬 Movie Mode",
        "rgb_off": True,
        "tv_app": "plex",
        "tv_on": True,
        "music_stop": True,
    },
    "party": {
        "label": "🎉 Party Mode",
        "rgb_mode": "rainbow",
        "rgb_brightness": 255,
        "tv_off": True,
        "music_playlist": "party",
    },
}


def _load_custom_scenes() -> dict:
    """Load custom scenes from settings.json."""
    try:
        if os.path.exists(SETTINGS_PATH):
            with open(SETTINGS_PATH, "r") as f:
                settings = json.load(f)
            return settings.get("custom_scenes", {})
    except Exception as e:
        log.exception(f"[scene] Failed to load custom scenes")
    return {}


def _save_custom_scenes(custom: dict):
    """Save custom scenes to settings.json."""
    try:
        os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
        settings = {}
        if os.path.exists(SETTINGS_PATH):
            with open(SETTINGS_PATH, "r") as f:
                settings = json.load(f)
        settings["custom_scenes"] = custom
        with open(SETTINGS_PATH, "w") as f:
            json.dump(settings, f, indent=2)
    except Exception as e:
        log.exception(f"[scene] Failed to save custom scenes")


def _get_all_scenes() -> dict:
    """Merge built-in and custom scenes. Custom scenes override builtins with same name."""
    merged = dict(BUILTIN_SCENES)
    merged.update(_load_custom_scenes())
    return merged


# Backward-compatible alias
SCENES = BUILTIN_SCENES


class SceneService:
    """Manages scene activation with state save/restore."""

    def __init__(self, services: dict, socketio=None):
        self._services = services
        self._socketio = socketio
        self._lock = threading.RLock()
        self._active_scene: str | None = None
        self._saved_state: dict = {}
        self._load_state()

    # ── Public API ──────────────────────────────────────────────────

    def list_scenes(self) -> list[dict]:
        """List all available scenes (built-in + custom) with active status and full config."""
        result = []
        custom_scenes = _load_custom_scenes()
        for name, config in BUILTIN_SCENES.items():
            result.append({
                "name": name,
                "label": config.get("label", name),
                "active": self._active_scene == name,
                "is_builtin": True,
                **config,
            })
        for name, config in custom_scenes.items():
            if name not in BUILTIN_SCENES:
                result.append({
                    "name": name,
                    "label": config.get("label", name),
                    "active": self._active_scene == name,
                    "is_builtin": False,
                    **config,
                })
        return result

    def get_active(self) -> str | None:
        """Get the currently active scene name, or None."""
        return self._active_scene

    def activate(self, scene_name: str) -> tuple[bool, str]:
        """Activate a scene. Saves current state first."""
        scene_name = scene_name.lower().strip()
        all_scenes = _get_all_scenes()
        if scene_name not in all_scenes:
            return False, f"Unknown scene: {scene_name}. Available: {', '.join(all_scenes.keys())}"

        with self._lock:
            # If already in a scene, deactivate first (don't overwrite saved state)
            if self._active_scene and self._active_scene != scene_name:
                self._apply_deactivation(skip_restore=True)

            # Save current state before applying scene (only if not already in a scene)
            if not self._active_scene:
                self._saved_state = self._capture_state()

            self._active_scene = scene_name
            self._save_state()

        # Apply scene settings
        scene = all_scenes[scene_name]
        self._apply_scene(scene)

        if self._socketio:
            self._socketio.emit("scene_change", {"scene": scene_name, "active": True})

        return True, f"{scene['label']} activated"

    def deactivate(self) -> tuple[bool, str]:
        """Deactivate current scene and restore previous state."""
        with self._lock:
            if not self._active_scene:
                return False, "No scene is active"
            scene_name = self._active_scene
            all_scenes = _get_all_scenes()
            label = all_scenes.get(scene_name, {}).get("label", scene_name)

        self._apply_deactivation(skip_restore=False)

        if self._socketio:
            self._socketio.emit("scene_change", {"scene": None, "active": False})

        return True, f"{label} deactivated — restored previous state"

    def get_status(self) -> dict:
        """Get full scene status for API."""
        all_scenes = _get_all_scenes()
        return {
            "active": self._active_scene,
            "label": all_scenes.get(self._active_scene, {}).get("label") if self._active_scene else None,
            "scenes": self.list_scenes(),
        }

    def get_scene(self, name: str) -> dict | None:
        """Return full config for a scene."""
        all_scenes = _get_all_scenes()
        return all_scenes.get(name)

    def create_scene(self, name: str, config: dict) -> tuple[bool, str]:
        """Create a new custom scene."""
        key = name.lower().strip().replace(" ", "_")
        if key in BUILTIN_SCENES:
            return False, f"Cannot overwrite built-in scene: {key}"
        custom = _load_custom_scenes()
        if key in custom:
            return False, f"Scene '{key}' already exists — use update instead"
        if "label" not in config:
            config["label"] = name
        custom[key] = config
        _save_custom_scenes(custom)
        log.info(f"[scene] Created custom scene: {key}")
        if self._socketio:
            self._socketio.emit("scenes_updated", {"scenes": self.list_scenes()})
        return True, f"Scene '{config['label']}' created"

    def update_scene(self, name: str, config: dict) -> tuple[bool, str]:
        """Update an existing custom scene."""
        key = name.lower().strip()
        if key in BUILTIN_SCENES:
            return False, f"Cannot modify built-in scene: {key}"
        custom = _load_custom_scenes()
        if key not in custom:
            return False, f"Custom scene '{key}' not found"
        if "label" not in config:
            config["label"] = custom[key].get("label", name)
        custom[key] = config
        _save_custom_scenes(custom)
        log.info(f"[scene] Updated custom scene: {key}")
        if self._socketio:
            self._socketio.emit("scenes_updated", {"scenes": self.list_scenes()})
        return True, f"Scene '{config['label']}' updated"

    def delete_scene(self, name: str) -> tuple[bool, str]:
        """Delete a custom scene (cannot delete builtins)."""
        key = name.lower().strip()
        if key in BUILTIN_SCENES:
            return False, f"Cannot delete built-in scene: {key}"
        custom = _load_custom_scenes()
        if key not in custom:
            return False, f"Custom scene '{key}' not found"
        label = custom[key].get("label", key)
        del custom[key]
        _save_custom_scenes(custom)
        # If this scene was active, deactivate it
        if self._active_scene == key:
            self._apply_deactivation(skip_restore=False)
        log.info(f"[scene] Deleted custom scene: {key}")
        if self._socketio:
            self._socketio.emit("scenes_updated", {"scenes": self.list_scenes()})
        return True, f"Scene '{label}' deleted"

    # ── State Capture & Restore ─────────────────────────────────────

    def _capture_state(self) -> dict:
        """Capture current RGB, TV, music state for later restore."""
        state = {}

        # LED state
        led = self._services.get("leds")
        if led:
            try:
                # _custom_mode is None when BMO controls LEDs (state-based), use _state
                mode = getattr(led, "_custom_mode", None)
                if mode is None:
                    # Map led state to a mode number
                    from hardware.led_controller import STATE_CONFIG, MODE_OFF
                    led_state = getattr(led, "_state", None)
                    mode = STATE_CONFIG.get(led_state, (MODE_OFF, None))[0] if led_state else MODE_OFF
                state["led"] = {
                    "mode": mode,
                    "color": getattr(led, "_custom_color", None),
                    "brightness": getattr(led, "_brightness", 128),
                    "user_disabled": getattr(led, "_user_disabled", False),
                }
            except Exception:
                pass

        # Music state
        music = self._services.get("music")
        if music:
            try:
                state["music"] = {
                    "playing": getattr(music, "_playing", False),
                }
            except Exception:
                pass

        log.info(f"[scene] Captured state: {list(state.keys())}")
        return state

    def _restore_state(self):
        """Restore previously saved state."""
        if not self._saved_state:
            log.info("[scene] No saved state to restore")
            return

        # Restore LED
        led_state = self._saved_state.get("led")
        led = self._services.get("leds")
        if led_state and led:
            try:
                # Restore the user-disabled flag first so set_mode/set_color
                # don't fight with it
                was_disabled = led_state.get("user_disabled", False)
                if was_disabled:
                    led.set_enabled(False)
                else:
                    mode = led_state.get("mode", 0)
                    mode_names = {0: "off", 1: "static", 2: "chase", 3: "breathing", 4: "rainbow"}
                    mode_name = mode_names.get(mode, "off")

                    if mode == 0:
                        led.set_mode("off")
                    else:
                        led.set_mode(mode_name)
                        color = led_state.get("color")
                        if color:
                            if isinstance(color, list):
                                color = tuple(color)
                            led.set_color(*color)
                        brightness = led_state.get("brightness", 128)
                        led.set_brightness(brightness)
                log.info(f"[scene] Restored LED: disabled={was_disabled}, mode={led_state.get('mode')}, color={led_state.get('color')}")
            except Exception as e:
                log.exception(f"[scene] LED restore failed")

        self._saved_state = {}
        log.info("[scene] State restored")

    # ── Scene Application ───────────────────────────────────────────

    def _apply_scene(self, scene: dict):
        """Apply scene settings to hardware via service objects (no HTTP)."""
        log.info(f"[scene] Applying scene settings: {scene}")
        led = self._services.get("leds")
        music = self._services.get("music")
        tv_send_key = self._services.get("tv_send_key")
        tv_launch = self._services.get("tv_launch")

        # RGB
        if scene.get("rgb_off"):
            try:
                if led:
                    led.set_mode("off")
                log.info("[scene] LED off")
            except Exception as e:
                log.exception(f"[scene] LED off failed")
        elif scene.get("rgb_mode"):
            try:
                if led:
                    led.set_mode(scene["rgb_mode"])
                    if scene.get("rgb_brightness"):
                        led.set_brightness(scene["rgb_brightness"])
                log.info(f"[scene] LED {scene['rgb_mode']}")
            except Exception as e:
                log.exception(f"[scene] LED mode failed")

        # TV
        tv_power_on = self._services.get("tv_power_on")
        tv_power_off = self._services.get("tv_power_off")
        if scene.get("tv_off"):
            try:
                if not tv_power_off:
                    log.info("[scene] TV power_off callback not available")
                    if self._socketio:
                        self._socketio.emit("notification", {"message": "TV not connected — pair in TV tab first", "type": "warning"})
                else:
                    tv_power_off()
            except Exception as e:
                log.exception(f"[scene] TV off failed")
        elif scene.get("tv_on"):
            try:
                if not tv_power_on:
                    log.info("[scene] TV power_on callback not available")
                    if self._socketio:
                        self._socketio.emit("notification", {"message": "TV not connected — pair in TV tab first", "type": "warning"})
                else:
                    tv_power_on()
                    time.sleep(3)
                    if scene.get("tv_app") and tv_launch:
                        tv_launch(scene["tv_app"])
                        log.info(f"[scene] TV → {scene['tv_app']}")
            except Exception as e:
                log.exception(f"[scene] TV launch failed")

        # Music
        if scene.get("music_stop"):
            try:
                if music and hasattr(music, "stop"):
                    music.stop()
                log.info("[scene] Music stopped")
            except Exception:
                pass
        elif scene.get("music_playlist"):
            try:
                if music and hasattr(music, "search"):
                    results = music.search(f"{scene['music_playlist']} mix", limit=1)
                    if results:
                        music.play(results[0])
                log.info(f"[scene] Music → {scene['music_playlist']}")
            except Exception as e:
                log.exception(f"[scene] Music play failed")

    def _apply_deactivation(self, skip_restore: bool = False):
        """Deactivate the current scene."""
        with self._lock:
            scene_name = self._active_scene
            self._active_scene = None
            self._save_state()

        if not skip_restore:
            self._restore_state()

        log.info(f"[scene] {scene_name} deactivated")

    # ── Persistence ─────────────────────────────────────────────────

    _MAX_SCENE_AGE = 4 * 3600  # 4 hours — auto-expire any scene after this

    def _load_state(self):
        """Load active scene from settings.json (survives restarts mid-scene).

        Auto-deactivates scenes that have been active too long:
        - Bedtime: expires if it's daytime (6 AM - 8 PM)
        - All scenes: expire after 4 hours
        """
        try:
            if os.path.exists(SETTINGS_PATH):
                with open(SETTINGS_PATH, "r") as f:
                    settings = json.load(f)
                scene_data = settings.get("scene", {})
                self._active_scene = scene_data.get("active")
                self._saved_state = scene_data.get("saved_state", {})
                if self._active_scene:
                    # Auto-expire bedtime during daytime hours
                    if self._active_scene == "bedtime":
                        import datetime
                        hour = datetime.datetime.now().hour
                        if 6 <= hour < 20:  # 6 AM to 8 PM
                            log.info(f"[scene] Auto-expired bedtime mode (it's {hour}:00, daytime)")
                            self._active_scene = None
                            self._saved_state = {}
                            self._save_state()
                            return

                    # Auto-expire any scene after 4 hours
                    activated_at = scene_data.get("activated_at")
                    if activated_at:
                        age = time.time() - activated_at
                        if age > self._MAX_SCENE_AGE:
                            hours = age / 3600
                            log.info(f"[scene] Auto-expired {self._active_scene} (active for {hours:.1f}h, max 4h)")
                            self._active_scene = None
                            self._saved_state = {}
                            self._save_state()
                            return

                    log.info(f"[scene] Restored active scene: {self._active_scene}")
        except Exception as e:
            log.exception(f"[scene] Load state failed")

    def _save_state(self):
        """Save scene state to settings.json."""
        try:
            os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
            settings = {}
            if os.path.exists(SETTINGS_PATH):
                with open(SETTINGS_PATH, "r") as f:
                    settings = json.load(f)
            settings["scene"] = {
                "active": self._active_scene,
                "saved_state": self._saved_state,
                "activated_at": settings.get("scene", {}).get("activated_at"),
            }
            # Stamp activation time when a scene becomes active
            if self._active_scene and not settings["scene"]["activated_at"]:
                import time as _time
                settings["scene"]["activated_at"] = _time.time()
            elif not self._active_scene:
                settings["scene"]["activated_at"] = None
            with open(SETTINGS_PATH, "w") as f:
                json.dump(settings, f, indent=2)
        except Exception as e:
            log.exception(f"[scene] Save state failed")
