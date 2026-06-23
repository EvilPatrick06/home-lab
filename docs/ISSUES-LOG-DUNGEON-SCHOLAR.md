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

*(none currently logged)*

## Medium

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


## Low

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

### [2026-06-18] Curse/modifier run mechanic is vestigial — `cursed_run`/`double_curse` achievements unreachable

**Severity:** Low
**Category:** debt / dead-content
**Domain:** dungeon-scholar

`DungeonExplore` always records `modifiers: []` on completed runs (the curse/modifier system was never wired up), so the `cursed_run` ("win a run with ≥1 curse active") and `double_curse` ("win with 2 curses active") achievements in `src/game/achievements.js` can never be earned — dead content. Found during PHASE-41 41H while writing the manual QA checklist (which notes "curses/modifiers are vestigial, nothing to test").

**Decision needed:** either reimplement run modifiers (a delve-setup curse picker + tracking active modifiers into the run-history `modifiers` field) OR remove the two unreachable achievements. Not fixed inline — out of PHASE-41's scope.

**Blocked by:** nothing.

---

> dungeon-scholar future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app issues: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
