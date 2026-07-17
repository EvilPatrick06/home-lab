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

### [2026-07-17] UVTT importer ignores `resolution.map_origin` — cropped Dungeondraft exports would import with every wall/door/light offset from the image

- **Category:** bug
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** scheduled error scan of the dnd-app tree (review of the 2026-07-03 UVTT converter)

**Description:**
`parseUvtt()` in `src/renderer/src/services/io/uvtt.ts` reads `resolution.pixels_per_grid` and `resolution.map_size` but never reads `resolution.map_origin`. In the Universal VTT format `map_origin` is "usually 0" (per the Arkenforge format description) but is NON-zero when a tool exports a cropped/selected region — Dungeondraft emits the crop's world-space origin there while `line_of_sight` / `objects_line_of_sight` / `portals` / `lights` coordinates stay in world grid units. Established importers subtract it (e.g. FoundryVTT's dd-import computes `(point - map_origin) * pixels_per_grid`). Because `parseUvtt()` copies `a.x/a.y` (and portal `bounds`, light `position`) straight into `WallSegment`/`LightSource` grid coordinates, any file with a non-zero `map_origin` imports with the whole wall/door/light layer displaced by `map_origin` grid cells relative to the background image (which is always drawn from 0,0). `uvtt.test.ts` (11 tests) only ever uses `map_origin: { x: 0, y: 0 }`, so the gap is uncovered.

**Reproduction (if bug):**
1. In Dungeondraft, export a *selected region* (not the full map) as `.dd2vtt` — the file gets a non-zero `resolution.map_origin`.
2. Run the file through `parseUvttString()`.
3. Observed (by code inspection): wall/door/light coordinates keep their absolute values; the image data-url has no offset — everything LOS-related is shifted by `map_origin` cells off the artwork.

**Expected behavior (if bug):** walls, portals, and lights land on the drawn geometry — i.e. `x - map_origin.x`, `y - map_origin.y` applied to every parsed point.

**Hypothesis / root cause:** `map_origin` simply unhandled in `parseUvtt()`; the UVTT "spec" page doesn't state the reference frame explicitly (only "usually 0"), so the crop/world-coordinate behavior above is inferred from Dungeondraft exports + the Foundry importer convention — verify against a real cropped `.dd2vtt` before/while fixing (flagged as partly speculative).

**Proposed fix / improvement:**
- [ ] Subtract `map.resolution.map_origin` (default `{0,0}`) from every parsed wall endpoint, portal bound, and light position in `parseUvtt()`.
- [ ] Add a unit test with a non-zero `map_origin` fixture asserting the shift (and that round-trip export re-emits origin `{0,0}` with rebased coordinates).

**Blocked by:** none — but note the converter is currently orphaned dead code (no DMMapEditor wiring yet, per the 2026-07-15 WEB QA report), so today's user impact is nil; this becomes a silent map-corruption bug the moment the deferred "Import map file…" integration lands. Fix before/with that wiring.

**Related files:** `dnd-app/src/renderer/src/services/io/uvtt.ts`, `dnd-app/src/renderer/src/services/io/uvtt.test.ts`

**Related entries:** RESOLVED-ISSUES-DNDAPP [2026-07-02] Universal VTT import/export (PARTIAL — converter only); ISSUES-LOG-DNDAPP [2026-07-17] knip baseline (uvtt orphan note)

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

### [2026-07-17] Shared game timer counts wall-clock by `setInterval` ticks — Electron background throttling pauses/slows it, and each multiplayer peer drifts independently

- **Category:** bug
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** scheduled error scan of the dnd-app tree (renderer interval audit)

**Description:**
The DM turn/game timer is tick-based: `TimerOverlay.tsx` runs `setInterval(tickTimer, 1000)` and `stores/game/timer-slice.ts` decrements `timerSeconds` by 1 per callback. Two consequences: **(a)** the main `BrowserWindow` does not set `backgroundThrottling: false` (checked `src/main/index.ts` webPreferences), so when the DM minimizes/occludes the window Chromium throttles hidden-page timers (and applies intensive throttling — ~1 wake/min — once hidden >5 min); the countdown then effectively pauses instead of tracking wall-clock, and a "2:00" timer can take far longer than 2 minutes of real time. **(b)** In multiplayer the host sends a single `dm:timer-start {seconds}` (`use-game-network.ts:66`) and every client then ticks *locally*, so peers drift apart from each other and from the host by their own throttling/jitter. Contrast: `WebSearchApprovalPrompt`'s `Countdown` does this correctly — it stores a deadline timestamp and recomputes `deadline - Date.now()` each tick, so throttling only affects display refresh, never correctness.

**Reproduction (if bug):**
1. Start a 2-minute timer (TimerModal), minimize the app for a minute.
2. Restore — the remaining time is (well) more than `120 - 60` seconds; with the window hidden >5 min the timer barely advances.
3. In a 2-peer session, compare the two overlays after a few minutes — the displayed values disagree.

**Expected behavior (if bug):** the timer tracks wall clock regardless of window visibility, and all peers show (approximately) the same remaining time.

**Hypothesis / root cause:** decrement-per-callback treats `setInterval` as a reliable 1 Hz clock; it isn't under Chromium timer throttling. Root fix is deadline-based state: store `timerEndsAt = Date.now() + seconds*1000` (host also broadcasting the deadline, not the duration) and derive `timerSeconds` from `Math.ceil((timerEndsAt - Date.now())/1000)` on each render tick.

**Proposed fix / improvement:**
- [ ] Change `timer-slice.ts` to store an absolute `timerEndsAt` (keep `timerSeconds` as a derived display value for compatibility).
- [ ] `TimerOverlay` interval recomputes from `Date.now()` (pattern already in `WebSearchApprovalPrompt.Countdown`).
- [ ] Broadcast the deadline (or start-timestamp + duration) in `dm:timer-start` so late/throttled peers converge.
- [ ] Unit test: mock `Date.now()` forward 30 s across a single tick → display drops 30 s, not 1 s.

**Blocked by:** none

**Related files:** `dnd-app/src/renderer/src/stores/game/timer-slice.ts`, `dnd-app/src/renderer/src/components/game/overlays/TimerOverlay.tsx`, `dnd-app/src/renderer/src/hooks/use-game-network.ts`, `dnd-app/src/main/index.ts`

**Related entries:** [2026-07-17] TimerOverlay progress bar hardcodes a 120 s denominator (same component; fix together)

### [2026-07-17] TimerOverlay progress bar hardcodes a 120 s denominator — any timer over 2 minutes shows a pinned-full bar (the 5-minute preset ships in TimerModal)

- **Category:** UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** scheduled error scan of the dnd-app tree (renderer interval audit)

**Description:**
`TimerOverlay.tsx` renders the progress bar width as `(timerSeconds / 120) * 100`%. The starting duration is user-chosen — `TimerModal.tsx` offers 30 s / 1 m / 2 m / **5 m** presets and `effect-actions.ts` / chat commands can start arbitrary durations — but the bar always assumes a 120 s total. A 300 s timer computes 250% → visually clamped by `overflow-hidden` to a full, motionless bar for the first 3 minutes, then drains over the final 2; a 30 s timer starts at 25% instead of full. The denominator should be the timer's initial duration (not currently stored in `timer-slice.ts` — only the live `timerSeconds` is).

**Reproduction (if bug):**
1. TimerModal → 5 m preset → start.
2. Observed: bar sits at 100% (no motion) until 2:00 remains; also never starts full for sub-2-minute timers.

**Expected behavior (if bug):** bar starts full and drains linearly to 0 over the chosen duration.

**Hypothesis / root cause:** `120` was the assumed default duration when the overlay was written; the slice never records the starting duration, so the component had nothing else to divide by.

**Proposed fix / improvement:**
- [ ] Add `timerTotalSeconds` to `timer-slice.ts` (set in `startTimer`, cleared in `stopTimer`).
- [ ] `width: min(100, timerSeconds / timerTotalSeconds * 100)%`.
- [ ] Fold into the deadline-based refactor in the sibling entry (same files, one PR).

**Blocked by:** none

**Related files:** `dnd-app/src/renderer/src/components/game/overlays/TimerOverlay.tsx`, `dnd-app/src/renderer/src/stores/game/timer-slice.ts`, `dnd-app/src/renderer/src/components/game/modals/utility/TimerModal.tsx`

**Related entries:** [2026-07-17] Shared game timer counts wall-clock by `setInterval` ticks (same component; fix together)

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


