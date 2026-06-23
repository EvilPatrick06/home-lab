"""YouTube / yt-dlp search + extraction helpers for the social bot.

Extracted from discord_social_bot.py (BMO-SUGGESTIONS 2026-06-22: decompose the
social-bot monolith into sibling modules, continuing bots/social_bot_utils.py).
Pure helpers — no Discord/bot runtime state — so they import cleanly and are
independently testable. yt_dlp is imported lazily inside each function.
"""
import logging
from typing import Optional

from bots.social_bot_utils import _format_duration

logger = logging.getLogger("social_bot")


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
