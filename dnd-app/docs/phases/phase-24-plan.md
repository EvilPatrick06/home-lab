# Phase 24 — Character Level-Up Bugs and Missing Features

## Context
The character level-up wizard is substantially complete for 2024 PHB (correct ASI levels, subclass at 3, epic boons, multiclass prerequisites, Warlock Pact Magic separation, Sorcerer Metamagic, Warlock Invocations, expertise, fighting styles). However the apply step has critical bugs: subclass selections are never written back to the character, hit dice only tracks the primary class, half-caster level-1 spell slots are wrong, the HP UI uses pre-ASI Constitution for display, and multiclass entries grant no skill proficiency.

Missing features keep the wizard short of the 2024 PHB ruleset: no spell swap/replacement, no cantrip picker, subclass features at levels 3/6/10/14 are not auto-loaded, feat sub-choices (`choiceConfig`) are not validated, HP rolls can be retried indefinitely, and class resources update only for the primary class.

Several `catch { /* ignore */ }` blocks in `apply-level-up.ts` and `level-up-spells.ts` silently swallow loader failures; tests only verify imports. Land bug fixes first, then the missing features, before Phase 15 ports the data tables into library entries.

## Depends on / blocks
- Depends on: none
- Blocks: Phase 15 Step 28 (library port of `spell-data.ts` tables). Land 24a-24c before Phase 15 so the corrected half-caster table flows into the library. After Phase 15, 24a write-back target shifts from `classes[].subclass: string` to `classRefs[].subclassRef: EntryRef<'subclasses'>`.

## Files touched
| Path | Role |
|------|------|
| `src/renderer/src/stores/level-up/apply-level-up.ts` | Apply function: subclass write-back, hit dice per class, subclass feature load, skill profs, secondary-class resources |
| `src/renderer/src/stores/level-up/level-up-spells.ts` | Resolve always-prepared spells against newly selected subclass |
| `src/renderer/src/stores/level-up/feature-selection-slice.ts` | Validate feat `choiceConfig` sub-choices |
| `src/renderer/src/stores/level-up/types.ts` | Add `spellSwap`, `cantripSelections` state shape |
| `src/renderer/src/components/levelup/5e/HpRollSection5e.tsx` | Post-ASI CON display, roll lock |
| `src/renderer/src/components/levelup/5e/SpellSelectionSection5e.tsx` | Spell swap UI, cantrip picker |
| `src/renderer/src/components/levelup/5e/LevelUpConfirm5e.tsx` | Skill picker on multiclass entry |
| `src/renderer/src/components/levelup/5e/AsiSelector5e.tsx` | Warn when "+2 to one" exceeds 20 |
| `src/renderer/src/services/character/spell-data.ts` | Fix half-caster level-1 slot lookup |
| `src/renderer/src/types/character-5e.ts` | Add optional `classId` to `HitDiceEntry` |

## Sub-phase summary
| # | Sub-phase | Theme |
|---|-----------|-------|
| 24a | Subclass persistence | Write subclass slot back; load subclass features; use new subclass for always-prepared |
| 24b | Hit dice per class | Track HD pools per class with `classId` on `HitDiceEntry` |
| 24c | Half-caster level-1 slots | Fix `getSlotProgression` half-caster lookup |
| 24d | HP display + roll lock | Post-ASI CON in HP preview; lock roll after first click |
| 24e | Multiclass skill proficiencies | Skill picker UI + apply step |
| 24f | Spell swap / replacement | Replace one prepared spell per level gained |
| 24g | Cantrip selection at level-up | Pick new cantrips when count increases |
| 24h | Feat sub-choice validation | Block apply if `choiceConfig` unanswered |
| 24i | Secondary-class resources | Loop `getClassResources` for every class |
| 24j | ASI overflow warning | UI warn on "+2 to one" at score 19/20 |
| 24k | Error visibility | Replace silent `catch {}` with logger.warn |

## Sub-phase details

### 24a — Subclass persistence
**Files:** `src/renderer/src/stores/level-up/apply-level-up.ts`, `src/renderer/src/stores/level-up/level-up-spells.ts`
**Steps:**
1. In `apply5eLevelUp` (`apply-level-up.ts:147-161`, class array build), after constructing `updatedClasses`, read subclass slots from the level-up store's `levelUpSlots` and write each slot's `selectedId`/`selectedName` back to the matching class entry's `subclass` field. The function signature does not currently receive `levelUpSlots`; add a `subclassSelections: Record<string, { id: string; name: string; classId?: string }>` parameter and thread it through `level-up/index.ts`'s `applyLevelUp` wrapper (alongside the existing `expertiseSelections`).
2. Subclass field is `CharacterClass5e.subclass?: string` (`character-5e.ts:132`). Write the raw ID (lowercased) so `level-up-spells.ts:135` matches via `.toLowerCase().replace(/\s+/g, '-')`.
3. In `apply-level-up.ts:163-190` (class-feature loader), after loading base class features, call `load5eSubclasses()`, look up each selected subclass by ID, filter `sc.features` where `feature.level` is in `currentLevel+1..targetLevel` for the correct class, and push into `allNewFeatures`. Source label = subclass `name`.
4. In `level-up-spells.ts:135`, change `primarySubclassId` lookup to prefer the newly-selected subclass for the primary class; pass `subclassSelections` into `resolveLevelUpSpells` and use the new value before falling back to `character.classes[0]?.subclass`.
**Acceptance:** Level a fresh level-2 Fighter to level 3, choose Champion subclass, apply. `character.classes[0].subclass === 'champion'`. `character.classFeatures` contains "Improved Critical" at level 3. For a Cleric 2 → 3 with Life Domain, always-prepared spells (Bless, Cure Wounds) appear in `knownSpells` in the same apply call.

### 24b — Hit dice per class
**Files:** `src/renderer/src/types/character-5e.ts`, `src/renderer/src/stores/level-up/apply-level-up.ts`
**Steps:**
1. Extend `HitDiceEntry` (`character-5e.ts:142-146`) with optional `classId?: string`. Existing entries without it default to the primary class.
2. Rewrite `apply-level-up.ts:402-414` IIFE: accumulate per-class HD pools. Initialize a `Map<classId, HitDiceEntry>` from `character.hitDice` (default missing `classId` → primary). Iterate `currentLevel+1..targetLevel`, key by `classLevelChoices[lvl] ?? primaryClassId`, increment that pool's `current` and `maximum` by 1 using that class's `hitDie` from `classDataMap`. Emit the map's values as the new `hitDice` array.
3. Verify `RestModal` / hit-dice spend UI reads `dieType` per entry. No regression if `classId` is unset for legacy characters.
**Acceptance:** Fighter 5 → Fighter 5/Wizard 1 produces `hitDice = [{dieType:10,current:5,maximum:5,classId:'fighter'},{dieType:6,current:1,maximum:1,classId:'wizard'}]`. Pure Fighter 5 → Fighter 6 still has a single entry with `maximum:6`.

### 24c — Half-caster level-1 spell slots
**Files:** `src/renderer/src/services/character/spell-data.ts`
**Steps:**
1. In `getSlotProgression` at `spell-data.ts:443-446`, change the half-caster branch: return `{}` when `level < 2`, otherwise `FULL_CASTER_SLOTS[Math.ceil(level / 2)] ?? {}`.
2. Do NOT change `getMulticlassSpellSlots` (`spell-data.ts:466-467`); the multiclass combined formula `ceil(level/2)` is correct per 2024 PHB.
3. Add a unit test in `spell-data.test.ts` for Paladin 1 (0 slots), Paladin 2 (`{1:2}`), Ranger 1 (0 slots).
**Acceptance:** `getSlotProgression('paladin', 1)` returns `{}`; `getSlotProgression('paladin', 2)` returns `{1:2}`; `getSlotProgression('ranger', 1)` returns `{}`.

### 24d — HP display + roll lock
**Files:** `src/renderer/src/components/levelup/5e/HpRollSection5e.tsx`
**Steps:**
1. At `HpRollSection5e.tsx:24`, replace `character.abilityScores.constitution` with a post-ASI value: read `asiSelections` from the store, count occurrences of `'constitution'` across all slots up to (and including) this level's ASI slot, add to base CON, then derive `conMod`. Mirrors the cumulative math in `apply-level-up.ts:73-84`.
2. Add a `locked` flag in the store keyed per level. `doRoll` (`HpRollSection5e.tsx:28`) early-returns when locked. After a successful `setHpRoll`, set `locked = true`. Display a small "locked" badge next to the rolled value.
3. Optional DM-controlled `allowHpRerolls` is out of scope — leave it as a static lock for now.
**Acceptance:** When ASI grants +2 CON at this level, the "+N HP (X + Y CON)" preview shows the post-ASI CON modifier; the value matches `hpGain` after apply. Clicking "Roll" twice does not change the displayed result.

### 24e — Multiclass skill proficiencies
**Files:** `src/renderer/src/components/levelup/5e/LevelUpConfirm5e.tsx`, `src/renderer/src/stores/level-up/types.ts`, `src/renderer/src/stores/level-up/apply-level-up.ts`
**Steps:**
1. Define `MULTICLASS_SKILL_GRANTS` (in `apply-level-up.ts` near class data load) mapping `bard → 1`, `ranger → 1`, `rogue → 1` and the corresponding allowed skill lists from the class JSON's `multiclassing.skillsGained` (verify field name; if absent, hardcode the 2024 PHB lists).
2. Add `multiclassSkillSelections: Record<string, string[]>` to `LevelUpState` (`types.ts:44-98`) and a `setMulticlassSkillSelection` action. Wire into `apply-level-up.ts:287-303` so chosen skills mark `s.proficient = true` in `updatedSkills`.
3. In `LevelUpConfirm5e.tsx`, when `ClassLevelSelector` adds a multiclass entry whose class is in `MULTICLASS_SKILL_GRANTS`, render a skill picker constrained to that class's skill list and the required count. Add the same validation to `feature-selection-slice.ts:getIncompleteChoices` (alongside the multiclass-prereq block at lines 99-119).
**Acceptance:** Fighter 5 multiclassing into Rogue 1 surfaces a skill picker (1 from Rogue list); apply marks the chosen skill as proficient in `character.skills`. Apply button stays disabled until the pick is made.

### 24f — Spell swap / replacement
**Files:** `src/renderer/src/stores/level-up/types.ts`, `src/renderer/src/components/levelup/5e/SpellSelectionSection5e.tsx`, `src/renderer/src/stores/level-up/apply-level-up.ts`
**Steps:**
1. Add `spellSwaps: Array<{ removeId: string; addId: string }>` to `LevelUpState` (default `[]`); allow one swap per level gained. Add `addSpellSwap`/`removeSpellSwap` actions.
2. In `SpellSelectionSection5e.tsx`, render a new "Replace prepared spell" section above the "New Spells Available" list. Show a `<select>` of swappable spells = `character.knownSpells` filtered to exclude `species`/`feat`/`class`-sourced entries and subclass always-prepared entries. After choosing a removal, show a picker (reuse the existing spell list with `s.level <= maxSpellLevel` filter) for the replacement.
3. In `apply-level-up.ts` (just before `updatedKnownSpells` is built at line 342), apply each swap: remove the matching `knownSpells` entry by ID, then add the new one via `toSpellEntry`.
4. Honor multi-level apply: cap swap count at `targetLevel - currentLevel`. Validate in `getIncompleteChoices` only if a swap is partially filled.
**Acceptance:** Level 4 → 5 Cleric: pick a swap (remove Bless, add Aid), apply. `knownSpells` no longer contains Bless; contains Aid. Apply button blocks when removeId is selected without addId.

### 24g — Cantrip selection at level-up
**Files:** `src/renderer/src/stores/level-up/types.ts`, `src/renderer/src/components/levelup/5e/SpellSelectionSection5e.tsx`, `src/renderer/src/stores/level-up/apply-level-up.ts`, `src/renderer/src/stores/level-up/level-up-spells.ts`
**Steps:**
1. Add `newCantripIds: string[]` to `LevelUpState` plus `toggleNewCantrip` action.
2. In `SpellSelectionSection5e.tsx` at the spell-filter (line 132 currently drops `s.level === 0`), compute `cantripsToLearn = getCantripsKnown(className, targetLevel) - getCantripsKnown(className, character.level)` using the existing `getCantripsKnown` (`spell-data.ts:426-434`). When `> 0`, render a separate cantrip picker constrained to that count with `s.level === 0` and the class spell list.
3. In `level-up-spells.ts`, accept `newCantripIds` and push each as a `toSpellEntry(raw)` into the returned array. Thread through `apply-level-up.ts:193-200`.
4. Validate in `getIncompleteChoices`: if `cantripsToLearn > 0 && newCantripIds.length < cantripsToLearn`, block apply.
**Acceptance:** Bard 3 → 4: `CANTRIPS_KNOWN.bard[4] - CANTRIPS_KNOWN.bard[1] = 3-2 = 1`. The picker requires 1 cantrip; apply adds it to `knownSpells`.

### 24h — Feat sub-choice validation
**Files:** `src/renderer/src/stores/level-up/feature-selection-slice.ts`
**Steps:**
1. After the ASI-or-feat block (`feature-selection-slice.ts:122-131`), iterate `generalFeatSelections`. For each feat, load `feats` data (or rely on the already-loaded `choiceConfig` cached in the selection) and confirm every key in the feat's `choiceConfig` has a corresponding non-empty value in the stored `feat.choices`. If missing, push `Feat ${feat.name}: choose ${config.label}` into `incomplete`.
2. The feat data including `choiceConfig` lives in `FeatData` and is consumed at `AsiSelector5e.tsx:106`. Either preload feats via `load5eFeats('General')` once on init or attach `choiceConfig` to the stored selection object in `setGeneralFeatSelection`.
**Acceptance:** Pick Elemental Adept without picking damage type → apply button disabled with message "Feat Elemental Adept: choose Damage Type". Pick the damage type → unblocks.

### 24i — Secondary-class resources
**Files:** `src/renderer/src/stores/level-up/apply-level-up.ts`
**Steps:**
1. Replace the primary-only `classResources` IIFE (`apply-level-up.ts:423-441`) with a loop over `updatedClasses`. For each `cls`, call `getClassResources(cls.name.toLowerCase(), cls.level, wisMod)` and merge into an accumulator keyed by resource `id` (keep current if max unchanged, top up if `nr.max > old.max`).
2. Drop the early-return on empty primary.
**Acceptance:** Fighter 5/Warlock 3 leveling Warlock to 4 emits both Action Surge (Fighter) and Pact Magic spell-slot tracker entries in `character.classResources`.

### 24j — ASI overflow warning
**Files:** `src/renderer/src/components/levelup/5e/AsiSelector5e.tsx`
**Steps:**
1. In `AsiAbilityPicker5e` (around `AsiSelector5e.tsx:216-293`), when mode is "+2 to one" and the selected ability's current `score === 19`, render an amber warning beneath the button: `"+1 will be wasted (cap is 20)"`. Apply still works because `apply-level-up.ts:80` already clamps with `Math.min(20, ...)`.
**Acceptance:** Score 19 STR with "+2 STR" highlighted shows the wasted-point warning; score 18 or below shows nothing.

### 24k — Error visibility
**Files:** `src/renderer/src/stores/level-up/apply-level-up.ts`, `src/renderer/src/stores/level-up/level-up-spells.ts`
**Steps:**
1. Replace each `catch { /* ignore */ }` (`apply-level-up.ts:67, 189, 358`; `level-up-spells.ts:64, 82, 99, 130, 159`) with `catch (err) { logger.warn('[apply-level-up] <context>:', err) }` using the existing renderer logger.
2. Imports: add `import { logger } from '<existing path>'` — confirm the canonical logger location before edit.
**Acceptance:** A missing `class-features.json` no longer silently produces an empty `classFeatures` array; the renderer console shows a warn with stack.

## Constraints & edge cases
- **Subclass type change in Phase 15.** When Phase 15 lands first, 24a's write target becomes `classRefs[].subclassRef` (an `EntryRef<'subclasses'>`), and `level-up-spells.ts` uses `useLibraryEntry('subclasses', ref)`. The bug is the same; only the field name shifts.
- **Hit dice backwards compatibility.** Existing saved characters have `HitDiceEntry` without `classId`. The new field is optional; default to the character's `buildChoices.classId` when reading.
- **Half-caster fix is single-class only.** `getMulticlassSpellSlots`'s `ceil(level/2)` stays correct for the combined table.
- **Spell swap rules.** Always-prepared (species/feat/class/subclass-granted) spells must not be eligible for removal. One swap per level gained.
- **No cantrip swap.** 2024 PHB does not permit cantrip replacement on level-up; picker is add-only.
- **Multiclass skill prereqs vs. ASI.** `feature-selection-slice.ts:110` uses pre-ASI scores for prereq checks. Keep as-is.
- **ASI cap of 30 for Epic Boons.** Epic Boons that grant ability boosts are not currently treated as ASIs. Out of scope.
- **Pact Boon at level 1.** 2024 PHB requires Warlocks to take a Pact Boon invocation at level 1; not enforced today. Out of scope.

## Verification
1. `cd dnd-app && npm run lint && npm run typecheck && npm test`
2. Manual: level a fresh Fighter from 2 → 3, pick Champion, apply. `classes[0].subclass === 'champion'`, Improved Critical present.
3. Manual: level a Fighter 5 to Fighter 5/Wizard 1, apply. `hitDice` array has two entries with correct `classId`/`dieType`/`maximum`.
4. Manual: spell-data test, assert Paladin 1 = `{}`, Paladin 2 = `{1: 2}`, Ranger 1 = `{}`.
5. Manual: level a Cleric 4 → 5 with +2 CON ASI. HP preview reflects the new CON mod; final `hitPoints.maximum` matches preview * levels + retroactive.
6. Manual: level a Fighter 5 multiclassing to Rogue 1, choose Stealth, apply. `skills` shows Stealth `proficient: true`.
7. Manual: level a Bard 3 → 4. Cantrip picker requires 1 selection; spell-swap dropdown appears.
8. Manual: pick Elemental Adept without damage type, observe blocked apply button + message.
9. Manual: level a multiclass Fighter/Warlock; verify `classResources` array contains entries for both classes.
10. Manual: ASI on a 19 STR ability shows wasted-point warning; on 18 it does not.

## Completed
(no items completed yet)
