"""BMO UI Test Server — Real YT Music, Google Calendar, and laptop webcam.

Usage:
    cd pi-setup/test
    python test_server.py

Opens at http://localhost:5000
"""

import datetime
import os
import random
import sys
import threading
import time

import cv2
import sounddevice as sd
import vlc
from flask import Flask, Response, jsonify, render_template, request
from flask_socketio import SocketIO
from ytmusicapi import YTMusic

# ── App Setup ────────────────────────────────────────────────────────

app = Flask(__name__, template_folder="templates", static_folder="static")
app.config["SECRET_KEY"] = "bmo-test"
app.config["TEMPLATES_AUTO_RELOAD"] = True
socketio = SocketIO(app, async_mode="threading", cors_allowed_origins="*")

# ── Real Services ────────────────────────────────────────────────────

ytmusic = YTMusic()

# Calendar service (real if token exists, mock otherwise)
calendar_service = None
CONFIG_DIR = os.path.join(os.path.dirname(__file__), "..", "config")
TOKEN_PATH = os.path.join(CONFIG_DIR, "token.json")
SCOPES = ["https://www.googleapis.com/auth/calendar"]


def init_calendar():
    global calendar_service
    if not os.path.exists(TOKEN_PATH):
        print("[calendar] No token.json found — using mock data")
        return

    try:
        from google.auth.transport.requests import Request
        from google.oauth2.credentials import Credentials
        from googleapiclient.discovery import build

        creds = Credentials.from_authorized_user_file(TOKEN_PATH, SCOPES)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            with open(TOKEN_PATH, "w") as f:
                f.write(creds.to_json())
        calendar_service = build("calendar", "v3", credentials=creds)
        print("[calendar] Connected to Google Calendar!")
    except Exception as e:
        print(f"[calendar] Failed to init: {e} — using mock data")


# Webcam — use a background thread to avoid OpenCV threading crashes
camera = None
camera_lock = threading.Lock()
latest_frame = None


def camera_capture_loop():
    """Background thread that continuously grabs frames from the webcam."""
    global latest_frame
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[camera] No webcam found — camera tab will show offline")
        return
    print(f"[camera] Webcam opened (index 0)")
    while True:
        ret, frame = cap.read()
        if not ret:
            time.sleep(0.1)
            continue
        frame = cv2.resize(frame, (854, 480))
        _, jpeg = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
        with camera_lock:
            latest_frame = jpeg.tobytes()
        time.sleep(0.1)  # ~10 FPS


def init_camera():
    global camera
    camera = True  # Flag that camera init was attempted
    t = threading.Thread(target=camera_capture_loop, daemon=True)
    t.start()


# ── Thumbnail Cache (offline-first) ──────────────────────────────────

import hashlib
import urllib.request

_THUMB_DIR = os.path.join(os.path.dirname(__file__), "static", "thumbcache")
os.makedirs(_THUMB_DIR, exist_ok=True)


def _thumb_filename(url):
    """Hash a URL to a stable local filename."""
    h = hashlib.md5(url.encode()).hexdigest()
    return h + ".jpg"


def cache_thumbnail(url):
    """Download a thumbnail to local cache if not already present. Returns local path."""
    if not url or url.startswith("/static/"):
        return url  # Already a local path
    fname = _thumb_filename(url)
    fpath = os.path.join(_THUMB_DIR, fname)
    if os.path.exists(fpath):
        return f"/static/thumbcache/{fname}"
    try:
        urllib.request.urlretrieve(url, fpath)
        return f"/static/thumbcache/{fname}"
    except Exception as e:
        print(f"[thumbcache] Failed to cache {url[:60]}: {e}")
        return None


def cache_thumbnails_for_history(history_list):
    """Background: download thumbnails for all history songs."""
    for entry in history_list:
        url = entry.get("song", {}).get("thumbnail", "")
        if url:
            cache_thumbnail(url)


# ── MusicPlayer — Real VLC + yt-dlp playback ────────────────────────

# yt-dlp as a library — much faster than subprocess (no process spawn)
import yt_dlp as _ytdlp

_ytdlp_opts = {
    "format": "bestaudio",
    "quiet": True,
    "no_warnings": True,
    "extract_flat": False,
}

# URL cache: videoId -> (url, timestamp)
_url_cache = {}
_URL_CACHE_TTL = 3600  # URLs expire after 1 hour

# ── Audio file cache (offline playback) ─────────────────────────────

_AUDIO_CACHE_DIR = os.path.join(os.path.dirname(__file__), ".audiocache")
os.makedirs(_AUDIO_CACHE_DIR, exist_ok=True)
_audio_download_lock = threading.Lock()
_audio_downloading = set()  # video IDs currently being downloaded


def _get_local_audio(video_id):
    """Return local audio file path if cached, else None."""
    # yt-dlp may save as .opus, .webm, .m4a — check all
    for ext in (".opus", ".webm", ".m4a", ".ogg"):
        path = os.path.join(_AUDIO_CACHE_DIR, video_id + ext)
        if os.path.exists(path):
            return path
    return None


def _download_audio(video_id):
    """Download audio file for offline playback. Thread-safe, skips if already cached/downloading."""
    if _get_local_audio(video_id):
        return _get_local_audio(video_id)

    with _audio_download_lock:
        if video_id in _audio_downloading:
            return None  # Already in progress
        _audio_downloading.add(video_id)

    try:
        dl_opts = {
            "format": "bestaudio",
            "quiet": True,
            "no_warnings": True,
            "outtmpl": os.path.join(_AUDIO_CACHE_DIR, "%(id)s.%(ext)s"),
        }
        with _ytdlp.YoutubeDL(dl_opts) as ydl:
            ydl.download([f"https://music.youtube.com/watch?v={video_id}"])
        path = _get_local_audio(video_id)
        if path:
            print(f"[audiocache] Downloaded: {video_id}")
        return path
    except Exception as e:
        print(f"[audiocache] Download failed for {video_id}: {e}")
        return None
    finally:
        with _audio_download_lock:
            _audio_downloading.discard(video_id)


def _download_audio_for_history(history_list):
    """Background: download audio files for all history songs."""
    # Collect video IDs we want to keep
    keep_ids = set()
    for entry in history_list:
        vid = entry.get("song", {}).get("videoId", "")
        if vid:
            keep_ids.add(vid)
            _download_audio(vid)

    # Clean up audio files not in history (avoid unbounded growth)
    try:
        for fname in os.listdir(_AUDIO_CACHE_DIR):
            vid_from_file = os.path.splitext(fname)[0]
            if vid_from_file not in keep_ids:
                fpath = os.path.join(_AUDIO_CACHE_DIR, fname)
                os.remove(fpath)
                print(f"[audiocache] Cleaned up: {fname}")
    except Exception as e:
        print(f"[audiocache] Cleanup error: {e}")


def _extract_audio_url(video_id):
    """Extract direct audio stream URL using yt-dlp Python API."""
    # Check cache first
    cached = _url_cache.get(video_id)
    if cached and time.time() - cached[1] < _URL_CACHE_TTL:
        return cached[0]

    try:
        with _ytdlp.YoutubeDL(_ytdlp_opts) as ydl:
            info = ydl.extract_info(
                f"https://music.youtube.com/watch?v={video_id}",
                download=False,
            )
            url = info.get("url")
            if url:
                _url_cache[video_id] = (url, time.time())
                return url
            print(f"[music] yt-dlp returned no URL for {video_id}")
    except Exception as e:
        print(f"[music] yt-dlp error: {e}")
    return None


def _prefetch_urls(video_ids):
    """Pre-extract audio URLs for a list of video IDs in background threads."""
    for vid in video_ids:
        if vid in _url_cache and time.time() - _url_cache[vid][1] < _URL_CACHE_TTL:
            continue  # Already cached
        threading.Thread(target=_extract_audio_url, args=(vid,), daemon=True).start()


def _get_audio_devices():
    """Return list of real system audio output devices, filtered to useful ones."""
    # Skip virtual/mapper/driver-level duplicates and non-useful entries
    SKIP_KEYWORDS = [
        "sound mapper", "primary sound", "@system32", "wave)",
        "microphone", "micro)", "input",
        "with sst", "2nd output", "headphones ()",
        "steam streaming",
    ]
    try:
        devices = sd.query_devices()
        outputs = []
        seen = set()
        for d in devices:
            if d["max_output_channels"] <= 0:
                continue
            name = d["name"]
            name_lower = name.lower()
            if any(kw in name_lower for kw in SKIP_KEYWORDS):
                continue
            if name in seen:
                continue
            seen.add(name)
            outputs.append({"name": name, "label": name})
        return outputs if outputs else [{"name": "default", "label": "Default Output"}]
    except Exception as e:
        print(f"[music] Failed to enumerate audio devices: {e}")
        return [{"name": "default", "label": "Default Output"}]


class MusicPlayer:
    """Wraps VLC MediaPlayer + yt-dlp for real YouTube Music playback."""

    def __init__(self):
        self._vlc_instance = vlc.Instance("--no-video")
        self._player = self._vlc_instance.media_player_new()
        self._lock = threading.Lock()

        # Queue state
        self.queue = []          # list of song dicts (with cached _audio_url)
        self.queue_index = -1
        self.current_song = None

        # Playback flags
        self.volume = 80
        self.shuffle = False
        self.repeat = "off"      # "off" | "all" | "one"
        self.output_device = "default"
        self.history = []        # list of {song, played_at} dicts, newest first
        self._history_file = os.path.join(os.path.dirname(__file__), ".music_history.json")
        self._load_history()

        self._player.audio_set_volume(self.volume)

        # Register end-of-track callback
        events = self._player.event_manager()
        events.event_attach(vlc.EventType.MediaPlayerEndReached, self._on_end_reached)

    # ── History persistence ────────────────────────────────────────

    def _load_history(self):
        try:
            if os.path.exists(self._history_file):
                import json
                with open(self._history_file, "r") as f:
                    self.history = json.load(f)[:100]
                print(f"[music] Loaded {len(self.history)} history entries")
        except Exception as e:
            print(f"[music] Failed to load history: {e}")
            self.history = []

    def _save_history(self):
        try:
            import json
            with open(self._history_file, "w") as f:
                json.dump(self.history[:100], f)
        except Exception as e:
            print(f"[music] Failed to save history: {e}")

    # ── End-of-track handling ────────────────────────────────────────

    def _on_end_reached(self, event):
        """Called by VLC when a track finishes. Deferred via Timer to avoid VLC deadlock."""
        threading.Timer(0.1, self._handle_track_end).start()

    def _handle_track_end(self):
        song_to_play = None
        with self._lock:
            if self.repeat == "one" and self.current_song:
                song_to_play = self.current_song
            elif self.queue_index < len(self.queue) - 1:
                self.queue_index += 1
                self.current_song = self.queue[self.queue_index]
                song_to_play = self.current_song
            elif self.repeat == "all" and self.queue:
                self.queue_index = 0
                self.current_song = self.queue[0]
                song_to_play = self.current_song
            else:
                song_to_play = self._pick_auto_suggest()
        if song_to_play:
            threading.Thread(target=self._play_async, args=(song_to_play,), daemon=True).start()

    # ── Core playback ────────────────────────────────────────────────

    def _play_current(self):
        """Play the current_song (must hold _lock). Extracts URL if needed."""
        song = self.current_song
        if not song:
            return

        url = song.get("_audio_url")
        if not url:
            video_id = song.get("videoId")
            if not video_id:
                print("[music] No videoId in song")
                return
            print(f"[music] Extracting audio URL for {song.get('title', video_id)}...")
            url = _extract_audio_url(video_id)
            if not url:
                print("[music] Could not extract audio URL — skipping")
                return
            song["_audio_url"] = url

        self._play_vlc(song, url)

    def play(self, song, clear_queue=True):
        """Play a song. If clear_queue=True (default), replaces the queue. Otherwise inserts after current and advances."""
        with self._lock:
            self._player.stop()
            song_copy = {k: v for k, v in song.items() if k != "_audio_url"}
            if clear_queue:
                self.queue = [song_copy]
                self.queue_index = 0
            else:
                # Insert after current position and advance to it
                insert_pos = self.queue_index + 1 if self.queue_index >= 0 else len(self.queue)
                self.queue.insert(insert_pos, song_copy)
                self.queue_index = insert_pos
            self.current_song = song_copy
        # Extract URL and start playback in background thread so API returns fast
        threading.Thread(target=self._play_async, args=(song_copy,), daemon=True).start()

    def _play_async(self, song):
        """Background thread: extract URL then start VLC playback.
        Prefers local audio file if cached, falls back to streaming URL."""
        video_id = song.get("videoId")
        if not video_id:
            return

        # Try local audio file first (offline-capable)
        local_path = _get_local_audio(video_id)
        if local_path:
            print(f"[music] Playing from local cache: {song.get('title', video_id)}")
            with self._lock:
                if self.current_song is not song:
                    return
                self._play_vlc(song, local_path)
            return

        # Fall back to streaming URL
        url = song.get("_audio_url")
        if not url:
            print(f"[music] Extracting audio URL for {song.get('title', video_id)}...")
            url = _extract_audio_url(video_id)
            if not url:
                print("[music] Could not extract audio URL — skipping")
                return
            song["_audio_url"] = url
        with self._lock:
            # Only start if this song is still the current one (user may have changed)
            if self.current_song is not song:
                return
            self._play_vlc(song, url)

        # Download audio file in background for future offline use
        threading.Thread(target=_download_audio, args=(video_id,), daemon=True).start()

    def _play_vlc(self, song, url):
        """Start VLC playback (must hold _lock)."""
        media = self._vlc_instance.media_new(url)
        self._player.set_media(media)
        self._player.audio_set_volume(self.volume)
        self._player.play()
        print(f"[music] Playing: {song.get('title', '?')} — {song.get('artist', '?')}")
        # Track in history
        clean = {k: v for k, v in song.items() if not k.startswith("_")}
        if not self.history or self.history[0]["song"].get("videoId") != clean.get("videoId"):
            self.history.insert(0, {"song": clean, "played_at": time.time()})
            if len(self.history) > 50:
                self.history = self.history[:100]
            self._save_history()
            # Cache thumbnail in background for offline use
            thumb_url = clean.get("thumbnail", "")
            if thumb_url:
                threading.Thread(target=cache_thumbnail, args=(thumb_url,), daemon=True).start()

    def add_to_queue(self, song):
        """Append a song to the queue without disrupting playback."""
        with self._lock:
            song_copy = {k: v for k, v in song.items() if k != "_audio_url"}
            self.queue.append(song_copy)

    def pause(self):
        """Toggle pause/resume."""
        with self._lock:
            self._player.pause()

    def stop(self):
        """Stop playback, clear current song and queue."""
        with self._lock:
            self._player.stop()
            self.current_song = None
            self.queue = []
            self.queue_index = -1

    def next(self):
        """Skip to next track in queue. Auto-suggests from history when queue is exhausted."""
        song_to_play = None
        with self._lock:
            if not self.queue:
                song_to_play = self._pick_auto_suggest()
            elif self.shuffle:
                # Pick a random track we haven't played yet (ahead of current)
                remaining = [i for i in range(self.queue_index + 1, len(self.queue))]
                if remaining:
                    self.queue_index = random.choice(remaining)
                    self._player.stop()
                    self.current_song = self.queue[self.queue_index]
                    song_to_play = self.current_song
                else:
                    song_to_play = self._pick_auto_suggest()
            elif self.queue_index < len(self.queue) - 1:
                self.queue_index += 1
                self._player.stop()
                self.current_song = self.queue[self.queue_index]
                song_to_play = self.current_song
            elif self.repeat == "all":
                self.queue_index = 0
                self._player.stop()
                self.current_song = self.queue[0]
                song_to_play = self.current_song
            else:
                song_to_play = self._pick_auto_suggest()
        # Extract URL and play outside the lock (network call can be slow)
        if song_to_play:
            threading.Thread(target=self._play_async, args=(song_to_play,), daemon=True).start()

    def _pick_auto_suggest(self):
        """Pick a random song from history, add to queue, return it (must hold _lock)."""
        if not self.history:
            return None
        current_id = self.current_song.get("videoId") if self.current_song else None
        candidates = [h for h in self.history if h["song"].get("videoId") != current_id]
        if not candidates:
            candidates = self.history
        pick = random.choice(candidates)["song"]
        song_copy = {k: v for k, v in pick.items() if not k.startswith("_")}
        self.queue.append(song_copy)
        self.queue_index = len(self.queue) - 1
        self.current_song = song_copy
        self._player.stop()
        return song_copy

    def previous(self):
        """Go to previous track, or restart current if >3s in."""
        with self._lock:
            pos_ms = self._player.get_time()
            if pos_ms > 3000 and self.current_song:
                # Restart current track
                self._player.set_time(0)
                return
            if self.queue_index > 0:
                self.queue_index -= 1
                self._player.stop()
                self.current_song = self.queue[self.queue_index]
                self._play_current()

    def seek(self, position_sec):
        """Seek to position in seconds."""
        with self._lock:
            self._player.set_time(int(position_sec * 1000))

    def set_volume(self, vol):
        """Set volume (0-100)."""
        with self._lock:
            self.volume = max(0, min(100, int(vol)))
            self._player.audio_set_volume(self.volume)

    def set_shuffle(self, enabled=None):
        """Toggle or set shuffle mode."""
        with self._lock:
            if enabled is None:
                self.shuffle = not self.shuffle
            else:
                self.shuffle = bool(enabled)
            return self.shuffle

    def set_repeat(self, mode=None):
        """Cycle or set repeat mode."""
        with self._lock:
            if mode is not None:
                self.repeat = mode
            else:
                cycle = {"off": "all", "all": "one", "one": "off"}
                self.repeat = cycle.get(self.repeat, "off")
            return self.repeat

    def set_output_device(self, device_name):
        """Switch VLC audio output device."""
        with self._lock:
            self.output_device = device_name
            # Enumerate VLC devices to find a matching one
            mods = self._player.audio_output_device_enum()
            if mods:
                d = mods
                while d:
                    desc = d.contents.description.decode("utf-8", errors="replace") if d.contents.description else ""
                    dev_id = d.contents.device.decode("utf-8", errors="replace") if d.contents.device else ""
                    if device_name.lower() in desc.lower() or device_name.lower() in dev_id.lower():
                        self._player.audio_output_device_set(None, d.contents.device)
                        print(f"[music] Switched VLC output to: {desc} ({dev_id})")
                        vlc.libvlc_audio_output_device_list_release(mods)
                        return
                    d = d.contents.next
                vlc.libvlc_audio_output_device_list_release(mods)
            print(f"[music] Device '{device_name}' not found in VLC device list")

    def get_state(self):
        """Return the full music state dict with live VLC data."""
        with self._lock:
            is_playing = self._player.is_playing() == 1
            pos_ms = self._player.get_time()    # -1 if not playing
            dur_ms = self._player.get_length()   # -1 if not available

            position = max(0, pos_ms // 1000) if pos_ms >= 0 else 0
            duration = max(0, dur_ms // 1000) if dur_ms >= 0 else 0

            # If VLC doesn't report duration yet, fall back to song metadata
            if duration == 0 and self.current_song:
                dur_str = self.current_song.get("duration", "0:00")
                parts = dur_str.split(":")
                try:
                    if len(parts) == 2:
                        duration = int(parts[0]) * 60 + int(parts[1])
                    elif len(parts) == 3:
                        duration = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                except ValueError:
                    duration = 0

            # Build the song dict without internal _audio_url
            song = None
            if self.current_song:
                song = {k: v for k, v in self.current_song.items() if not k.startswith("_")}

            # Build clean queue — only show current + upcoming (hide finished songs)
            visible_queue = self.queue[self.queue_index:] if self.queue_index >= 0 else self.queue
            clean_queue = [
                {k: v for k, v in s.items() if not k.startswith("_")}
                for s in visible_queue
            ]

            return {
                "song": song,
                "is_playing": is_playing,
                "position": position,
                "duration": duration,
                "volume": self.volume,
                "output_device": self.output_device,
                "queue": clean_queue,
                "queue_length": len(clean_queue),
                "queue_index": 0,  # current song is always first in the visible queue
                "shuffle": self.shuffle,
                "repeat": self.repeat,
            }


# Global player instance (created at import time — VLC must be installed)
try:
    player = MusicPlayer()
    print("[music] VLC player initialized")
except Exception as e:
    player = None
    print(f"[music] VLC init failed: {e} — music playback will not work")

# Chat history
messages = []

# Timers — persisted to disk
import json as _json

_TIMERS_FILE = os.path.join(os.path.dirname(__file__), ".timers.json")


def _load_timers():
    """Load alarms from disk (timers are ephemeral, only alarms persist)."""
    try:
        if os.path.exists(_TIMERS_FILE):
            with open(_TIMERS_FILE, "r") as f:
                items = _json.load(f)
            # Only restore alarms that haven't fired and are in the future
            now = time.time()
            restored = []
            for t in items:
                if t.get("type") == "alarm" and not t.get("fired"):
                    target = t.get("_target", 0)
                    if target > now:
                        t["remaining"] = int(target - now)
                        restored.append(t)
                    elif t.get("_repeat", "none") != "none":
                        # Repeating alarm — advance to next occurrence
                        _advance_repeating_alarm(t)
                        if t.get("_target", 0) > now:
                            restored.append(t)
            if restored:
                print(f"[timers] Restored {len(restored)} alarms")
            return restored
    except Exception as e:
        print(f"[timers] Failed to load: {e}")
    return []


def _save_timers():
    """Save active alarms to disk."""
    try:
        # Only persist alarms (timers are short-lived)
        alarms = [t for t in timers_list if t.get("type") == "alarm" and not t.get("fired")]
        with open(_TIMERS_FILE, "w") as f:
            _json.dump(alarms, f)
    except Exception as e:
        print(f"[timers] Failed to save: {e}")


timers_list = _load_timers()

# ── Notes persistence ────────────────────────────────────────────────

_NOTES_FILE = os.path.join(os.path.dirname(__file__), ".notes.json")


def _load_notes():
    try:
        if os.path.exists(_NOTES_FILE):
            with open(_NOTES_FILE) as f:
                return _json.load(f)
    except Exception:
        pass
    return []


def _save_notes(notes):
    with open(_NOTES_FILE, "w") as f:
        _json.dump(notes, f)


notes_list = _load_notes()

# Mock weather (real Open-Meteo could be added but needs requests)
MOCK_WEATHER = {
    "temperature": 42, "feels_like": 36, "humidity": 35, "wind_speed": 12,
    "description": "Partly cloudy", "icon": "cloudy", "weather_code": 2,
    "forecast": [
        {"date": "2026-02-22", "high": 48, "low": 28, "description": "Partly cloudy", "icon": "cloudy"},
        {"date": "2026-02-23", "high": 52, "low": 30, "description": "Clear sky", "icon": "clear"},
        {"date": "2026-02-24", "high": 45, "low": 25, "description": "Slight snow", "icon": "snow"},
    ],
}

# Try to fetch real weather
weather_data = None


def fetch_real_weather():
    global weather_data
    try:
        import requests
        resp = requests.get("https://api.open-meteo.com/v1/forecast", params={
            "latitude": 38.8339, "longitude": -104.8214,
            "current": "temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m",
            "daily": "temperature_2m_max,temperature_2m_min,weather_code",
            "temperature_unit": "fahrenheit", "wind_speed_unit": "mph",
            "timezone": "America/Denver", "forecast_days": 3,
        }, timeout=10)
        data = resp.json()
        current = data.get("current", {})
        daily = data.get("daily", {})

        WMO = {0: ("Clear sky", "clear"), 1: ("Mainly clear", "clear"), 2: ("Partly cloudy", "cloudy"),
               3: ("Overcast", "cloudy"), 45: ("Foggy", "fog"), 51: ("Light drizzle", "rain"),
               61: ("Slight rain", "rain"), 63: ("Moderate rain", "rain"), 65: ("Heavy rain", "rain"),
               71: ("Slight snow", "snow"), 73: ("Moderate snow", "snow"), 75: ("Heavy snow", "snow"),
               95: ("Thunderstorm", "storm")}
        code = current.get("weather_code", 0)
        desc, icon = WMO.get(code, ("Unknown", "clear"))

        weather_data = {
            "temperature": round(current.get("temperature_2m", 0)),
            "feels_like": round(current.get("apparent_temperature", 0)),
            "humidity": current.get("relative_humidity_2m", 0),
            "wind_speed": round(current.get("wind_speed_10m", 0)),
            "description": desc, "icon": icon, "weather_code": code,
            "forecast": [],
        }
        for i, date in enumerate(daily.get("time", [])):
            dc = daily.get("weather_code", [0])[i] if i < len(daily.get("weather_code", [])) else 0
            dd, di = WMO.get(dc, ("Unknown", "clear"))
            weather_data["forecast"].append({
                "date": date,
                "high": round(daily["temperature_2m_max"][i]) if i < len(daily.get("temperature_2m_max", [])) else 0,
                "low": round(daily["temperature_2m_min"][i]) if i < len(daily.get("temperature_2m_min", [])) else 0,
                "description": dd, "icon": di,
            })
        print(f"[weather] Real weather: {weather_data['temperature']}°F, {desc}")
    except Exception as e:
        print(f"[weather] Failed to fetch: {e} — using mock")


# ── Calendar Helpers ─────────────────────────────────────────────────

def format_event(event):
    start = event.get("start", {})
    end = event.get("end", {})
    start_str = start.get("dateTime", start.get("date", ""))
    end_str = end.get("dateTime", end.get("date", ""))

    is_all_day = "date" in start and "dateTime" not in start

    def fmt(iso):
        if not iso:
            return ""
        try:
            if is_all_day:
                # All-day events have date strings like "2026-02-22"
                return datetime.datetime.strptime(iso, "%Y-%m-%d").strftime("%a %b %d")
            return datetime.datetime.fromisoformat(iso).strftime("%a %b %d, %I:%M %p")
        except ValueError:
            return iso

    return {
        "id": event.get("id", ""),
        "summary": event.get("summary", "(No title)"),
        "description": event.get("description", ""),
        "location": event.get("location", ""),
        "start": fmt(start_str), "end": fmt(end_str),
        "start_iso": start_str, "end_iso": end_str,
        "all_day": is_all_day,
        "recurrence": event.get("recurrence", []),
        "recurring": bool(event.get("recurringEventId")),
    }


MOCK_EVENTS = [
    {"id": "1", "summary": "Cybersecurity Lab", "description": "", "location": "PPSC Room 214",
     "start": "Mon Feb 23, 10:00 AM", "end": "Mon Feb 23, 11:30 AM",
     "start_iso": "2026-02-23T10:00:00-07:00", "end_iso": "2026-02-23T11:30:00-07:00", "all_day": False},
    {"id": "2", "summary": "FBLA Meeting", "description": "", "location": "Student Center",
     "start": "Tue Feb 24, 04:00 PM", "end": "Tue Feb 24, 05:00 PM",
     "start_iso": "2026-02-24T16:00:00-07:00", "end_iso": "2026-02-24T17:00:00-07:00", "all_day": False},
]


# ── Calendar Cache (offline-first) ──────────────────────────────────

class CalendarCache:
    """Local cache for calendar events with pending sync queue."""

    def __init__(self):
        self._file = os.path.join(os.path.dirname(__file__), ".calendar.json")
        self._lock = threading.Lock()
        self.events = []
        self.last_sync = 0.0
        self.pending = []
        self._load()

    def _load(self):
        try:
            if os.path.exists(self._file):
                with open(self._file, "r") as f:
                    data = _json.load(f)
                self.events = data.get("events", [])
                self.last_sync = data.get("last_sync", 0.0)
                self.pending = data.get("pending", [])
                print(f"[calendar] Cache loaded: {len(self.events)} events, {len(self.pending)} pending ops")
        except Exception as e:
            print(f"[calendar] Failed to load cache: {e}")

    def save(self):
        try:
            with open(self._file, "w") as f:
                _json.dump({
                    "events": self.events,
                    "last_sync": self.last_sync,
                    "pending": self.pending,
                }, f)
        except Exception as e:
            print(f"[calendar] Failed to save cache: {e}")

    def get_events(self):
        with self._lock:
            return list(self.events)

    def set_events(self, events):
        with self._lock:
            self.events = events
            self.last_sync = time.time()
            self.save()

    def add_pending(self, op, data, event_id=None):
        with self._lock:
            entry = {"op": op, "data": data}
            if event_id:
                entry["event_id"] = event_id
            if op == "create":
                entry["local_id"] = f"local_{int(time.time() * 1000)}"
            self.pending.append(entry)
            self.save()
            return entry

    def apply_local_create(self, data):
        """Add event to cache with a local_xxx ID, queue pending create."""
        entry = self.add_pending("create", data)
        local_id = entry["local_id"]
        # Build a formatted event for local display
        event_body = self._build_event_body(data)
        event_body["id"] = local_id
        formatted = format_event(event_body)
        with self._lock:
            self.events.append(formatted)
            self.save()
        return formatted

    def apply_local_update(self, event_id, data):
        """Update event in cache, queue pending update."""
        self.add_pending("update", data, event_id=event_id)
        with self._lock:
            for ev in self.events:
                if ev.get("id") == event_id:
                    if "summary" in data:
                        ev["summary"] = data["summary"]
                    if "description" in data:
                        ev["description"] = data["description"]
                    if "location" in data:
                        ev["location"] = data["location"]
                    # Rebuild start/end display strings from new data
                    if "start" in data:
                        is_all_day = data.get("allDay", False)
                        iso = data["start"]
                        ev["start_iso"] = iso
                        ev["all_day"] = is_all_day
                        try:
                            if is_all_day:
                                ev["start"] = datetime.datetime.strptime(iso, "%Y-%m-%d").strftime("%a %b %d")
                            else:
                                ev["start"] = datetime.datetime.fromisoformat(iso).strftime("%a %b %d, %I:%M %p")
                        except ValueError:
                            ev["start"] = iso
                    if "end" in data:
                        is_all_day = data.get("allDay", False)
                        iso = data["end"]
                        ev["end_iso"] = iso
                        try:
                            if is_all_day:
                                ev["end"] = datetime.datetime.strptime(iso, "%Y-%m-%d").strftime("%a %b %d")
                            else:
                                ev["end"] = datetime.datetime.fromisoformat(iso).strftime("%a %b %d, %I:%M %p")
                        except ValueError:
                            ev["end"] = iso
                    break
            self.save()

    def apply_local_delete(self, event_id):
        """Remove from cache, queue pending delete."""
        # Don't queue a Google delete for local-only events
        is_local = event_id.startswith("local_")
        with self._lock:
            self.events = [e for e in self.events if e.get("id") != event_id]
            if is_local:
                # Also remove any pending creates for this local_id
                self.pending = [p for p in self.pending if p.get("local_id") != event_id]
            else:
                self.pending.append({"op": "delete", "event_id": event_id})
            self.save()

    def flush_pending(self):
        """Try to sync all pending ops to Google Calendar. Remove successful ones."""
        if not calendar_service or not self.pending:
            return
        with self._lock:
            remaining = []
            for entry in self.pending:
                op = entry["op"]
                try:
                    if op == "create":
                        event_body = self._build_event_body(entry["data"])
                        created = calendar_service.events().insert(
                            calendarId="primary", body=event_body
                        ).execute()
                        # Replace local_id with real Google ID in cache
                        local_id = entry.get("local_id")
                        if local_id:
                            real_id = created.get("id", "")
                            for ev in self.events:
                                if ev.get("id") == local_id:
                                    ev["id"] = real_id
                                    break
                            # Update any pending updates/deletes referencing this local_id
                            for other in remaining:
                                if other.get("event_id") == local_id:
                                    other["event_id"] = real_id
                        print(f"[calendar] Synced create: {entry['data'].get('summary', '?')}")
                    elif op == "update":
                        eid = entry["event_id"]
                        data = entry["data"]
                        event = calendar_service.events().get(
                            calendarId="primary", eventId=eid
                        ).execute()
                        if "summary" in data:
                            event["summary"] = data["summary"]
                        if "description" in data:
                            event["description"] = data["description"]
                        if "location" in data:
                            event["location"] = data["location"]
                        is_all_day = data.get("allDay", False)
                        if "start" in data:
                            if is_all_day:
                                event["start"] = {"date": data["start"]}
                            else:
                                event["start"] = {"dateTime": data["start"], "timeZone": "America/Denver"}
                        if "end" in data:
                            if is_all_day:
                                event["end"] = {"date": data["end"]}
                            else:
                                event["end"] = {"dateTime": data["end"], "timeZone": "America/Denver"}
                        if "recurrence" in data:
                            if isinstance(data["recurrence"], list) and len(data["recurrence"]) == 0:
                                event.pop("recurrence", None)
                            else:
                                event["recurrence"] = data["recurrence"] if isinstance(data["recurrence"], list) else [data["recurrence"]]
                        calendar_service.events().update(
                            calendarId="primary", eventId=eid, body=event
                        ).execute()
                        print(f"[calendar] Synced update: {eid}")
                    elif op == "delete":
                        eid = entry["event_id"]
                        calendar_service.events().delete(
                            calendarId="primary", eventId=eid
                        ).execute()
                        print(f"[calendar] Synced delete: {eid}")
                except Exception as e:
                    print(f"[calendar] Pending {op} failed: {e}")
                    remaining.append(entry)
            self.pending = remaining
            self.save()

    @staticmethod
    def _build_event_body(data):
        """Build a Google Calendar event body dict from request data."""
        is_all_day = data.get("allDay", False)
        event = {
            "summary": data.get("summary", ""),
            "location": data.get("location", ""),
            "description": data.get("description", ""),
        }
        if is_all_day:
            event["start"] = {"date": data["start"]}
            event["end"] = {"date": data["end"]}
        else:
            event["start"] = {"dateTime": data["start"], "timeZone": "America/Denver"}
            event["end"] = {"dateTime": data["end"], "timeZone": "America/Denver"}
        recurrence = data.get("recurrence")
        if recurrence:
            event["recurrence"] = recurrence if isinstance(recurrence, list) else [recurrence]
        return event


cal_cache = CalendarCache()


from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

_cal_executor = ThreadPoolExecutor(max_workers=1)


def _fetch_google_events(days):
    """Run the Google Calendar API call (called in a thread so we can timeout)."""
    now = datetime.datetime.now(tz=datetime.timezone.utc)
    time_max = now + datetime.timedelta(days=days)
    result = calendar_service.events().list(
        calendarId="primary", timeMin=now.isoformat(), timeMax=time_max.isoformat(),
        maxResults=20, singleEvents=True, orderBy="startTime",
    ).execute()
    return [format_event(e) for e in result.get("items", [])]


def get_calendar_events(days=7):
    """Fetch events — try Google first (5s timeout), fall back to cache. Returns (events, offline)."""
    if not calendar_service:
        return MOCK_EVENTS, False

    try:
        future = _cal_executor.submit(_fetch_google_events, days)
        events = future.result(timeout=5)
        cal_cache.set_events(events)
        # Flush any pending offline ops now that we're online
        cal_cache.flush_pending()
        return events, False
    except FuturesTimeoutError:
        print("[calendar] Google API timed out, using cache")
        future.cancel()
        cached = cal_cache.get_events()
        if cached:
            return cached, True
        return MOCK_EVENTS, True
    except Exception as e:
        print(f"[calendar] Google API failed, using cache: {e}")
        cached = cal_cache.get_events()
        if cached:
            return cached, True
        return MOCK_EVENTS, True


# ── Pages ────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ── Chat API (mock — no Ollama on laptop test) ──────────────────────

@app.route("/api/chat", methods=["POST"])
def api_chat():
    data = request.json or {}
    msg = data.get("message", "")
    text = f"BMO heard you say: \"{msg}\"! BMO is in test mode — no Ollama running. But everything else is real!"
    return jsonify({"text": text, "speaker": "gavin", "commands_executed": []})


# ── Music API (REAL ytmusicapi) ──────────────────────────────────────

@app.route("/api/music/search")
def api_music_search():
    query = request.args.get("q", "")
    if not query:
        return jsonify([])
    try:
        results = ytmusic.search(query, filter="songs", limit=20)
        formatted = []
        for r in results:
            if not r.get("videoId"):
                continue
            artists = ", ".join(a["name"] for a in r.get("artists", []))
            thumbs = r.get("thumbnails", [])
            formatted.append({
                "videoId": r["videoId"],
                "title": r.get("title", "Unknown"),
                "artist": artists,
                "album": r.get("album", {}).get("name", "") if r.get("album") else "",
                "albumId": r.get("album", {}).get("id", "") if r.get("album") else "",
                "duration": r.get("duration", ""),
                "thumbnail": thumbs[-1]["url"] if thumbs else "",
            })
        # Pre-extract audio URLs for top results so play is near-instant
        top_ids = [s["videoId"] for s in formatted[:3]]
        _prefetch_urls(top_ids)

        return jsonify(formatted)
    except Exception as e:
        print(f"[music] Search error: {e}")
        return jsonify([])


@app.route("/api/music/play", methods=["POST"])
def api_music_play():
    if not player:
        return jsonify({"error": "VLC not available"}), 503
    data = request.json or {}
    song = data.get("song")
    if song:
        player.play(song)
    else:
        # Resume if paused
        player.pause()
    return jsonify({"ok": True})


@app.route("/api/music/pause", methods=["POST"])
def api_music_pause():
    if not player:
        return jsonify({"error": "VLC not available"}), 503
    player.pause()
    return jsonify({"ok": True})


@app.route("/api/music/stop", methods=["POST"])
def api_music_stop():
    if not player:
        return jsonify({"error": "VLC not available"}), 503
    player.stop()
    return jsonify({"ok": True})


@app.route("/api/music/next", methods=["POST"])
def api_music_next():
    if not player:
        return jsonify({"error": "VLC not available"}), 503
    player.next()
    return jsonify({"ok": True})


@app.route("/api/music/previous", methods=["POST"])
def api_music_previous():
    if not player:
        return jsonify({"error": "VLC not available"}), 503
    player.previous()
    return jsonify({"ok": True})


@app.route("/api/music/seek", methods=["POST"])
def api_music_seek():
    if not player:
        return jsonify({"error": "VLC not available"}), 503
    data = request.json or {}
    player.seek(data.get("position", 0))
    return jsonify({"ok": True})


@app.route("/api/music/volume", methods=["POST"])
def api_music_volume():
    if not player:
        return jsonify({"error": "VLC not available"}), 503
    data = request.json or {}
    player.set_volume(data.get("volume", 50))
    return jsonify({"ok": True})


@app.route("/api/music/state")
def api_music_state():
    if not player:
        return jsonify({
            "song": None, "is_playing": False, "position": 0, "duration": 0,
            "volume": 50, "output_device": "default", "queue": [],
            "queue_length": 0, "queue_index": -1, "shuffle": False, "repeat": "off",
        })
    return jsonify(player.get_state())


@app.route("/api/music/devices")
def api_music_devices():
    return jsonify(_get_audio_devices())


@app.route("/api/music/cast", methods=["POST"])
def api_music_cast():
    if not player:
        return jsonify({"error": "VLC not available"}), 503
    data = request.json or {}
    player.set_output_device(data.get("device", "default"))
    return jsonify({"ok": True})


@app.route("/api/music/shuffle", methods=["POST"])
def api_music_shuffle():
    if not player:
        return jsonify({"error": "VLC not available"}), 503
    return jsonify({"shuffle": player.set_shuffle()})


@app.route("/api/music/repeat", methods=["POST"])
def api_music_repeat():
    if not player:
        return jsonify({"error": "VLC not available"}), 503
    return jsonify({"repeat": player.set_repeat()})


@app.route("/api/music/queue/add", methods=["POST"])
def api_music_queue_add():
    if not player:
        return jsonify({"error": "VLC not available"}), 503
    data = request.json or {}
    song = data.get("song")
    if not song:
        return jsonify({"error": "No song provided"}), 400
    player.add_to_queue(song)
    return jsonify({"ok": True, "queue_length": len(player.queue)})


@app.route("/api/music/queue/remove", methods=["POST"])
def api_music_queue_remove():
    if not player:
        return jsonify({"error": "VLC not available"}), 503
    data = request.json or {}
    index = data.get("index")
    if index is None:
        return jsonify({"error": "No index provided"}), 400
    with player._lock:
        # UI index is relative to visible queue (from queue_index onward)
        real_index = index + max(0, player.queue_index)
        if 0 <= real_index < len(player.queue):
            # Don't allow removing the currently playing song
            if real_index == player.queue_index:
                return jsonify({"error": "Cannot remove currently playing song"}), 400
            player.queue.pop(real_index)
            # Adjust queue_index if we removed before current
            if real_index < player.queue_index:
                player.queue_index -= 1
    visible_len = len(player.queue) - max(0, player.queue_index)
    return jsonify({"ok": True, "queue_length": visible_len})


@app.route("/api/music/queue")
def api_music_queue():
    if not player:
        return jsonify({"queue": [], "queue_index": -1})
    with player._lock:
        visible_queue = player.queue[player.queue_index:] if player.queue_index >= 0 else player.queue
        clean_queue = [
            {k: v for k, v in s.items() if not k.startswith("_")}
            for s in visible_queue
        ]
        return jsonify({"queue": clean_queue, "queue_index": 0})


@app.route("/api/music/album/<browse_id>")
def api_music_album(browse_id):
    try:
        album = ytmusic.get_album(browse_id)
        tracks = []
        for t in album.get("tracks", []):
            tracks.append({
                "videoId": t.get("videoId", ""),
                "title": t.get("title", ""),
                "artist": ", ".join(a["name"] for a in t.get("artists", [])),
                "duration": t.get("duration", ""),
                "thumbnail": album.get("thumbnails", [{}])[-1].get("url", ""),
                "album": album.get("title", ""),
                "albumId": browse_id,
            })
        return jsonify({
            "title": album.get("title", ""),
            "artist": album.get("artists", [{}])[0].get("name", "") if album.get("artists") else "",
            "thumbnail": album.get("thumbnails", [{}])[-1].get("url", ""),
            "year": album.get("year", ""),
            "tracks": tracks,
        })
    except Exception as e:
        print(f"[music] Album fetch error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/music/playlist/<browse_id>")
def api_music_playlist(browse_id):
    try:
        print(f"[music] Fetching playlist: {browse_id}")
        pl = ytmusic.get_playlist(browse_id, limit=100)
        print(f"[music] Playlist '{pl.get('title', '?')}': {len(pl.get('tracks', []))} tracks")
        tracks = []
        for t in pl.get("tracks", []):
            if not t.get("videoId"):
                continue
            tracks.append({
                "videoId": t["videoId"],
                "title": t.get("title", ""),
                "artist": ", ".join(a["name"] for a in t.get("artists", [])),
                "duration": t.get("duration", ""),
                "thumbnail": t.get("thumbnails", [{}])[-1].get("url", ""),
            })
        return jsonify({
            "title": pl.get("title", ""),
            "artist": pl.get("author", {}).get("name", "") if pl.get("author") else "",
            "thumbnail": pl.get("thumbnails", [{}])[-1].get("url", ""),
            "year": pl.get("year", ""),
            "trackCount": pl.get("trackCount", len(tracks)),
            "tracks": tracks,
        })
    except Exception as e:
        print(f"[music] Playlist fetch error: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/music/search/playlists")
def api_music_search_playlists():
    query = request.args.get("q", "")
    if not query:
        return jsonify([])
    try:
        # "community_playlists" works better without auth than "playlists"
        results = ytmusic.search(query, filter="community_playlists", limit=20)
        print(f"[music] Playlist search for '{query}': {len(results)} raw results")
        if results:
            print(f"[music] First result keys: {list(results[0].keys())}")
        formatted = []
        for r in results:
            browse_id = r.get("browseId") or r.get("playlistId")
            if not browse_id:
                continue
            # browseId needs "VL" prefix for get_playlist; playlistId doesn't have it
            if not browse_id.startswith("VL") and r.get("playlistId"):
                browse_id = "VL" + r["playlistId"]
            formatted.append({
                "browseId": browse_id,
                "title": r.get("title", ""),
                "author": r.get("author", ""),
                "itemCount": r.get("itemCount", ""),
                "thumbnail": r.get("thumbnails", [{}])[-1].get("url", ""),
            })
        print(f"[music] Playlist search formatted: {len(formatted)} results")
        return jsonify(formatted)
    except Exception as e:
        print(f"[music] Playlist search error: {e}")
        return jsonify([])


def _with_local_thumbs(history_list):
    """Return history with local thumbnail paths when cached."""
    result = []
    for entry in history_list:
        song = dict(entry.get("song", {}))
        url = song.get("thumbnail", "")
        if url:
            fname = _thumb_filename(url)
            if os.path.exists(os.path.join(_THUMB_DIR, fname)):
                song["thumbnail"] = f"/static/thumbcache/{fname}"
        result.append({"song": song, "played_at": entry.get("played_at", 0)})
    return result


@app.route("/api/music/history")
def api_music_history():
    if not player:
        return jsonify([])
    return jsonify(_with_local_thumbs(player.history))


@app.route("/api/music/most-played")
def api_music_most_played():
    """Return top songs by play count from history."""
    if not player or not player.history:
        return jsonify([])
    counts = {}
    for entry in player.history:
        vid = entry["song"].get("videoId", "")
        if vid not in counts:
            counts[vid] = {"song": entry["song"], "count": 0}
        counts[vid]["count"] += 1
    ranked = sorted(counts.values(), key=lambda x: x["count"], reverse=True)
    songs = []
    for r in ranked[:4]:
        song = dict(r["song"])
        url = song.get("thumbnail", "")
        if url:
            fname = _thumb_filename(url)
            if os.path.exists(os.path.join(_THUMB_DIR, fname)):
                song["thumbnail"] = f"/static/thumbcache/{fname}"
        songs.append(song)
    return jsonify(songs)


# ── Calendar API (REAL if authorized) ────────────────────────────────

@app.route("/api/calendar/events")
def api_calendar_events():
    days = int(request.args.get("days", 7))
    try:
        events, offline = get_calendar_events(days)
        return jsonify({"events": events, "offline": offline})
    except Exception as e:
        print(f"[calendar] Error: {e}")
        cached = cal_cache.get_events()
        return jsonify({"events": cached or MOCK_EVENTS, "offline": True})


@app.route("/api/calendar/today")
def api_calendar_today():
    try:
        events, offline = get_calendar_events(1)
        return jsonify({"events": events, "offline": offline})
    except Exception as e:
        print(f"[calendar] Today error: {e}")
        cached = cal_cache.get_events()
        return jsonify({"events": cached or MOCK_EVENTS, "offline": True})


@app.route("/api/calendar/next")
def api_calendar_next():
    try:
        events, offline = get_calendar_events(7)
        return jsonify(events[0] if events else {})
    except Exception as e:
        print(f"[calendar] Next error: {e}")
        cached = cal_cache.get_events()
        return jsonify(cached[0] if cached else {})


@app.route("/api/calendar/create", methods=["POST"])
def api_calendar_create():
    data = request.json or {}
    if not calendar_service:
        # No token — work purely locally
        formatted = cal_cache.apply_local_create(data)
        return jsonify({"event": formatted, "offline": True})
    try:
        event_body = CalendarCache._build_event_body(data)
        created = calendar_service.events().insert(calendarId="primary", body=event_body).execute()
        formatted = format_event(created)
        return jsonify({"event": formatted, "offline": False})
    except Exception as e:
        print(f"[calendar] Create failed (offline): {e}")
        formatted = cal_cache.apply_local_create(data)
        return jsonify({"event": formatted, "offline": True})


@app.route("/api/calendar/update/<event_id>", methods=["PUT"])
def api_calendar_update(event_id):
    data = request.json or {}
    if not calendar_service:
        cal_cache.apply_local_update(event_id, data)
        return jsonify({"ok": True, "offline": True})
    try:
        event = calendar_service.events().get(calendarId="primary", eventId=event_id).execute()
        if "summary" in data:
            event["summary"] = data["summary"]
        if "description" in data:
            event["description"] = data["description"]
        if "location" in data:
            event["location"] = data["location"]

        is_all_day = data.get("allDay", False)
        if "start" in data:
            if is_all_day:
                event["start"] = {"date": data["start"]}
            else:
                event["start"] = {"dateTime": data["start"], "timeZone": "America/Denver"}
        if "end" in data:
            if is_all_day:
                event["end"] = {"date": data["end"]}
            else:
                event["end"] = {"dateTime": data["end"], "timeZone": "America/Denver"}

        if "recurrence" in data:
            if isinstance(data["recurrence"], list) and len(data["recurrence"]) == 0:
                # Clear recurrence
                event.pop("recurrence", None)
            else:
                event["recurrence"] = data["recurrence"] if isinstance(data["recurrence"], list) else [data["recurrence"]]

        updated = calendar_service.events().update(calendarId="primary", eventId=event_id, body=event).execute()
        return jsonify({"event": format_event(updated), "offline": False})
    except Exception as e:
        print(f"[calendar] Update failed (offline): {e}")
        cal_cache.apply_local_update(event_id, data)
        return jsonify({"ok": True, "offline": True})


@app.route("/api/calendar/delete/<event_id>", methods=["DELETE"])
def api_calendar_delete(event_id):
    if not calendar_service:
        cal_cache.apply_local_delete(event_id)
        return jsonify({"ok": True, "offline": True})
    try:
        calendar_service.events().delete(calendarId="primary", eventId=event_id).execute()
        return jsonify({"ok": True, "offline": False})
    except Exception as e:
        print(f"[calendar] Delete failed (offline): {e}")
        cal_cache.apply_local_delete(event_id)
        return jsonify({"ok": True, "offline": True})


# ── Notes API ────────────────────────────────────────────────────────

@app.route("/api/notes")
def api_notes():
    return jsonify(notes_list)


@app.route("/api/notes", methods=["POST"])
def api_notes_create():
    data = request.json or {}
    text = data.get("text", "").strip()
    if not text:
        return jsonify({"error": "No text provided"}), 400
    note = {
        "id": str(int(time.time() * 1000)),
        "text": text,
        "done": False,
        "created": time.time(),
    }
    notes_list.append(note)
    _save_notes(notes_list)
    return jsonify(note)


@app.route("/api/notes/<note_id>", methods=["PUT"])
def api_notes_update(note_id):
    data = request.json or {}
    for note in notes_list:
        if note["id"] == note_id:
            if "done" in data:
                note["done"] = bool(data["done"])
            if "text" in data:
                note["text"] = data["text"]
            _save_notes(notes_list)
            return jsonify(note)
    return jsonify({"error": "Not found"}), 404


@app.route("/api/notes/<note_id>", methods=["DELETE"])
def api_notes_delete(note_id):
    global notes_list
    notes_list = [n for n in notes_list if n["id"] != note_id]
    _save_notes(notes_list)
    return jsonify({"ok": True})


# ── Music Lyrics API ────────────────────────────────────────────────

@app.route("/api/music/lyrics/<video_id>")
def api_music_lyrics(video_id):
    try:
        watch = ytmusic.get_watch_playlist(video_id)
        lyrics_browse_id = watch.get("lyrics")
        if not lyrics_browse_id:
            return jsonify({"lyrics": None, "error": "No lyrics available"})
        lyrics_data = ytmusic.get_lyrics(lyrics_browse_id)
        return jsonify({
            "lyrics": lyrics_data.get("lyrics", ""),
            "source": lyrics_data.get("source", ""),
        })
    except Exception as e:
        return jsonify({"lyrics": None, "error": str(e)})


# ── TV Remote API ────────────────────────────────────────────────────

_tv_remote = None
_tv_loop = None
_tv_pairing_remote = None  # Temporary remote used during pairing

TV_IP = "10.10.20.194"
_TV_CERT_DIR = os.path.dirname(__file__)
_TV_CERTFILE = os.path.join(_TV_CERT_DIR, "tv_cert.pem")
_TV_KEYFILE = os.path.join(_TV_CERT_DIR, "tv_key.pem")

TV_KEYS = {
    "up": "DPAD_UP", "down": "DPAD_DOWN", "left": "DPAD_LEFT", "right": "DPAD_RIGHT",
    "select": "DPAD_CENTER", "back": "BACK", "home": "HOME",
    "play_pause": "MEDIA_PLAY_PAUSE", "rewind": "MEDIA_PREVIOUS", "forward": "MEDIA_NEXT",
    "power": "POWER", "volume_up": "VOLUME_UP", "volume_down": "VOLUME_DOWN", "mute": "VOLUME_MUTE",
}

TV_APPS = {
    "youtube": "com.google.android.youtube.tv",
    "netflix": "com.netflix.ninja",
    "prime": "https://app.primevideo.com",
    "crunchyroll": "crunchyroll://",
    "twitch": "tv.twitch.android.app",
    "plex": "com.plexapp.android",
}


def _ensure_tv_loop():
    """Create the asyncio event loop for TV operations if not already running."""
    global _tv_loop
    if _tv_loop and _tv_loop.is_running():
        return
    import asyncio
    _tv_loop = asyncio.new_event_loop()

    def _run():
        asyncio.set_event_loop(_tv_loop)
        _tv_loop.run_forever()

    threading.Thread(target=_run, daemon=True).start()
    time.sleep(0.1)  # Give the loop a moment to start


def _tv_run(coro, timeout=10):
    """Run an async coroutine on the TV event loop from sync Flask context."""
    import asyncio
    if not _tv_loop:
        _ensure_tv_loop()
    future = asyncio.run_coroutine_threadsafe(coro, _tv_loop)
    return future.result(timeout=timeout)


def init_tv_remote():
    """Try to connect to TV using existing certs. If no certs, skip (user must pair first)."""
    global _tv_remote
    try:
        from androidtvremote2 import AndroidTVRemote

        if not os.path.exists(_TV_CERTFILE) or not os.path.exists(_TV_KEYFILE):
            print(f"[tv] No cert files found — pair via the TV tab first")
            return

        _ensure_tv_loop()

        async def _connect():
            global _tv_remote
            remote = AndroidTVRemote(
                client_name="BMO",
                certfile=_TV_CERTFILE,
                keyfile=_TV_KEYFILE,
                host=TV_IP,
            )
            await remote.async_connect()
            _tv_remote = remote
            print(f"[tv] Connected to TV at {TV_IP}")

        _tv_run(_connect())
    except ImportError:
        print("[tv] androidtvremote2 not installed — TV remote disabled")
    except Exception as e:
        print(f"[tv] Connection failed: {e} — try pairing via the TV tab")


@app.route("/api/tv/key", methods=["POST"])
def api_tv_key():
    data = request.json or {}
    key = data.get("key", "")
    mapped = TV_KEYS.get(key, key)
    if _tv_remote:
        try:
            _tv_remote.send_key_command(mapped)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    return jsonify({"error": "TV not connected — pair first"}), 503


@app.route("/api/tv/launch", methods=["POST"])
def api_tv_launch():
    data = request.json or {}
    app_name = data.get("app", "")
    url = TV_APPS.get(app_name, "")
    if not url:
        return jsonify({"error": f"Unknown app: {app_name}"}), 400
    if _tv_remote:
        try:
            _tv_remote.send_launch_app_command(url)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    return jsonify({"error": "TV not connected — pair first"}), 503


@app.route("/api/tv/power", methods=["POST"])
def api_tv_power():
    if _tv_remote:
        try:
            _tv_remote.send_key_command("POWER")
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    return jsonify({"error": "TV not connected — pair first"}), 503


@app.route("/api/tv/volume", methods=["POST"])
def api_tv_volume():
    data = request.json or {}
    direction = data.get("direction", "up")
    key_map = {"up": "VOLUME_UP", "down": "VOLUME_DOWN", "mute": "VOLUME_MUTE"}
    key = key_map.get(direction, "VOLUME_UP")
    if _tv_remote:
        try:
            _tv_remote.send_key_command(key)
            return jsonify({"ok": True})
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    return jsonify({"error": "TV not connected — pair first"}), 503


@app.route("/api/tv/status")
def api_tv_status():
    connected = _tv_remote is not None
    current_app = ""
    if _tv_remote:
        try:
            current_app = _tv_remote.current_app or ""
        except Exception:
            pass
    needs_pairing = not os.path.exists(_TV_CERTFILE)
    return jsonify({"connected": connected, "current_app": current_app, "needs_pairing": needs_pairing})


@app.route("/api/tv/pair/start", methods=["POST"])
def api_tv_pair_start():
    """Start pairing — this will make the TV show a PIN code."""
    global _tv_pairing_remote
    try:
        from androidtvremote2 import AndroidTVRemote

        _ensure_tv_loop()

        async def _start():
            global _tv_pairing_remote
            remote = AndroidTVRemote(
                client_name="BMO",
                certfile=_TV_CERTFILE,
                keyfile=_TV_KEYFILE,
                host=TV_IP,
            )
            await remote.async_generate_cert_if_missing()
            await remote.async_start_pairing()
            _tv_pairing_remote = remote

        _tv_run(_start())
        return jsonify({"ok": True, "message": "Check your TV for a PIN code"})
    except Exception as e:
        print(f"[tv] Pairing start failed: {e}")
        return jsonify({"error": str(e)}), 500


@app.route("/api/tv/pair/finish", methods=["POST"])
def api_tv_pair_finish():
    """Finish pairing with the PIN shown on TV, then connect."""
    global _tv_remote, _tv_pairing_remote
    data = request.json or {}
    pin = data.get("pin", "")
    if not pin:
        return jsonify({"error": "No PIN provided"}), 400
    if not _tv_pairing_remote:
        return jsonify({"error": "No pairing in progress — start pairing first"}), 400

    try:
        async def _finish():
            global _tv_remote, _tv_pairing_remote
            await _tv_pairing_remote.async_finish_pairing(pin)
            # Now connect for real
            await _tv_pairing_remote.async_connect()
            _tv_remote = _tv_pairing_remote
            _tv_pairing_remote = None

        _tv_run(_finish())
        print(f"[tv] Paired and connected to TV at {TV_IP}!")
        return jsonify({"ok": True, "message": "Paired and connected!"})
    except Exception as e:
        _tv_pairing_remote = None
        print(f"[tv] Pairing finish failed: {e}")
        return jsonify({"error": str(e)}), 500


# ── Camera API (REAL laptop webcam) ──────────────────────────────────

@app.route("/api/camera/stream")
def api_camera_stream():
    def generate():
        while True:
            with camera_lock:
                frame = latest_frame
            if frame is None:
                time.sleep(0.5)
                continue
            yield (b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + frame + b"\r\n")
            time.sleep(0.1)

    return Response(generate(), mimetype="multipart/x-mixed-replace; boundary=frame")


@app.route("/api/camera/snapshot", methods=["POST", "GET"])
def api_camera_snapshot():
    with camera_lock:
        frame = latest_frame
    if frame is None:
        return jsonify({"error": "No camera"}), 404
    download = request.args.get("download")
    if download:
        return Response(
            frame,
            mimetype="image/jpeg",
            headers={"Content-Disposition": f"attachment; filename=bmo_snap_{int(time.time())}.jpg"},
        )
    path = os.path.join(os.path.dirname(__file__), f"snapshot_{int(time.time())}.jpg")
    with open(path, "wb") as f:
        f.write(frame)
    return jsonify({"path": path})


@app.route("/api/camera/describe", methods=["POST"])
def api_camera_describe():
    return jsonify({"description": "BMO sees you, Gavin! (Vision model not running in test mode)"})


@app.route("/api/camera/faces")
def api_camera_faces():
    return jsonify([])


@app.route("/api/camera/objects")
def api_camera_objects():
    return jsonify([])


@app.route("/api/camera/motion", methods=["POST"])
def api_camera_motion():
    return jsonify({"ok": True})


# ── Timer API ────────────────────────────────────────────────────────

def _advance_repeating_alarm(alarm):
    """Calculate the next occurrence for a repeating alarm and update its target."""
    repeat = alarm.get("_repeat", "none")
    repeat_days = alarm.get("_repeat_days", [])
    target_dt = datetime.datetime.fromtimestamp(alarm["_target"])

    if repeat == "daily":
        target_dt += datetime.timedelta(days=1)
    elif repeat == "weekdays":
        target_dt += datetime.timedelta(days=1)
        while target_dt.weekday() >= 5:  # 5=Sat, 6=Sun
            target_dt += datetime.timedelta(days=1)
    elif repeat == "weekends":
        target_dt += datetime.timedelta(days=1)
        while target_dt.weekday() < 5:  # 0-4 = Mon-Fri
            target_dt += datetime.timedelta(days=1)
    elif repeat == "custom" and repeat_days:
        day_map = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}
        target_weekdays = {day_map[d] for d in repeat_days if d in day_map}
        if target_weekdays:
            target_dt += datetime.timedelta(days=1)
            for _ in range(7):
                if target_dt.weekday() in target_weekdays:
                    break
                target_dt += datetime.timedelta(days=1)
    else:
        return False  # Not a repeating alarm

    now = datetime.datetime.now()
    tomorrow = (now + datetime.timedelta(days=1)).date()
    alarm["_target"] = target_dt.timestamp()
    alarm["target_time"] = target_dt.strftime("%I:%M %p")
    if target_dt.date() > tomorrow:
        alarm["target_date"] = target_dt.strftime("%b %d")
    elif target_dt.date() == tomorrow:
        alarm["target_date"] = "Tomorrow"
    else:
        alarm["target_date"] = ""
    alarm["remaining"] = max(0, int(alarm["_target"] - time.time()))
    alarm["fired"] = False
    return True


@app.route("/api/timers")
def api_timers():
    now = time.time()
    for t in timers_list:
        if t.get("fired"):
            continue
        if t["type"] == "timer" and not t.get("paused") and t["remaining"] > 0:
            t["remaining"] = max(0, t["duration"] - int(now - t["_started"]))
            if t["remaining"] == 0:
                t["fired"] = True
                socketio.emit("timer_fired", {"id": t["id"], "label": t["label"], "message": f"Beep boop! {t['label']} is done!"})
        elif t["type"] == "alarm" and "_target" in t:
            t["remaining"] = max(0, int(t["_target"] - now))
            if t["remaining"] == 0:
                last_fired = t.get("_last_fired", 0)
                repeat = t.get("_repeat", "none")
                # Only emit if we haven't fired within the last 60s (prevent re-emit)
                if now - last_fired > 60:
                    t["_last_fired"] = now
                    socketio.emit("alarm_fired", {"id": t["id"], "label": t["label"], "message": f"Beep boop! {t['label']}!", "repeat": t.get("_repeat", "none")})

                    if repeat != "none":
                        # Repeating alarm — schedule next occurrence
                        _advance_repeating_alarm(t)
                    else:
                        # One-time alarm — mark as fired
                        t["fired"] = True
    return jsonify([{k: v for k, v in t.items() if not k.startswith("_")} for t in timers_list if not t.get("fired")])


@app.route("/api/timers/create", methods=["POST"])
def api_timer_create():
    data = request.json or {}
    secs = data.get("seconds", 300)
    timer = {
        "id": str(len(timers_list) + 1),
        "label": data.get("label", "Timer"),
        "duration": secs, "remaining": secs,
        "paused": False, "fired": False, "type": "timer",
        "_started": time.time(),
    }
    timers_list.append(timer)
    _save_timers()
    return jsonify({k: v for k, v in timer.items() if not k.startswith("_")})


@app.route("/api/timers/<tid>/cancel", methods=["POST"])
def api_timer_cancel(tid):
    timers_list[:] = [t for t in timers_list if t["id"] != tid]
    _save_timers()
    return jsonify({"ok": True})


@app.route("/api/timers/<tid>/pause", methods=["POST"])
def api_timer_pause(tid):
    for t in timers_list:
        if t["id"] == tid:
            t["paused"] = not t["paused"]
            if not t["paused"]:
                t["_started"] = time.time() - (t["duration"] - t["remaining"])
    return jsonify({"ok": True})


@app.route("/api/alarms/create", methods=["POST"])
def api_alarm_create():
    data = request.json or {}
    h, m = data.get("hour", 7), data.get("minute", 0)
    now = datetime.datetime.now()

    # If a specific date is provided, use it; otherwise default to today/tomorrow
    date_str = data.get("date", "")
    if date_str:
        try:
            target_date = datetime.datetime.strptime(date_str, "%Y-%m-%d")
            target = target_date.replace(hour=h, minute=m, second=0)
        except ValueError:
            target = now.replace(hour=h, minute=m, second=0)
            if target <= now:
                target += datetime.timedelta(days=1)
    else:
        target = now.replace(hour=h, minute=m, second=0)
        if target <= now:
            target += datetime.timedelta(days=1)

    repeat = data.get("repeat", "none")
    repeat_days = data.get("repeat_days", [])

    # Show date if alarm is beyond tomorrow
    tomorrow = (now + datetime.timedelta(days=1)).date()
    target_date_str = ""
    if target.date() > tomorrow:
        target_date_str = target.strftime("%b %d")
    elif target.date() == tomorrow:
        target_date_str = "Tomorrow"

    alarm = {
        "id": str(len(timers_list) + 1),
        "label": data.get("label", f"Alarm ({h}:{m:02d})"),
        "target_time": target.strftime("%I:%M %p"),
        "target_date": target_date_str,
        "remaining": int((target - now).total_seconds()),
        "fired": False, "snoozed": False, "type": "alarm",
        "repeat": repeat,
        "repeat_days": repeat_days,
        "_target": target.timestamp(),
        "_repeat": repeat,
        "_repeat_days": repeat_days,
        "_last_fired": 0,
    }
    timers_list.append(alarm)
    _save_timers()
    return jsonify({k: v for k, v in alarm.items() if not k.startswith("_")})


@app.route("/api/alarms/<aid>/cancel", methods=["POST"])
def api_alarm_cancel(aid):
    timers_list[:] = [t for t in timers_list if t["id"] != aid]
    _save_timers()
    return jsonify({"ok": True})


@app.route("/api/alarms/<aid>/snooze", methods=["POST"])
def api_alarm_snooze(aid):
    return jsonify({"ok": True})


# ── Weather API (REAL Open-Meteo) ────────────────────────────────────

@app.route("/api/weather")
def api_weather():
    return jsonify(weather_data or MOCK_WEATHER)


# ── Config ───────────────────────────────────────────────────────────

GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")


@app.route("/api/config")
def api_config():
    """Expose non-secret config to the frontend."""
    return jsonify({"maps_api_key": GOOGLE_MAPS_API_KEY})


# ── Devices ──────────────────────────────────────────────────────────

@app.route("/api/devices")
def api_devices():
    return jsonify([
        {"name": "Living Room TV", "model": "Chromecast", "status": "idle"},
        {"name": "Gavin's Nest Mini", "model": "Google Nest Mini", "status": "idle"},
    ])


# ── WebSocket ────────────────────────────────────────────────────────

@socketio.on("connect")
def on_connect():
    socketio.emit("weather_update", weather_data or MOCK_WEATHER)
    if player:
        socketio.emit("music_state", player.get_state())
    else:
        socketio.emit("music_state", {
            "song": None, "is_playing": False, "position": 0, "duration": 0,
            "volume": 50, "output_device": "default", "queue": [],
            "queue_length": 0, "queue_index": -1, "shuffle": False, "repeat": "off",
        })
    socketio.emit("timers_tick", [])
    # Use cache for instant next_event — don't block on Google API
    cached = cal_cache.get_events()
    if cached:
        socketio.emit("next_event", cached[0])
    elif not calendar_service:
        socketio.emit("next_event", MOCK_EVENTS[0])


@socketio.on("chat_message")
def on_chat_message(data):
    msg = data.get("message", "")
    text = f"BMO heard you say: \"{msg}\"! BMO is in test mode — no Ollama right now!"
    socketio.emit("chat_response", {"text": text, "speaker": "gavin", "commands_executed": []})


# ── Main ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print()
    print("  ================================")
    print("  BMO UI Test — Real Services")
    print("  ================================")
    print()

    # Init real services
    fetch_real_weather()
    init_calendar()
    init_camera()
    init_tv_remote()

    # Pre-cache thumbnails + audio for offline history
    if player and player.history:
        threading.Thread(
            target=cache_thumbnails_for_history, args=(player.history,), daemon=True
        ).start()
        threading.Thread(
            target=_download_audio_for_history, args=(player.history,), daemon=True
        ).start()

    real = []
    mock = []
    (real if weather_data else mock).append("Weather")
    (real if calendar_service else mock).append("Calendar")
    (real if camera else mock).append("Camera")
    real.append("YT Music Search")
    (real if player else mock).append("Music Playback (VLC)")
    mock.append("Chat (no Ollama)")
    mock.append("Smart Home")

    print(f"  REAL: {', '.join(real)}")
    print(f"  MOCK: {', '.join(mock)}")
    print()
    print("  Open: http://localhost:5000")
    print("  Tip: Resize browser to 800x480")
    print()

    socketio.run(app, host="0.0.0.0", port=5000, debug=True, use_reloader=False, allow_unsafe_werkzeug=True)
