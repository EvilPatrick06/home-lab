"""Quick benchmark for STT and TTS latency."""
import os
import sys
import time
import io
import wave

import numpy as np

_PI_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, _PI_ROOT)
from dotenv import load_dotenv

load_dotenv(os.path.join(_PI_ROOT, ".env"))

import services.cloud_providers as cloud_providers
cloud_providers.GROQ_API_KEY = os.environ.get('GROQ_API_KEY', '')
cloud_providers.FISH_AUDIO_API_KEY = os.environ.get('FISH_AUDIO_API_KEY', '')

# Create test WAV
sr = 16000
dur = 2.0
t = np.linspace(0, dur, int(sr * dur))
audio = (np.sin(2 * np.pi * 440 * t) * 3000).astype(np.int16)
buf = io.BytesIO()
with wave.open(buf, 'wb') as wf:
    wf.setnchannels(1)
    wf.setsampwidth(2)
    wf.setframerate(sr)
    wf.writeframes(audio.tobytes())
test_wav = buf.getvalue()

# Groq STT
start = time.time()
result = cloud_providers.groq_stt(test_wav)
elapsed = time.time() - start
text = result.get('text', '')
print(f'Groq STT: {elapsed:.2f}s, text="{text[:50]}"')

# Groq STT with prompt
start = time.time()
result2 = cloud_providers.groq_stt(test_wav, prompt='Hey BMO, what time is it?')
elapsed2 = time.time() - start
print(f'Groq STT+prompt: {elapsed2:.2f}s')

# Fish Audio TTS formats
for fmt in ['wav', 'mp3', 'opus']:
    start = time.time()
    data = cloud_providers.fish_audio_tts('Hello, this is BMO speaking to you!', format=fmt)
    elapsed = time.time() - start
    print(f'Fish {fmt.upper():4s}: {len(data):>8d} bytes in {elapsed:.2f}s')
