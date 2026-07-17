# Issues Log — dungeon-scholar

> **Active dungeon-scholar bugs / tech debt / broken config — Vite/React D&D-themed study app issues only.**
> Sibling logs:
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - dungeon-scholar future ideas / design gotchas / observations → [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)
> - dnd-app future ideas / design gotchas / observations → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO future ideas / design gotchas / observations → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - Resolved dungeon-scholar entries → [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Routing:** Bug / debt / config / perf / test failure scoped to `dungeon-scholar/` (Vite/React/Vitest study app, the per-tome run/quiz/lab content set, the Supabase auth wiring) → here. `Domain: both` cross-cutting entries → mirror in any other relevant issue log; small duplication is intentional.

New entries go at the TOP of their severity section (newest first within each section).

---

# Active Issues

> **2026-06-10 — Backlog consolidated.** All previously-open entries (the Phase 27
> remainder: H1–H5/H7, M2–M7/M10/M12/M13, plus the L/F entries from the suggestions
> log) became the numbered phase plans under `dnd-app/docs/phases/` (start at `PHASE-INDEX.md`); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new dungeon-scholar issues below as they
> appear.

## Critical

*(none currently logged)*

## High

### [2026-06-29] PHASE-05 implementation (`auto/scholar-phase-executer`) won't integrate — 83 commits stale across an App.jsx god-file refactor

- **Category:** integration / tech-debt
- **Severity:** high
- **Domain:** dungeon-scholar
- **Discovered by:** integrator
- **During:** daily branch consolidation

**Description:**
The `auto/scholar-phase-executer` branch (head `1b3c00ed`) is a genuine, unmerged implementation of **PHASE-05** (interaction recovery, themed `TextInputModal`, Oracle payload + copy, import-warning toast, exam-prediction services). It does **not** merge into current `master`: the merge-base is `605e712f` (~83 master commits behind), and `master` has since landed a **god-file extraction refactor of `dungeon-scholar/src/App.jsx`** that removed/relocated most of App.jsx's named imports (e.g. `WEEKLY_QUEST_POOL`, `encodeTomeShareCode`, `formatDuration`, `generateTomeId`, `normalizeTomeData`, `summarizeRunHistory`, `computeExamPace`, `computeExamPrediction`, `computeMilestones/RetentionCurve`). The branch is built on the **old** App.jsx import graph and adds new logic on top of it, so the merge conflicts irreconcilably in `src/App.jsx` and `src/features/library/LibraryScreen.jsx` (plus a stale `PHASE-INDEX.md` that still shows 03–05 and predates master's PHASE-06/07).

**Root cause:** branch base diverged from `master` by a major structural refactor; the executer's PHASE-05 diff targets a file layout that no longer exists on master. The integrator cannot safely hand-resolve the import graph without high risk of breaking Dungeon Scholar CI.

**Proposed fix / improvement (re-execute, do NOT hand-merge):**
- [ ] Have the **scholar-phase-executer** re-run **PHASE-05** from a **fresh `origin/master`** worktree (`-B auto/scholar-phase-executer origin/master` per AUTOMATED-AGENT-GIT-WORKFLOW.md), re-targeting the import-warning toast + exam-prediction wiring onto master's **already-refactored** App.jsx structure, and re-deriving the `PHASE-INDEX.md` status row from current master (which now also has PHASE-06/07).
- [ ] The stale `auto/scholar-phase-executer` branch has been **left in place** (not merged, not deleted); the executer's `-B` reset will supersede it on its next run. PHASE-05's plan is preserved on master, so no work is lost.

**Related files:** `dungeon-scholar/src/App.jsx`, `dungeon-scholar/src/features/library/LibraryScreen.jsx`, `dungeon-scholar/docs/phases/PHASE-05-interaction-recovery-dialogs-oracle-copy.md`, `dungeon-scholar/docs/phases/PHASE-INDEX.md`


## Medium

### [2026-07-17] Devotion calendar preview ignores streak-freeze wards — shows "Streak broken / Day 1" then the claim awards a different day's reward

- **Category:** bug, UX
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (review of the 2026-07-15 issue-streak-freeze-wards resolver batch, commit `8ee516e9`)

**Description:**
`CalendarScreen.jsx` previews the next claim with `computeNextClaim(today, lastClaimedDate, streak)` and comments that it "Shares computeNextClaim with the actual claim path (17E) so preview <-> claim never diverge" — but the actual claim path no longer matches. Since `8ee516e9` (issue-streak-freeze-wards), `claimDailyReward` (`usePlayerActions.js` ~L335-397) additionally consults `evaluateStreakFreeze` and, when the player missed exactly one day while holding a ward, overrides the reset: streak continues (`loginStreak + 1`) and the ward is spent. `computeNextClaim` and `devotionStatus` (both in `services/devotion.js`) know nothing about wards, so for a ward-holding player with a 2-day gap the calendar shows all of the following wrong: the banner reads "Streak broken — start anew at Day 1" (a ward guarantees continuation), the 7-day grid highlights Day 1 as next, and the previewed reward (Day 1: 30 gold / 10 XP) differs from what the claim actually pays out (e.g. Day 5: 150 gold / 75 XP + item). The Current Streak stat also shows the pre-forgiveness value with no hint a ward will preserve it. The claim itself behaves correctly — only every pre-claim surface lies.

**Reproduction (if bug):**
1. Have `loginStreak: 4`, `streakFreezeTokens: 1`, `lastClaimedDate` = day-before-yesterday (gap of exactly 2).
2. Open the Devotion Calendar (`CalendarScreen`).
3. Observed: banner says "Streak broken — start anew at Day 1", Day 1 tile is highlighted as next.
4. Press "Claim Today's Devotion".
5. Observed: ward is spent, streak becomes 5, Day 5 reward (150 gold / 75 XP / foresight scroll) is granted — not the previewed Day 1 reward.

**Expected behavior (if bug):** the preview and the claim agree. With a held ward and a one-day lapse the calendar should indicate the streak will be preserved (e.g. "A ward will shatter to preserve thy streak — Day 5 awaits"), highlight the actual next cycle day, and show that day's reward.

**Hypothesis / root cause:** the 2026-07-15 fix wired `evaluateStreakFreeze` only into the write path (`claimDailyReward`); the read paths (`computeNextClaim`, `devotionStatus`, and their `CalendarScreen` call sites) were not updated, breaking the 17E "single decision source for preview and claim" invariant the code comment still asserts.

**Proposed fix / improvement:**
- [ ] Teach the pure layer about wards: e.g. extend `computeNextClaim(today, lastClaimedDate, currentStreak, freezeTokens)` (or add a wrapper in `dailyGoal.js`/`devotion.js`) that applies the same forgiveness rule as `claimDailyReward`, and have BOTH `claimDailyReward` and `CalendarScreen` consume it — restoring one decision source.
- [ ] Add a `willUseWard` flag to `devotionStatus` (or a new status like `'preserved'`) so the banner copy can say a ward will be spent instead of "Streak broken".
- [ ] Unit tests: preview cycleDay/streak equals claim result for the gap-2-with-ward case; banner status for ward-holding lapse.

**Blocked by:** none

**Related files:** `dungeon-scholar/src/features/progression/CalendarScreen.jsx` (~L16-18, L120-126, L154-157), `dungeon-scholar/src/features/player/usePlayerActions.js` (~L335-397), `dungeon-scholar/src/services/devotion.js` (`computeNextClaim`, `devotionStatus`), `dungeon-scholar/src/services/dailyGoal.js` (`evaluateStreakFreeze`)

**Related entries:** RESOLVED-ISSUES-DUNGEON-SCHOLAR.md 2026-07-15 batch item "Streak-freeze wards were display-only" (the fix that introduced the divergence)


## Low

### [2026-07-17] Two parallel "days between YYYY-MM-DD strings" helpers with divergent edge semantics — `devotion.dayDiff` (local, Infinity) vs `dailyGoal.daysBetween` (UTC, null) — both run in the same claim flow

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (review of the devotion/daily-goal claim flow)

**Description:**
`services/devotion.js` exports `dayDiff(a, b)` (parses `` `${a}T00:00:00` `` in LOCAL time, returns `Infinity` for missing input) and `services/dailyGoal.js` exports `daysBetween(a, b)` (parses `` `${a}T00:00:00Z` `` in UTC, returns `null` for non-string/invalid input). Both compute the calendar-day gap between two local `YYYY-MM-DD` strings, and since the 2026-07-15 ward fix BOTH run on the same pair of dates inside one operation: `claimDailyReward` -> `evaluateClaim` -> `computeNextClaim` -> `dayDiff`, and `claimDailyReward` -> `evaluateStreakFreeze` -> `daysBetween`. Today the two implementations agree for well-formed inputs (`Math.round` absorbs DST skew in the local variant), but the duplicated logic with different timezone bases and different missing-input sentinels is exactly the drift class the S22 consolidation (`utils/date.js` as canonical date-helper home) was created to eliminate — a future edit to one (say, accepting Date objects, or changing the sentinel) silently desynchronizes the streak-continuation and ward-forgiveness decisions that must stay in lockstep (see the related preview-divergence bug logged today).

**Hypothesis / root cause:** the 2026-07-03 features batch added `dailyGoal.js` with its own private `daysBetween` instead of reusing/relocating `devotion.dayDiff`; S22 consolidated `todayDateStr` into `utils/date.js` but never covered the day-diff helpers.

**Proposed fix / improvement:**
- [ ] Move one canonical `dayDiff(a, b)` into `src/utils/date.js` (pick one timezone base; UTC parse of plain dates is the simpler-correct one for pure calendar math), with an explicit documented sentinel for invalid input.
- [ ] Re-export/consume it from `devotion.js` and `dailyGoal.js` (same pattern as the existing `todayDateStr` re-export); delete the private copies.
- [ ] Keep both modules' existing tests passing against the shared impl.

**Blocked by:** none

**Related files:** `dungeon-scholar/src/services/devotion.js` (`dayDiff`), `dungeon-scholar/src/services/dailyGoal.js` (`daysBetween`), `dungeon-scholar/src/utils/date.js`

**Related entries:** ISSUES-LOG-DUNGEON-SCHOLAR.md [2026-07-17] "Devotion calendar preview ignores streak-freeze wards" (same flow); RESOLVED-ISSUES-DUNGEON-SCHOLAR.md [2026-06-22] "No shared src/utils/ module — date, shuffle, and duration helpers are duplicated across files" (S22)


### [2026-07-17] oracle-worker: `max_tokens` clamp has no floor — negative/fractional client values are forwarded to Groq verbatim

- **Category:** bug
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (oracle-worker request-handling review)

**Description:**
`oracle-worker/src/worker.js:270` clamps the client-requested output budget with `Math.min(Number(body.max_tokens) || 1000, MAX_OUTPUT_TOKENS)`. The clamp only bounds the TOP: any truthy negative or fractional number passes through — `max_tokens: -5` → `Math.min(-5, 2048)` = `-5`, `max_tokens: 0.5` → `0.5` — and is forwarded to Groq, which rejects non-positive/non-integer values with a 400. The request still consumed a Durable-Object rate-limit slot (counters increment before the Groq call) and the client sees only the generic "Upstream error", so a malformed caller burns quota and gets an unhelpful diagnostic instead of a 400 from our own input validation, where every other malformed-input case (non-string content, oversized payload) is already rejected.

**Reproduction (if bug):**
1. POST to the worker from the allowed origin with a valid messages array and `"max_tokens": -5`.
2. Worker forwards `max_tokens: -5` to Groq.
3. Observed: Groq 400 → worker replies `{ error: "Upstream error" }` with status 400; the DO per-IP/global counters were already incremented.

**Expected behavior (if bug):** invalid `max_tokens` is normalized (or rejected with a specific 400) before the upstream call, like the other input caps — e.g. `Math.min(Math.max(1, Math.floor(Number(body.max_tokens) || 1000)), MAX_OUTPUT_TOKENS)`.

**Hypothesis / root cause:** the clamp was written to bound COST (upper bound) and the lower/integer bound was never considered because the app's own frontend always sends a sane integer.

**Proposed fix / improvement:**
- [ ] Floor + integer-coerce the value: `Math.min(Math.max(1, Math.floor(n)), MAX_OUTPUT_TOKENS)` with the existing `|| 1000` default.
- [ ] (Optional) reject non-numeric `max_tokens` types with the same `Invalid request.` 400 used for non-string content.

**Blocked by:** none

**Related files:** `oracle-worker/src/worker.js` (line 270)

**Related entries:** none

### [2026-07-17] oracle-worker: Groq upstream `fetch` is not wrapped in try/catch — a network throw returns a CORS-less 500 the browser cannot read

- **Category:** bug
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (oracle-worker request-handling review)

**Description:**
`oracle-worker/src/worker.js:273` calls `await fetch(GROQ_URL, …)` with no try/catch. `fetch` REJECTS (rather than resolving with `!ok`) on network-level failures — DNS failure, TLS error, connection reset, upstream timeout. The rejection propagates out of the exported `fetch` handler, so the Workers runtime replies with a generic `500 Internal Server Error` that carries NO `Access-Control-Allow-Origin` header. The browser client therefore sees an opaque CORS failure instead of a readable error body, and the failure mode is indistinguishable (client-side) from a misconfigured worker. The non-ok path directly below (`if (!groqResponse.ok)`) already handles this class of problem properly — generic message, CORS headers, upstream status — but only for failures that produce an HTTP response. Same gap applies to `groqResponse.json()` on a malformed upstream body (`worker.js:296`).

**Reproduction (if bug):**
1. Make Groq unreachable from the worker (e.g. simulate a DNS/connect failure in a local `wrangler dev` run).
2. POST a valid Oracle request from the allowed origin.
3. Observed: runtime 500 with no CORS headers → the frontend's fetch rejects with a TypeError (CORS), not a readable `{ error }` JSON.

**Expected behavior (if bug):** network-level upstream failures return the same shape as HTTP upstream failures: `corsJson(allowedOrigin, { error: "Upstream error" }, 502)`.

**Hypothesis / root cause:** the upstream error handling was designed around `groqResponse.ok` (HTTP-level failures); the promise-rejection failure mode of `fetch` was never exercised because Groq has been reliably reachable.

**Proposed fix / improvement:**
- [ ] Wrap the upstream call + JSON parse in try/catch and return `corsJson(allowedOrigin, { error: "Upstream error" }, 502)` on throw.

**Blocked by:** none

**Related files:** `oracle-worker/src/worker.js` (lines 273–296)

**Related entries:** none

### [2026-07-17] oracle-worker RateLimiter DO: per-IP counter rows are never pruned — storage grows unboundedly with distinct client IPs

- **Category:** performance, debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (oracle-worker request-handling review)

**Description:**
The `RateLimiter` Durable Object (`oracle-worker/src/worker.js:78-155`) stores one row per distinct client IP (`ip:<ip>`) and resets the counters IN PLACE when the minute/day window rolls over — but nothing ever DELETES a row. Every IP that ever hits the Oracle leaves a permanent record in the DO's SQLite storage: no alarm, no TTL, no sweep. The same pattern exists in miniature in the per-isolate `isolateHits` Map (`worker.js:41-56`): per-IP timestamp arrays are filtered on access, but an IP's map entry is never evicted, so the Map grows monotonically for the isolate's lifetime. Growth is slow (bounded in practice by `globalPerDay: 2000` requests/day, so ≤ ~2000 new IP rows/day worst-case) and each row is tiny, so this is not an active problem — but it is unbounded by design, is invisible until it matters (Workers free-plan DO storage caps), and stale rows also make any future "list current limiters" debugging noisier.

**Hypothesis / root cause:** the DO was added to make counters durable across isolates/POPs; retention was never scoped because the window-rollover reset made rows LOOK self-cleaning (values reset, keys persist).

**Proposed fix / improvement:**
- [ ] Add a DO `alarm()` (e.g. daily) that iterates `storage.list({ prefix: "ip:" })` and deletes rows whose `dayWindow` is older than the current one.
- [ ] In `isolateBackstop`, delete the Map entry when the filtered hits array is empty.

**Blocked by:** none

**Related files:** `oracle-worker/src/worker.js` (lines 41–56, 78–155)

**Related entries:** none

### [2026-07-17] Comments in `vite.config.js` + `tsconfig.json` lost their backtick-quoted tokens at authoring — "Enable via  (v8 provider)", "keep  fast and green"

- **Category:** docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (config review)

**Description:**
Two config comments are missing the command token they reference, leaving grammatically broken guidance:
- `dungeon-scholar/vite.config.js:154-155` — "…continue-on-error so a dip reports without blocking yet. Enable via\n//  (v8 provider)." The enable-mechanism (presumably `npm run test:coverage` or the coverage flag) is simply absent.
- `dungeon-scholar/tsconfig.json:26` — "…deliberately kept out of the JSDoc typecheck to keep  fast and green" (double space where a token — presumably `npm run typecheck` — should be).

Both were introduced verbatim in commit `97138c8b` (2026-07-03, "chore(dungeon-scholar): resolve scholar debt/docs/test-org batch") — the corruption happened at authoring time, most likely a backtick-quoted token dropped when the comment text was pasted through a shell/tooling layer that ate the backticks and their content. Cosmetic, but these are exactly the comments a future contributor reads to learn how to run/tighten the gates.

**Hypothesis / root cause:** backtick-quoted strings inside the comment text were interpreted (command substitution) or stripped by the tooling the authoring agent used in `97138c8b`, leaving the surrounding words.

**Proposed fix / improvement:**
- [ ] Restore the missing tokens: "Enable via `npm run test:coverage` (v8 provider)." and "to keep `npm run typecheck` fast and green".
- [ ] Grep that commit's other comment additions for the same double-space/dangling-preposition signature.

**Blocked by:** none

**Related files:** `dungeon-scholar/vite.config.js` (lines 150–156), `dungeon-scholar/tsconfig.json` (line 26)

**Related entries:** none

### [2026-07-17] Vitest stderr noise: "KaTeX doesn't work in quirks mode" — happy-dom test document has no doctype, so KaTeX-rendering tests run in quirks mode

- **Category:** test
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (full vitest run, 2026-07-17 — 89 files / 960 tests green)

**Description:**
Every test file that renders KaTeX content (`src/components/RichContent.test.jsx`, `src/App.test.jsx`) emits `Warning: KaTeX doesn't work in quirks mode. Make sure your website has a suitable doctype.` on stderr. The happy-dom document Vitest creates has no `<!DOCTYPE html>`, so `document.compatMode` is `BackCompat` and KaTeX warns. Two costs: (a) the warnings are standing stderr noise that trains readers to ignore test stderr — the repo has previously used clean stderr as a signal (PromptModal `act()` warnings entry); (b) KaTeX genuinely lays out differently in quirks mode, so any future assertion about rendered math geometry/markup would be exercising a mode the production app (which has a proper doctype in `index.html`) never runs in. Tests currently pass — this is noise + latent-fidelity, not a failure.

**Reproduction (if bug):**
1. `npm run test` in `dungeon-scholar/`.
2. Observe the KaTeX quirks-mode warning in the stderr blocks of `RichContent.test.jsx` and `App.test.jsx`.

**Expected behavior (if bug):** test document standards mode matches production; no KaTeX warning.

**Hypothesis / root cause:** happy-dom initializes an empty document without a doctype and nothing in `src/test-setup.js` sets one.

**Proposed fix / improvement:**
- [ ] In `src/test-setup.js`, ensure a doctype before tests run (e.g. `document.implementation`-based doctype insert, or happy-dom's settings/`window.happyDOM` API, or render via a full `<!DOCTYPE html>` document template).
- [ ] Confirm the warning disappears from the vitest run.

**Blocked by:** none

**Related files:** `dungeon-scholar/src/test-setup.js`, `dungeon-scholar/src/components/RichContent.test.jsx`, `dungeon-scholar/src/App.test.jsx`

**Related entries:** [2026-06-28] PromptModal copy tests fire async copy outside `act()` (React warnings) — same "test stderr should stay clean" rationale (resolved log).


### [2026-07-15] oracle-worker Dependabot group PR #64 red — workers-types v4→v5 major bump breaks `npm ci` against wrangler 4.x peer range

- **Category:** config
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (CI status sweep of scholar-domain workflows)

> **2026-07-15 (scholar-resolver): GATED — posted to the board** (`issue-oracle-worker-workers-types`). `.github/dependabot.yml` already carries a deliberate "workers-types 4.x→5.x … deliberately NOT ignored here; it needs a maintainer decision" note for this exact knot, so the proposed ignore-hold is an owner call, not an auto-fix. Awaiting approve/deny on the board; PR #64 itself stays leave-for-manual per Rule 3B. Entry kept open.

> **2026-07-17 (scholar-errors):** the in-tree version knot itself is fixed forward — commit `091f5bf9` bumped oracle-worker to `wrangler ^4.107.1` + `@cloudflare/workers-types ^5` and a clean `npm ci` in `oracle-worker/` now succeeds (verified this run). PR #64 (stale lockfile) and the gated dependabot-ignore decision on the board remain the open halves.

**Description:**
`oracle-worker CI` is red on Dependabot PR **#64** (`build(deps-dev): bump the npm-deps group in /oracle-worker with 2 updates`, opened 2026-07-10; runs 29064958933 / 29064960187 fail in ~19s). The failing step is `./.github/actions/setup-node-project` → `npm ci` in `oracle-worker/`. Reproduced locally from `pull/64/head` (git archive → clean `npm ci`): the group bump takes `@cloudflare/workers-types` `^4.20260629.1` → **`^5.20260703.1` (a MAJOR bump inside a "deps-dev" group PR)** while also bumping `wrangler` `^4.105.0` → `^4.107.0`. `wrangler@4.107.0` declares `peerOptional @cloudflare/workers-types@"^4.20260701.1"`, so the PR lockfile is internally inconsistent and `npm ci` dies with `ETARGET — No matching version found for @cloudflare/workers-types@^4.20260701.1` (the 4.x peer target is not in the v5-updated lock). Typecheck/build/test steps never run.

**Hypothesis / root cause:** Dependabot grouped a major `workers-types` bump with a minor `wrangler` bump; wrangler 4.x still pins its optional peer to workers-types 4.x. Not an app-code problem — the PR itself is unmergeable as generated. Per AUTOMATED-AGENT-GIT-WORKFLOW.md Rule 3B this is correctly a leave-for-manual-review (major + red), but left un-diagnosed it will recur every weekly Dependabot run.

**Proposed fix / improvement:**
- [ ] Close/ignore the major half: add a Dependabot `ignore` (or `versions: [">=5"]` constraint) for `@cloudflare/workers-types` in `oracle-worker` until wrangler declares v5 peer support, so the group PR regenerates as the mergeable wrangler-only bump.
- [ ] Alternative: drop the standalone `@cloudflare/workers-types` devDep entirely and generate runtime types via `wrangler types` (Cloudflare-recommended for wrangler ≥3.66), removing the peer-range coupling for good.
- [ ] Re-check `oracle-worker/tsconfig.json` `types` after whichever path is taken.

**Blocked by:** upstream wrangler peer-range (if waiting for v5 support).

**Related files:** `oracle-worker/package.json`, `oracle-worker/package-lock.json`, `.github/workflows/oracle-worker-ci.yml`, `.github/actions/setup-node-project/action.yml`

**Related entries:** none (first oracle-worker dependency-CI entry in this log).

---

### [2026-06-29] `auto/scholar-phase-executer` won't merge — collides with already-merged scholar-resolver (App.jsx imports, LibraryScreen bulk-tag) + PHASE-INDEX status rows

- **Category:** integration / merge-conflict
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** integrator
- **During:** daily branch integration (2026-06-29 run)

**Description:**
The integrator merged `auto/scholar-resolver` into `master` cleanly first; `auto/scholar-phase-executer` (PHASE-03/04/05 implementation — interaction recovery, themed dialogs, Oracle payload & copy; tip `1b3c00ed`) then no longer merges cleanly against the updated `master`. Three conflicts, all because both branches edited the same regions:
  1. `dungeon-scholar/src/App.jsx` — import block. scholar-resolver trimmed/reordered imports; scholar-phase-executer adds a large new import set (`encodeTomeShareCode`, `formatDuration`, `generateTomeId`, `normalizeTomeData`/`normalizeTomeDataWithReport`, `summarizeRunHistory`, `migrateTutorialIndex`, `computeNextClaim`, `DAILY_REWARDS`, `dayDiff`, `evaluateClaim`, `computeExamPace`, `computeExamPrediction` + `PREDICTION_*` consts, `computeMilestones`, `computeRetentionCurve`). A naive resolution risks dead-import (now an **error** in `biome.json`) or missing-symbol breakage.
  2. `dungeon-scholar/src/features/library/LibraryScreen.jsx` — bulk-tag handler. Two **different** implementations of the same feature: master/scholar-resolver keeps the inline `window.prompt` path; scholar-phase-executer replaces it with a `PromptModal` (`setBulkTagOpen` / `confirmBulkTag`) — the PHASE-05 "replace native dialogs" intent. Reconciling is a UI-design decision (modal should win) and needs the modal state + JSX (added elsewhere on the executer branch) to land consistently.
  3. `dungeon-scholar/docs/phases/PHASE-INDEX.md` — status rows: master (scholar-phase-maker) lists 03-07 `pending`; executer marks 03/04/05 `done` with `./completed/` paths. (Trivial: take executer's done rows for 03-05, keep 06/07 pending.)

**Root cause:** Two scholar-domain branches (resolver + phase-executer) modified the same files in parallel; the resolver landed first, so the executer now needs a rebase that reconciles the overlap. The integrator did **not** fix-forward because (1) and (2) are competing feature implementations / an import set that must match post-merge usage — a domain decision, not a mechanical conflict — and a blind auto-resolution risks a red `master`.

**Proposed fix / improvement (scholar-resolver / scholar-phase-executer owner):**
- [ ] Rebase `auto/scholar-phase-executer` onto current `master`.
- [ ] App.jsx: keep the union of imports actually referenced by the merged file; run `biome check` (`noUnusedImports` is `error`) to confirm no dead/missing imports.
- [ ] LibraryScreen.jsx: adopt the PHASE-05 `PromptModal` bulk-tag (drop the `window.prompt` path), ensuring the modal state + JSX land together.
- [ ] PHASE-INDEX.md: set 03/04/05 -> `done` (`./completed/…` paths), keep 06/07 `pending`.
- [ ] Verify dungeon-scholar lint + full vitest + build green, then let the next integrator run merge it.

**Related files:** `dungeon-scholar/src/App.jsx`, `dungeon-scholar/src/features/library/LibraryScreen.jsx`, `dungeon-scholar/docs/phases/PHASE-INDEX.md`, branch `auto/scholar-phase-executer` (tip `1b3c00ed`)

---

### [2026-06-28] biome `useExhaustiveDependencies` warnings — hook-dependency triage (dead-code half + lint gate now done)

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (`biome check src`)

> **Partly resolved 2026-06-29 (scholar-resolver):** The mechanical half shipped on `auto/scholar-resolver`. Swept the dead code (`noUnusedImports` / `noUnusedVariables` / `noUnusedFunctionParameters`, 22 files) and the safe cosmetic rewrites (`useOptionalChain` / `useTemplate`, 29 files) via targeted `biome check --write --unsafe --only=…`, dropping the tree from 287 → 157 warnings, then **promoted `noUnusedImports` to `"error"`** in `biome.json` so dead imports can no longer silently return (lint gate stays green; full suite 749 tests green). **Still open below:** the ~91 `useExhaustiveDependencies` warnings.

> **2026-07-02 (scholar-errors):** count drifting UP — `biome check src` now reports 161 warnings total, `useExhaustiveDependencies` at **133** (was ~91), plus a handful of `noUnusedVariables`/`noUnusedFunctionParameters` returned post-sweep (`App.jsx` x4, `QuestBoard.jsx`, `DungeonExplore.jsx`, `usePlayerActions.js`, `ShopScreen.jsx`, `QuizMode.jsx`) — phases 08–11 added hooks/vars without dep hygiene. The triage below is getting more expensive the longer it waits.

> **2026-07-15 (scholar-errors):** drift continues — full sweep in a fresh worktree (`npm ci`, biome 2.5.1): **187 diagnostics** (185 warnings + 2 infos; was 161 on 07-02). `useExhaustiveDependencies` **134** (App.jsx 39, DungeonExplore.jsx 55, usePlayerState.js 13, FlashcardsMode.jsx 6, usePlayerActions.js 6). Post-sweep regressions: `useOptionalChain` back at **16** (was 0 after the 06-29 sweep), `noUnusedVariables` 6 / `noUnusedFunctionParameters` 4 persist (App.jsx x4: `totalDungeonRunsAttempted`, `canAscend`, `trackModeUseDaily`, `claimableStoryStepCount`; QuestBoard `claimedSteps`; DungeonExplore `streak`), plus newly-surfaced `noImportantStyles` 18 (all `src/index.css`), `noAssignInExpressions` 4 (while-regex idiom in cloze.js/richContent.js/one guard — benign), `noGlobalIsFinite` 1 (`tome.js:239` `formatDuration`). Everything else green this run: 945/945 tests, tsc clean, build OK (known PWA warn), bundle 439.4/600 KB.

**Description:**
The remaining warnings are `useExhaustiveDependencies` (latent stale-closure / missed-rerender risks), concentrated in `App.jsx` (~34), `components/dungeon/DungeonExplore.jsx` (~25), `hooks/usePlayerState.js` (~12), `features/player/usePlayerActions.js` (~6). They were deliberately NOT auto-fixed: there is no component-level behavioral/interaction test coverage for these hooks, so a blind dependency-array rewrite can introduce an infinite render loop or a perf regression that neither lint, the unit suite, nor build would catch. Each site needs per-hook judgment (add the real missing dep vs. annotate an intentional omission with `// biome-ignore` + reason).

**Proposed fix / improvement:**
- [ ] Triage the ~91 `useExhaustiveDependencies` warnings per hook — add real missing deps (verifying no render-loop regression), annotate intentional omissions with `// biome-ignore lint/correctness/useExhaustiveDependencies: <reason>`.
- [ ] Add component-interaction tests for the high-density files (`App.jsx`, `DungeonExplore.jsx`) FIRST so the dep fixes are verifiable, then fix.
- [ ] Once the deps backlog is clear, consider promoting `useExhaustiveDependencies` (and `noUnusedFunctionParameters`) from `warn` toward `error`.

**Related files:** `dungeon-scholar/biome.json`, `src/App.jsx`, `src/components/dungeon/DungeonExplore.jsx`, `src/hooks/usePlayerState.js`, `src/features/player/usePlayerActions.js`

---

### [2026-06-28] `vite build` emits `inlineDynamicImports` deprecation from vite-plugin-pwa SW build

- **Category:** config
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (`vite build`)

**Description:**
A production `vite build` prints `WARN inlineDynamicImports option is deprecated, please use codeSplitting: false instead.` during the service-worker (injectManifest) build step. It is not from `vite.config.js` (the app does not set `inlineDynamicImports`) — it originates inside the pinned dependency: `node_modules/vite-plugin-pwa/dist/vite-build-BGK4YAIU.js:109` hardcodes `inlineDynamicImports: true` when it builds `src/sw.js`. The build still succeeds today, but the option is slated for removal in Rolldown/Vite, at which point the SW build would break.

**Hypothesis / root cause:** `vite-plugin-pwa@1.3.0` uses the deprecated Rollup/Rolldown `inlineDynamicImports` flag for the SW bundle; Vite 8 (Rolldown) now warns on it. App code can not fix it directly — it needs a plugin upgrade.

> **[2026-07-03] WAIT-on-upstream confirmed (scholar-debt-batch):** re-checked — `vite-plugin-pwa` is **still at 1.3.0** (`npm view vite-plugin-pwa version` → `1.3.0`; latest published, no newer release). The deprecated `inlineDynamicImports: true` is still hardcoded in the plugin's SW-build path, and the app still does not set it in `vite.config.js`. There is **nothing app-side to change** until upstream ships a version using `codeSplitting: false`; forcing a change here would mean patching a dependency's internals. Entry **kept open (WAIT)**, not resolved — bump the plugin when a fixed release appears. Build still succeeds; treat the warning as known noise per the checklist.

**Proposed fix / improvement:**
- [ ] Track `vite-plugin-pwa` releases for a version that switches to `codeSplitting: false`; bump when available.
- [ ] Until then, treat the warning as known build noise (do not let it mask new warnings in CI logs).

**Related files:** `dungeon-scholar/vite.config.js` (VitePWA `injectManifest`), `dungeon-scholar/package.json` (`vite-plugin-pwa` pin)


---

> dungeon-scholar future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app issues: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
