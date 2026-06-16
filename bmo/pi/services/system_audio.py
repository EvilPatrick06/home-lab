"""System audio (PipeWire/wpctl) volume + mute helpers.

Extracted from app.py 2026-06-10, PHASE-16 16C. Pure subprocess wrappers around `wpctl`
with the XDG_RUNTIME_DIR env the Pi needs; used by routes/system_api.py (volume routes)
and routes/music_api.py (auto-unmute before playback).
"""

import logging
import os
import subprocess

from services.settings_store import load_setting

log = logging.getLogger("bmo")


def get_system_volume() -> int:
    """Read PipeWire system volume as 0-100 integer. See get_system_audio_state
    for the muted flag (Round 2 #1)."""
    return get_system_audio_state()["volume"]


def get_system_audio_state() -> dict:
    """Return {volume:int, muted:bool} for the default PipeWire sink.

    Round 2 #1 (2026-05-17): the volume endpoint reported 0% when the sink
    was muted, hiding the actual blocker. Now exposes muted as a separate
    flag so the UI can show a banner instead of silently looking quiet."""
    try:
        env = os.environ.copy()
        env["XDG_RUNTIME_DIR"] = "/run/user/1000"
        r = subprocess.run(["wpctl", "get-volume", "@DEFAULT_AUDIO_SINK@"],
                           capture_output=True, text=True, timeout=5, env=env)
        # Output: "Volume: 0.25" or "Volume: 0.25 [MUTED]"
        out = r.stdout.strip()
        parts = out.split()
        if len(parts) >= 2:
            return {
                "volume": int(float(parts[1]) * 100),
                "muted": "[MUTED]" in out.upper(),
            }
    except Exception:
        pass
    return {"volume": load_setting("volume.system", 25), "muted": False}


def set_system_volume(level: int):
    """Set PipeWire system volume (0-100)."""
    try:
        env = os.environ.copy()
        env["XDG_RUNTIME_DIR"] = "/run/user/1000"
        vol = max(0.0, min(1.5, level / 100.0))  # allow up to 150% for extra headroom
        subprocess.run(["wpctl", "set-volume", "@DEFAULT_AUDIO_SINK@", str(vol)],
                       capture_output=True, timeout=5, env=env)
    except Exception:
        log.exception("[volume] Failed to set system volume")


def unmute_sink() -> bool:
    """Unmute the default PipeWire sink. Returns True on success. Used by
    api_audio_unmute + any code path that should auto-unmute before
    producing audio (music play, alarm fire, TTS). Round 2 #1+L
    (2026-05-17)."""
    try:
        env = os.environ.copy()
        env["XDG_RUNTIME_DIR"] = "/run/user/1000"
        subprocess.run(["wpctl", "set-mute", "@DEFAULT_AUDIO_SINK@", "0"],
                       capture_output=True, text=True, timeout=5, env=env)
        return True
    except Exception as e:
        log.info(f"[audio] unmute failed: {e}")
        return False
