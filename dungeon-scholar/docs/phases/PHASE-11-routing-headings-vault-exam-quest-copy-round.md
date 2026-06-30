# PHASE-11 — Routing canonicalization, study-mode headings, vault/exam/quest copy round

> Authored from [`QA-report-2026-06-29-4.md`](./QA/completed/QA-report-2026-06-29-4.md) (automated `scholar-qa-tester` pass against the live GitHub-Pages SPA build `index-Bht36BpW.js`, cross-checked `origin/master` `5d4fd982` / last dungeon-scholar src commit `2269c923`, 2026-06-29). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here.

## Goal

Run-4's five remaining un-tracked findings are all **Low/info** and each is a small, self-contained correctness or polish fix with no shared root cause beyond "small things that are slightly wrong." This phase bundles them (the established pattern for a round of Lows, cf. PHASE-08), one independent sub-phase each:

- **F1 (low, routing) — a bare `#/` is not canonicalized to `#/home`** when reached at runtime, even though every *other* non-canonical hash (`#/bogus`, `#/tome/`) correctly bounces and rewrites. Cosmetic URL inconsistency; content is correct.
- **F2 (low, a11y) — the flashcards, quiz, and chat study modes expose no semantic page heading.** `main h1, main h2` returns none on those three; their mode label is decorative `div`/`span` markup, so a screen-reader user gets no heading landmark for the active study mode (every other screen has one).
- **F3 (low, UX/copy) — the Mistake Vault empty state is titled "The Tome is Empty"** while a fully populated tome is loaded. The vault is empty of *mistakes*, not of tome content; the copy conflates the two.
- **F4 (low, UX) — practice-exam presets collapse to the same drill length** on small tomes. "Standard Mock" (60→capped) and "Full-Length Exam" (90→capped) both clamp to the tome size (e.g. 45), so they differ only by timer — two presets that are functionally the same length.
- **F5 (low, copy) — Quest Board header subject–verb disagreement:** "1 reward **await** thy hand" should read "awaits"; the verb is always plural.

None depends on another; implement in any order. All five are `bug`/`UX`/copy `docs` — small, mechanical, fully specified below.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Independent of PHASE-10 (which is the higher-severity light-theme pair) and of each other. Run PHASE-10 first by severity (two Mediums), then this.
- **F2 touches files PHASE-03/05 also touched** (`FlashcardsMode.jsx`, `QuizMode.jsx`, `ChatMode.jsx`) but on *different lines* (heading semantics, not contrast/dialogs) — re-confirm the anchors by string search before editing (rule 3).
- **F3 touches `MistakeVault.jsx`, which PHASE-06 edited** (the Redeemed-unlock gate). The empty-state branch this phase rewords (`:55-60`, the `vault.length === 0` block) is *distinct* from PHASE-06's gating logic; re-confirm by the "The Tome is Empty" string before editing.
- **F4 spans `ExamMode.jsx` + `services/examSession.js`.** `ExamMode.jsx` is also touched by completed PHASE-08 (exam jank) and PHASE-09 (date helper); this phase edits the **preset-card render loop** (`:346-368`) and/or the `EXAM_PRESETS` array (`examSession.js:15-19`) — re-locate by `EXAM_PRESETS.map` / `Capped at` (rule 3).
- **No shared files with PHASE-10.**

## Verified findings

All verification read-only against the live tree at `origin/master` (worktree `auto/scholar-phase-maker`). Re-run before implementing (rule 3).

### F1 (low, routing/UX) — bare `#/` renders home but is not canonicalized to `#/home`

**Status: confirmed in source. The mount-time canonicalize fires, but the `hashchange` path does not for an empty hash.**

`src/router/useHashRoute.js` — `parseHash('#/')` returns a *non-null* screen (`home`), so the runtime `hashchange` handler renders home but never rewrites the URL; the rewrite only fires in the `else` branch, i.e. when `parsed.screen === null` (`#/bogus`, `#/tome/`):

```js
// parseHash: '' / '#' / '#/' → { screen:'home', tomeId:null }  (non-null screen)
// onHashChange (the runtime path):
const parsed = parseHash(window.location.hash);
if (parsed.screen) {
  setScreenState(parsed.screen);
  if (parsed.tomeId) setPendingTomeId(parsed.tomeId);
} else {
  window.history.replaceState(null, '', formatHash('home'));   // ← rewrite only here
  setScreenState('home');
}
```

The *mount* effect does canonicalize `#/` (it computes `want = formatHash(initRef.current.screen)` and `replaceState`s if `window.location.hash !== want`), which is why a fresh load of `#/` lands on `#/home`. But setting `location.hash = '#/'` *after* load goes through `onHashChange`, takes the `if (parsed.screen)` branch, and leaves the address bar at `#/`. That asymmetry is the bug.

```bash
sed -n '/export function parseHash/,/^}/p' dungeon-scholar/src/router/useHashRoute.js   # empty-string branch → screen:'home'
grep -n 'onHashChange\|replaceState\|formatHash' dungeon-scholar/src/router/useHashRoute.js
```

**Root cause:** `onHashChange` canonicalizes only when `parsed.screen` is null; it does not rewrite a *valid-but-non-canonical* hash (empty `#/`, which normalizes to `home` but isn't `#/home`).

**Suggested action:** in `onHashChange`, after a successful parse with **no tome segment to consume**, rewrite the URL to the canonical `formatHash(parsed.screen)` when the current hash differs — so `#/` → `#/home` at runtime, matching the bounce behavior of the other non-canonical hashes (and matching mount).

### F2 (low, a11y) — flashcards / quiz / chat study modes have no semantic page heading

**Status: confirmed in source. The three modes title themselves with non-heading markup.**

The only `<h1>` on the page is the global "DUNGEON SCHOLAR" app title; most screens add their own `<h1>`/`<h2>` (Library "The Grand Library", Shop "The Marketplace", etc.). The three study modes do not:

- `src/features/study/FlashcardsMode.jsx:237` — the mode's largest title is a `<div className="text-3xl font-bold italic text-amber-100">` ("… scroll(s) reviewed" / the active card face), not a heading.
- `src/features/study/QuizMode.jsx:420` — the mode label is `🔮 Riddle {n} of {N}` inside a `<span>` within a `text-amber-600` flex `div` (`:418-420`), not a heading.
- `src/features/study/ChatMode.jsx:422` — the mode label is `<div className="text-xs text-amber-700 italic tracking-wider">⚜ MODE OF INQUIRY ⚜</div>`, not a heading.

```bash
grep -n '<h1\|<h2' dungeon-scholar/src/features/study/FlashcardsMode.jsx dungeon-scholar/src/features/study/QuizMode.jsx dungeon-scholar/src/features/study/ChatMode.jsx   # → none inside the mode body
sed -n '232,244p' dungeon-scholar/src/features/study/FlashcardsMode.jsx
sed -n '416,424p' dungeon-scholar/src/features/study/QuizMode.jsx
sed -n '420,426p' dungeon-scholar/src/features/study/ChatMode.jsx
```

**Root cause:** each mode component renders its name with `div`/`span` styling rather than a heading element, so the document outline has no landmark for the active mode.

**Suggested action:** give each mode a real `<h2>` naming the mode. Lowest-risk: add a visually-styled-or-`sr-only` `<h2>` near the top of each mode body — e.g. ChatMode promotes the existing "MODE OF INQUIRY" `div` to an `<h2>` (it already reads as the mode title), and Flashcards/Quiz gain an `<h2>` (visible or `sr-only`) such as "Flashcards" / "Quiz". Keep the existing decorative labels; the new `<h2>` only needs to exist in the outline. Confirm it sits inside `<main>` so `main h1, main h2` returns it.

### F3 (low, UX/copy) — Mistake Vault empty state titled "The Tome is Empty" while a populated tome is loaded

**Status: confirmed in source. The `vault.length === 0` branch (a tome IS loaded) reuses tome-empty copy.**

`src/features/study/MistakeVault.jsx` has two early returns: a `!courseSet` branch already titled correctly ("No Active Tome", `:47`), and the *empty-vault* branch reached with a tome loaded:

```jsx
// MistakeVault.jsx:55-60  (reached when courseSet is present but vault has no entries)
if (vault.length === 0) {
  return ( … <Skull … />
    <h2 className="text-2xl font-bold text-amber-300 mb-2 italic">The Tome is Empty</h2>
    <p className="text-amber-100/60 italic">
      "All foes have been vanquished, brave scholar. Let new challenges find you..."
    </p> …
```

The heading says the *tome* is empty, but this branch only runs when a populated tome IS active and there are simply no logged mistakes — misleading.

```bash
sed -n '43,62p' dungeon-scholar/src/features/study/MistakeVault.jsx   # the two empty branches
```

**Root cause:** the empty-vault branch reuses a generic "tome is empty" label instead of describing the *vault* (no missed questions yet).

**Suggested action:** reword the `:57` heading + flavor to describe the vault, e.g. heading "The Vault Stands Empty" with flavor "No foes to redeem yet — answer wrongly in a study mode and they'll be captured here." Leave the existing "19E" next-action CTA button below it intact, and leave the `!courseSet` "No Active Tome" branch unchanged.

### F4 (low, UX) — practice-exam presets collapse to the same riddle count on small tomes

**Status: confirmed in source. Two presets clamp to the same `effective` count, differing only by timer.**

`src/services/examSession.js:15-19` defines three presets by `count` + `minutes`; `src/features/study/ExamMode.jsx:346-368` clamps each to the pool size and shows a "Capped" note:

```js
// examSession.js
export const EXAM_PRESETS = [
  { id: 'short',    label: 'Short Mock',       count: 30, minutes: 30 },
  { id: 'standard', label: 'Standard Mock',    count: 60, minutes: 60 },
  { id: 'full',     label: 'Full-Length Exam', count: 90, minutes: 90 },
];
```
```jsx
// ExamMode.jsx:346-368
const effective = Math.min(preset.count, quizPool.length);
… {effective} riddle{effective === 1 ? '' : 's'} · {preset.minutes} minute…
{effective < preset.count && (
  <div className="text-[10px] italic text-amber-700 mt-1">✦ Capped at {effective} (tome size)</div>
)}
```

With a 45-riddle tome: Short → 30 (uncapped), Standard → min(60,45)=45, Full → min(90,45)=45. So **Standard and Full both show "45 riddles · Capped at 45", differing only by 60 vs 90 minutes** — two presets that are functionally the same drill length.

```bash
sed -n '15,19p'  dungeon-scholar/src/services/examSession.js
sed -n '344,370p' dungeon-scholar/src/features/study/ExamMode.jsx
```

**Root cause:** preset `count`s clamp to tome size; for tomes smaller than the larger presets, multiple presets collapse to the same `effective` count, leaving only the timer to distinguish them.

**Suggested action (report's):** when the tome can't supply enough riddles to differentiate presets, either (a) hide/merge presets whose `effective` count equals an earlier preset's (keep the lowest-time or merge into one card labeled by available times), or (b) make the time the explicit labeled distinction when counts are equal (e.g. when capped-equal, label by minutes: "45 riddles · 60 min" vs "45 riddles · 90 min" and drop the redundant "Standard/Full" naming, or render a single card with a time selector). The note below specifies the lower-risk option.

### F5 (low, copy) — Quest Board header: "1 reward await thy hand" (singular needs "awaits")

**Status: confirmed in source. The noun pluralizes; the verb does not.**

```jsx
// src/features/quests/QuestBoard.jsx:509
{totalClaimable} reward{totalClaimable === 1 ? '' : 's'} await thy hand
```

The noun switches on `totalClaimable === 1` but "await" is always the plural form, so the singular case reads "1 reward **await** thy hand".

```bash
grep -n 'await thy hand' dungeon-scholar/src/features/quests/QuestBoard.jsx
```

**Root cause:** the count template switches the noun's plural `s` but not the verb's.

**Suggested action:** make the verb agree — `await${totalClaimable === 1 ? 's' : ''} thy hand` (→ "1 reward awaits thy hand" / "3 rewards await thy hand").

### Environment facts an executor needs

- **Tests:** `cd dungeon-scholar && npm run test` (`vitest run`, happy-dom + `@testing-library/react`). `src/router/useHashRoute.test.jsx` already exists — extend it for F1 (assert a `hashchange` to `#/` rewrites to `#/home`). F2/F3/F5 are JSDOM-assertable (heading presence; empty-state copy; the singular header string). F4's dedupe is unit-testable as a pure helper over `EXAM_PRESETS` + a pool size.
- **Lint / typecheck / build:** `npm run lint` (Biome), `npm run typecheck` (`tsc --noEmit`, checkJs 0 — keep clean), `npm run build` (`VITE_BASE=/home-lab/`). CI (`dungeon-scholar-ci.yml`) gates test + build on push.
- React 19, Tailwind v4, hash routing (`#/<screen>`), `type: "module"`, plain JSX.

## Sub-phases

One per finding; each independently shippable, all leave the tree green. Suggested order is cheapest-first (F5 copy → F3 copy → F1 routing → F2 a11y → F4 UX), but any order is fine.

### 11A — Canonicalize a bare `#/` to `#/home` on `hashchange` (F1)

**Objective:** setting the hash to `#/` at runtime rewrites the URL to `#/home` (matching mount + the other non-canonical bounces), with no regression to deep-link `#/tome/<id>/<screen>` consumption.

**Files:** `dungeon-scholar/src/router/useHashRoute.js`; `dungeon-scholar/src/router/useHashRoute.test.jsx` (extend).

**Steps:**
1. In `onHashChange`, inside the `if (parsed.screen)` branch, after `setScreenState(parsed.screen)`, add a canonicalize step gated to avoid clobbering an in-flight tome deep link:
   ```js
   if (parsed.screen) {
     setScreenState(parsed.screen);
     if (parsed.tomeId) {
       setPendingTomeId(parsed.tomeId);
     } else {
       const want = formatHash(parsed.screen);
       if (window.location.hash !== want) window.history.replaceState(null, '', want);
     }
   } else { … }
   ```
   The `!parsed.tomeId` guard preserves the existing contract that `#/tome/<id>[/<screen>]` is canonicalized later by `clearPendingTome` (after the tome switches) — only tome-less hashes are rewritten here. `#/` → `parsed.screen==='home'`, no tomeId, `hash '#/' !== '#/home'` → rewrite. `#/home` → equal, no-op. `#/shop` → equal, no-op.

**Verify (read-only, after editing):**
```bash
grep -n 'replaceState' dungeon-scholar/src/router/useHashRoute.js   # now also in the parsed.screen + !tomeId path
```

**Tests:** extend `useHashRoute.test.jsx` — dispatch a `hashchange` after setting `location.hash = '#/'`, assert `location.hash === '#/home'` and screen is `home`; assert `#/tome/<id>/shop` still leaves the tome segment for `clearPendingTome` (no premature rewrite); assert `#/shop` is unchanged.

**Acceptance:** runtime `#/` → `#/home`; deep-link tome consumption unchanged; existing routing tests pass; lint/typecheck/build clean.

### 11B — Real `<h2>` headings for flashcards / quiz / chat (F2)

**Objective:** each of the three study modes exposes its name as an `<h2>` inside `<main>`, so the document outline / screen-reader navigation reflects the active mode; visual design unchanged (or minimally so).

**Files:** `dungeon-scholar/src/features/study/FlashcardsMode.jsx`, `.../QuizMode.jsx`, `.../ChatMode.jsx`.

**Steps:**
1. **ChatMode (`:422`):** promote the existing `⚜ MODE OF INQUIRY ⚜` label `div` to an `<h2>` carrying the same classes (it already serves as the mode title). Confirm it renders inside `<main>`.
2. **QuizMode:** add an `<h2>` mode title near the top of the mode body (`:416`-ish). To keep the current visual, make it `sr-only` (e.g. `<h2 className="sr-only">Quiz</h2>`) or style it to match — the "Riddle n of N" status line stays as-is (status text, not the heading).
3. **FlashcardsMode:** add an `<h2>` mode title (visible or `sr-only`, e.g. "Flashcards") at the top of the mode body; leave the existing "scroll(s) reviewed"/card-face `div` styling.
4. Use a consistent heading level (`<h2>`) across all three so the outline is uniform with the other screens.

**Verify (read-only, after editing):**
```bash
grep -n '<h2' dungeon-scholar/src/features/study/FlashcardsMode.jsx dungeon-scholar/src/features/study/QuizMode.jsx dungeon-scholar/src/features/study/ChatMode.jsx
```

**Tests:** a JSDOM render of each mode asserts a single `<h2>` with the mode name exists within the mode container. (If the modes are hard to mount standalone, a lighter assertion on the rendered markup string is acceptable — document which.)

**Acceptance:** `main h1, main h2` returns a heading on flashcards, quiz, and chat; visual layout unchanged (sr-only or matched styling); lint/typecheck/build clean.

### 11C — Reword the Mistake Vault empty-vault state (F3)

**Objective:** the empty-vault state (tome loaded, no mistakes) describes the *vault*, not the tome.

**Files:** `dungeon-scholar/src/features/study/MistakeVault.jsx` (`:57-59`).

**Steps:**
1. Replace the `:57` heading "The Tome is Empty" with vault-specific copy, e.g. "The Vault Stands Empty"; reword the `:59` flavor to e.g. "No foes to redeem yet — miss a riddle in any study mode and it will be captured here." Keep the `Skull` icon and the existing "19E" next-action CTA button below unchanged.
2. Leave the `!courseSet` branch ("No Active Tome", `:47`) untouched — it is already correct.

**Verify (read-only, after editing):**
```bash
grep -n 'The Tome is Empty\|Vault Stands Empty' dungeon-scholar/src/features/study/MistakeVault.jsx
```

**Tests:** render `MistakeVault` with a non-empty `courseSet` and an empty `vault`; assert the heading no longer reads "The Tome is Empty" and the new vault copy is present.

**Acceptance:** empty-vault heading/flavor describe the vault of mistakes; the no-tome branch is unchanged; lint/typecheck/build clean.

### 11D — De-duplicate practice-exam presets that clamp to the same length (F4)

**Objective:** when two presets clamp to the same `effective` riddle count for the current tome, the UI no longer shows two near-identical cards distinguished only by timer.

**Files:** `dungeon-scholar/src/features/study/ExamMode.jsx` (`:346-368`); optionally `dungeon-scholar/src/services/examSession.js` (a pure helper + test).

**Steps (lower-risk option (b)+(a) hybrid):**
1. Add a pure helper in `examSession.js`, e.g. `presetsForPool(pool.length)` that maps `EXAM_PRESETS` to `{ ...preset, effective }` and **collapses runs of equal `effective`**: when two+ presets share an `effective` count, keep one card and either (a) drop the redundant one(s) or (b) keep them but make the timer the explicit label. Recommended: keep the **distinct-count** presets, and when counts collapse, render the surviving cards labeled by the differentiator that remains (time). Concretely: dedupe by `effective`, and for a kept card whose `count` was clamped, label it `"{effective} riddles · {minutes} min"` (already shown) and drop the now-misleading "Standard/Full" *name* redundancy — or keep both timer variants as two cards explicitly titled by minutes ("Timed: 60 min" / "Timed: 90 min") so the difference is legible rather than hidden behind identical "Capped at 45" notes.
2. Wire `ExamMode.jsx:346` to map over `presetsForPool(quizPool.length)` instead of `EXAM_PRESETS` directly; keep the `startExam({ ...preset, count: effective })` call.
3. Pick ONE behavior (hide-duplicate vs label-by-time) and implement it consistently; note the choice in the sub-phase's completion. (Recommendation: **collapse to one card per distinct effective count, choosing the shortest sufficient timer**, since two timers for an identical 45-riddle drill is the confusion the report flags; if both timers are deemed useful, render them as an explicit time choice on the single card.)

**Verify (read-only, after editing):**
```bash
grep -n 'presetsForPool\|EXAM_PRESETS' dungeon-scholar/src/features/study/ExamMode.jsx dungeon-scholar/src/services/examSession.js
```

**Tests:** unit-test `presetsForPool`: pool ≥ 90 → all three distinct; pool = 45 → Standard/Full collapse (one card for the 45 length, per the chosen rule); pool = 30 → Short distinct, Standard/Full collapse; pool = 10 → all collapse to one. Assert no two returned cards share the same `effective`+`minutes` pair.

**Acceptance:** for a 45-riddle tome the exam screen no longer shows two cards that are identical except for the timer; the helper is unit-tested for the collapse rule; lint/typecheck/build clean.

### 11E — Quest Board header verb agreement (F5)

**Objective:** the claimable-rewards header agrees in number for the singular case.

**Files:** `dungeon-scholar/src/features/quests/QuestBoard.jsx` (`:509`).

**Steps:**
1. Change `reward{… 's'} await thy hand` → `reward{totalClaimable === 1 ? '' : 's'} await${totalClaimable === 1 ? 's' : ''} thy hand` (noun + verb both switch on `=== 1`). Result: "1 reward awaits thy hand" / "N rewards await thy hand".

**Verify (read-only, after editing):**
```bash
grep -n 'await' dungeon-scholar/src/features/quests/QuestBoard.jsx
```

**Tests:** render `QuestBoard` (or assert the header string builder) for `totalClaimable === 1` → "1 reward awaits thy hand"; for `=== 3` → "3 rewards await thy hand".

**Acceptance:** singular renders "awaits", plural renders "await"; lint/typecheck/build clean.

## Research notes

- **F1** is purely the runtime/mount asymmetry: mount already canonicalizes `#/` (the `initRef`/`replaceState` effect), only the `hashchange` path missed it. The fix mirrors mount's behavior into `onHashChange` while preserving the deliberate `#/tome/<id>/<screen>` two-step (the tome segment is consumed and then dropped by `clearPendingTome`, so the rewrite must skip hashes that still carry a `tomeId`).
- **F2** is the residue of the PHASE-19 a11y round (repo-wide), which added dialog semantics and the heading sweep but did not reach these three study modes' titles — they title with styled `div`/`span`s. The fix is additive (new `<h2>`), so it cannot regress the existing visuals when `sr-only`.
- **F4** is a genuine UX ambiguity, not a bug: the clamp logic is correct, but presenting two clamped-equal presets is confusing. Centralizing the preset→pool mapping in a pure, tested helper keeps `ExamMode.jsx` declarative and makes the collapse rule explicit and regression-proof.
- **F3/F5** are one-line copy corrections with no logic change; they are grouped here only because they share the "round of small fixes" cadence.

## Test plan

- **Unit (new/extended):** `useHashRoute.test.jsx` (F1 runtime canonicalize + deep-link preserved); a heading-presence assertion per study mode (F2); a `MistakeVault` empty-vault copy assertion (F3); a `presetsForPool` collapse-rule test (F4); a `QuestBoard` header string test (F5).
- **Build/lint/type gate:** `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` (`VITE_BASE=/home-lab/`) clean (CI parity).
- **Manual spot check (executor):** set `location.hash = '#/'` after load → address bar becomes `#/home`; tab to flashcards/quiz/chat and confirm a heading exists (e.g. via an a11y tree / `document.querySelector('main h2')`); open `#/vault` with a populated tome and no mistakes → vault-specific copy; open `#/practiceExam` on a 45-riddle tome → no two identical-length preset cards; open `#/quests` with exactly one claimable reward → "1 reward awaits thy hand".

## Acceptance criteria

1. A runtime `hashchange` to `#/` canonicalizes the URL to `#/home`; `#/tome/<id>/<screen>` deep-link consumption is unchanged; routing tests pass.
2. Flashcards, quiz, and chat each expose an `<h2>` mode heading inside `<main>`; visual layout unchanged.
3. The Mistake Vault empty-vault state describes the vault (no missed questions), not "The Tome is Empty"; the no-tome branch is unchanged.
4. The practice-exam screen no longer shows two presets that clamp to the same length distinguished only by timer; a unit-tested helper enforces the collapse rule.
5. The Quest Board header reads "1 reward awaits thy hand" (singular) / "N rewards await thy hand" (plural).
6. `npm run lint` + `npm run typecheck` + `npm run test` + `npm run build` clean.

## Out of scope

- **Supabase auth-token refresh console-error storm** (report §0, Medium) — **already tracked, not re-authored.** The baseline is **PHASE-02 F1** (done); the circuit-breaker / stale-token quarantine hardening is **PHASE-08 F5 / 08E** (done). Run-4 re-confirmed the same `_refreshAccessToken`/`Failed to fetch` loop on the new build — a fix-forward matter for the executer/integrator (verify the PHASE-08 circuit breaker actually suppresses the storm on `index-Bht36BpW`), not a new plan. The report's incremental note ("fold the failed refresh into the quiet offline/sync-paused state") is exactly PHASE-08's intent; if the storm persists after PHASE-08 ships live, open a small load-noise follow-up rather than reopening here.
- **Light-theme accent-text / "Begin Anew" / focus ring** (report §7) — **PHASE-10** (this round's higher-severity sibling). Not duplicated here.
- **Info-only / QA-process items** — the prior-QA "QA Throwaway Tome" residue (banished during the run; an action item for QA *tooling*, not the app), the import-robustness reconfirmation (Phase-04 holds on both import paths), and the empty `screenshots/` folder (a CDP capture-host limitation, not an app defect) need no plan.
- **No light-theme/contrast, auth/sync, or performance work** — those belong to PHASE-10, PHASE-02/08, and PHASE-08 respectively.

## Completed (partial — F4/11D gated for approval)

> 2026-06-30 on `auto/scholar-phase-executer` (layered on the prior run's PHASE-10 commit). Bug/correctness/a11y/copy sub-phases auto-implemented; the lone non-bug UX sub-phase (11D / F4) is posted to the status board (`PHASE-11D`, session-stamped) awaiting approve/deny per the auto-approve=bug / gate=non-bug-UX policy — so this plan stays in the active backlog (NOT moved to `completed/`) until 11D is decided.

- **11A (F1, done)** — `src/router/useHashRoute.js`: `onHashChange` now canonicalizes a valid, tome-less hash to `formatHash(parsed.screen)` when it differs (runtime bare `#/`→`#/home`, matching mount + other bounces); `#/tome/<id>/<screen>` still left for `clearPendingTome`. `useHashRoute.test.jsx` +3 tests.
- **11B (F2, done)** — ChatMode "⚜ MODE OF INQUIRY ⚜" `div`→`<h2>`; `sr-only` `<h2>` added to FlashcardsMode (Flashcards) and QuizMode (Quiz) main returns. Guarded by `src/features/phase11Guards.test.js`.
- **11C (F3, done)** — `MistakeVault.jsx`: empty-vault heading/flavor reworded to describe the vault ("The Vault Stands Empty"); `!courseSet` branch untouched. `MistakeVault.test.jsx` +1 copy test.
- **11E (F5, done)** — `QuestBoard.jsx`: verb agreement `await{totalClaimable === 1 ? 's' : ''} thy hand` ("1 reward awaits" / "N rewards await"). Guarded in phase11Guards.test.js.
- **11D (F4, GATED — not implemented)** — preset de-dup is "a genuine UX ambiguity, not a bug" (plan's words) → gated. On approval: add a tested `presetsForPool(poolLen)` helper in `services/examSession.js` collapsing equal-`effective` presets and map `ExamMode.jsx` over it.
- Targeted tests pass (24: router, vault, guards). CI gates test+build on push.
