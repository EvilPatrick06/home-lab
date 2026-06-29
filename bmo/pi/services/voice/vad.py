"""Voice-activity-detection collaborator for VoicePipeline.

Extracted from the VoicePipeline god-class. Owns the lazy Silero VAD model and
runs speech-probability checks; the energy-only fallback lives in the pipeline's
wake/record loops. VoicePipeline delegates _load_silero_vad / _silero_check_speech
here (call surface + patch points unchanged — check_speech routes whisper-style
back through the pipeline's _load_silero_vad).
"""
import numpy as np

from services.voice.voice_pipeline import SAMPLE_RATE, log


class Vad:
    """Silero VAD loader + speech-probability check for the voice pipeline."""

    def __init__(self, pipeline):
        self._p = pipeline
        self._model = None
        self._tried = False

    def load(self):
        """Load Silero VAD model for speech detection. ~1MB, runs on CPU in <1ms."""
        if self._model is not None:
            return self._model
        if self._tried:
            return None
        self._tried = True
        try:
            import torch
            import torchaudio  # noqa: F401 — required by silero
            model, utils = torch.hub.load(
                repo_or_dir='snakers4/silero-vad',
                model='silero_vad',
                force_reload=False,
                trust_repo=True,
            )
            self._model = model
            log.info("[vad] Silero VAD loaded")
        except ImportError as exc:
            # torchaudio (a silero dep) isn't installed in this venv — an
            # expected optional-dependency gap, not an error. Log once at INFO
            # instead of an ERROR traceback every boot; energy-only VAD is used.
            log.info("[vad] Silero VAD unavailable (%s), using energy-only", exc)
        except Exception:
            log.exception("[vad] Silero VAD not available, using energy-only")
        return self._model

    def check_speech(self, audio_int16: np.ndarray) -> float:
        """Run Silero VAD on audio chunk. Returns max speech probability 0.0-1.0."""
        vad = self._p._load_silero_vad()
        if vad is None:
            return 1.0  # No VAD = assume speech (fall back to energy-only)
        try:
            import torch
            # Silero v5 expects 512-sample (32ms) windows at 16kHz
            audio_f32 = audio_int16.flatten().astype(np.float32) / 32768.0
            window = 512
            max_prob = 0.0
            # Process in 512-sample windows, take max probability
            for i in range(0, len(audio_f32) - window + 1, window):
                chunk = torch.from_numpy(audio_f32[i:i + window])
                prob = vad(chunk, SAMPLE_RATE).item()
                if prob > max_prob:
                    max_prob = prob
                if max_prob > 0.5:
                    break  # Early exit — speech confirmed
            return max_prob
        except Exception:
            log.exception("[vad] Silero error")
            return 1.0
