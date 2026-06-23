"""D&D DM data helpers — extracted from agent.py (2026-06-22).

Encounter/monster/character math + lightweight DM data-context building. These
have nothing to do with LLM routing, so they live here next to the D&D engine
instead of in the generic agent brain. agent.py re-exports them for backward
compatibility. (BMO-SUGGESTIONS.)
"""
import json
import os
import platform

# Paths BMO has explicit read access to
if platform.system() == "Windows":
    DND_DATA_DIR = os.environ.get("DND_DATA_DIR", r"C:\Users\evilp\dnd\src\renderer\public\data\5e")
else:
    DND_DATA_DIR = os.environ.get("DND_DATA_DIR", "/opt/dnd-project/src/renderer/public/data/5e")


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
