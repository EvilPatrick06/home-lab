# Phase 24 — Composer 1.5: Character Level-Up System Analysis

**Agent:** Composer 1.5  
**Date:** 2026-03-09  
**Scope:** Full analysis of the character level-up wizard/flow, HP handling, feature unlocking, ASI/Feat selection, spell progression, multiclassing, and edge cases.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Level-Up Wizard / Flow Completeness](#2-level-up-wizard--flow-completeness)
3. [HP Increases: Rolling vs. Average](#3-hp-increases-rolling-vs-average)
4. [Class/Subclass Feature Unlocking](#4-classsubclass-feature-unlocking)
5. [ASI vs. Feat Selection](#5-asi-vs-feat-selection)
6. [Spell Progression System](#6-spell-progression-system)
7. [Multiclassing Rules Enforcement](#7-multiclassing-rules-enforcement)
8. [Edge Cases, Missing Features, and Broken Logic](#8-edge-cases-missing-features-and-broken-logic)

---

## 1. Architecture Overview

The level-up system is a dedicated subsystem spanning stores, services, UI components, and data files. It lives outside the initial character builder and operates on existing `Character5e` objects.

### File Map

| Layer | Path | Files |
|-------|------|-------|
| **Page** | `src/renderer/src/pages/LevelUp5ePage.tsx` | Entry point, routed at `/characters/5e/:id/levelup` |
| **Wizard UI** | `src/renderer/src/components/levelup/5e/` | 11 components (see below) |
| **Store** | `src/renderer/src/stores/level-up/` | Zustand store with 4 slices: `index.ts`, `hp-slice.ts`, `spell-slot-slice.ts`, `feature-selection-slice.ts` |
| **Store bridge** | `src/renderer/src/stores/use-level-up-store.ts` | Re-exports the store for UI consumption |
| **Apply logic** | `src/renderer/src/stores/level-up/apply-level-up.ts` | 500-line function that mutates character data |
| **Spell resolver** | `src/renderer/src/stores/level-up/level-up-spells.ts` | Resolves new spells (selected, fighting style cantrips, species progression, subclass always-prepared) |
| **Types** | `src/renderer/src/stores/level-up/types.ts` | `LevelUpState`, `HpChoice`, `MULTICLASS_PREREQUISITES`, `initialState` |
| **Build tree** | `src/renderer/src/services/character/build-tree-5e.ts` | Generates build slots (ASI, subclass, expertise, fighting style, etc.) for level-up delta |
| **Spell data** | `src/renderer/src/services/character/spell-data.ts` | Spell slot tables, multiclass spell slots, cantrips known, prepared spell limits |
| **Multiclass** | `src/renderer/src/data/multiclass-prerequisites.ts` + `src/renderer/src/services/character/multiclass-advisor.ts` | Prerequisites, proficiency gains, warnings |
| **Feat prereqs** | `src/renderer/src/utils/feat-prerequisites.ts` | `meetsFeatPrerequisites()` |
| **Data JSON** | `src/renderer/public/data/5e/` | Class features, subclasses, feats, spells, spell slots, XP thresholds, multiclassing rules |

### UI Components in `components/levelup/5e/`

| Component | File | Purpose |
|-----------|------|---------|
| `LevelUpWizard5e` | `LevelUpWizard5e.tsx` | Main wizard: target level selector, per-level sections, spell/invocation/metamagic panels, summary bar |
| `LevelSection5e` | `LevelSection5e.tsx` | Per-level section: HP, ASI/feat, epic boon, fighting style, primal/divine order, expertise, elemental fury, subclass, class features preview, spell slot changes |
| `LevelUpConfirm5e` | `LevelUpConfirm5e.tsx` | `ClassLevelSelector` (multiclass dropdown), `InvocationSection5e` (Warlock), `MetamagicSection5e` (Sorcerer), `meetsPrerequisites()` |
| `LevelUpSummary5e` | `LevelUpSummary5e.tsx` | Summary bar (HP change, ASI changes, spell count, incomplete warnings) |
| `AsiSelector5e` | `AsiSelector5e.tsx` | ASI/Feat toggle with `AsiOrFeatSelector5e`, `AsiAbilityPicker5e`, `GeneralFeatPicker` |
| `FeatSelector5e` | `FeatSelector5e.tsx` | `EpicBoonSelector5e`, `FightingStyleSelector5e`, `BlessedWarriorCantripPicker`, `DruidicWarriorCantripPicker` |
| `SpellSelectionSection5e` | `SpellSelectionSection5e.tsx` | New spell picker (prepared casters, third-casters, subclass always-prepared display) |
| `SpellSelector5e` | `SpellSelector5e.tsx` | `PrimalOrderSelector5e`, `DivineOrderSelector5e`, `ElementalFurySelector5e` |
| `SubclassSelector5e` | `SubclassSelector5e.tsx` | Subclass picker filtered by class |
| `HpRollSection5e` | `HpRollSection5e.tsx` | HP method choice (average vs roll d{hitDie}) |
| `LevelSelectors5e` | `LevelSelectors5e.tsx` | Re-exports + `ExpertiseSelector5e`, `ordinal()` |

### Store State Shape (`LevelUpState` in `types.ts`, lines 44-98)

Key fields:
- `character`, `currentLevel`, `targetLevel`, `levelUpSlots`
- `hpChoices` (per level), `hpRolls` (per level)
- `asiSelections` (slotId → abilities), `generalFeatSelections` (slotId → feat)
- `fightingStyleSelection`, `primalOrderSelection`, `divineOrderSelection`, `elementalFurySelection`
- `newSpellIds`, `epicBoonSelection`
- `invocationSelections`, `metamagicSelections`
- `blessedWarriorCantrips`, `druidicWarriorCantrips`
- `expertiseSelections` (slotId → skills)
- `classLevelChoices` (charLevel → classId for multiclass)
- `spellsRequired`

---

## 2. Level-Up Wizard / Flow Completeness

### What Is Implemented

The level-up flow is **substantially complete** for D&D 5e 2024 (2024 PHB) rules. The implementation covers:

1. **Multi-level leveling** — Players can jump from current level to any target up to 20 in a single operation (`LevelUpWizard5e.tsx`, line 82: dropdown from `currentLevel+1` to 20).

2. **Per-level sections** — Each gained level gets its own `LevelSection5e` panel with HP choice, relevant build slots (ASI, subclass, etc.), class features preview, and spell slot change display.

3. **2024 PHB class-specific features** tracked via `build-tree-5e.ts`:
   - **Subclass at level 3** for ALL classes (line 26: `SUBCLASS_LEVEL = 3`) — correct per 2024 PHB
   - **ASI at levels 4, 8, 12, 16** for all classes (line 94), with extras for Fighter (6, 14) and Rogue (10) — correct
   - **Epic Boon at level 19** for all classes (line 214) — correct
   - **Fighting Style**: Fighter level 1, Paladin level 2, Ranger level 2 (lines 30-34) — correct
   - **Primal Order**: Druid level 1 (lines 38-40) — correct
   - **Divine Order**: Cleric level 1 (lines 43-46) — correct
   - **Elemental Fury**: Druid level 7 (handled dynamically in `LevelSection5e.tsx`, lines 213-224)
   - **Expertise grants**: Rogue (1, 6), Bard (2, 9), Ranger (2, 9), Wizard "Scholar" (2) — lines 58-87

4. **Warlock Invocations** — Full selector with level requirements, prerequisites (requires cantrip/other invocation), repeatable invocations, and count by level (`LevelUpConfirm5e.tsx`, lines 89-294).

5. **Sorcerer Metamagic** — Selector with count scaling (2→4→6 at levels 2→10→17), lines 297-395.

6. **Blessed Warrior / Druidic Warrior cantrip pickers** — Embedded in `FightingStyleSelector5e` when the appropriate fighting style is chosen (`FeatSelector5e.tsx`, lines 103-247).

7. **Validation gate** — `getIncompleteChoices()` in `feature-selection-slice.ts` (lines 61-273) blocks the "Apply Level Up" button until all required choices are made: HP per level, ASI/feat, epic boon, fighting style, cantrips, primal/divine order, elemental fury, expertise, subclass, spells, invocations, metamagic, and multiclass prerequisites.

8. **Level 20 cap** — `LevelUp5ePage.tsx` line 60: redirects if already at level 20.

### 2024 PHB Compliance Assessment

| Rule | Status | Notes |
|------|--------|-------|
| Subclass at level 3 (all classes) | **Correct** | `SUBCLASS_LEVEL = 3` in `build-tree-5e.ts` line 26 |
| ASI at 4, 8, 12, 16 | **Correct** | `getAsiLevels()` line 93 |
| Fighter extra ASI at 6, 14 | **Correct** | line 96 |
| Rogue extra ASI at 10 | **Correct** | line 99 |
| Epic Boon at 19 | **Correct** | line 214 |
| Primal Order (Druid 1) | **Correct** | line 38 |
| Divine Order (Cleric 1) | **Correct** | line 43 |
| Elemental Fury (Druid 7) | **Correct** | `LevelSection5e.tsx` lines 213-224 |
| Fighting Style levels | **Correct** | Fighter 1, Paladin 2, Ranger 2 |
| Expertise grants | **Correct** | Rogue (1, 6), Bard (2, 9), Ranger (2, 9), Wizard Scholar (2) |
| Multiclass prereqs: 13+ in ability | **Correct** | `types.ts` lines 5-21, checked both for origin class and new class |
| Prepared spell tables | **Correct** | `spell-data.ts` lines 113-290, all 8 caster classes |
| Warlock Pact Magic separate | **Correct** | `WARLOCK_PACT_SLOTS` maintained separately; lines 53-74 |
| Multiclass spell slot table | **Correct** | `getMulticlassSpellSlots()` line 458 uses combined caster level |

---

## 3. HP Increases: Rolling vs. Average

### Implementation

**File:** `HpRollSection5e.tsx` (lines 1-78) and `apply-level-up.ts` (lines 87-98)

The HP system offers two choices per level:

1. **Average** — `Math.floor(hitDie / 2) + 1` (line 25 of `HpRollSection5e.tsx`, line 95 of `apply-level-up.ts`). This is correct per PHB: average of a d8 is 4+1=5, d10 is 5+1=6, d12 is 6+1=7, d6 is 3+1=4.

2. **Roll** — `Math.floor(Math.random() * hitDie) + 1` (line 29 of `HpRollSection5e.tsx`). Uses `Math.random()` (not cryptographic, but acceptable for a VTT).

### Calculation Details

In `apply-level-up.ts` lines 87-98:
```
for each new level:
  hitDie = class-specific hit die (supports multiclass via classLevelChoices)
  dieResult = roll OR average
  hpGain += max(1, dieResult + newConMod)
```

Key behaviors:
- **Minimum HP gain of 1 per level** — `Math.max(1, dieResult + conMod)` ensures negative CON modifiers don't produce 0 or negative HP gains. (**Correct** per PHB.)
- **CON modifier uses post-ASI value** — ASI is processed first (lines 73-84), then HP uses the new CON modifier. This is correct.
- **Retroactive CON bonus** — `(newConMod - oldConMod) * currentLevel` (line 101). If CON increases via ASI, all previous levels also gain the difference. (**Correct** per PHB.)
- **Multiclass hit die** — Each level uses the correct class's hit die based on `classLevelChoices[lvl]` (line 89-90).

### UI Display

`HpRollSection5e.tsx` shows:
- The average value on the button (`Average: {average}`)
- The die type on the roll button (`Roll d{hitDie}`)
- After choosing average: `+{averageHP} HP ({average} + {conMod} CON)`
- After rolling: `+{rolledHP} HP (rolled {rolled} + {conMod} CON)`
- Incomplete state is highlighted with amber ring

### HP Bonus from Traits

`apply-level-up.ts` lines 104-136 handle:
- **Tough feat** — Detected if newly selected in `generalFeatSelections` (line 105); uses `calculateHPBonusFromTraits()` from `stat-calculator-5e.ts`
- **Draconic Sorcery (Draconic Resilience)** — +1 HP per sorcerer level; tracked per-sorcerer-level with multiclass awareness (lines 110-122)
- **Species traits** — `calculateHPBonusFromTraits()` handles species-based HP bonuses (e.g., Hill Dwarf was in 2014 but species bonuses may exist in 2024)
- **Delta calculation** — `newTraitBonus - oldTraitBonus` (line 136) correctly applies only the *difference*

### Issues Found

1. **No reroll protection** — The roll button (`doRoll()` in `HpRollSection5e.tsx` line 28) can be clicked repeatedly, replacing the previous roll. There is no confirmation or "lock" after rolling. A player could keep re-rolling until they get a high value. Whether this is a bug or feature depends on DM preference, but it's worth noting.

2. **CON modifier displayed is pre-ASI** — `HpRollSection5e.tsx` line 24 uses `character.abilityScores.constitution` (the *current* score, not the post-ASI score). However, `apply-level-up.ts` correctly uses the post-ASI CON mod for actual calculation. This means the *displayed* HP gain per level in the UI may differ from the *actual* HP gain applied. **This is a display bug.**

3. **Hit dice pool update only tracks primary class** — `apply-level-up.ts` lines 402-414: the `hitDice` array update only adds levels gained to the primary class's die type. If multiclassing into a different class, those hit dice are not added to a separate pool entry. For example, a Fighter 5/Wizard 1 gaining a Wizard level would incorrectly add the hit die to the Fighter's d10 pool instead of adding/incrementing a d6 Wizard pool entry.

---

## 4. Class/Subclass Feature Unlocking

### Implementation

**Loading features:** `apply-level-up.ts` lines 164-190 loads class features from `class-features.json` via `load5eClassFeatures()`. For each new level, it:
1. Tracks per-class levels via `classLvlTracker` (multiclass-aware)
2. Filters features matching the specific class level
3. Appends to `allNewFeatures` with level, name, description, and source class name

**Merging:** Line 271-279 concatenates new features onto `character.classFeatures`.

### UI Preview

`LevelSection5e.tsx` lines 91-108 and 244-254: Each level section loads and displays class features for that level. It correctly handles multiclass by computing the effective class level for the chosen class at that character level.

### Subclass Selection

`SubclassSelector5e.tsx`: Loads subclasses from `load5eSubclasses()` filtered by `classId`. The user selects a subclass, which updates the slot's `selectedId` and `selectedName` in the store.

### Subclass Always-Prepared Spells

`level-up-spells.ts` lines 134-161: After selecting a subclass, the system loads `alwaysPreparedSpells` from the subclass data and auto-adds them to the character's known spells at the appropriate levels.

### Issues Found

1. **Subclass selection is stored in the slot but NOT persisted to `character.classes[].subclass`** — Looking at `apply-level-up.ts`, there is no code that writes the selected subclass ID back to the `updatedClasses` array's `subclass` field. The slot stores `selectedId`/`selectedName`, but `apply-level-up` never reads subclass slot selections. **This is a significant bug**: selecting a subclass during level-up does not actually assign it to the character.

2. **Always-prepared subclass spells use existing subclass** — `level-up-spells.ts` line 135 reads `character.classes[0]?.subclass` to determine the subclass. Since the newly selected subclass is not written back (see issue above), always-prepared spells from a *new* subclass chosen at level 3 will NOT be loaded during the same level-up session.

3. **Class features are text-only** — Features are stored as `{ level, name, description, source }` strings. There is no mechanical effect automation (e.g., Extra Attack doesn't auto-add an attack, Channel Divinity doesn't add a resource tracker). This is a design choice, not a bug, but means class features are purely informational on the sheet.

4. **No subclass feature loading** — `apply-level-up.ts` lines 176-177 only loads features from `classCF.features` (class features), not subclass features. Subclass features that appear at levels 3, 6, 10, 14 are not auto-loaded into the character's feature list during level-up.

5. **Class resources are only calculated for the primary class** — `apply-level-up.ts` lines 423-441: `getClassResources()` is called only with `primaryClassId`. Multiclass characters don't get resource updates for secondary classes (e.g., a Fighter 5 / Warlock 3 wouldn't get updated Warlock resource tracking).

---

## 5. ASI vs. Feat Selection

### Implementation

**`AsiSelector5e.tsx`** provides `AsiOrFeatSelector5e` (lines 10-72) — a toggle between "Ability Score Improvement" and "General Feat" modes:

**ASI Mode (`AsiAbilityPicker5e`, lines 216-293):**
- Two sub-modes: "+2 to one" or "+1 to two" (line 227)
- Buttons for each of the 6 abilities showing current score
- Scores at 20 are disabled (line 272: `atMax = score >= 20`)
- Selection stored as `AbilityName[]` in `asiSelections[slotId]`

**Feat Mode (`GeneralFeatPicker`, lines 74-214):**
- Loads general feats via `load5eFeats('General')` (line 91)
- Filters out already-taken feats unless `feat.repeatable` (line 99)
- Search filter (line 100)
- Prerequisite checking via `meetsFeatPrerequisites()` (line 169) — checks level and ability score prerequisites
- Feats failing prereqs are displayed but disabled with red text (lines 184-199)
- Some feats have `choiceConfig` (e.g., choosing a skill or damage type) — rendered as dropdowns after selection (lines 124-146)

**Mutual Exclusivity:**
- Choosing a feat clears the ASI for that slot (`feature-selection-slice.ts` line 38)
- Choosing ASI mode clears the feat for that slot (line 32 of `AsiSelector5e.tsx`)
- In `apply-level-up.ts` line 78: `if (generalFeatSelections[slotId]) continue` skips ASI processing for slots where a feat was chosen instead

### Apply Logic

`apply-level-up.ts` lines 73-83 (ASI):
- Iterates `asiSelections`, skipping slots with feat selections
- Increments ability scores by 1 per ability in the selection
- Caps at 20: `Math.min(20, updatedScores[ability] + 1)`

Lines 282-285 (Feats):
- Appends epic boon, general feats, and fighting style to `character.feats`

### Epic Boon (Level 19)

`EpicBoonSelector5e` in `FeatSelector5e.tsx` lines 11-101:
- Loads feats with category "Epic Boon"
- Checks prerequisites via `meetsFeatPrerequisites()`
- Stored as `epicBoonSelection` (separate from general feat selections)

### Issues Found

1. **ASI "+2 to one" allows exceeding 20 in the UI** — While `apply-level-up.ts` correctly caps at 20 (`Math.min(20, ...)`), the `AsiAbilityPicker5e` UI only disables buttons when `score >= 20` (line 272). If a score is 19, the "+2 to one" button is enabled and selectable, but only +1 would actually apply. The UI doesn't warn the user that the second point would be wasted. This is misleading.

2. **No ASI cap of 30 for Epic Boon** — Per 2024 PHB, Epic Boons at level 19 allow ability scores to exceed 20 (up to 30). The current `apply-level-up.ts` line 80 uses `Math.min(20, ...)` universally. Epic Boon ASI boosts (if any epic boon grants +2 to an ability) would be incorrectly capped at 20. However, epic boons are treated as feats (not ASIs) in this system, so this may not currently trigger. Worth monitoring.

3. **Feat choice configs are not validated** — `GeneralFeatPicker` renders `choiceConfig` dropdowns (e.g., "choose a damage type for Elemental Adept") but `getIncompleteChoices()` in `feature-selection-slice.ts` does not check whether these sub-choices have been made. A feat requiring a choice can be "completed" without making the sub-selection.

4. **General feats don't check class/spellcasting prerequisites** — `meetsFeatPrerequisites()` in `feat-prerequisites.ts` (lines 9-23) only checks `level` and `abilityScores`. The PHB 2024 feat "War Caster" requires "Spellcasting or Pact Magic Feature" — this is NOT validated. Any character can select War Caster regardless of spellcasting ability.

5. **Multiple ASI slots share the same ability score base** — When leveling multiple levels (e.g., 4→8), both ASI slots at level 4 and level 8 read from `character.abilityScores` (the pre-level-up scores). Choosing +2 STR at level 4 and +2 STR at level 8 would show STR 15 for both, but `apply-level-up.ts` processes them sequentially so the final result is correct (+4 total). The UI display is misleading because it doesn't show the cumulative effect.

---

## 6. Spell Progression System

### Prepared Spell Tables

`spell-data.ts` lines 113-290 defines `PREPARED_SPELLS` for all 8 caster classes (Bard, Cleric, Druid, Paladin, Ranger, Sorcerer, Warlock, Wizard). These are loaded from `spell-slots.json` at runtime (line 347) and fall back to hardcoded defaults.

### Spell Selection UI

`SpellSelectionSection5e.tsx`:
- Determines if the character is a caster (line 119): `hasAnySpellcasting()` or third-caster
- Calculates `canPick` (line 91): `newMax - existingCount` where `existingCount` excludes species spells and always-prepared spells
- Calculates `maxSpellLevel` (lines 99-116): based on slot progression for the class level
- Filters available spells by level, class list, and not-already-known
- "Show All Spells" toggle (line 199) allows off-list spell selection (marked with "Off-List" badge)
- Subclass always-prepared spells are displayed separately (lines 173-179)

### Third-Caster Support

Lines 47-48 and 102-109: Eldritch Knight (Fighter) and Arcane Trickster (Rogue) are handled as third-casters:
- Max spell level: `floor(classLevel / 3)` mapped to wizard slot progression
- Spell list: uses Wizard list for third-casters (line 121)
- Defined in `THIRD_CASTER_SUBCLASSES` in `spell-data.ts` line 293

### Spell Slot Progression

`spell-data.ts` provides:
- **Full caster slots** (lines 76-97): Standard progression for Bard, Cleric, Druid, Sorcerer, Wizard
- **Half caster slots** (line 444): `effectiveLevel = Math.ceil(level / 2)` mapped to full caster table — **Note: uses `Math.ceil` not `Math.floor`**. Per 2024 PHB, half-casters should use `floor(level / 2)` for the multiclass table but the single-class half-caster table is specific. Using `ceil` means a Paladin 1 gets slots as if they were a level-1 full caster (2 first-level slots), but per 2024 PHB, Paladins don't get spell slots until level 2. **This is a bug for Paladin level 1.**
- **Warlock Pact Magic** (lines 53-74): Separate table, correct progression
- **Multiclass combined** (lines 458-473): Full caster levels count fully, half-caster `ceil(level/2)`, third-caster `floor(level/3)`. Warlock is excluded from the combined table (correct — Pact Magic is separate).

### Spell Resolution at Apply

`level-up-spells.ts` `resolveLevelUpSpells()` handles:
1. **Selected new spells** (lines 54-66) — Loaded from spell data, deduplicated against known spells
2. **Blessed Warrior cantrips** (lines 69-83) — Added as feat-sourced spells
3. **Druidic Warrior cantrips** (lines 86-100) — Added as feat-sourced spells
4. **Species spell progression** (lines 103-132) — Loads species data, checks subspecies/lineage leveled spells (e.g., Tiefling at levels 3/5)
5. **Subclass always-prepared spells** (lines 134-161) — Adds spells from subclass `alwaysPreparedSpells` map

### Apply Logic for Slots

`apply-level-up.ts` lines 203-261:
- Determines if multiclass spell slot table applies (`isMulticlassSpellcaster()`)
- If multiclass: uses `getMulticlassSpellSlots()` (combined caster level)
- If single-class: uses `getSlotProgression()` for the caster class
- Warlock Pact Magic: separate `getWarlockPactSlots()`, stored in `pactMagicSlotLevels` if the character also has non-Warlock casting
- Slot gains are calculated as delta: `current + max(0, newMax - oldMax)` (lines 239-241)

### Issues Found

1. **No spell swap/replacement** — The 2024 PHB allows most classes to swap one prepared spell when they gain a level. The current system only allows *adding* new spells; there is no mechanism to remove or replace existing spells during level-up. `SpellSelectionSection5e.tsx` only shows spells not already known (line 131: `existingIds.has(s.id)` is filtered out). **Missing feature.**

2. **No cantrip selection during level-up** — Cantrips known increase at certain levels (`CANTRIPS_KNOWN` in `spell-data.ts` lines 100-107), but the level-up UI does not offer a cantrip picker. `SpellSelectionSection5e.tsx` line 131 explicitly filters out `s.level === 0`. Players cannot learn new cantrips during level-up. **Missing feature.**

3. **Half-caster level 1 spell slots incorrect** — `getSlotProgression()` line 444 uses `Math.ceil(level / 2)` for half-casters. For Paladin level 1: `ceil(1/2) = 1`, giving 2 first-level slots. Per 2024 PHB, Paladins get no spell slots at level 1 (they begin spellcasting at level 2). Similarly, Rangers don't get spell slots at level 1. **Bug.**

4. **Multiclass half-caster rounding inconsistency** — For the multiclass spell slot table, `getMulticlassSpellSlots()` line 466 uses `Math.ceil(level / 2)` for half-casters. The 2024 PHB multiclass spellcaster rules specify half-casters contribute `ceil(level / 2)` for the combined table. The single-class table may differ from the multiclass contribution formula. This should be verified against the specific 2024 PHB tables.

5. **`spellsRequired` uses `PREPARED_SPELLS` table for known-spell classes** — `SpellSelectionSection5e.tsx` line 89: `PREPARED_SPELLS[className]` is used for all caster classes. In 2024 PHB, all classes are now "prepared" casters, so this is correct. However, the table is used to calculate how many *new* spells to pick, not total prepared. The formula `newMax - existingCount` (line 91) assumes the existing count is accurate, but if the player previously over- or under-selected spells, the count could be wrong.

6. **No Warlock spell selection** — Warlocks use `PREPARED_SPELLS['warlock']` for their spell count, but the UI doesn't distinguish between Pact Magic spell lists and regular spell lists for multiclass Warlock combinations.

7. **Third-caster spell list is always Wizard** — Line 121 of `SpellSelectionSection5e.tsx`: `isThirdCasterClass ? 'wizard' : className`. This is correct for Eldritch Knight and Arcane Trickster per 2024 PHB (both use Wizard spell list).

8. **Class features with granted spells not handled** — Some class features (e.g., Druid's "Speak with Animals", Ranger's "Hunter's Mark") are hardcoded as always-prepared in `apply-level-up.ts` lines 344-360. This is a fragile approach — only two spells are handled. Other class-granted spells (e.g., Cleric domain spells beyond subclass) are not covered.

---

## 7. Multiclassing Rules Enforcement

### Prerequisite Checking

Two parallel systems exist:

**1. Store-level validation** (`types.ts` lines 5-40):
- `MULTICLASS_PREREQUISITES` record with class → ability requirements and `'all'` | `'any'` mode
- `checkMulticlassPrerequisites()` returns error string or null
- Called in `getIncompleteChoices()` (lines 99-119) for both the primary class and all new classes

**2. Data file** (`multiclass-prerequisites.ts` lines 8-81):
- `MULTICLASS_PREREQUISITES` array with `abilityRequirements` and `requireAll` boolean
- Used by `multiclass-advisor.ts` for the advisory UI on the character sheet
- `MULTICLASS_PROFICIENCY_GAINS` (lines 88-110): proficiencies gained per class
- `MULTICLASS_WARNINGS` (lines 117-134): gameplay warnings

**3. UI-level** (`LevelUpConfirm5e.tsx` lines 41-87):
- `ClassLevelSelector` shows all eligible classes in a dropdown
- `meetsPrerequisites()` (lines 9-39) parses ability score strings and checks character scores
- Ineligible classes are excluded from the dropdown (line 59-62)

### Prerequisite Values (Both Sources)

Both `types.ts` and `multiclass-prerequisites.ts` agree on all 12 class prerequisites:

| Class | Requirements | Mode |
|-------|-------------|------|
| Barbarian | STR 13 | All |
| Bard | CHA 13 | All |
| Cleric | WIS 13 | All |
| Druid | WIS 13 | All |
| Fighter | STR 13 or DEX 13 | Any |
| Monk | DEX 13 and WIS 13 | All |
| Paladin | STR 13 and CHA 13 | All |
| Ranger | DEX 13 and WIS 13 | All |
| Rogue | DEX 13 | All |
| Sorcerer | CHA 13 | All |
| Warlock | CHA 13 | All |
| Wizard | INT 13 | All |

These are **correct per 2024 PHB**.

### Combined Spell Slot Table

`spell-data.ts` `getMulticlassSpellSlots()` (lines 458-473):
- Full casters: contribute full level
- Half casters: contribute `ceil(level / 2)`
- Third casters: contribute `floor(level / 3)`
- Warlock: excluded (Pact Magic is separate)
- Combined level mapped to `FULL_CASTER_SLOTS` table

### Warlock + Other Caster

`apply-level-up.ts` lines 226-261:
- If character has both Warlock and non-Warlock casters, Pact Magic slots are stored in a separate `pactMagicSlotLevels` field
- If Warlock is the only caster, Pact Magic slots go into `spellSlotLevels`
- This is the **correct** handling per 2024 PHB

### Proficiencies Gained

`apply-level-up.ts` lines 288-318:
- For each new class added (`newClassesAdded`), armor and weapon proficiencies from `classDataMap[classId].multiclassing` are merged
- Additionally handles:
  - Primal Order (Warden): Medium armor + Martial weapons (line 306)
  - Divine Order (Protector): Heavy armor + Martial weapons (line 312)
  - Druidic language auto-grant (lines 321-325)

### Hit Dice for Multiclass

`apply-level-up.ts` lines 402-414: Only tracks hit dice for the primary class. **Bug** — multiclass characters should have separate hit dice pools per class.

### Multiclass Slot Generation

`build-tree-5e.ts` `generate5eLevelUpSlots()` (lines 266-390):
- When `classLevelChoices` is provided, generates slots per class level (not character level)
- ASI at the correct class-specific levels (e.g., Fighter 6 gets ASI even if character level 10)
- Subclass at class level 3 (not character level 3)
- Expertise at class-specific levels

### Issues Found

1. **Duplicate prerequisite systems** — `types.ts` and `multiclass-prerequisites.ts` define the same prerequisites in different formats. This creates maintenance burden and potential for drift. They should be consolidated.

2. **Multiclass prerequisite check uses pre-ASI scores** — `getIncompleteChoices()` in `feature-selection-slice.ts` line 110 uses `character.abilityScores`, not the post-ASI scores from the current level-up. If a player boosts CHA from 12 to 13 via ASI at level 4, they still can't multiclass into Bard at level 5 in the same level-up session (even though the score would be 13 after applying). This is arguably correct (prereqs should be met before leveling) but could frustrate players doing multi-level jumps.

3. **Hit dice tracking is broken for multiclass** — As noted in Section 3, `apply-level-up.ts` lines 402-414 only add hit dice to the primary class's pool. A Fighter 5/Wizard 1 gaining a Wizard level would get a d10 added instead of a d6.

4. **Multiclass proficiency gains read from `classDataMap` (class JSON data)** — `apply-level-up.ts` lines 289-303 read multiclass proficiency gains from the loaded class JSON, not from the hardcoded `MULTICLASS_PROFICIENCY_GAINS` in `multiclass-prerequisites.ts`. If the JSON data is incomplete or has different field names, proficiencies may not be granted correctly.

5. **No skill proficiency gain for multiclass** — Several classes grant "one skill" when multiclassed into (Bard, Ranger, Rogue). The current `apply-level-up.ts` only handles armor and weapon proficiencies (lines 294-299). Skill proficiency gains are not implemented.

6. **No "Extra Attack doesn't stack" enforcement** — Per 2024 PHB, Extra Attack from multiple classes doesn't stack. While `MULTICLASS_WARNINGS` in `multiclass-prerequisites.ts` mentions this (lines 128-133), it's only a text warning, not a mechanical enforcement.

---

## 8. Edge Cases, Missing Features, and Broken Logic

### Critical Bugs

| # | Bug | Location | Severity |
|---|-----|----------|----------|
| 1 | **Subclass not persisted to character** | `apply-level-up.ts` — no code writes `selectedId` from subclass slots back to `updatedClasses[].subclass` | **Critical** |
| 2 | **Hit dice only track primary class** | `apply-level-up.ts` lines 402-414 | **High** — breaks multiclass short rest healing |
| 3 | **HP display uses pre-ASI CON** | `HpRollSection5e.tsx` line 24 vs `apply-level-up.ts` line 84 | **Medium** — display-only |
| 4 | **Half-caster level 1 spell slots** | `spell-data.ts` line 444 `Math.ceil` should not give slots at level 1 | **Medium** |
| 5 | **No skill proficiencies for multiclass** | `apply-level-up.ts` lines 288-303 | **Medium** |

### Missing Features

| # | Feature | Impact |
|---|---------|--------|
| 1 | **Spell swap/replacement** | Players cannot replace a prepared spell when leveling up, which is a core 2024 PHB rule for most classes |
| 2 | **Cantrip selection during level-up** | Cantrip counts increase at levels 4/10 but no UI exists to pick them |
| 3 | **Subclass features not auto-loaded** | Only base class features are loaded; subclass features at levels 3/6/10/14 are missing |
| 4 | **Class resource tracking for secondary classes** | Only primary class resources are recalculated; multiclass secondary resources are stale |
| 5 | **Fighting Style replacement at higher levels** | 2024 PHB allows some classes to replace fighting styles at certain levels; not implemented |
| 6 | **Spellcasting ability choice for multiclass** | If a character multiclasses into two different spellcasting classes, the system uses the primary class's ability for all; no per-class spellcasting ability display |
| 7 | **HP reroll protection** | No lock after rolling; players can re-roll indefinitely |
| 8 | **Feat sub-choice validation** | Feats with `choiceConfig` (like Elemental Adept damage type) are not validated in `getIncompleteChoices()` |
| 9 | **XP-based level-up triggering** | `CharacterSheet5ePage.tsx` has `shouldLevelUp` banner but XP tracking/deduction is not wired into the level-up flow |
| 10 | **Monk Unarmored Defense / Ki points** | No specific Monk class resource handling in level-up |
| 11 | **Warlock Pact Boon at level 1** | 2024 PHB Warlocks get a Pact Boon invocation at level 1 (Pact of the Blade/Chain/Tome); the invocation selector doesn't enforce that one must be a Pact Boon |

### Architectural Concerns

1. **Test coverage is minimal** — `apply-level-up.test.ts` only verifies the function can be imported (2 trivial tests). `index.test.ts` only checks initial state and method existence. No integration tests for actual level-up scenarios exist.

2. **Silent error swallowing** — Multiple `catch { /* ignore */ }` blocks in `apply-level-up.ts` (lines 67, 189, 363) and `level-up-spells.ts` (lines 64, 82, 99, 130, 159). If data loading fails, the level-up silently produces incomplete results.

3. **No undo/rollback** — Once "Apply Level Up" is clicked, the character is mutated and saved. There is no undo mechanism or confirmation dialog beyond the incomplete choices gate.

4. **Zustand store is global singleton** — `useLevelUpStore` is a single global store. If two browser windows or panels tried to level up different characters simultaneously, they would conflict. This is unlikely in an Electron app but worth noting.

5. **Level-up sound** — `src/renderer/public/sounds/ui/level-up.mp3` exists in the data but there is no evidence it plays during the level-up flow (not referenced in `LevelUp5ePage.tsx` or the apply logic). The `sound-events.json` maps a `level-up` event, but it's unclear if this is triggered.

### Summary of D&D 5e 2024 Compliance

| Category | Rating | Notes |
|----------|--------|-------|
| ASI levels & class-specific extras | **A** | Fully correct |
| Subclass at level 3 (all classes) | **A** | Correct |
| Epic Boon at 19 | **A** | Correct |
| HP calculation | **A-** | Correct math, display bug with CON mod |
| Multiclass prerequisites | **A** | Fully correct, dual-checked |
| Multiclass spell slot table | **A-** | Correct logic, minor rounding concern for half-casters |
| Warlock Pact Magic separation | **A** | Correctly separate |
| Spell selection | **B** | No swap/replacement, no cantrip picker |
| Subclass integration | **C** | Subclass not persisted, features not loaded |
| Multiclass proficiencies | **C+** | Armor/weapons handled, skills missing |
| Hit dice tracking | **D** | Only tracks primary class die type |
| Test coverage | **D** | Import-only tests, no scenario coverage |

---

*End of Phase 24 analysis.*
