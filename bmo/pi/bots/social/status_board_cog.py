"""status_board_cog — Components-V2 Discord driver for the BMO status board.

The ONLY component that talks to Discord for the board. Loaded by the bmo-social
bot (discord.py 2.7.1). Owns ONE message in #status — a Components-V2 LayoutView
that the reconciler rebuilds + edits in place every cycle.

V2 layout: a colour-accented Container per section (🚨 Incidents · 📌 Needs you ·
🤖 Agents · 📅 Today · 💡 Info), each active incident / needs-you item rendered as
a Section with an INLINE accessory button (🔕 Mute 1h on incidents, ✓ Done on
items). A global action row carries 🔄 Refresh · ✅ Ack all · 👁 Hide/Show Info.
A NEW critical incident pings the owner once (transient, auto-deleting message).

Self-healing is unchanged: truth is re-derived from the live checks + the
producer-synced inbox every cycle, so the board converges on its own.
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import time

import discord
from discord.ext import commands, tasks

from services import status_board as sb

RECONCILE_SECONDS = int(os.environ.get("BOARD_RECONCILE_S", "150"))
STATUS_CHANNEL_ID = int(os.environ.get("DISCORD_STATUS_CHANNEL_ID", "0"))
OWNER_ID = os.environ.get("DISCORD_OWNER_ID", "")
MUTE_SECONDS = 3600
MAX_INTERACTIVE = 4   # per actionable section (V2 component budget)
MAX_TEXT = 8          # lines in a grouped text section

LABELS = {
    "google_calendar": "📅 Google Calendar", "svc_bmo": "🏠 BMO service",
    "svc_docker": "🐳 Docker engine", "svc_bmo_social_bot": "🎵 Social bot",
    "svc_bmo_dm_bot": "🐉 DM bot", "svc_bmo_kiosk": "🖥️ Kiosk",
    "peerjs": "🌐 PeerJS", "ollama_local": "🧠 Ollama", "internet": "🌐 Internet",
    "cloudflared": "🌐 Cloudflare Tunnel", "fish_audio_api": "🔊 Fish Audio",
    "pi_cpu_temp": "🌡️ CPU temp", "pi_load": "📊 System load", "voice_canary": "🎤 Voice path",
    "net_eth0": "🔌 Ethernet", "mdns": "📡 mDNS", "rclone": "☁️ Rclone",
}

SECTIONS = [
    ("incident",  "🚨 Incidents",   "incident"),
    ("attention", "📌 Needs you",   "item"),
    ("agent",     "🤖 Agents",      "text"),
    ("today",     "📅 Today",       "text"),
    ("info",      "💡 Info",        "text"),
]


def _colour(sev: str) -> discord.Colour:
    return discord.Colour(sb.SEV_COLOR.get(sev, 0x808080))


def _line(r: dict) -> str:
    line = f"{sb.SEV_DOT[r['severity']]} **{r['title'].strip()}**"
    if r.get("url"):
        line = f"{sb.SEV_DOT[r['severity']]} **[{r['title'].strip()}]({r['url']})**"
    if r.get("due"):
        line += f" · due <t:{int(r['due'])}:R>"
    elif r.get("since"):
        line += f" · <t:{int(r['since'])}:R>"
    if r.get("detail"):
        line += f"\n　{r['detail'].strip()[:170]}"
    return line


# ── Persistent (DynamicItem) buttons — survive bot restarts ──────────────────

def _cog(interaction) -> "StatusBoardCog | None":
    return interaction.client.get_cog("StatusBoardCog")


class MuteButton(discord.ui.DynamicItem[discord.ui.Button], template=r"board:mute:(?P<key>.+)"):
    def __init__(self, key: str):
        self.key = key
        super().__init__(discord.ui.Button(label="Mute 1h", emoji="🔕",
                         style=discord.ButtonStyle.secondary, custom_id=f"board:mute:{key}"))

    @classmethod
    async def from_custom_id(cls, interaction, item, match):
        return cls(match["key"])

    async def callback(self, interaction: discord.Interaction):
        cog = _cog(interaction)
        if cog:
            cog.state.muted[self.key] = time.time() + MUTE_SECONDS
            cog.state.save()
            await interaction.response.defer()
            await cog.reconcile_and_render()
        else:
            await interaction.response.defer()


class DoneButton(discord.ui.DynamicItem[discord.ui.Button], template=r"board:done:(?P<iid>.+)"):
    def __init__(self, iid: str):
        self.iid = iid
        super().__init__(discord.ui.Button(label="Done", emoji="✅",
                         style=discord.ButtonStyle.success, custom_id=f"board:done:{iid}"))

    @classmethod
    async def from_custom_id(cls, interaction, item, match):
        return cls(match["iid"])

    async def callback(self, interaction: discord.Interaction):
        cog = _cog(interaction)
        inbox = sb.load_inbox()
        sb.mark_done(inbox, self.iid)
        sb.save_inbox(inbox)
        await interaction.response.defer()
        if cog:
            await cog.reconcile_and_render()


class RefreshButton(discord.ui.DynamicItem[discord.ui.Button], template=r"board:refresh"):
    def __init__(self):
        super().__init__(discord.ui.Button(label="Refresh", emoji="🔄",
                         style=discord.ButtonStyle.primary, custom_id="board:refresh"))

    @classmethod
    async def from_custom_id(cls, interaction, item, match):
        return cls()

    async def callback(self, interaction: discord.Interaction):
        cog = _cog(interaction)
        await interaction.response.defer()
        if cog:
            await cog.reconcile_and_render()


class AckAllButton(discord.ui.DynamicItem[discord.ui.Button], template=r"board:ackall"):
    def __init__(self):
        super().__init__(discord.ui.Button(label="Ack all 1h", emoji="✅",
                         style=discord.ButtonStyle.secondary, custom_id="board:ackall"))

    @classmethod
    async def from_custom_id(cls, interaction, item, match):
        return cls()

    async def callback(self, interaction: discord.Interaction):
        cog = _cog(interaction)
        if cog:
            until = time.time() + MUTE_SECONDS
            for k in list(cog.state.incidents):
                cog.state.muted[k] = until
            cog.state.save()
            await interaction.response.defer()
            await cog.reconcile_and_render()
        else:
            await interaction.response.defer()


class ToggleInfoButton(discord.ui.DynamicItem[discord.ui.Button], template=r"board:toggle"):
    def __init__(self):
        super().__init__(discord.ui.Button(label="Info", emoji="👁️",
                         style=discord.ButtonStyle.secondary, custom_id="board:toggle"))

    @classmethod
    async def from_custom_id(cls, interaction, item, match):
        return cls()

    async def callback(self, interaction: discord.Interaction):
        cog = _cog(interaction)
        if cog:
            cog.state.collapse_info = not cog.state.collapse_info
            cog.state.save()
            await interaction.response.defer()
            await cog.reconcile_and_render()
        else:
            await interaction.response.defer()


# ── Layout builder ───────────────────────────────────────────────────────────

def build_layout(rows: list[dict], state: sb.BoardState) -> discord.ui.LayoutView:
    view = discord.ui.LayoutView(timeout=None)
    worst = sb.worst_severity(rows)

    inc = [r for r in rows if r["category"] == "incident"]
    att = [r for r in rows if r["category"] == "attention"]
    agt = [r for r in rows if r["category"] == "agent"]
    summary_bits = []
    if inc:
        summary_bits.append(f"🔴 {len(inc)} incident" + ("s" if len(inc) != 1 else ""))
    if att:
        summary_bits.append(f"📌 {len(att)}")
    if agt:
        summary_bits.append(f"🤖 {len(agt)}")
    summary = " · ".join(summary_bits) if summary_bits else "🟢 All clear"

    header = discord.ui.Container(
        discord.ui.TextDisplay(f"## 📟 BMO Status Board\n{summary}　·　Updated <t:{int(time.time())}:R>"),
        accent_colour=_colour(worst),
    )
    view.add_item(header)

    for cat, label, mode in SECTIONS:
        crows = [r for r in rows if r["category"] == cat]
        if not crows:
            continue
        crows.sort(key=lambda r: sb.SEV_ORDER.index(r["severity"]))
        sect_worst = sb.worst_severity(crows)
        children = []
        collapsed = (cat == "info" and state.collapse_info)
        if collapsed:
            children.append(discord.ui.TextDisplay(f"### {label} · {len(crows)} (hidden)"))
        else:
            children.append(discord.ui.TextDisplay(f"### {label} · {len(crows)}"))
            if mode in ("incident", "item"):
                shown = crows[:MAX_INTERACTIVE]
                for r in shown:
                    if mode == "incident":
                        acc = MuteButton(r["key"])
                    else:
                        acc = DoneButton(r["id"])
                    children.append(discord.ui.Section(discord.ui.TextDisplay(_line(r)), accessory=acc))
                if len(crows) > MAX_INTERACTIVE:
                    extra = crows[MAX_INTERACTIVE:]
                    children.append(discord.ui.TextDisplay(
                        "\n".join(_line(r) for r in extra[:MAX_TEXT])))
            else:  # grouped text block
                children.append(discord.ui.TextDisplay(
                    "\n".join(_line(r) for r in crows[:MAX_TEXT])
                    + (f"\n_…and {len(crows) - MAX_TEXT} more_" if len(crows) > MAX_TEXT else "")))
        view.add_item(discord.ui.Container(*children, accent_colour=_colour(sect_worst)))

    # global action row
    buttons = [RefreshButton()]
    if inc:
        buttons.append(AckAllButton())
    if any(r["category"] == "info" for r in rows):
        buttons.append(ToggleInfoButton())
    view.add_item(discord.ui.ActionRow(*buttons))
    return view


# ── The cog ──────────────────────────────────────────────────────────────────

def _deploy_adapter() -> list:
    try:
        active = subprocess.run(["systemctl", "is-active", "bmo"],
                                capture_output=True, text=True, timeout=5).stdout.strip()
    except Exception:
        return []
    if active != "active":
        return [{"key": "deploy_bmo", "label": "🚀 BMO service", "status": "down",
                 "message": f"bmo.service is {active}"}]
    return []


class StatusBoardCog(commands.Cog):
    def __init__(self, bot: commands.Bot):
        self.bot = bot
        self.state = sb.BoardState.load()
        self._lock = asyncio.Lock()

    async def cog_load(self):
        for dyn in (MuteButton, DoneButton, RefreshButton, AckAllButton, ToggleInfoButton):
            self.bot.add_dynamic_items(dyn)
        self.loop.start()

    def cog_unload(self):
        self.loop.cancel()

    @tasks.loop(seconds=RECONCILE_SECONDS)
    async def loop(self):
        try:
            await self.reconcile_and_render()
        except Exception:
            import logging
            logging.getLogger("status_board").exception("board reconcile failed (retry next cycle)")

    @loop.before_loop
    async def _before(self):
        await self.bot.wait_until_ready()

    async def _extra_truth(self):
        try:
            return await asyncio.to_thread(_deploy_adapter)
        except Exception:
            return []

    async def reconcile_and_render(self):
        async with self._lock:
            monitor = sb._read_json(sb.MONITOR_STATE) if os.path.exists(sb.MONITOR_STATE) else {}
            health = sb.derive_incidents(monitor, labels=LABELS, extra=await self._extra_truth())
            self.state = sb.reconcile_incidents(self.state, health)
            inbox = sb.load_inbox()
            sb.prune_inbox(inbox)
            sb.save_inbox(inbox)
            now = time.time()
            self.state.muted = {k: v for k, v in self.state.muted.items() if v > now}
            rows = sb.all_rows(self.state, health, inbox)
            rows = [r for r in rows if not (r["category"] == "incident" and r["key"] in self.state.muted)]

            channel = self.bot.get_channel(STATUS_CHANNEL_ID)
            if channel is None:
                return
            await self._ping_new_criticals(channel, rows)

            view = build_layout(rows, self.state)
            msg, created = await self._ensure_board(channel, view)
            if msg and not created:
                try:
                    await msg.edit(view=view)
                except discord.HTTPException:
                    await self._ensure_board(channel, view, force_new=True)

            topic = sb.render_topic(rows)
            try:
                if channel.topic != topic:
                    await channel.edit(topic=topic)
            except discord.HTTPException:
                pass
            try:
                await self.bot.change_presence(activity=discord.Activity(
                    type=discord.ActivityType.watching, name=sb.render_presence(rows)))
            except Exception:
                pass
            self.state.save()

    async def _ping_new_criticals(self, channel, rows):
        crit_keys = [r["key"] for r in rows if r["category"] == "incident" and r["severity"] == "critical"]
        new = [r for r in rows if r["category"] == "incident" and r["severity"] == "critical"
               and r["key"] not in self.state.pinged_critical]
        for r in new:
            mention = f"<@{OWNER_ID}> " if OWNER_ID else ""
            try:
                await channel.send(
                    f"{mention}🔴 **New critical incident:** {r['title']}\n{r.get('detail', '')[:200]}",
                    delete_after=120,
                    allowed_mentions=discord.AllowedMentions(users=True))
            except discord.HTTPException:
                pass
        # remember current criticals; drop keys no longer critical so they can re-ping later
        self.state.pinged_critical = crit_keys

    async def _ensure_board(self, channel, view, force_new=False):
        st = self.state
        if not force_new and st.board_message_id and st.board_v2:
            try:
                return await channel.fetch_message(st.board_message_id), False
            except discord.NotFound:
                pass
        msg = await channel.send(view=view)
        try:
            await msg.pin()
        except discord.HTTPException:
            pass
        if st.board_message_id and st.board_message_id != msg.id:
            try:
                old = await channel.fetch_message(st.board_message_id)
                await old.delete()
            except discord.HTTPException:
                pass
        st.board_message_id, st.channel_id, st.board_v2 = msg.id, channel.id, True
        st.save()
        return msg, True


async def setup(bot: commands.Bot):
    await bot.add_cog(StatusBoardCog(bot))
