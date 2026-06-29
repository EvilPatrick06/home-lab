"""Speech-output (TTS) collaborator for VoicePipeline.

Extracted from the VoicePipeline god-class. Owns the streaming TTS machinery:
the worker thread that drains the sentence queue and speaks, the drain/wait
barrier, barge-in interrupt, and the LLM-stream -> sentence-queue pump. All
TTS state (the queues, the interrupted/active events, _is_speaking) and the
provider helpers (_bmo_speak/_edge_speak/_cloud_speak/_strip_markdown/_emit)
stay on the pipeline; this collaborator operates on them via the back-ref, so
every existing call site + test patch point (pipeline.interrupt,
pipeline._stream_and_speak, pipeline._tts_queue, ...) is unchanged.
"""
import queue
import re
import threading
import time

from services.bmo_logging import _s
from services.voice.voice_pipeline import PIPER_BMO_AVAILABLE, log


class SpeechOutput:
    """Streaming TTS worker + barge-in for the voice pipeline."""

    def __init__(self, pipeline):
        self._p = pipeline

    def tts_worker(self):
        """Background thread: pops sentences from queue and speaks them.

        Batches short consecutive sentences (< 80 chars) together to reduce
        API round-trips and inter-sentence gaps.
        """
        while True:
            try:
                text = self._p._tts_queue.get(timeout=0.1)
            except queue.Empty:
                continue
            if text is None:
                break
            if self._p._tts_interrupted.is_set():
                continue

            # Batch short sentences: peek at queue for more short items
            if len(text) < 80:
                batch = [text]
                batch_len = len(text)
                while batch_len < 250:
                    try:
                        next_text = self._p._tts_queue.get_nowait()
                    except queue.Empty:
                        break
                    if next_text is None:
                        self._p._tts_queue.put(None)  # put sentinel back
                        break
                    batch.append(next_text)
                    batch_len += len(next_text)
                    if len(next_text) >= 80:
                        break  # long sentence ends the batch
                text = " ".join(batch)

            self._p._tts_worker_active.set()
            if not getattr(self._p, '_bmo_tts_enabled', True):
                log.info("[tts-worker] Suppressed (BMO TTS off): %s...", _s(text[:60]))
                self._p._tts_worker_active.clear()
                continue
            # Bedtime mode check — suppress TTS unless it's a priority item
            scene_svc = getattr(self._p, '_scene_service', None)
            if scene_svc and scene_svc.get_active() == "bedtime":
                log.info("[tts-worker] Suppressed (bedtime mode): %s...", _s(text[:60]))
                self._p._tts_worker_active.clear()
                continue
            try:
                provider = getattr(self._p, '_tts_provider', 'auto')
                if provider == "piper_bmo" or (provider == "auto" and PIPER_BMO_AVAILABLE):
                    self._p._bmo_speak(text)
                elif provider == "edge":
                    self._p._edge_speak(text)
                else:
                    # Fish Audio has the BMO voice clone — best quality
                    self._p._cloud_speak(text)
            except Exception:
                try:
                    self._p._edge_speak(text)
                except Exception:
                    log.exception("[tts-worker] All TTS failed")
            finally:
                self._p._tts_worker_active.clear()

    def wait_for_tts(self):
        """Block until the TTS queue is drained and the worker finishes speaking."""
        while not self._p._tts_queue.empty() or self._p._tts_worker_active.is_set():
            if self._p._tts_interrupted.is_set():
                break
            time.sleep(0.05)

    def interrupt(self):
        """Stop BMO mid-speech: clear TTS queue and abort current playback."""
        self._p._tts_interrupted.set()
        while not self._p._tts_queue.empty():
            try:
                self._p._tts_queue.get_nowait()
            except queue.Empty:
                break
        self._p._tts_queue.put(None)
        self._p._is_speaking = False
        self._p._emit("status", {"state": "idle"})
        log.info("[voice] Interrupted")

    def stream_and_speak(self, text_gen) -> str:
        """Consume LLM text stream, buffer sentences, TTS each via worker thread.

        Sentences are pushed to a queue as they complete. A dedicated TTS worker
        thread speaks them in order, so the LLM keeps generating while TTS plays.
        The user hears the first sentence within 1-2 seconds of the LLM starting.
        Returns the full response text.
        """
        self._p._emit("status", {"state": "speaking"})
        self._p._is_speaking = True
        # Don't reset _speak_volume — it's set by the volume slider and should persist
        self._p._tts_interrupted.clear()
        # NOTE: mic muting removed — gevent blocks Popen for 5s, causing
        # more latency than echo pickup. The AEC source handles echo cancellation.

        # Drain any leftover items from previous runs
        while not self._p._tts_queue.empty():
            try:
                self._p._tts_queue.get_nowait()
            except queue.Empty:
                break

        worker = threading.Thread(target=self._p._tts_worker, daemon=True)
        worker.start()

        full_text = ""
        try:
            buffer = ""
            sentences_queued = 0

            for chunk in text_gen:
                if self._p._tts_interrupted.is_set():
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
                        tts_text = self._p._strip_markdown(sentence)
                        if tts_text:
                            sentences_queued += 1
                            log.info("[stream] Queue sentence %d: %s...", sentences_queued, _s(tts_text[:60]))
                            self._p._tts_queue.put(tts_text)

            remaining = buffer.strip()
            if remaining and not self._p._tts_interrupted.is_set():
                # Strip [RELAY:...] tags from final chunk too
                remaining = re.sub(r'\[RELAY:\w+\].*', '', remaining, flags=re.DOTALL).strip()
                tts_text = self._p._strip_markdown(remaining)
                if tts_text:
                    sentences_queued += 1
                    log.info("[stream] Queue final (%d): %s...", sentences_queued, _s(tts_text[:60]))
                    self._p._tts_queue.put(tts_text)

            # Signal worker to exit after all sentences are spoken
            self._p._tts_queue.put(None)
            if full_text.strip():
                self._p._remember_spoken(full_text)
            self._p._wait_for_tts()
            worker.join(timeout=5.0)

            return full_text
        except Exception:
            log.exception("[stream] Error")
            self._p._tts_queue.put(None)
            return full_text
        finally:
            self._p._is_speaking = False
            while not self._p._audio_queue.empty():
                try:
                    self._p._audio_queue.get_nowait()
                except queue.Empty:
                    break
            self._p._emit("status", {"state": "idle"})

