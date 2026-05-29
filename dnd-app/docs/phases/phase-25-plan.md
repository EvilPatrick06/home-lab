# Phase 25 — Homebrew & Custom Content System

## Context

The dnd-app has a working homebrew creation surface (`HomebrewCreateModal.tsx` covers 13 content types), category-organized storage (`userData/homebrew/{category}/{id}.json`), data merge with official content (`mergeHomebrew()`), and library display via `homebrewToLibraryItems()`. What remains broken is the lifecycle around that data: there is no first-class export/import for homebrew bundles, custom feats/spells carry no mechanical effect into gameplay, and homebrew has no campaign scope.

Two original sub-phases were structurally absorbed elsewhere. **H4 (Unify Storage Systems)** moves to Phase 15 Sub-Phase G Step 21 (Homebrew Parity) — once homebrew lives in the unified library store alongside built-ins with a `source: 'homebrew'` discriminator, the dual storage confusion disappears. **M2 (Builder/Sheet Integration)** resolves automatically when Phase 15 Sub-Phases B/C/D land — every consumer hydrates from the library. **H2 (Zod schemas for 13 content types)** is fully absorbed by Phase 15 A.2 (unified `SCHEMA_REGISTRY`) and A.2.5 (source + audit fields on `BaseLibraryEntry`).

The remaining Phase 25 scope is therefore three lanes: export/import portability, mechanical effect application for custom feats/spells, and campaign-scoped homebrew association.

## Depends on / blocks
- Depends on: Phase 15 (unified library + `SCHEMA_REGISTRY` + `source` field), Phase 29 (permission keys, for campaign filtering)
- Blocks: none (Phase 36 Pi-hosted library handles cross-machine sync independently)

## Files touched
| Path | Role |
|------|------|
| `src/renderer/src/services/io/entity-io.ts` | Add `homebrew` entity type + extension `dndhomebrew` |
| `src/renderer/src/services/io/import-export.ts` | Already wires homebrew into full backup; verify import path |
| `src/main/storage/homebrew-storage.ts` | Storage layer; add `campaignId` field plumbing |
| `src/renderer/src/components/library/HomebrewCreateModal.tsx` | Add export/import buttons, effects builder, campaign field |
| `src/renderer/src/services/character/feat-mechanics-5e.ts` | Extend with homebrew effect application |
| `src/renderer/src/services/character/spell-data.ts` | Wire homebrew spell dice formulas into casting |
| `src/renderer/src/stores/use-data-store.ts` | `mergeHomebrew()` — filter by active campaign |
| `src/renderer/src/services/library-service.ts` | `homebrewToLibraryItems()` — propagate campaignId |
| `src/renderer/src/services/homebrew-validation.ts` | **New** — wrap Phase 15 `SCHEMA_REGISTRY` for save-time validation |
| `src/renderer/src/services/character/homebrew-effects.ts` | **New** — `HomebrewFeatEffect` types + `applyHomebrewEffect()` |

## Sub-phase summary
| # | Sub-phase | Theme |
|---|-----------|-------|
| 25a | Homebrew Export/Import (H1) | First-class `.dndhomebrew` files via entity-io |
| 25b | Custom Mechanics Integration (H3) | Effects array on homebrew feats + spell dice |
| 25c | Campaign-Scoped Homebrew (M1) | `campaignId` field + merge filter + UI |
| 25d | Save-time Validation Hookup | Wire Phase 15 `SCHEMA_REGISTRY` into save path |
| 25e | Backup Restore Verification | Confirm `importAllData()` actually rehydrates homebrew |

## Sub-phase details

### 25a — Homebrew Export/Import (H1)
**Files:** `src/renderer/src/services/io/entity-io.ts`, `src/renderer/src/services/io/homebrew-io.ts` (new), `src/renderer/src/components/library/HomebrewCreateModal.tsx`
**Steps:**
1. In `src/renderer/src/services/io/entity-io.ts:17` extend `EntityType` union with `'homebrew'` and at `entity-io.ts:49` add to `ENTITY_CONFIGS`: `homebrew: { extension: 'dndhomebrew', label: 'Homebrew Content', requiredFields: ['id', 'name', 'type'] }`.
2. Create `src/renderer/src/services/io/homebrew-io.ts` exporting `exportHomebrew(items)`, `exportAllHomebrew()` (calls `window.api.homebrew.loadAll()` then `exportEntities('homebrew', ...)`), and `importHomebrew()` (calls `importEntities('homebrew')`, runs `validateHomebrew()` per item, then `window.api.homebrew.save()` on each pass).
3. On ID collision during import, prompt user: "Replace existing?" or "Import as copy (assign new UUID)?". Default to copy if dismissed.
4. Add `schemaVersion: 1` to envelope `data` payload so future field additions can fallback-default older imports.
5. In `HomebrewCreateModal.tsx`, add "Export All Homebrew" and "Import Homebrew" buttons in the header. Import shows a result toast: `Imported N items, M errors`.
**Acceptance:** `services/io/entity-io.ts` ENTITY_CONFIGS contains `homebrew`; round-trip test: export N items → delete from store → import same file → all N items reappear.

### 25b — Custom Mechanics Integration (H3)
**Files:** `src/renderer/src/services/character/feat-mechanics-5e.ts`, `src/renderer/src/services/character/homebrew-effects.ts` (new), `src/renderer/src/components/library/HomebrewCreateModal.tsx`, `src/renderer/src/services/character/spell-data.ts`
**Steps:**
1. Create `src/renderer/src/services/character/homebrew-effects.ts` defining `HomebrewFeatEffect` union (`ability_bonus`, `skill_proficiency`, `damage_resistance`, `speed_bonus`, `ac_bonus`, `custom`) and `applyHomebrewEffect(effect, stats)`.
2. In `feat-mechanics-5e.ts`, after the official-feat switch block, iterate `character.feats.filter(f => f.source === 'homebrew' && Array.isArray(f.effects))` and call `applyHomebrewEffect()`. Homebrew effects must run AFTER official feat processing.
3. In `HomebrewCreateModal.tsx`, when `formData.type === 'feat'`, render an EffectBuilder section. Persist as `formData.effects: HomebrewFeatEffect[]`.
4. In `spell-data.ts` (or the spell-casting flow), accept a `diceFormula?: string` field on homebrew spells. When casting, run formula through existing `dice-service.ts` and broadcast result. Validate formula format (`/^\d+d\d+([+-]\d+)?$/`).
5. Opt-in: if homebrew feat has no `effects` array, render as informational only.
**Acceptance:** A homebrew feat with `effects: [{ type: 'ability_bonus', target: 'strength', value: 1 }]` raises a character's STR by 1 in the sheet; a homebrew spell with `diceFormula: '8d6'` rolls 8d6 on cast.

### 25c — Campaign-Scoped Homebrew (M1)
**Files:** `src/main/storage/homebrew-storage.ts`, `src/renderer/src/stores/use-data-store.ts`, `src/renderer/src/services/library-service.ts`, `src/renderer/src/components/library/HomebrewCreateModal.tsx`, `src/renderer/src/components/library/LibraryFilters.tsx`
**Steps:**
1. Add `campaignId?: string` to `HomebrewEntry` type. `undefined` = global, string = campaign-scoped.
2. Storage layer already serializes the full object — verify save round-trip preserves `campaignId`. Add a test.
3. In `HomebrewCreateModal.tsx`, when opened within a campaign context, auto-default `campaignId` to active campaign; add a "Make this campaign-only" checkbox.
4. In `use-data-store.ts:255` `mergeHomebrew()`, accept an optional `activeCampaignId` arg. Filter incoming homebrew: `entry.campaignId === undefined || entry.campaignId === activeCampaignId`.
5. Add library filter UI: tri-state — "All Homebrew" / "This Campaign" / "Global Only". Persist preference per-session.
6. On campaign deletion, cascade-delete only homebrew entries where `campaignId === deletedCampaignId`. Global homebrew (`campaignId === undefined`) untouched.
**Acceptance:** New homebrew created inside Campaign X stores `campaignId: 'X'`; opening Campaign Y shows only undefined + Y's; deleting X removes its homebrew but leaves global intact.

### 25d — Save-time Validation Hookup
**Files:** `src/renderer/src/services/homebrew-validation.ts` (new), `src/renderer/src/components/library/HomebrewCreateModal.tsx`
**Steps:**
1. Create `src/renderer/src/services/homebrew-validation.ts` exporting `validateHomebrew(item: unknown): { valid: boolean; errors: string[]; warnings: string[] }`. Look up the Phase 15 `SCHEMA_REGISTRY` entry for `item.type` and run `safeParse()`. Unknown type → pass through with warning.
2. Use `.passthrough()` semantics — extra fields are warnings, not errors. Homebrew creativity must not be blocked.
3. In `HomebrewCreateModal.tsx` save handler, run validation; show errors/warnings inline. Allow save even with warnings; block save on hard errors (missing `id`/`name`/`type`).
4. Also call `validateHomebrew()` inside 25a's import path for each entity before persisting.
**Acceptance:** Saving a homebrew spell missing `name` shows "name is required" and blocks save; saving with unknown field saves successfully with warning.

### 25e — Backup Restore Verification
**Files:** `src/renderer/src/services/io/import-export.ts`
**Steps:**
1. Verify `importAllData()` path at `import-export.ts:410` actually writes each `homebrew` entry back to disk via `window.api.homebrew.save()`. Currently the count is reported but the write fan-out is unconfirmed.
2. Add `import-export.test.ts` cases for homebrew round-trip: backup → wipe userData → restore → assert homebrew count matches and entries are loadable.
3. If `customCreatures` is also in the payload, ensure they restore through the dual-storage path until Phase 15 G Step 21 unifies them.
**Acceptance:** `import-export.test.ts` includes a homebrew round-trip case and passes.

## Constraints & edge cases

### Export/Import
- `.dndhomebrew` files are JSON envelopes matching the existing entity-io schema. The importer accepts both single-item and bulk-array shapes.
- Cross-version compatibility: envelope carries `schemaVersion: 1`. Future versions add defaults for older files.

### Validation
- `.passthrough()` is essential — homebrew is inherently flexible. Validate the structural minimum; everything else is warnings.
- Never block save outright on schema mismatch — show warnings and let user proceed.

### Custom Mechanics
- Effect system is opt-in. A homebrew feat with no `effects` array is informational only.
- Homebrew effect application must run AFTER official feat hardcoded handling so it cannot interfere.
- Validate dice formulas with regex `/^\d+d\d+([+-]\d+)?$/` before allowing save; reuse `dice-service.ts` for rolls.

### Storage Unification
- Out of Phase 25 scope — Phase 15 Sub-Phase G Step 21 handles the `custom-creatures` → unified library merge.

### Campaign Scoping
- Global homebrew is always available, additive to campaign-scoped content, never replaced.
- Campaign deletion cascades only to campaign-scoped homebrew. Global content is preserved.
- Phase 31 broadcasts homebrew changes as a library shard delta; per-campaign filter lives in that shard's `permissionFilter` once Phase 29 permission keys exist.

## Verification

After implementation:
```bash
cd dnd-app
npm run lint
npx tsc --noEmit -p tsconfig.node.json
npx tsc --noEmit -p tsconfig.web.json
npm test -- entity-io homebrew feat-mechanics import-export
```

Manual smoke:
1. Create a homebrew feat with an ability_bonus effect, attach to a character — STR rises in sheet.
2. Export all homebrew → wipe `userData/homebrew/` → import → all items reappear.
3. Create homebrew while in Campaign A → switch to Campaign B → confirm it does NOT appear in B's library.
4. Delete Campaign A → confirm A's homebrew is gone and global homebrew is intact.
5. Full backup → restore → verify homebrew count via library.

## Completed

> **PHASE 25 PARTIAL — 2026-05-29 (overnight autonomous pass).** 4-gate green (lint 0, tsc web+node 0, vitest 6508/6508).
> - **25a DONE** — `entity-io` gains `homebrew` type (`.dndhomebrew`); new `services/io/homebrew-io.ts` (export/exportAll/import with per-item validation); Export All + Import buttons in HomebrewCreateModal with result toasts.
> - **25d DONE** — `services/homebrew-validation.ts` wraps Phase-15 `SCHEMA_REGISTRY`: hard errors only on missing id/name/type, schema/unknown-type → warnings (passthrough). Tested; used by the import path.
> - **25b DEFERRED** — custom feat/spell mechanics (needs `feats[].effects`/`source` type extension + homebrew-effects.ts + sheet EffectBuilder + app verify).
> - **25c DEFERRED** — campaign-scoped homebrew (`campaignId` field + mergeHomebrew filter + tri-state UI + cascade-delete; partly coupled to Phase 29).
> - **25e DEFERRED** — backup restore round-trip test (heavy userData mocking).

### Pre-existing notes
(All prior steps relocated. H2 struck and absorbed by Phase 15 A.2 + A.2.5. H4 moved to Phase 15 Sub-Phase G Step 21. M2 resolved structurally by Phase 15 Sub-Phases B/C/D. Live verification 2026-05-19 confirmed no entries in `entity-io.ts` ENTITY_CONFIGS for `homebrew`, no `homebrew-validation.ts` file exists, no `source === 'homebrew'` branch in `feat-mechanics-5e.ts`, no `campaignId` field on homebrew storage. All 25a-25e sub-phases remain live.)
