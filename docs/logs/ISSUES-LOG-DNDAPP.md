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

*(none currently logged)*

## Medium

### [2026-06-24] conditions.ts: failed/null 5e load permanently breaks getConditions5e/getBuffs5e (no null-guard, no retry)

- **Category:** bug
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated error scan (vitest stderr surfaced `Cannot read properties of null (reading 'filter')` from `conditions.ts:31`)

**Description:**
`ensureLoaded()` in `src/renderer/src/data/conditions.ts` builds `_initPromise = load5eConditions().then((all) => { _conditions = all.filter(...).map(mapEntry); _buffs = all.filter(...).map(mapEntry) })` with **no guard for `all` being `null`**. `loadJson()` (`src/renderer/src/services/data-provider/index.ts`, ~line 145) is *deliberately documented* to resolve `null` on any remote-library miss/error AND when the bundled IPC bridge is unavailable, expecting callers to "fall through to their empty/default handling." conditions.ts does not: a null result makes `all.filter` throw, so `_initPromise` becomes a **permanently-rejected** promise. Because `ensureLoaded` only rebuilds the promise when `!_initPromise`, every later `getConditions5e()` / `getBuffs5e()` re-`await`s the same rejected promise and re-throws — **no reset-on-failure, no retry for the rest of the session**. The module-level bootstrap catches the *first* rejection (logs + shows an error toast), but the per-call accessors keep failing and the legacy sync exports (`CONDITIONS_5E`/`BUFFS_5E`) stay empty. The `_conditions!` / `_buffs!` non-null assertions would also yield runtime nulls if the promise ever resolved without populating. Contrast `skills.ts`, which catches the same null and degrades to an empty array.

**Reproduction (if bug):**
1. Cause `load5eConditions()` to resolve `null` once (Pi remote miss + bundled `conditions` data file missing/unreadable, or any non-DOM context — reproduced in the vitest `node` env where `window.api.game.loadJson` is absent: `ActionModal.test.tsx` logs it).
2. Observe `[ERROR] Failed to load conditions data TypeError: Cannot read properties of null (reading 'filter')` + an error toast.
3. Every subsequent `getConditions5e()` / `getBuffs5e()` rejects; conditions/buffs are empty for the whole session with no retry.

**Expected behavior (if bug):** a null/failed load degrades gracefully (empty arrays, retry on next access) like `skills.ts` — not a permanent hard failure for the session.

**Hypothesis / root cause:** `ensureLoaded` (a) doesn't null-guard `all`, and (b) caches `_initPromise` even on rejection so it never retries — a contract mismatch with `loadJson`'s intentional null-return.

**Proposed fix / improvement:**
- [ ] Null-guard: `const all = (await load5eConditions()) ?? []` before filtering.
- [ ] Reset `_initPromise = null` on failure so a later call retries.
- [ ] Drop the `_conditions!`/`_buffs!` non-null assertions; return `?? []`.

**Related files:** `src/renderer/src/data/conditions.ts`, `src/renderer/src/services/data-provider/index.ts`, `src/renderer/src/data/skills.ts`

### [2026-06-23] Cloud-sync residual: book config/PDFs not synced; binary re-hashed each reconcile

> _dnd-resolver 2026-06-24: approved but deferred this run - the manifest-diff + book-file sync is feature-sized work left for a focused effort (see SUGGESTIONS-LOG note)._

- **Category:** debt
- **Severity:** low
- **During:** user-accounts / cloud-sync feature

**Description:**
The sync engine now covers ALL user-data domains (`src/renderer/src/services/sync/domains.ts`): characters, campaigns, bastions, custom-creatures, homebrew, shop-templates, map-library, **settings** (device-local/secret stripped; theme+accessibility applied on pull), **game-state**, **ai-conversations**, **bans**, **book-data**, and the binary **image-library** + **audio** (packed container, byte-cached). Two residual gaps: (1) book CONFIG + custom PDF files aren't synced — only per-book bookmarks/annotations are, so custom-book notes re-attach only if the same PDF is re-imported with the same id (core books are fine). (2) Each reconcile re-serializes + re-hashes every entity; binary bytes are cached (no re-read) but still re-hashed every cycle — a manifest-diff that skips unchanged entities via a cheap metadata change-key would cut reconcile cost for large libraries.

## Low

### [2026-06-24] knip dead-code baseline dirty again: 4 unlisted binaries make `npm run dead-code` exit 1

- **Category:** config, debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated error scan (ran `npm run dead-code` / `npx knip`)

**Description:**
`npm run dead-code` (knip) exits **1**. Output: `Unlisted binaries (4)` — `which` (`scripts/smoke/headless-boot.mjs`), `nvidia-smi` / `taskkill` / `pkill` (`src/main/ai/ollama-manager.ts`) — plus a config hint `dpdm — Remove from ignoreDependencies`. These are spawned **system** binaries, not dead code, but `knip.json` has no `ignoreBinaries`, so the gate fails. The CI step `Dead code (knip)` is `continue-on-error: true` and `check:full` doesn't fail on it, so this is currently silent — but it defeats the stated intent (the dnd-app-ci.yml comment "dead-code runs non-blocking until the knip baseline is clean" + the 2026-06-22 RESOLVED suggestion "make `npm run dead-code` fail CI once the backlog is clear"): the baseline can never reach exit 0 / become enforceable while these binaries are unignored. The `dpdm` hint is a knip **false-positive** — `dpdm` IS used (invoked by path in `scripts/check-circular.mjs:49`), so it must stay in `ignoreDependencies`; do not act on that hint.

**Hypothesis / root cause:** `knip.json` lacks an `ignoreBinaries` entry for the system tools spawned via `execFile`/`spawn` in `ollama-manager.ts` (`nvidia-smi`/`taskkill`/`pkill`) and `headless-boot.mjs` (`which`).

**Proposed fix / improvement:**
- [ ] Add `"ignoreBinaries": ["which", "nvidia-smi", "taskkill", "pkill"]` to `dnd-app/knip.json`.
- [ ] Re-run `npm run dead-code` to confirm exit 0; then consider flipping the CI `Dead code (knip)` step to blocking.

**Related files:** `dnd-app/knip.json`, `.github/workflows/dnd-app-ci.yml`, `src/main/ai/ollama-manager.ts`, `scripts/smoke/headless-boot.mjs`


> dnd-app future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app issues: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
