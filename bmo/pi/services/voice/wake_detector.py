"""Wake-word detection collaborator for VoicePipeline.

Extracted from the VoicePipeline god-class. Owns the wake-listening loop and the
two engines (Porcupine + openWakeWord) plus the energy/STT fallback cycle and
wake-model loading. Wake state (_wake_triggered, _wake_model, _ambient_rms_avg,
_running, _no_input_device) and the device/AEC + _on_wake/_quick_stt helpers
stay on the pipeline; this collaborator operates on them via the back-ref so the
existing call sites + test patch points (_wake_word_loop, _wake_triggered, ...)
are unchanged.
"""
import io
import os
import queue
import re
import threading
import time

import numpy as np
import scipy.signal  # noqa: F401
import sounddevice as sd

from services.bmo_logging import _s
from services.voice.voice_pipeline import (
    CHANNELS,
    PORCUPINE_ACCESS_KEY,
    PORCUPINE_AVAILABLE,
    PORCUPINE_MODEL,
    PORCUPINE_SENSITIVITY,
    SAMPLE_RATE,
    WAKE_OWW_THRESHOLD,
    WAKE_USE_CUSTOM,
    WAKE_VARIANTS,
    _get_native_input_rate,
    _get_wake_model_paths,
    _quiet_onnxruntime,
    log,
)


class WakeDetector:
    """Wake-word listening loop + Porcupine/openWakeWord engines for the pipeline."""

    def __init__(self, pipeline):
        self._p = pipeline

    def load_wake_model(self):
        if self._p._wake_model is None:
            from openwakeword.model import Model
            paths = _get_wake_model_paths()
            if not paths:
                # No ONNX wake models installed — an expected setup gap on hosts
                # without the openwakeword default models (or a custom model).
                # Log once at INFO and fall back to energy+STT (caller handles
                # None); not an ERROR traceback every boot.
                log.info("[wake] no wake-word ONNX models found — using energy+STT fallback")
                return None
            # Quiet onnxruntime GPU-probe warnings before the first
            # InferenceSession is created (BMO-ISSUES 2026-06-29).
            _quiet_onnxruntime()
            try:
                self._p._wake_model = Model(
                    wakeword_models=paths,
                    inference_framework="onnx",
                )
            except TypeError:
                self._p._wake_model = Model(wakeword_model_paths=paths)
        return self._p._wake_model

    def wake_word_loop(self):
        """Listen for 'hey BMO' wake word.

        Priority: Picovoice Porcupine (best accuracy) → OpenWakeWord → energy+STT fallback.
        """
        self._p._wake_triggered = False

        # Pre-warm TTS cache in background
        threading.Thread(target=self._p._prewarm_tts_cache, daemon=True).start()
        # Pre-load Silero VAD so first recording doesn't have 3s load delay
        threading.Thread(target=self._p._load_silero_vad, daemon=True).start()
        # Verify AEC on startup
        self._p._check_aec()

        # Try Porcupine first (best accuracy)
        if PORCUPINE_AVAILABLE:
            log.info("[wake] Using Picovoice Porcupine for wake word detection")
            while self._p._running:
                if not self._p._await_input_device():
                    continue
                try:
                    self._p._wake_listen_cycle_porcupine()
                    if self._p._wake_triggered:
                        self._p._wake_triggered = False
                        time.sleep(0.2)
                        self._p._on_wake()
                except Exception:
                    log.exception("[wake] Porcupine error, restarting in 2s...")
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
            oww_model = self._p._load_wake_model()
            mode = "single-stage" if WAKE_USE_CUSTOM else "OWW + STT confirm"
            log.info(f"[wake] Listening for 'hey BMO' ({mode})...")
        except Exception:
            log.exception("[wake] openwakeword not available, using energy+STT fallback...")

        while self._p._running:
            if not self._p._await_input_device():
                continue
            try:
                if oww_model:
                    self._p._wake_listen_cycle_oww(
                        oww_model, chunk_size, ring_buffer, max_ring_chunks,
                    )
                else:
                    self._p._wake_listen_cycle(
                        chunk_size, ring_buffer, max_ring_chunks,
                        energy_threshold, cooldown_until, consecutive_active,
                        ACTIVE_CHUNKS_NEEDED,
                    )
                if self._p._wake_triggered:
                    self._p._wake_triggered = False
                    time.sleep(0.2)
                    self._p._on_wake()
            except Exception:
                log.exception("[wake] Listener error, restarting in 2s...")
                time.sleep(2)

    def wake_listen_cycle_porcupine(self):
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
                log.info("[audio] %s", _s(status))
            self._p._audio_queue.put(indata.copy())

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
                while self._p._running:
                    try:
                        chunk = self._p._audio_queue.get(timeout=1.0)
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
                        if self._p._ambient_rms_avg == 0.0:
                            self._p._ambient_rms_avg = rms
                        else:
                            self._p._ambient_rms_avg = 0.02 * rms + 0.98 * self._p._ambient_rms_avg

                    # Log periodic status + speech-level chunks
                    if chunks_processed <= 3 or chunks_processed % 1000 == 0:
                        log.info(f"[wake] Porcupine #{chunks_processed}: rms={rms:.0f}, ambient={self._p._ambient_rms_avg:.0f}")
                    elif rms > speech_threshold:
                        log.info(f"[wake] SPEECH? rms={rms:.0f} (ambient={self._p._ambient_rms_avg:.0f})")

                    keyword_index = porcupine.process(chunk)

                    if keyword_index >= 0:
                        now = time.time()
                        if now < cooldown_until:
                            continue
                        cooldown_until = now + 1.5

                        # Bedtime mode: ignore wake word (mic muted)
                        scene_svc = getattr(self._p, '_scene_service', None)
                        if scene_svc and scene_svc.get_active() == "bedtime":
                            log.info("[wake] Suppressed (bedtime mode) — mic muted")
                            continue

                        log.info("[wake] Porcupine detected 'hey BMO'!")
                        self._p._emit("status", {"state": "listening"})
                        # Drain audio queue
                        while not self._p._audio_queue.empty():
                            self._p._audio_queue.get_nowait()
                        self._p._wake_triggered = True
                        return
        finally:
            porcupine.delete()

    def wake_listen_cycle_oww(self, oww_model, chunk_size, ring_buffer, max_ring_chunks):
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
            self._p._audio_queue.put(indata.copy())

        log.info(f"[wake] Opening mic: rate={native_rate}, blocksize={input_chunk_size}, resampling={use_resampling}")
        try:
            mic_stream = sd.InputStream(
                samplerate=native_rate,
                channels=CHANNELS,
                dtype="int16",
                blocksize=input_chunk_size,
                callback=audio_callback,
            )
        except Exception:
            log.exception("[wake] FATAL: Failed to open mic stream")
            time.sleep(2)
            return

        with mic_stream:
            chunks_processed = 0
            while self._p._running:
                try:
                    chunk = self._p._audio_queue.get(timeout=1.0)
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
                    if self._p._ambient_rms_avg == 0.0:
                        self._p._ambient_rms_avg = rms
                    else:
                        self._p._ambient_rms_avg = 0.02 * rms + 0.98 * self._p._ambient_rms_avg

                audio_f32 = chunk.flatten().astype(np.float32) / 32768.0
                try:
                    prediction = oww_model.predict(audio_f32)
                except Exception:
                    log.exception("[wake] predict() error")
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
                    speech_prob = self._p._silero_check_speech(ring_audio)
                    if speech_prob < 0.3:
                        log.info(f"[wake] OWW triggered but Silero says no speech (prob={speech_prob:.2f}), ignoring")
                        oww_model.reset()
                        continue

                    log.info(f"[wake] 'hey BMO' detected (single-stage, VAD={speech_prob:.2f})")
                    self._p._emit("status", {"state": "listening"})
                    ring_buffer.clear()
                    while not self._p._audio_queue.empty():
                        self._p._audio_queue.get_nowait()
                    oww_model.reset()
                    self._p._wake_triggered = True
                    return

                # Fallback two-stage: STT confirmation (local whisper first, cloud backup)
                ring_audio = np.concatenate(ring_buffer)
                try:
                    audio_bytes = ring_audio.tobytes()
                    wav_buf = self._p._pcm_to_wav(audio_bytes)
                    text = self._p._quick_stt(wav_buf)
                    if not text:
                        oww_model.reset()
                        continue
                    text_lower = text.lower().strip()
                    log.info("[wake] STT confirm: '%s'", _s(text_lower))
                    is_wake = any(
                        re.search(r'\b' + re.escape(v) + r'\b', text_lower)
                        for v in WAKE_VARIANTS
                    )
                    if is_wake:
                        log.info("[wake] Confirmed 'hey BMO' in: %s", _s(text))
                        self._p._emit("status", {"state": "listening"})
                        ring_buffer.clear()
                        while not self._p._audio_queue.empty():
                            self._p._audio_queue.get_nowait()
                        oww_model.reset()
                        self._p._wake_triggered = True
                        return
                    else:
                        oww_model.reset()
                except Exception:
                    log.exception("[wake] STT confirm failed")
                    oww_model.reset()

    def wake_listen_cycle(self, chunk_size, ring_buffer, max_ring_chunks,
                           energy_threshold, cooldown_until, consecutive_active,
                           active_needed):
        """One cycle of wake word listening. Exits when wake detected."""
        # Adaptive threshold state — mutable via nonlocal
        ambient_rms_avg = getattr(self._p, '_ambient_rms_avg', 0.0)
        ambient_alpha = 0.02
        ENERGY_HEADROOM = 1.8

        def audio_callback(indata, frames, time_info, status):
            if status:
                log.info(f"[audio] {status}")
            self._p._audio_queue.put(indata.copy())

        with sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype="int16",
            blocksize=chunk_size,
            callback=audio_callback,
        ) as stream:
            while self._p._running:
                try:
                    chunk = self._p._audio_queue.get(timeout=1.0)
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
                    self._p._ambient_rms_avg = ambient_rms_avg
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
                speech_prob = self._p._silero_check_speech(ring_audio)
                if speech_prob < 0.3:
                    log.info(f"[wake] Silero rejected (prob={speech_prob:.2f})")
                    continue

                try:
                    audio_bytes = ring_audio.tobytes()
                    wav_buf = self._p._pcm_to_wav(audio_bytes)
                    text = self._p._quick_stt(wav_buf)
                    if not text:
                        continue  # Filtered as hallucination or no speech
                    text_lower = text.lower().strip()
                    log.info("[wake] STT check: '%s'", _s(text_lower))
                    is_wake = any(
                        re.search(r'\b' + re.escape(v) + r'\b', text_lower)
                        for v in WAKE_VARIANTS
                    )
                    if is_wake:
                        log.info("[wake] Detected 'hey BMO' in: %s", _s(text))
                        self._p._emit("status", {"state": "listening"})
                        ring_buffer.clear()
                        while not self._p._audio_queue.empty():
                            self._p._audio_queue.get_nowait()
                        # Exit the stream context first, then handle wake
                        self._p._wake_triggered = True
                        return
                except Exception:
                    log.exception("[wake] STT check failed")

