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


### [2026-06-23] Resolved by scholar-resolver — feature/refactor wave (branch auto/scholar-resolver)

> Larger dungeon-scholar suggestions implemented per the user's go-ahead to do everything. Full local suite + production build green per commit.


> **Resolved 2026-06-23 (scholar-resolver):** Opt-in local reminders: notifications service + AccountPanel toggle + on-load due-card nudge.

### [2026-06-22] PWA study reminders / re-engagement notifications (due cards, streak at risk)

- **Category:** future-idea
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** dungeon-scholar tree review (services/srs.js, services/forgettingCurve.js, services/devotion.js, vite-plugin-pwa config)

**Description:**
The app already computes everything a re-engagement nudge needs — SRS due counts (`services/srs.js` `dueCount`/`filterDue`), forgetting-curve "at risk next week" projections (`services/forgettingCurve.js`), and a daily-devotion login streak (`services/devotion.js`) — but there is no way to pull a lapsed user back. The only "notification" surface is an in-app toast (`App.jsx` `setNotification`, purely in-DOM). There is no use of the Web Notifications API, no `Notification.requestPermission`, and no Workbox `periodicSync`, even though the app is already an installed PWA with a service worker (`vite-plugin-pwa`, `registerType: 'autoUpdate'`). A study app whose whole value proposition is spaced repetition benefits enormously from "you have N cards due / your 6-day streak resets tonight" reminders, and the data to fire them already exists.

**Proposed fix / improvement:**
- [ ] Add an opt-in "Study reminders" toggle (Home settings) that calls `Notification.requestPermission` only on explicit user action.
- [ ] On a `periodicSync` (or a best-effort on-launch check), surface a local notification when `dueCount > 0` or the devotion streak is about to lapse.
- [ ] Keep it fully local/offline — no push server needed; degrade silently where the API/permission is unavailable (iOS installed-PWA caveats already documented in README).

**Related files:** `src/services/srs.js`, `src/services/forgettingCurve.js`, `src/services/devotion.js`, `vite.config.js` (VitePWA/workbox), `src/App.jsx`

---


> **Resolved 2026-06-23 (scholar-resolver):** Scholar's Ledger screen (accuracy, due/rotation counts, per-domain mastery, weakest domain).

### [2026-06-22] Dedicated study-stats / analytics dashboard (accuracy trend, study time, per-domain mastery)

- **Category:** future-idea
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** dungeon-scholar tree review (src/features/progression/*)

**Description:**
Study-progress signals are scattered and game-flavored rather than presented as a single learner-facing analytics view. The progression screens are all delve/RPG framed — `RunHistoryScreen` (dungeon-run summaries), `AscensionScreen`, `BestiaryScreen`, `CalendarScreen`, `CraftingScreen`, `InventoryScreen`, `ShopScreen`, `SpellbookScreen`, `StableScreen` — and the genuinely useful learning metrics live in services without a home screen: `weakDomain.js` (weakest domain), `examPrediction.js` (pass-likelihood), `examPace.js`, `forgettingCurve.js` (retention curve + milestones), `srs.js` (due/ease/interval). A learner cramming for a cert wants one place that answers "am I improving?" — accuracy over time, cards mastered vs. at-risk, time studied, and per-domain mastery trend. Today they must infer that from RPG screens and the in-exam prediction.

**Proposed fix / improvement:**
- [ ] Add a "Scholar's Ledger" (or similar) stats screen aggregating existing service outputs: retention curve (forgettingCurve), per-domain accuracy + weakest domain (weakDomain), pass-likelihood (examPrediction), SRS due/mastered counts (srs), cumulative study time.
- [ ] Reuse the existing `RecordTile`/`OrnatePanel` UI primitives so it fits the theme with no new design system work.
- [ ] No new tracking needed if the metrics already persist; otherwise add lightweight per-session counters to `persistence.js`.

**Related files:** `src/services/weakDomain.js`, `src/services/examPrediction.js`, `src/services/forgettingCurve.js`, `src/services/srs.js`, `src/features/progression/RunHistoryScreen.jsx`, `src/services/persistence.js`

---


> **Resolved 2026-06-23 (scholar-resolver):** Delve a11y: aria-live announcements + role/label + visible focus ring (WASD/arrow/E/Z-X-C/1-2-3 already existed).

### [2026-06-22] Keyboard-accessible Dungeon Delve — the canvas game has no non-pointer / screen-reader path

- **Category:** UX
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** dungeon-scholar tree review (src/components/DungeonExplore.jsx)

**Description:**
The Dungeon Delve is rendered entirely on a `<canvas>` in `DungeonExplore.jsx` and exposes essentially no assistive-tech surface — a grep finds a single `role="status"` and no `aria-*`/`alt`/keyboard-move handlers in the whole ~4,500-line file. The README frames the delve as "the same study queue, just visualized," so the learning content is reachable elsewhere, but a keyboard-only or screen-reader user cannot actually *play* the delve (movement, battles, boss gates) that the rest of the app funnels them toward, and a canvas is opaque to screen readers by construction. This is distinct from the prior reduced-motion entry (that is about animation; this is about input + AT access) and from the DungeonExplore God-file refactor.

**Proposed fix / improvement:**
- [ ] Add keyboard movement/interaction bindings (arrow/WASD + confirm) with a visible focus indicator for the delve.
- [ ] Mirror delve state into an off-canvas live region (`aria-live`) announcing room, encounter, and outcome.
- [ ] Offer a "text delve" fallback mode that walks the same queue as a list/stepper for AT users (low extra surface since the queue logic already exists).

**Related files:** `src/components/DungeonExplore.jsx`, `docs/QA-CHECKLIST.md` (add an AT pass for the delve)

---


> **Resolved 2026-06-23 (scholar-resolver):** Canvas RAF loop honors prefers-reduced-motion (frame cap to ~15fps + frozen ambient motion).

### [2026-06-22] Dungeon canvas animation ignores prefers-reduced-motion (WCAG 2.3.3)

- **Category:** UX
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** Review of the dungeon-scholar tree for improvement ideas.

**Description:**
The app honors `prefers-reduced-motion` for CSS transitions/animations only — `src/index.css` has a single `@media (prefers-reduced-motion: reduce)` block (PHASE-19B, line ~205) that near-zeroes CSS durations. But the dungeon delve renders to a `<canvas>` driven by a `requestAnimationFrame` loop in `src/components/DungeonExplore.jsx` (the `tick` function, `raf = requestAnimationFrame(tick)` at ~line 3946), and that loop does NOT consult `window.matchMedia('(prefers-reduced-motion: reduce)')`. A CSS media query cannot throttle a JS RAF loop, so the continuous canvas motion (player movement, sprite/FX animation, HUD redraws) runs at full motion for users who have explicitly requested reduced motion at the OS level. `grep` confirms `matchMedia` is used only in `App.jsx` for `prefers-color-scheme` (theme), nowhere for motion. This is the single most motion-heavy surface in the app and the one a vestibular-sensitive user is most likely to need calmed — exactly the WCAG 2.3.3 (Animation from Interactions) case.

**Hypothesis / root cause:** PHASE-19B added reduced-motion support at the CSS layer before/around the time the canvas dungeon grew; the canvas render loop was never wired to the same preference because CSS media queries silently don't reach it.

**Proposed fix / improvement:**
- [ ] Read `window.matchMedia('(prefers-reduced-motion: reduce)')` once in `DungeonExplore` (and subscribe to its `change` event) and, when reduce is set, drop non-essential animation: skip idle/ambient sprite frames, cut FX particles, and either render on state-change only or cap the loop to a low frame rate.
- [ ] Keep gameplay-essential redraws (position updates on a move) but remove decorative motion.
- [ ] Optional: expose an in-app "Reduce motion" toggle in `ThemePanel`/`AudioPanel` that ORs with the OS setting, for users whose OS preference isn't set but who still want calm motion.

**Related files:** `src/components/DungeonExplore.jsx` (RAF `tick` ~line 3946), `src/index.css` (existing CSS reduced-motion block ~line 205), `src/App.jsx` (existing `matchMedia` pattern ~line 195)

---


> **Resolved 2026-06-23 (scholar-resolver):** Offline library content search over tome title/subject/domain + card text.

### [2026-06-22] No search / term-lookup across cards within a tome or the library

- **Category:** UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** Review of the dungeon-scholar tree for improvement ideas.

**Description:**
There is no way to search the study content. A learner who remembers a term ("what was the card about CIDR subnetting?" / "where is STRIDE explained?") cannot find it — `LibraryScreen.jsx` has no search/filter input (grep for `search`/`filter` there matches only icon names), and there is no card-text search inside a tome. The only `search`-bearing study surface is `features/study/ChatMode.jsx` (the AI Oracle chat), which is network-only and a different interaction than "jump to the card that defines X". For large imported tomes (the LibraryScreen virtualization issue in `ISSUES-LOG-DUNGEON-SCHOLAR.md` notes 120-tome / large-deck scale), the absence of a client-side text search makes targeted review and "look this one thing up" essentially impossible without scrolling the whole deck.

**Hypothesis / root cause:** Study flow was built around sequenced queues (SRS due-queue, quiz, exam) rather than random-access lookup, so free-text search was never added.

**Proposed fix / improvement:**
- [ ] Add a client-side, offline search box (tome name + card front/back/explanation text) to `LibraryScreen` and/or a global "lookup" surface; results link straight into the relevant card.
- [ ] Keep it purely local (no Oracle round-trip) so it works offline and is instant; reuse the normalized tome shape from `game/tome.js`.
- [ ] Optional: scope toggle (this tome / all tomes) and highlight matched terms in `RichContent`.

**Related files:** `src/features/library/LibraryScreen.jsx`, `src/game/tome.js`, `src/components/RichContent.jsx`, `src/features/study/MistakeVault.jsx`

---


> **Resolved 2026-06-23 (scholar-resolver):** Minimal i18n foundation (t() over message catalogs, en locale, lang follows locale) for incremental migration.

### [2026-06-22] App is English-only with no internationalization layer (strings hardcoded inline)

- **Category:** portability
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** Review of the dungeon-scholar tree for improvement ideas.

**Description:**
Every user-facing string is hardcoded English inline in JSX (heavy D&D flavor text throughout), there is no i18n/locale library or message catalog (`grep` for `i18n`/`locale` across `src/` matches only an unrelated key in `persistence.js`), and `index.html` pins `<html lang="en">` with no mechanism to switch. The cert material the app targets (CompTIA, AWS, Cisco, etc.) has a large non-native-English-speaking audience, so an English-only UI is a real reach limiter. This is logged honestly as `low` because (a) it is a large effort given how entangled flavor copy is with the UI, and (b) the imported *tome content* would still be whatever language the author wrote — i18n would cover chrome/UI only. Worth recording so the cost is visible if broader reach is ever a goal.

**Hypothesis / root cause:** Built as a personal/single-locale study tool; flavor-rich English copy was written directly into components with no extraction step.

**Proposed fix / improvement:**
- [ ] If/when reach matters: introduce a lightweight message-catalog layer (or a tiny custom `t()` over JSON locale files to avoid a heavy dep, fitting the lean-bundle goal) and extract UI strings.
- [ ] Make `<html lang>` follow the chosen UI locale.
- [ ] Treat as a deliberate non-goal until there's demand — but keep the entanglement cost on record.

**Related files:** `index.html` (`lang="en"`), `src/**/*.jsx` (inline strings), `src/features/home/ThemePanel.jsx` (natural home for a future language picker)

---


> **Resolved 2026-06-23 (scholar-resolver):** Added dungeon-scholar-ci.yml (test+build) and oracle-worker-ci.yml (install+syntax) on push/PR.

### [2026-06-22] No PR-time CI gate for dungeon-scholar or oracle-worker

- **Category:** future-idea
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting repo-wide scan

**Description:**
`dnd-app` has a dedicated CI gate (lint + forbidden-patterns + tsc + tests + build smoke + circular + audit). `dungeon-scholar` runs `npm run test` ONLY as a precondition of the Pages deploy (`deploy.yml`, push to main) — there is no `pull_request`-triggered test/build gate, so a PR merges green and only fails later at deploy time. `oracle-worker` has a `test` script but zero workflows reference it, so its tests never run in CI.

**Proposed fix / improvement:**
- [ ] Add `dungeon-scholar-ci.yml` (path-filtered test + build on push + PR).
- [ ] Add `oracle-worker-ci.yml` (npm ci + test).
- [ ] Optionally factor the shared setup-node / npm-ci steps into a composite action reused by all JS-project workflows.

**Related files:** `.github/workflows/deploy.yml`, `dungeon-scholar/package.json`, `oracle-worker/package.json`

---


> **Resolved 2026-06-23 (scholar-resolver):** Exam flag-for-review (persisted) + question-navigator grid + pre-submit review jump.

### [2026-06-22] Practice exam lacks flag-for-review + a question navigator grid

- **Category:** UX
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** Review of the dungeon-scholar tree for improvement ideas.

**Description:**
`ExamMode` (Phase 26e) is explicitly modeled on real cert exams ("mimics the real cert exam", timed, can't pause). Real proctored engines (Pearson VUE / PSI) universally provide two things this mode does not: (1) a **flag/mark-for-review** toggle per question, and (2) a **question navigator** (a grid of all question numbers showing answered / unanswered / flagged, with click-to-jump). The current exam is one-question-at-a-time with only prev/next navigation — no flag state exists anywhere in `ExamMode.jsx` or `services/examSession.js`, and there's no end-of-exam "you flagged N / left M blank — jump back?" review step before final submit. For a 90-question timed exam this makes triage (skip-and-return-to-the-hard-ones) tedious and trains a worse exam strategy than the real test rewards.

**Proposed fix / improvement:**
- [ ] Add per-question `flagged` state to the exam session (persist it alongside answers in `examSession`/`sessionResume` so a refresh keeps flags).
- [ ] Add a navigator grid (answered / blank / flagged color-coding) with click-to-jump, themed as a "trial map".
- [ ] Add a pre-submit review gate listing unanswered + flagged questions with one-click jump-back.
- [ ] Keep it keyboard-accessible (there's already a hotkey layer in `ExamMode`, e.g. the `t`/answer keys).

**Related files:** `src/components/ExamMode.jsx`, `src/services/examSession.js`, `src/services/sessionResume.js`

---

---


> **Resolved 2026-06-23 (scholar-resolver):** Web Speech tts service + Read-aloud on flashcards, quiz, and exam.

### [2026-06-22] Read-aloud (text-to-speech) for flashcards / questions — accessibility + hands-free study

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** Review of the dungeon-scholar tree for improvement ideas.

**Description:**
There is no text-to-speech anywhere in the app — `grep` for `speechSynthesis` / `SpeechSynthesisUtterance` across `src/` returns nothing. A read-aloud button on flashcards and quiz/exam question text would help (a) low-vision / dyslexic learners, (b) hands-free / eyes-free review (commuting, walking), and (c) general retention via dual-channel encoding. The browser `Web Speech API` (`speechSynthesis`) is free, offline-capable, and needs no new dependency — fitting the offline-first PWA story. It would need to coexist with the existing audio engine (`audio/sound.js`) so SFX/BGM ducks while speaking, and respect a per-mode toggle. RichContent (code/Mermaid) should be skipped or summarized rather than read verbatim.

**Proposed fix / improvement:**
- [ ] Add a small "read aloud" control to flashcard front/back, quiz prompts, and exam questions using `window.speechSynthesis`.
- [ ] Strip/skip code fences + Mermaid before speaking (reuse `services/richContent.js` parsing).
- [ ] Duck BGM/SFX while an utterance is active; expose a settings toggle + voice/rate picker in `AudioPanel`.

**Related files:** `src/features/study/FlashcardsMode.jsx`, `src/features/study/QuizMode.jsx`, `src/components/ExamMode.jsx`, `src/audio/sound.js`, `src/features/home/AudioPanel.jsx`, `src/services/richContent.js`

---

---


> **Resolved 2026-06-23 (scholar-resolver):** In-app TomeEditor (flashcards + quiz CRUD), reachable per unsealed Library card.

### [2026-06-22] In-app tome authoring / editor (the only path today is hand-writing JSON)

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** Review of the dungeon-scholar tree for improvement ideas.

**Description:**
Creating new study content requires hand-authoring the tome JSON by hand — `PromptModal.jsx` even surfaces a "ⓘ View tome JSON schema (for hand-authoring)" link, which is the entire content-creation UX. There's no in-app editor to add/edit flashcards, quiz items, or labs, even though the app already has `MetadataEditModal` for editing a tome's title/domain. A guided editor (add card, add MCQ with options + correctIndex + explanation, add lab steps) writing the same normalized shape `normalizeTomeData` already accepts would dramatically lower the barrier to user-generated decks and let users fix typos in imported tomes without round-tripping through a text editor. It pairs naturally with the AI prompt templates in `src/prompts/` (generate-then-edit).

**Proposed fix / improvement:**
- [ ] Extend the metadata-edit surface into a full per-section CRUD editor (flashcards / quiz / labs) that emits the schema `normalizeTomeData` validates.
- [ ] Add inline validation (correctIndex in range, non-empty options, unique ids).
- [ ] Optional: "generate draft from prompt" hook into `src/prompts/` then drop the result into the editor for review.

**Related files:** `src/features/library/MetadataEditModal.jsx`, `src/components/PromptModal.jsx`, `src/game/tome.js` (`normalizeTomeData`), `src/prompts/`

---

---


> **Resolved 2026-06-23 (scholar-resolver):** Bundled starter decks (app basics + study science) + Library catalog; cert content left for human authoring.

### [2026-06-22] Bundle more starter tomes — 11 provider prompt sets but only 3 shipped decks

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** Review of the dungeon-scholar tree for improvement ideas.

**Description:**
The repo ships only three tomes (`tome-security-plus-sy0-701.json`, `tome-aws-clf-c02.json`, `tome-ccst-cybersecurity.json`), yet `src/prompts/` carries provider-specific generation templates for eleven vendors (aws, cisco, cmmc, comptia, eccouncil, giac, google, isaca, isc2, microsoft, generic). New users with no content land on a near-empty deck picker for most certs the app clearly intends to support. A handful of additional vetted starter tomes (e.g. Network+, CompTIA A+ — both referenced in the README's "first session" copy but not actually bundled — and one each for the AWS/Azure/Google/Cisco tracks the prompts target) would make the app useful out-of-the-box for far more learners and showcase the rich-content (Mermaid/code/lab) features. A lightweight in-app "deck catalog / starter-pack" picker that imports a bundled tome on demand would keep the initial bundle small while improving first-run value.

**Proposed fix / improvement:**
- [ ] Author/vet a few more starter tomes covering the cert tracks the `src/prompts/` templates already target (and the Network+/A+ the README names).
- [ ] Add a "starter decks" catalog to the deck picker / Library that imports a bundled tome on click (lazy-fetched so the initial PWA payload stays lean).

**Related files:** `tome-*.json`, `src/prompts/`, `src/features/library/LibraryScreen.jsx`, `README.md` (first-session copy references Network+/A+)

---

---

---


> **Resolved 2026-06-23 (scholar-resolver):** Extracted map-gen + game data into game/dungeonMap.js; canvas tile-renderer extraction noted as follow-up.

### [2026-06-22] DungeonExplore.jsx is a 4,536-line God-file mixing canvas rendering, map-gen, and the React component

- **Category:** debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** autonomous cleanup scan of dungeon-scholar/

**Description:**
`src/components/DungeonExplore.jsx` is 4,536 lines — by far the largest source file (next is App.jsx at 1,665). It bundles three distinct concerns under one `components/` file: (1) ~60 pure canvas tile/sprite drawing functions (`drawWall`, `drawFloor`, `drawNightshade`, … starting ~line 714), (2) pure procedural map-generation + game data (`generateMap`, `generateStarterMap`, `makeSeededRng`, `BIOMES`, `ROOMS_BY_DIFFICULTY`, `BIOME_BOSS_POOL`, etc.), and (3) the actual React component, which only begins at line 2617 — meaning ~57% of a file living under `components/` is non-component logic. The pure exports are already imported outside the component (`features/player/usePlayerActions.js`, `features/progression/StableScreen.jsx`), so they are effectively a misplaced module. This is inconsistent with the PHASE-39 architecture split that moved data/helpers into `src/game/` and primitives into `src/components/ui/`; DungeonExplore was left as an un-split monolith.

**Hypothesis / root cause:** PHASE-39 split App.jsx but did not touch DungeonExplore, so its map-gen + canvas helpers never migrated to `src/game/` / a dedicated rendering module.

**Proposed fix / improvement:**
- [ ] Extract map-gen + game-data exports into `src/game/dungeonMap.js` (consistent with PHASE-39's `src/game/`).
- [ ] Extract the ~60 canvas `draw*` functions into `src/components/dungeon/tileRenderer.js` (or similar).
- [ ] Leave `DungeonExplore.jsx` as the React component only; re-point the existing `DungeonExplore.test.js` imports.

**Related files:** `dungeon-scholar/src/components/DungeonExplore.jsx`, `dungeon-scholar/src/components/DungeonExplore.test.js`, `dungeon-scholar/src/features/player/usePlayerActions.js`, `dungeon-scholar/src/features/progression/StableScreen.jsx`

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
