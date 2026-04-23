export const COMBAT_RULES_PROMPT = `
## Combat Reference (2024 PHB Rules Glossary)

### Unarmed Strike
Three modes available to all creatures:
- **Damage:** Attack roll (STR + PB). Hit = 1 + STR mod Bludgeoning.
- **Grapple:** Target within 5ft, max 1 size larger, free hand required. Target STR or DEX save (their choice) vs DC 8 + STR mod + PB. Fail = Grappled. Escape: action to repeat the save.
- **Shove:** Same range/size/DC. Fail = pushed 5ft OR Prone (attacker's choice).

### Falling [Hazard]
1d6 Bludgeoning per 10ft fallen (max 20d6). Landing = Prone. Water landing: Reaction for DC 15 STR(Athletics) or DEX(Acrobatics), success = half damage.

### Improvised Weapons
1d4 damage, no proficiency bonus. Thrown: 20/60ft. DM may rule it resembles an existing weapon.

### Object AC & HP
| Material | AC | Size | Fragile HP | Resilient HP |
|----------|-----|------|-----------|-------------|
| Cloth/Paper | 11 | Tiny | 2 (1d4) | 5 (2d4) |
| Crystal/Glass | 13 | Small | 3 (1d6) | 10 (3d6) |
| Wood/Bone | 15 | Medium | 4 (1d8) | 18 (4d8) |
| Iron/Steel | 19 | Large | 5 (1d10) | 27 (5d10) |
| Mithral | 21 | | | |
| Adamantine | 23 | | | |
Objects immune to Poison and Psychic damage.

### Carrying Capacity
STR × 15 lb (Small/Medium). Tiny ×0.5, Large ×2, Huge ×4, Gargantuan ×8. Over limit = Speed ≤ 5ft. Drag/Lift/Push = STR × 30 lb.

### Movement Special Rules
- **Climbing:** Each foot costs 1 extra foot (2 extra in difficult terrain). Ignore with Climb Speed. DC 15 Athletics for slippery/smooth surfaces.
- **Swimming:** Each foot costs 1 extra foot. Ignore with Swim Speed. DC 15 Athletics for rough water.
- **Long Jump (running):** STR score in feet. Standing: half. Each foot costs 1ft movement. Land in difficult terrain: DC 10 Acrobatics or Prone.
- **High Jump (running):** 3 + STR mod feet. Standing: half. Each foot costs 1ft movement.
- **Flying Fall:** Incapacitated, Prone, or Fly Speed = 0 while flying → creature falls.
- **Teleportation:** Does NOT provoke Opportunity Attacks or expend movement.

### Dodge Action (Full Rules)
Until start of your next turn: attack rolls against you have Disadvantage (if you can see attacker) AND you have Advantage on DEX saving throws. Lost if Incapacitated or Speed is 0.

### Hazards
- **Burning:** 1d4 Fire at start of each turn. Action to extinguish (go Prone, roll on ground). Also extinguished by dousing/submerging.
- **Dehydration:** Water per day: Tiny 1/4 gal, Small/Med 1 gal, Large 4 gal, Huge 16 gal, Gargantuan 64 gal. Less than half = +1 Exhaustion. Cannot remove until hydrated.
- **Malnutrition:** Food per day: Tiny 1/4 lb, Small/Med 1 lb, Large 4 lb, Huge 16 lb, Gargantuan 64 lb. Half rations: DC 10 CON save daily or +1 Exhaustion. 5 days no food = auto +1 Exhaustion/day.
- **Suffocation:** Hold breath: 1 + CON mod minutes (min 30s). Then +1 Exhaustion per turn. Breathe again = remove all suffocation Exhaustion.

### Exhaustion (2024 Rules)
Each level of Exhaustion imposes a cumulative -2 penalty to all d20 Tests (ability checks, attack rolls, saving throws) and reduces Speed by 5 feet. At 6 levels, the creature dies. A Long Rest removes 1 Exhaustion level. A Short Rest does NOT remove Exhaustion. Sources: forced march, dehydration, malnutrition, suffocation, extreme environments.

### Bloodied (MM 2025)
A creature is Bloodied when at or below half its Hit Point maximum. Announce when creatures become Bloodied ("The goblin staggers, bloodied and desperate"). Some monster abilities trigger on Bloodied status — check stat blocks for Bloodied-triggered traits.

### Death Saving Throws
At the start of each turn at 0 HP, roll d20. DC 10: success. Below 10: failure. Natural 1: 2 failures. Natural 20: regain 1 HP and become conscious. 3 successes: stabilized (unconscious but no longer dying). 3 failures: dead. Taking damage at 0 HP: 1 automatic failure (critical hit = 2 failures). Healing at 0 HP: conscious with healed HP, reset all death saves. A stable creature that isn't healed regains 1 HP after 1d4 hours.

### Concentration (Complete)
CON save DC = max(10, half damage taken), **capped at DC 30**. Broken by: Incapacitated condition, death, casting another concentration spell.

### Help Action (Complete)
Three uses:
1. **Stabilize:** DC 10 Medicine check on 0-HP creature within 5ft.
2. **Assist Ability Check:** Choose skill/tool you're proficient in + 1 ally nearby. Ally's next check with that skill has Advantage (expires before your next turn).
3. **Assist Attack Roll:** Choose enemy within 5ft. Next attack by any ally vs that enemy has Advantage (expires before your next turn).

### Influence Action
Determine NPC willingness: Willing (auto), Hesitant (check needed), Unwilling (refused).
Influence Checks: Deception (deceive), Intimidation (intimidate), Performance (amuse), Persuasion (persuade), Animal Handling (Beast/Monstrosity).
Default DC = 15 or monster's INT score (whichever higher). Failed = wait 24h to retry same approach.`
