"""Synthetic voice-path canary.

Feeds a known wake clip through STT (and, opt-in, TTS synthesis), records stage
latency, and writes a pass/fail status file that services/monitoring.py reads so
the existing Discord alert path fires when the real voice path regresses while
/health stays green. Run on a slow cadence via bmo-voice-canary.timer.
(BMO-SUGGESTIONS 2026-06-22.)
"""
from __future__ import annotations

import glob
import json
import os
import time

from services.bmo_logging import get_logger

log = get_logger("voice_canary")

_PI_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_DATA_DIR = os.path.join(_PI_ROOT, "data")
STATUS_PATH = os.path.join(_DATA_DIR, "voice_canary_status.json")
_CLIPS_DIR = os.path.join(_PI_ROOT, "wake", "clips")
# Max acceptable STT latency before the canary flags a regression.
STT_BUDGET_S = float(os.environ.get("BMO_CANARY_STT_BUDGET_S", "75"))


def _pick_clip() -> str | None:
    clips = sorted(glob.glob(os.path.join(_CLIPS_DIR, "*.wav")))
    return clips[0] if clips else None


def run_canary() -> dict:
    """Run one synthetic STT (and opt-in TTS) pass; write + return the status."""
    result = {"ts": time.time(), "ok": False, "stage": "init", "detail": ""}
    try:
        clip = _pick_clip()
        if not clip:
            result.update(stage="no_clip", detail=f"no wav clips in {_CLIPS_DIR}")
            return _write(result)

        from services.voice.voice_pipeline import VoicePipeline
        vp = VoicePipeline()

        # Exercise the local Whisper path directly. We use _local_transcribe (raw
        # model output) rather than transcribe(), because transcribe() applies a
        # hallucination filter that maps short wake-word clips ("hey bmo") to an
        # empty string -- so a healthy STT engine looked "empty" and the canary
        # false-alarmed. Raw, non-empty output within budget = model loaded & ran.
        # Drop in a real-speech clip (known phrase) to also assert content.
        t0 = time.time()
        try:
            raw = (vp._local_transcribe(clip) or "").strip()
        except Exception as e:  # noqa: BLE001
            result["stt_s"] = round(time.time() - t0, 3)
            result.update(stage="stt_error", detail=f"local STT raised: {str(e)[:200]}")
            return _write(result)
        stt_s = round(time.time() - t0, 3)
        result["stt_s"] = stt_s
        result["transcript"] = raw[:200]

        # Runaway/hung STT is a real regression (cold model load is ~40s, so the
        # default budget leaves headroom; override via BMO_CANARY_STT_BUDGET_S).
        if stt_s > STT_BUDGET_S:
            result.update(stage="stt_slow", detail=f"STT {stt_s}s > budget {STT_BUDGET_S}s")
            return _write(result)
        # No raw tokens at all = Whisper/deps regression while /health stays green.
        if not raw:
            result.update(stage="stt_empty", detail="local Whisper produced no tokens")
            return _write(result)

        # TTS leg is opt-in (needs an audio device) so the canary stays safe on
        # headless/mic-less hosts. Enable with BMO_CANARY_TTS=1.
        if os.environ.get("BMO_CANARY_TTS") == "1":
            try:
                t1 = time.time()
                vp.speak("Canary check.", speaker="bmo_calm")
                result["tts_s"] = round(time.time() - t1, 3)
                result["tts_ok"] = True
            except Exception as e:  # noqa: BLE001 - TTS optional
                result["tts_ok"] = False
                result["tts_error"] = str(e)[:200]

        result.update(ok=True, stage="ok", detail="STT path healthy")
        return _write(result)
    except Exception as e:  # noqa: BLE001
        result.update(stage="exception", detail=str(e)[:300])
        log.exception("[canary] run failed")
        return _write(result)


def _write(result: dict) -> dict:
    try:
        os.makedirs(_DATA_DIR, exist_ok=True)
        with open(STATUS_PATH, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)
    except Exception:
        log.exception("[canary] could not write status")
    log.info("[canary] %s (%s)", "OK" if result.get("ok") else "FAIL", result.get("stage"))
    return result


def read_status() -> dict | None:
    try:
        with open(STATUS_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


if __name__ == "__main__":
    r = run_canary()
    raise SystemExit(0 if r.get("ok") else 1)
