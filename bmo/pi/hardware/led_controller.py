"""BMO LED Mood Controller — State-based RGB LED patterns.

Controls the Freenove expansion board RGB LEDs via I2C (address 0x21).
Uses smbus2 for Pi 5 compatibility.

Board LED modes (register 0x03):
  0 = Off
  1 = Static (fixed color)
  2 = Follow (sequential chase)
  3 = Breathing (pulse)
  4 = Rainbow (auto cycle)
"""

import json
import os
import threading
import time
from enum import Enum

try:
    from smbus2 import SMBus
    LED_AVAILABLE = True
except ImportError:
    LED_AVAILABLE = False

# ── Freenove Expansion Board I2C Registers ────────────────────────────

I2C_BUS = 1
I2C_ADDR = 0x21
REG_LED_SPECIFIED = 0x01   # Set single LED: [id, r, g, b]
REG_LED_ALL = 0x02         # Set all LEDs: [r, g, b]
REG_LED_MODE = 0x03        # 0=Off, 1=Static, 2=Follow, 3=Breathing, 4=Rainbow

# Board LED mode constants
MODE_OFF = 0
MODE_STATIC = 1
MODE_FOLLOW = 2
MODE_BREATHING = 3
MODE_RAINBOW = 4

MODE_NAMES = {
    "off": MODE_OFF,
    "static": MODE_STATIC,
    "follow": MODE_FOLLOW,
    "chase": MODE_FOLLOW,
    "breathing": MODE_BREATHING,
    "pulse": MODE_BREATHING,
    "rainbow": MODE_RAINBOW,
}

SETTINGS_PATH = os.path.join(os.path.dirname(__file__), "data", "settings.json")


class LedState(Enum):
    """LED mood states matching OLED face expressions."""
    READY = "ready"           # Green breathing
    LISTENING = "listening"   # Blue static
    THINKING = "thinking"     # Yellow follow/chase
    SPEAKING = "speaking"     # Cyan breathing
    MUSIC = "music"           # Rainbow
    COMBAT = "combat"         # Red breathing
    ERROR = "error"           # Red static (flash via thread)
    ALARM = "alarm"           # Orange static (flash via thread)
    OFF = "off"               # Off


COLORS = {
    "green": (0, 255, 0),
    "blue": (0, 0, 255),
    "yellow": (255, 200, 0),
    "cyan": (0, 255, 255),
    "red": (255, 0, 0),
    "orange": (255, 120, 0),
    "purple": (128, 0, 255),
    "pink": (255, 105, 180),
    "white": (255, 255, 255),
    "off": (0, 0, 0),
}

# State → (board_mode, color)
STATE_CONFIG = {
    LedState.READY:     (MODE_BREATHING, "green"),
    LedState.LISTENING: (MODE_STATIC,    "pink"),
    LedState.THINKING:  (MODE_FOLLOW,    "green"),
    LedState.SPEAKING:  (MODE_BREATHING, "blue"),
    LedState.MUSIC:     (MODE_RAINBOW,   None),
    LedState.COMBAT:    (MODE_BREATHING, "red"),
    LedState.ERROR:     (MODE_STATIC,    "red"),
    LedState.ALARM:     (MODE_STATIC,    "orange"),
    LedState.OFF:       (MODE_OFF,       None),
}


class LedController:
    """State machine for RGB LED patterns via Freenove I2C expansion board."""

    def __init__(self):
        self._bus = None
        self._state = LedState.READY
        self._flash_thread = None
        self._flash_stop = threading.Event()
        # Direct control state (overrides mood state when set)
        self._custom_color = None  # (r, g, b) or None
        self._custom_mode = None   # MODE_* int or None
        self._brightness = 100     # 0-100 percent
        # User-disabled flag: persists across expression changes & reboots
        self._user_disabled = False

    def start(self):
        """Initialize I2C bus, restore saved state, and apply."""
        if not LED_AVAILABLE:
            print("[led] smbus2 not available — running headless")
            return

        try:
            self._bus = SMBus(I2C_BUS)
            self._load_state()
            if self._user_disabled:
                self._set_mode(MODE_OFF)
            else:
                self._apply_state()
            print("[led] LED controller started (I2C 0x{:02X}, enabled={})".format(
                I2C_ADDR, not self._user_disabled))
        except Exception as e:
            print(f"[led] Failed to init I2C bus: {e}")

    def stop(self):
        """Turn off LEDs."""
        self._stop_flash()
        self._set_mode(MODE_OFF)
        if self._bus:
            self._bus.close()
            self._bus = None

    def set_state(self, state: str):
        """Change LED mood state (clears custom overrides).

        If the user has disabled LEDs via the settings toggle, this is a
        no-op so expression changes don't re-enable the lights.
        """
        if self._user_disabled:
            # Still track the logical state for get_full_state, but don't
            # touch the hardware or clear custom overrides.
            try:
                self._state = LedState(state)
            except ValueError:
                pass
            return

        try:
            self._state = LedState(state)
        except ValueError:
            if state in COLORS:
                self._state = LedState.READY
            else:
                print(f"[led] Unknown LED state: {state}")
                return
        self._custom_color = None
        self._custom_mode = None
        self._apply_state()

    # ── Direct Control API ───────────────────────────────────────────

    # ── Enable / Disable (persists across expression changes) ──────

    def set_enabled(self, enabled: bool):
        """Enable or disable LEDs.  When disabled, expression-driven
        set_state() calls are ignored and the hardware is turned off.
        Persisted to settings.json so it survives reboots."""
        self._user_disabled = not enabled
        if self._user_disabled:
            self._stop_flash()
            self._set_mode(MODE_OFF)
            print("[led] LEDs disabled by user")
        else:
            # Re-apply whatever the current logical state is
            if self._custom_color is not None or self._custom_mode is not None:
                self._apply_custom()
            else:
                self._apply_state()
            print("[led] LEDs re-enabled by user")
        self._save_state()

    @property
    def is_enabled(self) -> bool:
        return not self._user_disabled

    def set_color(self, r: int, g: int, b: int):
        """Set a custom RGB color directly.

        This is an explicit user action so it re-enables LEDs if disabled."""
        self._user_disabled = False
        self._custom_color = (
            max(0, min(255, r)),
            max(0, min(255, g)),
            max(0, min(255, b)),
        )
        if self._custom_mode is None:
            self._custom_mode = MODE_STATIC
        self._apply_custom()
        self._save_state()

    def set_color_by_name(self, name: str) -> bool:
        """Set color by name. Returns False if unknown."""
        color = COLORS.get(name.lower())
        if color is None:
            return False
        self.set_color(*color)
        return True

    def set_mode(self, mode: str) -> bool:
        """Set LED mode by name (static, breathing, chase, rainbow, off).

        Off sets _user_disabled so expression changes won't turn them back on.
        Any non-off mode re-enables LEDs if they were disabled."""
        mode_val = MODE_NAMES.get(mode.lower())
        if mode_val is None:
            return False
        if mode_val == MODE_OFF:
            self._user_disabled = True
            self._stop_flash()
            self._set_mode(MODE_OFF)
        else:
            self._user_disabled = False
            self._custom_mode = mode_val
            if mode_val == MODE_RAINBOW:
                self._stop_flash()
                self._set_mode(MODE_RAINBOW)
            else:
                self._apply_custom()
        self._save_state()
        return True

    def set_brightness(self, level: int):
        """Set brightness 0-100. Scales the current color.

        If LEDs are disabled, just save the value without touching hardware."""
        self._brightness = max(0, min(100, level))
        if not self._user_disabled:
            if self._custom_color:
                self._apply_custom()
            else:
                self._apply_state()
        self._save_state()

    def get_full_state(self) -> dict:
        """Return full LED state for API responses."""
        mode_name = "unknown"
        for name, val in MODE_NAMES.items():
            if val == (self._custom_mode if self._custom_mode is not None else
                       STATE_CONFIG.get(self._state, (MODE_OFF, None))[0]):
                mode_name = name
                break

        color = self._custom_color
        if color is None:
            _, color_name = STATE_CONFIG.get(self._state, (MODE_OFF, None))
            color = COLORS.get(color_name, (0, 0, 0)) if color_name else (0, 0, 0)

        return {
            "state": self._state.value,
            "color": {"r": color[0], "g": color[1], "b": color[2]},
            "mode": mode_name,
            "brightness": self._brightness,
            "custom": self._custom_color is not None,
            "enabled": not self._user_disabled,
        }

    @property
    def current_state(self) -> str:
        return self._state.value

    def _apply_custom(self):
        """Apply custom color + mode with brightness scaling."""
        self._stop_flash()
        if self._custom_color:
            scale = self._brightness / 100.0
            r = int(self._custom_color[0] * scale)
            g = int(self._custom_color[1] * scale)
            b = int(self._custom_color[2] * scale)
            self._set_color(r, g, b)
        mode = self._custom_mode if self._custom_mode is not None else MODE_STATIC
        self._set_mode(mode)

    def _apply_state(self):
        """Apply the current mood state to the board."""
        self._stop_flash()

        # If custom overrides are active, use those instead
        if self._custom_color is not None or self._custom_mode is not None:
            self._apply_custom()
            return

        mode, color_name = STATE_CONFIG.get(self._state, (MODE_OFF, None))

        if color_name:
            color = COLORS[color_name]
            scale = self._brightness / 100.0
            self._set_color(int(color[0] * scale), int(color[1] * scale), int(color[2] * scale))

        # Error and alarm use flashing (toggle on/off rapidly)
        if self._state in (LedState.ERROR, LedState.ALARM):
            speed = 4.0 if self._state == LedState.ERROR else 6.0
            self._start_flash(COLORS[color_name], speed)
        else:
            self._set_mode(mode)

    # ── Persistence ──────────────────────────────────────────────────

    def _save_state(self):
        """Persist LED state to settings.json."""
        try:
            os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
            settings = {}
            if os.path.exists(SETTINGS_PATH):
                with open(SETTINGS_PATH, "r") as f:
                    settings = json.load(f)
            settings["led"] = {
                "state": self._state.value,
                "custom_color": list(self._custom_color) if self._custom_color else None,
                "custom_mode": self._custom_mode,
                "brightness": self._brightness,
                "user_disabled": self._user_disabled,
            }
            with open(SETTINGS_PATH, "w") as f:
                json.dump(settings, f, indent=2)
        except Exception as e:
            print(f"[led] Save state failed: {e}")

    def _load_state(self):
        """Restore LED state from settings.json."""
        try:
            if os.path.exists(SETTINGS_PATH):
                with open(SETTINGS_PATH, "r") as f:
                    settings = json.load(f)
                led = settings.get("led", {})
                if led.get("state"):
                    try:
                        self._state = LedState(led["state"])
                    except ValueError:
                        pass
                if led.get("custom_color"):
                    self._custom_color = tuple(led["custom_color"])
                self._custom_mode = led.get("custom_mode")
                self._brightness = led.get("brightness", 100)
                self._user_disabled = led.get("user_disabled", False)
                print(f"[led] Restored state: {self._state.value}, brightness={self._brightness}%, disabled={self._user_disabled}")
        except Exception as e:
            print(f"[led] Load state failed: {e}")

    # ── I2C Helpers ───────────────────────────────────────────────────

    def _set_mode(self, mode: int):
        if self._bus:
            try:
                self._bus.write_byte_data(I2C_ADDR, REG_LED_MODE, mode)
            except Exception:
                pass

    def _set_color(self, r: int, g: int, b: int):
        if self._bus:
            try:
                self._bus.write_i2c_block_data(I2C_ADDR, REG_LED_ALL, [r, g, b])
            except Exception:
                pass

    def _set_led(self, led_id: int, r: int, g: int, b: int):
        if self._bus:
            try:
                self._bus.write_i2c_block_data(I2C_ADDR, REG_LED_SPECIFIED, [led_id, r, g, b])
            except Exception:
                pass

    # ── Flash Pattern (for error/alarm) ───────────────────────────────

    def _start_flash(self, color: tuple, speed: float):
        self._flash_stop.clear()
        self._flash_thread = threading.Thread(
            target=self._flash_loop, args=(color, speed), daemon=True
        )
        self._flash_thread.start()

    def _stop_flash(self):
        self._flash_stop.set()
        if self._flash_thread:
            self._flash_thread.join(timeout=1)
            self._flash_thread = None

    def _flash_loop(self, color: tuple, speed: float):
        interval = 1.0 / speed
        on = True
        while not self._flash_stop.is_set():
            if on:
                self._set_color(*color)
                self._set_mode(MODE_STATIC)
            else:
                self._set_mode(MODE_OFF)
            on = not on
            self._flash_stop.wait(interval)


# ── Expression → LED State Mapping ────────────────────────────────────

EXPRESSION_TO_LED = {
    "idle": LedState.READY,
    "listening": LedState.LISTENING,
    "thinking": LedState.THINKING,
    "speaking": LedState.SPEAKING,
    "happy": LedState.MUSIC,
    "error": LedState.ERROR,
    "alert": LedState.ALARM,
    "combat": LedState.COMBAT,
    "sleeping": LedState.OFF,
}


def led_state_for_expression(expression: str) -> str:
    """Convert an OLED face expression to an LED state string."""
    state = EXPRESSION_TO_LED.get(expression, LedState.READY)
    return state.value
