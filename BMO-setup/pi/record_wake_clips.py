"""Record real 'hey BMO' voice clips for wake word training.

Uses system beep via aplay for reliable audio cue.
Records N clips with clear countdown. Each clip is 2 seconds.
Saves to ~/bmo/wake_clips/ as WAV files at 16kHz mono.
"""
import os
import subprocess
import time
import wave
import numpy as np
import scipy.signal
import sounddevice as sd

SAMPLE_RATE = 16000
CLIP_DURATION = 2.0
NUM_CLIPS = 20
OUTPUT_DIR = os.path.expanduser("~/bmo/wake_clips")
os.makedirs(OUTPUT_DIR, exist_ok=True)

native = int(sd.query_devices(kind='input')['default_samplerate'])


def make_beep_wav(path, freq=800, dur=0.2, sr=44100):
    t = np.arange(int(sr * dur))
    tone = (np.sin(2 * np.pi * freq * t / sr) * 16000).astype(np.int16)
    with wave.open(path, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(tone.tobytes())


def beep(freq=800):
    beep_path = "/tmp/bmo_beep.wav"
    make_beep_wav(beep_path, freq=freq, dur=0.2)
    subprocess.run(["aplay", "-q", beep_path], timeout=3,
                   env={**os.environ, "XDG_RUNTIME_DIR": "/run/user/1000"})


def save_wav(path, audio_16k):
    with wave.open(path, 'wb') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio_16k.tobytes())


# Clear old clips
for f in os.listdir(OUTPUT_DIR):
    os.remove(os.path.join(OUTPUT_DIR, f))

print(f"Mic: {native}Hz")
print(f"Recording {NUM_CLIPS} clips of {CLIP_DURATION}s")
print()

# Test beep
print("Testing speaker... you should hear a beep NOW")
beep(1000)
time.sleep(1)
print("Did you hear it? Starting in 5 seconds...")
time.sleep(5)

print()
print("=" * 50)
print("After each BEEP, say 'HEY BMO' clearly.")
print("Vary your tone and distance slightly.")
print("=" * 50)
print()

good_clips = 0
for i in range(NUM_CLIPS):
    print(f"  Clip {i+1}/{NUM_CLIPS} -- ", end="", flush=True)
    time.sleep(1.0)

    beep(800)
    time.sleep(0.3)

    frames = int(native * CLIP_DURATION)
    audio = sd.rec(frames, samplerate=native, channels=1, dtype='int16')
    sd.wait()

    if native != SAMPLE_RATE:
        target_len = int(len(audio) * SAMPLE_RATE / native)
        audio_16k = scipy.signal.resample(audio.flatten(), target_len).astype(np.int16)
    else:
        audio_16k = audio.flatten()

    rms = np.sqrt(np.mean(audio_16k.astype(np.float32) ** 2))
    peak = int(np.max(np.abs(audio_16k)))

    status = "OK"
    if peak < 500:
        status = "TOO QUIET"
    elif peak > 30000:
        status = "CLIPPING"
    else:
        good_clips += 1

    print(f"rms={rms:.0f} peak={peak} [{status}]")
    path = os.path.join(OUTPUT_DIR, f"hey_bmo_{i+1:02d}.wav")
    save_wav(path, audio_16k)

beep(1200)
print(f"\nDone! {good_clips}/{NUM_CLIPS} good clips saved to {OUTPUT_DIR}/")
