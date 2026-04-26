"""BMO Music Service — YouTube Music search + yt-dlp streaming + VLC/Chromecast playback."""

import json
import os
import threading
import time

import vlc
from ytmusicapi import YTMusic

from services.bmo_logging import get_logger
log = get_logger("music_service")

STREAM_URL_TTL = 18000  # 5 hours — re-extract before expiry
HISTORY_FILE = os.path.expanduser("~/home-lab/bmo/pi/data/music_history.json")
PLAY_COUNTS_FILE = os.path.expanduser("~/home-lab/bmo/pi/data/play_counts.json")
PLAYBACK_STATE_FILE = os.path.expanduser("~/home-lab/bmo/pi/data/playback_state.json")
MAX_HISTORY = 100

# Valid output device names
OUTPUT_PI = "pi"       # Local VLC playback through Pi speakers / any Pi sink
OUTPUT_TV = "tv"       # Chromecast to TV


class MusicService:
    """Manages music search, queue, and playback (local VLC + Chromecast)."""

    def __init__(self, smart_home=None, socketio=None, audio_service=None):
        self.smart_home = smart_home
        self.socketio = socketio
        self._audio_service = audio_service

        # YT Music search
        self._ytmusic = YTMusic()

        # VLC player
        self._vlc_instance = vlc.Instance("--no-video", "--quiet")
        self._player = self._vlc_instance.media_player_new()

        # Playback state
        self.queue: list[dict] = []
        self.queue_index: int = -1
        self.current_song: dict | None = None
        self._output_device: str = OUTPUT_PI
        self.shuffle: bool = False
        self.repeat: str = "off"  # "off", "all", "one"
        self.autoplay: bool = True  # When queue ends, play related songs
        self._volume: int = 50  # Cached volume level
        self._playback_state_save_interval_sec: float = 5.0
        self._last_playback_state_save_ts: float = 0.0
        self._playback_intent: str | None = None  # "playing" | "paused" | None

        # Auto-advance thread
        self._monitor_thread = None
        self._running = False

        # Pre-fetched next URL
        self._prefetch_url: str | None = None
        self._prefetch_index: int = -1

        # Play history
        self.history: list[dict] = []
        self.play_counts: dict[str, int] = {}
        self._load_play_counts()
        self._load_history()

        # Restore playback state from last session (deferred until after init)
        self._pending_restore = self._load_playback_state()

    def restore_playback(self):
        """Resume playback from saved state. Call after all services are ready."""
        state = self._pending_restore
        self._pending_restore = None
        if not state:
            return
        try:
            queue = state.get("queue", [])
            index = state.get("queue_index", 0)
            if not queue or index < 0 or index >= len(queue):
                return
            self.shuffle = state.get("shuffle", False)
            self.repeat = state.get("repeat", "off")
            self.autoplay = state.get("autoplay", True)
            self.queue = queue
            self.queue_index = index
            was_paused = state.get("was_paused", False)
            was_playing = state.get("was_playing")
            if was_playing is None:
                # Backward-compat: legacy state only had was_paused.
                was_playing = not was_paused
            position_sec = float(state.get("position_sec", 0.0) or 0.0)
            song = queue[index]
            status = "paused" if was_paused else "playing"
            log.info(f"[music] Restoring ({status}): {song.get('title', '?')} + {len(queue) - index - 1} queued")
            self.play(song, add_to_queue=False)
            if position_sec > 0:
                # Ensure we don't seek past the known duration.
                duration_sec = float(song.get("duration_sec", 0.0) or 0.0)
                if duration_sec > 2:
                    position_sec = min(position_sec, max(0.0, duration_sec - 1.0))
                self._restore_seek_position(position_sec)
            if was_paused or not was_playing:
                self._force_pause_after_restore()
                self._playback_intent = "paused"
            else:
                self._playback_intent = "playing"
            self._save_playback_state()
        except Exception as e:
            log.exception(f"[music] Restore playback failed")

    def _restore_seek_position(self, position_sec: float):
        """Seek during restore after allowing media a brief moment to initialize."""
        if position_sec <= 0:
            return
        if self._output_device == OUTPUT_PI:
            # VLC may ignore early seeks while media is opening; retry until media is seekable.
            target_ms = int(position_sec * 1000)
            deadline = time.time() + 15.0
            while time.time() < deadline:
                state = self._player.get_state()
                if state in (vlc.State.Ended, vlc.State.Error, vlc.State.Stopped):
                    break
                media_len_ms = max(0, self._player.get_length())
                if media_len_ms <= 0:
                    time.sleep(0.25)
                    continue
                self._player.set_time(target_ms)
                time.sleep(0.25)
                cur_ms = max(0, self._player.get_time())
                if cur_ms >= max(0, target_ms - 2500):
                    break
        elif self._output_device == OUTPUT_TV:
            self._cast_seek(position_sec)
        self._emit_state()

    def _force_pause_after_restore(self):
        """Pause without toggle ambiguity so paused sessions remain paused after restore."""
        if self._output_device == OUTPUT_PI:
            # VLC can ignore an early pause while media is still opening.
            deadline = time.time() + 15.0
            while time.time() < deadline:
                self._player.set_pause(1)
                time.sleep(0.15)
                state = self._player.get_state()
                if state == vlc.State.Paused:
                    break
                if state in (vlc.State.Ended, vlc.State.Error, vlc.State.Stopped):
                    break
        elif self._output_device == OUTPUT_TV:
            # Give cast a couple retries because transport can race startup.
            for _ in range(3):
                self._cast_pause()
                time.sleep(0.2)
        self._emit_state()

    # ── Output Device Property ───────────────────────────────────────

    @property
    def output_device(self) -> str:
        return self._output_device

    @output_device.setter
    def output_device(self, value: str):
        """Validate and set the output device."""
        valid = {OUTPUT_PI, OUTPUT_TV}
        if value not in valid:
            log.info(f"[music] Invalid output device '{value}', keeping '{self._output_device}'")
            return
        self._output_device = value

    # ── Search ───────────────────────────────────────────────────────

    def search(self, query: str, limit: int = 20) -> list[dict]:
        """Search YouTube Music for songs."""
        results = self._ytmusic.search(query, filter="songs", limit=limit)
        return [self._format_result(r) for r in results if r.get("videoId")]

    @staticmethod
    def _format_result(item: dict) -> dict:
        artists = ", ".join(a["name"] for a in item.get("artists", []))
        thumbnails = item.get("thumbnails", [])
        thumbnail = thumbnails[-1]["url"] if thumbnails else ""
        return {
            "videoId": item["videoId"],
            "title": item.get("title", "Unknown"),
            "artist": artists,
            "album": item.get("album", {}).get("name", "") if item.get("album") else "",
            "duration": item.get("duration", ""),
            "thumbnail": thumbnail,
        }

    # ── Stream URL Extraction ────────────────────────────────────────

    @staticmethod
    def get_audio_stream_url(video_id: str) -> tuple[str, int]:
        """Extract the direct audio stream URL for a YouTube Music track. Returns (url, duration_sec)."""
        import yt_dlp

        opts = {
            "format": "bestaudio[ext=m4a]/bestaudio",
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(
                f"https://music.youtube.com/watch?v={video_id}", download=False
            )
            return info["url"], info.get("duration", 0)

    # ── Playback Control ─────────────────────────────────────────────

    def play(self, song: dict | None = None, add_to_queue: bool = True):
        """Play a song. If song is None, resume current playback."""
        log.info(f"[music] play() called — song={song.get('title') if song else None}, add_to_queue={add_to_queue}")
        if song is None:
            # Resume
            if self._output_device == OUTPUT_PI:
                self._player.play()
            elif self._output_device == OUTPUT_TV:
                self._cast_play()
            self._playback_intent = "playing"
            self._save_playback_state()
            self._emit_state()
            return

        if add_to_queue:
            # Clear queue and start fresh, or append
            if self.queue_index == -1:
                self.queue = [song]
                self.queue_index = 0
            else:
                self.queue.append(song)
                self.queue_index = len(self.queue) - 1

        # Get stream URL BEFORE setting current_song so GUI stays accurate
        url, duration = self.get_audio_stream_url(song["videoId"])
        song["stream_url"] = url
        song["duration_sec"] = duration

        # NOW set current_song — VLC is about to start
        self.current_song = song

        if self._output_device == OUTPUT_PI:
            media = self._vlc_instance.media_new(url)
            self._player.set_media(media)
            self._player.play()
        elif self._output_device == OUTPUT_TV:
            self._cast_play_media(song)

        self._playback_intent = "playing"
        self._record_play(song)
        self._start_monitor()
        self._prefetch_next()
        self._save_playback_state()
        self._emit_state()

    def play_queue(self, songs: list[dict]):
        """Replace the queue and start playing from the beginning."""
        self.queue = songs
        self.queue_index = 0
        if songs:
            self.play(songs[0], add_to_queue=False)

    def pause(self):
        """Toggle pause/resume."""
        if self._output_device == OUTPUT_PI:
            state_before = self._player.get_state()
            is_paused = state_before == vlc.State.Paused or self._playback_intent == "paused"
            if is_paused:
                # Resume explicitly; plain play() is more reliable across VLC states.
                self._player.play()
                self._playback_intent = "playing"
            else:
                # Pause explicitly so intent is deterministic even if VLC state lags.
                self._player.set_pause(1)
                self._playback_intent = "paused"
        elif self._output_device == OUTPUT_TV:
            if self._playback_intent == "paused":
                self._cast_play()
                self._playback_intent = "playing"
            else:
                self._cast_pause()
                self._playback_intent = "paused"
        self._save_playback_state()
        self._emit_state()

    def pause_only(self):
        """Force paused state (no toggle)."""
        if self._output_device == OUTPUT_PI:
            self._player.set_pause(1)
        elif self._output_device == OUTPUT_TV:
            self._cast_pause()
        self._playback_intent = "paused"
        self._save_playback_state()
        self._emit_state()

    def stop(self):
        """Stop playback on the current output device."""
        self._stop_current_device()
        self.current_song = None
        self._playback_intent = None
        self._clear_playback_state()
        self._emit_state()

    def _stop_current_device(self):
        """Stop playback on whatever device is currently active, without clearing song state."""
        if self._output_device == OUTPUT_PI:
            self._player.stop()
        elif self._output_device == OUTPUT_TV:
            self._cast_stop()

    def next_track(self):
        """Skip to next track in queue."""
        log.info(f"[music] next_track() called — queue_index={self.queue_index}, queue_len={len(self.queue)}, repeat={self.repeat}, autoplay={self.autoplay}")
        if not self.queue:
            return

        if self.shuffle:
            import random
            self.queue_index = random.randint(0, len(self.queue) - 1)
        else:
            self.queue_index += 1

        if self.queue_index >= len(self.queue):
            if self.repeat == "all":
                self.queue_index = 0
            elif self.autoplay:
                self._autoplay_related()
                return
            else:
                self.stop()
                return

        self.play(self.queue[self.queue_index], add_to_queue=False)

    def _autoplay_related(self):
        """Fetch related songs based on listening history and queue them."""
        try:
            # Use the last played song to seed the radio
            seed_id = None
            if self.current_song:
                seed_id = self.current_song.get("videoId")
            elif self.history:
                seed_id = self.history[0].get("song", {}).get("videoId")

            if not seed_id:
                log.info("[music] Autoplay: no seed song, stopping")
                self.stop()
                return

            log.info(f"[music] Autoplay: fetching related songs for {seed_id}")
            watch = self._ytmusic.get_watch_playlist(seed_id, limit=10)
            tracks = watch.get("tracks", [])

            # Skip the first track (it's the seed song)
            related = []
            for t in tracks:
                vid = t.get("videoId")
                if not vid or vid == seed_id:
                    continue
                artists = ", ".join(a["name"] for a in t.get("artists", []))
                thumbnails = t.get("thumbnail", [])
                if isinstance(thumbnails, list):
                    thumb = thumbnails[-1].get("url", "") if thumbnails else ""
                elif isinstance(thumbnails, dict):
                    thumb_list = thumbnails.get("thumbnails", [])
                    thumb = thumb_list[-1].get("url", "") if thumb_list else ""
                else:
                    thumb = ""
                related.append({
                    "videoId": vid,
                    "title": t.get("title", "Unknown"),
                    "artist": artists,
                    "duration": t.get("length", t.get("duration", "")),
                    "thumbnail": thumb,
                })

            if not related:
                log.info("[music] Autoplay: no related songs found, stopping")
                self.stop()
                return

            # Add related songs to queue and play the first one
            log.info(f"[music] Autoplay: queued {len(related)} related songs")
            self.queue.extend(related)
            self.queue_index = len(self.queue) - len(related)
            self.play(self.queue[self.queue_index], add_to_queue=False)
        except Exception as e:
            log.exception(f"[music] Autoplay failed")
            self.stop()

    def previous_track(self):
        """Go to previous track in queue."""
        if not self.queue:
            return
        self.queue_index = max(0, self.queue_index - 1)
        self.play(self.queue[self.queue_index], add_to_queue=False)

    def seek(self, position_sec: float):
        """Seek to a position in seconds."""
        if self._output_device == OUTPUT_PI:
            self._player.set_time(int(position_sec * 1000))
        elif self._output_device == OUTPUT_TV:
            self._cast_seek(position_sec)
        self._save_playback_state()
        self._emit_state()

    def set_volume(self, volume: int):
        """Set volume (0-100)."""
        volume = max(0, min(100, int(volume)))
        self._volume = volume
        if self._output_device == OUTPUT_PI:
            self._player.audio_set_volume(volume)
        elif self._output_device == OUTPUT_TV:
            if self.smart_home:
                self.smart_home.set_volume(self._output_device, volume / 100.0)

    # ── Output Device ────────────────────────────────────────────────

    def set_output_device(self, device: str):
        """Switch output between 'pi', 'tv', or a PipeWire sink ID (e.g. '83').

        Stops playback on the current device. If a song was playing,
        resumes it on the new device automatically.
        """
        if device == self._output_device:
            return

        # Accept 'pi', 'tv', or a numeric PipeWire sink ID
        if device not in {OUTPUT_PI, OUTPUT_TV} and not device.isdigit():
            log.info(f"[music] Invalid device '{device}', ignoring")
            return

        # If a numeric sink ID, set it as default PipeWire sink and use Pi playback
        if device.isdigit() and self._audio_service:
            self._audio_service.set_default_output(int(device))
            device = OUTPUT_PI

        was_playing = self.current_song is not None
        song_to_resume = self.current_song

        # Stop playback on the OLD device without clearing current_song
        self._stop_current_device()

        old_device = self._output_device
        self._output_device = device
        log.info(f"[music] Output switched: {old_device} → {device}")

        # Resume on the new device if something was playing
        if was_playing and song_to_resume:
            self.current_song = song_to_resume
            self.play(song_to_resume, add_to_queue=False)
        else:
            self._emit_state()

    def get_devices(self) -> list[dict]:
        """List non-Pi output devices (Chromecast/TV only if discovered)."""
        devices = []
        if self.smart_home and self.smart_home.get_devices():
            devices.append({"name": OUTPUT_TV, "label": "TV (Chromecast)", "is_default": False, "type": "tv"})
        return devices

    # ── State ────────────────────────────────────────────────────────

    def get_state(self) -> dict:
        """Get current playback state."""
        position = 0
        duration = 0
        is_playing = False

        if self._output_device == OUTPUT_PI:
            state = self._player.get_state()
            is_playing = state == vlc.State.Playing
            position = max(0, self._player.get_time()) / 1000
            duration = max(0, self._player.get_length()) / 1000
            if duration == 0 and self.current_song:
                duration = self.current_song.get("duration_sec", 0)
            if self._playback_intent == "paused":
                is_playing = False
            elif self._playback_intent == "playing" and self.current_song:
                is_playing = True
        elif self._output_device == OUTPUT_TV:
            cast = self._get_tv_cast()
            if cast and cast.media_controller and cast.media_controller.status:
                status = cast.media_controller.status
                player_state = (status.player_state or "").upper()
                is_playing = player_state == "PLAYING"
                if player_state == "PAUSED":
                    is_playing = False
                position = float(status.current_time or 0.0)
                if self.current_song:
                    duration = self.current_song.get("duration_sec", 0)
            else:
                is_playing = self.current_song is not None and self._playback_intent != "paused"
                if self.current_song:
                    duration = self.current_song.get("duration_sec", 0)

        state_dict = {
            "song": self.current_song,
            "is_playing": is_playing,
            "position": round(position, 1),
            "duration": round(duration, 1),
            "volume": self._volume,
            "output_device": self._output_device,
            "queue_length": len(self.queue),
            "queue_index": self.queue_index,
            "shuffle": self.shuffle,
            "repeat": self.repeat,
            "autoplay": self.autoplay,
        }

        return state_dict

    # ── Chromecast Helpers ───────────────────────────────────────────

    def _get_tv_cast(self):
        """Resolve the 'tv' output device to a PyChromecast instance.

        Uses the first discovered Chromecast device. Returns None if
        smart_home is unavailable or no devices have been discovered.
        """
        if not self.smart_home:
            return None
        devices = self.smart_home.get_devices()
        if not devices:
            log.info("[music] No Chromecast devices found for TV output")
            return None
        return self.smart_home.get_cast(devices[0]["name"])

    def _cast_play_media(self, song: dict):
        cast = self._get_tv_cast()
        if cast:
            mc = cast.media_controller
            mc.play_media(
                song["stream_url"],
                "audio/mp4",
                title=song.get("title", ""),
                thumb=song.get("thumbnail", ""),
            )
            mc.block_until_active(timeout=10)

    def _cast_play(self):
        cast = self._get_tv_cast()
        if cast:
            cast.media_controller.play()

    def _cast_pause(self):
        cast = self._get_tv_cast()
        if cast:
            cast.media_controller.pause()

    def _cast_stop(self):
        cast = self._get_tv_cast()
        if cast:
            cast.media_controller.stop()

    def _cast_seek(self, position_sec: float):
        cast = self._get_tv_cast()
        if cast:
            cast.media_controller.seek(position_sec)

    # ── Auto-Advance Monitor ────────────────────────────────────────

    def _start_monitor(self):
        if self._running:
            return
        self._running = True
        self._monitor_thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._monitor_thread.start()

    def _monitor_loop(self):
        """Watch for track end and auto-advance."""
        has_played = False  # Track if VLC actually started playing
        last_state = None
        while self._running:
            if self._output_device == OUTPUT_PI:
                state = self._player.get_state()
                if self._playback_intent == "paused" and state == vlc.State.Playing:
                    self._player.set_pause(1)
                    state = self._player.get_state()
                if state != last_state:
                    log.info(f"[music][monitor] VLC state: {last_state} → {state} (has_played={has_played})")
                    last_state = state
                if state == vlc.State.Playing:
                    has_played = True
                elif state == vlc.State.Error:
                    log.warning("[music][monitor] VLC error — stopping")
                    has_played = False
                    self.current_song = None
                    self._emit_state()
                elif state == vlc.State.Ended and has_played:
                    has_played = False  # Reset for next track
                    log.info("[music][monitor] Track ended — advancing")
                    if self.repeat == "one":
                        self.play(self.current_song, add_to_queue=False)
                    else:
                        self.next_track()
                now = time.time()
                if (
                    self.current_song
                    and state in (vlc.State.Playing, vlc.State.Paused)
                    and now - self._last_playback_state_save_ts >= self._playback_state_save_interval_sec
                ):
                    self._save_playback_state()
                    self._last_playback_state_save_ts = now
            elif self._output_device == OUTPUT_TV:
                now = time.time()
                if (
                    self.current_song
                    and now - self._last_playback_state_save_ts >= self._playback_state_save_interval_sec
                ):
                    self._save_playback_state()
                    self._last_playback_state_save_ts = now
            # TV auto-advance is handled by Chromecast media controller
            time.sleep(1)

    def _prefetch_next(self):
        """Pre-fetch the next song's stream URL in a background thread."""
        next_idx = self.queue_index + 1
        if next_idx >= len(self.queue):
            return

        def _fetch():
            try:
                song = self.queue[next_idx]
                url, dur = self.get_audio_stream_url(song["videoId"])
                song["stream_url"] = url
                song["duration_sec"] = dur
                self._prefetch_url = url
                self._prefetch_index = next_idx
            except Exception:
                pass

        threading.Thread(target=_fetch, daemon=True).start()

    # ── Queue Management ─────────────────────────────────────────────

    def add_to_queue(self, song: dict):
        """Append a song to the queue without disrupting playback."""
        clean = {k: v for k, v in song.items() if not k.startswith("_")}
        self.queue.append(clean)
        self._emit_state()

    def remove_from_queue(self, index: int) -> bool:
        """Remove a song from the queue by visible index (relative to current)."""
        real_index = index + max(0, self.queue_index)
        if real_index == self.queue_index:
            return False  # Can't remove currently playing
        if 0 <= real_index < len(self.queue):
            self.queue.pop(real_index)
            if real_index < self.queue_index:
                self.queue_index -= 1
            self._emit_state()
            return True
        return False

    def get_queue(self) -> dict:
        """Return the visible queue (current + upcoming)."""
        visible = self.queue[self.queue_index:] if self.queue_index >= 0 else self.queue
        clean = [{k: v for k, v in s.items() if not k.startswith("_")} for s in visible]
        return {"queue": clean, "queue_index": 0}

    # ── History ──────────────────────────────────────────────────────

    def _load_history(self):
        try:
            if os.path.exists(HISTORY_FILE):
                with open(HISTORY_FILE, "r") as f:
                    raw = json.load(f)[:MAX_HISTORY]
                # Deduplicate on load (keep first occurrence = most recent)
                seen = set()
                deduped = []
                for entry in raw:
                    vid = entry.get("song", {}).get("videoId", "")
                    if vid and vid in seen:
                        continue
                    if vid:
                        seen.add(vid)
                    deduped.append(entry)
                self.history = deduped
                if len(deduped) < len(raw):
                    log.info(f"[music] Deduped history: {len(raw)} → {len(deduped)}")
                    self._save_history()
                log.info(f"[music] Loaded {len(self.history)} history entries")
        except Exception as e:
            log.exception(f"[music] Failed to load history")
            self.history = []

    def _save_history(self):
        try:
            os.makedirs(os.path.dirname(HISTORY_FILE), exist_ok=True)
            with open(HISTORY_FILE, "w") as f:
                json.dump(self.history[:MAX_HISTORY], f)
        except Exception as e:
            log.exception(f"[music] Failed to save history")

    def _load_play_counts(self):
        try:
            if os.path.exists(PLAY_COUNTS_FILE):
                with open(PLAY_COUNTS_FILE, "r") as f:
                    self.play_counts = json.load(f)
                log.info(f"[music] Loaded {len(self.play_counts)} play counts")
        except Exception as e:
            log.exception(f"[music] Failed to load play counts")
            self.play_counts = {}

    def _save_play_counts(self):
        try:
            os.makedirs(os.path.dirname(PLAY_COUNTS_FILE), exist_ok=True)
            with open(PLAY_COUNTS_FILE, "w") as f:
                json.dump(self.play_counts, f)
        except Exception as e:
            log.exception(f"[music] Failed to save play counts")

    def _save_playback_state(self):
        """Persist current queue + position so playback survives restarts."""
        try:
            # Strip stream URLs (they expire) — will re-extract on restore
            clean_queue = []
            for s in self.queue:
                clean = {k: v for k, v in s.items() if k != "stream_url"}
                clean_queue.append(clean)
            position_sec = 0.0
            is_playing = False
            is_paused = False
            if self._output_device == OUTPUT_PI:
                state = self._player.get_state()
                is_playing = state == vlc.State.Playing
                is_paused = state == vlc.State.Paused
                position_sec = max(0, self._player.get_time()) / 1000
            elif self._output_device == OUTPUT_TV:
                # Best-effort state/position for cast playback.
                cast = self._get_tv_cast()
                if cast and cast.media_controller and cast.media_controller.status:
                    status = cast.media_controller.status
                    player_state = (status.player_state or "").upper()
                    is_playing = player_state == "PLAYING"
                    is_paused = player_state == "PAUSED"
                    position_sec = float(status.current_time or 0.0)
                elif self.current_song:
                    # Fallback when cast status isn't available yet.
                    is_playing = True
            if self._playback_intent == "paused":
                is_paused = True
                is_playing = False
            elif self._playback_intent == "playing" and self.current_song:
                is_playing = True
                is_paused = False
            state = {
                "queue": clean_queue,
                "queue_index": self.queue_index,
                "shuffle": self.shuffle,
                "repeat": self.repeat,
                "autoplay": self.autoplay,
                "was_playing": is_playing,
                "was_paused": is_paused,
                "position_sec": round(max(0.0, position_sec), 1),
                "saved_at": time.time(),
            }
            os.makedirs(os.path.dirname(PLAYBACK_STATE_FILE), exist_ok=True)
            with open(PLAYBACK_STATE_FILE, "w") as f:
                json.dump(state, f)
        except Exception as e:
            log.exception(f"[music] Failed to save playback state")

    def _load_playback_state(self) -> dict | None:
        """Load saved playback state from disk."""
        try:
            if os.path.exists(PLAYBACK_STATE_FILE):
                with open(PLAYBACK_STATE_FILE, "r") as f:
                    state = json.load(f)
                if state.get("queue"):
                    log.info(f"[music] Found saved playback state: {len(state['queue'])} tracks")
                    return state
        except Exception as e:
            log.exception(f"[music] Failed to load playback state")
        return None

    def _clear_playback_state(self):
        """Remove saved state file (called on explicit stop)."""
        try:
            if os.path.exists(PLAYBACK_STATE_FILE):
                os.remove(PLAYBACK_STATE_FILE)
        except Exception:
            pass

    def _record_play(self, song: dict):
        """Record a song play in history (deduplicated — most recent play only)."""
        clean = {k: v for k, v in song.items() if not k.startswith("_") and k != "stream_url"}
        vid = clean.get("videoId")
        # Remove any existing entry for this song
        if vid:
            self.history = [e for e in self.history if e.get("song", {}).get("videoId") != vid]
            self.play_counts[vid] = self.play_counts.get(vid, 0) + 1
            self._save_play_counts()
        self.history.insert(0, {"song": clean, "played_at": time.time()})
        if len(self.history) > MAX_HISTORY:
            self.history = self.history[:MAX_HISTORY]
        self._save_history()

    def get_history(self) -> list[dict]:
        """Return play history."""
        return self.history

    def get_most_played(self) -> list[dict]:
        """Return top songs by play count (only songs played 2+ times)."""
        if not self.play_counts or not self.history:
            return []
        # Build a map of videoId → song info from history
        song_map: dict[str, dict] = {}
        for entry in self.history:
            vid = entry.get("song", {}).get("videoId", "")
            if vid and vid not in song_map:
                song_map[vid] = entry["song"]
        # Only include songs played more than once — otherwise it's just "recent" again
        ranked = sorted(
            [(vid, count) for vid, count in self.play_counts.items() if vid in song_map and count >= 2],
            key=lambda x: x[1],
            reverse=True,
        )
        return [song_map[vid] for vid, _ in ranked[:4]]

    # ── Album / Playlist / Lyrics ────────────────────────────────────

    def get_album(self, browse_id: str) -> dict:
        """Get album tracks via ytmusic."""
        album = self._ytmusic.get_album(browse_id)
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
        return {
            "title": album.get("title", ""),
            "artist": album.get("artists", [{}])[0].get("name", "") if album.get("artists") else "",
            "thumbnail": album.get("thumbnails", [{}])[-1].get("url", ""),
            "year": album.get("year", ""),
            "tracks": tracks,
        }

    def get_playlist(self, browse_id: str) -> dict:
        """Get playlist tracks via ytmusic."""
        pl = self._ytmusic.get_playlist(browse_id, limit=100)
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
        return {
            "title": pl.get("title", ""),
            "artist": pl.get("author", {}).get("name", "") if pl.get("author") else "",
            "thumbnail": pl.get("thumbnails", [{}])[-1].get("url", ""),
            "year": pl.get("year", ""),
            "trackCount": pl.get("trackCount", len(tracks)),
            "tracks": tracks,
        }

    def search_playlists(self, query: str) -> list[dict]:
        """Search for community playlists."""
        results = self._ytmusic.search(query, filter="community_playlists", limit=20)
        formatted = []
        for r in results:
            browse_id = r.get("browseId") or r.get("playlistId")
            if not browse_id:
                continue
            if not browse_id.startswith("VL") and r.get("playlistId"):
                browse_id = "VL" + r["playlistId"]
            formatted.append({
                "browseId": browse_id,
                "title": r.get("title", ""),
                "author": r.get("author", ""),
                "itemCount": r.get("itemCount", ""),
                "thumbnail": r.get("thumbnails", [{}])[-1].get("url", ""),
            })
        return formatted

    def get_lyrics(self, video_id: str) -> dict:
        """Get lyrics for a track."""
        watch = self._ytmusic.get_watch_playlist(video_id)
        lyrics_browse_id = watch.get("lyrics")
        if not lyrics_browse_id:
            return {"lyrics": None, "error": "No lyrics available"}
        lyrics_data = self._ytmusic.get_lyrics(lyrics_browse_id)
        return {
            "lyrics": lyrics_data.get("lyrics", ""),
            "source": lyrics_data.get("source", ""),
        }

    # ── Helpers ──────────────────────────────────────────────────────

    def _emit_state(self):
        if self.socketio:
            self.socketio.emit("music_state", self.get_state())
