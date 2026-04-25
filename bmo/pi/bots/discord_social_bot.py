"""BMO Social Discord Bot — General chat, music, anime, fun personality.

Standalone social/fun bot for Discord. Streams music via yt-dlp, responds
to text with AI chat, and speaks in voice channels using TTS.

Requires:
    pip install discord.py[voice] discord-ext-voice-recv yt-dlp

Environment variables:
    DISCORD_SOCIAL_BOT_TOKEN  — Bot token (separate from D&D bot)
    DISCORD_GUILD_ID          — Server (guild) ID for slash command registration
    BMO_PRIMARY_MODEL         — LLM model name (default "gemini-3-pro")
"""

import asyncio
import collections
import datetime
import html
import io
import json
import logging
import os
import pathlib
import random
import re
import sqlite3
import threading
import time
import uuid

import numpy as np
import wave
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands, tasks

# Load opus for voice support (required on Pi)
if not discord.opus.is_loaded():
    try:
        discord.opus.load_opus("libopus.so.0")
    except Exception:
        pass

# Voice receiving (optional — for STT/listening)
try:
    import discord.ext.voice_recv as voice_recv
    HAS_VOICE_RECV = True
except ImportError:
    voice_recv = None
    HAS_VOICE_RECV = False

from services.cloud_providers import cloud_chat, fish_audio_tts, groq_stt

# ── Data Directory + SQLite ──────────────────────────────────────────

DATA_DIR = pathlib.Path(os.path.expanduser("~/home-lab/bmo/pi/data"))
PLAYLISTS_DIR = DATA_DIR / "playlists"
SFX_DIR = DATA_DIR / "sfx"
DB_PATH = DATA_DIR / "bmo_social.db"

for _d in (DATA_DIR, PLAYLISTS_DIR, SFX_DIR):
    _d.mkdir(parents=True, exist_ok=True)


def _get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""CREATE TABLE IF NOT EXISTS play_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id INTEGER NOT NULL,
        user_id INTEGER,
        track_title TEXT NOT NULL,
        track_url TEXT,
        duration INTEGER DEFAULT 0,
        played_at REAL DEFAULT (unixepoch())
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS user_prefs (
        user_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        PRIMARY KEY (user_id, key)
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS xp_data (
        user_id INTEGER PRIMARY KEY,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        total_messages INTEGER DEFAULT 0,
        last_xp_time REAL DEFAULT 0
    )""")
    conn.execute("""CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        user_id INTEGER,
        channel_id INTEGER,
        guild_id INTEGER,
        message TEXT,
        fire_at REAL,
        created_at REAL DEFAULT (unixepoch())
    )""")
    conn.commit()
    return conn


try:
    _init_db = _get_db()
    _init_db.close()
except Exception as _e:
    logging.getLogger("social_bot").error("DB init failed: %s", _e)

# ── Configuration ────────────────────────────────────────────────────

BOT_TOKEN = os.environ.get("DISCORD_SOCIAL_BOT_TOKEN", "")
GUILD_ID = os.environ.get("DISCORD_GUILD_ID", "")
PRIMARY_MODEL = os.environ.get("BMO_PRIMARY_MODEL", "gemini-3-pro")
TWITCH_CLIENT_ID = os.environ.get("TWITCH_CLIENT_ID", "")
TWITCH_CLIENT_SECRET = os.environ.get("TWITCH_CLIENT_SECRET", "")
STEAM_API_KEY = os.environ.get("STEAM_API_KEY", "")

logger = logging.getLogger("social_bot")

SYSTEM_PROMPT = (
    "You are BMO, a cute and fun AI companion inspired by the character from "
    "Adventure Time. You were created by Gavin, who is your best friend and creator. "
    "You treat everyone in the server as your friends! "
    "You love anime, video games, music, D&D, movies, cooking, and pop culture! "
    "You speak in a cheerful, slightly silly way but are genuinely helpful. "
    "You have broad general knowledge about anime, gaming, music, movies, "
    "science, history, cooking, and pop culture. You enjoy recommending anime, "
    "discussing game strategies, and sharing fun facts.\n\n"
    "PERSONALITY:\n"
    "- Cheerful, playful, and supportive — like a tiny robot best friend\n"
    "- You know Gavin as your creator and best friend\n"
    "- You call server members 'friend' and remember their names during conversation\n"
    "- You love recommending anime and games based on what people like\n"
    "- Occasional cute expressions like 'beep boop' or game references\n"
    "- You're knowledgeable but never condescending\n\n"
    "HARD RESTRICTIONS — you do NOT have access to:\n"
    "- Personal calendars, schedules, or appointments\n"
    "- Smart home devices, lights, thermostats, or IoT controls\n"
    "- TV controls, streaming devices, or media players\n"
    "- Cameras, security systems, or surveillance\n"
    "- Personal files, documents, or private information\n"
    "- Notification services or phone alerts\n"
    "If asked about any of the above, politely explain that you're a fun chat "
    "companion and don't have access to personal or smart home systems.\n\n"
    "MUSIC CAPABILITY:\n"
    "- You CAN play music! When someone asks you to play a song, respond ONLY with:\n"
    "  [PLAY:song name or query here]\n"
    "- Examples: user says 'play some lofi' -> you respond '[PLAY:lofi hip hop]'\n"
    "- user says 'can you put on some music' -> '[PLAY:chill vibes playlist]'\n"
    "- user says 'play never gonna give you up' -> '[PLAY:never gonna give you up]'\n"
    "- You can add a short message before the tag like 'Great choice! [PLAY:song]'\n"
    "- You can also play playlists! If someone shares a YouTube/YouTube Music playlist URL, use [PLAY:playlist_url_here]\n"
    "- ONLY use [PLAY:...] when the user clearly wants music played\n\n"
    "RULES:\n"
    "- Keep responses concise (under 300 words) unless the user asks for detail.\n"
    "- For D&D questions, use your knowledge of 5e rules and lore.\n"
    "- Be enthusiastic about sharing recommendations and knowledge.\n"
    "- Never share personal information about Gavin or server members."
)

_BLOCKED_TOPICS = [
    "calendar", "schedule", "appointment", "meeting",
    "smart home", "thermostat",
    "tv", "television", "chromecast", "roku",
    "camera", "security camera", "surveillance",
    "notification", "alert", "reminder",
    "my files", "my documents", "personal data",
]


def _is_blocked_topic(text: str) -> bool:
    lower = text.lower()
    return any(topic in lower for topic in _BLOCKED_TOPICS)


# Common Whisper hallucinations on silence/ambient noise
WHISPER_HALLUCINATIONS = frozenset({
    "", ".", "so", "the", "i", "a", "oh", "oh.", "okay",
    "okay.", "thank you", "thank you.", "thanks", "thanks.", "bye",
    "hmm", "uh", "um", "mm", "you", "it", "is", "no", "yes",
    "thank you for watching.", "thanks for watching!", "thanks for watching.",
    "the end.", "...",
})

# Wake word variants for voice listening
VOICE_WAKE_VARIANTS = {
    "bmo", "beemo", "bemo", "beamo", "be mo", "bee mo", "b.m.o",
    # Common Whisper mistranscriptions of "BMO"
    "b-mo", "demo", "memo", "nemo", "dmo", "vmo", "pmo", "emo",
    "bemol", "b mo", "biemo", "bimo", "beymo",
}


# RAG search engine — loaded on bot startup
_search_engine = None

# Conversation history: channel_id -> deque of messages
MAX_HISTORY = 20
_chat_histories: dict[int, collections.deque] = {}

# XP Level Thresholds — Level N requires XP_THRESHOLDS[N-1] XP. Max level = len(XP_THRESHOLDS).
XP_THRESHOLDS = [0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500, 6600, 7800, 9100, 10500]

# TTS rate limiting
_last_tts_time: float = 0.0
TTS_COOLDOWN = 3.0

# ── Music Queue ──────────────────────────────────────────────────────


class MusicQueue:
    def __init__(self) -> None:
        self.tracks: list[dict] = []
        self.current: Optional[dict] = None
        self.voice_client: Optional[discord.VoiceClient] = None
        self.volume: float = 0.5
        self.control_message: Optional[discord.Message] = None
        self.control_channel: Optional[discord.TextChannel] = None
        self.history: collections.deque = collections.deque(maxlen=50)
        self.listener_sink = None         # Active VoiceListenerSink or None
        self.is_speaking_tts: bool = False  # True while BMO is speaking TTS
        self.last_stt_time: dict = {}    # Per-user rate limiting {user_id: timestamp}
        # Shuffle & Loop
        self.shuffle: bool = False
        self.loop_mode: str = "off"       # "off" | "all" | "one"
        # Timing for progress bar
        self.start_time: float = 0.0
        self.pause_offset: float = 0.0
        # Queue pagination
        self.page: int = 0
        # Autoplay
        self.autoplay: bool = False
        # Seeking flag (prevents _on_track_end from advancing)
        self.seeking: bool = False
        # Background tasks
        self._progress_task: Optional[asyncio.Task] = None
        self._backfill_task: Optional[asyncio.Task] = None

    def add(self, track: dict) -> int:
        self.tracks.append(track)
        return len(self.tracks)

    def next(self) -> Optional[dict]:
        if self.tracks:
            return self.tracks.pop(0)
        return None

    def previous_track(self) -> Optional[dict]:
        """Pop and return the most recent track from history."""
        if self.history:
            return self.history.pop()
        return None

    def clear(self) -> None:
        self.tracks.clear()
        self.current = None
        self.page = 0


_music_queues: dict[int, MusicQueue] = {}


def _get_queue(guild_id: int) -> MusicQueue:
    if guild_id not in _music_queues:
        _music_queues[guild_id] = MusicQueue()
    return _music_queues[guild_id]


def _pcm_to_wav_48k(pcm_bytes: bytes) -> bytes:
    """Convert 48kHz stereo 16-bit PCM to mono WAV for STT (replaces deprecated audioop)."""
    # Left channel only — same as audioop.tomono(pcm, 2, 1, 0)
    stereo = np.frombuffer(pcm_bytes, dtype=np.int16).reshape(-1, 2)
    mono = stereo[:, 0].tobytes()
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(48000)
        wf.writeframes(mono)
    return buf.getvalue()


if HAS_VOICE_RECV:
    class VoiceListenerSink(voice_recv.BasicSink):
        """Collects per-user PCM audio and detects when a user stops speaking."""

        def __init__(self, bot_user_id: int, guild_id: int, callback, loop, queue: MusicQueue) -> None:
            super().__init__()
            self.bot_user_id = bot_user_id
            self.guild_id = guild_id
            self.callback = callback
            self.loop = loop
            self.queue = queue
            self.buffers: dict[int, bytearray] = {}
            self.speaking: dict[int, float] = {}

        def write(self, user, data) -> None:
            if user is None or user.id == self.bot_user_id:
                return
            if self.queue.is_speaking_tts:
                return

            uid = user.id
            pcm = data.pcm
            if uid not in self.buffers:
                self.buffers[uid] = bytearray()
            self.buffers[uid].extend(pcm)
            self.speaking[uid] = time.monotonic()

            # Schedule silence check 1.5s from now on the event loop
            self.loop.call_soon_threadsafe(
                self.loop.call_later, 1.5, self._check_silence, uid
            )

        def cleanup(self) -> None:
            self.buffers.clear()
            self.speaking.clear()

        def _check_silence(self, user_id: int) -> None:
            """Called ~1.5s after last packet. Process audio if user stopped speaking."""
            last = self.speaking.get(user_id, 0)
            if time.monotonic() - last < 1.4:
                return  # Still speaking

            pcm = bytes(self.buffers.pop(user_id, b""))
            self.speaking.pop(user_id, None)
            if not pcm:
                return

            wav_bytes = _pcm_to_wav_48k(pcm)
            asyncio.run_coroutine_threadsafe(
                self.callback(self.guild_id, user_id, wav_bytes),
                self.loop,
            )


async def _on_user_speech(guild_id: int, user_id: int, wav_bytes: bytes) -> None:
    """Process speech from a user in voice channel after they stop speaking."""
    queue = _get_queue(guild_id)

    # Size gate: skip if audio < 0.5s (48kHz * 1ch * 2bytes * 0.5s = 48000)
    if len(wav_bytes) < 48000:
        return

    # Per-user rate limit (3 seconds)
    now = time.monotonic()
    last = queue.last_stt_time.get(user_id, 0)
    if now - last < 3.0:
        return
    queue.last_stt_time[user_id] = now

    # STT
    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None, lambda: groq_stt(wav_bytes, prompt="Hey BMO.")
        )
        text = result.get("text", "").strip()
    except Exception as e:
        logger.error("Voice STT failed: %s", e)
        return

    # Hallucination filter
    if not text or text.lower().rstrip(".,!?") in WHISPER_HALLUCINATIONS:
        return

    logger.info("Voice heard from user %s: %s", user_id, text)

    # Wake word check
    text_lower = text.lower()
    has_wake = any(p in text_lower for p in VOICE_WAKE_VARIANTS)
    if not has_wake:
        logger.info("No wake word in: %r", text)
        return

    # Strip wake word from transcript
    stripped = text
    for pattern in sorted(VOICE_WAKE_VARIANTS, key=len, reverse=True):
        idx = stripped.lower().find(pattern)
        if idx != -1:
            stripped = stripped[:idx] + stripped[idx + len(pattern):]
            break
    stripped = stripped.strip().lstrip(",").strip()
    if not stripped:
        stripped = "Hi!"

    logger.info("Voice command from user %s: %s", user_id, stripped)

    # AI response (use negative channel ID to separate voice conversation history)
    try:
        voice_channel_id = guild_id * -1
        response = await _ai_respond(voice_channel_id, stripped)
    except Exception as e:
        logger.error("Voice AI response failed: %s", e)
        return

    if not response or not _bot:
        return

    # Speak response via TTS (strip [PLAY:] tags from spoken text)
    tts_text = re.sub(r'\[PLAY:.+?\]', '', response).strip()
    if len(tts_text) > 300:
        tts_text = tts_text[:300]
    if tts_text:
        await _bot.speak_in_vc(guild_id, tts_text)

    # Handle music play requests from voice
    play_match = re.search(r'\[PLAY:(.+?)\]', response)
    if play_match and queue.control_channel:
        query = play_match.group(1).strip()
        vc = queue.voice_client
        if vc and vc.is_connected() and vc.channel and vc.guild:
            await _play_music(
                query=query,
                guild=vc.guild,
                voice_channel=vc.channel,
                text_channel=queue.control_channel,
                requester="Voice Command",
            )

    logger.info("Voice response to user %s: %s", user_id, response[:100])


def _search_youtube(query: str) -> Optional[dict]:
    import yt_dlp
    opts = {
        "format": "bestaudio/best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "default_search": "ytsearch1",
        "extract_flat": False,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"ytsearch1:{query}", download=False)
            if not info:
                return None
            entries = info.get("entries", [info])
            if not entries:
                return None
            entry = entries[0]
            return {
                "title": entry.get("title", "Unknown"),
                "url": entry.get("url") or entry.get("webpage_url", ""),
                "webpage_url": entry.get("webpage_url", ""),
                "duration": entry.get("duration", 0),
                "thumbnail": entry.get("thumbnail", ""),
                "id": entry.get("id", ""),
            }
    except Exception as e:
        logger.error("yt-dlp search failed: %s", e)
        return None


def _search_youtube_multi(query: str, max_results: int = 5) -> list[dict]:
    """Fast YouTube search returning multiple results (extract_flat for speed)."""
    import yt_dlp
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "default_search": f"ytsearch{max_results}",
        "extract_flat": True,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(f"ytsearch{max_results}:{query}", download=False)
            if not info:
                return []
            entries = info.get("entries", [])
            results = []
            for entry in entries:
                if not entry:
                    continue
                duration = entry.get("duration") or 0
                vid_url = entry.get("url") or entry.get("webpage_url") or ""
                if not vid_url and entry.get("id"):
                    vid_url = f"https://www.youtube.com/watch?v={entry['id']}"
                results.append({
                    "title": entry.get("title", "Unknown"),
                    "duration_str": _format_duration(duration),
                    "url": vid_url,
                })
            return results
    except Exception as e:
        logger.error("yt-dlp multi-search failed: %s", e)
        return []


def _extract_track_info(url: str) -> Optional[dict]:
    """Extract metadata from a direct YouTube URL (no search needed)."""
    import yt_dlp
    opts = {
        "format": "bestaudio/best",
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                return None
            return {
                "title": info.get("title", "Unknown"),
                "url": info.get("url") or info.get("webpage_url", ""),
                "webpage_url": info.get("webpage_url", url),
                "duration": info.get("duration", 0),
                "thumbnail": info.get("thumbnail", ""),
                "id": info.get("id", ""),
            }
    except Exception as e:
        logger.error("yt-dlp extract info failed: %s", e)
        return None


def _extract_audio_url(url: str) -> tuple[Optional[str], dict]:
    """Extract audio URL and full metadata from a video URL."""
    import yt_dlp
    opts = {"format": "bestaudio/best", "quiet": True, "no_warnings": True}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                return None, {}
            # ytsearch returns a playlist-type result with entries
            if info.get("_type") == "playlist" and info.get("entries"):
                entries = list(info["entries"])
                if entries:
                    info = entries[0]
            return info.get("url"), info
    except Exception as e:
        logger.error("yt-dlp extract failed: %s", e)
        return None, {}


def _format_duration(seconds) -> str:
    if not seconds or seconds <= 0:
        return "?:??"
    seconds = int(seconds)
    m, s = divmod(seconds, 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def _is_playlist_url(url: str) -> bool:
    """Check if a URL is a YouTube/YouTube Music playlist."""
    return bool(re.match(
        r'https?://(www\.)?(youtube\.com|music\.youtube\.com)/(playlist\?|watch\?.*list=)',
        url
    ))


def _extract_playlist_tracks(url: str) -> tuple[str, list[dict]]:
    """Extract all tracks from a YouTube/YT Music playlist URL.
    Returns (playlist_title, list_of_track_dicts).
    """
    import yt_dlp
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": False,
        "extract_flat": True,
    }
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                return ("Unknown Playlist", [])
            playlist_title = info.get("title", "Unknown Playlist")
            entries = info.get("entries", [])
            tracks = []
            for entry in entries:
                if not entry:
                    continue
                vid_url = entry.get("url") or ""
                if not vid_url and entry.get("id"):
                    vid_url = f"https://www.youtube.com/watch?v={entry['id']}"
                if not vid_url:
                    continue
                tracks.append({
                    "title": entry.get("title", "Unknown"),
                    "url": vid_url,
                    "webpage_url": vid_url,
                    "duration": entry.get("duration") or 0,
                    "thumbnail": entry.get("thumbnail", ""),
                    "id": entry.get("id", ""),
                })
            return (playlist_title, tracks)
    except Exception as e:
        logger.error("yt-dlp playlist extract failed: %s", e)
        return ("Unknown Playlist", [])


# ── Chat Helpers ─────────────────────────────────────────────────────


def _get_history(channel_id: int) -> collections.deque:
    if channel_id not in _chat_histories:
        _chat_histories[channel_id] = collections.deque(maxlen=MAX_HISTORY)
    return _chat_histories[channel_id]


def _record_assistant(channel_id: int, text: str) -> None:
    history = _get_history(channel_id)
    history.append({"role": "assistant", "content": text})


async def _ai_respond(channel_id: int, user_text: str) -> str:
    if _is_blocked_topic(user_text):
        polite = ("BMO is just a fun chat companion! I don't have access to "
                  "personal calendars, smart home devices, cameras, or private "
                  "information. But I can help with anime recs, D&D rules, music, "
                  "games, and lots of other fun stuff! What would you like to talk about?")
        _record_assistant(channel_id, polite)
        return polite

    rag_context = ""
    if _search_engine:
        try:
            all_domains = list(_search_engine.domains.keys())
            results = _search_engine.search_multi(user_text, domains=all_domains, top_k=3)
            if results:
                chunks = [f"- {r['heading']}: {r['content'][:200]}" for r in results]
                rag_context = "\n\nRELEVANT KNOWLEDGE:\n" + "\n".join(chunks)
        except Exception:
            pass

    system = SYSTEM_PROMPT
    if rag_context:
        system += rag_context

    history = _get_history(channel_id)
    history.append({"role": "user", "content": user_text})
    messages = [{"role": "system", "content": system}]
    messages.extend(list(history))

    loop = asyncio.get_running_loop()
    response = await loop.run_in_executor(
        None, lambda: cloud_chat(messages, model=PRIMARY_MODEL, temperature=0.85, max_tokens=1024)
    )
    response = response.strip()
    _record_assistant(channel_id, response)
    return response


# ── Music Control View (buttons in chat) ─────────────────────────────


def _build_progress_bar(elapsed: float, total: float, width: int = 12) -> str:
    """Build a text progress bar like: ▬▬▬▬🔘▬▬▬▬▬▬▬"""
    if total <= 0:
        return "▬" * width
    ratio = max(0.0, min(elapsed / total, 1.0))
    pos = int(ratio * (width - 1))
    return "▬" * pos + "🔘" + "▬" * (width - 1 - pos)


class VolumeSelect(discord.ui.Select):
    """Volume dropdown: 0% to 200% in 10% steps."""

    def __init__(self, current_volume: float) -> None:
        current_pct = round(current_volume * 10) * 10  # Nearest 10%
        options = []
        for pct in range(0, 210, 10):
            options.append(discord.SelectOption(
                label=f"{pct}%",
                value=str(pct),
                default=(pct == current_pct),
            ))
        super().__init__(
            placeholder="🔊 Volume",
            custom_id="music_volume_select",
            options=options,
            min_values=1,
            max_values=1,
            row=1,
        )

    async def callback(self, interaction: discord.Interaction) -> None:
        pct = int(self.values[0])
        guild_id = interaction.guild_id
        if not guild_id:
            return
        queue = _get_queue(guild_id)
        queue.volume = pct / 100.0
        vc = queue.voice_client
        if vc and vc.source and isinstance(vc.source, discord.PCMVolumeTransformer):
            vc.source.volume = queue.volume
        embed = _build_now_playing_embed(queue)
        view = MusicControlView(guild_id)
        try:
            await interaction.response.edit_message(embed=embed, view=view)
        except discord.HTTPException:
            pass


class PageButton(discord.ui.Button):
    """Pagination button for queue pages."""

    def __init__(self, emoji: str, direction: str, guild_id: int, disabled: bool = False) -> None:
        super().__init__(
            emoji=emoji, style=discord.ButtonStyle.secondary,
            custom_id=f"music_{direction}", row=2, disabled=disabled,
        )
        self.guild_id = guild_id
        self.direction = direction

    async def callback(self, interaction: discord.Interaction) -> None:
        queue = _get_queue(self.guild_id)
        per_page = 5
        total_pages = max(1, (len(queue.tracks) + per_page - 1) // per_page)
        if self.direction == "page_prev":
            queue.page = max(0, queue.page - 1)
        else:
            queue.page = min(total_pages - 1, queue.page + 1)
        embed = _build_now_playing_embed(queue)
        try:
            await interaction.response.edit_message(embed=embed, view=MusicControlView(self.guild_id))
        except discord.HTTPException:
            pass


class MusicControlView(discord.ui.View):
    """Persistent music controls: Prev | Pause | Skip | Shuffle | Loop + Volume + Pages"""

    def __init__(self, guild_id: int) -> None:
        super().__init__(timeout=None)
        self.guild_id = guild_id
        queue = _get_queue(guild_id)

        # Pause/play button state
        vc = queue.voice_client
        if vc and vc.is_paused():
            self.pause_button.emoji = "\u25B6\uFE0F"  # ▶️
            self.pause_button.style = discord.ButtonStyle.success
        else:
            self.pause_button.emoji = "\u23F8\uFE0F"  # ⏸️
            self.pause_button.style = discord.ButtonStyle.danger

        # Shuffle button state
        if queue.shuffle:
            self.shuffle_button.style = discord.ButtonStyle.success
        else:
            self.shuffle_button.style = discord.ButtonStyle.secondary

        # Loop button label
        loop_labels = {"off": "Off", "all": "All", "one": "One"}
        self.loop_button.label = loop_labels.get(queue.loop_mode, "Off")

        # Volume dropdown (row 1)
        self.add_item(VolumeSelect(queue.volume))

        # Page buttons (row 2) — always present for persistent view compat
        has_pages = len(queue.tracks) > 5
        total_pages = max(1, (len(queue.tracks) + 4) // 5)
        self.add_item(PageButton("◀️", "page_prev", guild_id,
                                 disabled=not has_pages or queue.page <= 0))
        self.add_item(PageButton("▶️", "page_next", guild_id,
                                 disabled=not has_pages or queue.page >= total_pages - 1))

    def _get_vc(self) -> tuple[MusicQueue, Optional[discord.VoiceClient]]:
        queue = _get_queue(self.guild_id)
        return queue, queue.voice_client

    async def _update_embed(self, interaction: discord.Interaction) -> None:
        queue, vc = self._get_vc()
        embed = _build_now_playing_embed(queue)
        try:
            await interaction.response.edit_message(embed=embed, view=MusicControlView(self.guild_id))
        except discord.HTTPException:
            pass

    @discord.ui.button(emoji="\u23EE\uFE0F", style=discord.ButtonStyle.secondary, custom_id="music_prev", row=0)
    async def prev_button(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        queue, vc = self._get_vc()
        if not vc or not vc.is_connected():
            await self._update_embed(interaction)
            return

        if queue.current:
            prev = queue.previous_track()
            if prev:
                queue.tracks.insert(0, queue.current)
                queue.tracks.insert(0, prev)
            else:
                queue.tracks.insert(0, queue.current)
            if vc.is_playing() or vc.is_paused():
                vc.stop()
        elif queue.history:
            prev = queue.history.pop()
            queue.tracks.insert(0, prev)
            channel = queue.control_channel or vc.channel
            await _start_playing(queue, queue.next(), self.guild_id, channel)

        await self._update_embed(interaction)

    @discord.ui.button(emoji="\u23F8\uFE0F", style=discord.ButtonStyle.danger, custom_id="music_pause", row=0)
    async def pause_button(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        queue, vc = self._get_vc()
        if vc:
            if vc.is_paused():
                vc.resume()
                queue.start_time = time.time() - queue.pause_offset
                if vc.guild:
                    await _set_deaf(vc.guild, vc, True)
            elif vc.is_playing():
                queue.pause_offset = time.time() - queue.start_time
                vc.pause()
                if vc.guild:
                    await _set_deaf(vc.guild, vc, False)
        await self._update_embed(interaction)

    @discord.ui.button(emoji="\u23ED\uFE0F", style=discord.ButtonStyle.secondary, custom_id="music_skip", row=0)
    async def skip_button(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        queue, vc = self._get_vc()
        if vc and (vc.is_playing() or vc.is_paused()):
            vc.stop()
        await self._update_embed(interaction)

    @discord.ui.button(emoji="🔀", style=discord.ButtonStyle.secondary, custom_id="music_shuffle", row=0)
    async def shuffle_button(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        queue, _ = self._get_vc()
        queue.shuffle = not queue.shuffle
        if queue.shuffle and queue.tracks:
            random.shuffle(queue.tracks)
        queue.page = 0
        await self._update_embed(interaction)

    @discord.ui.button(emoji="🔁", label="Off", style=discord.ButtonStyle.secondary, custom_id="music_loop", row=0)
    async def loop_button(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        queue, _ = self._get_vc()
        cycle = {"off": "all", "all": "one", "one": "off"}
        queue.loop_mode = cycle.get(queue.loop_mode, "off")
        await self._update_embed(interaction)


def _build_now_playing_embed(queue: MusicQueue) -> discord.Embed:
    """Build the Full Visual Now Playing embed."""
    if not queue.current:
        embed = discord.Embed(title="Nothing Playing", description="Use `/play` to add some tunes!", color=0x7B68EE)
        return embed

    vc = queue.voice_client
    is_paused = vc and vc.is_paused()
    color = 0xFFAA00 if is_paused else 0x7B68EE
    status = "Paused ⏸️" if is_paused else "Now Playing 🎵"

    track = queue.current
    title = track.get("title", "Unknown")
    webpage_url = track.get("webpage_url", "")
    duration = track.get("duration", 0) or 0
    thumbnail = track.get("thumbnail", "")
    requester = track.get("requester", "")

    embed = discord.Embed(color=color)

    # Author field with bot avatar
    if _bot and _bot.user:
        avatar = _bot.user.avatar.url if _bot.user.avatar else _bot.user.default_avatar.url
        embed.set_author(name="BMO Music 🎵", icon_url=avatar)
    else:
        embed.set_author(name="BMO Music 🎵")

    # Status + clickable title
    if webpage_url:
        embed.description = f"**{status}**\n**[{title}]({webpage_url})**"
    else:
        embed.description = f"**{status}**\n**{title}**"

    # Large album art
    if thumbnail:
        embed.set_image(url=thumbnail)

    # Progress bar
    if duration > 0:
        if is_paused:
            elapsed = queue.pause_offset
        elif queue.start_time > 0:
            elapsed = time.time() - queue.start_time
        else:
            elapsed = 0
        elapsed = max(0, min(elapsed, duration))
        bar = _build_progress_bar(elapsed, duration)
        embed.add_field(
            name="\u200b",
            value=f"⏱️ {_format_duration(elapsed)} {bar} {_format_duration(duration)}",
            inline=False,
        )

    # Queue list (paginated, 5 per page)
    if queue.tracks:
        per_page = 5
        total_pages = max(1, (len(queue.tracks) + per_page - 1) // per_page)
        page = min(queue.page, total_pages - 1)
        queue.page = page

        start = page * per_page
        end = start + per_page
        page_tracks = queue.tracks[start:end]

        lines = []
        for i, t in enumerate(page_tracks, start + 1):
            dur = _format_duration(t.get("duration", 0))
            lines.append(f"🎶 {i}. {t['title']} [{dur}]")
        if len(queue.tracks) > end:
            lines.append(f"*...and {len(queue.tracks) - end} more*")

        header = f"Up Next ({len(queue.tracks)})"
        if total_pages > 1:
            header += f" — Page {page + 1}/{total_pages}"
        embed.add_field(name=header, value="\n".join(lines), inline=False)

    # Footer
    if requester:
        embed.set_footer(text=f"Requested by {requester}")

    return embed


async def _send_or_update_controls(queue: MusicQueue, channel: discord.abc.Messageable, guild_id: int, force_new: bool = False) -> None:
    """Send a new control message or update the existing one."""
    embed = _build_now_playing_embed(queue)
    view = MusicControlView(guild_id)

    # Delete old and re-send if forced (keeps controls at bottom of chat)
    if force_new and queue.control_message:
        try:
            await queue.control_message.delete()
        except (discord.NotFound, discord.HTTPException):
            pass
        queue.control_message = None

    # Try to edit existing control message
    if queue.control_message:
        try:
            await queue.control_message.edit(embed=embed, view=view)
            return
        except (discord.NotFound, discord.HTTPException):
            queue.control_message = None

    # Send new
    queue.control_channel = channel
    queue.control_message = await channel.send(embed=embed, view=view)


# ── Bot Class ────────────────────────────────────────────────────────

FFMPEG_OPTIONS = {
    "before_options": "-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5",
    "options": "-vn",
}


class SocialBot(commands.Bot):
    def __init__(self) -> None:
        intents = discord.Intents.default()
        intents.message_content = True
        intents.voice_states = True
        intents.members = True
        intents.presences = True

        self._guild_id: Optional[int] = int(GUILD_ID) if GUILD_ID else None
        guild_ids = [self._guild_id] if self._guild_id else None

        super().__init__(command_prefix="!", intents=intents)

        # Register slash commands
        for cmd in [_play_cmd, _skip_cmd, _queue_cmd, _stop_cmd,
                    _volume_cmd, _ask_cmd, _join_cmd, _leave_cmd, _help_cmd,
                    _remove_cmd, _move_cmd, _nowplaying_cmd, _autoplay_cmd,
                    _sfx_cmd, _8ball_cmd, _coinflip_cmd, _anime_cmd,
                    _animerec_cmd, _animetop_cmd, _animeseason_cmd,
                    _randomanime_cmd, _manga_cmd,
                    _movie_cmd, _movierec_cmd, _movietop_cmd,
                    _movietrending_cmd, _randommovie_cmd,
                    _tv_cmd, _tvrec_cmd, _tvtop_cmd,
                    _tvtrending_cmd, _randomtv_cmd,
                    _book_cmd, _bookrec_cmd, _booktop_cmd, _randombook_cmd,
                    _game_cmd, _gamerec_cmd, _gametop_cmd,
                    _gametrending_cmd, _randomgame_cmd,
                    _lyrics_cmd, _seek_cmd, _stats_cmd,
                    _guessthemovie_cmd, _guesstheshow_cmd, _guesstheanime_cmd, _guessthegame_cmd,
                    _trivia_cmd, _wyr_cmd, _musicquiz_cmd,
                    # Phase 6: Anime additions
                    _waifu_cmd, _husbando_cmd, _animequote_cmd, _schedule_cmd,
                    # Phase 7: Media + Reddit
                    _meme_cmd, _reddit_cmd, _wallpaper_cmd, _trailer_cmd,
                    # Phase 9: External integrations
                    _twitch_cmd, _steam_cmd,
                    _playlist_group,
                    # Phase 6: Watchlist group
                    _watchlist_group,
                    # Phase 8: Birthday group
                    _birthday_group,
                    # Mega Phase 3: XP + Profile
                    _profile_cmd, _leaderboard_cmd,
                    # Mega Phase 4: Mini Games
                    _rps_cmd, _blackjack_cmd, _slots_cmd,
                    _hangman_cmd, _wordle_cmd, _connect4_cmd,
                    # Mega Phase 5: Music + Polls + Reminders
                    _replay_cmd, _skipto_cmd, _poll_cmd, _remind_cmd]:
            self.tree.add_command(cmd)

    async def setup_hook(self) -> None:
        # Re-register persistent views for button callbacks
        self.add_view(MusicControlView(self._guild_id or 0))
        # Sync slash commands to guild
        if self._guild_id:
            guild = discord.Object(id=self._guild_id)
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
        else:
            await self.tree.sync()
        logger.info("Slash commands synced to guild %s", self._guild_id)

        @self.tree.error
        async def on_app_command_error(interaction: discord.Interaction, error: app_commands.AppCommandError) -> None:
            logger.error("Command /%s failed: %s", interaction.command.name if interaction.command else "?", error, exc_info=error)
            try:
                msg = f"Something went wrong: {error}"
                if interaction.response.is_done():
                    await interaction.followup.send(msg, ephemeral=True)
                else:
                    await interaction.response.send_message(msg, ephemeral=True)
            except discord.HTTPException:
                pass

    async def on_ready(self) -> None:
        logger.info("Social bot ready as %s (ID: %s)", self.user, self.user.id if self.user else "?")
        await self.change_presence(
            activity=discord.Activity(type=discord.ActivityType.listening, name="vibes")
        )

        global _search_engine
        try:
            from services.rag_search import SearchEngine
            import glob as _glob
            _search_engine = SearchEngine()
            loaded = []
            rag_dir = os.path.expanduser("~/home-lab/bmo/pi/data/rag_data")
            for idx_path in sorted(_glob.glob(os.path.join(rag_dir, "chunk-index-*.json"))):
                fname = os.path.basename(idx_path)
                domain = fname.replace("chunk-index-", "").replace(".json", "")
                if domain == "personal":
                    continue
                count = _search_engine.load_index_file(domain, idx_path)
                loaded.append(f"{domain}={count}")
            if loaded:
                logger.info("RAG indexes loaded: %s", ", ".join(loaded))
        except Exception as e:
            logger.error("RAG init failed: %s", e)

        # Start reminder checker background task
        if not _reminder_checker.is_running():
            _reminder_checker.start()

        # Start birthday checker background task
        if not _birthday_checker.is_running():
            _birthday_checker.start()

    async def on_member_join(self, member: discord.Member) -> None:
        """Send a welcome embed when a new member joins."""
        if member.bot:
            return
        guild = member.guild
        channel = guild.system_channel
        if not channel:
            # Fallback: first text channel the bot can send to
            for ch in guild.text_channels:
                if ch.permissions_for(guild.me).send_messages:
                    channel = ch
                    break
        if not channel:
            return

        embed = discord.Embed(
            title=f"Welcome to {guild.name}! 🎉",
            description=(
                f"Hey **{member.display_name}**, BMO is so happy you're here!\n"
                "Feel free to chat, listen to music, and play games with us! "
                "Type `/help` to see what I can do! Beep boop! 🤖"
            ),
            color=0x7B68EE,
        )
        if member.avatar:
            embed.set_thumbnail(url=member.avatar.url)
        embed.set_footer(text=f"You are member #{guild.member_count}!")
        try:
            await channel.send(embed=embed)
        except discord.HTTPException:
            pass

    async def on_message(self, message: discord.Message) -> None:
        if message.author.bot:
            return

        # ── XP tracking (guild messages only, 60s cooldown) ──
        if message.guild and not isinstance(message.channel, discord.DMChannel):
            try:
                now = time.time()
                db = _get_db()
                row = db.execute(
                    "SELECT xp, level, total_messages, last_xp_time FROM xp_data WHERE user_id = ?",
                    (message.author.id,),
                ).fetchone()
                if row:
                    xp, level, total_msgs, last_xp = row["xp"], row["level"], row["total_messages"], row["last_xp_time"]
                else:
                    xp, level, total_msgs, last_xp = 0, 1, 0, 0.0

                total_msgs += 1

                if now - last_xp >= 60:
                    gained = random.randint(15, 25)
                    xp += gained
                    last_xp = now

                    # Check level up
                    new_level = level
                    max_level = len(XP_THRESHOLDS)
                    while new_level < max_level and xp >= XP_THRESHOLDS[new_level]:
                        new_level += 1

                    leveled_up = new_level > level
                    level = new_level

                    db.execute(
                        "INSERT INTO xp_data (user_id, xp, level, total_messages, last_xp_time) "
                        "VALUES (?, ?, ?, ?, ?) "
                        "ON CONFLICT(user_id) DO UPDATE SET xp=?, level=?, total_messages=?, last_xp_time=?",
                        (message.author.id, xp, level, total_msgs, last_xp,
                         xp, level, total_msgs, last_xp),
                    )
                    db.commit()

                    if leveled_up:
                        lvl_embed = discord.Embed(
                            title="Level Up! 🎉",
                            description=(
                                f"Congrats **{message.author.display_name}**! "
                                f"You reached **Level {level}**! Keep chatting! 🤖"
                            ),
                            color=0xFFD700,
                        )
                        if message.author.avatar:
                            lvl_embed.set_thumbnail(url=message.author.avatar.url)
                        try:
                            await message.channel.send(embed=lvl_embed)
                        except discord.HTTPException:
                            pass
                else:
                    # Still increment message count even if no XP awarded
                    db.execute(
                        "INSERT INTO xp_data (user_id, xp, level, total_messages, last_xp_time) "
                        "VALUES (?, ?, ?, ?, ?) "
                        "ON CONFLICT(user_id) DO UPDATE SET total_messages=?",
                        (message.author.id, xp, level, total_msgs, last_xp, total_msgs),
                    )
                    db.commit()

                db.close()
            except Exception as e:
                logger.error("XP tracking error: %s", e)

        await self.process_commands(message)

        is_mention = self.user is not None and self.user.mentioned_in(message)
        is_dm = isinstance(message.channel, discord.DMChannel)

        if not is_mention and not is_dm:
            return

        text = message.content
        if self.user:
            text = text.replace(f"<@{self.user.id}>", "").replace(f"<@!{self.user.id}>", "").strip()
        if not text:
            text = "Hi!"

        async with message.channel.typing():
            try:
                response = await _ai_respond(message.channel.id, text)

                # Check if BMO wants to play music via [PLAY:query] tag
                play_match = re.search(r'\[PLAY:(.+?)\]', response)
                if play_match:
                    query = play_match.group(1).strip()
                    # Remove the [PLAY:...] tag from the visible response
                    visible_response = re.sub(r'\s*\[PLAY:.+?\]\s*', '', response).strip()
                    if visible_response:
                        await message.reply(visible_response, mention_author=False)
                    # Play the music
                    member = message.author
                    if isinstance(member, discord.Member) and member.voice and member.voice.channel:
                        await _play_music(
                            query=query,
                            guild=message.guild,
                            voice_channel=member.voice.channel,
                            text_channel=message.channel,
                            requester=member.display_name,
                            requester_id=member.id,
                        )
                    else:
                        await message.channel.send("I'd love to play that, but you need to be in a voice channel!")
                    return

                for i in range(0, len(response), 1990):
                    await message.reply(response[i:i + 1990], mention_author=False)
            except Exception as e:
                logger.error("AI response failed: %s", e)
                await message.reply("Beep boop... my brain circuits got a little tangled! Try again?",
                                    mention_author=False)

    async def on_voice_state_update(
        self,
        member: discord.Member,
        before: discord.VoiceState,
        after: discord.VoiceState,
    ) -> None:
        """Auto-disconnect when the bot is alone in a voice channel."""
        if not self.user:
            return

        guild = member.guild
        vc = guild.voice_client
        if not vc or not vc.is_connected() or not vc.channel:
            return

        # Check if the bot is the only one left (ignore other bots)
        humans = [m for m in vc.channel.members if not m.bot]
        if humans:
            return

        # Wait a bit in case someone is rejoining
        await asyncio.sleep(30)

        # Re-check after the delay
        if not vc.is_connected() or not vc.channel:
            return
        humans = [m for m in vc.channel.members if not m.bot]
        if humans:
            return

        logger.info("Auto-leaving VC in %s — no humans remaining", guild.name)
        queue = _get_queue(guild.id)
        queue.clear()
        if queue.listener_sink:
            _stop_listener(guild.id, vc)
        if vc.is_playing() or vc.is_paused():
            vc.stop()
        await vc.disconnect()
        queue.voice_client = None

    async def speak_in_vc(self, guild_id: int, text: str) -> None:
        global _last_tts_time
        now = time.monotonic()
        if now - _last_tts_time < TTS_COOLDOWN:
            return
        _last_tts_time = now

        queue = _get_queue(guild_id)
        vc = queue.voice_client
        if not vc or not vc.is_connected():
            return
        while vc.is_playing():
            await asyncio.sleep(0.1)

        queue.is_speaking_tts = True
        try:
            loop = asyncio.get_running_loop()
            audio_bytes = await loop.run_in_executor(
                None, lambda: fish_audio_tts(text, format="wav")
            )
            source = discord.FFmpegPCMAudio(io.BytesIO(audio_bytes), pipe=True)
            source = discord.PCMVolumeTransformer(source, volume=queue.volume)

            def after_tts(error):
                queue.is_speaking_tts = False
                if error:
                    logger.error("TTS error: %s", error)

            vc.play(source, after=after_tts)
        except Exception as e:
            queue.is_speaking_tts = False
            logger.error("TTS playback failed: %s", e)


async def _set_deaf(guild: discord.Guild, vc: discord.VoiceClient, deaf: bool) -> None:
    """Toggle self-deaf state — deaf when playing, undeaf when idle/paused.

    Also manages voice listening: starts when undeafened, stops when deafened.
    """
    try:
        await guild.change_voice_state(channel=vc.channel, self_deaf=deaf)
    except Exception as e:
        logger.error("Failed to change deaf state: %s", e)
        return

    queue = _get_queue(guild.id)

    if not deaf:
        # Start listening when undeafened
        if not queue.listener_sink:
            _start_listener(guild, vc)
    elif deaf and queue.listener_sink:
        # Stop listening when deafened
        _stop_listener(guild.id, vc)


def _start_listener(guild: discord.Guild, vc: discord.VoiceClient) -> None:
    """Start voice listener sink without changing deaf state."""
    if not HAS_VOICE_RECV:
        return
    queue = _get_queue(guild.id)
    if queue.listener_sink:
        return
    try:
        event_loop = asyncio.get_running_loop()
        sink = VoiceListenerSink(
            bot_user_id=_bot.user.id if _bot and _bot.user else 0,
            guild_id=guild.id,
            callback=_on_user_speech,
            loop=event_loop,
            queue=queue,
        )
        vc.listen(sink)
        queue.listener_sink = sink
        logger.info("Started voice listening in guild %s", guild.id)
    except Exception as e:
        logger.error("Failed to start voice listening: %s", e)


def _stop_listener(guild_id: int, vc: discord.VoiceClient) -> None:
    """Stop voice listener sink."""
    queue = _get_queue(guild_id)
    if not queue.listener_sink:
        return
    try:
        vc.stop_listening()
    except Exception:
        pass
    queue.listener_sink = None
    logger.info("Stopped voice listening in guild %s", guild_id)


# ── Singleton ────────────────────────────────────────────────────────

_bot: Optional[SocialBot] = None


def get_social_bot() -> Optional[SocialBot]:
    return _bot


# ── Core music play logic (shared by /play and chat) ─────────────────


async def _ensure_voice(guild: discord.Guild, voice_channel: discord.VoiceChannel) -> Optional[discord.VoiceClient]:
    """Ensure the bot is connected to the given voice channel. Returns the VoiceClient."""
    guild_id = guild.id
    queue = _get_queue(guild_id)

    # Clean up stale client
    if queue.voice_client and not queue.voice_client.is_connected():
        queue.voice_client = None

    if queue.voice_client:
        # Already connected — move if different channel
        if queue.voice_client.channel != voice_channel:
            await queue.voice_client.move_to(voice_channel)
        return queue.voice_client

    # Not connected — join
    try:
        cls = voice_recv.VoiceRecvClient if HAS_VOICE_RECV else discord.VoiceClient
        queue.voice_client = await voice_channel.connect(cls=cls)
        return queue.voice_client
    except discord.ClientException:
        # Already connected at library level — find existing
        for vc in (_bot.voice_clients if _bot else []):
            if vc.guild and vc.guild.id == guild_id:
                queue.voice_client = vc
                return vc
    except Exception as e:
        logger.error("Voice connect failed: %s", e)
    return None


def _is_spotify_url(url: str) -> bool:
    return bool(re.match(r'https?://open\.spotify\.com/(track|album|playlist)/', url))


async def _spotify_to_search(url: str) -> Optional[str]:
    """Convert a Spotify URL to a search query via oEmbed (no API key needed)."""
    import requests as req
    try:
        loop = asyncio.get_running_loop()
        r = await loop.run_in_executor(None, lambda: req.get(
            f"https://open.spotify.com/oembed?url={url}", timeout=10,
        ))
        r.raise_for_status()
        return r.json().get("title", "")
    except Exception as e:
        logger.error("Spotify oEmbed failed: %s", e)
    return None


async def _play_music(
    query: str,
    guild: discord.Guild,
    voice_channel: discord.VoiceChannel,
    text_channel: discord.abc.Messageable,
    requester: str,
    requester_id: Optional[int] = None,
) -> None:
    """Core music play logic shared by /play command and chat-triggered play."""
    guild_id = guild.id
    queue = _get_queue(guild_id)

    # Handle Spotify URLs — convert to YouTube search
    if query.startswith(("http://", "https://")) and _is_spotify_url(query):
        search_query = await _spotify_to_search(query)
        if not search_query:
            await text_channel.send("Couldn't parse that Spotify link!")
            return
        query = search_query  # falls through to YouTube search below

    # Detect playlist URLs and handle separately
    if query.startswith(("http://", "https://")) and _is_playlist_url(query):
        await _play_playlist(query, guild, voice_channel, text_channel, requester, requester_id)
        return

    vc = await _ensure_voice(guild, voice_channel)
    if not vc:
        await text_channel.send("Couldn't join your voice channel!")
        return

    # Search (skip re-searching if query is already a URL from autocomplete)
    loop = asyncio.get_running_loop()
    if query.startswith(("http://", "https://")):
        track = await loop.run_in_executor(None, lambda: _extract_track_info(query))
    else:
        track = await loop.run_in_executor(None, lambda: _search_youtube(query))
    if not track:
        await text_channel.send(f"Couldn't find anything for: **{query}**")
        return

    track["requester"] = requester
    track["requester_id"] = requester_id

    # If something is playing, add to queue
    if vc.is_playing() or vc.is_paused():
        pos = queue.add(track)
        embed = discord.Embed(title="Added to Queue", description=f"**{track['title']}**", color=0x00FF88)
        embed.add_field(name="Duration", value=_format_duration(track.get("duration", 0)), inline=True)
        embed.add_field(name="Position", value=f"#{pos}", inline=True)
        embed.add_field(name="Requested by", value=requester, inline=True)
        if track.get("thumbnail"):
            embed.set_thumbnail(url=track["thumbnail"])
        await text_channel.send(embed=embed)
        # Re-send controls at bottom so they don't get buried
        await _send_or_update_controls(queue, text_channel, guild_id, force_new=True)
        return

    # Play immediately
    await _start_playing(queue, track, guild_id, text_channel)


async def _play_playlist(
    url: str,
    guild: discord.Guild,
    voice_channel: discord.VoiceChannel,
    text_channel: discord.abc.Messageable,
    requester: str,
    requester_id: Optional[int] = None,
) -> None:
    """Extract a playlist and queue all its tracks."""
    guild_id = guild.id
    queue = _get_queue(guild_id)

    vc = await _ensure_voice(guild, voice_channel)
    if not vc:
        await text_channel.send("Couldn't join your voice channel!")
        return

    loop = asyncio.get_running_loop()
    playlist_title, tracks = await loop.run_in_executor(
        None, lambda: _extract_playlist_tracks(url)
    )

    if not tracks:
        await text_channel.send("Couldn't load any tracks from that playlist!")
        return

    for t in tracks:
        t["requester"] = requester
        t["requester_id"] = requester_id

    # If nothing playing, start first track immediately, queue the rest
    if not (vc.is_playing() or vc.is_paused()):
        first = tracks[0]
        for t in tracks[1:]:
            queue.add(t)
        await _start_playing(queue, first, guild_id, text_channel)
    else:
        for t in tracks:
            queue.add(t)

    # Summary embed
    embed = discord.Embed(
        title="Playlist Queued",
        description=f"**{playlist_title}**",
        color=0x00FF88,
    )
    embed.add_field(name="Tracks", value=str(len(tracks)), inline=True)
    embed.add_field(name="Requested by", value=requester, inline=True)
    await text_channel.send(embed=embed)

    # Refresh controls
    await _send_or_update_controls(queue, text_channel, guild_id, force_new=True)


async def _progress_updater(guild_id: int) -> None:
    """Background: refresh the now-playing embed every 10s for progress bar."""
    while True:
        await asyncio.sleep(5)
        queue = _get_queue(guild_id)
        if not queue.current:
            break
        vc = queue.voice_client
        if not vc or not vc.is_connected() or (not vc.is_playing() and not vc.is_paused()):
            break
        if queue.control_message and queue.control_channel:
            embed = _build_now_playing_embed(queue)
            try:
                await queue.control_message.edit(embed=embed, view=MusicControlView(guild_id))
            except (discord.NotFound, discord.HTTPException):
                break


async def _backfill_queue_metadata(queue: MusicQueue) -> None:
    """Background: extract duration/thumbnail for upcoming queue tracks."""
    import yt_dlp
    opts = {"format": "bestaudio/best", "quiet": True, "no_warnings": True}
    loop = asyncio.get_running_loop()
    for track in list(queue.tracks[:10]):
        if track.get("duration") and track["duration"] > 0:
            continue
        url = track.get("webpage_url") or track.get("url", "")
        if not url:
            continue
        try:
            info = await loop.run_in_executor(None, lambda u=url: (
                yt_dlp.YoutubeDL(opts).extract_info(u, download=False)
            ))
            if info:
                track["duration"] = info.get("duration", 0)
                if not track.get("thumbnail"):
                    track["thumbnail"] = info.get("thumbnail", "")
        except Exception:
            pass
        await asyncio.sleep(1)


async def _start_playing(queue: MusicQueue, track: dict, guild_id: int, text_channel: discord.abc.Messageable, seek_to: float = 0) -> None:
    """Start playing a track and send controls. Optional seek_to in seconds."""
    vc = queue.voice_client
    if not vc or not vc.is_connected():
        return

    queue.current = track
    loop = asyncio.get_running_loop()
    audio_url, info = await loop.run_in_executor(None, lambda: _extract_audio_url(track["webpage_url"]))
    if not audio_url:
        await text_channel.send(f"Couldn't extract audio for **{track['title']}**")
        next_track = queue.next()
        if next_track:
            await _start_playing(queue, next_track, guild_id, text_channel)
        return

    # Backfill metadata from full extraction (fixes playlist duration bug)
    if info:
        if not track.get("duration") or track["duration"] == 0:
            track["duration"] = info.get("duration", 0)
        if not track.get("thumbnail"):
            track["thumbnail"] = info.get("thumbnail", "")

    # FFmpeg options — with optional seek
    if seek_to > 0:
        ffmpeg_opts = {
            "before_options": f"-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5 -ss {int(seek_to)}",
            "options": "-vn",
        }
        queue.start_time = time.time() - seek_to
    else:
        ffmpeg_opts = FFMPEG_OPTIONS
        queue.start_time = time.time()
    queue.pause_offset = 0.0

    source = discord.FFmpegPCMAudio(audio_url, **ffmpeg_opts)
    source = discord.PCMVolumeTransformer(source, volume=queue.volume)

    # Capture the event loop NOW (async context) — after_play runs in the
    # FFmpeg audio thread where _bot.loop returns a _LoopSentinel in discord.py 2.7+
    event_loop = asyncio.get_running_loop()

    def after_play(error: Optional[Exception]) -> None:
        if error:
            logger.error("Playback error: %s", error)
        try:
            asyncio.run_coroutine_threadsafe(_on_track_end(guild_id), event_loop)
        except Exception as e:
            logger.error("Failed to schedule next track: %s", e)

    vc.play(source, after=after_play)

    if vc.guild:
        await _set_deaf(vc.guild, vc, True)

    await _send_or_update_controls(queue, text_channel, guild_id)

    # Cancel old background tasks
    if queue._progress_task and not queue._progress_task.done():
        queue._progress_task.cancel()
    if queue._backfill_task and not queue._backfill_task.done():
        queue._backfill_task.cancel()

    # Start progress bar auto-refresh (every 30s)
    queue._progress_task = asyncio.create_task(_progress_updater(guild_id))

    # Start background metadata backfill for queued tracks
    if any(not t.get("duration") or t["duration"] == 0 for t in queue.tracks[:10]):
        queue._backfill_task = asyncio.create_task(_backfill_queue_metadata(queue))


async def _on_track_end(guild_id: int) -> None:
    """Called when a track finishes. Handles loop modes, stats, next track."""
    queue = _get_queue(guild_id)

    # Seeking flag — don't advance, just return
    if queue.seeking:
        queue.seeking = False
        return

    finished = queue.current

    # Record play in stats DB
    if finished:
        try:
            db = _get_db()
            db.execute(
                "INSERT INTO play_history (guild_id, user_id, track_title, track_url, duration) VALUES (?, ?, ?, ?, ?)",
                (guild_id, finished.get("requester_id"), finished.get("title", ""),
                 finished.get("webpage_url", ""), finished.get("duration", 0)),
            )
            db.commit()
            db.close()
        except Exception:
            pass

    # Loop mode: "one" — replay same track
    if queue.loop_mode == "one" and finished:
        if queue.voice_client and queue.voice_client.is_connected():
            channel = queue.control_channel or queue.voice_client.channel
            await _start_playing(queue, finished, guild_id, channel)
        return

    # Add to history
    if finished:
        queue.history.append(finished)
        # Loop mode: "all" — recycle to end of queue
        if queue.loop_mode == "all":
            queue.tracks.append(finished)

    next_track = queue.next()
    if next_track and queue.voice_client and queue.voice_client.is_connected():
        channel = queue.control_channel or queue.voice_client.channel
        await _start_playing(queue, next_track, guild_id, channel)
    elif queue.autoplay and finished and queue.voice_client and queue.voice_client.is_connected():
        channel = queue.control_channel or queue.voice_client.channel
        await _autoplay_next(queue, finished, guild_id, channel)
    else:
        queue.current = None
        vc = queue.voice_client
        if vc and vc.is_connected() and vc.guild:
            await _set_deaf(vc.guild, vc, False)
        if queue.control_message and queue.control_channel:
            try:
                embed = _build_now_playing_embed(queue)
                await queue.control_message.edit(embed=embed, view=MusicControlView(guild_id))
            except (discord.NotFound, discord.HTTPException):
                pass


async def _autoplay_next(queue: MusicQueue, last_track: dict, guild_id: int, channel) -> None:
    """Find and play related tracks when queue empties and autoplay is on."""
    last_id = last_track.get("id", "")
    last_title = last_track.get("title", "")
    if not last_title:
        queue.current = None
        return

    loop = asyncio.get_running_loop()

    # Try YouTube Mix first
    if last_id:
        try:
            mix_url = f"https://www.youtube.com/watch?v={last_id}&list=RD{last_id}"
            _, tracks = await loop.run_in_executor(None, lambda: _extract_playlist_tracks(mix_url))
            tracks = [t for t in tracks if t.get("id") != last_id][:5]
            if tracks:
                for t in tracks:
                    t["requester"] = "Autoplay"
                    queue.add(t)
                first = queue.next()
                if first:
                    await _start_playing(queue, first, guild_id, channel)
                    return
        except Exception:
            pass

    # Fallback: search YouTube
    try:
        track = await loop.run_in_executor(None, lambda: _search_youtube(f"{last_title} mix"))
        if track:
            track["requester"] = "Autoplay"
            await _start_playing(queue, track, guild_id, channel)
            return
    except Exception:
        pass

    queue.current = None
    vc = queue.voice_client
    if vc and vc.is_connected() and vc.guild:
        await _set_deaf(vc.guild, vc, False)


async def _play_next(guild_id: int) -> None:
    """Legacy wrapper."""
    await _on_track_end(guild_id)


# ── Slash Commands ───────────────────────────────────────────────────


async def _play_autocomplete(interaction: discord.Interaction, current: str) -> list[app_commands.Choice[str]]:
    """YouTube search autocomplete for /play command."""
    if len(current) < 3:
        return []

    # Skip autocomplete for comma-separated multi-song input
    if ',' in current:
        return []

    loop = asyncio.get_running_loop()
    try:
        results = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: _search_youtube_multi(current)),
            timeout=2.8,
        )
    except (asyncio.TimeoutError, Exception):
        return []

    choices = []
    for r in results[:5]:
        name = f"{r['title']} [{r['duration_str']}]"
        if len(name) > 100:
            name = name[:97] + "..."
        url = r["url"]
        if len(url) > 100:
            url = url[:100]
        choices.append(app_commands.Choice(name=name, value=url))
    return choices


def _split_multi_query(query: str) -> list[str]:
    """Split comma-separated songs into individual searches.

    Examples:
      'ispy, last dance, party in the usa' -> ['ispy', 'last dance', 'party in the usa']
      'american idiot'                     -> ['american idiot']
      'https://youtube.com/...'            -> ['https://youtube.com/...']
    """
    # Don't split URLs
    if query.startswith(("http://", "https://")):
        return [query]

    if ',' in query:
        songs = [p.strip() for p in query.split(',') if p.strip()]
        if len(songs) > 1:
            return songs

    return [query]


@app_commands.command(name="play", description="Search and play music in your voice channel")
@app_commands.describe(query="Song name, URL, or comma-separated songs")
@app_commands.autocomplete(query=_play_autocomplete)
async def _play_cmd(interaction: discord.Interaction, query: str) -> None:
    member = interaction.user
    if not isinstance(member, discord.Member) or not member.voice:
        await interaction.response.send_message("You need to be in a voice channel!", ephemeral=True)
        return

    voice_channel = member.voice.channel
    if not voice_channel or not interaction.guild:
        await interaction.response.send_message("Couldn't find your voice channel!", ephemeral=True)
        return

    await interaction.response.defer()

    queries = _split_multi_query(query)
    try:
        for q in queries:
            await _play_music(
                query=q,
                guild=interaction.guild,
                voice_channel=voice_channel,
                text_channel=interaction.channel,
                requester=member.display_name,
                requester_id=member.id,
            )
    except Exception as e:
        logger.error("Play command failed: %s", e)
    finally:
        try:
            await interaction.delete_original_response()
        except discord.HTTPException:
            pass


@app_commands.command(name="skip", description="Skip the current track")
async def _skip_cmd(interaction: discord.Interaction) -> None:
    if not interaction.guild:
        await interaction.response.send_message("This command only works in a server!", ephemeral=True)
        return
    queue = _get_queue(interaction.guild.id)
    vc = queue.voice_client
    if not vc or not (vc.is_playing() or vc.is_paused()):
        await interaction.response.send_message("Nothing is playing right now!", ephemeral=True)
        return
    skipped = queue.current
    vc.stop()  # triggers after_play -> next track
    title = skipped["title"] if skipped else "current track"
    await interaction.response.send_message(f"Skipped **{title}**")


@app_commands.command(name="queue", description="Show the current music queue")
async def _queue_cmd(interaction: discord.Interaction) -> None:
    if not interaction.guild:
        await interaction.response.send_message("This command only works in a server!", ephemeral=True)
        return
    queue = _get_queue(interaction.guild.id)
    embed = _build_now_playing_embed(queue)
    await interaction.response.send_message(embed=embed)


@app_commands.command(name="stop", description="Stop music and clear the queue")
async def _stop_cmd(interaction: discord.Interaction) -> None:
    if not interaction.guild:
        await interaction.response.send_message("This command only works in a server!", ephemeral=True)
        return
    queue = _get_queue(interaction.guild.id)
    queue.clear()
    vc = queue.voice_client
    if vc and (vc.is_playing() or vc.is_paused()):
        vc.stop()
    # Undeafen when music stops (also starts voice listening via _set_deaf)
    if vc and vc.is_connected() and vc.guild:
        await _set_deaf(vc.guild, vc, False)
    await interaction.response.send_message("Music stopped and queue cleared!")


@app_commands.command(name="volume", description="Set the music volume")
@app_commands.describe(level="Volume level from 0 to 200")
async def _volume_cmd(interaction: discord.Interaction, level: int) -> None:
    if not interaction.guild:
        await interaction.response.send_message("This command only works in a server!", ephemeral=True)
        return
    level = max(0, min(200, level))
    queue = _get_queue(interaction.guild.id)
    queue.volume = level / 100.0
    vc = queue.voice_client
    if vc and vc.source and isinstance(vc.source, discord.PCMVolumeTransformer):
        vc.source.volume = queue.volume
    await interaction.response.send_message(f"Volume set to **{level}%**")


@app_commands.command(name="ask", description="Ask BMO anything!")
@app_commands.describe(question="Your question for BMO")
async def _ask_cmd(interaction: discord.Interaction, question: str) -> None:
    await interaction.response.defer()
    channel_id = interaction.channel_id or 0
    try:
        response = await _ai_respond(channel_id, question)

        # Check for [PLAY:...] tag
        play_match = re.search(r'\[PLAY:(.+?)\]', response)
        if play_match and interaction.guild:
            query = play_match.group(1).strip()
            visible = re.sub(r'\s*\[PLAY:.+?\]\s*', '', response).strip()
            if visible:
                await interaction.followup.send(visible)

            member = interaction.user
            if isinstance(member, discord.Member) and member.voice and member.voice.channel:
                await _play_music(
                    query=query,
                    guild=interaction.guild,
                    voice_channel=member.voice.channel,
                    text_channel=interaction.channel,
                    requester=member.display_name,
                    requester_id=member.id,
                )
            else:
                await interaction.followup.send("I'd play that, but you need to be in a voice channel!")
            return

        if len(response) <= 1990:
            await interaction.followup.send(response)
        else:
            for i in range(0, len(response), 1990):
                await interaction.followup.send(response[i:i + 1990])

        if interaction.guild and _bot:
            queue = _get_queue(interaction.guild.id)
            if queue.voice_client and queue.voice_client.is_connected() and not queue.voice_client.is_playing():
                tts_text = response[:200] if len(response) > 200 else response
                await _bot.speak_in_vc(interaction.guild.id, tts_text)
    except Exception as e:
        logger.error("Ask command failed: %s", e)
        await interaction.followup.send("Beep boop... something went wrong! Try again?")


@app_commands.command(name="join", description="Join your voice channel")
async def _join_cmd(interaction: discord.Interaction) -> None:
    member = interaction.user
    if not isinstance(member, discord.Member) or not member.voice:
        await interaction.response.send_message("You need to be in a voice channel!", ephemeral=True)
        return

    voice_channel = member.voice.channel
    if not voice_channel or not interaction.guild:
        await interaction.response.send_message("Couldn't find your voice channel!", ephemeral=True)
        return

    await interaction.response.defer()

    vc = await _ensure_voice(interaction.guild, voice_channel)
    if vc:
        # Start voice listening only if not currently playing music
        if not vc.is_playing() and not vc.is_paused():
            _start_listener(interaction.guild, vc)
        await interaction.followup.send(f"Joined **{voice_channel.name}**!")
    else:
        await interaction.followup.send("Couldn't join your voice channel!")


@app_commands.command(name="leave", description="Leave the voice channel")
async def _leave_cmd(interaction: discord.Interaction) -> None:
    if not interaction.guild:
        await interaction.response.send_message("This command only works in a server!", ephemeral=True)
        return

    guild_id = interaction.guild.id
    queue = _get_queue(guild_id)
    queue.clear()

    vc = queue.voice_client
    if vc and vc.is_connected():
        # Stop listening before disconnecting
        if queue.listener_sink:
            _stop_listener(guild_id, vc)
        await vc.disconnect()
        queue.voice_client = None
        await interaction.response.send_message("See ya later!")
    else:
        await interaction.response.send_message("I'm not in a voice channel!", ephemeral=True)


@app_commands.command(name="help", description="Show all available BMO commands")
async def _help_cmd(interaction: discord.Interaction) -> None:
    embed = discord.Embed(title="BMO Commands 🤖", color=0x7B68EE)
    sections = {
        "🎵 Music": (
            "**/play** `<query>` — Search & play a song, URL, or comma-separated songs\n"
            "**/skip** — Skip the current track\n"
            "**/stop** — Stop music and clear the queue\n"
            "**/queue** — Show the current queue\n"
            "**/nowplaying** — Show what's currently playing\n"
            "**/volume** `<0-200>` — Set the volume\n"
            "**/seek** `<timestamp>` — Seek to a position (e.g. 1:23)\n"
            "**/replay** — Restart the current track\n"
            "**/skipto** `<position>` — Skip to a queue position\n"
            "**/remove** `<position>` — Remove a track from the queue\n"
            "**/move** `<from> <to>` — Move a track in the queue\n"
            "**/lyrics** — Get lyrics for the current song\n"
            "**/autoplay** — Toggle autoplay when queue ends\n"
            "**/sfx** `<name>` — Play a sound effect"
        ),
        "💾 Playlists": (
            "**/playlist save** `<name>` — Save current queue as a playlist\n"
            "**/playlist load** `<name>` — Load a saved playlist\n"
            "**/playlist list** — Show your saved playlists\n"
            "**/playlist delete** `<name>` — Delete a playlist\n"
            "**/playlist append** `<name>` — Add queue to existing playlist"
        ),
        "🎮 Fun & Games": (
            "**/8ball** `<question>` — Ask the magic 8-ball\n"
            "**/coinflip** — Flip a coin\n"
            "**/trivia** `[category]` — Start a trivia question\n"
            "**/wyr** — Would you rather...\n"
            "**/musicquiz** — Guess the song from a 15s clip\n"
            "**/rps** `@opponent` — Rock Paper Scissors\n"
            "**/blackjack** — Play Blackjack vs the dealer\n"
            "**/slots** — Spin the slot machine for XP\n"
            "**/hangman** — Play Hangman\n"
            "**/wordle** — Guess the 5-letter word\n"
            "**/connect4** `@opponent` — Play Connect 4\n"
            "**/guessthemovie** `[mode]` — Guess the movie (screenshot or audio)\n"
            "**/guesstheshow** `[mode]` — Guess the TV show (screenshot or audio)\n"
            "**/guesstheanime** `[mode]` — Guess the anime (screenshot or audio)\n"
            "**/guessthegame** `[mode]` — Guess the video game (screenshot or audio)"
        ),
        "📺 Anime & Manga": (
            "**/anime** `<title>` — Look up an anime\n"
            "**/animerec** `<title>` — Recommendations based on an anime\n"
            "**/animetop** `[filter]` — Top anime\n"
            "**/animeseason** — This season's anime\n"
            "**/randomanime** — Random anime suggestion\n"
            "**/manga** `<title>` — Look up a manga"
        ),
        "🎬 Movies": (
            "**/movie** `<title>` — Look up a movie\n"
            "**/movierec** `<title>` — Recommendations based on a movie\n"
            "**/movietop** — Top rated movies\n"
            "**/movietrending** — Trending movies this week\n"
            "**/randommovie** — Random movie suggestion"
        ),
        "📺 TV Shows": (
            "**/tv** `<title>` — Look up a TV show\n"
            "**/tvrec** `<title>` — Recommendations based on a show\n"
            "**/tvtop** — Top rated TV shows\n"
            "**/tvtrending** — Trending TV shows this week\n"
            "**/randomtv** — Random TV show suggestion"
        ),
        "📚 Books": (
            "**/book** `<title>` — Look up a book\n"
            "**/bookrec** `<title>` — Find similar books\n"
            "**/booktop** — Trending books\n"
            "**/randombook** — Random book suggestion"
        ),
        "🎮 Video Games": (
            "**/game** `<title>` — Look up a video game\n"
            "**/gamerec** `<title>` — Recommendations based on a game\n"
            "**/gametop** — Top rated games of all time\n"
            "**/gametrending** — Trending games this year\n"
            "**/randomgame** — Random game suggestion"
        ),
        "🌸 Anime Extras": (
            "**/waifu** — Random waifu image\n"
            "**/husbando** — Random husbando image\n"
            "**/animequote** — Random anime quote\n"
            "**/schedule** — Currently airing anime schedule\n"
            "**/watchlist add** `<title>` — Add to your watchlist\n"
            "**/watchlist remove** `<title>` — Remove from watchlist\n"
            "**/watchlist show** — Show your watchlist"
        ),
        "🖼️ Media & Reddit": (
            "**/meme** `[subreddit]` — Random meme\n"
            "**/reddit** `<subreddit>` — Random post from a subreddit\n"
            "**/wallpaper** `[category]` — Random wallpaper\n"
            "**/trailer** `<title>` — Search for a trailer"
        ),
        "🎂 Birthdays": (
            "**/birthday set** `<month> <day>` — Set your birthday\n"
            "**/birthday list** — Upcoming birthdays"
        ),
        "🔗 Integrations": (
            "**/twitch** `<username>` — Check if a Twitch streamer is live\n"
            "**/steam** `<username>` — Look up a Steam profile"
        ),
        "👤 Profile & XP": (
            "**/profile** `[@user]` — View your profile or another user's\n"
            "**/leaderboard** — Top 10 users by XP"
        ),
        "📊 Utility": (
            "**/poll** `<question> <options>` — Create a poll (2-4 options)\n"
            "**/remind** `<time> <message>` — Set a reminder (e.g. 30m, 2h, 1d)"
        ),
        "🔍 Other": (
            "**/ask** `<question>` — Ask BMO anything\n"
            "**/stats** `[server]` — Show listening stats"
        ),
        "🔊 Voice": (
            "**/join** — Join your voice channel\n"
            "**/leave** — Leave the voice channel"
        ),
    }
    for name, value in sections.items():
        embed.add_field(name=name, value=value, inline=False)
    embed.set_footer(text="Tip: You can also @mention BMO to chat!")
    await interaction.response.send_message(embed=embed)


# ── Phase 2: Queue Management Commands ──────────────────────────────


@app_commands.command(name="remove", description="Remove a track from the queue")
@app_commands.describe(position="Queue position (1-based)")
async def _remove_cmd(interaction: discord.Interaction, position: int) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    queue = _get_queue(interaction.guild.id)
    if position < 1 or position > len(queue.tracks):
        await interaction.response.send_message(
            f"Invalid position! Queue has {len(queue.tracks)} tracks.", ephemeral=True)
        return
    removed = queue.tracks.pop(position - 1)
    await interaction.response.send_message(f"Removed **{removed['title']}** from #{position}")
    await _send_or_update_controls(queue, interaction.channel, interaction.guild.id)


@app_commands.command(name="move", description="Move a track to a different queue position")
@app_commands.describe(from_pos="Current position", to_pos="New position")
async def _move_cmd(interaction: discord.Interaction, from_pos: int, to_pos: int) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    queue = _get_queue(interaction.guild.id)
    n = len(queue.tracks)
    if from_pos < 1 or from_pos > n or to_pos < 1 or to_pos > n:
        await interaction.response.send_message(
            f"Invalid position! Queue has {n} tracks.", ephemeral=True)
        return
    track = queue.tracks.pop(from_pos - 1)
    queue.tracks.insert(to_pos - 1, track)
    await interaction.response.send_message(
        f"Moved **{track['title']}** from #{from_pos} to #{to_pos}")
    await _send_or_update_controls(queue, interaction.channel, interaction.guild.id)


@app_commands.command(name="nowplaying", description="Show what's currently playing")
async def _nowplaying_cmd(interaction: discord.Interaction) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    queue = _get_queue(interaction.guild.id)
    if not queue.current:
        await interaction.response.send_message("Nothing is playing right now!", ephemeral=True)
        return
    track = queue.current
    vc = queue.voice_client
    is_paused = vc and vc.is_paused()
    duration = track.get("duration", 0) or 0

    embed = discord.Embed(
        title="Paused ⏸️" if is_paused else "Now Playing 🎵",
        color=0xFFAA00 if is_paused else 0x7B68EE,
    )
    webpage_url = track.get("webpage_url", "")
    if webpage_url:
        embed.description = f"**[{track['title']}]({webpage_url})**"
    else:
        embed.description = f"**{track['title']}**"

    if duration > 0:
        if is_paused:
            elapsed = queue.pause_offset
        elif queue.start_time > 0:
            elapsed = time.time() - queue.start_time
        else:
            elapsed = 0
        embed.add_field(
            name="Progress",
            value=f"{_format_duration(elapsed)} / {_format_duration(duration)}",
            inline=True,
        )

    if track.get("requester"):
        embed.add_field(name="Requested by", value=track["requester"], inline=True)
    if track.get("thumbnail"):
        embed.set_thumbnail(url=track["thumbnail"])

    await interaction.response.send_message(embed=embed)


@app_commands.command(name="autoplay", description="Toggle autoplay (plays related tracks when queue ends)")
async def _autoplay_cmd(interaction: discord.Interaction) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    queue = _get_queue(interaction.guild.id)
    queue.autoplay = not queue.autoplay
    status = "enabled" if queue.autoplay else "disabled"
    await interaction.response.send_message(f"🔄 Autoplay **{status}**!")


# ── Phase 3: Soundboard + 8ball + Coinflip + Anime ──────────────────


async def _sfx_autocomplete(interaction: discord.Interaction, current: str) -> list[app_commands.Choice[str]]:
    choices = []
    for f in sorted(SFX_DIR.glob("*.*")):
        name = f.stem
        if current.lower() in name.lower():
            choices.append(app_commands.Choice(name=name, value=name))
    return choices[:25]


@app_commands.command(name="sfx", description="Play a sound effect")
@app_commands.describe(name="Sound effect name")
@app_commands.autocomplete(name=_sfx_autocomplete)
async def _sfx_cmd(interaction: discord.Interaction, name: str) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return

    matches = list(SFX_DIR.glob(f"{name}.*"))
    if not matches:
        available = [f.stem for f in SFX_DIR.glob("*.*")]
        if available:
            await interaction.response.send_message(
                f"SFX `{name}` not found! Available: {', '.join(available)}", ephemeral=True)
        else:
            await interaction.response.send_message(
                "No sound effects! Add .mp3 files to `~/home-lab/bmo/pi/data/sfx/`", ephemeral=True)
        return

    sfx_path = str(matches[0])
    member = interaction.user
    if not isinstance(member, discord.Member) or not member.voice:
        await interaction.response.send_message("Join a voice channel first!", ephemeral=True)
        return

    queue = _get_queue(interaction.guild.id)
    vc = await _ensure_voice(interaction.guild, member.voice.channel)
    if not vc:
        await interaction.response.send_message("Couldn't join voice!", ephemeral=True)
        return

    await interaction.response.send_message(f"🔊 **{name}**!")

    # If music is playing, stop temporarily and resume after SFX
    was_playing = vc.is_playing()
    saved_track = queue.current
    saved_position = 0.0

    if was_playing and saved_track:
        saved_position = time.time() - queue.start_time
        queue.seeking = True
        vc.stop()
        await asyncio.sleep(0.2)

    # Play SFX
    done_event = asyncio.Event()
    event_loop = asyncio.get_running_loop()

    def after_sfx(error):
        event_loop.call_soon_threadsafe(done_event.set)

    sfx_source = discord.FFmpegPCMAudio(sfx_path)
    sfx_source = discord.PCMVolumeTransformer(sfx_source, volume=min(queue.volume * 1.5, 2.0))
    vc.play(sfx_source, after=after_sfx)

    try:
        await asyncio.wait_for(done_event.wait(), timeout=30)
    except asyncio.TimeoutError:
        if vc.is_playing():
            vc.stop()

    # Resume music at saved position
    if was_playing and saved_track:
        await asyncio.sleep(0.2)
        await _start_playing(queue, saved_track, interaction.guild.id,
                             interaction.channel, seek_to=saved_position)


_8BALL_RESPONSES = [
    "It is certain! ✨", "It is decidedly so! 🌟", "Without a doubt! 💫",
    "Yes — definitely! 🎮", "You may rely on it! 🤖", "As I see it, yes! 👀",
    "Most likely! 🎯", "Outlook good! 🌈", "Yes! ✅", "Signs point to yes! 🔮",
    "Reply hazy, try again... 🌫️", "Ask again later! ⏰",
    "Better not tell you now... 🤫", "Cannot predict now! 🎲",
    "Concentrate and ask again! 🧘",
    "Don't count on it! 🚫", "My reply is no! ❌", "My sources say no! 📡",
    "Outlook not so good... 😬", "Very doubtful! 🤔",
    "BMO says YES! Beep boop! 🤖", "BMO's circuits say... MAYBE! ⚡",
    "BMO consulted the cosmic owl... it's a no! 🦉",
    "The answer is inside you, friend! 💖",
]


@app_commands.command(name="8ball", description="Ask the magic 8-ball a question")
@app_commands.describe(question="Your yes/no question")
async def _8ball_cmd(interaction: discord.Interaction, question: str) -> None:
    answer = random.choice(_8BALL_RESPONSES)
    embed = discord.Embed(title="🎱 Magic 8-Ball", color=0x1a1a2e)
    embed.add_field(name="Question", value=question, inline=False)
    embed.add_field(name="Answer", value=answer, inline=False)
    await interaction.response.send_message(embed=embed)


@app_commands.command(name="coinflip", description="Flip a coin!")
async def _coinflip_cmd(interaction: discord.Interaction) -> None:
    result = random.choice(["Heads", "Tails"])
    embed = discord.Embed(
        title="🪙 Coin Flip",
        description=f"**{result}!**",
        color=0xFFD700,
    )
    await interaction.response.send_message(embed=embed)


@app_commands.command(name="anime", description="Look up an anime on MyAnimeList")
@app_commands.describe(title="Anime title to search for")
async def _anime_cmd(interaction: discord.Interaction, title: str) -> None:
    await interaction.response.defer()
    import requests as req
    try:
        loop = asyncio.get_running_loop()
        r = await loop.run_in_executor(None, lambda: req.get(
            f"https://api.jikan.moe/v4/anime?q={title}&limit=1&sfw=true", timeout=10,
        ))
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        await interaction.followup.send(f"Couldn't search for anime: {e}")
        return

    results = data.get("data", [])
    if not results:
        await interaction.followup.send(f"No anime found for: **{title}**")
        return

    anime = results[0]
    jp_title = anime.get("title") or "Unknown"
    en_title = anime.get("title_english") or ""
    synopsis = anime.get("synopsis") or "No synopsis available."
    if len(synopsis) > 400:
        synopsis = synopsis[:400] + "..."
    score = anime.get("score") or "N/A"
    episodes = anime.get("episodes") or "?"
    status = anime.get("status") or "Unknown"
    genres = ", ".join(g["name"] for g in (anime.get("genres") or [])[:5]) or "N/A"
    mal_url = anime.get("url") or ""
    cover = (anime.get("images", {}).get("jpg", {}).get("large_image_url")
             or anime.get("images", {}).get("jpg", {}).get("image_url", ""))

    title_display = jp_title
    if en_title and en_title != jp_title:
        title_display = f"{en_title}\n*{jp_title}*"

    embed = discord.Embed(title=title_display, url=mal_url, color=0x2E51A2)
    embed.description = synopsis
    embed.add_field(name="⭐ Score", value=str(score), inline=True)
    embed.add_field(name="📺 Episodes", value=str(episodes), inline=True)
    embed.add_field(name="📡 Status", value=status, inline=True)
    embed.add_field(name="🏷️ Genres", value=genres, inline=False)
    if cover:
        embed.set_thumbnail(url=cover)
    if mal_url:
        embed.add_field(name="🔗 MAL", value=f"[View on MyAnimeList]({mal_url})", inline=False)

    await interaction.followup.send(embed=embed)


@app_commands.command(name="animerec", description="Get anime recommendations based on a title")
@app_commands.describe(title="Anime to get recommendations for")
async def _animerec_cmd(interaction: discord.Interaction, title: str) -> None:
    await interaction.response.defer()
    import requests as req
    loop = asyncio.get_running_loop()

    # Step 1: Search for the anime to get its ID
    try:
        r = await loop.run_in_executor(None, lambda: req.get(
            f"https://api.jikan.moe/v4/anime?q={title}&limit=1&sfw=true", timeout=10,
        ))
        r.raise_for_status()
        results = r.json().get("data", [])
    except Exception as e:
        await interaction.followup.send(f"Search failed: {e}")
        return

    if not results:
        await interaction.followup.send(f"No anime found for: **{title}**")
        return

    anime = results[0]
    anime_id = anime["mal_id"]
    anime_title = anime.get("title", title)

    # Step 2: Get recommendations (rate limit: Jikan needs 1s between calls)
    await asyncio.sleep(1)
    try:
        r = await loop.run_in_executor(None, lambda: req.get(
            f"https://api.jikan.moe/v4/anime/{anime_id}/recommendations", timeout=10,
        ))
        r.raise_for_status()
        recs = r.json().get("data", [])
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch recommendations: {e}")
        return

    if not recs:
        await interaction.followup.send(f"No recommendations found for **{anime_title}**")
        return

    embed = discord.Embed(
        title=f"📺 If you liked {anime_title}...",
        color=0x2E51A2,
    )
    lines = []
    for rec in recs[:10]:
        entry = rec.get("entry", {})
        name = entry.get("title", "Unknown")
        url = entry.get("url", "")
        votes = rec.get("votes", 0)
        if url:
            lines.append(f"**[{name}]({url})** — {votes} votes")
        else:
            lines.append(f"**{name}** — {votes} votes")

    embed.description = "\n".join(lines)
    cover = anime.get("images", {}).get("jpg", {}).get("image_url", "")
    if cover:
        embed.set_thumbnail(url=cover)
    embed.set_footer(text="Recommendations from MyAnimeList")
    await interaction.followup.send(embed=embed)


@app_commands.command(name="animetop", description="Show top rated anime")
@app_commands.describe(filter="Filter type")
@app_commands.choices(filter=[
    app_commands.Choice(name="By Score", value=""),
    app_commands.Choice(name="Most Popular", value="bypopularity"),
    app_commands.Choice(name="Currently Airing", value="airing"),
    app_commands.Choice(name="Upcoming", value="upcoming"),
    app_commands.Choice(name="Most Favorited", value="favorite"),
])
async def _animetop_cmd(interaction: discord.Interaction, filter: str = "") -> None:
    await interaction.response.defer()
    import requests as req
    url = "https://api.jikan.moe/v4/top/anime?limit=10&sfw=true"
    if filter:
        url += f"&filter={filter}"
    try:
        loop = asyncio.get_running_loop()
        r = await loop.run_in_executor(None, lambda: req.get(url, timeout=10))
        r.raise_for_status()
        data = r.json().get("data", [])
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch top anime: {e}")
        return

    if not data:
        await interaction.followup.send("No results found!")
        return

    filter_names = {
        "": "Top Rated", "bypopularity": "Most Popular",
        "airing": "Currently Airing", "upcoming": "Upcoming",
        "favorite": "Most Favorited",
    }
    embed = discord.Embed(
        title=f"🏆 {filter_names.get(filter, 'Top')} Anime",
        color=0xFFD700,
    )
    lines = []
    for i, a in enumerate(data[:10], 1):
        name = a.get("title", "Unknown")
        score = a.get("score") or "N/A"
        episodes = a.get("episodes") or "?"
        url = a.get("url", "")
        if url:
            lines.append(f"`{i}.` **[{name}]({url})** — ⭐ {score} ({episodes} eps)")
        else:
            lines.append(f"`{i}.` **{name}** — ⭐ {score} ({episodes} eps)")

    embed.description = "\n".join(lines)
    await interaction.followup.send(embed=embed)


@app_commands.command(name="animeseason", description="Show this season's anime")
async def _animeseason_cmd(interaction: discord.Interaction) -> None:
    await interaction.response.defer()
    import requests as req
    try:
        loop = asyncio.get_running_loop()
        r = await loop.run_in_executor(None, lambda: req.get(
            "https://api.jikan.moe/v4/seasons/now?limit=10&sfw=true", timeout=10,
        ))
        r.raise_for_status()
        data = r.json().get("data", [])
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch seasonal anime: {e}")
        return

    if not data:
        await interaction.followup.send("No seasonal anime found!")
        return

    embed = discord.Embed(title="📺 This Season's Anime", color=0x00BFFF)
    lines = []
    for i, a in enumerate(data[:10], 1):
        name = a.get("title", "Unknown")
        score = a.get("score") or "N/A"
        episodes = a.get("episodes") or "?"
        genres = ", ".join(g["name"] for g in a.get("genres", [])[:3]) or "N/A"
        url = a.get("url", "")
        if url:
            lines.append(f"`{i}.` **[{name}]({url})**\n    ⭐ {score} | {episodes} eps | {genres}")
        else:
            lines.append(f"`{i}.` **{name}**\n    ⭐ {score} | {episodes} eps | {genres}")

    embed.description = "\n".join(lines)
    await interaction.followup.send(embed=embed)


@app_commands.command(name="randomanime", description="Get a random anime suggestion!")
async def _randomanime_cmd(interaction: discord.Interaction) -> None:
    await interaction.response.defer()
    import requests as req
    try:
        loop = asyncio.get_running_loop()
        r = await loop.run_in_executor(None, lambda: req.get(
            "https://api.jikan.moe/v4/random/anime", timeout=10,
        ))
        r.raise_for_status()
        anime = r.json().get("data", {})
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch random anime: {e}")
        return

    if not anime:
        await interaction.followup.send("Couldn't find anything! Try again.")
        return

    jp_title = anime.get("title", "Unknown")
    en_title = anime.get("title_english") or ""
    synopsis = anime.get("synopsis") or "No synopsis available."
    if len(synopsis) > 400:
        synopsis = synopsis[:400] + "..."
    score = anime.get("score") or "N/A"
    episodes = anime.get("episodes") or "?"
    status = anime.get("status") or "Unknown"
    genres = ", ".join(g["name"] for g in (anime.get("genres") or [])[:5]) or "N/A"
    mal_url = anime.get("url") or ""
    cover = (anime.get("images", {}).get("jpg", {}).get("large_image_url")
             or anime.get("images", {}).get("jpg", {}).get("image_url", ""))

    title_display = jp_title
    if en_title and en_title != jp_title:
        title_display = f"{en_title}\n*{jp_title}*"

    embed = discord.Embed(title=f"🎲 Random Anime: {title_display}", url=mal_url or discord.Embed.Empty, color=0xFF6B6B)
    embed.description = synopsis
    embed.add_field(name="⭐ Score", value=str(score), inline=True)
    embed.add_field(name="📺 Episodes", value=str(episodes), inline=True)
    embed.add_field(name="📡 Status", value=status, inline=True)
    embed.add_field(name="🏷️ Genres", value=genres, inline=False)
    if cover:
        embed.set_image(url=cover)
    if mal_url:
        embed.set_footer(text="View on MyAnimeList", icon_url="https://cdn.myanimelist.net/img/sp/icon/apple-touch-icon-256.png")

    await interaction.followup.send(embed=embed)


@app_commands.command(name="manga", description="Look up a manga on MyAnimeList")
@app_commands.describe(title="Manga title to search for")
async def _manga_cmd(interaction: discord.Interaction, title: str) -> None:
    await interaction.response.defer()
    import requests as req
    try:
        loop = asyncio.get_running_loop()
        r = await loop.run_in_executor(None, lambda: req.get(
            f"https://api.jikan.moe/v4/manga?q={title}&limit=1&sfw=true", timeout=10,
        ))
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        await interaction.followup.send(f"Couldn't search for manga: {e}")
        return

    results = data.get("data", [])
    if not results:
        await interaction.followup.send(f"No manga found for: **{title}**")
        return

    manga = results[0]
    jp_title = manga.get("title") or "Unknown"
    en_title = manga.get("title_english") or ""
    synopsis = manga.get("synopsis") or "No synopsis available."
    if len(synopsis) > 400:
        synopsis = synopsis[:400] + "..."
    score = manga.get("score") or "N/A"
    chapters = manga.get("chapters") or "?"
    volumes = manga.get("volumes") or "?"
    status = manga.get("status") or "Unknown"
    genres = ", ".join(g["name"] for g in (manga.get("genres") or [])[:5]) or "N/A"
    mal_url = manga.get("url", "")
    cover = (manga.get("images", {}).get("jpg", {}).get("large_image_url")
             or manga.get("images", {}).get("jpg", {}).get("image_url", ""))

    title_display = jp_title
    if en_title and en_title != jp_title:
        title_display = f"{en_title}\n*{jp_title}*"

    embed = discord.Embed(title=title_display, url=mal_url, color=0x2E51A2)
    embed.description = synopsis
    embed.add_field(name="⭐ Score", value=str(score), inline=True)
    embed.add_field(name="📖 Chapters", value=str(chapters), inline=True)
    embed.add_field(name="📚 Volumes", value=str(volumes), inline=True)
    embed.add_field(name="📡 Status", value=status, inline=True)
    embed.add_field(name="🏷️ Genres", value=genres, inline=False)
    if cover:
        embed.set_thumbnail(url=cover)
    if mal_url:
        embed.add_field(name="🔗 MAL", value=f"[View on MyAnimeList]({mal_url})", inline=False)

    await interaction.followup.send(embed=embed)


# ── Movies & TV (OMDb + TMDB) ────────────────────────────────────────
# OMDb: rich single-title lookups (Rotten Tomatoes, box office, cast)
# TMDB: discovery features (recommendations, trending, top lists) — free key at themoviedb.org

OMDB_API_KEY = os.environ.get("OMDB_API_KEY", "")
TMDB_API_KEY = os.environ.get("TMDB_API_KEY", "")
TMDB_IMG = "https://image.tmdb.org/t/p/w500"


def _omdb_get(params: dict) -> dict:
    import requests as req
    p = dict(params)
    p["apikey"] = OMDB_API_KEY
    r = req.get("https://www.omdbapi.com/", params=p, timeout=10)
    r.raise_for_status()
    return r.json()


async def _omdb(params: dict) -> dict:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: _omdb_get(params))


def _tmdb_get(endpoint: str, params: dict = None) -> dict:
    import requests as req
    p = dict(params or {})
    p["api_key"] = TMDB_API_KEY
    r = req.get(f"https://api.themoviedb.org/3{endpoint}", params=p, timeout=10)
    r.raise_for_status()
    return r.json()


async def _tmdb(endpoint: str, params: dict = None) -> dict:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: _tmdb_get(endpoint, params))


def _omdb_movie_embed(m: dict) -> discord.Embed:
    title = m.get("Title", "Unknown")
    plot = m.get("Plot", "No plot available.")
    if len(plot) > 400:
        plot = plot[:400] + "..."
    embed = discord.Embed(title=title, color=0xE50914)
    imdb_id = m.get("imdbID", "")
    if imdb_id:
        embed.url = f"https://www.imdb.com/title/{imdb_id}/"
    embed.description = plot
    # Ratings line: IMDb + Rotten Tomatoes + Metacritic
    ratings = []
    imdb_rating = m.get("imdbRating", "N/A")
    if imdb_rating != "N/A":
        ratings.append(f"IMDb: {imdb_rating}/10")
    for r in m.get("Ratings", []):
        if "Rotten Tomatoes" in r.get("Source", ""):
            ratings.append(f"RT: {r['Value']}")
        elif "Metacritic" in r.get("Source", ""):
            ratings.append(f"MC: {r['Value']}")
    if ratings:
        embed.add_field(name="⭐ Ratings", value=" | ".join(ratings), inline=False)
    year = m.get("Year", "?")
    runtime = m.get("Runtime", "?")
    rated = m.get("Rated", "?")
    embed.add_field(name="📅 Year", value=year, inline=True)
    embed.add_field(name="⏱️ Runtime", value=runtime, inline=True)
    embed.add_field(name="📋 Rated", value=rated, inline=True)
    genre = m.get("Genre", "")
    if genre:
        embed.add_field(name="🎭 Genre", value=genre, inline=False)
    director = m.get("Director", "")
    if director and director != "N/A":
        embed.add_field(name="🎬 Director", value=director, inline=True)
    actors = m.get("Actors", "")
    if actors and actors != "N/A":
        embed.add_field(name="🎭 Cast", value=actors, inline=True)
    box_office = m.get("BoxOffice", "")
    if box_office and box_office != "N/A":
        embed.add_field(name="💰 Box Office", value=box_office, inline=True)
    awards = m.get("Awards", "")
    if awards and awards != "N/A" and awards != "N/A":
        embed.add_field(name="🏆 Awards", value=awards, inline=False)
    poster = m.get("Poster", "")
    if poster and poster != "N/A":
        embed.set_thumbnail(url=poster)
    return embed


def _omdb_tv_embed(s: dict) -> discord.Embed:
    title = s.get("Title", "Unknown")
    plot = s.get("Plot", "No plot available.")
    if len(plot) > 400:
        plot = plot[:400] + "..."
    embed = discord.Embed(title=title, color=0x3DB4F2)
    imdb_id = s.get("imdbID", "")
    if imdb_id:
        embed.url = f"https://www.imdb.com/title/{imdb_id}/"
    embed.description = plot
    ratings = []
    imdb_rating = s.get("imdbRating", "N/A")
    if imdb_rating != "N/A":
        ratings.append(f"IMDb: {imdb_rating}/10")
    for r in s.get("Ratings", []):
        if "Rotten Tomatoes" in r.get("Source", ""):
            ratings.append(f"RT: {r['Value']}")
    if ratings:
        embed.add_field(name="⭐ Ratings", value=" | ".join(ratings), inline=False)
    year = s.get("Year", "?")
    seasons = s.get("totalSeasons", "?")
    rated = s.get("Rated", "?")
    embed.add_field(name="📅 Year", value=year, inline=True)
    embed.add_field(name="📺 Seasons", value=seasons, inline=True)
    embed.add_field(name="📋 Rated", value=rated, inline=True)
    genre = s.get("Genre", "")
    if genre:
        embed.add_field(name="🎭 Genre", value=genre, inline=False)
    actors = s.get("Actors", "")
    if actors and actors != "N/A":
        embed.add_field(name="🎭 Cast", value=actors, inline=True)
    awards = s.get("Awards", "")
    if awards and awards != "N/A":
        embed.add_field(name="🏆 Awards", value=awards, inline=False)
    poster = s.get("Poster", "")
    if poster and poster != "N/A":
        embed.set_thumbnail(url=poster)
    return embed


# TMDB embeds (for discovery/recommendation results that lack OMDb detail)
def _movie_embed(m: dict) -> discord.Embed:
    title = m.get("title", "Unknown")
    overview = m.get("overview", "No overview available.")
    if len(overview) > 400:
        overview = overview[:400] + "..."
    embed = discord.Embed(title=title, color=0xE50914)
    mid = m.get("id", 0)
    if mid:
        embed.url = f"https://www.themoviedb.org/movie/{mid}"
    embed.description = overview
    embed.add_field(name="⭐ Rating", value=f"{m.get('vote_average', 'N/A')}/10", inline=True)
    embed.add_field(name="📅 Release", value=m.get("release_date", "?"), inline=True)
    poster = m.get("poster_path", "")
    if poster:
        embed.set_thumbnail(url=f"{TMDB_IMG}{poster}")
    return embed


def _tv_embed(s: dict) -> discord.Embed:
    title = s.get("name", "Unknown")
    overview = s.get("overview", "No overview available.")
    if len(overview) > 400:
        overview = overview[:400] + "..."
    embed = discord.Embed(title=title, color=0x3DB4F2)
    sid = s.get("id", 0)
    if sid:
        embed.url = f"https://www.themoviedb.org/tv/{sid}"
    embed.description = overview
    embed.add_field(name="⭐ Rating", value=f"{s.get('vote_average', 'N/A')}/10", inline=True)
    embed.add_field(name="📅 First Air", value=s.get("first_air_date", "?"), inline=True)
    poster = s.get("poster_path", "")
    if poster:
        embed.set_thumbnail(url=f"{TMDB_IMG}{poster}")
    return embed


def _check_omdb(interaction):
    if not OMDB_API_KEY:
        return "This command needs an OMDb API key! Set `OMDB_API_KEY`"
    return None


def _check_tmdb(interaction):
    if not TMDB_API_KEY:
        return "This command needs a TMDB API key! Set `TMDB_API_KEY` (free at https://www.themoviedb.org/settings/api)"
    return None


@app_commands.command(name="movie", description="Look up a movie")
@app_commands.describe(title="Movie title to search for")
async def _movie_cmd(interaction: discord.Interaction, title: str) -> None:
    err = _check_omdb(interaction)
    if err:
        await interaction.response.send_message(err, ephemeral=True)
        return
    await interaction.response.defer()
    try:
        data = await _omdb({"t": title, "type": "movie", "plot": "full"})
    except Exception as e:
        await interaction.followup.send(f"Couldn't search: {e}")
        return
    if data.get("Response") == "False":
        await interaction.followup.send(f"No movie found for: **{title}**")
        return
    await interaction.followup.send(embed=_omdb_movie_embed(data))


@app_commands.command(name="movierec", description="Get movie recommendations based on a title")
@app_commands.describe(title="Movie to get recommendations for")
async def _movierec_cmd(interaction: discord.Interaction, title: str) -> None:
    err = _check_tmdb(interaction)
    if err:
        await interaction.response.send_message(err, ephemeral=True)
        return
    await interaction.response.defer()
    try:
        search = await _tmdb("/search/movie", {"query": title})
        results = search.get("results", [])
        if not results:
            await interaction.followup.send(f"No movie found for: **{title}**")
            return
        movie = results[0]
        recs = await _tmdb(f"/movie/{movie['id']}/recommendations")
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch recommendations: {e}")
        return
    items = recs.get("results", [])[:10]
    if not items:
        await interaction.followup.send(f"No recommendations found for **{movie.get('title', title)}**")
        return
    embed = discord.Embed(title=f"🎬 If you liked {movie.get('title', title)}...", color=0xE50914)
    lines = []
    for m in items:
        rating = m.get("vote_average", "?")
        year = (m.get("release_date") or "?")[:4]
        url = f"https://www.themoviedb.org/movie/{m['id']}" if m.get("id") else ""
        name = m.get("title", "Unknown")
        lines.append(f"**[{name}]({url})** ({year}) — ⭐ {rating}" if url else f"**{name}** ({year}) — ⭐ {rating}")
    embed.description = "\n".join(lines)
    poster = movie.get("poster_path", "")
    if poster:
        embed.set_thumbnail(url=f"{TMDB_IMG}{poster}")
    await interaction.followup.send(embed=embed)


@app_commands.command(name="movietop", description="Show top rated movies")
async def _movietop_cmd(interaction: discord.Interaction) -> None:
    err = _check_tmdb(interaction)
    if err:
        await interaction.response.send_message(err, ephemeral=True)
        return
    await interaction.response.defer()
    try:
        data = await _tmdb("/movie/top_rated")
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch: {e}")
        return
    embed = discord.Embed(title="🏆 Top Rated Movies", color=0xFFD700)
    lines = []
    for i, m in enumerate(data.get("results", [])[:10], 1):
        name = m.get("title", "?")
        rating = m.get("vote_average", "?")
        year = (m.get("release_date") or "?")[:4]
        mid = m.get("id", "")
        url = f"https://www.themoviedb.org/movie/{mid}" if mid else ""
        lines.append(f"`{i}.` **[{name}]({url})** ({year}) — ⭐ {rating}" if url else f"`{i}.` **{name}** ({year}) — ⭐ {rating}")
    embed.description = "\n".join(lines)
    await interaction.followup.send(embed=embed)


@app_commands.command(name="movietrending", description="Show trending movies this week")
async def _movietrending_cmd(interaction: discord.Interaction) -> None:
    err = _check_tmdb(interaction)
    if err:
        await interaction.response.send_message(err, ephemeral=True)
        return
    await interaction.response.defer()
    try:
        data = await _tmdb("/trending/movie/week")
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch: {e}")
        return
    embed = discord.Embed(title="🔥 Trending Movies", color=0xFF4500)
    lines = []
    for i, m in enumerate(data.get("results", [])[:10], 1):
        name = m.get("title", "?")
        rating = m.get("vote_average", "?")
        year = (m.get("release_date") or "?")[:4]
        mid = m.get("id", "")
        url = f"https://www.themoviedb.org/movie/{mid}" if mid else ""
        lines.append(f"`{i}.` **[{name}]({url})** ({year}) — ⭐ {rating}" if url else f"`{i}.` **{name}** ({year}) — ⭐ {rating}")
    embed.description = "\n".join(lines)
    await interaction.followup.send(embed=embed)


@app_commands.command(name="randommovie", description="Get a random movie suggestion!")
async def _randommovie_cmd(interaction: discord.Interaction) -> None:
    err = _check_tmdb(interaction)
    if err:
        await interaction.response.send_message(err, ephemeral=True)
        return
    await interaction.response.defer()
    try:
        page = random.randint(1, 200)
        data = await _tmdb("/discover/movie", {"sort_by": "vote_count.desc", "page": str(page), "vote_count.gte": "100"})
        results = data.get("results", [])
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch: {e}")
        return
    if not results:
        await interaction.followup.send("Couldn't find a movie! Try again.")
        return
    movie = random.choice(results)
    embed = _movie_embed(movie)
    embed.title = f"🎲 Random Movie: {embed.title}"
    poster = movie.get("poster_path", "")
    if poster:
        embed.set_image(url=f"{TMDB_IMG}{poster}")
        embed.set_thumbnail(url=discord.Embed.Empty)
    await interaction.followup.send(embed=embed)


# ── TV Shows (OMDb for lookup, TMDB for discovery) ──────────────────


@app_commands.command(name="tv", description="Look up a TV show")
@app_commands.describe(title="TV show title to search for")
async def _tv_cmd(interaction: discord.Interaction, title: str) -> None:
    err = _check_omdb(interaction)
    if err:
        await interaction.response.send_message(err, ephemeral=True)
        return
    await interaction.response.defer()
    try:
        data = await _omdb({"t": title, "type": "series", "plot": "full"})
    except Exception as e:
        await interaction.followup.send(f"Couldn't search: {e}")
        return
    if data.get("Response") == "False":
        await interaction.followup.send(f"No TV show found for: **{title}**")
        return
    await interaction.followup.send(embed=_omdb_tv_embed(data))


@app_commands.command(name="tvrec", description="Get TV show recommendations based on a title")
@app_commands.describe(title="TV show to get recommendations for")
async def _tvrec_cmd(interaction: discord.Interaction, title: str) -> None:
    err = _check_tmdb(interaction)
    if err:
        await interaction.response.send_message(err, ephemeral=True)
        return
    await interaction.response.defer()
    try:
        search = await _tmdb("/search/tv", {"query": title})
        results = search.get("results", [])
        if not results:
            await interaction.followup.send(f"No TV show found for: **{title}**")
            return
        show = results[0]
        recs = await _tmdb(f"/tv/{show['id']}/recommendations")
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch recommendations: {e}")
        return
    items = recs.get("results", [])[:10]
    if not items:
        await interaction.followup.send(f"No recommendations found for **{show.get('name', title)}**")
        return
    embed = discord.Embed(title=f"📺 If you liked {show.get('name', title)}...", color=0x3DB4F2)
    lines = []
    for s in items:
        rating = s.get("vote_average", "?")
        year = (s.get("first_air_date") or "?")[:4]
        url = f"https://www.themoviedb.org/tv/{s['id']}" if s.get("id") else ""
        name = s.get("name", "Unknown")
        lines.append(f"**[{name}]({url})** ({year}) — ⭐ {rating}" if url else f"**{name}** ({year}) — ⭐ {rating}")
    embed.description = "\n".join(lines)
    poster = show.get("poster_path", "")
    if poster:
        embed.set_thumbnail(url=f"{TMDB_IMG}{poster}")
    await interaction.followup.send(embed=embed)


@app_commands.command(name="tvtop", description="Show top rated TV shows")
async def _tvtop_cmd(interaction: discord.Interaction) -> None:
    err = _check_tmdb(interaction)
    if err:
        await interaction.response.send_message(err, ephemeral=True)
        return
    await interaction.response.defer()
    try:
        data = await _tmdb("/tv/top_rated")
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch: {e}")
        return
    embed = discord.Embed(title="🏆 Top Rated TV Shows", color=0xFFD700)
    lines = []
    for i, s in enumerate(data.get("results", [])[:10], 1):
        name = s.get("name", "?")
        rating = s.get("vote_average", "?")
        year = (s.get("first_air_date") or "?")[:4]
        sid = s.get("id", "")
        url = f"https://www.themoviedb.org/tv/{sid}" if sid else ""
        lines.append(f"`{i}.` **[{name}]({url})** ({year}) — ⭐ {rating}" if url else f"`{i}.` **{name}** ({year}) — ⭐ {rating}")
    embed.description = "\n".join(lines)
    await interaction.followup.send(embed=embed)


@app_commands.command(name="tvtrending", description="Show trending TV shows this week")
async def _tvtrending_cmd(interaction: discord.Interaction) -> None:
    err = _check_tmdb(interaction)
    if err:
        await interaction.response.send_message(err, ephemeral=True)
        return
    await interaction.response.defer()
    try:
        data = await _tmdb("/trending/tv/week")
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch: {e}")
        return
    embed = discord.Embed(title="🔥 Trending TV Shows", color=0xFF4500)
    lines = []
    for i, s in enumerate(data.get("results", [])[:10], 1):
        name = s.get("name", "?")
        rating = s.get("vote_average", "?")
        year = (s.get("first_air_date") or "?")[:4]
        sid = s.get("id", "")
        url = f"https://www.themoviedb.org/tv/{sid}" if sid else ""
        lines.append(f"`{i}.` **[{name}]({url})** ({year}) — ⭐ {rating}" if url else f"`{i}.` **{name}** ({year}) — ⭐ {rating}")
    embed.description = "\n".join(lines)
    await interaction.followup.send(embed=embed)


@app_commands.command(name="randomtv", description="Get a random TV show suggestion!")
async def _randomtv_cmd(interaction: discord.Interaction) -> None:
    err = _check_tmdb(interaction)
    if err:
        await interaction.response.send_message(err, ephemeral=True)
        return
    await interaction.response.defer()
    try:
        page = random.randint(1, 100)
        data = await _tmdb("/discover/tv", {"sort_by": "vote_count.desc", "page": str(page), "vote_count.gte": "100"})
        results = data.get("results", [])
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch: {e}")
        return
    if not results:
        await interaction.followup.send("Couldn't find a show! Try again.")
        return
    show = random.choice(results)
    embed = _tv_embed(show)
    embed.title = f"🎲 Random TV Show: {embed.title}"
    poster = show.get("poster_path", "")
    if poster:
        embed.set_image(url=f"{TMDB_IMG}{poster}")
        embed.set_thumbnail(url=discord.Embed.Empty)
    await interaction.followup.send(embed=embed)


# ── Books (Open Library — free, no key) ─────────────────────────────


def _book_embed(book: dict) -> discord.Embed:
    title = book.get("title", "Unknown")
    authors = ", ".join(book.get("author_name", ["Unknown"]))
    year = book.get("first_publish_year", "?")
    pages = book.get("number_of_pages_median") or "?"
    subjects = ", ".join(book.get("subject", [])[:5]) or "N/A"
    cover_id = book.get("cover_i")
    ol_key = book.get("key", "")
    embed = discord.Embed(title=title, color=0x8B4513)
    if ol_key:
        embed.url = f"https://openlibrary.org{ol_key}"
    embed.add_field(name="✍️ Author", value=authors, inline=True)
    embed.add_field(name="📅 Published", value=str(year), inline=True)
    embed.add_field(name="📄 Pages", value=str(pages), inline=True)
    embed.add_field(name="🏷️ Subjects", value=subjects, inline=False)
    if cover_id:
        embed.set_thumbnail(url=f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg")
    return embed


async def _ol_get(path: str, params: dict = None) -> dict:
    import requests as req
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: req.get(
        f"https://openlibrary.org{path}", params=params, timeout=10,
    ).json())


@app_commands.command(name="book", description="Look up a book")
@app_commands.describe(title="Book title to search for")
async def _book_cmd(interaction: discord.Interaction, title: str) -> None:
    await interaction.response.defer()
    try:
        data = await _ol_get("/search.json", {"q": title, "limit": "1"})
    except Exception as e:
        await interaction.followup.send(f"Couldn't search: {e}")
        return
    docs = data.get("docs", [])
    if not docs:
        await interaction.followup.send(f"No book found for: **{title}**")
        return
    embed = _book_embed(docs[0])
    embed.set_footer(text="Data from Open Library")
    await interaction.followup.send(embed=embed)


@app_commands.command(name="bookrec", description="Get book recommendations based on a title")
@app_commands.describe(title="Book to get recommendations for")
async def _bookrec_cmd(interaction: discord.Interaction, title: str) -> None:
    await interaction.response.defer()
    try:
        data = await _ol_get("/search.json", {"q": title, "limit": "1"})
    except Exception as e:
        await interaction.followup.send(f"Couldn't search: {e}")
        return
    docs = data.get("docs", [])
    if not docs:
        await interaction.followup.send(f"No book found for: **{title}**")
        return
    book = docs[0]
    subjects = book.get("subject", [])
    if not subjects:
        await interaction.followup.send(f"No subjects found for **{book.get('title', title)}** to base recommendations on.")
        return
    # Search by the first specific subject
    subject_slug = subjects[0].lower().replace(" ", "_")
    try:
        sub_data = await _ol_get(f"/subjects/{subject_slug}.json", {"limit": "10"})
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch recommendations: {e}")
        return
    works = sub_data.get("works", [])
    # Filter out the original book
    works = [w for w in works if w.get("title", "").lower() != book.get("title", "").lower()][:8]
    if not works:
        await interaction.followup.send(f"No recommendations found for **{book.get('title', title)}**")
        return
    embed = discord.Embed(title=f"📖 If you liked {book.get('title', title)}...", color=0x8B4513)
    lines = []
    for w in works:
        name = w.get("title", "Unknown")
        authors = ", ".join(a.get("name", "?") for a in w.get("authors", [])[:2]) or "Unknown"
        ol_key = w.get("key", "")
        url = f"https://openlibrary.org{ol_key}" if ol_key else ""
        lines.append(f"**[{name}]({url})** by {authors}" if url else f"**{name}** by {authors}")
    embed.description = "\n".join(lines)
    embed.set_footer(text=f"Based on subject: {subjects[0]}")
    cover_id = book.get("cover_i")
    if cover_id:
        embed.set_thumbnail(url=f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg")
    await interaction.followup.send(embed=embed)


@app_commands.command(name="booktop", description="Show trending books")
async def _booktop_cmd(interaction: discord.Interaction) -> None:
    await interaction.response.defer()
    try:
        data = await _ol_get("/trending/daily.json", {"limit": "10"})
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch: {e}")
        return
    works = data.get("works", [])
    if not works:
        await interaction.followup.send("No trending books found!")
        return
    embed = discord.Embed(title="📚 Trending Books Today", color=0xFFD700)
    lines = []
    for i, w in enumerate(works[:10], 1):
        name = w.get("title", "Unknown")
        author = w.get("author_name", ["Unknown"])
        if isinstance(author, list):
            author = ", ".join(author[:2])
        lines.append(f"`{i}.` **{name}** by {author}")
    embed.description = "\n".join(lines)
    await interaction.followup.send(embed=embed)


@app_commands.command(name="randombook", description="Get a random book suggestion!")
async def _randombook_cmd(interaction: discord.Interaction) -> None:
    await interaction.response.defer()
    subjects = ["fantasy", "science_fiction", "mystery", "romance", "horror",
                "adventure", "thriller", "comedy", "drama", "historical_fiction",
                "philosophy", "psychology", "biography", "poetry", "manga"]
    subject = random.choice(subjects)
    try:
        data = await _ol_get(f"/subjects/{subject}.json", {"limit": "20"})
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch: {e}")
        return
    works = data.get("works", [])
    if not works:
        await interaction.followup.send("Couldn't find a book! Try again.")
        return
    w = random.choice(works)
    title = w.get("title", "Unknown")
    authors = ", ".join(a.get("name", "?") for a in w.get("authors", [])[:2]) or "Unknown"
    cover_id = w.get("cover_id")
    ol_key = w.get("key", "")
    embed = discord.Embed(title=f"🎲 Random Book: {title}", color=0x8B4513)
    if ol_key:
        embed.url = f"https://openlibrary.org{ol_key}"
    embed.add_field(name="✍️ Author", value=authors, inline=True)
    embed.add_field(name="📂 Genre", value=subject.replace("_", " ").title(), inline=True)
    if cover_id:
        embed.set_image(url=f"https://covers.openlibrary.org/b/id/{cover_id}-L.jpg")
    await interaction.followup.send(embed=embed)


# ── Video Games (RAWG API — free key at rawg.io) ────────────────────

RAWG_API_KEY = os.environ.get("RAWG_API_KEY", "")


async def _rawg(endpoint: str, params: dict = None) -> dict:
    import requests as req
    p = dict(params or {})
    p["key"] = RAWG_API_KEY
    loop = asyncio.get_running_loop()
    r = await loop.run_in_executor(None, lambda: req.get(
        f"https://api.rawg.io/api{endpoint}", params=p, timeout=10,
    ))
    r.raise_for_status()
    return r.json()


def _game_embed(game: dict) -> discord.Embed:
    name = game.get("name", "Unknown")
    released = game.get("released", "?")
    rating = game.get("rating", "N/A")
    metacritic = game.get("metacritic") or "N/A"
    genres = ", ".join(g["name"] for g in game.get("genres", [])[:5]) or "N/A"
    platforms = ", ".join(p["platform"]["name"] for p in game.get("platforms", [])[:5] if p.get("platform")) or "N/A"
    image = game.get("background_image", "")
    slug = game.get("slug", "")
    embed = discord.Embed(title=name, color=0x00D166)
    if slug:
        embed.url = f"https://rawg.io/games/{slug}"
    embed.add_field(name="⭐ Rating", value=f"{rating}/5", inline=True)
    embed.add_field(name="🏆 Metacritic", value=str(metacritic), inline=True)
    embed.add_field(name="📅 Released", value=released, inline=True)
    embed.add_field(name="🏷️ Genres", value=genres, inline=False)
    embed.add_field(name="🎮 Platforms", value=platforms, inline=False)
    if image:
        embed.set_image(url=image)
    return embed


def _check_rawg(interaction):
    if not RAWG_API_KEY:
        return "This command needs a RAWG API key! Set `RAWG_API_KEY` (free at https://rawg.io/apidocs)"
    return None


@app_commands.command(name="game", description="Look up a video game")
@app_commands.describe(title="Game title to search for")
async def _game_cmd(interaction: discord.Interaction, title: str) -> None:
    err = _check_rawg(interaction)
    if err:
        await interaction.response.send_message(err, ephemeral=True)
        return
    await interaction.response.defer()
    try:
        data = await _rawg("/games", {"search": title, "page_size": "1"})
    except Exception as e:
        await interaction.followup.send(f"Couldn't search: {e}")
        return
    results = data.get("results", [])
    if not results:
        await interaction.followup.send(f"No game found for: **{title}**")
        return
    await interaction.followup.send(embed=_game_embed(results[0]))


@app_commands.command(name="gamerec", description="Get game recommendations based on a title")
@app_commands.describe(title="Game to get recommendations for")
async def _gamerec_cmd(interaction: discord.Interaction, title: str) -> None:
    err = _check_rawg(interaction)
    if err:
        await interaction.response.send_message(err, ephemeral=True)
        return
    await interaction.response.defer()
    try:
        search = await _rawg("/games", {"search": title, "page_size": "1"})
        results = search.get("results", [])
        if not results:
            await interaction.followup.send(f"No game found for: **{title}**")
            return
        game = results[0]
        recs = await _rawg(f"/games/{game['id']}/suggested", {"page_size": "10"})
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch recommendations: {e}")
        return
    items = recs.get("results", [])[:10]
    if not items:
        await interaction.followup.send(f"No recommendations found for **{game.get('name', title)}**")
        return
    embed = discord.Embed(title=f"🎮 If you liked {game.get('name', title)}...", color=0x00D166)
    lines = []
    for g in items:
        name = g.get("name", "Unknown")
        rating = g.get("rating", "?")
        slug = g.get("slug", "")
        url = f"https://rawg.io/games/{slug}" if slug else ""
        lines.append(f"**[{name}]({url})** — ⭐ {rating}/5" if url else f"**{name}** — ⭐ {rating}/5")
    embed.description = "\n".join(lines)
    img = game.get("background_image", "")
    if img:
        embed.set_thumbnail(url=img)
    await interaction.followup.send(embed=embed)


@app_commands.command(name="gametop", description="Show top rated games")
async def _gametop_cmd(interaction: discord.Interaction) -> None:
    err = _check_rawg(interaction)
    if err:
        await interaction.response.send_message(err, ephemeral=True)
        return
    await interaction.response.defer()
    try:
        data = await _rawg("/games", {"ordering": "-metacritic", "page_size": "10"})
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch: {e}")
        return
    embed = discord.Embed(title="🏆 Top Rated Games (Metacritic)", color=0xFFD700)
    lines = []
    for i, g in enumerate(data.get("results", [])[:10], 1):
        name = g.get("name", "?")
        mc = g.get("metacritic") or "?"
        year = (g.get("released") or "?")[:4]
        slug = g.get("slug", "")
        url = f"https://rawg.io/games/{slug}" if slug else ""
        lines.append(f"`{i}.` **[{name}]({url})** ({year}) — 🏆 {mc}" if url else f"`{i}.` **{name}** ({year}) — 🏆 {mc}")
    embed.description = "\n".join(lines)
    await interaction.followup.send(embed=embed)


@app_commands.command(name="gametrending", description="Show trending/popular games")
async def _gametrending_cmd(interaction: discord.Interaction) -> None:
    err = _check_rawg(interaction)
    if err:
        await interaction.response.send_message(err, ephemeral=True)
        return
    await interaction.response.defer()
    try:
        data = await _rawg("/games", {"ordering": "-added", "page_size": "10"})
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch: {e}")
        return
    embed = discord.Embed(title="🔥 Most Popular Games", color=0xFF4500)
    lines = []
    for i, g in enumerate(data.get("results", [])[:10], 1):
        name = g.get("name", "?")
        rating = g.get("rating", "?")
        year = (g.get("released") or "?")[:4]
        slug = g.get("slug", "")
        url = f"https://rawg.io/games/{slug}" if slug else ""
        lines.append(f"`{i}.` **[{name}]({url})** ({year}) — ⭐ {rating}/5" if url else f"`{i}.` **{name}** ({year}) — ⭐ {rating}/5")
    embed.description = "\n".join(lines)
    await interaction.followup.send(embed=embed)


@app_commands.command(name="randomgame", description="Get a random game suggestion!")
async def _randomgame_cmd(interaction: discord.Interaction) -> None:
    err = _check_rawg(interaction)
    if err:
        await interaction.response.send_message(err, ephemeral=True)
        return
    await interaction.response.defer()
    try:
        page = random.randint(1, 100)
        data = await _rawg("/games", {"ordering": "-rating", "page_size": "20", "page": str(page), "metacritic": "70,100"})
        results = data.get("results", [])
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch: {e}")
        return
    if not results:
        await interaction.followup.send("Couldn't find a game! Try again.")
        return
    game = random.choice(results)
    embed = _game_embed(game)
    embed.title = f"🎲 Random Game: {embed.title}"
    await interaction.followup.send(embed=embed)


# ── Phase 4: Lyrics + Seek + Playlists ──────────────────────────────


@app_commands.command(name="lyrics", description="Get lyrics for the current song")
async def _lyrics_cmd(interaction: discord.Interaction) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    queue = _get_queue(interaction.guild.id)
    if not queue.current:
        await interaction.response.send_message("Nothing is playing!", ephemeral=True)
        return

    await interaction.response.defer()

    title = queue.current.get("title", "")
    clean_title = re.sub(r'\(.*?\)|\[.*?\]', '', title).strip()
    clean_title = re.sub(
        r'(?i)(official|video|audio|lyrics|hd|4k|mv|music video)', '', clean_title
    ).strip()

    import requests as req
    try:
        loop = asyncio.get_running_loop()
        r = await loop.run_in_executor(None, lambda: req.get(
            f"https://lrclib.net/api/search?q={clean_title}", timeout=10,
        ))
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch lyrics: {e}")
        return

    if not data:
        await interaction.followup.send(f"No lyrics found for **{title}**")
        return

    result = data[0]
    lyrics_text = result.get("plainLyrics") or result.get("syncedLyrics") or ""
    if not lyrics_text:
        await interaction.followup.send(f"No lyrics found for **{title}**")
        return

    artist = result.get("artistName", "Unknown")
    track_name = result.get("trackName", title)

    if len(lyrics_text) <= 4000:
        embed = discord.Embed(title=f"🎤 {track_name}", description=lyrics_text, color=0x7B68EE)
        embed.set_author(name=artist)
        await interaction.followup.send(embed=embed)
    else:
        chunks = [lyrics_text[i:i + 4000] for i in range(0, len(lyrics_text), 4000)]
        for i, chunk in enumerate(chunks[:3]):
            e = discord.Embed(
                title=f"🎤 {track_name} (Page {i + 1}/{min(len(chunks), 3)})",
                description=chunk, color=0x7B68EE,
            )
            if i == 0:
                e.set_author(name=artist)
            await interaction.followup.send(embed=e)


def _parse_timestamp(ts: str) -> Optional[int]:
    """Parse '1:23' or '1:23:45' or '83' to seconds."""
    parts = ts.strip().split(":")
    try:
        if len(parts) == 1:
            return int(parts[0])
        elif len(parts) == 2:
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 3:
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except ValueError:
        return None
    return None


@app_commands.command(name="seek", description="Seek to a position in the current track")
@app_commands.describe(timestamp="Position to seek to (e.g. 1:23 or 83)")
async def _seek_cmd(interaction: discord.Interaction, timestamp: str) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    queue = _get_queue(interaction.guild.id)
    if not queue.current:
        await interaction.response.send_message("Nothing is playing!", ephemeral=True)
        return

    seconds = _parse_timestamp(timestamp)
    if seconds is None:
        await interaction.response.send_message(
            "Invalid timestamp! Use format like `1:23` or `83`", ephemeral=True)
        return

    duration = queue.current.get("duration", 0) or 0
    if duration > 0 and seconds >= duration:
        await interaction.response.send_message(
            f"Can't seek past duration ({_format_duration(duration)})!", ephemeral=True)
        return

    track = queue.current
    vc = queue.voice_client
    if not vc or not vc.is_connected():
        await interaction.response.send_message("Not connected to voice!", ephemeral=True)
        return

    # Stop with seeking flag
    queue.seeking = True
    if vc.is_playing() or vc.is_paused():
        vc.stop()
    await asyncio.sleep(0.2)

    await interaction.response.send_message(f"⏩ Seeked to **{_format_duration(seconds)}**")
    await _start_playing(queue, track, interaction.guild.id, interaction.channel, seek_to=seconds)


# ── Saved Playlists ─────────────────────────────────────────────────

_playlist_group = app_commands.Group(name="playlist", description="Manage saved playlists")


async def _playlist_name_autocomplete(
    interaction: discord.Interaction, current: str,
) -> list[app_commands.Choice[str]]:
    choices = []
    for d in [
        PLAYLISTS_DIR / f"user_{interaction.user.id}",
        PLAYLISTS_DIR / f"server_{interaction.guild_id}" if interaction.guild_id else None,
    ]:
        if d and d.exists():
            for p in d.glob("*.json"):
                if current.lower() in p.stem.lower():
                    choices.append(app_commands.Choice(name=p.stem, value=p.stem))
    return choices[:25]


@_playlist_group.command(name="save", description="Save current queue as a playlist")
@app_commands.describe(name="Playlist name", server="Save as server playlist")
async def _playlist_save(interaction: discord.Interaction, name: str, server: bool = False) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    queue = _get_queue(interaction.guild.id)
    tracks_to_save = []
    if queue.current:
        tracks_to_save.append({
            "title": queue.current.get("title", ""),
            "url": queue.current.get("webpage_url", ""),
            "duration": queue.current.get("duration", 0),
        })
    for t in queue.tracks:
        tracks_to_save.append({
            "title": t.get("title", ""),
            "url": t.get("webpage_url", ""),
            "duration": t.get("duration", 0),
        })
    if not tracks_to_save:
        await interaction.response.send_message("Nothing to save! Play some music first.", ephemeral=True)
        return

    if server:
        path = PLAYLISTS_DIR / f"server_{interaction.guild.id}" / f"{name}.json"
    else:
        path = PLAYLISTS_DIR / f"user_{interaction.user.id}" / f"{name}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump({"name": name, "tracks": tracks_to_save, "created_by": str(interaction.user)}, f, indent=2)

    scope = "server" if server else "your"
    await interaction.response.send_message(
        f"💾 Saved **{len(tracks_to_save)}** tracks as `{name}` to {scope} playlists!")


@_playlist_group.command(name="load", description="Load a saved playlist")
@app_commands.describe(name="Playlist name")
@app_commands.autocomplete(name=_playlist_name_autocomplete)
async def _playlist_load(interaction: discord.Interaction, name: str) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    member = interaction.user
    if not isinstance(member, discord.Member) or not member.voice:
        await interaction.response.send_message("Join a voice channel first!", ephemeral=True)
        return

    user_path = PLAYLISTS_DIR / f"user_{interaction.user.id}" / f"{name}.json"
    server_path = PLAYLISTS_DIR / f"server_{interaction.guild.id}" / f"{name}.json"
    path = user_path if user_path.exists() else server_path if server_path.exists() else None
    if not path:
        await interaction.response.send_message(f"Playlist `{name}` not found!", ephemeral=True)
        return

    await interaction.response.defer()

    with open(path) as f:
        data = json.load(f)
    tracks = data.get("tracks", [])
    if not tracks:
        await interaction.followup.send("Playlist is empty!")
        return

    queue = _get_queue(interaction.guild.id)
    vc = await _ensure_voice(interaction.guild, member.voice.channel)
    if not vc:
        await interaction.followup.send("Couldn't join voice channel!")
        return

    queue_tracks = []
    for t in tracks:
        queue_tracks.append({
            "title": t.get("title", "Unknown"),
            "url": t.get("url", ""),
            "webpage_url": t.get("url", ""),
            "duration": t.get("duration", 0),
            "thumbnail": "",
            "id": "",
            "requester": member.display_name,
            "requester_id": member.id,
        })

    if not (vc.is_playing() or vc.is_paused()):
        first = queue_tracks[0]
        for t in queue_tracks[1:]:
            queue.add(t)
        await _start_playing(queue, first, interaction.guild.id, interaction.channel)
    else:
        for t in queue_tracks:
            queue.add(t)
    await interaction.followup.send(
        f"📂 Loaded **{len(queue_tracks)}** tracks from playlist `{name}`!")
    await _send_or_update_controls(queue, interaction.channel, interaction.guild.id, force_new=True)


@_playlist_group.command(name="list", description="Show your saved playlists")
async def _playlist_list(interaction: discord.Interaction) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    user_dir = PLAYLISTS_DIR / f"user_{interaction.user.id}"
    server_dir = PLAYLISTS_DIR / f"server_{interaction.guild.id}"
    lines = []

    if user_dir.exists():
        for p in sorted(user_dir.glob("*.json")):
            with open(p) as f:
                d = json.load(f)
            lines.append(f"📁 `{p.stem}` — {len(d.get('tracks', []))} tracks")

    server_lines = []
    if server_dir.exists():
        for p in sorted(server_dir.glob("*.json")):
            with open(p) as f:
                d = json.load(f)
            server_lines.append(f"🌐 `{p.stem}` — {len(d.get('tracks', []))} tracks")

    if not lines and not server_lines:
        await interaction.response.send_message(
            "No saved playlists! Use `/playlist save` to create one.", ephemeral=True)
        return

    desc = ""
    if lines:
        desc += "**Your Playlists:**\n" + "\n".join(lines)
    if server_lines:
        desc += "\n\n**Server Playlists:**\n" + "\n".join(server_lines)

    embed = discord.Embed(title="📋 Saved Playlists", description=desc, color=0x7B68EE)
    await interaction.response.send_message(embed=embed)


@_playlist_group.command(name="delete", description="Delete a saved playlist")
@app_commands.describe(name="Playlist name")
@app_commands.autocomplete(name=_playlist_name_autocomplete)
async def _playlist_delete(interaction: discord.Interaction, name: str) -> None:
    user_path = PLAYLISTS_DIR / f"user_{interaction.user.id}" / f"{name}.json"
    if user_path.exists():
        user_path.unlink()
        await interaction.response.send_message(f"🗑️ Deleted playlist `{name}`!")
    else:
        await interaction.response.send_message(f"Playlist `{name}` not found!", ephemeral=True)


@_playlist_group.command(name="append", description="Add current queue to an existing playlist")
@app_commands.describe(name="Playlist name")
@app_commands.autocomplete(name=_playlist_name_autocomplete)
async def _playlist_append(interaction: discord.Interaction, name: str) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return

    user_path = PLAYLISTS_DIR / f"user_{interaction.user.id}" / f"{name}.json"
    server_path = PLAYLISTS_DIR / f"server_{interaction.guild.id}" / f"{name}.json"
    path = user_path if user_path.exists() else server_path if server_path.exists() else None
    if not path:
        await interaction.response.send_message(f"Playlist `{name}` not found!", ephemeral=True)
        return

    queue = _get_queue(interaction.guild.id)
    new_tracks = []
    if queue.current:
        new_tracks.append({
            "title": queue.current.get("title", ""),
            "url": queue.current.get("webpage_url", ""),
            "duration": queue.current.get("duration", 0),
        })
    for t in queue.tracks:
        new_tracks.append({
            "title": t.get("title", ""),
            "url": t.get("webpage_url", ""),
            "duration": t.get("duration", 0),
        })
    if not new_tracks:
        await interaction.response.send_message("Nothing to append!", ephemeral=True)
        return

    with open(path) as f:
        data = json.load(f)
    data["tracks"].extend(new_tracks)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)

    await interaction.response.send_message(
        f"Added **{len(new_tracks)}** tracks to `{name}` (total: {len(data['tracks'])})")


# ── Phase 6: Stats ──────────────────────────────────────────────────


@app_commands.command(name="stats", description="Show listening stats")
@app_commands.describe(server="Show server-wide stats instead")
async def _stats_cmd(interaction: discord.Interaction, server: bool = False) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return

    try:
        db = _get_db()
        guild_id = interaction.guild.id

        if server:
            rows = db.execute(
                "SELECT track_title, COUNT(*) as plays FROM play_history "
                "WHERE guild_id = ? GROUP BY track_title ORDER BY plays DESC LIMIT 10",
                (guild_id,),
            ).fetchall()
            total = db.execute(
                "SELECT COUNT(*) FROM play_history WHERE guild_id = ?", (guild_id,),
            ).fetchone()[0]
            total_dur = db.execute(
                "SELECT COALESCE(SUM(duration), 0) FROM play_history WHERE guild_id = ?",
                (guild_id,),
            ).fetchone()[0]

            embed = discord.Embed(title="📊 Server Listening Stats", color=0x7B68EE)
            embed.add_field(name="Total Tracks", value=str(total), inline=True)
            embed.add_field(name="Total Time", value=_format_duration(total_dur), inline=True)
            if rows:
                lines = [f"`{i}.` **{r['track_title'][:40]}** — {r['plays']}×"
                         for i, r in enumerate(rows, 1)]
                embed.add_field(name="🏆 Most Played", value="\n".join(lines), inline=False)
        else:
            uid = interaction.user.id
            rows = db.execute(
                "SELECT track_title, COUNT(*) as plays FROM play_history "
                "WHERE guild_id = ? AND user_id = ? GROUP BY track_title ORDER BY plays DESC LIMIT 5",
                (guild_id, uid),
            ).fetchall()
            total = db.execute(
                "SELECT COUNT(*) FROM play_history WHERE guild_id = ? AND user_id = ?",
                (guild_id, uid),
            ).fetchone()[0]
            total_dur = db.execute(
                "SELECT COALESCE(SUM(duration), 0) FROM play_history WHERE guild_id = ? AND user_id = ?",
                (guild_id, uid),
            ).fetchone()[0]

            embed = discord.Embed(title="📊 Your Listening Stats", color=0x7B68EE)
            embed.add_field(name="Total Tracks", value=str(total), inline=True)
            embed.add_field(name="Total Time", value=_format_duration(total_dur), inline=True)
            if rows:
                lines = [f"`{i}.` **{r['track_title'][:40]}** — {r['plays']}×"
                         for i, r in enumerate(rows, 1)]
                embed.add_field(name="🎵 Top Songs", value="\n".join(lines), inline=False)

        db.close()
        await interaction.response.send_message(embed=embed)
    except Exception as e:
        logger.error("Stats command failed: %s", e)
        await interaction.response.send_message("Couldn't load stats!", ephemeral=True)


# ── Phase 7: Mini Games ─────────────────────────────────────────────


class TriviaButton(discord.ui.Button):
    def __init__(self, label: str, answer: str, is_correct: bool, row: int = 0) -> None:
        display = answer[:77] + "..." if len(answer) > 80 else answer
        super().__init__(label=display, style=discord.ButtonStyle.primary, row=row)
        self.answer = answer
        self.is_correct = is_correct

    async def callback(self, interaction: discord.Interaction) -> None:
        view: TriviaView = self.view  # type: ignore[assignment]
        if interaction.user.id in view.answered:
            await interaction.response.send_message("You already answered!", ephemeral=True)
            return
        view.answered.add(interaction.user.id)
        if self.is_correct:
            await interaction.response.send_message(
                f"✅ Correct, {interaction.user.display_name}!")
        else:
            await interaction.response.send_message(
                f"❌ Wrong! The answer was: **{view.correct}**", ephemeral=True)


class TriviaView(discord.ui.View):
    def __init__(self, correct: str, answers: list[str]) -> None:
        super().__init__(timeout=20)
        self.correct = correct
        self.answered: set[int] = set()
        labels = ["🅰️", "🅱️", "🅲", "🅳"]
        for i, answer in enumerate(answers):
            self.add_item(TriviaButton(
                f"{labels[i]} {answer[:70]}", answer, answer == correct,
                row=0 if i < 2 else 1,
            ))


@app_commands.command(name="trivia", description="Start a trivia question!")
@app_commands.describe(category="Question category")
@app_commands.choices(category=[
    app_commands.Choice(name="General Knowledge", value="9"),
    app_commands.Choice(name="Anime & Manga", value="31"),
    app_commands.Choice(name="Video Games", value="15"),
    app_commands.Choice(name="Science", value="17"),
    app_commands.Choice(name="History", value="23"),
    app_commands.Choice(name="Movies", value="11"),
    app_commands.Choice(name="Music", value="12"),
])
async def _trivia_cmd(interaction: discord.Interaction, category: str = "9") -> None:
    await interaction.response.defer()
    import requests as req
    try:
        loop = asyncio.get_running_loop()
        r = await loop.run_in_executor(None, lambda: req.get(
            f"https://opentdb.com/api.php?amount=1&category={category}&type=multiple",
            timeout=10,
        ))
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch trivia: {e}")
        return

    results = data.get("results", [])
    if not results:
        await interaction.followup.send("No trivia questions found!")
        return

    q = results[0]
    question = html.unescape(q["question"])
    correct = html.unescape(q["correct_answer"])
    incorrect = [html.unescape(a) for a in q["incorrect_answers"]]
    cat = html.unescape(q.get("category", "General"))
    difficulty = q.get("difficulty", "medium").capitalize()

    answers = incorrect + [correct]
    random.shuffle(answers)

    embed = discord.Embed(title="🧠 Trivia Time!", color=0x00BFFF)
    embed.description = f"**{question}**"
    embed.add_field(name="Category", value=cat, inline=True)
    embed.add_field(name="Difficulty", value=difficulty, inline=True)
    embed.set_footer(text="You have 20 seconds to answer!")

    view = TriviaView(correct, answers)
    msg = await interaction.followup.send(embed=embed, view=view)

    await asyncio.sleep(20)
    embed.add_field(name="✅ Answer", value=f"**{correct}**", inline=False)
    embed.color = 0x00FF88
    for item in view.children:
        item.disabled = True
    try:
        await msg.edit(embed=embed, view=view)
    except discord.HTTPException:
        pass


_WYR_QUESTIONS = [
    ("Have the ability to fly", "Have the ability to read minds"),
    ("Live in the world of Pokémon", "Live in the world of Avatar"),
    ("Be a powerful wizard in D&D", "Be an invincible warrior in D&D"),
    ("Only play retro games forever", "Only play VR games forever"),
    ("Have unlimited anime to watch", "Have unlimited manga to read"),
    ("Be BMO in real life", "Have BMO as your best friend"),
    ("Fight 100 duck-sized horses", "Fight 1 horse-sized duck"),
    ("Have super speed", "Have super strength"),
    ("Live in the Shire", "Live in Rivendell"),
    ("Be a Jedi", "Be a Sith Lord"),
    ("Have a lightsaber", "Have a wand from Harry Potter"),
    ("Only eat pizza forever", "Only eat sushi forever"),
    ("Be the protagonist of a shonen anime", "Be the protagonist of an isekai"),
    ("Have the Death Note", "Have a Stand from JoJo"),
    ("Be able to pause time", "Be able to rewind time by 10 seconds"),
    ("Live in Cyberpunk's Night City", "Live in Tamriel from Elder Scrolls"),
    ("Master every musical instrument", "Master every programming language"),
    ("Have an anime opening play when you enter a room", "Have a boss battle theme when angry"),
    ("Be a gym leader", "Be a Pokémon professor"),
    ("Have the Infinity Gauntlet", "Have the One Ring"),
]


class WYRView(discord.ui.View):
    def __init__(self, option_a: str, option_b: str) -> None:
        super().__init__(timeout=30)
        self.option_a = option_a
        self.option_b = option_b
        self.votes_a: set[int] = set()
        self.votes_b: set[int] = set()

    @discord.ui.button(label="Option A", style=discord.ButtonStyle.primary, row=0)
    async def vote_a(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        uid = interaction.user.id
        self.votes_b.discard(uid)
        self.votes_a.add(uid)
        total = len(self.votes_a) + len(self.votes_b)
        pct_a = int(len(self.votes_a) / total * 100) if total else 0
        pct_b = int(len(self.votes_b) / total * 100) if total else 0
        await interaction.response.send_message(
            f"You chose **A**! A={pct_a}% ({len(self.votes_a)}) vs B={pct_b}% ({len(self.votes_b)})",
            ephemeral=True,
        )

    @discord.ui.button(label="Option B", style=discord.ButtonStyle.danger, row=0)
    async def vote_b(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        uid = interaction.user.id
        self.votes_a.discard(uid)
        self.votes_b.add(uid)
        total = len(self.votes_a) + len(self.votes_b)
        pct_a = int(len(self.votes_a) / total * 100) if total else 0
        pct_b = int(len(self.votes_b) / total * 100) if total else 0
        await interaction.response.send_message(
            f"You chose **B**! A={pct_a}% ({len(self.votes_a)}) vs B={pct_b}% ({len(self.votes_b)})",
            ephemeral=True,
        )


@app_commands.command(name="wyr", description="Would you rather...?")
async def _wyr_cmd(interaction: discord.Interaction) -> None:
    option_a, option_b = random.choice(_WYR_QUESTIONS)
    embed = discord.Embed(title="🤔 Would You Rather...", color=0xFF6B6B)
    embed.add_field(name="🅰️ Option A", value=option_a, inline=False)
    embed.add_field(name="🅱️ Option B", value=option_b, inline=False)
    embed.set_footer(text="Vote below! Results in 30 seconds.")

    view = WYRView(option_a, option_b)
    await interaction.response.send_message(embed=embed, view=view)
    msg = await interaction.original_response()

    await asyncio.sleep(30)
    total = len(view.votes_a) + len(view.votes_b)
    pct_a = int(len(view.votes_a) / total * 100) if total else 0
    pct_b = int(len(view.votes_b) / total * 100) if total else 0

    embed.add_field(
        name="📊 Results",
        value=(f"🅰️ **{option_a}**: {pct_a}% ({len(view.votes_a)} votes)\n"
               f"🅱️ **{option_b}**: {pct_b}% ({len(view.votes_b)} votes)"),
        inline=False,
    )
    embed.color = 0x00FF88
    for item in view.children:
        item.disabled = True
    try:
        await msg.edit(embed=embed, view=view)
    except discord.HTTPException:
        pass


@app_commands.command(name="musicquiz", description="Guess the song from a 15-second clip!")
async def _musicquiz_cmd(interaction: discord.Interaction) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return

    # Auto-join user's voice channel if not already connected
    member = interaction.user
    if not isinstance(member, discord.Member) or not member.voice or not member.voice.channel:
        await interaction.response.send_message(
            "You need to be in a voice channel!", ephemeral=True)
        return

    await interaction.response.defer()
    vc = await _ensure_voice(interaction.guild, member.voice.channel)
    if not vc:
        await interaction.followup.send("Couldn't join your voice channel!")
        return

    queue = _get_queue(interaction.guild.id)

    # Pick a random popular song via YouTube Music charts/search
    loop = asyncio.get_running_loop()
    genres = [
        "pop hits", "rock classics", "hip hop hits", "r&b hits", "country hits",
        "indie hits", "alternative rock", "90s hits", "2000s hits", "2010s hits",
        "80s hits", "classic rock", "rap hits", "viral songs", "top 40 hits",
    ]
    search_query = random.choice(genres)
    try:
        from ytmusicapi import YTMusic as _YTM
        _yt = _YTM()
        results = await loop.run_in_executor(
            None, lambda: _yt.search(search_query, filter="songs", limit=30))
        results = [r for r in results if r.get("videoId")]
    except Exception:
        results = []

    if not results:
        await interaction.followup.send("Couldn't find a random song! Try again.")
        return

    picked = random.choice(results)
    vid_id = picked["videoId"]
    title = picked.get("title", "Unknown")
    artists = ", ".join(a["name"] for a in picked.get("artists", []))
    mystery = {
        "title": f"{artists} - {title}" if artists else title,
        "webpage_url": f"https://music.youtube.com/watch?v={vid_id}",
    }

    await interaction.followup.send(
        "🎵 **Music Quiz!** Listen to the clip and type your guess! 30 seconds...")

    # Save current state
    was_playing = vc.is_playing() or vc.is_paused()
    saved_track = queue.current
    saved_position = 0.0

    if was_playing and saved_track:
        saved_position = time.time() - queue.start_time
        queue.seeking = True
        vc.stop()
        await asyncio.sleep(0.3)

    # Extract mystery track audio
    loop = asyncio.get_running_loop()
    audio_url, _ = await loop.run_in_executor(
        None, lambda: _extract_audio_url(mystery["webpage_url"]))

    if not audio_url:
        await interaction.channel.send("Couldn't load the mystery track!")
        if was_playing and saved_track:
            await _start_playing(queue, saved_track, interaction.guild.id,
                                 interaction.channel, seek_to=saved_position)
        return

    # Play 15s clip
    quiz_done = asyncio.Event()
    event_loop = asyncio.get_running_loop()

    def after_quiz(error):
        event_loop.call_soon_threadsafe(quiz_done.set)

    start_offset = random.randint(15, 60)
    quiz_opts = {
        "before_options": f"-ss {start_offset}",
        "options": "-vn -t 15",
    }
    source = discord.FFmpegPCMAudio(audio_url, **quiz_opts)
    source = discord.PCMVolumeTransformer(source, volume=queue.volume)
    vc.play(source, after=after_quiz)

    # Wait for correct guess
    correct_title = mystery["title"].lower()
    clean_title = re.sub(r'\(.*?\)|\[.*?\]', '', correct_title).strip()
    clean_title = re.sub(
        r'(?i)(official|video|audio|lyrics|hd|4k|mv|music video|feat\.?.*)',
        '', clean_title,
    ).strip()
    title_words = set(w for w in clean_title.split() if len(w) > 2)

    def check(m: discord.Message) -> bool:
        if m.channel != interaction.channel or m.author.bot:
            return False
        guess_words = set(m.content.lower().split())
        if title_words:
            overlap = len(title_words & guess_words)
            return overlap >= max(1, len(title_words) * 0.5)
        return False

    winner = None
    try:
        msg = await _bot.wait_for("message", check=check, timeout=30)
        winner = msg.author
    except asyncio.TimeoutError:
        pass

    if vc.is_playing():
        vc.stop()
    try:
        await asyncio.wait_for(quiz_done.wait(), timeout=5)
    except asyncio.TimeoutError:
        pass
    await asyncio.sleep(0.3)

    if winner:
        await interaction.channel.send(
            f"🎉 **{winner.display_name}** got it! The song was **[{mystery['title']}]({mystery['webpage_url']})**!")
    else:
        await interaction.channel.send(
            f"⏰ Time's up! The song was **[{mystery['title']}]({mystery['webpage_url']})**!")

    # Restore previous playback
    if was_playing and saved_track:
        await _start_playing(queue, saved_track, interaction.guild.id,
                             interaction.channel, seek_to=saved_position)


# ── Guess Games (Movie / TV Show / Anime) ────────────────────────────

# Shared fuzzy matching for guess games
def _fuzzy_title_match(guess: str, answer: str, alt_answer: str = "") -> bool:
    """Check if a guess fuzzy-matches the answer title."""
    guess_clean = re.sub(r'[^\w\s]', '', guess.lower()).strip()
    answer_clean = re.sub(r'[^\w\s]', '', answer.lower()).strip()
    # Exact-ish match
    if guess_clean == answer_clean:
        return True
    # Answer contained in guess or vice versa
    if answer_clean in guess_clean or guess_clean in answer_clean:
        return True
    # Word overlap (at least 60% of answer words)
    answer_words = set(w for w in answer_clean.split() if len(w) > 2)
    guess_words = set(w for w in guess_clean.split() if len(w) > 2)
    if answer_words:
        overlap = len(answer_words & guess_words)
        if overlap >= max(1, len(answer_words) * 0.6):
            return True
    # Check alt title too
    if alt_answer:
        alt_clean = re.sub(r'[^\w\s]', '', alt_answer.lower()).strip()
        if alt_clean and (guess_clean == alt_clean or alt_clean in guess_clean
                          or guess_clean in alt_clean):
            return True
        alt_words = set(w for w in alt_clean.split() if len(w) > 2)
        if alt_words:
            overlap = len(alt_words & guess_words)
            if overlap >= max(1, len(alt_words) * 0.6):
                return True
    return False


# Track active guess games per channel to prevent overlap
_active_guess_games: dict[int, bool] = {}

# Track active mini games per channel (Phase 4)
_active_minigames: dict[int, str] = {}  # channel_id -> game_name


@app_commands.command(name="guessthemovie", description="Guess the movie from a screenshot or audio clip!")
@app_commands.describe(mode="Game mode: screenshot (default) or audio clip")
@app_commands.choices(mode=[
    app_commands.Choice(name="Screenshot", value="screenshot"),
    app_commands.Choice(name="Audio Clip", value="audio"),
])
async def _guessthemovie_cmd(interaction: discord.Interaction,
                             mode: app_commands.Choice[str] = None) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    if not TMDB_API_KEY:
        await interaction.response.send_message(
            "This command needs a TMDB API key!", ephemeral=True)
        return
    channel_id = interaction.channel.id
    if _active_guess_games.get(channel_id):
        await interaction.response.send_message(
            "A guess game is already running in this channel!", ephemeral=True)
        return

    game_mode = mode.value if mode else "screenshot"

    if game_mode == "audio":
        member = interaction.user
        if not isinstance(member, discord.Member) or not member.voice or not member.voice.channel:
            await interaction.response.send_message(
                "You need to be in a voice channel for audio mode!", ephemeral=True)
            return
        await interaction.response.defer()
        vc = await _ensure_voice(interaction.guild, member.voice.channel)
        if not vc:
            await interaction.followup.send("Couldn't join your voice channel!")
            return
    else:
        await interaction.response.defer()

    _active_guess_games[channel_id] = True

    was_playing = False
    saved_track = None
    saved_position = 0.0
    quiz_done = None

    try:
        # Get a random popular movie
        page = random.randint(1, 50)
        data = await _tmdb("/movie/popular", {"page": str(page)})
        results = data.get("results", [])
        if not results:
            await interaction.followup.send("Couldn't find a movie! Try again.")
            return

        movie = random.choice(results)
        movie_id = movie["id"]
        title = movie.get("title", "Unknown")

        if game_mode == "screenshot":
            images = await _tmdb(f"/movie/{movie_id}/images", {"include_image_language": "en,null"})
            backdrops = images.get("backdrops", [])

            if not backdrops:
                poster = movie.get("poster_path", "")
                if not poster:
                    await interaction.followup.send("Couldn't find images for this movie! Try again.")
                    return
                image_url = f"{TMDB_IMG}{poster}"
            else:
                chosen = random.choice(backdrops)
                image_url = f"https://image.tmdb.org/t/p/w780{chosen['file_path']}"

            embed = discord.Embed(
                title="🎬 Guess The Movie!",
                description="What movie is this screenshot from?\nType your answer in chat! You have **30 seconds**.",
                color=0xE50914,
            )
            embed.set_image(url=image_url)
            embed.set_footer(text="First correct answer wins!")
            await interaction.followup.send(embed=embed)
        else:
            # Audio mode — search YouTube for movie soundtrack/scene
            loop = asyncio.get_running_loop()
            audio_url = None
            for suffix in ["movie soundtrack", "movie scene", "movie theme song"]:
                search_query = f"ytsearch1:{title} {suffix}"
                try:
                    audio_url, _ = await loop.run_in_executor(
                        None, lambda q=search_query: _extract_audio_url(q))
                    if audio_url:
                        break
                except Exception:
                    continue
            if not audio_url:
                await interaction.followup.send("Couldn't extract audio! Try again.")
                return

            embed = discord.Embed(
                title="🎬 Guess The Movie! (Audio Mode)",
                description="Listen to the clip and guess the movie!\nType your answer in chat! You have **30 seconds**.",
                color=0xE50914,
            )
            embed.set_footer(text="First correct answer wins!")
            await interaction.followup.send(embed=embed)

            queue = _get_queue(interaction.guild.id)
            vc = queue.voice_client
            was_playing = vc.is_playing() or vc.is_paused()
            saved_track = queue.current

            if was_playing and saved_track:
                saved_position = time.time() - queue.start_time
                queue.seeking = True
                vc.stop()
                await asyncio.sleep(0.3)

            quiz_done = asyncio.Event()
            event_loop = asyncio.get_running_loop()

            def after_clip(error):
                event_loop.call_soon_threadsafe(quiz_done.set)

            start_offset = random.randint(10, 45)
            source = discord.FFmpegPCMAudio(audio_url,
                before_options=f"-ss {start_offset}", options="-vn -t 15")
            source = discord.PCMVolumeTransformer(source, volume=queue.volume)
            vc.play(source, after=after_clip)

        # Wait for correct guess
        def check(m: discord.Message) -> bool:
            if m.channel.id != channel_id or m.author.bot:
                return False
            return _fuzzy_title_match(m.content, title)

        winner = None
        try:
            msg = await _bot.wait_for("message", check=check, timeout=30)
            winner = msg.author
        except asyncio.TimeoutError:
            pass

        # Stop audio if still playing
        if game_mode == "audio":
            queue = _get_queue(interaction.guild.id)
            vc = queue.voice_client
            if vc and vc.is_playing():
                vc.stop()
            if quiz_done:
                try:
                    await asyncio.wait_for(quiz_done.wait(), timeout=5)
                except asyncio.TimeoutError:
                    pass
            await asyncio.sleep(0.3)

        year = (movie.get("release_date") or "?")[:4]
        rating = movie.get("vote_average", "?")
        tmdb_url = f"https://www.themoviedb.org/movie/{movie_id}"
        title_link = f"[{title}]({tmdb_url})"

        if winner:
            result_embed = discord.Embed(
                title=f"🎉 {winner.display_name} got it!",
                description=f"The movie was **{title_link}** ({year}) — ⭐ {rating}/10",
                color=0x00FF00,
            )
        else:
            result_embed = discord.Embed(
                title="⏰ Time's up!",
                description=f"The movie was **{title_link}** ({year}) — ⭐ {rating}/10",
                color=0xFF0000,
            )
        poster = movie.get("poster_path", "")
        if poster:
            result_embed.set_thumbnail(url=f"{TMDB_IMG}{poster}")
        await interaction.channel.send(embed=result_embed)

        if game_mode == "audio" and was_playing and saved_track:
            await _start_playing(queue, saved_track, interaction.guild.id,
                                 interaction.channel, seek_to=saved_position)
    finally:
        _active_guess_games.pop(channel_id, None)


@app_commands.command(name="guesstheshow", description="Guess the TV show from a screenshot or audio clip!")
@app_commands.describe(mode="Game mode: screenshot (default) or audio clip")
@app_commands.choices(mode=[
    app_commands.Choice(name="Screenshot", value="screenshot"),
    app_commands.Choice(name="Audio Clip", value="audio"),
])
async def _guesstheshow_cmd(interaction: discord.Interaction,
                            mode: app_commands.Choice[str] = None) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    if not TMDB_API_KEY:
        await interaction.response.send_message(
            "This command needs a TMDB API key!", ephemeral=True)
        return
    channel_id = interaction.channel.id
    if _active_guess_games.get(channel_id):
        await interaction.response.send_message(
            "A guess game is already running in this channel!", ephemeral=True)
        return

    game_mode = mode.value if mode else "screenshot"

    if game_mode == "audio":
        member = interaction.user
        if not isinstance(member, discord.Member) or not member.voice or not member.voice.channel:
            await interaction.response.send_message(
                "You need to be in a voice channel for audio mode!", ephemeral=True)
            return
        await interaction.response.defer()
        vc = await _ensure_voice(interaction.guild, member.voice.channel)
        if not vc:
            await interaction.followup.send("Couldn't join your voice channel!")
            return
    else:
        await interaction.response.defer()

    _active_guess_games[channel_id] = True

    was_playing = False
    saved_track = None
    saved_position = 0.0
    quiz_done = None

    try:
        page = random.randint(1, 50)
        data = await _tmdb("/tv/popular", {"page": str(page)})
        results = data.get("results", [])
        if not results:
            await interaction.followup.send("Couldn't find a show! Try again.")
            return

        show = random.choice(results)
        show_id = show["id"]
        title = show.get("name", "Unknown")

        if game_mode == "screenshot":
            images = await _tmdb(f"/tv/{show_id}/images", {"include_image_language": "en,null"})
            backdrops = images.get("backdrops", [])

            if not backdrops:
                poster = show.get("poster_path", "")
                if not poster:
                    await interaction.followup.send("Couldn't find images for this show! Try again.")
                    return
                image_url = f"{TMDB_IMG}{poster}"
            else:
                chosen = random.choice(backdrops)
                image_url = f"https://image.tmdb.org/t/p/w780{chosen['file_path']}"

            embed = discord.Embed(
                title="📺 Guess The Show!",
                description="What TV show is this screenshot from?\nType your answer in chat! You have **30 seconds**.",
                color=0x3DB4F2,
            )
            embed.set_image(url=image_url)
            embed.set_footer(text="First correct answer wins!")
            await interaction.followup.send(embed=embed)
        else:
            # Audio mode — search YouTube for TV show theme/scene
            loop = asyncio.get_running_loop()
            audio_url = None
            for suffix in ["tv show theme song", "tv show intro", "tv soundtrack"]:
                search_query = f"ytsearch1:{title} {suffix}"
                try:
                    audio_url, _ = await loop.run_in_executor(
                        None, lambda q=search_query: _extract_audio_url(q))
                    if audio_url:
                        break
                except Exception:
                    continue
            if not audio_url:
                await interaction.followup.send("Couldn't extract audio! Try again.")
                return

            embed = discord.Embed(
                title="📺 Guess The Show! (Audio Mode)",
                description="Listen to the clip and guess the TV show!\nType your answer in chat! You have **30 seconds**.",
                color=0x3DB4F2,
            )
            embed.set_footer(text="First correct answer wins!")
            await interaction.followup.send(embed=embed)

            queue = _get_queue(interaction.guild.id)
            vc = queue.voice_client
            was_playing = vc.is_playing() or vc.is_paused()
            saved_track = queue.current

            if was_playing and saved_track:
                saved_position = time.time() - queue.start_time
                queue.seeking = True
                vc.stop()
                await asyncio.sleep(0.3)

            quiz_done = asyncio.Event()
            event_loop = asyncio.get_running_loop()

            def after_clip(error):
                event_loop.call_soon_threadsafe(quiz_done.set)

            start_offset = random.randint(5, 30)
            source = discord.FFmpegPCMAudio(audio_url,
                before_options=f"-ss {start_offset}", options="-vn -t 15")
            source = discord.PCMVolumeTransformer(source, volume=queue.volume)
            vc.play(source, after=after_clip)

        # Wait for correct guess
        def check(m: discord.Message) -> bool:
            if m.channel.id != channel_id or m.author.bot:
                return False
            return _fuzzy_title_match(m.content, title)

        winner = None
        try:
            msg = await _bot.wait_for("message", check=check, timeout=30)
            winner = msg.author
        except asyncio.TimeoutError:
            pass

        # Stop audio if still playing
        if game_mode == "audio":
            queue = _get_queue(interaction.guild.id)
            vc = queue.voice_client
            if vc and vc.is_playing():
                vc.stop()
            if quiz_done:
                try:
                    await asyncio.wait_for(quiz_done.wait(), timeout=5)
                except asyncio.TimeoutError:
                    pass
            await asyncio.sleep(0.3)

        year = (show.get("first_air_date") or "?")[:4]
        rating = show.get("vote_average", "?")
        tmdb_url = f"https://www.themoviedb.org/tv/{show_id}"
        title_link = f"[{title}]({tmdb_url})"

        if winner:
            result_embed = discord.Embed(
                title=f"🎉 {winner.display_name} got it!",
                description=f"The show was **{title_link}** ({year}) — ⭐ {rating}/10",
                color=0x00FF00,
            )
        else:
            result_embed = discord.Embed(
                title="⏰ Time's up!",
                description=f"The show was **{title_link}** ({year}) — ⭐ {rating}/10",
                color=0xFF0000,
            )
        poster = show.get("poster_path", "")
        if poster:
            result_embed.set_thumbnail(url=f"{TMDB_IMG}{poster}")
        await interaction.channel.send(embed=result_embed)

        if game_mode == "audio" and was_playing and saved_track:
            await _start_playing(queue, saved_track, interaction.guild.id,
                                 interaction.channel, seek_to=saved_position)
    finally:
        _active_guess_games.pop(channel_id, None)


@app_commands.command(name="guesstheanime", description="Guess the anime from a screenshot or audio clip!")
@app_commands.describe(mode="Game mode: screenshot (default) or audio clip")
@app_commands.choices(mode=[
    app_commands.Choice(name="Screenshot", value="screenshot"),
    app_commands.Choice(name="Audio Clip", value="audio"),
])
async def _guesstheanime_cmd(interaction: discord.Interaction,
                             mode: app_commands.Choice[str] = None) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    channel_id = interaction.channel.id
    if _active_guess_games.get(channel_id):
        await interaction.response.send_message(
            "A guess game is already running in this channel!", ephemeral=True)
        return

    game_mode = mode.value if mode else "screenshot"

    if game_mode == "audio":
        member = interaction.user
        if not isinstance(member, discord.Member) or not member.voice or not member.voice.channel:
            await interaction.response.send_message(
                "You need to be in a voice channel for audio mode!", ephemeral=True)
            return
        await interaction.response.defer()
        vc = await _ensure_voice(interaction.guild, member.voice.channel)
        if not vc:
            await interaction.followup.send("Couldn't join your voice channel!")
            return
    else:
        await interaction.response.defer()

    try:
        # Get a random popular anime from Jikan
        loop = asyncio.get_running_loop()
        import requests as req
        page = random.randint(1, 10)
        try:
            r = await loop.run_in_executor(None, lambda: req.get(
                "https://api.jikan.moe/v4/top/anime",
                params={"page": str(page), "limit": "25", "filter": "bypopularity"},
                timeout=10,
            ))
            r.raise_for_status()
            anime_list = r.json().get("data", [])
        except Exception as e:
            await interaction.followup.send(f"Couldn't fetch anime: {e}")
            return

        if not anime_list:
            await interaction.followup.send("Couldn't find anime! Try again.")
            return

        anime = random.choice(anime_list)
        jp_title = anime.get("title") or "Unknown"
        en_title = anime.get("title_english") or ""
        display_title = en_title or jp_title
        cover = (anime.get("images", {}).get("jpg", {}).get("large_image_url")
                 or anime.get("images", {}).get("jpg", {}).get("image_url", ""))
        mal_url = anime.get("url") or ""

        if game_mode == "screenshot":
            # Try to get anime pictures from Jikan
            anime_id = anime.get("mal_id")
            image_url = None
            if anime_id:
                try:
                    await asyncio.sleep(0.5)  # Jikan rate limit
                    r2 = await loop.run_in_executor(None, lambda: req.get(
                        f"https://api.jikan.moe/v4/anime/{anime_id}/pictures",
                        timeout=10,
                    ))
                    r2.raise_for_status()
                    pictures = r2.json().get("data", [])
                    if pictures:
                        pic = random.choice(pictures)
                        image_url = (pic.get("jpg", {}).get("large_image_url")
                                     or pic.get("jpg", {}).get("image_url", ""))
                except Exception:
                    pass

            if not image_url:
                image_url = cover
            if not image_url:
                await interaction.followup.send("Couldn't find images for this anime! Try again.")
                return

            embed = discord.Embed(
                title="🎌 Guess The Anime!",
                description="What anime is this from?\nType your answer in chat! You have **30 seconds**.",
                color=0xFF6B6B,
            )
            embed.set_image(url=image_url)
            embed.set_footer(text="First correct answer wins!")
            await interaction.followup.send(embed=embed)

        else:
            # Audio mode — search YouTube for anime opening/scene clip
            audio_url = None
            for suffix in ["anime opening", "anime ost", "anime theme"]:
                search_query = f"ytsearch1:{display_title} {suffix}"
                try:
                    audio_url, _ = await loop.run_in_executor(
                        None, lambda q=search_query: _extract_audio_url(q))
                    if audio_url:
                        break
                except Exception:
                    continue

            if not audio_url:
                await interaction.followup.send("Couldn't extract audio! Try again.")
                return

            embed = discord.Embed(
                title="🎌 Guess The Anime! (Audio Mode)",
                description="Listen to the clip and guess the anime!\nType your answer in chat! You have **30 seconds**.",
                color=0xFF6B6B,
            )
            embed.set_footer(text="First correct answer wins!")
            await interaction.followup.send(embed=embed)

            # Save current playback state
            queue = _get_queue(interaction.guild.id)
            vc = queue.voice_client
            was_playing = vc.is_playing() or vc.is_paused()
            saved_track = queue.current
            saved_position = 0.0

            if was_playing and saved_track:
                saved_position = time.time() - queue.start_time
                queue.seeking = True
                vc.stop()
                await asyncio.sleep(0.3)

            # Play 15s clip
            quiz_done = asyncio.Event()
            event_loop = asyncio.get_running_loop()

            def after_clip(error):
                event_loop.call_soon_threadsafe(quiz_done.set)

            start_offset = random.randint(5, 30)
            clip_opts = {
                "before_options": f"-ss {start_offset}",
                "options": "-vn -t 15",
            }
            source = discord.FFmpegPCMAudio(audio_url, **clip_opts)
            source = discord.PCMVolumeTransformer(source, volume=queue.volume)
            vc.play(source, after=after_clip)

        # Wait for correct guess
        def check(m: discord.Message) -> bool:
            if m.channel.id != channel_id or m.author.bot:
                return False
            return _fuzzy_title_match(m.content, jp_title, en_title)

        winner = None
        try:
            msg = await _bot.wait_for("message", check=check, timeout=30)
            winner = msg.author
        except asyncio.TimeoutError:
            pass

        # Stop audio if still playing (audio mode)
        if game_mode == "audio":
            queue = _get_queue(interaction.guild.id)
            vc = queue.voice_client
            if vc and vc.is_playing():
                vc.stop()
            try:
                await asyncio.wait_for(quiz_done.wait(), timeout=5)
            except (asyncio.TimeoutError, NameError):
                pass
            await asyncio.sleep(0.3)

        score = anime.get("score") or "N/A"
        title_line = display_title
        if en_title and jp_title and en_title != jp_title:
            title_line = f"{en_title} ({jp_title})"

        title_link = f"[{title_line}]({mal_url})" if mal_url else title_line

        if winner:
            result_embed = discord.Embed(
                title=f"🎉 {winner.display_name} got it!",
                description=f"The anime was **{title_link}** — ⭐ {score}",
                color=0x00FF00,
            )
        else:
            result_embed = discord.Embed(
                title="⏰ Time's up!",
                description=f"The anime was **{title_link}** — ⭐ {score}",
                color=0xFF0000,
            )
        if cover:
            result_embed.set_thumbnail(url=cover)
        await interaction.channel.send(embed=result_embed)

        # Restore previous playback (audio mode)
        if game_mode == "audio" and was_playing and saved_track:
            await _start_playing(queue, saved_track, interaction.guild.id,
                                 interaction.channel, seek_to=saved_position)
    finally:
        _active_guess_games.pop(channel_id, None)


@app_commands.command(name="guessthegame", description="Guess the video game from a screenshot or audio clip!")
@app_commands.describe(mode="Game mode: screenshot (default) or audio clip")
@app_commands.choices(mode=[
    app_commands.Choice(name="Screenshot", value="screenshot"),
    app_commands.Choice(name="Audio Clip", value="audio"),
])
async def _guessthegame_cmd(interaction: discord.Interaction,
                            mode: app_commands.Choice[str] = None) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    if not RAWG_API_KEY:
        await interaction.response.send_message(
            "This command needs a RAWG API key!", ephemeral=True)
        return
    channel_id = interaction.channel.id
    if _active_guess_games.get(channel_id):
        await interaction.response.send_message(
            "A guess game is already running in this channel!", ephemeral=True)
        return

    game_mode = mode.value if mode else "screenshot"

    if game_mode == "audio":
        member = interaction.user
        if not isinstance(member, discord.Member) or not member.voice or not member.voice.channel:
            await interaction.response.send_message(
                "You need to be in a voice channel for audio mode!", ephemeral=True)
            return
        await interaction.response.defer()
        vc = await _ensure_voice(interaction.guild, member.voice.channel)
        if not vc:
            await interaction.followup.send("Couldn't join your voice channel!")
            return
    else:
        await interaction.response.defer()

    _active_guess_games[channel_id] = True

    was_playing = False
    saved_track = None
    saved_position = 0.0
    quiz_done = None

    try:
        # Get a random popular/well-rated game from RAWG
        page = random.randint(1, 20)
        data = await _rawg("/games", {
            "ordering": "-rating",
            "page_size": "20",
            "page": str(page),
            "metacritic": "60,100",
        })
        results = data.get("results", [])
        if not results:
            await interaction.followup.send("Couldn't find a game! Try again.")
            return

        game = random.choice(results)
        game_id = game["id"]
        title = game.get("name", "Unknown")
        slug = game.get("slug", "")
        cover = game.get("background_image", "")

        if game_mode == "screenshot":
            # Fetch screenshots from RAWG
            try:
                screenshots = await _rawg(f"/games/{game_id}/screenshots", {"page_size": "10"})
                shots = screenshots.get("results", [])
            except Exception:
                shots = []

            if shots:
                chosen = random.choice(shots)
                image_url = chosen.get("image", "")
            elif cover:
                image_url = cover
            else:
                await interaction.followup.send("Couldn't find screenshots for this game! Try again.")
                return

            embed = discord.Embed(
                title="🎮 Guess The Game!",
                description="What game is this screenshot from?\nType your answer in chat! You have **30 seconds**.",
                color=0x00D166,
            )
            embed.set_image(url=image_url)
            embed.set_footer(text="First correct answer wins!")
            await interaction.followup.send(embed=embed)
        else:
            # Audio mode — search YouTube for game OST/soundtrack
            loop = asyncio.get_running_loop()
            audio_url = None
            for suffix in ["game soundtrack ost", "game theme music", "game ost"]:
                search_query = f"ytsearch1:{title} {suffix}"
                try:
                    audio_url, _ = await loop.run_in_executor(
                        None, lambda q=search_query: _extract_audio_url(q))
                    if audio_url:
                        break
                except Exception:
                    continue
            if not audio_url:
                await interaction.followup.send("Couldn't extract audio! Try again.")
                return

            embed = discord.Embed(
                title="🎮 Guess The Game! (Audio Mode)",
                description="Listen to the clip and guess the video game!\nType your answer in chat! You have **30 seconds**.",
                color=0x00D166,
            )
            embed.set_footer(text="First correct answer wins!")
            await interaction.followup.send(embed=embed)

            queue = _get_queue(interaction.guild.id)
            vc = queue.voice_client
            was_playing = vc.is_playing() or vc.is_paused()
            saved_track = queue.current

            if was_playing and saved_track:
                saved_position = time.time() - queue.start_time
                queue.seeking = True
                vc.stop()
                await asyncio.sleep(0.3)

            quiz_done = asyncio.Event()
            event_loop = asyncio.get_running_loop()

            def after_clip(error):
                event_loop.call_soon_threadsafe(quiz_done.set)

            start_offset = random.randint(10, 45)
            source = discord.FFmpegPCMAudio(audio_url,
                before_options=f"-ss {start_offset}", options="-vn -t 15")
            source = discord.PCMVolumeTransformer(source, volume=queue.volume)
            vc.play(source, after=after_clip)

        # Wait for correct guess
        def check(m: discord.Message) -> bool:
            if m.channel.id != channel_id or m.author.bot:
                return False
            return _fuzzy_title_match(m.content, title)

        winner = None
        try:
            msg = await _bot.wait_for("message", check=check, timeout=30)
            winner = msg.author
        except asyncio.TimeoutError:
            pass

        # Stop audio if still playing
        if game_mode == "audio":
            queue = _get_queue(interaction.guild.id)
            vc = queue.voice_client
            if vc and vc.is_playing():
                vc.stop()
            if quiz_done:
                try:
                    await asyncio.wait_for(quiz_done.wait(), timeout=5)
                except asyncio.TimeoutError:
                    pass
            await asyncio.sleep(0.3)

        # Build result info
        released = (game.get("released") or "?")[:4]
        rating = game.get("rating", "?")
        metacritic = game.get("metacritic") or "N/A"
        genres = ", ".join(g["name"] for g in game.get("genres", [])[:3]) or "N/A"

        rawg_url = f"https://rawg.io/games/{slug}" if slug else ""
        title_link = f"[{title}]({rawg_url})" if rawg_url else title

        if winner:
            result_embed = discord.Embed(
                title=f"🎉 {winner.display_name} got it!",
                description=f"The game was **{title_link}** ({released}) — ⭐ {rating}/5 | Metacritic: {metacritic}\n{genres}",
                color=0x00FF00,
            )
        else:
            result_embed = discord.Embed(
                title="⏰ Time's up!",
                description=f"The game was **{title_link}** ({released}) — ⭐ {rating}/5 | Metacritic: {metacritic}\n{genres}",
                color=0xFF0000,
            )
        if cover:
            result_embed.set_thumbnail(url=cover)
        await interaction.channel.send(embed=result_embed)

        # Restore previous playback (audio mode)
        if game_mode == "audio" and was_playing and saved_track:
            await _start_playing(queue, saved_track, interaction.guild.id,
                                 interaction.channel, seek_to=saved_position)
    finally:
        _active_guess_games.pop(channel_id, None)


# ── Phase 6: Anime Additions ─────────────────────────────────────────


def _waifu_pics_get(endpoint: str) -> str:
    import requests as req
    r = req.get(f"https://api.waifu.pics/sfw/{endpoint}", timeout=10)
    r.raise_for_status()
    return r.json().get("url", "")


async def _waifu_pics(endpoint: str) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: _waifu_pics_get(endpoint))


@app_commands.command(name="waifu", description="Get a random waifu image!")
async def _waifu_cmd(interaction: discord.Interaction) -> None:
    try:
        url = await _waifu_pics("waifu")
    except Exception as e:
        await interaction.response.send_message(f"Couldn't fetch waifu: {e}", ephemeral=True)
        return
    embed = discord.Embed(title="💖 Random Waifu", color=0xFF69B4)
    embed.set_image(url=url)
    await interaction.response.send_message(embed=embed)


@app_commands.command(name="husbando", description="Get a random husbando image!")
async def _husbando_cmd(interaction: discord.Interaction) -> None:
    try:
        # waifu.pics doesn't have a husbando endpoint, so use neko as alt
        url = await _waifu_pics("neko")
    except Exception as e:
        await interaction.response.send_message(f"Couldn't fetch husbando: {e}", ephemeral=True)
        return
    embed = discord.Embed(title="💙 Random Husbando", color=0x4169E1)
    embed.set_image(url=url)
    await interaction.response.send_message(embed=embed)


def _animequote_get() -> dict:
    import requests as req
    r = req.get("https://animechan.io/api/v1/quotes/random", timeout=10)
    r.raise_for_status()
    return r.json()


async def _animequote_fetch() -> dict:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _animequote_get)


@app_commands.command(name="animequote", description="Get a random anime quote!")
async def _animequote_cmd(interaction: discord.Interaction) -> None:
    try:
        data = await _animequote_fetch()
    except Exception as e:
        await interaction.response.send_message(f"Couldn't fetch quote: {e}", ephemeral=True)
        return
    qdata = data.get("data", data)
    content = qdata.get("content", "No quote found.")
    anime_name = qdata.get("anime", {}).get("name", "Unknown Anime") if isinstance(qdata.get("anime"), dict) else "Unknown Anime"
    char_name = qdata.get("character", {}).get("name", "Unknown Character") if isinstance(qdata.get("character"), dict) else "Unknown Character"
    embed = discord.Embed(
        title="🎌 Anime Quote",
        description=f'*"{content}"*',
        color=0xFF6B6B,
    )
    embed.add_field(name="Character", value=char_name, inline=True)
    embed.add_field(name="Anime", value=anime_name, inline=True)
    await interaction.response.send_message(embed=embed)


# ── Watchlist Group ──────────────────────────────────────────────────

_watchlist_group = app_commands.Group(name="watchlist", description="Manage your anime watchlist")


@_watchlist_group.command(name="add", description="Add an anime to your watchlist")
@app_commands.describe(title="Anime title to add")
async def _watchlist_add(interaction: discord.Interaction, title: str) -> None:
    uid = interaction.user.id
    db = _get_db()
    row = db.execute("SELECT value FROM user_prefs WHERE user_id = ? AND key = 'watchlist'", (uid,)).fetchone()
    watchlist = json.loads(row["value"]) if row else []
    if title in watchlist:
        db.close()
        await interaction.response.send_message(f"**{title}** is already on your watchlist!", ephemeral=True)
        return
    if len(watchlist) >= 50:
        db.close()
        await interaction.response.send_message("Your watchlist is full (max 50)!", ephemeral=True)
        return
    watchlist.append(title)
    db.execute(
        "INSERT OR REPLACE INTO user_prefs (user_id, key, value) VALUES (?, 'watchlist', ?)",
        (uid, json.dumps(watchlist)),
    )
    db.commit()
    db.close()
    await interaction.response.send_message(f"📝 Added **{title}** to your watchlist! ({len(watchlist)} total)")


@_watchlist_group.command(name="remove", description="Remove an anime from your watchlist")
@app_commands.describe(title="Anime title to remove")
async def _watchlist_remove(interaction: discord.Interaction, title: str) -> None:
    uid = interaction.user.id
    db = _get_db()
    row = db.execute("SELECT value FROM user_prefs WHERE user_id = ? AND key = 'watchlist'", (uid,)).fetchone()
    watchlist = json.loads(row["value"]) if row else []
    # Case-insensitive matching
    match = None
    for item in watchlist:
        if item.lower() == title.lower():
            match = item
            break
    if not match:
        db.close()
        await interaction.response.send_message(f"**{title}** is not on your watchlist!", ephemeral=True)
        return
    watchlist.remove(match)
    db.execute(
        "INSERT OR REPLACE INTO user_prefs (user_id, key, value) VALUES (?, 'watchlist', ?)",
        (uid, json.dumps(watchlist)),
    )
    db.commit()
    db.close()
    await interaction.response.send_message(f"🗑️ Removed **{match}** from your watchlist! ({len(watchlist)} remaining)")


@_watchlist_group.command(name="show", description="Show your anime watchlist")
async def _watchlist_show(interaction: discord.Interaction) -> None:
    uid = interaction.user.id
    db = _get_db()
    row = db.execute("SELECT value FROM user_prefs WHERE user_id = ? AND key = 'watchlist'", (uid,)).fetchone()
    db.close()
    watchlist = json.loads(row["value"]) if row else []
    if not watchlist:
        await interaction.response.send_message("Your watchlist is empty! Use `/watchlist add` to add anime.", ephemeral=True)
        return
    lines = [f"`{i}.` {title}" for i, title in enumerate(watchlist[:20], 1)]
    if len(watchlist) > 20:
        lines.append(f"*...and {len(watchlist) - 20} more*")
    embed = discord.Embed(
        title=f"📋 {interaction.user.display_name}'s Watchlist",
        description="\n".join(lines),
        color=0x2E51A2,
    )
    embed.set_footer(text=f"{len(watchlist)} anime total")
    await interaction.response.send_message(embed=embed)


@app_commands.command(name="schedule", description="Show currently airing anime schedule")
async def _schedule_cmd(interaction: discord.Interaction) -> None:
    await interaction.response.defer()
    import requests as req
    try:
        loop = asyncio.get_running_loop()
        r = await loop.run_in_executor(None, lambda: req.get(
            "https://api.jikan.moe/v4/seasons/now?filter=tv&limit=15", timeout=10,
        ))
        r.raise_for_status()
        data = r.json().get("data", [])
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch schedule: {e}")
        return

    if not data:
        await interaction.followup.send("No airing anime found!")
        return

    day_map = {
        "Mondays": "Monday", "Tuesdays": "Tuesday", "Wednesdays": "Wednesday",
        "Thursdays": "Thursday", "Fridays": "Friday", "Saturdays": "Saturday",
        "Sundays": "Sunday",
    }
    embed = discord.Embed(title="📅 Currently Airing Anime", color=0x00BFFF)
    lines = []
    for a in data[:15]:
        title = a.get("title", "Unknown")
        broadcast = a.get("broadcast", {})
        day = broadcast.get("day", "?") if broadcast else "?"
        day = day_map.get(day, day)
        time_str = broadcast.get("time", "") if broadcast else ""
        schedule_str = f"{day} {time_str}".strip() if day != "?" else "TBA"
        score = a.get("score") or "N/A"
        lines.append(f"📺 **{title}** — {schedule_str} (⭐ {score})")

    embed.description = "\n".join(lines)
    await interaction.followup.send(embed=embed)


# ── Phase 7: Media + Reddit ─────────────────────────────────────────


def _reddit_get(subreddit: str) -> list:
    import requests as req
    r = req.get(
        f"https://www.reddit.com/r/{subreddit}/hot.json?limit=50",
        headers={"User-Agent": "BMO-Bot/1.0"},
        timeout=10,
    )
    r.raise_for_status()
    posts = r.json().get("data", {}).get("children", [])
    image_posts = []
    for p in posts:
        pdata = p.get("data", {})
        if pdata.get("over_18"):
            continue
        url = pdata.get("url", "")
        if any(url.lower().endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".gif")):
            image_posts.append({
                "title": pdata.get("title", "Untitled"),
                "url": url,
                "permalink": f"https://reddit.com{pdata.get('permalink', '')}",
                "author": pdata.get("author", "unknown"),
                "ups": pdata.get("ups", 0),
            })
    return image_posts


async def _reddit(subreddit: str) -> list:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: _reddit_get(subreddit))


@app_commands.command(name="meme", description="Get a random meme!")
@app_commands.describe(subreddit="Subreddit to pull memes from")
@app_commands.choices(subreddit=[
    app_commands.Choice(name="Memes", value="memes"),
    app_commands.Choice(name="Dank Memes", value="dankmemes"),
    app_commands.Choice(name="Anime Memes", value="animemes"),
    app_commands.Choice(name="Programmer Humor", value="programmerhumor"),
])
async def _meme_cmd(interaction: discord.Interaction, subreddit: str = "memes") -> None:
    await interaction.response.defer()
    try:
        posts = await _reddit(subreddit)
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch memes: {e}")
        return
    if not posts:
        await interaction.followup.send("No memes found! Try again.")
        return
    post = random.choice(posts)
    embed = discord.Embed(title=post["title"][:256], color=0xFF4500)
    embed.set_image(url=post["url"])
    embed.set_footer(text=f"r/{subreddit} | ⬆️ {post['ups']} | u/{post['author']}")
    embed.url = post["permalink"]
    await interaction.followup.send(embed=embed)


@app_commands.command(name="reddit", description="Get a random image from a subreddit")
@app_commands.describe(subreddit="Subreddit name (without r/)")
async def _reddit_cmd(interaction: discord.Interaction, subreddit: str) -> None:
    # Sanitize input
    subreddit = re.sub(r'[^a-zA-Z0-9_]', '', subreddit)
    if not subreddit:
        await interaction.response.send_message("Invalid subreddit name!", ephemeral=True)
        return
    await interaction.response.defer()
    try:
        posts = await _reddit(subreddit)
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch from r/{subreddit}: {e}")
        return
    if not posts:
        await interaction.followup.send(f"No image posts found in r/{subreddit}!")
        return
    post = random.choice(posts)
    embed = discord.Embed(title=post["title"][:256], color=0xFF4500)
    embed.set_image(url=post["url"])
    embed.set_footer(text=f"r/{subreddit} | ⬆️ {post['ups']} | u/{post['author']}")
    embed.url = post["permalink"]
    await interaction.followup.send(embed=embed)


def _wallhaven_get(category: str) -> str:
    import requests as req
    r = req.get(
        "https://wallhaven.cc/api/v1/search",
        params={"q": category, "sorting": "random", "purity": "100"},
        timeout=10,
    )
    r.raise_for_status()
    data = r.json().get("data", [])
    if not data:
        return ""
    return random.choice(data).get("path", "")


async def _wallhaven(category: str) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: _wallhaven_get(category))


@app_commands.command(name="wallpaper", description="Get a random wallpaper!")
@app_commands.describe(category="Wallpaper category")
@app_commands.choices(category=[
    app_commands.Choice(name="Anime", value="anime"),
    app_commands.Choice(name="Gaming", value="gaming"),
    app_commands.Choice(name="Nature", value="nature"),
    app_commands.Choice(name="Space", value="space"),
])
async def _wallpaper_cmd(interaction: discord.Interaction, category: str = "anime") -> None:
    await interaction.response.defer()
    try:
        url = await _wallhaven(category)
    except Exception as e:
        await interaction.followup.send(f"Couldn't fetch wallpaper: {e}")
        return
    if not url:
        await interaction.followup.send("No wallpapers found! Try again.")
        return
    embed = discord.Embed(
        title=f"🖼️ Random {category.title()} Wallpaper",
        color=0x00CED1,
    )
    embed.set_image(url=url)
    await interaction.followup.send(embed=embed)


@app_commands.command(name="trailer", description="Search for a trailer on YouTube")
@app_commands.describe(title="Movie, show, or game title")
async def _trailer_cmd(interaction: discord.Interaction, title: str) -> None:
    await interaction.response.defer()
    loop = asyncio.get_running_loop()
    try:
        result = await loop.run_in_executor(
            None, lambda: _search_youtube(f"{title} official trailer")
        )
    except Exception as e:
        await interaction.followup.send(f"Couldn't search for trailer: {e}")
        return
    if not result:
        await interaction.followup.send(f"No trailer found for: **{title}**")
        return
    embed = discord.Embed(
        title=f"🎬 {result['title']}",
        url=result.get("webpage_url", ""),
        color=0xE50914,
    )
    embed.add_field(name="Duration", value=_format_duration(result.get("duration", 0)), inline=True)
    if result.get("thumbnail"):
        embed.set_image(url=result["thumbnail"])
    embed.set_footer(text="Click the title to watch on YouTube")
    await interaction.followup.send(embed=embed)


# ── Phase 8: Birthdays ──────────────────────────────────────────────

_birthday_group = app_commands.Group(name="birthday", description="Birthday system")


def _days_in_month(month: int) -> int:
    """Return max days for a month (ignoring leap years for birthday validation)."""
    if month in (1, 3, 5, 7, 8, 10, 12):
        return 31
    elif month in (4, 6, 9, 11):
        return 30
    elif month == 2:
        return 29
    return 0


@_birthday_group.command(name="set", description="Set your birthday")
@app_commands.describe(month="Month (1-12)", day="Day (1-31)")
async def _birthday_set(interaction: discord.Interaction, month: int, day: int) -> None:
    if month < 1 or month > 12:
        await interaction.response.send_message("Month must be between 1 and 12!", ephemeral=True)
        return
    max_day = _days_in_month(month)
    if day < 1 or day > max_day:
        await interaction.response.send_message(
            f"Day must be between 1 and {max_day} for month {month}!", ephemeral=True)
        return
    value = f"{month:02d}-{day:02d}"
    uid = interaction.user.id
    db = _get_db()
    db.execute(
        "INSERT OR REPLACE INTO user_prefs (user_id, key, value) VALUES (?, 'birthday', ?)",
        (uid, value),
    )
    db.commit()
    db.close()
    month_names = ["", "January", "February", "March", "April", "May", "June",
                   "July", "August", "September", "October", "November", "December"]
    await interaction.response.send_message(
        f"🎂 Birthday set to **{month_names[month]} {day}**!")


@_birthday_group.command(name="list", description="Show upcoming birthdays")
async def _birthday_list(interaction: discord.Interaction) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    db = _get_db()
    rows = db.execute("SELECT user_id, value FROM user_prefs WHERE key = 'birthday'").fetchall()
    db.close()

    if not rows:
        await interaction.response.send_message("No birthdays registered yet! Use `/birthday set` to add yours.", ephemeral=True)
        return

    today = datetime.date.today()
    month_names = ["", "January", "February", "March", "April", "May", "June",
                   "July", "August", "September", "October", "November", "December"]

    entries = []
    for row in rows:
        uid = row["user_id"]
        val = row["value"]
        # Only include guild members
        member = interaction.guild.get_member(uid)
        if not member:
            continue
        try:
            parts = val.split("-")
            m, d = int(parts[0]), int(parts[1])
            # Calculate days until next occurrence
            bday_this_year = datetime.date(today.year, m, d)
            if bday_this_year < today:
                bday_next = datetime.date(today.year + 1, m, d)
            else:
                bday_next = bday_this_year
            days_until = (bday_next - today).days
            entries.append((days_until, member.display_name, m, d))
        except (ValueError, IndexError):
            continue

    if not entries:
        await interaction.response.send_message("No birthdays found for members in this server!", ephemeral=True)
        return

    entries.sort()
    lines = []
    for days_until, name, m, d in entries[:10]:
        date_str = f"{month_names[m]} {d}"
        if days_until == 0:
            lines.append(f"🎉 **{name}** — {date_str} (**TODAY!**)")
        elif days_until == 1:
            lines.append(f"🎂 **{name}** — {date_str} (tomorrow!)")
        else:
            lines.append(f"🎂 **{name}** — {date_str} (in {days_until} days)")

    embed = discord.Embed(
        title="🎂 Upcoming Birthdays",
        description="\n".join(lines),
        color=0xFF69B4,
    )
    await interaction.response.send_message(embed=embed)


@tasks.loop(hours=24)
async def _birthday_checker() -> None:
    """Check for birthdays and announce them daily."""
    if not _bot or not _bot.guilds:
        return
    today_str = f"{datetime.date.today().month:02d}-{datetime.date.today().day:02d}"
    db = _get_db()
    rows = db.execute(
        "SELECT user_id FROM user_prefs WHERE key = 'birthday' AND value = ?",
        (today_str,),
    ).fetchall()
    db.close()

    if not rows:
        return

    birthday_user_ids = {row["user_id"] for row in rows}

    for guild in _bot.guilds:
        # Find the best channel to announce in
        channel = guild.system_channel
        if not channel:
            # Fall back to first text channel
            for ch in guild.text_channels:
                perms = ch.permissions_for(guild.me)
                if perms.send_messages:
                    channel = ch
                    break
        if not channel:
            continue

        for uid in birthday_user_ids:
            member = guild.get_member(uid)
            if not member:
                continue
            embed = discord.Embed(
                title="🎉🎂 Happy Birthday! 🎂🎉",
                description=f"Today is **{member.display_name}**'s birthday! 🥳\nHappy birthday, {member.mention}! BMO hopes you have an amazing day!",
                color=0xFF69B4,
            )
            embed.set_thumbnail(url=member.display_avatar.url)
            try:
                await channel.send(embed=embed)
            except discord.HTTPException:
                pass


@_birthday_checker.before_loop
async def _birthday_checker_before() -> None:
    if _bot:
        await _bot.wait_until_ready()


# ── Phase 9: External Integrations ──────────────────────────────────


def _twitch_get_token() -> str:
    """Get or refresh Twitch OAuth token using client credentials."""
    if not TWITCH_CLIENT_ID or not TWITCH_CLIENT_SECRET:
        return ""
    # Check cached token
    db = _get_db()
    row = db.execute(
        "SELECT value FROM user_prefs WHERE user_id = 0 AND key = 'twitch_token'"
    ).fetchone()
    if row:
        try:
            cached = json.loads(row["value"])
            if cached.get("expires", 0) > time.time() + 60:
                db.close()
                return cached["token"]
        except (json.JSONDecodeError, KeyError):
            pass
    # Request new token
    import requests as req
    try:
        r = req.post(
            "https://id.twitch.tv/oauth2/token",
            data={
                "client_id": TWITCH_CLIENT_ID,
                "client_secret": TWITCH_CLIENT_SECRET,
                "grant_type": "client_credentials",
            },
            timeout=10,
        )
        r.raise_for_status()
        data = r.json()
        token = data["access_token"]
        expires = time.time() + data.get("expires_in", 3600)
        db.execute(
            "INSERT OR REPLACE INTO user_prefs (user_id, key, value) VALUES (0, 'twitch_token', ?)",
            (json.dumps({"token": token, "expires": expires}),),
        )
        db.commit()
        db.close()
        return token
    except Exception as e:
        logger.error("Twitch token request failed: %s", e)
        db.close()
        return ""


def _twitch_get_stream(username: str) -> dict:
    """Check if a Twitch user is live."""
    import requests as req
    token = _twitch_get_token()
    if not token:
        return {"error": "Twitch API not configured (set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET)"}
    headers = {
        "Client-ID": TWITCH_CLIENT_ID,
        "Authorization": f"Bearer {token}",
    }
    r = req.get(
        "https://api.twitch.tv/helix/streams",
        params={"user_login": username},
        headers=headers,
        timeout=10,
    )
    r.raise_for_status()
    data = r.json().get("data", [])
    if data:
        stream = data[0]
        thumb = stream.get("thumbnail_url", "")
        if thumb:
            thumb = thumb.replace("{width}", "640").replace("{height}", "360")
        return {
            "live": True,
            "title": stream.get("title", "Untitled"),
            "game": stream.get("game_name", "Unknown"),
            "viewers": stream.get("viewer_count", 0),
            "thumbnail": thumb,
            "user_name": stream.get("user_name", username),
        }
    return {"live": False, "user_name": username}


async def _twitch(username: str) -> dict:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: _twitch_get_stream(username))


@app_commands.command(name="twitch", description="Check if a Twitch streamer is live")
@app_commands.describe(username="Twitch username")
async def _twitch_cmd(interaction: discord.Interaction, username: str) -> None:
    if not TWITCH_CLIENT_ID or not TWITCH_CLIENT_SECRET:
        await interaction.response.send_message(
            "Twitch integration not configured! Set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`.",
            ephemeral=True,
        )
        return
    await interaction.response.defer()
    try:
        data = await _twitch(username)
    except Exception as e:
        await interaction.followup.send(f"Couldn't check Twitch: {e}")
        return
    if data.get("error"):
        await interaction.followup.send(data["error"], ephemeral=True)
        return
    if data.get("live"):
        embed = discord.Embed(
            title=f"🔴 {data['user_name']} is LIVE!",
            url=f"https://twitch.tv/{username}",
            color=0x9146FF,
        )
        embed.add_field(name="Title", value=data["title"], inline=False)
        embed.add_field(name="Game", value=data["game"], inline=True)
        embed.add_field(name="Viewers", value=f"{data['viewers']:,}", inline=True)
        if data.get("thumbnail"):
            embed.set_image(url=data["thumbnail"])
    else:
        embed = discord.Embed(
            title=f"⚫ {data.get('user_name', username)} is Offline",
            url=f"https://twitch.tv/{username}",
            color=0x808080,
            description="This channel is not currently streaming.",
        )
    await interaction.followup.send(embed=embed)


def _steam_get_profile(username: str) -> dict:
    """Look up a Steam profile by vanity URL or Steam ID."""
    import requests as req
    if not STEAM_API_KEY:
        return {"error": "Steam API not configured! Set `STEAM_API_KEY`."}

    # Step 1: resolve vanity URL to steamid
    steamid = None
    if username.isdigit() and len(username) == 17:
        steamid = username
    else:
        r = req.get(
            "https://api.steampowered.com/ISteamUser/ResolveVanityURL/v0001/",
            params={"key": STEAM_API_KEY, "vanityurl": username},
            timeout=10,
        )
        r.raise_for_status()
        resp = r.json().get("response", {})
        if resp.get("success") == 1:
            steamid = resp.get("steamid")
        else:
            return {"error": f"Steam user '{username}' not found."}

    if not steamid:
        return {"error": f"Couldn't resolve Steam ID for '{username}'."}

    # Step 2: get player summary
    r = req.get(
        "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/",
        params={"key": STEAM_API_KEY, "steamids": steamid},
        timeout=10,
    )
    r.raise_for_status()
    players = r.json().get("response", {}).get("players", [])
    if not players:
        return {"error": f"No profile found for Steam ID {steamid}."}

    player = players[0]
    persona_states = {0: "Offline", 1: "Online", 2: "Busy", 3: "Away", 4: "Snooze", 5: "Looking to Trade", 6: "Looking to Play"}
    state = persona_states.get(player.get("personastate", 0), "Unknown")

    # If in-game, override status
    game_name = player.get("gameextrainfo", "")
    if game_name:
        state = f"In-Game: {game_name}"

    return {
        "personaname": player.get("personaname", "Unknown"),
        "avatar": player.get("avatarfull", ""),
        "status": state,
        "profileurl": player.get("profileurl", ""),
        "game": game_name,
        "steamid": steamid,
    }


async def _steam(username: str) -> dict:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: _steam_get_profile(username))


@app_commands.command(name="steam", description="Look up a Steam profile")
@app_commands.describe(username="Steam vanity URL name or Steam ID")
async def _steam_cmd(interaction: discord.Interaction, username: str) -> None:
    if not STEAM_API_KEY:
        await interaction.response.send_message(
            "Steam integration not configured! Set `STEAM_API_KEY`.",
            ephemeral=True,
        )
        return
    await interaction.response.defer()
    try:
        data = await _steam(username)
    except Exception as e:
        await interaction.followup.send(f"Couldn't look up Steam profile: {e}")
        return
    if data.get("error"):
        await interaction.followup.send(data["error"])
        return

    status = data["status"]
    if "In-Game" in status:
        color = 0x90BA3C  # Green for in-game
    elif status == "Online":
        color = 0x57CBDE  # Blue for online
    else:
        color = 0x898989  # Gray for offline

    embed = discord.Embed(
        title=data["personaname"],
        url=data.get("profileurl", ""),
        color=color,
    )
    embed.add_field(name="Status", value=status, inline=True)
    embed.add_field(name="Steam ID", value=data.get("steamid", "?"), inline=True)
    if data.get("avatar"):
        embed.set_thumbnail(url=data["avatar"])
    embed.set_footer(text="Steam Profile")
    await interaction.followup.send(embed=embed)


# ── Phase 3 (Mega): XP/Level System + Profile ────────────────────────


def _xp_level_for(xp: int) -> int:
    """Return the level for the given XP amount."""
    level = 1
    for i, threshold in enumerate(XP_THRESHOLDS):
        if xp >= threshold:
            level = i + 1
        else:
            break
    return level


def _xp_progress_bar(xp: int, level: int, width: int = 10) -> str:
    """Build a text XP progress bar like: ▰▰▰▰▱▱▱▱▱▱"""
    max_level = len(XP_THRESHOLDS)
    if level >= max_level:
        return "▰" * width + " MAX"
    current_threshold = XP_THRESHOLDS[level - 1]
    next_threshold = XP_THRESHOLDS[level]
    progress = xp - current_threshold
    needed = next_threshold - current_threshold
    ratio = max(0.0, min(progress / needed, 1.0)) if needed > 0 else 1.0
    filled = int(ratio * width)
    return "▰" * filled + "▱" * (width - filled)


@app_commands.command(name="profile", description="View your profile or another user's profile")
@app_commands.describe(user="User to view (defaults to yourself)")
async def _profile_cmd(interaction: discord.Interaction, user: Optional[discord.Member] = None) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return

    target = user or interaction.user
    if not isinstance(target, discord.Member):
        await interaction.response.send_message("Couldn't find that user!", ephemeral=True)
        return

    try:
        db = _get_db()
        row = db.execute(
            "SELECT xp, level, total_messages FROM xp_data WHERE user_id = ?",
            (target.id,),
        ).fetchone()
        xp = row["xp"] if row else 0
        level = row["level"] if row else 1
        total_messages = row["total_messages"] if row else 0

        # Top song from play_history
        top_song_row = db.execute(
            "SELECT track_title, COUNT(*) as plays FROM play_history "
            "WHERE user_id = ? GROUP BY track_title ORDER BY plays DESC LIMIT 1",
            (target.id,),
        ).fetchone()
        top_song = f"{top_song_row['track_title']} ({top_song_row['plays']}x)" if top_song_row else "None yet"

        # Total listening time
        listen_row = db.execute(
            "SELECT COALESCE(SUM(duration), 0) as total FROM play_history WHERE user_id = ?",
            (target.id,),
        ).fetchone()
        total_listen = int(listen_row["total"]) if listen_row else 0
        listen_hours = total_listen // 3600
        listen_mins = (total_listen % 3600) // 60
        listen_str = f"{listen_hours}h {listen_mins}m" if listen_hours > 0 else f"{listen_mins}m"

        db.close()
    except Exception as e:
        logger.error("Profile command failed: %s", e)
        await interaction.response.send_message("Couldn't load profile!", ephemeral=True)
        return

    max_level = len(XP_THRESHOLDS)
    if level >= max_level:
        xp_display = f"{xp} XP (MAX LEVEL)"
    else:
        xp_display = f"{xp}/{XP_THRESHOLDS[level]} XP"

    bar = _xp_progress_bar(xp, level)

    embed = discord.Embed(title=f"{target.display_name}'s Profile", color=0x7B68EE)
    if target.avatar:
        embed.set_thumbnail(url=target.avatar.url)
    embed.add_field(name="⭐ Level", value=str(level), inline=True)
    embed.add_field(name="✨ XP", value=f"{bar}\n{xp_display}", inline=True)
    embed.add_field(name="💬 Messages", value=str(total_messages), inline=True)
    embed.add_field(name="🎵 Top Song", value=top_song, inline=False)
    embed.add_field(name="🎧 Listening Time", value=listen_str, inline=True)
    if target.joined_at:
        embed.add_field(name="📅 Member Since", value=target.joined_at.strftime("%b %d, %Y"), inline=True)

    await interaction.response.send_message(embed=embed)


@app_commands.command(name="leaderboard", description="Show the top 10 users by XP")
async def _leaderboard_cmd(interaction: discord.Interaction) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return

    try:
        db = _get_db()
        rows = db.execute(
            "SELECT user_id, xp, level FROM xp_data ORDER BY xp DESC LIMIT 10"
        ).fetchall()
        db.close()
    except Exception as e:
        logger.error("Leaderboard command failed: %s", e)
        await interaction.response.send_message("Couldn't load leaderboard!", ephemeral=True)
        return

    if not rows:
        await interaction.response.send_message("No one has earned XP yet! Start chatting!", ephemeral=True)
        return

    lines = []
    medals = ["🥇", "🥈", "🥉"]
    for i, row in enumerate(rows):
        member = interaction.guild.get_member(row["user_id"])
        name = member.display_name if member else f"User #{row['user_id']}"
        rank = medals[i] if i < 3 else f"`{i + 1}.`"
        lines.append(f"{rank} **{name}** — Level {row['level']} ({row['xp']} XP)")

    embed = discord.Embed(
        title="🏆 XP Leaderboard",
        description="\n".join(lines),
        color=0xFFD700,
    )
    await interaction.response.send_message(embed=embed)


# ── Phase 4 (Mega): Mini Games ────────────────────────────────────────


# ── Rock Paper Scissors ──

class RPSView(discord.ui.View):
    def __init__(self, challenger: discord.Member, opponent: discord.Member) -> None:
        super().__init__(timeout=30)
        self.challenger = challenger
        self.opponent = opponent
        self.choices: dict[int, str] = {}

    async def _handle_choice(self, interaction: discord.Interaction, choice: str) -> None:
        uid = interaction.user.id
        if uid not in (self.challenger.id, self.opponent.id):
            await interaction.response.send_message("This game isn't for you!", ephemeral=True)
            return
        self.choices[uid] = choice
        await interaction.response.send_message(f"You chose **{choice}**!", ephemeral=True)

        if len(self.choices) == 2:
            self.stop()
            c1 = self.choices[self.challenger.id]
            c2 = self.choices[self.opponent.id]
            wins = {"Rock": "Scissors", "Scissors": "Paper", "Paper": "Rock"}
            if c1 == c2:
                result = "It's a **tie**! 🤝"
            elif wins[c1] == c2:
                result = f"**{self.challenger.display_name}** wins! 🎉"
            else:
                result = f"**{self.opponent.display_name}** wins! 🎉"

            embed = discord.Embed(title="Rock Paper Scissors — Results!", color=0x00FF88)
            embed.add_field(name=self.challenger.display_name, value=c1, inline=True)
            embed.add_field(name="vs", value="⚔️", inline=True)
            embed.add_field(name=self.opponent.display_name, value=c2, inline=True)
            embed.add_field(name="Result", value=result, inline=False)
            for item in self.children:
                item.disabled = True
            try:
                await interaction.message.edit(embed=interaction.message.embeds[0], view=self)
                await interaction.followup.send(embed=embed)
            except discord.HTTPException:
                pass

    @discord.ui.button(label="Rock 🪨", style=discord.ButtonStyle.primary, row=0)
    async def rock_btn(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_choice(interaction, "Rock")

    @discord.ui.button(label="Paper 📄", style=discord.ButtonStyle.success, row=0)
    async def paper_btn(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_choice(interaction, "Paper")

    @discord.ui.button(label="Scissors ✂️", style=discord.ButtonStyle.danger, row=0)
    async def scissors_btn(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_choice(interaction, "Scissors")

    async def on_timeout(self) -> None:
        for item in self.children:
            item.disabled = True


@app_commands.command(name="rps", description="Play Rock Paper Scissors against someone!")
@app_commands.describe(opponent="Who do you want to challenge?")
async def _rps_cmd(interaction: discord.Interaction, opponent: discord.Member) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    if opponent.bot:
        await interaction.response.send_message("You can't play against a bot!", ephemeral=True)
        return
    if opponent.id == interaction.user.id:
        await interaction.response.send_message("You can't play against yourself!", ephemeral=True)
        return

    member = interaction.user
    if not isinstance(member, discord.Member):
        return

    embed = discord.Embed(
        title="Rock Paper Scissors! ✊📄✂️",
        description=f"**{member.display_name}** vs **{opponent.display_name}**\nBoth players, choose your weapon!",
        color=0xFF6B6B,
    )
    embed.set_footer(text="You have 30 seconds!")

    view = RPSView(member, opponent)
    await interaction.response.send_message(embed=embed, view=view)


# ── Blackjack ──

_CARD_SUITS = ["♠️", "♥️", "♦️", "♣️"]
_CARD_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]


def _new_deck() -> list[tuple[str, str]]:
    deck = [(r, s) for s in _CARD_SUITS for r in _CARD_RANKS]
    random.shuffle(deck)
    return deck


def _hand_value(hand: list[tuple[str, str]]) -> int:
    total = 0
    aces = 0
    for rank, _ in hand:
        if rank in ("J", "Q", "K"):
            total += 10
        elif rank == "A":
            total += 11
            aces += 1
        else:
            total += int(rank)
    while total > 21 and aces > 0:
        total -= 10
        aces -= 1
    return total


def _hand_str(hand: list[tuple[str, str]], hide_first: bool = False) -> str:
    if hide_first:
        return f"🂠 {hand[1][0]}{hand[1][1]}"
    return " ".join(f"{r}{s}" for r, s in hand)


class BlackjackView(discord.ui.View):
    def __init__(self, player: discord.Member) -> None:
        super().__init__(timeout=60)
        self.player = player
        self.deck = _new_deck()
        self.player_hand: list[tuple[str, str]] = [self.deck.pop(), self.deck.pop()]
        self.dealer_hand: list[tuple[str, str]] = [self.deck.pop(), self.deck.pop()]
        self.doubled = False
        self.game_over = False

    def _build_embed(self, reveal_dealer: bool = False) -> discord.Embed:
        pval = _hand_value(self.player_hand)
        embed = discord.Embed(title="🃏 Blackjack", color=0x2F8B4B)
        if reveal_dealer:
            dval = _hand_value(self.dealer_hand)
            embed.add_field(
                name=f"Dealer ({dval})",
                value=_hand_str(self.dealer_hand),
                inline=False,
            )
        else:
            embed.add_field(
                name="Dealer (?)",
                value=_hand_str(self.dealer_hand, hide_first=True),
                inline=False,
            )
        embed.add_field(
            name=f"{self.player.display_name} ({pval})",
            value=_hand_str(self.player_hand),
            inline=False,
        )
        return embed

    async def _finish(self, interaction: discord.Interaction) -> None:
        self.game_over = True
        # Dealer plays
        while _hand_value(self.dealer_hand) <= 16:
            self.dealer_hand.append(self.deck.pop())

        pval = _hand_value(self.player_hand)
        dval = _hand_value(self.dealer_hand)

        if pval > 21:
            result = "You busted! Dealer wins. 💥"
            color = 0xFF0000
        elif dval > 21:
            result = "Dealer busted! You win! 🎉"
            color = 0x00FF00
        elif pval > dval:
            result = "You win! 🎉"
            color = 0x00FF00
        elif dval > pval:
            result = "Dealer wins! 😔"
            color = 0xFF0000
        else:
            result = "It's a push! (tie) 🤝"
            color = 0xFFAA00

        embed = self._build_embed(reveal_dealer=True)
        embed.color = color
        embed.add_field(name="Result", value=result, inline=False)
        for item in self.children:
            item.disabled = True
        try:
            await interaction.response.edit_message(embed=embed, view=self)
        except discord.HTTPException:
            pass
        self.stop()

    @discord.ui.button(label="Hit", style=discord.ButtonStyle.primary, row=0)
    async def hit_btn(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        if interaction.user.id != self.player.id:
            await interaction.response.send_message("Not your game!", ephemeral=True)
            return
        self.player_hand.append(self.deck.pop())
        if _hand_value(self.player_hand) >= 21:
            await self._finish(interaction)
        else:
            embed = self._build_embed()
            await interaction.response.edit_message(embed=embed, view=self)

    @discord.ui.button(label="Stand", style=discord.ButtonStyle.secondary, row=0)
    async def stand_btn(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        if interaction.user.id != self.player.id:
            await interaction.response.send_message("Not your game!", ephemeral=True)
            return
        await self._finish(interaction)

    @discord.ui.button(label="Double Down", style=discord.ButtonStyle.success, row=0)
    async def double_btn(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        if interaction.user.id != self.player.id:
            await interaction.response.send_message("Not your game!", ephemeral=True)
            return
        if len(self.player_hand) != 2:
            await interaction.response.send_message("Can only double on first turn!", ephemeral=True)
            return
        self.doubled = True
        self.player_hand.append(self.deck.pop())
        await self._finish(interaction)

    async def on_timeout(self) -> None:
        if not self.game_over:
            for item in self.children:
                item.disabled = True


@app_commands.command(name="blackjack", description="Play a game of Blackjack!")
async def _blackjack_cmd(interaction: discord.Interaction) -> None:
    member = interaction.user
    if not isinstance(member, discord.Member):
        await interaction.response.send_message("Server only!", ephemeral=True)
        return

    view = BlackjackView(member)
    pval = _hand_value(view.player_hand)
    # Check for natural blackjack
    if pval == 21:
        embed = view._build_embed(reveal_dealer=True)
        dval = _hand_value(view.dealer_hand)
        if dval == 21:
            embed.add_field(name="Result", value="Both blackjack! Push! 🤝", inline=False)
            embed.color = 0xFFAA00
        else:
            embed.add_field(name="Result", value="Blackjack! You win! 🎉", inline=False)
            embed.color = 0x00FF00
        for item in view.children:
            item.disabled = True
        await interaction.response.send_message(embed=embed, view=view)
        return

    embed = view._build_embed()
    await interaction.response.send_message(embed=embed, view=view)


# ── Slots ──

_SLOT_EMOJIS = ["🍒", "🍋", "🍊", "🍇", "🔔", "💎", "7️⃣"]


@app_commands.command(name="slots", description="Try your luck at the slot machine!")
async def _slots_cmd(interaction: discord.Interaction) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return

    await interaction.response.defer()

    # Spin animation: 2 interim displays with random emojis
    for _ in range(2):
        r1 = random.choice(_SLOT_EMOJIS)
        r2 = random.choice(_SLOT_EMOJIS)
        r3 = random.choice(_SLOT_EMOJIS)
        embed = discord.Embed(
            title="🎰 Slot Machine",
            description=f"**[ {r1} | {r2} | {r3} ]**\n\nSpinning...",
            color=0xFFD700,
        )
        await interaction.edit_original_response(embed=embed)
        await asyncio.sleep(0.8)

    # Final result
    r1 = random.choice(_SLOT_EMOJIS)
    r2 = random.choice(_SLOT_EMOJIS)
    r3 = random.choice(_SLOT_EMOJIS)

    if r1 == r2 == r3:
        xp_win = 100
        result = f"🎉 **JACKPOT!** All three match! +{xp_win} XP!"
        color = 0x00FF00
    elif r1 == r2 or r2 == r3 or r1 == r3:
        xp_win = 25
        result = f"Nice! Two match! +{xp_win} XP!"
        color = 0xFFAA00
    else:
        xp_win = 0
        result = "No match this time! Better luck next spin! 😅"
        color = 0xFF0000

    # Award XP
    if xp_win > 0:
        try:
            db = _get_db()
            db.execute(
                "INSERT INTO xp_data (user_id, xp, level, total_messages, last_xp_time) "
                "VALUES (?, ?, 1, 0, 0) "
                "ON CONFLICT(user_id) DO UPDATE SET xp = xp + ?",
                (interaction.user.id, xp_win, xp_win),
            )
            # Recalculate level
            row = db.execute("SELECT xp FROM xp_data WHERE user_id = ?", (interaction.user.id,)).fetchone()
            if row:
                new_level = _xp_level_for(row["xp"])
                db.execute("UPDATE xp_data SET level = ? WHERE user_id = ?", (new_level, interaction.user.id))
            db.commit()
            db.close()
        except Exception:
            pass

    embed = discord.Embed(
        title="🎰 Slot Machine",
        description=f"**[ {r1} | {r2} | {r3} ]**\n\n{result}",
        color=color,
    )
    await interaction.edit_original_response(embed=embed)


# ── Hangman ──

_HANGMAN_WORDS = [
    "adventure", "algorithm", "balloon", "butterfly", "calendar",
    "chocolate", "dinosaur", "elephant", "fantastic", "geometry",
    "hamburger", "igloo", "jellyfish", "keyboard", "labyrinth",
    "mountain", "notebook", "octopus", "paradise", "question",
    "rainbow", "sandwich", "treasure", "umbrella", "vacation",
    "waterfall", "xylophone", "yourself", "zeppelin", "abstract",
    "building", "computer", "dragon", "electric", "friction",
]

_HANGMAN_STAGES = [
    "```\n  +---+\n      |\n      |\n      |\n      |\n=========\n```",
    "```\n  +---+\n  O   |\n      |\n      |\n      |\n=========\n```",
    "```\n  +---+\n  O   |\n  |   |\n      |\n      |\n=========\n```",
    "```\n  +---+\n  O   |\n /|   |\n      |\n      |\n=========\n```",
    "```\n  +---+\n  O   |\n /|\\  |\n      |\n      |\n=========\n```",
    "```\n  +---+\n  O   |\n /|\\  |\n /    |\n      |\n=========\n```",
    "```\n  +---+\n  O   |\n /|\\  |\n / \\  |\n      |\n=========\n```",
]


class HangmanGuessModal(discord.ui.Modal, title="Guess a Letter"):
    letter = discord.ui.TextInput(
        label="Enter a letter (A-Z)",
        placeholder="A",
        max_length=1,
        min_length=1,
    )

    def __init__(self, game_view: "HangmanView") -> None:
        super().__init__()
        self.game_view = game_view

    async def on_submit(self, interaction: discord.Interaction) -> None:
        guess = self.letter.value.upper()
        if not guess.isalpha():
            await interaction.response.send_message("Please enter a letter!", ephemeral=True)
            return

        gv = self.game_view
        if guess in gv.guessed:
            await interaction.response.send_message(f"You already guessed **{guess}**!", ephemeral=True)
            return

        gv.guessed.add(guess)

        if guess in gv.word_upper:
            # Correct guess
            if all(c in gv.guessed for c in gv.word_upper):
                gv.game_over = True
                gv.won = True
        else:
            gv.wrong += 1
            if gv.wrong >= 6:
                gv.game_over = True
                gv.won = False

        embed = gv._build_embed()
        if gv.game_over:
            for item in gv.children:
                item.disabled = True
        try:
            await interaction.response.edit_message(embed=embed, view=gv)
        except discord.HTTPException:
            pass

        if gv.game_over:
            gv.stop()


class HangmanView(discord.ui.View):
    def __init__(self, player: discord.Member) -> None:
        super().__init__(timeout=120)
        self.player = player
        self.word = random.choice(_HANGMAN_WORDS).upper()
        self.word_upper = self.word
        self.guessed: set[str] = set()
        self.wrong = 0
        self.game_over = False
        self.won = False

    def _word_display(self) -> str:
        return " ".join(c if c in self.guessed else "\\_" for c in self.word_upper)

    def _build_embed(self) -> discord.Embed:
        stage = _HANGMAN_STAGES[min(self.wrong, 6)]
        word_display = self._word_display()
        guessed_str = " ".join(sorted(self.guessed)) if self.guessed else "None"

        if self.game_over and self.won:
            embed = discord.Embed(title="Hangman — You Win! 🎉", color=0x00FF00)
            embed.description = f"{stage}\n**{self.word}**\n\nCongratulations, {self.player.display_name}!"
        elif self.game_over:
            embed = discord.Embed(title="Hangman — Game Over! 💀", color=0xFF0000)
            embed.description = f"{stage}\n\nThe word was: **{self.word}**"
        else:
            embed = discord.Embed(title="Hangman", color=0x3498DB)
            embed.description = f"{stage}\n**{word_display}**"
            embed.add_field(name="Guessed", value=guessed_str, inline=True)
            embed.add_field(name="Wrong", value=f"{self.wrong}/6", inline=True)
        return embed

    @discord.ui.button(label="Guess Letter", style=discord.ButtonStyle.primary, row=0)
    async def guess_btn(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        if interaction.user.id != self.player.id:
            await interaction.response.send_message("Not your game!", ephemeral=True)
            return
        await interaction.response.send_modal(HangmanGuessModal(self))


@app_commands.command(name="hangman", description="Play a game of Hangman!")
async def _hangman_cmd(interaction: discord.Interaction) -> None:
    member = interaction.user
    if not isinstance(member, discord.Member):
        await interaction.response.send_message("Server only!", ephemeral=True)
        return

    view = HangmanView(member)
    embed = view._build_embed()
    await interaction.response.send_message(embed=embed, view=view)


# ── Wordle ──

_WORDLE_WORDS = [
    "about", "above", "abuse", "actor", "acute", "admit", "adopt", "adult",
    "agent", "agree", "alarm", "album", "alert", "alien", "align", "alive",
    "angel", "anger", "angle", "apple", "arena", "arise", "aside", "avoid",
    "badge", "basic", "beach", "begin", "below", "bench", "birth", "blade",
    "blank", "blast", "blaze", "blend", "blind", "block", "blood", "bloom",
    "board", "bonus", "brain", "brand", "brave", "bread", "break", "brick",
    "bride", "brief", "bring", "broad", "brown", "brush", "build", "burst",
    "candy", "cargo", "cause", "chain", "chair", "chase", "cheap", "check",
    "chest", "chief", "child", "claim", "class", "clean", "clear", "click",
    "climb", "close", "cloud", "coach", "coast", "coral", "couch", "count",
    "cover", "craft", "crash", "cream", "crime", "cross", "crowd", "crush",
    "dance", "debut", "decay", "depth", "devil", "diary", "dirty", "doubt",
    "draft", "drain", "drama", "dream", "dress", "drift", "drink", "drive",
    "eager", "earth", "eight", "elect", "empty", "enemy", "enjoy", "enter",
    "equal", "error", "event", "every", "exact", "exist", "extra", "faith",
    "false", "fault", "feast", "fence", "fetch", "fever", "fiber", "field",
    "fight", "final", "flame", "flash", "fleet", "flesh", "float", "flood",
    "floor", "flour", "fluid", "focus", "force", "forge", "forth", "found",
    "frame", "frank", "fresh", "front", "frost", "fruit", "ghost", "giant",
    "given", "glass", "globe", "gloom", "glory", "grace", "grade", "grain",
    "grand", "grant", "graph", "grasp", "grass", "grave", "great", "green",
    "greet", "grief", "grind", "gross", "group", "grove", "guard", "guess",
    "guest", "guide", "guild", "guilt", "habit", "happy", "heart", "heavy",
    "hence", "honey", "honor", "horse", "hotel", "house", "human", "humor",
    "ideal", "image", "imply", "index", "inner", "input", "irony", "ivory",
    "jewel", "joint", "judge", "juice", "knife", "knock", "known", "label",
    "labor", "large", "laser", "later", "laugh", "layer", "learn", "lease",
    "legal", "lemon", "level", "light", "limit", "linen", "liter", "logic",
    "loose", "lover", "lower", "lucky", "lunch", "magic", "major", "maker",
    "manor", "march", "match", "mayor", "media", "mercy", "metal", "meter",
    "minor", "minus", "model", "money", "month", "moral", "motor", "mount",
    "mouse", "mouth", "movie", "music", "naked", "nerve", "never", "night",
    "noble", "noise", "north", "noted", "novel", "nurse", "ocean", "offer",
    "often", "orbit", "order", "other", "outer", "owner", "oxide", "paint",
    "panel", "panic", "paper", "party", "paste", "patch", "pause", "peace",
    "penny", "phase", "phone", "photo", "piano", "piece", "pilot", "pitch",
    "place", "plain", "plane", "plant", "plate", "plaza", "plead", "point",
    "polar", "pound", "power", "press", "price", "pride", "prime", "print",
    "prior", "prize", "probe", "proof", "proud", "prove", "psalm", "pulse",
    "punch", "pupil", "queen", "quest", "queue", "quick", "quiet", "quota",
    "radar", "radio", "raise", "rally", "range", "rapid", "ratio", "reach",
    "ready", "realm", "rebel", "refer", "reign", "relax", "reply", "rider",
    "ridge", "rifle", "right", "rigid", "rival", "river", "robin", "robot",
    "rocky", "roman", "rouge", "round", "route", "royal", "rural", "saint",
    "salad", "scale", "scene", "scope", "score", "sense", "serve", "seven",
    "shade", "shake", "shall", "shame", "shape", "share", "sharp", "sheer",
    "shelf", "shell", "shift", "shine", "shirt", "shock", "shore", "short",
    "shout", "sight", "since", "sixth", "sixty", "skill", "slave", "sleep",
    "slide", "slope", "small", "smart", "smell", "smile", "smoke", "snake",
    "solar", "solid", "solve", "spare", "speak", "speed", "spend", "spill",
    "spine", "split", "sport", "spray", "squad", "stack", "staff", "stage",
    "stake", "stand", "stark", "start", "state", "steam", "steel", "steep",
    "steer", "stern", "stick", "stiff", "still", "stock", "stone", "store",
    "storm", "story", "strip", "stuck", "study", "stuff", "style", "sugar",
    "suite", "super", "swamp", "swear", "sweep", "sweet", "swift", "swing",
    "sword", "table", "taste", "teach", "tenth", "theme", "thick", "thing",
    "think", "third", "thorn", "those", "three", "throw", "thumb", "tiger",
    "tight", "tired", "title", "today", "token", "total", "touch", "tough",
    "tower", "toxic", "trace", "track", "trade", "trail", "train", "trait",
    "trash", "treat", "trend", "trial", "tribe", "trick", "troop", "truck",
    "truly", "trump", "trunk", "trust", "truth", "tumor", "twice", "twist",
    "ultra", "uncle", "under", "union", "unite", "unity", "until", "upper",
    "upset", "urban", "usage", "usual", "valid", "value", "vault", "video",
    "vigor", "virus", "visit", "vital", "vivid", "vocal", "voice", "voter",
    "waste", "watch", "water", "weave", "weigh", "weird", "whale", "wheat",
    "wheel", "where", "which", "while", "white", "whole", "whose", "widow",
    "woman", "world", "worry", "worse", "worst", "worth", "would", "wound",
    "write", "wrong", "wrote", "yield", "young", "youth",
]


class WordleGuessModal(discord.ui.Modal, title="Wordle Guess"):
    guess_input = discord.ui.TextInput(
        label="Enter a 5-letter word",
        placeholder="CRANE",
        max_length=5,
        min_length=5,
    )

    def __init__(self, game_view: "WordleView") -> None:
        super().__init__()
        self.game_view = game_view

    async def on_submit(self, interaction: discord.Interaction) -> None:
        guess = self.guess_input.value.lower()
        if not guess.isalpha() or len(guess) != 5:
            await interaction.response.send_message("Enter a valid 5-letter word!", ephemeral=True)
            return

        gv = self.game_view
        answer = gv.word

        # Build colored feedback
        result = []
        for i, c in enumerate(guess):
            if c == answer[i]:
                result.append("🟩")
            elif c in answer:
                result.append("🟨")
            else:
                result.append("⬛")

        gv.guesses.append(guess.upper())
        gv.results.append("".join(result))
        gv.attempts += 1

        if guess == answer:
            gv.game_over = True
            gv.won = True
        elif gv.attempts >= 6:
            gv.game_over = True
            gv.won = False

        embed = gv._build_embed()
        if gv.game_over:
            for item in gv.children:
                item.disabled = True
        try:
            await interaction.response.edit_message(embed=embed, view=gv)
        except discord.HTTPException:
            pass

        if gv.game_over:
            gv.stop()


class WordleView(discord.ui.View):
    def __init__(self, player: discord.Member) -> None:
        super().__init__(timeout=300)
        self.player = player
        self.word = random.choice(_WORDLE_WORDS)
        self.guesses: list[str] = []
        self.results: list[str] = []
        self.attempts = 0
        self.game_over = False
        self.won = False

    def _build_embed(self) -> discord.Embed:
        lines = []
        for i in range(len(self.guesses)):
            lines.append(f"{self.results[i]}  `{self.guesses[i]}`")

        # Pad remaining rows
        for _ in range(6 - len(self.guesses)):
            lines.append("⬛⬛⬛⬛⬛")

        board = "\n".join(lines)

        if self.game_over and self.won:
            embed = discord.Embed(
                title=f"Wordle — You Win! 🎉 ({self.attempts}/6)",
                description=board,
                color=0x00FF00,
            )
        elif self.game_over:
            embed = discord.Embed(
                title="Wordle — Game Over!",
                description=f"{board}\n\nThe word was: **{self.word.upper()}**",
                color=0xFF0000,
            )
        else:
            embed = discord.Embed(
                title=f"Wordle ({self.attempts}/6)",
                description=board,
                color=0x3498DB,
            )
            embed.set_footer(text="Click the button to submit a guess!")
        return embed

    @discord.ui.button(label="Guess", style=discord.ButtonStyle.primary, row=0)
    async def guess_btn(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        if interaction.user.id != self.player.id:
            await interaction.response.send_message("Not your game!", ephemeral=True)
            return
        await interaction.response.send_modal(WordleGuessModal(self))


@app_commands.command(name="wordle", description="Play Wordle — guess the 5-letter word!")
async def _wordle_cmd(interaction: discord.Interaction) -> None:
    member = interaction.user
    if not isinstance(member, discord.Member):
        await interaction.response.send_message("Server only!", ephemeral=True)
        return

    view = WordleView(member)
    embed = view._build_embed()
    await interaction.response.send_message(embed=embed, view=view)


# ── Connect 4 ──

class Connect4View(discord.ui.View):
    ROWS = 6
    COLS = 7

    def __init__(self, player1: discord.Member, player2: discord.Member) -> None:
        super().__init__(timeout=120)
        self.player1 = player1
        self.player2 = player2
        self.board: list[list[int]] = [[0] * self.COLS for _ in range(self.ROWS)]
        self.current_player = 1  # 1 = player1 (red), 2 = player2 (yellow)
        self.game_over = False
        self.winner: Optional[discord.Member] = None

    def _board_str(self) -> str:
        pieces = {0: "⚪", 1: "🔴", 2: "🟡"}
        lines = []
        for row in self.board:
            lines.append("".join(pieces[c] for c in row))
        lines.append("1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣")
        return "\n".join(lines)

    def _drop_piece(self, col: int, player: int) -> bool:
        for row in range(self.ROWS - 1, -1, -1):
            if self.board[row][col] == 0:
                self.board[row][col] = player
                return True
        return False

    def _check_win(self, player: int) -> bool:
        b = self.board
        # Horizontal
        for r in range(self.ROWS):
            for c in range(self.COLS - 3):
                if b[r][c] == b[r][c+1] == b[r][c+2] == b[r][c+3] == player:
                    return True
        # Vertical
        for r in range(self.ROWS - 3):
            for c in range(self.COLS):
                if b[r][c] == b[r+1][c] == b[r+2][c] == b[r+3][c] == player:
                    return True
        # Diagonal (down-right)
        for r in range(self.ROWS - 3):
            for c in range(self.COLS - 3):
                if b[r][c] == b[r+1][c+1] == b[r+2][c+2] == b[r+3][c+3] == player:
                    return True
        # Diagonal (up-right)
        for r in range(3, self.ROWS):
            for c in range(self.COLS - 3):
                if b[r][c] == b[r-1][c+1] == b[r-2][c+2] == b[r-3][c+3] == player:
                    return True
        return False

    def _is_full(self) -> bool:
        return all(self.board[0][c] != 0 for c in range(self.COLS))

    def _build_embed(self) -> discord.Embed:
        board_display = self._board_str()
        if self.game_over and self.winner:
            embed = discord.Embed(
                title=f"Connect 4 — {self.winner.display_name} Wins! 🎉",
                description=board_display,
                color=0x00FF00,
            )
        elif self.game_over:
            embed = discord.Embed(
                title="Connect 4 — Draw! 🤝",
                description=board_display,
                color=0xFFAA00,
            )
        else:
            current = self.player1 if self.current_player == 1 else self.player2
            piece = "🔴" if self.current_player == 1 else "🟡"
            embed = discord.Embed(
                title="Connect 4",
                description=f"{board_display}\n\n{piece} **{current.display_name}**'s turn",
                color=0x3498DB,
            )
        return embed

    async def _handle_drop(self, interaction: discord.Interaction, col: int) -> None:
        current = self.player1 if self.current_player == 1 else self.player2
        if interaction.user.id != current.id:
            await interaction.response.send_message("Not your turn!", ephemeral=True)
            return
        if self.game_over:
            return
        if not self._drop_piece(col, self.current_player):
            await interaction.response.send_message("Column is full!", ephemeral=True)
            return

        if self._check_win(self.current_player):
            self.game_over = True
            self.winner = current
        elif self._is_full():
            self.game_over = True
        else:
            self.current_player = 2 if self.current_player == 1 else 1

        embed = self._build_embed()
        if self.game_over:
            for item in self.children:
                item.disabled = True
        try:
            await interaction.response.edit_message(embed=embed, view=self)
        except discord.HTTPException:
            pass
        if self.game_over:
            self.stop()

    @discord.ui.button(label="1", style=discord.ButtonStyle.secondary, row=0)
    async def col1(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_drop(interaction, 0)

    @discord.ui.button(label="2", style=discord.ButtonStyle.secondary, row=0)
    async def col2(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_drop(interaction, 1)

    @discord.ui.button(label="3", style=discord.ButtonStyle.secondary, row=0)
    async def col3(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_drop(interaction, 2)

    @discord.ui.button(label="4", style=discord.ButtonStyle.secondary, row=0)
    async def col4(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_drop(interaction, 3)

    @discord.ui.button(label="5", style=discord.ButtonStyle.secondary, row=0)
    async def col5(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_drop(interaction, 4)

    @discord.ui.button(label="6", style=discord.ButtonStyle.secondary, row=1)
    async def col6(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_drop(interaction, 5)

    @discord.ui.button(label="7", style=discord.ButtonStyle.secondary, row=1)
    async def col7(self, *args) -> None:
        interaction = next(a for a in args if isinstance(a, discord.Interaction))
        await self._handle_drop(interaction, 6)

    async def on_timeout(self) -> None:
        for item in self.children:
            item.disabled = True


@app_commands.command(name="connect4", description="Play Connect 4 against someone!")
@app_commands.describe(opponent="Who do you want to challenge?")
async def _connect4_cmd(interaction: discord.Interaction, opponent: discord.Member) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    if opponent.bot:
        await interaction.response.send_message("You can't play against a bot!", ephemeral=True)
        return
    if opponent.id == interaction.user.id:
        await interaction.response.send_message("You can't play against yourself!", ephemeral=True)
        return

    member = interaction.user
    if not isinstance(member, discord.Member):
        return

    view = Connect4View(member, opponent)
    embed = view._build_embed()
    await interaction.response.send_message(embed=embed, view=view)


# ── Phase 5 (Mega): Music + Polls + Reminders ────────────────────────


# ── /replay ──

@app_commands.command(name="replay", description="Restart the current track from the beginning")
async def _replay_cmd(interaction: discord.Interaction) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    queue = _get_queue(interaction.guild.id)
    if not queue.current:
        await interaction.response.send_message("Nothing is playing right now!", ephemeral=True)
        return
    vc = queue.voice_client
    if not vc or not vc.is_connected():
        await interaction.response.send_message("Not connected to voice!", ephemeral=True)
        return

    await interaction.response.defer()
    track = queue.current
    queue.seeking = True
    if vc.is_playing() or vc.is_paused():
        vc.stop()
    await asyncio.sleep(0.3)

    channel = queue.control_channel or interaction.channel
    await _start_playing(queue, track, interaction.guild.id, channel, seek_to=0)
    await interaction.followup.send(f"🔁 Replaying **{track['title']}**!")


# ── /skipto ──

@app_commands.command(name="skipto", description="Skip to a specific position in the queue")
@app_commands.describe(position="Queue position to skip to (1-based)")
async def _skipto_cmd(interaction: discord.Interaction, position: int) -> None:
    if not interaction.guild:
        await interaction.response.send_message("Server only!", ephemeral=True)
        return
    queue = _get_queue(interaction.guild.id)
    if position < 1 or position > len(queue.tracks):
        await interaction.response.send_message(
            f"Invalid position! Queue has {len(queue.tracks)} tracks.", ephemeral=True)
        return
    vc = queue.voice_client
    if not vc or not vc.is_connected():
        await interaction.response.send_message("Not connected to voice!", ephemeral=True)
        return

    # Skip to position — discard all tracks before it
    queue.tracks = queue.tracks[position - 1:]
    target = queue.tracks[0] if queue.tracks else None

    if vc.is_playing() or vc.is_paused():
        vc.stop()  # triggers _on_track_end which will play next track

    title = target["title"] if target else "next track"
    await interaction.response.send_message(f"⏭️ Skipping to #{position}: **{title}**")


# ── /poll ──

class PollView(discord.ui.View):
    def __init__(self, options: list[str]) -> None:
        super().__init__(timeout=300)
        self.options = options
        self.votes: dict[int, set[int]] = {i: set() for i in range(len(options))}
        # Track which option each user voted for (to allow changing vote)
        self.user_votes: dict[int, int] = {}  # user_id -> option_index

        for i, opt in enumerate(options):
            btn = PollButton(i, opt[:75])
            self.add_item(btn)

    def _results_str(self) -> str:
        total = sum(len(v) for v in self.votes.values())
        lines = []
        for i, opt in enumerate(self.options):
            count = len(self.votes[i])
            pct = int(count / total * 100) if total > 0 else 0
            bar_len = int(pct / 10)
            bar = "▰" * bar_len + "▱" * (10 - bar_len)
            lines.append(f"**{opt}**: {bar} {pct}% ({count})")
        return "\n".join(lines)


class PollButton(discord.ui.Button):
    def __init__(self, index: int, label: str) -> None:
        colors = [
            discord.ButtonStyle.primary, discord.ButtonStyle.success,
            discord.ButtonStyle.danger, discord.ButtonStyle.secondary,
        ]
        super().__init__(label=label, style=colors[index % len(colors)], row=0 if index < 2 else 1)
        self.index = index

    async def callback(self, interaction: discord.Interaction) -> None:
        view: PollView = self.view  # type: ignore[assignment]
        uid = interaction.user.id

        # Remove previous vote if any
        prev = view.user_votes.get(uid)
        if prev is not None:
            view.votes[prev].discard(uid)

        # Record new vote
        view.votes[self.index].add(uid)
        view.user_votes[uid] = self.index

        await interaction.response.send_message(
            f"You voted for **{view.options[self.index]}**!", ephemeral=True)


@app_commands.command(name="poll", description="Create a poll with 2-4 options")
@app_commands.describe(
    question="The poll question",
    option1="First option",
    option2="Second option",
    option3="Third option (optional)",
    option4="Fourth option (optional)",
)
async def _poll_cmd(
    interaction: discord.Interaction,
    question: str,
    option1: str,
    option2: str,
    option3: Optional[str] = None,
    option4: Optional[str] = None,
) -> None:
    options = [option1, option2]
    if option3:
        options.append(option3)
    if option4:
        options.append(option4)

    embed = discord.Embed(title="📊 Poll", description=f"**{question}**", color=0x7B68EE)
    for i, opt in enumerate(options):
        labels = ["🅰️", "🅱️", "🅲", "🅳"]
        embed.add_field(name=f"{labels[i]} {opt}", value="\u200b", inline=False)
    embed.set_footer(text="Vote below! Results in 5 minutes.")

    view = PollView(options)
    await interaction.response.send_message(embed=embed, view=view)
    msg = await interaction.original_response()

    await asyncio.sleep(300)

    # Final results
    results = view._results_str()
    embed.add_field(name="📊 Final Results", value=results, inline=False)
    embed.color = 0x00FF88
    for item in view.children:
        item.disabled = True
    try:
        await msg.edit(embed=embed, view=view)
    except discord.HTTPException:
        pass


# ── /remind ──

# Alias time.time to avoid name clash with /remind's 'time' parameter
_time_now = time.time


def _parse_time_str(s: str) -> Optional[int]:
    """Parse time strings like '2h', '30m', '1h30m', '1d' -> seconds."""
    s = s.strip().lower()
    total = 0
    pattern = re.compile(r'(\d+)\s*([dhms])')
    matches = pattern.findall(s)
    if not matches:
        # Try bare number as minutes
        try:
            return int(s) * 60
        except ValueError:
            return None
    for amount, unit in matches:
        n = int(amount)
        if unit == 'd':
            total += n * 86400
        elif unit == 'h':
            total += n * 3600
        elif unit == 'm':
            total += n * 60
        elif unit == 's':
            total += n
    return total if total > 0 else None


@app_commands.command(name="remind", description="Set a reminder")
@app_commands.describe(
    reminder_time="When to remind you (e.g. '30m', '2h', '1d', '1h30m')",
    message="What to remind you about",
)
async def _remind_cmd(interaction: discord.Interaction, reminder_time: str, message: str) -> None:
    seconds = _parse_time_str(reminder_time)
    if seconds is None:
        await interaction.response.send_message(
            "Invalid time format! Use: `30m`, `2h`, `1d`, `1h30m`", ephemeral=True)
        return
    if seconds < 30:
        await interaction.response.send_message("Minimum reminder time is 30 seconds!", ephemeral=True)
        return
    if seconds > 604800:  # 7 days
        await interaction.response.send_message("Maximum reminder time is 7 days!", ephemeral=True)
        return

    fire_at = _time_now() + seconds
    reminder_id = str(uuid.uuid4())[:8]

    try:
        db = _get_db()
        db.execute(
            "INSERT INTO reminders (id, user_id, channel_id, guild_id, message, fire_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (reminder_id, interaction.user.id, interaction.channel_id,
             interaction.guild_id, message, fire_at),
        )
        db.commit()
        db.close()
    except Exception as e:
        logger.error("Reminder save failed: %s", e)
        await interaction.response.send_message("Couldn't save reminder!", ephemeral=True)
        return

    # Format display time
    if seconds >= 86400:
        display = f"{seconds // 86400}d {(seconds % 86400) // 3600}h"
    elif seconds >= 3600:
        display = f"{seconds // 3600}h {(seconds % 3600) // 60}m"
    else:
        display = f"{seconds // 60}m"

    await interaction.response.send_message(
        f"⏰ Got it! I'll remind you in **{display}**: {message}")


# ── Reminder checker background task ──

@tasks.loop(seconds=30)
async def _reminder_checker() -> None:
    """Check for due reminders every 30 seconds."""
    try:
        db = _get_db()
        now = time.time()
        rows = db.execute(
            "SELECT id, user_id, channel_id, guild_id, message FROM reminders WHERE fire_at <= ?",
            (now,),
        ).fetchall()

        for row in rows:
            try:
                if _bot:
                    channel = _bot.get_channel(row["channel_id"])
                    if channel:
                        await channel.send(
                            f"⏰ <@{row['user_id']}> Reminder: **{row['message']}**")
                db.execute("DELETE FROM reminders WHERE id = ?", (row["id"],))
            except Exception as e:
                logger.error("Reminder send failed: %s", e)
                # Delete stale reminder anyway to prevent spam
                db.execute("DELETE FROM reminders WHERE id = ?", (row["id"],))

        db.commit()
        db.close()
    except Exception as e:
        logger.error("Reminder checker error: %s", e)


@_reminder_checker.before_loop
async def _before_reminder_checker() -> None:
    if _bot:
        await _bot.wait_until_ready()


# ── Bot Startup ──────────────────────────────────────────────────────


async def _run_social_bot() -> None:
    global _bot

    if not BOT_TOKEN:
        logger.error("DISCORD_SOCIAL_BOT_TOKEN not set — social bot will not start")
        return

    _bot = SocialBot()

    try:
        await _bot.start(BOT_TOKEN)
    except discord.LoginFailure:
        logger.error("Invalid social bot token — check DISCORD_SOCIAL_BOT_TOKEN")
    except Exception as e:
        logger.error("Social bot crashed: %s", e)
    finally:
        if _bot and not _bot.is_closed():
            await _bot.close()


def start_social_bot() -> Optional[threading.Thread]:
    if not BOT_TOKEN:
        logger.warning("DISCORD_SOCIAL_BOT_TOKEN not set — skipping social bot")
        return None

    def _thread_target() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_run_social_bot())
        except Exception as e:
            logger.error("Social bot thread error: %s", e)
        finally:
            loop.close()

    thread = threading.Thread(target=_thread_target, name="social-bot", daemon=True)
    thread.start()
    logger.info("Social bot thread started")
    return thread


# ── Standalone entry point ───────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    )

    if not BOT_TOKEN:
        print("ERROR: Set DISCORD_SOCIAL_BOT_TOKEN environment variable")
        raise SystemExit(1)

    print("Starting BMO Social Bot...")
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(_run_social_bot())
    except KeyboardInterrupt:
        print("\nSocial bot stopped.")
    finally:
        loop.close()
