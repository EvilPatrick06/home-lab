"""Dotted-key get/set on data/settings.json.

Extracted from app.py 2026-06-10, PHASE-16 16A. Used by app routes (system_api),
the calendar/tv/system blueprints, and agent.py's music-volume handler.

`SETTINGS_PATH` is a module attribute (not recomputed per call) so tests can monkeypatch
it. `__file__` is bmo/pi/services/settings_store.py, so two dirnames up + data/settings.json
resolves to bmo/pi/data/settings.json — the same path app.py used.
"""

import json
import logging
import os

from services.bmo_logging import _s

log = logging.getLogger("bmo")

SETTINGS_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "settings.json"
)


def load_setting(key: str, default=None):
    """Load a dotted key from data/settings.json."""
    try:
        if os.path.exists(SETTINGS_PATH):
            with open(SETTINGS_PATH, "r") as f:
                settings = json.load(f)
            parts = key.split(".")
            obj = settings
            for part in parts:
                obj = obj.get(part, {})
            return obj if obj != {} else default
    except Exception:
        pass
    return default


def save_setting(key: str, value):
    """Save a dotted key to data/settings.json."""
    try:
        os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
        settings = {}
        if os.path.exists(SETTINGS_PATH):
            with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
                settings = json.load(f)
        parts = key.split(".")
        obj = settings
        for part in parts[:-1]:
            obj = obj.setdefault(part, {})
        obj[parts[-1]] = value
        with open(SETTINGS_PATH, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
    except Exception:
        log.exception("[settings] Save failed for %s", _s(key))
