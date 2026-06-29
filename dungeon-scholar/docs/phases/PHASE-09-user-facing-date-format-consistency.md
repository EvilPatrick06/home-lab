# PHASE-09 — User-facing date-format consistency (ISO via one shared helper)

> Authored from [`QA-report-2026-06-29-3.md`](./QA/completed/QA-report-2026-06-29-3.md) (automated `scholar-qa-tester` pass against the live GitHub-Pages SPA build `index-CkFA4t7H.js`, cross-checked `origin/master` `937f89f7` / last dungeon-scholar src commit `a2e9db1f`, 2026-06-29). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here.

## Goal

The 2026-06-29 run-3 report's **only un-tracked finding** (one Low) is a user-facing date-format inconsistency: the Shop header stamps its rotating-stock date in ISO `YYYY-MM-DD` (e.g. "ROTATING WARES — 2026-06-29"), while the Practice-Exam attempt-history row renders the same kind of calendar date in the runtime locale's short form `M/D/YYYY` (e.g. "6/28/2026"). Within one app two formats appear for the same notion (a calendar date), and the locale-dependent `M/D/YYYY` is ambiguous internationally (it silently becomes `D/M/YYYY` outside the US locale). This phase standardizes user-facing **calendar-date** rendering on the ISO `YYYY-MM-DD` form the app already uses in Shop, routed through **one shared helper in the existing `src/utils/date.js`** (which already owns `formatYmd`/`todayDateStr`), so the format can never drift per-call again. The report's suggested action is exactly this: "Centralize date formatting in one helper and use it everywhere user-facing dates appear."

Scope is deliberately narrow: only the surfaces that render a bare **calendar date** (or date + clock time) as a `toLocale*` string are converted. Two `toLocale*` sites that present dates for a *deliberately different purpose* — the Certificate of Mastery's formal long date ("June 29, 2026") and the Account/journal snapshot's precise sync receipt timestamp — are left as documented exceptions (see Out of scope), because forcing them to bare ISO would be a regression in their own right.

## Dependencies & cross-phase notes

- **No prerequisite phases.** This is a single Low finding; it shares no files with PHASE-03/04/05/06/07/08's open work except `ExamMode.jsx`, noted below. Run any order.
- **Shared file with PHASE-08 F3 (08C):** PHASE-08 08C *may optionally* memoize the Practice-Exam navigator grid in `src/features/study/ExamMode.jsx`. This phase edits two **different, non-adjacent** lines in the same file — the attempt-history row date (`:423`) and the `TrialDetailModal` header date (`:1031-1035`). No semantic overlap with the navigator grid (`~:775-795`); if 08C ships first, re-confirm the two date anchors by string search (`new Date(rec.startedAt).toLocaleDateString` and ``date.toLocaleDateString()` · ``) rather than by line number (rule 3).
- **`src/utils/date.js` is the canonical date home (S22).** `formatYmd`/`todayDateStr` already live there; `services/devotion.js` only *re-exports* `todayDateStr` for its consumers (Shop imports it from `devotion.js`). New helpers go in `utils/date.js` next to `formatYmd`, and `date.test.js` already exists to extend — no new file is required for the helper.
- **Do not touch `todayDateStr` / `formatYmd` semantics.** Devotion-streak math, quest day-keys, and `examPace.js` all depend on `formatYmd`'s exact `YYYY-MM-DD` shape (UTC-drift-safe local date). The new helpers *build on* `formatYmd`; they must not change it.

## Verified findings

All verification was performed read-only against the live tree at `origin/master` (worktree `auto/scholar-phase-maker`). Re-run each block before implementing (rule 3).

### F1 (low, UX/consistency) — user-facing calendar dates render in two formats: Shop ISO `YYYY-MM-DD` vs Practice-Exam history locale `M/D/YYYY`

**Status: confirmed in source.**

QA repro (report §7, "Inconsistent date formatting across screens"):

1. Open `#/shop` — the header reads "⚜ ROTATING WARES — **2026-06-29** ⚜" (ISO).
2. Open `#/practiceExam` — a prior attempt row reads "**6/28/2026** · 30 riddles · 2m 2s — abandoned" (US locale `M/D/YYYY`).

Root cause, confirmed in source — the two surfaces format the same notion differently, and one route bakes in a runtime-locale dependency:

- **Shop (the ISO reference):** `src/features/progression/ShopScreen.jsx:16` computes `const today = todayDateStr();` (imported from `../../services/devotion.js:5`, which re-exports `utils/date.js`'s `todayDateStr` → `formatYmd(new Date())` → `YYYY-MM-DD`), rendered at `ShopScreen.jsx:76`. Locale-independent. **This is the format the report wants to keep.**
- **Practice-Exam history row (the divergent one):** `src/features/study/ExamMode.jsx:423` renders `new Date(rec.startedAt).toLocaleDateString()` with no locale/options argument → the host's locale short form (`M/D/YYYY` in `en-US`, `D/M/YYYY` elsewhere).
- **Practice-Exam trial-detail modal:** `src/features/study/ExamMode.jsx:1031-1035` (`TrialDetailModal`) builds `` `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` `` — same locale-dependent date, plus a clock time.
- **Ascension screen:** `src/features/progression/AscensionScreen.jsx:11` renders `new Date(playerState.lastAscendedAt).toLocaleDateString()` — same locale `M/D/YYYY` for the "last ascended" stamp (a third user-facing calendar date in the divergent format, not separately called out in the report but the same defect).
- **Chronicle / run-history (judgment call, see 09B):** `src/features/progression/RunHistoryScreen.jsx:279` renders `new Date(run.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })` → e.g. "Jun 28, 02:14 PM". This is a *deliberately compact month+day+time* label, not a bare `M/D/YYYY`, so it is less wrong than the others — but it is still locale-dependent and inconsistent with the ISO direction. Fold it into the sweep as date + time (09B), or leave it as an intentional compact label; the report does not name it, so 09B treats it as optional and documents whichever choice is taken.

Net: the same kind of value (a calendar date) is shown three+ ways across screens (`2026-06-29`, `6/28/2026`, `Jun 28, 02:14 PM`), and every `toLocale*` form is silently locale-dependent.

Verification commands (read-only):

```bash
# the ISO reference (Shop) and its helper chain
sed -n '14,18p;74,78p' dungeon-scholar/src/features/progression/ShopScreen.jsx
sed -n '1,7p'          dungeon-scholar/src/utils/date.js          # formatYmd + todayDateStr (YYYY-MM-DD)
grep -n 'todayDateStr' dungeon-scholar/src/services/devotion.js   # re-export only

# the divergent locale sites (all user-facing calendar dates)
grep -rn 'toLocaleDateString\|toLocaleTimeString' dungeon-scholar/src --include=*.jsx --include=*.js | grep -v '\.test\.'
sed -n '420,426p'   dungeon-scholar/src/features/study/ExamMode.jsx          # history row :423
sed -n '1031,1035p' dungeon-scholar/src/features/study/ExamMode.jsx          # TrialDetailModal date label
sed -n '9,13p'      dungeon-scholar/src/features/progression/AscensionScreen.jsx
sed -n '276,285p'   dungeon-scholar/src/features/progression/RunHistoryScreen.jsx
```

**Suggested action (report's):** pick one user-facing date format (the report recommends ISO `YYYY-MM-DD`, since the app already uses it in Shop) and apply it consistently across Shop, Practice-Exam history, Chronicle/history, etc. — centralized in one helper.

### Environment facts an executor needs

- **Tests:** `cd dungeon-scholar && npm run test` (vitest 4 + `happy-dom` + `@testing-library/react` 16). `src/utils/date.test.js` already exists and exercises `formatYmd`/`todayDateStr` — extend it for the new helpers.
- **Lint / typecheck / build:** `npm run lint` (Biome 2.5.0 over `src`), `npm run typecheck` (`tsc --noEmit` — the repo is plain JSX with checkJs; the 2026-06-29 merge burned the checkJs error count to 0, so keep it clean), `npm run build` (vite). CI (`.github/workflows/dungeon-scholar-ci.yml`) runs test + build on push touching `dungeon-scholar/**`; `dungeon-scholar-deploy.yml` auto-deploys on the integrator's merge to `master`.
- **Locale caveat for tests:** `toLocaleDateString()` output is host-locale-dependent, which is exactly the defect. The new helpers must be asserted against fixed ISO strings (as `date.test.js` already does for `formatYmd`), so the tests are locale-independent on any CI runner.
- React 19, Tailwind v4, `type: "module"`, plain JSX (no TypeScript).

## Sub-phases

Order keeps the tree green: 09A adds the helper + tests and converts the report's named surfaces; 09B is the optional Chronicle extension. Each is independently shippable.

### 09A — One shared user-facing date helper; convert the locale `M/D/YYYY` calendar-date surfaces to ISO (F1)

**Objective:** every user-facing **bare calendar date** (and the one date+clock label in the exam trial modal) renders as locale-independent ISO via a single helper in `utils/date.js`; Shop is unchanged (it already uses the ISO chain); the Certificate and the Account sync-receipt timestamp are left alone (Out of scope).

**Files:**
- `dungeon-scholar/src/utils/date.js` — add the helper(s) next to `formatYmd`.
- `dungeon-scholar/src/utils/date.test.js` — extend (already exists).
- `dungeon-scholar/src/features/study/ExamMode.jsx` — history row (`:423`) + `TrialDetailModal` date label (`:1031-1035`).
- `dungeon-scholar/src/features/progression/AscensionScreen.jsx` — `lastAscended` (`:11`).

**Steps:**

1. In `src/utils/date.js`, add a guarded user-facing formatter that reuses `formatYmd` and preserves each call site's existing invalid/missing fallback (the call sites currently fall back to `'—'` or `null`):
   ```js
   // User-facing calendar date, locale-independent (ISO YYYY-MM-DD).
   // Accepts a Date, an ISO/string, or a number; returns `fallback` for
   // missing/invalid input so call sites keep their current empty-state.
   export const formatDateLabel = (value, fallback = '—') => {
     if (value == null) return fallback;
     const d = value instanceof Date ? value : new Date(value);
     return Number.isNaN(d.getTime()) ? fallback : formatYmd(d);
   };

   // User-facing date + 24h clock time, locale-independent: "YYYY-MM-DD · HH:MM".
   export const formatDateTimeLabel = (value, fallback = '—') => {
     if (value == null) return fallback;
     const d = value instanceof Date ? value : new Date(value);
     if (Number.isNaN(d.getTime())) return fallback;
     const hh = String(d.getHours()).padStart(2, '0');
     const mm = String(d.getMinutes()).padStart(2, '0');
     return `${formatYmd(d)} · ${hh}:${mm}`;
   };
   ```
   (24h `HH:MM` is chosen over `toLocaleTimeString` so the time portion is also locale-independent, matching the ISO direction. If a locale-aware clock is preferred for the time half, keep `toLocaleTimeString` for time only and `formatYmd` for the date — but do not reintroduce a locale-dependent *date*.)
2. `ExamMode.jsx:423` — replace `new Date(rec.startedAt).toLocaleDateString()` (with its `rec.startedAt ? … : '—'` guard) with `formatDateLabel(rec.startedAt)` (the helper already returns `'—'` for missing/invalid). Add the import `import { formatDateLabel } from '../../utils/date.js';`.
3. `ExamMode.jsx:1031-1035` (`TrialDetailModal`) — replace the `dateLabel` template with `formatDateTimeLabel(rec?.startedAt)` (keeps the existing `'—'` fallback). Import `formatDateTimeLabel` alongside.
4. `AscensionScreen.jsx:11` — replace `new Date(playerState.lastAscendedAt).toLocaleDateString()` with `formatDateLabel(playerState.lastAscendedAt, null)` (preserves the current `null`-when-absent behaviour the surrounding render relies on). Import the helper.
5. Leave `ShopScreen.jsx` untouched — it already renders the ISO `todayDateStr()`; optionally add a one-line comment that `todayDateStr()`/`formatDateLabel` are the same canonical ISO surface so the two never drift.

**Verify (read-only, after editing):**
```bash
grep -rn 'toLocaleDateString\|toLocaleTimeString' dungeon-scholar/src/features/study/ExamMode.jsx dungeon-scholar/src/features/progression/AscensionScreen.jsx   # → no output
grep -n 'formatDateLabel\|formatDateTimeLabel' dungeon-scholar/src/features/study/ExamMode.jsx dungeon-scholar/src/features/progression/AscensionScreen.jsx
```

**Tests (extend `src/utils/date.test.js`):**
- `formatDateLabel(new Date(2026, 5, 28))` → `'2026-06-28'`; `formatDateLabel(null)` → `'—'`; `formatDateLabel(undefined, null)` → `null`; `formatDateLabel('not-a-date')` → `'—'`.
- `formatDateTimeLabel(new Date(2026, 5, 28, 9, 5))` → `'2026-06-28 · 09:05'`; invalid/missing → fallback.
- These assertions are fixed ISO strings, so they pass on any CI locale (the whole point of the fix).

**Acceptance:** Shop, Practice-Exam history, the trial-detail modal, and the Ascension stamp all render ISO `YYYY-MM-DD` (history/Ascension) or `YYYY-MM-DD · HH:MM` (trial modal); no user-facing calendar date renders via a bare locale `toLocaleDateString()`; every former fallback (`'—'`/`null`) is preserved; `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all clean.

### 09B (optional) — Chronicle / run-history date label (F1 extension, judgment call)

**Objective:** decide and lock the Chronicle row date (`RunHistoryScreen.jsx:279`) — either fold it into the ISO sweep as `formatDateTimeLabel(run.date)` ("2026-06-28 · 14:14"), or keep its deliberately compact "Jun 28, 02:14 PM" label and document that it is an intentional, design-chosen exception.

**Files:** `dungeon-scholar/src/features/progression/RunHistoryScreen.jsx` (`:279-284`).

**Steps:** if folding in, replace the `new Date(run.date).toLocaleDateString(undefined, {…})` call with `formatDateTimeLabel(run.date)` and import the helper; otherwise add a one-line comment marking the compact label as an intentional exception so a future QA pass does not re-flag it. The report does not name this surface, so either choice satisfies the finding — 09B exists so the decision is explicit rather than implicit.

**Acceptance:** the Chronicle row either renders the ISO date+time helper, or carries a comment documenting the intentional compact format; `npm run build` clean; if converted, the existing run-history render/tests are unchanged apart from the date string.

## Research notes

- The fix leans on infrastructure the app already has: `utils/date.js` is the canonical, UTC-drift-safe date home (S22 consolidated `formatYmd` out of `devotion.js` + `quests.js`), and Shop already renders through it. The defect is purely that three later surfaces reached for `Date.prototype.toLocale*` directly instead of the shared helper.
- ISO `YYYY-MM-DD` is the locale-safe choice the report recommends and the app's de-facto standard (Shop, plus `toISOString()` in `persistence.js`/`cloudSync.js`/`libraryBulk.js` for machine timestamps). Standardizing user-facing dates the same way removes the international `M/D/YYYY` vs `D/M/YYYY` ambiguity.
- The two intentional exceptions are genuinely different presentations, not the same calendar-date notion: `certificate.js:47` renders a *formal* long date ("June 29, 2026") for a printable Certificate of Mastery, and `AccountPanel.jsx:75` renders a *precise sync-receipt* timestamp (full date **and** time via `toLocaleString()`) for "before a reset" journal snapshots. Forcing either to bare ISO would degrade its purpose; both are listed in Out of scope so a future QA pass does not re-flag them as the "same" inconsistency.

## Test plan

- Unit (new, in `src/utils/date.test.js`): `formatDateLabel` and `formatDateTimeLabel` against fixed ISO strings + fallback cases (locale-independent assertions).
- Build/lint/type gate: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` all clean (CI parity).
- Manual spot check (executor): `#/shop`, `#/practiceExam` (history row + open a trial detail), `#/ascension` all show `YYYY-MM-DD`-style dates; confirm an empty/missing date still shows `—` (history/modal) and that Ascension hides the line when `lastAscendedAt` is absent.

## Acceptance criteria

1. A single shared helper in `src/utils/date.js` (`formatDateLabel`, plus `formatDateTimeLabel` for the one date+time surface) is the only path used to render user-facing calendar dates on the converted screens.
2. Shop, Practice-Exam attempt history, the trial-detail modal, and the Ascension "last ascended" stamp all render the locale-independent ISO form; no bare `toLocaleDateString()` remains on a user-facing calendar date in `ExamMode.jsx`/`AscensionScreen.jsx` (and, if 09B is taken, `RunHistoryScreen.jsx`).
3. Every pre-existing missing/invalid fallback (`'—'`, `null`) is preserved.
4. The Certificate long date and the Account sync-receipt timestamp are unchanged (documented exceptions).
5. New unit tests pass with fixed ISO assertions; `npm run lint` + `npm run typecheck` + `npm run test` + `npm run build` are clean.

## Out of scope

- **`src/services/certificate.js:47`** — the Certificate of Mastery's formal long date ("June 29, 2026"). Intentional formal presentation for a printable certificate; not a calendar-row inconsistency. Leave as-is.
- **`src/components/AccountPanel.jsx:75`** — the journal-snapshot sync-receipt timestamp (`toLocaleString()`, full date + time). A precise "when did this snapshot happen" receipt, a different purpose from a bare calendar date. Leave as-is.
- **Machine/serialized timestamps** (`persistence.js`, `cloudSync.js`, `libraryBulk.js` `toISOString()`) — already ISO; not user-facing labels. Untouched.
- **No change to `formatYmd`/`todayDateStr` semantics**, the devotion-streak/quest day-key math, or `examPace.js` — the new helpers build on `formatYmd` without altering it.
- **No light-theme/contrast, routing, performance, or auth work** — those re-confirmed findings belong to PHASE-03 / PHASE-08 / PHASE-02 (see PHASE-INDEX "Already covered" note for the 2026-06-29-3 run).
