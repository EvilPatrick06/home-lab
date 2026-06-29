# Issues Log — dnd-app

> **Active dnd-app bugs / tech debt / broken config — Electron VTT issues only.**
> Sibling logs:
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - dnd-app future ideas / design gotchas / observations → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO future ideas / design gotchas / observations → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
> - Resolved dnd-app entries → [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md)
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Routing:** Bug / debt / config / perf / test failure scoped to `dnd-app/` (TS/React/Electron/Vite/biome/vitest/Pixi/peerjs/the 5e JSON content set) → here. `Domain: both` cross-cutting entries → mirror in BOTH `BMO-ISSUES-LOG.md` AND this file (small duplication is intentional; one fix removes both copies).

New entries go at the TOP of their severity section (newest first within each section).

---

# Active Issues

> **2026-06-10 — Backlog consolidated.** All previously-open entries became
> the numbered phase plans under [`../dnd-app/docs/phases/`](../dnd-app/docs/phases/) (start at [`PHASE-INDEX.md`](../dnd-app/docs/phases/PHASE-INDEX.md)); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new dnd-app issues
> below as they appear.

## Critical

*(none currently logged)*

## High

### [2026-06-28] dnd-app CI red on `auto/dnd-phase-executer` — asset-url refactor strips leading `./`, breaks remote-sounds tests

- **Category:** bug / ci / test
- **Severity:** high (branch CI red; blocks phase-executer integration)
- **Domain:** dnd-app
- **Discovered by:** ci-failure-triage (automated)
- **During:** hourly CI failure triage
- **Failing run:** 28337449659 (2026-06-28T22:02Z) — job `check`, step `Tests` (`npm test` -> `vitest run`)
- **Branch / commit:** `auto/dnd-phase-executer` @ ffadb1bb ("style(web): biome import-sort autofix for phase 55 asset-url consumers")

**Description / root cause:**
The phase-55 asset-url consumer refactor routes sound paths through the new asset-url resolver, which normalizes a leading `./` to `/`. `resolveSoundUrl()` now returns `/sounds/...` where the contract (and tests) expect a non-manifest / bundled path to pass through **unchanged**. 3 failures in `dnd-app/src/renderer/src/services/library/remote-sounds.test.ts`:
- "returns the bundled path unchanged before prewarm" (line 57): expected `./sounds/ambient/tavern.mp3`, received `/sounds/ambient/tavern.mp3`
- "returns the path unchanged for clips NOT in the manifest" (line 85): expected `./sounds/dice/d20-1.mp3`, received `/sounds/dice/d20-1.mp3`
- "falls back to the path unchanged when the manifest fetch fails (unreachable Pi)"

**Fix needed (domain decision):**
Either (a) make `resolveSoundUrl`/`resolveAssetUrl` preserve a leading `./` for passthrough/bundled clips (only rewrite manifest-matched clips to the cached `file://` or live Pi URL), or (b) if the `./`->`/` normalization is intended, update `remote-sounds.test.ts` expectations. Prefer (a) — the tests encode the intended "unchanged passthrough" contract for non-manifest/bundled clips. Owner: dnd-phase-executer / dnd-app domain.

### [2026-06-28] dnd-app CI red on `auto/dnd-phase-executer` — biome lint (unused imports + organizeImports) on phase-56 commit

- **Category:** ci / lint
- **Severity:** high (branch CI red; blocks phase-executer integration)
- **Domain:** dnd-app
- **Discovered by:** ci-failure-triage (automated)
- **During:** hourly CI failure triage
- **Failing run:** 28337378722 (2026-06-28T21:59Z) — job `check`, step `Lint (biome)` (`npm run lint` -> `biome check src/`), exit code 1
- **Branch / commit:** `auto/dnd-phase-executer` @ 848d893a ("feat(web): phase 56 — html lang/dir tracking, slider theming, branding")

**Description / root cause:**
`biome check src/` fails on three FIXABLE findings:
- `src/renderer/src/utils/storage-migrations.test.ts:1` — `lint/correctness/noUnusedImports` (unused `beforeEach` and others imported from `vitest`)
- `src/renderer/src/components/game/map/MapCanvas.tsx:2` — `assist/source/organizeImports` (new `resolveAssetUrl` import not sorted)
- `src/renderer/src/components/game/map/map-canvas/use-map-background.ts:1` — `assist/source/organizeImports`

**Fix needed:**
Run `biome check --write src/` (a.k.a. `npm run lint -- --write`) in `dnd-app/` to apply the safe organizeImports fixes, and remove the unused `vitest` imports in `storage-migrations.test.ts`; commit on `auto/dnd-phase-executer` and re-run CI. Owner: dnd-phase-executer / dnd-app domain.

### [2026-06-28] dnd-app CI red on `auto/play-store-prep` — biome `useTemplate` on protocol.ts (stale branch, 24 behind master)

- **Reported by:** ci-failure-triage (automated)
- **Category:** ci / lint
- **Severity:** high (branch CI persistently red; blocks play-store-prep merge)
- **Failing runs:** 28333588596 (latest 2026-06-28T19:34Z) — also prior 28331757659 / 28331635552 / 28331551197 / 28331393711
- **Branch / commit:** `auto/play-store-prep` @ 5380b527 (1 ahead / 24 BEHIND origin/master)

**Root cause:**
Job `check` step `Lint (biome)` (`npm run lint` -> `biome check src/`) fails with two `lint/style/useTemplate` errors in `dnd-app/src/shared/bridge/protocol.ts`:
- `protocol.ts:61` — `out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + ==` (string concatenation; biome wants a template literal)
- `protocol.ts:64` — `out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + B64_CHARS[(n >> 6) & 63] + =`
Both are FIXABLE. The branch is 24 commits behind origin/master and the equivalent fixes already landed on master (master dnd-app CI is green), so this is a stale-branch lint, not a new regression.

**Fix needed:**
Merge `origin/master` into `auto/play-store-prep` (brings in the existing fix and the other 24 commits), OR apply the two-line biome `useTemplate` fix on `protocol.ts:61,64` (wrap the concatenations in template literals, e.g. `` `${B64_CHARS[(n>>18)&63] + B64_CHARS[(n>>12)&63]}==` ``) and re-run `npm run lint`. Owner: play-store-prep agent / dnd-app domain.

*(none currently logged)*

## Medium

## Low

### [2026-06-28] Generated-artifact drift on master — README test-file count (852→856) and IPC-SURFACE.md channel catalog (238→241) are stale

- **Category:** config, docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** autonomous dnd-app error scan (static + generator dry-runs; full `npm test` suite was green: 857 files / 8306 tests, and `tsc` web+node + `validate:content` + `lint:forbidden` all clean)

**Description:**
Two committed, generated/synced doc artifacts have silently drifted out of sync with the source they are derived from. Neither generator is gated by `dnd-app-ci.yml`, so master stays green while the docs are wrong. This is the concrete materialization of the gap predicted in SUGGESTIONS-LOG-DNDAPP.md `[2026-06-25] dnd-app CI omits the doc/i18n drift guards…`.

1. **`dnd-app/README.md` test-file count is stale.** Line 157 reads `Current baseline: **852 test files**…`. `node scripts/build/sync-doc-counts.mjs --check` reports DRIFT; running the sync rewrites it to `**856 test files**` (root `README.md` `[\d,]+ test files` drifts the same way). `sync-doc-counts --check` exits 1.
2. **`dnd-app/docs/IPC-SURFACE.md` channel catalog is stale.** Header says `Total: **238** channel strings`; regenerating with `node scripts/build/gen-ipc-surface.mjs` produces `**241**` and adds three channels missing from the committed doc: `FILE_OPEN_REQUEST` (`file:open-request`), `FILE_CONSUME_PENDING` (`file:consume-pending`), and `BOOK_SAVE_BYTES` (`book:save-bytes`).

**Reproduction:**
1. `cd dnd-app`
2. `node scripts/build/sync-doc-counts.mjs --check` → exits 1, "2 doc count(s) drifted" (the dnd-app README + root README test-file counts).
3. `node scripts/build/gen-ipc-surface.mjs` then `git diff docs/IPC-SURFACE.md` → shows 238→241 and the three added channel rows.

**Expected behavior:** Committed README test-file count and IPC-SURFACE channel catalog match the source of truth (the vitest test-file glob and `IPC_CHANNELS` respectively).

**Hypothesis / root cause:** `IPC_CHANNELS` gained `file:open-request`, `file:consume-pending`, `book:save-bytes` and ~4 test files were added, but neither `npm run gen:ipc-surface` nor `npm run sync:doc-counts` was re-run/committed afterward. Because `dnd-app-ci.yml` runs neither `sync:doc-counts --check` nor any IPC-surface drift check (confirmed: not present in the workflow), the drift never tripped CI — exactly the silent-drift scenario the 2026-06-25 suggestion warned about (and `gen:ipc-surface` still has no `--check` mode).

**Proposed fix / improvement:**
- [ ] Run `npm run sync:doc-counts` and `npm run gen:ipc-surface` in `dnd-app/` and commit the regenerated `README.md` (root + dnd-app) and `docs/IPC-SURFACE.md`.
- [ ] (Prevention — see related suggestion) add `sync:doc-counts -- --check` and an IPC-surface `--check` to `dnd-app-ci.yml` so this cannot recur.

**Related files:** `dnd-app/README.md` (line 157), `README.md`, `dnd-app/docs/IPC-SURFACE.md`, `dnd-app/scripts/build/sync-doc-counts.mjs`, `dnd-app/scripts/build/gen-ipc-surface.mjs`, `dnd-app/src/shared/**` (`IPC_CHANNELS` source)

**Related entries:** SUGGESTIONS-LOG-DNDAPP.md `[2026-06-25] dnd-app CI omits the doc/i18n drift guards that check:full defines, and gen:ipc-surface has no --check mode`
