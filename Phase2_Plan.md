# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 2 of the D&D VTT project.

Phase 2 covers the **Character Creation System** — the builder wizard, data completeness, save/load, and comparison gaps with D&D Beyond. The audit found the system substantially complete (10 species, 12 classes, 48 subclasses, 16 backgrounds, 81 feats, 4 ability score methods, equipment system, versioned saves). The work here is **bug fixes, store hardening, and UX improvements** — not building from scratch.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 2 is entirely client-side. The Raspberry Pi has no involvement in character creation.

**Builder Components (`src/renderer/src/components/builder/`):**

| File | Role |
|------|------|
| `5e/CharacterBuilder5e.tsx` | Main container, 17-rule validation, save trigger |
| `5e/MainContentArea5e.tsx` | Tab content + modal orchestration |
| `5e/ContentTabs5e.tsx` | Tab bar (About, Specials, Languages, Spells, Gear) |
| `5e/DetailsTab5e.tsx` | Name, alignment, icon, equipment choices, appearance |
| `5e/SpecialAbilitiesTab5e.tsx` | Background ASI, size, spellcasting ability |
| `5e/LanguagesTab5e.tsx` | Language selection |
| `5e/SpellsTab5e.tsx` | Cantrip/prepared spell selection |
| `5e/GearTab5e.tsx` | Currency + equipment shop |
| `5e/HigherLevelEquipment5e.tsx` | Higher-level starting equipment |
| `5e/EquipmentShop5e.tsx` | Searchable equipment catalog |
| `shared/BuildSidebar.tsx` | Left sidebar with build slots |
| `shared/AbilityScoreModal.tsx` | 4-method ability score assignment |
| `shared/SkillsModal.tsx` | Skill proficiency selection |
| `shared/AsiModal.tsx` | ASI selection |
| `shared/ExpertiseModal.tsx` | Expertise selection |
| `shared/SelectionModal.tsx` | Class/species/background/subclass picker |

**Builder Store (`src/renderer/src/stores/builder/`):**

| File | Role |
|------|------|
| `index.ts` | Zustand store composition (6 slices) |
| `types.ts` | All type definitions (`BuilderPhase`, slice states) |
| `slices/core-slice.ts` | Phase, slots, tabs, level |
| `slices/ability-score-slice.ts` | Ability scores, methods, ASI |
| `slices/selection-slice.ts` | Modal state |
| `slices/character-details-slice.ts` | All character fields + `customModal` (misplaced) |
| `slices/build-actions-slice.ts` | Slot progression logic |
| `slices/save-slice.ts` | Save/load orchestration |
| `slices/build-character-5e.ts` | Assembles final Character5e (665 lines) |
| `slices/load-character-5e.ts` | Hydrates builder from saved character |

**Services:**

| File | Role |
|------|------|
| `src/renderer/src/services/character/build-tree-5e.ts` | Build slot generation (391 lines) |
| `src/renderer/src/services/character/stat-calculator-5e.ts` | Stat derivation, HP, AC, bonuses |
| `src/renderer/src/services/character/spell-data.ts` | Spellcasting info, slot progression |
| `src/renderer/src/services/io/character-io.ts` | Import/export |
| `src/renderer/src/hooks/use-auto-save.ts` | Draft auto-save (30s, minimal) |

**Pages:**

| File | Role |
|------|------|
| `src/renderer/src/pages/CreateCharacterPage.tsx` | Entry point, draft handling, NO useParams |
| `src/renderer/src/pages/CharacterSheet5ePage.tsx` | Sheet page with toolbar |
| `src/renderer/src/pages/LevelUp5ePage.tsx` | Level-up wizard |

**Storage (Main Process):**

| File | Role |
|------|------|
| `src/main/storage/character-storage.ts` | CRUD + 20-version backups |
| `src/main/ipc/storage-handlers.ts` | IPC handlers (lines 57-91) |

**Types:**

| File | Key Type |
|------|----------|
| `src/renderer/src/types/builder.ts` line 3 | `BuilderPhase = 'system-select' \| 'building' \| 'complete'` |

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

No character creation logic runs on BMO.

---

## 📋 Core Objectives & Corrections

### CONFIRMED BUGS (All verified in source code)

| # | Bug | File | Lines | Severity |
|---|-----|------|-------|----------|
| B1 | `BuilderPhase` includes `'complete'` but nothing ever sets it | `types.ts` line 3, `core-slice.ts`, `load-character-5e.ts` | N/A | Medium |
| B2 | `customModal` is UI state living in `character-details-slice` | `character-details-slice.ts` line 56, 154-155 | 56, 154-155 | Low (architectural) |
| B3 | Async race in `setClassEquipmentChoice` — rapid option switching causes stale `.then()` callback to overwrite correct equipment | `character-details-slice.ts` lines 109-132 | 109-132 | High |
| B4 | `addEquipmentItem` always targets `classEquipment` — no way to add to `bgEquipment` | `character-details-slice.ts` lines 98-100 | 98-100 | Medium |
| B5 | Edit URL `/characters/5e/edit/:id` doesn't use `useParams` — direct navigation or refresh shows empty builder | `CreateCharacterPage.tsx` lines 8-11 | 8-11 | High |
| B6 | Point buy budget enforced only in `AbilityScoreModal` UI, not in store | `ability-score-slice.ts` line 21 | 21 | Medium |
| B7 | Skill count not enforced in store — `selectedSkills` can exceed `maxSkills` | Store accepts any array length | N/A | Medium |
| B8 | Spell count not enforced in store — selected spells not validated against maximums | Store accepts any spell list | N/A | Medium |

### UX IMPROVEMENTS NEEDED

| # | Improvement | Priority |
|---|------------|----------|
| U1 | Full draft auto-save — currently only saves name, gameSystem, abilityScores. Should persist full builder state. | High |
| U2 | Progress indicator — no step counter or completion percentage in the builder | Medium |
| U3 | Guided mode for new players — optional locked-step wizard flow | Low |
| U4 | Specials tab shows message when background not selected — should redirect to background slot | Low |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Critical Bug Fixes

**Step 1 — Fix Async Race in setClassEquipmentChoice (B3)**
- Open `src/renderer/src/stores/builder/slices/character-details-slice.ts`
- Find `setClassEquipmentChoice` at lines 109-132
- Add a version counter or AbortController pattern:
  ```typescript
  // Add at slice level
  let equipmentLoadVersion = 0

  setClassEquipmentChoice: (choice) => {
    set({ classEquipmentChoice: choice })
    const { buildSlots, gameSystem } = get()
    if (gameSystem !== 'dnd5e') return
    const classSlot = buildSlots.find((s) => s.category === 'class')
    if (!classSlot?.selectedId) return
    const thisVersion = ++equipmentLoadVersion
    load5eClasses().then((classes) => {
      if (thisVersion !== equipmentLoadVersion) return  // stale callback
      const cls = classes.find((c) => c.id === classSlot.selectedId)
      if (!cls) return
      const equipment = cls.coreTraits.startingEquipment
      if (equipment && equipment.length > 0) {
        const chosen = equipment.find((e) => e.label === choice) ?? equipment[0]
        if (!chosen) return
        const shopItems = get().classEquipment.filter((e) => e.source === 'shop')
        set({
          classEquipment: [
            ...chosen.items.map((name) => ({ name, quantity: 1, source: cls.name })),
            ...shopItems
          ]
        })
      }
    })
  }
  ```

**Step 2 — Fix Edit URL Self-Hydration (B5)**
- Open `src/renderer/src/pages/CreateCharacterPage.tsx`
- Import `useParams` from `react-router-dom`
- Extract `id` from URL params
- If `id` is present and `editingCharacterId` is not set in the store, load the character from storage:
  ```typescript
  const { id } = useParams<{ id: string }>()
  const editingCharacterId = useBuilderStore((s) => s.editingCharacterId)

  useEffect(() => {
    if (id && !editingCharacterId) {
      // Load character from storage and hydrate builder
      window.api.loadCharacter(id).then((character) => {
        if (character) {
          useBuilderStore.getState().loadCharacterForEdit(character)
        }
      })
    }
  }, [id, editingCharacterId])
  ```
- Verify the IPC channel `storage:load-character` accepts a single ID parameter

**Step 3 — Fix addEquipmentItem Source Targeting (B4)**
- Open `src/renderer/src/stores/builder/slices/character-details-slice.ts`
- Find `addEquipmentItem` at lines 98-100
- Add a `target` parameter:
  ```typescript
  addEquipmentItem: (item, target: 'class' | 'background' = 'class') => {
    if (target === 'background') {
      set({ bgEquipment: [...get().bgEquipment, item] })
    } else {
      set({ classEquipment: [...get().classEquipment, item] })
    }
  }
  ```
- Update the type definition in `types.ts` to reflect the new signature
- Search for all callsites of `addEquipmentItem` and verify they pass the correct target (or rely on default `'class'`)

**Step 4 — Set phase: 'complete' After Save (B1)**
- Open `src/renderer/src/stores/builder/slices/save-slice.ts`
- Find the save action that calls `buildCharacter5e()` and persists via IPC
- After successful save, set `phase: 'complete'`:
  ```typescript
  set({ phase: 'complete' })
  ```
- Verify `CharacterBuilder5e.tsx` doesn't break when phase is `'complete'` (e.g., ensure save button and validation still work if user returns to builder)

### Sub-Phase B: Store Validation Hardening

**Step 5 — Enforce Point Buy Budget in Store (B6)**
- Open `src/renderer/src/stores/builder/slices/ability-score-slice.ts`
- Find `setAbilityScores` at line 21
- Add validation when method is `'pointBuy'`:
  ```typescript
  setAbilityScores: (scores) => {
    const method = get().abilityScoreMethod
    if (method === 'pointBuy') {
      const total = Object.values(scores).reduce((sum, val) => {
        const clamped = Math.max(8, Math.min(15, val))
        return sum + (POINT_BUY_COSTS[clamped] ?? 0)
      }, 0)
      if (total > POINT_BUY_BUDGET) return // reject
    }
    set({ abilityScores: scores })
  }
  ```
- Import `POINT_BUY_COSTS` and `POINT_BUY_BUDGET` constants (defined in `AbilityScoreModal` — extract to shared constants if needed)

**Step 6 — Enforce Skill Count in Store (B7)**
- Find the `setSelectedSkills` action in the builder store
- Add validation: `if (skills.length > maxSkills) return`
- Determine `maxSkills` from class data + any bonus skill sources

**Step 7 — Enforce Spell Count in Store (B8)**
- Find the spell selection actions in the builder store
- Add cantrip count and prepared spell count validation
- Pull max counts from class spellcasting data at the current level

### Sub-Phase C: UX Improvements

**Step 8 — Full Draft Auto-Save (U1)**
- Open `src/renderer/src/hooks/use-auto-save.ts`
- Currently saves: `{ characterName, gameSystem, abilityScores, timestamp }`
- Expand to save the full builder store snapshot:
  ```typescript
  const draft = {
    characterName: store.characterName,
    gameSystem: store.gameSystem,
    abilityScores: store.abilityScores,
    abilityScoreMethod: store.abilityScoreMethod,
    selectedSkills: store.selectedSkills,
    classEquipment: store.classEquipment,
    bgEquipment: store.bgEquipment,
    classEquipmentChoice: store.classEquipmentChoice,
    backgroundEquipmentChoice: store.backgroundEquipmentChoice,
    chosenLanguages: store.chosenLanguages,
    selectedSpells: store.selectedSpells,
    // ... all builder state fields
    buildSlots: store.buildSlots,
    timestamp: Date.now()
  }
  ```
- Update the resume-from-draft logic in `CreateCharacterPage.tsx` to hydrate all fields
- Keep the 7-day expiry

**Step 9 — Progress Indicator (U2)**
- Open `src/renderer/src/components/builder/5e/CharacterBuilder5e.tsx`
- The 17 validation rules already exist (lines 100-274)
- Add a computed `completionPercentage`:
  ```typescript
  const totalRules = validationRules.length
  const passedRules = validationRules.filter(r => r.passes).length
  const completionPct = Math.round((passedRules / totalRules) * 100)
  ```
- Render a progress bar or step indicator near the top of the builder
- Open `src/renderer/src/components/builder/5e/CharacterSummaryBar5e.tsx`
- Add the completion percentage display to the summary bar

**Step 10 — Move customModal to UI Slice (B2)**
- Open `src/renderer/src/stores/builder/slices/character-details-slice.ts`
- Remove `customModal`, `openCustomModal`, `closeCustomModal` from this slice
- Create a new UI slice or add to `core-slice.ts`:
  ```typescript
  // In core-slice.ts
  customModal: null as 'ability-scores' | 'skills' | 'asi' | 'expertise' | null,
  activeAsiSlotId: null as string | null,
  activeExpertiseSlotId: null as string | null,
  openCustomModal: (modal) => set({ customModal: modal }),
  closeCustomModal: () => set({ customModal: null, activeAsiSlotId: null, activeExpertiseSlotId: null }),
  ```
- Update `types.ts` to move the type from `CharacterDetailsSliceState` to `CoreSliceState`
- Search for all imports of `openCustomModal`/`closeCustomModal`/`customModal` and verify they still resolve from the same top-level store

### Sub-Phase D: Specials Tab Redirect (U4)

**Step 11 — Specials Tab Background Redirect**
- Open `src/renderer/src/components/builder/5e/SpecialAbilitiesTab5e.tsx`
- Find the message shown when background is not selected
- Add a clickable link/button that opens the background selection slot:
  ```typescript
  <button onClick={() => {
    const bgSlot = buildSlots.find(s => s.category === 'background')
    if (bgSlot) openSelectionModal(bgSlot)
  }}>
    Select a Background
  </button>
  ```

### Sub-Phase E: Multiclass Spellcasting Verification

**Step 12 — Verify Multiclass Spell Slot Table**
- Open `src/renderer/src/services/character/spell-data.ts`
- Find `computeSpellcastingInfo` or equivalent
- Verify it correctly handles multiclass spell slot calculation per 2024 PHB rules:
  - Full casters (Bard, Cleric, Druid, Sorcerer, Wizard): contribute full level
  - Half casters (Paladin, Ranger): contribute half level (rounded down)
  - Third casters (Eldritch Knight Fighter, Arcane Trickster Rogue): contribute one-third level (rounded down)
  - Warlock Pact Magic: separate slot pool, does NOT combine with multiclass table
- If the calculation is incorrect or incomplete, fix it
- Add or verify a test in the existing test suite

---

## ⚠️ Constraints & Edge Cases

### D&D 5e 2024 Rules Compliance
- **Ability score bonuses come from backgrounds, NOT species** in 2024 rules. The current implementation is correct — do NOT add species ability bonuses to `calculate5eStats()`.
- **All subclasses unlock at level 3** (2024 PHB rule). The `SUBCLASS_LEVEL = 3` constant in `build-tree-5e.ts` is correct.
- **ASI levels**: 4, 8, 12, 16 for all classes; Fighter adds 6, 14; Rogue adds 10. Verify these match after any changes.
- **Epic Boons** are available at level 19 as a feat choice, not a separate class feature. Verify `build-tree-5e.ts` lines 214-224 handle this correctly.
- **Point Buy**: Budget is 27 points. Scores 8-15. Cost table: 8=0, 9=1, 10=2, 11=3, 12=4, 13=5, 14=7, 15=9. Do NOT change these values.

### Backward Compatibility
- The `addEquipmentItem` signature change (Step 3) must default to `'class'` to avoid breaking existing callsites.
- The expanded auto-save draft format must gracefully handle loading old-format drafts (only name/system/scores) — check for missing fields and fall back to defaults.
- The `phase: 'complete'` transition must not prevent re-editing — if user navigates back to builder, phase should reset to `'building'`.
- Moving `customModal` to `core-slice` must not break any component that reads it from the store — the top-level store interface remains the same.

### Race Condition Prevention
- The version counter pattern for `setClassEquipmentChoice` must be a module-level `let` variable (not store state) to avoid triggering re-renders.
- The `useParams` hydration in `CreateCharacterPage` must be idempotent — if the character is already loaded (editingCharacterId matches URL id), do not reload.
- The `useEffect` for URL hydration must handle the case where `loadCharacter` IPC returns null (character was deleted) — redirect to character list.

### Store Validation Rules
- Point buy validation must only reject when method is `'pointBuy'` — `'standard'`, `'roll'`, and `'custom'` methods should pass through unchecked.
- Skill validation must account for bonus skills from species traits (e.g., Elf Keen Senses grants 1 extra).
- Spell validation must account for bonus cantrips/spells from species, subclass, and feat sources — not just class spell slots.

Begin implementation now. Start with Sub-Phase A (Steps 1-4) as these are the highest-severity bugs. Verify each fix compiles before moving to the next step.
