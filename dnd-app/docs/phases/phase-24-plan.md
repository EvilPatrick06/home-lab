# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 24 of the D&D VTT project.

Phase 24 covers the **Character Level-Up System**. The wizard is substantially complete for 2024 PHB with correct ASI levels, subclass at 3, epic boons, multiclass prerequisites, and Warlock Pact Magic separation. However, it has **critical bugs**: subclass selection not persisted to the character object, hit dice only tracking the primary class, and half-caster level 1 spell slots incorrect. Missing features include spell swap/replacement and cantrip selection during level-up.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

**Key Files:**

| File | Role | Critical Issues |
|------|------|----------------|
| `src/renderer/src/stores/level-up/apply-level-up.ts` | ~500-line function that mutates character | Subclass not written back; hit dice only primary class; no skill proficiency for multiclass |
| `src/renderer/src/stores/level-up/level-up-spells.ts` | Spell resolution | Uses existing subclass (not newly selected) for always-prepared |
| `src/renderer/src/stores/level-up/feature-selection-slice.ts` | Validation/incomplete checks | No feat sub-choice validation |
| `src/renderer/src/components/levelup/5e/HpRollSection5e.tsx` | HP roll/average UI | Display uses pre-ASI CON; no reroll protection |
| `src/renderer/src/components/levelup/5e/SpellSelectionSection5e.tsx` | Spell picker | No cantrips, no spell swap |
| `src/renderer/src/services/character/spell-data.ts` | Spell slot tables | Half-caster `Math.ceil` gives wrong slots at level 1 |
| `src/renderer/src/components/levelup/5e/AsiSelector5e.tsx` | ASI/feat UI | "+2 to one" doesn't warn about waste at score 19 |

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives

### CRITICAL BUGS

| # | Bug | Location | Impact |
|---|-----|----------|--------|
| B1 | Subclass not persisted to `character.classes[].subclass` | `apply-level-up.ts` — no write-back code | Selecting subclass at level 3 does NOTHING — character has no subclass |
| B2 | Hit dice only track primary class in multiclass | `apply-level-up.ts` lines 402-414 | Fighter 5/Wizard 1 gets d10 pool instead of d10+d6 — breaks short rest healing |
| B3 | Half-caster `Math.ceil` gives spell slots at level 1 | `spell-data.ts` line 444 | Paladin 1 gets 2 first-level slots (should have 0) |

### HIGH BUGS

| # | Bug | Location | Impact |
|---|-----|----------|--------|
| B4 | HP display shows pre-ASI CON modifier | `HpRollSection5e.tsx` line 24 | Displayed HP gain differs from actual applied HP |
| B5 | No skill proficiency gained on multiclass | `apply-level-up.ts` lines 288-303 | Bard/Ranger/Rogue multiclass miss one skill proficiency |

### MISSING FEATURES

| # | Feature | Impact |
|---|---------|--------|
| F1 | No spell swap/replacement during level-up | Core 2024 PHB rule — prepared casters can swap one spell per level |
| F2 | No cantrip selection during level-up | Cantrip counts increase at levels 4/10 but no picker UI |
| F3 | Subclass features not auto-loaded | Subclass features at levels 3/6/10/14 missing from character |
| F4 | Feat sub-choice not validated | Feats like Elemental Adept can be "completed" without choosing damage type |
| F5 | No HP reroll protection | Players can re-roll hit die indefinitely |
| F6 | Class resources for secondary classes not updated | Multiclass secondary class resources stale |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Fix Subclass Persistence (B1) — MOST CRITICAL

**Step 1 — Write Subclass Back to Character**
- Open `src/renderer/src/stores/level-up/apply-level-up.ts`
- Find where build slots are processed (around the ASI/feat section)
- Add subclass write-back for the subclass slot:
  ```typescript
  const subclassSlot = levelUpSlots.find(s => s.category === 'subclass' && s.selectedId)
  if (subclassSlot) {
    const classIndex = updatedClasses.findIndex(c => c.id === subclassSlot.classId || c.id === primaryClassId)
    if (classIndex >= 0) {
      updatedClasses[classIndex] = {
        ...updatedClasses[classIndex],
        subclass: subclassSlot.selectedId,
        subclassName: subclassSlot.selectedName
      }
    }
  }
  ```
- Verify `updatedClasses` is later written to the character object

**Step 2 — Fix Always-Prepared Spells to Use New Subclass**
- Open `src/renderer/src/stores/level-up/level-up-spells.ts`
- Find line 135 where `character.classes[0]?.subclass` is read
- Replace with the newly selected subclass from the level-up store:
  ```typescript
  const subclassId = subclassSlot?.selectedId || character.classes[0]?.subclass
  ```
- Pass the selected subclass ID into `resolveLevelUpSpells()`

### Sub-Phase B: Fix Hit Dice Tracking (B2)

**Step 3 — Track Hit Dice Per Class**
- Open `src/renderer/src/stores/level-up/apply-level-up.ts` lines 402-414
- Replace single-pool hit dice with per-class tracking:
  ```typescript
  const hitDiceByClass: Record<string, { die: number; total: number; remaining: number }> = {}
  
  // Initialize from existing character hit dice
  for (const hd of character.hitDice ?? []) {
    hitDiceByClass[hd.classId ?? 'primary'] = { die: hd.die, total: hd.total, remaining: hd.remaining }
  }
  
  // Add new levels' hit dice
  for (let lvl = currentLevel + 1; lvl <= targetLevel; lvl++) {
    const classId = classLevelChoices[lvl] || primaryClassId
    const classData = classDataMap[classId]
    const die = classData?.hitDie ?? 8
    if (!hitDiceByClass[classId]) {
      hitDiceByClass[classId] = { die, total: 0, remaining: 0 }
    }
    hitDiceByClass[classId].total += 1
    hitDiceByClass[classId].remaining += 1
  }
  
  updated.hitDice = Object.entries(hitDiceByClass).map(([classId, hd]) => ({
    classId, ...hd
  }))
  ```
- Verify the `Character5e.hitDice` type supports per-class entries (may need a type update)

### Sub-Phase C: Fix Half-Caster Spell Slots (B3)

**Step 4 — Fix Half-Caster Level 1 Slots**
- Open `src/renderer/src/services/character/spell-data.ts` line 444
- Change `Math.ceil(level / 2)` to a lookup that matches the 2024 PHB half-caster table:
  ```typescript
  function getHalfCasterEffectiveLevel(classLevel: number): number {
    if (classLevel < 2) return 0  // No slots at level 1
    return Math.ceil(classLevel / 2)
  }
  ```
- This ensures Paladin 1 and Ranger 1 get 0 spell slots, while Paladin 2 gets slots as level 1 full caster

### Sub-Phase D: Fix HP Display (B4)

**Step 5 — Show Post-ASI CON in HP Section**
- Open `src/renderer/src/components/levelup/5e/HpRollSection5e.tsx`
- Line 24 uses `character.abilityScores.constitution`
- Calculate the post-ASI CON by reading the ASI selections from the level-up store:
  ```typescript
  const asiSelections = useLevelUpStore(s => s.asiSelections)
  const conBoosts = Object.values(asiSelections).flat().filter(a => a === 'constitution').length
  const effectiveCon = character.abilityScores.constitution + conBoosts
  const conMod = Math.floor((effectiveCon - 10) / 2)
  ```
- Display this corrected modifier in the HP calculation preview

### Sub-Phase E: Fix Multiclass Skill Proficiencies (B5)

**Step 6 — Add Skill Proficiency Grants for Multiclass**
- Open `src/renderer/src/stores/level-up/apply-level-up.ts`
- After armor/weapon proficiency grants (lines 288-303), add skill proficiency handling:
  ```typescript
  const MULTICLASS_SKILL_GRANTS: Record<string, number> = {
    bard: 1,    // 1 skill of your choice
    ranger: 1,  // 1 skill from Ranger list
    rogue: 1    // 1 skill from Rogue list
  }
  
  for (const classId of newClassesAdded) {
    const skillCount = MULTICLASS_SKILL_GRANTS[classId]
    if (skillCount) {
      // TODO: The implementation agent should check if the level-up UI already has
      // a skill picker for multiclass. If not, add one to LevelUpConfirm5e.tsx
      // For now, note that skills need to be selected by the player, not auto-assigned
    }
  }
  ```
- Add a skill picker UI in `LevelUpConfirm5e.tsx` when a new class is added that grants skills

### Sub-Phase F: Spell Swap/Replacement (F1)

**Step 7 — Add Spell Swap UI**
- Open `src/renderer/src/components/levelup/5e/SpellSelectionSection5e.tsx`
- Add a "Replace Spell" section above the "Learn New Spells" section:
  ```tsx
  <div>
    <h4>Replace a Spell (Optional)</h4>
    <p className="text-xs text-gray-400">You may replace one prepared spell with another of a level you can cast.</p>
    <select value={swapOutSpellId} onChange={e => setSwapOutSpellId(e.target.value)}>
      <option value="">None</option>
      {existingSpells.map(s => <option key={s.id} value={s.id}>{s.name} (Level {s.level})</option>)}
    </select>
    {swapOutSpellId && <SpellPicker onSelect={setSwapInSpellId} maxLevel={maxSpellLevel} />}
  </div>
  ```
- Store the swap in the level-up store: `spellSwap: { removeId: string; addId: string } | null`
- In `apply-level-up.ts`, process the swap: remove the old spell, add the new one

### Sub-Phase G: Cantrip Selection (F2)

**Step 8 — Add Cantrip Picker During Level-Up**
- Open `src/renderer/src/components/levelup/5e/SpellSelectionSection5e.tsx`
- Currently line 131 filters out `s.level === 0` (cantrips)
- Add a separate cantrip section when the cantrip count increases at this level:
  ```typescript
  const oldCantrips = CANTRIPS_KNOWN[className]?.[currentLevel] ?? 0
  const newCantrips = CANTRIPS_KNOWN[className]?.[targetLevel] ?? 0
  const cantripsToLearn = newCantrips - existingCantripCount
  
  if (cantripsToLearn > 0) {
    // Show cantrip picker with count = cantripsToLearn
  }
  ```
- Import `CANTRIPS_KNOWN` from `spell-data.ts`
- Filter available cantrips by the character's class spell list

### Sub-Phase H: Subclass Feature Loading (F3)

**Step 9 — Load Subclass Features During Level-Up**
- Open `src/renderer/src/stores/level-up/apply-level-up.ts` lines 164-190
- After loading class features, also load subclass features:
  ```typescript
  const subclassId = subclassSlot?.selectedId || character.classes[0]?.subclass
  if (subclassId) {
    const subclassData = await load5eSubclass(subclassId)
    if (subclassData?.features) {
      for (const feature of subclassData.features) {
        if (feature.level >= currentLevel + 1 && feature.level <= targetLevel) {
          allNewFeatures.push({
            level: feature.level,
            name: feature.name,
            description: feature.description,
            source: subclassData.name
          })
        }
      }
    }
  }
  ```
- Verify `load5eSubclass()` exists or create it from the existing subclass data loading pattern

### Sub-Phase I: Validation Fixes (F4, F5)

**Step 10 — Validate Feat Sub-Choices**
- Open `src/renderer/src/stores/level-up/feature-selection-slice.ts`
- In `getIncompleteChoices()`, add validation for feat `choiceConfig`:
  ```typescript
  for (const [slotId, feat] of Object.entries(generalFeatSelections)) {
    if (feat.choiceConfig && !feat.choiceValue) {
      incomplete.push(`${feat.name}: Choose a ${feat.choiceConfig.label}`)
    }
  }
  ```

**Step 11 — Add HP Reroll Protection**
- Open `src/renderer/src/components/levelup/5e/HpRollSection5e.tsx`
- After rolling, disable the roll button (lock the result):
  ```typescript
  const [locked, setLocked] = useState(false)
  
  const doRoll = () => {
    if (locked) return
    const result = Math.floor(Math.random() * hitDie) + 1
    setRoll(result)
    setLocked(true)  // Lock after first roll
    onRollHp(level, result)
  }
  ```
- Add a DM setting: `allowHpRerolls: boolean` (default: false). If true, the lock is skipped.
- Show the lock state visually: "Rolled: {value} (locked)" with a lock icon

### Sub-Phase J: Secondary Class Resources (F6)

**Step 12 — Update Resources for All Classes**
- Open `src/renderer/src/stores/level-up/apply-level-up.ts` lines 423-441
- Currently calls `getClassResources()` only for `primaryClassId`
- Iterate all classes and update resources for each:
  ```typescript
  for (const cls of updatedClasses) {
    const classLevel = classLvlTracker[cls.id] ?? 0
    const resources = getClassResources(cls.id, classLevel)
    if (resources) {
      mergeResources(updated.classResources, resources)
    }
  }
  ```
- Create `mergeResources()` that combines resource arrays without duplicating

---

## ⚠️ Constraints & Edge Cases

### Subclass Persistence
- **This is the most critical fix** — without it, characters created at level 3+ via level-up have NO subclass. All subclass features, always-prepared spells, and subclass-specific behavior are broken.
- **Verify the character type**: Ensure `Character5e.classes[].subclass` field exists and is the correct type (string ID).
- **Test**: After fixing, level a character from 2 to 3, select a subclass, apply. Verify the character's `classes[0].subclass` is set.

### Hit Dice Per Class
- **Type change required**: The `Character5e.hitDice` field may currently be `{ die: number; total: number; remaining: number }[]` without a `classId`. Adding `classId` changes the type — ensure backward compatibility with existing characters (default to primary class ID if `classId` is undefined).
- **Short rest**: The `RestModal` hit die roller must show per-class dice options (e.g., "d10 (Fighter): 3 remaining, d6 (Wizard): 1 remaining"). Verify the rest UI supports this.

### Half-Caster Level 1
- **Single-class only**: This fix affects the single-class half-caster table. The multiclass combined table uses `Math.ceil` which is correct per 2024 PHB for the combined table. Do NOT change the multiclass function.
- **Test**: Verify Paladin 1 = 0 slots, Paladin 2 = 2 first-level slots, Ranger 1 = 0 slots.

### Spell Swap
- **One swap per level-up**: The 2024 PHB allows swapping one spell per level gained. If leveling 4 levels at once, allow 4 swaps.
- **Level restriction**: The replacement spell must be of a level the character can cast (not just any level).
- **Always-prepared spells cannot be swapped** — they're granted by class/subclass.

### Cantrip Selection
- **Cantrip count by class**: Each class has its own cantrip progression. In multiclass, each class contributes its own cantrips. Verify the picker uses the correct class's cantrip list.
- **No cantrip swap**: Unlike prepared spells, cantrips are permanent once learned (2024 PHB rule). No swap mechanism for cantrips.

Begin implementation now. Start with Sub-Phase A (Steps 1-2) — the subclass persistence bug is CRITICAL and means every level 3+ character created via level-up has no subclass. Then Sub-Phase B (Step 3) for hit dice. Then Sub-Phase C (Step 4) for half-caster slots. These three fixes address the most impactful rule violations.
