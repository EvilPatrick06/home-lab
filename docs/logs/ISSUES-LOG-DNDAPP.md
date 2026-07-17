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

### [2026-07-17] Committed `pdf.worker.min.mjs` is pdfjs 6.0.227 but the lockfile pins pdfjs-dist 6.1.200 — every `npm ci` regenerates it and leaves the tree dirty; a build from a stale checkout would hit the pdfjs API/Worker version-match error

- **Category:** config
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated error scan — noticed `git status` dirty immediately after a clean `npm ci` in a fresh worktree of master @ `703d5f52`

**Description:**
`src/renderer/public/pdf.worker.min.mjs` is a COMMITTED copy of the pdfjs-dist worker, kept in sync by the postinstall copy step (`scripts/build/postinstall.mjs`). The committed copy self-identifies as **6.0.227**, but `package-lock.json` pins `pdfjs-dist` **6.1.200** (bumped by the grouped Dependabot PR #77, merged 2026-07-0x, which updated the lockfile without re-running postinstall and committing the regenerated worker). Two consequences: **(1)** every fresh `npm ci` (postinstall re-copies the 6.1.200 worker) leaves the working tree immediately dirty with a ~1MB minified diff — this trips every clean-tree assumption in the repo (agents diffing their worktrees pick up a file they never touched and can accidentally commit it on unrelated branches; scripts that refuse dirty trees refuse). **(2)** pdfjs-dist enforces an exact API↔Worker version match at runtime (`The API version … does not match the Worker version …`), so any build produced from a checkout where postinstall did NOT run (or a workflow that serves the committed file as-is) pairs a 6.1.200 API bundle with a 6.0.227 worker and PDF rendering throws.

**Reproduction (if bug):**
1. Fresh worktree of master → `cd dnd-app && npm ci` → `git status`.
2. Observed: `M src/renderer/public/pdf.worker.min.mjs` (4 hunks; committed file says 6.0.227, node_modules copy says 6.1.200; `cmp` differs at byte 820).

**Expected behavior (if bug):** A clean `npm ci` on a clean checkout leaves the tree clean; the committed worker (if it must be committed at all) matches the locked pdfjs-dist version.

**Hypothesis / root cause:** Dependabot PR #77 bumped `pdfjs-dist` 6.0.227→6.1.200 in package.json/lockfile only; nothing regenerates + commits the copied worker artifact, and no CI step asserts the committed copy matches the locked version. Committing a postinstall-generated artifact is inherently drift-prone.

**Proposed fix / improvement:**
- [ ] Preferred: stop committing the artifact — add `src/renderer/public/pdf.worker.min.mjs` to `.gitignore` (postinstall already materializes it for every dev/CI build; knip already ignores it by path).
- [ ] Otherwise: re-run `node scripts/build/postinstall.mjs` and commit the 6.1.200 worker now, and add a cheap CI guard (compare committed copy vs `node_modules/pdfjs-dist/build/pdf.worker.min.mjs`) so future pdfjs bumps cannot drift.

**Blocked by:** none

**Related files:** `dnd-app/src/renderer/public/pdf.worker.min.mjs`, `dnd-app/scripts/build/postinstall.mjs`, `dnd-app/package-lock.json`, `dnd-app/.gitignore`

**Related entries:** RESOLVED-ISSUES-DNDAPP postinstall-robustness entries (inline `node -e` → `postinstall.mjs`); Dependabot PR #77 (npm-deps group, 22 updates)


### [2026-07-17] AI DM session-history id is cached forever — `getSessionLogId()` never resets, so every sitting after the first (without an app restart) files under the FIRST sitting’s date

- **Category:** bug
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated error scan — review of the 2026-07-15 UTC-date fix (commit `6f827cd4`)

**Description:**
The 2026-07-15 fix derives the session-history log id ONCE from the LOCAL calendar date and caches it on the `MemoryManager` instance (`memory-manager.ts` ~307: `if (!this.sessionLogId) this.sessionLogId = localDateStamp()`). But managers are **per-campaign singletons cached in a module-level `Map` for the life of the main process** (`getMemoryManager()`, ~line 848), and `sessionLogId` is **never cleared** — not by `generateSessionSummary()` (`ai-service.ts` ~1600), not on a local-date change, not on campaign close. So if the Electron main process stays up across sittings (app left open for days, machine sleep/wake), a Tuesday sitting AND a Thursday sitting in the same campaign both append to `session-history/<tuesday>.md`; no `<thursday>.md` is ever created. Consequences: distinct sittings merge into one log file; the end-of-session summary of a later sitting lands under the first sitting’s date; `listSessionLogDates()` / session-start-recap “most recent session” logic reads a file mixing several sittings. This recreates the session-misattribution the fix was meant to remove, in the opposite direction (stale cache instead of UTC split).

**Reproduction (if bug):**
1. Launch the app; play an AI DM session in a campaign on day 1 (messages append to `session-history/<day1>.md`).
2. Leave the app running; return on day 3 and play another session in the same campaign.
3. Observed (by code path): `getSessionLogId()` returns the cached `<day1>` — day-3 messages + summary append to `<day1>.md`; no `<day3>.md`.

**Expected behavior (if bug):** Each sitting gets its own dated log; the id refreshes once a new sitting starts (new local day after inactivity, or after an end-of-session summary closed the previous sitting).

**Hypothesis / root cause:** Cache-without-invalidation: lazily-set `sessionLogId` + process-lifetime singleton managers. The unit tests added with the fix only assert stability across midnight WITHIN one sitting; nothing tests a second sitting.

**Proposed fix / improvement:**
- [ ] Clear `sessionLogId` at the end of `generateSessionSummary()` (a summary marks the sitting’s end), AND/OR refresh the id when the previous `appendSessionLog` was > N hours ago (sitting-gap heuristic, e.g. 6h), so multi-day uptime rolls over naturally.
- [ ] Add a fake-timer test: sitting on day 1 → summary → advance 2 days → new message → id is day 3, and `<day3>.md` is created.

**Blocked by:** none

**Related files:** `dnd-app/src/main/ai/memory/memory-manager.ts`, `dnd-app/src/main/ai/ai-service.ts`

**Related entries:** RESOLVED-ISSUES-DNDAPP [2026-07-15] “AI DM session-history log keyed by per-message UTC date” (this is the follow-on gap in that fix)


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

*(none currently logged)*

### [2026-07-03] dnd-app/mobile Dependabot lightningcss 1.30.1 -> 1.31.1 breaks Metro bundle (react-native-css AST deserialize) — RESOLVED (declined + pinned)

- **Category:** dependency / build
- **Severity:** medium
- **Domain:** dnd-app (mobile)
- **Discovered by:** integrator (scheduled)
- **During:** integrator run 2026-07-03 — Dependabot review of PR #62

**Description:**
Grouped Dependabot PR #62 (`dependabot/npm_and_yarn/dnd-app/mobile/npm-deps-32554d31cb`) bumped `lightningcss` 1.30.1 -> 1.31.1 in `/dnd-app/mobile` (direct devDependency + the `overrides` pin). CI red on `check` (mobile CI) and `mobile-npm-audit`. Two layered problems: (1) the committed `package-lock.json` was out of sync with `package.json` (`npm ci` -> `Missing: typescript@5.9.3 from lock file`, exit 1) — same class as the 2026-06-29 entry; and (2) the underlying bump is genuinely **breaking**.

**Root cause:**
`npm install` cleanly reconciles the lockfile (16/12 line delta) and `lint`, `tsc --noEmit`, and `expo config` all pass. But the **bundle smoke** (`npx expo export:embed`) fails:
`global.css: failed to deserialize; expected an object-like struct named Specifier, found ()` thrown from `react-native-css/dist/commonjs/compiler/compiler.js`. `react-native-css@3.0.7` (its latest published version) consumes lightningcss's native serialized CSS AST; lightningcss 1.31.1 changed that serialization format, so the compiler cannot deserialize `global.css`. react-native-css's declared peer `lightningcss >=1.27.0` is too loose — 1.31.1 satisfies the range but is runtime-incompatible. No newer react-native-css exists to accommodate 1.31.1. This is exactly the NativeWind/lightningcss build-only breakage the mobile bundle-smoke gate was added to catch.

**Resolution (fix-forward, this run):**
- Declined the bump — kept the existing `lightningcss` 1.30.1 pin (package.json dependency + override). master unaffected.
- Added a scoped `ignore: lightningcss` under the `/dnd-app/mobile` npm ecosystem in `.github/dependabot.yml` so Dependabot stops re-opening this breaking PR each week. Merged to master this run.
- Closed PR #62 as won't-merge (breaking), branch left for Dependabot to clean up.

**Follow-up (optional, for the dnd-app resolver):** revisit when `react-native-css` publishes a release compatible with lightningcss >=1.31; then drop the ignore rule and let the pin float forward.

**Related files:** `.github/dependabot.yml`, `dnd-app/mobile/package.json`, `dnd-app/mobile/package-lock.json`, `.github/workflows/dnd-app-mobile-ci.yml`

**Related entries:** PR https://github.com/EvilPatrick06/home-lab/pull/62 ; prior lockfile-sync entry [2026-06-29].

## Low

### [2026-07-17] knip dead-code baseline red again — root knip scans `mobile/` + embed/bridge entry points missing from `knip.json`, so `npm run dead-code` exits 1 and the CI gate can never ratchet to blocking

- **Category:** config, debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated error scan (ran `npm run dead-code` on master @ `703d5f52`)

**Description:**
`npm run dead-code` (knip) exits **1**: `Unused files (47)` + `Unused devDependencies (1) dotenv` + config hint `dpdm — Remove from ignoreDependencies` (known false-positive; keep it). Three distinct causes: **(a)** the whole Expo `mobile/` tree (34 files — `mobile/app.config.ts`, `mobile/App.tsx`, `mobile/src/**`, `mobile/scripts/**`) is reported unused. `mobile/` is a separate npm project with its own lockfile and CI (`dnd-app-mobile-ci.yml`) and is unreachable from the desktop entry graph by design — it should be excluded from the root knip project (e.g. `"ignore": ["mobile/**"]`) rather than swell the baseline. **(b)** The embed/web-bridge chain is not declared as entries: `src/web/main.embed.tsx` (the `vite.embed.config.ts` / `index.embed.html` entry), `src/web/bridge-api.ts`, `src/web/bridge-transport.ts`, `src/web/install-embed-api.ts`, `src/shared/bridge/{index,methods}.ts`, and the runtime-registered service worker `src/renderer/public/sw.js`. `knip.json` lists `src/web/main.web.tsx` but not the embed twin. CAUTION: some of these may be genuinely dead — the 2026-07-15 WEB QA report already flagged the orphaned uvtt converter as the 2nd auto-save.ts-pattern occurrence — so apply the documented drop-one-entry audit per file, not a blanket exemption. **(c)** `dotenv@^17` is an unused devDependency: grep finds no import/require of `dotenv` anywhere in `src/`, `scripts/`, or the configs (likely a leftover from the removed `.env.signing` / `sign.mjs` path) — drop it. Same class as RESOLVED [2026-06-24] “knip baseline dirty again: 4 unlisted binaries”: each time the baseline goes red, the stated intent to flip the CI `Dead code (knip)` step from `continue-on-error: true` to blocking is deferred again, and real new dead code (the class QA keeps finding by hand) sails through CI unnoticed.

**Reproduction (if bug):**
1. `cd dnd-app && npm ci && npm run dead-code`
2. Observed: exit 1, `Unused files (47)`, `Unused devDependencies (1) dotenv`.

**Expected behavior (if bug):** exit 0 on a clean baseline, so the CI step can be made blocking.

**Hypothesis / root cause:** `knip.json` predates the `mobile/` tree and the embed build target; no ignore/entry was added when they landed. `dotenv` orphaned by the signing-path removal (see RESOLVED entry on `sign.mjs`).

**Proposed fix / improvement:**
- [ ] Add `"mobile/**"` to `knip.json` `ignore` (or make mobile its own knip workspace).
- [ ] Audit each flagged non-mobile file with the drop-one-entry procedure: genuinely live → add a documented `entry` (embed chain, `sw.js`); genuinely dead → delete the module.
- [ ] Remove `dotenv` from devDependencies (verify no dynamic loading first).
- [ ] Once exit 0: flip the CI knip step to blocking per the dnd-app-ci.yml comment.

**Blocked by:** none

**Related files:** `dnd-app/knip.json`, `dnd-app/package.json`, `.github/workflows/dnd-app-ci.yml`, `dnd-app/src/web/main.embed.tsx`, `dnd-app/src/renderer/public/sw.js`

**Related entries:** RESOLVED-ISSUES-DNDAPP [2026-06-24] knip baseline (unlisted binaries); RESOLVED-ISSUES-DNDAPP [2026-06-29] knip entry-exception rationale audit; WEB-QA-report-2026-07-15 (uvtt orphan)

### [2026-07-17] Flaky test: `src/main/updater.test.ts > registers IPC handlers without throwing` times out at 15s under a loaded host, passes in isolation in 138ms

- **Category:** test
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated error scan (full `npm test` on master @ `703d5f52` on bmo)

**Description:**
Full-suite `npm test` on bmo: `Tests 1 failed | 8407 passed` — `updater.test.ts:82` “registers IPC handlers without throwing” hit the 15s per-test timeout. Re-run in isolation (`npx vitest run src/main/updater.test.ts`): 12/12 pass in 138ms. NOTE: this scan ran the suite concurrently with knip/tsc/audit on the same host, so the load was partly self-inflicted — but a >100x headroom collapse (138ms → >15s) on a hot host is the same load-sensitive-flake class as the RESOLVED [2026-06-22] `CharacterSheet5ePage` / `bmo-bridge` flakes, and the suite’s 335s wall time on bmo makes such collisions likely for any agent running checks in parallel. The test dynamically imports `./updater` (which pulls `electron-updater`) inside the test body, so the heavy import cost lands inside the 15s test budget instead of setup.

**Reproduction (if bug):**
1. On a loaded host: `cd dnd-app && npm test` while other node processes compete for CPU.
2. Observed once: `Error: Test timed out in 15000ms` at `updater.test.ts:82`.

**Expected behavior (if bug):** Suite green regardless of host load, or the import cost excluded from the per-test budget.

**Hypothesis / root cause:** Speculation: the `await import('./updater')` + `await import('electron')` in the test body pay module-graph transform/import cost inside the test timeout; under CPU contention that exceeds 15s. Not a product bug.

**Proposed fix / improvement:**
- [ ] Hoist the dynamic imports to `beforeAll` (setup budget) or a top-level import, or give this one test a larger explicit timeout like the prior flake fixes.

**Blocked by:** none

**Related files:** `dnd-app/src/main/updater.test.ts`

**Related entries:** RESOLVED-ISSUES-DNDAPP [2026-06-22] CharacterSheet5ePage 15s timeout on bmo; [2026-06-22] bmo-bridge rate-limit flake (same load-sensitive class)

### [2026-07-17] `localDateStamp()` duplicated: private copy in `memory-manager.ts` + renderer `utils/local-date.ts` — belongs in `src/shared/utils`

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated error scan — review of the 2026-07-15 UTC-date fix (commit `6f827cd4`)

**Description:**
The 2026-07-15 fix added two byte-for-byte-equivalent implementations of `localDateStamp()`: a private function in `src/main/ai/memory/memory-manager.ts` (~line 33) and the exported `src/renderer/src/utils/local-date.ts` used by 6 renderer call sites. `src/shared/utils/` exists precisely for helpers needed by both processes. Two copies invite drift (e.g. one side later gains a timezone override and the session-history ids stop matching user-facing export dates).

**Proposed fix / improvement:**
- [ ] Move `localDateStamp()` (and its test) to `src/shared/utils/local-date.ts`; import from both `memory-manager.ts` and the renderer sites; delete the two copies.

**Blocked by:** none

**Related files:** `dnd-app/src/main/ai/memory/memory-manager.ts`, `dnd-app/src/renderer/src/utils/local-date.ts`, `dnd-app/src/shared/utils/`

**Related entries:** Medium entry above [2026-07-17] session-history id cached forever (same commit under review)


