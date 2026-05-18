# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 23 of the D&D VTT project.

Phase 23 covers the **In-Game Character Sheet** — data binding, real-time sync, inventory, spellbook, conditions, and performance. The sheet is feature-rich and functional but needs **performance optimization** (no virtualization for spell/equipment lists, limited useMemo), **spell search/filtering**, **sync conflict resolution**, and **consistency fixes** (remote characters stored in wrong store, attunement count mismatch).

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

### Cross-Phase Overlap (DO NOT duplicate)

| Issue | Owned By |
|-------|----------|
| Conditions not mechanically applied to rolls | Phase 1 (D7), Phase 4 |
| Death save automation | Phase 4 (B) |
| Concentration save on damage | Phase 4 (noted in Phase 11) |
| Accessibility/ARIA on sheet | Phase 18 |
| Player inventory panel (in-game) | Phase 15 (A) |

---

## 📋 Net-New Objectives

### HIGH PRIORITY

| # | Issue | Impact |
|---|-------|--------|
| S1 | No virtualization for spell/equipment lists — lag with 50+ items | Performance |
| S2 | No spell search/filter within spell list | UX — hard to find spells |
| S3 | Remote character updates go to `lobbyStore.remoteCharacters` not character store | Data inconsistency |
| S4 | No conflict resolution for simultaneous DM+player edits | Last-write-wins silently |

### MEDIUM PRIORITY

| # | Issue | Impact |
|---|-------|--------|
| M1 | Limited useMemo — most sections recalculate on every render | Performance |
| M2 | Attunement count mismatch between AttunementTracker and MagicItemsPanel | Confusing display |
| M3 | No optimistic updates — UI waits for IPC round-trip | Sluggish feel |
| M4 | Inconsistent use of `useCharacterEditor` vs direct store calls | Code maintenance |
| M5 | No tool proficiency roll buttons | Missing QoL feature |

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: List Virtualization (S1)

**Step 1 — Virtualize Spell List**
- Open `src/renderer/src/components/sheet/5e/SpellList5e.tsx`
- The project already uses `@tanstack/react-virtual` (in ChatPanel, LibraryItemList)
- Wrap the spell list in a virtualizer:
  ```typescript
  import { useVirtualizer } from '@tanstack/react-virtual'

  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: filteredSpells.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48, // estimated row height
    overscan: 5
  })
  ```
- Render only visible spell rows with `virtualizer.getVirtualItems()`
- Keep the level grouping — virtualize within each level group or flatten with group headers

**Step 2 — Virtualize Equipment List**
- Open `src/renderer/src/components/sheet/5e/EquipmentListPanel5e.tsx`
- Apply same `@tanstack/react-virtual` pattern for equipment items
- Equipment lists can grow large with pack contents expanded

### Sub-Phase B: Spell Search & Filter (S2)

**Step 3 — Add Spell Search Box**
- Open `SpellcastingSection5e.tsx` or `SpellList5e.tsx`
- Add a search input above the spell list:
  ```tsx
  <input
    type="text"
    placeholder="Search spells..."
    value={spellSearch}
    onChange={(e) => setSpellSearch(e.target.value)}
    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm"
  />
  ```
- Filter spells by name match (case-insensitive includes)

**Step 4 — Add Spell Filters**
- Add filter chips for:
  - School: Abjuration, Conjuration, Divination, Enchantment, Evocation, Illusion, Necromancy, Transmutation
  - Casting time: Action, Bonus Action, Reaction, 1 Minute+
  - Components: V, S, M
  - Concentration: Yes/No
  - Ritual: Yes/No
  - Prepared: Prepared only / All
- Use multi-select chip pattern (toggle each filter on/off)

### Sub-Phase C: Fix Remote Character Store (S3)

**Step 5 — Unify Character Update Flow**
- Open `src/renderer/src/stores/network-store/client-handlers.ts` lines 734-745
- Currently: `dm:character-update` sets character in `lobbyStore.remoteCharacters`
- This means the character store and lobby store can have different versions of the same character
- Fix: Also update the character store when receiving a character update:
  ```typescript
  case 'dm:character-update': {
    const payload = message.payload as CharacterUpdatePayload
    if (payload.characterData) {
      // Update BOTH stores
      useLobbyStore.getState().setRemoteCharacter(payload.characterId, payload.characterData as Character5e)
      useCharacterStore.getState().updateCharacterInState(payload.characterId, payload.characterData as Character5e)
    }
    break
  }
  ```
- Add `updateCharacterInState(id, data)` to the character store if it doesn't exist

### Sub-Phase D: Conflict Resolution (S4)

**Step 6 — Add Timestamp-Based Conflict Detection**
- Every character save already stamps `updatedAt: new Date().toISOString()`
- When receiving a `dm:character-update`, compare timestamps:
  ```typescript
  const localChar = useCharacterStore.getState().characters.find(c => c.id === payload.characterId)
  const remoteTimestamp = new Date(payload.characterData.updatedAt).getTime()
  const localTimestamp = localChar ? new Date(localChar.updatedAt).getTime() : 0

  if (localTimestamp > remoteTimestamp) {
    // Local version is newer — show conflict notification
    showConflictWarning(localChar, payload.characterData)
  } else {
    // Remote version is newer — apply
    applyCharacterUpdate(payload)
  }
  ```

**Step 7 — Create Conflict Resolution UI**
- When a conflict is detected, show a notification:
  ```tsx
  <ConflictBanner>
    Character "{name}" was modified by both you and the DM.
    <button onClick={keepLocal}>Keep Your Version</button>
    <button onClick={acceptRemote}>Accept DM's Version</button>
  </ConflictBanner>
  ```
- For most cases, the DM's version should win (DM is authoritative). But give the player visibility.

### Sub-Phase E: Performance — useMemo (M1)

**Step 8 — Add useMemo to Sheet Sections**
- Wrap expensive calculations in `useMemo`:
  - `SkillsSection5e`: Skill modifier calculations
  - `SavingThrowsSection5e`: Save modifier calculations
  - `OffenseSection5e`: Attack bonus calculations
  - `DefenseSection5e`: AC calculation
  - `SpellcastingSection5e`: Spell DC, attack bonus, slot counts
  - `EquipmentSection5e`: Weight calculation, encumbrance
- Example:
  ```typescript
  const skillModifiers = useMemo(() =>
    character.skills.map(skill => ({
      ...skill,
      modifier: calculateSkillMod(skill, character)
    })),
    [character.skills, character.abilityScores, character.proficiencies]
  )
  ```

**Step 9 — Wrap List Items with React.memo**
- Spell row components, equipment row components, and condition row components should be memoized:
  ```typescript
  const SpellRow = React.memo(function SpellRow({ spell, onCast, onTogglePrepared }: SpellRowProps) {
    // ... render
  })
  ```
- This prevents full-list re-renders when a single item changes

### Sub-Phase F: Attunement Fix (M2)

**Step 10 — Unify Attunement Count**
- Open `src/renderer/src/components/sheet/5e/AttunementTracker5e.tsx` (lines 11-135)
- Open `src/renderer/src/components/sheet/5e/MagicItemsPanel5e.tsx` (lines 57-61)
- Both show attunement counts — ensure they derive from the same source:
  ```typescript
  const attunedItems = character.magicItems?.filter(mi => mi.attuned) ?? []
  const attunedCount = attunedItems.length
  const maxAttunement = 3 // PHB standard
  ```
- If AttunementTracker maintains its own state, replace with derived state from the character object

### Sub-Phase G: Optimistic Updates (M3)

**Step 11 — Implement Optimistic Save Pattern**
- Open `src/renderer/src/hooks/use-character-editor.ts`
- Instead of waiting for IPC save to complete before updating UI:
  ```typescript
  const saveAndBroadcast = (updated: Character): void => {
    // Optimistic: update local state immediately
    useCharacterStore.getState().updateCharacterInState(updated.id, updated)
    // Async: persist to disk (may fail)
    useCharacterStore.getState().saveCharacter(updated).catch((err) => {
      // Rollback on failure
      showToast('Save failed — reverting changes', 'error')
      // Reload from disk
      window.api.loadCharacter(updated.id).then(original => {
        if (original) useCharacterStore.getState().updateCharacterInState(updated.id, original)
      })
    })
    broadcastIfDM(updated)
  }
  ```
- This makes the UI feel instant while the save happens in the background

### Sub-Phase H: Tool Proficiency Rolls (M5)

**Step 12 — Add Rollable Tool Proficiencies**
- Open `src/renderer/src/components/sheet/5e/SkillsSection5e.tsx` or create a `ToolsSection5e.tsx`
- For each tool proficiency the character has, add a roll button:
  ```tsx
  {character.proficiencies.tools?.map(tool => (
    <div key={tool} className="flex items-center justify-between">
      <span>{tool}</span>
      <button onClick={() => rollToolCheck(tool, character)}>
        Roll +{proficiencyBonus + getRelevantAbilityMod(tool, character)}
      </button>
    </div>
  ))}
  ```
- Tool checks use an ability modifier determined by the tool type:
  - Thieves' tools → DEX
  - Herbalism kit → WIS
  - Most artisan's tools → varies (use a lookup table or let the DM choose)
- Broadcast the roll result via dice service

### Sub-Phase I: Standardize useCharacterEditor (M4)

**Step 13 — Audit and Standardize Data Access**
- Search for all direct calls to `useCharacterStore.getState()` in sheet components
- Replace with `useCharacterEditor(characterId)` pattern where possible
- Ensure all save paths go through `saveAndBroadcast` for consistent sync behavior
- Components that should use the hook but don't:
  - `HitPointsBar5e.tsx` — directly manages local state + store
  - `SpellSlotTracker5e.tsx` — directly calls store
  - `ConditionsSection5e.tsx` — directly calls store

---

## ⚠️ Constraints & Edge Cases

### Virtualization
- **Variable row heights**: Spell rows are expandable (collapsed: ~48px, expanded: ~200px+). Use `measureElement` from `@tanstack/react-virtual` for accurate sizing after expand.
- **Level group headers**: If spells are grouped by level with headers, include headers as virtual items with a different `estimateSize`.
- **Scroll restoration**: When the user returns to the spell list after viewing a spell detail, restore scroll position.

### Conflict Resolution
- **Auto-resolve is acceptable for most cases**: DM version wins by default. Only show the conflict banner for player-initiated changes that the DM might be overwriting.
- **Don't conflict on timestamps within 2 seconds**: Network latency can cause near-simultaneous saves. Use a 2-second tolerance before flagging as conflict.

### Optimistic Updates
- **Rollback UX**: If a save fails, the UI briefly shows the optimistic state then reverts. Use a subtle animation (flash) to indicate the rollback.
- **Network broadcast should still happen optimistically**: The DM's peers see the change immediately even before disk persistence. If persistence fails, the next sync will correct.

### Spell Filtering
- **Filter state should NOT persist**: Reset filters when navigating away from the sheet. Spell search is for quick in-session lookup, not a persistent preference.
- **Filter by "prepared only" is the most useful default**: Add it as a toggle that defaults to ON for prepared casters (Wizard, Cleric, Druid, Paladin).

Begin implementation now. Start with Sub-Phase A (Steps 1-2) for virtualization — this is the highest-impact performance fix. Then Sub-Phase B (Steps 3-4) for spell search which is the most-requested QoL feature. Sub-Phase C (Step 5) for the remote character store fix prevents a real data inconsistency bug.
