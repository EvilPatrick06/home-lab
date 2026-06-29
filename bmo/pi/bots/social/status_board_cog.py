"""status_board_cog — Discord driver for the BMO status board (design scaffold).

The ONLY component that talks to Discord for the board. Loaded by the bmo-social
bot (bots/social/bot.py, discord.py 2.7.1) at cutover. Owns ONE pinned embed in
#status that it EDITS IN PLACE every cycle, rewrites the channel topic, keeps a
per-incident thread (auto-archived on resolve), reflects overall health in the
bot's presence, and renders the action buttons.

NOT YET WIRED: bot.py does not `add_cog(StatusBoardCog(...))` and no #status
channel exists yet — both happen at the gated cutover. Pure rendering/state lives
in services.status_board (import-safe, no Discord I/O); this file is the I/O half.

Truth sources merged each cycle:
  - services.monitoring health snapshot (data/monitor_state.json)  [auto-derived]
  - CI / deploy / chat-agent probe adapters                        [extra=...]
  - data/board_inbox.json produced by `notify-board` (email/calendar/deadlines)

Self-healing: the loop re-derives everything every RECONCILE_SECONDS, so a missed
"resolved" signal still clears on the next pass. Producers re-sync their own
namespaces, so finished-but-not-checked-off items drop automatically.
"""
from __future__ import annotations

import os

import discord
from discord.ext import commands, tasks

from services import status_board as sb

RECONCILE_SECONDS = int(os.environ.get("BOARD_RECONCILE_S", "150"))
STATUS_CHANNEL_ID = int(os.environ.get("DISCORD_STATUS_CHANNEL_ID", "0"))


# ── Buttons / select (Refresh · Acknowledge/Mute · per-item Done) ────

class BoardView(discord.ui.View):
    """Persistent view attached to the board message (timeout=None)."""

    def __init__(self, cog: "StatusBoardCog", dismissable: list[tuple[str, str]]):
        super().__init__(timeout=None)
        self.cog = cog
        # No external dashboard link — the board IS the dashboard, in Discord.
        # Per-item "Done" select (check off — dismiss now; also auto-drops on next scan)
        if dismissable:
            self.add_item(DoneSelect(cog, dismissable))

    @discord.ui.button(label="Refresh now", style=discord.ButtonStyle.secondary,
                       custom_id="board:refresh", row=0)
    async def refresh(self, interaction: discord.Interaction, _btn: discord.ui.Button):
        await interaction.response.defer()
        await self.cog.reconcile_and_render()

    @discord.ui.button(label="Acknowledge / Mute 1h", style=discord.ButtonStyle.primary,
                       custom_id="board:ack", row=0)
    async def ack(self, interaction: discord.Interaction, _btn: discord.ui.Button):
        # TODO(cutover): mute the worst-severity incident key for 1h in state.
        await interaction.response.send_message("Muted for 1h.", ephemeral=True)


class DoneSelect(discord.ui.Select):
    """Check off a needs-attention item (email/deadline) → remove immediately."""

    def __init__(self, cog: "StatusBoardCog", items: list[tuple[str, str]]):
        self.cog = cog
        opts = [discord.SelectOption(label=title[:100], value=item_id)
                for item_id, title in items[:25]]
        super().__init__(placeholder="✓ Check off a completed item…",
                         min_values=1, max_values=1, options=opts,
                         custom_id="board:done")

    async def callback(self, interaction: discord.Interaction):
        inbox = sb.load_inbox()
        sb.mark_done(inbox, self.values[0])
        sb.save_inbox(inbox)
        await interaction.response.defer()
        await self.cog.reconcile_and_render()


# ── The cog ──────────────────────────────────────────────────────────────────

class StatusBoardCog(commands.Cog):
    def __init__(self, bot: commands.Bot, extra_truth=None):
        self.bot = bot
        # extra_truth(): callable -> list of CI/deploy/chat-probe rows for derive_incidents
        self.extra_truth = extra_truth or (lambda: [])
        self.state = sb.BoardState.load()

    async def cog_load(self):
        self.bot.add_view(BoardView(self, []))   # persistent buttons across restarts
        self.loop.start()

    def cog_unload(self):
        self.loop.cancel()

    @tasks.loop(seconds=RECONCILE_SECONDS)
    async def loop(self):
        try:
            await self.reconcile_and_render()
        except Exception:
            import logging
            logging.getLogger("status_board").exception("board reconcile failed (will retry next cycle)")

    @loop.before_loop
    async def _before(self):
        await self.bot.wait_until_ready()

    # ── core cycle ───────────────────────────────────────────────────────────
    async def reconcile_and_render(self):
        try:
            monitor = sb._read_json(sb.MONITOR_STATE) or {}     # TODO: shared labels
        except Exception:
            monitor = {}
        health = sb.derive_incidents(monitor, extra=self.extra_truth())
        self.state = sb.reconcile_incidents(self.state, health)
        inbox = sb.load_inbox()
        rows = sb.all_rows(self.state, health, inbox)

        channel = self.bot.get_channel(STATUS_CHANNEL_ID)
        if channel is None:
            return
        embed = discord.Embed.from_dict(sb.render_embed(rows))
        dismissable = [(it.id, it.title) for src in inbox.values() for it in src.values()
                       if it.category == "attention"]
        view = BoardView(self, dismissable)

        msg = await self._get_or_create_board(channel)
        await msg.edit(embed=embed, view=view)

        # topic + presence
        topic = sb.render_topic(rows)
        if channel.topic != topic:
            await channel.edit(topic=topic)
        await self.bot.change_presence(activity=discord.Activity(
            type=discord.ActivityType.watching, name=sb.render_presence(rows)))

        await self._sync_incident_threads(msg)
        self.state.save()

    async def _get_or_create_board(self, channel):
        if self.state.board_message_id:
            try:
                return await channel.fetch_message(self.state.board_message_id)
            except discord.NotFound:
                pass
        msg = await channel.send(embed=discord.Embed(title="BMO Status — starting…"))
        await msg.pin()
        self.state.board_message_id = msg.id
        self.state.channel_id = channel.id
        self.state.save()
        return msg

    async def _sync_incident_threads(self, board_msg):
        """Open a thread per active incident for history; archive on resolve."""
        for key, inc in self.state.incidents.items():
            if inc.thread_id:
                continue
            try:
                th = await board_msg.create_thread(name=f"{key} — {inc.severity}",
                                                   auto_archive_duration=1440)
                inc.thread_id = th.id
            except Exception:
                pass
        # archiving of resolved-incident threads happens when reconcile_incidents
        # drops the key — TODO(cutover): archive th before deletion from state.


async def setup(bot: commands.Bot):
    await bot.add_cog(StatusBoardCog(bot))
