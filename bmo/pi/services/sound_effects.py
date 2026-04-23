"""BMO Sound Effects — Event-triggered audio player.

Plays short audio cues for key events (startup, wake word, errors, D&D sounds).
Non-blocking playback that doesn't interrupt TTS.
"""

import os
import subprocess
import threading

SOUNDS_DIR = os.path.join(os.path.dirname(__file__), "static", "sounds")


# ── Sound Event Definitions ───────────────────────────────────────────

# Map event names to sound file names (without extension)
SOUND_EVENTS = {
    # System sounds
    "startup": "startup_chime",
    "boop": "boop",
    "error": "error_tone",
    "chime": "chime",
    "notification": "chime",

    # Timer/Alarm
    "alarm": "alarm_bell",
    "timer_done": "alarm_bell",
    "calendar_reminder": "chime",

    # D&D sounds
    "horn": "horn_blast",
    "dice": "dice_rattle",
    "sword": "sword_clash",
    "magic": "magic_sparkle",
    "combat_start": "sword_clash",
    "initiative": "horn_blast",
    "spell_cast": "magic_sparkle",
    "victory": "victory_fanfare",
    "death": "sad_tone",

    # Music
    "queue_empty": "sad_tone",
}


class SoundEffects:
    """Event-triggered audio player for BMO sound effects.

    Plays sounds in a non-blocking background thread so they don't
    interrupt TTS or other audio output.
    """

    def __init__(self):
        self._sounds_dir = SOUNDS_DIR
        self._volume = 80  # 0-100
        self._enabled = True

        # Ensure sounds directory exists
        os.makedirs(self._sounds_dir, exist_ok=True)

    def play(self, event: str):
        """Play the sound effect for a given event name.

        Non-blocking — audio plays in a background thread.
        Does nothing if the event has no mapped sound file.
        If the mapped sound name is a directory, picks a random file from it.
        """
        if not self._enabled:
            return

        sound_name = SOUND_EVENTS.get(event)
        if not sound_name:
            return

        # Check if it's a directory of variations
        dir_path = os.path.join(self._sounds_dir, sound_name)
        if os.path.isdir(dir_path):
            candidates = [
                f for f in os.listdir(dir_path)
                if f.endswith((".wav", ".ogg", ".mp3"))
            ]
            if not candidates:
                return
            import random
            sound_path = os.path.join(dir_path, random.choice(candidates))
        else:
            # Single file lookup (existing logic)
            sound_path = None
            for ext in (".wav", ".ogg", ".mp3"):
                candidate = os.path.join(self._sounds_dir, sound_name + ext)
                if os.path.exists(candidate):
                    sound_path = candidate
                    break
            if not sound_path:
                return

        # Play in background thread
        threading.Thread(
            target=self._play_file,
            args=(sound_path,),
            daemon=True,
        ).start()

    def _play_file(self, path: str):
        """Play an audio file using ffplay (respects volume for all formats)."""
        try:
            # Always use ffplay so volume control works for all formats
            env = os.environ.copy()
            env["XDG_RUNTIME_DIR"] = "/run/user/1000"
            subprocess.run(
                ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet",
                 "-volume", str(self._volume), path],
                capture_output=True,
                timeout=10,
                env=env,
            )
        except FileNotFoundError:
            # Try VLC as last resort
            try:
                subprocess.run(
                    ["cvlc", "--play-and-exit", "--no-repeat",
                     f"--gain={self._volume / 100}", path],
                    capture_output=True,
                    timeout=10,
                )
            except FileNotFoundError:
                print(f"[sound] No audio player available for {path}")
        except subprocess.TimeoutExpired:
            pass
        except Exception as e:
            print(f"[sound] Playback error: {e}")

    def set_volume(self, volume: int):
        """Set playback volume (0-100)."""
        self._volume = max(0, min(100, volume))

    def set_enabled(self, enabled: bool):
        """Enable or disable sound effects."""
        self._enabled = enabled

    def start_thinking_loop(self):
        """Start a looping thinking sound that plays every 5 seconds.

        Stops when stop_thinking_loop() is called. Interruptible — checks
        the stop flag every 100ms instead of blocking for the full interval.
        """
        self._thinking_active = threading.Event()
        self._thinking_active.set()
        threading.Thread(target=self._thinking_loop, daemon=True).start()

    def stop_thinking_loop(self):
        """Stop the thinking sound loop immediately."""
        if hasattr(self, '_thinking_active'):
            self._thinking_active.clear()

    def _thinking_loop(self):
        import time
        time.sleep(0.5)
        while self._thinking_active.is_set():
            self.play("boop")
            for _ in range(50):
                if not self._thinking_active.is_set():
                    return
                time.sleep(0.1)

    @property
    def available_events(self) -> list[str]:
        """List all available sound event names."""
        return list(SOUND_EVENTS.keys())

    @property
    def available_sounds(self) -> list[str]:
        """List sound files present in the sounds directory (including subdirectories)."""
        if not os.path.exists(self._sounds_dir):
            return []
        result = []
        for f in os.listdir(self._sounds_dir):
            path = os.path.join(self._sounds_dir, f)
            if os.path.isfile(path) and f.endswith((".wav", ".ogg", ".mp3")):
                result.append(f)
            elif os.path.isdir(path):
                for sf in os.listdir(path):
                    if sf.endswith((".wav", ".ogg", ".mp3")):
                        result.append(f"{f}/{sf}")
        return result


def generate_tone(filename: str, frequency: float = 440, duration: float = 0.5,
                   sample_rate: int = 16000, ascending: bool = True):
    """Generate a simple sine wave tone and save as WAV.

    Useful for creating basic system sounds (boop, error, chime).
    """
    import struct
    import wave
    import math

    num_samples = int(sample_rate * duration)
    samples = []

    for i in range(num_samples):
        t = i / sample_rate
        # Frequency sweep for more interesting tones
        if ascending:
            freq = frequency * (1 + t / duration * 0.5)
        else:
            freq = frequency * (1.5 - t / duration * 0.5)

        # Envelope: fade in/out
        envelope = 1.0
        fade = 0.05  # 50ms fade
        if t < fade:
            envelope = t / fade
        elif t > duration - fade:
            envelope = (duration - t) / fade

        sample = math.sin(2 * math.pi * freq * t) * envelope * 0.8
        samples.append(int(sample * 32767))

    path = os.path.join(SOUNDS_DIR, filename)
    os.makedirs(os.path.dirname(path), exist_ok=True)

    with wave.open(path, "w") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(struct.pack(f"<{len(samples)}h", *samples))

    return path


def generate_default_sounds():
    """Generate basic synthesized sounds for events that don't have custom audio files."""
    sounds_to_generate = {
        "boop.wav": {"frequency": 800, "duration": 0.15, "ascending": True},
        "error_tone.wav": {"frequency": 400, "duration": 0.4, "ascending": False},
        "chime.wav": {"frequency": 1000, "duration": 0.3, "ascending": True},
        "sad_tone.wav": {"frequency": 300, "duration": 0.5, "ascending": False},
    }

    for filename, params in sounds_to_generate.items():
        path = os.path.join(SOUNDS_DIR, filename)
        if not os.path.exists(path):
            generate_tone(filename, **params)
            print(f"[sound] Generated {filename}")
