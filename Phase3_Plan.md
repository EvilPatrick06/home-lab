# SYSTEM OVERRIDE: IMPLEMENTATION MODE
You are Claude Opus 4.6 Max. Your job is to execute the following architectural plan for Phase 3 of the D&D VTT project.

Phase 3 covers the **Bastion System** — the D&D 2024 DMG facility management subsystem. The audit scored it 7/10: facility types (47), turn lifecycle, event system (11 types), defenders, and construction are all functional. The critical gap is the **complete absence of the Bastion Points (BP) economy** — the core resource system from the 2024 DMG. All facilities currently cost 0 GP and 0 days to build.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 3 is entirely client-side. No Raspberry Pi involvement.

**Type Definitions:**

| File | Lines | Key Contents |
|------|-------|-------------|
| `src/renderer/src/types/bastion.ts` | 449 | `Bastion` (189-205), `BastionTurn` (131-141), `SpecialFacility` (91-110), `ConstructionProject` (157-170), `BastionOrderType` (line 5: 7 types), `SPECIAL_FACILITY_COSTS` (272-277: all zero), `ENLARGE_COSTS` (267-270) |

**Store (Zustand):**

| File | Lines | Key Contents |
|------|-------|-------------|
| `src/renderer/src/stores/bastion-store/index.ts` | 94 | Store composition |
| `src/renderer/src/stores/bastion-store/types.ts` | 90 | Slice type definitions |
| `src/renderer/src/stores/bastion-store/facility-slice.ts` | 435 | `addSpecialFacility` (41-76), `recruitDefenders` (138-154), `depositGold` (287-295), `withdrawGold` (297-305) |
| `src/renderer/src/stores/bastion-store/event-slice.ts` | 277 | `startTurn` (118-145), `issueOrder` (147-177), `rollAndResolveEvent` (191-257), `advanceTime` |

**Pages & UI:**

| File | Lines | Key Contents |
|------|-------|-------------|
| `src/renderer/src/pages/BastionPage.tsx` | 409 | Main page with tabs |
| `src/renderer/src/pages/bastion/OverviewTab.tsx` | 128 | Dashboard, construction, notes |
| `src/renderer/src/pages/bastion/FacilityTabs.tsx` | 352 | Basic/Special facility lists |
| `src/renderer/src/pages/bastion/DefendersTab.tsx` | 123 | Defender management |
| `src/renderer/src/pages/bastion/BastionTurnModal.tsx` | 230 | Turn execution modal (order dropdown, cost tracking) |

**Data & Services:**

| File | Lines | Key Contents |
|------|-------|-------------|
| `src/renderer/public/data/5e/bastions/bastion-facilities.json` | 1877 | All 47 special + 6 basic facility definitions |
| `src/renderer/public/data/5e/bastions/bastion-events.json` | 258 | 11 event types with d100 ranges |
| `src/renderer/src/data/bastion-events.ts` | 296 | Event rolling (167-269), attack resolution (274-295) |
| `src/renderer/src/utils/bastion-prerequisites.ts` | 143 | Class-based prerequisite checks (69-98) |
| `src/renderer/src/services/chat-commands/commands-dm-bastion.ts` | 134 | Chat commands (hire/upgrade stubs at 99-119) |

**Storage (Main Process):**

| File | Lines | Key Contents |
|------|-------|-------------|
| `src/main/storage/bastion-storage.ts` | 108 | CRUD with schema versioning |

**Tests (8 files):**
- `src/renderer/src/stores/bastion-store/index.test.ts`
- `src/renderer/src/stores/bastion-store/facility-slice.test.ts`
- `src/renderer/src/stores/bastion-store/event-slice.test.ts`
- `src/renderer/src/stores/bastion-store/types.test.ts`
- `src/renderer/src/data/bastion-events.test.ts`
- `src/renderer/src/utils/bastion-prerequisites.test.ts`

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

No bastion logic runs on BMO.

---

## 📋 Core Objectives & Corrections

### CRITICAL: Implement Bastion Points (BP) Economy

The entire BP system is absent. Per the 2024 DMG:

| Character Level | BP Earned Per Turn | Facility Unlock |
|----------------|-------------------|-----------------|
| 5 | 2 BP | Level 5 facilities (2 BP cost) |
| 9 | 4 BP | Level 9 facilities (4 BP cost) |
| 13 | 6 BP | Level 13 facilities (6 BP cost) |
| 17 | 8 BP | Level 17 facilities (8 BP cost) |

**What must be built:**
1. `bastionPoints: number` field on `Bastion` interface
2. BP generation per turn (based on character level)
3. BP cost deduction when building special facilities
4. BP display in the treasury/overview UI
5. Update `SPECIAL_FACILITY_COSTS` from all-zeros to correct BP values
6. BP balance validation before facility construction

### SECONDARY: Complete Stub Systems

| # | System | Current State | Required Work |
|---|--------|--------------|---------------|
| S1 | Chat command `/bastion hire` | Stub — broadcasts message only (lines 99-108) | Actually add hireling to bastion store, deduct GP cost |
| S2 | Chat command `/bastion upgrade` | Stub — broadcasts message only (lines 110-119) | Start construction project for facility enlargement |
| S3 | Faction renown tracking | `faction-renown` prerequisite type exists but not enforced (line 67) | Add renown tracking and enforcement |
| S4 | Charm duration tracking | Charms have durations but no expiration | Add expiry check on turn advance |
| S5 | Lieutenant management | War Room mentions lieutenants but no UI | Add lieutenant assignment UI |
| S6 | Gaming Hall order differentiation | Table exists, dice roll works, GP added | Differentiate "run games" order from generic orders |
| S7 | Menagerie creature acquisition | Creature list/storage exists | Add acquisition flow |
| S8 | Construct Forge creation | Construct table exists | Add construct creation flow |

### UX: In-Game Navigation

The bastion system is only accessible via main menu, not from within a game session. Need to add navigation link from the game sidebar.

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Implement BP Economy (Critical Path)

**Step 1 — Add BP Field to Bastion Type**
- Open `src/renderer/src/types/bastion.ts`
- Add `bastionPoints: number` to the `Bastion` interface (after `treasury: number` at line 200):
  ```typescript
  treasury: number
  bastionPoints: number
  ```
- Update `createDefaultBastion()` (lines 297-335) to initialize `bastionPoints: 0`
- Update the migration function to add `bastionPoints: 0` to existing bastions

**Step 2 — Set Correct Facility BP Costs**
- Open `src/renderer/src/types/bastion.ts`
- Replace `SPECIAL_FACILITY_COSTS` at lines 272-277:
  ```typescript
  export const SPECIAL_FACILITY_COSTS: Record<number, { bp: number; gp: number; days: number }> = {
    5:  { bp: 2,  gp: 500,   days: 25  },
    9:  { bp: 4,  gp: 2000,  days: 60  },
    13: { bp: 6,  gp: 5000,  days: 120 },
    17: { bp: 8,  gp: 15000, days: 200 }
  }
  ```
  Note: The GP and days values should match 2024 DMG. Verify exact GP/day costs from the DMG — the values above are approximations. If the 2024 DMG does not specify GP costs for facilities (only BP), then keep GP at 0 and use BP only.
- Update all references to `SPECIAL_FACILITY_COSTS` to handle the new `bp` field

**Step 3 — BP Generation Per Turn**
- Open `src/renderer/src/stores/bastion-store/event-slice.ts`
- In `completeTurn()` (around line after `rollAndResolveEvent`), add BP generation:
  ```typescript
  completeTurn: () => {
    const bastion = get()
    // Determine character level from bastion owner
    const bpEarned = getBpPerTurn(characterLevel)
    set({
      bastionPoints: bastion.bastionPoints + bpEarned,
      // ... existing completeTurn logic
    })
  }
  ```
- Create a helper function `getBpPerTurn(characterLevel: number): number`:
  ```typescript
  export function getBpPerTurn(level: number): number {
    if (level >= 17) return 8
    if (level >= 13) return 6
    if (level >= 9) return 4
    if (level >= 5) return 2
    return 0
  }
  ```
- The character level needs to come from somewhere — either passed into the bastion store or read from the linked character/campaign. Check how `ownerId` on Bastion is used and whether the character level is accessible.

**Step 4 — BP Cost Deduction on Facility Construction**
- Open `src/renderer/src/stores/bastion-store/facility-slice.ts`
- In `addSpecialFacility()` (lines 41-76), add BP cost validation:
  ```typescript
  addSpecialFacility: (facilityType, size, config) => {
    const bastion = get()
    const cost = SPECIAL_FACILITY_COSTS[facilityLevelRequirement]
    if (!cost) return
    if (bastion.bastionPoints < cost.bp) return // insufficient BP
    set({
      bastionPoints: bastion.bastionPoints - cost.bp,
      // ... existing facility addition logic
    })
  }
  ```
- Also deduct GP if the 2024 DMG specifies GP costs alongside BP

**Step 5 — BP Display in UI**
- Open `src/renderer/src/pages/bastion/OverviewTab.tsx`
- Add a BP counter alongside the treasury GP display:
  ```tsx
  <div className="flex items-center gap-2">
    <span className="font-bold">Bastion Points:</span>
    <span>{bastion.bastionPoints} BP</span>
  </div>
  ```
- Open `src/renderer/src/pages/bastion/BastionTurnModal.tsx`
- Show BP earned after turn completion
- Show BP cost next to each facility in the facility selection UI

**Step 6 — BP Validation in Facility Build UI**
- Open `src/renderer/src/pages/bastion/FacilityTabs.tsx`
- Disable the "Build" button for facilities the player cannot afford (BP check)
- Show the BP cost prominently: "Cost: 4 BP" with red text if insufficient

### Sub-Phase B: Complete Chat Command Stubs

**Step 7 — Wire `/bastion hire` Command**
- Open `src/renderer/src/services/chat-commands/commands-dm-bastion.ts`
- Replace the stub at lines 99-108 with actual logic:
  ```typescript
  case 'hire': {
    const hirelingName = parts.slice(1).join(' ')
    if (!hirelingName) {
      return { type: 'error', content: 'Usage: /bastion hire <hireling name>' }
    }
    // Add hireling to bastion as an unassigned defender
    useBastionStore.getState().addDefender({
      id: generateUUID(),
      name: hirelingName,
      barracksId: null,
      type: 'humanoid',
      hiredAt: new Date().toISOString()
    })
    return {
      type: 'broadcast',
      content: `**${bastion.name}** hires **${hirelingName}** as a hireling.`
    }
  }
  ```
- Verify `addDefender` or similar exists in the bastion store. If not, add it.

**Step 8 — Wire `/bastion upgrade` Command**
- Replace the stub at lines 110-119:
  ```typescript
  case 'upgrade': {
    const facilityName = parts.slice(1).join(' ')
    if (!facilityName) {
      return { type: 'error', content: 'Usage: /bastion upgrade <facility name>' }
    }
    const facility = bastion.specialFacilities.find(
      f => f.name.toLowerCase() === facilityName.toLowerCase()
    )
    if (!facility) {
      return { type: 'error', content: `Facility "${facilityName}" not found.` }
    }
    // Start enlargement construction project
    useBastionStore.getState().startEnlargement(facility.id)
    return {
      type: 'broadcast',
      content: `**${bastion.name}** begins upgrading **${facilityName}**.`
    }
  }
  ```
- Verify `startEnlargement` exists or add it to the construction logic in `event-slice.ts`

### Sub-Phase C: Faction Renown & Charm Tracking

**Step 9 — Faction Renown Tracking**
- Open `src/renderer/src/types/bastion.ts`
- Add a `factionRenown` field to `Bastion`:
  ```typescript
  factionRenown: Record<string, number>  // faction ID -> renown level
  ```
- Open `src/renderer/src/utils/bastion-prerequisites.ts`
- At line 67 where faction renown is noted as not enforced, implement the check:
  ```typescript
  case 'faction-renown':
    const renown = bastion.factionRenown[prereq.factionId] ?? 0
    return renown >= prereq.requiredRenown
  ```
- Add UI for viewing/editing faction renown in the Overview tab

**Step 10 — Charm Duration Expiration**
- Identify where charms are stored on the bastion (likely in facility config or a separate field)
- In `advanceTime()` or `completeTurn()`, check for expired charms:
  ```typescript
  const activeCharms = bastion.charms?.filter(
    c => c.expiresOnDay > bastion.inGameTime.currentDay
  ) ?? []
  set({ charms: activeCharms })
  ```
- If charm storage doesn't exist yet, add `charms: BastionCharm[]` to the `Bastion` interface

### Sub-Phase D: Facility-Specific Order Outputs

**Step 11 — Gaming Hall Winnings Differentiation**
- Open the order processing in `event-slice.ts`
- When a Gaming Hall facility issues an order, differentiate between "Run Games" (generates income) and other order types
- The dice rolling and GP addition already works — just ensure the order type is correctly identified

**Step 12 — Menagerie Creature Acquisition**
- Add an "Acquire Creature" action to the Menagerie facility order
- Create a creature selection UI (modal with creature list)
- Store acquired creatures in the Menagerie facility's config

**Step 13 — Construct Forge Creation Flow**
- Add a "Create Construct" action to the Construct Forge facility order
- Create a construct selection UI using the existing construct table
- Store created constructs as defenders (type: 'construct')

### Sub-Phase E: Navigation & UX

**Step 14 — In-Game Navigation to Bastions**
- Find the game sidebar component (where CombatLogPanel and JournalPanel will be integrated per Phase 1)
- Add a "Bastion" navigation link that opens the bastion page
- Use React Router navigation or an in-game panel/modal approach
- Gate behind character ownership (only show if the current character has a bastion)

**Step 15 — Lieutenant Management UI**
- Open `src/renderer/src/pages/bastion/DefendersTab.tsx`
- Add a "Lieutenants" section for War Room facility
- Allow assigning defenders as lieutenants (promoted defenders with special roles)
- Add lieutenant capacity based on War Room level

### Sub-Phase F: Update Tests

**Step 16 — Update Existing Tests for BP Changes**
- Open all test files in `src/renderer/src/stores/bastion-store/`
- Update `createDefaultBastion()` calls to expect `bastionPoints: 0`
- Add tests for:
  - BP generation per turn at different character levels
  - BP deduction on facility construction
  - BP validation preventing construction when insufficient
  - BP display in treasury
- Update `facility-slice.test.ts` to verify `addSpecialFacility` now checks BP
- Update `event-slice.test.ts` to verify `completeTurn` generates BP

**Step 17 — Add Tests for New Features**
- Add tests for `/bastion hire` command actually adding a defender
- Add tests for `/bastion upgrade` command starting a construction project
- Add tests for faction renown prerequisite enforcement
- Add tests for charm expiration on time advance

---

## ⚠️ Constraints & Edge Cases

### D&D 2024 DMG Rules for Bastions
- **BP generation is per Bastion Turn**, not per real-time day. One bastion turn = 7 in-game days (configurable).
- **BP does NOT carry over indefinitely** in some interpretations — verify the 2024 DMG rule on BP caps. If there is a cap (common interpretation: BP cap = character level * 2), enforce it.
- **Facilities unlock at character levels 5, 9, 13, 17** — the level check is already correct, but BP costs must match level tiers.
- **Basic facilities do NOT cost BP** — they are free with the bastion. Only special facilities cost BP. Do not add BP costs to basic facility construction.
- **Enlargement costs** (ENLARGE_COSTS at lines 267-270) should also require BP. Verify the 2024 DMG enlargement rules.
- **Defensive walls** cost GP and time, not BP. Keep the current wall construction system as-is.

### Backward Compatibility
- Adding `bastionPoints: number` to the `Bastion` interface will break existing saved bastions. The migration function MUST add `bastionPoints: 0` to any bastion loaded from disk that lacks the field.
- Adding `factionRenown: Record<string, number>` similarly needs a migration default of `{}`.
- Adding `charms: BastionCharm[]` needs a migration default of `[]`.
- `SPECIAL_FACILITY_COSTS` changing from `{ gp, days }` to `{ bp, gp, days }` will break any code that destructures only `gp` and `days`. Search for all references before changing the shape.
- The schema version in `bastion-storage.ts` must be incremented for the migration.

### State Consistency
- BP deduction and facility addition MUST be atomic — if the facility add fails, BP should not be deducted.
- `completeTurn()` must generate BP BEFORE any order resolution that might spend BP (if any orders cost BP).
- The character level used for BP generation must be the level at the time of the turn, not the level when the bastion was created. If the character levels up between turns, BP generation should reflect the new level.

### Chat Command Safety
- `/bastion hire` must validate that a barrack exists and has capacity before adding a defender. If no barracks or at capacity, return an error.
- `/bastion upgrade` must validate the facility exists, is not already at maximum size (Vast), and has no active construction project.

Begin implementation now. Start with Sub-Phase A (Steps 1-6) as the BP economy is the critical gap. Verify each change compiles and existing tests still pass before proceeding.
