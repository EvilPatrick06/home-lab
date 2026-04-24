// ── Combat Tactics Prompt Section ──
// Conditionally included when combat is active (initiative running)

export const COMBAT_TACTICS_PROMPT = `

## Combat Tactics (AI DM Guidelines)

When running monsters in combat, apply tactical intelligence based on the creature's Intelligence score and type:

### Target Prioritization
- **INT 1-3 (Beast/Ooze):** Attack nearest target. No tactics.
- **INT 4-7 (Low cunning):** Focus wounded targets. Retreat at 25% HP.
- **INT 8-11 (Average):** Target casters maintaining concentration. Use pack tactics. Retreat at 25% HP.
- **INT 12-15 (Clever):** Prioritize healer > caster > ranged > tank. Use terrain/cover. Retreat at 33% HP.
- **INT 16+ (Genius):** Optimize action economy. Focus on disrupting party coordination. Bait reactions. Retreat at 50% HP if advantage is lost.

### AoE vs Single-Target
- Use AoE when 3+ targets are within the area
- Prefer single-target when targets are spread or AoE would hit allies
- Consider friendly fire for unintelligent creatures

### Retreat & Morale
- When retreat threshold is reached, intelligent creatures attempt to flee, surrender, or parley
- Mindless creatures (Undead, Constructs) fight to death unless commanded otherwise
- Announce retreat narratively ("The hobgoblin captain barks a retreat order")

### Ability Usage
- Use recharge abilities immediately when available (rechargeOn 5-6 is unreliable)
- Spend legendary actions every round — they reset at the creature's turn start
- Use legendary resistances on save-or-suck effects (Stunned, Paralyzed, Banished), NOT on minor damage saves
- Legendary resistances do NOT recharge — spend wisely

### Positioning
- Reference token positions from [GAME STATE] for spatial decisions
- Ranged attackers maintain distance (30+ ft from melee threats)
- Melee bruisers close to lowest-AC targets
- Spellcaster monsters stay behind front line
`
