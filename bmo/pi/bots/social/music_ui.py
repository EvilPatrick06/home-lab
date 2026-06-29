"""Music subsystem UI — extracted verbatim from bots/social/bot.py (behaviour-identical
god-module split). The 4 bot-side callbacks the Views use are injected by bot.py at
end-of-module to avoid an import cycle."""

import asyncio
import collections
import random
import time
from typing import Optional

import discord

# Injected by bots.social.bot at import time (placeholders avoid an import cycle).
_get_queue = None
_build_now_playing_embed = None
_set_deaf = None
_start_playing = None
_format_duration = None
_build_progress_bar = None


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
        try:
            await interaction.response.edit_message(view=build_music_panel(guild_id))
        except discord.HTTPException:
            pass


class PageButton(discord.ui.Button):
    """Pagination button for queue pages."""

    def __init__(self, emoji: str, direction: str, guild_id: int, disabled: bool = False) -> None:
        super().__init__(
            emoji=emoji, style=discord.ButtonStyle.secondary,
            custom_id=f"music_{direction}", disabled=disabled,
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
        try:
            await interaction.response.edit_message(view=build_music_panel(self.guild_id))
        except discord.HTTPException:
            pass


class _MusicBtn(discord.ui.Button):
    def __init__(self, guild_id: int, **kw):
        super().__init__(**kw)
        self.guild_id = guild_id

    async def _refresh(self, interaction: discord.Interaction) -> None:
        try:
            await interaction.response.edit_message(view=build_music_panel(self.guild_id))
        except discord.HTTPException:
            pass


class PrevButton(_MusicBtn):
    def __init__(self, guild_id: int):
        super().__init__(guild_id, emoji="\u23EE\uFE0F", style=discord.ButtonStyle.secondary,
                         custom_id="music_prev")

    async def callback(self, interaction: discord.Interaction) -> None:
        queue = _get_queue(self.guild_id); vc = queue.voice_client
        if not vc or not vc.is_connected():
            await self._refresh(interaction); return
        if queue.current:
            prev = queue.previous_track()
            if prev:
                queue.tracks.insert(0, queue.current); queue.tracks.insert(0, prev)
            else:
                queue.tracks.insert(0, queue.current)
            if vc.is_playing() or vc.is_paused():
                vc.stop()
        elif queue.history:
            prev = queue.history.pop(); queue.tracks.insert(0, prev)
            channel = queue.control_channel or vc.channel
            await _start_playing(queue, queue.next(), self.guild_id, channel)
        await self._refresh(interaction)


class PauseButton(_MusicBtn):
    def __init__(self, guild_id: int, paused: bool):
        super().__init__(guild_id,
                         emoji=("\u25B6\uFE0F" if paused else "\u23F8\uFE0F"),
                         style=(discord.ButtonStyle.success if paused else discord.ButtonStyle.danger),
                         custom_id="music_pause")

    async def callback(self, interaction: discord.Interaction) -> None:
        queue = _get_queue(self.guild_id); vc = queue.voice_client
        if vc:
            if vc.is_paused():
                vc.resume(); queue.start_time = time.time() - queue.pause_offset
                if vc.guild:
                    await _set_deaf(vc.guild, vc, True)
            elif vc.is_playing():
                queue.pause_offset = time.time() - queue.start_time; vc.pause()
                if vc.guild:
                    await _set_deaf(vc.guild, vc, False)
        await self._refresh(interaction)


class SkipButton(_MusicBtn):
    def __init__(self, guild_id: int):
        super().__init__(guild_id, emoji="\u23ED\uFE0F", style=discord.ButtonStyle.secondary,
                         custom_id="music_skip")

    async def callback(self, interaction: discord.Interaction) -> None:
        queue = _get_queue(self.guild_id); vc = queue.voice_client
        if vc and (vc.is_playing() or vc.is_paused()):
            vc.stop()
        await self._refresh(interaction)


class ShuffleButton(_MusicBtn):
    def __init__(self, guild_id: int, on: bool):
        super().__init__(guild_id, emoji="\U0001F500",
                         style=(discord.ButtonStyle.success if on else discord.ButtonStyle.secondary),
                         custom_id="music_shuffle")

    async def callback(self, interaction: discord.Interaction) -> None:
        queue = _get_queue(self.guild_id)
        queue.shuffle = not queue.shuffle
        if queue.shuffle and queue.tracks:
            random.shuffle(queue.tracks)
        queue.page = 0
        await self._refresh(interaction)


class LoopButton(_MusicBtn):
    def __init__(self, guild_id: int, mode: str):
        labels = {"off": "Off", "all": "All", "one": "One"}
        super().__init__(guild_id, emoji="\U0001F501", label=labels.get(mode, "Off"),
                         style=(discord.ButtonStyle.secondary if mode == "off" else discord.ButtonStyle.success),
                         custom_id="music_loop")

    async def callback(self, interaction: discord.Interaction) -> None:
        queue = _get_queue(self.guild_id)
        cycle = {"off": "all", "all": "one", "one": "off"}
        queue.loop_mode = cycle.get(queue.loop_mode, "off")
        await self._refresh(interaction)


def build_music_panel(guild_id: int) -> discord.ui.LayoutView:
    """Components-V2 now-playing + controls panel (replaces the embed + classic View)."""
    queue = _get_queue(guild_id)
    view = discord.ui.LayoutView(timeout=None)
    vc = queue.voice_client
    paused = bool(vc and vc.is_paused())

    if not queue.current:
        view.add_item(discord.ui.Container(
            discord.ui.TextDisplay("## \U0001F3B5 BMO Music\n*Nothing playing \u2014 use `/play` to add some tunes!*"),
            accent_colour=discord.Colour(0x7B68EE)))
    else:
        track = queue.current
        title = track.get("title", "Unknown")
        url = track.get("webpage_url", "")
        duration = track.get("duration", 0) or 0
        thumb = track.get("thumbnail", "")
        requester = track.get("requester", "")
        status = "Paused \u23F8\uFE0F" if paused else "Now Playing \U0001F3B5"
        title_md = f"[{title}]({url})" if url else title
        np = f"## \U0001F3B5 BMO Music\n**{status}**\n**{title_md}**"
        if duration > 0 and _build_progress_bar and _format_duration:
            if paused:
                elapsed = queue.pause_offset
            elif queue.start_time > 0:
                elapsed = time.time() - queue.start_time
            else:
                elapsed = 0
            elapsed = max(0, min(elapsed, duration))
            np += f"\n\u23F1\uFE0F {_format_duration(elapsed)} {_build_progress_bar(elapsed, duration)} {_format_duration(duration)}"
        if requester:
            np += f"\n*Requested by {requester}*"
        children = []
        if thumb:
            children.append(discord.ui.Section(discord.ui.TextDisplay(np),
                            accessory=discord.ui.Thumbnail(thumb)))
        else:
            children.append(discord.ui.TextDisplay(np))
        if queue.tracks:
            per_page = 5
            total_pages = max(1, (len(queue.tracks) + per_page - 1) // per_page)
            page = min(queue.page, total_pages - 1); queue.page = page
            start = page * per_page; end = start + per_page
            lines = []
            for i, t in enumerate(queue.tracks[start:end], start + 1):
                dur = _format_duration(t.get("duration", 0)) if _format_duration else ""
                lines.append(f"\U0001F3B6 {i}. {t['title']} [{dur}]")
            if len(queue.tracks) > end:
                lines.append(f"*\u2026and {len(queue.tracks) - end} more*")
            header = f"**Up Next ({len(queue.tracks)})**"
            if total_pages > 1:
                header += f" \u2014 Page {page + 1}/{total_pages}"
            children.append(discord.ui.TextDisplay(header + "\n" + "\n".join(lines)))
        view.add_item(discord.ui.Container(*children,
                      accent_colour=discord.Colour(0xFFAA00 if paused else 0x7B68EE)))

    view.add_item(discord.ui.ActionRow(
        PrevButton(guild_id), PauseButton(guild_id, paused), SkipButton(guild_id),
        ShuffleButton(guild_id, queue.shuffle), LoopButton(guild_id, queue.loop_mode)))
    view.add_item(discord.ui.ActionRow(VolumeSelect(queue.volume)))
    has_pages = len(queue.tracks) > 5
    total_pages = max(1, (len(queue.tracks) + 4) // 5)
    view.add_item(discord.ui.ActionRow(
        PageButton("\u25C0\uFE0F", "page_prev", guild_id, disabled=not has_pages or queue.page <= 0),
        PageButton("\u25B6\uFE0F", "page_next", guild_id, disabled=not has_pages or queue.page >= total_pages - 1)))
    return view
