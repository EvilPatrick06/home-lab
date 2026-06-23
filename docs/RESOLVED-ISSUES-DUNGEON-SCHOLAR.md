# dungeon-scholar Resolved Issues

> **Archive of resolved dungeon-scholar-domain entries** moved out of [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md) / [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md) — kept here so the active logs stay lean while preserving fix history.
>
> When fixing an entry, **move** it here (don't delete) and append resolution metadata. Resolved security entries (any domain) go in [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md) (gitignored), not here.
>
> Sibling logs:
> - dnd-app resolved → [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md)
> - BMO resolved → [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md)
> - Resolved security (any domain, gitignored) → [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md)
>
> Newest first.

---


### [2026-06-22] Resolved by scholar-resolver (branch auto/scholar-resolver)

> Batch resolution of the open dungeon-scholar issues + suggestions. Each entry below was fixed (or confirmed already-fixed) on branch auto/scholar-resolver; full local test suite green. Original entries preserved below.


> **Resolved 2026-06-22 (scholar-resolver):** Marked mode_master quest absolute (daily-reset counter).

### [2026-06-22] `mode_master` daily quest baseline is snapshotted from the pre-reset `modesUsedToday`, making it hard/impossible

- **Category:** bug
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** Automated error scan — static review of the daily quest counter/baseline wiring.

**Description:**
`modesUsedToday` is the only daily-RESETTING counter fed through the quest engine's diff-from-baseline math, and the baseline is captured from the wrong (pre-reset) value, so the `mode_master` quest ("The Versatile Path — Use 3 different study modes", `src/game/quests.js:108`, target 3) becomes much harder than its copy and can be outright unclaimable.

The daily-rollover effect in `src/App.jsx:629-647` builds the new `dailyQuests` with `baseline: getCounterValue(prev, q.counter)` and, in the *same* `setPlayerState` updater, sets `modesUsedToday: []`. Because `getCounterValue(prev, 'modesUsedToday')` (`src/game/quests.js:173-174`) reads `prev.modesUsedToday.length` — i.e. *yesterday's* array, before the reset — the snapshotted baseline is yesterday's mode count, not 0.

Every other daily counter (`cardsReviewed`, `totalCorrect`, `runsCompleted`, …) is a lifetime-cumulative value, so baseline = lifetime-at-day-start and `current - baseline` correctly measures today's NEW activity. `modesUsedToday` is different: it is zeroed each day, so its baseline should also be 0. Snapshotting it from the not-yet-reset array means today's progress is measured as `current - yesterdayCount`.

Concretely, only 6 distinct modes exist (`dungeon`, `flashcards`, `quiz`, `lab`, `chat`, `practiceExam` — `src/features/home/HomeScreen.jsx` `trackModeUse(...)` calls), so `modesUsedToday` length maxes out at 6. If a player used 3 modes yesterday, baseline = 3 and `mode_master` needs `current - 3 >= 3` → must use **all 6** modes today. If they used 4+ yesterday, it is **impossible** (would require current > 6). The quest gets harder the more active the player was the day before — the opposite of the intended low daily bar.

**Reproduction (if bug):**
1. On day N, use 4 different study modes (e.g. quiz, flashcards, lab, chat). `modesUsedToday` = length 4.
2. Cross midnight so the daily-rollover effect fires. `mode_master` is among the rolled `dailyQuests`. Its baseline is captured as 4 (from `prev`), then `modesUsedToday` is reset to `[]`.
3. On day N+1, use all available modes. `modesUsedToday` length climbs 1→6, so `current - baseline` peaks at `6 - 4 = 2 < 3`.
4. Observe `mode_master` never reaches 3/3 and is unclaimable, despite the player using every mode.

**Expected behavior (if bug):** "Use 3 different study modes" completes once the player uses 3 distinct modes during that day, regardless of how many modes they used the previous day.

**Hypothesis / root cause:** the baseline-subtraction model assumes a monotonically non-decreasing counter; `modesUsedToday` is a per-day counter that resets to `[]`, so its baseline must be 0 for the new day. The rollover snapshots baseline from `prev` (pre-reset) in the same updater that zeroes the array, double-counting yesterday's modes against today's target.

**Proposed fix / improvement:**
- [ ] Mark the `mode_master` template `absolute: true` (like `equipped_spells`/biome-boss quests at `src/game/quests.js:295,314`). `dailyQuestStatus` (`src/features/player/usePlayerActions.js:778`) then compares `current` directly against `target`, which is correct because `modesUsedToday` already represents only today's usage.
- [ ] Alternatively, special-case daily-reset counters in the rollover so their baseline is snapshotted as 0 (or compute baselines AFTER applying `modesUsedToday: []`).
- [ ] Add a `quests.test.js` case covering the day-rollover baseline for `modesUsedToday` (none currently exercise it).

**Blocked by:** nothing.

**Related files:** `src/App.jsx:629-647` (daily rollover; baseline snapshot + `modesUsedToday: []` in one updater), `src/game/quests.js:108` (`mode_master` template), `src/game/quests.js:173-174` (`modesUsedToday` counter), `src/features/player/usePlayerActions.js:759-763` (`trackModeUseDaily`), `:778` (`dailyQuestStatus` diff math).

**Related entries:** see "[2026-06-22] Streak quests only advance from dungeon-run records and require beating your all-time best" above — same root pattern (a non-cumulative counter pushed through diff-from-baseline math intended for monotonic counters).

---

---


> **Resolved 2026-06-22 (scholar-resolver):** Added real cross-mode currentStreak + maxStreakToday/Week; streak quests now absolute window-max.

### [2026-06-22] Streak quests only advance from dungeon-run records and require beating your all-time best

- **Category:** bug
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** Automated error scan — static review of the daily/weekly quest counter system.

**Description:**
The "build a streak" quests are mis-wired and are effectively unclaimable for any experienced player (and never count non-dungeon streaks at all). Two compounding problems:

1. **No real current-streak counter.** `getCounterValue(state, 'currentStreak')` in `src/game/quests.js` returns `state.longestStreak` as a proxy ("We don't persist a global current-streak; use longestStreak as the proxy"). But `longestStreak` is an *all-time maximum*, written in exactly one place — `src/components/DungeonExplore.jsx:3543`, `updateProgress({ longestStreak: Math.max(playerState.longestStreak || 0, maxStreak) })` at the end of a dungeon delve. So Quiz Mode and Flashcards streaks never move it; only a dungeon run's `maxStreak` does.
2. **Diff-from-baseline against a monotonic max.** Quests complete when `getCounterValue(state, counter) - baseline >= target`, and `baseline` is snapshotted at quest assignment (`src/App.jsx:640` daily, `:663` weekly). Because the counter is the all-time max, completing `flawless_streak` (daily, "Build a 5-answer correct streak", target 5) or `weekly_streak` (target 20) requires the player to push their **all-time best** up by the target amount, in a single dungeon run, within the day/week. A player whose `longestStreak` is already, say, 40 must hit a 45+ streak to claim a quest whose copy says "build a 5-answer streak". The more a player improves, the harder the quest gets — the opposite of the intended low daily bar.

Net effect: new players (baseline 0) can sometimes claim these via one good dungeon run, but the quests silently become impossible for everyone else, and never respond to Quiz/Flashcard performance the copy implies.

**Reproduction (if bug):**
1. Seed a save with `longestStreak: 40`.
2. Roll a day whose `pickDailyQuests` includes `flawless_streak` (target 5). Its baseline is captured as 40.
3. Play Quiz Mode and answer 10+ in a row correctly. Observe the quest does not progress (Quiz streaks don't touch `longestStreak`).
4. Complete a dungeon delve with a max in-run streak of 5. `longestStreak` stays 40 (`Math.max(40,5)`), quest still shows 0/5. To claim, the player must post a dungeon run with `maxStreak >= 45`.

**Expected behavior (if bug):** "Build a N-answer correct streak" completes when the player achieves an N-length correct-answer streak in any relevant mode during the quest window, independent of their historical best.

**Hypothesis / root cause:** the streak-quest counter was never backed by a real per-session/global current-streak field; `longestStreak` (a max, dungeon-only) was substituted as a proxy and then run through diff-from-baseline math that only makes sense for cumulative monotonic counters (cards reviewed, runs completed, etc.). See related phantom-field entry below — `semanticHashState` references a `state.currentStreak` that is never written, suggesting a real current-streak field was intended but never implemented.

**Proposed fix / improvement:**
- [ ] Introduce a real, persisted current-streak counter updated by every correct/incorrect answer across Quiz/Flashcards/dungeon (reset to 0 on a wrong answer), and have the streak quests track *the max current-streak reached since baseline* rather than diff-of-all-time-max.
- [ ] Alternatively, mark the streak quests `absolute: true` and compare the achieved-since-assignment streak directly against `target` (bypassing the baseline subtraction), so an N-streak always satisfies an N-target.
- [ ] Add unit coverage in `quests.test.js` for the streak counters (none currently exercise `currentStreak`).

**Blocked by:** nothing.

**Related files:** `src/game/quests.js` (`getCounterValue` `currentStreak` case; `flawless_streak`, `weekly_streak` templates), `src/App.jsx` (quest baseline snapshot lines ~640/663), `src/components/DungeonExplore.jsx:3543` (the only `longestStreak` writer), `src/services/persistence.js:125` (phantom `currentStreak`).

**Related entries:** see "[2026-06-22] semanticHashState fingerprints a phantom `state.currentStreak`" below.

---

---


> **Resolved 2026-06-22 (scholar-resolver):** Memoized tome sort; explicit testTimeout on 120-tome tests.

### [2026-06-22] LibraryScreen has no virtualization — 120-tome render times out the Phase-41G QA tests

- **Category:** performance, test
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** Automated error scan — full `npm test` run on bmo.

**Description:**
The two Phase-41G "120 tomes (Phase-30 QA gap)" tests in `src/features/library/LibraryScreen.test.jsx` both FAIL with `Error: Test timed out in 5000ms.` (the vitest default `testTimeout`). The single render of a 120-entry library is the bottleneck — vitest reported the `renders one card per tome for a 120-entry library` case at ~19.8s and the file as a whole at ~29s. Root cause is in `LibraryScreen.jsx`: it maps over the entire `playerState.library` unconditionally (no virtualization, windowing, or pagination), and every card mounts a heavy node subtree — `BookMarked` plus up to ~8 action buttons each carrying a `lucide-react` SVG icon (Star, Share2, Tag, ScrollText, Edit2, Copy, Trash2, …). At 120 tomes that is ~1,000+ SVG nodes in one synchronous render. There is also no `React.memo`/`useMemo`: the `sorted = [...library].sort(...)` copy+sort and the whole card list rebuild on every state change (e.g. each keystroke while renaming a tome re-renders all 120 cards).

This is the scenario the Phase-30 QA pass explicitly "couldn't test" (100+ tomes), so the regression test that was added to close the gap is itself red.

**Reproduction (if bug):**
1. `cd dungeon-scholar && npm ci && npm test` (note: `node_modules` was stale on bmo — `vite-plugin-pwa` was absent until `npm ci`; see separate config note).
2. Observe `src/features/library/LibraryScreen.test.jsx > LibraryScreen — 120 tomes (Phase-30 QA gap)` → 2 failed, both `Test timed out in 5000ms` (lines 50 and 60).
3. Final tally: `Test Files 1 failed | 47 passed`, `Tests 2 failed | 568 passed`.

**Expected behavior (if bug):** a 120-tome library renders well under the 5s test budget (and stays interactive in the real app for power users with large collections).

**Hypothesis / root cause:** unbounded, unmemoized render of all tomes with many SVG icons per card. Hardware caveat — this run was on the bmo Raspberry Pi, which is slow; the same tests may pass on faster GitHub Actions CI. But the underlying issue is real on two fronts: (a) a genuine scalability/UX cliff in `LibraryScreen` for large libraries on modest devices, and (b) brittle tests that lean on the default 5s timeout for an intentionally heavy render. Either the component should scale or the tests should set an explicit generous `testTimeout` (or assert on a smaller, representative N).

**Proposed fix / improvement:**
- [ ] Virtualize / paginate the tome grid (e.g. windowed list, or render in chunks) so render cost is bounded regardless of library size.
- [ ] Memoize the sorted list (`useMemo`) and extract the card into a `React.memo` child so renaming/keystrokes don't re-render every card.
- [ ] If the component is intentionally left un-virtualized for now, give the 120-tome tests an explicit `testTimeout` (3rd arg to `it`) so they don't depend on host speed.

**Blocked by:** nothing.

**Related files:** `src/features/library/LibraryScreen.jsx`, `src/features/library/LibraryScreen.test.jsx`, `vite.config.js` (test config / `testTimeout`)

---

---


> **Resolved 2026-06-22 (scholar-resolver):** Added real cross-mode currentStreak + maxStreakToday/Week; streak quests now absolute window-max.

### [2026-06-22] semanticHashState fingerprints a phantom `state.currentStreak` that is never written

- **Category:** debt, bug
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** Automated error scan — tracing the streak-quest counter (see Medium entry).

**Description:**
`semanticHashState` in `src/services/persistence.js:125` includes `currentStreak: state.currentStreak ?? 0` in the merge-divergence fingerprint, but `state.currentStreak` is never assigned anywhere in the app — `DEFAULT_STATE` has no such field, and a repo-wide grep finds only reads (this line) and the unrelated `devotion.js`/quest-template uses of a local `currentStreak` parameter/label. So the key is a constant `0` for every save and contributes nothing to the fingerprint. Harmless today (it just never helps), but it is dead/ineffective code that signals an intended-but-unimplemented global current-streak field — the same gap that breaks the streak quests (see related Medium entry).

**Expected behavior (if bug):** the semantic fingerprint should hash a field that actually varies, or the phantom key should be removed.

**Hypothesis / root cause:** a real `currentStreak` player field was planned (referenced here and used as a quest counter id) but never implemented; `longestStreak` was substituted in the quest path while this fingerprint key was left pointing at the never-created field.

**Proposed fix / improvement:**
- [ ] If a real current-streak field is added (per the Medium entry's fix), this key becomes meaningful — otherwise drop it from `semanticHashState` to avoid implying the chooser reacts to streak changes when it cannot.

**Blocked by:** depends on the streak-counter decision in the related Medium entry.

**Related files:** `src/services/persistence.js` (`semanticHashState`), `src/game/quests.js`.

**Related entries:** "[2026-06-22] Streak quests only advance from dungeon-run records…" (Medium).

---

---


> **Resolved 2026-06-22 (scholar-resolver):** Added game/items.test.js + game/difficulty.test.js.

### [2026-06-22] No unit tests for `game/items.js` and `game/difficulty.js` pure logic

- **Category:** test, debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** Automated error scan — test-coverage sweep (`npm test`: 48 files / 570 tests, all green on a fresh `npm ci`).

**Description:**
`src/game/items.js` (`sanctumCount`, `sanctumAtCap`, `pickShopStock`, `findItem`) and `src/game/difficulty.js` (`isDifficultyUnlocked`, `rollBoss`) contain real, branch-heavy pure logic but have **no** sibling test files, while every other logic module in `src/game/` is covered (`titles.test.js`, `quests.test.js`, `tome.test.js`). This is the exact category of gap that let the already-logged "[2026-06-18] Celestial/devotion caps not enforced in purchaseItem" bug ship — it lives in `sanctumCount`'s category guard and a one-line unit test (`sanctumCount(state, celestialItem)`) would have caught it. `pickShopStock`'s deterministic seeded shuffle and `isDifficultyUnlocked`'s level/achievement gates are likewise untested and easy to regress.

**Expected behavior:** the `game/` pure-logic modules carry unit coverage comparable to their siblings.

**Proposed fix / improvement:**
- [ ] Add `src/game/items.test.js`: `sanctumCount`/`sanctumAtCap` across sanctum/devotion/celestial (step + cap math), `findItem` miss, `pickShopStock` determinism + pool/empty edge cases.
- [ ] Add `src/game/difficulty.test.js`: `isDifficultyUnlocked` for each tier via both the level path and the achievement path (verify `master` requires `flawless` + `first_boss`), plus `rollBoss` range.

**Blocked by:** nothing.

**Related files:** `src/game/items.js`, `src/game/difficulty.js`.

**Related entries:** "[2026-06-18] Celestial (and devotion) item caps are not enforced in purchaseItem" (Low).

---

---


> **Resolved 2026-06-22 (scholar-resolver):** Corrected derived-key cache-key comment.

### [2026-06-22] notesCrypto `deriveKey` cache-key comment is stale (omits the passphrase component)

- **Category:** debt, docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** Automated error scan — review of `src/services/notesCrypto.js`.

**Description:**
The derived-key cache header comment (lines ~26-30) states the cache is "Keyed by `${saltB64}|${iterations}`", but the implementation at line 50 keys by `${passphrase}|${toB64(saltBytes)}|${iterations}`. The code is the *correct* behavior — including the passphrase is what prevents a wrong cached key being returned when two passphrases share a salt — but the comment is wrong and actively misleading: a future contributor "fixing" the code to match the comment would reintroduce a real crypto-correctness bug (returning the first passphrase's key for a different passphrase with the same salt). Worth a quick comment fix so the invariant is documented accurately. (Minor adjacent note: keeping the passphrase string as a Map key retains it in process memory for the session; that is a low-priority security observation, not logged here — `SECURITY-LOG.md` is the home for any follow-up.)

**Expected behavior:** the comment should describe the actual cache key (`passphrase|salt|iterations`) and why the passphrase must be part of it.

**Proposed fix / improvement:**
- [ ] Update the comment to `Keyed by ${passphrase}|${saltB64}|${iterations}` and note that the passphrase component is required for correctness.

**Blocked by:** nothing.

**Related files:** `src/services/notesCrypto.js`.

---

---


> **Resolved 2026-06-22 (scholar-resolver):** Widened sanctumCount guard so devotion/celestial caps enforce; flipped lock-test.

### [2026-06-18] Celestial (and devotion) item caps are not enforced in purchaseItem

- **Category:** bug
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code
- **During:** Phase 41G — adding automated tests for the Phase-30 QA "couldn't test" gap list (ascension + celestial spend gap).

**Description:**
`purchaseItem` (src/features/player/usePlayerActions.js) calls `sanctumAtCap(playerState, item)` for `sanctum`, `devotion`, AND `celestial` categories to block over-cap purchases. But `sanctumCount` (src/game/items.js) short-circuits to `0` for any item whose `category !== 'sanctum'`:
`if (item.category !== 'sanctum' || !item.permKey) return 0;`
So for celestial/devotion items `sanctumCount` is always 0, `sanctumAtCap` is always `0 >= cap` → false, and the cap is never enforced. A player can buy a celestial ware (e.g. `celestial_revive`, documented `cap: 1`) repeatedly, spending tokens and stacking `permUpgrades[permKey]` past its cap.

**Reproduction (if bug):**
1. Seed `ascensionTokens: 10`, `permUpgrades: { ascAutoRevive: 1 }` (at the documented cap of 1).
2. Call `purchaseItem('celestial_revive')`.
3. Observed: `{ ok: true }`, token spent, `ascAutoRevive` becomes 2 (over cap). Expected the purchase to reject with a "reached the cap" reason.

**Expected behavior (if bug):** celestial/devotion purchases reject once `permUpgrades[permKey] / step >= item.cap`, same as sanctum wares.

**Hypothesis / root cause:** `sanctumCount`'s category guard was written before devotion/celestial categories existed and was never widened. The `step`-aware count math is otherwise generic.

**Proposed fix / improvement:**
- [ ] Widen `sanctumCount`'s guard to `['sanctum','devotion','celestial'].includes(item.category)` (or drop the category check and rely on `permKey`), so the `step`-aware count + `sanctumAtCap` work for all permKey-bearing wares.
- [ ] Flip the Phase-41G real-behavior-lock test in `usePlayerActions.test.jsx` ("purchaseItem(celestial) does NOT enforce the documented cap") to assert rejection once fixed.

**Blocked by:** nothing.

---

---


> **Resolved 2026-06-22 (scholar-resolver):** Removed unreachable cursed_run/double_curse achievements.

### [2026-06-18] Curse/modifier run mechanic is vestigial — `cursed_run`/`double_curse` achievements unreachable

**Severity:** Low
**Category:** debt / dead-content
**Domain:** dungeon-scholar

`DungeonExplore` always records `modifiers: []` on completed runs (the curse/modifier system was never wired up), so the `cursed_run` ("win a run with ≥1 curse active") and `double_curse` ("win with 2 curses active") achievements in `src/game/achievements.js` can never be earned — dead content. Found during PHASE-41 41H while writing the manual QA checklist (which notes "curses/modifiers are vestigial, nothing to test").

**Decision needed:** either reimplement run modifiers (a delve-setup curse picker + tracking active modifiers into the run-history `modifiers` field) OR remove the two unreachable achievements. Not fixed inline — out of PHASE-41's scope.

**Blocked by:** nothing.

---

---


> **Resolved 2026-06-22 (scholar-resolver):** Added Space/Enter flip, 1-4 grade, arrow browse + focusable card.

### [2026-06-22] Flashcards mode lacks keyboard shortcuts that Quiz/Lab/Chat/Exam already have

- **Category:** UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** dungeon-scholar tree review (src/features/study/*)

**Description:**
Keyboard handling is inconsistent across the study modes. `QuizMode.jsx`, `LabMode.jsx`, `ChatMode.jsx`, and `ExamMode.jsx` all have key handlers (ExamMode has a documented hotkey layer), but `FlashcardsMode.jsx` has no `onKeyDown`/`e.key`/`tabIndex` handling at all — flip and self-grade are pointer-only. Flashcards is explicitly the "best for early learning" entry mode (README), so it is the mode a new user hits first and the one where rapid flip/grade keyboarding matters most for flow.

**Proposed fix / improvement:**
- [ ] Add keys to FlashcardsMode: Space/Enter to flip, and number keys (or arrows) to self-grade (e.g. 1–4 mapped to the SRS ratings in `services/srs.js` `SRS_RATINGS`).
- [ ] Make the card focusable and show a visible focus ring; document the keys inline (a small hint row) consistent with the other modes.

**Related files:** `src/features/study/FlashcardsMode.jsx`, `src/services/srs.js`

---


> **Resolved 2026-06-22 (scholar-resolver):** Added root .nvmrc + engines.node; workflows use node-version-file.

### [2026-06-22] Pin one Node version for the whole monorepo (.nvmrc / engines) instead of repeating `node-version: 22`

- **Category:** portability
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`node-version: 22` is hardcoded in 7 places across 5 workflows (`dnd-app-ci`, `security-audit`, `dnd-app-validate-5e`, `release` ×3, `deploy`). There is no root `.nvmrc`, no `engines.node` field in any package.json (`dnd-app` / `dungeon-scholar` / `oracle-worker`), and no Volta pin. Local contributors can build on any Node, and bumping the toolchain means hand-editing every workflow.

**Proposed fix / improvement:**
- [ ] Add a root `.nvmrc` (e.g. `22`).
- [ ] Add a matching `engines.node` to each project package.json.
- [ ] Switch workflows to `node-version-file: .nvmrc` so the version lives in one place.

**Related files:** `.github/workflows/*.yml`, `dnd-app/package.json`, `dungeon-scholar/package.json`, `oracle-worker/package.json`

---


> **Resolved 2026-06-22 (scholar-resolver):** Project-aware pre-commit hook; removed orphaned .githooks.

### [2026-06-22] Local pre-commit hook gates only dnd-app; `.githooks/` dir is now orphaned

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`.husky/pre-commit` does `cd dnd-app` then runs biome + tsc on that project only. Commits touching `dungeon-scholar`, `oracle-worker`, or repo-root tooling get no local lint/typecheck/test pre-flight (dungeon-scholar`s first gate is the deploy workflow; oracle-worker has none). Separately, `.githooks/pre-commit` is now redundant — its gitleaks shim was folded into `.husky/` per that hook`s own comment, yet the old dir remains and can confuse anyone setting `core.hooksPath`.

**Proposed fix / improvement:**
- [ ] Make the hook detect which project(s) have staged changes and run each one`s lint/typecheck (at minimum add dungeon-scholar test/build).
- [ ] Delete the orphaned `.githooks/` directory once `.husky` is confirmed authoritative.

**Related entries:** `ISSUES-LOG-DNDAPP.md` [2026-06-16] pre-commit `--staged` no-op (distinct dnd-app-only bug).
**Related files:** `.husky/pre-commit`, `.githooks/pre-commit`

---


> **Resolved 2026-06-22 (scholar-resolver):** Added canonical-source pointers to CLAUDE/GEMINI/copilot.

### [2026-06-22] Four hand-maintained agent-instruction files will drift (AGENTS / CLAUDE / GEMINI / copilot)

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
The repo carries four overlapping AI-assistant guides — `AGENTS.md` (12.8K), `CLAUDE.md` (11.3K), `GEMINI.md` (5.2K), `.github/copilot-instructions.md` (4.6K) — each maintained by hand. They cover much of the same ground (repo layout, conventions, logging rules) and will drift out of sync as the repo evolves.

**Proposed fix / improvement:**
- [ ] Designate one canonical source (e.g. `AGENTS.md`); generate or symlink the others from it, or add a sync check that flags when shared sections diverge.
- [ ] At minimum, have each file link to the canonical one for shared sections instead of duplicating them.

**Related files:** `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`

> **2026-06-10 — Backlog consolidated.** All previously-open entries (F2–F6,
> code-splitting, QA16 full light theme, QA-Bestiary badges, the L1–L18 polish
> set, and the Phase 30 QA coverage-gap list) became the numbered phase plans under `dnd-app/docs/phases/` (start at `PHASE-INDEX.md`); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new dungeon-scholar ideas below as they appear.

---


> **Resolved 2026-06-22 (scholar-resolver):** Added exportSaveText/parseImportedSave + Export/Import journal in AccountPanel.

### [2026-06-22] Manual local save export / import (offline backup file) — UI promises it but it doesn't exist

- **Category:** portability
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** Review of the dungeon-scholar tree for improvement ideas.

**Description:**
The only ways to preserve progress today are (a) browser `localStorage` (lost on clear-data / device switch) and (b) optional Supabase cloud sync (requires a configured deployment + GitHub sign-in). There is no way to export the player save to a portable file and re-import it. Tomes can be exported/shared (`ShareTomeModal` → `downloadTomeJson`, blob + `URL.createObjectURL`), but the *player save* (`STORAGE_KEY = "dungeon-scholar:save:v1"`, handled in `services/persistence.js`) cannot. Notably the app already *tells* the user to do this — `App.jsx:546` shows "...sign in for cloud backup, or **export thy journal**." on a quota/save failure — but no "export journal" action exists anywhere (`AccountPanel.jsx` only offers sign-out / delete-cloud / delete-account / reset; no Blob download of the save outside the tome path). So the error copy points at a feature that was never built.

**Hypothesis / root cause:** cloud sync was built as the cross-device story and the local-file fallback was described in copy but never implemented; private-mode / quota-exceeded / sync-disabled users have no recovery path.

**Proposed fix / improvement:**
- [ ] Add "Export journal" (download the `persistence` payload as `dungeon-scholar-save-<date>.json`) and "Import journal" (validate schema_ver, merge or replace) to `AccountPanel` (and ideally the home/settings surface so it works with cloud sync entirely unconfigured).
- [ ] Reuse the existing Blob + `URL.createObjectURL` + `a.click()` machinery from `ShareTomeModal`.
- [ ] Run the import through the same `MergeChooser` flow the cloud merge uses, so a re-import can merge rather than clobber.

**Related files:** `src/services/persistence.js`, `src/components/AccountPanel.jsx`, `src/App.jsx` (line ~546 notif), `src/features/library/ShareTomeModal.jsx` (download pattern), `src/components/MergeChooser.jsx`

---

---


> **Resolved 2026-06-22 (scholar-resolver):** Moved ExamMode into features/study/ + smoke test.

### [2026-06-22] `ExamMode.jsx` is a study mode stranded in `src/components/` while every sibling mode lives in `src/features/study/`

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`src/components/ExamMode.jsx` (846 lines / 44 KB) is a full study-mode screen, but it is the only one not co-located with its peers under `src/features/study/`. Every other mode — `QuizMode.jsx`, `ChatMode.jsx`, `LabMode.jsx`, `FlashcardsMode.jsx`, `DomainStudyScreen.jsx`, `MistakeVault.jsx` — lives in `src/features/study/`. `ExamMode` is lazy-loaded from the wrong place (`App.jsx:24`: `React.lazy(() => import("./components/ExamMode.jsx"))`) and sits in the flat `components/` grab-bag alongside app chrome (`SignInButton`, `ProfileChip`, `SyncStatusDot`, `ErrorBoundary`). This breaks the PHASE-39 feature-folder convention and makes the study-mode set harder to find as a unit. (Related: it is also the only study mode with no co-located test file — that test gap travels with the move.)

**Hypothesis / root cause:** `ExamMode` (Phase 26e) was added after the `features/study/` split and dropped into `components/` rather than beside its siblings.

**Proposed fix / improvement:**
- [ ] Move `src/components/ExamMode.jsx` → `src/features/study/ExamMode.jsx`; update the `App.jsx` lazy-import path and the relative imports (e.g. `./useDialogA11y.js` → `../../components/useDialogA11y.js` or the new hooks home below).
- [ ] Add a co-located `ExamMode.test.jsx` while the file is being touched.

**Related files:** `src/components/ExamMode.jsx`, `src/features/study/` (QuizMode/ChatMode/LabMode/FlashcardsMode/DomainStudyScreen/MistakeVault), `src/App.jsx` (line ~24 lazy import)

---


> **Resolved 2026-06-22 (scholar-resolver):** Moved useDialogA11y into src/hooks/.

### [2026-06-22] `useDialogA11y` is a repo-wide shared hook but lives in `src/components/` instead of `src/hooks/`

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`src/components/useDialogA11y.js` is a generic, cross-cutting React hook (focus-trap / escape-to-close dialog a11y) imported by ~18 files spanning every feature area — `App.jsx`, `components/` (PromptModal, MergeChooser, ExamMode, TomeNotes, AccountPanel), `components/ui/` (ConfirmModal, ResetConfirmModal, AchievementsModal, TitlesModal) and `features/` (tutorial/WelcomeModal, study/ChatMode, progression/ShopScreen, library/MetadataEditModal+ImportCodeModal+ShareTomeModal+PasteTomeModal). Yet it sits inside `src/components/` even though the repo has a dedicated `src/hooks/` directory (`useAuth.js`, `usePlayerState.js`). A reusable hook used by non-component code paths is misfiled under `components/`, and the long `../../components/useDialogA11y.js` relative imports from deep feature folders are a smell pointing at the wrong home.

**Hypothesis / root cause:** The hook was created next to the first dialog component that needed it and never relocated when `src/hooks/` was established.

**Proposed fix / improvement:**
- [ ] Move `src/components/useDialogA11y.js` (+ `useDialogA11y.test.jsx`) → `src/hooks/useDialogA11y.js`; update the ~18 import paths.
- [ ] Consider colocating `features/player/usePlayerActions.js` and `router/useHashRoute.js` decisions consciously (feature-local hooks can stay), but truly cross-cutting hooks should live in `src/hooks/`.

**Related files:** `src/components/useDialogA11y.js`, `src/components/useDialogA11y.test.jsx`, `src/hooks/` (useAuth.js, usePlayerState.js), and the ~18 importers across `components/`, `components/ui/`, and `features/`

---


> **Resolved 2026-06-22 (scholar-resolver):** Extracted shared PasteSubmitModal; thin wrappers.

### [2026-06-22] `ImportCodeModal` and `PasteTomeModal` are near-identical twin modals — consolidate into one parameterized modal

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`src/features/library/ImportCodeModal.jsx` (79 lines) and `src/features/library/PasteTomeModal.jsx` (92 lines) are structurally the same component: identical `useState(text)` + `useState(error)`, identical `handleSubmit` shape (trim-guard → `onSubmit(text)` returns success → close-or-set-error), identical `useDialogA11y({ onClose })` wiring, and the same full-screen dialog markup. They differ only in cosmetic details — icon (`Hash`/`Copy`+`Scroll`), color theme (purple vs amber CSS vars), `aria-label`, placeholder, and the two error strings. This is copy-paste duplication: a fix to the dialog scaffolding (focus order, error styling, escape handling) must be made twice and can drift.

**Hypothesis / root cause:** The second paste/import flow was cloned from the first instead of generalized.

**Proposed fix / improvement:**
- [ ] Extract one `PasteSubmitModal` (props: `title`/`ariaLabel`, `icon`, `theme`, `placeholder`, `emptyError`, `failError`, `onSubmit`) and render the two existing modals as thin configured instances (or just two call-sites).
- [ ] Keep the themed color variants as a `theme` prop so the visual distinction is preserved.

**Related files:** `src/features/library/ImportCodeModal.jsx`, `src/features/library/PasteTomeModal.jsx`

---


> **Resolved 2026-06-22 (scholar-resolver):** Moved PromptModal+MergeChooser to components/ui/; added components/README placement rule.

### [2026-06-22] Reusable modals are split between `src/components/ui/` and the flat `src/components/` with no clear rule

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
Generic, reusable modal components are inconsistently placed. `src/components/ui/` holds `ConfirmModal.jsx`, `ResetConfirmModal.jsx`, `AchievementsModal.jsx`, and `TitlesModal.jsx`, but other equally-generic modals sit one level up in the flat `src/components/` root — `PromptModal.jsx`, `MergeChooser.jsx` — next to genuinely app-specific chrome (`AccountPanel`, `SignInButton`, `ProfileChip`, `SyncStatusDot`, `ErrorBoundary`, the two banner components) and feature components (`ExamMode`, `TomeNotes`, `RichContent`). There is no documented rule for what belongs in `ui/` vs the root, so `components/` reads as a grab-bag and a contributor cannot predict where a new modal should go. (Feature-specific modals correctly living under their feature folder — e.g. `features/library/*Modal.jsx` — are fine and out of scope here.)

**Hypothesis / root cause:** `components/ui/` was introduced (PHASE-39) as a primitives home but existing root-level modals were never migrated, and no convention was written down.

**Proposed fix / improvement:**
- [ ] Decide and document the rule (e.g. "generic, app-agnostic presentational modals/primitives → `components/ui/`; app-stateful chrome → `components/`; feature-specific → that feature folder") in `docs/DESIGN-CONSTRAINTS.md` or a short `src/components/README.md`.
- [ ] Move the generic root modals (`PromptModal`, `MergeChooser`) into `components/ui/` to match `ConfirmModal`/`ResetConfirmModal`, updating imports.

**Related files:** `src/components/ui/` (ConfirmModal, ResetConfirmModal, AchievementsModal, TitlesModal), `src/components/PromptModal.jsx`, `src/components/MergeChooser.jsx`, `dungeon-scholar/docs/DESIGN-CONSTRAINTS.md`

---


> **Resolved 2026-06-22 (scholar-resolver):** Removed closeAudio/clearAllSessions/generateStarterMap + their tests.

### [2026-06-22] Dead exported functions: `closeAudio`, `clearAllSessions`, `generateStarterMap` are tested but never called in production

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
Three exported functions have unit tests but zero production call sites (grep across all non-test `src/` returns only their own definition):
- `closeAudio` (`src/audio/sound.js:352`) — an AudioContext teardown helper that is never wired into any unmount/cleanup path; only `sound.test.js` references it.
- `clearAllSessions` (`src/services/sessionResume.js:49`) — only `sessionResume.test.js` references it; nothing in the app ever bulk-clears resume sessions.
- `generateStarterMap` (`src/components/DungeonExplore.jsx:703`) — a thin wrapper that just calls `generateMap({ difficulty: "apprentice", biome: "halls", ...opts })`; production code (`DungeonExplore.jsx:2736`, the `useMemo`) calls `generateMap` directly, so the wrapper is unused except by `DungeonExplore.test.js`. (Note: the [2026-06-22] DungeonExplore God-file entry lists `generateStarterMap` among "pure exports already imported outside the component" — that is inaccurate; it is imported only by its own test.)

These add test surface and export weight for code no feature depends on. Either wire them up (e.g. call `closeAudio` on teardown if that was the intent) or remove the function + its test.

**Hypothesis / root cause:** Helpers written speculatively or left behind after the call site was refactored away (e.g. `generateMap` superseded the starter-map wrapper); the tests kept them green so the deadness went unnoticed.

**Proposed fix / improvement:**
- [ ] Confirm none are intended public API, then `git rm` each function and its test block (or wire `closeAudio` into the real teardown path if that was the original intent).

**Related files:** `src/audio/sound.js`, `src/audio/sound.test.js`, `src/services/sessionResume.js`, `src/services/sessionResume.test.js`, `src/components/DungeonExplore.jsx`, `src/components/DungeonExplore.test.js`

---


> **Resolved 2026-06-22 (scholar-resolver):** Added src/utils/{date,shuffle,time}; deduped the YYYY-MM-DD formatter.

### [2026-06-22] No shared `src/utils/` module — date, shuffle, and duration helpers are duplicated across files

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
There is no shared utilities module anywhere under `src/` (no `utils/`, `lib/`, `helpers/`, or `common/`), so small generic helpers are re-implemented in place:
- **Local `YYYY-MM-DD` formatter — verbatim duplicate.** `services/devotion.js:24` exports `todayDateStr` with body `` `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` ``. `game/quests.js:337` re-inlines the exact same expression inside its week-start helper instead of importing `todayDateStr`; the identical line also appears in `usePlayerActions.test.jsx:133`.
- **Fisher-Yates shuffle — 4 implementations.** `game/tome.js:39` `shuffleArray` (unseeded, `Math.random`), `components/DungeonExplore.jsx:456` `shuffle(arr, rng)` (seeded), `services/examSession.js:23` `shuffleInPlace(arr, rng)` (seeded, mutates), and an inline sin-seeded Fisher-Yates in `game/items.js:132` (`pickShopStock`). One `shuffle(arr, rng = Math.random)` (+ an in-place variant) would cover all four.
- **Duration `m`/`s` formatting — scattered inline.** `components/ExamMode.jsx` repeats `Math.floor(s / 60)` + `padStart(2, "0")` / `Xm Ys` at lines 35, 239, 361, 631, 735; `game/tome.js:121` has its own `Xm Ys`; `components/AccountPanel.jsx:13` a "min ago" variant.

None of this is broken, but the verbatim date duplication and the four-way shuffle are exactly the drift a small shared util prevents (a bug fixed in one copy is missed in the others).

**Hypothesis / root cause:** App grew from a single-file prototype; PHASE-39 split it into `game/`, `services/`, `components/`, `features/` but never introduced a neutral `utils/` home, so each module kept its own copy of generic helpers.

**Proposed fix / improvement:**
- [ ] Add `src/utils/` (e.g. `date.js`, `shuffle.js`, `time.js`) and migrate the duplicates to single implementations.
- [ ] At minimum, have `game/quests.js` import `todayDateStr` from `services/devotion.js` rather than re-inlining it (or move `todayDateStr` into the new `utils/date.js` and re-export).

**Related files:** `src/services/devotion.js`, `src/game/quests.js`, `src/game/tome.js`, `src/components/DungeonExplore.jsx`, `src/services/examSession.js`, `src/game/items.js`, `src/components/ExamMode.jsx`, `src/components/AccountPanel.jsx`

---


> **Resolved 2026-06-22 (scholar-resolver):** Moved tutorial.js into src/game/.

### [2026-06-22] `src/tutorial.js` is game-state logic stranded at `src/` root instead of `src/game/`

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`src/tutorial.js` (+ `src/tutorial.test.js`) holds pure game/state logic — `TUTORIAL_STEPS`, `migrateTutorialIndex`, `snapshotBaselines`, `OLD_TUTORIAL_ORDER` — and is imported as domain logic (`services/persistence.js:1` imports `migrateTutorialIndex`). Every sibling of that kind lives under `src/game/` (`defaultState.js`, `difficulty.js`, `tome.js`, `quests.js`, `titles.js`, `achievements.js`, …), yet `tutorial.js` sits loose at the `src/` root next to `App.jsx`/`main.jsx`/`index.css`. This is inconsistent with the PHASE-39 layering and slightly confusing given there is also a `src/features/tutorial/` dir (UI: `TutorialPanel.jsx`, `WelcomeModal.jsx`) — the data/logic half and the UI half are split across two unrelated locations. (Minor related nit: `src/theme.test.js` is a root-level static guard with no `theme.js` source — fine, but its placement/name reads as an orphan.)

**Hypothesis / root cause:** `tutorial.js` predates the `src/game/` convention and was never moved when the layering was introduced.

**Proposed fix / improvement:**
- [ ] Move `src/tutorial.js` + `src/tutorial.test.js` to `src/game/tutorial.js` (or co-locate the logic under `src/features/tutorial/`) and update the `persistence.js` import path.
- [ ] Optionally rename `src/theme.test.js` to signal it is a CSS/theme static guard (e.g. `src/theme.guard.test.js`).

**Related files:** `src/tutorial.js`, `src/tutorial.test.js`, `src/services/persistence.js`, `src/features/tutorial/`, `src/theme.test.js`

---


> **Resolved 2026-06-22 (scholar-resolver):** Already removed on master (commit ee8a9432); confirmed.

### [2026-06-22] Three unreferenced root-level tome JSON files (~700 KB) committed as dead artifacts

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`dungeon-scholar/tome-aws-clf-c02.json` (~202 KB), `tome-ccst-cybersecurity.json` (~182 KB), and `tome-security-plus-sy0-701.json` (~313 KB) sit at the repo root, are tracked in git, but are referenced NOWHERE — no import, fetch, build glob, HTML, or doc points at them (grep across `src`, `public`, `index.html`, `vite.config.js`, `*.md` returns nothing). They are not in `public/` so they are not even served by the dev server or bundled. Git history shows they arrived via the GitHub web UI (Add files via upload, commit ce0d660e, Apr 30) and have not been touched since. They appear to be sample/seed exam content that predates the current Oracle/prompt-driven tome system and now just bloats the repo root and clones.

**Hypothesis / root cause:** Leftover manual upload of sample decks from an early iteration; the app moved to generating/importing tomes at runtime and these static files were never removed.

**Proposed fix / improvement:**
- [ ] Confirm with the owner that no external workflow consumes them.
- [ ] If genuinely unused, `git rm` all three (history preserves them); otherwise move into a clearly-named `samples/` or `fixtures/` dir and document their purpose.

**Related files:** `dungeon-scholar/tome-aws-clf-c02.json`, `dungeon-scholar/tome-ccst-cybersecurity.json`, `dungeon-scholar/tome-security-plus-sy0-701.json`

---


> **Resolved 2026-06-22 (scholar-resolver):** Added Biome config + lint/format scripts + devDependency.

### [2026-06-22] No linter/formatter config in dungeon-scholar (sibling dnd-app has biome)

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`dungeon-scholar/` has no ESLint, Prettier, Biome, or `.editorconfig`, and `package.json` exposes no `lint`/`format` script (only `dev`/`build`/`preview`/`test`/`test:watch`). The sibling project `dnd-app/` in the same monorepo ships a `biome.json`. This is a consistency/structure gap: dungeon-scholar relies entirely on convention with no automated style or correctness gate, so formatting drift and easy-to-catch issues (unused vars/imports, accidental globals) can accumulate unchecked across the ~24 K lines of source.

**Hypothesis / root cause:** dungeon-scholar started as a single-file prototype (the former 11 K-line App.jsx) and a linter was never retrofitted as it grew.

**Proposed fix / improvement:**
- [ ] Add Biome (mirror `dnd-app/biome.json`) or ESLint+Prettier to dungeon-scholar.
- [ ] Add a `lint` script to `package.json` and wire it into CI alongside `test`.

**Related files:** `dungeon-scholar/package.json`, `dnd-app/biome.json` (reference config)

---


> **Resolved 2026-06-22 (scholar-resolver):** Already removed on master (commit 71d3117c); confirmed.

### [2026-06-22] docs/PHASE-24-POLISH.md is fully completed (all items struck through) — stale tracking doc

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`dungeon-scholar/docs/PHASE-24-POLISH.md` is a deferred-work tracker whose every line item is now struck through (`~~…~~`) and annotated Done / Resolved in PHASE-39 / Done in Phase 24. It tracks no remaining open work. It lingers as a stale doc that a future contributor must read in full to discover it is empty of actionable content. Either archive it (the resolved-items pattern used by the SUGGESTIONS/ISSUES logs) or delete it, since its closing instruction (prepend a one-line summary…) suggests it was meant to be a living backlog that has since been fully drained.

**Hypothesis / root cause:** Phase-24 polish backlog was completed but the tracking file was never archived/removed afterward.

**Proposed fix / improvement:**
- [ ] Delete `docs/PHASE-24-POLISH.md`, or move its completed record into the dungeon-scholar resolved log / a phases/completed archive for history.

**Related files:** `dungeon-scholar/docs/PHASE-24-POLISH.md`

---

---

### [2026-05-17] M1 — Header icon-buttons have only `title=`, no `aria-label`

- **Original category:** UX, a11y
- **Original severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit
- **Resolved by:** Claude Code (Opus 4.7)
- **Date resolved:** 2026-05-17 (Phase 30h)

**Problem:** Header icon-only buttons (Quest Board, Library, Inventory, Marketplace, Hall of Glory) relied on `title=` for their accessible name. `title` is announced inconsistently across screen readers and not at all on iOS Safari. The 2026-05-17 Dungeon Scholar QA report (#15) re-confirmed: "3 of 34 buttons have no accessible name". QA #20 separately reported the badge counts vs. destination-page numbers can disagree — the icon-to-page mapping was opaque.

**Resolution:** Added `aria-label` to every header button (Gold pill, Quest Board, Library, The Hoard, Marketplace, Hall of Glory). Each label names the destination AND inlines the current count where applicable (e.g., "Open Library, 3 tomes" / "Open The Hoard, 5 items stowed" / "Open Quest Board, 2 rewards ready to claim"). Decorative icons inside each button now carry `aria-hidden="true"` so screen readers don't double-read. The inventory count is derived once via the SAME expression InventoryScreen uses for its "N items stowed" copy, so the badge and the destination page can never disagree (QA #20 fix).

---

### [2026-05-17] L2 — No keyboard shortcuts for quiz answer selection

- **Original category:** UX
- **Original severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit
- **Resolved by:** Claude Code (Opus 4.7)
- **Date resolved:** 2026-05-17 (Phase 30g)

**Problem:** No keyboard shortcuts for picking an MC option, true/false, or confidence. The 2026-05-17 Dungeon Scholar QA report (#12) re-confirmed that keys 1-4 / A-D were inert during Riddles, hurting accessibility and power-user speed.

**Resolution:** Added window-scoped keydown listeners to QuizMode (in App.jsx) and ExamMode that:
- 1 / 2 / 3 pick confidence (Uncertain / Likely / Confident) when the picker is shown.
- 1-9 or A-Z index MC options, scoped to the actual options array length.
- T / F pick true/false on truefalse riddles.
- Inputs/textareas are skipped (so typing in fill-in-blank doesn't misfire).
- Modifier keys (Ctrl/Meta/Alt) are skipped (so browser shortcuts stay intact).
Visible hotkey hint legend rendered above the answer choices in both surfaces.

---

### [2026-05-17] L6 — No keyboard focus ring (Tailwind defaults)

- **Original category:** UX, a11y
- **Original severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit
- **Resolved by:** Claude Code (Opus 4.7)
- **Date resolved:** 2026-05-17 (Phase 30f)

**Problem:** App relied on browser defaults; text inputs used `focus:outline-none` without a replacement ring. The 2026-05-17 Dungeon Scholar QA report (#13) re-confirmed that `outline-style: none` rendered focused buttons with no visible indicator.

**Resolution:** Added a `@layer base *:focus-visible` rule to `dungeon-scholar/src/index.css` that paints a 2px amber-300 outline with 2px offset on every focused element. Uses `!important` to defeat Tailwind preflight's `outline: none` reset. Mouse clicks don't trigger the ring (`:focus-visible` only fires for keyboard / programmatic focus).

---

### [2026-04-30] Vault deduplication inconsistency between per-stage and per-lab IDs

- **Original category:** future-idea
- **Original severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code
- **During:** Tutorial overhaul — Task 7 deferred-item logging
- **Resolved by:** Claude Code (Opus 4.7)
- **Date resolved:** 2026-05-05

**Problem:** The mistake vault dedups on `item.id`. The original entry framed this as a per-stage-vs-per-lab inconsistency between mode call sites. The audit revealed a deeper issue: `DungeonExplore` was calling `recordAnswer({ id, type, correct })` with a single object argument, while the function signature is `(correct, item)`. This meant the dungeon path:

1. Always inflated `totalCorrect` by 1 (the object is truthy regardless of whether the answer was correct).
2. Never wrote to `mistakeVault` (the dedup branch is gated on `item` being defined; `item` was `undefined` in the dungeon path).
3. Never bumped `labsAttempted` (gated on `item._type === 'lab'`).

So the per-stage-vs-per-lab inconsistency wasn't actually surfacing in vault UX — the dungeon mode was silently absent from vault data altogether.

**Resolution:**

- `DungeonExplore.jsx` now calls `recordAnswer(!!correct, q)` with the full quiz item, matching Quiz/Lab mode shape. Dungeon failures now flow into `mistakeVault` via the same `id` dedup as Quiz; per-stage Lab failures continue to dedup at `${labId}_step_${idx}`.
- Added a doc comment on `recordAnswer` in `App.jsx` documenting the contract: `correct` is a literal boolean (not an object), `item` carries the dedup key, and per-stage Lab IDs vs per-question Quiz/Dungeon IDs is intentional. Future call sites can't silently regress to the buggy single-arg shape without tripping the doc.

**Related files:** `dungeon-scholar/src/components/DungeonExplore.jsx` (call site), `dungeon-scholar/src/App.jsx` (`recordAnswer` definition)

**Commit:** *(this commit)*

---

### [2026-04-30] Tutorial action-button steps grant credit before user engages with the opened surface

- **Original category:** design-gotcha
- **Original severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code
- **During:** Tutorial overhaul — Task 7 deferred-item logging
- **Resolved by:** Claude Code (Opus 4.7)
- **Date resolved:** 2026-05-05

**Problem:** Five tutorial steps (`library_tour`, `vault_intro`, `quest_board`, `view_achievements`, `view_titles_levels`) had `autoComplete: false` + `actionLabel`. The action-button click handler in `TutorialPanel` ran `onAction(step.id)` immediately followed by `onAdvance(step.id)`, so the step advanced before the player had any chance to engage with the surface that just opened. A player who closed the modal instantly still received credit.

The original entry filed this as an explicit tradeoff and said "worth revisiting if user feedback suggests players feel confused." Decided to fix it preemptively while we were already in the tutorial code.

**Resolution:**

- All five steps converted to `autoComplete: true` with new `autoCondition` keys: `library_visited`, `vault_visited`, `quests_visited`, `achievements_viewed`, `titles_viewed`. The action button now opens the surface but no longer advances the step — `TutorialPanel`'s existing branch already calls only `onAction` for `autoComplete: true && actionLabel` steps, so no UI change was needed.
- New `tutorialVisits` map on `playerState` (`{ library, vault, quests, achievements, titles }`) — flags persist so a returning user gets credit even after a reload.
- New `tutorialOpenedSurface` local state tracks which surface was just opened by the action button. A `useEffect` watches `screen` / `showAchievements` / `showTitles` and flips the matching `tutorialVisits` flag the moment the surface stops being open. The autoCondition useEffect then advances the step.
- `onAction` updated to set `tutorialOpenedSurface` alongside `setScreen` / `setShow*` for the five action-button steps.

Net behavior: button click → surface opens → player closes/navigates away → step advances. A no-op close still requires the player to actively dismiss, which is the engagement signal the original entry asked for.

**Related files:** `dungeon-scholar/src/tutorial.js` (5 step defs), `dungeon-scholar/src/App.jsx` (DEFAULT_STATE, autoCondition switch + dependencies, onAction dispatch, dismissal effect)

**Commit:** *(this commit)*

---

### [2026-04-30] Plug `migrateTutorialIndex` into the localStorage hydrate path

- **Original category:** future-idea
- **Original severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code
- **During:** Tutorial overhaul — Task 7 deferred-item logging
- **Resolved by:** Claude Code (Opus 4.7)
- **Date resolved:** 2026-05-05

**Problem:** `migrateTutorialIndex` (in `dungeon-scholar/src/tutorial.js`) only fired on the file-import path (`importProgress` in `App.jsx`). The localStorage hydrate path went through `migrateIfNeeded` in `dungeon-scholar/src/services/persistence.js`, which was a no-op stub. Cloud restores carrying a `schema_ver < 1` would not have their stale `tutorialStepIndex` remapped to the post-overhaul TUTORIAL_STEPS layout.

**Resolution:** `services/persistence.js` now imports `migrateTutorialIndex` and `migrateIfNeeded` runs it in a `schemaVer < 1` case:

```js
if (schemaVer < 1 && typeof next.tutorialStepIndex === 'number') {
  next = { ...next, tutorialStepIndex: migrateTutorialIndex(next.tutorialStepIndex) };
}
```

Localstorage hydrate still passes `CURRENT_SCHEMA_VER` (no on-disk version marker exists), so this is a no-op there until a future bump persists `schemaVer` to disk. Cloud-side restores via `cloudSync.js` carry the originating `schema_ver` and will be migrated on hydrate.

**Related files:** `dungeon-scholar/src/services/persistence.js`, `dungeon-scholar/src/tutorial.js`, `dungeon-scholar/src/hooks/usePlayerState.js` (call sites)

**Commit:** `fe964c5`

---

### [2026-04-30] `OLD_TUTORIAL_ORDER` is duplicated in `tutorial.js` and the test file

- **Original category:** design-gotcha, debt
- **Original severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code
- **During:** Tutorial overhaul — Task 7 deferred-item logging
- **Resolved by:** Claude Code (Opus 4.7)
- **Date resolved:** 2026-05-05

**Problem:** The 8-item legacy ID array was defined as `OLD_TUTORIAL_ORDER` (module-private) in `dungeon-scholar/src/tutorial.js` and duplicated as `OLD_ORDER` inside the `migrateTutorialIndex` describe block in the test file. A future rename of a legacy id (e.g., rebranding `enter_dungeon`) would require updating both copies — the test would catch divergence via `>= 0 ? newIdx : 0` fallback vs. the test's expected -1, but the maintenance cost was real.

**Resolution:** `OLD_TUTORIAL_ORDER` is now exported from `src/tutorial.js`. The test imports the canonical array and the parametric assertion in the `migrateTutorialIndex` describe block drives off it, so renaming a legacy id can no longer silently desync test from prod.

**Related files:** `dungeon-scholar/src/tutorial.js` (line ~134), `dungeon-scholar/src/tutorial.test.js`

**Commit:** `fe964c5`

---
