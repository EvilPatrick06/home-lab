# Phase 4: Basics System — D&D 5e 2024 Rules Analysis

**Research Scope:** Ability checks, saving throws, proficiency, advantage/disadvantage, conditions, exhaustion, dice rolling, short/long rest, death saving throws, action economy.

---

## 1. Ability Checks

### Implemented Correctly

| Component | Location | Notes |
|-----------|----------|-------|
| **Skill checks** | `SkillRollButton.tsx` (lines 46–66), `/check` command (`commands-player-utility.ts` lines 166–209) | Uses ability modifier + proficiency, expertise (2× prof), tool+skill advantage (2024 PHB E3) |
| **Proficiency calculation** | `stat-calculator-5e.ts` line 128, `SkillRollButton.tsx` line 44 | `Math.ceil(level/4)+1` for levels 1–20 — matches PHB table |
| **Exhaustion penalty on d20** | `SkillRollButton.tsx` lines 84–88, 106 | -2 per exhaustion level applied to ability checks |
| **Condition-based modifiers** | `SkillRollButton.tsx` lines 90–128 | Paralyzed/Stunned/Unconscious/Petrified → auto-fail STR/DEX saves; Restrained → disadvantage on DEX saves; travel pace effects on Perception/Survival/Stealth |
| **Tool + skill advantage** | `SkillRollButton.tsx` lines 110–121 | When proficient in skill and have matching tool proficiency |
| **Ability check rules reference** | `ability-scores.json` lines 58–81, `glossary/ability-check.json` | Rule text present in data |

### Gaps and Issues

1. **`/ability` and `/save` commands don’t use character stats** — `commands-player-checks.ts` lines 87–154  
   - Both take modifier as optional argument; `/str` with no args rolls d20+0.  
   - Do not pull from character ability scores, skills, or proficiencies.  
   - Intended as manual/raw rolls rather than character-based checks.

2. **Jack of All Trades not implemented** — `SkillRollButton.tsx` `getSkillMod()`, `/check` in `commands-player-utility.ts`  
   - Bard feature: add half proficiency (rounded down) to non‑proficient skill checks.  
   - Current logic: proficient → +prof; expertise → +2×prof; else → ability mod only.  
   - No branch for Jack of All Trades.

3. **`/check` has no advantage/disadvantage** — `commands-player-utility.ts` lines 181–183  
   - Uses `rollD20()` with no advantage/disadvantage; does not respect conditions/travel pace like `SkillRollButton`.

4. **Raw ability checks vs. skill checks** — `commands-player-utility.ts` lines 198–211  
   - Raw ability checks (no skill) do not add proficiency.  
   - Correct per rules, but `/check athletics` vs `/check strength` distinction should be documented.

---

## 2. Saving Throws

### Implemented Correctly

| Component | Location | Notes |
|-----------|----------|-------|
| **Class proficiencies** | `stat-calculator-5e.ts` lines 167–179 | Class saving throws + Resilient feat |
| **Modifier calculation** | `SkillRollButton.tsx` `getSaveMod()` lines 68–72 | Ability mod + proficiency when proficient |
| **Condition effects** | `SkillRollButton.tsx` lines 90–102 | Paralyzed/Stunned/Unconscious/Petrified auto-fail STR/DEX; Restrained disadvantage on DEX |
| **Spell save resolution** | `combat-resolver.ts` `resolveSavingThrow()` lines 590–702 | DC check, half-on-success damage, cover bonus for DEX, Magic Resistance advantage |
| **Monster saving throws** | `StatBlockEditor.tsx` lines 406–446 | Per-ability save bonuses configurable |

### Gaps and Issues

1. **`/save` command doesn’t use character** — `commands-player-checks.ts` lines 114–154  
   - Same as `/ability`: optional modifier, no use of character proficiencies or conditions.

2. **Death save DC 10** — `death-mechanics.ts` line 109  
   - No ability modifier (correct).  
   - No bonus from features like Bless or Aura of Protection; implementation uses raw d20.

---

## 3. Proficiency

### Implemented Correctly

| Component | Location | Notes |
|-----------|----------|-------|
| **Level 1–20 bonus** | `stat-calculator-5e.ts` line 128, `proficiency-bonus.json` | +2 (1–4), +3 (5–8), +4 (9–12), +5 (13–16), +6 (17–20) |
| **Expertise** | `SkillRollButton.tsx` lines 63–64, `/check` | 2× proficiency for skilled checks |
| **Proficiency not stacking** | `attack-computations.ts`, `getSkillMod` | Only one source of proficiency per roll |
| **Improvised weapons** | `attack-computations.ts` lines 46–49 | No proficiency bonus |

### Gaps and Issues

1. **Epic levels (21+)** — `stat-calculator-5e.ts` line 128  
   - Uses `Math.ceil((level-1)/4)+1` for level > 20.  
   - Level 21 yields +6; PHB 2024 (21–24) expects +7.  
   - PHB proficiency data stops at 20; epic formula is off if epic play is supported.

---

## 4. Advantage and Disadvantage

### Implemented Correctly

| Component | Location | Notes |
|-----------|----------|-------|
| **Cancel to normal** | `attack-condition-effects.ts` lines 198–206, `attack-handlers.ts` lines 57–69 | Advantage + disadvantage → normal |
| **Roll 2d20, take higher/lower** | `dice-service.ts` lines 108–117, `SkillRollButton.tsx` lines 145–162 | Correct handling |
| **Attack conditions** | `attack-condition-effects.ts` | Blinded, Frightened, Poisoned, Prone, Restrained (attacker); Blinded, Paralyzed, Petrified, Prone, Restrained, Stunned, Unconscious (target) |
| **Cover/Dodge** | `attack-condition-effects.ts` line 167 | Target Dodging grants disadvantage |
| **Ranged in melee** | `attack-condition-effects.ts` lines 171–173 | Disadvantage when enemy within 5 ft |
| **Underwater combat** | `attack-condition-effects.ts` lines 176–186 | Ranged disadvantage; melee disadvantage unless piercing or swim speed |
| **Flanking** | `attack-condition-effects.ts` lines 189–191 | Optional rule; grants advantage when enabled |
| **Tests** | `dice-service.test.ts` lines 210–242 | Advantage/disadvantage behavior covered |

### Gaps and Issues

1. **Frightened: no line-of-sight check** — `attack-condition-effects.ts` lines 98–102  
   - Disadvantage always applied; rules require source of fear in line of sight.

2. **Grappled** — `attack-condition-effects.ts` line 116  
   - Comment: Grappled only sets Speed to 0; no attack penalty. Matches 2024 PHB.

---

## 5. Conditions

### Implemented Correctly

| Condition | Location | Implementation |
|-----------|----------|-----------------|
| **Incapacitating** | `attack-condition-effects.ts` lines 78–84 | Incapacitated, Paralyzed, Stunned, Petrified, Unconscious → attacker can’t act |
| **Exhaustion** | `attack-condition-effects.ts` lines 87–90, `SkillRollButton.tsx` | -2 per level to d20 tests; speed penalty (see Exhaustion) |
| **Blinded** | `attack-condition-effects.ts` lines 94–96, 125–127 | Attacker disadvantage; target grants advantage |
| **Frightened** | `attack-condition-effects.ts` lines 98–102 | Disadvantage on attack rolls |
| **Poisoned** | `attack-condition-effects.ts` lines 105–107 | Disadvantage on attack rolls |
| **Prone** | `attack-condition-effects.ts` lines 109–110, 141–146 | Attacker disadvantage; melee within 5 ft → advantage, ranged → disadvantage |
| **Restrained** | `attack-condition-effects.ts` lines 112–114, 148–150 | Attacker disadvantage; target grants advantage |
| **Invisible** | `attack-condition-effects.ts` lines 120–122 | Attacker advantage |
| **Paralyzed/Unconscious** | `attack-condition-effects.ts` lines 130–163 | Advantage + auto-crit within 5 ft |
| **Petrified/Stunned** | `attack-condition-effects.ts` | Advantage on attacks |
| **Speed 0 (Grappled/Restrained)** | `combat-rules.ts` lines 264–266 | `getEffectiveSpeed` returns 0 |
| **Auto-fail STR/DEX saves** | `SkillRollButton.tsx` lines 90–102 | Paralyzed, Stunned, Unconscious, Petrified |

### Gaps and Issues

1. **Charmed, Deafened** — Not modeled in `attack-condition-effects.ts`; only referenced in data/glossary.
2. **Condition application flow** — Conditions come from DM/region actions and manual add; no structured system for spell/feature conditions.
3. **Stable condition** — Added on 3 death save successes (`PlayerHUDEffects.tsx` lines 285–294); no rules enforcement (e.g., 1d4 hours for 1 HP).

---

## 6. Exhaustion

### Implemented Correctly

| Effect | Location | Notes |
|--------|----------|-------|
| **d20 penalty** | `attack-condition-effects.ts` lines 87–90, `SkillRollButton.tsx` lines 86–88 | -2 per level |
| **Speed penalty** | `combat-rules.ts` lines 268–271, `CombatStatsBar5e.tsx` line 172 | -5 ft per level |
| **Level 6 = death** | `commands-player-conditions.ts` lines 167–179, `conditions-slice.ts` lines 20–31 | HP set to 0 and death message |
| **Ranger Tireless** | `rest-service-5e.ts` lines 234–244 | Short rest: -1 exhaustion for Ranger 10+ |
| **Player-initiated long rest** | `rest-service-5e.ts` lines 369–379 | Reduces exhaustion by 1 only |

### Broken / Incorrect

1. **DM/AI long rest removes all exhaustion** — `creature-actions.ts` lines 496–509  
   - `executeLongRest` removes every Exhaustion condition.  
   - PHB 2024: long rest reduces exhaustion by 1 level only.

2. **Main process long rest** — `stat-mutations.ts` lines 455–460  
   - `applyLongRestMutations` uses `remove_condition` for Exhaustion.  
   - This fully removes the condition instead of reducing it by 1.

3. **Result** — Player rest via `RestModal` + `rest-service-5e.applyLongRest` is correct; DM/AI rest via `executeLongRest` and `applyLongRestMutations` is wrong.

---

## 7. Dice Rolling

### Implemented Correctly

| Feature | Location | Notes |
|---------|----------|-------|
| **Formula parsing** | `dice-service.ts` lines 78–90 | Supports `XdY+Z` |
| **Advantage/disadvantage** | `dice-service.ts` lines 108–117 | 2d20, take higher/lower |
| **Natural 20/1** | `dice-service.ts` lines 121–122 | Detected for d20 |
| **3D dice** | `dice-service.ts` | Triggered for rolls |
| **Broadcast to chat** | `dice-service.ts` | Results sent to network |
| **`rollQuiet`** | `dice-service.ts` lines 156–158 | No UI/broadcast for internal rolls |
| **Tests** | `dice-service.test.ts` | Covers advantage/disadvantage and formula parsing |

### Gaps and Issues

1. **`SkillRollButton` uses local `rollD20()`** — `SkillRollButton.tsx` lines 29–31, 149–158  
   - Uses `Math.floor(Math.random()*20)+1` instead of `dice-service.rollD20()`.  
   - Skips unified broadcast and 3D dice for those rolls.

2. **`/contest`** — `commands-player-checks.ts` lines 21–22  
   - Uses `rollSingle(20)` twice; no advantage/disadvantage handling.

---

## 8. Short Rest / Long Rest

### Implemented Correctly

| Feature | Location | Notes |
|---------|----------|-------|
| **Short rest** | `rest-service-5e.ts` `applyShortRest()` | Hit dice, pact slots, Wild Shape +1, Arcane Recovery, Natural Recovery, Ranger Tireless |
| **Long rest (player)** | `rest-service-5e.ts` `applyLongRest()` | Full HP, half HD, all spell slots, class resources, -1 exhaustion, death saves reset |
| **Rest lengths** | `rest-lengths.json` | 1 hour short, 8 hours long |
| **Time advance** | `creature-actions.ts`, `use-game-handlers.ts` | 3600s short, 28800s long |
| **Rest tracking** | `use-game-handlers.ts` lines 169–181 | `lastShortRestSeconds`, `lastLongRestSeconds` |

### Broken / Incorrect

1. **Long rest exhaustion** — See Exhaustion section. DM path removes all exhaustion.

2. **24-hour long rest limit** — `rest-lengths.json` line 38  
   - Rules: only one long rest per 24 hours.  
   - No check in `executeLongRest` or `applyLongRest` for prior long rest time.

3. **Start long rest at 0 HP** — `rest-lengths.json` line 39  
   - Rules: must have at least 1 HP to start.  
   - No validation in rest logic.

---

## 9. Death Saving Throws

### Implemented Correctly

| Feature | Location | Notes |
|---------|----------|-------|
| **DC 10** | `death-mechanics.ts` line 109 | No ability modifier |
| **Natural 20** | `death-mechanics.ts` lines 88–105 | Regain 1 HP, reset successes/failures |
| **Natural 1** | `death-mechanics.ts` lines 106–107 | 2 failures |
| **Success/failure** | `death-mechanics.ts` lines 108–112 | ≥10 success, &lt;10 failure |
| **3 successes → stable** | `death-mechanics.ts` lines 117–119 | Outcome: stabilized |
| **3 failures → dead** | `death-mechanics.ts` lines 120–122 | Outcome: dead |
| **Damage at 0 HP** | `deathSaveDamageAtZero()` | 1 failure normally, 2 on crit |
| **Massive damage** | `deathSaveDamageAtZero()` lines 155–166 | Damage ≥ max HP → instant death |
| **`/deathsave`** | `commands-player-resources.ts` lines 206–246 | Manual record of pass/fail |
| **Player HUD** | `PlayerHUDEffects.tsx` | Manual roll and toggle buttons |
| **Tests** | `death-mechanics.test.ts` | Core cases covered |

### Broken / Not Wired

1. **Combat damage does not update death saves** — `CombatModals.tsx` `applyTokenDamage` (lines 61–86)  
   - Only updates token `currentHP`.  
   - Does not call `deathSaveDamageAtZero` or update character `deathSaves`.  
   - Attack modal broadcasts “+N death save failure(s)” but never persists it.

2. **No automatic death save at start of turn**  
   - Rules: at start of turn with 0 HP, make a death save.  
   - `initiative-slice.ts` `nextTurn()` has no hook for 0 HP entities.  
   - Player must roll via HUD or `/deathsave`.

3. **Character vs token HP sync**  
   - `applyTokenDamage` updates token only.  
   - For PCs, character `hitPoints` may stay out of sync.  
   - No clear flow that updates character HP and death saves when a PC token takes damage.

4. **`resolveDeathSave` / `deathSaveDamageAtZero` not used in UI**  
   - Implemented in `death-mechanics.ts`, re-exported from `combat-resolver.ts`.  
   - Only used in tests; no call from attack flow or turn start.

---

## 10. Action Economy

### Implemented Correctly

| Feature | Location | Notes |
|---------|----------|-------|
| **Turn state** | `initiative-slice.ts`, `types/game-state.ts` | `actionUsed`, `bonusActionUsed`, `reactionUsed`, `freeInteractionUsed` |
| **Reset per turn** | `initiative-slice.ts` | New turn state for active entity |
| **Reaction reset** | `initiative-slice.ts` line 553 | `reactionUsed = false` at start of turn |
| **`useAction`, `useBonusAction`, `useReaction`** | `initiative-slice.ts` lines 419–456 | Set flags when used |
| **Action economy bar** | `ActionEconomyBar.tsx` | Shows used state (DM can toggle) |
| **Use cases** | `use-game-handlers.ts` lines 267, 271; `GamePrompts.tsx`; `MechanicsModals.tsx`; `UtilityModals.tsx` | Hide, Help (stabilize), object interaction |
| **Reaction blocking** | `reaction-tracker.ts` line 96, `use-token-movement.ts` line 194 | Blocks OAs when `reactionUsed` |
| **Special actions** | `initiative-slice.ts` | Dash, Disengage, Dodge consume action |

### Gaps and Issues

1. **Attacks do not consume action**  
   - No `useAction` call when resolving an attack.  
   - Action modal (Hide, Dash, etc.) calls `useAction`; attack modal does not.  
   - Players can make multiple attack actions in one turn.

2. **Spell casting**  
   - No check that action/bonus action has been used before allowing cast.

3. **Free action / object interaction**  
   - `freeInteractionUsed` exists and is resettable.  
   - Unclear whether all appropriate interactions go through this.

4. **Incapacitated**  
   - Blocks actions and reactions per rules.  
   - Not enforced in action economy logic; only via condition effects (e.g., attacker can’t act).

---

## 11. Concentration

### Implemented Correctly

| Feature | Location | Notes |
|---------|----------|-------|
| **DC** | `death-mechanics.ts` line 26, `CombatModals.tsx` line 131 | max(10, floor(damage/2)) |
| **DC cap 30** | `CombatModals.tsx` line 131 | `Math.min(30, ...)` |
| **War Caster advantage** | `death-mechanics.ts` line 24 | Optional param passed through |
| **Concentration check prompt** | `CombatModals.tsx` lines 129–137 | Triggered when concentrating creature takes damage |

---

## 12. Summary: Core Rules Status

### Working as Intended

- Ability checks (SkillRollButton, `/check` with character)
- Saving throw math and spell save resolution
- Proficiency (levels 1–20), expertise
- Advantage/disadvantage and cancellation
- Condition effects for combat
- Exhaustion d20 penalty and speed reduction
- Dice service (formulas, advantage/disadvantage)
- Short rest (player-initiated)
- Long rest exhaustion reduction (player-initiated only)
- Death save mechanics (functions and rules)
- Concentration DC and cap
- Action economy state (tracking and reaction blocking)

### Broken or Incorrect

- Long rest via DM/AI removes all exhaustion instead of reducing by 1
- Main-process `applyLongRestMutations` removes exhaustion instead of reducing by 1
- Epic proficiency bonus (level 21+) formula is wrong
- Attack damage does not update death saves for PCs
- No automatic death save at start of turn for 0 HP creatures

### Not Implemented or Partial

- Jack of All Trades
- `/ability` and `/save` character-based mode
- Advantage/disadvantage in `/check`
- Automatic death save trigger at turn start
- Attack consuming action
- Spell casting consuming action/bonus action
- 24-hour long rest limit
- HP ≥ 1 requirement to start long rest
- Character/token HP sync when applying damage to PCs
- Heroic Inspiration and similar rerolls

---

## File Reference Index

| Topic | Primary Files |
|-------|---------------|
| Ability checks | `SkillRollButton.tsx`, `commands-player-utility.ts`, `commands-player-checks.ts` |
| Saving throws | `SkillRollButton.tsx`, `SavingThrowsSection5e.tsx`, `combat-resolver.ts` |
| Proficiency | `stat-calculator-5e.ts`, `attack-computations.ts`, `proficiency-bonus.json` |
| Advantage/disadvantage | `attack-condition-effects.ts`, `dice-service.ts`, `attack-handlers.ts` |
| Conditions | `attack-condition-effects.ts`, `conditions-slice.ts`, `SkillRollButton.tsx` |
| Exhaustion | `attack-condition-effects.ts`, `combat-rules.ts`, `commands-player-conditions.ts` |
| Dice | `dice-service.ts`, `SkillRollButton.tsx` |
| Rests | `rest-service-5e.ts`, `creature-actions.ts`, `stat-mutations.ts`, `RestModal.tsx` |
| Death saves | `death-mechanics.ts`, `PlayerHUDEffects.tsx`, `commands-player-resources.ts` |
| Action economy | `initiative-slice.ts`, `ActionEconomyBar.tsx`, `use-game-handlers.ts` |
| Damage application | `CombatModals.tsx`, `AttackModal.tsx`, `damage.ts` |
