# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 4 of the D&D VTT project.

Phase 4 covers the **Core D&D 5e 2024 Rules Engine** — ability checks, saving throws, proficiency, advantage/disadvantage, conditions, exhaustion, dice rolling, rests, death saves, action economy, and concentration. The audit found the mathematical foundations correct but identified **critical rule violations** in exhaustion handling, death save wiring, and action economy enforcement.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 4 is entirely client-side. No Raspberry Pi involvement.

**Renderer — Core Rule Files:**

| File | Role | Key Issues |
|------|------|------------|
| `src/renderer/src/components/game/player/SkillRollButton.tsx` | Ability checks, saving throws, exhaustion penalties, condition effects | Uses local `Math.random()` instead of `dice-service` (lines 29-31); Jack of All Trades missing |
| `src/renderer/src/components/game/modal-groups/CombatModals.tsx` | Damage application, concentration checks | `applyTokenDamage` (lines 62-87) doesn't call `deathSaveDamageAtZero` or sync character HP |
| `src/renderer/src/services/game-actions/creature-actions.ts` | DM/AI rest execution | `executeLongRest` (lines 496-509) removes ALL exhaustion instead of reducing by 1 |
| `src/renderer/src/services/combat/attack-condition-effects.ts` | Condition-based advantage/disadvantage | Frightened missing LoS check (lines 98-102); Charmed/Deafened not modeled |
| `src/renderer/src/services/combat/death-mechanics.ts` | Death save logic | Functions implemented but NOT wired into combat flow — only used in tests |
| `src/renderer/src/stores/game/initiative-slice.ts` | Turn management, action economy | `nextTurn()` has no 0 HP death save hook; `useAction` not called from attacks |
| `src/renderer/src/components/game/player/PlayerHUDEffects.tsx` | Death save manual roll UI | Stable condition added (lines 285-294) but no auto-trigger |
| `src/renderer/src/services/game/rest-service-5e.ts` | Player-initiated rests | Correct exhaustion handling; missing 24-hour limit and 0 HP validation |
| `src/renderer/src/services/combat/dice-service.ts` | Dice rolling engine | Correct; includes advantage/disadvantage and 3D dice support |
| `src/renderer/src/components/game/ActionEconomyBar.tsx` | Action economy display | Displays state correctly; DM can toggle |
| `src/renderer/src/services/combat/combat-resolver.ts` | Spell save resolution, concentration | Death mechanics re-exported but unused |
| `src/renderer/src/services/combat/attack-computations.ts` | Attack modifier calculation | Proficiency handling correct |
| `src/renderer/src/services/chat-commands/commands-player-utility.ts` | `/check` command | No advantage/disadvantage (lines 181-183) |
| `src/renderer/src/services/chat-commands/commands-player-checks.ts` | `/ability`, `/save`, `/contest` commands | Don't use character stats (lines 87-154) |

**Main Process:**

| File | Role | Key Issues |
|------|------|------------|
| `src/main/ai/stat-mutations.ts` | AI-triggered stat changes | `applyLongRestMutations` (lines 455-460) `remove_condition` filters out ALL exhaustion |

**Data Files:**

| File | Role |
|------|------|
| `src/renderer/public/data/5e/rules/rest-lengths.json` | Rest durations, missing 24-hour limit enforcement |
| `src/renderer/public/data/5e/rules/proficiency-bonus.json` | Proficiency table (levels 1-20) |

---

## 📋 Core Objectives & Corrections

### CRITICAL BUGS (Rules Violations)

| # | Bug | Severity | Location |
|---|-----|----------|----------|
| C1 | DM/AI long rest removes ALL exhaustion instead of -1 | **Critical** | `creature-actions.ts:496-509` |
| C2 | Main process long rest removes ALL exhaustion via `remove_condition` | **Critical** | `stat-mutations.ts:455-460` |
| C3 | Combat damage at 0 HP doesn't trigger death save failures | **Critical** | `CombatModals.tsx:62-87` |
| C4 | No automatic death save at start of turn for 0 HP creatures | **Critical** | `initiative-slice.ts` `nextTurn()` |
| C5 | Attacks don't consume action in action economy | **High** | Attack flow never calls `useAction` |
| C6 | Character/token HP desync — `applyTokenDamage` only updates token | **High** | `CombatModals.tsx:62-87` |

### RULE GAPS (Missing Implementations)

| # | Gap | Severity | Location |
|---|-----|----------|----------|
| G1 | Jack of All Trades (Bard) not implemented | Medium | `SkillRollButton.tsx` `getSkillMod()` |
| G2 | `/ability` and `/save` commands don't use character stats | Medium | `commands-player-checks.ts:87-154` |
| G3 | `/check` has no advantage/disadvantage | Medium | `commands-player-utility.ts:181-183` |
| G4 | 24-hour long rest limit not enforced | Medium | `rest-service-5e.ts` |
| G5 | Must have >= 1 HP to start long rest — not validated | Medium | `rest-service-5e.ts` |
| G6 | Epic proficiency bonus wrong for level 21+ | Low | `stat-calculator-5e.ts:128` |
| G7 | Frightened condition doesn't check LoS to fear source | Low | `attack-condition-effects.ts:98-102` |
| G8 | Charmed and Deafened not modeled in combat effects | Low | `attack-condition-effects.ts` |
| G9 | `SkillRollButton` uses `Math.random()` instead of `dice-service` | Medium | `SkillRollButton.tsx:29-31` |
| G10 | Spell casting doesn't consume action/bonus action | Medium | Spell flow |
| G11 | Death save feature bonuses (Bless, Aura of Protection) not applied | Low | `death-mechanics.ts:109` |
| G12 | Stable creature doesn't regain 1 HP after 1d4 hours | Low | `PlayerHUDEffects.tsx:285-294` |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Fix Exhaustion Long Rest Bug (C1, C2)

**Step 1 — Fix DM/AI Long Rest Exhaustion (C1)**
- Open `src/renderer/src/services/game-actions/creature-actions.ts`
- Find `executeLongRest` at lines 496-509
- Replace the loop that removes ALL exhaustion conditions with logic that removes exactly ONE:
  ```typescript
  if (activeMap) {
    for (const name of names) {
      const token = resolveTokenByLabel(activeMap.tokens, name)
      if (token) {
        const exhaustionConditions = gameStore.conditions.filter(
          (c) => c.entityId === token.entityId && c.condition.toLowerCase() === 'exhaustion'
        )
        if (exhaustionConditions.length > 0) {
          gameStore.removeCondition(exhaustionConditions[0].id)
        }
      }
    }
  }
  ```
- Note: If exhaustion is tracked as a single condition with a `level` property (e.g., `Exhaustion 3`), then decrement the level by 1 instead. Check how exhaustion level is stored — if multiple separate `Exhaustion` condition entries represent the level, remove one entry. If a single entry with a numeric level, decrement it.

**Step 2 — Fix Main Process Long Rest Exhaustion (C2)**
- Open `src/main/ai/stat-mutations.ts`
- Find `applyLongRestMutations` at lines 455-460
- The `remove_condition` case at lines 206-210 filters out ALL conditions matching the name. This is correct for normal conditions but wrong for exhaustion which has levels.
- Option A: Change the exhaustion-specific long rest logic to use a new mutation type `reduce_exhaustion` instead of `remove_condition`:
  ```typescript
  if (exhaustion) {
    changes.push({ type: 'reduce_exhaustion', reason: 'long rest' })
  }
  ```
  Then add a handler:
  ```typescript
  case 'reduce_exhaustion': {
    const conditions = char.conditions as Array<{ name: string; level?: number }>
    const exh = conditions.find(c => c.name.toLowerCase() === 'exhaustion')
    if (exh) {
      if (exh.level && exh.level > 1) {
        exh.level -= 1
      } else {
        char.conditions = conditions.filter(c => c !== exh)
      }
    }
    break
  }
  ```
- Option B: If exhaustion is stored as multiple separate condition entries, remove only the first match (not filter-all).

**Step 3 — Determine Exhaustion Storage Format**
- Before implementing Steps 1-2, search for how exhaustion is stored. Check:
  - `conditions-slice.ts` — how are conditions added? Does exhaustion have a `level` property?
  - `commands-player-conditions.ts` lines 167-179 — how is exhaustion level 6 = death detected?
  - `attack-condition-effects.ts` lines 87-90 — how is -2 per level calculated?
- This will determine whether to remove one condition entry or decrement a level field.

### Sub-Phase B: Wire Death Saves Into Combat (C3, C4, C6)

**Step 4 — Wire `deathSaveDamageAtZero` Into Damage Flow (C3)**
- Open `src/renderer/src/components/game/modal-groups/CombatModals.tsx`
- In `applyTokenDamage` (lines 62-87), after updating token HP:
  ```typescript
  const newHP = Math.max(0, target.currentHP - damage)
  gameStore.updateToken(activeMap.id, targetTokenId, { currentHP: newHP })

  // If target was already at 0 HP or just dropped to 0, handle death saves
  if (target.currentHP === 0 && target.entityType === 'player') {
    // Import and call deathSaveDamageAtZero from death-mechanics.ts
    const isCrit = false // pass from caller context
    const result = deathSaveDamageAtZero(damage, target.maxHP, isCrit)
    // Update character death saves via store
    // result contains: failures added, instantDeath flag
  }
  ```
- Import `deathSaveDamageAtZero` from `death-mechanics.ts` (it's already exported via `combat-resolver.ts`)
- Propagate the `isCritical` flag from the attack modal into `applyTokenDamage`

**Step 5 — Sync Character HP With Token HP (C6)**
- In `applyTokenDamage`, after updating token HP, also sync the linked character:
  ```typescript
  if (target.entityType === 'player' && target.entityId) {
    // Update character hitPoints via character store or IPC
    // This keeps token HP and character sheet HP in sync
  }
  ```
- Determine how player characters are linked to tokens (likely via `entityId` matching a character ID)
- Find the character store or IPC call to update `character.hitPoints`

**Step 6 — Auto Death Save at Turn Start (C4)**
- Open `src/renderer/src/stores/game/initiative-slice.ts`
- In `nextTurn()`, after advancing to the next entity:
  ```typescript
  // After determining the new active entity
  const activeToken = getCurrentActiveToken()
  if (activeToken?.entityType === 'player' && activeToken.currentHP === 0) {
    // Prompt death save
    // Option A: Auto-roll death save via resolveDeathSave()
    // Option B: Show death save prompt to the player
    // The DM setting should control auto-roll vs manual
  }
  ```
- Import `resolveDeathSave` from `death-mechanics.ts`
- Add a game setting: `autoRollDeathSaves: boolean` (default false — player rolls manually)
- If `autoRollDeathSaves` is false, trigger the `PlayerHUDEffects` death save prompt

### Sub-Phase C: Fix Action Economy (C5, G10)

**Step 7 — Attacks Consume Action (C5)**
- Find the attack resolution flow — likely in `CombatModals.tsx` `AttackModal` `onApplyDamage` callback (lines 118-140) or in the attack modal's confirmation handler
- After resolving an attack, call `useAction()`:
  ```typescript
  const attackerToken = activeMap.tokens.find(t => t.id === attackerTokenId)
  if (attackerToken) {
    gameStore.useAction(attackerToken.id)
  }
  ```
- This should NOT prevent making attacks when action is already used (Extra Attack, Bonus Action attacks, etc.)
- Implement smarter logic: the FIRST attack in a turn consumes the action. Subsequent attacks from Extra Attack feature are free within the same action.
- Check if the entity has Extra Attack feature and how many attacks they get per action.

**Step 8 — Spell Casting Consumes Action/Bonus Action (G10)**
- Find the spell casting flow in the codebase
- After casting a spell, call `useAction()` or `useBonusAction()` based on the spell's casting time:
  - Action spells → `useAction()`
  - Bonus action spells → `useBonusAction()`
  - Reaction spells → `useReaction()`
- Check spell data for `castingTime` field

### Sub-Phase D: Fix Dice Service Usage (G9)

**Step 9 — Replace Local rollD20 in SkillRollButton (G9)**
- Open `src/renderer/src/components/game/player/SkillRollButton.tsx`
- Remove the local `rollD20()` function at lines 29-31
- Import `rollD20` from `dice-service.ts` (or the appropriate export path)
- Ensure all calls to the local `rollD20()` now use the service version
- This ensures skill check rolls go through the unified dice system (3D dice, broadcast, logging)

**Step 10 — Add Advantage/Disadvantage to /check Command (G3)**
- Open `src/renderer/src/services/chat-commands/commands-player-utility.ts`
- Find the `/check` handler at lines 181-183
- Add optional `adv` and `dis` flags:
  ```
  /check <skill> [adv|dis]
  ```
- Use `dice-service.rollD20()` with the appropriate advantage/disadvantage parameter
- Apply condition-based advantage/disadvantage matching `SkillRollButton` logic

### Sub-Phase E: Implement Jack of All Trades (G1)

**Step 11 — Add Jack of All Trades to Skill Checks**
- Open `src/renderer/src/components/game/player/SkillRollButton.tsx`
- In `getSkillMod()`, add a branch for Jack of All Trades:
  ```typescript
  if (isProficient) {
    modifier += proficiencyBonus
  } else if (hasExpertise) {
    modifier += proficiencyBonus * 2
  } else if (hasJackOfAllTrades) {
    modifier += Math.floor(proficiencyBonus / 2)
  }
  ```
- Jack of All Trades is a Bard feature gained at level 2
- Check the character's class features for `jackOfAllTrades` or equivalent
- Also add to `/check` command in `commands-player-utility.ts`

### Sub-Phase F: Rest Validation (G4, G5)

**Step 12 — 24-Hour Long Rest Limit (G4)**
- Open `src/renderer/src/services/game/rest-service-5e.ts`
- Before starting a long rest, check if 24 hours (86400 seconds) have passed since `lastLongRestSeconds`:
  ```typescript
  const timeSinceLastLongRest = currentGameTime - lastLongRestSeconds
  if (timeSinceLastLongRest < 86400) {
    return { success: false, message: 'Must wait 24 hours between long rests.' }
  }
  ```
- Also apply this check in `creature-actions.ts` `executeLongRest` for the DM/AI path

**Step 13 — HP >= 1 Requirement for Long Rest (G5)**
- In the same rest validation, check current HP:
  ```typescript
  if (character.hitPoints.current <= 0) {
    return { success: false, message: 'Must have at least 1 HP to start a long rest.' }
  }
  ```
- Apply to both player-initiated and DM/AI rest paths

### Sub-Phase G: Character-Based /ability and /save Commands (G2)

**Step 14 — Wire /ability and /save to Character Stats**
- Open `src/renderer/src/services/chat-commands/commands-player-checks.ts`
- Find `/ability` handler at lines 87-113
- When no modifier argument is provided, pull from the active character's ability scores:
  ```typescript
  const character = getActiveCharacter() // however the current character is accessed
  if (character && !manualModifier) {
    const abilityMod = Math.floor((character.abilityScores[ability] - 10) / 2)
    modifier = abilityMod
  }
  ```
- Same for `/save`: pull ability mod + proficiency if proficient in that save

### Sub-Phase H: Condition Improvements (G7, G8)

**Step 15 — Add Charmed and Deafened to Combat Effects (G8)**
- Open `src/renderer/src/services/combat/attack-condition-effects.ts`
- Add Charmed: can't attack the charmer (needs source tracking)
- Add Deafened: auto-fail hearing-based checks (no combat effect, but should be modeled for completeness)
- These may need a `conditionSource` field on the condition to know who charmed/frightened the entity

**Step 16 — Frightened LoS Check (G7)**
- In `attack-condition-effects.ts` at lines 98-102
- Frightened disadvantage should only apply when the source of fear is visible
- This requires: (a) tracking the source entity on the Frightened condition, (b) checking LoS between the frightened entity and the source
- If LoS checking is not feasible yet, add a TODO comment and skip — this is low severity

### Sub-Phase I: Epic Proficiency Fix (G6)

**Step 17 — Fix Epic Proficiency Formula**
- Open `src/renderer/src/services/character/stat-calculator-5e.ts`
- Find line 128 with the proficiency formula
- For levels 21-24 (2024 DMG epic levels), proficiency should be +7:
  ```typescript
  export function getProficiencyBonus(level: number): number {
    if (level >= 21) return 7
    return Math.ceil(level / 4) + 1
  }
  ```
- Verify this matches the 2024 DMG epic boon rules

---

## ⚠️ Constraints & Edge Cases

### D&D 5e 2024 Rules
- **Exhaustion 2024 rules**: Each level of exhaustion imposes -2 to all d20 Tests and -5 ft speed. Level 6 = death. A long rest reduces exhaustion by exactly 1 level, NOT to zero. The Greater Restoration spell removes exhaustion entirely — that is the ONLY way to fully clear it in one action.
- **Death saves reset**: On regaining any HP (healing, nat 20), all death save successes and failures reset to 0.
- **Massive damage at 0 HP**: If remaining damage after dropping to 0 HP equals or exceeds max HP, the creature dies instantly. No death saves.
- **Natural 20 death save**: Regain 1 HP, wake up, reset all death saves. This is NOT just 2 successes.
- **Action economy with Extra Attack**: The Attack action can include multiple attacks (2 at level 5, 3 at level 11 for Fighter, etc.). ALL attacks within a single Attack action consume ONE action. Do not mark action as used per individual attack.
- **Bonus action spells rule**: If you cast a spell as a bonus action, the only other spell you can cast on that turn is a cantrip with a casting time of one action.
- **Jack of All Trades**: Applies to ALL ability checks where the Bard is not proficient, including initiative rolls (initiative is a Dexterity check).

### State Synchronization
- **Token vs Character HP**: When a player token takes damage, BOTH the token's `currentHP` and the linked character's `hitPoints.current` must update atomically. Failing to sync causes the character sheet to show different HP than the map token.
- **Death save state**: Death saves should be stored on the character object (not just the token), so they persist across map changes and are visible on the character sheet.
- **Exhaustion level tracking**: Clarify early (Step 3) whether exhaustion is one condition with a level integer or multiple condition entries. ALL subsequent fixes depend on this answer.

### Performance
- **Death save auto-trigger at turn start**: The LoS check for Frightened (if implemented) and the death save prompt should not block the turn advancement. Use an async prompt that the player can respond to.
- **Action economy enforcement should be soft**: Display warnings (e.g., "Action already used this turn") rather than hard-blocking. The DM may override for special abilities.

### Backward Compatibility
- Adding `reduce_exhaustion` mutation type to `stat-mutations.ts` must not break existing mutation handling. Add it as a new case in the switch.
- The `autoRollDeathSaves` game setting must default to `false` to preserve current behavior.
- The `/check` advantage/disadvantage flag must be optional — bare `/check athletics` still works as before.

Begin implementation now. Start with Sub-Phase A (Steps 1-3) to determine exhaustion storage format, then fix both exhaustion bugs. Then proceed to Sub-Phase B (Steps 4-6) for death save wiring. These are the highest-severity rules violations.
