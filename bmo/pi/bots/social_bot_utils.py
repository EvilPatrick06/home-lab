"""Pure utility helpers extracted from discord_social_bot.py (2026-06-22).

Stateless helpers (audio PCM->WAV, duration/progress formatting, playlist-URL
detection) with no bot/runtime-state dependencies — the first decomposition step
for the social-bot monolith. (BMO-SUGGESTIONS.)
"""
import io
import re
import wave

import numpy as np


def _pcm_to_wav_48k(pcm_bytes: bytes) -> bytes:
    """Convert 48kHz stereo 16-bit PCM to mono WAV for STT (replaces deprecated audioop)."""
    # Left channel only — same as audioop.tomono(pcm, 2, 1, 0)
    stereo = np.frombuffer(pcm_bytes, dtype=np.int16).reshape(-1, 2)
    mono = stereo[:, 0].tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(48000)
        wf.writeframes(mono)
    return buf.getvalue()

def _format_duration(seconds) -> str:
    if not seconds or seconds <= 0:
        return "?:??"
    seconds = int(seconds)
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"

def _is_playlist_url(url: str) -> bool:
    """Check if a URL is a YouTube/YouTube Music playlist."""
    return bool(re.match(
        r'https?://(www\.)?(youtube\.com|music\.youtube\.com)/(playlist\?|watch\?.*list=)',
        url
    ))

def _build_progress_bar(elapsed: float, total: float, width: int = 12) -> str:
    """Build a text progress bar like: ▬▬▬▬🔘▬▬▬▬▬▬▬"""
    if total <= 0:
        return "▬" * width
    ratio = max(0.0, min(elapsed / total, 1.0))
    pos = int(ratio * (width - 1))
    return "▬" * pos + "🔘" + "▬" * (width - 1 - pos)
