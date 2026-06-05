// The monolithic DM_SYSTEM_PROMPT that used to live here was dead — the system
// prompt is now assembled from modular sections (prompt-assembler.ts +
// prompt-sections/*). Only these two append-on-demand context blocks remain.

/**
 * DM Toolbox context — append when environmental effects, traps, poisons,
 * diseases, or curses are active in the session.
 */
export const DM_TOOLBOX_CONTEXT = `

## DM Toolbox (DMG 2024 Chapter 3)

When the DM has activated environmental effects, traps, poisons, diseases, or curses, reference them in your narration and enforce their mechanical effects.

### Environmental Effects
When active environmental effects are listed in [ACTIVE EFFECTS] context:
- Reference them in scene descriptions (e.g., "The biting cold gnaws at exposed skin" for Extreme Cold)
- Remind players of required saves at appropriate intervals
- Extreme Cold: DC 10 CON save each hour or +1 Exhaustion. Auto-succeed with Cold resistance.
- Extreme Heat: CON save (DC 5 + 1 per hour) or +1 Exhaustion. Disadvantage in medium/heavy armor.
- Heavy Precipitation: Lightly Obscured, disadvantage on Perception. Extinguishes flames.
- Strong Wind: Disadvantage on ranged attacks, flying creatures must land at end of turn.

### Traps
When traps are placed on the map:
- Do NOT reveal trap locations unless a character succeeds on detection checks
- When triggered, narrate the effect dramatically and apply damage/conditions
- Allow detection via Perception or Investigation checks against the trap's DC
- Allow disarming via the specified method (Sleight of Hand, Thieves' Tools, etc.)

### Poisons
When poisons are referenced:
- Assassin's Blood (Ingested, DC 10): 1d12 Poison damage + Poisoned 24h
- Purple Worm Poison (Injury, DC 21): 10d6 Poison damage
- Midnight Tears (Ingested, DC 17): 9d6 Poison at midnight
- Apply the Poisoned condition: disadvantage on attack rolls and ability checks
- Harvesting: DC 20 Nature check with Poisoner's Kit, 1d6 minutes

### Diseases
When diseases are tracked on characters:
- Narrate symptoms progressively based on onset period
- Call for saves at the appropriate intervals (dawn, Long Rest, etc.)
- Track success/failure counts toward recovery
- Cackle Fever: DC 13 CON, Exhaustion + involuntary laughter on damage
- Sewer Plague: DC 11 CON at dawn, Exhaustion progression
- Sight Rot: DC 15 CON, Blindness

### Curses
When curses are tracked:
- Narrate the curse's effects subtly at first, then more overtly
- Demonic Possession: DC 15 CHA save on natural 1s, entity takes control
- Remove Curse or specific conditions end curses

### Chase Sequences
When a chase is initiated:
- Describe the environment vividly as participants dash through it
- Narrate complications with dramatic flair
- Track exhaustion from excessive dashing (free dashes = 3 + CON modifier)
`

/**
 * Optional planar cosmology context — append to the system prompt when
 * a campaign ventures beyond the Material Plane (DMG 2024 Ch6).
 */
export const PLANAR_RULES_CONTEXT = `

## Planar Travel & Cosmology (DMG 2024 Ch6)

When the campaign enters other planes of existence, enforce these rules:

### Astral Plane
- No aging. Time passes, but creatures do not age or require food/water/air.
- Silver cords connect living travelers to their bodies on the Material Plane. Severing the cord (only possible by a few rare effects like a Silver Sword of a Githyanki knight) kills the traveler instantly.
- Movement is thought-based: fly speed equals 5 × Intelligence score (in feet). Creatures with low Intelligence are nearly immobile.
- The Astral Plane contains the petrified husks of dead gods — immense stone corpses drifting in silver void.
- Gravity is subjective; a creature can choose its own "down."
- Spells that reference "other planes" function normally; spells that reference "the ground" may not work.

### Ethereal Plane
- Overlaps with the Material Plane (the Border Ethereal). Creatures in the Border Ethereal can see into the Material Plane as if through frosted glass (30 ft visibility, appears gray and indistinct).
- Ethereal creatures cannot affect or be affected by creatures on the Material Plane unless an ability specifically says otherwise (e.g., the See Invisibility spell, or a creature with the ability to enter the Ethereal).
- The Deep Ethereal is a foggy realm with no overlap. Travel through the Deep Ethereal can lead to other planes.
- Creatures in the Ethereal Plane ignore non-magical obstacles on the Material Plane — they can pass through walls and solid objects.

### Feywild
- Time distortion: DM rolls on the Feywild Time Warp table when travelers leave. Time may pass faster or slower (minutes = days, days = minutes, etc.).
- Emotional resonance: The land reflects the emotions of powerful Fey. Areas near a joyful Archfey bloom with flowers; areas near a sorrowful one are shrouded in mist and weeping willows.
- Magic behaves unpredictably: Wild Magic surges are more likely. DM may call for d20 rolls when spells are cast; on a 1, roll on the Wild Magic Surge table.
- Fey Crossings are natural portals between the Feywild and Material Plane, often in glades, fairy rings, or mist-shrouded groves.

### Shadowfell
- Despair: Creatures that finish a Long Rest in the Shadowfell must make a DC 10 Wisdom saving throw. On a failure, the creature is affected by a random Shadowfell Despair effect (Apathy: disadvantage on death saves; Dread: disadvantage on all saves; Madness: disadvantage on ability checks and attack rolls). The effect lasts until removed by Greater Restoration or leaving the Shadowfell.
- Shadow Crossings are portals from the Material Plane to the Shadowfell, typically found in dark, gloomy places: catacombs, deep caves, ruined keeps.
- Colors are muted and sounds are dampened. Vision is limited even with darkvision.
- Undead are empowered: they gain advantage on saving throws while in the Shadowfell.

### Elemental Planes (Fire, Water, Air, Earth)
- Hostile environments: Without protection, creatures take damage or suffocate.
  - **Fire:** Extreme heat. 10 fire damage per round without fire resistance/immunity.
  - **Water:** Submerged. Requires water breathing or suffocation rules apply.
  - **Air:** Endless sky. Creatures without a fly speed fall forever.
  - **Earth:** Solid rock. Creatures without burrowing or earth glide are crushed (6d6 bludgeoning per round).
- Elemental creatures are native and not hostile by default — they respond to trespassers based on intent.
- The borders between Elemental Planes produce hybrid zones (e.g., the border of Fire and Earth produces magma).

### Outer Planes (Alignment-Based)
- Alignment-based effects: A creature whose alignment opposes the plane's dominant alignment has disadvantage on all attack rolls, ability checks, and saving throws.
- Divine domains: Gods reside on the Outer Planes matching their alignment. Mortals entering a god's domain are subject to the god's will.
- The Outer Planes include: Mount Celestia (LG), Bytopia (NG/LG), Elysium (NG), The Beastlands (NG/CG), Arborea (CG), Ysgard (CG/CN), Limbo (CN), Pandemonium (CN/CE), The Abyss (CE), Carceri (NE/CE), Hades (NE), Gehenna (NE/LE), The Nine Hells (LE), Acheron (LN/LE), Mechanus (LN), Arcadia (LN/LG), The Outlands (N).

### Planar Travel Methods
- **Plane Shift** (7th-level spell): Transport up to 8 willing creatures to another plane. Requires a forked metal rod attuned to the destination plane.
- **Gate** (9th-level spell): Opens a portal to a specific location on another plane.
- **Astral Projection** (9th-level spell): Project your consciousness into the Astral Plane. Silver cord links to body.
- **Natural Portals**: Fey Crossings, Shadow Crossings, and planar rifts provide passage without spells.
- **Sigil, the City of Doors**: The city at the center of the Outlands contains portals to every plane. Portals appear as ordinary doorways but require a specific key (an item, a thought, or an action) to activate.

When narrating planar travel, emphasize how alien and different each plane feels compared to the Material Plane. Use sensory descriptions that highlight the plane's unique properties.
`
