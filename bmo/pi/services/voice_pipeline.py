"""BMO Voice Pipeline — Cloud STT/TTS with local fallback.

Routes STT to Groq Whisper and TTS to edge-tts (fast) or Fish Audio (premium).
Falls back to local Whisper-base and Piper TTS when cloud APIs are unreachable.
Wake word detection always runs locally (must be instant).
"""

import io
import difflib
import json
import os
import pickle
import queue
import re
import subprocess
import tempfile
import threading
import time
import wave

import numpy as np
import requests
import scipy.signal
import sounddevice as sd

from services.cloud_providers import groq_stt, fish_audio_tts

from services.bmo_logging import get_logger
log = get_logger("voice_pipeline")

MODELS_DIR = os.path.expanduser("~/home-lab/bmo/pi/models")
os.makedirs(os.path.join(MODELS_DIR, "piper"), exist_ok=True)
DATA_DIR = os.path.expanduser("~/home-lab/bmo/pi/data")
# Legacy pickle path (migrated to JSON on first read)
VOICE_PROFILES_PATH = os.path.join(DATA_DIR, "voice_profiles.pkl")
VOICE_PROFILES_JSON = os.path.join(DATA_DIR, "voice_profiles.json")

EDGE_TTS_VOICE = "en-US-AnaNeural"  # Young/playful voice for BMO

SAMPLE_RATE = 16000
CHANNELS = 1
SILENCE_THRESHOLD = 600       # RMS threshold for silence detection
SILENCE_DURATION = 0.8        # Seconds of silence to stop recording
MAX_RECORD_SECONDS = 15       # Max recording length (extended from 10)
SILENCE_DURATION_EXTENDED = 2.0  # Extended silence duration after 3s+ of speech
SPEECH_DURATION_FOR_EXTEND = 3.0  # How long user must speak before extending silence window
WAKE_WORDS = ["hey_jarvis"]   # fallback model if custom model not found
WAKE_PHRASE = "bmo"           # actual phrase to listen for via STT
WAKE_VARIANTS = {"bmo", "beemo", "bemo", "beamo", "b.m.o", "bimo",
                 "vemo", "beema", "bima", "pmo", "beo", "bee mo", "be mo"}

# Picovoice Porcupine wake word (primary — best accuracy)
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PORCUPINE_MODEL = os.path.join(_SCRIPT_DIR, "hey_bmo.ppn")
PORCUPINE_ACCESS_KEY = os.environ.get("PICOVOICE_ACCESS_KEY", "")
PORCUPINE_AVAILABLE = os.path.isfile(PORCUPINE_MODEL) and bool(PORCUPINE_ACCESS_KEY)
PORCUPINE_SENSITIVITY = 0.9  # 0.0-1.0, higher = more sensitive but more false positives

# OpenWakeWord fallback — custom-trained "hey BMO" ONNX model
WAKE_CUSTOM_MODEL = os.path.join(_SCRIPT_DIR, "hey_bmo.onnx")
WAKE_USE_CUSTOM = os.path.isfile(WAKE_CUSTOM_MODEL)

# openwakeword threshold — configurable via BMO_WAKE_THRESHOLD env var
WAKE_OWW_THRESHOLD = float(os.environ.get("BMO_WAKE_THRESHOLD", "0.05"))

# TTS cache directory
TTS_CACHE_DIR = os.path.expanduser("~/.audiocache/tts")
TTS_CACHE_MAX_MB = 200  # LRU eviction threshold

# Common phrases to pre-warm TTS cache
TTS_PREWARM_PHRASES = [
    "I'm listening!", "One moment.", "Sure thing!", "Got it!",
    "Good morning!", "Good afternoon!", "Good evening!", "Good night!",
    "Hmm, I'm not sure about that.", "Let me think about that.",
    "Here's what I found.", "All done!", "Oops, something went wrong.",
    "You're welcome!", "BMO is happy to help!", "Bye bye!",
    "What can BMO do for you?", "Hey there!", "ADVENTURE TIME!",
    "BMO chop! Hi-YAH!",
]


def _load_voice_settings():
    """Load voice settings from data/settings.json."""
    settings_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "settings.json")
    try:
        if os.path.exists(settings_path):
            with open(settings_path) as f:
                import json as _json
                settings = _json.load(f)
            return settings.get("voice", {})
    except Exception:
        pass
    return {}


def _get_wake_model_paths() -> list[str]:
    """Resolve wake word model paths. Prefers custom-trained hey_bmo.onnx."""
    if WAKE_USE_CUSTOM:
        log.info(f"[wake] Using custom model: {WAKE_CUSTOM_MODEL}")
        return [WAKE_CUSTOM_MODEL]
    import openwakeword
    model_dir = os.path.join(os.path.dirname(openwakeword.__file__), "resources", "models")
    paths = []
    for name in WAKE_WORDS:
        for candidate in [f"{name}.onnx", f"{name}_v0.1.onnx"]:
            full = os.path.join(model_dir, candidate)
            if os.path.isfile(full):
                paths.append(full)
                break
    return paths


def _get_native_input_rate() -> int:
    """Auto-detect the mic's native sample rate to prevent ALSA errors."""
    try:
        info = sd.query_devices(kind='input')
        return int(info['default_samplerate'])
    except Exception:
        return 48000

# Local Piper TTS config (fallback)
PIPER_MODEL = os.path.join(MODELS_DIR, "piper", "en_US-hfc_female-medium.onnx")
PIPER_BMO_MODEL = os.path.join(MODELS_DIR, "piper", "bmo-voice.onnx")
PIPER_BMO_AVAILABLE = os.path.isfile(PIPER_BMO_MODEL)
PITCH_SHIFT = 400  # Semitone-cents to raise pitch for BMO voice


def _check_cloud() -> bool:
    """Quick check if cloud APIs are reachable."""
    try:
        from agent import _check_cloud_available
        return _check_cloud_available()
    except ImportError:
        try:
            r = requests.get("https://generativelanguage.googleapis.com/", timeout=3)
            return True
        except Exception:
            return False


class VoicePipeline:
    """Handles wake word detection, speech-to-text, text-to-speech, and speaker ID.

    STT is routed to Groq Whisper API, TTS to Fish Audio cloud API.
    Falls back to local models (Whisper-base, Piper) when cloud is unreachable.
    Wake word detection always runs locally for instant response.
    """

    def __init__(self, socketio=None, chat_callback=None):
        self.socketio = socketio
        self._chat_callback = chat_callback
        self._running = False
        self._listen_thread = None

        # Lazy-loaded LOCAL models (fallback only)
        self._whisper = None
        self._wake_model = None
        self._speaker_encoder = None
        self._voice_profiles = {}

        # Audio state
        self._audio_queue = queue.Queue()
        self._is_speaking = False

        # Silero VAD model (lazy-loaded)
        self._silero_vad = None
        self._silero_vad_tried = False

        # Adaptive ambient noise level (calibrated during wake word listening)
        self._ambient_rms_avg = 0.0

        # Streaming chat callback: if set, returns a generator of text chunks
        self._chat_stream_callback = None

        # Echo suppression: track recent BMO speech to ignore self-heard STT loops
        self._last_spoken_text = ""
        self._last_spoken_ts = 0.0

        # TTS sentence queue for streaming: LLM pushes sentences, worker speaks them
        self._tts_queue = queue.Queue()
        self._tts_worker_active = threading.Event()
        self._tts_interrupted = threading.Event()

        # TTS disk cache
        self._tts_cache_lock = threading.Lock()
        os.makedirs(TTS_CACHE_DIR, exist_ok=True)

        # Voice settings (overrides from settings.json)
        voice_settings = _load_voice_settings()
        self._silence_threshold = voice_settings.get("silence_threshold", SILENCE_THRESHOLD)
        self._vad_sensitivity = voice_settings.get("vad_sensitivity", 1.8)
        self._tts_provider = voice_settings.get("tts_provider", "auto")
        self._stt_provider = voice_settings.get("stt_provider", "auto")
        self._wake_enabled = voice_settings.get("wake_enabled", True)
        self._bmo_tts_enabled = voice_settings.get("bmo_tts_enabled", True)
        # None = play at system default volume (no per-call override). The web
        # volume slider mutates this; speak() temporarily overrides + restores.
        self._speak_volume = None

    # ── Model Loading (local fallback models) ─────────────────────────

    def _load_whisper(self):
        if self._whisper is None:
            from faster_whisper import WhisperModel
            self._whisper = WhisperModel("small", device="cpu", compute_type="int8")
        return self._whisper

    def _load_wake_model(self):
        if self._wake_model is None:
            from openwakeword.model import Model
            paths = _get_wake_model_paths()
            if not paths:
                raise RuntimeError("no wake word ONNX model files found (use custom model or install openwakeword default models)")
            try:
                self._wake_model = Model(
                    wakeword_models=paths,
                    inference_framework="onnx",
                )
            except TypeError:
                self._wake_model = Model(wakeword_model_paths=paths)
        return self._wake_model

    def _load_speaker_encoder(self):
        if self._speaker_encoder is None:
            from resemblyzer import VoiceEncoder
            self._speaker_encoder = VoiceEncoder()
        return self._speaker_encoder

    def _load_silero_vad(self):
        """Load Silero VAD model for speech detection. ~1MB, runs on CPU in <1ms."""
        if self._silero_vad is not None:
            return self._silero_vad
        if self._silero_vad_tried:
            return None
        self._silero_vad_tried = True
        try:
            import torch
            import torchaudio  # noqa: F401 — required by silero
            model, utils = torch.hub.load(
                repo_or_dir='snakers4/silero-vad',
                model='silero_vad',
                force_reload=False,
                trust_repo=True,
            )
            self._silero_vad = model
            log.info("[vad] Silero VAD loaded")
        except Exception as e:
            log.exception(f"[vad] Silero VAD not available, using energy-only")
        return self._silero_vad

    def _silero_check_speech(self, audio_int16: np.ndarray) -> float:
        """Run Silero VAD on audio chunk. Returns max speech probability 0.0-1.0."""
        vad = self._load_silero_vad()
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
        except Exception as e:
            log.exception(f"[vad] Silero error")
            return 1.0

    def _load_voice_profiles(self):
        if os.path.exists(VOICE_PROFILES_JSON):
            with open(VOICE_PROFILES_JSON, encoding="utf-8") as f:
                raw = json.load(f)
            self._voice_profiles = {
                k: np.asarray(v, dtype=np.float32) for k, v in raw.items()
            }
        elif os.path.exists(VOICE_PROFILES_PATH):
            with open(VOICE_PROFILES_PATH, "rb") as f:
                self._voice_profiles = pickle.load(f)
            self._save_voice_profiles_json()
            try:
                os.remove(VOICE_PROFILES_PATH)
            except OSError:
                pass
        return self._voice_profiles

    def _save_voice_profiles_json(self):
        os.makedirs(os.path.dirname(VOICE_PROFILES_JSON), exist_ok=True)
        serializable = {k: v.astype(float).tolist() for k, v in self._voice_profiles.items()}
        with open(VOICE_PROFILES_JSON, "w", encoding="utf-8") as f:
            json.dump(serializable, f, indent=2)

    # ── Voice Settings API ────────────────────────────────────────────

    def get_voice_settings(self):
        """Return current voice settings."""
        return {
            "silence_threshold": getattr(self, '_silence_threshold', SILENCE_THRESHOLD),
            "vad_sensitivity": getattr(self, '_vad_sensitivity', 1.8),
            "tts_provider": getattr(self, '_tts_provider', 'auto'),
            "stt_provider": getattr(self, '_stt_provider', 'auto'),
            "wake_enabled": getattr(self, '_wake_enabled', True),
            "bmo_tts_enabled": getattr(self, '_bmo_tts_enabled', True),
            "wake_variants": list(WAKE_VARIANTS),
        }

    def update_voice_setting(self, key, value):
        """Update a single voice setting and persist to settings.json."""
        if key == "silence_threshold":
            self._silence_threshold = int(value)
        elif key == "vad_sensitivity":
            self._vad_sensitivity = float(value)
        elif key == "tts_provider":
            self._tts_provider = str(value)
        elif key == "stt_provider":
            self._stt_provider = str(value)
        elif key == "wake_enabled":
            self._wake_enabled = bool(value)
        elif key == "bmo_tts_enabled":
            self._bmo_tts_enabled = bool(value)
        # Persist
        self._save_voice_settings()

    def _save_voice_settings(self):
        """Persist voice settings to data/settings.json."""
        settings_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "settings.json")
        try:
            import json as _json
            settings = {}
            if os.path.exists(settings_path):
                with open(settings_path) as f:
                    settings = _json.load(f)
            settings["voice"] = {
                "silence_threshold": getattr(self, '_silence_threshold', SILENCE_THRESHOLD),
                "vad_sensitivity": getattr(self, '_vad_sensitivity', 1.8),
                "tts_provider": getattr(self, '_tts_provider', 'auto'),
                "stt_provider": getattr(self, '_stt_provider', 'auto'),
                "wake_enabled": getattr(self, '_wake_enabled', True),
                "bmo_tts_enabled": getattr(self, '_bmo_tts_enabled', True),
            }
            os.makedirs(os.path.dirname(settings_path), exist_ok=True)
            with open(settings_path, "w") as f:
                _json.dump(settings, f, indent=2)
        except Exception as e:
            log.exception(f"[voice] Failed to save settings")

    # ── Wake Word Detection (always local — must be instant) ──────────

    def start_listening(self):
        """Start the background wake word listener."""
        if self._running:
            return
        self._running = True
        self._listen_thread = threading.Thread(target=self._wake_word_loop, daemon=True)
        self._listen_thread.start()

    def stop_listening(self):
        """Stop the background listener."""
        self._running = False

    def _wake_word_loop(self):
        """Listen for 'hey BMO' wake word.

        Priority: Picovoice Porcupine (best accuracy) → OpenWakeWord → energy+STT fallback.
        """
        self._wake_triggered = False

        # Pre-warm TTS cache in background
        threading.Thread(target=self._prewarm_tts_cache, daemon=True).start()
        # Pre-load Silero VAD so first recording doesn't have 3s load delay
        threading.Thread(target=self._load_silero_vad, daemon=True).start()
        # Verify AEC on startup
        self._check_aec()

        # Try Porcupine first (best accuracy)
        if PORCUPINE_AVAILABLE:
            log.info("[wake] Using Picovoice Porcupine for wake word detection")
            while self._running:
                try:
                    self._wake_listen_cycle_porcupine()
                    if self._wake_triggered:
                        self._wake_triggered = False
                        time.sleep(0.2)
                        self._on_wake()
                except Exception as e:
                    log.exception(f"[wake] Porcupine error, restarting in 2s...")
                    time.sleep(2)
            return

        # Fallback to OpenWakeWord
        chunk_size = 1280
        ring_buffer = []
        max_ring_chunks = int(2.0 * SAMPLE_RATE / chunk_size)
        energy_threshold = 2500
        cooldown_until = 0.0
        consecutive_active = 0
        ACTIVE_CHUNKS_NEEDED = 6

        oww_model = None
        try:
            oww_model = self._load_wake_model()
            mode = "single-stage" if WAKE_USE_CUSTOM else "OWW + STT confirm"
            log.info(f"[wake] Listening for 'hey BMO' ({mode})...")
        except Exception as e:
            log.exception(f"[wake] openwakeword not available, using energy+STT fallback...")

        while self._running:
            try:
                if oww_model:
                    self._wake_listen_cycle_oww(
                        oww_model, chunk_size, ring_buffer, max_ring_chunks,
                    )
                else:
                    self._wake_listen_cycle(
                        chunk_size, ring_buffer, max_ring_chunks,
                        energy_threshold, cooldown_until, consecutive_active,
                        ACTIVE_CHUNKS_NEEDED,
                    )
                if self._wake_triggered:
                    self._wake_triggered = False
                    time.sleep(0.2)
                    self._on_wake()
            except Exception as e:
                log.exception(f"[wake] Listener error, restarting in 2s...")
                time.sleep(2)

    def _wake_listen_cycle_porcupine(self):
        """Wake word detection using Picovoice Porcupine.

        Porcupine handles all audio processing internally — frame size is 512 samples
        at 16kHz. Much higher accuracy than OpenWakeWord with near-zero false positives.
        """
        import pvporcupine

        # Use custom .ppn if available, otherwise fall back to built-in "bumblebee"
        if os.path.isfile(PORCUPINE_MODEL):
            porcupine = pvporcupine.create(
                access_key=PORCUPINE_ACCESS_KEY,
                keyword_paths=[PORCUPINE_MODEL],
                sensitivities=[PORCUPINE_SENSITIVITY],
            )
            wake_phrase = "hey BMO"
        else:
            porcupine = pvporcupine.create(
                access_key=PORCUPINE_ACCESS_KEY,
                keywords=["bumblebee"],
                sensitivities=[PORCUPINE_SENSITIVITY],
            )
            wake_phrase = "bumblebee"

        frame_length = porcupine.frame_length  # 512 samples
        cooldown_until = 0.0

        # Try 16kHz directly (avoids resampling artifacts)
        # Fall back to native rate + resampling if 16kHz fails
        try:
            _test = sd.InputStream(samplerate=SAMPLE_RATE, channels=CHANNELS, dtype="int16", blocksize=frame_length)
            _test.close()
            stream_rate = SAMPLE_RATE
            stream_blocksize = frame_length
            use_resampling = False
            log.info(f"[wake] Porcupine mic: direct {SAMPLE_RATE}Hz (no resampling needed)")
        except Exception:
            stream_rate = _get_native_input_rate()
            stream_blocksize = int(frame_length * (stream_rate / SAMPLE_RATE))
            use_resampling = True
            log.info(f"[wake] Porcupine mic: {stream_rate}Hz → resampling to {SAMPLE_RATE}Hz")

        def audio_callback(indata, frames, time_info, status):
            if status:
                log.info(f"[audio] {status}")
            self._audio_queue.put(indata.copy())

        log.info(f"[wake] Porcupine listening for '{wake_phrase}' (frame={frame_length}, sensitivity={PORCUPINE_SENSITIVITY})")

        try:
            with sd.InputStream(
                samplerate=stream_rate,
                channels=CHANNELS,
                dtype="int16",
                blocksize=stream_blocksize,
                callback=audio_callback,
            ):
                chunks_processed = 0
                speech_threshold = 1500  # Log chunks above this RMS
                while self._running:
                    try:
                        chunk = self._audio_queue.get(timeout=1.0)
                    except queue.Empty:
                        continue

                    chunks_processed += 1

                    if use_resampling:
                        chunk = scipy.signal.resample(
                            chunk.flatten(), frame_length
                        ).astype(np.int16)
                    else:
                        chunk = chunk.flatten()

                    # Track ambient noise level
                    rms = np.sqrt(np.mean(chunk.astype(np.float32) ** 2))
                    if rms < 800:
                        if self._ambient_rms_avg == 0.0:
                            self._ambient_rms_avg = rms
                        else:
                            self._ambient_rms_avg = 0.02 * rms + 0.98 * self._ambient_rms_avg

                    # Log periodic status + speech-level chunks
                    if chunks_processed <= 3 or chunks_processed % 1000 == 0:
                        log.info(f"[wake] Porcupine #{chunks_processed}: rms={rms:.0f}, ambient={self._ambient_rms_avg:.0f}")
                    elif rms > speech_threshold:
                        log.info(f"[wake] SPEECH? rms={rms:.0f} (ambient={self._ambient_rms_avg:.0f})")

                    keyword_index = porcupine.process(chunk)

                    if keyword_index >= 0:
                        now = time.time()
                        if now < cooldown_until:
                            continue
                        cooldown_until = now + 1.5

                        # Bedtime mode: ignore wake word (mic muted)
                        scene_svc = getattr(self, '_scene_service', None)
                        if scene_svc and scene_svc.get_active() == "bedtime":
                            log.info("[wake] Suppressed (bedtime mode) — mic muted")
                            continue

                        log.info("[wake] Porcupine detected 'hey BMO'!")
                        self._emit("status", {"state": "listening"})
                        # Drain audio queue
                        while not self._audio_queue.empty():
                            self._audio_queue.get_nowait()
                        self._wake_triggered = True
                        return
        finally:
            porcupine.delete()

    def _wake_listen_cycle_oww(self, oww_model, chunk_size, ring_buffer, max_ring_chunks):
        """Wake detection with auto sample rate and single-stage for custom model.

        Custom hey_bmo model: single-stage — OWW trigger = immediate wake.
        Fallback hey_jarvis model: two-stage — OWW trigger + local STT confirmation.
        Auto-detects mic native sample rate and resamples to 16kHz if needed.
        """
        cooldown_until = time.time() + 3.0  # Skip initial mic noise
        use_single_stage = WAKE_USE_CUSTOM

        native_rate = _get_native_input_rate()
        use_resampling = (native_rate != SAMPLE_RATE)
        input_chunk_size = int(chunk_size * (native_rate / SAMPLE_RATE)) if use_resampling else chunk_size
        if use_resampling:
            log.info(f"[wake] Mic native rate: {native_rate}Hz, resampling to {SAMPLE_RATE}Hz")

        def audio_callback(indata, frames, time_info, status):
            if status:
                log.info(f"[audio] {status}")
            self._audio_queue.put(indata.copy())

        log.info(f"[wake] Opening mic: rate={native_rate}, blocksize={input_chunk_size}, resampling={use_resampling}")
        try:
            mic_stream = sd.InputStream(
                samplerate=native_rate,
                channels=CHANNELS,
                dtype="int16",
                blocksize=input_chunk_size,
                callback=audio_callback,
            )
        except Exception as e:
            log.exception(f"[wake] FATAL: Failed to open mic stream")
            time.sleep(2)
            return

        with mic_stream:
            chunks_processed = 0
            while self._running:
                try:
                    chunk = self._audio_queue.get(timeout=1.0)
                except queue.Empty:
                    continue

                chunks_processed += 1
                if chunks_processed <= 3 or chunks_processed % 100 == 0:
                    rms_dbg = np.sqrt(np.mean(chunk.astype(np.float32) ** 2))
                    log.info(f"[wake] Chunk #{chunks_processed}: shape={chunk.shape}, rms={rms_dbg:.0f}")

                if use_resampling:
                    chunk = scipy.signal.resample(
                        chunk.flatten(), chunk_size
                    ).astype(np.int16).reshape(-1, 1)

                ring_buffer.append(chunk)
                if len(ring_buffer) > max_ring_chunks:
                    ring_buffer.pop(0)

                rms = np.sqrt(np.mean(chunk.astype(np.float32) ** 2))
                if rms < 800:
                    if self._ambient_rms_avg == 0.0:
                        self._ambient_rms_avg = rms
                    else:
                        self._ambient_rms_avg = 0.02 * rms + 0.98 * self._ambient_rms_avg

                audio_f32 = chunk.flatten().astype(np.float32) / 32768.0
                try:
                    prediction = oww_model.predict(audio_f32)
                except Exception as e:
                    log.exception(f"[wake] predict() error")
                    time.sleep(0.5)
                    continue

                triggered = False
                for key, score in prediction.items():
                    if score > 0.04:  # Only log scores approaching threshold
                        log.info(f"[wake] OWW score: {key}={score:.4f} (threshold={WAKE_OWW_THRESHOLD})")
                    if score > WAKE_OWW_THRESHOLD:
                        log.info(f"[wake] OWW triggered: {key}={score:.3f}")
                        triggered = True
                        break

                if not triggered:
                    continue

                now = time.time()
                if now < cooldown_until:
                    continue
                cooldown_until = now + 1.5

                if use_single_stage:
                    # Silero VAD gate: confirm there's actual speech, not just noise
                    ring_audio = np.concatenate(ring_buffer) if ring_buffer else chunk.flatten()
                    speech_prob = self._silero_check_speech(ring_audio)
                    if speech_prob < 0.3:
                        log.info(f"[wake] OWW triggered but Silero says no speech (prob={speech_prob:.2f}), ignoring")
                        oww_model.reset()
                        continue

                    log.info(f"[wake] 'hey BMO' detected (single-stage, VAD={speech_prob:.2f})")
                    self._emit("status", {"state": "listening"})
                    ring_buffer.clear()
                    while not self._audio_queue.empty():
                        self._audio_queue.get_nowait()
                    oww_model.reset()
                    self._wake_triggered = True
                    return

                # Fallback two-stage: STT confirmation (local whisper first, cloud backup)
                ring_audio = np.concatenate(ring_buffer)
                try:
                    audio_bytes = ring_audio.tobytes()
                    wav_buf = self._pcm_to_wav(audio_bytes)
                    text = self._quick_stt(wav_buf)
                    if not text:
                        oww_model.reset()
                        continue
                    text_lower = text.lower().strip()
                    log.info(f"[wake] STT confirm: '{text_lower}'")
                    is_wake = any(
                        re.search(r'\b' + re.escape(v) + r'\b', text_lower)
                        for v in WAKE_VARIANTS
                    )
                    if is_wake:
                        log.info(f"[wake] Confirmed 'hey BMO' in: {text}")
                        self._emit("status", {"state": "listening"})
                        ring_buffer.clear()
                        while not self._audio_queue.empty():
                            self._audio_queue.get_nowait()
                        oww_model.reset()
                        self._wake_triggered = True
                        return
                    else:
                        oww_model.reset()
                except Exception as e:
                    log.exception(f"[wake] STT confirm failed")
                    oww_model.reset()

    def _check_aec(self):
        """Check PipeWire for echo-cancel nodes on startup."""
        try:
            result = subprocess.run(
                ["pw-link", "-l"],
                capture_output=True, text=True, timeout=5,
                env={**os.environ, "XDG_RUNTIME_DIR": "/run/user/1000"},
            )
            if "echo-cancel" in result.stdout.lower():
                log.info("[aec] Echo cancellation nodes found in PipeWire")
            else:
                log.info("[aec] WARNING: No echo-cancel nodes found — echo may occur")
                log.info("[aec] Consider: pactl load-module module-echo-cancel")
        except Exception:
            pass

    def _mute_mic(self, mute: bool):
        """No-op: mic muting disabled. AEC source handles echo cancellation.
        Previous implementation caused gevent blocking (5s+ delays) and left
        the mic permanently muted, making BMO deaf.
        """
        pass

    def _wake_listen_cycle(self, chunk_size, ring_buffer, max_ring_chunks,
                           energy_threshold, cooldown_until, consecutive_active,
                           active_needed):
        """One cycle of wake word listening. Exits when wake detected."""
        # Adaptive threshold state — mutable via nonlocal
        ambient_rms_avg = getattr(self, '_ambient_rms_avg', 0.0)
        ambient_alpha = 0.02
        ENERGY_HEADROOM = 1.8

        def audio_callback(indata, frames, time_info, status):
            if status:
                log.info(f"[audio] {status}")
            self._audio_queue.put(indata.copy())

        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype="int16",
            blocksize=chunk_size,
            callback=audio_callback,
        ) as stream:
            while self._running:
                try:
                    chunk = self._audio_queue.get(timeout=1.0)
                except queue.Empty:
                    continue

                # Maintain rolling buffer
                ring_buffer.append(chunk)
                if len(ring_buffer) > max_ring_chunks:
                    ring_buffer.pop(0)

                # Check energy level
                rms = np.sqrt(np.mean(chunk.astype(np.float32) ** 2))

                # Adaptive ambient noise tracking: update when chunk is quiet
                # (below current threshold = ambient noise, not speech)
                if rms < energy_threshold:
                    if ambient_rms_avg == 0.0:
                        ambient_rms_avg = rms  # seed on first quiet chunk
                    else:
                        ambient_rms_avg = ambient_alpha * rms + (1 - ambient_alpha) * ambient_rms_avg
                    # Update threshold: must be well above ambient
                    energy_threshold = max(800, ambient_rms_avg * ENERGY_HEADROOM)
                    self._ambient_rms_avg = ambient_rms_avg
                    consecutive_active = 0
                    continue

                # RMS above threshold — potential speech
                consecutive_active += 1

                now = time.time()
                if consecutive_active < active_needed or now < cooldown_until:
                    continue

                # Grab last ~2s of audio for analysis
                ring_audio = np.concatenate(ring_buffer)
                cooldown_until = now + 3.0  # 3s cooldown between STT checks
                consecutive_active = 0

                # Silero VAD check — confirm it's actually speech, not just noise
                speech_prob = self._silero_check_speech(ring_audio)
                if speech_prob < 0.3:
                    log.info(f"[wake] Silero rejected (prob={speech_prob:.2f})")
                    continue

                try:
                    audio_bytes = ring_audio.tobytes()
                    wav_buf = self._pcm_to_wav(audio_bytes)
                    text = self._quick_stt(wav_buf)
                    if not text:
                        continue  # Filtered as hallucination or no speech
                    text_lower = text.lower().strip()
                    log.info(f"[wake] STT check: '{text_lower}'")
                    is_wake = any(
                        re.search(r'\b' + re.escape(v) + r'\b', text_lower)
                        for v in WAKE_VARIANTS
                    )
                    if is_wake:
                        log.info(f"[wake] Detected 'hey BMO' in: {text}")
                        self._emit("status", {"state": "listening"})
                        ring_buffer.clear()
                        while not self._audio_queue.empty():
                            self._audio_queue.get_nowait()
                        # Exit the stream context first, then handle wake
                        self._wake_triggered = True
                        return
                except Exception as e:
                    log.exception(f"[wake] STT check failed")

    def _pcm_to_wav(self, pcm_bytes: bytes) -> bytes:
        """Convert raw PCM to WAV format for STT."""
        import wave
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(pcm_bytes)
        return buf.getvalue()

    # Common Whisper hallucinations on silence/ambient noise
    _WHISPER_HALLUCINATIONS = frozenset({
        "", ".", "so", "the", "i", "a", "oh", "oh.", "okay",
        "okay.", "thank you", "thank you.", "thanks", "thanks.", "bye",
        "hmm", "uh", "um", "mm", "you", "it", "is", "no", "yes",
    })

    def _quick_stt(self, wav_bytes: bytes) -> str:
        """Quick STT for wake word confirmation — local whisper first, cloud backup.

        Returns empty string if the result looks like a hallucination
        (very short text that Whisper commonly produces from silence).
        """
        text = ""

        # Prefer local faster-whisper: no network latency, works offline
        try:
            model = self._load_whisper()
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
                    result = groq_stt(wav_bytes, prompt="Hey BMO.")
                    text = result.get("text", "")
                    segments = result.get("segments", [])
                    if segments:
                        avg_no_speech = sum(s.get("no_speech_probability", 0) for s in segments) / len(segments)
                        if avg_no_speech > 0.5:
                            log.info(f"[wake] Rejected (no_speech_prob={avg_no_speech:.2f}): '{text}'")
                            return ""
            except Exception:
                return ""

        # Filter common single-word hallucinations
        cleaned = text.strip().lower().rstrip(".,!?")
        if cleaned in self._WHISPER_HALLUCINATIONS:
            return ""

        return text

    def _on_wake(self):
        """Called when wake word is detected. Records, transcribes, processes, then listens for follow-ups."""
        response_text = self._process_one_turn(is_follow_up=False)
        if not response_text:
            return

        # Enter follow-up conversation mode — no wake word needed
        self._follow_up_loop()

    def start_conversation(self):
        """Enter conversation mode programmatically (from alarms, notifications, etc.).

        Starts the follow-up loop in a background thread so the caller
        doesn't block.
        """
        if not self._running:
            return
        threading.Thread(target=self._follow_up_loop, daemon=True).start()

    def _tts_worker(self):
        """Background thread: pops sentences from queue and speaks them.

        Batches short consecutive sentences (< 80 chars) together to reduce
        API round-trips and inter-sentence gaps.
        """
        while True:
            try:
                text = self._tts_queue.get(timeout=0.1)
            except queue.Empty:
                continue
            if text is None:
                break
            if self._tts_interrupted.is_set():
                continue

            # Batch short sentences: peek at queue for more short items
            if len(text) < 80:
                batch = [text]
                batch_len = len(text)
                while batch_len < 250:
                    try:
                        next_text = self._tts_queue.get_nowait()
                    except queue.Empty:
                        break
                    if next_text is None:
                        self._tts_queue.put(None)  # put sentinel back
                        break
                    batch.append(next_text)
                    batch_len += len(next_text)
                    if len(next_text) >= 80:
                        break  # long sentence ends the batch
                text = " ".join(batch)

            self._tts_worker_active.set()
            if not getattr(self, '_bmo_tts_enabled', True):
                log.info(f"[tts-worker] Suppressed (BMO TTS off): {text[:60]}...")
                self._tts_worker_active.clear()
                continue
            # Bedtime mode check — suppress TTS unless it's a priority item
            scene_svc = getattr(self, '_scene_service', None)
            if scene_svc and scene_svc.get_active() == "bedtime":
                log.info(f"[tts-worker] Suppressed (bedtime mode): {text[:60]}...")
                self._tts_worker_active.clear()
                continue
            try:
                provider = getattr(self, '_tts_provider', 'auto')
                if provider == "piper_bmo" or (provider == "auto" and PIPER_BMO_AVAILABLE):
                    self._bmo_speak(text)
                elif provider == "edge":
                    self._edge_speak(text)
                else:
                    # Fish Audio has the BMO voice clone — best quality
                    self._cloud_speak(text)
            except Exception:
                try:
                    self._edge_speak(text)
                except Exception as e:
                    log.exception(f"[tts-worker] All TTS failed")
            finally:
                self._tts_worker_active.clear()

    def _wait_for_tts(self):
        """Block until the TTS queue is drained and the worker finishes speaking."""
        while not self._tts_queue.empty() or self._tts_worker_active.is_set():
            if self._tts_interrupted.is_set():
                break
            time.sleep(0.05)

    def interrupt(self):
        """Stop BMO mid-speech: clear TTS queue and abort current playback."""
        self._tts_interrupted.set()
        while not self._tts_queue.empty():
            try:
                self._tts_queue.get_nowait()
            except queue.Empty:
                break
        self._tts_queue.put(None)
        self._is_speaking = False
        self._emit("status", {"state": "idle"})
        log.info("[voice] Interrupted")

    def _stream_and_speak(self, text_gen) -> str:
        """Consume LLM text stream, buffer sentences, TTS each via worker thread.

        Sentences are pushed to a queue as they complete. A dedicated TTS worker
        thread speaks them in order, so the LLM keeps generating while TTS plays.
        The user hears the first sentence within 1-2 seconds of the LLM starting.
        Returns the full response text.
        """
        self._emit("status", {"state": "speaking"})
        self._is_speaking = True
        # Don't reset _speak_volume — it's set by the volume slider and should persist
        self._tts_interrupted.clear()
        # NOTE: mic muting removed — gevent blocks Popen for 5s, causing
        # more latency than echo pickup. The AEC source handles echo cancellation.

        # Drain any leftover items from previous runs
        while not self._tts_queue.empty():
            try:
                self._tts_queue.get_nowait()
            except queue.Empty:
                break

        worker = threading.Thread(target=self._tts_worker, daemon=True)
        worker.start()

        full_text = ""
        try:
            buffer = ""
            sentences_queued = 0

            for chunk in text_gen:
                if self._tts_interrupted.is_set():
                    break
                full_text += chunk
                buffer += chunk

                while True:
                    match = re.search(r'[.!?][\s\n]', buffer)
                    if match:
                        end = match.end()
                    elif len(buffer) > 60:
                        comma_match = re.search(r',\s', buffer[40:])
                        end = comma_match.end() + 40 if comma_match else None
                    else:
                        end = None
                    if end is None:
                        break
                    sentence = buffer[:end].strip()
                    buffer = buffer[end:]
                    if sentence:
                        # Strip [RELAY:...] tags — they're agent routing, not speech
                        sentence = re.sub(r'\[RELAY:\w+\].*', '', sentence, flags=re.DOTALL).strip()
                        tts_text = self._strip_markdown(sentence)
                        if tts_text:
                            sentences_queued += 1
                            log.info(f"[stream] Queue sentence {sentences_queued}: {tts_text[:60]}...")
                            self._tts_queue.put(tts_text)

            remaining = buffer.strip()
            if remaining and not self._tts_interrupted.is_set():
                # Strip [RELAY:...] tags from final chunk too
                remaining = re.sub(r'\[RELAY:\w+\].*', '', remaining, flags=re.DOTALL).strip()
                tts_text = self._strip_markdown(remaining)
                if tts_text:
                    sentences_queued += 1
                    log.info(f"[stream] Queue final ({sentences_queued}): {tts_text[:60]}...")
                    self._tts_queue.put(tts_text)

            # Signal worker to exit after all sentences are spoken
            self._tts_queue.put(None)
            if full_text.strip():
                self._remember_spoken(full_text)
            self._wait_for_tts()
            worker.join(timeout=5.0)

            return full_text
        except Exception as e:
            log.exception(f"[stream] Error")
            self._tts_queue.put(None)
            return full_text
        finally:
            self._is_speaking = False
            while not self._audio_queue.empty():
                try:
                    self._audio_queue.get_nowait()
                except queue.Empty:
                    break
            self._emit("status", {"state": "idle"})

    def _process_one_turn(self, is_follow_up: bool = False) -> str | None:
        """Record, transcribe, get response, speak it. Returns response text or None."""
        audio_data = self.record_until_silence()
        if audio_data is None:
            self._emit("status", {"state": "idle"})
            return None

        # Minimum energy check — reject if recording is just ambient noise
        rms = np.sqrt(np.mean(audio_data.astype(np.float32) ** 2))
        if rms < 200:
            log.info(f"[conv] Rejected recording (rms={rms:.0f}, too quiet for speech)")
            self._emit("status", {"state": "idle"})
            return None

        # Silero VAD check — reject recordings that are just noise, not speech
        speech_prob = self._silero_check_speech(audio_data)
        if speech_prob < 0.4:
            log.info(f"[conv] Silero rejected recording (prob={speech_prob:.2f})")
            self._emit("status", {"state": "idle"})
            return None

        # Save to temp file for processing
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            temp_path = f.name
            self._save_wav(f, audio_data)

        try:
            _t_spk0 = time.time()
            speaker = self.identify_speaker(temp_path)
            _t_spk1 = time.time()
            log.info(f"[timing] identify_speaker() took {_t_spk1 - _t_spk0:.2f}s")

            # Transcribe
            self._emit("status", {"state": "thinking"})
            _t_stt0 = time.time()
            text = self.transcribe(temp_path)
            _t_stt1 = time.time()
            log.info(f"[timing] transcribe() took {_t_stt1 - _t_stt0:.2f}s")
            if not text or text.strip() == "":
                self._emit("status", {"state": "idle"})
                return None

            log.info(f"[stt] {speaker}: {text}")
            if self._is_probable_self_echo(text):
                log.info("[echo] Ignoring probable self-heard transcription")
                self._emit("status", {"state": "idle"})
                return None
            self._emit("transcription", {"speaker": speaker, "text": text})

            # Voice enrollment intercept — always allow, even from unknown speakers
            text_lower_check = text.lower().strip()
            enrollment_name = self._check_enrollment_request(text_lower_check)
            if enrollment_name:
                response = self._do_voice_enrollment(enrollment_name, temp_path)
                self._emit("response", {"text": response, "speaker": speaker})
                self.speak(response)
                self._emit("status", {"state": "idle"})
                return response

            # Ignore unregistered speakers (but only if profiles exist)
            profiles = self._load_voice_profiles()
            if speaker == "unknown" and profiles:
                log.info(f"[voice] Ignoring unregistered speaker: '{text[:60]}'")
                self._emit("status", {"state": "idle"})
                return None

            # Check for conversation-ending phrases
            text_lower = text.lower().strip().rstrip(".")
            is_closing = text_lower in ("goodbye", "bye", "good night", "goodnight",
                              "that's all", "thanks bmo", "thank you bmo",
                              "never mind", "nevermind", "stop")

            # Use streaming path for non-closing turns (faster response)
            if self._chat_stream_callback and not is_closing:
                try:
                    _t_chat0 = time.time()
                    log.info("[timing] calling _chat_stream_callback...")
                    text_gen = self._chat_stream_callback(text, speaker)
                    response = self._stream_and_speak(text_gen)
                    if response and response.strip():
                        clean = self._strip_markdown(response)
                        self._emit("response", {"text": clean, "speaker": speaker})
                        return response
                except Exception as e:
                    log.exception(f"[stream] Streaming failed, falling back to sync")

            # Sync path: closing phrases and fallback
            if is_follow_up and is_closing:
                log.info("[conv] User ended conversation")
                if self._chat_callback:
                    response = self._chat_callback(text, speaker)
                    if response:
                        tts_text = self._strip_markdown(response)
                        log.info(f"[tts] Speaking: {tts_text[:80]}...")
                        self._emit("response", {"text": tts_text, "speaker": speaker})
                        self.speak(tts_text)
                self._emit("status", {"state": "idle"})
                return ""  # empty string = responded but end conversation

            # Process through chat and speak response
            if self._chat_callback:
                response = self._chat_callback(text, speaker)
                if response:
                    tts_text = self._strip_markdown(response)
                    log.info(f"[tts] Speaking: {tts_text[:80]}...")
                    self._emit("response", {"text": tts_text, "speaker": speaker})
                    self.speak(tts_text)
                    # Skip follow-up loop if user said a closing phrase on the first turn
                    if is_closing:
                        self._emit("status", {"state": "idle"})
                        return ""
                    return response
            return None
        except Exception as e:
            log.exception(f"[wake] Response error")
            self._emit("status", {"state": "idle"})
            return None
        finally:
            try:
                os.unlink(temp_path)
            except OSError:
                pass

    def listen_for_followup(self, timeout: float = 10.0):
        """Listen briefly for a user response after proactive speech.

        Opens a short listen window (default 10s) for a single response.
        Used after notifications, announcements, or other BMO-initiated speech.
        """
        if not self._running:
            return

        def _listen():
            self._emit("status", {"state": "follow_up"})
            heard = self._wait_for_speech(timeout)
            if heard:
                response = self._process_one_turn(is_follow_up=True)
                if response and response != "":
                    # Got a substantive response — enter full conversation mode
                    self._follow_up_loop()
                    return
            self._emit("status", {"state": "idle"})

        threading.Thread(target=_listen, daemon=True).start()

    def _follow_up_loop(self):
        """Listen for follow-up speech without wake word. Exits on silence or inactivity."""
        FOLLOW_UP_WAIT_FIRST = 4.0   # seconds to wait on first follow-up (short — most people don't follow up)
        FOLLOW_UP_WAIT = 5.0         # seconds to wait after an active conversation
        INACTIVITY_TIMEOUT = 10.0    # exit after this much total silence
        import time as _time
        last_activity = _time.monotonic()
        exchange_count = 0

        self._emit("conversation_mode", {"active": True})

        while self._running:
            wait_time = FOLLOW_UP_WAIT_FIRST if exchange_count == 0 else FOLLOW_UP_WAIT
            log.info(f"[conv] Listening for follow-up (wait={wait_time}s, exchanges={exchange_count})...")
            self._emit("status", {"state": "follow_up"})

            # Wait for speech energy within the follow-up window
            heard_speech = self._wait_for_speech(wait_time)
            if not heard_speech:
                # First follow-up: exit immediately if no speech (most interactions are single-turn)
                if exchange_count == 0:
                    log.info("[conv] No follow-up speech — back to wake word mode")
                    self._emit("status", {"state": "idle"})
                    self._emit("conversation_mode", {"active": False})
                    return
                # Subsequent: check inactivity timeout
                elapsed = _time.monotonic() - last_activity
                if elapsed >= INACTIVITY_TIMEOUT:
                    log.info("[conv] Inactivity timeout — back to wake word mode")
                    self._emit("status", {"state": "idle"})
                    self._emit("conversation_mode", {"active": False})
                    return
                continue

            last_activity = _time.monotonic()

            # User started talking — process this turn
            response = self._process_one_turn(is_follow_up=True)
            if response is None:
                # No speech captured or empty transcription
                log.info("[conv] Empty turn — back to wake word mode")
                self._emit("status", {"state": "idle"})
                self._emit("conversation_mode", {"active": False})
                return
            if response == "":
                # User said goodbye — conversation ended
                self._emit("conversation_mode", {"active": False})
                return

            exchange_count += 1
            last_activity = _time.monotonic()
            # Response was spoken — loop back and listen for another follow-up

    def _wait_for_speech(self, timeout: float) -> bool:
        """Wait up to `timeout` seconds for speech energy. Returns True if speech detected."""
        chunk_size = 1280
        # Use adaptive ambient level if available, otherwise start at 2500
        ambient = getattr(self, '_ambient_rms_avg', 0.0)
        energy_threshold = max(800, ambient * 1.8) if ambient > 0 else 2500
        consecutive_active = 0
        needed = 4  # ~320ms of sustained speech

        def audio_callback(indata, frames, time_info, status):
            self._audio_queue.put(indata.copy())

        # Drain any leftover audio
        while not self._audio_queue.empty():
            self._audio_queue.get_nowait()

        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype="int16",
            blocksize=chunk_size,
            callback=audio_callback,
        ):
            start = time.time()
            while time.time() - start < timeout:
                try:
                    chunk = self._audio_queue.get(timeout=0.5)
                except queue.Empty:
                    continue
                rms = np.sqrt(np.mean(chunk.astype(np.float32) ** 2))
                if rms > energy_threshold:
                    consecutive_active += 1
                    if consecutive_active >= needed:
                        # Silero VAD double-check before confirming speech
                        speech_prob = self._silero_check_speech(chunk)
                        if speech_prob < 0.3:
                            consecutive_active = 0
                            continue
                        # Drain queue so record_until_silence starts clean
                        while not self._audio_queue.empty():
                            self._audio_queue.get_nowait()
                        return True
                else:
                    consecutive_active = 0
        return False

    # ── Voice Enrollment (intercepted before LLM) ─────────────────────

    _ENROLL_PATTERNS = [
        r"learn my voice.*(?:my name is|i'm|i am)\s+(\w+)",
        r"remember my voice.*(?:my name is|i'm|i am)\s+(\w+)",
        r"enroll my voice.*(?:my name is|i'm|i am)\s+(\w+)",
        r"(?:my name is|i'm|i am)\s+(\w+).*(?:learn|remember|enroll|recognize)\s+(?:my\s+)?voice",
        r"voice.*(?:my name is|i'm|i am)\s+(\w+)",
    ]

    def _check_enrollment_request(self, text_lower: str) -> str | None:
        """Check if the user is asking for voice enrollment. Returns name or None."""
        for pattern in self._ENROLL_PATTERNS:
            m = re.search(pattern, text_lower, re.IGNORECASE)
            if m:
                name = m.group(1).capitalize()
                log.info(f"[voice] Enrollment request detected for: {name}")
                return name
        return None

    _MIN_ENROLLMENT_CLIPS = 3       # need at least this many good clips
    _ENROLLMENT_CLIP_MIN_SAMPLES = 8000  # ~0.5s at 16kHz — reject tiny clips

    def _validate_enrollment_clip(self, audio_data: np.ndarray) -> bool:
        """Check if an audio clip has enough speech for voice enrollment."""
        if len(audio_data) < self._ENROLLMENT_CLIP_MIN_SAMPLES:
            log.info(f"[voice] Clip too short ({len(audio_data)} samples)")
            return False
        speech_prob = self._silero_check_speech(audio_data)
        if speech_prob < 0.3:
            log.info(f"[voice] Clip rejected by VAD (prob={speech_prob:.2f})")
            return False
        return True

    def _do_voice_enrollment(self, name: str, current_audio_path: str) -> str:
        """Enroll a speaker with 3 audio clips for a robust voice profile.

        Uses the audio we already recorded as clip 1, then records 2 more clips
        with TTS prompts in between. Requires at least 2 good clips with
        confirmed speech, otherwise rejects and asks the user to try again.
        """
        clips = []
        extra_clips = []
        try:
            # Validate the first clip (the one that triggered enrollment)
            with open(current_audio_path, "rb") as f:
                import wave as _wave
                with _wave.open(f, "rb") as wf:
                    raw = wf.readframes(wf.getnframes())
                    first_audio = np.frombuffer(raw, dtype=np.int16)
            if self._validate_enrollment_clip(first_audio):
                clips.append(current_audio_path)
                log.info(f"[voice] Enrollment clip 1: OK ({len(first_audio)} samples)")
            else:
                log.info("[voice] Enrollment clip 1: rejected (not enough speech)")

            extra_prompts = [
                f"Great, keep talking {name}! Tell me about your day.",
                f"One more, {name}! Say anything you like.",
                f"Almost done, {name}! Just say a couple more sentences.",
            ]
            for i, prompt in enumerate(extra_prompts):
                if len(clips) >= self._MIN_ENROLLMENT_CLIPS:
                    break  # already have enough good clips
                self.speak(prompt)
                self._emit("status", {"state": "listening"})
                audio_data = self.record_until_silence()
                if audio_data is not None and self._validate_enrollment_clip(audio_data):
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                        self._save_wav(f, audio_data)
                        extra_clips.append(f.name)
                        clips.append(f.name)
                    log.info(f"[voice] Enrollment clip {i + 2}: OK ({len(audio_data)} samples)")
                else:
                    reason = "silent" if audio_data is None else "not enough speech"
                    log.info(f"[voice] Enrollment clip {i + 2}: rejected ({reason})")
                    self.speak("I didn't catch that. Speak a little louder or closer!")

            if len(clips) < self._MIN_ENROLLMENT_CLIPS:
                log.warning(f"[voice] Enrollment failed: only {len(clips)} good clips (need {self._MIN_ENROLLMENT_CLIPS})")
                return (
                    f"Sorry {name}, I only got {len(clips)} good recording"
                    f"{'s' if len(clips) != 1 else ''}. "
                    f"I need at least {self._MIN_ENROLLMENT_CLIPS}. "
                    f"Try again and make sure to speak clearly!"
                )

            self.enroll_speaker(name, clips)
            return (
                f"All done! I've learned your voice from {len(clips)} samples, {name}. "
                f"I'll recognize you from now on!"
            )
        except Exception as e:
            log.exception(f"[voice] Enrollment failed")
            return "Hmm, I had trouble learning your voice. Let's try again later!"
        finally:
            for path in extra_clips:
                if os.path.exists(path):
                    os.unlink(path)

    @staticmethod
    def _strip_markdown(text: str) -> str:
        """Strip all markdown/formatting from text for plain-English TTS and chat display."""
        # Hardware control tags
        text = re.sub(r'\[(?:FACE|LED|EMOTION|SOUND|MUSIC|NPC):[^\]]*\]', '', text)
        # Fenced code blocks (triple backticks, with optional language tag)
        text = re.sub(r'```[\s\S]*?```', '', text)
        # Bold/italic asterisks and underscores
        text = re.sub(r'\*+', '', text)
        text = re.sub(r'_+', ' ', text)
        # Headings
        text = re.sub(r'#+\s*', '', text)
        # Inline code backticks
        text = re.sub(r'`([^`]*)`', r'\1', text)
        # Bullet points (-, *, +)
        text = re.sub(r'(?m)^\s*[-*+]\s+', '', text)
        # Numbered lists
        text = re.sub(r'(?m)^\s*\d+[.)]\s+', '', text)
        # Blockquotes
        text = re.sub(r'(?m)^>\s*', '', text)
        # Markdown links [text](url) -> text
        text = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', text)
        # Horizontal rules
        text = re.sub(r'(?m)^-{3,}$', '', text)
        # Collapse whitespace
        text = re.sub(r'  +', ' ', text)
        text = re.sub(r'\n{3,}', '\n\n', text)
        return text.strip()

    def _normalize_for_echo(self, text: str) -> str:
        text = text.lower()
        text = re.sub(r'[^a-z0-9\s]', ' ', text)
        text = re.sub(r'\s+', ' ', text)
        return text.strip()

    def _remember_spoken(self, text: str) -> None:
        cleaned = self._normalize_for_echo(self._strip_markdown(text))
        if cleaned:
            self._last_spoken_text = cleaned
            self._last_spoken_ts = time.time()

    def _is_probable_self_echo(self, transcript: str) -> bool:
        if not self._last_spoken_text:
            return False
        age = time.time() - self._last_spoken_ts
        if age > 12:
            return False

        heard = self._normalize_for_echo(transcript)
        if not heard or len(heard) < 15:
            return False

        last = self._last_spoken_text
        if heard in last or last in heard:
            return True

        ratio = difflib.SequenceMatcher(a=heard, b=last).ratio()
        return ratio >= 0.72

    # ── Recording ────────────────────────────────────────────────────

    def record_until_silence(self) -> np.ndarray | None:
        """Record audio until silence is detected. Returns raw int16 numpy array.

        Uses adaptive silence threshold based on ambient noise level.
        Extends silence duration after 3s+ of speech to avoid mid-sentence cutoffs.
        Silero VAD double-check: if RMS says silence but VAD says speech, keep recording.
        """
        chunks = []
        silence_start = None
        started_speaking = False
        speech_start_time = None
        log.info("[record] Recording...")

        # Adaptive silence threshold from ambient noise
        ambient = getattr(self, '_ambient_rms_avg', 0.0)
        silence_thresh = max(600, ambient * 2.0) if ambient > 0 else SILENCE_THRESHOLD

        def callback(indata, frames, time_info, status):
            chunks.append(indata.copy())

        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype="int16",
            callback=callback,
        ):
            start_time = time.time()
            while time.time() - start_time < MAX_RECORD_SECONDS:
                time.sleep(0.05)
                if not chunks:
                    continue

                latest = chunks[-1].flatten()
                rms = np.sqrt(np.mean(latest.astype(np.float32) ** 2))

                if rms > silence_thresh:
                    started_speaking = True
                    if speech_start_time is None:
                        speech_start_time = time.time()
                    silence_start = None
                elif started_speaking:
                    # Silero VAD double-check: if RMS says silence but VAD says speech, keep recording
                    vad_prob = self._silero_check_speech(latest)
                    if vad_prob > 0.5:
                        silence_start = None
                        continue

                    if silence_start is None:
                        silence_start = time.time()
                    else:
                        # Extend silence window after 3s+ of speech
                        speech_duration = time.time() - speech_start_time if speech_start_time else 0
                        silence_duration = SILENCE_DURATION_EXTENDED if speech_duration > SPEECH_DURATION_FOR_EXTEND else SILENCE_DURATION
                        if time.time() - silence_start > silence_duration:
                            break

        elapsed = time.time() - start_time
        log.info(f"[record] Done ({elapsed:.1f}s, {len(chunks)} chunks, spoke={started_speaking})")

        if not started_speaking:
            return None

        audio = np.concatenate(chunks)

        max_rms = max(
            np.sqrt(np.mean(c.astype(np.float32) ** 2))
            for c in chunks
        ) if chunks else 0
        if max_rms < silence_thresh * 2.0:
            log.info(f"[record] Discarded — max RMS {max_rms:.0f} too low (need {silence_thresh * 2.0:.0f})")
            return None

        return audio

    def record_clip(self, duration: float = 10.0) -> str:
        """Record a fixed-duration clip and save to a temp file. Returns file path."""
        frames = int(SAMPLE_RATE * duration)
        audio = sd.rec(frames, samplerate=SAMPLE_RATE, channels=CHANNELS, dtype="int16")
        sd.wait()

        path = os.path.join(DATA_DIR, f"clip_{int(time.time())}.wav")
        with open(path, "wb") as f:
            self._save_wav(f, audio)
        return path

    # ── Speech-to-Text (Groq Whisper → local fallback) ──────────────

    # Whisper hallucinations on silence/noise (expanded list for main transcription)
    _TRANSCRIPTION_HALLUCINATIONS = frozenset({
        "", ".", "so", "the", "i", "a", "oh", "oh.", "okay", "okay.",
        "thank you", "thank you.", "thanks", "thanks.", "bye", "bye.",
        "hmm", "uh", "um", "mm", "you", "it", "is", "no", "yes",
        "you know", "you know.", "right", "right.", "yeah", "yeah.",
        "i mean", "like", "well", "so.", "and", "but", "just",
        "what", "that", "this", "here", "there",
    })

    def transcribe(self, audio_path: str) -> str:
        """Transcribe audio file to text.

        Routes to local Whisper-small (primary) with Groq Whisper API fallback.
        Respects stt_provider setting: 'auto' (local-first), 'local', 'groq'.
        """
        provider = getattr(self, '_stt_provider', 'auto')
        text = ""

        if provider == "groq":
            text = self._cloud_transcribe(audio_path)
        elif provider == "local":
            text = self._local_transcribe(audio_path)
        else:
            # Auto: local Whisper first, Groq fallback
            try:
                text = self._local_transcribe(audio_path)
            except Exception as e:
                log.exception(f"[stt] Local STT failed, falling back to Groq")
                if _check_cloud():
                    try:
                        text = self._cloud_transcribe(audio_path)
                    except Exception as e2:
                        log.exception(f"[stt] Groq STT also failed")

        cleaned = text.strip().lower().rstrip(".,!?")
        if cleaned in self._TRANSCRIPTION_HALLUCINATIONS:
            log.info(f"[stt] Filtered hallucination: '{text}'")
            return ""
        return text

    def _cloud_transcribe(self, audio_path: str) -> str:
        """Send audio to Groq Whisper API for transcription.

        Preprocesses audio (high-pass filter, normalize) before sending.
        Uses dynamic prompt with enrolled speaker names.
        Rejects silence/noise before hitting the API to prevent hallucinations.
        """
        # Read and preprocess audio
        with open(audio_path, "rb") as f:
            with wave.open(f, "rb") as wf:
                raw = wf.readframes(wf.getnframes())
                audio_int16 = np.frombuffer(raw, dtype=np.int16)

        # Pre-API energy gate: reject recordings that are mostly silence/noise
        # Whisper hallucinates on quiet audio (invents "Good morning", "Thank you", etc.)
        rms = np.sqrt(np.mean(audio_int16.astype(np.float32) ** 2))
        if rms < 200:
            log.info(f"[stt] Pre-API rejection: audio too quiet (rms={rms:.0f})")
            return ""

        # Check that at least 5% of frames have speech-level energy
        frame_size = SAMPLE_RATE // 10  # 100ms frames
        speech_frames = 0
        total_frames = max(1, len(audio_int16) // frame_size)
        for i in range(0, len(audio_int16) - frame_size, frame_size):
            frame_rms = np.sqrt(np.mean(audio_int16[i:i+frame_size].astype(np.float32) ** 2))
            if frame_rms > 500:
                speech_frames += 1
        speech_ratio = speech_frames / total_frames
        if speech_ratio < 0.05:
            log.info(f"[stt] Pre-API rejection: only {speech_ratio:.0%} speech frames")
            return ""

        processed = self._preprocess_audio(audio_int16)
        wav_buf = self._pcm_to_wav(processed.tobytes())

        # Build dynamic prompt — vocabulary hints only, no full sentences.
        # Whisper regurgitates full-sentence prompts when given silence.
        profiles = self._load_voice_profiles()
        speaker_names = ", ".join(profiles.keys()) if profiles else "Gavin"
        prompt = f"BMO, {speaker_names}"

        result = groq_stt(wav_buf, prompt=prompt)

        text = result.get("text", "").strip()

        # Confidence filtering: reject segments with high no_speech_probability
        segments = result.get("segments", [])
        if segments:
            avg_no_speech = sum(s.get("no_speech_probability", 0) for s in segments) / len(segments)
            if avg_no_speech > 0.4:
                log.info(f"[stt] Rejected (avg no_speech_prob={avg_no_speech:.2f}): '{text}'")
                return ""
            # Also check avg_logprob — hallucinated text has very low confidence
            avg_logprob = sum(s.get("avg_logprob", 0) for s in segments) / len(segments)
            if avg_logprob < -1.2:
                log.info(f"[stt] Rejected (avg_logprob={avg_logprob:.2f}): '{text}'")
                return ""

        # Short text from long recordings is common with voice commands
        # (e.g., "what time is it" from 8s recording with silence padding)
        # Only reject truly trivial single-word outputs from very long recordings
        duration = result.get("duration", 0)
        if duration > 8 and len(text.split()) <= 1:
            log.info(f"[stt] Rejected (single word from {duration:.1f}s recording): '{text}'")
            return ""

        return text

    def _local_transcribe(self, audio_path: str) -> str:
        """Transcribe with local Whisper-small model (CPU, good accuracy)."""
        model = self._load_whisper()
        segments, _ = model.transcribe(audio_path, beam_size=5)
        return " ".join(seg.text.strip() for seg in segments)

    # ── Text-to-Speech (Fish Audio → local fallback) ────────────────

    def speak(self, text: str, speaker: str = "bmo_calm", emotion: str | None = None, volume: int | None = None, priority: str | None = None):
        """Convert text to speech and play through speakers.

        TTS chain: cache → Piper BMO → Fish Audio → edge-tts → generic Piper.
        Respects tts_provider setting for forced provider selection.
        Suppressed during bedtime scene UNLESS priority is set to bypass.

        Args:
            priority: If "alarm", "timer", or "emergency", bypasses bedtime suppression.
        """
        TTS_BYPASS = {"alarm", "timer", "emergency", "critical"}
        if not getattr(self, '_bmo_tts_enabled', True) and priority not in TTS_BYPASS:
            log.info(f"[tts] Suppressed (BMO TTS off): {text[:60]}...")
            return
        # Suppress speech during bedtime mode (but allow alarms, timers, emergencies)
        BEDTIME_BYPASS = {"alarm", "timer", "emergency", "critical"}
        scene_svc = getattr(self, '_scene_service', None)
        if scene_svc and scene_svc.get_active() == "bedtime":
            if priority not in BEDTIME_BYPASS:
                log.info(f"[tts] Suppressed (bedtime mode): {text[:60]}...")
                return
            else:
                log.info(f"[tts] Bedtime bypass ({priority}): {text[:60]}...")

        self._emit("status", {"state": "speaking"})
        self._is_speaking = True
        # Use caller's volume for this playback only; don't change persisted level
        original_volume = self._speak_volume
        if volume is not None:
            self._speak_volume = volume

        if emotion:
            speaker = f"bmo_{emotion}"

        self._mute_mic(True)

        try:
            cached = self._tts_cache_get(text, speaker)
            if cached:
                log.info(f"[tts] Cache hit for: {text[:40]}...")
                self._play_audio(cached)
                return

            provider = getattr(self, '_tts_provider', 'auto')

            if provider == "piper_bmo":
                self._bmo_speak(text, emotion)
                return
            elif provider == "fish":
                self._cloud_speak(text, speaker)
                return
            elif provider == "edge":
                self._edge_speak(text)
                return
            elif provider == "local":
                self._local_speak(text)
                return

            # Auto: Piper BMO → Fish Audio → edge-tts → generic Piper
            if PIPER_BMO_AVAILABLE:
                try:
                    self._bmo_speak(text, emotion)
                    return
                except Exception as e:
                    log.exception(f"[tts] Piper BMO failed, trying Fish Audio")

            try:
                self._cloud_speak(text, speaker)
                return
            except Exception as e:
                log.exception(f"[tts] Fish Audio failed, trying edge-tts")

            try:
                self._edge_speak(text)
                return
            except Exception as e:
                log.exception(f"[tts] edge-tts failed, falling back to local")

            self._local_speak(text)
        except Exception as e:
            log.exception(f"[tts] All TTS failed")
        finally:
            # Restore persisted volume if we temporarily changed it
            if volume is not None:
                self._speak_volume = original_volume
            self._is_speaking = False
            self._mute_mic(False)
            time.sleep(0.5)
            while not self._audio_queue.empty():
                try:
                    self._audio_queue.get_nowait()
                except queue.Empty:
                    break
            self._emit("status", {"state": "idle"})

    # ── TTS Disk Cache ────────────────────────────────────────────────

    def _tts_cache_key(self, text: str, speaker: str = "") -> str:
        """Generate cache key from text + speaker."""
        import hashlib
        raw = f"{text}|{speaker}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def _tts_cache_get(self, text: str, speaker: str = "") -> str | None:
        """Check if TTS audio is cached. Returns file path or None."""
        key = self._tts_cache_key(text, speaker)
        # Check for any audio format
        for ext in (".opus", ".mp3", ".wav"):
            path = os.path.join(TTS_CACHE_DIR, f"{key}{ext}")
            if os.path.exists(path):
                # Touch file for LRU
                os.utime(path, None)
                return path
        return None

    def _tts_cache_put(self, text: str, speaker: str, audio_bytes: bytes, ext: str = ".mp3"):
        """Save TTS audio to cache."""
        key = self._tts_cache_key(text, speaker)
        path = os.path.join(TTS_CACHE_DIR, f"{key}{ext}")
        try:
            with self._tts_cache_lock:
                with open(path, "wb") as f:
                    f.write(audio_bytes)
            self._tts_cache_evict()
        except Exception as e:
            log.exception(f"[tts-cache] Save failed")

    def _tts_cache_evict(self):
        """Evict oldest cache entries if total size exceeds TTS_CACHE_MAX_MB."""
        try:
            files = []
            total = 0
            for f in os.listdir(TTS_CACHE_DIR):
                path = os.path.join(TTS_CACHE_DIR, f)
                if os.path.isfile(path):
                    stat = os.stat(path)
                    files.append((path, stat.st_mtime, stat.st_size))
                    total += stat.st_size

            max_bytes = TTS_CACHE_MAX_MB * 1024 * 1024
            if total <= max_bytes:
                return

            # Sort by mtime ascending (oldest first)
            files.sort(key=lambda x: x[1])
            for path, _, size in files:
                if total <= max_bytes:
                    break
                os.unlink(path)
                total -= size
                log.info(f"[tts-cache] Evicted: {os.path.basename(path)}")
        except Exception as e:
            log.exception(f"[tts-cache] Eviction error")

    def _prewarm_tts_cache(self):
        """Pre-warm TTS cache with common phrases on startup."""
        cached = 0
        for phrase in TTS_PREWARM_PHRASES:
            speaker = "piper_bmo_neutral" if PIPER_BMO_AVAILABLE else "bmo_calm"
            if self._tts_cache_get(phrase, speaker):
                cached += 1
                continue
            try:
                if PIPER_BMO_AVAILABLE:
                    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                        raw_path = f.name
                    subprocess.run(
                        ["piper", "--model", PIPER_BMO_MODEL, "--output_file", raw_path],
                        input=phrase, text=True, capture_output=True, check=True,
                    )
                    with open(raw_path, "rb") as f:
                        audio = f.read()
                    os.unlink(raw_path)
                    self._tts_cache_put(phrase, speaker, audio, ext=".wav")
                else:
                    audio = fish_audio_tts(phrase, format="opus")
                    self._tts_cache_put(phrase, speaker, audio, ext=".opus")
                cached += 1
            except Exception:
                pass
        log.info(f"[tts-cache] Pre-warmed {cached}/{len(TTS_PREWARM_PHRASES)} phrases")

    # ── Audio Preprocessing for STT ──────────────────────────────────

    def _preprocess_audio(self, audio_int16: np.ndarray) -> np.ndarray:
        """Preprocess audio for better STT accuracy.

        - High-pass filter at 80Hz (removes low-frequency noise/hum)
        - Peak normalize to -3dBFS
        - Trim silence via energy detection
        """
        audio_f32 = audio_int16.astype(np.float32)

        # High-pass filter at 80Hz using simple first-order IIR
        rc = 1.0 / (2.0 * np.pi * 80.0)
        dt = 1.0 / SAMPLE_RATE
        alpha = rc / (rc + dt)
        filtered = np.zeros_like(audio_f32)
        filtered[0] = audio_f32[0]
        for i in range(1, len(audio_f32)):
            filtered[i] = alpha * (filtered[i - 1] + audio_f32[i] - audio_f32[i - 1])

        # Peak normalize to -3dBFS
        peak = np.max(np.abs(filtered))
        if peak > 0:
            target = 32768.0 * (10 ** (-3.0 / 20.0))  # -3dBFS
            filtered = filtered * (target / peak)

        return np.clip(filtered, -32768, 32767).astype(np.int16)

    def _play_audio(self, path: str):
        """Play an audio file — via ffplay (Pi) or emit URL to browser."""
        import os as _os
        file_size = _os.path.getsize(path)
        vol = getattr(self, "_speak_volume", None)
        vol_pct = f" @ {vol}%" if vol is not None else ""

        # Check if browser output is configured (set by app.py)
        tts_output = getattr(self, "_tts_output_mode", "pi")
        if tts_output == "browser" and self.socketio:
            filename = _os.path.basename(path)
            url = f"/api/tts/audio/{filename}"
            log.info(f"[tts] Sending {file_size} bytes to browser: {url}")
            self.socketio.emit("tts_audio", {"url": url, "volume": vol})
            # Don't delete file immediately — browser needs time to fetch it
            # Schedule cleanup after 30s
            def _cleanup():
                time.sleep(30)
                if _os.path.exists(path):
                    _os.unlink(path)
            threading.Thread(target=_cleanup, daemon=True).start()
            return

        log.info(f"[tts] Playing {file_size} bytes via ffplay{vol_pct}...")
        env = os.environ.copy()
        env["XDG_RUNTIME_DIR"] = "/run/user/1000"
        cmd = ["ffplay", "-nodisp", "-autoexit", "-loglevel", "error"]
        if vol is not None:
            cmd += ["-volume", str(vol)]
        cmd.append(path)
        start = time.time()
        result = subprocess.run(
            cmd,
            capture_output=True, timeout=120, env=env,
        )
        elapsed = time.time() - start
        if result.returncode != 0:
            log.warning(f"[tts] ffplay error (rc={result.returncode}, {elapsed:.1f}s): {result.stderr.decode().strip()}")
        else:
            log.info(f"[tts] Playback done ({elapsed:.1f}s)")

    def _edge_speak(self, text: str):
        """Generate speech via edge-tts (fast, free) and play locally.

        Uses subprocess CLI to bypass gevent monkey-patching which breaks
        asyncio.run() inside the Flask-SocketIO process.
        """
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            temp_path = f.name

        try:
            _t0 = time.time()
            # Try venv edge-tts first, then system
            edge_tts_bin = os.path.expanduser("~/home-lab/bmo/pi/venv/bin/edge-tts")
            if not os.path.isfile(edge_tts_bin):
                edge_tts_bin = "edge-tts"
            result = subprocess.run(
                [edge_tts_bin, "--voice", EDGE_TTS_VOICE, "--text", text,
                 "--write-media", temp_path],
                capture_output=True, timeout=15,
            )
            _t1 = time.time()
            if result.returncode != 0:
                raise RuntimeError(f"edge-tts failed: {result.stderr.decode()[:200]}")
            log.info(f"[tts] edge-tts generated in {_t1 - _t0:.2f}s")
            self._play_audio(temp_path)
        finally:
            if getattr(self, "_tts_output_mode", "pi") != "browser":
                if os.path.exists(temp_path):
                    os.unlink(temp_path)

    def _split_tts_chunks(self, text: str, max_chars: int = 500) -> list[str]:
        """Split text into TTS-friendly chunks at sentence boundaries."""
        if len(text) <= max_chars:
            return [text]
        chunks = []
        current = ""
        # Split by sentence-ending punctuation
        sentences = re.split(r'(?<=[.!?])\s+', text)
        for sentence in sentences:
            if len(current) + len(sentence) + 1 <= max_chars:
                current = f"{current} {sentence}".strip() if current else sentence
            else:
                if current:
                    chunks.append(current)
                current = sentence
        if current:
            chunks.append(current)
        return chunks or [text]

    def _cloud_speak(self, text: str, speaker: str = "bmo_calm"):
        """Generate speech via Fish Audio API with pipelined playback + caching.

        Uses opus format (30-50% smaller). Caches results to disk.
        Splits text into sentence-sized chunks and overlaps TTS generation
        of the next chunk with playback of the current one.
        """
        from concurrent.futures import ThreadPoolExecutor, Future
        from services.cloud_providers import FISH_AUDIO_VOICE_ID

        chunks = self._split_tts_chunks(text, max_chars=200)

        if len(chunks) <= 1:
            audio_bytes = fish_audio_tts(chunks[0], voice_id=FISH_AUDIO_VOICE_ID, format="opus")
            log.info(f"[tts] Got {len(audio_bytes)} bytes from Fish Audio (opus)")
            # Cache single-chunk responses
            self._tts_cache_put(text, speaker, audio_bytes, ext=".opus")
            with tempfile.NamedTemporaryFile(suffix=".opus", delete=False) as f:
                f.write(audio_bytes)
                f.flush()
                temp_path = f.name
            try:
                self._play_audio(temp_path)
            finally:
                if getattr(self, "_tts_output_mode", "pi") != "browser":
                    os.unlink(temp_path)
            return

        is_browser = getattr(self, "_tts_output_mode", "pi") == "browser"

        def _generate(chunk_text):
            return fish_audio_tts(chunk_text, voice_id=FISH_AUDIO_VOICE_ID, format="opus")

        with ThreadPoolExecutor(max_workers=1) as pool:
            next_future: Future = pool.submit(_generate, chunks[0])

            for i, chunk in enumerate(chunks):
                audio_bytes = next_future.result()
                log.info(f"[tts] Got {len(audio_bytes)} bytes from Fish Audio ({i+1}/{len(chunks)})")

                if i + 1 < len(chunks):
                    next_future = pool.submit(_generate, chunks[i + 1])

                with tempfile.NamedTemporaryFile(suffix=".opus", delete=False) as f:
                    f.write(audio_bytes)
                    f.flush()
                    temp_path = f.name
                try:
                    self._play_audio(temp_path)
                finally:
                    if not is_browser:
                        os.unlink(temp_path)

    def _local_speak(self, text: str):
        """Generate speech with local Piper TTS + pitch shift (fallback)."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as raw_file:
            raw_path = raw_file.name

        pitched_path = raw_path.replace(".wav", "_pitched.wav")

        try:
            # Generate speech with Piper
            subprocess.run(
                ["piper", "--model", PIPER_MODEL, "--output_file", raw_path],
                input=text,
                text=True,
                capture_output=True,
                check=True,
            )

            # Pitch-shift up for BMO voice using sox
            subprocess.run(
                ["sox", raw_path, pitched_path, "pitch", str(PITCH_SHIFT)],
                capture_output=True,
                check=True,
            )

            # Play through speakers
            subprocess.run(["pw-play", pitched_path], capture_output=True, check=True)

        except FileNotFoundError:
            # Fallback: play without pitch shift if sox not available
            log.info("[tts] sox not found, playing without pitch shift")
            subprocess.run(["pw-play", raw_path], capture_output=True)
        finally:
            for p in (raw_path, pitched_path):
                if os.path.exists(p):
                    os.unlink(p)

    def _bmo_speak(self, text: str, emotion: str | None = None):
        """Generate speech with custom Piper BMO voice + emotion prosody via sox."""
        from services.voice_personality import get_prosody

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as raw_file:
            raw_path = raw_file.name
        prosody_path = raw_path.replace(".wav", "_prosody.wav")

        try:
            subprocess.run(
                ["piper", "--model", PIPER_BMO_MODEL, "--output_file", raw_path],
                input=text, text=True, capture_output=True, check=True,
            )

            prosody = get_prosody(emotion=emotion)
            speed = prosody.get("speed", 1.0)
            pitch = prosody.get("pitch", 0)

            sox_effects = []
            if speed != 1.0:
                sox_effects += ["tempo", str(speed)]
            if pitch != 0:
                sox_effects += ["pitch", str(pitch * 100)]

            if sox_effects:
                subprocess.run(
                    ["sox", raw_path, prosody_path] + sox_effects,
                    capture_output=True, check=True,
                )
                play_path = prosody_path
            else:
                play_path = raw_path

            # Cache the result
            cache_speaker = f"piper_bmo_{emotion or 'neutral'}"
            with open(play_path, "rb") as f:
                audio_bytes = f.read()
            self._tts_cache_put(text, cache_speaker, audio_bytes, ext=".wav")

            self._play_audio(play_path)
        except FileNotFoundError as e:
            log.exception(f"[tts] Piper BMO not available")
            raise
        finally:
            for p in (raw_path, prosody_path):
                if os.path.exists(p):
                    os.unlink(p)

    # ── Speaker Identification ───────────────────────────────────────

    def identify_speaker(self, audio_path: str) -> str:
        """Identify who is speaking from a voice clip.

        Returns speaker name if matched (cosine similarity > 0.75),
        otherwise "unknown". Gracefully returns "unknown" if resemblyzer
        or torch are not available.
        """
        try:
            profiles = self._load_voice_profiles()
            if not profiles:
                return "unknown"

            from resemblyzer import preprocess_wav

            encoder = self._load_speaker_encoder()
            wav = preprocess_wav(audio_path)
            embed = encoder.embed_utterance(wav)

            best_name = "unknown"
            best_score = 0.0

            for name, profile_embed in profiles.items():
                similarity = float(
                    np.dot(embed, profile_embed)
                    / (np.linalg.norm(embed) * np.linalg.norm(profile_embed))
                )
                log.info(f"[speaker] {name}: similarity={similarity:.3f}")
                if similarity > 0.75 and similarity > best_score:
                    best_name = name
                    best_score = similarity

            if best_name != "unknown":
                log.info(f"[speaker] Identified: {best_name} (score={best_score:.2f})")
            return best_name
        except Exception as e:
            log.exception(f"[speaker] Identification failed, returning unknown")
            return "unknown"

    def enroll_speaker(self, name: str, audio_paths: list[str]):
        """Register a new speaker's voice profile from multiple audio clips."""
        from resemblyzer import preprocess_wav

        encoder = self._load_speaker_encoder()
        embeddings = []
        for path in audio_paths:
            wav = preprocess_wav(path)
            embeddings.append(encoder.embed_utterance(wav))

        avg_embed = np.mean(embeddings, axis=0)

        profiles = self._load_voice_profiles()
        profiles[name] = avg_embed
        self._voice_profiles = profiles
        self._save_voice_profiles_json()

        log.info(f"[speaker] Enrolled '{name}' from {len(audio_paths)} clips")

    def get_enrolled_speakers(self) -> list[str]:
        """Return list of enrolled speaker names."""
        profiles = self._load_voice_profiles()
        return list(profiles.keys())

    def remove_speaker(self, name: str) -> bool:
        """Remove a speaker profile. Returns True if found and removed."""
        profiles = self._load_voice_profiles()
        if name not in profiles:
            return False
        del profiles[name]
        self._voice_profiles = profiles
        self._save_voice_profiles_json()
        log.info(f"[speaker] Removed '{name}'")
        return True

    # ── Helpers ──────────────────────────────────────────────────────

    def _save_wav(self, file_obj, audio_data: np.ndarray):
        """Write numpy int16 array as a WAV file."""
        with wave.open(file_obj, "wb") as wf:
            wf.setnchannels(CHANNELS)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(audio_data.tobytes())

    def _emit(self, event: str, data: dict):
        """Emit a SocketIO event if available."""
        if self.socketio:
            self.socketio.emit(event, data)
