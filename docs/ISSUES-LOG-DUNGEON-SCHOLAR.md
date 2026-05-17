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

> **Phase 27 status (as of 2026-05-17):** The 38-finding Phase 27 audit (`/home/patrick/.claude/plans/dungeon-scholar-phase-27.md`) was planned but never implemented — only the audit-logging commit `bb531c76` landed. Phase 30 (the 2026-05-17 QA bundle, plan `/home/patrick/.claude/plans/dungeon-scholar-phase-30.md`) resolved the three findings that re-surfaced as QA bugs: **M1** (header aria-labels → 30h), **L2** (keyboard answers → 30g), **L6** (focus ring → 30f). The remaining 35 Phase 27 findings (H1–H7, M2–M13 except M1/M12, L1, L3–L5, L7–L18 except L2/L6, F2–F6) stay in the active logs pending a future phase.

---

# Active Issues

## Critical

*(none currently logged)*

---

## High

### [2026-05-12] H7 — Color-only feedback on quiz answer correctness

- **Category:** bug, UX
- **Severity:** high
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** Quiz answer-feedback distinguishes correct vs. wrong purely by red/green background and icon color. Red-green colorblind users (~5% of men) get a noticeably weaker signal. The Check/X lucide icons help, but they are small and themselves colored red/green. Fails WCAG 1.4.1 (Use of Color).

**Proposed fix:**
- [ ] Make the "Strike True" / "Blow Falters" text token bolder + tabular
- [ ] Add a left border pattern (dotted for wrong, solid for correct)
- [ ] Verify with a colorblind-simulation browser extension

**Related files:** `dungeon-scholar/src/App.jsx:4517–4523`

---

### [2026-05-12] H5 — Achievement checks fire side effects from inside `setState` updater (quiz streak)

- **Category:** bug
- **Severity:** high
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** `setStreak(s => { ... if (ns >= 10) checkAchievement('streak_10'); ... return ns; })` calls `checkAchievement`, which itself calls `setPlayerState` and `showNotif`. State-updater functions must be pure — React 18 strict-mode double-invokes them, which can fire the achievement notification twice. The volume / accuracy checks in `recordAnswer` (lines 2104–2123) are correctly inside the outer `setPlayerState` updater and mutate `next` directly, which is safe — only the streak block is the anti-pattern.

**Proposed fix:**
- [ ] Move the streak achievement checks to a `useEffect([playerState.currentStreak])` outside the updater
- [ ] Verify achievement is awarded exactly once across strict-mode + production builds

**Related files:** `dungeon-scholar/src/App.jsx:4343–4350`

---

### [2026-05-12] H4 — Modal a11y gap is repo-wide (PromptModal / AccountPanel / MergeChooser)

- **Category:** bug, UX
- **Severity:** high
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** None of the three modal shells set `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus-trap, Escape-to-close, or focus-restore-on-close. Background remains tab-able. PromptModal does have `aria-label` on its X / back icons (partial credit) but the dialog wrapper itself is unlabeled. Affects every keyboard and screen-reader user.

**Proposed fix:**
- [ ] Extract a single `Modal` wrapper component covering all four behaviors
- [ ] Replace the three call sites (`PromptModal`, `AccountPanel`, `MergeChooser`) — should be a ~30 line, single-file addition

**Related files:** `dungeon-scholar/src/components/PromptModal.jsx:45`, `AccountPanel.jsx:57`, `MergeChooser.jsx:35`

---

### [2026-05-12] H3 — `.github/workflows/deploy.yml` triggers on `master` only

- **Category:** config
- **Severity:** high
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** `branches: [master]` matches the owner's local repo, but conflicts with GitHub's modern default (`main`). A fork created today will push to `main` and see no deploys until they discover the workflow's branch list excludes `main`.

**Proposed fix:**
- [ ] Update to `branches: [main, master]` so both work

**Related files:** `.github/workflows/deploy.yml:5`

---

### [2026-05-12] H2 — `docs/supabase-setup.md` hardcodes owner's GitHub Pages URL in three places

- **Category:** config, docs
- **Severity:** high
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** Step 3 (Homepage URL), Step 5 (Site URL), and Step 5 Redirect URLs all paste literal `https://evilpatrick06.github.io/home-lab/`. Forks that copy-paste end up with broken OAuth (Supabase rejects mismatched redirects silently — user clicks sign-in, comes back unsigned with no error).

**Proposed fix:**
- [ ] Use `https://<your-username>.github.io/<your-repo>/` placeholders
- [ ] Add a small worked example showing what to substitute
- [ ] Cross-reference vite.config.js base path

**Related files:** `dungeon-scholar/docs/supabase-setup.md:51, 68, 71`

---

### [2026-05-12] H1 — `vite.config.js` base path is owner-specific, silently breaks forks

- **Category:** config
- **Severity:** high
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** `base: '/home-lab/'` is the owner's deployed-repo name. README explicitly tells forkers their repo should typically be `dungeon-scholar` and to "leave it" — but the shipped code is `/home-lab/`. A fork following the README ends up with a blank page on GH Pages and no obvious error message.

**Proposed fix:**
- [ ] Either change the default to `/dungeon-scholar/` and add a one-line note that the owner's fork uses `/home-lab/`, or…
- [ ] Read from a CI env var (e.g., `VITE_BASE` defaulting to `/dungeon-scholar/`)
- [ ] Cross-reference supabase-setup.md (H2) — the base path and Supabase Redirect URL must agree

**Related files:** `dungeon-scholar/vite.config.js:7`

---

## Medium

### [2026-05-12] M13 — `claimDailyReward` has subtle clock-back / future-date edge cases

- **Category:** bug
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** Today-check (`=== today`) prevents double-claim on the same wall-clock day, but a user whose system clock rolls back across midnight (DST, NTP correction, deliberate) can claim twice. Conversely, if `lastClaimedDate` is set to a future date (e.g., by a buggy import), `dayDiff` returns negative and the streak resets to 1 forever — the user can never claim on the "correct" day.

**Note:** Agent A's original framing about `dayDiff` returning `Infinity` was checked and turned out to be already guarded at `App.jsx:1757`. The real edge case is around forward / backward clock jumps and corrupt date imports.

**Proposed fix:**
- [ ] Either accept the clock-edge case (single-user app — not worth defending against the user's own clock)
- [ ] Or: store `Date.now()` as a monotone fence next to the date string and only allow claim when both the day-string differs AND `Date.now()` is past the prior claim's wall time

**Related files:** `dungeon-scholar/src/App.jsx:1752–1784`, `dungeon-scholar/src/services/devotion.js:31–36, 41–51`

---

### [2026-05-12] M12 — `MergeChooser` warning is hover-only

- **Category:** UX
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** "The other side will be replaced." is a destructive consequence shown only via `title=` (hover tooltip). On the rare path where two journals collide, this is the most important message in the UI — but only desktop users with a mouse see it. Touch / keyboard users get no warning before pressing the irreversible button.

**Proposed fix:**
- [ ] Move "the other side will be replaced" inline under the heading, not as a tooltip
- [ ] Keep the title= attribute as redundant reinforcement

**Related files:** `dungeon-scholar/src/components/MergeChooser.jsx:25`

---

### [2026-05-12] M10 — localStorage write failures are silently swallowed

- **Category:** bug, UX
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** Both `saveToLocalStorage` and audio `saveSettings` `catch { /* silent */ }`. A user in Firefox's private mode or with a 5 MB quota near full sees their progress evaporate every refresh with no warning.

**Proposed fix:**
- [ ] Detect quota / availability failure in the catch, expose via a one-shot ref / state flag
- [ ] Surface a one-time toast: "Couldn't save locally — sign in for cloud backup."
- [ ] De-dupe so it doesn't fire on every keystroke

**Related files:** `dungeon-scholar/src/services/persistence.js:32–34`, `dungeon-scholar/src/audio/sound.js:42`

---

### [2026-05-12] M7 — `src/index.css` has no `prefers-reduced-motion` block

- **Category:** UX, a11y
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** Tailwind transitions, the `animate-pulse` low-time clock indicator (ExamMode.jsx:226), background pulses, level-up flashes — none disable for motion-sensitive users.

**Proposed fix:**
- [ ] Add `@media (prefers-reduced-motion: reduce)` block in `index.css` with the standard animation / transition disable

**Related files:** `dungeon-scholar/src/index.css`

---

### [2026-05-12] M6 — Greedy regex in `extractJsonVerdict` picks the wrong object on multi-JSON output

- **Category:** bug
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** `/\{[\s\S]*\}/` is greedy. If the Oracle (or a future model) wraps its verdict in prose with example JSON ("for instance `{...}`, but my real answer is `{...}`"), the regex captures from the first `{` to the last `}` — a non-parsing concatenation, falling back silently to the local string-match. User can be marked wrong when the model graded them correct (or vice versa).

**Proposed fix:**
- [ ] Match a single balanced `{...}` block (or just take the LAST `\{[^{}]*\}` since the system prompt forces single-line JSON)
- [ ] Add tests covering at least three multi-JSON shapes

**Related files:** `dungeon-scholar/src/services/oracleGrader.js:52`

---

### [2026-05-12] M5 — ExamMode timer triggers submit from inside `setSecondsLeft` updater (anti-pattern)

- **Category:** debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** The updater function is expected to be pure, but it calls a side-effecting submit via `submitExamRef.current?.('timeout')`. Same anti-pattern as H5. Works today; doubles in React 18 strict mode; will earn a React warning eventually.

**Note:** Agent A's original framing was "stale closure" — verified false. `submitExamRef.current = doSubmit` reassigns every render so the ref is always fresh. The real concern is the side-effect-inside-pure-updater pattern.

**Proposed fix:**
- [ ] Move the "did it hit zero?" check to a `useEffect([secondsLeft, phase])`
- [ ] Keep the setInterval, but only inspect `secondsLeft` in an effect — no state-mutating call inside the updater

**Related files:** `dungeon-scholar/src/components/ExamMode.jsx:88–101`

---

### [2026-05-12] M4 — Realtime / BroadcastChannel can clobber exam record via stale `prior` closure

- **Category:** bug, debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** ExamMode's local `answers` state is safe (it's component state). But on submit, `updateTomeProgress?.({ practiceExams: [...prior, record] })` closes over `prior = tomeProgress?.practiceExams` — captured at render time. If a Realtime / BroadcastChannel update lands mid-exam, the `practiceExams` array is replaced, then submit appends to the stale closure and overwrites whatever the other device wrote.

**Note:** Agent A originally framed this as "exam lost when Realtime fires." Verified that the exam's `answers` are local state and safe. The actual loss surface is the merge of practiceExams history on submit, not the exam itself.

**Proposed fix:**
- [ ] Switch `updateTomeProgress` (defined in App.jsx) to accept a function `(prevTomeProgress) => nextTomeProgress` so the append reads the latest array
- [ ] Update ExamMode.jsx submit to use the functional form: `updateTomeProgress(prev => ({ practiceExams: [...(prev.practiceExams || []), record].slice(-20) }))`

**Related files:** `dungeon-scholar/src/components/ExamMode.jsx:79–80`, `dungeon-scholar/src/App.jsx` (`updateTomeProgress` definition site)

---

### [2026-05-12] M3 — Mistake-vault dedup compares `m.id === item.id` without ID-presence guard

- **Category:** bug
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** If `item.id` is `undefined` (malformed tome), the `find` matches the first prior entry that also lacks an id (or none, then it pushes). Either way, undefined-ID items balloon the vault or alias each other.

**Proposed fix:**
- [ ] `if (!item || !item.id) return t;` early-return before the `find`

**Related files:** `dungeon-scholar/src/App.jsx:2079–2095`

---

### [2026-05-12] M2 — Oracle answer-grading has no AbortController, leaks setState after unmount

- **Category:** bug, debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 27 audit

**Description:** `gradeAnswer` accepts an `AbortSignal` but `submitFillBlankWithOracle` never passes one. If the user navigates away mid-grade, `setGrading(false)` and `handleAnswer(...)` fire on an unmounted component — React 18 silently swallows it, but it costs a render and can re-trigger the achievement-check chain on the leaving component's stale state.

**Proposed fix:**
- [ ] Wrap each submitter in a `useRef(new AbortController())`, cleared in a cleanup effect
- [ ] Pass `signal` to `gradeAnswer`
- [ ] Repeat for Lab mode (same pattern)

**Related files:** `dungeon-scholar/src/services/oracleGrader.js:90`, `dungeon-scholar/src/App.jsx:4354–4368`

---

## Low

*(low-severity items moved to `SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md` per logging convention — see L1–L18 entries there)*

---

> dungeon-scholar future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app issues: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
