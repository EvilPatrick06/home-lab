"""STT collaborator for VoicePipeline.

Extracted from the VoicePipeline god-class as part of the voice-pipeline
decomposition. Owns the lazy local faster-whisper model + the hallucination
filter, and provides PCM->WAV framing and the wake-confirmation quick STT.
VoicePipeline composes one of these and delegates _load_whisper / _pcm_to_wav /
_quick_stt to it (call surface unchanged).

Whisper loading is routed back through the owning pipeline (self._p._load_whisper)
so existing tests that patch pipeline._load_whisper keep working.
"""
import io
import os
import tempfile
import wave

from services.bmo_logging import _s
from services.voice.voice_pipeline import CHANNELS, SAMPLE_RATE, log


class Transcriber:
    """Whisper STT helpers (local-first, cloud fallback) for the voice pipeline."""

    # Common Whisper hallucinations on silence/ambient noise.
    WHISPER_HALLUCINATIONS = frozenset({
        "", ".", "so", "the", "i", "a", "oh", "oh.", "okay",
        "okay.", "thank you", "thank you.", "thanks", "thanks.", "bye",
        "hmm", "uh", "um", "mm", "you", "it", "is", "no", "yes",
    })

    def __init__(self, pipeline):
        self._p = pipeline
        self._whisper = None

    def load_whisper(self):
        if self._whisper is None:
            from faster_whisper import WhisperModel
            self._whisper = WhisperModel("small", device="cpu", compute_type="int8")
        return self._whisper

    def pcm_to_wav(self, pcm_bytes: bytes) -> bytes:
        """Convert raw PCM to WAV format for STT."""
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(pcm_bytes)
        return buf.getvalue()

    def quick_stt(self, wav_bytes: bytes) -> str:
        """Quick STT for wake word confirmation — local whisper first, cloud backup.

        Returns empty string if the result looks like a hallucination
        (very short text that Whisper commonly produces from silence).
        """
        text = ""

        # Prefer local faster-whisper: no network latency, works offline
        try:
            model = self._p._load_whisper()
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                f.write(wav_bytes)
                tmp = f.name
            segments, _ = model.transcribe(tmp, language="en", beam_size=1,
                                           vad_filter=False)
            os.unlink(tmp)
            text = " ".join(s.text for s in segments).strip()
        except Exception:
            pass

        if not text:
            # Cloud fallback: Groq Whisper for higher accuracy
            try:
                from services.cloud_providers import groq_stt, GROQ_API_KEY
                if GROQ_API_KEY:
                    from services import metrics_counters
                    metrics_counters.incr("stt_cloud_fallback_total")
                    result = groq_stt(wav_bytes, prompt="Hey BMO.")
                    text = result.get("text", "")
                    segments = result.get("segments", [])
                    if segments:
                        avg_no_speech = sum(s.get("no_speech_probability", 0) for s in segments) / len(segments)
                        if avg_no_speech > 0.5:
                            log.info("[wake] Rejected (no_speech_prob=%.2f): '%s'", avg_no_speech, _s(text))
                            return ""
            except Exception:
                return ""

        # Filter common single-word hallucinations
        cleaned = text.strip().lower().rstrip(".,!?")
        if cleaned in self.WHISPER_HALLUCINATIONS:
            return ""

        return text
