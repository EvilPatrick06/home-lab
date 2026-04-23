"""Deep diagnostic for hey_bmo wake word model.

Tests:
1. Does the model respond to synthetic TTS "hey bmo"?
2. Does hey_jarvis model respond to live mic with resampling?
3. What does the raw mic audio look like after resampling?
4. Does the model respond to live mic at all?
"""
import sys
import os
import time
import numpy as np
import scipy.signal
import sounddevice as sd

# Force ONNX inference
os.environ.setdefault("OWW_INFERENCE_FRAMEWORK", "onnx")

from openwakeword.model import Model

SAMPLE_RATE = 16000
CHUNK_SIZE = 1280  # 80ms at 16kHz


def get_native_rate():
    info = sd.query_devices(kind='input')
    return int(info['default_samplerate'])


def test_1_model_loads():
    """Test that hey_bmo.onnx loads and returns predictions."""
    print("\n=== TEST 1: Model Loading ===")
    model_path = os.path.join(os.path.dirname(__file__), "hey_bmo.onnx")
    print(f"  Model path: {model_path}")
    print(f"  Exists: {os.path.isfile(model_path)}")
    data_path = model_path + ".data"
    print(f"  Data file: {os.path.isfile(data_path)}")

    model = Model(wakeword_models=[model_path], inference_framework="onnx")
    print(f"  Labels: {list(model.prediction_buffer.keys())}")

    silence = np.zeros(CHUNK_SIZE, dtype=np.int16).astype(np.float32) / 32768.0
    for i in range(10):
        pred = model.predict(silence)
    print(f"  Silence prediction: {pred}")
    return model


def test_2_synthetic_audio(model):
    """Generate synthetic 'hey bmo' via piper and feed to model."""
    print("\n=== TEST 2: Synthetic Audio ===")
    try:
        import subprocess
        import tempfile
        import wave

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            tmp_path = f.name

        result = subprocess.run(
            ["piper", "--model", os.path.expanduser("~/DnD/bmo/pi/models/piper/en_US-hfc_female-medium.onnx"),
             "--output_file", tmp_path],
            input=b"hey beemo\n",
            capture_output=True, timeout=10,
        )
        if result.returncode != 0:
            print(f"  Piper failed: {result.stderr[:200]}")
            print("  Skipping synthetic test")
            return

        with wave.open(tmp_path) as wf:
            sr = wf.getframerate()
            frames = wf.readframes(wf.getnframes())
            audio = np.frombuffer(frames, dtype=np.int16)

        print(f"  Generated {len(audio)} samples at {sr}Hz")

        if sr != SAMPLE_RATE:
            num_samples = int(len(audio) * (SAMPLE_RATE / sr))
            audio = scipy.signal.resample(audio, num_samples).astype(np.int16)
            print(f"  Resampled to {len(audio)} samples at {SAMPLE_RATE}Hz")

        model.reset()
        max_score = 0.0
        f32 = audio.astype(np.float32) / 32768.0
        for i in range(0, len(f32) - CHUNK_SIZE, CHUNK_SIZE):
            chunk = f32[i:i + CHUNK_SIZE]
            pred = model.predict(chunk)
            for k, v in pred.items():
                if v > max_score:
                    max_score = v
                if v > 0.001:
                    print(f"    Frame {i // CHUNK_SIZE}: {k}={v:.4f}")

        print(f"  Max score on synthetic 'hey beemo': {max_score:.4f}")
        os.unlink(tmp_path)
    except Exception as e:
        print(f"  Error: {e}")


def test_3_jarvis_comparison():
    """Compare hey_jarvis model scores with resampled mic audio."""
    print("\n=== TEST 3: hey_jarvis Comparison ===")
    try:
        jarvis = Model(inference_framework="onnx")
        print(f"  Built-in models: {list(jarvis.prediction_buffer.keys())}")
    except Exception as e:
        print(f"  Failed to load built-in models: {e}")
        return

    native_rate = get_native_rate()
    print(f"  Recording 5s at {native_rate}Hz... (say 'hey jarvis')")
    audio = sd.rec(int(native_rate * 5), samplerate=native_rate, channels=1, dtype="int16")
    sd.wait()

    input_chunk = int(CHUNK_SIZE * (native_rate / SAMPLE_RATE))
    max_scores = {}
    for i in range(0, len(audio) - input_chunk, input_chunk):
        chunk = audio[i:i + input_chunk].flatten()
        resampled = scipy.signal.resample(chunk, CHUNK_SIZE).astype(np.int16)
        f32 = resampled.astype(np.float32) / 32768.0
        pred = jarvis.predict(f32)
        for k, v in pred.items():
            if v > max_scores.get(k, 0):
                max_scores[k] = v
            if v > 0.01:
                print(f"    {k}={v:.4f}")

    print(f"  Max scores: {max_scores}")


def test_4_live_mic_bmo(model):
    """Record 10s of live mic and feed to hey_bmo model."""
    print("\n=== TEST 4: Live Mic + hey_bmo ===")
    native_rate = get_native_rate()
    print(f"  Recording 10s at {native_rate}Hz... (say 'hey bmo' multiple times)")
    audio = sd.rec(int(native_rate * 10), samplerate=native_rate, channels=1, dtype="int16")
    sd.wait()

    input_chunk = int(CHUNK_SIZE * (native_rate / SAMPLE_RATE))
    model.reset()
    max_score = 0.0
    frame_scores = []

    for i in range(0, len(audio) - input_chunk, input_chunk):
        chunk = audio[i:i + input_chunk].flatten()
        resampled = scipy.signal.resample(chunk, CHUNK_SIZE).astype(np.int16)
        f32 = resampled.astype(np.float32) / 32768.0
        pred = model.predict(f32)
        for k, v in pred.items():
            frame_scores.append(v)
            if v > max_score:
                max_score = v
            if v > 0.001:
                t = (i / native_rate)
                print(f"    t={t:.1f}s: {k}={v:.4f}")

    print(f"  Max score: {max_score:.4f}")
    print(f"  Non-zero frames: {sum(1 for s in frame_scores if s > 0.0)}/{len(frame_scores)}")


def test_5_audio_quality():
    """Check raw audio stats to verify mic and resampling."""
    print("\n=== TEST 5: Audio Quality Check ===")
    native_rate = get_native_rate()
    print(f"  Native rate: {native_rate}Hz")

    print("  Recording 3s...")
    audio = sd.rec(int(native_rate * 3), samplerate=native_rate, channels=1, dtype="int16")
    sd.wait()

    rms = np.sqrt(np.mean(audio.astype(np.float32) ** 2))
    peak = np.max(np.abs(audio))
    print(f"  Raw: rms={rms:.0f}, peak={peak}, shape={audio.shape}")

    num_16k = int(len(audio) * (SAMPLE_RATE / native_rate))
    resampled = scipy.signal.resample(audio.flatten(), num_16k).astype(np.int16)
    rms2 = np.sqrt(np.mean(resampled.astype(np.float32) ** 2))
    peak2 = np.max(np.abs(resampled))
    print(f"  Resampled: rms={rms2:.0f}, peak={peak2}, len={len(resampled)}")

    f32 = resampled.astype(np.float32) / 32768.0
    print(f"  Float32: min={f32.min():.4f}, max={f32.max():.4f}, mean={np.mean(f32):.6f}")


if __name__ == "__main__":
    print("=" * 60)
    print("BMO Wake Word Deep Diagnostic")
    print("=" * 60)

    test_5_audio_quality()
    model = test_1_model_loads()
    test_2_synthetic_audio(model)

    print("\n--- Ready for live tests ---")
    print("Say 'hey jarvis' when prompted for test 3.")
    input("Press Enter to start test 3...")
    test_3_jarvis_comparison()

    print("\nSay 'hey bmo' multiple times when prompted for test 4.")
    input("Press Enter to start test 4...")
    test_4_live_mic_bmo(model)

    print("\n" + "=" * 60)
    print("Diagnostic complete.")
