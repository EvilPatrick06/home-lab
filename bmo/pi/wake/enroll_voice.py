#!/usr/bin/env python3
"""Bootstrap voice enrollment for the owner (default: Gavin).

Records 3x 5-second clips from the mic and enrolls a speaker profile.
Run once on the Pi to create ~/home-lab/bmo/pi/data/voice_profiles.json, then
future enrollment can happen via voice commands or the API.

Usage:
    source ~/home-lab/bmo/pi/venv/bin/activate
    python enroll_voice.py [--name NAME]   # default name: $BMO_OWNER_NAME or Gavin
"""

import argparse
import os
import sys
import wave

import numpy as np
import sounddevice as sd

SAMPLE_RATE = 16000
CHANNELS = 1
CLIP_DURATION = 5  # seconds per clip
NUM_CLIPS = 3
DATA_DIR = os.path.expanduser("~/home-lab/bmo/pi/data")

PROMPTS = [
    "Say something natural, like: 'Hey BMO, what's the weather today?'",
    "Now try: 'BMO, tell me a joke or play some music.'",
    "One more: 'Good morning BMO, set a timer for five minutes.'",
]


def record_clip(duration: float) -> np.ndarray:
    """Record a fixed-duration clip from the default mic."""
    frames = int(SAMPLE_RATE * duration)
    print(f"  Recording {duration}s...")
    audio = sd.rec(frames, samplerate=SAMPLE_RATE, channels=CHANNELS, dtype="int16")
    sd.wait()
    print("  Done.")
    return audio


def save_wav(path: str, audio: np.ndarray):
    """Save numpy int16 array as a WAV file."""
    with wave.open(path, "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(audio.tobytes())


def main():
    parser = argparse.ArgumentParser(description="Enroll a speaker voice profile.")
    parser.add_argument("--name", default=os.environ.get("BMO_OWNER_NAME", "Gavin"),
                        help="Speaker name to enroll (default: $BMO_OWNER_NAME or Gavin)")
    args = parser.parse_args()
    name = args.name

    os.makedirs(DATA_DIR, exist_ok=True)
    clip_paths = []

    print(f"=== BMO Voice Enrollment: {name} ===\n")
    print(f"I'll record {NUM_CLIPS} clips of {CLIP_DURATION}s each.")
    print("Speak naturally at your normal volume and distance from BMO.\n")

    for i in range(NUM_CLIPS):
        print(f"Clip {i + 1}/{NUM_CLIPS}: {PROMPTS[i]}")
        input("Press Enter when ready...")
        audio = record_clip(CLIP_DURATION)
        path = os.path.join(DATA_DIR, f"enroll_{name.lower()}_{i}.wav")
        save_wav(path, audio)
        clip_paths.append(path)
        print()

    print("Enrolling voice profile...")
    # Import here so the script can show prompts before loading heavy models
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from services.voice_pipeline import VoicePipeline

    vp = VoicePipeline()
    vp.enroll_speaker(name, clip_paths)

    # Clean up clip files
    for path in clip_paths:
        if os.path.exists(path):
            os.unlink(path)

    print(f"\nDone! Profile saved to {os.path.expanduser('~/home-lab/bmo/pi/data/voice_profiles.json')}")
    print(f"Restart BMO and say 'Hey BMO' — it should recognize you as {name}.")


if __name__ == "__main__":
    main()
