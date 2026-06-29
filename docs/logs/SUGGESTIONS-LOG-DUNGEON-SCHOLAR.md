# dungeon-scholar Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — dungeon-scholar domain only.**
>
> Sibling logs:
> - dnd-app suggestions → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO suggestions → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - dungeon-scholar active bugs / debt → [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md)
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - Resolved dungeon-scholar entries → [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Triage rule:** `Domain: dungeon-scholar` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to dungeon-scholar behavior → mirrored here AND in the other relevant suggestions log. Cross-tooling rules that touch dungeon-scholar contributors → here (and mirror in another file if it touches them too).

New entries go at the TOP of their section (newest first).

---

# Future ideas

### [2026-06-28] In-app "report a problem with this question" flow (typo / wrong key / bad option)

- **Category:** future-idea, UX
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src

**Description:**
There is no learner-facing way to flag a defective question. The README explicitly warns that AI-generated tomes can be imperfect, and per-item `explanation`/`correctIndex`/`acceptedAnswers` fields ship as plain authored data — yet when a learner spots a wrong answer key, a typo, or an ambiguous option mid-study there is no path to record it. (The existing "Flag this" in ExamMode is flag-for-review in the exam navigator, not a content-defect report; LabMode "feedback" is per-step pass/fail, not a problem report.) A lightweight report action would capture the tome id + item id + a short note into a local "flagged items" list the author can review in TomeEditor, and (when sharing) travel with the tome.

**Proposed fix / improvement:**
- [ ] Add a small "Report a problem" affordance on Quiz/Flashcards/Exam item footers.
- [ ] Persist flags in tome `progress` (e.g. `flaggedItems: [{itemId, kind, note, ts}]`) — back-compatible, absent = feature off, mirroring the existing optional-field convention in `game/tome.js`.
- [ ] Surface a "Flagged items" list in `TomeEditor.jsx` so the author can jump to and fix each.

**Related files:** `src/features/study/QuizMode.jsx`, `src/features/study/FlashcardsMode.jsx`, `src/features/study/ExamMode.jsx`, `src/features/library/TomeEditor.jsx`, `src/game/tome.js`

### [2026-06-28] User-facing text-size / reading-comfort settings (font scale + optional dyslexia-friendly font)

- **Category:** future-idea, UX, accessibility
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src

**Description:**
`ThemePanel.jsx` already hosts theme (dark/light/system), a colorblind-safe palette, and a language picker, but offers no control over text size or typeface. `RichContent.jsx` sets `fontSize` internally for rendered Markdown/code/LaTeX, so there is no global learner preference for larger body text or a more legible font. For a long-form study app this is a meaningful low-vision / dyslexia accessibility gap (complements the existing reduced-motion + CVD work). A persisted `textScale` (e.g. 90/100/115/130%) applied via a root CSS variable, plus an optional dyslexia-friendly / increased-letter-spacing toggle, would cover it.

**Proposed fix / improvement:**
- [ ] Add a text-size control (3-4 steps) to `ThemePanel.jsx`, persisted in `playerState` like `theme`/`colorblind`.
- [ ] Apply via a root CSS custom property (e.g. `--text-scale`) consumed by `RichContent.jsx` and the chrome.
- [ ] Optional: a "readable font / extra letter-spacing" toggle for dyslexia comfort.

**Related files:** `src/features/home/ThemePanel.jsx`, `src/components/RichContent.jsx`, `src/index.css`

### [2026-06-28] Exam-countdown study plan: turn examDate + prediction + weak-domain data into a daily "what to study today" plan

- **Category:** future-idea
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src

**Description:**
The primitives for a guided cram-toward-the-exam experience already exist independently — a persisted `examDate` (usePlayerActions / DomainStudyScreen), `examPrediction.js` (predicted score + coverage), `weakDomain.js`, and `forgettingCurve.js` (what's at risk) — but nothing orchestrates them into an actionable plan. A "study plan" view could, given days-until-exam and current per-domain mastery, recommend a daily target: which weak domains to prioritize, how many due/at-risk cards to clear today, and whether the learner is on track to hit a passing prediction by exam day. This converts existing analytics from descriptive to prescriptive.

**Proposed fix / improvement:**
- [ ] New `services/studyPlan.js` that composes examDate + examPrediction + weakDomain + forgettingCurve into a per-day recommendation.
- [ ] Surface a compact "Plan for today" card on the home/DomainStudy screen when an `examDate` is set.
- [ ] Unit-test the planner against thin-coverage / no-exam-date edge cases (mirror the honesty stance already in `examPrediction.js`).

**Related files:** `src/services/examPrediction.js`, `src/services/weakDomain.js`, `src/services/forgettingCurve.js`, `src/features/study/DomainStudyScreen.jsx`, `src/features/player/usePlayerActions.js`


# Low-severity polish / info

### [2026-06-28] PWA App Badging API — show due-card count on the installed app icon

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src
- **Effort estimate:** ~1-2 hours

**Description:**
The app is an installable PWA with study reminders/notifications already wired (`services/notifications.js`), but it never calls the App Badging API (`navigator.setAppBadge` / `clearAppBadge`) — confirmed absent by grep. Setting a badge with the number of due/at-risk cards gives a passive, glanceable re-engagement nudge on the installed home-screen/taskbar icon without a notification. It degrades gracefully (Chromium/Android/desktop support it; iOS Safari and Firefox ignore it harmlessly, matching the existing Web Share Target support story).

**Proposed fix / improvement:**
- [ ] On load / after a study session, compute due-card count and call `navigator.setAppBadge(n)` (feature-detect first); `clearAppBadge()` when zero.
- [ ] Reuse the due/at-risk count the forgetting-curve/SRS layer already derives.

**Related files:** `src/services/notifications.js`, `src/services/forgettingCurve.js`, `src/services/srs.js`, `src/sw.js`

### [2026-06-28] Speech-to-text voice input for free-text / Oracle answers (complement existing read-aloud)

- **Category:** future-idea, accessibility
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src

**Description:**
The app ships read-aloud TTS (`services/tts.js`) but no speech-to-text input — grep finds no `SpeechRecognition` usage. Letting a learner dictate free-text answers (graded by `oracleGrader.js`) or Oracle-chat messages via the Web Speech API would round out hands-free / accessibility study and pairs naturally with the existing TTS output. Feature-detect and fall back silently where unsupported (Safari/Firefox coverage is partial), same posture as the other progressive-enhancement features.

**Proposed fix / improvement:**
- [ ] Add an optional mic button to the free-text answer field and Oracle chat input using `webkitSpeechRecognition`/`SpeechRecognition` (feature-detected).
- [ ] Insert the transcript into the existing input; no change to grading.

**Related files:** `src/features/study/ChatMode.jsx`, `src/services/oracleGrader.js`, `src/services/tts.js`

### [2026-06-28] Daily study goal + streak-freeze re-engagement

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src

**Description:**
Streak tracking exists (`currentStreak`/`maxStreakToday`/`longestStreak` in usePlayerActions) but it is a per-answer correctness streak, not a daily-habit streak, and there is no daily goal or streak-protection mechanic (grep finds no `dailyGoal`/streak-freeze). A configurable daily target (e.g. N cards or M minutes/day) with a small completion indicator, plus an earnable "streak freeze" token that forgives one missed day, is a well-proven habit/retention loop and fits the existing gamification economy (XP, titles, shop, devotion). Framed in-theme it could be a "ward scroll" that protects a study streak.

**Proposed fix / improvement:**
- [ ] Add a per-day study-goal setting + a daily-completion flag in `playerState`.
- [ ] Track consecutive goal-met days as a habit streak distinct from the answer streak.
- [ ] Add a streak-freeze token (earned/bought via the existing shop/economy) that forgives one missed day.

**Related files:** `src/features/player/usePlayerActions.js`, `src/features/progression/ShopScreen.jsx`, `src/game/defaultState.js`


# Design gotchas (warnings for future agents)

*(none currently logged)*

---

# Info / observations

*(none active)*

---


> dungeon-scholar active bugs / debt: [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md). Resolved dungeon-scholar entries: [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
