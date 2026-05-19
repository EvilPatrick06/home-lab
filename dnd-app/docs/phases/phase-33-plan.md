# Phase 33 — Tooling + small enhancement bundle

Phase 33 absorbs every backlog item that was previously catalogued as a "future idea" or "design gotcha" in `docs/SUGGESTIONS-LOG-DNDAPP.md` and that doesn't fit the architectural sweep phases (15, 29-32) or the existing audit phase (28). Each sub-phase corresponds to a discrete, well-scoped task that has been deferred long enough.

Goal: empty the suggestions log of every entry that has a mechanical fix. After Phase 33 lands, no "DO NOT do X" gotcha exists as a docs entry — every gotcha is either structurally impossible (lint rule, code refactor, schema fix) or its trap has been removed.

---

## 🏗️ Architecture & Environment Split

### Windows 11 Machine (`C:\Users\evilp\dnd\`) — ALL WORK IS HERE

Phase 33 is entirely client-side. No Raspberry Pi involvement.

**Key files (one cluster per sub-phase):**

| Sub-phase | Primary files |
|-----------|--------------|
| 33a | `src/main/io/import-export.ts`, new `src/main/io/backup-migrations.ts` |
| 33b | `dnd-app/package.json` (devDependencies + scripts), CI config |
| 33c | `src/renderer/src/components/ui/ModalScaffold.tsx` *(new)*, ~10 modal files across `components/` |
| 33d | `dnd-app/electron.vite.config.ts`, new `scripts/audit/check-bundle-size.mjs`, CI config |
| 33e | `dnd-app/electron.vite.config.ts` |
| 33f | `src/main/ai/provider-registry.ts`, `src/main/ipc/ai-handlers.ts` |
| 33g | `src/renderer/src/stores/use-network-store.ts`, ~12 importers across `components/` |
| 33h | `scripts/schemas/*.ts`, `scripts/validate-homebrew.ts` |

### Raspberry Pi (`patrick@bmo`) — NO WORK THIS PHASE

---

## 📋 Core Objectives

| # | Sub-phase | Origin | Scope |
|---|-----------|--------|-------|
| 33a | Backup format migration framework | SUGGESTIONS-LOG `[2026-04-24]` | Add versioned migration chain to backup import; round-trip tests for every prior version |
| 33b | `madge`/`ts-prune` → `dpdm`/`knip` migration | SUGGESTIONS-LOG `[2026-04-24]` + ISSUES-LOG companion | Replace broken Node-22 tooling with working alternatives, update CI |
| 33c | `<ModalScaffold>` extraction | SUGGESTIONS-LOG `[2026-04-24]` | One reusable wrapper across ~10 modal files; removes 9-24 line duplications and makes ESC-to-close one-PR away |
| 33d | Bundle-size CI guard | SUGGESTIONS-LOG `[2026-04-24]` | Fix CJS require for `rollup-plugin-visualizer@7`, add bundle-size check script, fail CI on chunk growth > 10% |
| 33e | `electron.vite.config.ts` CJS → ESM | SUGGESTIONS-LOG gotcha `[2026-04-24]` | Replace `createRequire` + `require()` with `await import(...)`; future-proof against ESM-only dep migrations |
| 33f | `provider-registry.ts` dynamic-vs-static import collapse | SUGGESTIONS-LOG gotcha `[2026-04-24]` | Pick ONE pattern (drop static imports OR drop the dynamic-import attempt); verify rollup chunking |
| 33g | `use-network-store.ts` circular-dep codemod | SUGGESTIONS-LOG gotcha `[2026-04-24]` | Rewrite 12 importers to `stores/network-store/index`; delete or alias the barrel; verify dpdm shows zero cycles |
| 33h | `scripts/schemas/*` content-shape fix | SUGGESTIONS-LOG gotcha `[2026-04-24]` | Rewrite each single-record schema to match the actual `public/data/5e/` shape (bare arrays OR wrapper objects); validator script in CI |

8 sub-phases. Each ends with the 4-gate suite (`npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run`). One release at end.

---

## 🛠️ Step-by-Step Execution Plan

### Sub-Phase A: Backup format migration framework (33a)

**Step 1 — Define `BACKUP_MIGRATIONS` table**
- Add `BACKUP_MIGRATIONS: Record<number, (raw: any) => any>` next to the existing `BACKUP_VERSION` constant in `src/main/io/import-export.ts` (or extract to new `src/main/io/backup-migrations.ts` if the table grows).
- Initial entries for the migrations that should have existed historically:
  ```ts
  const BACKUP_MIGRATIONS: Record<number, (raw: any) => any> = {
    2: (raw) => { raw.customCreatures ??= []; raw.homebrew ??= []; return raw },
    3: (raw) => { /* v2 → v3 field renames if any */ return raw },
  }
  ```

**Step 2 — Implement `migrateBackup()`**
```ts
function migrateBackup(raw: any): BackupPayload {
  let v = raw.version ?? 1
  while (v < BACKUP_VERSION) {
    v += 1
    raw = BACKUP_MIGRATIONS[v]?.(raw) ?? raw
  }
  raw.version = BACKUP_VERSION
  return raw
}
```
- Insert call before the existing field-extraction logic (~ line 346 of `import-export.ts`).

**Step 3 — Round-trip tests**
- Add `src/main/io/import-export.test.ts` cases for v1, v2, v3 sample payloads.
- Confirm that loading a v1 payload migrates to current and re-saving produces a current-shape payload.
- Confirm idempotent migration (run migrate on already-migrated → no-op).

**Step 4 — UI surface**
- After successful migration, show a toast: "Backup format upgraded from v1 to v3."

**Acceptance:**
- A pre-Phase-33 backup file loads, migrates, and round-trips without data loss.
- Tests cover every migration step.
- Future contributors can add v4, v5… by adding to `BACKUP_MIGRATIONS` only.

---

### Sub-Phase B: `madge`/`ts-prune` → `dpdm`/`knip` migration (33b)

**Step 5 — Replace `circular` script**
- Edit `package.json`:
  ```diff
  -  "circular": "npx madge --circular --extensions ts,tsx src/"
  +  "circular": "dpdm --no-warning --no-tree --transform --extensions ts,tsx --exit-code circular:1 src/main/index.ts src/renderer/src/main.tsx"
  ```

**Step 6 — Verify `knip` covers `ts-prune` use cases**
- Confirm `npm run dead-code` (which already invokes `knip`) catches the same patterns `ts-prune` was used for.
- If gaps, expand the knip config in `knip.json` to cover them.

**Step 7 — Remove broken devDeps**
- Drop `madge` and `ts-prune` from `dnd-app/package.json` `devDependencies`.
- Run `npm install` to update `package-lock.json`.

**Step 8 — CI**
- Confirm `circular` runs as part of `check:full` (covered by Phase 28e); fail CI on cycle detection.

**Acceptance:**
- `npm run circular` reports the same cycle list (or improved) as the prior `madge`-based output, but without Node-22 incompatibility errors.
- `npm run dead-code` still surfaces unused exports.
- No reference to `madge` or `ts-prune` remains in the repo.

---

### Sub-Phase C: `<ModalScaffold>` extraction (33c)

**Step 9 — Create the primitive**
- New file `src/renderer/src/components/ui/ModalScaffold.tsx`:
  ```tsx
  interface ModalScaffoldProps {
    title: string
    onClose: () => void
    footer?: ReactNode
    children: ReactNode
    ariaLabel?: string
  }
  ```
- Internal layout: header row (title + close button) + content slot + optional footer.
- Wires ESC-to-close, focus-trap, aria-modal automatically — every consumer inherits the behavior for free.
- Re-export from `src/renderer/src/components/ui/index.ts`.

**Step 10 — Migrate `HandoutModal` as the proof-of-concept**
- Replace the inline header + close-button + footer scaffolding with `<ModalScaffold>`.
- Run vitest to verify no regression.
- Note: this single migration should remove 24 lines of duplicated code per the SUGGESTIONS-LOG entry.

**Step 11 — Sweep the remaining modals**
- `SharedJournalModal` (24-line clone with HandoutModal)
- `EndOfSessionModal` (15-line clone)
- `CreateMapModal` / `ResizeMapModal` (12-line clones)
- `SentientItemModal` / `CharacterInspectModal` (9-line clones)
- `DmScreenPanel` / `RollTableModal` (9-line clones)
- Other modals discovered during the sweep (`grep -lE 'X.*onClose|close button.*modal' src/renderer/src/components/`)

**Step 12 — Verify `jscpd` drop**
- Run `jscpd` before and after; confirm the 278-clone baseline drops by the expected ~40-50 lines per migrated pair.

**Acceptance:**
- All listed modals consume `<ModalScaffold>`.
- Visual regression: each modal renders identically.
- Adding ESC-to-close to every modal is one PR (modify `ModalScaffold` once).
- jscpd clone count drops.

---

### Sub-Phase D: Bundle-size CI guard (33d)

**Step 13 — Fix CJS require for `rollup-plugin-visualizer`**
- Open `dnd-app/electron.vite.config.ts`.
- Find the `analyzePlugin()` factory that uses `require('rollup-plugin-visualizer')`.
- Replace with `await import('rollup-plugin-visualizer')`:
  ```ts
  async function analyzePlugin() {
    if (process.env.ANALYZE !== '1') return null
    const { visualizer } = await import('rollup-plugin-visualizer')
    return visualizer({ open: true, filename: 'bundle-stats.html', gzipSize: true, template: 'treemap' })
  }
  ```
- Switch the config to `defineConfig(async () => ({ ... }))` if not already async.

**Step 14 — Add the bundle-size check script**
- New file `scripts/audit/check-bundle-size.mjs`:
  - Loads `bundle-stats.json` (emit from visualizer with `json: true`)
  - Compares against a baseline at `scripts/audit/bundle-baseline.json`
  - Fails (exit code 1) if any chunk grew > 10% OR a new chunk > 500 KB appears
  - Prints a diff summary

**Step 15 — Commit baseline**
- Run `ANALYZE=1 npm run build` to generate initial stats.
- Commit `scripts/audit/bundle-baseline.json` with current chunk sizes.

**Step 16 — Wire into CI**
- Add to `check:full` script in `package.json`:
  ```
  "check:full": "... && ANALYZE=1 npm run build && node scripts/audit/check-bundle-size.mjs"
  ```
- Add CI job step that runs `check:full`.

**Acceptance:**
- `ANALYZE=1 npm run build` succeeds.
- Bundle-stats JSON emits with current chunk sizes.
- CI fails if a PR grows the bundle > 10% per chunk.
- Baseline is committed; future contributors update it intentionally.

---

### Sub-Phase E: `electron.vite.config.ts` CJS → ESM (33e)

**Step 17 — Audit all `require()` calls**
- `grep -nE 'require\(' dnd-app/electron.vite.config.ts`
- Each call site evaluated: does the target package have ESM exports? (Most modern Vite plugins ship ESM-only now.)

**Step 18 — Convert each `require(...)` to `await import(...)`**
- Replace `const x = require('y')` with `const { x } = await import('y')` (or the appropriate named-export form).
- Make the surrounding factory `async` if needed.
- Make the config function `async` (Vite supports `defineConfig(async () => ...)`).

**Step 19 — Remove `createRequire`**
- The top-of-file `createRequire(import.meta.url)` becomes unused once all `require()` calls are gone. Delete it.

**Step 20 — Verify**
- `npm run build` succeeds without ERR_REQUIRE_ESM.
- `ANALYZE=1 npm run build` succeeds (Sub-Phase D verification overlaps).
- Dev server (`npm run dev`) starts cleanly.

**Acceptance:**
- Zero `require()` calls in `electron.vite.config.ts`.
- All ESM-only Vite plugins load without errors.
- Future ESM-only dep upgrades work without further config changes.

---

### Sub-Phase F: `provider-registry.ts` dynamic-vs-static import collapse (33f)

**Step 21 — Identify the conflict**
- `provider-registry.ts` statically imports every AI client (claude, gemini, openai, bmo-bridge for narration).
- `ai-handlers.ts` uses `await import('./ai/claude-client')` patterns trying to lazy-load.
- Rollup ignores the dynamic-import attempt because the static import already bundles the module into the eager chunk; build emits the warning *"dynamic import will not move module into another chunk"*.

**Step 22 — Pick ONE pattern**
- **Option A (lazy):** drop the static imports in `provider-registry.ts`; register providers via a setter the first time `ai-handlers.ts` imports them. SDK chunks become deferred.
- **Option B (eager):** drop the `await import(...)` calls in `ai-handlers.ts`; use normal top-level imports. SDK chunks stay in main bundle but the build is honest about it.
- **Decide based on bundle-size target:** if shrinking the eager bundle matters, pick A. If session-start time matters more, pick B.

**Step 23 — Implement chosen option**
- **For Option A:** convert `provider-registry.ts` to lazy lookup with a `Map<string, () => Promise<LLMProvider>>` of factories.
- **For Option B:** delete every `await import('./ai/...')` from `ai-handlers.ts`; ensure top-level imports cover every reference.

**Step 24 — Verify**
- Build output: rollup no longer emits the "dynamic import will not move module" warning.
- Bundle stats: chunk shape matches intent (deferred for A, single eager chunk for B).
- AI provider flows still work end-to-end.

**Acceptance:**
- Zero rollup "dynamic import will not move" warnings during `npm run build`.
- Intent of the chosen pattern is documented at the top of `provider-registry.ts`.
- Future contributors can't reintroduce the mixed pattern without it being obvious.

---

### Sub-Phase G: `use-network-store.ts` circular-dep codemod (33g)

**Step 25 — Identify importers**
- `grep -rln "from.*use-network-store" src/renderer/src` returns ~12 files.
- Each currently does `import { useNetworkStore } from '@renderer/stores/use-network-store'` (or relative equivalent).

**Step 26 — Codemod rewrite**
- Replace every importer with `import { useNetworkStore } from '@renderer/stores/network-store'` (or relative path to `stores/network-store/index.ts`).
- Use `npx ts-morph` or a simple `sed` for the literal-string rewrites.

**Step 27 — Decide on the barrel**
- Either:
  - **Delete `use-network-store.ts` entirely** (cleanest; matches the gotcha's recommendation).
  - OR keep as a single-line alias with deprecation comment:
    ```ts
    /** @deprecated import from './network-store' directly */
    export { useNetworkStore } from './network-store'
    ```
  - Pick deletion unless a public-API surface depends on the file name.

**Step 28 — Verify**
- `npm run circular` reports zero cycles involving `use-network-store.ts`.
- Rollup build emits no "circular dependency between chunks" warnings.
- `TokenContextMenu.test.tsx` (the test that was failing per the gotcha) now passes.

**Acceptance:**
- Zero circular-dep warnings in `npm run circular`.
- Zero "will produce a circular dependency between chunks" warnings in `npm run build`.
- `TokenContextMenu.test.tsx` passes.
- All 12 prior importers use the canonical path.

---

### Sub-Phase H: `scripts/schemas/*` content-shape fix (33h)

> **Scope clarification (2026-05-18).** Phase 33h targets `scripts/schemas/` — **dev-time** zod schemas used by `npm run validate:5e` to assert content shape before commit. This is separate from Phase 15 A.2 schemas at `src/renderer/src/services/library/schemas/`, which are **runtime** schemas validating entries at load + homebrew-save time. The two schema sets validate at different boundaries and have different purposes; they do not conflict, and Phase 33h does not replace or get replaced by Phase 15's schema work. Phase 33h fixes the existing single-record-vs-array-or-wrapper mismatch in the dev-time set; Phase 15 ships the runtime set from scratch.

**Step 29 — Audit current schema vs content shape**
- Run `dnd-app/scripts/audit/validate-content-vs-schemas.ts` to get the pass/fail table.
- Identified mismatch categories (per SUGGESTIONS-LOG gotcha):
  - Schemas written for single-record shapes (e.g., `SpellSchema`)
  - Content files actually bare arrays (`spells.json` is `Spell[]`)
  - Or wrapper objects with extra metadata fields (`backgrounds.json` has `{section, description, total_count, backgrounds, cross_references, structural_patterns}`)

**Step 30 — Per-file fix**
For each pairing in the audit table:
- **If content is `Record[]`:** wrap schema as `z.array(SingleSchema)` and rename to `XxxArraySchema`.
- **If content is wrapper object:** create `XxxFileSchema = z.object({ ...metadata fields, payload: z.array(SingleSchema) })`.
- Keep the single-record schema exported for any code that needs to validate one record at a time (homebrew creation modal, etc.).

**Step 31 — Run validation script**
- After every file's fix, re-run `validate-content-vs-schemas.ts`.
- Target: 0 fails / 0 file-not-found / all-pass.

**Step 32 — Wire validation into CI**
- Add to `check:full` script: `node dnd-app/scripts/audit/validate-content-vs-schemas.ts`.
- Fail CI if any 5e content file fails its schema.

**Step 33 — Update `.cursorrules`**
- Modify the line that describes `scripts/schemas/` to clarify the "single-record vs file-shape" distinction.

**Acceptance:**
- Every `public/data/5e/*.json` file passes its corresponding schema.
- CI enforces the contract on every PR touching 5e data.
- Future schema mismatches surface at PR time, not runtime.

---

## ⚠️ Constraints & Edge Cases

### Backup migrations (33a)
- **One-pass migration.** Once a backup is loaded and migrated, re-saving it stamps the new `BACKUP_VERSION`. Subsequent loads skip the migration chain.
- **Idempotency.** Running a migration on already-migrated data must be a no-op. Test this explicitly.
- **Lossy migrations are forbidden.** A v1→v2 migration that drops fields the user might still care about must surface a warning toast before saving.

### Tool migrations (33b)
- **Verify `dpdm` finds the same cycles.** The existing 13-cycle baseline is the reference. If `dpdm` reports fewer cycles, investigate before declaring victory.
- **Keep the `knip` config tight.** Default knip catches too much; the project already has a tuned `knip.json` — don't relax it.

### ModalScaffold (33c)
- **No behavior changes per modal.** This is pure scaffolding extraction; visual + interaction parity required.
- **Footer slot must accept arbitrary JSX.** Many modals have nontrivial footer content (multiple action buttons, hint text).
- **ESC-to-close + focus-trap must be opt-out-able.** Some flows (confirm-destructive modals) want to require explicit click.

### Bundle-size guard (33d)
- **Baseline must be deliberate.** When intentional growth happens (new feature ship), the PR explicitly updates `bundle-baseline.json`.
- **Don't gate on transient dev-mode builds.** The check runs on production `npm run build`, not the dev server.

### ESM/CJS migration (33e)
- **Don't trigger top-level `await` in the config file body.** Vite handles it, but errors are confusing. Keep awaits inside async factory functions.

### Provider registry (33f)
- **Lazy choice (Option A) shifts AI-start latency.** First AI call pays the SDK-load cost. Confirm it's tolerable (< 500ms on a warm Node) before committing.
- **Eager choice (Option B) increases main bundle.** Confirm it's within budget after Sub-Phase D bundle audit.

### Circular-dep codemod (33g)
- **Test imports are part of the surface.** Codemod must cover `.test.tsx` files too.
- **Vitest aliases may need updating.** `vitest.config.ts` likely has `@renderer` alias — ensure it resolves the new path correctly.

### Schema fix (33h)
- **5e content files are the source of truth.** Reshape schemas to match content, NOT the other way around. The content was hand-curated; the schemas were drafted ahead of the content shape.
- **Keep single-record schemas exported.** Homebrew creation flows still need them for per-record validation.

---

## 🎯 Verification — end-to-end test plan

After **33a**: Open a pre-v3 backup file. Sheet displays correctly. Saving stamps the new version. Round-trip tests pass.

After **33b**: `npm run circular` returns expected cycle list (or fewer) without Node-22 errors. `npm run dead-code` still catches unused exports.

After **33c**: All migrated modals render identically; adding ESC-to-close once flows to every consumer; jscpd clone count drops by the expected amount.

After **33d**: `ANALYZE=1 npm run build` succeeds and emits stats; CI fails when a PR grows a chunk > 10%.

After **33e**: `npm run build` + `npm run dev` succeed without any `ERR_REQUIRE_ESM` errors.

After **33f**: Rollup build emits zero "dynamic import will not move module" warnings.

After **33g**: `npm run circular` reports zero `use-network-store`-related cycles; `TokenContextMenu.test.tsx` passes.

After **33h**: `validate-content-vs-schemas.ts` reports all-pass; CI gates on it.

---

## 🧭 Execution order

1. **33b first** — fixes the broken tooling baseline that other sub-phases need.
2. **33e + 33d** — config + bundle-size; mechanical and orthogonal.
3. **33f + 33g** — import-pattern collapses; depends on 33b's working dpdm/knip.
4. **33h** — schema-shape sweep; orthogonal, can run any time.
5. **33c** — ModalScaffold; UI work; can run alongside any other sub-phase.
6. **33a** — backup migration; standalone, ship last so the framework reflects any data-layer changes from Phase 15 (which Phase 33 doesn't block but interacts with for the schemas piece).

---

## 📜 Commit cadence

```
33a — feat(dnd-app): backup-format migration framework (v1→v2→v3 chain, idempotent, round-trip tested)
33b — chore(dnd-app): replace broken madge/ts-prune with dpdm/knip
33c — refactor(dnd-app): extract ModalScaffold; sweep ~10 modal consumers
33d — feat(dnd-app): bundle-size CI guard via rollup-plugin-visualizer + check-bundle-size.mjs
33e — refactor(dnd-app): electron.vite.config.ts CJS require → async ESM import
33f — refactor(dnd-app): collapse provider-registry static/dynamic import conflict
33g — refactor(dnd-app): use-network-store circular-dep codemod (12 importers)
33h — fix(dnd-app): scripts/schemas content-shape match + CI validation gate
```

Each must pass:
```
npm run lint
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npx vitest run
```

One release at end of Phase 33.

---

## 🔗 Plans superseded or modified by Phase 33

| Plan | Item | Disposition |
|------|------|-------------|
| Phase 28e (CI) | `circular` script + dead-code | 33b makes the underlying tools work; Phase 28e CI still composes them |
| Phase 15 | scripts/schemas validation | 33h handles the schema shape fix (Phase 15 build-guard depends on schemas being correct first) |
| SUGGESTIONS-LOG-DNDAPP (entire "Future ideas" + "Design gotchas" sections) | Every entry | Absorbed into the 8 sub-phases above; log entries cleared |
