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
