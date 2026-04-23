"""Treasure generator agent — generates level-appropriate loot."""

from __future__ import annotations

import json
import os
import random
import re
from typing import Any

from agents.base_agent import AgentConfig, AgentResult, BaseAgent

from agent import DND_DATA_DIR


TREASURE_PROMPT = """You are a D&D 5e treasure generation specialist. You create
level-appropriate loot using the DMG 2024 treasure tables.

When generating treasure:
1. Use the correct DMG treasure table for the CR bracket
2. Roll on the appropriate individual or hoard table
3. For magic items, pick thematically appropriate items
4. Include interesting non-mechanical flavor items (trinkets, art objects, gems)
5. Consider the encounter context — a dragon hoard is different from a bandit camp
6. Format the output clearly for the DM to read at the table

CR Brackets: 0-4, 5-10, 11-16, 17+
Types: Individual (per creature), Hoard (boss/lair treasure)"""


# Gem value tables from DMG
GEM_TABLES = {
    10: ["Azurite", "Blue Quartz", "Eye Agate", "Hematite", "Lapis Lazuli",
         "Malachite", "Moss Agate", "Obsidian", "Rhodochrosite", "Tiger Eye"],
    50: ["Bloodstone", "Carnelian", "Chalcedony", "Chrysoprase", "Citrine",
         "Jasper", "Moonstone", "Onyx", "Quartz", "Sardonyx", "Star Rose Quartz", "Zircon"],
    100: ["Amber", "Amethyst", "Chrysoberyl", "Coral", "Garnet", "Jade",
          "Jet", "Pearl", "Spinel", "Tourmaline"],
    500: ["Alexandrite", "Aquamarine", "Black Pearl", "Blue Spinel",
          "Peridot", "Topaz"],
    1000: ["Black Opal", "Blue Sapphire", "Emerald", "Fire Opal",
           "Opal", "Star Ruby", "Star Sapphire", "Yellow Sapphire"],
    5000: ["Black Sapphire", "Diamond", "Jacinth", "Ruby"],
}

ART_OBJECTS = {
    25: ["Silver ewer", "Carved bone statuette", "Small gold bracelet",
         "Cloth-of-gold vestments", "Black velvet mask with silver filigree"],
    250: ["Gold ring with bloodstone", "Carved ivory statuette",
          "Large gold bracelet", "Silver necklace with gemstone pendant"],
    750: ["Silver chalice with moonstones", "Gold-inlaid scimitar",
          "Silk robe embroidered with gold thread", "Jeweled gold crown"],
    2500: ["Fine gold chain with fire opal", "Old masterpiece painting",
           "Embroidered silk gloves with jewels", "Gold music box"],
    7500: ["Jeweled gold crown", "Gold and sapphire circlet",
           "Platinum ring with diamonds", "Gold dragon figurine with rubies"],
}

INDIVIDUAL_TREASURE = {
    "0-4": [
        (30, "5d6 cp"), (60, "4d6 sp"), (70, "3d6 ep"),
        (95, "3d6 gp"), (100, "1d6 pp"),
    ],
    "5-10": [
        (30, "4d6x100 cp, 1d6x10 ep"), (60, "6d6x10 sp, 2d6x10 gp"),
        (70, "3d6x10 ep, 2d6x10 gp"), (95, "4d6x10 gp"), (100, "2d6x10 gp, 3d6 pp"),
    ],
    "11-16": [
        (20, "4d6x100 sp, 1d6x100 gp"), (35, "1d6x100 ep, 1d6x100 gp"),
        (75, "2d6x100 gp, 1d6x10 pp"), (100, "2d6x100 gp, 2d6x10 pp"),
    ],
    "17+": [
        (15, "2d6x1000 ep, 8d6x100 gp"), (55, "1d6x1000 gp, 1d6x100 pp"),
        (100, "1d6x1000 gp, 2d6x100 pp"),
    ],
}


def _roll_dice(formula: str) -> int:
    """Simple dice roller: 3d6, 2d6x100, etc."""
    formula = formula.strip()
    multiplier = 1
    if "x" in formula:
        parts = formula.split("x")
        formula = parts[0]
        multiplier = int(parts[1])
    match = re.match(r"(\d+)d(\d+)", formula)
    if match:
        count, sides = int(match.group(1)), int(match.group(2))
        total = sum(random.randint(1, sides) for _ in range(count))
        return total * multiplier
    return 0


class TreasureAgent(BaseAgent):
    """Generates level-appropriate treasure and loot."""

    def run(self, message: str, history: list[dict], context: dict | None = None) -> AgentResult:
        lower = message.lower()

        # Parse CR bracket
        cr_bracket = "0-4"
        cr_match = re.search(r"cr\s*(\d+)", lower)
        level_match = re.search(r"level\s*(\d+)", lower)
        if cr_match:
            cr = int(cr_match.group(1))
            cr_bracket = "0-4" if cr <= 4 else "5-10" if cr <= 10 else "11-16" if cr <= 16 else "17+"
        elif level_match:
            level = int(level_match.group(1))
            cr_bracket = "0-4" if level <= 4 else "5-10" if level <= 10 else "11-16" if level <= 16 else "17+"

        is_hoard = "hoard" in lower

        # Generate mechanical loot
        loot = self._generate_loot(cr_bracket, is_hoard)

        # Use LLM to add flavor
        system = TREASURE_PROMPT
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": (
                f"Generate {'a treasure hoard' if is_hoard else 'individual treasure'} "
                f"for CR bracket {cr_bracket}.\n\n"
                f"Rolled treasure:\n{loot}\n\n"
                f"Original request: {message}\n\n"
                f"Add flavor descriptions for each item. Make the treasure feel "
                f"thematically appropriate and interesting. Keep it concise."
            )},
        ]
        reply = self.llm_call(messages)
        full = f"{loot}\n\n{reply}"

        return AgentResult(text=full, agent_name=self.config.name)

    def _generate_loot(self, cr_bracket: str, is_hoard: bool) -> str:
        """Roll on DMG treasure tables."""
        lines = []

        if is_hoard:
            lines.append(f"Treasure Hoard (CR {cr_bracket})")
            lines.append("=" * 30)

            # Coins
            coin_table = {
                "0-4": "6d6x100 cp, 3d6x100 sp, 2d6x10 gp",
                "5-10": "2d6x100 cp, 2d6x1000 sp, 6d6x100 gp, 3d6x10 pp",
                "11-16": "4d6x1000 gp, 5d6x100 pp",
                "17+": "12d6x1000 gp, 8d6x1000 pp",
            }
            coin_formula = coin_table.get(cr_bracket, coin_table["0-4"])
            for part in coin_formula.split(", "):
                parts = part.strip().split()
                amount = _roll_dice(parts[0])
                denom = parts[1] if len(parts) > 1 else "gp"
                lines.append(f"  {amount} {denom}")

            # Gems
            gem_value = {
                "0-4": 10, "5-10": 50, "11-16": 500, "17+": 5000
            }.get(cr_bracket, 10)
            gem_count = random.randint(1, 6)
            gems = random.sample(
                GEM_TABLES.get(gem_value, GEM_TABLES[10]),
                min(gem_count, len(GEM_TABLES.get(gem_value, GEM_TABLES[10])))
            )
            lines.append(f"\n  Gems ({gem_value} gp each):")
            for gem in gems:
                lines.append(f"    {gem}")

            # Art objects
            art_value = {
                "0-4": 25, "5-10": 250, "11-16": 750, "17+": 7500
            }.get(cr_bracket, 25)
            art_count = random.randint(1, 4)
            arts = random.sample(
                ART_OBJECTS.get(art_value, ART_OBJECTS[25]),
                min(art_count, len(ART_OBJECTS.get(art_value, ART_OBJECTS[25])))
            )
            lines.append(f"\n  Art Objects ({art_value} gp each):")
            for art in arts:
                lines.append(f"    {art}")

            # Magic items
            rarity = {"0-4": "uncommon", "5-10": "rare", "11-16": "very rare", "17+": "legendary"}
            lines.append(f"\n  Magic Items: Roll for {random.randint(1, 4)} {rarity.get(cr_bracket, 'uncommon')} items")

        else:
            lines.append(f"Individual Treasure (CR {cr_bracket})")
            lines.append("=" * 30)

            table = INDIVIDUAL_TREASURE.get(cr_bracket, INDIVIDUAL_TREASURE["0-4"])
            d100 = random.randint(1, 100)
            for threshold, formula in table:
                if d100 <= threshold:
                    lines.append(f"  Rolled: {d100}")
                    for part in formula.split(", "):
                        parts = part.strip().split()
                        amount = _roll_dice(parts[0])
                        denom = parts[1] if len(parts) > 1 else "gp"
                        lines.append(f"  {amount} {denom}")
                    break

        return "\n".join(lines)


def create_treasure_agent(scratchpad, services, socketio=None):
    config = AgentConfig(
        name="treasure",
        display_name="Treasure Generator",
        system_prompt=TREASURE_PROMPT,
        temperature=0.7,
        tools=["read_file"],
        services=[],
        max_turns=1,
        can_nest=False,
    )
    return TreasureAgent(config, scratchpad, services, socketio)
