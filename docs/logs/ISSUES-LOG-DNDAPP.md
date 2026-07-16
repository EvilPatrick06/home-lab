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

### [2026-07-15] AI DM session-history log keyed by per-message UTC date — evening sessions west of UTC file under tomorrow's date and split at 00:00 UTC

- **Category:** bug
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** scheduled error scan — followed up the resolved chat-transcript UTC-header bug (RESOLVED-ISSUES-DNDAPP 2026-07-15) to check for the same class elsewhere

**Description:**
The AI DM's per-session memory log is keyed by `const sessionId = new Date().toISOString().slice(0, 10)` — the **UTC** calendar date — computed fresh **per message** in `ai-service.ts` (~line 1273, message append path) and again in `generateSessionSummary()` (~line 1600). `memory-manager.appendSessionLog(sessionId, …)` writes to `session-history/<sessionId>.md`. Three consequences for a user west of UTC (the typical US evening D&D slot):

1. **Wrong date attribution:** a session played 7–11 pm MDT (01:00–05:00 UTC next day) files its entire log under tomorrow's date.
2. **Mid-session split:** a session that crosses 00:00 UTC (e.g. starts 5 pm MDT = 23:00 UTC) is silently split across two `session-history/*.md` files, because the id is recomputed on every message.
3. **Recap reads a partial log:** `listSessionLogDates()` sorts dates and the "Previously on…" session-start recap (`recap-context.ts` → `getSessionLog(latest date)`) consumes only the **latest** file — after a split, the recap is grounded on just the post-midnight tail of the previous session. `generateSessionSummary()` can likewise append the end-of-session summary under a *different* sessionId than the messages it summarizes.

This is exactly the UTC-vs-local class fixed on 2026-07-15 for the chat-transcript export header (commit bed62439), but in the main-process AI memory path.

**Reproduction (if bug):**
1. Set system TZ to e.g. America/Denver; start an AI DM session at 5:30 pm local (23:30 UTC).
2. Exchange messages past 6:00 pm local (00:00 UTC).
3. Observe `<campaign>/session-history/`: two files (`<day>.md`, `<day+1>.md`) for one session; the next session's recap only sees the second file.

**Expected behavior (if bug):** one session log per real session (or at least per LOCAL calendar date), stable for the whole sitting; the summary lands in the same log as its session's messages.

**Hypothesis / root cause:** `toISOString()` is UTC by definition, and the id is derived per call instead of once per session (e.g. at conversation open, or from local date parts like the transcript-header fix).

**Proposed fix / improvement:**
- [ ] Derive the session id once per app session/conversation open (cache it on the conversation or memory manager) instead of per message, so a sitting never splits.
- [ ] Use LOCAL date parts (`getFullYear/getMonth/getDate`, mirroring the chat-transcript-export.ts fix) for the id.
- [ ] Consider a one-time migration/merge is NOT needed (old files remain readable); just note the change in the memory docs.
- [ ] Unit test with fake timers + TZ override (same pattern as the transcript-header test added by dnd-resolver 2026-07-15) covering the 23:xx-UTC boundary.

**Blocked by:** none

**Related files:** `dnd-app/src/main/ai/ai-service.ts` (both `toISOString().slice(0, 10)` sites), `dnd-app/src/main/ai/memory/memory-manager.ts` (`appendSessionLog`, `getSessionLog`, `listSessionLogDates`), `dnd-app/src/main/ai/context/recap-context.ts`

**Related entries:** RESOLVED-ISSUES-DNDAPP [2026-07-15] "Chat transcript export: header date is UTC while message times are local" (same bug class, renderer side)


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

### [2026-07-15] Remaining UTC-date leaks in user-facing renderer spots — export filenames, Timeline milestone default, import/export dateStamp

- **Category:** bug
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** scheduled error scan — sweep for `toISOString().slice(0, 10)` after the transcript-header UTC fix

**Description:**
The 2026-07-15 fix made the chat-transcript **header** use the local date, but several sibling user-facing spots still stamp the **UTC** date, so for an evening session west of UTC they show tomorrow's date — and in the transcript case the filename now disagrees with the (fixed, local) header inside the file:

- `GameChatPanel.tsx` ~line 342: `chat-transcript-<UTC date>.md/json` download filename (mismatches the local header inside the exported file).
- `CombatLogPanel.tsx` ~line 313: `combat-log-<UTC date>.<ext>` download filename.
- `TimelineCard.tsx` lines ~27 and ~51: the **default date prefilled into a new campaign milestone** is the UTC date — an evening-created milestone defaults to tomorrow. This one is persisted user data, not just a filename.
- `services/io/import-export.ts` ~line 367: `dateStamp` used in export bundle naming.
- `ErrorBoundary.tsx` ~line 95: bug-report default filename (cosmetic).

**Reproduction (if bug):**
1. Set TZ to America/Denver, local time 8 pm on the 14th (02:00 UTC on the 15th).
2. Export a chat transcript → file `chat-transcript-2026-07-15.md` whose header reads `# Session — 2026-07-14`; add a Timeline milestone → date field prefilled `2026-07-15`.

**Expected behavior (if bug):** user-facing dates default to the LOCAL calendar date, consistent with the transcript header fix.

**Hypothesis / root cause:** same class as the resolved header bug — `toISOString()` is UTC; these call sites were written independently and were not covered by the header fix.

**Proposed fix / improvement:**
- [ ] Add a tiny shared `localDateStamp()` helper (local `getFullYear/getMonth/getDate`, zero-padded) and use it at all five sites.
- [ ] Optionally add a forbidden-patterns lint for `toISOString().slice(0, 10)` in renderer user-facing code to stop the class recurring (main-process machine-facing ids exempt as appropriate).

**Blocked by:** none

**Related files:** `dnd-app/src/renderer/src/components/game/bottom/GameChatPanel.tsx`, `dnd-app/src/renderer/src/components/game/sidebar/CombatLogPanel.tsx`, `dnd-app/src/renderer/src/pages/campaign-detail/TimelineCard.tsx`, `dnd-app/src/renderer/src/services/io/import-export.ts`, `dnd-app/src/renderer/src/components/ui/ErrorBoundary.tsx`

**Related entries:** RESOLVED-ISSUES-DNDAPP [2026-07-15] chat-transcript UTC header (same class); active entry above "AI DM session-history log keyed by per-message UTC date" (main-process sibling)

### [2026-07-15] DiceHistory log never auto-scrolls on new rolls — effect comment promises it but deps don't include the history

- **Category:** bug, UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** scheduled error scan — review of the v2.8.2 dice-stats feature surface

**Description:**
In `DiceHistory.tsx` the effect commented "Auto-scroll to bottom on new entries (log view only)" runs only on `[view]` (and before v2.8.2, only on mount — `[]`), so it fires when the user switches Log/Stats tabs but **never when a new roll arrives**. With the panel open during play, new rolls append below the fold and the log stays scrolled to older entries; the roll count in the header updates but the visible list doesn't follow. Longstanding (pre-dates the Stats tab); the v2.8.2 refactor kept the stale behavior and the now-misleading comment.

**Reproduction (if bug):**
1. Open the dice history panel; roll enough dice to overflow the scroll area.
2. Scroll to the bottom, then roll again several times.
3. Observed: the list does not scroll to reveal the new entries (only re-opening or switching tabs snaps to bottom).

**Expected behavior (if bug):** the log follows new entries (at least when already at/near the bottom — the usual chat-log convention to avoid yanking a user who scrolled up).

**Hypothesis / root cause:** effect deps are `[view]`; the effect body doesn't reference the history so neither biome's exhaustive-deps nor tests catch it.

**Proposed fix / improvement:**
- [ ] Depend on `filtered.length` (or last entry id) + `view`, and only snap when the user was already near the bottom (`scrollHeight - scrollTop - clientHeight < threshold`).
- [ ] Align the comment with the behavior.

**Blocked by:** none

**Related files:** `dnd-app/src/renderer/src/components/game/dice3d/DiceHistory.tsx`

**Related entries:** RESOLVED-ISSUES-DNDAPP [2026-07-03] dice-stats feature entry (surface this rode in on)


