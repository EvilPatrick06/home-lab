"""BMO Agent — Cloud API AI with local Ollama fallback.

Routes LLM calls to cloud APIs (Gemini Pro, Claude Opus) for high-quality inference.
Falls back to local Ollama (Gemma3:4b) when cloud APIs are unreachable.
"""

import glob
import json
import os
import random
import re
import datetime
import platform
import time

import requests
import ollama as ollama_client

from cloud_providers import cloud_chat, gemini_chat_stream, groq_llm_chat_stream, PRIMARY_MODEL, ROUTER_MODEL, DND_MODEL
from dev_tools import dispatch_tool, get_tool_descriptions, MAX_TOOL_CALLS_PER_TURN
from voice_personality import parse_response_tags

CODE_AGENT_RESUME_FILE = os.path.expanduser("~/bmo/data/code_agent_resume.json")
from agents.settings import init_settings, get_settings

# ── Cloud API Configuration ──────────────────────────────────────────
# Primary AI brain: Cloud APIs (Gemini Pro, Claude Opus, Groq, Fish Audio)
# Local fallback model (runs on Pi's CPU when cloud unavailable)
LOCAL_MODEL = "bmo"

# Track cloud API availability
_cloud_available = None  # None = unknown, True/False = last known state
_cloud_last_check = 0
CLOUD_HEALTH_CHECK_INTERVAL = 60  # seconds between health checks

# Session-level model override — set by UI, read by llm_chat()
# Maps UI names to actual model identifiers
_active_model_override: str | None = None
MODEL_UI_MAP = {
    "flash": ROUTER_MODEL,
    "pro": PRIMARY_MODEL,
    "opus": DND_MODEL,
    "local": "__local__",
}

# ── Platform Detection ────────────────────────────────────────────────
_IS_PI = platform.machine().startswith("aarch64") or platform.machine().startswith("arm")

# Ollama options for LOCAL fallback only (cloud APIs handle primary inference)
if _IS_PI:
    OLLAMA_OPTIONS = {
        "num_ctx": 8192,
        "num_predict": 1024,
        "temperature": 0.8,
    }
    OLLAMA_PLAN_OPTIONS = {
        "num_ctx": 4096,
        "num_predict": 256,
        "temperature": 0.5,
    }
else:
    OLLAMA_OPTIONS = {
        "num_ctx": 32768,
        "num_predict": 2048,
        "temperature": 0.8,
    }
    OLLAMA_PLAN_OPTIONS = {
        "num_ctx": 8192,
        "num_predict": 512,
        "temperature": 0.5,
    }

# Paths BMO has explicit read access to
if platform.system() == "Windows":
    DND_DATA_DIR = os.environ.get("DND_DATA_DIR", r"C:\Users\evilp\dnd\src\renderer\public\data\5e")
else:
    DND_DATA_DIR = os.environ.get("DND_DATA_DIR", "/opt/dnd-project/src/renderer/public/data/5e")


# ── Cloud API Routing ─────────────────────────────────────────────────

def _check_cloud_available() -> bool:
    """Check if cloud APIs are reachable. Caches result."""
    global _cloud_available, _cloud_last_check

    now = time.time()
    if _cloud_available is not None and (now - _cloud_last_check) < CLOUD_HEALTH_CHECK_INTERVAL:
        return _cloud_available

    try:
        # Quick connectivity check via Gemini
        r = requests.get("https://generativelanguage.googleapis.com/", timeout=3)
        _cloud_available = True
    except Exception:
        _cloud_available = False

    _cloud_last_check = now
    if not _cloud_available:
        print("[agent] Cloud APIs unreachable — using local fallback")
    return _cloud_available


def _cloud_chat(messages: list[dict], options: dict | None = None,
                model: str = "") -> str:
    """Call cloud API for LLM inference. Returns response text."""
    model = model or PRIMARY_MODEL
    temperature = (options or {}).get("temperature", 0.8)
    max_tokens = (options or {}).get("num_predict", 2048)
    return cloud_chat(messages, model=model, temperature=temperature,
                      max_tokens=max_tokens)


def _local_chat(messages: list[dict], options: dict | None = None) -> str:
    """Call local Ollama as fallback. Returns response text."""
    response = ollama_client.chat(
        model=LOCAL_MODEL,
        messages=messages,
        options=options or OLLAMA_OPTIONS,
    )
    return response["message"]["content"]


# ── Tiered Model Router ──────────────────────────────────────────────
# Routes agent requests to the right model tier:
#   Flash  — routing, simple commands, timers, weather (cheap & fast)
#   Pro    — general conversation, code, research, planning (balanced)
#   Opus   — D&D DM narration, creative writing, complex reasoning (premium)

# Agents that need premium creative output or reliable tool use → DND_MODEL (Claude Opus)
# Code Agent uses Claude for native tool-use API (fixes "let me check" then stops bug)
_OPUS_AGENTS = frozenset({"dnd_dm", "code"})

# Agents that need solid reasoning → PRIMARY_MODEL (Gemini Pro)
_PRO_AGENTS = frozenset({
    "plan", "research", "review", "design",
    "security", "deploy", "docs", "test", "learning",
})

# Everything else → ROUTER_MODEL (Gemini Flash) — fast and cheap
_FLASH_AGENTS = frozenset({
    "conversation", "music", "smart_home", "timer",
    "calendar", "weather", "monitoring", "cleanup",
})


def _select_model(agent_name: str, messages: list[dict] | None = None) -> str:
    """Pick the best model for this agent's workload."""
    if agent_name in _OPUS_AGENTS:
        return DND_MODEL
    if agent_name in _PRO_AGENTS:
        return PRIMARY_MODEL
    if agent_name in _FLASH_AGENTS:
        return ROUTER_MODEL
    return PRIMARY_MODEL


def get_resolved_model(agent_name: str = "") -> str:
    """Return the model that would be used for the next LLM call."""
    global _active_model_override
    if _active_model_override:
        resolved = MODEL_UI_MAP.get(_active_model_override, _active_model_override)
        return resolved if resolved != "__local__" else PRIMARY_MODEL
    return _select_model(agent_name)


def llm_chat(messages: list[dict], options: dict | None = None,
             model: str = "", agent_name: str = "") -> str:
    """Route LLM call to cloud API, falling back to local Ollama.

    This is the primary entry point for all LLM calls.
    Model selection priority:
      1. _active_model_override (set by UI model picker)
      2. Explicit model param
      3. agent_name triggers tiered routing (DM → Opus, code/plan → Pro, etc.)
      4. Default: PRIMARY_MODEL (Gemini Pro)
    """
    global _active_model_override

    if _active_model_override:
        resolved = MODEL_UI_MAP.get(_active_model_override, _active_model_override)
        if resolved == "__local__":
            return _local_chat(messages, options)
        model = resolved
        print(f"[agent] Using model override: {_active_model_override} -> {model}")
    elif not model:
        model = _select_model(agent_name, messages)

    if _check_cloud_available():
        try:
            return _cloud_chat(messages, options, model=model)
        except Exception as e:
            err_detail = ""
            if hasattr(e, "response") and e.response is not None:
                try:
                    err_detail = e.response.text[:1500] if e.response.text else ""
                except Exception:
                    pass
            if err_detail:
                print(f"[agent] Cloud LLM failed ({e}), falling back to local\n  Response: {err_detail}")
            else:
                print(f"[agent] Cloud LLM failed ({e}), falling back to local")
            global _cloud_available
            _cloud_available = False

    return _local_chat(messages, options)


def llm_chat_stream(messages: list[dict], options: dict | None = None,
                    model: str = "", agent_name: str = ""):
    """Stream LLM response, yielding text chunks. For voice pipeline speedup.

    Supports streaming for Gemini and Groq LLM models.
    Falls back to non-streaming for Claude/Ollama (yields full response as single chunk).
    """
    if not model:
        model = _select_model(agent_name, messages)

    temperature = (options or {}).get("temperature", 0.8)
    max_tokens = (options or {}).get("num_predict", 2048)

    _t_cloud0 = time.time()
    cloud_ok = _check_cloud_available()
    _t_cloud1 = time.time()
    print(f"[timing] _check_cloud_available() took {_t_cloud1 - _t_cloud0:.2f}s (result={cloud_ok})")
    if cloud_ok:
        if model.startswith("gemini"):
            try:
                print(f"[timing] starting gemini_chat_stream with model={model}")
                yield from gemini_chat_stream(messages, model=model,
                                              temperature=temperature,
                                              max_tokens=max_tokens)
                return
            except Exception as e:
                print(f"[agent] Gemini streaming failed ({e}), falling back")
        elif model.startswith("llama") or model.startswith("mixtral") or model.startswith("groq-"):
            try:
                yield from groq_llm_chat_stream(messages, model=model,
                                                 temperature=temperature,
                                                 max_tokens=max_tokens)
                return
            except Exception as e:
                print(f"[agent] Groq LLM streaming failed ({e}), falling back")

    # Non-streamable model or fallback — yield full response
    yield llm_chat(messages, options, model=model, agent_name=agent_name)


_rag_engine = None

def _get_rag_engine():
    """Lazy-load the local RAG search engine."""
    global _rag_engine
    if _rag_engine is None:
        from rag_search import SearchEngine
        _rag_engine = SearchEngine()
        rag_dir = os.path.expanduser("~/bmo/data/rag_data")
        for domain_name in ["dnd", "personal", "projects"]:
            index_path = os.path.join(rag_dir, f"chunk-index-{domain_name}.json")
            if os.path.exists(index_path):
                count = _rag_engine.load_index_file(domain_name, index_path)
                print(f"[agent] RAG: loaded {count} chunks for '{domain_name}'")
    return _rag_engine


def rag_search(query: str, domain: str = "dnd", top_k: int = 5) -> list[dict]:
    """Search RAG knowledge base locally on Pi."""
    try:
        engine = _get_rag_engine()
        return engine.search(query, domain, top_k=top_k)
    except Exception as e:
        print(f"[agent] RAG search failed: {e}")
        return []

# Game state persistence
GAMESTATE_DIR = os.path.expanduser("~/bmo/data")
GAMESTATE_FILE = os.path.join(GAMESTATE_DIR, "dnd_gamestate.json")

# System prompt addition for structured command output
COMMAND_INSTRUCTION = """IMPORTANT: Most messages are just conversation. Only use command blocks when the user EXPLICITLY asks you to DO something (play music, set a timer, check the weather, etc.). Questions, chatting, jokes, and opinions do NOT need command blocks.

When an action IS needed, put it at the END of your response in this exact format:

```command
{"action": "action_name", "params": {...}}
```

Available actions:
- music_play: {"query": "song name"} — Search and play a song
- music_pause: {} — Pause/resume music
- music_next: {} — Skip to next track
- music_previous: {} — Previous track
- music_volume: {"level": 50} — Set volume (0-100)
- music_cast: {"device": "device name"} — Cast to a device
- audio_list_devices: {} — List available audio output devices
- audio_set_output: {"function": "music", "device_name": "HDMI"} — Route a function's audio to a device. Functions: music, voice, effects, notifications, all. If user doesn't specify function, use "all". If device_name not specified, ask user.
- audio_bluetooth_scan: {} — Scan for Bluetooth audio devices
- audio_bluetooth_pair: {"address": "XX:XX:XX:XX:XX:XX"} — Pair and connect a Bluetooth device
- scene_list: {} — List available scene modes
- scene_activate: {"scene": "anime"} — Activate a scene mode. Scenes: anime, bedtime, movie, party. Voice triggers: "anime mode", "bedtime", "movie time", "party mode"
- scene_deactivate: {} — Deactivate current scene and restore previous state. Voice triggers: "normal mode", "stop", "exit mode"
- tv_launch: {"app": "crunchyroll", "device": "Bedroom TV"} — Launch an app on a TV/Chromecast. Apps: youtube, netflix, crunchyroll, disney, hulu, plex, spotify, twitch, prime
- tv_pause: {"device": "Bedroom TV"} — Pause the TV (device optional, defaults to first TV)
- tv_play: {"device": "Bedroom TV"} — Resume the TV (device optional)
- tv_stop: {"device": "Bedroom TV"} — Stop the TV (device optional)
- tv_volume: {"level": 30} — Set TV volume to a specific level (0-100), or use {"direction": "up"} for up/down/mute
- tv_mute: {"device": "Bedroom TV"} — Toggle mute (device optional)
- tv_power: {"state": "on"} — Turn TV on or off (state: "on", "off", or "toggle")
- tv_key: {"key": "home", "device": "Bedroom TV"} — Send remote key. Keys: up, down, left, right, select, back, home, play_pause, rewind, forward
- tv_off: {"device": "Bedroom TV"} — Turn off the TV (device optional)
- device_list: {} — List available smart devices
- calendar_today: {} — Show today's events
- calendar_week: {} — Show this week's events
- calendar_create: {"summary": "Event name", "date": "2026-02-23", "time": "14:00", "duration_hours": 1}
- calendar_update: {"summary": "Event name", "new_summary": "...", "new_date": "...", "new_time": "...", "new_duration_hours": ...} — Update an existing event. Only include fields to change.
- calendar_delete: {"summary": "Event name"} — Delete an event by name
- timer_set: {"minutes": 10, "seconds": 0, "label": "Pizza"} — Set a countdown timer (minutes and/or seconds)
- timer_pause: {"label": "Pizza"} — Pause or resume a timer
- timer_cancel: {"label": "Pizza"} — Cancel a timer
- timer_list: {} — List all active timers and alarms. Use when user asks "what timers do I have", "what alarms are set", "any timers running", "show my alarms", etc.
- alarm_set: {"hour": 7, "minute": 30, "label": "Wake up", "tag": "reminder"} — Set an alarm (tags: "wake-up" for morning routine, "reminder" for spoken reminder, "timer" for beep)
- alarm_set: {"hour": 7, "minute": 30, "label": "Wake up", "repeat": "weekdays", "tag": "wake-up"} — Repeating alarm (repeat: none/daily/weekdays/weekends/custom, repeat_days: ["mon","wed","fri"] for custom)
  Infer the tag from context: if the user says "morning alarm", "wake up alarm", "wake me up", or similar → use tag "wake-up". If they say "remind me" → use "reminder". Default to "reminder" if unclear.
- alarm_update: {"label": "Wake up", "hour": 8, "minute": 0} — Modify an existing alarm (find by label, change any fields: hour, minute, repeat, repeat_days, tag, label). Use this when user says "change my alarm to 8 AM" instead of cancel+recreate.
- alarm_cancel: {"label": "Wake up"} — Cancel an alarm
- alarm_snooze: {"label": "Wake up", "minutes": 5} — Snooze a fired alarm
- camera_snapshot: {} — Take a photo
- camera_describe: {"prompt": "What do you see?"} — Describe what the camera sees
- camera_motion: {"enabled": true} — Toggle motion detection
- weather: {} — Get current weather
- identify_face: {} — Identify who's in front of the camera
- identify_voice: {} — Identify who's speaking
- enroll_voice: {"name": "Gavin", "duration": 5} — REQUIRED when someone says "learn my voice", "remember my voice", "enroll my voice", or introduces themselves wanting voice recognition. This records audio from the mic and saves a voiceprint. You MUST emit this command block — without it, no recording happens. Tell the user to keep talking while you record.
- read_file: {"path": "monsters/goblin.json"} — Read a file from the D&D 5e data directory
- list_dir: {"path": "monsters"} — List files in a D&D 5e data subdirectory
- bmo_status: {} — Check BMO's own status: service health, Pi stats, internet, Docker. Use when user asks "what's your status?", "how are you?", "are you ok?", "is everything running?", "is the internet up?", "any issues?"

NEVER describe or mention command blocks in your conversational response. The user cannot see them. Just talk normally as BMO, and silently append the command block at the end only when needed.
"""

# Dev tool calling instruction — appended when coding assistant mode is active
DEV_TOOL_INSTRUCTION = """
You also have access to coding/dev tools. When the user asks you to help with code,
debug something, read files, search the web, run commands, or do any dev work, use
tool_call blocks to invoke tools. You can chain multiple tool calls in one response.

Format:
```tool_call
{"tool": "tool_name", "args": {"param1": "value1"}}
```

{tool_list}

When you receive tool results, analyze them and either make more tool calls or
respond with your findings. You can make up to {max_calls} tool calls per turn.

For destructive operations (delete, overwrite, push), the tool will return
a confirmation request. Tell the user what you want to do and wait for approval.
"""


# ── Map Environmental Effects ────────────────────────────────────────
MAP_ENVIRONMENTS = {
    "barrow-crypt": {
        "name": "Barrow Crypt",
        "hazards": [
            "Haunted Whispers: At initiative count 20, creatures within 30ft of sarcophagi make WIS save DC 12 or become frightened until end of next turn.",
            "Crumbling Floor: Squares marked as unstable require DEX save DC 13 or creature falls 10ft (1d6 bludgeoning) into lower crypt.",
            "Dim Light: Beyond 20ft from torches, all areas are dim light (disadvantage on Perception checks relying on sight).",
        ],
        "atmosphere": "cold, damp stone corridors with faint green phosphorescence on the walls",
    },
    "volcanic-caves": {
        "name": "Volcanic Caves",
        "hazards": [
            "Lava Pools: Creatures entering or starting turn in lava take 2d10 fire damage. Adjacent squares: 1d10 fire damage.",
            "Toxic Fumes: At initiative count 20, all creatures make CON save DC 12 or become poisoned until end of next turn.",
            "Unstable Ground: After loud impacts (Thunder damage, explosions), DEX save DC 14 or knocked prone by tremor.",
        ],
        "atmosphere": "oppressive heat, rivers of molten rock casting orange light, sulfurous air",
    },
    "ship": {
        "name": "Ship",
        "hazards": [
            "Rocking Deck: At initiative count 20, all creatures on deck make DEX save DC 10 or fall prone from a wave.",
            "Rigging: Creatures can climb rigging (Athletics DC 12) to gain high ground (+2 ranged attacks from crow's nest).",
            "Overboard: Creatures pushed off the ship's edge fall into the sea. Swimming requires Athletics DC 12 each turn or be swept 15ft away.",
        ],
        "atmosphere": "creaking timbers, salt spray, the snap of canvas sails in a brisk wind",
    },
    "underdark-warren": {
        "name": "Underdark Warren",
        "hazards": [
            "Total Darkness: No natural light. Creatures without darkvision are blinded. Torches draw attention (encounters within 1d4 rounds).",
            "Fungi Spores: Certain patches release spores when disturbed. CON save DC 13 or poisoned for 1 minute.",
            "Narrow Tunnels: Some passages are 5ft wide — no room to pass, disadvantage on attack rolls with heavy weapons.",
        ],
        "atmosphere": "oppressive silence broken by dripping water, bioluminescent fungi casting eerie purple light",
    },
    "dragons-lair": {
        "name": "Dragon's Lair",
        "hazards": [
            "Lair Actions (Initiative 20): Tremor — all creatures make DEX save DC 15 or fall prone. OR magma eruption — 10ft radius, 2d6 fire damage (DEX save DC 15 half).",
            "Hoard Avalanche: If combat occurs near the treasure hoard, loud impacts cause gold to cascade — DEX save DC 12 or buried (restrained, 5ft dig to free).",
            "Extreme Heat: Creatures without fire resistance that end their turn within 10ft of magma vents take 1d6 fire damage.",
        ],
        "atmosphere": "immense cavern with pillars of volcanic rock, a glittering hoard of gold and gems, the acrid smell of brimstone",
    },
    "dungeon-hideout": {
        "name": "Dungeon Hideout",
        "hazards": [
            "Trapped Hallways: Investigation DC 14 to spot tripwires. Failure triggers crossbow bolt (1d8+2 piercing, +6 to hit) or pit trap (2d6 falling).",
            "Barricades: Bandits have overturned tables and crates for half cover (+2 AC, +2 DEX saves).",
            "Dim Torchlight: Torches every 30ft. Between them, dim light. Alcoves are in darkness (good for hiding).",
        ],
        "atmosphere": "rough-hewn stone walls, the smell of stale beer and sweat, scattered playing cards and stolen goods",
    },
    "farmstead": {
        "name": "Farmstead",
        "hazards": [
            "Haystacks: Provide full cover but are flammable. Any fire damage ignites them (1d6 fire damage to adjacent creatures each turn).",
            "Livestock Panic: If combat starts near the barn, panicking animals burst out. DEX save DC 11 or take 1d6 bludgeoning and be pushed 10ft.",
            "Muddy Ground: After rain, open ground is difficult terrain. Prone creatures require Athletics DC 10 to stand.",
        ],
        "atmosphere": "rolling fields of golden wheat, a weathered red barn, the sound of chickens and a distant cowbell",
    },
    "crossroads-village": {
        "name": "Crossroads Village",
        "hazards": [
            "Civilians: 2d6 commoners are present. They flee in random directions, providing half cover but also getting in the way.",
            "Market Stalls: Provide half cover. Can be toppled (Athletics DC 12) to create difficult terrain in a 10ft area.",
            "Buildings: Doors can be barred (Athletics DC 15 to force). Second-story windows give advantage on ranged attacks against targets below.",
        ],
        "atmosphere": "a bustling crossroads with a stone well at the center, market stalls, half-timbered buildings, and a weathered signpost",
    },
    "roadside-inn": {
        "name": "Roadside Inn",
        "hazards": [
            "Tavern Furniture: Tables provide half cover. Chairs can be thrown (improvised weapon, 1d4 bludgeoning, range 20/60).",
            "Chandelier: Can be cut down (AC 11, 5 HP). Falls on 10ft area — DEX save DC 12 or 2d6 bludgeoning + prone. Then oil fire (1d6 fire/turn).",
            "Cramped Quarters: Upstairs hallway is 5ft wide. No room for large creatures. Disadvantage on two-handed weapon attacks.",
        ],
        "atmosphere": "warm firelight, the smell of roasting meat and ale, wooden beams hung with dried herbs",
    },
    "spooky-house": {
        "name": "Spooky House",
        "hazards": [
            "Haunted Objects: At initiative count 20, one random object (chair, portrait, candlestick) animates and attacks nearest creature: +4 to hit, 1d6 bludgeoning.",
            "Rotting Floors: Certain squares give way under weight >100lbs. DEX save DC 13 or fall 10ft to basement (1d6 bludgeoning).",
            "Choking Dust: Disturbing old rooms fills the air with dust. Creatures in the area make CON save DC 11 or are blinded until end of next turn.",
        ],
        "atmosphere": "creaking floorboards, cobwebs in every corner, portraits whose eyes seem to follow you, a persistent cold draft",
    },
    "keep": {
        "name": "Keep",
        "hazards": [
            "Arrow Slits: Defenders behind arrow slits have three-quarters cover (+5 AC, +5 DEX saves) and can attack with ranged weapons.",
            "Murder Holes: Above the gatehouse, defenders can pour boiling oil. 10ft area, 2d6 fire damage, DEX save DC 13 half.",
            "Battlements: Creatures atop the walls can push enemies off (Athletics contest). Fall is 20ft (2d6 bludgeoning).",
        ],
        "atmosphere": "grey stone walls topped with crenellations, a heavy portcullis, banners snapping in the wind",
    },
    "manor": {
        "name": "Manor",
        "hazards": [
            "Grand Staircase: Creatures pushed down the stairs take 1d6 bludgeoning per 10ft and land prone at the bottom.",
            "Glass Windows: Can be shattered (AC 13, 3 HP) for an escape route. Creatures passing through take 1d4 slashing.",
            "Servants' Passages: Hidden doors (Investigation DC 15) lead to narrow passages connecting rooms — useful for flanking.",
        ],
        "atmosphere": "polished marble floors, crystal chandeliers, portraits of stern nobles, the faint scent of lavender",
    },
    "mine": {
        "name": "Mine",
        "hazards": [
            "Cave-In Risk: Thunder damage or loud explosions trigger CON save DC 14 or 2d8 bludgeoning from falling rocks in 15ft radius.",
            "Mine Cart Tracks: Carts can be pushed (Athletics DC 12) at targets. +4 to hit, 2d6 bludgeoning, and target is pushed 10ft.",
            "Flooded Lower Level: Water is 3ft deep (difficult terrain). Creatures knocked prone must hold breath or begin drowning.",
        ],
        "atmosphere": "rough-cut tunnels shored up with rotting timbers, the glint of ore in the walls, the echo of dripping water",
    },
    "caravan-encampment": {
        "name": "Caravan Encampment",
        "hazards": [
            "Wagon Circle: Wagons provide full cover. Can be climbed (Athletics DC 10) for elevation advantage.",
            "Campfire: 5ft area deals 1d6 fire damage to creatures entering or starting turn in it. Can be kicked to scatter embers in 10ft.",
            "Draft Animals: Horses and oxen panic in combat. At initiative count 20, they bolt in a random direction. DEX save DC 11 or 1d6 bludgeoning.",
        ],
        "atmosphere": "circled wagons around a crackling fire, the smell of trail rations, canvas tents flapping in the night breeze",
    },
    "wizards-tower": {
        "name": "Wizard's Tower",
        "hazards": [
            "Wild Magic Zone: When a spell of 1st level or higher is cast, roll d20. On a 1, a random Wild Magic Surge occurs.",
            "Animated Books: At initiative count 20, books fly off shelves and swarm one creature. WIS save DC 13 or blinded until end of next turn.",
            "Arcane Wards: Certain doorways have glyphs. First creature to pass through takes 2d6 force damage (INT save DC 14 half). Investigation DC 14 to spot.",
        ],
        "atmosphere": "spiraling stone staircase, shelves overflowing with tomes and scrolls, alchemical equipment bubbling, an astrolabe spinning on its own",
    },
}


def _summarize_character(data: dict) -> str:
    """Build a concise character summary string from a .dndchar JSON file."""
    name = data.get("name", "Unknown")
    species = data.get("species", "Unknown")
    classes = data.get("classes", [])
    class_str = ", ".join(f"{c['name']} {c['level']}" for c in classes) if classes else "Unknown"
    level = data.get("level", 1)
    background = data.get("background", "Unknown")
    alignment = data.get("alignment", "Unknown")
    hp = data.get("hitPoints", {})
    ac = data.get("armorClass", 10)
    speed = data.get("speed", 30)
    size = data.get("size", "Medium")
    abilities = data.get("abilityScores", {})
    details = data.get("details", {})
    proficiencies = data.get("proficiencies", {})
    features = data.get("features", [])
    weapons = data.get("weapons", [])
    equipment = data.get("equipment", [])
    spellcasting = data.get("spellcasting", {})
    known_spells = data.get("knownSpells", [])
    senses = data.get("senses", [])
    resistances = data.get("resistances", [])
    skills = data.get("skills", [])

    # Ability scores
    ab_str = ", ".join(f"{k[:3].upper()} {v}" for k, v in abilities.items())

    # Proficient skills
    prof_skills = [s["name"] + (" (expertise)" if s.get("expertise") else "")
                   for s in skills if s.get("proficient")]

    # Weapons
    wep_str = "; ".join(f"{w['name']} ({w['damage']} {w['damageType']})" for w in weapons)

    # Equipment (just names)
    equip_names = [f"{e['name']} x{e.get('quantity',1)}" for e in equipment[:15]]

    # Features
    feat_str = "; ".join(f"{f['name']}: {f['description'][:80]}" for f in features)

    # Spells
    spell_str = ""
    if known_spells:
        cantrips = [s["name"] for s in known_spells if s.get("level", 0) == 0]
        leveled = [f"{s['name']} (lvl {s['level']})" for s in known_spells if s.get("level", 0) > 0]
        slot_info = data.get("spellSlotLevels", {})
        parts = []
        if cantrips:
            parts.append(f"Cantrips: {', '.join(cantrips)}")
        if leveled:
            parts.append(f"Spells: {', '.join(leveled)}")
        if slot_info:
            slots = ", ".join(f"Lvl {k}: {v['max']}" for k, v in slot_info.items())
            parts.append(f"Slots: {slots}")
        if spellcasting:
            parts.append(f"Save DC {spellcasting.get('spellSaveDC', '?')}, Attack +{spellcasting.get('spellAttackBonus', '?')}")
        spell_str = " | ".join(parts)

    lines = [
        f"## {name}",
        f"{species} {class_str} (Level {level}), {background}, {alignment}",
        f"HP: {hp.get('maximum', '?')}, AC: {ac}, Speed: {speed} ft, Size: {size}",
        f"Abilities: {ab_str}",
        f"Proficient Skills: {', '.join(prof_skills) if prof_skills else 'None'}",
        f"Saves: {', '.join(proficiencies.get('savingThrows', []))}",
        f"Languages: {', '.join(proficiencies.get('languages', []))}",
        f"Weapons: {wep_str}" if wep_str else "",
        f"Equipment: {', '.join(equip_names)}" if equip_names else "",
        f"Features: {feat_str}" if feat_str else "",
        f"Spellcasting: {spell_str}" if spell_str else "",
        f"Senses: {', '.join(senses)}" if senses else "",
        f"Resistances: {', '.join(resistances)}" if resistances else "",
        f"Personality: {details.get('personality', 'N/A')}",
        f"Ideals: {details.get('ideals', 'N/A')}",
        f"Bonds: {details.get('bonds', 'N/A')}",
        f"Flaws: {details.get('flaws', 'N/A')}",
        f"Appearance: {details.get('appearance', 'N/A')}",
    ]
    return "\n".join(line for line in lines if line)


def _load_character_file(path: str) -> dict | None:
    """Load a .dndchar JSON file, returning None on failure."""
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[agent] Failed to load character file {path}: {e}")
        return None


def _discover_maps(maps_dir: str) -> list[str]:
    """Return list of map filenames (without extension) from the maps directory."""
    maps = []
    if os.path.isdir(maps_dir):
        for f in sorted(os.listdir(maps_dir)):
            if f.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
                maps.append(os.path.splitext(f)[0])
    return maps


def _parse_cr(cr) -> float:
    """Parse a CR value that might be a string like '1/4'."""
    if isinstance(cr, (int, float)):
        return float(cr)
    if isinstance(cr, str):
        if "/" in cr:
            n, d = cr.split("/")
            return float(n) / float(d)
        try:
            return float(cr)
        except ValueError:
            return 99.0
    return 99.0


def _build_dm_data_context(party_level: int) -> str:
    """Build a LIGHTWEIGHT data context — just monster names/CR and directory listing.
    Full stat blocks and NPC tables are loaded on demand when needed.
    """
    sections = []
    max_cr = party_level + 2

    # ── Monster Index (names + CR only — lightweight) ─────────────
    monsters_file = os.path.join(DND_DATA_DIR, "creatures", "monsters.json")
    try:
        with open(monsters_file, encoding="utf-8") as f:
            all_monsters = json.load(f)
        usable = [m for m in all_monsters if _parse_cr(m.get("cr", 99)) <= max_cr]
        usable.sort(key=lambda m: (_parse_cr(m.get("cr", 0)), m["name"]))
        lines = [f"  CR {m['cr']}: {m['name']} ({m['type']})" for m in usable]
        sections.append(
            f"# MONSTER INDEX (CR 0–{max_cr}, {len(usable)} creatures)\n"
            f"These are available monsters by name and CR. When you decide to use a monster in combat,\n"
            f"use the read_file command to load its full stat block:\n"
            f'  read_file {{"path": "creatures/monsters.json"}} — then find the monster by name\n'
            + "\n".join(lines)
        )
    except Exception as e:
        print(f"[agent] Failed to load monster index: {e}")

    # ── Available Data Directories ────────────────────────────────
    try:
        dirs = sorted(os.listdir(DND_DATA_DIR))
        dir_listing = ", ".join(dirs)
        sections.append(
            f"# D&D DATA FILES\n"
            f"Root: {DND_DATA_DIR}\n"
            f"Subdirectories: {dir_listing}\n\n"
            f"Use these commands to load data ON DEMAND (do NOT preload everything):\n"
            f"- read_file: {{\"path\": \"npc/npc-names.json\"}} — Load NPC name tables when introducing a random NPC\n"
            f"- read_file: {{\"path\": \"npc/npc-appearance.json\"}} — Load appearance tables for random NPCs\n"
            f"- read_file: {{\"path\": \"npc/personality-tables.json\"}} — Load personality traits\n"
            f"- read_file: {{\"path\": \"encounters/encounter-presets.json\"}} — Load encounter templates\n"
            f"- read_file: {{\"path\": \"adventures/adventures.json\"}} — Load adventure hooks for story ideas\n"
            f"- list_dir: {{\"path\": \"subdir\"}} — Browse any subdirectory\n\n"
            f"KEY STORY NPCs: Craft these yourself with unique names, personalities, and motivations.\n"
            f"RANDOM/MINOR NPCs (shopkeepers, guards, tavern patrons): Use the NPC tables from the data files."
        )
    except Exception:
        pass

    return "\n\n".join(sections)


def _calculate_encounter_difficulty(party_size: int, party_level: int, monsters: list[tuple[str, int]]) -> str:
    """Calculate encounter difficulty using DMG XP budgets.

    Args:
        party_size: Number of player characters
        party_level: Average party level
        monsters: List of (monster_name, count) tuples

    Returns:
        String with difficulty rating and XP breakdown
    """
    # Load encounter budgets
    budgets_file = os.path.join(DND_DATA_DIR, "encounters", "encounter-budgets.json")
    try:
        with open(budgets_file, encoding="utf-8") as f:
            budgets_data = json.load(f)
    except Exception:
        return "Could not load encounter budgets."

    # Find budget for this level
    per_char = None
    for entry in budgets_data.get("perCharacterBudget", []):
        if entry["level"] == party_level:
            per_char = entry
            break
    if not per_char:
        # Clamp to nearest
        per_char = budgets_data["perCharacterBudget"][-1] if party_level > 20 else budgets_data["perCharacterBudget"][0]

    low_budget = per_char["low"] * party_size
    mod_budget = per_char["moderate"] * party_size
    high_budget = per_char["high"] * party_size

    # Load monster data for XP values
    monsters_file = os.path.join(DND_DATA_DIR, "creatures", "monsters.json")
    try:
        with open(monsters_file, encoding="utf-8") as f:
            all_monsters = json.load(f)
    except Exception:
        return "Could not load monster data."

    monster_lookup = {m["name"].lower(): m for m in all_monsters}

    total_xp = 0
    breakdown = []
    for name, count in monsters:
        m = monster_lookup.get(name.lower())
        if m:
            xp = m.get("xp", 0) * count
            total_xp += xp
            breakdown.append(f"{name} x{count} = {xp} XP")
        else:
            breakdown.append(f"{name} x{count} = ?? XP (not found)")

    # Determine difficulty
    if total_xp <= low_budget:
        difficulty = "Low"
    elif total_xp <= mod_budget:
        difficulty = "Moderate"
    elif total_xp <= high_budget:
        difficulty = "High"
    else:
        difficulty = "Overwhelming"

    warning = ""
    if difficulty == "Overwhelming":
        warning = "\nWARNING: This encounter is Overwhelming for the party. Consider reducing monsters or providing an escape route."

    return (
        f"Encounter Difficulty: {difficulty}\n"
        f"Total XP: {total_xp}\n"
        f"Party Budget (Lvl {party_level}, {party_size} chars): Low {low_budget} / Moderate {mod_budget} / High {high_budget}\n"
        f"Monsters: {', '.join(breakdown)}"
        f"{warning}"
    )


def _load_monster_stat_block(monster_name: str) -> str | None:
    """Load the full stat block for a specific monster by name."""
    monsters_file = os.path.join(DND_DATA_DIR, "creatures", "monsters.json")
    try:
        with open(monsters_file, encoding="utf-8") as f:
            all_monsters = json.load(f)
        for m in all_monsters:
            if m["name"].lower() == monster_name.lower():
                return json.dumps(m, indent=2)
    except Exception:
        pass
    return None


class BmoAgent:
    """Manages conversations with the BMO Ollama model and parses action commands.

    Delegates to the multi-agent orchestrator for routing to specialized agents.
    Keeps shared infrastructure: llm_chat, rag_search, history, command parsing.
    """

    def __init__(self, services: dict = None, socketio=None):
        self.services = services or {}
        self.socketio = socketio
        self.conversation_history: list[dict] = []
        self._pending_confirmations: list[dict] = []  # Destructive ops awaiting user OK
        self._model_override = None  # Session-level model override (Phase 7)

        # Initialize hierarchical settings system
        self.settings = init_settings()
        self._apply_settings_globals()
        self._max_history = self.settings.get("ui.max_history", 200)

        # Start file watcher for hot reload
        self.settings.on_change(self._apply_settings_globals)
        self.settings.start_watching()

        # Initialize the multi-agent orchestrator
        from agents.orchestrator import AgentOrchestrator
        from agents.scratchpad import SharedScratchpad
        from agents.conversation import create_conversation_agent
        from agents.code_agent import create_code_agent
        from agents.dnd_dm import create_dnd_dm_agent
        from agents.plan_agent import create_plan_agent
        from agents.research_agent import create_research_agent

        self.orchestrator = AgentOrchestrator(
            services=self.services,
            socketio=self.socketio,
            llm_func=llm_chat,
            settings=self.settings,
        )

        # Create and register core agents
        scratchpad = self.orchestrator.scratchpad
        core_agents = [
            create_conversation_agent(scratchpad, self.services, self.socketio),
            create_code_agent(scratchpad, self.services, self.socketio),
            create_dnd_dm_agent(scratchpad, self.services, self.socketio),
            create_plan_agent(scratchpad, self.services, self.socketio),
            create_research_agent(scratchpad, self.services, self.socketio),
        ]
        self.orchestrator.register_agents(core_agents)

        # Try to register all remaining specialized agents
        try:
            from agents._registry import create_all_agents
            extra_agents = create_all_agents(scratchpad, self.services, self.socketio)
            self.orchestrator.register_agents(extra_agents)
        except ImportError:
            pass  # Remaining agents not yet implemented

        # Initialize MCP manager if servers are configured
        self._init_mcp()

        # Register MCP reload callback for hot-reload
        self.settings.on_change(self._reload_mcp_servers)

    def _init_mcp(self) -> None:
        """Initialize MCP manager if any servers are configured."""
        servers = self.settings.get("mcp.servers", {})
        if servers:
            try:
                from agents.mcp_manager import McpManager
                manager = McpManager(self.settings)
                manager.initialize()
                self.orchestrator.mcp_manager = manager
                status = manager.get_status()
                print(f"[mcp] Initialized: {status['connected']}/{status['total']} servers, {status['total_tools']} tools")
            except Exception as e:
                print(f"[mcp] Failed to initialize: {e}")

    def _reload_mcp_servers(self) -> None:
        """Reload MCP server connections when settings change."""
        servers = self.settings.get("mcp.servers", {})
        manager = self.orchestrator.mcp_manager

        if not servers and manager:
            # All servers removed — shut down
            manager.shutdown()
            self.orchestrator.mcp_manager = None
            print("[mcp] All servers removed")
        elif servers and not manager:
            # Servers added — initialize
            self._init_mcp()
        elif servers and manager:
            # Servers changed — reconcile
            current = set(manager._clients.keys())
            desired = set(servers.keys())

            # Remove deleted servers
            for name in current - desired:
                manager.remove_server(name)
                print(f"[mcp] Removed server: {name}")

            # Add new / update existing servers
            for name in desired:
                if name not in current:
                    manager.add_server(name, servers[name])
                    print(f"[mcp] Added server: {name}")

    # ── Settings ─────────────────────────────────────────────────────

    def _apply_settings_globals(self) -> None:
        """Apply LLM-related settings to module-level globals."""
        global LOCAL_MODEL
        global OLLAMA_OPTIONS, OLLAMA_PLAN_OPTIONS

        s = self.settings
        LOCAL_MODEL = s.get("llm.local_model", LOCAL_MODEL)
        OLLAMA_OPTIONS = s.get("llm.ollama_options", OLLAMA_OPTIONS)
        OLLAMA_PLAN_OPTIONS = s.get("llm.ollama_plan_options", OLLAMA_PLAN_OPTIONS)

        # Update max_history if changed
        self._max_history = s.get("ui.max_history", 200)

    # ── Model Override (Phase 7) ─────────────────────────────────────

    @property
    def model_override(self):
        return self._model_override

    @model_override.setter
    def model_override(self, value):
        global _active_model_override
        self._model_override = value
        _active_model_override = value

    # ── Context Compression ──────────────────────────────────────────

    def compact(self) -> str:
        """Summarize conversation history to reclaim context.

        Keeps the most recent messages verbatim and replaces older ones
        with an LLM-generated summary.
        """
        preserve_last = self.settings.get("ui.compact_preserve_last", 5)

        if len(self.conversation_history) <= preserve_last + 1:
            return "Nothing to compact — history is already short."

        # Split: old messages to summarize, recent to keep verbatim
        to_summarize = self.conversation_history[:-preserve_last]
        to_keep = self.conversation_history[-preserve_last:]

        # Ask LLM to summarize
        summary_prompt = [
            {"role": "system", "content": (
                "Summarize this conversation concisely. Capture key decisions, "
                "important context, and any ongoing tasks. Keep it to 2-3 paragraphs."
            )},
            *to_summarize,
            {"role": "user", "content": "Summarize the above conversation."},
        ]
        summary = llm_chat(summary_prompt, OLLAMA_PLAN_OPTIONS)

        # Replace history
        old_count = len(to_summarize)
        self.conversation_history = [
            {"role": "system", "content": f"[Conversation Summary]\n{summary}"},
            *to_keep,
        ]

        return f"Compacted {old_count} messages into summary. Kept last {preserve_last}."

    # ── Chat ─────────────────────────────────────────────────────────

    def chat(self, user_message: str, speaker: str = "unknown", agent_override: str | None = None) -> dict:
        """Send a message to BMO and get a response.

        Delegates to the multi-agent orchestrator for routing, then handles
        command parsing, tag extraction, and history management.
        If agent_override is set (from UI), bypasses the router and uses that agent directly.

        Returns {text, commands_executed, tags} where tags contains parsed
        hardware control tags (face, led, sound, emotion, music, npc).
        """
        # Handle pending destructive confirmations (from code agent)
        if self._pending_confirmations and user_message.lower().strip() in ("yes", "y", "confirm", "do it"):
            return self._execute_pending_confirmation(speaker)

        # Check for post-restart resume (user sent message before auto-resume ran)
        resume_context = self._read_and_clear_resume()
        if resume_context:
            user_message = (
                f"[Post-restart] BMO just came back up. You restarted to apply changes. "
                f"Context: {resume_context[:300]}. Confirm the restart completed and briefly summarize. "
                f"User's message: {user_message}"
            )

        # Add time and speaker context
        now = datetime.datetime.now()
        time_str = now.strftime("%I:%M %p, %A %B %d %Y")
        if speaker != "unknown":
            context_msg = f"[Time: {time_str}] [Speaker: {speaker}] {user_message}"
        else:
            context_msg = f"[Time: {time_str}] {user_message}"

        self.conversation_history.append({"role": "user", "content": context_msg})

        # Trim history
        if len(self.conversation_history) > self._max_history:
            self.conversation_history = self.conversation_history[-self._max_history:]

        # Auto-compact if threshold reached
        threshold = self.settings.get("ui.auto_compact_threshold", 150)
        if threshold > 0 and len(self.conversation_history) >= threshold:
            compact_msg = self.compact()
            print(f"[agent] Auto-compact: {compact_msg}")

        try:
            # Route to the best agent via orchestrator
            result = self.orchestrator.handle(
                message=user_message,
                speaker=speaker,
                history=self.conversation_history,
                services=self.services,
                agent_override=agent_override,
            )
            reply = result.get("text", "")
            agent_used = result.get("agent_used", "conversation")
            self._pending_confirmations = result.get("pending_confirmations", [])
        except Exception as e:
            reply = f"Oh no! BMO's brain is fuzzy right now... ({e})"
            agent_used = "error"

        self.conversation_history.append({"role": "assistant", "content": f"[{agent_used}] {reply}"})

        # Parse and execute BMO command blocks (music, tv, calendar, etc.)
        text, commands = self._parse_response(reply)
        if commands:
            print(f"[agent] Commands found: {[c.get('action') for c in commands]}")
        results = []
        for cmd in commands:
            cmd_result = self._execute_command(cmd)
            print(f"[agent] {cmd.get('action')}: {'OK' if cmd_result.get('success') else cmd_result.get('error', 'failed')}")
            results.append(cmd_result)

        # Append informational command results to the spoken text
        INFORMATIONAL_ACTIONS = {"timer_list", "calendar_today", "calendar_week", "weather", "device_list", "bmo_status", "led_get_state"}
        for r in results:
            if r.get("success") and r.get("action") in INFORMATIONAL_ACTIONS and r.get("result"):
                text = f"{text}\n{r['result']}" if text.strip() else r["result"]

        # Parse response tags for hardware control ([FACE:x], [LED:x], etc.)
        tags = parse_response_tags(text)
        text = tags.pop("clean_text", text)

        return {
            "text": text,
            "speaker": speaker,
            "commands_executed": results,
            "tags": tags,
            "agent_used": agent_used,
        }

    # ── Streaming Chat (for voice pipeline speed) ──────────────────

    def chat_stream(self, user_message: str, speaker: str = "unknown"):
        """Generator yielding text chunks for voice pipeline streaming.

        For conversation agent, streams from the LLM token by token.
        For other agents, yields full response as a single chunk.
        Handles history management, command parsing, and execution.
        """
        # Handle pending confirmations (non-streamable)
        if self._pending_confirmations and user_message.lower().strip() in (
            "yes", "y", "confirm", "do it"
        ):
            result = self._execute_pending_confirmation(speaker)
            yield result.get("text", "")
            return

        # Add time and speaker context (same as chat())
        now = datetime.datetime.now()
        time_str = now.strftime("%I:%M %p, %A %B %d %Y")
        if speaker != "unknown":
            context_msg = f"[Time: {time_str}] [Speaker: {speaker}] {user_message}"
        else:
            context_msg = f"[Time: {time_str}] {user_message}"

        self.conversation_history.append({"role": "user", "content": context_msg})
        if len(self.conversation_history) > self._max_history:
            self.conversation_history = self.conversation_history[-self._max_history:]

        threshold = self.settings.get("ui.auto_compact_threshold", 150)
        if threshold > 0 and len(self.conversation_history) >= threshold:
            self.compact()

        # Voice pipeline always uses conversation agent directly — no routing.
        # Routing adds 15+ seconds of latency for an LLM classification call.
        # Specialized agents are only reachable via !prefix commands or web chat.
        _t0 = time.time()
        agent_name = "conversation"
        self.orchestrator._emit("agent_selected", {
            "agent": agent_name,
            "display_name": self.orchestrator._get_display_name(agent_name),
            "speaker": speaker,
        })

        # Stream conversation agent directly via LLM streaming
        if not self.orchestrator.is_plan_mode:
            agent = self.orchestrator.agents.get("conversation")
            if agent:
                system_prompt = agent._build_system_prompt(None)
                messages = [{"role": "system", "content": system_prompt}]
                messages.extend(self.conversation_history[-20:])
                _total_chars = sum(len(m.get("content", "")) for m in messages)
                print(f"[timing] prompt: {len(system_prompt)} chars, {len(messages)} msgs, {_total_chars} total chars")

                full_text = ""
                _t4 = time.time()
                _first_chunk = True
                try:
                    for chunk in llm_chat_stream(messages, agent_name=agent_name):
                        if _first_chunk:
                            _t5 = time.time()
                            print(f"[timing] first LLM chunk took {_t5 - _t4:.2f}s (total from route: {_t5 - _t0:.2f}s)")
                            _first_chunk = False
                        full_text += chunk
                        yield chunk
                except Exception as e:
                    print(f"[agent] Stream error: {e}")
                    if not full_text:
                        full_text = f"Oh no, BMO's words got jumbled... ({e})"
                        yield full_text

                self.conversation_history.append({"role": "assistant", "content": full_text})
                # Parse and execute commands from full response
                text, commands = self._parse_response(full_text)
                for cmd in commands:
                    self._execute_command(cmd)
                return

        # Non-streamable agent: run through orchestrator, yield full response
        try:
            result = self.orchestrator.handle(
                message=user_message, speaker=speaker,
                history=self.conversation_history, services=self.services,
            )
            reply = result.get("text", "")
            agent_name = result.get("agent_used", agent_name)
        except Exception as e:
            reply = f"Oh no! BMO's brain is fuzzy right now... ({e})"

        self.conversation_history.append({"role": "assistant", "content": reply})
        text, commands = self._parse_response(reply)
        for cmd in commands:
            self._execute_command(cmd)

        tags = parse_response_tags(text)
        text = tags.pop("clean_text", text)
        yield text

    # ── Confirmation Handling (shared across agents) ────────────────

    def _write_resume_before_restart(self, cmd: str) -> None:
        """Write resume context so the agent can continue after BMO restarts."""
        try:
            summary = "Restarted to apply changes."
            for msg in reversed(self.conversation_history[-10:]):
                content = msg.get("content", "")
                if isinstance(content, str) and msg.get("role") == "assistant":
                    if len(content) > 30:
                        summary = content[:500].replace("\n", " ")
                        break
            os.makedirs(os.path.dirname(CODE_AGENT_RESUME_FILE), exist_ok=True)
            with open(CODE_AGENT_RESUME_FILE, "w", encoding="utf-8") as f:
                json.dump({
                    "pre_restart_summary": summary,
                    "command": cmd,
                    "timestamp": datetime.datetime.now().isoformat(),
                }, f)
        except Exception as e:
            print(f"[agent] Failed to write resume file: {e}")

    def _read_and_clear_resume(self) -> str | None:
        """If BMO restarted as part of a task, return resume context and clear the file."""
        try:
            if os.path.exists(CODE_AGENT_RESUME_FILE):
                with open(CODE_AGENT_RESUME_FILE, encoding="utf-8") as f:
                    data = json.load(f)
                os.remove(CODE_AGENT_RESUME_FILE)
                return data.get("pre_restart_summary", "Restarted to apply changes.")
        except Exception as e:
            print(f"[agent] Failed to read resume file: {e}")
        return None

    def _execute_pending_confirmation(self, speaker: str) -> dict:
        """Execute all pending destructive operations after user confirmation."""
        from dev_tools import execute_confirmed, write_file_confirmed

        results_text = []
        for pc in self._pending_confirmations:
            tool = pc["tool"]
            args = pc["args"]
            print(f"[agent] Confirmed: {tool}({json.dumps(args)[:100]})")

            if tool == "execute_command":
                cmd = args.get("cmd", "")
                if re.search(r"systemctl\s+restart\s+bmo\b", cmd):
                    self._write_resume_before_restart(cmd)
                result = execute_confirmed(cmd, args.get("cwd"))
            elif tool == "write_file":
                result = write_file_confirmed(args.get("path", ""), args.get("content", ""))
            elif tool == "ssh_command":
                result = execute_confirmed(
                    f"ssh {args.get('host', '')} {args.get('cmd', '')}",
                )
            else:
                result = dispatch_tool(tool, args)

            results_text.append(f"{tool}: {json.dumps(result)[:500]}")

        self._pending_confirmations = []
        text = "BMO executed the confirmed operations:\n" + "\n".join(results_text)

        return {
            "text": text,
            "speaker": speaker,
            "commands_executed": [],
            "tags": {},
        }

    # ── DnD Delegators (app.py backward compatibility) ────────────

    @property
    def _dnd_context(self):
        """Delegate to DnD DM agent's context."""
        dm = self.orchestrator.agents.get("dnd_dm")
        return dm._dnd_context if dm else None

    @_dnd_context.setter
    def _dnd_context(self, value):
        dm = self.orchestrator.agents.get("dnd_dm")
        if dm:
            dm._dnd_context = value

    @property
    def _dnd_pending(self):
        dm = self.orchestrator.agents.get("dnd_dm")
        return dm._dnd_pending if dm else None

    @_dnd_pending.setter
    def _dnd_pending(self, value):
        dm = self.orchestrator.agents.get("dnd_dm")
        if dm:
            dm._dnd_pending = value

    @property
    def _gamestate(self):
        dm = self.orchestrator.agents.get("dnd_dm")
        return dm._gamestate if dm else None

    @_gamestate.setter
    def _gamestate(self, value):
        dm = self.orchestrator.agents.get("dnd_dm")
        if dm:
            dm._gamestate = value

    def load_dnd_context(self, character_paths: list[str], maps_dir: str, chosen_map: str | None = None) -> str:
        """Delegate to DnD DM agent."""
        dm = self.orchestrator.agents.get("dnd_dm")
        if dm:
            return dm.load_dnd_context(character_paths, maps_dir, chosen_map)
        return "unknown"

    def get_gamestate(self) -> dict:
        """Delegate to DnD DM agent."""
        dm = self.orchestrator.agents.get("dnd_dm")
        if dm:
            return dm.get_gamestate()
        return {}

    def get_player_names(self) -> list[str]:
        """Delegate to DnD DM agent."""
        dm = self.orchestrator.agents.get("dnd_dm")
        if dm:
            return dm.get_player_names()
        return []

    def generate_session_recap(self, messages: list[dict]) -> str:
        """Delegate to DnD DM agent."""
        dm = self.orchestrator.agents.get("dnd_dm")
        if dm:
            return dm.generate_session_recap(messages)
        return ""

    def _is_dnd_request(self, message: str) -> bool:
        """Detect if the user is asking BMO to be a DM."""
        lower = message.lower()
        dm_keywords = ["be the dm", "dungeon master", "dnd campaign", "d&d campaign",
                       "one shot", "one-shot", "run a campaign", "dm for"]
        return any(kw in lower for kw in dm_keywords)

    def _auto_load_dnd(self, message: str) -> None:
        """Delegate to DnD DM agent."""
        dm = self.orchestrator.agents.get("dnd_dm")
        if dm:
            dm._auto_load_dnd(message)

    # ── Removed Methods (now in specialized agents) ──────────────
    # _is_dev_request → handled by AgentRouter
    # _run_tool_loop → agents/code_agent.py
    # _parse_tool_calls → agents/base_agent.py
    # _strip_tool_calls → agents/base_agent.py
    # _dm_planning_phase → agents/dnd_dm.py

    # ── Command Parsing ──────────────────────────────────────────────

    def _parse_response(self, response: str) -> tuple[str, list[dict]]:
        """Extract the conversational text and any command blocks from the response."""
        commands = []

        # Find ```command ... ``` blocks (proper fenced format)
        fenced_pattern = r"```command\s*\n?(.*?)\n?```"
        matches = re.findall(fenced_pattern, response, re.DOTALL)

        for match in matches:
            try:
                cmd = json.loads(match.strip())
                commands.append(cmd)
            except json.JSONDecodeError:
                print(f"[agent] Failed to parse command: {match}")

        # Remove fenced command blocks from the display text
        text = re.sub(fenced_pattern, "", response, flags=re.DOTALL)

        # Also catch single-backtick command blocks: `command ... `
        single_tick_pattern = r"`command\s*\n?(.*?)\n?`"
        single_matches = re.findall(single_tick_pattern, text, re.DOTALL)
        for match in single_matches:
            try:
                cmd = json.loads(match.strip())
                commands.append(cmd)
            except (json.JSONDecodeError, ValueError):
                pass
        text = re.sub(single_tick_pattern, "", text, flags=re.DOTALL)

        # Also catch inline JSON command objects that BMO sometimes writes
        # without proper fencing (e.g. {"action": "...", "params": {...}})
        inline_pattern = r'\{["\']action["\']:\s*["\'][^"\']+["\'],\s*["\']params["\']:\s*\{[^}]*\}\s*\}'
        inline_matches = re.findall(inline_pattern, text)
        for match in inline_matches:
            try:
                cmd = json.loads(match.replace("'", '"'))
                commands.append(cmd)
            except (json.JSONDecodeError, ValueError):
                pass
        text = re.sub(inline_pattern, "", text)

        # Remove lines that only talk about command blocks (not real content)
        lines = text.split('\n')
        cleaned_lines = []
        for line in lines:
            lower = line.lower().strip()
            # Skip lines that are purely about command blocks
            if any(phrase in lower for phrase in [
                'command block', 'include the following', 'your command should',
                'here is the command', 'the command for this',
            ]):
                continue
            cleaned_lines.append(line)
        text = '\n'.join(cleaned_lines)

        # Remove leading dashes/bullets that are orphaned from stripped content
        text = re.sub(r'^\s*[—\-\*]\s*$', '', text, flags=re.MULTILINE)

        # Clean up extra whitespace
        text = re.sub(r'\n{3,}', '\n\n', text).strip()

        return text, commands

    # ── Command Execution ────────────────────────────────────────────

    def _execute_command(self, cmd: dict) -> dict:
        """Execute a parsed command and return the result."""
        action = cmd.get("action", "")
        params = cmd.get("params", {})

        try:
            handler = self._get_handler(action)
            if handler:
                result = handler(params)
                return {"action": action, "success": True, "result": result}
            else:
                return {"action": action, "success": False, "error": f"Unknown action: {action}"}
        except Exception as e:
            print(f"[agent] Command failed: {action} — {e}")
            return {"action": action, "success": False, "error": str(e)}

    def _get_handler(self, action: str):
        """Map action names to handler functions."""
        handlers = {
            # Music
            "music_play": self._handle_music_play,
            "music_pause": self._handle_music_pause,
            "music_next": self._handle_music_next,
            "music_previous": self._handle_music_previous,
            "music_volume": self._handle_music_volume,
            "music_cast": self._handle_music_cast,
            # Audio output routing
            "audio_list_devices": self._handle_audio_list_devices,
            "audio_set_output": self._handle_audio_set_output,
            "audio_bluetooth_scan": self._handle_audio_bt_scan,
            "audio_bluetooth_pair": self._handle_audio_bt_pair,
            # Scene modes
            "scene_list": self._handle_scene_list,
            "scene_activate": self._handle_scene_activate,
            "scene_deactivate": self._handle_scene_deactivate,
            # TV / Smart Home
            "tv_pause": self._handle_tv_pause,
            "tv_play": self._handle_tv_play,
            "tv_stop": self._handle_tv_stop,
            "tv_volume": self._handle_tv_volume,
            "tv_off": self._handle_tv_off,
            "tv_launch": self._handle_tv_launch,
            "tv_key": self._handle_tv_key,
            "tv_power": self._handle_tv_power,
            "tv_mute": self._handle_tv_mute,
            "device_list": self._handle_device_list,
            # LED
            "led_set_color": self._handle_led_set_color,
            "led_set_mode": self._handle_led_set_mode,
            "led_set_brightness": self._handle_led_set_brightness,
            "led_get_state": self._handle_led_get_state,
            # Calendar
            "calendar_today": self._handle_calendar_today,
            "calendar_week": self._handle_calendar_week,
            "calendar_create": self._handle_calendar_create,
            "calendar_update": self._handle_calendar_update,
            "calendar_delete": self._handle_calendar_delete,
            # Timer / Alarm
            "timer_set": self._handle_timer_set,
            "timer_pause": self._handle_timer_pause,
            "timer_cancel": self._handle_timer_cancel,
            "timer_list": self._handle_timer_list,
            "alarm_set": self._handle_alarm_set,
            "alarm_update": self._handle_alarm_update,
            "alarm_cancel": self._handle_alarm_cancel,
            "alarm_snooze": self._handle_alarm_snooze,
            # Camera
            "camera_snapshot": self._handle_camera_snapshot,
            "camera_describe": self._handle_camera_describe,
            "camera_motion": self._handle_camera_motion,
            "bmo_status": self._handle_bmo_status,
            # Other
            "weather": self._handle_weather,
            "identify_face": self._handle_identify_face,
            "identify_voice": self._handle_identify_voice,
            "enroll_voice": self._handle_enroll_voice,
            # File access (D&D data)
            "read_file": self._handle_read_file,
            "list_dir": self._handle_list_dir,
        }
        return handlers.get(action)

    # ── Music Handlers ───────────────────────────────────────────────

    def _handle_music_play(self, params):
        music = self.services.get("music")
        if not music:
            return "Music service not available"
        query = params.get("query", "")
        results = music.search(query, limit=5)
        if results:
            music.play(results[0])
            return f"Playing: {results[0]['title']} by {results[0]['artist']}"
        return f"No results found for '{query}'"

    def _handle_music_pause(self, params):
        music = self.services.get("music")
        if music:
            music.pause()
            return "Toggled pause"

    def _handle_music_next(self, params):
        music = self.services.get("music")
        if music:
            music.next_track()
            return "Skipped to next track"

    def _handle_music_previous(self, params):
        music = self.services.get("music")
        if music:
            music.previous_track()
            return "Went to previous track"

    def _handle_music_volume(self, params):
        music = self.services.get("music")
        if music:
            level = max(0, min(100, int(params.get("level", 50))))
            music.set_volume(level)
            # Persist and broadcast so sliders stay in sync
            from app import _save_setting, socketio
            _save_setting("volume.music", level)
            socketio.emit("volume_update", {"category": "music", "level": level})
            return f"Volume set to {level}%"

    def _handle_music_cast(self, params):
        music = self.services.get("music")
        if music:
            music.set_output_device(params.get("device", "pi"))
            return f"Output switched to {params.get('device', 'pi')}"

    # ── Audio Output Handlers ────────────────────────────────────────

    def _handle_audio_list_devices(self, params):
        audio = self.services.get("audio")
        if not audio:
            return "Audio service not available"
        sinks = audio.list_sinks()
        if not sinks:
            return "No audio output devices found"
        lines = []
        for s in sinks:
            default = " (default)" if s.is_default else ""
            lines.append(f"  {s.pw_id}: {s.description}{default}")
        return "Available audio devices:\n" + "\n".join(lines)

    def _handle_audio_set_output(self, params):
        audio = self.services.get("audio")
        if not audio:
            return "Audio service not available"
        device_name = params.get("device_name", "")
        function = params.get("function", "all")
        if device_name:
            dev = audio.find_device_by_name(device_name)
            if not dev:
                sinks = audio.list_sinks()
                names = ", ".join(s.description for s in sinks)
                return f"Device '{device_name}' not found. Available: {names}"
            ok = audio.set_function_output(function, dev.pw_id)
            return f"{'Set' if ok else 'Failed to set'} {function} output to {dev.description}"
        device_id = params.get("device_id")
        if device_id:
            ok = audio.set_function_output(function, int(device_id))
            return f"{'Set' if ok else 'Failed to set'} {function} output to device {device_id}"
        return "Please specify a device_name or device_id"

    def _handle_audio_bt_scan(self, params):
        audio = self.services.get("audio")
        if not audio:
            return "Audio service not available"
        devices = audio.bluetooth_scan(duration=params.get("duration", 10))
        if not devices:
            return "No Bluetooth devices found nearby"
        lines = [f"  {d['address']}: {d['name']}" for d in devices]
        return "Bluetooth devices found:\n" + "\n".join(lines)

    def _handle_audio_bt_pair(self, params):
        audio = self.services.get("audio")
        if not audio:
            return "Audio service not available"
        address = params.get("address", "")
        if not address:
            return "Please provide the Bluetooth device address"
        ok, msg = audio.bluetooth_pair(address)
        return msg

    # ── Scene Mode Handlers ──────────────────────────────────────────

    def _handle_scene_list(self, params):
        scenes = self.services.get("scenes")
        if not scenes:
            return "Scene service not available"
        scene_list = scenes.list_scenes()
        lines = []
        for s in scene_list:
            active = " (ACTIVE)" if s["active"] else ""
            lines.append(f"  {s['label']}{active}")
        return "Available scenes:\n" + "\n".join(lines)

    def _handle_scene_activate(self, params):
        scenes = self.services.get("scenes")
        if not scenes:
            return "Scene service not available"
        name = params.get("scene", "")
        if not name:
            return "Please specify a scene: anime, bedtime, movie, party"
        ok, msg = scenes.activate(name)
        return msg

    def _handle_scene_deactivate(self, params):
        scenes = self.services.get("scenes")
        if not scenes:
            return "Scene service not available"
        ok, msg = scenes.deactivate()
        return msg

    # ── TV / Smart Home Handlers ─────────────────────────────────────
    # All TV commands go through the Flask API (same as web GUI)

    def _tv_api(self, endpoint, json_data=None, method="POST"):
        """Call a local Flask TV API endpoint."""
        import requests as _req
        url = f"http://localhost:5000{endpoint}"
        try:
            if method == "GET":
                r = _req.get(url, timeout=5)
            else:
                r = _req.post(url, json=json_data or {}, timeout=10)
            if r.ok:
                return r.json(), None
            return None, r.json().get("error", "unknown error")
        except Exception as e:
            return None, str(e)

    def _handle_tv_launch(self, params):
        app_name = params.get("app", "").lower().strip()
        if not app_name:
            return "No app specified"
        _, err = self._tv_api("/api/tv/launch", {"app": app_name})
        if err:
            return f"Failed to launch {app_name}: {err}"
        return f"Launched {app_name} on your TV"

    def _handle_tv_pause(self, params):
        _, err = self._tv_api("/api/tv/key", {"key": "play_pause"})
        if err:
            return f"Pause failed: {err}"
        return "Paused TV"

    def _handle_tv_play(self, params):
        _, err = self._tv_api("/api/tv/key", {"key": "play_pause"})
        if err:
            return f"Play failed: {err}"
        return "Resumed TV"

    def _handle_tv_stop(self, params):
        _, err = self._tv_api("/api/tv/key", {"key": "play_pause"})
        if err:
            return f"Stop failed: {err}"
        return "Stopped TV"

    def _handle_tv_volume(self, params):
        level = params.get("level")
        direction = params.get("direction", "")
        if level is not None:
            data, err = self._tv_api("/api/tv/volume", {"level": int(level)})
            if err:
                return f"Volume failed: {err}"
            return f"Volume set to {level}%"
        if direction:
            _, err = self._tv_api("/api/tv/volume", {"direction": direction})
            if err:
                return f"Volume failed: {err}"
            return f"Volume {direction}"
        _, err = self._tv_api("/api/tv/volume", {"direction": "up"})
        if err:
            return f"Volume failed: {err}"
        return "Volume up"

    def _handle_tv_mute(self, params):
        _, err = self._tv_api("/api/tv/volume", {"direction": "mute"})
        if err:
            return f"Mute failed: {err}"
        return "Toggled mute"

    def _handle_tv_power(self, params):
        state = params.get("state", "on")
        _, err = self._tv_api("/api/tv/power", {"state": state})
        if err:
            return f"Power {state} failed: {err}"
        return f"TV power {state}"

    def _handle_tv_key(self, params):
        key = params.get("key", "")
        KEY_MAP = {
            "up": "DPAD_UP", "down": "DPAD_DOWN", "left": "DPAD_LEFT",
            "right": "DPAD_RIGHT", "select": "DPAD_CENTER", "back": "BACK",
            "home": "HOME", "play_pause": "MEDIA_PLAY_PAUSE",
            "rewind": "MEDIA_PREVIOUS", "forward": "MEDIA_NEXT",
        }
        mapped = KEY_MAP.get(key, key.upper())
        _, err = self._tv_api("/api/tv/key", {"key": mapped})
        if err:
            return f"Key '{key}' failed: {err}"
        return f"Sent {key}"

    def _handle_tv_off(self, params):
        _, err = self._tv_api("/api/tv/power", {"state": "off"})
        if err:
            return f"TV off failed: {err}"
        return "Turned off TV"

    def _handle_device_list(self, params):
        data, err = self._tv_api("/api/devices", method="GET")
        if err:
            home = self.services.get("smart_home")
            if home:
                return home.get_devices()
            return f"Failed to list devices: {err}"
        return data

    # ── LED Handlers ─────────────────────────────────────────────────

    def _handle_led_set_color(self, params):
        led = self.services.get("led_controller")
        if not led:
            return "LED controller not available"
        name = params.get("color")
        if name:
            ok = led.set_color_by_name(name)
            return f"Set LED color to {name}" if ok else f"Unknown color '{name}'"
        r, g, b = params.get("r", 0), params.get("g", 0), params.get("b", 0)
        led.set_color(r, g, b)
        return f"Set LED color to RGB({r}, {g}, {b})"

    def _handle_led_set_mode(self, params):
        led = self.services.get("led_controller")
        if not led:
            return "LED controller not available"
        mode = params.get("mode", "")
        ok = led.set_mode(mode)
        return f"Set LED mode to {mode}" if ok else f"Unknown mode '{mode}'"

    def _handle_led_set_brightness(self, params):
        led = self.services.get("led_controller")
        if not led:
            return "LED controller not available"
        level = params.get("brightness", 100)
        led.set_brightness(level)
        return f"Set LED brightness to {level}%"

    def _handle_led_get_state(self, params):
        led = self.services.get("led_controller")
        if not led:
            return "LED controller not available"
        return led.get_full_state()

    # ── Calendar Handlers ────────────────────────────────────────────

    def _handle_calendar_today(self, params):
        cal = self.services.get("calendar")
        if cal:
            events = cal.get_today_events()
            if not events:
                return "No events today!"
            return events

    def _handle_calendar_week(self, params):
        cal = self.services.get("calendar")
        if cal:
            return cal.get_upcoming_events(days_ahead=7)

    def _handle_calendar_create(self, params):
        cal = self.services.get("calendar")
        if not cal:
            return "Calendar not available"

        date_str = params.get("date", "")
        time_str = params.get("time", "12:00")
        duration = params.get("duration_hours", 1)

        start = datetime.datetime.strptime(f"{date_str} {time_str}", "%Y-%m-%d %H:%M")
        end = start + datetime.timedelta(hours=duration)

        event = cal.create_event(
            summary=params.get("summary", "New Event"),
            start_dt=start,
            end_dt=end,
            description=params.get("description", ""),
        )
        return f"Created: {event['summary']} at {event['start']}"

    def _handle_calendar_delete(self, params):
        cal = self.services.get("calendar")
        if not cal:
            return "Calendar not available"

        summary = params.get("summary", "").lower()
        events = cal.get_upcoming_events(days_ahead=30)
        for event in events:
            if summary in event["summary"].lower():
                cal.delete_event(event["id"])
                return f"Deleted: {event['summary']}"
        return f"No event found matching '{params.get('summary', '')}'"

    def _handle_calendar_update(self, params):
        cal = self.services.get("calendar")
        if not cal:
            return "Calendar not available"

        summary = params.get("summary", "").lower()
        events = cal.get_upcoming_events(days_ahead=30)
        target = None
        for event in events:
            if summary in event["summary"].lower():
                target = event
                break
        if not target:
            return f"No event found matching '{params.get('summary', '')}'"

        updates = {}
        if "new_summary" in params:
            updates["summary"] = params["new_summary"]
        if "new_date" in params or "new_time" in params:
            # Reconstruct start/end times
            old_start = target.get("start", "")
            try:
                old_dt = datetime.datetime.fromisoformat(old_start.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                old_dt = datetime.datetime.now()

            new_date = params.get("new_date", old_dt.strftime("%Y-%m-%d"))
            new_time = params.get("new_time", old_dt.strftime("%H:%M"))
            new_start = datetime.datetime.strptime(f"{new_date} {new_time}", "%Y-%m-%d %H:%M")
            duration = params.get("new_duration_hours", None)
            if duration:
                new_end = new_start + datetime.timedelta(hours=duration)
            else:
                old_end = target.get("end", "")
                try:
                    old_end_dt = datetime.datetime.fromisoformat(old_end.replace("Z", "+00:00"))
                    event_duration = old_end_dt - old_dt
                    new_end = new_start + event_duration
                except (ValueError, AttributeError):
                    new_end = new_start + datetime.timedelta(hours=1)
            updates["start_dt"] = new_start
            updates["end_dt"] = new_end

        if not updates:
            return "No changes specified"

        cal.update_event(target["id"], **updates)
        return f"Updated: {target['summary']}"

    # ── Timer / Alarm Handlers ───────────────────────────────────────

    def _handle_timer_set(self, params):
        timers = self.services.get("timers")
        if timers:
            minutes = params.get("minutes", 0)
            seconds = params.get("seconds", 0)
            total_sec = int(minutes) * 60 + int(seconds)
            if total_sec <= 0:
                total_sec = 300
            label = params.get("label", "")
            timer = timers.create_timer(total_sec, label)
            return f"Timer set for {timer['label']}"

    def _handle_timer_pause(self, params):
        timers = self.services.get("timers")
        if not timers:
            return "Timer service not available"
        label = params.get("label", "").lower()
        for item in timers.get_all():
            if item["type"] == "timer" and label in item["label"].lower():
                timers.pause_timer(item["id"])
                status = "paused" if not item["paused"] else "resumed"
                return f"Timer '{item['label']}' {status}"
        return f"No timer found matching '{label}'"

    def _handle_timer_cancel(self, params):
        timers = self.services.get("timers")
        if not timers:
            return "Timer service not available"
        label = params.get("label", "").lower()
        for item in timers.get_all():
            if item["type"] == "timer" and label in item["label"].lower():
                timers.cancel_timer(item["id"])
                return f"Cancelled timer: {item['label']}"
        return f"No timer found matching '{label}'"

    def _handle_timer_list(self, params):
        timers = self.services.get("timers")
        if not timers:
            return "Timer service not available"
        items = timers.get_all()
        if not items:
            return "No active timers or alarms"
        lines = []
        for item in items:
            rem = item["remaining"]
            m, s = divmod(rem, 60)
            h, m = divmod(m, 60)
            time_str = f"{h}h {m}m {s}s" if h else f"{m}m {s}s"
            if item["type"] == "timer":
                status = " (paused)" if item.get("paused") else ""
                lines.append(f"⏱️ {item['label']}: {time_str} remaining{status}")
            else:
                repeat_str = f" ({item.get('repeat', 'none')})" if item.get("repeat", "none") != "none" else ""
                lines.append(f"⏰ {item['label']}: {item['target_time']}{repeat_str} — {time_str} away")
        return "\n".join(lines)

    def _handle_alarm_set(self, params):
        timers = self.services.get("timers")
        if timers:
            alarm = timers.create_alarm(
                params.get("hour", 7),
                params.get("minute", 0),
                params.get("label", ""),
                date=params.get("date", ""),
                repeat=params.get("repeat", "none"),
                repeat_days=params.get("repeat_days"),
                tag=params.get("tag", "reminder"),
            )
            repeat_info = f" ({alarm.get('repeat')})" if alarm.get("repeat", "none") != "none" else ""
            tag_info = f" [{alarm.get('tag')}]" if alarm.get("tag", "reminder") != "reminder" else ""
            return f"Alarm set for {alarm['target_time']}{repeat_info}{tag_info}"

    def _find_alarm(self, label: str):
        """Find an alarm by fuzzy label match (substring, word overlap, or tag)."""
        timers = self.services.get("timers")
        if not timers:
            return None
        label_lower = label.lower()
        label_words = set(label_lower.split())
        alarms = [i for i in timers.get_all() if i["type"] == "alarm"]
        # Exact substring match
        for item in alarms:
            if label_lower in item["label"].lower() or item["label"].lower() in label_lower:
                return item
        # Word overlap match (any word from search matches any word in label)
        for item in alarms:
            item_words = set(item["label"].lower().split())
            if label_words & item_words:
                return item
        # Tag match (e.g. user says "morning alarm" → tag "wake-up")
        tag_map = {"morning": "wake-up", "wake": "wake-up", "wakeup": "wake-up",
                   "reminder": "reminder", "timer": "timer", "beep": "timer"}
        for word in label_words:
            tag = tag_map.get(word)
            if tag:
                for item in alarms:
                    if item.get("tag") == tag:
                        return item
        # If only one alarm exists, return it
        if len(alarms) == 1:
            return alarms[0]
        return None

    def _handle_alarm_cancel(self, params):
        timers = self.services.get("timers")
        if not timers:
            return "Timer service not available"
        label = params.get("label", "")
        target = self._find_alarm(label)
        if target:
            timers.cancel_alarm(target["id"])
            return f"Cancelled alarm: {target['label']}"
        return f"No alarm found matching '{label}'"

    def _handle_alarm_update(self, params):
        timers = self.services.get("timers")
        if not timers:
            return "Timer service not available"
        label = params.get("label", "")
        target = self._find_alarm(label)
        if not target:
            return f"No alarm found matching '{label}'"
        # Build kwargs for in-place update — only include fields that were provided
        updates = {}
        if "hour" in params:
            updates["hour"] = params["hour"]
        if "minute" in params:
            updates["minute"] = params["minute"]
        if "new_label" in params:
            updates["label"] = params["new_label"]
        if "repeat" in params:
            updates["repeat"] = params["repeat"]
        if "repeat_days" in params:
            updates["repeat_days"] = params["repeat_days"]
        if "tag" in params:
            updates["tag"] = params["tag"]
        if not updates:
            return f"No changes specified for alarm '{target['label']}'"
        result = timers.update_alarm(target["id"], **updates)
        if result:
            return f"Updated alarm: {result['label']} → {result['target_time']}"
        return f"Failed to update alarm '{target['label']}'"

    def _handle_alarm_snooze(self, params):
        timers = self.services.get("timers")
        if not timers:
            return "Timer service not available"
        label = params.get("label", "")
        minutes = params.get("minutes", 5)
        target = self._find_alarm(label)
        if target:
            if timers.snooze_alarm(target["id"], minutes):
                return f"Snoozed alarm '{target['label']}' for {minutes} minutes"
            return f"Alarm '{target['label']}' hasn't fired yet"
        return f"No alarm found matching '{label}'"

    # ── Camera Handlers ──────────────────────────────────────────────

    def _handle_camera_snapshot(self, params):
        camera = self.services.get("camera")
        if camera:
            path = camera.take_snapshot()
            return f"Photo saved to {path}"

    def _handle_camera_describe(self, params):
        camera = self.services.get("camera")
        if camera:
            prompt = params.get("prompt", "What do you see?")
            return camera.describe_scene(prompt)

    def _handle_camera_motion(self, params):
        camera = self.services.get("camera")
        if camera:
            if params.get("enabled", True):
                camera.start_motion_detection()
                return "Motion detection enabled"
            else:
                camera.stop_motion_detection()
                return "Motion detection disabled"

    # ── Other Handlers ───────────────────────────────────────────────

    def _handle_weather(self, params):
        weather = self.services.get("weather")
        if weather:
            return weather.get_current()

    def _handle_identify_face(self, params):
        camera = self.services.get("camera")
        if camera:
            faces = camera.identify_faces()
            if faces:
                names = [f["name"] for f in faces]
                return f"I see: {', '.join(names)}"
            return "I don't see anyone right now"

    def _handle_identify_voice(self, params):
        return "Voice identification happens automatically during speech input"

    def _handle_enroll_voice(self, params):
        """Enroll a speaker's voice. BMO records a clip and saves the voice profile.

        Params: {"name": "Gavin", "duration": 5}
        """
        voice_svc = self.services.get("voice")
        if not voice_svc:
            return "Voice pipeline is not available right now."
        name = params.get("name", "").strip()
        if not name:
            return "I need a name to enroll. Tell me your name!"
        duration = params.get("duration", 5)
        try:
            clip_path = voice_svc.record_clip(duration=duration)
            voice_svc.enroll_speaker(name, [clip_path])
            if os.path.exists(clip_path):
                os.unlink(clip_path)
            return f"I've enrolled {name}'s voice! I'll recognize you next time."
        except Exception as e:
            return f"Voice enrollment failed: {e}"

    def _handle_bmo_status(self, params):
        """Return BMO's self-awareness status summary."""
        try:
            import requests as _req
            resp = _req.get("http://localhost:5000/api/status/summary", timeout=5)
            if resp.ok:
                data = resp.json()
                return data.get("summary", "I'm running but can't read my own status right now.")
            return "I'm having trouble checking my own status."
        except Exception:
            return "I'm running, but my monitoring service isn't responding right now."

    # ── File Access Handlers (D&D data) ──────────────────────────────

    def _handle_read_file(self, params):
        """Read a file from the D&D 5e data directory."""
        path = params.get("path", "")
        # Resolve relative to the data dir
        if not os.path.isabs(path):
            path = os.path.join(DND_DATA_DIR, path)
        # Security: only allow reads under the data dir
        real = os.path.realpath(path)
        if not real.startswith(os.path.realpath(DND_DATA_DIR)):
            return "Access denied — can only read files under the D&D 5e data directory"
        try:
            with open(real, encoding="utf-8") as f:
                content = f.read(100000)  # Cap at 100KB
            return content
        except Exception as e:
            return f"Failed to read {path}: {e}"

    def _handle_list_dir(self, params):
        """List files in a subdirectory of the D&D 5e data directory."""
        subdir = params.get("path", "")
        path = os.path.join(DND_DATA_DIR, subdir)
        real = os.path.realpath(path)
        if not real.startswith(os.path.realpath(DND_DATA_DIR)):
            return "Access denied"
        try:
            entries = os.listdir(real)
            return entries
        except Exception as e:
            return f"Failed to list {path}: {e}"
