"""Discord DM-bot TTS engine: sentence splitting + a local-first backend ladder.

PHASE-21 21A. Replaces the DM bot's lossy single-shot path (`text[:500]` + a
3 s cooldown that dropped back-to-back narrations) with:

- `split_sentences()` — chunk a narration at sentence boundaries so the worker can
  synthesize chunk *i+1* while chunk *i* plays. Primary path uses `pysbd`
  (rule-based, abbreviation/quote aware, no model or data-file download); a
  pure-regex fallback covers an environment where the library is absent, so
  narration NEVER hard-fails on a missing optional dep.
- `synthesize_chunk()` — env-driven backend ladder, first available wins:
  Kokoro-FastAPI (`KOKORO_TTS_URL`, an opt-in LAN/GPU box) → local Piper
  (`PIPER_DM_MODEL`, libritts_r multi-speaker by default, bmo-voice fallback) →
  Fish Audio cloud (`services.cloud_providers.fish_audio_tts`, last resort).
- `apply_prosody()` — sox pitch/tempo post-processing (graceful no-op when sox is
  absent or the values are identity).

IMPORTANT: this module uses blocking `requests` and is safe ONLY inside the
standalone-asyncio `bmo-dm-bot` process (called via `asyncio.to_thread`). It must
NOT be imported from the gevent-patched Flask `app.py` request paths.
"""

from __future__ import annotations

import io
import os
import re
import subprocess
import threading
import wave
from collections.abc import Iterator
from dataclasses import dataclass

# ── Sentence splitting ─────────────────────────────────────────────

# Split after sentence-final punctuation when the next char starts a new sentence
# (capital / opening quote / paren). Never raises — the structural fallback.
_SENTENCE_BOUNDARY = re.compile(r'(?<=[.!?…])\s+(?=[A-Z"\'“(])')


def _regex_split(text: str) -> list[str]:
    """Structural sentence split that cannot raise (no tokenizer, no data files)."""
    parts = _SENTENCE_BOUNDARY.split(text.strip())
    return [p.strip() for p in parts if p.strip()]


def _pysbd_split(text: str) -> list[str] | None:
    """Sentence split via `pysbd` (rule-based; no tokenizer model or data-file
    download). Returns None on ANY failure so the caller drops to `_regex_split`."""
    try:
        import pysbd

        seg = pysbd.Segmenter(language="en", clean=False)
        return [s.strip() for s in seg.segment(text) if s.strip()]
    except Exception:
        return None


def _merge_short(sentences: list[str], min_chars: int) -> list[str]:
    """Fold fragments shorter than `min_chars` into a neighbour so a stray 'Ok.'
    rides along with the next sentence instead of becoming its own tiny clip."""
    out: list[str] = []
    for s in sentences:
        if out and len(s) < min_chars:
            out[-1] = f"{out[-1]} {s}".strip()
        elif out and len(out[-1]) < min_chars:
            out[-1] = f"{out[-1]} {s}".strip()
        else:
            out.append(s)
    return out


def _hard_split(sentence: str, max_chars: int) -> list[str]:
    """Break one over-long sentence at the last space before `max_chars` (loops
    until every piece fits). Falls back to a hard character cut when wordless."""
    out: list[str] = []
    s = sentence.strip()
    while len(s) > max_chars:
        cut = s.rfind(" ", 0, max_chars)
        if cut <= 0:
            cut = max_chars
        out.append(s[:cut].strip())
        s = s[cut:].strip()
    if s:
        out.append(s)
    return out


def split_sentences(text: str, max_chars: int = 350, min_chars: int = 24) -> list[str]:
    """Split `text` into playback-sized chunks at sentence boundaries.

    Pure function, no I/O. Tries `pysbd` first (handles abbreviations, quotes,
    ellipses); on ANY failure (e.g. the library is absent) falls back to
    `_regex_split`. Both paths then merge sub-`min_chars` fragments and
    hard-split anything over `max_chars`.
    """
    text = (text or "").strip()
    if not text:
        return []

    raw = _pysbd_split(text)
    if not raw:
        raw = _regex_split(text)

    merged = _merge_short(raw, min_chars)
    out: list[str] = []
    for s in merged:
        out.extend(_hard_split(s, max_chars))
    return [s for s in out if s]


def split_sentences_stream(
    gen: Iterator[str], max_chars: int = 350, min_chars: int = 24
) -> Iterator[str]:
    """Generator-native variant for a future token-stream feed (not consumed this
    phase). `pysbd` is not incremental, so this buffers the whole stream and
    defers to `split_sentences` (pysbd -> regex fallback, then merge/hard-split)."""
    yield from split_sentences("".join(gen), max_chars=max_chars, min_chars=min_chars)


# ── Backend ladder ─────────────────────────────────────────────────


@dataclass
class VoiceSpec:
    """Per-chunk synthesis request. `backend='auto'` resolves via `resolve_backend()`."""

    backend: str = "auto"
    kokoro_voice: str | None = None
    piper_speaker: int | None = None
    speed: float = 1.0
    pitch: int = 0


def _piper_model_path() -> str:
    """Resolve the Piper model file: `PIPER_DM_MODEL`, else libritts_r (multi-
    speaker), else the existing single-speaker bmo-voice model."""
    env = os.environ.get("PIPER_DM_MODEL")
    if env:
        return os.path.expanduser(env)
    base = os.path.expanduser("~/home-lab/bmo/pi/models/piper")
    libritts = os.path.join(base, "en_US-libritts_r-medium.onnx")
    if os.path.exists(libritts):
        return libritts
    return os.path.join(base, "bmo-voice.onnx")


def resolve_backend() -> str:
    """First available backend wins: kokoro (if `KOKORO_TTS_URL`) → piper (if its
    model file exists) → fish. Cheap enough to call per job (env + one stat)."""
    if os.environ.get("KOKORO_TTS_URL"):
        return "kokoro"
    if os.path.exists(_piper_model_path()):
        return "piper"
    return "fish"


# Lazy multi-speaker Piper singleton (onnxruntime working set is hundreds of MB —
# load once, guard the load with a lock so two worker turns don't race it).
_PIPER_VOICE = None
_PIPER_LOCK = threading.Lock()


def _get_piper_voice():
    global _PIPER_VOICE
    if _PIPER_VOICE is None:
        with _PIPER_LOCK:
            if _PIPER_VOICE is None:
                from piper import PiperVoice

                _PIPER_VOICE = PiperVoice.load(_piper_model_path())
    return _PIPER_VOICE


def _kokoro_synth(text: str, voice: VoiceSpec) -> bytes:
    """POST one sentence to a Kokoro-FastAPI box (OpenAI-compatible). Blocking
    `requests` — bot-process only."""
    import requests

    url = os.environ["KOKORO_TTS_URL"].rstrip("/")
    resp = requests.post(
        f"{url}/v1/audio/speech",
        json={
            "model": "kokoro",
            "input": text,
            "voice": voice.kokoro_voice or os.environ.get("KOKORO_TTS_VOICE", "af_bella"),
            "response_format": "wav",
            "speed": voice.speed,
            "stream": False,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.content


def _piper_synth(text: str, voice: VoiceSpec) -> bytes:
    """Synthesize via the Piper Python API → an in-memory WAV. Speed is applied
    natively through `length_scale` (inverse of speed); pitch is left to sox."""
    from piper import SynthesisConfig

    pv = _get_piper_voice()
    kwargs: dict = {"length_scale": 1.0 / voice.speed if voice.speed else 1.0}
    # Only pass a speaker id to a genuinely multi-speaker model.
    if voice.piper_speaker is not None and getattr(pv.config, "num_speakers", 1) > 1:
        kwargs["speaker_id"] = voice.piper_speaker
    syn = SynthesisConfig(**kwargs)

    audio_chunks = list(pv.synthesize(text, syn_config=syn))
    if not audio_chunks:
        return b""
    first = audio_chunks[0]
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(first.sample_channels)
        wf.setsampwidth(first.sample_width)
        wf.setframerate(first.sample_rate)
        for c in audio_chunks:
            wf.writeframes(c.audio_int16_bytes)
    return buf.getvalue()


def synthesize_chunk(text: str, voice: VoiceSpec) -> bytes:
    """Synthesize one sentence chunk to WAV bytes via the resolved backend."""
    backend = voice.backend if voice.backend != "auto" else resolve_backend()
    if backend == "kokoro":
        return _kokoro_synth(text, voice)
    if backend == "piper":
        return _piper_synth(text, voice)
    # fish: native speed/pitch — caller skips apply_prosody for this backend.
    from services.cloud_providers import fish_audio_tts

    return fish_audio_tts(text, "", "wav", voice.speed, voice.pitch)


# ── Prosody post-processing ────────────────────────────────────────


def apply_prosody(wav_bytes: bytes, speed: float, pitch: int, *, skip_speed: bool = False) -> bytes:
    """Pipe WAV bytes through sox for tempo/pitch (mirrors voice_pipeline.py).

    No-op when there is nothing to do (identity values) or when sox is missing —
    backends that handle speed natively (kokoro/piper) pass `skip_speed=True` so
    only pitch goes through sox; fish handles both natively and skips this entirely.
    """
    effects: list[str] = []
    if speed != 1.0 and not skip_speed:
        effects += ["tempo", str(speed)]
    if pitch:
        effects += ["pitch", str(pitch * 100)]
    if not effects:
        return wav_bytes
    try:
        result = subprocess.run(
            ["sox", "-t", "wav", "-", "-t", "wav", "-", *effects],
            input=wav_bytes,
            capture_output=True,
            check=True,
        )
        return result.stdout or wav_bytes
    except FileNotFoundError:
        # sox not installed — best-effort, return audio unmodulated.
        return wav_bytes
    except subprocess.CalledProcessError:
        return wav_bytes
