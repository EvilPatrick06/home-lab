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

# Low-severity polish / info

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

# Design gotchas (warnings for future agents)

*(none currently logged)*

---

# Info / observations

*(none active)*

---

> dungeon-scholar active bugs / debt: [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md). Resolved dungeon-scholar entries: [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
