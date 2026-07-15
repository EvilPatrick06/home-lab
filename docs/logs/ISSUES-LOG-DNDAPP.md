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

### [2026-07-15] sync:doc-counts CI gate is drifted on master (86 vs 92 bmo pytest files) — next dnd-app push goes red

- **Category:** config
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** scheduled dnd-app error scan 2026-07-15 (ran every repo guard script against master `9748d383`)

**Description:**
`npm run sync:doc-counts -- --check` (a blocking step in `dnd-app-ci.yml`, line 63) currently FAILS on master: root `README.md` says "86 pytest files" and `bmo/README.md` says "full suite (86 test files)", but `bmo/pi/tests` now contains **92** `test_*.py` files. dnd-app CI is path-filtered to `dnd-app/**` + `bmo/pi/data/5e/**` + the workflow file, so the bmo-only commits that added the tests never ran this gate — the drift landed silently and will instead fail the **next** push that touches `dnd-app/**` (any resolver/phase `auto/*` branch or master push), red through no fault of its own change.

**Reproduction (if bug):**
1. `cd dnd-app && node scripts/build/sync-doc-counts.mjs --check` on master `9748d383`
2. Observed: `DRIFT in README.md for /[\d,]+ pytest files/` + `DRIFT in bmo/README.md for /full suite \([\d,]+ test files\)/`, exit 1.

**Expected behavior (if bug):** the check passes on master; doc counts stay in sync with the tree.

**Hypothesis / root cause:** the 2026-07-04 bmo status-board fixes (`5133f66b`, `82a2ad2f`, `6c9b8991` and siblings) added 6 pytest files under `bmo/pi/tests/` without running `npm --prefix dnd-app run sync:doc-counts`. Structural cause: the gate asserts counts over **bmo** files but only runs on **dnd-app** path changes, so cross-domain drift is invisible until an unrelated dnd-app push detonates it.

**Proposed fix / improvement:**
- [ ] Run `npm --prefix dnd-app run sync:doc-counts` and commit the regenerated README.md + bmo/README.md counts (86 → 92).
- [ ] Structural: either add `bmo/pi/tests/**` (and the synced README paths) to `dnd-app-ci.yml` push/pull_request path filters, or move the bmo-count assertions out of the dnd-app gate into a bmo-side check, so the domain that causes the drift is the one that goes red.

**Blocked by:** none

**Related files:** `dnd-app/scripts/build/sync-doc-counts.mjs`, `.github/workflows/dnd-app-ci.yml`, `README.md`, `bmo/README.md`

**Related entries:** SUGGESTIONS-LOG-DNDAPP "extend sync:doc-counts --check" future-idea (same script).

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

### [2026-07-15] sync-doc-counts.mjs: 3 agent-count regexes no longer match anything (silently inert)

- **Category:** config, docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** scheduled dnd-app error scan 2026-07-15

**Description:**
`node dnd-app/scripts/build/sync-doc-counts.mjs --check` warns `NO MATCH` for three sites: `/\b\d+ AI-agent roles\b/` in `bmo/README.md`, `/\b\d+ specialized AI agents\b/` in `bmo/docs/AGENTS.md`, and `/\b\d+ AI agents\b/` in `bmo/pi/README.md`. The prose in those docs was reworded (e.g. bmo/README.md now says "5 specialized AI agents", not "N AI-agent roles"), so the agent-count auto-sync for those docs is dead code — the counts there can silently drift and the script only warns, it does not fail.

**Expected behavior (if bug):** every sync site either matches its doc or is removed/updated, so agent-count edits propagate everywhere.

**Hypothesis / root cause:** doc rewording landed without updating the regex list in `sync-doc-counts.mjs`; NO MATCH is warn-level by design so nothing went red.

**Proposed fix / improvement:**
- [ ] Update the three regexes to the current phrasing (or delete sites for phrases that no longer exist).
- [ ] Consider promoting NO MATCH to a failure in `--check` mode so stale sites can't accumulate.

**Blocked by:** none

**Related files:** `dnd-app/scripts/build/sync-doc-counts.mjs`, `bmo/README.md`, `bmo/docs/AGENTS.md`, `bmo/pi/README.md`

**Related entries:** [2026-07-15] sync:doc-counts CI gate drifted on master (same script, this run).

### [2026-07-15] Chat transcript export: header date is UTC while message times are local — wrong session date for evening exports

- **Category:** bug
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** scheduled dnd-app error scan 2026-07-15 (review of the v2.8.2 chat-transcript-export feature)

**Description:**
`exportChatTranscriptMarkdown()` builds the header as `# Session — ${new Date().toISOString().slice(0, 10)}` (UTC calendar date) but renders each message time with `getHours()`/`getMinutes()` (local time). For any user west of UTC exporting during an evening session (the typical D&D slot), the header shows **tomorrow's** date relative to the local times listed under it — e.g. a 20:30 EST export on July 14 is titled `# Session — 2026-07-15` with messages stamped `(20:30)`.

**Reproduction (if bug):**
1. Set system TZ to `America/New_York`, system clock 20:30 on 2026-07-14.
2. Export a chat transcript (GameChatPanel → export Markdown).
3. Observed: header `# Session — 2026-07-15`; message lines show local times from the evening of the 14th.

**Expected behavior (if bug):** header date and message timestamps use the same clock (local), so the title matches the session's actual local date.

**Hypothesis / root cause:** `toISOString()` is UTC by definition; the local-time `timeFor()` helper and the UTC date label were written independently in `chat-transcript-export.ts`.

**Proposed fix / improvement:**
- [ ] Derive the label from local date parts (e.g. `getFullYear/getMonth/getDate`, or `toLocaleDateString('en-CA')`) — mirror whatever `combat-log-export.ts` does for consistency.
- [ ] Add a unit test with a mocked TZ/clock covering the evening-west-of-UTC case.

**Blocked by:** none

**Related files:** `dnd-app/src/renderer/src/services/io/chat-transcript-export.ts`, `dnd-app/src/renderer/src/services/io/chat-transcript-export.test.ts`

**Related entries:** none

