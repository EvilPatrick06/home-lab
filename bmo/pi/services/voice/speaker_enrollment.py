"""Speaker-enrollment collaborator for VoicePipeline.

Extracted from the VoicePipeline god-class. Groups the resemblyzer encoder
loading, voice-profile JSON load/save, the "remember my voice" enrollment-request
detection and clip validation. Shared state (_speaker_encoder, _voice_profiles)
and the enrollment constants (_ENROLL_PATTERNS, _ENROLLMENT_CLIP_MIN_SAMPLES)
remain on the pipeline; this collaborator operates on them via the back-ref so
the public identify/enroll surface (kept on the pipeline) is untouched.
"""
import json
import os
import re

import numpy as np

from services.bmo_logging import _s
from services.voice.voice_pipeline import VOICE_PROFILES_JSON, log


class SpeakerEnrollment:
    """Speaker encoder + voice-profile persistence + enrollment-request handling."""

    def __init__(self, pipeline):
        self._p = pipeline

    def load_speaker_encoder(self):
        if self._p._speaker_encoder is None:
            from resemblyzer import VoiceEncoder
            self._p._speaker_encoder = VoiceEncoder()
        return self._p._speaker_encoder

    def load_voice_profiles(self):
        if os.path.exists(VOICE_PROFILES_JSON):
            with open(VOICE_PROFILES_JSON, encoding="utf-8") as f:
                raw = json.load(f)
            self._p._voice_profiles = {
                k: np.asarray(v, dtype=np.float32) for k, v in raw.items()
            }
        # Legacy .pkl voice-profile migration removed for security (py/unsafe-deserialization) — JSON only.
        return self._p._voice_profiles

    def save_voice_profiles_json(self):
        os.makedirs(os.path.dirname(VOICE_PROFILES_JSON), exist_ok=True)
        serializable = {k: v.astype(float).tolist() for k, v in self._p._voice_profiles.items()}
        with open(VOICE_PROFILES_JSON, "w", encoding="utf-8") as f:
            json.dump(serializable, f, indent=2)

    def check_enrollment_request(self, text_lower: str) -> str | None:
        """Check if the user is asking for voice enrollment. Returns name or None."""
        for pattern in self._p._ENROLL_PATTERNS:
            m = re.search(pattern, text_lower, re.IGNORECASE)
            if m:
                name = m.group(1).capitalize()
                log.info("[voice] Enrollment request detected for: %s", _s(name))
                return name
        return None

    def validate_enrollment_clip(self, audio_data: np.ndarray) -> bool:
        """Check if an audio clip has enough speech for voice enrollment."""
        if len(audio_data) < self._p._ENROLLMENT_CLIP_MIN_SAMPLES:
            log.info(f"[voice] Clip too short ({len(audio_data)} samples)")
            return False
        speech_prob = self._p._silero_check_speech(audio_data)
        if speech_prob < 0.3:
            log.info(f"[voice] Clip rejected by VAD (prob={speech_prob:.2f})")
            return False
        return True
