# PHASE-17 — Dungeon Scholar bug round

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Fix the open correctness bugs in `dungeon-scholar/` (Vite 8 + React 19 study app): setState-updater purity violations that duplicate notifications and re-records under StrictMode (H5 class), the Oracle grader's greedy JSON regex and missing AbortController plumbing (M6/M2), the stale-closure exam-record clobber via `updateTomeProgress` (M4 class, swept across all read-modify-write call sites), the unguarded mistake-vault dedup (M3), silent localStorage write failures (M10), daily-reward clock-rollback double claims (M13), the two shop items whose advertised effects are no-ops (Foresight Scroll, Tinker's Oil), a mid-battle spell-cast crash discovered during verification (`battle.questions` does not exist), and the one residual fork-hostile literal in `docs/supabase-setup.md` (H2 remainder). Three audited config findings (H1, H3, most of H2) were verified already fixed in the live tree and require no work.

## Dependencies & cross-phase notes

- **No prerequisite phases.** PHASE-17 is in the independent 01–19 block of PHASE-INDEX.md.
- **PHASE-18 (ds security round)** touches `dungeon-scholar/src/services/oracleGrader.js` for M9 (oracle endpoint env var). This phase also edits that file (M6 regex, M2 abort semantics). PHASE-18 runs after 17, so 18's executor rebases its expectations on this phase's version; do not move the `ORACLE_ENDPOINT` constant here.
- **PHASE-19 (ds a11y/UX round)** touches `dungeon-scholar/src/App.jsx` and `src/components/DungeonExplore.jsx` for aria-live/feedback work. Keep this phase's edits surgical (no broad reformatting) so 19's plan citations stay findable by symbol name.
- **PHASE-39 (ds architecture)** will split `App.jsx` (now 10,875 lines) into feature modules. All `App.jsx` line numbers below WILL drift again by then — every fix in this phase is cited by both line and enclosing symbol so 39 can relocate them. The pre-existing `vite build` chunk-size warning is owned by 39 — do not chase it here.
- **PHASE-40** owns cloudSync conflict tests (L18) and defensive copies (L15); this phase's `updateTomeProgress` functional-form sweep reduces (but does not remove) the conflict surface 40 will test.

## Verified findings

All verification was performed 2026-06-10 against the live tree. `dungeon-scholar/src/App.jsx` is **10,875 lines** (the audit was written against a 9,278-line file — every audit line number had drifted; the citations below are current). Baseline: `cd dungeon-scholar && npm ci && npx vitest run` → 24 files / 346 tests, all green; `npx vite build` succeeds (pre-existing >500 kB chunk warning, owned by PHASE-39). The app is wrapped in `<React.StrictMode>` (`dungeon-scholar/src/main.jsx:7`), so dev-mode double-invocation of updater functions is active.

### F1 (H5) — Achievement/record side effects fired from inside setState updaters

**Status: confirmed, plus three more instances of the same class in the same file.**

React StrictMode double-invokes "functions that you pass to useState, set functions, useMemo, or useReducer" in development to surface impurity; updaters must be pure even in production because concurrent rendering may replay them.

Instances (all `dungeon-scholar/src/App.jsx`):

1. **QuizMode `handleAnswer`** (App.jsx:5304–5323): inside the `setStreak(s => …)` updater (5314–5321), `checkAchievement('streak_10' / 'perfectionist' / 'streak_50' / 'streak_100')` is called. `checkAchievement` (App.jsx:2194–2207) calls `setPlayerState` and schedules `showNotif` — side effects inside a pure updater. Dev double-invoke → duplicate achievement toasts.
2. **QuizMode `overrideVerdict`** (App.jsx:5344–5360): inside the `setAnswered(prev => …)` updater it calls `recordAnswer(newCorrect, q)`, `awardXP(10)`, `setStreak(1)`/`setStreak(0)`. Double-invoke double-records the override (inflates `totalAnswered`/`totalCorrect` via `recordAnswer`'s own functional update).
3. **`checkAchievement`** (App.jsx:2194–2207) and **`unlockSpecialTitle`** (App.jsx:2209–2216): each schedules `setTimeout(() => showNotif(…))` from *inside* its own `setPlayerState` updater. Double-invoke → duplicate toasts even when called from a legal place.
4. **`updateProgress`** (App.jsx:1706–1751): the level-up path inside the `setPlayerState` updater schedules `showNotif` for the level-up itself (line 1746) and for level/XP milestone achievements (lines 1732, 1743). Same impurity.

The volume/accuracy checks inside `recordAnswer` (App.jsx:2229+) are **safe** — they mutate the local `next` draft inside one updater and call no external setters (the audit's note on this was re-confirmed). The LabMode `overrideVerdict` (App.jsx:5852–5854) is also safe (pure `setFeedback` updater).

Verification commands:

```bash
grep -n "setStreak(s => {" dungeon-scholar/src/App.jsx              # 5314
sed -n '5304,5360p' dungeon-scholar/src/App.jsx                     # handleAnswer + overrideVerdict
sed -n '2194,2216p' dungeon-scholar/src/App.jsx                     # checkAchievement + unlockSpecialTitle
sed -n '1706,1751p' dungeon-scholar/src/App.jsx                     # updateProgress notifs in updater
grep -n "StrictMode" dungeon-scholar/src/main.jsx                   # line 7
```

### F2 (M5) — ExamMode timer submit-from-updater: ALREADY FIXED (no work)

The audit said `submitExamRef.current?.('timeout')` fired inside the `setSecondsLeft` updater. **The live code no longer does this.** `dungeon-scholar/src/components/ExamMode.jsx:120–132`: the timer effect's `tick()` computes `remaining` from `deadlineMsRef.current`, calls `setSecondsLeft(remaining)` with a plain value, and invokes `submitExamRef.current?.('timeout')` *outside* any updater. Verified:

```bash
sed -n '120,132p' dungeon-scholar/src/components/ExamMode.jsx
```

No sub-phase needed. (A theoretical double-submit if two ticks land at 0 before the phase flips is bounded by `setInterval` 1 s vs same-tick `setPhase('results')`; not worth a guard.)

### F3 (M4) — `updateTomeProgress` read-modify-write clobbers via stale render closures

**Status: confirmed.** `updateTomeProgress(updates)` (App.jsx:1753–1765) only accepts a plain object and spreads it over `t.progress` inside its own functional `setPlayerState`. Every caller that *derives* the patch from the render-time `tomeProgress` prop can clobber concurrent changes (Supabase Realtime / BroadcastChannel updates applied mid-flow by `usePlayerState.applyRemoteState`, hooks/usePlayerState.js:108–122). The flagship case is the exam record: `ExamMode.jsx:109–110` — `const prior = Array.isArray(tomeProgress?.practiceExams) ? tomeProgress.practiceExams : []; updateTomeProgress?.({ practiceExams: [...prior, record].slice(-20) })` — `prior` is captured at exam-start render; a Realtime update during the exam is silently overwritten on submit. (Note: the live code added `.slice(-20)` since the audit.)

Full inventory of read-modify-write call sites (verified by `grep -n "updateTomeProgress(" dungeon-scholar/src/App.jsx dungeon-scholar/src/components/*.jsx`):

| Site | Location | Stale base |
|---|---|---|
| Exam record append | `components/ExamMode.jsx:109–110` (`doSubmit`) | `tomeProgress.practiceExams` |
| Run counters | `components/DungeonExplore.jsx:3488–3492` (`finishRun`) | `tomeProgress.runsCompleted/bossesDefeated` |
| Run history append | `components/DungeonExplore.jsx:3530–3534` (`finishRun`) | `tomeProgress.runHistory` |
| Quiz counter | `App.jsx:5307–5308` (`handleAnswer`), `App.jsx:5366–5368` (`handleSkip`) | `tomeProgress.quizAnswered` |
| Card counter | `App.jsx:4945–4946` (FlashcardsMode `rate`) | `tomeProgress.cardsReviewed` |
| Lab progress map | `App.jsx:5760–5765` (`writeLabProgress`), `App.jsx:5781–5787` (`submitStep` completion), `App.jsx:5813–5818` (MC-step completion) | `tomeProgress.labProgress/labsCompleted` |
| Chat history | `App.jsx:6038–6042` (`setMessages`), `6213–6218` (send), `6224` (search result), `6265` (assistant reply), `6275–6280` (fallback) | `tomeProgress.chatHistory/oracleMessages` |

(`clearChat` at App.jsx:6286 writes an absolute value — fine as-is.)

### F4 (M3) — Mistake-vault dedup without an ID-presence guard

**Status: confirmed; line drift only (audit said 2079–2095, now 2290–2306).** In `recordAnswer` (App.jsx:2229+), the wrong-answer branch (App.jsx:2290–2306) does `const existing = (t.progress?.mistakeVault || []).find(m => m.id === item.id); if (existing) return t;` then appends `{ ...item, addedAt: Date.now() }`. With a malformed tome whose items lack `id`, `item.id` is `undefined`: the first id-less mistake is stored with `id: undefined`, and *every subsequent id-less mistake matches it* and is silently dropped — distinct mistakes alias each other and never reach the vault. Verified:

```bash
sed -n '2290,2306p' dungeon-scholar/src/App.jsx
```

### F5 (M2) — Oracle grading has no AbortController; verdicts land after leaving the mode

**Status: confirmed; two call sites (audit's "Dungeon fillblank" third site does not exist).** `gradeAnswer` (`dungeon-scholar/src/services/oracleGrader.js:90–157`) accepts an `args.signal` (JSDoc line ~86, destructured at 95) and passes it to `fetchImpl`. Neither caller passes one:

- QuizMode `submitFillBlankWithOracle` (App.jsx:5325–5341)
- LabMode `submitTextWithOracle` (App.jsx:5833–5849)

Leaving the mode mid-grade still resolves the promise and fires `handleAnswer(...)` / `submitStep(...)`, which call the App-level `recordAnswer`/`updateTomeProgress`/`checkAchievement`/`awardXP` — i.e. progress is mutated for a question the user abandoned. Worse, **abort today would not even help**: every `catch` inside `gradeAnswer` (network at 113–115, body-read at 130–136, json at 139–143) swallows `AbortError` and returns a *fallback string-match verdict*, so an aborted request still grades. DungeonExplore does NOT use `gradeAnswer` (its battles are MC/TF only — `grep -n "gradeAnswer" dungeon-scholar/src/components/DungeonExplore.jsx` → no hits); the header comment in oracleGrader.js claiming "Dungeon fillblank challenges" is stale. Verified:

```bash
grep -n "signal" dungeon-scholar/src/services/oracleGrader.js
grep -rn "gradeAnswer" dungeon-scholar/src --include=*.jsx
sed -n '5325,5341p' dungeon-scholar/src/App.jsx
sed -n '5833,5849p' dungeon-scholar/src/App.jsx
```

### F6 (M6) — Greedy regex in `extractJsonVerdict` breaks on multi-JSON output

**Status: confirmed.** `oracleGrader.js:49–65`: `const match = text.match(/\{[\s\S]*\}/)` grabs from the FIRST `{` to the LAST `}`. If the model wraps a prose example JSON before the real verdict (or emits any second object), the captured span is a non-parsing concatenation → `JSON.parse` throws → `extractJsonVerdict` returns null → silent fallback to local string-match (`fallbackResult`, reason `'unparseable verdict'`) — the user is graded by substring matching even though the Oracle returned a valid verdict. Verified:

```bash
sed -n '49,65p' dungeon-scholar/src/services/oracleGrader.js
```

### F7 (M10) — localStorage write failures silently swallowed

**Status: confirmed.** Two silent catches:

- `services/persistence.js:28–35` `saveToLocalStorage`: `catch { /* Quota exceeded or unavailable — silent. … */ }`. Consumers: `hooks/usePlayerState.js` lines 114 (`applyRemoteState`), 152 (`flushLocal`), 171 (debounced `setState` save); flushes also fire from beforeunload/visibilitychange/blur (usePlayerState.js:224–238). Private-mode or full-quota users lose all progress on refresh with zero warning.
- `audio/sound.js:44–48` `saveSettings`: `catch { /* quota / private mode — best effort */ }`.

`usePlayerState` returns `[state, setState, sync]` where `sync = { mergeRequired, localPreview, cloudPreview, resolveMerge, status, lastSyncedAt }` (usePlayerState.js:412–413); App consumes it at App.jsx:1344 and owns the toast system (`showNotif`, App.jsx:1668–1678). Verified:

```bash
sed -n '28,35p' dungeon-scholar/src/services/persistence.js
sed -n '44,48p' dungeon-scholar/src/audio/sound.js
grep -n "saveToLocalStorage(" dungeon-scholar/src/hooks/usePlayerState.js   # 114, 152, 171
grep -n "return \[state, setState, sync\]" dungeon-scholar/src/hooks/usePlayerState.js
```

### F8 (M13) — Daily-reward clock-rollback / future-date edge cases

**Status: confirmed; line drift (audit said 1752–1784, now 1963–1996).** `claimDailyReward` (App.jsx:1963–1996) blocks same-day double claims via `playerState.lastClaimedDate === today` (YYYY-MM-DD from `todayDateStr`, `services/devotion.js:24–27`). A clock rollback across midnight (claim on day X, set clock to day X−1) makes `today ≠ lastClaimedDate` → claim allowed again (gap = −1 → streak resets to 1, but the double payout succeeds). A *future* `lastClaimedDate` (corrupt import) resets the streak once, then self-heals on the first claim (the audit's "forever" framing was already retracted in the audit itself). There is no monotone fence — nothing stores claim time in epoch ms. Additionally the gap/streak/cycle computation is **triplicated**: `claimDailyReward` (App.jsx:1968–1970), the pure helper `computeNextClaim` (devotion.js:41–51, currently used only by tests/preview logic), and `CalendarScreen` (App.jsx:8918–8929). Verified:

```bash
sed -n '1963,1996p' dungeon-scholar/src/App.jsx
sed -n '24,51p' dungeon-scholar/src/services/devotion.js
sed -n '8918,8929p' dungeon-scholar/src/App.jsx
```

### F9 — Foresight Scroll + Tinker's Oil are sold/craftable but their effects are no-ops

**Status: confirmed.** `App.jsx:506` sells `foresight_scroll` ("Reveal the category of the next riddle before it is posed.", `effect: 'preview_next'`, 40 g) and `App.jsx:509` sells `tinkers_oil` ("Restore a spent power-up (50/50 or Hint) within a delve.", `effect: 'refill_powerup'`, 45 g). Both are craftable (App.jsx:714–715) and `foresight_scroll` is the Day-5 daily reward (devotion.js:16) and a chest/plant drop (`DungeonExplore.jsx:376,409`). In `DungeonExplore.jsx:30–31`, `POTION_EFFECTS` maps both to `{ kind: 'noop' }`; `usePotion`'s `case 'noop': default:` (DungeonExplore.jsx:3025–3029) sets `acted = true`, which **consumes the item** (line 3031 `consumeItem(itemId)`), plays the pickup sfx, and shows "Drained: <label>" — the player pays, the item is destroyed, the advertised effect never happens. The strings `preview_next`/`refill_powerup` appear nowhere else in src (`grep -rn "preview_next\|refill_powerup" dungeon-scholar/src` → only App.jsx:506,509). The "50/50 or Hint" power-ups referenced by Tinker's Oil belonged to the **old wave-based delve and no longer exist** (the top-down delve replaced them; its in-run resources are HP/shields/mana). Verified:

```bash
sed -n '24,32p' dungeon-scholar/src/components/DungeonExplore.jsx
sed -n '3025,3033p' dungeon-scholar/src/components/DungeonExplore.jsx
grep -rn "preview_next\|refill_powerup" dungeon-scholar/src
```

Relevant machinery for the fix: battle objects are created with shape `{ type: 'boss'|'mob', currentQuestion, correctCount, maxHp, … }` (DungeonExplore.jsx:3266 boss, 3282 mob); follow-up questions are pulled in `onBattleAnswer` (3407–3410 mob, 3421–3424 boss); mana state `const [mana, setMana] = useState(maxMana)` at 2727–2728 with `maxMana = playerState?.maxMana ?? 3`, reset in the regen effect at 2781–2800; `usePotion` is at 2967–3036 and only runs outside battle (`if (phase !== 'world' || runState !== 'alive' || battle) return;`); `BattleModal` component at 2277–2296 (reads `battle.currentQuestion`), rendered at 4211–4225.

### F10 — NEW (found during verification): casting Bolt of Truth / Sigil of Clarity mid-battle crashes

**Status: new bug, untracked anywhere (audit, issue logs, other phase plans).** `castSpell`'s `auto_correct` case (DungeonExplore.jsx:2926–2935) and `reveal_answer` case (2936–2956) both read `const q = battle.questions[battle.questionIdx];` — but battle objects have **no `questions` array and no `questionIdx`** (shape verified in F9). `battle.questions` is `undefined`, so the index access throws `TypeError: Cannot read properties of undefined` the moment either spell is cast during a battle — which is the only time those spells pass their `if (!battle)` guard. Both in-battle spells are therefore 100 % broken (crash in the click/hotkey handler). The fix is `battle.currentQuestion`. Verified:

```bash
grep -n "battle.questions" dungeon-scholar/src/components/DungeonExplore.jsx   # 2928, 2938
grep -n "currentQuestion:" dungeon-scholar/src/components/DungeonExplore.jsx   # 3266, 3282, 3410, 3424
```

### F11 (H3) — deploy.yml branch trigger: ALREADY FIXED (no work)

`.github/workflows/deploy.yml:5` is now `branches: [main, master]`. Verified: `sed -n '1,10p' .github/workflows/deploy.yml`.

### F12 (H1) — vite base path: ALREADY FIXED (no work)

`dungeon-scholar/vite.config.js:11` is now `const BASE = process.env.VITE_BASE || '/dungeon-scholar/'` with a full explanatory comment (owner's deploy sets `VITE_BASE=/home-lab/` via repo secret). Verified: `sed -n '1,15p' dungeon-scholar/vite.config.js`.

### F13 (H2) — supabase-setup.md fork-hostile literals: MOSTLY FIXED, one residual

The doc now opens with a placeholder/worked-example preamble (`dungeon-scholar/docs/supabase-setup.md:6–19`) and Step 3 uses `https://<your-username>.github.io/<your-repo>/` with the owner URL as an "(e.g. …)" (lines 66–67). **Residual:** Step 5 (lines 83–88) still shows ONLY the literal `https://evilpatrick06.github.io/home-lab/` for Site URL and Redirect URLs, with no inline placeholder — a fork copy-pasting Step 5 verbatim gets silently broken OAuth (Supabase rejects mismatched redirect URIs without surfacing an error to the app). Verified:

```bash
grep -n "evilpatrick06" dungeon-scholar/docs/supabase-setup.md   # 12, 18, 67, 84, 87
sed -n '81,90p' dungeon-scholar/docs/supabase-setup.md
```

## Sub-phases

> All paths below are relative to the repo root. dungeon-scholar has no lint script and no tsc; the cheap per-sub-phase check is the targeted vitest file plus, for `App.jsx` edits, `npx vite build` (no test imports `App.jsx`, so the build is the only automated syntax/parse gate for it — verified: `grep -rn "from './App" dungeon-scholar/src --include=*.test.*` → no hits). Run vitest/build from `dungeon-scholar/`. If `dungeon-scholar/node_modules` is missing in the worktree, run `cd dungeon-scholar && npm ci` first.

### 17A — oracleGrader: balanced JSON extraction (M6) + abort semantics (M2 service half)

**Objective:** the grader parses the correct verdict object out of multi-JSON model output, and an aborted request propagates as an abort instead of degrading into a fallback verdict.

**Files:** `dungeon-scholar/src/services/oracleGrader.js`, `dungeon-scholar/src/services/oracleGrader.test.js`.

**Steps:**

1. Replace `extractJsonVerdict`'s regex (line 52) with a balanced-brace scanner. Add a module-private helper:

   ```js
   // Collect every balanced top-level {...} block in the text. String-aware so
   // braces inside JSON string values don't break the depth count.
   const collectBalancedJsonBlocks = (text) => {
     const blocks = [];
     let depth = 0;
     let start = -1;
     let inString = false;
     let escaped = false;
     for (let i = 0; i < text.length; i++) {
       const ch = text[i];
       if (inString) {
         if (escaped) escaped = false;
         else if (ch === '\\') escaped = true;
         else if (ch === '"') inString = false;
         continue;
       }
       if (ch === '"' && depth > 0) { inString = true; continue; }
       if (ch === '{') { if (depth === 0) start = i; depth++; }
       else if (ch === '}' && depth > 0) {
         depth--;
         if (depth === 0 && start >= 0) { blocks.push(text.slice(start, i + 1)); start = -1; }
       }
     }
     return blocks;
   };
   ```

2. Rewrite `extractJsonVerdict`: first try `JSON.parse(text.trim())` directly (fast path for compliant single-object output, including objects whose `feedback` mentions braces); on failure, run `collectBalancedJsonBlocks`, `JSON.parse` each candidate, keep those where `typeof parsed.correct === 'boolean'`, and return the **last** such verdict (a prose-wrapped example precedes the real verdict; the final object is the model's actual answer). Preserve the existing normalization (`correct: !!parsed.correct`, `feedback` string-or-empty). Return `null` when no candidate qualifies (existing fallback path unchanged).
3. Abort semantics: in `gradeAnswer`, make every `catch` rethrow aborts before falling back. At the network catch (currently lines 113–115), the `!response.ok` body-read catch (130–136), and the `response.json()` catch (139–143), add as the first line:

   ```js
   if (signal?.aborted || err?.name === 'AbortError') throw err;
   ```

   (The body-read catch currently has no `err` binding — give it one.) Document in the JSDoc: "Rejects with `AbortError` when `signal` aborts; all other failures resolve to a fallback verdict."
4. Fix the stale header comment (lines 1–3): drop "and Dungeon fillblank challenges" — the dungeon's battles are MC/TF and never call `gradeAnswer` (F5).
5. Tests (extend `oracleGrader.test.js`, follow its existing `fetchImpl` stub style):
   - prose + example JSON + real verdict → returns the LAST verdict (`correct` from the second object, `source: 'oracle'`);
   - verdict whose `feedback` contains `{` and `}` inside the string → parses;
   - fenced ```` ```json ```` block → parses (balanced scan ignores the fences);
   - no parsable verdict → falls back with `fallbackReason: 'unparseable verdict'` (existing behavior pinned);
   - `fetchImpl` rejecting with `new DOMException('Aborted', 'AbortError')` → `gradeAnswer` REJECTS (use `await expect(...).rejects.toThrow()`), does NOT resolve to a fallback;
   - non-abort network rejection still resolves to fallback (regression pin).

**Cheap check:** `cd dungeon-scholar && npx vitest run src/services/oracleGrader.test.js`.

**Acceptance:** all new tests green; no caller changes yet (callers don't pass `signal`, so runtime behavior is unchanged until 17B).

### 17B — Wire AbortController into QuizMode + LabMode oracle submits (M2 component half)

**Objective:** navigating away mid-grade cancels the request and prevents any post-unmount recording.

**Files:** `dungeon-scholar/src/App.jsx` (QuizMode + LabMode function components).

**Steps:**

1. **QuizMode** (component starts App.jsx:5105): add `const gradeAbortRef = useRef(null);` next to the `grading` state (5126). Add an unmount cleanup: `useEffect(() => () => { gradeAbortRef.current?.abort(); }, []);`. Rewrite `submitFillBlankWithOracle` (5325–5341):

   ```js
   const submitFillBlankWithOracle = async () => {
     if (!textAnswer.trim() || grading) return;
     gradeAbortRef.current?.abort();
     const controller = new AbortController();
     gradeAbortRef.current = controller;
     setGrading(true);
     let verdict;
     try {
       verdict = await gradeAnswer({
         question: q.question,
         expectedAnswer: q.correctAnswer,
         acceptedAnswers: q.acceptedAnswers,
         userAnswer: textAnswer,
         signal: controller.signal,
       });
     } catch (err) {
       if (controller.signal.aborted || err?.name === 'AbortError') return; // unmounted / superseded — record nothing
       throw err;
     }
     if (controller.signal.aborted) return;
     setGrading(false);
     handleAnswer(verdict.correct, { oracleFeedback: verdict.feedback, source: verdict.source, fallbackReason: verdict.fallbackReason });
   };
   ```

2. **LabMode** (component starts App.jsx:5671): same pattern for `submitTextWithOracle` (5833–5849) — abort ref, unmount cleanup, and additionally abort when the player leaves the lab detail view: `useEffect(() => () => { gradeAbortRef.current?.abort(); }, [selectedLab]);` (cleanup-only effect; aborts the in-flight grade when `selectedLab` changes or unmounts). On the success path call `submitStep(verdict.correct, { awaitContinue: true, … })` exactly as today.
3. Do not touch ChatMode's fetch here (no recording side effects beyond chat history; out of this finding's scope).

**Cheap check:** `cd dungeon-scholar && npx vite build` (App.jsx parse gate). No new unit test — the gradeAnswer abort contract is covered in 17A; component wiring is exercised via the build plus manual flow.

**Acceptance:** abort path returns without calling `handleAnswer`/`submitStep`/`setGrading`; resubmitting while a grade is in flight aborts the previous request.

### 17C — setState-updater purity sweep (H5)

**Objective:** no setState updater in App.jsx calls other setters or schedules notifications; achievement/title/level toasts are derived from state transitions in effects, exactly once.

**Files:** `dungeon-scholar/src/App.jsx`.

**Steps:**

1. **Central achievement-toast effect.** In `DungeonScholarApp` (App.jsx:1321+), near `checkAchievement` (2194), add:

   ```js
   // Achievement toasts derive from state transitions so updaters stay pure
   // (StrictMode double-invokes updaters; toasts fired inside them duplicate).
   const seenAchievementsRef = useRef(null);
   useEffect(() => {
     const current = playerState.achievements || [];
     if (seenAchievementsRef.current === null) {
       seenAchievementsRef.current = new Set(current); // mount: no toast spam for loaded saves
       return;
     }
     for (const id of current) {
       if (seenAchievementsRef.current.has(id)) continue;
       seenAchievementsRef.current.add(id);
       const ach = ACHIEVEMENTS.find(a => a.id === id);
       if (ach) showNotif(`Achievement Unlocked: ${ach.name} (+${ACHIEVEMENT_GOLD} gold)`, 'achievement', () => setShowAchievements(true));
     }
   }, [playerState.achievements]);
   ```

   Note: the milestone achievements added by `updateProgress` do not pay `ACHIEVEMENT_GOLD` today and their old toast omitted the gold suffix; unifying on one message is an accepted minor copy change (toast text only, no economy change).
2. **`checkAchievement`** (2194–2207): reduce to a pure state update — keep the `includes` guard and the `gold` award inside the updater, DELETE the `setTimeout(showNotif…)` (the effect from step 1 now toasts).
3. **`unlockSpecialTitle`** (2209–2216): same treatment with a parallel `seenTitlesRef` + effect on `playerState.unlockedTitles` toasting `Title Unlocked: ${SPECIAL_TITLES[id].name}` with `() => setShowTitles(true)`. (The mount-set initialization also stops the previously-silent `updateProgress` TITLES auto-unlocks from suddenly toasting historical titles; new title adds will toast — acceptable and more correct.)
4. **`updateProgress`** (1706–1751): DELETE all three `setTimeout(showNotif…)` calls inside the updater (milestone achievements ×2, level-up ×1) — milestones are covered by step 1's effect. For the level-up toast add:

   ```js
   const prevLevelRef = useRef(playerState.level);
   useEffect(() => {
     if (playerState.level > prevLevelRef.current) {
       showNotif(`Level Up! You are now Level ${playerState.level}`, 'levelup');
     }
     prevLevelRef.current = playerState.level;
   }, [playerState.level]);
   ```

   Leave the state mutations (titles array, achievements array, while-loop level math) untouched.
5. **QuizMode `handleAnswer`** (5304–5323): hoist the streak math out of the updater:

   ```js
   if (correct) {
     checkAchievement('first_quiz');
     awardXP(10 + streak);
     const ns = streak + 1;
     setStreak(ns);
     if (ns >= 10) checkAchievement('streak_10');
     if (ns >= 25) checkAchievement('perfectionist');
     if (ns >= 50) checkAchievement('streak_50');
     if (ns >= 100) checkAchievement('streak_100');
   } else setStreak(0);
   ```

   (`streak` from the render closure is current inside this event handler — the adjacent `awardXP(10 + streak)` already relies on it. A `useEffect([streak])` variant was rejected: session restore calls `setStreak(saved.streak)` at App.jsx:5178 and would re-fire checks on restore; harmless but noisier.)
6. **QuizMode `overrideVerdict`** (5344–5360): hoist all side effects out of the `setAnswered` updater:

   ```js
   const overrideVerdict = (newCorrect) => {
     if (!answered || answered.correct === newCorrect) return;
     recordAnswer(newCorrect, q);
     if (newCorrect) { awardXP(10); setStreak(1); }
     else { setStreak(0); }
     setAnswered(prev => (prev ? { ...prev, correct: newCorrect, overridden: true } : prev));
   };
   ```

7. Sweep check — confirm no remaining cross-setter or `showNotif` calls inside any updater: `grep -n "setTimeout(() => showNotif" dungeon-scholar/src/App.jsx` and manually confirm each remaining hit (e.g. `claimDailyReward`'s at ~1993 is AFTER its `setPlayerState`, outside the updater — legal) is not inside an updater body.

**Cheap check:** `cd dungeon-scholar && npx vite build`.

**Acceptance:** zero `showNotif`/`checkAchievement`/`recordAnswer`/`awardXP`/`setStreak` calls inside any setState updater function body in App.jsx; achievement/title/level toasts still appear exactly once per unlock (StrictMode dev included).

### 17D — `updateTomeProgress` functional form + read-modify-write sweep (M4)

**Objective:** patches derived from current progress are computed inside the state update, immune to stale render closures.

**Files:** `dungeon-scholar/src/App.jsx`, `dungeon-scholar/src/components/ExamMode.jsx`, `dungeon-scholar/src/components/DungeonExplore.jsx`.

**Steps:**

1. Extend `updateTomeProgress` (App.jsx:1753–1765) to accept a function of the previous progress (must be pure — it runs inside the `setPlayerState` updater):

   ```js
   const updateTomeProgress = (updates) => {
     setPlayerState(prev => {
       if (!prev.activeTomeId) return prev;
       return {
         ...prev,
         library: prev.library.map(t => {
           if (t.id !== prev.activeTomeId) return t;
           const patch = typeof updates === 'function' ? updates(t.progress || {}) : updates;
           return { ...t, progress: { ...t.progress, ...patch } };
         }),
       };
     });
   };
   ```

2. Convert every read-modify-write call site from the F3 table to the functional form. Exact conversions:
   - `ExamMode.jsx:109–110` → `updateTomeProgress?.((prev) => ({ practiceExams: [...(Array.isArray(prev.practiceExams) ? prev.practiceExams : []), record].slice(-20) }));` and delete the `prior` const.
   - `DungeonExplore.jsx:3488–3492` → `updateTomeProgress((prev) => ({ runsCompleted: (prev.runsCompleted || 0) + 1, bossesDefeated: (prev.bossesDefeated || 0) + 1 }));` (keep the `if (updateTomeProgress)` guard).
   - `DungeonExplore.jsx:3530–3534` → `updateTomeProgress((prev) => ({ runHistory: [...(prev.runHistory || []), entry].slice(-100) }));`
   - `App.jsx:5307–5308` (handleAnswer) and `5366–5368` (handleSkip) → `updateTomeProgress((prev) => ({ quizAnswered: (prev.quizAnswered || 0) + 1 }));` — keep the existing `newQuizCount` const (computed from `tomeProgress`) solely for the `quiz_warrior` threshold check above it.
   - `App.jsx:4945–4946` (FlashcardsMode `rate`) → `updateTomeProgress((prev) => ({ cardsReviewed: (prev.cardsReviewed || 0) + 1 }));`
   - `App.jsx:5760–5765` (`writeLabProgress`) → `updateTomeProgress((prev) => ({ labProgress: { ...(prev.labProgress || {}), [selectedLab.id]: entry } }));`
   - `App.jsx:5781–5787` and `5813–5818` (lab completion writes) → `updateTomeProgress((prev) => ({ labsCompleted: (prev.labsCompleted || 0) + 1, labProgress: { ...(prev.labProgress || {}), [selectedLab.id]: { step: steps.length, completed: true, completedAt: Date.now() } } }));` — note `completedAt: Date.now()` becomes impure inside the updater: hoist `const completedAt = Date.now();` ABOVE the `updateTomeProgress` call and reference it.
   - ChatMode: `App.jsx:6038–6042` (`setMessages`) → pass through: `updateTomeProgress((prev) => ({ chatHistory: typeof updater === 'function' ? updater(prev.chatHistory || []) : updater }));`; `6213–6218` → `updateTomeProgress((prev) => ({ chatHistory: [...(prev.chatHistory || []), userMsg], oracleMessages: (prev.oracleMessages || 0) + 1 }));` (where `userMsg` is the message object the existing code appended via `newMessages`; keep `newMessages`/`newOracleCount` consts for the request payload and the `oracle_friend` check); `6224`, `6265`, `6275–6280` → append to `prev.chatHistory` instead of `newMessages` for the WRITE while still sending `newMessages` to the model. `clearChat` (6286) stays object-form.
3. Update the `updateTomeProgress` doc comment to state both forms and the purity requirement for the functional form.

**Cheap check:** `cd dungeon-scholar && npx vite build && npx vitest run src/components/DungeonExplore.test.js`.

**Acceptance:** `grep -n "updateTomeProgress(" dungeon-scholar/src/App.jsx dungeon-scholar/src/components/*.jsx` shows no remaining call whose patch spreads/array-appends a value read from the render-time `tomeProgress` prop (absolute writes like `clearChat` and `setTomeExamDate` excepted).

### 17E — Mistake-vault ID guard (M3) + daily-reward monotone fence (M13)

**Objective:** id-less mistakes stop aliasing each other; a clock rollback cannot double-pay the daily reward; the claim/preview math has one implementation.

**Files:** `dungeon-scholar/src/App.jsx`, `dungeon-scholar/src/services/devotion.js`, `dungeon-scholar/src/services/devotion.test.js`.

**Steps:**

1. **M3** — in `recordAnswer`'s vault branch (App.jsx:2290–2306), change the map callback's dedup block to guard on id presence first:

   ```js
   if (t.id !== prev.activeTomeId) return t;
   if (!item.id) return t; // malformed tome item without an id — never vault it (id-less entries alias each other)
   const existing = (t.progress?.mistakeVault || []).find(m => m.id === item.id);
   ```

   (Dropping id-less items entirely is the audit-recommended behavior: the vault UI and the de-vault flow at App.jsx:2369/2395–2406 key on `m.id`, so an id-less entry could never be redeemed anyway.)
2. **M13** — add a pure claim evaluator to `services/devotion.js`:

   ```js
   // Pure claim decision. `now` is epoch ms; `lastClaimedAt` is the epoch-ms
   // monotone fence stored at the previous claim (null for legacy saves).
   // A small backward clock step (< 48 h) refuses the claim — prevents the
   // rollback-across-midnight double claim. A fence further than 48 h in the
   // future is treated as corrupt (bad import) and the claim self-heals.
   export const CLOCK_SKEW_LIMIT_MS = 48 * 60 * 60 * 1000;
   export const evaluateClaim = ({ now, today, lastClaimedDate, lastClaimedAt, loginStreak }) => {
     if (lastClaimedDate === today) {
       return { ok: false, reason: "Thou hast already claimed today's devotion." };
     }
     if (typeof lastClaimedAt === 'number'
         && now < lastClaimedAt
         && (lastClaimedAt - now) < CLOCK_SKEW_LIMIT_MS) {
       return { ok: false, reason: 'The hourglass runs backward — devotion must wait for time to catch up.' };
     }
     const { willStreak, cycleDay } = computeNextClaim(today, lastClaimedDate, loginStreak || 0);
     return { ok: true, newStreak: willStreak, cycleDay };
   };
   ```

3. Rewrite `claimDailyReward` (App.jsx:1963–1996) to delegate: `const res = evaluateClaim({ now: Date.now(), today, lastClaimedDate: playerState.lastClaimedDate, lastClaimedAt: playerState.lastClaimedAt, loginStreak: playerState.loginStreak });` — early-return `res` when `!res.ok`; otherwise use `res.cycleDay`/`res.newStreak` for the reward lookup and persist `lastClaimedAt: Date.now()` alongside `lastClaimedDate: today` in the `setPlayerState` patch. Remove the now-duplicated inline gap/streak math (1968–1970). Add `lastClaimedAt: null` to the devotion block of `DEFAULT_STATE` (App.jsx:1274–1280); legacy saves without the field pass the `typeof` check and behave as before.
4. Refactor `CalendarScreen`'s preview math (App.jsx:8918–8929) to call `computeNextClaim(today, playerState.lastClaimedDate, streak)` instead of recomputing `gap`/`willStreak`/`cycleDayIdx` by hand (claimedToday handling is already inside `computeNextClaim`).
5. Tests in `devotion.test.js`: `evaluateClaim` — same-day refusal; normal next-day claim (streak +1); gap > 1 resets to 1; rollback within 48 h refused (`now < lastClaimedAt`); fence ≥ 48 h in future allowed + streak 1 (corrupt-import self-heal); legacy save (`lastClaimedAt: undefined`) claims normally; preview/claim parity (same `cycleDay` as `computeNextClaim`).

**Cheap check:** `cd dungeon-scholar && npx vitest run src/services/devotion.test.js && npx vite build`.

**Acceptance:** all new devotion tests green; claiming, rolling the clock back across midnight, and claiming again is refused; vault never stores or matches an `undefined` id.

### 17F — Surface localStorage write failures (M10)

**Objective:** a private-mode/full-quota user gets one clear toast instead of silently losing progress on every refresh.

**Files:** `dungeon-scholar/src/services/persistence.js`, `dungeon-scholar/src/services/persistence.test.js`, `dungeon-scholar/src/hooks/usePlayerState.js`, `dungeon-scholar/src/audio/sound.js`, `dungeon-scholar/src/App.jsx`.

**Steps:**

1. `persistence.js` — add the cross-browser quota detector (DOMException name/code matrix) and make `saveToLocalStorage` report:

   ```js
   export function isQuotaExceededError(err) {
     return (
       err instanceof DOMException &&
       (err.code === 22 ||                       // most browsers
        err.code === 1014 ||                     // legacy Firefox
        err.name === 'QuotaExceededError' ||
        err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
     );
   }

   export function saveToLocalStorage(state) {
     try {
       const payload = { ...(state || {}), __schemaVer: CURRENT_SCHEMA_VER };
       localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
       return { ok: true };
     } catch (err) {
       // Quota exceeded or storage unavailable (private mode). Cloud / Export
       // still work — callers decide whether to surface this.
       return { ok: false, quota: isQuotaExceededError(err) };
     }
   }
   ```

   (Existing callers ignore the return value — no breakage.)
2. `usePlayerState.js` — add `const [localSaveFailed, setLocalSaveFailed] = useState(false);` and a tiny helper `const noteSaveResult = (res) => { if (res && res.ok === false) setLocalSaveFailed(true); };` Apply it at all three `saveToLocalStorage` call sites (lines 114, 152, 171): `noteSaveResult(saveToLocalStorage(...))`. The flag is sticky (never reset) — that IS the de-dupe. Expose it on the sync object (line 412): `const sync = { mergeRequired, localPreview, cloudPreview, resolveMerge, status, lastSyncedAt, localSaveFailed };`
3. `App.jsx` — one-shot toast effect near the `usePlayerState` call (1344):

   ```js
   useEffect(() => {
     if (!sync.localSaveFailed) return;
     showNotif('Thy progress cannot be saved on this device — sign in for cloud backup, or export thy journal.', 'error', null, 8000);
   }, [sync.localSaveFailed]);
   ```

   (Sticky flag → the effect fires exactly once per session.)
4. `sound.js` — module-level error hook so audio-settings persistence failures share the same surfacing without importing React:

   ```js
   let persistErrorHandler = null;
   let persistErrorFired = false;
   export const setAudioPersistErrorHandler = (fn) => { persistErrorHandler = fn; };
   ```

   In `saveSettings`'s catch (lines 46–47): `if (!persistErrorFired && persistErrorHandler) { persistErrorFired = true; persistErrorHandler(); }`. In `App.jsx`, register once on mount: `useEffect(() => { setAudioPersistErrorHandler(() => showNotif('Audio settings cannot be saved on this device.', 'info')); }, []);`
5. Tests in `persistence.test.js`: `isQuotaExceededError` true for `new DOMException('msg', 'QuotaExceededError')` and a code-22 DOMException, false for `new Error('x')`; `saveToLocalStorage` returns `{ ok: true }` normally and `{ ok: false, quota: true }` when `localStorage.setItem` is stubbed (`vi.spyOn(Storage.prototype, 'setItem')`) to throw a quota DOMException; `{ ok: false, quota: false }` for a generic throw.

**Cheap check:** `cd dungeon-scholar && npx vitest run src/services/persistence.test.js src/hooks/usePlayerState.test.jsx && npx vite build`.

**Acceptance:** new persistence tests green; existing usePlayerState tests untouched and green; one toast per session on save failure.

### 17G — Implement Foresight Scroll + Tinker's Oil; fix mid-battle spell crash (F9 + F10)

**Objective:** every consumable the shop sells does what its description says; the two in-battle spells stop crashing.

**Files:** `dungeon-scholar/src/components/DungeonExplore.jsx`, `dungeon-scholar/src/components/DungeonExplore.test.js`, `dungeon-scholar/src/App.jsx`.

**Steps:**

1. **F10 crash fix:** in `castSpell`, replace both `const q = battle.questions[battle.questionIdx];` (DungeonExplore.jsx:2928 `auto_correct`, 2938 `reveal_answer`) with `const q = battle.currentQuestion;`.
2. **Foresight Scroll.** Export a pure helper near `POTION_EFFECTS` (top of file):

   ```js
   // Foresight Scroll: consume one banked charge when a riddle is posed and
   // return the domain label to preview. `chargesRef` is a {current:number} ref.
   export const takeForesightPreview = (chargesRef, q) => {
     if (!chargesRef || chargesRef.current <= 0) return null;
     chargesRef.current -= 1;
     return (q && q.domain) ? q.domain : 'Uncharted';
   };
   ```

   - Change `POTION_EFFECTS.foresight_scroll` (line 30) to `{ kind: 'foresight', label: 'Foresight Scroll' }`.
   - Add `const foresightChargesRef = useRef(0);` with the other run state (~2727) and reset it (`foresightChargesRef.current = 0;`) in the per-delve reset effect (2781–2800).
   - In `usePotion`'s switch (before the default), add:

     ```js
     case 'foresight': {
       foresightChargesRef.current += 1;
       acted = true;
       break;
     }
     ```

     and set a tailored notice after consumption for this case ("Eyes Beyond: the next riddle's nature shall be revealed.") — keep the shared `Drained:` notice for the other kinds.
   - At battle creation, attach the preview: in the collision effect, after picking `first` for the boss path (3259–3266) and the mob path (3274–3282), compute `const previewDomain = takeForesightPreview(foresightChargesRef, first);` and include `previewDomain` in the `setBattle({ … })` object. In `onBattleAnswer`'s follow-up pulls (3407–3410 mob, 3421–3424 boss), include `previewDomain: takeForesightPreview(foresightChargesRef, next)` in the spread-battle update (so a second banked scroll reveals the next question of a multi-question fight; with zero charges it resolves to `null` and clears the old badge).
   - In `BattleModal` (2277+), render a badge when `battle.previewDomain` is set, above the question text: `🔮 Foresight: {battle.previewDomain}` (small italic line styled like the existing tier label; no layout rework — PHASE-19 owns visual polish).
3. **Tinker's Oil → mana restore.** The "50/50 or Hint" power-ups it referenced no longer exist (F9); the live in-run analog of "restore a spent power-up" is spell mana.
   - Change `POTION_EFFECTS.tinkers_oil` (line 31) to `{ kind: 'mana', amount: 2, label: "Tinker's Oil" }`.
   - Add to `usePotion`'s switch:

     ```js
     case 'mana': {
       if (mana >= maxMana) {
         setNotice({ tone: 'info', text: `${usedLabel}: thy mana is already full.` });
         return; // not consumed
       }
       setMana((m) => Math.min(maxMana, m + (eff.amount || 1)));
       acted = true;
       break;
     }
     ```

   - Update the shop copy in `App.jsx:509`: `description: 'Restore 2 mana within a delve.'` and `effect: 'restore_mana'` (the `effect` string on ITEMS is informational; behavior keys off the item id in `POTION_EFFECTS`). `App.jsx:506` (Foresight) copy already matches the implemented behavior — leave it.
4. **Remove the consuming no-op.** Delete the `case 'noop':` arm (3025–3029) and make `default:` NOT consume:

   ```js
   default: {
     setNotice({ tone: 'info', text: `${usedLabel}: nothing happens.` });
     return; // unknown effect — never destroy the item
   }
   ```

5. Export `POTION_EFFECTS` (add `export` at line 24) for tests.
6. Tests in `DungeonExplore.test.js`:
   - no `POTION_EFFECTS` entry has `kind: 'noop'`, and every `kind` is in the implemented set `['heal','shield','revive','xp_buff','foresight','mana']`;
   - `takeForesightPreview`: returns null at 0 charges (and does not decrement below 0); returns `q.domain` and decrements at 1 charge; returns `'Uncharted'` for a domain-less question; consecutive calls drain charges one per call.

**Cheap check:** `cd dungeon-scholar && npx vitest run src/components/DungeonExplore.test.js && npx vite build`.

**Acceptance:** using either item changes run state as described and consumes exactly one item; using Tinker's Oil at full mana does NOT consume; casting Bolt of Truth / Sigil of Clarity mid-battle resolves/reveals instead of throwing.

### 17H — Residual fork-hostile literal in supabase-setup.md (H2 remainder)

**Objective:** no setup step can be copy-pasted into a broken fork config.

**Files:** `dungeon-scholar/docs/supabase-setup.md`.

**Steps:**

1. Rewrite Step 5 (lines 83–88) to lead with placeholders and keep the owner URL as the worked example, matching Step 3's pattern:

   ```markdown
   - **Site URL:** `https://<your-username>.github.io/<your-repo>/`
     (e.g. `https://evilpatrick06.github.io/home-lab/`)
   - **Redirect URLs (one per line):**
     ```
     https://<your-username>.github.io/<your-repo>/
     http://localhost:5173/
     ```
   ```

2. Confirm no other literal remains outside the explicitly-labeled worked examples: `grep -n "evilpatrick06" dungeon-scholar/docs/supabase-setup.md` — every remaining hit must sit next to placeholder text or an "(e.g. …)" marker.

**Cheap check:** the grep above. **Acceptance:** Step 5 shows placeholders first, worked example second.

## Research notes

- **Updater purity / StrictMode double-invocation (17C, 17D):** React's StrictMode "calls some of your functions (only the ones that should be pure) twice in development", explicitly including "functions that you pass to useState, set functions, useMemo, or useReducer" — side effects in updaters therefore duplicate in dev and may replay under concurrent rendering in prod. The standard remedies are (a) hoist side effects into the event handler around the setState call, or (b) derive notifications from state transitions in `useEffect`. This plan uses (a) for handler-local math (quiz streak, override) and (b) for global unlock toasts (achievements/titles/level), with mount-initialized "seen" refs to suppress toast spam for loaded saves. Sources: [react.dev StrictMode reference](https://react.dev/reference/react/StrictMode), [legacy React Strict Mode docs (side-effect detection list)](https://legacy.reactjs.org/docs/strict-mode.html).
- **AbortController in React (17A/17B):** store the controller in a `useRef` (state would re-render), abort in the effect cleanup on unmount, and branch on `controller.signal.aborted` / `err.name === 'AbortError'` in the catch so an abort never updates state or records results. The "abort previous on resubmit" pattern also prevents two in-flight grades racing. Sources: [useAbortableEffect (Close engineering)](https://making.close.com/posts/introducting-use-abortable-effect-react-hook/), [AbortController patterns guide](https://medium.com/@amitazadi/the-complete-guide-to-abortcontroller-and-abortsignal-from-basics-to-advanced-patterns-a3961753ef54). A key project-specific caveat found during verification: `gradeAnswer`'s blanket catches convert AbortError into a *fallback verdict*, so the service half (17A rethrow) must land before the component half (17B) is meaningful.
- **Extracting JSON from LLM output (17A):** single greedy `\{[\s\S]*\}` regexes are a known failure mode on multi-object output; current practice is direct-parse first, then balanced-block extraction (string-aware depth counting) with per-candidate `JSON.parse` and schema filtering — the approach used by multi-JSON extractors in the ecosystem. Taking the LAST schema-valid candidate matches how models append the real answer after a worked example. Sources: [Tackling JSON perplexity in LLM outputs](https://dev.to/josiahbryan/tackling-json-perplexity-in-llm-outputs-a-weekend-project-jm8), [llm-output-parser (multi-JSON extraction)](https://pypi.org/project/llm-output-parser/). A dependency was considered and rejected — the verdict schema is two fields; a 30-line scanner with tests is smaller than any library.
- **localStorage quota detection (17F):** browsers throw differing QuotaExceededError variants; the robust check is `instanceof DOMException` plus name (`QuotaExceededError`, `NS_ERROR_DOM_QUOTA_REACHED`) or code (22, 1014). Distinguish "storage unavailable" (private mode — first write fails) from "full" the same way; both deserve the same user-facing message here since the remedy (cloud sign-in / export) is identical. Sources: [Handling localStorage errors (Mazzarolo)](https://mmazzarolo.com/blog/2022-06-25-local-storage-status/), [MDN storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [TrackJS on setItem failures](https://trackjs.com/javascript-errors/failed-to-execute-setitem-on-storage/).
- **Clock-rollback fences (17E):** the standard lightweight defense is storing a monotone timestamp at the privileged event and refusing when current time is earlier than the stored stamp ("checking that the current time of the device clock is not earlier than the time in the timestamps"); full signed-time/secure-RTC schemes are overkill for a single-user study app. The 48 h sanity bound prevents a corrupt future stamp from locking the calendar for months — self-heal beats hard-lock for this threat model. Source: [UUIDv7 clock-rollback handling overview (RFC 9562 discussion)](https://www.guidsgenerator.com/wiki/uuid-v7-clock-rollback).
- **Tinker's Oil re-spec rationale (17G):** the advertised "50/50 or Hint power-ups" were removed with the wave-based delve; the top-down delve's consumable in-run resource is mana (refilled +1 per correct answer, spent on spells incl. the hint-like Sigil of Clarity and Bolt of Truth). Mapping "restore a spent power-up" → "+2 mana" preserves the item's economic role (45 g mid-tier consumable) and actually restores access to the hint spells. Alternative considered: delisting the item — rejected because it is craftable and already in player inventories/recipes; a working effect is strictly better.

## Test plan

- **17A:** `dungeon-scholar/src/services/oracleGrader.test.js` — 6 new cases (multi-JSON last-verdict, braces-in-feedback, fenced block, unparseable fallback pin, AbortError rejection, non-abort fallback pin).
- **17E:** `dungeon-scholar/src/services/devotion.test.js` — 7 new `evaluateClaim` cases (same-day, next-day, gap>1, rollback refusal, ≥48 h corrupt-fence self-heal, legacy save, preview parity).
- **17F:** `dungeon-scholar/src/services/persistence.test.js` — `isQuotaExceededError` matrix + `saveToLocalStorage` ok/quota/generic results; existing `usePlayerState.test.jsx` must stay green.
- **17G:** `dungeon-scholar/src/components/DungeonExplore.test.js` — `POTION_EFFECTS` no-noop/known-kind assertions + 4 `takeForesightPreview` cases.
- **17B/17C/17D/17H** have no new test files; their parse gate is `npx vite build` (nothing imports `App.jsx` in tests — the build is the only automated check that file gets) and their behavior is covered indirectly by the suites above.
- **End of phase (INSTRUCTIONS.md rule 5):** the dnd-app 4-gate (`cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run`) — no dnd-app files are touched, so this must pass trivially — **plus** the dungeon-scholar gate: `cd dungeon-scholar && npx vitest run` (baseline 346 tests + ~17 new, all green) and `npx vite build` (succeeds; the pre-existing chunk-size warning is acceptable). No Pi code is touched, so no pytest.

## Acceptance criteria

- [ ] All `dungeon-scholar` vitest suites green (`npx vitest run`), including the new oracleGrader/devotion/persistence/DungeonExplore cases; `npx vite build` succeeds.
- [ ] No setState updater in `App.jsx` invokes another setter, `recordAnswer`, `awardXP`, `checkAchievement`, or `showNotif` (17C sweep grep clean).
- [ ] `extractJsonVerdict` returns the correct verdict for prose-wrapped multi-object Oracle output; an aborted `gradeAnswer` rejects and records nothing.
- [ ] QuizMode/LabMode oracle submits abort on unmount/leave; no progress mutation lands after leaving the mode.
- [ ] All read-modify-write `updateTomeProgress` call sites use the functional form (F3 table fully converted).
- [ ] Mistake vault never stores or dedups against an `undefined` id.
- [ ] Daily reward refuses a claim when the clock has stepped backward (< 48 h) since the last claim; `lastClaimedAt` persists on claim; calendar preview and claim use `computeNextClaim`.
- [ ] A failed local save surfaces exactly one toast per session; `saveToLocalStorage` reports `{ ok, quota }`.
- [ ] Foresight Scroll reveals the next posed riddle's domain; Tinker's Oil restores 2 mana (not consumed at full mana); no consumable maps to a consuming no-op; shop copy for `tinkers_oil` matches the implemented effect.
- [ ] Casting Bolt of Truth or Sigil of Clarity during a battle works (no `battle.questions` TypeError).
- [ ] `supabase-setup.md` Step 5 leads with `<your-username>/<your-repo>` placeholders.
- [ ] dnd-app 4-gate green; ONE phase commit + push; plan moved to `completed/`.

## Out of scope

- **Oracle endpoint env-var extraction + prod error logging** (`ORACLE_ENDPOINT` constant, H6/M9/M8/L7 etc.) — PHASE-18 (ds security round).
- **Color-only feedback, modal a11y, aria-live, reduced motion, tap targets, battle-modal visual polish** — PHASE-19 (ds a11y/UX round). 17G adds only a minimal foresight badge.
- **`App.jsx` module split, code-splitting, router** (and the build's chunk-size warning) — PHASE-39.
- **cloudSync conflict tests (L18), defensive copies (L15), import size cap (L14), AudioContext close (L8), PWA** — PHASE-40.
- **Sealed/proctored tomes, light theme** — PHASE-41.
- **ChatMode fetch AbortController** — not in any audited finding; the M2 fix targets the grading paths that mutate progress. Log it per INSTRUCTIONS.md rule 12 if it bites during execution.

## Completed

*(Filled during execution per INSTRUCTIONS.md rule 17 — one entry per sub-phase as it lands.)*
