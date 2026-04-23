"""Encounter generator agent — creates CR-appropriate random encounters."""

from __future__ import annotations

import json
import os
import random
from typing import Any

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

from agent import DND_DATA_DIR, _calculate_encounter_difficulty, _load_monster_stat_block


ENCOUNTER_PROMPT = """You are an encounter design specialist for D&D 5e (2024 rules).
Given a party level, environment, and difficulty, you generate balanced combat encounters.

You have access to the full Monster Manual. When designing encounters:
1. Pick monsters that fit the environment and narrative
2. Verify the encounter CR budget using the XP thresholds
3. Include tactical notes (terrain advantages, monster tactics, lair features)
4. Suggest interesting complications or twists

Output format:
- Monster list with count and CR
- Total XP and difficulty rating
- Tactical setup description
- Optional: environmental hazards, time pressure, or retreat conditions"""


ENVIRONMENTS = [
    "forest", "cave", "dungeon", "swamp", "mountain", "desert",
    "urban", "underwater", "planar", "arctic", "coastal", "grassland",
]

# Common monsters by environment and CR range
ENV_MONSTERS = {
    "forest": {
        "low": ["wolf", "giant-spider", "goblin", "twig-blight", "vine-blight"],
        "mid": ["owlbear", "dire-wolf", "ettercap", "green-hag", "displacer-beast"],
        "high": ["treant", "young-green-dragon", "unicorn"],
    },
    "cave": {
        "low": ["kobold", "giant-rat", "darkmantle", "stirge", "piercer"],
        "mid": ["hook-horror", "basilisk", "mimic", "rust-monster", "carrion-crawler"],
        "high": ["beholder", "mind-flayer", "umber-hulk"],
    },
    "dungeon": {
        "low": ["skeleton", "zombie", "animated-armor", "flying-sword", "mimic"],
        "mid": ["wraith", "flameskull", "helmed-horror", "mummy"],
        "high": ["lich", "death-knight", "demilich"],
    },
    "swamp": {
        "low": ["crocodile", "giant-frog", "lizardfolk", "mud-mephit"],
        "mid": ["shambling-mound", "hydra", "troll", "green-hag"],
        "high": ["black-dragon-wyrmling", "young-black-dragon"],
    },
}


class EncounterAgent(BaseAgent):
    """Generates CR-appropriate random encounters for the party."""

    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        # Parse party info from context or message
        party_level = 5
        party_size = 4
        environment = "dungeon"
        difficulty = "moderate"

        lower = message.lower()
        for env in ENVIRONMENTS:
            if env in lower:
                environment = env
                break

        for diff in ["easy", "low", "moderate", "medium", "hard", "deadly", "high"]:
            if diff in lower:
                difficulty = diff
                break

        # Extract level from message
        import re
        level_match = re.search(r"level\s*(\d+)", lower)
        if level_match:
            party_level = int(level_match.group(1))

        size_match = re.search(r"(\d+)\s*(?:player|character|pc|party)", lower)
        if size_match:
            party_size = int(size_match.group(1))

        # Generate encounter
        encounter = self._generate_encounter(party_level, party_size, environment, difficulty)

        # Use LLM to add narrative flavor
        system = ENCOUNTER_PROMPT
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": (
                f"Generate a {difficulty} encounter for {party_size} level {party_level} "
                f"characters in a {environment} setting.\n\n"
                f"Pre-selected monsters and balance info:\n{encounter}\n\n"
                f"Add narrative flavor, tactical notes, and any interesting twists. "
                f"Keep it concise — this is for a DM to use at the table."
            )},
        ]
        reply = self.llm_call(messages)
        full_response = f"{encounter}\n\n{reply}"

        return AgentResult(text=full_response, agent_name=self.config.name)

    def _generate_encounter(self, party_level: int, party_size: int, environment: str, difficulty: str) -> str:
        """Generate a mechanically balanced encounter."""
        env_monsters = ENV_MONSTERS.get(environment, ENV_MONSTERS["dungeon"])

        if party_level <= 4:
            tier = "low"
        elif party_level <= 10:
            tier = "mid"
        else:
            tier = "high"

        pool = env_monsters.get(tier, env_monsters["low"])
        if not pool:
            pool = ["goblin", "skeleton"]

        # Pick 1-3 monster types
        num_types = random.randint(1, min(3, len(pool)))
        selected = random.sample(pool, num_types)

        # Determine counts based on difficulty
        base_count = {"easy": 1, "low": 2, "moderate": 3, "medium": 3, "hard": 4, "deadly": 5, "high": 5}
        count_base = base_count.get(difficulty, 3)

        monsters = []
        for monster_id in selected:
            count = max(1, count_base + random.randint(-1, 1))
            stat_block = _load_monster_stat_block(monster_id.replace("-", " "))
            if stat_block:
                monsters.append((monster_id.replace("-", " ").title(), count))
            else:
                monsters.append((monster_id.replace("-", " ").title(), count))

        # Calculate difficulty
        monster_tuples = [(name, count) for name, count in monsters]
        balance = _calculate_encounter_difficulty(party_size, party_level, monster_tuples)

        lines = [f"Encounter ({environment.title()}, {difficulty.title()}):", ""]
        for name, count in monsters:
            lines.append(f"  {count}x {name}")
        lines.append("")
        lines.append(f"Balance: {balance}")

        return "\n".join(lines)


def create_encounter_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="encounter",
        display_name="Encounter Generator",
        system_prompt=ENCOUNTER_PROMPT,
        temperature=0.8,
        tools=["read_file", "list_directory"],
        services=[],
        max_turns=1,
        can_nest=False,
    )
    return EncounterAgent(config, scratchpad, services, socketio)
