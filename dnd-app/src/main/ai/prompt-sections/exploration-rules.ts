/**
 * Exploration, travel, navigation, foraging, extreme environments, and chases.
 * Always included in every prompt assembly.
 */

export const EXPLORATION_RULES_PROMPT = `
## Exploration & Travel (DMG 2024)

### Travel Pace
- **Fast:** 400 ft/min, 4 mi/hour, 30 mi/day. Disadvantage on Wisdom (Perception or Survival) checks and Dexterity (Stealth) checks.
- **Normal:** 300 ft/min, 3 mi/hour, 24 mi/day. Disadvantage on Dexterity (Stealth) checks.
- **Slow:** 200 ft/min, 2 mi/hour, 18 mi/day. Advantage on Wisdom (Perception or Survival) checks.

When travel pace changes, emit a \`set_travel_pace\` DM action. Use \`advance_time\` to track travel duration.

### Navigation
Navigator makes DC 10 Wisdom (Survival) check. Failure = lost (DM determines how far off course). DC increases in harsh terrain: 15 for forests/swamps, 20 for mountains/deserts.

### Foraging
DC 10 Wisdom (Survival) while traveling at slow pace. Success = 1d6 + WIS modifier pounds of food and 1d6 + WIS modifier gallons of water.

**Applying Exhaustion:** whenever a rule below says a character "gains N Exhaustion", actually emit an \`add_exhaustion\` stat change ({characterName, levels: N, reason}) in the [STAT_CHANGES] block — don't just narrate it. (Exhaustion is one condition with a level 1–6; level 6 is death. A long rest reduces it by 1, which the engine handles automatically.)

### Forced March
A party can travel up to 8 hours per day at no cost. For each **additional hour** beyond 8 in a single day, each traveler makes a DC 10 Constitution save (DC +1 per extra hour) or gains 1 Exhaustion. Track the day's travel with \`advance_time\`; the [GAME TIME] block shows the clock so you can tell when the 8-hour threshold is passed.

### Food & Water (DMG 2024 malnutrition)
A character needs 1 lb of food and 1 gallon of water (2 in heat) per day. Track supplies with \`add_item\` / \`remove_item\` (e.g. "Rations", "Waterskin") and deduct per day of travel.
- **No food:** a character can go without food for 3 + CON modifier days, then gains 1 Exhaustion per further day; eating a half-ration day counts as half a day.
- **No water:** a character who drinks under half their daily need makes a DC 15 CON save or gains 1 Exhaustion (2 if they already have 1+). Going a full day with no water gains 1 Exhaustion automatically.
Enforce these with \`add_exhaustion\` when supplies run out.

### Extreme Environments
- **Extreme Cold (below 0°F):** DC 10 CON save each hour or gain 1 Exhaustion. Resistance to cold damage or cold weather gear = auto-success.
- **Extreme Heat (above 100°F):** DC 5 CON save each hour (DC +1 per subsequent hour). Failure = 1 Exhaustion.
- **High Altitude (above 10,000 ft):** Each hour of travel counts as 2 hours for forced march. DC 10 CON save or 1 Exhaustion.

## Chases (DMG 2024)
Each participant can Dash a number of times equal to 3 + CON modifier (minimum 0) before requiring a DC 10 CON save (failure = 1 Exhaustion). Lead is measured in distance; quarry escapes if the lead exceeds the pursuer's speed for 3+ consecutive rounds. Each round: roll d20 for Chase Complications. Complications may require ability checks or saves.

## Mob Attacks (DMG 2024)
When many identical creatures attack one target, skip individual rolls: calculate the d20 roll needed to hit (AC - attack bonus). For every X attackers, 1 hits:
| d20 Needed | Attackers per Hit |
|-----------|------------------|
| 1-5 | 1 |
| 6-12 | 2 |
| 13-14 | 3 |
| 15-16 | 4 |
| 17-18 | 5 |
| 19 | 10 |
| 20 | 20 |`
