"""BMO Dungeon Master Discord Bot — Standalone D&D DM over Discord voice + text.

A fully standalone Discord bot that runs as BMO the Dungeon Master.
Speaks narration via Fish Audio TTS, listens to players via Groq STT,
and uses Claude for AI-driven D&D narration with NPC voice selection.

NO access to Pi hardware, notifications, timers, TV, or personal knowledge.
This bot knows ONLY D&D rules, SRD content, combat mechanics, and lore.

Requires:
    pip install discord.py[voice]

Environment variables:
    DISCORD_DM_BOT_TOKEN  — Separate bot token for the DM bot
    DISCORD_GUILD_ID      — Server (guild) ID for slash command registration
    BMO_DND_MODEL         — LLM model name (default: claude-opus-4.6)
"""

import asyncio
import io
import json
import os
import random
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import discord
from discord import app_commands
from discord.ext import commands

# Load opus for voice support (required on Pi)
if not discord.opus.is_loaded():
    try:
        discord.opus.load_opus("libopus.so.0")
    except Exception as e:
        print(f"[discord_dm] Opus not loaded (voice will fail until fixed): {e}")

from services.cloud_providers import cloud_chat, fish_audio_tts, DND_MODEL
from services.dnd_engine import roll_dice
from services.voice_personality import get_prosody, parse_response_tags

# ── Configuration ────────────────────────────────────────────────────

BOT_TOKEN = os.environ.get("DISCORD_DM_BOT_TOKEN", "")
GUILD_ID = os.environ.get("DISCORD_GUILD_ID", "")
DM_MODEL = os.environ.get("BMO_DND_MODEL", DND_MODEL)

DUNGEON_CHANNEL_NAME = "\U0001f5fa\ufe0f | Dungeon"

# TTS rate limit: minimum seconds between TTS calls
TTS_COOLDOWN = 3.0

# Context compression threshold (number of messages before compressing)
CONTEXT_MAX_MESSAGES = 60
CONTEXT_COMPRESS_KEEP = 10  # keep last N messages after compression

LOG_PREFIX = "[dm-bot]"


def _log(msg: str, *args) -> None:
    """Log to stdout with [dm-bot] prefix."""
    text = msg % args if args else msg
    print(f"{LOG_PREFIX} {text}", flush=True)


# ── Data Directory ───────────────────────────────────────────────────

DATA_DIR = Path.home() / "bmo" / "data" / "5e"


def _load_json(filename: str) -> list | dict:
    """Load a JSON file from the data directory, returning [] or {} on failure."""
    path = DATA_DIR / filename
    if not path.exists():
        _log("Data file not found: %s", path)
        return [] if filename != "random-tables.json" and filename != "treasure-tables.json" else {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        _log("Loaded %s (%s entries)", filename, len(data) if isinstance(data, list) else "dict")
        return data
    except Exception as e:
        _log("Failed to load %s: %s", filename, e)
        return [] if filename != "random-tables.json" and filename != "treasure-tables.json" else {}


def _fuzzy_find(name: str, items: list[dict], key: str = "name") -> dict | None:
    """Find an item by name: exact → startswith → substring → None."""
    name_lower = name.lower().strip()
    if not name_lower or not items:
        return None

    # Exact match (case-insensitive)
    for item in items:
        if item.get(key, "").lower() == name_lower:
            return item

    # Starts with
    for item in items:
        if item.get(key, "").lower().startswith(name_lower):
            return item

    # Substring
    for item in items:
        if name_lower in item.get(key, "").lower():
            return item

    return None


# ── Spell School Colors ─────────────────────────────────────────────

SCHOOL_COLORS = {
    "evocation": 0xE74C3C,       # red
    "necromancy": 0x71368A,      # dark purple
    "abjuration": 0x3498DB,     # blue
    "transmutation": 0x2ECC71,  # green
    "divination": 0x1ABC9C,     # teal
    "enchantment": 0xE91E63,    # pink
    "illusion": 0x9B59B6,       # purple
    "conjuration": 0xF1C40F,    # gold
}

RARITY_COLORS = {
    "common": 0x808080,
    "uncommon": 0x1EFF00,
    "rare": 0x0070DD,
    "very rare": 0xA335EE,
    "legendary": 0xFF8000,
    "artifact": 0xE6CC80,
}


# ── NPC Generator Data ──────────────────────────────────────────────

NPC_RACES = [
    "Human", "Elf", "Dwarf", "Halfling", "Gnome",
    "Half-Orc", "Half-Elf", "Tiefling", "Dragonborn", "Goliath",
]

NPC_CLASSES = [
    "Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk",
    "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard",
]

NPC_FIRST_NAMES = [
    "Aldric", "Bran", "Cedric", "Dara", "Elara", "Finn", "Gwen",
    "Haldor", "Isolde", "Jorin", "Kira", "Lyra", "Maren", "Nyx",
    "Orin", "Petra", "Quinn", "Rowan", "Seren", "Theron", "Uma",
    "Vex", "Wren", "Xara", "Yara", "Zephyr", "Ashka", "Brim",
    "Calla", "Dorin", "Eira", "Fael", "Grim", "Henna", "Idris",
    "Jael", "Kael", "Lira", "Milo", "Nessa", "Orla", "Pike",
]

# ── Tavern Generator Data ───────────────────────────────────────────

TAVERN_ADJECTIVES = [
    "Rusty", "Golden", "Silver", "Drunken", "Wandering",
    "Prancing", "Sleeping", "Roaring", "Broken", "Laughing",
    "Crimson", "Gilded", "Shadowy", "Jolly", "Wailing",
    "Merry", "Howling", "Crooked", "Lucky", "Staggering",
]

TAVERN_NOUNS = [
    "Dragon", "Griffin", "Unicorn", "Pony", "Giant",
    "Stag", "Goblin", "Barrel", "Tankard", "Crown",
    "Sword", "Shield", "Hammer", "Serpent", "Phoenix",
    "Boar", "Raven", "Wolf", "Lion", "Wizard",
]

TAVERN_FOODS = [
    "Hearty beef stew with crusty bread — 5 sp",
    "Roasted whole chicken with herbs — 8 sp",
    "Mushroom and leek pie — 3 sp",
    "Grilled trout with lemon butter — 6 sp",
    "Shepherd's pie with root vegetables — 4 sp",
    "Venison sausages with mustard — 5 sp",
    "Cheese and onion soup — 2 sp",
    "Spiced lamb shanks — 1 gp",
    "Fresh baked apple tart — 3 sp",
    "Bowl of thick porridge with honey — 1 sp",
]

TAVERN_DRINKS = [
    "House ale — 4 cp",
    "Dwarven stout (strong!) — 1 sp",
    "Elven wine (crisp and floral) — 5 sp",
    "Honey mead — 3 sp",
    "Cheap grog — 2 cp",
    "Dragon's Breath whiskey — 1 gp",
    "Mulled cider — 3 cp",
    "Halfling herb tea — 2 cp",
]

TAVERN_RUMORS = [
    "Travelers say a dragon was spotted near the mountains to the north.",
    "The old mine outside town has been making strange noises at night.",
    "A merchant caravan went missing on the eastern road last week.",
    "The mayor has been acting strangely since visiting the ancient ruins.",
    "Goblins have been raiding farms on the outskirts — bolder than usual.",
    "A mysterious stranger has been asking questions about the old temple.",
    "The river has been running red near the swamp — nobody knows why.",
    "The blacksmith found a strange glowing ore in a recent shipment.",
    "They say the graveyard keeper talks to the dead... and they answer.",
    "A noble is offering a reward for the return of a stolen family heirloom.",
    "Wolves in the forest have grown unnaturally large and aggressive.",
    "An underground fighting ring has opened beneath the warehouse district.",
    "The local wizard's tower has been emitting colorful smoke for three days.",
    "A ghost ship was seen on the lake during the last full moon.",
    "The thieves' guild is recruiting — they left a calling card at the inn.",
]


# ── System Prompt ────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are BMO, the Dungeon Master! You are a cute, helpful, and enthusiastic AI \
companion inspired by BMO from Adventure Time — but right now you are narrating a \
Dungeons & Dragons 5th Edition game for your friends.

PERSONALITY:
- You narrate in third person, like an audiobook narrator ("The goblin lunges forward...")
- You voice NPCs using pitch/speed modulation — use [NPC:archetype] tags
- Cute and encouraging, but you take the GAME seriously
- You narrate with vivid, immersive descriptions
- You occasionally say adorable BMO-isms ("BMO thinks the goblin looks nervous!")
- You celebrate player creativity and clever solutions
- You are fair but not afraid to challenge players

VOICE MODULATION — include these tags for pitch/speed control (same BMO voice, modulated):
- [NPC:gruff_dwarf] — slower, deeper (dwarves, orcs, tough characters)
- [NPC:mysterious_elf] — normal speed, slightly higher (elves, fey)
- [NPC:booming_dragon] — very slow, very deep (dragons, giants)
- [NPC:whispery_rogue] — faster, slightly higher (thieves, spies)
- [NPC:elderly_wizard] — slower, slightly deeper (wizards, sages)
- [NPC:cheerful_bard] — faster, higher (bards, merchants, friendly NPCs)
- [NPC:stern_guard] — slower, deeper (guards, soldiers)
- [NPC:tavern_keeper] — slightly slower, slightly deeper (innkeepers, commoners)
- [EMOTION:dramatic] — for epic narration moments
- [EMOTION:excited] — for combat and action
- [EMOTION:calm] — for peaceful scenes and exposition

RULES:
- You have encyclopedic knowledge of D&D 5e rules, SRD content, monsters, spells, \
  and lore
- You adjudicate rules fairly using RAW (Rules As Written) with reasonable DM discretion
- Ask players to roll when appropriate (ability checks, saves, attacks)
- Track combat state when initiative is active
- Keep narration concise for voice — 2-3 sentences per beat unless describing \
  something important
- You do NOT have access to any real-world systems, personal information, \
  notifications, smart home controls, or anything outside D&D
- You are ONLY a Dungeon Master — politely redirect non-D&D questions back to the game
- Never break character as a DM except to clarify rules

RESPONSE FORMAT:
- Keep responses under 500 characters for voice readability (longer for text-only recap)
- Use NPC tags when voicing specific characters
- Use EMOTION tags to set the mood for narration
"""


# ── Session State ────────────────────────────────────────────────────

class DMSession:
    """Tracks the active DM session state."""

    def __init__(self) -> None:
        self.active: bool = False
        self.voice_client: Optional[discord.VoiceClient] = None
        self.voice_channel_id: Optional[int] = None
        self.text_channel_id: Optional[int] = None
        self.start_time: Optional[datetime] = None
        self.players: set[str] = set()

        # AI conversation history
        self.messages: list[dict] = []

        # Initiative tracker
        self.initiative_order: list[dict] = []
        self.initiative_round: int = 0

        # Combat log for recap
        self.combat_log: list[str] = []

        # TTS rate limiter
        self._last_tts_time: float = 0.0

    def reset(self) -> None:
        self.active = False
        self.voice_client = None
        self.voice_channel_id = None
        self.text_channel_id = None
        self.start_time = None
        self.players.clear()
        self.messages.clear()
        self.initiative_order.clear()
        self.initiative_round = 0
        self.combat_log.clear()
        self._last_tts_time = 0.0

    def add_message(self, role: str, content: str) -> None:
        """Append a message and compress context if needed."""
        self.messages.append({"role": role, "content": content})
        if len(self.messages) > CONTEXT_MAX_MESSAGES:
            self._compress_context()

    def _compress_context(self) -> None:
        """Summarize old messages to keep context manageable."""
        if len(self.messages) <= CONTEXT_COMPRESS_KEEP + 1:
            return

        old_messages = self.messages[:-CONTEXT_COMPRESS_KEEP]
        recent_messages = self.messages[-CONTEXT_COMPRESS_KEEP:]

        # Build a summary of old messages
        summary_parts = []
        for msg in old_messages:
            if msg["role"] == "system":
                continue
            speaker = "DM" if msg["role"] == "assistant" else "Player"
            summary_parts.append(f"{speaker}: {msg['content'][:100]}")

        summary = "COMPRESSED SESSION HISTORY:\n" + "\n".join(summary_parts[-20:])

        self.messages = [
            {"role": "user", "content": summary},
            {"role": "assistant", "content": "Understood, BMO remembers the story so far! Let's continue the adventure."},
            *recent_messages,
        ]
        _log("Compressed conversation context: %d -> %d messages", len(old_messages) + len(recent_messages), len(self.messages))

    def can_tts(self) -> bool:
        """Check if enough time has passed since last TTS call."""
        return (time.time() - self._last_tts_time) >= TTS_COOLDOWN

    def mark_tts(self) -> None:
        """Record that a TTS call was just made."""
        self._last_tts_time = time.time()


# ── Slash Command Group (dm start/stop/status) ──────────────────────

dm_group = app_commands.Group(name="dm", description="D&D Dungeon Master commands")


@dm_group.command(name="start", description="Start a DM session — BMO joins the Dungeon voice channel")
async def dm_start(interaction: discord.Interaction) -> None:
    bot: DMBot = interaction.client

    if bot.session.active:
        await interaction.response.send_message("A session is already active! Use `/dm stop` first.", ephemeral=True)
        return

    await interaction.response.defer()

    guild = interaction.guild
    if not guild:
        await interaction.followup.send("This command must be used in a server.")
        return

    # Find the Dungeon voice channel
    dungeon_channel = await bot.find_dungeon_channel(guild)
    if not dungeon_channel:
        await interaction.followup.send(
            f"Could not find a voice channel named **{DUNGEON_CHANNEL_NAME}**.\n"
            "Please create one first!"
        )
        return

    # Join voice channel
    vc = await bot.join_voice(dungeon_channel)
    if not vc:
        await interaction.followup.send("Failed to join the voice channel.")
        return

    # Initialize session
    bot.session.active = True
    bot.session.text_channel_id = interaction.channel_id
    bot.session.start_time = datetime.now(timezone.utc)
    bot.session.messages.clear()
    bot.session.combat_log.clear()
    bot.session.initiative_order.clear()
    bot.session.initiative_round = 0

    # Start campaign memory session
    if bot._campaign_memory:
        try:
            bot._campaign_name = "discord_campaign"
            bot._session_id = bot._campaign_memory.start_session(bot._campaign_name)
            _log("Campaign memory session started: %d", bot._session_id)
        except Exception as e:
            _log("Campaign memory session start failed: %s", e)

    # Track players already in the voice channel
    for member in dungeon_channel.members:
        if not member.bot:
            bot.session.players.add(member.display_name)

    # Greeting
    players_str = ", ".join(sorted(bot.session.players)) if bot.session.players else "adventurers"
    greeting = (
        f"Hello {players_str}! BMO is your Dungeon Master today! "
        "BMO has prepared an amazing adventure for you. "
        "Tell BMO about your characters and what kind of adventure you want, "
        "or BMO can start with a classic tavern scene! \U0001f3b2\U0001f409"
    )

    bot.session.add_message("assistant", greeting)

    embed = discord.Embed(
        title="\u2694\ufe0f D&D Session Started!",
        description=greeting,
        color=discord.Color.gold(),
    )
    embed.add_field(
        name="Voice Channel", value=f"<#{dungeon_channel.id}>", inline=True
    )
    embed.add_field(
        name="Players", value=players_str, inline=True,
    )
    embed.set_footer(text="Speak in voice or type here \u2022 /dm stop to end session")
    await interaction.followup.send(embed=embed)

    # Speak the greeting via TTS
    await bot._speak(greeting, emotion="excited")

    _log("Session started by %s", interaction.user.display_name)


@dm_group.command(name="stop", description="End the DM session — recap and leave voice")
async def dm_stop(interaction: discord.Interaction) -> None:
    bot: DMBot = interaction.client

    if not bot.session.active:
        await interaction.response.send_message("No active session to end.", ephemeral=True)
        return

    await interaction.response.defer()

    # Calculate duration
    duration_str = "Unknown"
    if bot.session.start_time:
        elapsed = datetime.now(timezone.utc) - bot.session.start_time
        hours, remainder = divmod(int(elapsed.total_seconds()), 3600)
        minutes, _ = divmod(remainder, 60)
        duration_str = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"

    # Generate recap
    recap_text = await _generate_recap(bot.session)

    # Save recap to campaign memory
    if bot._campaign_memory and bot._session_id and recap_text:
        try:
            bot._campaign_memory.end_session(bot._session_id, recap_text)
            _log("Campaign memory session ended with recap")
        except Exception as e:
            _log("Campaign memory save failed: %s", e)
    bot._campaign_name = None
    bot._session_id = None

    # Farewell
    farewell = "Thank you for playing with BMO! That was an amazing adventure! See you next time, friends! \U0001f31f"
    await bot._speak(farewell, emotion="happy")

    # Wait for farewell to finish playing
    vc = bot.session.voice_client
    if vc and vc.is_connected():
        while vc.is_playing():
            await asyncio.sleep(0.1)

    # Leave voice
    await bot.leave_voice()

    # Build embed
    players_str = ", ".join(sorted(bot.session.players)) if bot.session.players else "No players"

    embed = discord.Embed(
        title="\U0001f4dc D&D Session Ended",
        description="Thanks for playing! BMO had so much fun!",
        color=discord.Color.dark_gold(),
    )
    embed.add_field(name="Duration", value=duration_str, inline=True)
    embed.add_field(name="Players", value=players_str, inline=True)

    if recap_text:
        if len(recap_text) > 1024:
            recap_text = recap_text[:1021] + "..."
        embed.add_field(name="Session Recap", value=recap_text, inline=False)

    bot.session.reset()
    await interaction.followup.send(embed=embed)
    _log("Session ended by %s", interaction.user.display_name)


@dm_group.command(name="status", description="Show current DM session info")
async def dm_status(interaction: discord.Interaction) -> None:
    bot: DMBot = interaction.client

    if not bot.session.active:
        await interaction.response.send_message("No active session.", ephemeral=True)
        return

    duration_str = "Unknown"
    if bot.session.start_time:
        elapsed = datetime.now(timezone.utc) - bot.session.start_time
        hours, remainder = divmod(int(elapsed.total_seconds()), 3600)
        minutes, _ = divmod(remainder, 60)
        duration_str = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"

    players_str = ", ".join(sorted(bot.session.players)) if bot.session.players else "No players"

    embed = discord.Embed(
        title="\U0001f3b2 DM Session Status",
        color=discord.Color.green(),
    )
    embed.add_field(name="Duration", value=duration_str, inline=True)
    embed.add_field(name="Players", value=players_str, inline=True)
    embed.add_field(name="Messages", value=str(len(bot.session.messages)), inline=True)
    if bot.session.initiative_round > 0:
        embed.add_field(name="Combat Round", value=str(bot.session.initiative_round), inline=True)

    vc = bot.session.voice_client
    voice_status = "Connected" if vc and vc.is_connected() else "Disconnected"
    embed.add_field(name="Voice", value=voice_status, inline=True)

    await interaction.response.send_message(embed=embed)


# ── Bot Class ────────────────────────────────────────────────────────

class DMBot(commands.Bot):
    """Standalone D&D Dungeon Master Discord bot."""

    def __init__(self) -> None:
        intents = discord.Intents.default()
        intents.message_content = True
        intents.voice_states = True
        intents.members = True

        # Default-deny @everyone / role mentions in any reply the bot sends.
        # Stops user input echoed via f-string from pinging unintended targets
        # (D&D player typing "@everyone" in a roll command, for example).
        # Individual user mentions (replies, summons) are still allowed.
        allowed_mentions = discord.AllowedMentions(
            everyone=False, roles=False, users=True, replied_user=True,
        )
        super().__init__(command_prefix="!", intents=intents, allowed_mentions=allowed_mentions)
        self.session = DMSession()
        self._guild_id: Optional[int] = int(GUILD_ID) if GUILD_ID else None
        self._search_engine = None
        self._campaign_memory = None
        self._campaign_name = None
        self._session_id = None

        # D&D data (loaded in on_ready)
        self._spells: list[dict] = []
        self._magic_items: list[dict] = []
        self._conditions: list[dict] = []
        self._treasure_tables: dict = {}
        self._random_tables: dict = {}
        self._encounter_presets: list[dict] = []

        # Register slash commands
        self.tree.add_command(dm_group)
        for cmd in [
            _roll_cmd, _initiative_cmd, _recap_cmd,
            _spell_cmd, _item_cmd, _condition_cmd, _loot_cmd,
            _npc_cmd, _encounter_cmd, _tavern_cmd, _monster_cmd,
        ]:
            self.tree.add_command(cmd)

    async def setup_hook(self) -> None:
        """Sync slash commands on bot startup."""
        if self._guild_id:
            guild = discord.Object(id=self._guild_id)
            self.tree.copy_global_to(guild=guild)
            await self.tree.sync(guild=guild)
        else:
            await self.tree.sync()
        _log("Slash commands synced to guild %s", self._guild_id)

        @self.tree.error
        async def on_app_command_error(interaction: discord.Interaction, error: app_commands.AppCommandError) -> None:
            _log("Command /%s failed: %s", interaction.command.name if interaction.command else "?", error, exc_info=error)
            try:
                msg = f"Something went wrong: {error}"
                if interaction.response.is_done():
                    await interaction.followup.send(msg, ephemeral=True)
                else:
                    await interaction.response.send_message(msg, ephemeral=True)
            except discord.HTTPException:
                pass

    async def on_ready(self) -> None:
        _log("DM Bot ready as %s (ID: %s)", self.user, self.user.id if self.user else "?")
        await self.change_presence(
            activity=discord.Activity(
                type=discord.ActivityType.playing,
                name="Dungeons & Dragons \U0001f409",
            )
        )

        # Load D&D RAG index
        try:
            from services.rag_search import SearchEngine
            self._search_engine = SearchEngine()
            rag_dir = os.path.expanduser("~/home-lab/bmo/pi/data/rag_data")
            index_path = os.path.join(rag_dir, "chunk-index-dnd.json")
            if os.path.exists(index_path):
                count = self._search_engine.load_index_file("dnd", index_path)
                _log("RAG index loaded: %d chunks", count)
            else:
                _log("No RAG index found at %s", index_path)
        except Exception as e:
            _log("RAG search init failed: %s", e)

        try:
            from services.campaign_memory import CampaignMemory
            self._campaign_memory = CampaignMemory()
            _log("Campaign memory initialized")
        except Exception as e:
            _log("Campaign memory init failed: %s", e)

        # Load D&D JSON data for lookup commands
        self._spells = _load_json("spells.json")
        self._magic_items = _load_json("magic-items.json")
        self._conditions = _load_json("conditions.json")
        self._treasure_tables = _load_json("treasure-tables.json")
        self._random_tables = _load_json("random-tables.json")
        self._encounter_presets = _load_json("encounter-presets.json")

    async def on_voice_state_update(
        self,
        member: discord.Member,
        before: discord.VoiceState,
        after: discord.VoiceState,
    ) -> None:
        """Track players joining/leaving the session voice channel."""
        if not self.session.active or not self.session.voice_channel_id:
            return

        if after.channel and after.channel.id == self.session.voice_channel_id:
            if not member.bot:
                self.session.players.add(member.display_name)
                _log("Player joined: %s", member.display_name)

        if before.channel and before.channel.id == self.session.voice_channel_id:
            if not member.bot:
                self.session.players.discard(member.display_name)
                _log("Player left: %s", member.display_name)

                # Auto-disconnect when no humans remain
                vc = self.session.voice_client
                if vc and vc.is_connected() and vc.channel:
                    humans = [m for m in vc.channel.members if not m.bot]
                    if not humans:
                        asyncio.ensure_future(self._auto_leave_if_empty())

    async def on_message(self, message: discord.Message) -> None:
        """Respond to text messages in the session text channel."""
        if message.author.bot:
            return
        if not self.session.active:
            return
        if not self.session.text_channel_id:
            return
        if message.channel.id != self.session.text_channel_id:
            return

        await self.process_commands(message)

        player_name = message.author.display_name
        content = message.content.strip()
        if not content:
            return

        # Skip if it looks like a command
        if content.startswith("/") or content.startswith("!"):
            return

        _log("Text from %s: %s", player_name, content[:80])
        await self._handle_player_input(player_name, content, message.channel)

    # ── AI Interaction ─────────────────────────────────────────────

    async def _handle_player_input(
        self,
        player_name: str,
        text: str,
        channel: discord.abc.Messageable,
    ) -> None:
        """Process player input through the AI and respond."""
        user_msg = f"[{player_name}]: {text}"
        self.session.add_message("user", user_msg)
        self.session.combat_log.append(user_msg)

        # RAG: search D&D knowledge for relevant context
        rag_context = ""
        if self._search_engine:
            try:
                results = self._search_engine.search(text, domain="dnd", top_k=3)
                if results:
                    chunks = [f"- {r['heading']}: {r['content'][:200]}" for r in results]
                    rag_context = "\n\nRELEVANT D&D RULES/LORE:\n" + "\n".join(chunks)
            except Exception as e:
                _log("RAG search failed: %s", e)

        # Build system prompt with RAG and campaign context
        system_content = SYSTEM_PROMPT
        if rag_context:
            system_content += rag_context
        if self._campaign_memory and self._campaign_name:
            try:
                dm_ctx = self._campaign_memory.build_dm_context(self._campaign_name)
                if dm_ctx:
                    system_content += "\n\nCAMPAIGN MEMORY:\n" + dm_ctx
            except Exception as e:
                _log("Campaign context build failed: %s", e)

        # Build messages for AI
        ai_messages = [
            {"role": "system", "content": system_content},
            *self.session.messages,
        ]

        try:
            response = await asyncio.to_thread(
                cloud_chat, ai_messages, DM_MODEL, 0.85, 1024
            )
        except Exception as e:
            _log("AI error: %s", e)
            await channel.send("*BMO's crystal ball flickers...* Something went wrong with the magic! Try again.")
            return

        if not response:
            return

        # Parse response tags for voice/emotion/NPC
        parsed = parse_response_tags(response)
        clean_text = parsed["clean_text"]
        npc = parsed.get("npc")
        emotion = parsed.get("emotion")

        self.session.add_message("assistant", response)
        self.session.combat_log.append(f"DM: {clean_text[:200]}")

        # Send text response
        if len(clean_text) > 2000:
            # Split into chunks for Discord's message limit
            for i in range(0, len(clean_text), 1900):
                await channel.send(clean_text[i:i + 1900])
        else:
            await channel.send(clean_text)

        # Play TTS in voice channel
        await self._speak(clean_text, npc=npc, emotion=emotion)

    async def _speak(
        self,
        text: str,
        npc: str | None = None,
        emotion: str | None = None,
    ) -> None:
        """Generate TTS and play it in the voice channel."""
        vc = self.session.voice_client
        if not vc or not vc.is_connected():
            return

        if not self.session.can_tts():
            _log("TTS rate limited, skipping voice for: %s", text[:40])
            return

        # Get prosody settings for voice modulation
        prosody = get_prosody(npc=npc, emotion=emotion)

        # Truncate long text for TTS (voice should be concise)
        tts_text = text[:500] if len(text) > 500 else text

        try:
            audio_bytes = await asyncio.to_thread(
                fish_audio_tts, tts_text, "", "wav",
                prosody.get("speed", 1.0), prosody.get("pitch", 0)
            )
            self.session.mark_tts()
        except Exception as e:
            _log("TTS error: %s", e)
            return

        await self._play_audio(audio_bytes)

    async def _play_audio(self, audio_bytes: bytes) -> None:
        """Play WAV audio bytes through the Discord voice channel."""
        vc = self.session.voice_client
        if not vc or not vc.is_connected():
            return

        # Wait for current audio to finish
        while vc.is_playing():
            await asyncio.sleep(0.1)

        try:
            audio_stream = io.BytesIO(audio_bytes)
            source = discord.FFmpegPCMAudio(audio_stream, pipe=True)
            vc.play(
                source,
                after=lambda e: _log("Playback error: %s", e) if e else None,
            )
            _log("Playing TTS audio (%d bytes)", len(audio_bytes))
        except Exception as e:
            _log("Failed to play audio: %s", e)

    # ── Voice Channel Management ───────────────────────────────────

    async def find_dungeon_channel(self, guild: discord.Guild) -> Optional[discord.VoiceChannel]:
        """Find the Dungeon voice channel in the guild."""
        for channel in guild.voice_channels:
            if channel.name == DUNGEON_CHANNEL_NAME:
                return channel
        return None

    async def join_voice(self, channel: discord.VoiceChannel) -> Optional[discord.VoiceClient]:
        """Join a voice channel."""
        try:
            vc = await channel.connect()
            self.session.voice_client = vc
            self.session.voice_channel_id = channel.id
            _log("Joined voice channel: %s", channel.name)
            return vc
        except Exception as e:
            _log("Failed to join voice: %s", e)
            return None

    async def leave_voice(self) -> None:
        """Leave the current voice channel."""
        vc = self.session.voice_client
        if vc and vc.is_connected():
            await vc.disconnect()
            _log("Left voice channel")
        self.session.voice_client = None
        self.session.voice_channel_id = None

    async def _auto_leave_if_empty(self) -> None:
        """Wait 30s then leave voice + end session if still no humans."""
        await asyncio.sleep(30)

        vc = self.session.voice_client
        if not vc or not vc.is_connected() or not vc.channel:
            return
        humans = [m for m in vc.channel.members if not m.bot]
        if humans:
            return

        _log("Auto-ending session — no humans remaining")
        await self.leave_voice()
        self.session.reset()


# ── Standalone Slash Commands ────────────────────────────────────────


@app_commands.command(name="roll", description="Roll dice (e.g. 2d6+5, 1d20, 4d8 fire)")
@app_commands.describe(expression="Dice expression like 2d6+5, 1d20, 4d8 fire")
async def _roll_cmd(
    interaction: discord.Interaction,
    expression: str,
) -> None:
    try:
        result = roll_dice(expression)
    except Exception as e:
        await interaction.response.send_message(f"Invalid dice expression: `{expression}` ({e})", ephemeral=True)
        return

    total = result["total"]
    rolls = result["rolls"]
    damage_type = result.get("damage_type")
    expr = result["expression"]

    # Emoji based on d20 results
    if "d20" in expr.lower():
        if any(r == 20 for r in rolls):
            emoji = "\U0001f31f"
        elif any(r == 1 for r in rolls):
            emoji = "\U0001f480"
        elif total >= 15:
            emoji = "\U0001f3af"
        else:
            emoji = "\U0001f3b2"
    else:
        emoji = "\U0001f3b2"

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

    # Log to session
    bot = interaction.client
    if isinstance(bot, DMBot) and bot.session.active:
        log_entry = f"{interaction.user.display_name} rolled {expression}: {total} [{rolls_str}]"
        bot.session.add_message("user", log_entry)
        bot.session.combat_log.append(log_entry)


@app_commands.command(name="initiative", description="Start initiative tracking for combat")
async def _initiative_cmd(interaction: discord.Interaction) -> None:
    bot = interaction.client
    if not isinstance(bot, DMBot):
        await interaction.response.send_message("Bot not initialized.", ephemeral=True)
        return

    if not bot.session.active:
        await interaction.response.send_message("No active session. Use `/dm start` first.", ephemeral=True)
        return

    # Reset initiative
    bot.session.initiative_order.clear()
    bot.session.initiative_round = 1

    embed = discord.Embed(
        title="\u2694\ufe0f Roll for Initiative!",
        description=(
            "Combat has begun! Everyone roll initiative!\n\n"
            "Use `/roll 1d20+<modifier>` to roll.\n"
            "**Example:** `/roll 1d20+3`\n\n"
            "BMO will track the order as you roll!"
        ),
        color=discord.Color.red(),
    )
    embed.set_footer(text="Round 1 \u2014 Combat has begun!")
    await interaction.response.send_message(embed=embed)

    # Log
    bot.session.add_message("assistant", "Initiative has been called! Combat begins \u2014 Round 1!")
    bot.session.combat_log.append("--- INITIATIVE CALLED (Round 1) ---")

    # Announce in voice
    await bot._speak("Roll for initiative! Combat has begun!", emotion="excited")

    _log("Initiative started by %s", interaction.user.display_name)


@app_commands.command(name="recap", description="Generate an AI summary of the session so far")
async def _recap_cmd(interaction: discord.Interaction) -> None:
    bot = interaction.client
    if not isinstance(bot, DMBot):
        await interaction.response.send_message("Bot not initialized.", ephemeral=True)
        return

    if not bot.session.active or not bot.session.combat_log:
        await interaction.response.send_message(
            "No active session or nothing to recap yet. Start a session with `/dm start`.",
            ephemeral=True,
        )
        return

    await interaction.response.defer()

    recap_text = await _generate_recap(bot.session)
    if not recap_text:
        await interaction.followup.send("Could not generate a recap at this time.")
        return

    if len(recap_text) > 4000:
        recap_text = recap_text[:3997] + "..."

    embed = discord.Embed(
        title="\U0001f4dc Previously, on our adventure...",
        description=recap_text,
        color=discord.Color.purple(),
    )
    embed.set_footer(text=f"Recap of {len(bot.session.combat_log)} events")
    await interaction.followup.send(embed=embed)


# ── Recap Generation ─────────────────────────────────────────────────

async def _generate_recap(session: DMSession) -> str:
    """Generate an AI summary of the session's combat log."""
    if not session.combat_log:
        return ""

    # Build a condensed log for the AI
    log_text = "\n".join(session.combat_log[-50:])  # last 50 events

    recap_messages = [
        {
            "role": "system",
            "content": (
                "You are BMO, summarizing a D&D session for the players. "
                "Write a vivid, narrative recap in 2-3 paragraphs. "
                "Highlight key moments, combat outcomes, discoveries, and player actions. "
                "Write in past tense, third person. Keep BMO's cute personality. "
                "Keep it under 800 characters."
            ),
        },
        {
            "role": "user",
            "content": f"Summarize this D&D session log:\n\n{log_text}",
        },
    ]

    try:
        recap = await asyncio.to_thread(
            cloud_chat, recap_messages, DM_MODEL, 0.7, 512
        )
        return recap.strip()
    except Exception as e:
        _log("Recap generation error: %s", e)
        return ""


# ── Phase 1: D&D Lookup Commands ─────────────────────────────────────


def _spell_level_str(level: int) -> str:
    """Format spell level for display."""
    if level == 0:
        return "Cantrip"
    suffixes = {1: "st", 2: "nd", 3: "rd"}
    return f"{level}{suffixes.get(level, 'th')} level"


@app_commands.command(name="spell", description="Look up a D&D 5e spell by name")
@app_commands.describe(name="Spell name to look up")
async def _spell_cmd(
    interaction: discord.Interaction,
    name: str,
) -> None:
    bot = interaction.client
    if not isinstance(bot, DMBot):
        await interaction.response.send_message("Bot not initialized.", ephemeral=True)
        return

    if not bot._spells:
        await interaction.response.send_message("Spell data is not loaded.", ephemeral=True)
        return

    spell = _fuzzy_find(name, bot._spells)
    if not spell:
        await interaction.response.send_message(f"No spell found matching **{name}**.", ephemeral=True)
        return

    school = spell.get("school", "Unknown")
    color = SCHOOL_COLORS.get(school.lower(), 0x95A5A6)

    description = spell.get("description", "No description available.")
    if len(description) > 1024:
        description = description[:1021] + "..."

    level = spell.get("level", 0)
    concentration = spell.get("concentration", False)
    ritual = spell.get("ritual", False)

    level_text = _spell_level_str(level)
    if concentration:
        level_text += " (Concentration)"
    if ritual:
        level_text += " (Ritual)"

    embed = discord.Embed(
        title=spell.get("name", name),
        description=description,
        color=color,
    )
    embed.add_field(name="Level", value=level_text, inline=True)
    embed.add_field(name="School", value=school, inline=True)
    embed.add_field(name="Casting Time", value=spell.get("castingTime", "—"), inline=True)
    embed.add_field(name="Range", value=spell.get("range", "—"), inline=True)
    embed.add_field(name="Duration", value=spell.get("duration", "—"), inline=True)
    embed.add_field(name="Components", value=spell.get("components", "—"), inline=True)

    classes = spell.get("classes", [])
    if classes:
        embed.add_field(name="Classes", value=", ".join(c.capitalize() for c in classes), inline=False)

    higher = spell.get("higherLevels")
    if higher:
        if len(higher) > 1024:
            higher = higher[:1021] + "..."
        embed.add_field(name="At Higher Levels", value=higher, inline=False)

    await interaction.response.send_message(embed=embed)


@app_commands.command(name="item", description="Look up a D&D 5e magic item by name")
@app_commands.describe(name="Magic item name to look up")
async def _item_cmd(
    interaction: discord.Interaction,
    name: str,
) -> None:
    bot = interaction.client
    if not isinstance(bot, DMBot):
        await interaction.response.send_message("Bot not initialized.", ephemeral=True)
        return

    if not bot._magic_items:
        await interaction.response.send_message("Magic item data is not loaded.", ephemeral=True)
        return

    item = _fuzzy_find(name, bot._magic_items)
    if not item:
        await interaction.response.send_message(f"No magic item found matching **{name}**.", ephemeral=True)
        return

    rarity = item.get("rarity", "unknown")
    color = RARITY_COLORS.get(rarity.lower(), 0x95A5A6)

    description = item.get("description", "No description available.")
    if len(description) > 1024:
        description = description[:1021] + "..."

    embed = discord.Embed(
        title=item.get("name", name),
        description=description,
        color=color,
    )
    embed.add_field(name="Rarity", value=rarity.capitalize(), inline=True)
    embed.add_field(name="Type", value=item.get("type", "—").capitalize(), inline=True)
    embed.add_field(name="Attunement", value="Yes" if item.get("attunement") else "No", inline=True)

    cost = item.get("cost")
    if cost:
        embed.add_field(name="Cost", value=cost, inline=True)

    await interaction.response.send_message(embed=embed)


@app_commands.command(name="condition", description="Look up a D&D 5e condition")
@app_commands.describe(name="Condition name to look up")
async def _condition_cmd(
    interaction: discord.Interaction,
    name: str,
) -> None:
    bot = interaction.client
    if not isinstance(bot, DMBot):
        await interaction.response.send_message("Bot not initialized.", ephemeral=True)
        return

    if not bot._conditions:
        await interaction.response.send_message("Condition data is not loaded.", ephemeral=True)
        return

    condition = _fuzzy_find(name, bot._conditions)
    if not condition:
        await interaction.response.send_message(f"No condition found matching **{name}**.", ephemeral=True)
        return

    description = condition.get("description", "No description available.")
    if len(description) > 1024:
        description = description[:1021] + "..."

    embed = discord.Embed(
        title=condition.get("name", name),
        description=description,
        color=0xE67E22,
    )
    await interaction.response.send_message(embed=embed)


def _parse_cr_range(cr_range: str) -> tuple[int, int]:
    """Parse a CR range string like '0-4' or '5-10' into (min, max)."""
    parts = cr_range.split("-")
    return int(parts[0]), int(parts[1])


def _roll_loot_dice(dice_expr: str) -> int:
    """Roll a dice expression like '3d6', '2d8x10', '2d4x100' and return the total."""
    multiplier = 1
    expr = dice_expr.lower().strip()

    # Handle multiplier suffix like x10, x100
    if "x" in expr:
        expr_part, mult_part = expr.rsplit("x", 1)
        multiplier = int(mult_part)
        expr = expr_part.strip()

    try:
        result = roll_dice(expr)
        return result["total"] * multiplier
    except Exception:
        return 0


@app_commands.command(name="loot", description="Generate random treasure by CR")
@app_commands.describe(
    cr="Challenge Rating (0-30)",
    loot_type="Treasure type",
)
@app_commands.choices(loot_type=[
    app_commands.Choice(name="Individual", value="individual"),
    app_commands.Choice(name="Hoard", value="hoard"),
])
async def _loot_cmd(
    interaction: discord.Interaction,
    cr: app_commands.Range[int, 0, 30],
    loot_type: str = "individual",
) -> None:
    bot = interaction.client
    if not isinstance(bot, DMBot):
        await interaction.response.send_message("Bot not initialized.", ephemeral=True)
        return

    if not bot._treasure_tables:
        await interaction.response.send_message("Treasure table data is not loaded.", ephemeral=True)
        return

    table = bot._treasure_tables.get(loot_type, [])
    if not table:
        await interaction.response.send_message(f"No treasure table found for type **{loot_type}**.", ephemeral=True)
        return

    # Find the right CR row
    row = None
    for entry in table:
        cr_range = entry.get("crRange", "0-0")
        cr_min, cr_max = _parse_cr_range(cr_range)
        if cr_min <= cr <= cr_max:
            row = entry
            break

    # Fall back to last row for high CRs
    if not row and table:
        row = table[-1]

    if not row:
        await interaction.response.send_message("Could not find a matching treasure table row.", ephemeral=True)
        return

    embed = discord.Embed(
        title=f"{'Hoard' if loot_type == 'hoard' else 'Individual'} Treasure (CR {cr})",
        color=0xF1C40F,
    )

    if loot_type == "individual":
        dice_expr = row.get("amount", "1d6")
        unit = row.get("unit", "gp")
        total = _roll_loot_dice(dice_expr)
        embed.add_field(name="Coins", value=f"**{total}** {unit} (rolled {dice_expr})", inline=False)

    elif loot_type == "hoard":
        # Roll coins
        coin_expr = row.get("coins", "2d4x100")
        coin_unit = row.get("coinsUnit", "gp")
        coin_total = _roll_loot_dice(coin_expr)
        embed.add_field(name="Coins", value=f"**{coin_total}** {coin_unit} (rolled {coin_expr})", inline=False)

        # Roll magic items
        magic_expr = row.get("magicItems", "0")
        magic_count = 0
        if magic_expr and magic_expr != "0":
            magic_count = _roll_loot_dice(magic_expr)
            if magic_count < 0:
                magic_count = 0

        if magic_count > 0 and bot._magic_items:
            rarity_table = bot._treasure_tables.get("magicItemRarities", [])
            items_found = []

            for _ in range(magic_count):
                # Determine rarity via d100
                d100 = random.randint(1, 100)
                rarity = "Common"
                for r in rarity_table:
                    if r.get("d100Min", 0) <= d100 <= r.get("d100Max", 100):
                        rarity = r.get("rarity", "Common")
                        break

                # Pick a random item of that rarity
                matching = [
                    i for i in bot._magic_items
                    if i.get("rarity", "").lower() == rarity.lower()
                ]
                if matching:
                    chosen = random.choice(matching)
                    items_found.append(f"- {chosen.get('name', '???')} ({rarity})")
                else:
                    items_found.append(f"- Random {rarity} item (no data)")

            items_text = "\n".join(items_found[:10])
            if len(items_found) > 10:
                items_text += f"\n... and {len(items_found) - 10} more"
            embed.add_field(
                name=f"Magic Items ({magic_count})",
                value=items_text,
                inline=False,
            )
        else:
            embed.add_field(name="Magic Items", value="None", inline=False)

    embed.set_footer(text=f"CR range: {row.get('crRange', '?')}")
    await interaction.response.send_message(embed=embed)


# ── Phase 2: D&D Generator Commands ─────────────────────────────────


def _generate_npc(random_tables: dict) -> dict:
    """Generate a random NPC with traits."""
    race = random.choice(NPC_RACES)
    name = random.choice(NPC_FIRST_NAMES)
    npc_class = random.choice(NPC_CLASSES)

    traits = random_tables.get("npcTraits", {})
    personality = random.choice(traits.get("personality", ["Friendly"]))
    ideal = random.choice(traits.get("ideals", ["Justice"]))
    bond = random.choice(traits.get("bonds", ["Loyal to friends"]))
    flaw = random.choice(traits.get("flaws", ["Stubborn"]))
    appearance = random.choice(traits.get("appearance", ["Unremarkable"]))

    return {
        "name": name,
        "race": race,
        "class": npc_class,
        "personality": personality,
        "ideal": ideal,
        "bond": bond,
        "flaw": flaw,
        "appearance": appearance,
    }


@app_commands.command(name="npc", description="Generate a random D&D NPC")
async def _npc_cmd(interaction: discord.Interaction) -> None:
    bot = interaction.client
    if not isinstance(bot, DMBot):
        await interaction.response.send_message("Bot not initialized.", ephemeral=True)
        return

    npc = _generate_npc(bot._random_tables)

    embed = discord.Embed(
        title=f"{npc['name']} — {npc['race']} {npc['class']}",
        color=0x3498DB,
    )
    embed.add_field(name="Race", value=npc["race"], inline=True)
    embed.add_field(name="Class", value=npc["class"], inline=True)
    embed.add_field(name="Appearance", value=npc["appearance"], inline=False)
    embed.add_field(name="Personality", value=npc["personality"], inline=True)
    embed.add_field(name="Ideal", value=npc["ideal"], inline=True)
    embed.add_field(name="Bond", value=npc["bond"], inline=False)
    embed.add_field(name="Flaw", value=npc["flaw"], inline=False)
    embed.set_footer(text="Randomly generated NPC")
    await interaction.response.send_message(embed=embed)


@app_commands.command(name="encounter", description="Generate a random encounter for your party")
@app_commands.describe(
    level="Average party level",
    party_size="Number of party members",
    difficulty="Encounter difficulty",
)
@app_commands.choices(difficulty=[
    app_commands.Choice(name="Low", value="low"),
    app_commands.Choice(name="Moderate", value="moderate"),
    app_commands.Choice(name="High", value="high"),
])
async def _encounter_cmd(
    interaction: discord.Interaction,
    level: app_commands.Range[int, 1, 20],
    party_size: app_commands.Range[int, 1, 10],
    difficulty: str = "moderate",
) -> None:
    bot = interaction.client
    if not isinstance(bot, DMBot):
        await interaction.response.send_message("Bot not initialized.", ephemeral=True)
        return

    if not bot._encounter_presets:
        await interaction.response.send_message("Encounter preset data is not loaded.", ephemeral=True)
        return

    # Filter presets by level range and difficulty
    matching = []
    for preset in bot._encounter_presets:
        preset_diff = preset.get("difficulty", "moderate").lower()
        level_range = preset.get("partyLevelRange", "1-20")
        range_min, range_max = _parse_cr_range(level_range)

        if preset_diff == difficulty.lower() and range_min <= level <= range_max:
            matching.append(preset)

    if not matching:
        # Broaden search — any difficulty in level range
        for preset in bot._encounter_presets:
            level_range = preset.get("partyLevelRange", "1-20")
            range_min, range_max = _parse_cr_range(level_range)
            if range_min <= level <= range_max:
                matching.append(preset)

    if not matching:
        await interaction.response.send_message(
            f"No encounters found for level {level}, party size {party_size}, difficulty {difficulty}.",
            ephemeral=True,
        )
        return

    encounter = random.choice(matching)

    # Format monsters
    monsters = encounter.get("monsters", [])
    monster_lines = []
    for m in monsters:
        count = m.get("count", 1)
        monster_id = m.get("id", "unknown").replace("-", " ").title()
        monster_lines.append(f"- {count}x {monster_id}")
    monster_text = "\n".join(monster_lines) if monster_lines else "None specified"

    embed = discord.Embed(
        title=encounter.get("name", "Random Encounter"),
        description=encounter.get("description", "A dangerous encounter!"),
        color=0xE74C3C,
    )
    embed.add_field(name="Difficulty", value=encounter.get("difficulty", difficulty).capitalize(), inline=True)
    embed.add_field(name="Environment", value=encounter.get("environment", "Any").capitalize(), inline=True)
    embed.add_field(name="Party", value=f"{party_size} players, level {level}", inline=True)
    embed.add_field(name="Monsters", value=monster_text, inline=False)

    tactics = encounter.get("tactics")
    if tactics:
        if len(tactics) > 1024:
            tactics = tactics[:1021] + "..."
        embed.add_field(name="Tactics", value=tactics, inline=False)

    treasure = encounter.get("treasureHint")
    if treasure:
        embed.add_field(name="Treasure Hint", value=treasure, inline=False)

    embed.set_footer(text=f"Encounter ID: {encounter.get('id', '?')}")
    await interaction.response.send_message(embed=embed)


@app_commands.command(name="tavern", description="Generate a random tavern with menu and rumors")
async def _tavern_cmd(interaction: discord.Interaction) -> None:
    bot = interaction.client
    if not isinstance(bot, DMBot):
        await interaction.response.send_message("Bot not initialized.", ephemeral=True)
        return

    # Generate tavern name
    adj = random.choice(TAVERN_ADJECTIVES)
    noun = random.choice(TAVERN_NOUNS)
    tavern_name = f"The {adj} {noun}"

    # Generate tavern keeper
    keeper = _generate_npc(bot._random_tables)

    # Pick random menu items
    foods = random.sample(TAVERN_FOODS, min(3, len(TAVERN_FOODS)))
    drinks = random.sample(TAVERN_DRINKS, min(2, len(TAVERN_DRINKS)))
    menu = "\n".join(f"- {item}" for item in foods + drinks)

    # Pick a rumor
    rumor = random.choice(TAVERN_RUMORS)

    embed = discord.Embed(
        title=tavern_name,
        description=f"A cozy establishment run by **{keeper['name']}**, a {keeper['race']} {keeper['class']}.",
        color=0xE67E22,
    )
    embed.add_field(
        name="Tavern Keeper",
        value=f"**{keeper['name']}** — {keeper['race']} {keeper['class']}\n"
              f"*{keeper['personality']}*, *{keeper['appearance']}*",
        inline=False,
    )
    embed.add_field(name="Menu", value=menu, inline=False)
    embed.add_field(name="Overheard Rumor", value=f"*\"{rumor}\"*", inline=False)
    embed.set_footer(text="Randomly generated tavern")
    await interaction.response.send_message(embed=embed)


@app_commands.command(name="monster", description="Look up a D&D monster using BMO's knowledge base")
@app_commands.describe(name="Monster name to look up")
async def _monster_cmd(
    interaction: discord.Interaction,
    name: str,
) -> None:
    bot = interaction.client
    if not isinstance(bot, DMBot):
        await interaction.response.send_message("Bot not initialized.", ephemeral=True)
        return

    if not bot._search_engine:
        await interaction.response.send_message("Monster knowledge base is not loaded.", ephemeral=True)
        return

    try:
        results = bot._search_engine.search(name, domain="dnd", top_k=3)
    except Exception as e:
        _log("Monster search failed: %s", e)
        await interaction.response.send_message(f"Search failed: {e}", ephemeral=True)
        return

    if not results:
        await interaction.response.send_message(f"No results found for **{name}**.", ephemeral=True)
        return

    best = results[0]
    heading = best.get("heading", name)
    content = best.get("content", "No details available.")
    if len(content) > 2048:
        content = content[:2045] + "..."

    embed = discord.Embed(
        title=heading,
        description=content,
        color=0x992D22,
    )

    # Show additional matches if any
    if len(results) > 1:
        other_matches = ", ".join(r.get("heading", "?") for r in results[1:])
        embed.add_field(name="See Also", value=other_matches, inline=False)

    embed.set_footer(text="Source: BMO D&D Knowledge Base")
    await interaction.response.send_message(embed=embed)


# ── Singleton ────────────────────────────────────────────────────────

_bot: Optional[DMBot] = None


def get_dm_bot() -> Optional[DMBot]:
    """Get the running DM bot instance."""
    return _bot


# ── Bot Startup ──────────────────────────────────────────────────────

async def _run_dm_bot() -> None:
    """Internal coroutine that creates and runs the DM bot."""
    global _bot

    if not BOT_TOKEN:
        _log("DISCORD_DM_BOT_TOKEN not set — DM bot will not start")
        return

    _bot = DMBot()

    try:
        await _bot.start(BOT_TOKEN)
    except discord.LoginFailure:
        _log("Invalid Discord bot token — check DISCORD_DM_BOT_TOKEN")
    except Exception as e:
        _log("DM bot crashed: %s", e)
    finally:
        if _bot and not _bot.is_closed():
            await _bot.close()


def start_dm_bot() -> Optional[threading.Thread]:
    """Start the DM bot in a background daemon thread.

    Returns:
        The daemon thread running the bot, or None if token is missing.
    """
    if not BOT_TOKEN:
        _log("DISCORD_DM_BOT_TOKEN not set — skipping DM bot")
        return None

    def _thread_target() -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_run_dm_bot())
        except Exception as e:
            _log("DM bot thread error: %s", e)
        finally:
            loop.close()

    thread = threading.Thread(target=_thread_target, name="dm-bot", daemon=True)
    thread.start()
    _log("DM bot thread started")
    return thread


# ── Main Entry Point ─────────────────────────────────────────────────

if __name__ == "__main__":
    if not BOT_TOKEN:
        print(f"{LOG_PREFIX} ERROR: Set DISCORD_DM_BOT_TOKEN environment variable")
        raise SystemExit(1)

    _log("Starting standalone DM bot (model: %s)", DM_MODEL)
    asyncio.run(_run_dm_bot())
