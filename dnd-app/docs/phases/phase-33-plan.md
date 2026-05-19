# Phase 33 — Tooling and small enhancement bundle

## Context

Phase 33 absorbs every backlog item previously catalogued as a "future idea" or "design gotcha" in `docs/SUGGESTIONS-LOG-DNDAPP.md` that doesn't fit the architectural sweep phases (15, 29-32) or the audit phase (28). Each sub-phase is a discrete, well-scoped task that has been deferred long enough.

Goal: empty the suggestions log of every entry that has a mechanical fix. After Phase 33 lands, no "DO NOT do X" gotcha exists as a docs entry — every gotcha is either structurally impossible (lint rule, code refactor, schema fix) or its trap has been removed.

Phase 33 is entirely client-side. No Raspberry Pi involvement.

## Depends on / blocks

- Depends on: none (33b is the practical prerequisite for 33f/33g verification, but only by execution order)
- Blocks: none directly. 33h's dev-time content validation in `scripts/schemas/` is independent of Phase 15's runtime library boundary test — the two coexist (Phase 15 forbids raw `public/data` imports in consumer code; 33h validates content shape at CI/build time). No false dependency in either direction.

## Files touched

| Path | Role |
|------|------|
| `src/renderer/src/services/io/import-export.ts` | Backup migration table + walker (33a, DONE) |
| `src/renderer/src/services/io/import-export.test.ts` | Round-trip tests for migrations (33a, DONE) |
| `dnd-app/package.json` | devDependencies + scripts (33b, DONE) |
| `dnd-app/knip.json` | Knip ignoreDependencies cleanup (33b, still NEEDED) |
| `src/renderer/src/components/ui/ModalScaffold.tsx` (new) | Reusable modal scaffold primitive (33c) |
| `src/renderer/src/components/ui/index.ts` | Export new scaffold (33c) |
| ~10 modal files across `src/renderer/src/components/` | ModalScaffold consumers (33c) |
| `dnd-app/electron.vite.config.ts` | Visualizer async import (33d/33e), CJS removal (33e) |
| `dnd-app/scripts/audit/check-bundle-size.mjs` (new) | Bundle-size diff check (33d) |
| `dnd-app/scripts/audit/bundle-baseline.json` (new) | Committed baseline (33d) |
| `src/main/ai/provider-registry.ts` | Static-import collapse (33f, DONE Option B) |
| `src/main/ipc/ai-handlers.ts` | Static-import collapse (33f, DONE Option B) |
| `src/renderer/src/stores/use-network-store.ts` | Re-export barrel (33g, DONE — kept as alias) |
| ~12 importers in `src/renderer/src/components/` and `stores/` | Direct `./network-store` import (33g, DONE) |
| `scripts/schemas/spells.ts` | Wrapper schema (33h, DONE for spells) |
| `scripts/schemas/{backgrounds,bestiary,classes,feats,mechanics,species,world}.ts` | Wrap or re-shape (33h, still NEEDED) |
| `scripts/audit/validate-content-vs-schemas.ts` | Validator script (33h, exists) |
| `dnd-app/package.json` `check:full` / CI | Wire validator gate (33h, still NEEDED) |

## Sub-phase summary

| # | Sub-phase | Theme |
|---|-----------|-------|
| 33a | Backup format migration framework | Versioned migration chain + round-trip tests |
| 33b | madge/ts-prune to dpdm/knip migration | Replace broken Node-22 tooling |
| 33c | ModalScaffold extraction | One reusable wrapper for ~10 modals |
| 33d | Bundle-size CI guard | Visualizer JSON + diff script + baseline |
| 33e | electron.vite.config.ts CJS to ESM | Drop createRequire/require |
| 33f | provider-registry static-vs-dynamic collapse | Pick one pattern; no rollup warnings |
| 33g | use-network-store circular-dep codemod | Rewrite importers to network-store |
| 33h | scripts/schemas content-shape fix | Wrap or restructure per content shape |

## Sub-phase details

### 33a — Backup format migration framework

**Files:** `src/renderer/src/services/io/import-export.ts`, `src/renderer/src/services/io/import-export.test.ts`

**Steps:**
1. Define `BACKUP_MIGRATIONS` keyed by target version. (`import-export.ts:145-162`)
2. Implement walker `migrateBackupPayload(raw)`. (`import-export.ts:169-179`)
3. Call walker before field extraction on import. (`import-export.ts:396-399`)
4. Round-trip tests for v1, v2, v3 payloads + idempotency. (`import-export.test.ts:460+`)
5. (Optional) Toast user "Backup format upgraded from vX to vY" after migration.

**Acceptance:** Pre-Phase-33 backup loads, migrates, round-trips without data loss. Tests cover every step. Future v4 needs only a new `BACKUP_MIGRATIONS[4]` entry.

### 33b — madge/ts-prune to dpdm/knip migration

**Files:** `dnd-app/package.json`, `dnd-app/knip.json`

**Steps:**
1. Replace `circular` npm script with `dpdm` invocation. (`package.json:38`)
2. Confirm `npm run dead-code` (knip) covers prior `ts-prune` patterns; tune `knip.json` if gaps.
3. Drop `madge` and `ts-prune` from devDependencies. (DONE)
4. Remove the lingering `"ts-prune"` entry from `knip.json` `ignoreDependencies`. (`knip.json:19`) — still NEEDED
5. Confirm `circular` participates in `check:full` (covered by Phase 28e).

**Acceptance:** `npm run circular` reports cycle list without Node-22 errors. `npm run dead-code` surfaces unused exports. No `madge` or `ts-prune` token left in the repo, including configs.

### 33c — ModalScaffold extraction

**Files:** `src/renderer/src/components/ui/ModalScaffold.tsx` (new), `src/renderer/src/components/ui/index.ts`, modal consumers

**Steps:**
1. Create `ModalScaffold.tsx` exposing `{title, onClose, footer?, children, ariaLabel?}` plus opt-out flags for ESC-close and focus-trap. Note: the existing `Modal.tsx` (`src/renderer/src/components/ui/Modal.tsx:12`) already provides ESC + focus-trap + aria-modal — decide whether to extend `Modal.tsx` or extract a sibling primitive used by modals that still roll their own scaffold (e.g., `HandoutModal.tsx:106-119`).
2. Re-export from `src/renderer/src/components/ui/index.ts`.
3. Migrate `HandoutModal` as proof-of-concept.
4. Sweep remaining clones: `SharedJournalModal`, `EndOfSessionModal`, `CreateMapModal`, `ResizeMapModal`, `SentientItemModal`, `CharacterInspectModal`, `DmScreenPanel`, `RollTableModal`.
5. Run `jscpd` before and after; record the clone-count drop.

**Acceptance:** All listed modals consume `ModalScaffold`. Visual + interaction parity. jscpd clone count drops.

### 33d — Bundle-size CI guard

**Files:** `dnd-app/electron.vite.config.ts`, `dnd-app/scripts/audit/check-bundle-size.mjs` (new), `dnd-app/scripts/audit/bundle-baseline.json` (new), `dnd-app/package.json`

**Steps:**
1. Visualizer is already async-imported. (`electron.vite.config.ts:11-15`) — done.
2. Make visualizer also emit `bundle-stats.json` for programmatic consumption.
3. Create `scripts/audit/check-bundle-size.mjs`: load `bundle-stats.json`, diff against `bundle-baseline.json`, fail on >10% chunk growth or new chunk >500 KB.
4. Generate and commit `bundle-baseline.json` from `ANALYZE=1 npm run build`.
5. Wire into `check:full` (or new `bundle:check`) script and CI workflow.

**Acceptance:** `ANALYZE=1 npm run build` emits JSON. CI fails on bundle-budget regression.

### 33e — electron.vite.config.ts CJS to ESM

**Files:** `dnd-app/electron.vite.config.ts`

**Steps:**
1. Replace `const pkg = require('./package.json')` (`electron.vite.config.ts:8-9`) with `await import('./package.json', { with: { type: 'json' } })` or `fs.readFileSync('package.json')`.
2. Delete the `createRequire(import.meta.url)` import + binding once no `require()` remains.
3. Audit any other `require(` call sites: none remain after step 1.
4. Verify `npm run build` and `npm run dev` start without `ERR_REQUIRE_ESM`.

**Acceptance:** Zero `require()` and zero `createRequire` references in `electron.vite.config.ts`.

### 33f — provider-registry static-vs-dynamic import collapse

**Files:** `src/main/ai/provider-registry.ts`, `src/main/ipc/ai-handlers.ts`

**Steps:**
1. Confirm static-only pattern is in place. (DONE — Option B selected)
2. Add a one-line comment at the top of `provider-registry.ts` documenting the eager-load intent.
3. Verify `npm run build` produces no "dynamic import will not move module" warnings.

**Acceptance:** Zero rollup mixed-import warnings.

### 33g — use-network-store circular-dep codemod

**Files:** `src/renderer/src/stores/use-network-store.ts`, ~28 importers

**Steps:**
1. Confirm all in-tree importers use `./network-store` directly. (DONE)
2. The barrel `use-network-store.ts` is currently a 4-line re-export. Decide: delete (cleanest, update colocated `use-network-store.test.ts` import path) OR mark `/** @deprecated */` and keep one release before deletion.
3. Verify `npm run circular` reports zero `use-network-store`-related cycles.
4. Verify rollup build emits no "circular dependency between chunks" warnings.
5. Verify `TokenContextMenu.test.tsx` passes.

**Acceptance:** Zero circular-dep warnings. `TokenContextMenu.test.tsx` passes.

### 33h — scripts/schemas content-shape fix

> Scope clarification: 33h targets dev-time zod schemas in `dnd-app/scripts/schemas/` (consumed by `npm run validate:5e` / `validate-content-vs-schemas.ts`). Separate from Phase 15 A.2 runtime schemas under `src/renderer/src/services/library/schemas/`.

**Files:** `dnd-app/scripts/schemas/*.ts`, `dnd-app/scripts/audit/validate-content-vs-schemas.ts`, `dnd-app/package.json`

**Steps:**
1. Run `npx tsx dnd-app/scripts/audit/validate-content-vs-schemas.ts` to get the current pass/fail table.
2. Wrap or restructure each schema to match the actual content shape:
   - `SpellsSchema` already a wrapper. (`scripts/schemas/spells.ts:569-571`) — DONE.
   - `BackgroundSchema`: single-record; `character/backgrounds.json` is a wrapper. Add `BackgroundsFileSchema`.
   - `BestiarySchema`: single-record; wrap with `z.array(BestiarySchema)` or wrapper.
   - `ClassSchema`, `FeatSchema`, `MechanicsSchema`, `SpeciesSchema`, `WorldSchema`: same audit-and-wrap per content shape.
3. Re-run validator after each fix; target 0 fails / 0 file-not-founds.
4. Wire the validator into `check:full` script and CI workflow.
5. Update `.cursorrules` line describing `scripts/schemas/` to clarify the "single-record schema vs file-shape schema" distinction.

**Acceptance:** Every `src/renderer/public/data/5e/*.json` file passes its corresponding schema. CI enforces the contract on every PR.

## Constraints and edge cases

### Backup migrations (33a)
- One-pass migration: re-saving stamps current `BACKUP_VERSION`; subsequent loads skip the chain.
- Idempotency: running a migration on already-migrated data is a no-op.
- Lossy migrations are forbidden.

### Tool migrations (33b)
- Verify `dpdm` finds the same cycles as the pre-existing `madge` baseline.
- Keep the `knip` config tight; do not relax `knip.json`.

### ModalScaffold (33c)
- No behavior changes per modal. Visual + interaction parity required.
- Footer slot must accept arbitrary JSX.
- ESC-close + focus-trap must be opt-out-able for confirm-destructive flows.

### Bundle-size guard (33d)
- Baseline updates must be deliberate.
- Gate on production build, not dev server.

### ESM/CJS migration (33e)
- Avoid top-level `await` in the config file body.

### Provider registry (33f)
- Option B (eager) chosen; first AI call path stays cheap, main bundle pays SDK cost.

### Circular-dep codemod (33g)
- `.test.tsx` files must be covered by the codemod.

### Schema fix (33h)
- Content files are source of truth; reshape schemas to match content.
- Keep single-record schemas exported for homebrew per-record validation.

## Verification

After 33a: open a pre-v3 backup; sheet displays correctly; saving stamps the new version.
After 33b: `npm run circular` returns expected cycles without Node-22 errors.
After 33c: migrated modals render identically.
After 33d: `ANALYZE=1 npm run build` emits JSON stats; CI fails on >10% chunk growth.
After 33e: `npm run build` + `npm run dev` succeed with zero `ERR_REQUIRE_ESM`.
After 33f: rollup build emits zero "dynamic import" warnings.
After 33g: `npm run circular` reports zero `use-network-store`-related cycles.
After 33h: validator reports all-pass; CI gates on every 5e content PR.

Each sub-phase gate:
```
npm run lint
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npx vitest run
```

Execution order: 33b first (tooling baseline), then 33e + 33d (config + bundle), then 33f + 33g (import-pattern collapses), then 33h (schemas), then 33c (ModalScaffold sweep), then 33a (backup migration last, after any data-layer interaction with Phase 15).

## Completed

- 33a Step 1 — DONE (`src/renderer/src/services/io/import-export.ts:145`) — `BACKUP_MIGRATIONS` table keyed by target version (2 and 3 entries present).
- 33a Step 2 — DONE (`src/renderer/src/services/io/import-export.ts:169`) — `migrateBackupPayload()` walker exported.
- 33a Step 3 — DONE (`src/renderer/src/services/io/import-export.ts:396-399`) — walker invoked on import before field extraction.
- 33a Step 4 — DONE (`src/renderer/src/services/io/import-export.test.ts:460+`) — round-trip tests cover v1, v2, idempotency.
- 33b Step 1 — DONE (`package.json:38`) — `circular` script uses `dpdm@3.14.0`.
- 33b Step 3 — DONE (`package.json`) — `madge` and `ts-prune` removed from devDependencies; `dpdm` and `knip` present.
- 33d Step 1 (visualizer async) — DONE (`electron.vite.config.ts:11-15`) — `analyzePlugin()` uses `await import('rollup-plugin-visualizer')`.
- 33e Step 1 (visualizer ESM) — DONE (`electron.vite.config.ts:13`) — visualizer load is ESM.
- 33f Steps 1-3 — DONE (`src/main/ai/provider-registry.ts:1-5`, `src/main/ipc/ai-handlers.ts:11-42`) — Option B selected: all AI clients statically imported.
- 33g Steps 1-2 (importers) — DONE — all 28 in-tree consumers import from `./network-store`; `use-network-store.ts:1-5` is a 4-line re-export barrel awaiting deletion-or-deprecation decision.
- 33h Step 2 (spells) — DONE (`scripts/schemas/spells.ts:569-571`) — `SpellsSchema = z.object({ spells: z.array(SpellSchema) })` wrapper present.
- 33h Validator script — DONE (`scripts/audit/validate-content-vs-schemas.ts:1-52`) — script exists; not yet wired into `check:full`/CI.
