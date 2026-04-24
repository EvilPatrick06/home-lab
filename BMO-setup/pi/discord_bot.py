"""BMO Discord Bot — D&D session management over Discord voice + text.

Replaces the VTT's built-in voice chat. Players join a Discord voice channel
instead, and BMO streams TTS narration directly into it. Slash commands
provide dice rolling, initiative tracking, session recaps, and character info.

Requires:
    pip install discord.py[voice]

Environment variables:
    DISCORD_BOT_TOKEN  — Bot token from Discord Developer Portal
    DISCORD_GUILD_ID   — Server (guild) ID for slash command registration
"""

import asyncio
import io
import logging
import os
import re
import threading
import time
from datetime import datetime, timezone
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands

# ── Configuration ────────────────────────────────────────────────────

BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "")
GUILD_ID = os.environ.get("DISCORD_GUILD_ID", "")

logger = logging.getLogger("discord_bot")

# ── Dice rolling (reuse from dnd_engine) ─────────────────────────────

from dnd_engine import roll_dice


# ── Session state ────────────────────────────────────────────────────

class SessionState:
    """Tracks the active D&D session."""

    def __init__(self) -> None:
        self.active = False
        self.channel_id: Optional[int] = None
        self.voice_client: Optional[discord.VoiceClient] = None
        self.start_time: Optional[datetime] = None
        self.players: set[str] = set()
        self.initiative_order: list[dict] = []
        self.initiative_round: int = 0
        self.messages: list[dict] = []  # Chat log for recap generation

    def reset(self) -> None:
        self.active = False
        self.channel_id = None
        self.voice_client = None
        self.start_time = None
        self.players.clear()
        self.initiative_order.clear()
        self.initiative_round = 0
        self.messages.clear()


# ── Bot class ────────────────────────────────────────────────────────

class DndBot(commands.Bot):
    """Discord bot for D&D session management, integrated with BMO agent."""

    def __init__(self, agent=None) -> None:
        intents = discord.Intents.default()
        intents.message_content = True
        intents.voice_states = True
        intents.members = True

        super().__init__(command_prefix="!", intents=intents)
        self.agent = agent
        self._session = SessionState()
        self._guild_id: Optional[int] = int(GUILD_ID) if GUILD_ID else None

    async def setup_hook(self) -> None:
        """Register slash commands on startup."""
        self.tree.add_command(session_group)
        self.tree.add_command(roll_command)
        self.tree.add_command(initiative_command)
        self.tree.add_command(recap_command)
        self.tree.add_command(character_command)
        self.tree.add_command(status_command)

        # Sync commands to the configured guild for instant availability,
        # or globally if no guild ID is set (takes up to an hour to propagate).
        if self._guild_id:
            guild = discord.Object(id=self._guild_id)
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
            logger.info("Slash commands synced to guild %s", self._guild_id)
        else:
            await self.tree.sync()
            logger.info("Slash commands synced globally")

    async def on_ready(self) -> None:
        logger.info("Discord bot ready as %s (ID: %s)", self.user, self.user.id if self.user else "?")

        # Notify BMO agent that Discord is connected
        if self.agent and hasattr(self.agent, "services"):
            services = self.agent.services
            if "led" in services:
                try:
                    services["led"].flash("ready")
                except Exception:
                    pass

    async def on_voice_state_update(
        self,
        member: discord.Member,
        before: discord.VoiceState,
        after: discord.VoiceState,
    ) -> None:
        """Track players joining/leaving the session voice channel."""
        if not self._session.active or not self._session.channel_id:
            return

        # Player joined session channel
        if after.channel and after.channel.id == self._session.channel_id:
            if not member.bot:
                self._session.players.add(member.display_name)
                logger.info("Player joined session: %s", member.display_name)

        # Player left session channel
        if before.channel and before.channel.id == self._session.channel_id:
            if not member.bot:
                self._session.players.discard(member.display_name)
                logger.info("Player left session: %s", member.display_name)

    # ── TTS audio playback ─────────────────────────────────────────

    async def play_tts_audio(self, audio_bytes: bytes) -> None:
        """Play WAV audio bytes through the Discord voice channel.

        Called by BMO's voice pipeline when generating DM narration or NPC voices.
        The audio_bytes should be raw WAV data (PCM, any sample rate — ffmpeg handles conversion).
        """
        vc = self._session.voice_client
        if not vc or not vc.is_connected():
            logger.warning("Cannot play TTS — not connected to voice channel")
            return

        # Wait for any currently playing audio to finish
        while vc.is_playing():
            await asyncio.sleep(0.1)

        try:
            audio_stream = io.BytesIO(audio_bytes)
            source = discord.FFmpegPCMAudio(audio_stream, pipe=True)
            vc.play(source, after=lambda e: logger.error("TTS playback error: %s", e) if e else None)
            logger.debug("Playing TTS audio (%d bytes)", len(audio_bytes))
        except Exception as e:
            logger.error("Failed to play TTS audio: %s", e)

    async def join_voice_channel(self, channel: discord.VoiceChannel) -> Optional[discord.VoiceClient]:
        """Join a voice channel and store the voice client reference."""
        try:
            vc = await channel.connect()
            self._session.voice_client = vc
            logger.info("Joined voice channel: %s", channel.name)
            return vc
        except Exception as e:
            logger.error("Failed to join voice channel: %s", e)
            return None

    async def leave_voice_channel(self) -> None:
        """Disconnect from the current voice channel."""
        vc = self._session.voice_client
        if vc and vc.is_connected():
            await vc.disconnect()
            logger.info("Left voice channel")
        self._session.voice_client = None

    @property
    def session(self) -> SessionState:
        return self._session


# ── Singleton bot instance ───────────────────────────────────────────

_bot: Optional[DndBot] = None


def get_bot() -> Optional[DndBot]:
    """Get the running bot instance (for use by other BMO services)."""
    return _bot


# ── Slash command: /session ──────────────────────────────────────────

session_group = app_commands.Group(name="session", description="D&D session management")


@session_group.command(name="start", description="Start a D&D session — creates a voice channel and invites everyone")
async def session_start(interaction: discord.Interaction) -> None:
    bot = interaction.client
    if not isinstance(bot, DndBot):
        await interaction.response.send_message("Bot not initialized.", ephemeral=True)
        return

    if bot.session.active:
        await interaction.response.send_message("A session is already active! Use `/session end` first.", ephemeral=True)
        return

    await interaction.response.defer()

    guild = interaction.guild
    if not guild:
        await interaction.followup.send("This command must be used in a server.")
        return

    # Create a temporary voice channel in the same category as the text channel
    category = interaction.channel.category if hasattr(interaction.channel, "category") else None
    try:
        voice_channel = await guild.create_voice_channel(
            "D&D Session",
            category=category,
            reason="BMO D&D session started",
        )
    except discord.Forbidden:
        await interaction.followup.send("I don't have permission to create voice channels.")
        return
    except Exception as e:
        await interaction.followup.send(f"Failed to create voice channel: {e}")
        return

    # Bot joins the voice channel
    vc = await bot.join_voice_channel(voice_channel)
    if not vc:
        await interaction.followup.send("Failed to join the voice channel.")
        return

    # Update session state
    bot.session.active = True
    bot.session.channel_id = voice_channel.id
    bot.session.start_time = datetime.now(timezone.utc)
    bot.session.players.clear()
    bot.session.messages.clear()

    # Build invite link
    try:
        invite = await voice_channel.create_invite(max_age=3600, max_uses=0, reason="D&D session invite")
        invite_url = invite.url
    except Exception:
        invite_url = f"Join #{voice_channel.name} manually"

    # Notify BMO agent
    if bot.agent and hasattr(bot.agent, "services"):
        services = bot.agent.services
        if "sound" in services:
            try:
                services["sound"].play("horn")
            except Exception:
                pass
        if "led" in services:
            try:
                services["led"].set_state("listening")
            except Exception:
                pass

    embed = discord.Embed(
        title="D&D Session Started!",
        description="The adventure begins! Join the voice channel to play.",
        color=discord.Color.gold(),
    )
    embed.add_field(name="Voice Channel", value=f"<#{voice_channel.id}>", inline=True)
    embed.add_field(name="Invite", value=invite_url, inline=True)
    embed.set_footer(text="Use /session end to wrap up the session")
    await interaction.followup.send(embed=embed)


@session_group.command(name="end", description="End the current D&D session — deletes the voice channel and posts a recap")
async def session_end(interaction: discord.Interaction) -> None:
    bot = interaction.client
    if not isinstance(bot, DndBot):
        await interaction.response.send_message("Bot not initialized.", ephemeral=True)
        return

    if not bot.session.active:
        await interaction.response.send_message("No active session to end.", ephemeral=True)
        return

    await interaction.response.defer()

    # Calculate session duration
    duration_str = "Unknown"
    if bot.session.start_time:
        elapsed = datetime.now(timezone.utc) - bot.session.start_time
        hours, remainder = divmod(int(elapsed.total_seconds()), 3600)
        minutes, _ = divmod(remainder, 60)
        if hours > 0:
            duration_str = f"{hours}h {minutes}m"
        else:
            duration_str = f"{minutes}m"

    # Generate recap via BMO agent
    recap_text = ""
    if bot.agent and bot.session.messages:
        try:
            recap_text = bot.agent.generate_session_recap(bot.session.messages)
        except Exception as e:
            logger.error("Failed to generate session recap: %s", e)
            recap_text = ""

    # Leave voice channel
    await bot.leave_voice_channel()

    # Delete the temporary voice channel
    guild = interaction.guild
    if guild and bot.session.channel_id:
        try:
            channel = guild.get_channel(bot.session.channel_id)
            if channel:
                await channel.delete(reason="D&D session ended")
        except Exception as e:
            logger.warning("Failed to delete session voice channel: %s", e)

    # Build embed
    players_str = ", ".join(sorted(bot.session.players)) if bot.session.players else "No players recorded"
    embed = discord.Embed(
        title="D&D Session Ended",
        description="Thanks for playing! See you next time.",
        color=discord.Color.dark_gold(),
    )
    embed.add_field(name="Duration", value=duration_str, inline=True)
    embed.add_field(name="Players", value=players_str, inline=True)

    if recap_text:
        # Discord embed field limit is 1024 chars
        if len(recap_text) > 1024:
            recap_text = recap_text[:1021] + "..."
        embed.add_field(name="Session Recap", value=recap_text, inline=False)

    # Notify BMO agent
    if bot.agent and hasattr(bot.agent, "services"):
        services = bot.agent.services
        if "sound" in services:
            try:
                services["sound"].play("victory")
            except Exception:
                pass
        if "led" in services:
            try:
                services["led"].set_state("ready")
            except Exception:
                pass

    # Reset session state
    bot.session.reset()

    await interaction.followup.send(embed=embed)


# ── Slash command: /roll ─────────────────────────────────────────────

@app_commands.command(name="roll", description="Roll dice (e.g. 2d6+5, 1d20, 4d8 fire)")
@app_commands.describe(expression="Dice expression like 2d6+5, 1d20, 4d8 fire")
async def roll_command(interaction: discord.Interaction, expression: str) -> None:
    try:
        result = roll_dice(expression)
    except Exception as e:
        await interaction.response.send_message(f"Invalid dice expression: `{expression}` ({e})", ephemeral=True)
        return

    total = result["total"]
    rolls = result["rolls"]
    damage_type = result["damage_type"]
    expr = result["expression"]

    # Pick an emoji based on the result context
    if "d20" in expr.lower():
        if any(r == 20 for r in rolls):
            emoji = "\U0001f31f"  # Star for nat 20
        elif any(r == 1 for r in rolls):
            emoji = "\U0001f480"  # Skull for nat 1
        elif total >= 15:
            emoji = "\U0001f3af"  # Bullseye for high rolls
        else:
            emoji = "\U0001f3b2"  # Die
    else:
        emoji = "\U0001f3b2"  # Die

    rolls_str = ", ".join(str(r) for r in rolls) if rolls else "flat"
    description = f"**{total}** {emoji}"
    if damage_type:
        description += f" *{damage_type}*"

    embed = discord.Embed(
        title=f"Rolling {expression}",
        description=description,
        color=discord.Color.blue(),
    )
    embed.add_field(name="Rolls", value=f"[{rolls_str}]", inline=True)
    embed.set_footer(text=f"Rolled by {interaction.user.display_name}")

    await interaction.response.send_message(embed=embed)

    # Log to session if active
    bot = interaction.client
    if isinstance(bot, DndBot) and bot.session.active:
        bot.session.messages.append({
            "role": "user",
            "text": f"{interaction.user.display_name} rolled {expression}: {total} [{rolls_str}]",
        })


# ── Slash command: /initiative ───────────────────────────────────────

@app_commands.command(name="initiative", description="Start initiative — ask everyone to roll")
async def initiative_command(interaction: discord.Interaction) -> None:
    bot = interaction.client
    if not isinstance(bot, DndBot):
        await interaction.response.send_message("Bot not initialized.", ephemeral=True)
        return

    # Reset initiative
    bot.session.initiative_order.clear()
    bot.session.initiative_round = 1

    embed = discord.Embed(
        title="Roll for Initiative!",
        description=(
            "Everyone roll initiative! Use `/roll 1d20+<modifier>` and I'll track the order.\n\n"
            "**Example:** `/roll 1d20+3`\n\n"
            "DM: After everyone has rolled, manually set the order using the session tracker."
        ),
        color=discord.Color.red(),
    )
    embed.set_footer(text="Combat has begun!")

    await interaction.response.send_message(embed=embed)

    # Notify BMO
    if bot.agent and hasattr(bot.agent, "services"):
        services = bot.agent.services
        if "sound" in services:
            try:
                services["sound"].play("initiative")
            except Exception:
                pass

    # Log to session
    if bot.session.active:
        bot.session.messages.append({
            "role": "assistant",
            "text": "Initiative has been called! Combat begins.",
        })


# ── Slash command: /recap ────────────────────────────────────────────

@app_commands.command(name="recap", description="Generate an AI recap of the current session")
async def recap_command(interaction: discord.Interaction) -> None:
    bot = interaction.client
    if not isinstance(bot, DndBot):
        await interaction.response.send_message("Bot not initialized.", ephemeral=True)
        return

    if not bot.session.active or not bot.session.messages:
        await interaction.response.send_message(
            "No active session or no messages to recap. Start a session first with `/session start`.",
            ephemeral=True,
        )
        return

    if not bot.agent:
        await interaction.response.send_message("BMO agent is not connected.", ephemeral=True)
        return

    await interaction.response.defer()

    try:
        recap = bot.agent.generate_session_recap(bot.session.messages)
    except Exception as e:
        await interaction.followup.send(f"Failed to generate recap: {e}")
        return

    if not recap:
        await interaction.followup.send("Could not generate a recap at this time.")
        return

    # Truncate if necessary (embed description limit is 4096)
    if len(recap) > 4000:
        recap = recap[:3997] + "..."

    embed = discord.Embed(
        title="Previously, on our adventure...",
        description=recap,
        color=discord.Color.purple(),
    )
    embed.set_footer(text=f"Recap generated for {len(bot.session.messages)} messages")
    await interaction.followup.send(embed=embed)


# ── Slash command: /character ────────────────────────────────────────

@app_commands.command(name="character", description="Display a character's key stats")
@app_commands.describe(name="Character name to look up")
async def character_command(interaction: discord.Interaction, name: str) -> None:
    bot = interaction.client
    if not isinstance(bot, DndBot):
        await interaction.response.send_message("Bot not initialized.", ephemeral=True)
        return

    # Search for .dndchar files in common locations
    char_data = _find_character(name)
    if not char_data:
        await interaction.response.send_message(
            f"Could not find a character named **{name}**. "
            "Make sure .dndchar files are in ~/Downloads or ~/Documents.",
            ephemeral=True,
        )
        return

    # Extract key stats
    char_name = char_data.get("name", name)
    level = char_data.get("level", "?")
    species = char_data.get("species", {}).get("name", "Unknown")
    hp = char_data.get("hp", {})
    max_hp = hp.get("max", "?")
    ac = char_data.get("ac", "?")

    # Build class string
    classes = char_data.get("classes", [])
    if classes:
        class_parts = []
        for cls in classes:
            cls_name = cls.get("name", "Unknown")
            cls_level = cls.get("level", "?")
            subclass = cls.get("subclass", {}).get("name")
            if subclass:
                class_parts.append(f"{cls_name} ({subclass}) {cls_level}")
            else:
                class_parts.append(f"{cls_name} {cls_level}")
        class_str = " / ".join(class_parts)
    else:
        class_str = "Unknown"

    # Ability scores
    abilities = char_data.get("abilityScores", {})
    ability_str = ""
    for stat in ["STR", "DEX", "CON", "INT", "WIS", "CHA"]:
        val = abilities.get(stat, abilities.get(stat.lower(), "?"))
        if isinstance(val, dict):
            val = val.get("score", val.get("total", "?"))
        mod = (val - 10) // 2 if isinstance(val, int) else "?"
        sign = "+" if isinstance(mod, int) and mod >= 0 else ""
        ability_str += f"**{stat}** {val} ({sign}{mod})  "

    embed = discord.Embed(
        title=char_name,
        description=f"Level {level} {species} {class_str}",
        color=discord.Color.green(),
    )
    embed.add_field(name="HP", value=str(max_hp), inline=True)
    embed.add_field(name="AC", value=str(ac), inline=True)
    embed.add_field(name="Ability Scores", value=ability_str.strip(), inline=False)

    await interaction.response.send_message(embed=embed)


# ── Slash command: /status ───────────────────────────────────────────

@app_commands.command(name="status", description="Show BMO system status")
async def status_command(interaction: discord.Interaction) -> None:
    bot = interaction.client
    if not isinstance(bot, DndBot):
        await interaction.response.send_message("Bot not initialized.", ephemeral=True)
        return

    # Check cloud API connectivity
    cloud_status = "Unknown"
    try:
        from cloud_providers import cloud_chat
        cloud_status = "Cloud APIs configured"
    except ImportError:
        cloud_status = "Cloud providers not loaded"

    # Check services
    service_statuses: list[str] = []
    if bot.agent and hasattr(bot.agent, "services"):
        for name, svc in bot.agent.services.items():
            status = "OK"
            if hasattr(svc, "is_running") and callable(svc.is_running):
                status = "Running" if svc.is_running() else "Stopped"
            service_statuses.append(f"**{name}**: {status}")

    if not service_statuses:
        service_statuses.append("No services registered")

    # Session info
    session_str = "No active session"
    if bot.session.active:
        player_count = len(bot.session.players)
        duration = ""
        if bot.session.start_time:
            elapsed = datetime.now(timezone.utc) - bot.session.start_time
            minutes = int(elapsed.total_seconds()) // 60
            duration = f" ({minutes}m)"
        session_str = f"Active{duration} — {player_count} player(s)"

    embed = discord.Embed(
        title="BMO System Status",
        color=discord.Color.teal(),
    )
    embed.add_field(name="Cloud APIs", value=cloud_status, inline=True)
    embed.add_field(name="D&D Session", value=session_str, inline=True)
    embed.add_field(name="Services", value="\n".join(service_statuses), inline=False)

    vc = bot.session.voice_client
    voice_str = "Not in voice" if not vc or not vc.is_connected() else f"Connected to <#{bot.session.channel_id}>"
    embed.add_field(name="Voice", value=voice_str, inline=True)
    embed.set_footer(text=f"Bot latency: {round(bot.latency * 1000)}ms")

    await interaction.response.send_message(embed=embed)


# ── Character file search helper ─────────────────────────────────────

def _find_character(name: str) -> Optional[dict]:
    """Search for a .dndchar file matching the given character name.

    Searches ~/Downloads and ~/Documents for .dndchar files (JSON format)
    and returns the parsed data if a match is found.
    """
    import glob
    import json

    search_dirs = [
        os.path.expanduser("~/Downloads"),
        os.path.expanduser("~/Documents"),
    ]

    name_lower = name.lower()

    for search_dir in search_dirs:
        pattern = os.path.join(search_dir, "**", "*.dndchar")
        for filepath in glob.glob(pattern, recursive=True):
            try:
                with open(filepath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                char_name = data.get("name", "")
                if char_name.lower() == name_lower or name_lower in char_name.lower():
                    return data
            except (json.JSONDecodeError, OSError):
                continue

    return None


# ── Bot startup ──────────────────────────────────────────────────────

async def _run_bot(agent=None) -> None:
    """Internal coroutine that creates and runs the bot."""
    global _bot

    if not BOT_TOKEN:
        logger.error("DISCORD_BOT_TOKEN not set — Discord bot will not start")
        return

    _bot = DndBot(agent=agent)

    try:
        await _bot.start(BOT_TOKEN)
    except discord.LoginFailure:
        logger.error("Invalid Discord bot token — check DISCORD_BOT_TOKEN")
    except Exception as e:
        logger.error("Discord bot crashed: %s", e)
    finally:
        if _bot and not _bot.is_closed():
            await _bot.close()


def start_bot(agent=None) -> Optional[threading.Thread]:
    """Start the Discord bot in a background daemon thread.

    Args:
        agent: Optional BmoAgent instance for AI integration
               (recap generation, character data, etc.)

    Returns:
        The daemon thread running the bot, or None if token is missing.
    """
    if not BOT_TOKEN:
        logger.warning("DISCORD_BOT_TOKEN not set — skipping Discord bot")
        return None

    def _thread_target() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_run_bot(agent=agent))
        except Exception as e:
            logger.error("Discord bot thread error: %s", e)
        finally:
            loop.close()

    thread = threading.Thread(target=_thread_target, name="discord-bot", daemon=True)
    thread.start()
    logger.info("Discord bot thread started")
    return thread
