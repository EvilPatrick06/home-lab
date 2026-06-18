"""PHASE-36 36B — the Discord-facing half of play-by-post.

PbpManager turns the persisted turn queue (services.pbp_store) into turn announcements
that actually ping (mention in message *content*, never an embed — embeds don't notify),
a restart-safe reminder loop (every tick recomputes overdue-ness from disk, so nothing
lives only in memory), and an opt-in auto-skip. The `/pbp` slash group lets players
self-serve: claim a slot, check status, end their turn, or (DM) skip.
"""

import asyncio
import logging
import os
import uuid
from datetime import datetime, timedelta, timezone

import discord
from discord import app_commands

from services.bmo_logging import _s
from services.pbp_store import PbpError, get_pbp_store

logger = logging.getLogger(__name__)

PBP_CHANNEL_NAME = os.environ.get("DISCORD_PBP_CHANNEL", "play-by-post")
PBP_CHANNEL_ID = os.environ.get("DISCORD_PBP_CHANNEL_ID", "")  # numeric id wins over name
PBP_REMINDER_TICK_SECONDS = int(os.environ.get("PBP_REMINDER_TICK_SECONDS", "600"))


def _truncate(text: str, limit: int = 280) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    cut = text[:limit]
    # Prefer a sentence boundary, then a word boundary.
    for sep in (". ", "! ", "? "):
        idx = cut.rfind(sep)
        if idx >= limit // 2:
            return cut[: idx + 1].strip()
    sp = cut.rfind(" ")
    return (cut[:sp] if sp >= limit // 2 else cut).strip() + "…"


class PbpManager:
    def __init__(self, bot, store=None):
        self.bot = bot
        self.store = store or get_pbp_store()

    # ── channel + mention helpers ────────────────────────────────
    def resolve_channel(self, channel_id):
        def _text(cid):
            try:
                ch = self.bot.get_channel(int(cid))
            except (TypeError, ValueError):
                return None
            return ch if isinstance(ch, discord.TextChannel) else None

        if channel_id:
            ch = _text(channel_id)
            if ch:
                return ch
        if PBP_CHANNEL_ID:
            ch = _text(PBP_CHANNEL_ID)
            if ch:
                return ch
        # Lazy import avoids a circular import (discord_dm_bot imports this module at runtime).
        from bots.discord_dm_bot import _candidate_guilds

        for guild in _candidate_guilds(self.bot):
            if not guild:
                continue
            channels = list(getattr(guild, "text_channels", []) or [])
            for ch in channels:
                if getattr(ch, "name", None) == PBP_CHANNEL_NAME:
                    return ch
            for ch in channels:
                if getattr(ch, "name", "").casefold() == PBP_CHANNEL_NAME.casefold():
                    return ch
        return None

    @staticmethod
    def _mention(participant: dict) -> str:
        uid = participant.get("discord_user_id")
        if uid:
            return f"<@{uid}>"
        return f"**{participant.get('name', '?')}**"  # unclaimed → no ping possible

    def _turn_embed(self, session: dict, *, excerpt: str | None = None) -> discord.Embed:
        cur = self.store.current_participant(session) or {}
        n = len(session["participants"])
        embed = discord.Embed(title=session.get("scene", "Scene"), color=discord.Color.blurple())
        embed.add_field(name="Round", value=str(session.get("round", 1)), inline=True)
        embed.add_field(name="Turn", value=f"{session['turn_index'] + 1}/{n}", inline=True)
        embed.add_field(name="Posting cadence", value=f"every {session.get('reminder_hours', 24)}h", inline=True)
        embed.add_field(
            name="Up now",
            value=cur.get("character") or cur.get("name", "?"),
            inline=False,
        )
        if excerpt:
            embed.add_field(name="Previously", value=_truncate(excerpt), inline=False)
        embed.set_footer(
            text="Post your action in the VTT, or /pbp done here when finished. /pbp claim to link your character."
        )
        return embed

    # ── announcements ────────────────────────────────────────────
    async def announce_turn(self, session: dict, *, header: str | None = None, excerpt: str | None = None) -> bool:
        channel = self.resolve_channel(session.get("channel_id"))
        if channel is None:
            logger.warning("pbp: announce_turn — channel %s gone", session.get("channel_id"))
            return False
        cur = self.store.current_participant(session) or {}
        line = f"{self._mention(cur)} — it's your turn!"
        content = f"{header}\n{line}" if header else line
        await channel.send(content=content, embed=self._turn_embed(session, excerpt=excerpt))
        return True

    # ── lifecycle ops (wrap the store + announce) ─────────────────
    async def start(self, campaign_id, scene, participants, channel_id, reminder_hours, auto_skip) -> dict:
        channel = self.resolve_channel(channel_id)
        if channel is None:
            return {"ok": False, "error": "channel_not_found", "channel": PBP_CHANNEL_NAME}
        try:
            session = self.store.start_session(
                campaign_id, scene, participants, channel_id=str(channel.id),
                reminder_hours=reminder_hours, auto_skip=auto_skip,
            )
        except PbpError as e:
            return {"ok": False, "error": e.code}
        order = "\n".join(
            f"{'▶ ' if i == 0 else '   '}{self._mention(p)}" for i, p in enumerate(session["participants"])
        )
        embed = self._turn_embed(session)
        embed.add_field(name="Turn order", value=order, inline=False)
        first = self.store.current_participant(session) or {}
        await channel.send(content=f"📜 Play-by-post started — {self._mention(first)} is up first!", embed=embed)
        return {"ok": True, "session": session}

    async def advance(self, campaign_id, event_id, expected_turn_index=None, reason="advance", excerpt=None) -> dict:
        try:
            session, result = self.store.advance(
                campaign_id, event_id, expected_turn_index=expected_turn_index, reason=reason
            )
        except PbpError as e:
            return {"ok": False, "error": e.code}
        if result == "advanced":
            header = "Turn skipped — next up:" if reason in ("skip", "timeout_skip") else "Turn over — next up:"
            await self.announce_turn(session, header=header, excerpt=excerpt)
            return {"ok": True, "result": "advanced", "session": session}
        if result == "duplicate":
            return {"ok": True, "result": "duplicate", "session": session}
        return {"ok": False, "result": "stale_turn", "session": session}

    async def set_scene(self, campaign_id, scene, participants=None) -> dict:
        try:
            session = self.store.set_scene(campaign_id, scene, participants=participants)
        except PbpError as e:
            return {"ok": False, "error": e.code}
        await self.announce_turn(session, header="New scene:")
        return {"ok": True, "session": session}

    async def stop(self, campaign_id) -> dict:
        try:
            session = self.store.stop_session(campaign_id)
        except PbpError as e:
            return {"ok": False, "error": e.code}
        channel = self.resolve_channel(session.get("channel_id"))
        if channel is not None:
            await channel.send(content="🏁 Play-by-post session ended.")
        return {"ok": True, "session": session}

    def status(self, campaign_id) -> dict:
        session = self.store.get(campaign_id)
        overdue = False
        if session and session.get("active"):
            overdue = self._age(session) >= timedelta(hours=session["reminder_hours"])
        return {"ok": True, "session": session, "overdue": overdue}

    # ── reminder loop (restart-safe; reads the persisted store each tick) ──
    @staticmethod
    def _age(session: dict) -> timedelta:
        try:
            started = datetime.fromisoformat(session["turn_started_at"])
        except (KeyError, ValueError):
            return timedelta(0)
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) - started

    async def reminder_tick(self) -> None:
        for campaign_id, session in self.store.all_active().items():
            try:
                age = self._age(session)
                reminder = timedelta(hours=session["reminder_hours"])
                if age >= reminder and session.get("reminded_at") is None:
                    # Mark BEFORE sending so a send (or save) failure can never re-fire the reminder
                    # on the next tick — at most one reminder attempt per turn (a lost ping beats a
                    # duplicate ping). mark_reminded persists reminded_at atomically.
                    self.store.mark_reminded(campaign_id)
                    channel = self.resolve_channel(session.get("channel_id"))
                    if channel is not None:
                        cur = self.store.current_participant(session) or {}
                        hours = round(age.total_seconds() / 3600, 1)
                        await channel.send(
                            content=f"{self._mention(cur)} — friendly reminder: it's still your turn in "
                            f"*{session.get('scene')}* ({hours}h elapsed)."
                        )
                if session.get("auto_skip") and age >= 2 * reminder:
                    cur = self.store.current_participant(session) or {}
                    hours2 = round(2 * session["reminder_hours"], 1)
                    await self.advance(
                        campaign_id,
                        event_id=str(uuid.uuid4()),
                        reason="timeout_skip",
                        # header set inside advance for skips
                    )
                    logger.info("pbp: auto-skipped %s after %sh", _s(cur.get("name")), hours2)
            except Exception:  # noqa: BLE001 — one bad session must not kill the loop
                logger.exception("pbp: reminder_tick failed for %s", campaign_id)

    async def reminder_loop(self) -> None:
        while True:
            try:
                await self.reminder_tick()
            except Exception:  # noqa: BLE001
                logger.exception("pbp: reminder_loop tick crashed")
            await asyncio.sleep(PBP_REMINDER_TICK_SECONDS)


# ── /pbp slash command group ─────────────────────────────────────
pbp_group = app_commands.Group(name="pbp", description="Play-by-post turn queue")


def _session_for_channel(store, channel_id):
    """The unique active session bound to this Discord channel (commands are channel-scoped)."""
    matches = [(cid, s) for cid, s in store.all_active().items() if s.get("channel_id") == str(channel_id)]
    return matches[0] if matches else (None, None)


@pbp_group.command(name="claim", description="Link your Discord account to a character so you get pinged")
@app_commands.describe(character="Your character or participant name in the queue")
async def pbp_claim(interaction: discord.Interaction, character: str) -> None:
    bot = interaction.client
    store = bot.pbp.store
    campaign_id, session = _session_for_channel(store, interaction.channel_id)
    if not session:
        await interaction.response.send_message("No active play-by-post session in this channel.", ephemeral=True)
        return
    try:
        store.claim(campaign_id, character, str(interaction.user.id), interaction.user.display_name)
        await interaction.response.send_message(
            f"Linked — you'll be pinged when it's **{character}**'s turn.", ephemeral=True
        )
    except PbpError as e:
        if e.code == "already_claimed":
            await interaction.response.send_message("That participant is already claimed by someone else.", ephemeral=True)
        else:
            unclaimed = [p["name"] for p in session["participants"] if not p.get("discord_user_id")]
            await interaction.response.send_message(
                f"No participant matched. Unclaimed: {', '.join(unclaimed) or 'none'}.", ephemeral=True
            )


@pbp_group.command(name="status", description="Show the current play-by-post queue")
async def pbp_status(interaction: discord.Interaction) -> None:
    bot = interaction.client
    store = bot.pbp.store
    campaign_id, session = _session_for_channel(store, interaction.channel_id)
    if not session:
        await interaction.response.send_message("No active play-by-post session in this channel.", ephemeral=True)
        return
    lines = []
    for i, p in enumerate(session["participants"]):
        mark = "▶" if i == session["turn_index"] else "　"
        claim = "✅" if p.get("discord_user_id") else "⬜"
        lines.append(f"{mark} {claim} {p.get('character') or p['name']}")
    embed = discord.Embed(title=f"PBP — {session['scene']}", description="\n".join(lines), color=discord.Color.blurple())
    embed.add_field(name="Round", value=str(session["round"]), inline=True)
    age = PbpManager._age(session)
    embed.add_field(name="On this turn", value=f"{round(age.total_seconds() / 3600, 1)}h", inline=True)
    embed.add_field(name="Cadence", value=f"{session['reminder_hours']}h", inline=True)
    embed.add_field(name="Auto-skip", value="on" if session.get("auto_skip") else "off", inline=True)
    await interaction.response.send_message(embed=embed)


@pbp_group.command(name="done", description="End your turn and ping the next player")
@app_commands.describe(note="Optional one-line summary of what you did")
async def pbp_done(interaction: discord.Interaction, note: str | None = None) -> None:
    bot = interaction.client
    store = bot.pbp.store
    campaign_id, session = _session_for_channel(store, interaction.channel_id)
    if not session:
        await interaction.response.send_message("No active play-by-post session in this channel.", ephemeral=True)
        return
    cur = store.current_participant(session) or {}
    if cur.get("discord_user_id") != str(interaction.user.id):
        await interaction.response.send_message(
            f"It's **{cur.get('name', '?')}**'s turn, not yours.", ephemeral=True
        )
        return
    await interaction.response.send_message("Turn ended.", ephemeral=True)
    await bot.pbp.advance(
        campaign_id, event_id=str(uuid.uuid4()), expected_turn_index=session["turn_index"], excerpt=note
    )


@pbp_group.command(name="skip", description="(DM) Skip the current player's turn")
async def pbp_skip(interaction: discord.Interaction) -> None:
    if not interaction.user.guild_permissions.manage_guild:
        await interaction.response.send_message("Only a server manager can skip a turn.", ephemeral=True)
        return
    bot = interaction.client
    store = bot.pbp.store
    campaign_id, session = _session_for_channel(store, interaction.channel_id)
    if not session:
        await interaction.response.send_message("No active play-by-post session in this channel.", ephemeral=True)
        return
    await interaction.response.send_message("Skipping…", ephemeral=True)
    await bot.pbp.advance(
        campaign_id, event_id=str(uuid.uuid4()), expected_turn_index=session["turn_index"], reason="skip"
    )
