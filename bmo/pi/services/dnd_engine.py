"""
Deterministic D&D 5e Rules Engine for BMO Agent Tool Calling.

Pure Python — no LLM calls. All mechanics are resolved deterministically
(with random dice rolls). Designed to be invoked by the agent's tool system.
"""

import random
import re
import math
from typing import Optional


# ---------------------------------------------------------------------------
# XP thresholds per party-member level (DMG 2024, p. 92)
# ---------------------------------------------------------------------------

XP_THRESHOLDS: dict[int, dict[str, int]] = {
    1:  {"easy": 25,   "medium": 50,   "hard": 75,    "deadly": 100},
    2:  {"easy": 50,   "medium": 100,  "hard": 150,   "deadly": 200},
    3:  {"easy": 75,   "medium": 150,  "hard": 225,   "deadly": 400},
    4:  {"easy": 125,  "medium": 250,  "hard": 375,   "deadly": 500},
    5:  {"easy": 250,  "medium": 500,  "hard": 750,   "deadly": 1100},
    6:  {"easy": 300,  "medium": 600,  "hard": 900,   "deadly": 1400},
    7:  {"easy": 350,  "medium": 750,  "hard": 1100,  "deadly": 1700},
    8:  {"easy": 450,  "medium": 900,  "hard": 1400,  "deadly": 2100},
    9:  {"easy": 550,  "medium": 1100, "hard": 1600,  "deadly": 2400},
    10: {"easy": 600,  "medium": 1200, "hard": 1900,  "deadly": 2800},
    11: {"easy": 800,  "medium": 1600, "hard": 2400,  "deadly": 3600},
    12: {"easy": 1000, "medium": 2000, "hard": 3000,  "deadly": 4500},
    13: {"easy": 1100, "medium": 2200, "hard": 3400,  "deadly": 5100},
    14: {"easy": 1250, "medium": 2500, "hard": 3800,  "deadly": 5700},
    15: {"easy": 1400, "medium": 2800, "hard": 4300,  "deadly": 6400},
    16: {"easy": 1600, "medium": 3200, "hard": 4800,  "deadly": 7200},
    17: {"easy": 2000, "medium": 3900, "hard": 5900,  "deadly": 8800},
    18: {"easy": 2100, "medium": 4200, "hard": 6300,  "deadly": 9500},
    19: {"easy": 2400, "medium": 4900, "hard": 7300,  "deadly": 10900},
    20: {"easy": 2800, "medium": 5700, "hard": 8500,  "deadly": 12700},
}

# Encounter multipliers based on number of monsters (DMG 2024, p. 92)
ENCOUNTER_MULTIPLIERS: list[tuple[int, float]] = [
    (1, 1.0),
    (2, 1.5),
    (3, 2.0),
    (7, 2.5),
    (11, 3.0),
    (15, 4.0),
]

# All standard 5e conditions
CONDITIONS = [
    "blinded", "charmed", "deafened", "exhaustion", "frightened",
    "grappled", "incapacitated", "invisible", "paralyzed", "petrified",
    "poisoned", "prone", "restrained", "stunned", "unconscious",
]


# ---------------------------------------------------------------------------
# Dice rolling
# ---------------------------------------------------------------------------

def roll_dice(expression: str) -> dict:
    """Parse and roll dice expressions like '2d6+5', '4d8 fire', '1d20'.

    Supports: NdM, NdM+K, NdM-K, plain numbers, and an optional trailing
    damage-type word (e.g. '2d6+3 fire').

    Returns:
        {
            "total": int,
            "rolls": list[int],       # individual die results
            "expression": str,         # cleaned expression (no damage type)
            "damage_type": str | None  # e.g. "fire", "cold", None
        }
    """
    expr = expression.strip()

    # Extract optional trailing damage type (a word that isn't part of the dice notation)
    damage_type: Optional[str] = None
    type_match = re.search(r'\s+([a-zA-Z]+)$', expr)
    if type_match:
        candidate = type_match.group(1).lower()
        # Only treat it as a damage type if the rest is a valid dice/number expression
        rest = expr[:type_match.start()].strip()
        if re.match(r'^[\dd+\-\s]+$', rest, re.IGNORECASE):
            damage_type = candidate
            expr = rest

    all_rolls: list[int] = []
    total = 0

    # Tokenize into additive / subtractive parts: e.g. "2d6+5-1d4" -> [('+','2d6'), ('+','5'), ('-','1d4')]
    tokens: list[tuple[str, str]] = []
    # Normalize: ensure expression starts with a sign
    normalized = expr.replace(" ", "")
    if normalized and normalized[0] not in ('+', '-'):
        normalized = '+' + normalized

    for sign, part in re.findall(r'([+\-])\s*(\d+(?:d\d+)?)', normalized, re.IGNORECASE):
        tokens.append((sign, part))

    for sign, part in tokens:
        multiplier = 1 if sign == '+' else -1
        dice_match = re.match(r'^(\d+)d(\d+)$', part, re.IGNORECASE)
        if dice_match:
            count = int(dice_match.group(1))
            sides = int(dice_match.group(2))
            for _ in range(count):
                roll = random.randint(1, sides)
                all_rolls.append(roll)
                total += roll * multiplier
        else:
            total += int(part) * multiplier

    return {
        "total": total,
        "rolls": all_rolls,
        "expression": expr,
        "damage_type": damage_type,
    }


# ---------------------------------------------------------------------------
# Attack resolution
# ---------------------------------------------------------------------------

def calculate_attack(
    attacker_bonus: int,
    target_ac: int,
    advantage: str = "none",
) -> dict:
    """Resolve a full attack roll.

    Args:
        attacker_bonus: Total attack modifier (ability + proficiency + magic, etc.)
        target_ac: Target's Armor Class.
        advantage: 'none' | 'advantage' | 'disadvantage'

    Returns:
        {
            "hit": bool,
            "critical": bool,
            "natural_roll": int,     # the d20 result used
            "total_roll": int,       # natural_roll + attacker_bonus
            "target_ac": int
        }
    """
    roll1 = random.randint(1, 20)
    roll2 = random.randint(1, 20)

    if advantage == "advantage":
        natural = max(roll1, roll2)
    elif advantage == "disadvantage":
        natural = min(roll1, roll2)
    else:
        natural = roll1

    critical = natural == 20
    fumble = natural == 1

    total = natural + attacker_bonus
    hit = critical or (not fumble and total >= target_ac)

    return {
        "hit": hit,
        "critical": critical,
        "natural_roll": natural,
        "total_roll": total,
        "target_ac": target_ac,
    }


# ---------------------------------------------------------------------------
# Damage calculation
# ---------------------------------------------------------------------------

def calculate_damage(
    dice_expr: str,
    damage_type: str,
    resistances: Optional[list[str]] = None,
    vulnerabilities: Optional[list[str]] = None,
    immunities: Optional[list[str]] = None,
) -> dict:
    """Calculate damage accounting for resistance, vulnerability, and immunity.

    Order of application (PHB 2024):
        1. Immunity -> 0 damage
        2. Resistance -> halved (floor)
        3. Vulnerability -> doubled

    Returns:
        {
            "raw_damage": int,
            "final_damage": int,
            "damage_type": str,
            "modifier": str          # 'normal' | 'immune' | 'resistant' | 'vulnerable'
        }
    """
    resistances = [r.lower() for r in (resistances or [])]
    vulnerabilities = [v.lower() for v in (vulnerabilities or [])]
    immunities = [i.lower() for i in (immunities or [])]

    result = roll_dice(dice_expr)
    raw = max(0, result["total"])
    dtype = damage_type.lower()
    modifier = "normal"

    if dtype in immunities:
        return {
            "raw_damage": raw,
            "final_damage": 0,
            "damage_type": damage_type,
            "modifier": "immune",
        }

    final = raw

    if dtype in resistances:
        final = final // 2
        modifier = "resistant"

    if dtype in vulnerabilities:
        final = final * 2
        modifier = "vulnerable"

    return {
        "raw_damage": raw,
        "final_damage": max(0, final),
        "damage_type": damage_type,
        "modifier": modifier,
    }


# ---------------------------------------------------------------------------
# Saving throws
# ---------------------------------------------------------------------------

def resolve_saving_throw(
    modifier: int,
    proficiency_bonus: int,
    is_proficient: bool,
    dc: int,
    advantage: str = "none",
) -> dict:
    """Resolve a saving throw.

    Args:
        modifier: Ability modifier (e.g. CON mod).
        proficiency_bonus: Character's proficiency bonus.
        is_proficient: Whether the character is proficient in this save.
        dc: Difficulty Class to beat.
        advantage: 'none' | 'advantage' | 'disadvantage'

    Returns:
        {"success": bool, "natural_roll": int, "total": int, "dc": int}
    """
    roll1 = random.randint(1, 20)
    roll2 = random.randint(1, 20)

    if advantage == "advantage":
        natural = max(roll1, roll2)
    elif advantage == "disadvantage":
        natural = min(roll1, roll2)
    else:
        natural = roll1

    bonus = modifier + (proficiency_bonus if is_proficient else 0)
    total = natural + bonus

    return {
        "success": total >= dc,
        "natural_roll": natural,
        "total": total,
        "dc": dc,
    }


# ---------------------------------------------------------------------------
# Concentration
# ---------------------------------------------------------------------------

def check_concentration(damage: int) -> dict:
    """Determine the Constitution saving throw DC for maintaining concentration.

    DC = max(10, floor(damage / 2)) per PHB 2024.

    Returns:
        {"dc": int, "description": str}
    """
    dc = max(10, damage // 2)
    return {
        "dc": dc,
        "description": f"Concentration check: DC {dc} Constitution saving throw (damage taken: {damage})",
    }


# ---------------------------------------------------------------------------
# Encounter difficulty
# ---------------------------------------------------------------------------

def _get_encounter_multiplier(monster_count: int) -> float:
    """Return the encounter XP multiplier for the given number of monsters."""
    result = 1.0
    for threshold, mult in ENCOUNTER_MULTIPLIERS:
        if monster_count >= threshold:
            result = mult
    return result


def calculate_encounter_difficulty(
    monster_xps: list[int],
    party_size: int,
    party_level: int,
) -> dict:
    """XP budget analysis per DMG 2024.

    Args:
        monster_xps: List of individual monster XP values.
        party_size: Number of party members.
        party_level: Average party level (clamped to 1-20).

    Returns:
        {
            "total_xp": int,
            "adjusted_xp": int,
            "multiplier": float,
            "difficulty": str,        # 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly'
            "thresholds": dict        # party-wide XP thresholds for each difficulty
        }
    """
    level = max(1, min(20, party_level))
    total_xp = sum(monster_xps)
    multiplier = _get_encounter_multiplier(len(monster_xps))
    adjusted_xp = int(total_xp * multiplier)

    # Scale thresholds by party size
    thresholds = {
        diff: XP_THRESHOLDS[level][diff] * party_size
        for diff in ("easy", "medium", "hard", "deadly")
    }

    if adjusted_xp >= thresholds["deadly"]:
        difficulty = "deadly"
    elif adjusted_xp >= thresholds["hard"]:
        difficulty = "hard"
    elif adjusted_xp >= thresholds["medium"]:
        difficulty = "medium"
    elif adjusted_xp >= thresholds["easy"]:
        difficulty = "easy"
    else:
        difficulty = "trivial"

    return {
        "total_xp": total_xp,
        "adjusted_xp": adjusted_xp,
        "multiplier": multiplier,
        "difficulty": difficulty,
        "thresholds": thresholds,
    }


# ---------------------------------------------------------------------------
# Conditions
# ---------------------------------------------------------------------------

def apply_condition(conditions: list[str], condition: str) -> list[str]:
    """Add a condition to a creature's condition list (no duplicates).

    Returns the updated list.
    """
    cond = condition.lower()
    if cond not in [c.lower() for c in conditions]:
        conditions.append(cond)
    return conditions


def remove_condition(conditions: list[str], condition: str) -> list[str]:
    """Remove a condition from a creature's condition list.

    Returns the updated list.
    """
    cond = condition.lower()
    return [c for c in conditions if c.lower() != cond]


# ---------------------------------------------------------------------------
# Initiative Tracker
# ---------------------------------------------------------------------------

class InitiativeTracker:
    """Tracks initiative order, HP, AC, and conditions for combat encounters."""

    def __init__(self) -> None:
        self.entries: list[dict] = []
        self.current_turn: int = 0
        self.round: int = 1

    def add(
        self,
        name: str,
        initiative: int,
        hp: int,
        max_hp: int,
        ac: int,
    ) -> dict:
        """Add a creature to the initiative order.

        Entries are kept sorted by descending initiative (ties keep insertion order).

        Returns the new entry dict.
        """
        entry = {
            "name": name,
            "initiative": initiative,
            "hp": hp,
            "max_hp": max_hp,
            "ac": ac,
            "conditions": [],
        }
        self.entries.append(entry)
        # Stable sort descending by initiative
        self.entries.sort(key=lambda e: e["initiative"], reverse=True)
        return entry

    def remove(self, name: str) -> bool:
        """Remove a creature by name. Returns True if found and removed."""
        for i, entry in enumerate(self.entries):
            if entry["name"].lower() == name.lower():
                was_before_current = i < self.current_turn
                self.entries.pop(i)
                # Adjust current_turn if we removed someone before the pointer
                if was_before_current and self.current_turn > 0:
                    self.current_turn -= 1
                # Clamp
                if self.entries and self.current_turn >= len(self.entries):
                    self.current_turn = 0
                return True
        return False

    def _find(self, name: str) -> Optional[dict]:
        """Find an entry by name (case-insensitive)."""
        for entry in self.entries:
            if entry["name"].lower() == name.lower():
                return entry
        return None

    def next_turn(self) -> dict:
        """Advance to the next turn and return the now-current creature's info.

        Automatically increments the round counter when wrapping around.
        """
        if not self.entries:
            return {"error": "No entries in initiative order"}

        self.current_turn += 1
        if self.current_turn >= len(self.entries):
            self.current_turn = 0
            self.round += 1

        return self.get_current()

    def get_current(self) -> dict:
        """Return info about the creature whose turn it currently is."""
        if not self.entries:
            return {"error": "No entries in initiative order"}
        entry = self.entries[self.current_turn]
        return {
            **entry,
            "turn_index": self.current_turn,
            "round": self.round,
        }

    def damage(self, name: str, amount: int) -> dict:
        """Apply damage to a creature. HP floors at 0.

        Returns:
            {"name": str, "damage": int, "remaining_hp": int, "unconscious": bool}
        """
        entry = self._find(name)
        if entry is None:
            return {"error": f"'{name}' not found in initiative order"}

        amount = max(0, amount)
        entry["hp"] = max(0, entry["hp"] - amount)
        unconscious = entry["hp"] == 0

        if unconscious and "unconscious" not in entry["conditions"]:
            entry["conditions"].append("unconscious")

        return {
            "name": entry["name"],
            "damage": amount,
            "remaining_hp": entry["hp"],
            "unconscious": unconscious,
        }

    def heal(self, name: str, amount: int) -> dict:
        """Heal a creature. HP caps at max_hp.

        Returns:
            {"name": str, "healed": int, "remaining_hp": int}
        """
        entry = self._find(name)
        if entry is None:
            return {"error": f"'{name}' not found in initiative order"}

        amount = max(0, amount)
        old_hp = entry["hp"]
        entry["hp"] = min(entry["max_hp"], entry["hp"] + amount)
        actual_healed = entry["hp"] - old_hp

        # Remove unconscious if healed above 0
        if entry["hp"] > 0 and "unconscious" in entry["conditions"]:
            entry["conditions"].remove("unconscious")

        return {
            "name": entry["name"],
            "healed": actual_healed,
            "remaining_hp": entry["hp"],
        }

    def add_condition(self, name: str, condition: str) -> dict:
        """Add a condition to a creature in the initiative order.

        Returns:
            {"name": str, "conditions": list[str]}
        """
        entry = self._find(name)
        if entry is None:
            return {"error": f"'{name}' not found in initiative order"}
        entry["conditions"] = apply_condition(entry["conditions"], condition)
        return {"name": entry["name"], "conditions": entry["conditions"]}

    def remove_condition(self, name: str, condition: str) -> dict:
        """Remove a condition from a creature in the initiative order.

        Returns:
            {"name": str, "conditions": list[str]}
        """
        entry = self._find(name)
        if entry is None:
            return {"error": f"'{name}' not found in initiative order"}
        entry["conditions"] = remove_condition(entry["conditions"], condition)
        return {"name": entry["name"], "conditions": entry["conditions"]}

    def get_order(self) -> list[dict]:
        """Return the full initiative order with a marker for the current turn."""
        result = []
        for i, entry in enumerate(self.entries):
            result.append({
                **entry,
                "is_current": i == self.current_turn,
            })
        return result


# ---------------------------------------------------------------------------
# Spell Slot Tracker
# ---------------------------------------------------------------------------

class SpellSlotTracker:
    """Tracks spell slot expenditure and recovery for a single caster."""

    def __init__(self, slots: dict[int, int]) -> None:
        """Initialize with maximum slot counts.

        Args:
            slots: Mapping of spell level -> max slot count.
                   Example: {1: 4, 2: 3, 3: 3, 4: 1}
        """
        self.max_slots: dict[int, int] = dict(slots)
        self.current_slots: dict[int, int] = dict(slots)

    def expend(self, level: int) -> bool:
        """Expend one spell slot of the given level.

        Returns True if successful, False if no slots remain at that level.
        """
        if level not in self.current_slots:
            return False
        if self.current_slots[level] <= 0:
            return False
        self.current_slots[level] -= 1
        return True

    def restore(self, level: int, count: int = 1) -> None:
        """Restore *count* spell slots of the given level (capped at max)."""
        if level not in self.max_slots:
            return
        self.current_slots[level] = min(
            self.max_slots[level],
            self.current_slots.get(level, 0) + count,
        )

    def restore_all(self) -> None:
        """Restore all spell slots to their maximum (long rest)."""
        self.current_slots = dict(self.max_slots)

    def get_slots(self) -> dict[int, dict]:
        """Return slot status for every tracked level.

        Returns:
            {level: {"current": int, "max": int}, ...}
        """
        result: dict[int, dict] = {}
        for level in sorted(self.max_slots):
            result[level] = {
                "current": self.current_slots.get(level, 0),
                "max": self.max_slots[level],
            }
        return result
