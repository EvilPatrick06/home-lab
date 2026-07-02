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

### [2026-06-29] dnd-app/mobile Dependabot npm-deps bump fails `npm ci` — package-lock.json out of sync with package.json

- **Category:** config
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** Claude Code (ci-failure-triage)
- **During:** hourly CI-failure triage — caught NEW failed runs 28361279932 + 28361282816

**Description:**
The grouped Dependabot branch `dependabot/npm_and_yarn/dnd-app/mobile/npm-deps-ac88f8a546` (HEAD `b6ef2973`) fails the **dnd-app mobile CI** workflow at the `setup-node-project` step. `npm ci` aborts because the committed `dnd-app/mobile/package-lock.json` does not match the bumped `package.json`: npm reports dozens of `Missing: ... from lock file` packages, e.g. `typescript@5.9.3`, `react-native-worklets@0.8.3`, and the `@babel/*@7.29.7` toolchain (`@babel/core`, `@babel/preset-typescript`, `@babel/helper-compilation-targets`, transform plugins, etc.). `npm ci` requires the lockfile and manifest to be perfectly in sync and will not write the lockfile, so it exits 1.

**Reproduction (if bug):**
1. Check out `dependabot/npm_and_yarn/dnd-app/mobile/npm-deps-ac88f8a546` (commit `b6ef2973`).
2. `cd dnd-app/mobile && npm ci`.
3. Observed: `npm error Missing: typescript@5.9.3 from lock file` (+ many more) → exit code 1; CI red on both run 28361279932 and 28361282816.

**Expected behavior (if bug):** Dependabot's group bump should update `package-lock.json` alongside `package.json` so `npm ci` installs cleanly and CI passes.

**Hypothesis / root cause:** Dependabot regenerated `dnd-app/mobile/package.json` for the grouped `npm-deps` update but the committed lockfile was not fully regenerated for the new transitive tree (the new `@babel/*@7.29.7` + `typescript@5.9.3` + `react-native-worklets@0.8.3` resolutions are absent from `package-lock.json`). Not a build/breaking-change failure — purely a lockfile-sync mismatch. Confined to the Dependabot branch; master is unaffected.

**Proposed fix / improvement:**
- [ ] `cd dnd-app/mobile && npm install` (NOT `npm ci`) on the Dependabot branch to regenerate `package-lock.json`, then commit the lockfile to the branch — or close the PR and let Dependabot recreate it with a synced lock.
- [ ] Confirm none of the grouped bumps (`typescript@5.9.3`, `react-native-worklets@0.8.3`, `@babel/*@7.29.7`) are major/breaking before merge; if a major bump is in the group, that part is a human decision (per AUTOMATED-AGENT-GIT-WORKFLOW Rule 3B).
- [ ] Re-run dnd-app mobile CI; merge via the integrator once green.

**Blocked by:** Owned by the integrator's Dependabot-PR review path (AUTOMATED-AGENT-GIT-WORKFLOW Rule 3B). ci-failure-triage did not commit to the Dependabot branch (not its branch; Dependabot may rebase/force-push it).

**Related files:** `dnd-app/mobile/package-lock.json`, `dnd-app/mobile/package.json`, `.github/actions/setup-node-project`

**Related entries:** CI runs https://github.com/EvilPatrick06/home-lab/actions/runs/28361279932 , https://github.com/EvilPatrick06/home-lab/actions/runs/28361282816

**Integrator review [2026-06-29, integrator]:** Reviewed under Rule 3B. Lockfile is *not* the real blocker — `cd dnd-app/mobile && npm install` regenerates `package-lock.json` cleanly (1210 pkgs, exit 0) and biome lint passes. After the regen, `tsc --noEmit` fails with **one** breaking error: `app.config.ts(27,3): error TS2353: 'splash' does not exist in type 'ExpoConfig'`. This grouped bump is a **full Expo SDK major upgrade** — `expo ~56.0.12`, `@expo/config-types ^56.0.6`, plus `typescript ~6.0.3` and `@babel/core ^8.0.1` (all majors). The `splash` failure is a real Expo-config migration (top-level `splash` was removed from `ExpoConfig`; it now lives under the `expo-splash-screen` config plugin). **Disposition: held for manual review** (major/breaking SDK upgrade = human decision, not a mechanical fix-forward). Branch left in place; not merged, not deleted. To adopt: regenerate the lockfile, migrate `app.config.ts` `splash` → `expo-splash-screen` plugin config, then re-run dnd-app mobile CI. Surfaced to Gavin via the board this run.


## Low

### [2026-07-02] mobile `_shared` sync copy has actually drifted — `ipc-channels.ts` missing 5 channels added to desktop `src/shared`

- **Category:** config
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** autonomous dnd-app error scan — diffed `src/shared/` against `mobile/src/_shared/` at v2.7.1 (`248d37b1`)

**Description:**
`mobile/src/_shared/` (the committed sync copy generated by `mobile/scripts/sync-shared.mjs`) is now genuinely stale, not just unguarded: `mobile/src/_shared/ipc-channels.ts` is missing five channels present in `src/shared/ipc-channels.ts` — `FILE_OPEN_REQUEST`, `FILE_CONSUME_PENDING` (OS `.dndvtt` file-association handlers), `CAMPAIGN_VERSIONS`, `CAMPAIGN_RESTORE_VERSION` (campaign version history), and `BOOK_SAVE_BYTES`. The sync script only runs as part of the mobile `build:embed` script (or the manual `sync-shared` script), so desktop-side `src/shared` changes from the recent version-history / file-association / book work never propagated. Impact today is latent — nothing under `mobile/src/` outside `_shared/` imports `ipc-channels` yet — but the copy is generated-and-committed ("Generated — do not edit") and is now lying about the IPC surface it mirrors.

**Reproduction (if bug):**
1. `diff -rq dnd-app/src/shared dnd-app/mobile/src/_shared` (ignore `*.test.ts` / `README.md`)
2. Observed: `Files src/shared/ipc-channels.ts and mobile/src/_shared/ipc-channels.ts differ` — 5 channel constants absent on the mobile side.

**Expected behavior (if bug):** The committed `_shared` copy matches its source whenever `master` is green — regenerating it produces no diff.

**Hypothesis / root cause:** `sync-shared.mjs` is only invoked from the mobile `build:embed` npm script; no desktop-side build/CI step or drift `--check` runs it, so any `src/shared` change made without a mobile embed build (the normal case for desktop-focused agents) strands the copy. Same root cause as the [2026-06-28] SUGGESTIONS-LOG-DNDAPP entry proposing a drift guard — this entry records that the predicted drift has now actually happened.

**Proposed fix / improvement:**
- [ ] Run `node mobile/scripts/sync-shared.mjs` and commit the refreshed `mobile/src/_shared/` copy.
- [ ] (Per the existing suggestion) add a `--check` mode wired into dnd-app CI so the copy can never silently diverge again.

**Blocked by:** none. (LOG-ONLY scan — app code not modified.)

**Related files:** `dnd-app/mobile/src/_shared/ipc-channels.ts`, `dnd-app/src/shared/ipc-channels.ts`, `dnd-app/mobile/scripts/sync-shared.mjs`, `dnd-app/mobile/package.json`

**Related entries:** SUGGESTIONS-LOG-DNDAPP [2026-06-28] "`mobile/src/_shared/` is a committed sync copy of `src/shared/` with no `--check` drift guard"

### [2026-07-02] autosave quota-eviction path ignores IndexedDB — can orphan IDB snapshot bodies and drain the whole version manifest without freeing quota

- **Category:** bug
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** autonomous dnd-app error scan — reviewing the new IndexedDB autosave body store (`07fcfb6c`)

**Description:**
`performSave()` in `src/renderer/src/services/io/auto-save.ts` prefers IndexedDB for snapshot bodies and falls back to `persistSnapshotWithEviction()` (localStorage + oldest-first eviction) when IDB is unavailable or a put throws. The eviction loop, however, removes old bodies with a raw `localStorage.removeItem(...)` only — unlike `removeSnapshot()` (used by `trimVersions()`), it never calls `idbDeleteSnapshot()`. If IDB worked for earlier saves (bodies live in IDB, not localStorage) and then fails mid-session, the fallback loop: (1) frees zero localStorage quota per iteration because the evicted versions have no localStorage body, (2) keeps draining until the entire version manifest is emptied — destroying all restore metadata, (3) leaves every IDB-resident body orphaned forever (keys are never listed/GCed elsewhere), and (4) still fails the save, toasting "device storage is full" even though the real problem was an IDB failure. Edge case in practice (Chromium renderer IDB rarely fails after having worked), so severity low — but the failure mode is destructive: it deletes the user's entire autosave history metadata in one tick.

**Reproduction (if bug):**
1. Run the app with autosave on; let several snapshots persist via IndexedDB (default path).
2. Make `idbPutSnapshot` throw (e.g. simulate IDB outage) while localStorage is near quota so the fallback `setItem` also throws QuotaExceededError.
3. Observed: eviction loop walks the full manifest removing only localStorage keys (which do not exist for IDB-resident bodies), persists an empty version list, orphans the IDB bodies, and the save still fails.

**Expected behavior (if bug):** Eviction removes each evicted version's body from BOTH backends (i.e. use `removeSnapshot()`), and a fallback triggered by an IDB failure should not interpret "removing localStorage keys freed nothing" as license to erase the whole manifest.

**Hypothesis / root cause:** `persistSnapshotWithEviction()` predates the IDB body store and was left localStorage-only when `07fcfb6c` moved bodies to IndexedDB; `removeSnapshot()` was taught about both backends but the eviction loop kept its raw `localStorage.removeItem`.

**Proposed fix / improvement:**
- [ ] Use `removeSnapshot(campaignId, oldest.id)` inside the eviction loop instead of raw `localStorage.removeItem`.
- [ ] Optionally cap eviction (stop once no localStorage key was actually removed in an iteration) so an IDB-outage fallback cannot wipe the full manifest.
- [ ] Optionally add an orphan sweep: on startup, delete IDB snapshot keys not referenced by any campaign manifest.

**Blocked by:** none. (LOG-ONLY scan — app code not modified.)

**Related files:** `dnd-app/src/renderer/src/services/io/auto-save.ts` (persistSnapshotWithEviction, removeSnapshot, performSave), `dnd-app/src/renderer/src/services/io/autosave-snapshot-store.ts`

**Related entries:** none

### [2026-06-29] chunk-index build is non-deterministic — `createdAt: new Date().toISOString()` makes every regeneration a noise diff

- **Category:** debt, config
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** autonomous dnd-app error scan — ran `node scripts/build/build-chunk-index.mjs` against the committed index

**Description:**
`dnd-app/scripts/build/build-chunk-index.mjs:280` stamps the output with `createdAt: new Date().toISOString()`. Re-running `npm run build:index` on a clean checkout therefore produces a diff in the committed `dnd-app/resources/chunk-index.json` **even when no source content changed** — I verified all 5383 chunks (ids, content, headingPath, keywords, tokenEstimate) are byte-identical between the committed index and a fresh regeneration; the **only** difference is the `createdAt` timestamp (`2026-06-17T02:15:02.694Z` committed vs the regen wall-clock). Because the build embeds wall-clock time, the index is not reproducible and cannot be byte-verified against its sources. There is currently no CI freshness gate for the index (release.yml regenerates it but nothing diffs it), so this does not fail CI today — it is latent churn / a missed-verifiability gap, not an active break.

**Expected behavior:** Regenerating the index from unchanged sources yields a byte-identical file (deterministic build), so a future index-freshness `--check` gate becomes possible and regeneration never produces a spurious one-line diff.

**Hypothesis / root cause:** The generator records its own run time in the artifact instead of deriving the timestamp from content/source mtime (or omitting it) — the same non-determinism pattern that would defeat any reproducible-build or index-freshness check.

**Proposed fix / improvement:**
- [ ] Drop `createdAt`, or derive it deterministically (e.g. max source-file mtime, or a content hash) so unchanged sources regenerate byte-identically.
- [ ] Optionally add a `build:index -- --check` drift gate (mirroring `gen:ipc-surface --check` / `sync:doc-counts --check`) once the output is deterministic.

**Blocked by:** none. (LOG-ONLY scan — app code not modified.)

**Related files:** `dnd-app/scripts/build/build-chunk-index.mjs` (~line 280), `dnd-app/resources/chunk-index.json`
