# Phase 15 — Library as Single Source of Truth

Phase 15 is a **data-layer consistency sweep**. The library (`useLibraryStore`) becomes the only canonical store for all D&D content data. Every other surface in the app — Character Builder, Character Sheet, Level Up flow, In-Game token / NPC / spell / condition UIs, Bastion management, encounter builder, dice macro autocomplete, anywhere D&D content appears — is a **consumer**, not a copy-holder. Consumer state stores **references** (`{ entryId, entryType }`), never full embedded JSON.

The motivation:
1. **No duplication.** If a spell's description is in five places, four of them are wrong eventually.
2. **No drift.** Fixing a typo or balance issue in the library propagates to every character, encounter, and tool instantly.
3. **One fix, fix everywhere.** Every consumer is a live reference, not a frozen snapshot. Updating library code is the only update needed.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 15 is entirely client-side. No Raspberry Pi involvement.

**Files touched (sweep list — incomplete; full audit happens in Step 19):**

| File / Directory | Role |
|------------------|------|
| `src/renderer/src/services/library/use-library-entry.ts` *(new)* | Single hydration hook every consumer uses |
| `src/renderer/src/services/library/README.md` *(new)* | Documents the source-of-truth rule for future contributors |
| `src/renderer/src/stores/use-library-store.ts` | Becomes the only canonical store for D&D content data; keyed-map lookup for O(1) reads |
| `src/renderer/src/types/library.ts` | Canonical types — every consumer imports from here |
| `src/renderer/src/components/builder/5e/*` | Builder consumes library refs, not embedded JSON |
| `src/renderer/src/components/sheet/5e/*` | Sheet consumes library refs |
| `src/renderer/src/components/levelup/*` | Level-up consumes library refs |
| `src/renderer/src/components/game/*` | Token detail panels, NPC stat blocks, spell modals, condition tooltips — all library-sourced |
| `src/renderer/src/components/bastion/*` | Facilities / services / hirelings / rooms — all library-sourced |
| `src/renderer/src/services/macro-engine.ts` | Variable resolution walks via library, not a frozen sheet snapshot |
| `src/renderer/src/components/library/HomebrewCreateModal.tsx` | Homebrew entries live in the same library store as built-ins |
| `biome.json` or new lint hook | Build guard preventing future regressions |
| `AGENTS.md` | Documents the data-layer rule for AI contributors |

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives

### The Source-of-Truth Rule

The library is the only canonical store for:

- Species (races)
- Classes, subclasses, class features per level
- Feats
- Backgrounds
- Spells
- Items / equipment / magic items
- Monsters / NPCs
- Conditions
- Audio entries
- Weather presets
- Encounter templates
- Homebrew variants of any of the above
- Anything else added later

The library is the only place this data is **defined**. Every consumer surface **renders from a reference**. There are no parallel data files, no duplicated tables, no inlined JSON in builder steps, no frozen snapshots in character records.

The only allowed deviation is the **override exception** (Step 22) — a character / encounter / instance can hold `overrides?: Partial<LibraryEntry>` that the renderer merges on top of the library entry at display time. Renames, custom HP, balance tweaks — all expressed as overlay, never as a standalone copy.

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Hydration Layer

**Step 1 — Establish the Source-of-Truth Rule**
- Create `src/renderer/src/services/library/README.md` with a top-of-file declaration:
  > **All D&D content data lives in the library. Consumers reference entries by `entryId` + `entryType`; the library hydrates at read time. No duplicate data anywhere. Player customizations live as `overrides`, never as standalone copies.**
- Add the same rule to `AGENTS.md` under a new "Data layer rules" section so AI contributors honor it.

**Step 2 — Build the Hydration Hooks**
- Create `src/renderer/src/services/library/use-library-entry.ts`:
  ```typescript
  export function useLibraryEntry<T extends LibraryEntryType>(
    entryType: T,
    entryId: string,
  ): LibraryEntry<T> | null {
    return useLibraryStore(
      useCallback(s => s.getEntry(entryType, entryId), [entryType, entryId])
    )
  }

  export function useLibraryEntries<T extends LibraryEntryType>(
    entryType: T,
    filter?: (e: LibraryEntry<T>) => boolean,
  ): LibraryEntry<T>[] {
    return useLibraryStore(
      useCallback(s => s.getEntries(entryType, filter), [entryType, filter])
    )
  }

  export function useHydratedRef<T extends LibraryEntryType>(
    ref: EntryRef<T> | null,
  ): MergedEntry<T> | null {
    const base = useLibraryEntry(ref?.entryType, ref?.entryId)
    if (!ref || !base) return null
    return { ...base, ...(ref.overrides ?? {}) }
  }
  ```
- Subscriber-based — any library mutation propagates to every consumer immediately, no manual refresh.
- Memoized per-(entryType, entryId) to avoid React re-render storms.

**Step 3 — Convert Library Store to Keyed Maps**
- `useLibraryStore` currently may use arrays in places — convert all internal storage to `Record<string, LibraryEntry>` per entry type so `getEntry` is O(1).
- `getEntries(entryType, filter?)` returns `Object.values(map).filter(filter)` for bulk reads.
- Existing array-shaped consumers update to call `getEntries` instead of reading the raw array.

**Step 4 — Define the Reference + Override Shape**
- Add to `src/renderer/src/types/library.ts`:
  ```typescript
  export interface EntryRef<T extends LibraryEntryType = LibraryEntryType> {
    entryId: string
    entryType: T
    overrides?: Partial<LibraryEntry<T>>
  }

  export type MergedEntry<T extends LibraryEntryType> = LibraryEntry<T>
  ```
- `EntryRef` is the canonical shape for everything that **references** library data: character species, character classes, sheet inventory, spell lists, encounter monster slots, scene NPCs, etc.

### Sub-Phase B: Character Builder Sweep

**Step 5 — Audit Builder Reads**
- Open every file under `src/renderer/src/components/builder/5e/*`.
- For each library read (species, class, subclass, feat, background, spell, item, starting equipment, tool / language proficiency, trinket, personality trait):
  - Replace direct JSON imports with `useLibraryEntry` / `useLibraryEntries` calls.
  - Builder local state becomes `{ speciesRef: EntryRef<'species'>, classRefs: EntryRef<'class'>[], ... }` — references only, no inline data.
- Example:
  ```typescript
  // BEFORE
  builderState.species = { name: 'Half-Elf', size: 'Medium', abilities: {...}, traits: [...] }
  // AFTER
  builderState.speciesRef = { entryId: 'half-elf', entryType: 'species' }
  ```
- Add unit tests asserting that builder step components do not import from `public/data/5e/**` directly.

**Step 6 — Builder Side Panels Hydrate Live**
- Side panel "details" view (the area that shows the full record of whatever the player just selected) calls `useLibraryEntry(entryType, entryId)`.
- A library edit (homebrew tweak, balance fix) immediately updates what the player sees in the builder. No "refresh to see changes."

**Step 7 — Roll Tables Source from Library**
- Trinket table, personality table, ideal table, bond table, flaw table — these tables live in the library, not in `data/personality-tables.ts`.
- `rollFrom(libraryEntries: LibraryEntry[])` replaces the existing `rollD4` / hard-coded length pattern.
- Existing call sites updated; old `personality-tables.ts` file deleted in Step 28.

### Sub-Phase C: Character Sheet Sweep

**Step 8 — Audit Sheet Reads**
- Open every file under `src/renderer/src/components/sheet/5e/*`.
- The character record on disk holds `{ speciesRef, classRefs[], subclassRefs[], featRefs[], backgroundRef, spellRefs[], itemRefs[], conditionRefs[] }`.
- Sheet sections call `useHydratedRef` to display.
- The character's "active effects" derive from condition refs + spell refs — descriptions and mechanical effects come from the library entries, not duplicated.

**Step 9 — Equipped Items, Inventory, Magic Items**
- Inventory items: `EntryRef<'item'>` per inventory slot.
- Magic items the player renamed: `{ entryId, entryType: 'item', overrides: { name: "Bob's Lucky Dagger" } }`.
- The library entry remains canonical; the override is the personal flourish.
- Attunement state, charge counts, and other instance-state fields live on the inventory record alongside the ref — not on the library entry.

**Step 10 — Spell List**
- Known / prepared spells: arrays of `EntryRef<'spell'>`.
- Spell card UI calls `useHydratedRef(spellRef)` to render.
- Casting a spell pulls the spell entry live each time — a library edit (description fix, damage rebalance) takes effect on the next cast for everyone.

**Step 11 — Death Saves + Active Conditions**
- Conditions auto-applied by death saves (Sub-Phase 17ac shipped this) reference the library's condition entries by id.
- Idempotent application (Phase 17ac's rule) checks `conditionRefs.some(c => c.entryId === 'unconscious')` rather than name-matching duplicated data.

### Sub-Phase D: Level Up Sweep

**Step 12 — Audit Level-Up Reads**
- Open every file under `src/renderer/src/components/levelup/*`.
- Level-up offers (new class features, ASI choices, subclass at the unlock level, new spell slots, expertise picks, fighting-style options) source from `useLibraryEntry('class', classId)` filtered by level.
- The legacy `levelup-tables.ts` (or wherever level-up data currently lives) gets converted to library entries and the old file is deleted in Step 28.
- Player choice persistence: `EntryRef<'feat'>` or `EntryRef<'spell'>` or `EntryRef<'fighting-style'>`, etc.

**Step 13 — Multiclass Support**
- Character's class list is `classRefs: { classRef: EntryRef<'class'>, level: number, subclassRef?: EntryRef<'subclass'> }[]`.
- Level-up calculator and the sheet's class summary both read from this single list.

### Sub-Phase E: In-Game Sweep

**Step 14 — Audit In-Game Reads**
- Open every file under `src/renderer/src/components/game/*` that reads D&D data:
  - Token detail panels → `useHydratedRef(token.monsterRef)` (or `npcRef`, `playerCharacterRef`).
  - NPC stat block popups → same pattern.
  - Spell-cast modal → `useLibraryEntry('spell', castSpellId)`.
  - Condition tooltips → `useLibraryEntry('condition', conditionId)`.
  - Initiative tracker → entity refs; hydrate names / portraits / max HP at render time.
  - DM "Add Monster from Library" drawer → library is already the source; verify and document.

**Step 15 — Encounter Builder**
- Encounters store `{ monsterRefs: { ref: EntryRef<'monster'>, count, overrides? }[] }`.
- CR calculation walks the library to fetch the CR of each referenced monster.
- A library edit (rebalance, errata) immediately recalculates encounter difficulty.

**Step 16 — DM-Created Tokens**
- When the DM drags a monster onto the map, the token records `{ monsterRef: { entryId, entryType: 'monster', overrides? } }` plus instance state (position, current HP, conditions applied).
- The current-HP value lives on the token instance; max HP is read live from the library entry (so a max-HP errata propagates without recomputing every existing encounter).

### Sub-Phase F: Bastion Sweep

**Step 17 — Audit Bastion**
- Run `ls dnd-app/src/renderer/src/components/bastion 2>/dev/null` to verify the surface exists.
- If present: every facility / service / hireling / room-type read becomes a library lookup.
- Bastion characters reuse the Character Sheet hydration path from Sub-Phase C.
- If absent or partial: document the rule for future Bastion authors in `bastion/README.md` so they don't introduce parallel data.

### Sub-Phase G: Remaining Surfaces

**Step 18 — Macro Engine**
- Open `src/renderer/src/services/macro-engine.ts`.
- Variable resolution (`$self.spells[0].damage`, `$target.ac`, etc.) walks the live library through the character's refs.
- Frozen snapshot reads are forbidden — a macro rolled today reflects the current library state.

**Step 19 — Chat Command Tab-Complete**
- Tab-complete for `/spell`, `/item`, `/monster`, `/feat` searches the library directly.
- No parallel index, no duplicated name list.

**Step 20 — Audio, Weather, Calendar**
- Audio entries — already library-managed; verify the access path is `useLibraryEntry`-shaped.
- Weather presets — same.
- Calendar templates — same.
- Shop inventory — items in the shop are `EntryRef<'item'>[]`.

**Step 21 — Homebrew Parity**
- Homebrew entries live in the same library store as built-ins, distinguished only by a `source: 'homebrew'` field.
- Consumers (Builder, Sheet, Level Up, In-Game, Bastion) cannot tell the difference. No code branches on `source`.
- This matches the Sub-Phase 17o "homebrew/custom field parity per entry type" rule shipped earlier.

### Sub-Phase H: Migration + Build Guard

**Step 22 — One-Pass Load-Time Migration**
- On character / campaign / world load, detect inline copies of library data:
  - Heuristic: presence of full descriptive fields (`description`, `traits[]`, `damage`, etc.) on a record that should hold only `{ entryId, entryType }`.
- Auto-migrate:
  - Match by `(name, entryType)` against the library.
  - On match → replace inline data with `{ entryId, entryType }`. Preserve any player-mutated fields as `overrides`.
  - On no match (deleted or renamed library entry) → wrap original data as `{ entryId: 'orphan:<uuid>', entryType, overrides: <full original data> }`. Surface a warning chip on the sheet ("Item not in library — converted to local copy").
- Run-once: after the first save in the new shape, no further migration needed.
- Tests cover round-trip (save → load → re-save) and the orphan path.

**Step 23 — Reference Counts + Delete Warnings**
- When the DM deletes a library entry (homebrew or built-in override), the library editor warns about reference counts: "This spell is referenced by 3 characters and 2 encounters. Deleting will convert those references to orphans."
- Confirm-modal blocks accidental destruction.

**Step 24 — Build Guard Lint Rule**
- Add a Biome rule (or grep-based pre-commit hook):
  - Forbid `import` of raw JSON from `public/data/5e/**` outside of `src/renderer/src/stores/use-library-store.ts` and `src/renderer/src/services/library/*`.
  - Forbid creation of object literals with more than 3 D&D-content fields outside library-store boundaries (heuristic — catches "embedding library data").
- CI gates the rule. A PR that adds a duplicate-data pattern fails before review.

**Step 25 — Document the Rule for Contributors**
- `AGENTS.md` gains a "Data layer rules" section:
  - Library is source of truth.
  - Consumers reference, never copy.
  - Player customization = `overrides`.
  - Lint rule blocks regressions.
- `CLAUDE.md` references the rule under "When adding new dnd-app files."

### Sub-Phase I: Verification

**Step 26 — Cross-Surface Verification**
- Per-surface end-to-end test:
  - Builder pick → Sheet shows same entry → Level Up offers consistent → In-Game token (if applicable) shows same data.
- Library edit propagation test:
  - Edit a spell description in the library editor.
  - Confirm Builder side panel, Sheet's spell card, Spell-Cast modal, and chat tab-complete all reflect the change without reload.
- Orphan handling test:
  - Delete a referenced library item.
  - Confirm referencing characters surface the orphan chip and retain their data via `overrides`.

**Step 27 — 4-Gate Suite**
- `npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run` — all green.
- New vitest specs cover hydration, overrides, migration, orphan path, lint guard.

**Step 28 — Cleanup**
- Delete legacy parallel data files (`personality-tables.ts`, any inline `level-up-tables.ts`, duplicated spell / item / monster JSON outside the library).
- Big subtractive commit.
- `git diff --stat` shows a large net deletion.

---

## ⚠️ Constraints & Edge Cases

### Migration Safety
- **One-pass migration only.** Loading a pre-Phase-15 save migrates in place; the next save writes the new shape. No dual-format support beyond the load path.
- **Orphans are preserved, not lost.** If a library entry no longer exists, the character still holds the data via `overrides` — they just lose the live-update benefit until reconciled with the library.
- **Migration is idempotent.** Running the migration on already-migrated data is a no-op.

### Performance
- **Hydration must be cheap.** `useLibraryEntry` is O(1) via keyed maps. Memoized at the hook level.
- **No render storms.** A library mutation triggers re-renders only for components that subscribed via `useLibraryEntry(type, id)` for the changed entry — not every consumer.
- **Profile after each sweep step.** If a sheet re-render slows down, fix the hook, not by reverting to inline data.

### Override Discipline
- **Overrides are the only allowed deviation.** Standalone copies of library data are forbidden.
- **Overrides are partial.** They replace specific fields, leaving the rest live-sourced.
- **Override depth is shallow.** If the library entry has nested objects (e.g., spell components), an override either replaces the whole nested object or leaves it untouched. No deep-merge — the complexity isn't worth it.

### Network Sync
- **Library mutations broadcast via the existing sync path.** No new transport work this phase.
- **All clients hydrate from their local mirror.** No per-render network fetch.
- **Late-joiner sync.** A client joining mid-session receives the full library snapshot in the initial state-bootstrap.

### Homebrew Parity
- **Homebrew lives in the same store as built-ins.** Distinguished only by `source: 'homebrew'`.
- **Homebrew entries have the same shape as built-ins.** No reduced field set, no separate consumer paths.
- **Phase 17o already established this rule for new homebrew creation.** Phase 15 extends it to every consumer.

### Override Storage
- **Overrides live on the reference, not on the library entry.** Two characters can hold different overrides of the same library item without colliding.
- **Overrides are serialized with the character/campaign data**, not with the library.

### Build Guard
- **The lint rule is non-negotiable.** Without it, future PRs silently re-introduce duplicate-data patterns and the regression bug class returns.
- **Allowlist exceptions must be explicit and reviewed.** The lint rule allows `src/renderer/src/stores/use-library-store.ts` and `src/renderer/src/services/library/*`. Anything else adding raw JSON imports requires a `// biome-ignore` with a documented reason.

---

## 🎯 Verification — end-to-end test plan

After **Sub-Phase A (Steps 1–4)**: `useLibraryEntry` works against a mock library. Round-trip test confirms hydration. Override merge works. New types compile.

After **Sub-Phase B (Steps 5–7)**: Builder picks resolve via library. Side panel shows library-sourced data. A library edit propagates to the builder side panel live. Personality / trinket rolls draw from the library, no hard-coded length.

After **Sub-Phase C (Steps 8–11)**: Sheet renders every section from refs. Renaming a magic item produces an `overrides` overlay; library entry stays canonical. Death-save auto-conditions match by ref id, not name. Multiclass character with 3 classes renders correctly from `classRefs`.

After **Sub-Phase D (Steps 12–13)**: Level Up offers come from library by class+level. Player choice persists as a ref. Multiclass level-up correctly adds to `classRefs`.

After **Sub-Phase E (Steps 14–16)**: In-game token detail panels, NPC stat blocks, spell modals, condition tooltips all library-sourced. Encounter CR recomputes when a referenced monster's CR changes in the library.

After **Sub-Phase F (Step 17)**: Bastion (if present) sources facilities and services from library. Bastion-resident characters share the Character Sheet hydration path.

After **Sub-Phase G (Steps 18–21)**: Macro variable resolution walks live library. Chat tab-complete pulls names from library. Homebrew entries indistinguishable from built-ins in every consumer.

After **Sub-Phase H (Steps 22–25)**: Pre-Phase-15 save loads and migrates; second save writes new shape. Deleting a referenced library entry produces orphan refs with overrides preserving data. Build guard blocks new raw-JSON imports outside library boundaries.

After **Sub-Phase I (Steps 26–28)**: Cross-surface coherence test green. Library edit propagation test green. Legacy data files deleted. Big subtractive commit. 4-gate suite green.

---

## 🔗 Plans superseded or modified by Phase 15

| Plan | Item | Disposition |
|------|------|-------------|
| Phase 16 | Sub-Phase E (Step 14) — Merge CompendiumModal into Library | **Absorbed.** Phase 15 Sub-Phase E (Step 14) covers the broader rule; Phase 16 strikes N5 from the NET-NEW table and points to Phase 15. |
| Phase 19 | `srd-provider.ts` / `getPackagedDataPath` packaged-path util | **Coordinate.** Phase 15 Step 24 build-guard lint rule restricts raw-JSON imports to library boundaries. Phase 19 utils need an allowlist exception or get refactored to load via the library store. |
| Phase 22 | H4 (Step 6) — Fix Service Layer Bypasses | **Reframe.** If Phase 15 lands first, route components through `useLibraryEntry` / `useLibraryEntries` hooks directly, skipping the data-provider intermediate. |
| Phase 23 | Sub-Phase C (S3, Step 5) — Fix Remote Character Store | **Rewritten.** Dual-write pattern replaced with single canonical write to the character store; `lobbyStore.remoteCharacters` slated for removal during Phase 15. |
| Phase 23 | Sub-Phase F (M2, Step 10) — Attunement | **Coordinated.** `character.magicItems` holds `{ entryRef, attuned, charges?, overrides? }` after Phase 15. Attunement derivation logic stays; the item stat-block read changes from inline to library hydration. |
| Phase 24 | `services/character/spell-data.ts` (spell-slot / cantrip tables) | **Ported.** Phase 24 bug fixes land first, then Phase 15 Step 28 deletes the parallel file and moves the corrected tables into a library `class-progression-table` entry type. |
| Phase 25 | H4 (Sub-Phase D) — Unify Storage Systems | **Absorbed entirely.** Phase 15 Sub-Phase G Step 21 (Homebrew Parity) makes homebrew live in the same library store as built-ins. |
| Phase 25 | M2 (Sub-Phase F) — Builder/Sheet Integration | **Absorbed entirely.** Phase 15 Sub-Phases B/C/D make every consumer hit the library, where homebrew already lives. |
| Phase 25 | H3 (Sub-Phase C) — Custom Mechanics | **Reframed.** "Displays in library but doesn't work in gameplay" disappears at the read layer after Phase 15; the mechanical-effects work (`feat-mechanics-5e.ts` extension, EffectBuilder, dice formulas) is still needed and stays in Phase 25. |
| Phase 25 | H2 — Zod schemas for all 13 content types | **Phase 15 prerequisite.** Ship H2 before Phase 15 — library entries need validated shapes. |
| Phase 26 | Step 10 — Pre-position monsters on map | **Coordinated.** Encounter stores `{ monsterRef, startX, startY, count, overrides? }`, never embedded monster JSON. Pre-Phase-15 encounters with embedded data auto-migrate at load. |
| Phase 28 | Step 28a.1 — Math.random sweep on data tables | **Skipped (Option A).** Phase 15 Step 28 deletes `personality-tables.ts`, `starting-equipment-table.ts`, `bastion-events.ts`, `sentient-items.ts`, `weather-tables.ts`. Math.random sweep skips these files. |
| Phase 28 | Step 28d.3 — `as unknown as` pass on `library-service.ts` | **Deferred (Option A).** Phase 15 reshapes the file; defer the 5 casts in lines 639, 678-679, 694, 702, 710 to a post-Phase-15 cleanup. |

Every affected plan carries a "See also: Phase 15" note near its top so the relationship is visible from either direction.

---

## 🧭 Execution order

1. Sub-Phase A first — the hydration layer is the foundation; every other sub-phase depends on it.
2. Sub-Phases B–G run in any order after A — they are independent sweeps, but Builder → Sheet → Level Up is the natural read order if you want to verify end-to-end as you go.
3. Sub-Phase H (migration + build guard) runs LATE — after most sweeps have landed so the migration covers realistic data shapes.
4. Sub-Phase I (verification + cleanup) is the closing step. Don't skip Step 28 — keeping legacy parallel data around invites accidental imports.

Begin implementation with Sub-Phase A (Steps 1–4). The hydration layer is small, low-risk, and unblocks everything downstream.
