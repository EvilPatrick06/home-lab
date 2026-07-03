"""Shared quiet-hours / bedtime speaking policy — one source of truth.

Before this module three surfaces each hand-rolled (or lacked) their own
night policy: the wake listener muted the mic in the ``bedtime`` scene, the
personality engine had a private ``_is_sleep_hours()`` gate for quips, and
``notification_service`` spoke phone notifications aloud at any hour with no
time-of-day check at all — so a 3 a.m. Discord ping was announced in the room.

``may_speak(kind)`` is the single check every speak surface can consult. It is
``True`` unless BOTH (a) quiet hours are in effect and (b) the utterance ``kind``
is not on the critical-override allow-list. Quiet hours are in effect when the
``bedtime`` scene is active OR the current local hour falls inside the
configured quiet window.

Configuration (checked in order, first hit wins):
  - ``BMO_QUIET_HOURS_START`` / ``BMO_QUIET_HOURS_END`` env (integer hours 0-23;
    a wrapping window like start=22 end=7 means 22:00 → 07:00).
  - ``BMO_QUIET_HOURS_ENABLED=0`` disables the window entirely (bedtime scene
    still gates).
  - ``settings.json`` key ``quiet_hours`` (``{"start": h, "end": h,
    "enabled": bool}``) as a persisted fallback when the env is unset.
  - Default window: 23:00 → 07:00.

Kinds on ``CRITICAL_KINDS`` (alarms, timers, emergencies, monitoring CRITICAL)
always speak — they mirror the existing bedtime-bypass priority set in
``VoicePipeline.speak``. Everything else (notifications, quips, chit-chat) is
suppressed during quiet hours.
"""
from __future__ import annotations

import os
import time

# Utterance kinds that bypass quiet hours entirely (mirror the bedtime-bypass
# priority set already used by VoicePipeline.speak / the tts worker).
CRITICAL_KINDS = frozenset({"alarm", "timer", "emergency", "critical"})

DEFAULT_START = 23
DEFAULT_END = 7


def _env_int(name: str) -> int | None:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return None
    try:
        val = int(raw)
    except (TypeError, ValueError):
        return None
    if 0 <= val <= 23:
        return val
    return None


def _settings_window() -> tuple[int | None, int | None, bool]:
    """Read a persisted quiet_hours window from settings.json, best-effort."""
    try:
        from services.settings_store import load_setting

        cfg = load_setting("quiet_hours", None)
        if isinstance(cfg, dict):
            start = cfg.get("start")
            end = cfg.get("end")
            enabled = bool(cfg.get("enabled", True))
            start = start if isinstance(start, int) and 0 <= start <= 23 else None
            end = end if isinstance(end, int) and 0 <= end <= 23 else None
            return start, end, enabled
    except Exception:
        pass
    return None, None, True


def get_window() -> tuple[int, int, bool]:
    """Resolve the effective (start_hour, end_hour, enabled) quiet-hours window.

    Env overrides settings; settings override the built-in default. ``enabled``
    is False only when explicitly turned off (env ``BMO_QUIET_HOURS_ENABLED=0``
    or settings ``{"enabled": false}``) — the time window is inert then.
    """
    enabled = True
    env_enabled = os.environ.get("BMO_QUIET_HOURS_ENABLED")
    if env_enabled is not None and env_enabled.strip().lower() in {"0", "false", "no", "off"}:
        enabled = False

    start = _env_int("BMO_QUIET_HOURS_START")
    end = _env_int("BMO_QUIET_HOURS_END")

    if start is None or end is None:
        s_start, s_end, s_enabled = _settings_window()
        if start is None:
            start = s_start
        if end is None:
            end = s_end
        # Only let settings flip enabled off when env did not already speak.
        if env_enabled is None and not s_enabled:
            enabled = False

    if start is None:
        start = DEFAULT_START
    if end is None:
        end = DEFAULT_END
    return start, end, enabled


def _hour_in_window(hour: int, start: int, end: int) -> bool:
    if start == end:
        # Degenerate window: treat as "no window" rather than "always".
        return False
    if start < end:
        return start <= hour < end
    # Wrapping window (e.g. 23 → 7).
    return hour >= start or hour < end


def in_quiet_window(now_hour: int | None = None) -> bool:
    """True if the current (or given) local hour is inside the quiet window."""
    start, end, enabled = get_window()
    if not enabled:
        return False
    if now_hour is None:
        now_hour = time.localtime().tm_hour
    return _hour_in_window(now_hour, start, end)


def is_quiet_now(scene_service=None, now_hour: int | None = None) -> bool:
    """True if quiet hours are in effect: bedtime scene active OR in the window."""
    if scene_service is not None:
        try:
            if scene_service.get_active() == "bedtime":
                return True
        except Exception:
            pass
    return in_quiet_window(now_hour)


def may_speak(kind: str = "notification", *, scene_service=None, now_hour: int | None = None) -> bool:
    """Return True if an utterance of ``kind`` is allowed to speak right now.

    Critical kinds (alarm/timer/emergency/critical) always speak. Everything
    else is suppressed while quiet hours are in effect.
    """
    if kind in CRITICAL_KINDS:
        return True
    return not is_quiet_now(scene_service=scene_service, now_hour=now_hour)
