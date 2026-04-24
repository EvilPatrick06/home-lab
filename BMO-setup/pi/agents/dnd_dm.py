"""D&D Dungeon Master agent — extracted DM logic from agent.py.

Handles full DM sessions: character loading, map selection, combat,
game state tracking, DM planning phase, loot generation, rest mechanics.
"""

from __future__ import annotations

import json
import os
import re
import random
import datetime
from typing import Any

from agents.vtt_sync import push_discord_message
from agents.base_agent import AgentConfig, AgentResult, BaseAgent

# Re-use the existing DM data functions from agent.py
from agent import (
    COMMAND_INSTRUCTION,
    DND_DATA_DIR,
    GAMESTATE_DIR,
    GAMESTATE_FILE,
    MAP_ENVIRONMENTS,
    OLLAMA_OPTIONS,
    OLLAMA_PLAN_OPTIONS,
    _build_dm_data_context,
    _calculate_encounter_difficulty,
    _discover_maps,
    _load_character_file,
    _load_monster_stat_block,
    _summarize_character,
)

DM_BASE_PROMPT = """You are the Dungeon Master for a D&D 5e one-shot. You follow the rules of D&D 5e strictly."""


class DndDmAgent(BaseAgent):
    """D&D Dungeon Master agent with full session management."""

    def __init__(self, config, scratchpad, services, socketio=None, orchestrator=None):
        super().__init__(config, scratchpad, services, socketio, orchestrator)
        self._dnd_context: str | None = None
        self._dnd_pending: dict | None = None
        self._gamestate: dict | None = None
        self._player_names: list[str] = []

    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        """Handle a DM session message."""
        # Auto-load DnD context if not loaded
        if not self._dnd_context:
            self._auto_load_dnd(message)

        # Check if player is selecting a map from pending choices
        if self._dnd_pending:
            self._check_map_selection(message)

        # Build system prompt
        if self._dnd_context:
            system_prompt = self._dnd_context + "\n\n" + COMMAND_INSTRUCTION
        else:
            system_prompt = DM_BASE_PROMPT + "\n\n" + COMMAND_INSTRUCTION

        messages = [{"role": "system", "content": system_prompt}]
        messages.extend(history[-40:])  # More history for DM sessions
        messages.append({"role": "user", "content": message})

        # DM Planning Phase — hidden thinking step
        if self._dnd_context and not self._dnd_pending:
            plan = self._dm_planning_phase(system_prompt, history + [{"role": "user", "content": message}])
            if plan:
                messages.append({
                    "role": "system",
                    "content": f"[DM NOTES — hidden from players]\n{plan}\n[END DM NOTES — now respond to the players in character]",
                })

        # LLM call
        reply = self.llm_call(messages)

        # Forward response to VTT sync
        try:
            push_discord_message('DM', reply[:2000])
        except Exception:
            pass  # Non-critical

        # Parse game state updates
        reply = self._parse_gamestate(reply)

        return AgentResult(text=reply, agent_name=self.config.name)

    # ── DnD Context Loading ──────────────────────────────────────────

    def load_dnd_context(self, character_paths: list[str], maps_dir: str, chosen_map: str | None = None) -> str:
        """Read character sheets and pick a map, building a DM context string.

        Returns the chosen map name.
        """
        # Load characters
        characters = []
        for path in character_paths:
            data = _load_character_file(path)
            if data:
                characters.append(_summarize_character(data))

        # Discover maps
        available_maps = _discover_maps(maps_dir)

        if chosen_map and chosen_map in available_maps:
            selected_map = chosen_map
        elif available_maps and not chosen_map:
            map_list = [m.replace("-", " ").replace("_", " ").title() for m in available_maps]
            map_choices = "\n".join(f"  - {name}" for name in map_list)
            self._dnd_pending = {
                "char_paths": character_paths,
                "maps_dir": maps_dir,
                "available_maps": available_maps,
            }
            self._dnd_context = f"""You are preparing to DM a D&D 5e one-shot adventure.

# PLAYER CHARACTERS
{chr(10).join(characters)}

# AVAILABLE MAPS
The following maps are available for this adventure:
{map_choices}

Ask the players which map they'd like to play on. Briefly describe what each map name suggests. Once they choose, you will begin the session.

Do NOT start the adventure yet. Just present the map choices and ask which one they want.
"""
            return "awaiting-selection"
        else:
            selected_map = "unknown-dungeon"

        # Build the full DM context (same logic as original agent.py)
        map_display = selected_map.replace("-", " ").replace("_", " ").title()
        party_level = characters[0].split("Level ")[1].split(")")[0] if characters else "1"

        # Store player names
        self._player_names = []
        for path in character_paths:
            data = _load_character_file(path)
            if data:
                self._player_names.append(data.get("name", "Unknown"))

        # Build the massive DM system prompt (same rules as agent.py)
        self._dnd_context = self._build_full_dm_prompt(characters, map_display, party_level, selected_map)

        # Build data context
        try:
            level_num = int(party_level)
        except ValueError:
            level_num = 1
        data_context = _build_dm_data_context(level_num)
        if data_context:
            self._dnd_context += "\n" + data_context

        # Load existing game state
        self._gamestate = self._load_gamestate()
        if self._gamestate and self._gamestate.get("characters"):
            gs_lines = ["\n# CURRENT GAME STATE (from this session)"]
            for char_name, char_state in self._gamestate["characters"].items():
                parts = [f"## {char_name}"]
                for field in ("hp", "spell_slots", "conditions", "gold", "inventory"):
                    if field in char_state:
                        if field == "hp":
                            parts.append(f"  HP: {char_state['hp']}/{char_state.get('hp_max', '?')}")
                        elif field == "spell_slots":
                            slots = ", ".join(f"Lvl {k}: {v}" for k, v in char_state["spell_slots"].items())
                            parts.append(f"  Spell Slots Remaining: {slots}")
                        elif field == "conditions" and char_state["conditions"]:
                            parts.append(f"  Conditions: {', '.join(char_state['conditions'])}")
                        elif field == "gold":
                            parts.append(f"  Gold: {char_state['gold']}")
                        elif field == "inventory" and char_state["inventory"]:
                            parts.append(f"  Inventory Changes: {', '.join(char_state['inventory'])}")
                gs_lines.append("\n".join(parts))
            self._dnd_context += "\n".join(gs_lines)

        print(f"[dnd_dm] Context loaded: {len(characters)} characters, map: {selected_map}")
        return selected_map

    def _build_full_dm_prompt(self, characters: list[str], map_display: str, party_level: str, selected_map: str) -> str:
        """Build the full DM system prompt with all rules."""
        prompt = f"""You are the Dungeon Master for a D&D 5e one-shot. You follow the rules of D&D 5e strictly.

# MAP: {map_display}

# PLAYER CHARACTERS
{chr(10).join(characters)}

# CORE RULES — YOU MUST FOLLOW THESE EVERY SINGLE RESPONSE

## 1. NEVER ACT FOR THE PLAYERS
- You describe the world, NPCs, and consequences. The PLAYERS decide what their characters do.
- WRONG: "Patrick walks over and picks the lock." WRONG: "Draco decides to talk to the merchant."
- RIGHT: Describe the situation, then ask "What do you do?"
- Do NOT suggest specific actions. Do NOT list options like a menu. Just describe the scene and wait.

## 2. REQUIRE DICE ROLLS FOR EVERYTHING
- When a player says they want to do something that has a chance of failure, STOP and ask for a roll.
- Format: "Roll a [Ability] ([Skill]) check." or "Make a [Saving Throw] save."
- Set a DC (10 easy, 13 moderate, 15 hard, 18 very hard, 20+ near impossible).
- WAIT for the player to tell you their roll result before narrating the outcome.

## 3. COMBAT IS MECHANICAL
- When combat starts: "Roll initiative! (Roll a d20 + your initiative modifier)"
- Wait for initiative rolls before proceeding.
- On each creature/player turn, state whose turn it is.
- BMO rolls for monsters using proper math: d20 + attack bonus vs target AC.
- Describe results narratively but show the numbers inline.
- Track HP. Tell players when they take damage and their current HP.
- Use stat blocks appropriate for level {party_level} characters.

## 4. RESPONSE LENGTH
- NEW SCENES: Write a full vivid paragraph. Paint the picture.
- RESOLVING ACTIONS outside combat: 2-4 sentences, then hand control back.
- COMBAT: One creature's turn per response, then hand control to the next.

## 5. DO NOT SKIP AHEAD
- Play it out beat by beat. One action = one response.

## 6. MAKE THINGS SPECIFIC
- NPCs have names, appearances, and personalities.
- Items have prices. Rooms have details.

## 7. CONSEQUENCES AND CHALLENGE
- Failed rolls have consequences. Combat is dangerous.

## 8. STARTING THE SESSION
- Describe the {map_display} in 3-4 vivid sentences.
- Introduce an immediate situation or NPC interaction.
- End with "What do you do?"

## 9. USE THE DATA
- Use REAL monster stat blocks from the data when running combat.
- Generate NPCs using the name tables, appearance descriptions, and personality traits.

## 10. HANDLING PLAYER DICE ROLLS
- When a player sends a [DICE] message, apply the appropriate modifier from their character sheet.
- Always show the math.

## 11. GAME STATE TRACKING
- After each significant change, output a hidden game state update block:
```gamestate
{{"updates": [{{"character": "Name", "field": "hp", "value": 4}}]}}
```
- Valid fields: "hp", "hp_max", "spell_slots.<level>", "conditions", "gold", "inventory_add", "inventory_remove", "hit_dice_remaining", "hit_dice_max", "hit_dice_size".

## 12-15. ENCOUNTER BALANCE, ENVIRONMENTAL HAZARDS, TREASURE, REST MECHANICS
- Check encounter difficulty before combat. Use map environmental hazards.
- Generate loot after combat. Handle short/long rests properly.
"""
        # Inject map environment hazards
        env = MAP_ENVIRONMENTS.get(selected_map)
        if env:
            hazard_lines = "\n".join(f"- {h}" for h in env["hazards"])
            prompt += f"""
# ENVIRONMENT: {env['name']}
Atmosphere: {env['atmosphere']}

Hazards:
{hazard_lines}
"""
        return prompt

    def _check_map_selection(self, message: str) -> None:
        """Check if the user is selecting a map from pending choices."""
        if not self._dnd_pending:
            return
        lower = message.lower()
        for map_id in self._dnd_pending["available_maps"]:
            map_name = map_id.replace("-", " ").replace("_", " ").lower()
            if map_name in lower or map_id.lower() in lower:
                pending = self._dnd_pending
                self._dnd_pending = None
                self.load_dnd_context(pending["char_paths"], pending["maps_dir"], map_id)
                print(f"[dnd_dm] Map selected: {map_id}")
                break

    def _auto_load_dnd(self, message: str) -> None:
        """Scan for .dndchar files and maps in the message or default locations."""
        import glob

        char_paths = re.findall(r'([A-Za-z]:\\[^\s"]+\.dndchar)', message)
        if not char_paths:
            for search_dir in [os.path.expanduser("~/Downloads"), os.path.expanduser("~/Documents")]:
                char_paths.extend(glob.glob(os.path.join(search_dir, "*.dndchar")))

        maps_dir_match = re.search(r'([A-Za-z]:\\[^\s"]*maps)', message)
        maps_dir = maps_dir_match.group(1) if maps_dir_match else os.path.join(DND_DATA_DIR, "maps")

        if char_paths:
            self.load_dnd_context(char_paths, maps_dir)

    # ── DM Planning Phase ─────────────────────────────────────────────

    def _dm_planning_phase(self, system_prompt: str, history: list[dict]) -> str | None:
        """Hidden DM thinking step — plans what NPCs, monsters, or events to introduce."""
        planning_prompt = """You are the DM's inner thoughts. Based on the current conversation, briefly plan your next response.
Consider:
- Do I need to introduce a new NPC? If so, should I load NPC name/appearance tables?
- Do I need to start or continue combat? If so, which monster(s)?
- What skill check or roll should I ask for?
- What happens next in the story?
- Is combat about to start? Check encounter balance first.
- Did combat just end? Generate loot.
- Are the players resting? Apply rest mechanics.

Reply with a SHORT plan (2-4 sentences max). Available directives:
- LOAD_MONSTER: <monster name>
- LOAD_NPC_TABLES
- CALCULATE_ENCOUNTER: <monster1>x<count>, <monster2>x<count>
- GENERATE_LOOT: <cr_bracket> [hoard]
- REST_SHORT: <character_name>
- REST_LONG: <character_name>"""

        plan_messages = [{"role": "system", "content": system_prompt}]
        plan_messages.extend(history[-6:])
        plan_messages.append({"role": "user", "content": planning_prompt})

        try:
            plan = self.llm_call(plan_messages, OLLAMA_PLAN_OPTIONS)
            print(f"[dm-plan] {plan[:200]}")

            extras = []

            # Load monster stat blocks
            for match in re.finditer(r"LOAD_MONSTER:\s*(.+?)(?:\n|$)", plan, re.IGNORECASE):
                name = match.group(1).strip().rstrip(".")
                stats = _load_monster_stat_block(name)
                if stats:
                    extras.append(f"[LOADED STAT BLOCK: {name}]\n{stats}")

            # Load NPC tables
            if "LOAD_NPC_TABLES" in plan.upper():
                for fname in ["npc-names.json", "npc-appearance.json", "npc-mannerisms.json"]:
                    fpath = os.path.join(DND_DATA_DIR, "npc", fname)
                    try:
                        with open(fpath, encoding="utf-8") as f:
                            data = json.load(f)
                        extras.append(f"[{fname}]\n{json.dumps(data)[:8000]}")
                    except Exception:
                        pass

            # Calculate encounter difficulty
            for match in re.finditer(r"CALCULATE_ENCOUNTER:\s*(.+?)(?:\n|$)", plan, re.IGNORECASE):
                try:
                    monsters = []
                    for part in match.group(1).strip().rstrip(".").split(","):
                        part = part.strip()
                        if "x" in part:
                            name, count = part.rsplit("x", 1)
                            monsters.append((name.strip(), int(count.strip())))
                        else:
                            monsters.append((part, 1))
                    party_size = len(self._player_names) or 2
                    party_level = self._get_party_level()
                    result = _calculate_encounter_difficulty(party_size, party_level, monsters)
                    extras.append(f"[ENCOUNTER BALANCE]\n{result}")
                except Exception as e:
                    print(f"[dm-plan] Encounter calc failed: {e}")

            # Generate loot
            for match in re.finditer(r"GENERATE_LOOT:\s*(.+?)(?:\n|$)", plan, re.IGNORECASE):
                try:
                    spec = match.group(1).strip().rstrip(".").lower()
                    is_hoard = "hoard" in spec
                    cr_text = spec.replace("hoard", "").strip()
                    result = self._generate_loot(cr_text, is_hoard)
                    extras.append(f"[GENERATED LOOT]\n{result}")
                except Exception as e:
                    print(f"[dm-plan] Loot generation failed: {e}")

            # Rest mechanics
            for match in re.finditer(r"REST_SHORT:\s*(.+?)(?:\n|$)", plan, re.IGNORECASE):
                char_name = match.group(1).strip().rstrip(".")
                result = self._resolve_short_rest(char_name)
                extras.append(f"[SHORT REST: {char_name}]\n{result}")

            for match in re.finditer(r"REST_LONG:\s*(.+?)(?:\n|$)", plan, re.IGNORECASE):
                char_name = match.group(1).strip().rstrip(".")
                result = self._resolve_long_rest(char_name)
                extras.append(f"[LONG REST: {char_name}]\n{result}")

            if extras:
                plan += "\n\n" + "\n\n".join(extras)
            return plan
        except Exception as e:
            print(f"[dm-plan] Planning failed: {e}")
            return None

    # ── Game State ────────────────────────────────────────────────────

    def _load_gamestate(self) -> dict:
        """Load existing game state from today's file."""
        today = datetime.date.today().isoformat()
        try:
            if os.path.exists(GAMESTATE_FILE):
                with open(GAMESTATE_FILE, encoding="utf-8") as f:
                    data = json.load(f)
                if data.get("date") == today:
                    return data
        except Exception as e:
            print(f"[dnd_dm] Failed to load gamestate: {e}")
        return {"date": today, "characters": {}}

    def _save_gamestate(self):
        """Persist current game state to disk."""
        if not self._gamestate:
            return
        try:
            os.makedirs(GAMESTATE_DIR, exist_ok=True)
            with open(GAMESTATE_FILE, "w", encoding="utf-8") as f:
                json.dump(self._gamestate, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[dnd_dm] Failed to save gamestate: {e}")

    def _parse_gamestate(self, text: str) -> str:
        """Extract gamestate blocks, apply updates, strip from display text."""
        pattern = r"```gamestate\s*\n?(.*?)\n?```"
        matches = re.findall(pattern, text, re.DOTALL)

        for match in matches:
            try:
                data = json.loads(match.strip())
                updates = data.get("updates", [])
                if not self._gamestate:
                    self._gamestate = {"date": datetime.date.today().isoformat(), "characters": {}}

                for update in updates:
                    char = update.get("character", "")
                    field = update.get("field", "")
                    value = update.get("value")
                    if not char or not field:
                        continue

                    if char not in self._gamestate["characters"]:
                        self._gamestate["characters"][char] = {}
                    char_state = self._gamestate["characters"][char]

                    if field.startswith("spell_slots."):
                        level = field.split(".")[1]
                        if "spell_slots" not in char_state:
                            char_state["spell_slots"] = {}
                        char_state["spell_slots"][level] = value
                    elif field == "conditions":
                        char_state["conditions"] = value if isinstance(value, list) else [value]
                    elif field == "inventory_add":
                        if "inventory" not in char_state:
                            char_state["inventory"] = []
                        char_state["inventory"].append(f"+{value}")
                    elif field == "inventory_remove":
                        if "inventory" not in char_state:
                            char_state["inventory"] = []
                        char_state["inventory"].append(f"-{value}")
                    else:
                        char_state[field] = value

                self._save_gamestate()
            except (json.JSONDecodeError, Exception) as e:
                print(f"[dnd_dm] Gamestate parse error: {e}")

        text = re.sub(pattern, "", text, flags=re.DOTALL)
        return re.sub(r"\n{3,}", "\n\n", text).strip()

    def get_gamestate(self) -> dict:
        """Return current game state dict."""
        return self._gamestate or self._load_gamestate()

    def get_player_names(self) -> list[str]:
        """Return list of player character names."""
        return self._player_names

    def _get_party_level(self) -> int:
        """Extract party level from DnD context."""
        if self._dnd_context:
            m = re.search(r"Level (\d+)", self._dnd_context)
            if m:
                return int(m.group(1))
        return 1

    # ── Loot & Rest (same logic as original agent.py) ─────────────────

    INDIVIDUAL_TREASURE = {
        "0-4": [
            {"roll": (1, 30), "coins": "5d6 cp"},
            {"roll": (31, 60), "coins": "4d6 sp"},
            {"roll": (61, 70), "coins": "3d6 ep"},
            {"roll": (71, 95), "coins": "3d6 gp"},
            {"roll": (96, 100), "coins": "1d6 pp"},
        ],
        "5-10": [
            {"roll": (1, 30), "coins": "4d6x100 cp, 1d6x10 ep"},
            {"roll": (31, 60), "coins": "6d6x10 sp, 2d6x10 gp"},
            {"roll": (61, 70), "coins": "3d6x10 ep, 2d6x10 gp"},
            {"roll": (71, 95), "coins": "4d6x10 gp"},
            {"roll": (96, 100), "coins": "2d6x10 gp, 3d6 pp"},
        ],
        "11-16": [
            {"roll": (1, 20), "coins": "4d6x100 sp, 1d6x100 gp"},
            {"roll": (21, 35), "coins": "1d6x100 ep, 1d6x100 gp"},
            {"roll": (36, 75), "coins": "2d6x100 gp, 1d6x10 pp"},
            {"roll": (76, 100), "coins": "2d6x100 gp, 2d6x10 pp"},
        ],
        "17+": [
            {"roll": (1, 15), "coins": "2d6x1000 ep, 8d6x100 gp"},
            {"roll": (16, 55), "coins": "1d6x1000 gp, 1d6x100 pp"},
            {"roll": (56, 100), "coins": "1d6x1000 gp, 2d6x100 pp"},
        ],
    }

    HOARD_TREASURE = {
        "0-4": {"coins": "6d6x100 cp, 3d6x100 sp, 2d6x10 gp", "extras": "1d6 trinkets, 10% chance of 1 uncommon magic item"},
        "5-10": {"coins": "2d6x100 cp, 2d6x1000 sp, 6d6x100 gp, 3d6x10 pp", "extras": "1d4 uncommon magic items, 10% chance of 1 rare magic item"},
        "11-16": {"coins": "4d6x1000 gp, 5d6x100 pp", "extras": "1d4 rare magic items, 10% chance of 1 very rare magic item"},
        "17+": {"coins": "12d6x1000 gp, 8d6x1000 pp", "extras": "1d4 very rare magic items, 25% chance of 1 legendary magic item"},
    }

    def _generate_loot(self, cr_bracket: str, is_hoard: bool = False) -> str:
        """Generate loot from DMG treasure tables."""
        bracket = cr_bracket.strip()
        if bracket not in ("0-4", "5-10", "11-16", "17+"):
            try:
                cr = int(bracket)
                bracket = "0-4" if cr <= 4 else "5-10" if cr <= 10 else "11-16" if cr <= 16 else "17+"
            except ValueError:
                bracket = "0-4"

        result_parts = []
        if is_hoard:
            hoard = self.HOARD_TREASURE.get(bracket, self.HOARD_TREASURE["0-4"])
            result_parts.append(f"Hoard Treasure (CR {bracket}):")
            result_parts.append(f"  Coins: {hoard['coins']}")
            result_parts.append(f"  Extras: {hoard['extras']}")
        else:
            table = self.INDIVIDUAL_TREASURE.get(bracket, self.INDIVIDUAL_TREASURE["0-4"])
            roll = random.randint(1, 100)
            for entry in table:
                if entry["roll"][0] <= roll <= entry["roll"][1]:
                    result_parts.append(f"Individual Treasure (CR {bracket}, rolled {roll}):")
                    result_parts.append(f"  Coins: {entry['coins']}")
                    break

        if is_hoard:
            try:
                rarity = {"0-4": "uncommon", "5-10": "rare", "11-16": "very rare", "17+": "legendary"}[bracket]
                items_file = os.path.join(DND_DATA_DIR, "equipment", "magic-items.json")
                with open(items_file, encoding="utf-8") as f:
                    all_items = json.load(f)
                matching = [i for i in all_items if i.get("rarity", "").lower() == rarity]
                if matching:
                    item = random.choice(matching)
                    result_parts.append(f"  Magic Item: {item['name']} ({item['rarity']}) — {item['description'][:120]}...")
            except Exception:
                pass

        try:
            trinkets_file = os.path.join(DND_DATA_DIR, "equipment", "trinkets.json")
            with open(trinkets_file, encoding="utf-8") as f:
                trinkets = json.load(f)
            if trinkets:
                result_parts.append(f"  Trinket: {random.choice(trinkets)}")
        except Exception:
            pass

        return "\n".join(result_parts) if result_parts else "No loot generated."

    def _resolve_short_rest(self, character_name: str) -> str:
        """Calculate short rest recovery."""
        if not self._gamestate:
            return f"{character_name} takes a short rest. They can spend hit dice to heal."
        char_state = self._gamestate.get("characters", {}).get(character_name, {})
        hit_dice_remaining = char_state.get("hit_dice_remaining")
        hit_dice_size = char_state.get("hit_dice_size", "d8")
        hp = char_state.get("hp", "?")
        hp_max = char_state.get("hp_max", "?")
        lines = [f"Short Rest for {character_name}:"]
        if hit_dice_remaining is not None:
            lines.append(f"  Hit Dice Remaining: {hit_dice_remaining} ({hit_dice_size})")
        else:
            lines.append(f"  Hit Dice: Unknown — ask the player.")
        lines.append(f"  Current HP: {hp}/{hp_max}")
        lines.append(f"  Ask how many hit dice to spend, then roll healing.")
        return "\n".join(lines)

    def _resolve_long_rest(self, character_name: str) -> str:
        """Calculate long rest recovery."""
        if not self._gamestate:
            return f"{character_name} takes a long rest. Full HP restored, all spell slots restored."
        char_state = self._gamestate.get("characters", {}).get(character_name, {})
        hp_max = char_state.get("hp_max", "?")
        hit_dice_max = char_state.get("hit_dice_max")
        hit_dice_remaining = char_state.get("hit_dice_remaining")
        lines = [f"Long Rest for {character_name}:"]
        lines.append(f"  HP: Restored to {hp_max}")
        lines.append(f"  Spell Slots: All restored")
        lines.append(f"  Conditions: All removed")
        if hit_dice_max is not None and hit_dice_remaining is not None:
            recovery = max(1, hit_dice_max // 2)
            new_remaining = min(hit_dice_max, hit_dice_remaining + recovery)
            lines.append(f"  Hit Dice: Recover {recovery} → now {new_remaining}/{hit_dice_max}")
        return "\n".join(lines)

    def generate_session_recap(self, messages: list[dict]) -> str:
        """Generate a narrative recap from session messages."""
        recent = messages[-30:] if len(messages) > 30 else messages
        recap_messages = [
            {"role": msg.get("role", "user"), "content": msg.get("text", "")[:500]}
            for msg in recent if msg.get("text")
        ]
        prompt = (
            "You are a D&D narrator. Summarize this session in 3-5 sentences as a 'Previously on...' recap. "
            "Focus on: where the party is, what they've accomplished, any ongoing threats."
        )
        msgs = [{"role": "system", "content": prompt}]
        msgs.extend(recap_messages)
        msgs.append({"role": "user", "content": "Generate the recap now."})
        try:
            return self.llm_call(msgs, OLLAMA_PLAN_OPTIONS)
        except Exception as e:
            print(f"[dnd_dm] Recap failed: {e}")
            return ""


def create_dnd_dm_agent(scratchpad, services, socketio=None):
    """Factory function to create the DnD DM agent."""
    config = AgentConfig(
        name="dnd_dm",
        display_name="Dungeon Master",
        system_prompt=DM_BASE_PROMPT,
        temperature=0.9,
        tools=["read_file", "list_directory"],
        services=[],
        max_turns=1,
        can_nest=False,
    )
    return DndDmAgent(config, scratchpad, services, socketio)
