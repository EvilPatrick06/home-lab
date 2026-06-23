"""Per-NPC voice casting for the DM bot (PHASE-21 21C).

A named NPC (tagged `[SPEAKER:Name]` in the AI output) gets a stable, distinct TTS
voice on first appearance — a deterministic pick from a backend-appropriate pool,
biased toward the archetype's vocal group, persisted per campaign so the same
character sounds the same across scenes and bot restarts. The DM can override or
re-roll a cast entry from the VTT.

The JSON store is shared by the bot process (which reads it to cast) and the Flask
process (whose `/api/discord/dm/voices` routes list/edit/reset it). Both re-read on
mtime change; writes are atomic (`tempfile` + `os.replace`) under a lock.

Stdlib-only (no `requests`) so it's safe to import from either process. The pool
shape leaves room for PHASE-25 to bias casting on structured NPC metadata via the
accepted-but-ignored `meta` parameter.
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
import threading
from dataclasses import asdict, dataclass

from services.voice.discord_tts import resolve_backend
from services.voice.voice_personality import NPC_PROSODY

# Kokoro-FastAPI voice ids grouped by vocal character. Blends (`a+b`) are valid ids
# too — a few are included for variety. Exact character is tuning, not correctness.
KOKORO_POOL: list[dict] = [
    {"id": "af_bella", "group": "female"},
    {"id": "af_sarah", "group": "female"},
    {"id": "af_nicole", "group": "female"},
    {"id": "af_sky", "group": "female"},
    {"id": "bf_emma", "group": "female"},
    {"id": "bf_isabella", "group": "female"},
    {"id": "am_adam", "group": "male"},
    {"id": "am_michael", "group": "male"},
    {"id": "bm_george", "group": "male"},
    {"id": "bm_lewis", "group": "male"},
    {"id": "am_onyx", "group": "deep_male"},
    {"id": "am_eric", "group": "deep_male"},
    {"id": "bm_daniel", "group": "deep_male"},
    {"id": "af_bella+af_sky", "group": "female"},
    {"id": "am_adam+am_michael", "group": "male"},
    {"id": "bm_george+am_onyx", "group": "deep_male"},
]

# libritts_r-medium speaker ids (the model ships 904); a spread-out curated subset.
PIPER_SPEAKER_POOL: list[dict] = [
    {"id": 0, "group": "female"},
    {"id": 40, "group": "female"},
    {"id": 88, "group": "female"},
    {"id": 132, "group": "female"},
    {"id": 176, "group": "female"},
    {"id": 220, "group": "female"},
    {"id": 16, "group": "male"},
    {"id": 64, "group": "male"},
    {"id": 108, "group": "male"},
    {"id": 152, "group": "male"},
    {"id": 196, "group": "male"},
    {"id": 240, "group": "male"},
    {"id": 312, "group": "deep_male"},
    {"id": 388, "group": "deep_male"},
    {"id": 456, "group": "deep_male"},
    {"id": 520, "group": "deep_male"},
    {"id": 604, "group": "female"},
    {"id": 688, "group": "male"},
    {"id": 760, "group": "female"},
    {"id": 844, "group": "deep_male"},
]

# The 8 existing archetypes (voice_personality.NPC_PROSODY keys) → preferred groups.
ARCHETYPE_GROUPS: dict[str, list[str]] = {
    "gruff_dwarf": ["deep_male", "male"],
    "mysterious_elf": ["female"],
    "booming_dragon": ["deep_male"],
    "whispery_rogue": ["female", "male"],
    "elderly_wizard": ["deep_male", "male"],
    "cheerful_bard": ["male", "female"],
    "stern_guard": ["male", "deep_male"],
    "tavern_keeper": ["male", "female"],
}

_DEFAULT_GROUPS = ["male", "female"]


@dataclass
class CastEntry:
    speaker: str
    backend: str
    voice_id: str
    speed: float = 1.0
    pitch: int = 0


def _default_path() -> str:
    return os.environ.get(
        "BMO_VOICE_CAST_PATH",
        os.path.expanduser("~/home-lab/bmo/pi/data/voice_cast.json"),
    )


class VoiceCasting:
    """Campaign → {speaker_lower: CastEntry} with atomic, mtime-aware persistence."""

    def __init__(self, path: str | None = None) -> None:
        self.path = path or _default_path()
        self._lock = threading.Lock()
        self._data: dict[str, dict[str, dict]] = {}
        self._mtime: float = 0.0
        self._load()

    # ── persistence ──────────────────────────────────────────────

    def _load(self) -> None:
        try:
            with open(self.path, encoding="utf-8") as fh:
                self._data = json.load(fh)
            self._mtime = os.path.getmtime(self.path)
        except (FileNotFoundError, ValueError, OSError):
            self._data = {}
            self._mtime = 0.0

    def _maybe_reload(self) -> None:
        """Re-read if another process wrote the file since our last load."""
        try:
            mtime = os.path.getmtime(self.path)
        except OSError:
            return
        if mtime > self._mtime:
            self._load()

    def _save(self) -> None:
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(self.path), suffix=".tmp")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(self._data, fh, indent=2)
            os.replace(tmp, self.path)
            self._mtime = os.path.getmtime(self.path)
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)

    # ── pools ────────────────────────────────────────────────────

    @staticmethod
    def _pool_for(backend: str) -> list[dict]:
        if backend == "kokoro":
            return KOKORO_POOL
        if backend == "piper":
            return PIPER_SPEAKER_POOL
        return []  # fish: single cloned voice, prosody-only differentiation

    def pool_for_backend(self, backend: str) -> list[str]:
        """Voice-id strings for the UI picker."""
        return [str(p["id"]) for p in self._pool_for(backend)]

    # ── casting ──────────────────────────────────────────────────

    def get_voice(self, campaign_id: str, speaker: str, archetype: str | None = None, meta: dict | None = None) -> CastEntry:
        """Return the persisted voice for `speaker`, or deterministically cast a new
        one biased by `archetype`. `meta` is accepted and ignored (PHASE-25 hook)."""
        key = speaker.strip().lower()
        with self._lock:
            self._maybe_reload()
            existing = self._data.get(campaign_id, {}).get(key)
            if existing:
                return CastEntry(**existing)

            backend = resolve_backend()
            base = NPC_PROSODY.get(archetype, {"speed": 1.0, "pitch": 0})
            pool = self._pool_for(backend)
            if not pool:
                voice_id = ""
            else:
                groups = ARCHETYPE_GROUPS.get(archetype, _DEFAULT_GROUPS)
                filtered = [p for p in pool if p["group"] in groups] or pool
                start = int(hashlib.sha256(f"{campaign_id}:{key}".encode()).hexdigest(), 16) % len(filtered)
                used = {e["voice_id"] for e in self._data.get(campaign_id, {}).values()}
                chosen = None
                for i in range(len(filtered)):
                    cand = filtered[(start + i) % len(filtered)]
                    if str(cand["id"]) not in used:
                        chosen = cand
                        break
                if chosen is None:  # pool exhausted — collisions allowed
                    chosen = filtered[start]
                voice_id = str(chosen["id"])

            entry = CastEntry(
                speaker=speaker.strip(), backend=backend, voice_id=voice_id,
                speed=float(base["speed"]), pitch=int(base["pitch"]),
            )
            self._data.setdefault(campaign_id, {})[key] = asdict(entry)
            self._save()
            return entry

    def list_cast(self, campaign_id: str) -> list[dict]:
        with self._lock:
            self._maybe_reload()
            return list(self._data.get(campaign_id, {}).values())

    def set_voice(
        self, campaign_id: str, speaker: str, voice_id: str | None = None,
        speed: float | None = None, pitch: int | None = None,
    ) -> CastEntry:
        """Partial update (DM override). Creates the entry if the speaker is new."""
        key = speaker.strip().lower()
        with self._lock:
            self._maybe_reload()
            current = self._data.get(campaign_id, {}).get(key)
            entry = CastEntry(**current) if current else CastEntry(
                speaker=speaker.strip(), backend=resolve_backend(), voice_id=""
            )
            if voice_id is not None:
                entry.voice_id = voice_id
            if speed is not None:
                entry.speed = float(speed)
            if pitch is not None:
                entry.pitch = int(pitch)
            self._data.setdefault(campaign_id, {})[key] = asdict(entry)
            self._save()
            return entry

    def reset_voice(self, campaign_id: str, speaker: str) -> bool:
        """Delete the entry so the next get_voice re-rolls. True if one existed."""
        key = speaker.strip().lower()
        with self._lock:
            self._maybe_reload()
            existed = key in self._data.get(campaign_id, {})
            if existed:
                del self._data[campaign_id][key]
                self._save()
            return existed
