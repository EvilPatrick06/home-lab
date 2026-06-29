"""status_board_cog — Components-V2 Discord driver for the BMO status board.

The ONLY component that talks to Discord for the board. Loaded by the bmo-social
bot (discord.py 2.7.1). Owns ONE message in #status — a Components-V2 LayoutView.

Buttons respond via the INTERACTION (interaction.response.edit_message), never a
bot-side message PATCH, so clicks are instant and don't hit the message edit
rate-limit. The periodic reconciler only PATCHes the board when content actually
changed (hash compare), so the board never enters an edit-storm.

Sections: 🚨 Incidents · 📌 Needs you · 📋 Briefs · 🤖 Agents · 📅 Today · 💡 Info.
ALL items in a section are listed (no truncation). Interactive sections get
numbered action buttons (🔕 mute / ✓ done) mapping to the numbered lines, plus a
group button (Ack-all incidents / Clear-all briefs). Non-actionable agent info
FYIs are filtered out.
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
COMPONENT_BUDGET = 36          # stay under Discord's V2 40-component cap
MAX_SECTION_CHARS = 3500       # TextDisplay hard limit is 4000

LABELS = {
    "google_calendar": "📅 Google Calendar", "svc_bmo": "🏠 BMO service",
    "svc_docker": "🐳 Docker engine", "svc_bmo_social_bot": "🎵 Social bot",
    "svc_bmo_dm_bot": "🐉 DM bot", "svc_bmo_kiosk": "🖥️ Kiosk",
    "peerjs": "🌐 PeerJS", "ollama_local": "🧠 Ollama", "internet": "🌐 Internet",
    "cloudflared": "🌐 Cloudflare Tunnel", "fish_audio_api": "🔊 Fish Audio",
    "pi_cpu_temp": "🌡️ CPU temp", "pi_load": "📊 System load", "voice_canary": "🎤 Voice path",
    "net_eth0": "🔌 Ethernet", "mdns": "📡 mDNS", "rclone": "☁️ Rclone",
}

# (category, header) — interactive sections get per-item buttons.
SECTIONS = [
    ("incident",  "🚨 Incidents"),
    ("attention", "📌 Needs you"),
    ("brief",     "📋 Briefs"),
    ("agent",     "🤖 Agents"),
    ("today",     "📅 Today"),
    ("info",      "💡 Info"),
]
INTERACTIVE = {"incident", "attention", "brief"}


def _colour(sev: str) -> discord.Colour:
    return discord.Colour(sb.SEV_COLOR.get(sev, 0x808080))


def _line(r: dict, compact: bool = False) -> str:
    title = r["title"].strip()
    line = f"{sb.SEV_DOT[r['severity']]} **[{title}]({r['url']})**" if r.get("url") \
        else f"{sb.SEV_DOT[r['severity']]} **{title}**"
    if r.get("due"):
        line += f" · due <t:{int(r['due'])}:R>"
    elif r.get("since"):
        line += f" · <t:{int(r['since'])}:R>"
    if r.get("detail") and not compact:
        line += f"\n　{r['detail'].strip()[:180]}"
    return line


def _cog(interaction) -> "StatusBoardCog | None":
    return interaction.client.get_cog("StatusBoardCog")


async def _respond(interaction: discord.Interaction, cog) -> None:
    """Re-render the board via the interaction response (no rate-limited PATCH)."""
    if cog is None:
        try:
            await interaction.response.defer()
        except discord.HTTPException:
            pass
        return
    try:
        await interaction.response.edit_message(view=cog.build_current_view())
    except discord.HTTPException:
        try:
            await interaction.response.defer()
        except discord.HTTPException:
            pass


# ── Persistent (DynamicItem) buttons ─────────────────────────────────────────

class MuteButton(discord.ui.DynamicItem[discord.ui.Button], template=r"board:mute:(?P<key>.+)"):
    def __init__(self, key: str, label: str = "🔕 Mute 1h"):
        self.key = key
        super().__init__(discord.ui.Button(label=label, style=discord.ButtonStyle.secondary,
                                           custom_id=f"board:mute:{key}"))

    @classmethod
    async def from_custom_id(cls, interaction, item, match):
        return cls(match["key"])

    async def callback(self, interaction: discord.Interaction):
        cog = _cog(interaction)
        if cog:
            cog.state.muted[self.key] = time.time() + MUTE_SECONDS
            cog.state.save()
        await _respond(interaction, cog)


class DoneButton(discord.ui.DynamicItem[discord.ui.Button], template=r"board:done:(?P<iid>.+)"):
    def __init__(self, iid: str, label: str = "✓ Done"):
        self.iid = iid
        super().__init__(discord.ui.Button(label=label, style=discord.ButtonStyle.success,
                                           custom_id=f"board:done:{iid}"))

    @classmethod
    async def from_custom_id(cls, interaction, item, match):
        return cls(match["iid"])

    async def callback(self, interaction: discord.Interaction):
        inbox = sb.load_inbox()
        sb.mark_done(inbox, self.iid)
        sb.save_inbox(inbox)
        await _respond(interaction, _cog(interaction))


class RefreshButton(discord.ui.DynamicItem[discord.ui.Button], template=r"board:refresh"):
    def __init__(self):
        super().__init__(discord.ui.Button(label="Refresh", emoji="🔄",
                         style=discord.ButtonStyle.primary, custom_id="board:refresh"))

    @classmethod
    async def from_custom_id(cls, interaction, item, match):
        return cls()

    async def callback(self, interaction: discord.Interaction):
        await _respond(interaction, _cog(interaction))


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
        await _respond(interaction, cog)


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
        await _respond(interaction, cog)


class ClearBriefsButton(discord.ui.DynamicItem[discord.ui.Button], template=r"board:clearbriefs"):
    def __init__(self):
        super().__init__(discord.ui.Button(label="Clear all briefs", emoji="🧹",
                         style=discord.ButtonStyle.secondary, custom_id="board:clearbriefs"))

    @classmethod
    async def from_custom_id(cls, interaction, item, match):
        return cls()

    async def callback(self, interaction: discord.Interaction):
        inbox = sb.load_inbox()
        for src in list(inbox):
            inbox[src] = {iid: it for iid, it in inbox[src].items() if it.category != "brief"}
        sb.save_inbox(inbox)
        await _respond(interaction, _cog(interaction))


# ── Layout ───────────────────────────────────────────────────────────────────

def build_layout(rows: list[dict], state: sb.BoardState) -> discord.ui.LayoutView:
    rows = [r for r in rows if not (r.get("category") == "agent" and r.get("severity") == "info")]
    view = discord.ui.LayoutView(timeout=None)
    worst = sb.worst_severity(rows)
    comp = 0

    inc = [r for r in rows if r["category"] == "incident"]
    att = [r for r in rows if r["category"] == "attention"]
    brf = [r for r in rows if r["category"] == "brief"]
    bits = []
    if inc:
        bits.append(f"🔴 {len(inc)} incident" + ("s" if len(inc) != 1 else ""))
    if att:
        bits.append(f"📌 {len(att)}")
    if brf:
        bits.append(f"📋 {len(brf)}")
    summary = " · ".join(bits) if bits else "🟢 All clear"
    view.add_item(discord.ui.Container(
        discord.ui.TextDisplay(f"## 📟 BMO Status Board\n{summary}　·　Updated <t:{int(time.time())}:R>"),
        accent_colour=_colour(worst)))
    comp += 2

    for cat, label in SECTIONS:
        crows = [r for r in rows if r["category"] == cat]
        if not crows:
            continue
        if cat == "info" and state.collapse_info:
            view.add_item(discord.ui.Container(
                discord.ui.TextDisplay(f"### {label} · {len(crows)} — hidden (tap Info to show)"),
                accent_colour=_colour("info")))
            comp += 2
            continue
        crows.sort(key=lambda r: sb.SEV_ORDER.index(r["severity"]))
        interactive = cat in INTERACTIVE
        compact = len(crows) > 12
        lines = []
        for idx, r in enumerate(crows, 1):
            pfx = f"`{idx}` " if interactive else ""
            lines.append(pfx + _line(r, compact=compact))
        children = [discord.ui.TextDisplay(f"### {label} · {len(crows)}")]
        chunk, clen = [], 0
        for ln in lines:
            if chunk and clen + len(ln) + 1 > MAX_SECTION_CHARS:
                children.append(discord.ui.TextDisplay("\n".join(chunk)))
                chunk, clen = [], 0
            chunk.append(ln)
            clen += len(ln) + 1
        if chunk:
            children.append(discord.ui.TextDisplay("\n".join(chunk)))
        sect_comp = 1 + len(children)
        if interactive and comp + sect_comp < COMPONENT_BUDGET:
            btns: list[discord.ui.Item] = []
            for idx, r in enumerate(crows, 1):
                if comp + sect_comp + len(btns) + 2 >= COMPONENT_BUDGET:
                    break
                if cat == "incident":
                    btns.append(MuteButton(r["key"], label=f"🔕 {idx}"))
                else:
                    btns.append(DoneButton(r["id"], label=f"✓ {idx}"))
            if cat == "brief":
                btns.append(ClearBriefsButton())
            elif cat == "incident" and len(crows) > 1:
                btns.append(AckAllButton())
            for i in range(0, len(btns), 5):
                chunk = btns[i:i + 5]
                children.append(discord.ui.ActionRow(*chunk))
                sect_comp += 1 + len(chunk)
        view.add_item(discord.ui.Container(*children, accent_colour=_colour(sb.worst_severity(crows))))
        comp += sect_comp

    glob = [RefreshButton()]
    if any(r["category"] == "info" for r in rows):
        glob.append(ToggleInfoButton())
    view.add_item(discord.ui.ActionRow(*glob))
    return view


# ── Cog ──────────────────────────────────────────────────────────────────────

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
        self._cached_extra: list = []
        self._last_rows: list = []
        self._last_hash = ""

    async def cog_load(self):
        for dyn in (MuteButton, DoneButton, RefreshButton, AckAllButton,
                    ToggleInfoButton, ClearBriefsButton):
            self.bot.add_dynamic_items(dyn)
        self.loop.start()

    def cog_unload(self):
        self.loop.cancel()

    def build_current_view(self) -> discord.ui.LayoutView:
        """Re-derive truth from local state (fast, no subprocess) and render. Used
        by button responses and the periodic loop. Does NOT edit the message."""
        monitor = sb._read_json(sb.MONITOR_STATE) if os.path.exists(sb.MONITOR_STATE) else {}
        health = sb.derive_incidents(monitor, labels=LABELS, extra=self._cached_extra)
        self.state = sb.reconcile_incidents(self.state, health)
        inbox = sb.load_inbox()
        sb.prune_inbox(inbox)
        sb.save_inbox(inbox)
        now = time.time()
        self.state.muted = {k: v for k, v in self.state.muted.items() if v > now}
        rows = sb.all_rows(self.state, health, inbox)
        rows = [r for r in rows if not (r["category"] == "incident" and r["key"] in self.state.muted)]
        self.state.updated = now
        self.state.save()
        self._last_rows = rows
        return build_layout(rows, self.state)

    @staticmethod
    def _hash(rows: list, state: sb.BoardState) -> str:
        parts = [f"{r['category']}|{r['severity']}|{r['title']}|{r.get('detail','')}|{r.get('since')}|{r.get('due')}"
                 for r in rows]
        return repr((sorted(parts), state.collapse_info, sorted(state.muted)))

    @tasks.loop(seconds=RECONCILE_SECONDS)
    async def loop(self):
        try:
            self._cached_extra = await asyncio.to_thread(_deploy_adapter)
            await self.render_to_message()
        except Exception:
            import logging
            logging.getLogger("status_board").exception("board reconcile failed (retry next cycle)")

    @loop.before_loop
    async def _before(self):
        await self.bot.wait_until_ready()

    async def render_to_message(self):
        async with self._lock:
            channel = self.bot.get_channel(STATUS_CHANNEL_ID)
            if channel is None:
                return
            view = self.build_current_view()
            await self._ping_new_criticals(channel, self._last_rows)
            h = self._hash(self._last_rows, self.state)
            msg, created = await self._ensure_board(channel, view)
            if not created and h != self._last_hash:
                try:
                    await msg.edit(view=view)
                except discord.HTTPException:
                    await self._ensure_board(channel, view, force_new=True)
            self._last_hash = h
            topic = sb.render_topic(self._last_rows)
            try:
                if channel.topic != topic:
                    await channel.edit(topic=topic)
            except discord.HTTPException:
                pass
            try:
                await self.bot.change_presence(activity=discord.Activity(
                    type=discord.ActivityType.watching, name=sb.render_presence(self._last_rows)))
            except Exception:
                pass

    async def _ping_new_criticals(self, channel, rows):
        crit = [r for r in rows if r["category"] == "incident" and r["severity"] == "critical"]
        for r in crit:
            if r["key"] in self.state.pinged_critical:
                continue
            mention = f"<@{OWNER_ID}> " if OWNER_ID else ""
            try:
                await channel.send(f"{mention}🔴 **New critical incident:** {r['title']}\n{r.get('detail','')[:200]}",
                                   delete_after=120, allowed_mentions=discord.AllowedMentions(users=True))
            except discord.HTTPException:
                pass
        self.state.pinged_critical = [r["key"] for r in crit]

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
