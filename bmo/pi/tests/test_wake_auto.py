"""Non-interactive wake word diagnostic. Run via SSH."""
import os
import sys
import numpy as np
import scipy.signal
import sounddevice as sd
import subprocess
import tempfile
import wave

sys.path.insert(0, os.path.expanduser("~/DnD/bmo/pi"))
from openwakeword.model import Model

SR = 16000
CHUNK = 1280

native = int(sd.query_devices(kind='input')['default_samplerate'])
print(f"[audio] Mic native rate: {native}Hz")
print(f"[audio] Recording 3s ambient...")
audio = sd.rec(int(native * 3), samplerate=native, channels=1, dtype='int16')
sd.wait()
rms = np.sqrt(np.mean(audio.astype(np.float32) ** 2))
peak = int(np.max(np.abs(audio)))
print(f"[audio] Raw: rms={rms:.0f} peak={peak}")

n16k = int(len(audio) * (SR / native))
res = scipy.signal.resample(audio.flatten(), n16k).astype(np.int16)
print(f"[audio] Resampled: rms={np.sqrt(np.mean(res.astype(np.float32)**2)):.0f} samples={len(res)}")

print()
print("[model] Loading hey_bmo.onnx...")
bmo_model = Model(wakeword_models=[os.path.expanduser("~/DnD/bmo/pi/wake/hey_bmo.onnx")], inference_framework="onnx")
print(f"[model] Labels: {list(bmo_model.prediction_buffer.keys())}")

silence = np.zeros(CHUNK, dtype=np.float32)
for i in range(20):
    bmo_model.predict(silence)
print("[model] Warmed up with 20 silence frames")

print()
print("[synth] Generating 'hey beemo' via Piper...")
tmp = tempfile.mktemp(suffix=".wav")
piper_model = os.path.expanduser("~/DnD/bmo/pi/models/piper/en_US-hfc_female-medium.onnx")
if not os.path.isfile(piper_model):
    print(f"[synth] SKIP: Piper model not found at {piper_model}")
else:
    r = subprocess.run(
        ["piper", "--model", piper_model, "--output_file", tmp],
        input=b"hey beemo\n", capture_output=True, timeout=15
    )
    if r.returncode == 0:
        with wave.open(tmp) as wf:
            sr = wf.getframerate()
            raw = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16)
        print(f"[synth] Generated {len(raw)} samples at {sr}Hz")
        if sr != SR:
            raw = scipy.signal.resample(raw, int(len(raw) * SR / sr)).astype(np.int16)
        bmo_model.reset()
        for i in range(20):
            bmo_model.predict(silence)
        mx = 0.0
        f32 = raw.astype(np.float32) / 32768.0
        for i in range(0, len(f32) - CHUNK, CHUNK):
            p = bmo_model.predict(f32[i:i + CHUNK])
            for k, v in p.items():
                if v > mx:
                    mx = v
                if v > 0.001:
                    print(f"  frame {i // CHUNK}: {k}={v:.4f}")
        print(f"[synth] Max score on synthetic 'hey beemo': {mx:.6f}")
        os.unlink(tmp)
    else:
        print(f"[synth] Piper error: {r.stderr[:200]}")

print()
print("[jarvis] Loading built-in models for comparison...")
try:
    jarvis = Model(inference_framework="onnx")
    print(f"[jarvis] Labels: {list(jarvis.prediction_buffer.keys())}")
except Exception as e:
    print(f"[jarvis] Failed: {e}")
    jarvis = None

print()
print("[live] Recording 8s... SAY 'HEY BMO' NOW!")
audio = sd.rec(int(native * 8), samplerate=native, channels=1, dtype='int16')
sd.wait()
print("[live] Recording done.")

input_chunk = int(CHUNK * (native / SR))
bmo_model.reset()
for i in range(20):
    bmo_model.predict(silence)

mx_bmo = 0.0
mx_jarvis = {}
for i in range(0, len(audio) - input_chunk, input_chunk):
    chunk = audio[i:i + input_chunk].flatten()
    resampled = scipy.signal.resample(chunk, CHUNK).astype(np.int16)
    f32 = resampled.astype(np.float32) / 32768.0
    t = i / native

    p = bmo_model.predict(f32)
    for k, v in p.items():
        if v > mx_bmo:
            mx_bmo = v
        if v > 0.001:
            print(f"  t={t:.1f}s [bmo] {k}={v:.4f}")

    if jarvis:
        p2 = jarvis.predict(f32)
        for k, v in p2.items():
            if v > mx_jarvis.get(k, 0):
                mx_jarvis[k] = v
            if v > 0.01:
                print(f"  t={t:.1f}s [jarvis] {k}={v:.4f}")

print()
print(f"[result] hey_bmo max score: {mx_bmo:.6f}")
if jarvis:
    print(f"[result] jarvis max scores: {mx_jarvis}")
print("[done]")
