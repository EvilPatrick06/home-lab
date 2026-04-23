"""Timed wake word test with audio cue. Plays a beep, then records."""
import os
import sys
import time
import numpy as np
import scipy.signal
import sounddevice as sd
import subprocess

sys.path.insert(0, os.path.expanduser("~/DnD/bmo/pi"))
from openwakeword.model import Model

SR = 16000
CHUNK = 1280

native = int(sd.query_devices(kind='input')['default_samplerate'])
print(f"Mic: {native}Hz, volume check...")
quick = sd.rec(int(native * 0.5), samplerate=native, channels=1, dtype='int16')
sd.wait()
rms = np.sqrt(np.mean(quick.astype(np.float32) ** 2))
print(f"Ambient RMS: {rms:.0f} (good=200-800, clipping=10000+)")

print("\nLoading models...")
bmo = Model(wakeword_models=[os.path.expanduser("~/DnD/bmo/pi/wake/hey_bmo.onnx")], inference_framework="onnx")
jarvis = Model(inference_framework="onnx")

silence = np.zeros(CHUNK, dtype=np.float32)
for m in [bmo, jarvis]:
    for _ in range(20):
        m.predict(silence)

# Play 3 beeps as countdown
print("\n3 BEEPS then SAY 'HEY BMO' repeatedly for 8 seconds!")
for i in range(3):
    tone = np.sin(2 * np.pi * 800 * np.arange(int(native * 0.15)) / native).astype(np.float32) * 0.3
    sd.play(tone, native)
    sd.wait()
    time.sleep(0.7)

# Final beep = GO
tone = np.sin(2 * np.pi * 1200 * np.arange(int(native * 0.3)) / native).astype(np.float32) * 0.5
sd.play(tone, native)
sd.wait()

print(">>> RECORDING NOW - SAY 'HEY BMO' <<<")
audio = sd.rec(int(native * 8), samplerate=native, channels=1, dtype='int16')
sd.wait()
print("Recording done.\n")

rms_rec = np.sqrt(np.mean(audio.astype(np.float32) ** 2))
peak_rec = int(np.max(np.abs(audio)))
print(f"Recorded: rms={rms_rec:.0f} peak={peak_rec}")

input_chunk = int(CHUNK * (native / SR))

for label, model in [("hey_bmo", bmo), ("jarvis_builtin", jarvis)]:
    model.reset()
    for _ in range(20):
        model.predict(silence)

    max_scores = {}
    for i in range(0, len(audio) - input_chunk, input_chunk):
        chunk = audio[i:i + input_chunk].flatten()
        resampled = scipy.signal.resample(chunk, CHUNK).astype(np.int16)
        f32 = resampled.astype(np.float32) / 32768.0
        pred = model.predict(f32)
        for k, v in pred.items():
            if v > max_scores.get(k, 0):
                max_scores[k] = v
            if v > 0.01:
                t = i / native
                print(f"  t={t:.1f}s [{label}] {k}={v:.4f}")

    print(f"\n[{label}] Max scores: ", end="")
    for k, v in sorted(max_scores.items(), key=lambda x: -x[1])[:3]:
        print(f"{k}={v:.4f}  ", end="")
    print()

print("\nDone.")
