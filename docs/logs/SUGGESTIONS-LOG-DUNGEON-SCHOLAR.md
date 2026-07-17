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

> **RESOLVED 2026-07-03 (`auto/scholar-features-batch`, owner-approved backlog batch):** The following FEATURE suggestions were implemented and their full entries moved to [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md) (2026-07-03 batch entry): Tome → CSV/Quizlet export; cloze/text-occlusion cards; user-tunable desired-retention + daily new-card cap; tome revision/versioning; confidence-calibration (was already built); printable/PDF export; daily study goal + streak-freeze; text-size / dyslexia-font settings; PWA App Badging; diagram text-alternative (a11y); Windows High-Contrast / forced-colors; report-a-problem; cross-tome practice exam (tested core); exam-countdown study plan; speech-to-text dictation. Also **PHASE-11D** (practice-exam preset de-dup). A few larger tails (cloze author-affordance, tome-version import-merge UI, full cross-tome timed ExamMode flow) landed their tested pure cores with the remaining UI wiring noted as follow-up. The original entries below are retained for history but are CLOSED.


# Future ideas

### [2026-07-17] Import a tome directly from a URL (paste-a-link + share-link deeplink)

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-suggestion scan of dungeon-scholar

**Description:**
Today a tome reaches another user only as a downloaded `.json` file, a paste, or a share code (`ImportCodeModal`) — there is no way to import from a URL. Authors who host a tome on a gist / raw GitHub / any static host cannot hand out a simple link; recipients must download-then-import. A "paste a URL" field in the import flow, plus a hash-route deeplink (e.g. `#/import?url=<encoded>`) that pre-opens the import confirm, would make sharing one click and composes with the existing PWA share-target. `grep -rn "fetch(" src/features/library src/services/deckImport.js` confirms no remote fetch exists in the import path.

**Proposed fix / improvement:**
- [ ] Add a URL input to `ImportDeckModal`/`ImportCodeModal` that `fetch()`es the JSON (CORS permitting), then feeds the existing `deckImport.js` validation + `importLimits.js` size caps.
- [ ] Add an import deeplink route handled in `useHashRoute`/`App.jsx` that opens the same confirm dialog (never auto-imports — user must confirm, since the URL is untrusted input).
- [ ] Reuse the tome-revision merge path (`tomeVersion.js`) when the id already exists locally.

**Related files:** `src/features/library/ImportCodeModal.jsx`, `src/features/library/ImportDeckModal.jsx`, `src/services/deckImport.js`, `src/router/useHashRoute.js`

### [2026-07-17] Render share codes as QR codes for desktop→phone tome transfer

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-suggestion scan of dungeon-scholar

**Description:**
Share codes exist (`ShareTomeModal`) but moving a tome from a desktop to a phone means retyping or messaging yourself a long code. Rendering the share code (or a share-link URL, if the URL-import idea lands) as a QR code in `ShareTomeModal` makes the cross-device path camera-scan simple — a natural fit for a mobile-installable PWA. A tiny dependency-free QR encoder (or a ~1 kB lib) keeps the bundle budget intact; render to canvas so it also works offline.

**Proposed fix / improvement:**
- [ ] Add a "Show QR" toggle in `ShareTomeModal` that renders the share code/link to a canvas QR.
- [ ] Respect the existing bundle-size budget (`scripts/check-bundle-budget.mjs`) — lazy-load the encoder with the modal chunk.

**Related files:** `src/features/library/ShareTomeModal.jsx`, `scripts/check-bundle-budget.mjs`

### [2026-07-17] Answer-choice elimination (strike-through) in ExamMode / QuizMode

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-suggestion scan of dungeon-scholar

**Description:**
Real certification exam UIs (Pearson VUE et al.) let candidates strike through answer options they have ruled out — a core test-taking technique the practice exam cannot rehearse today. ExamMode already has flag-for-review + a navigator grid (S13), but no per-option elimination. Adding a right-click / long-press / dedicated-key "eliminate" toggle that dims and strikes an option (per question, session-local, not persisted) would make practice materially closer to the real testing experience.

**Proposed fix / improvement:**
- [ ] Session-local `eliminated: {questionIdx: Set<optionIdx>}` state in `ExamMode` (and optionally `QuizMode`); toggle via context-menu/long-press plus a keyboard shortcut listed in `ShortcutHelpModal`.
- [ ] Visual: strike-through + reduced opacity, but keep the option selectable (eliminating is a hint, not a lock), with `aria-pressed` for screen readers.

**Related files:** `src/features/study/ExamMode.jsx`, `src/features/study/QuizMode.jsx`, `src/components/ui/ShortcutHelpModal.jsx`

### [2026-07-17] One-click "Ask the Oracle to explain" handoff from a missed question

- **Category:** future-idea, UX
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-suggestion scan of dungeon-scholar

**Description:**
When a learner misses a question in QuizMode / ExamMode review / the MistakeVault, the static `explanation` field is the end of the road — if it does not click, the learner must open ChatMode and retype the whole question by hand. The app already has an Oracle chat per tome; there is no context handoff (`grep -rn "askOracle" src/features/study/QuizMode.jsx` — none). A small "Ask the Oracle about this riddle" button on a missed question that opens ChatMode pre-seeded with the question, the options, the learner's wrong pick, and the correct answer ("explain why B is right and my answer C is wrong") would turn every miss into a targeted tutoring moment — arguably the highest-leverage learning feature available given the pieces already built. Degrades gracefully: without Oracle config, hide the button (same gate ChatMode already uses).

**Proposed fix / improvement:**
- [ ] Add a handoff affordance in QuizMode wrong-answer feedback, ExamMode results review, and MistakeVault entries.
- [ ] Route to ChatMode with a prefilled prompt (question stem + options + user answer + correct answer + tome domain); keep the prompt template in `src/prompts/_shared.js` so per-provider prompt packs can tune it.
- [ ] Hide when Oracle is unconfigured (reuse the existing oracle-availability gate).

**Related files:** `src/features/study/QuizMode.jsx`, `src/features/study/ExamMode.jsx`, `src/features/study/MistakeVault.jsx`, `src/features/study/ChatMode.jsx`, `src/prompts/_shared.js`

### [2026-07-17] Local multi-profile support (multiple scholars on one device)

- **Category:** future-idea, portability
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-suggestion scan of dungeon-scholar

**Description:**
The save is a single fixed key (`dungeon-scholar:save:v1` in `services/persistence.js`) — one device = one scholar. A shared family/classroom computer, or one person separating two cert tracks with independent streaks/quests/SRS state, has no path today short of browser profiles. A lightweight profile switcher (namespaced storage keys + a profile picker surface) would cover this. Interacts with cloud sync (each local profile maps to at most one signed-in account) and is a natural prerequisite-sibling of the already-logged IndexedDB migration — if that lands, design the store keying with a profile dimension from the start.

**Proposed fix / improvement:**
- [ ] Namespace persistence keys by profile id (`dungeon-scholar:save:v1:<profileId>`, default profile keeps the legacy key for back-compat).
- [ ] Minimal profile picker (create / rename / switch / delete-with-confirm) reachable from `AccountPanel` or the home screen.
- [ ] Define the cloud-sync rule: sign-in binds to the ACTIVE profile only; switching profiles signs out (or scopes the session) to prevent cross-profile save clobbering via the MergeChooser.

**Related files:** `src/services/persistence.js`, `src/hooks/usePlayerState.js`, `src/components/AccountPanel.jsx`, `src/services/cloudSync.js`

### [2026-07-17] Offline queue for Oracle free-text grading (grade-on-reconnect)

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-suggestion scan of dungeon-scholar

**Description:**
The Oracle is network-only by design (never SW-cached), so free-text answers studied offline fall back to local string matching — fine — but the richer AI grade is simply lost forever for those answers. An opt-in queue that records offline free-text answers (question id + given answer + local-grade result) and re-grades them when connectivity returns could deliver a "the Oracle has reviewed thy offline answers" digest: corrections where local matching mis-graded, which then feed the MistakeVault / SRS state. `grep -rn "navigator.onLine" src/services/oracleGrader.js` — no offline handling exists in the grader path today.

**Proposed fix / improvement:**
- [ ] Persist a small bounded queue (cap + FIFO eviction) of offline free-text answers in the save.
- [ ] On reconnect (online event / next launch), batch-grade via the existing `oracleGrader.js` path; where the verdict differs from the local grade, surface a review digest and optionally adjust the card's SRS/mistake state.
- [ ] Make it opt-in and clearly bounded — silent background API spend should never surprise the user.

**Related files:** `src/services/oracleGrader.js`, `src/services/persistence.js`, `src/features/study/MistakeVault.jsx`

### [2026-07-17] Focus mode — study-only toggle that hides the gamification chrome

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-suggestion scan of dungeon-scholar

**Description:**
The D&D wrapper is the app's identity, but in the final cram days before a real exam some users want the SRS engine without the XP toasts, gold, quests, pets, and dungeon framing — and right now the theme/audio panels offer no such dial. A "Focus mode" toggle (persisted preference) that suppresses gamification surfaces and reward toasts while leaving study modes, SRS, stats, and the study plan untouched would widen the audience (it is also the obvious answer to "can I use this for serious study?" skepticism) at low cost, since screens are already routed centrally through `router/screens.js` and toasts flow through a common path in `usePlayerActions`.

**Proposed fix / improvement:**
- [ ] Add a persisted `focusMode` preference (ThemePanel or AccountPanel toggle).
- [ ] Gate progression screens/nav entries (Shop, Quests, Pets, Dungeon, etc.) and reward/XP toasts behind it; keep flashcards/quiz/exam/vault/stats/plan visible.
- [ ] Keep earning XP/gold silently in the background so toggling back never costs progress.

**Related files:** `src/router/screens.js`, `src/features/player/usePlayerActions.js`, `src/features/home/ThemePanel.jsx`, `src/App.jsx`


### [2026-07-15] Migrate persistence from localStorage to IndexedDB (async storage adapter)

- **Category:** future-idea, portability
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-suggestion scan of the dungeon-scholar tree

**Description:**
The whole app persists through synchronous `localStorage` (`services/persistence.js` — the `dungeon-scholar:save:v1` blob, the sync meta key, and the snapshot ring buffer capped at ~1.5 MB precisely because of quota). localStorage is a ~5 MB total, string-only, synchronous store, and the data model has outgrown it: occlusion cards embed base64 `data:image/*` payloads directly in tome `flashcards` (`services/occlusion.js`), a single tome import may legitimately be up to 2 MB (`services/importLimits.js` MAX_TOME_IMPORT_BYTES), and the save blob carries the full library. A handful of occlusion-heavy tomes exhausts the quota; today's answer is graceful failure (`isQuotaExceededError`, "export thy journal" copy, snapshot pruning) rather than more room. Every debounced save also `JSON.stringify`s the entire state on the main thread — cost grows linearly with library size.

**Proposed fix / improvement:**
- [ ] Add a small async storage adapter (IndexedDB-backed, `idb-keyval`-style — no heavy dependency needed) behind the existing `persistence.js` API; keep localStorage as fallback for environments without IDB.
- [ ] One-time migration on boot: read the v1 localStorage save, write to IDB, keep the localStorage copy as a read-only fallback for one release, then clear.
- [ ] Store tomes (esp. occlusion images) as separate records instead of one monolithic blob so a save touch doesn't rewrite megabytes.
- [ ] Raise/retire the snapshot ring-buffer byte cap accordingly.

**Blocked by:** none, but touches the save path — wants a careful phase with the existing MergeChooser/cloud-sync reconciliation tests kept green.

**Related files:** `src/services/persistence.js`, `src/hooks/usePlayerState.js`, `src/services/occlusion.js`, `src/services/importLimits.js`

**Related entries:** [2026-06-23] Local autosave-snapshot ring buffer (resolved — its quota cap is a symptom of this); [2026-07-02] player-save export (resolved)

### [2026-07-15] Compress cloud-sync payloads and share codes with CompressionStream

- **Category:** future-idea, performance
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-suggestion scan of the dungeon-scholar tree

**Description:**
`cloudSync.pushSave` upserts the entire player-state JSON blob to Supabase on every sync, and `encodeTomeShareCode` share codes carry a whole tome as text — `ShareTomeModal` even has a `SHARE_LARGE_THRESHOLD` (50 KB) beyond which it steers users away from the paste path because the raw code misbehaves in chat apps/textareas. JSON study content compresses ~3-5x with gzip. The `CompressionStream`/`DecompressionStream` API is now baseline in all evergreen browsers (Chrome 80+, Safari 16.4+, Firefox 113+), so both surfaces could shrink substantially with no dependency: smaller Supabase rows + less upload on every debounced sync (matters on mobile), and many more tomes fitting under the pasteable share-code threshold. Base64 occlusion images compress less, but text-heavy tomes (the common case) benefit most.

**Proposed fix / improvement:**
- [ ] Version the wire format (e.g. `TOME-V2:` prefix = gzip+base64; `schema_ver` bump or a `compressed` column/flag for Supabase) so old clients/codes keep decoding.
- [ ] Feature-detect `CompressionStream`; fall back to the current uncompressed path when absent.
- [ ] Keep import-side size checks applied to the *decompressed* size (zip-bomb guard, mirroring the existing `checkImportSize` + PBKDF2-iteration-band defensive style in `sealedTome.js`).

**Blocked by:** none

**Related files:** `src/services/cloudSync.js`, `src/game/tome.js`, `src/features/library/ShareTomeModal.jsx`, `src/services/importLimits.js`

**Related entries:** [2026-06-29] Tome schema versioning + update propagation for shared tomes (open — same wire-format-versioning concern)

### [2026-07-15] Duplicate-card detection on tome import / re-import

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-suggestion scan of the dungeon-scholar tree

**Description:**
None of the import paths (share code, JSON file, CSV/Quizlet via `services/deckImport.js`, paste) detect content that already exists in the library — `grep -n "dedup\|duplicate" src/services/deckImport.js src/game/tome.js` comes back empty. Importing the same CSV twice, or importing a shared tome that overlaps a starter deck, silently creates parallel cards with fresh ids; the SRS then schedules both copies independently, inflating due counts and splitting review history across twins. Anki solves this with note-content dedupe at import time. With tome sharing, CSV round-trip export (`downloadTomeCsv`), and the shared-tome update-propagation idea all live, accidental re-import is a realistic everyday event.

**Proposed fix / improvement:**
- [ ] Compute a normalized content hash per card (trimmed/lowercased front+back; for quiz items, question+answer set) at import time.
- [ ] When an incoming tome overlaps an existing tome above some threshold, prompt: skip duplicates / import anyway / replace (preserving existing per-card SRS progress by mapping old ids to matching hashes).
- [ ] Reuse the same hash check inside a single tome to flag author-side accidental duplicates in `TomeEditor`.

**Blocked by:** none

**Related files:** `src/services/deckImport.js`, `src/game/tome.js`, `src/features/library/LibraryScreen.jsx`, `src/features/library/TomeEditor.jsx`

**Related entries:** [2026-06-29] Tome schema versioning + update propagation for shared tomes (open — replace/merge flow would share the id-mapping machinery)

### [2026-07-15] Extended-time accommodation multiplier for practice exams

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-suggestion scan of the dungeon-scholar tree

**Description:**
Timed practice exams (`ExamMode.jsx`, `services/examSession.js`, pace tracking in `services/examPace.js`) run at a single fixed duration. Real certification vendors (CompTIA, ISC2, Pearson VUE generally) grant approved test-takers extended-time accommodations — commonly 1.25x, 1.5x, or 2x ("time and a half", "double time"). A learner who will sit the real exam with an accommodation currently cannot rehearse under their actual conditions, which undercuts the practice exam's core promise of realistic pacing; the exam-pace feedback and readiness prediction (`examPrediction.js`) are likewise calibrated to the wrong clock for them. This is a small, learning-relevant accessibility win: one settings field and a multiplier where the timer + pace math read the duration.

**Proposed fix / improvement:**
- [ ] Add an exam-time multiplier setting (1x / 1.25x / 1.5x / 2x) in settings or the exam-start screen, persisted with the save.
- [ ] Apply it where exam duration is derived (`examSession.js`), and feed the adjusted budget into `examPace.js` pace warnings so "on pace" reflects the accommodated clock.
- [ ] Label runs in run history / prediction with the multiplier so readiness stats aren't silently mixed across clocks.

**Blocked by:** none

**Related files:** `src/features/study/ExamMode.jsx`, `src/services/examSession.js`, `src/services/examPace.js`, `src/services/examPrediction.js`

**Related entries:** none found (grep "extended|accommodation|multiplier" across the scholar logs is clean)

### [2026-07-15] SRS card browser — filter/sort every card by scheduler state with bulk actions

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-suggestion scan of the dungeon-scholar tree

**Description:**
Per-card scheduler state is rich (FSRS difficulty/stability/interval, `lapses`, `reps`, `dueAt`, `suspended` in `services/srs.js`) but the only windows into it are narrow: the Leeches panel (`services/leech.js` — chronic-lapse cards only, per-card suspend/resume) and the per-question item-analysis stats. There is no place to see *all* cards of a tome (or the library) sorted/filtered by due date, ease, lapse count, or suspension — Anki's card Browser, the standard tool for curating a collection. Without it, questions like "what exactly is due tomorrow?", "which cards have I never seen?", or "suspend this whole domain until after the exam" require guesswork. The suspend primitive (`setCardSuspended`) and search plumbing already exist; this is mostly a read-model + list UI over data the app already tracks.

**Proposed fix / improvement:**
- [ ] A Card Browser screen (per-tome, later cross-library): virtualized list with columns for front-preview, domain, due date, interval, lapses, state (new/learning/review/suspended), sortable + filterable.
- [ ] Bulk actions on a selection: suspend/resume, reset scheduling, jump-to-edit in TomeEditor (reusing the Leeches panel's per-card actions).
- [ ] Entry points: Scholar's Ledger (next to Leeches) and the tome detail view.

**Blocked by:** none

**Related files:** `src/services/srs.js`, `src/services/leech.js`, `src/features/progression/ScholarsLedger.jsx`, `src/features/library/TomeEditor.jsx`

**Related entries:** [2026-06-24] Leech detection (resolved — this generalizes its panel); [2026-06-22] No search / term-lookup across cards (resolved — complementary read path)


### [2026-07-15] Per-user FSRS weight fitting from a persisted review log

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar

**Description:**
`services/srs.js` implements FSRS-5 with the published default 19-weight vector and already exposes `setSchedulerWeights()` — its header comment explicitly anticipates fitting weights per-user "from the recorded review history". But no review history is recorded anywhere: a grep for `reviewLog`/`reviewHistory` across `src/` returns nothing, and per-card state keeps only aggregates (`stability, difficulty, reps, lapses, lastReview, dueAt`), which cannot reconstruct the (elapsed, rating) event sequence weight-fitting needs. This is the missing data layer for the single biggest scheduler-quality win FSRS offers. Distinct from the resolved desired-retention / new-card-cap entry (user-facing knobs) — this is data-driven personalization of the scheduler itself.

**Proposed fix / improvement:**
- [ ] Record a compact append-only review log per flashcard rating (cardId, ts, rating, elapsed days, prior stability) with a size cap / ring buffer to protect localStorage + cloud-save size, and a save-schema bump.
- [ ] Fit weights offline (on-idle or Web Worker; even a coarse descent over a few of the 19 params captures most of the gain), persist per save, apply via `setSchedulerWeights()`.
- [ ] Surface a small Ledger stat ("scheduler personalized from N reviews").

**Blocked by:** nothing hard; needs the review log to accumulate before fitting is meaningful.

**Related files:** `src/services/srs.js`, `src/hooks/usePlayerState.js`, `src/services/persistence.js`

### [2026-07-15] Card-level "merge both" option for diverged saves — MergeChooser is all-or-nothing

- **Category:** future-idea, UX
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar

**Description:**
`services/cloudSync.js` stores the whole player state as a single blob row, and `usePlayerState`'s sign-in / realtime reconciliation surfaces divergence via `MergeChooser` — which forces picking local OR cloud wholesale. The most common real divergence (studied on the phone offline, also studied on the desktop) therefore always discards one device's entire session. Most of the state merges mechanically without any user decision: per-card SRS progress (take the side with the later `lastReview`), mistake-vault union, `max()` for monotonic counters (XP, longestStreak), achievements/titles union, tome library union by id+revision (reusing the tome-versioning comparison that already landed). A third "Merge both" button applying a field-wise semantic merge would turn guaranteed session loss into no loss in the common case, keeping the existing chooser for genuinely conflicting scalars.

**Proposed fix / improvement:**
- [ ] Pure `mergeSaves(local, cloud)` in `src/services/` with per-field strategies (later-lastReview per card, union, max) + thorough tests.
- [ ] Wire as a third `MergeChooser` option; fields with no safe strategy fall back to the newer side and are listed in the preview.

**Related files:** `src/services/cloudSync.js`, `src/hooks/usePlayerState.js`, `src/components/ui/MergeChooser.jsx`

### [2026-07-15] Touch swipe gestures for mobile flashcard flipping/grading

- **Category:** UX, future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar

**Description:**
Desktop flashcards have full keyboard bindings (`services/shortcuts.js`: Space/Enter flip, 1–4 rate, arrows navigate), but on mobile — a first-class platform (installable PWA; README says "Works on desktop and mobile") — the modes are tap-only on small buttons: a grep for `onTouch`/`pointerdown`/`gesture` across `src/features/study/` returns nothing. The standard mobile SRS interaction (Anki/AnkiDroid) is tap-to-flip + directional swipe to rate (e.g. left = Again, right = Good, up = Easy, down = Hard), which roughly doubles review throughput one-handed. Pointer-events based with a visual drag hint; keep the buttons (a11y + discoverability) and respect `prefers-reduced-motion` for the card-fling animation.

**Proposed fix / improvement:**
- [ ] Pointer-event swipe handling in `FlashcardsMode.jsx` (threshold + axis lock + drag feedback), mapped to the same rate handlers the 1–4 keys call.
- [ ] Document the gestures in the `?` shortcut help (mobile section) and a one-time coach-mark.

**Related files:** `src/features/study/FlashcardsMode.jsx`, `src/services/shortcuts.js`

### [2026-07-15] End-of-session recap screen (cards seen, accuracy, weakest domain, next-due preview)

- **Category:** UX, future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar

**Description:**
Finishing a Flashcards/Quiz session just returns to the menu — a grep for `sessionSummary`/`recap` across `src/` returns nothing. `ScholarsLedger` is the global analytics dashboard, but there is no moment-of-completion recap, a well-proven reinforcement surface in study apps: N cards reviewed, session accuracy, domains touched with the weakest highlighted, misses with a one-tap CTA into the existing `MistakeVault`, and a next-due teaser ("12 scrolls due tomorrow"). All the data already exists in-session (answers, confidence, `weakDomain` service, SRS dueAt). Fits the theme as a "spoils of the delve" tally and gives the daily-goal/streak mechanics a natural place to celebrate completion.

**Proposed fix / improvement:**
- [ ] Small recap component shown on session end (skippable), fed from in-session answer records.
- [ ] CTAs: review misses (MistakeVault), study weakest domain, done.

**Related files:** `src/features/study/FlashcardsMode.jsx`, `src/features/study/QuizMode.jsx`, `src/services/weakDomain.js`, `src/features/study/MistakeVault.jsx`

### [2026-07-15] Backlog-aware review pacing after a study gap (spread overdue reviews instead of flooding)

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar

**Description:**
New-card introduction is now capped (resolved 2026-07-03 batch), but the *review* queue is not: coming back from a two-week break drops every overdue card into one session — the classic post-vacation wall that drives SRS abandonment. FSRS provides per-card retrievability, so a backlog can be triaged safely: serve the most-at-risk cards first and postpone the rest (rewriting `dueAt` only for cards whose projected retention is still high — the safe direction) spread over N days. This is what Anki's "easy days"/postpone helpers and newer FSRS tooling do natively. `sortByDueness` in `srs.js` already orders the queue; this extends it with retrievability triage plus an explicit, user-confirmed spread action.

**Proposed fix / improvement:**
- [ ] Detect backlog on queue build (due count > k× recent daily average).
- [ ] Offer "spread over N days": sort by retrievability, keep the at-risk head today, postpone the high-retention tail with recomputed `dueAt`.
- [ ] One-line in-app explanation so the rescheduling never feels like data loss.

**Related files:** `src/services/srs.js`, `src/services/studyPlan.js`, `src/hooks/usePlayerState.js`

### [2026-07-02] Broaden sign-in beyond GitHub-only OAuth (Google + email magic link)

- **Category:** future-idea, UX
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src + docs

**Description:**
The only sign-in path is GitHub OAuth: `services/supabase.js` exports a single `signInWithGitHub()`, `SignInButton.jsx` calls only it, and `docs/supabase-setup.md` documents only the GitHub provider. Cloud sync, cross-device continuity, and account recovery are therefore gated on having a GitHub account — a poor fit for the app's actual audience (cert students working through Security+/CCST/AWS material, many of whom are not developers). Supabase already supports Google OAuth and passwordless email magic links (`signInWithOtp`) on the same client with no schema changes, so the marginal code is one function + one button per provider. Everyone who bounces off the GitHub wall today silently loses the backup/sync safety net the app otherwise provides (the save-failure copy even points users at sign-in for cloud backup).

**Hypothesis / root cause:** GitHub was the natural first provider for a developer-built project (zero-cost, already had an account); audience-fit was never revisited once sync shipped.

**Proposed fix / improvement:**
- [ ] Add `signInWithGoogle()` and `signInWithMagicLink(email)` alongside `signInWithGitHub()` in `services/supabase.js` (same `redirectTo` handling; `consumeOAuthCallback` already handles the return leg generically).
- [ ] Turn `SignInButton.jsx` into a small provider chooser (GitHub / Google / email), reusing the existing `TextInputModal` for the email capture.
- [ ] Document the extra providers in `docs/supabase-setup.md` as optional steps (deployments that configure only GitHub keep working — probe provider availability or make it env-driven).
- [ ] Verify the RLS probe + account-deletion flows are provider-agnostic (they key on the Supabase user id, so they should be).

**Blocked by:** none (Supabase dashboard config + additive client code).

**Related files:** `src/services/supabase.js`, `src/components/SignInButton.jsx`, `src/components/AccountPanel.jsx`, `docs/supabase-setup.md`

---

### [2026-07-02] Playwright e2e smoke suite for dungeon-scholar (parity with dnd-app's dnd-e2e.yml)

- **Category:** future-idea
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar tooling + CI

**Description:**
dungeon-scholar has zero browser-level tests: CI (`dungeon-scholar-ci.yml`) runs lint → tsc → vitest (happy-dom) → build, and everything above the unit layer is left to the scheduled QA agent manually driving a real browser. Meanwhile the sibling dnd-app already has a non-blocking Playwright smoke workflow (`.github/workflows/dnd-e2e.yml`) establishing the repo pattern. The gap is measurable: the light-theme contrast defect family has now recurred across PHASE-03, PHASE-10, PHASE-12 and a fresh 2026-06-30 issue-log entry — each caught only by a later manual QA pass — and unit-level guards (`phase10-contrast.test.js`, `theme.test.js`) keep proving insufficient because they can't see real rendered styles. A small Playwright suite (boot → import starter tome → answer a quiz question → toggle light theme + run an axe/contrast scan → complete a short mock exam) would catch whole classes of regressions (routing, hash deep links, PWA update flow, theme contrast) at PR time instead of QA time, and would give the resolver agents a fast repro harness.

**Hypothesis / root cause:** The unit suite grew excellent coverage of pure logic (749+ tests), so e2e never felt urgent; the recurring theme regressions live exactly in the rendered-CSS layer that vitest/happy-dom structurally cannot exercise.

**Proposed fix / improvement:**
- [ ] Add `@playwright/test` + `@axe-core/playwright` to dungeon-scholar devDeps; suite under `dungeon-scholar/e2e/` against `vite preview` (base `/home-lab/`).
- [ ] Cover: app boot + hash routing, quiz answer round-trip, light/dark theme toggle with an axe contrast scan per theme on the top screens, short mock exam completion, tome JSON import.
- [ ] Mirror `dnd-e2e.yml` as `dungeon-scholar-e2e.yml`: PR-paths + manual dispatch, non-blocking until stable (same promote-later note).
- [ ] Wire Supabase/Oracle to disabled/local-fallback mode so the suite is hermetic (the deploy workflow already documents the fork-with-Oracle-disabled path).

**Blocked by:** none.

**Related files:** `.github/workflows/dungeon-scholar-ci.yml`, `.github/workflows/dnd-e2e.yml`, `dungeon-scholar/package.json`, `src/phase10-contrast.test.js`, `src/theme.test.js`

**Related entries:** ISSUES-LOG-DUNGEON-SCHOLAR.md [2026-06-30] "Light-theme muted accent-label wash-out persists on non-enumerated screens" (the recurring family this would catch); SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md [2026-06-29] "CI has no test-coverage floor and no bundle-size budget" (sibling CI-hardening idea, different layer).

---

### [2026-07-02] Cloze-deletion (fill-in-the-blank text occlusion) card type

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src

**Description:**
The app supports image occlusion (`services/occlusion.js`, `OcclusionAuthor.jsx`, `OcclusionCard.jsx`) but has no text equivalent: a grep for `cloze` across `src/` returns nothing. Cloze deletion ("The three-way handshake is SYN → {{SYN-ACK}} → ACK") is one of the highest-retention card formats for exactly this app's material — port numbers, protocol sequences, command syntax, acronym expansions — and is the single most-used card type in Anki. Authors today must hand-convert each fact into separate MC/FIB questions; a cloze syntax would generate one card per masked span from a single authored sentence. The grading path already exists: FIB questions grade free-text via `acceptedAnswers`, so a cloze card is essentially an authored-once, multi-blank FIB with rendered context. It also round-trips naturally with the proposed CSV export and the existing Anki-adjacent import (Anki's `{{c1::...}}` syntax could be recognized by `deckImport.js`).

**Proposed fix / improvement:**
- [ ] Support a `{{c1::answer}}` (or `{{answer}}`) span syntax in card text; expand each masked span into a study item at tome load (pure helper, e.g. `services/cloze.js`, mirroring how `occlusion.js` derives per-region cards).
- [ ] Render the masked sentence via the existing `RichContent` path with the blank highlighted; grade with the existing FIB/`acceptedAnswers` machinery.
- [ ] Recognize Anki cloze syntax in `deckImport.js` paste imports instead of importing the raw markup as literal text.
- [ ] TomeEditor: a small "make cloze" affordance that wraps the selected text.

**Blocked by:** none (additive card type; grading + rendering primitives exist).

**Related files:** `src/services/occlusion.js`, `src/services/deckImport.js`, `src/features/library/TomeEditor.jsx`, `src/components/RichContent.jsx`, `src/game/tome.js`

**Related entries:** RESOLVED-ISSUES-DUNGEON-SCHOLAR.md [2026-06-24] "Image-occlusion flashcards" (this is its text-mode sibling); SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md [2026-06-29] "Tome → CSV / Quizlet export" (cloze syntax should survive the round-trip).

---

### [2026-07-02] User-tunable SRS study load: desired-retention setting + daily new-card cap

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src/services

**Description:**
The FSRS-5 scheduler hardcodes `DESIRED_RETENTION = 0.9` in `services/srs.js`, and nothing caps how many *new* (never-reviewed) cards enter the queue per day — a grep for `perDay`/`dailyLimit`/`newLimit` across `src/` returns nothing. Two practical consequences for a cert learner: (a) importing a 300-card tome floods the due queue with 300 new cards at once, the classic overwhelm-then-abandon failure mode every mature SRS mitigates with a new-cards/day cap (Anki defaults to 20); (b) retention is a real trade-off knob — a learner two weeks from their exam rationally wants 0.95 (more reviews, higher recall), a casual learner 0.85 (fewer reviews) — and FSRS is explicitly designed to expose it, but here it is unreachable. Both are small, additive knobs on machinery that already exists (`nextInterval` already derives from the retention constant; the due-queue builders in `usePlayerState`/`srs.js` can partition new-vs-review). Distinct from the already-resolved FSRS-5 upgrade entry (that noted per-user *weight fitting* as future work — these are the user-facing scheduler knobs, not weight optimization).

**Proposed fix / improvement:**
- [ ] Make desired retention a per-save setting (default 0.9, sane 0.8–0.97 range) threaded into the interval derivation the same way `setSchedulerWeights` already parameterizes the weights.
- [ ] Add a new-cards-per-day cap (default ~20, configurable, 0 = pause new cards) applied when building the study queue, so review backlog is always served but new-card introduction is throttled.
- [ ] Surface both under the existing settings/account surface with plain-language copy ("study more per day / remember more" vs "lighter daily load").
- [ ] Unit-test that changing retention only rescales future intervals (no retroactive rewrite of stored card state).

**Blocked by:** none.

**Related files:** `src/services/srs.js`, `src/hooks/usePlayerState.js`, `src/features/player/usePlayerActions.js`, `src/game/defaultState.js`

**Related entries:** RESOLVED-ISSUES-DUNGEON-SCHOLAR.md [2026-06-24] "Upgrade the SRS scheduler to full FSRS-5" (noted weight-fitting as future; this entry is the user-facing knobs instead); SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md [2026-06-28] "Daily study goal + streak-freeze" (goal/habit layer; this is the scheduler-load layer).

---

### [2026-06-29] Tome → CSV / Quizlet export (round-trip with the existing importer)

- **Category:** portability
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src

**Description:**
`services/deckImport.js` imports external decks *in* from CSV / TSV / Quizlet copy-paste (term|definition[|tag]), but there is no symmetric path to get a tome back *out* into those universal formats — a grep for `csv`/`quizlet`/`toCsv`/`exportDeck` across `src/` returns nothing. The only export paths are `downloadTomeJson` (the app's own TOME-V1 JSON / sealed JSON, in `ShareTomeModal.jsx`) and `exportSaveText` (the whole player save, in `AccountPanel.jsx`). So a learner who authored or edited a tome in-app (TomeEditor) cannot extract their cards into the plain two-column format every other tool (Anki, Quizlet, a spreadsheet, a study group's shared doc) reads. This is a data-ownership / lock-in gap and the natural inverse of a feature that already exists one direction. It is distinct from the already-logged "Printable / PDF export" entry (that is print presentation, not re-importable structured data) and from JSON save export (that is the whole save, not a portable deck).

**Proposed fix / improvement:**
- [ ] Add an `exportTomeCsv(tome)` in `services/deckImport.js` (co-located with its inverse) that emits RFC-4180-quoted `term,definition,domain` rows, round-tripping cleanly back through `parseDeckText`.
- [ ] Wire a "Download CSV" option into `ShareTomeModal.jsx` next to the existing JSON download (reuse the Blob/object-URL `download*` machinery already there).
- [ ] Add a unit test asserting `parse(export(tome))` preserves card count + fields (mirrors the importer's existing test style).

**Related files:** `src/services/deckImport.js`, `src/features/library/ShareTomeModal.jsx`, `src/features/library/TomeEditor.jsx`

**Related entries:** SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md [2026-06-29] "Printable / PDF export of a tome" (sibling export idea; that one is paper/print, this one is machine-readable interchange).

---

### [2026-06-29] Tome schema versioning + update propagation for shared tomes

- **Category:** future-idea
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src

**Description:**
A tome carries no version / revision marker — a grep of `src/game/tome.js` for `version`/`schemaVersion`/`revision`/`updatedAt` returns nothing. Shared tomes (share code, JSON download, Web Share Target import) are therefore immutable point-in-time snapshots: once a student imports a tome, there is no signal that the author has since corrected a wrong answer key or typo, and no way to pull the fix short of deleting and re-importing (which also discards local study progress). This compounds the proposed in-app "report a problem with this question" flow — even after an author fixes a reported defect, every existing copy stays stale forever. A small monotonic `revision` field on the tome metadata, surfaced on re-import ("a newer version of this tome is available — merge?"), would let corrections propagate while preserving each learner's `progress`.

**Hypothesis / root cause:** Tomes were modeled as self-contained study payloads, not as updatable published artifacts; no identity/version concept was needed until sharing + in-app editing made authored tomes mutable.

**Proposed fix / improvement:**
- [ ] Add an optional `revision` (and/or `updatedAt`) to tome metadata in `game/tome.js`, defaulting absent = revision 0 (back-compatible, mirrors the existing optional-field convention).
- [ ] Bump it on edits in `TomeEditor.jsx`; carry it in share codes / JSON exports.
- [ ] On import of a tome whose `id` already exists locally, compare revisions and offer a content-merge that keeps the learner's `progress` (reuse the existing `MergeChooser` UX) instead of a blind overwrite.

**Blocked by:** none (additive metadata; merge UI already exists).

**Related files:** `src/game/tome.js`, `src/features/library/TomeEditor.jsx`, `src/features/library/ShareTomeModal.jsx`, `src/components/ui/MergeChooser.jsx`, `src/services/deckImport.js`

**Related entries:** SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md [2026-06-28] "In-app 'report a problem with this question' flow" (that captures defects; this propagates the fixes back to existing copies).

---

### [2026-06-29] README + TomeEditor promise Mermaid diagram rendering, but the renderer only supports ASCII/text diagram fences

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src

**Description:**
The README's headline feature list ("Rich content — Markdown questions render diagrams (Mermaid) and syntax-highlighted code blocks inline") and `TomeEditor.jsx`'s preview tooltip ("Markdown / Mermaid / code / math render exactly as they [appear]") both advertise Mermaid rendering, but no Mermaid renderer exists: `package.json` has no `mermaid` dependency, and `services/richContent.js` defines `DIAGRAM_LANGUAGES = {ascii, diagram, topology, flow}` — a fenced ` ```mermaid ` block falls through to a plain monospace code block, not a rendered graph. (KaTeX is genuinely implemented and lazy-loaded; Mermaid simply isn't.) So an author who writes a Mermaid graph per the docs gets raw source text in study mode. Either the promise should be implemented or the docs/tooltip corrected; implementing it is the higher-value path for a technical-cert study app (network topologies, attack trees, state machines).

**Hypothesis / root cause:** Mermaid was scoped as a rich-content target and documented, but deferred at implementation time for the same bundle-size reason `richContent.js` cites for keeping the renderer narrow — and the README/editor copy was never walked back.

**Proposed fix / improvement:**
- [ ] Implement real Mermaid rendering lazy-loaded on first `mermaid` fence, mirroring the existing KaTeX lazy-import pattern in `RichContent.jsx` (so tomes without diagrams pay zero bundle cost and it degrades to source text offline / on CDN block).
- [ ] OR, if Mermaid stays out of scope, correct the README feature list and the TomeEditor tooltip to describe the actual ASCII/`topology`/`flow` diagram support so authors aren't misled.

**Related files:** `README.md`, `src/features/library/TomeEditor.jsx`, `src/services/richContent.js`, `src/components/RichContent.jsx`, `dungeon-scholar/package.json`

---

### [2026-06-29] ASCII / topology / flow diagram code blocks have no text alternative for screen-reader users

- **Category:** UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src

**Description:**
`RichContent.jsx` renders fenced `diagram`/`topology`/`flow`/`ascii` blocks as a bare `<pre><code>` of glyph art with no `aria-label`, `role="img"`, or accompanying description (raster `image` nodes DO get an `alt`, but these text-diagram fences do not). A screen reader will read the box-drawing/ASCII characters one by one (or skip them), so a diagram-based question — common in networking/security certs (a topology, a packet flow, an attack tree drawn in ASCII) — is effectively inaccessible to a blind learner, even though the same content is perfectly legible visually. This is a different gap from the already-logged accessibility items (forced-colors/contrast, font-scale, speech-to-text): it is specifically the *missing text alternative for non-image diagrams*.

**Proposed fix / improvement:**
- [ ] Let authors attach a caption/description to a diagram fence (e.g. an info-string after the language: ` ```topology Caption text `), rendered as the block's `aria-label` with `role="img"`.
- [ ] Where no caption is given, at minimum wrap the diagram in `role="img"` with a generic label ("ASCII diagram") so it is announced as a single unit rather than read glyph-by-glyph.
- [ ] Document the caption convention in the authoring notes / TomeEditor help.

**Related files:** `src/components/RichContent.jsx`, `src/services/richContent.js`, `src/features/library/TomeEditor.jsx`

**Related entries:** SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md [2026-06-28] "User-facing text-size / reading-comfort settings" and [2026-06-29] "Windows High Contrast / forced-colors support" (sibling a11y items; those are visual contrast/scale, this is a non-visual text alternative).

---

### [2026-06-29] Cross-tome "comprehensive" mixed practice exam (draw from multiple tomes / all weak domains at once)

- **Category:** future-idea
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src

**Description:**
Every practice exam is scoped to a single tome — `ExamMode` builds its `sample`, persists its in-progress session, and keys resume state by one `tomeId` (`saved.tomeId`). Real certifications are comprehensive: a learner studying several sub-topic tomes (or a "whole cert" split across tomes) has no way to sit one timed exam that samples across all of them, which is exactly the highest-fidelity rehearsal of the real test and the best way to surface cross-domain weak spots. A grep for `crossTome` / `mixedExam` / `multiTome` / `allDecks` returns nothing, so this is unbuilt.

**Proposed fix / improvement:**
- [ ] Add a "Comprehensive Trial" entry point that lets the learner pick N tomes (or "everything due") and assembles one weighted question pool across them.
- [ ] Weight selection toward weak domains using the existing `weakDomain` / `examPrediction` signals so the mixed exam is adaptive rather than uniform.
- [ ] Generalize the exam session/resume key from a single `tomeId` to a composite/ad-hoc session id so a mixed run can be saved + resumed like a single-tome run.
- [ ] Report results both overall and broken down per source tome/domain (the per-question `questionLog` already carries domain, so the RunHistory heatmap can absorb it).

**Blocked by:** none (additive; builds on existing ExamMode + weakDomain + examPrediction).

**Related files:** `src/features/study/ExamMode.jsx`, `src/services/examSession.js`, `src/services/weakDomain.js`, `src/services/examPrediction.js`, `src/features/progression/RunHistoryScreen.jsx`

---

### [2026-06-29] Windows High Contrast / `forced-colors` support + an opt-in high-contrast theme

- **Category:** UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src

**Description:**
The app ships a real Dark/Light/Match-System theme set (`ThemePanel`) and a colorblind-safe (CVD) analytics palette toggle, and it honors `prefers-reduced-motion` — a good accessibility baseline. But there is no support for forced-colors / high-contrast modes: a grep for `forced-colors`, `high-contrast`, and `contrast-more` across `src/` returns nothing. Users on Windows High Contrast Mode (or any OS forced-colors setting) get the app's hardcoded parchment/amber palette rather than their chosen system colors, and there is no in-app maximal-contrast theme for low-vision users for whom even the Light theme is insufficient. This is distinct from the already-logged text-size/reading-comfort and CVD-palette items — it is about color/contrast adaptation, not font scale or hue-pairing.

**Proposed fix / improvement:**
- [ ] Add an `@media (forced-colors: active)` block in `index.css` that maps key surfaces/borders/focus rings to `CanvasText` / `Canvas` / `Highlight` system keywords and avoids color-only affordances.
- [ ] Optionally add a 4th theme option ("High Contrast") alongside Dark/Light/System, persisted in `playerState.theme` like the others.
- [ ] Verify the dungeon canvas (`DungeonExplore`) degrades acceptably under forced-colors (canvas pixels are immune to forced-colors, so consider a non-canvas/high-contrast fallback indicator).

**Related files:** `src/index.css`, `src/features/home/ThemePanel.jsx`, `src/components/dungeon/DungeonExplore.jsx`

**Related entries:** SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md [2026-06-28] "User-facing text-size / reading-comfort settings" (sibling accessibility item; this one is contrast, that one is font scale).

---

### [2026-06-29] Confidence-calibration insight (the app already captures per-answer confidence but never reports calibration)

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src

**Description:**
Quiz mode already records a self-reported confidence (Low/Medium/High — the `1/2/3` shortcut, threaded through `QuizMode` -> `usePlayerActions` and surfaced in `ScholarsLedger`). That signal is captured but never turned into a calibration view: how often were "High" answers actually correct vs "Low" ones? Calibration (and overconfidence detection) is one of the most evidence-backed metacognition tools in exam prep — a learner who is reliably wrong when "High" is wasting review time on the wrong cards. (Note: the `confidence` field in `examPrediction.js` is a different concept — prediction-coverage confidence — so this is genuinely unbuilt.)

**Proposed fix / improvement:**
- [ ] Aggregate accuracy bucketed by reported confidence (correct-rate per Low/Med/High) over the question log.
- [ ] Render a small calibration panel in `ScholarsLedger` (three bars: stated confidence vs actual accuracy), flagging overconfidence when High-confidence accuracy lags.
- [ ] Optionally feed a calibration nudge into review prioritization (surface confidently-wrong cards sooner).

**Related files:** `src/features/study/QuizMode.jsx`, `src/features/player/usePlayerActions.js`, `src/features/progression/ScholarsLedger.jsx`

---

### [2026-06-29] Printable / PDF export of a tome for offline paper review

- **Category:** portability
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar/src

**Description:**
The app is an installable offline PWA and can export the player save as JSON, but there is no way to get a tome's questions/flashcards out as a printable study sheet — a grep for `window.print`, `@media print`, and `printable` returns nothing. Many cert learners still want a paper or PDF copy for annotation, last-minute cram on a device that cannot run the app, or sharing with a study group offline. The content already renders rich Markdown (`RichContent`), so a print-stylesheet or "export tome to printable HTML/PDF" path is mostly a presentation-layer addition.

**Proposed fix / improvement:**
- [ ] Add a print stylesheet (`@media print`) that lays a tome out as a clean Q-then-A study sheet (hide chrome, dungeon UI, nav).
- [ ] Add an "Export for print / PDF" action on the tome (reuse the Blob/object-URL download pattern already used by `ShareTomeModal` / `AccountPanel`), with an option for "questions only" vs "with answers".
- [ ] Keep diagrams/code (Mermaid/KaTeX/highlight) legible in the print path or fall back to their source text.

**Related files:** `src/components/RichContent.jsx`, `src/features/library/ShareTomeModal.jsx`, `src/index.css`

---

### [2026-06-28] Extract logic/content out of the two god-component files (`DungeonExplore.jsx` 2736 lines, `App.jsx` 2085 lines)

- **Category:** debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of `dungeon-scholar/src`

**Description:**
`src/components/dungeon/DungeonExplore.jsx` (2736 lines) and `src/App.jsx` (2085 lines) are by far the largest source files in the tree (next largest is `tileRenderer.js` at 1576). `DungeonExplore.jsx` mixes three concerns in one file: pure data/logic constants that are exported and unit-tested separately (`BIOMES`, `BIOME_BOSS_POOL`, etc. — imported by `DungeonExplore.test.js`), the canvas render loop, and the React setup/UI. `App.jsx` is the top-level orchestrator holding cross-cutting state (e.g. `shuffledActivities`, modal wiring, routing glue). Both are hard to test in isolation and are the two hotspots for the 59 combined `useExhaustiveDependencies` lint warnings already noted in `ISSUES-LOG-DUNGEON-SCHOLAR.md` (App.jsx 34, DungeonExplore.jsx 25).

**Hypothesis / root cause:** Organic growth — content tables, render code, and component glue accreted in the same module instead of being split as they grew.

**Proposed fix / improvement:**
- [ ] Extract the exported data/logic constants from `DungeonExplore.jsx` into a sibling `dungeonContent.js` (or `dungeonBiomes.js`); point `DungeonExplore.test.js` at that module — which also removes the `.test.js`-tests-a-`.jsx`-component oddity (see the test-extension entry below).
- [ ] Split the canvas render loop into its own helper module, leaving `DungeonExplore.jsx` as the React shell.
- [ ] Carve cohesive slices of `App.jsx` (modal orchestration, activity-shuffle state) into hooks under `src/hooks/` (the codebase already favors this pattern: `useAppModals`, `useAppSurfaces`, `usePlayerState`).

**Related files:** `src/components/dungeon/DungeonExplore.jsx`, `src/components/dungeon/DungeonExplore.test.js`, `src/App.jsx`

**Related entries:** ISSUES-LOG-DUNGEON-SCHOLAR.md [2026-06-28] "244 non-gating biome lint warnings" (the App.jsx / DungeonExplore.jsx exhaustive-deps concentration).

# Low-severity polish / info

### [2026-07-17] `docs/oracle-setup.md` top half documents an obsolete DIY Anthropic worker stub that contradicts the shipped Groq `oracle-worker/` — and the client's `ORACLE_MODEL` field is dead config the bundled worker ignores

- **Category:** docs, debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** scheduled cleanup/structure scan of the dungeon-scholar tree

**Description:**
`dungeon-scholar/docs/oracle-setup.md` leads with a "Worker stub" section (~lines 17–66) telling the reader to hand-write a Cloudflare Worker that forwards to `https://api.anthropic.com/v1/messages` with an `x-api-key` from `ANTHROPIC_API_KEY`, and a "Notes" bullet stating "The client sends `model: claude-sonnet-4-6`" as if the worker forwards that model upstream. But the repo has shipped a ready-made **Groq**-backed proxy for some time (`oracle-worker/` — `GROQ_API_KEY`, default model `llama-3.3-70b-versatile`, RateLimiter Durable Object, origin/token gates), which the SAME doc's later "Bundled worker env vars" section describes. The two halves contradict each other: a fork operator following the doc top-to-bottom builds an Anthropic stub the repo doesn't use, and nothing tells them the DIY section is the legacy path. Compounding it, the client constant `ORACLE_MODEL = 'claude-sonnet-4-6'` (`src/services/oracleGrader.js:8`, sent in the POST body by both `oracleGrader.js:186` and `ChatMode.jsx:334`) is **ignored by the bundled worker** — `oracle-worker/src/worker.js:176` builds its own upstream body from `env.ORACLE_MODEL || DEFAULT_MODEL` and discards the client's `model` field. So the client-side constant (and its "claude-sonnet-4-20250514 retired" comment) is dead config that misleads readers into thinking the Oracle runs on Claude when the canonical deploy runs on Groq/Llama.

**Hypothesis / root cause:** `oracle-setup.md` predates the `oracle-worker/` package; when the bundled Groq worker landed, the "Bundled worker env vars" section was appended but the original DIY-Anthropic stub and its Notes were never rewritten. The client `ORACLE_MODEL` constant survived from the same pre-Groq era because the worker tolerates (ignores) it.

**Proposed fix / improvement:**
- [ ] Restructure `oracle-setup.md`: lead with the bundled `oracle-worker/` as THE path (deploy steps, env vars, secrets), and either delete the DIY Anthropic stub or demote it to a clearly-labeled "roll your own against a different provider" appendix with the model note corrected.
- [ ] Fix the "The client sends `model: claude-sonnet-4-6`" note — state that the bundled worker ignores the client `model` field and the model is chosen worker-side via `ORACLE_MODEL`.
- [ ] In the client, either stop sending the ignored `model` field (grader + ChatMode) or rename/comment `ORACLE_MODEL` to make clear it is a legacy hint the canonical worker overrides.

**Blocked by:** none

**Related files:** `dungeon-scholar/docs/oracle-setup.md`, `oracle-worker/src/worker.js`, `oracle-worker/README.md`, `src/services/oracleGrader.js`, `src/features/study/ChatMode.jsx`

**Related entries:** ISSUES-LOG-DUNGEON-SCHOLAR.md [2026-07-15] oracle-worker Dependabot PR #64 (only other oracle-worker entry; unrelated)

### [2026-07-17] `oracle-worker/` has zero unit tests — `npm test` is an `exit 0` placeholder that CI runs and reports green

- **Category:** debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** scheduled cleanup/structure scan of the dungeon-scholar tree

**Description:**
`oracle-worker/src/worker.js` is 300 lines of security-sensitive logic — per-IP + tenant-wide rate limiting via the RateLimiter Durable Object with an in-isolate backstop, the `ORACLE_PROXY_TOKEN` shared-secret gate, the Origin/Referer cross-check, CORS handling, `max_tokens`/message-count clamps, and env-var fallbacks (`ALLOWED_ORIGIN`, `ORACLE_MODEL`). Its `package.json` test script is literally `echo "(oracle-worker) no unit tests yet" && exit 0`, and `.github/workflows/oracle-worker-ci.yml` runs `npm test` — so CI's "tests" step is structurally green regardless of behavior. Every enforcement path (limit math, header checks, clamp boundaries) is unguarded against regression; this is the one deployable in the dungeon-scholar domain with literally no test coverage, in contrast to the front end's per-module co-located suites.

**Proposed fix / improvement:**
- [ ] Add a small vitest (or `node:test`) suite exercising the pure decision logic: origin/referer acceptance matrix, token-gate on/off, max_tokens + message clamps, rate-limit accounting (the DO class can be tested as a plain class with a stubbed storage), and the env-fallback defaults.
- [ ] Replace the placeholder test script so `npm test` actually runs the suite; CI needs no change (`oracle-worker-ci.yml` already calls it).
- [ ] Optional: wrangler's `unstable_dev`/miniflare for one end-to-end smoke (OPTIONS preflight + a mocked upstream POST).

**Blocked by:** none

**Related files:** `oracle-worker/src/worker.js`, `oracle-worker/package.json`, `.github/workflows/oracle-worker-ci.yml`, `oracle-worker/README.md`

**Related entries:** [2026-07-02] Playwright e2e smoke suite for dungeon-scholar (open — same "gap in the test story" family, different layer)

### [2026-07-17] `PromptModal` is feature-specific (imports `ORG_PROMPTS`) but lives in `components/ui/` — and `components/README.md` cites it as an example of a *generic* modal

- **Category:** debt, docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** scheduled cleanup/structure scan of the dungeon-scholar tree

**Description:**
`src/components/ui/PromptModal.jsx` imports `ORG_PROMPTS` from `src/prompts/index.js` and implements the org-prompt browser/copier (vendor prompt picker, exam-target templating, copy-to-clipboard) — app-specific business content, not a presentational primitive. That violates the placement rule `components/README.md` itself documents ("`src/components/ui/` — generic, app-agnostic presentational modals and primitives … No app-specific business state"), and the README even lists `PromptModal` in its example list of generic modals, teaching the wrong pattern. The name is also a known confusion source: `TextInputModal.jsx`'s header comment has to explain "PromptModal is a different feature (org/prompt viewer)" because `PromptModal` sounds like the `window.prompt` replacement (which is what `TextInputModal` actually is). Single production consumer: `App.jsx:1962`.

**Proposed fix / improvement:**
- [ ] Relocate to a feature folder — `src/features/prompts/` (next to the data it renders is `src/prompts/`, so alternatively co-locate as `src/features/library/OrgPromptsModal.jsx` if a new one-file folder feels heavy) — and rename to something unambiguous like `OrgPromptsModal`.
- [ ] Update the one import in `App.jsx`, the test file name, and the `components/README.md` example list (drop it from the "generic" examples).
- [ ] The TextInputModal disambiguation comment can then be simplified.

**Blocked by:** none

**Related files:** `src/components/ui/PromptModal.jsx`, `src/components/ui/PromptModal.test.jsx`, `src/components/README.md`, `src/App.jsx`, `src/components/ui/TextInputModal.jsx`, `src/prompts/index.js`

**Related entries:** RESOLVED-ISSUES-DUNGEON-SCHOLAR.md — the misfiled `DungeonExplore.test.js` → `game/dungeonMap.test.js` relocation (same "file lives under the wrong name/home" family)

### [2026-07-17] Duplicated legacy clipboard-copy fallback in `PromptModal` and `ShareTomeModal` — extract a shared `utils/clipboard.js`

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** scheduled cleanup/structure scan of the dungeon-scholar tree

**Description:**
Two components hand-roll the same copy-to-clipboard dance independently: `src/components/ui/PromptModal.jsx:14-40` (`copyToClipboard`: off-screen `<textarea>` + deprecated `document.execCommand('copy')`, then `navigator.clipboard.writeText` as the fallback) and `src/features/library/ShareTomeModal.jsx:~110-130` (same textarea/`execCommand` + clipboard-API fallback inline). Both try the deprecated API FIRST and the modern async Clipboard API second — inverted from current best practice (feature-detect `navigator.clipboard` first, `execCommand` only as legacy fallback). Any future fix (e.g. Safari clipboard-permission quirks) must be made twice, and a third copy will appear the next time a feature needs "Copy" (the CSV-export / share-code family keeps growing).

**Proposed fix / improvement:**
- [ ] Extract one `copyTextToClipboard(text): Promise<boolean>` into `src/utils/clipboard.js` (next to `date.js` / `lazyWithReload.js`), trying `navigator.clipboard.writeText` first with the textarea/`execCommand` path as fallback.
- [ ] Point both modals at it; co-locate a `clipboard.test.js` covering both branches (jsdom exercises the fallback naturally).

**Blocked by:** none

**Related files:** `src/components/ui/PromptModal.jsx`, `src/features/library/ShareTomeModal.jsx`, `src/utils/`

**Related entries:** RESOLVED-ISSUES-DUNGEON-SCHOLAR.md — PromptModal copy-behavior act() warning entry (same code path)

### [2026-07-17] i18n (S7) migration stalled: 13 catalog keys, two importing modules, everything else hardcoded English — the `es` locale is effectively decorative

- **Category:** debt, docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** scheduled cleanup/structure scan of the dungeon-scholar tree

**Description:**
`src/services/i18n.js` is a clean minimal `t()` foundation with locale parity tests, but adoption froze at the seed: `locales/en.js` holds 13 keys (three nav labels, three generic actions, ledger strings), and only two production modules import i18n at all (`App.jsx`, `features/home/ThemePanel.jsx`). Every other user-facing string across ~40 screens/modals is hardcoded English. The header comment says "Migrate strings here incrementally," but no increment has happened since S7 landed — meanwhile new screens keep adding hardcoded strings, so the gap widens each phase. The maintained-but-unused `es.js` catalog (16 lines, parity-tested) signals Spanish support that doesn't meaningfully exist: a user selecting Español would get 13 translated chrome strings in an otherwise English app.

**Proposed fix / improvement:**
- [ ] Decide the direction explicitly: (a) resume the migration with a per-phase quota or "new/touched strings must go through `t()`" convention (a `__guards__` grep-style test could enforce no new raw strings in touched files), or (b) declare i18n out of scope for now in `docs/DESIGN-CONSTRAINTS.md`, park `es.js`, and stop paying the parity-test upkeep.
- [ ] Either way, document the current 13-key status in `src/services/README.md` so contributors don't assume the app is localized.

**Blocked by:** an owner decision on whether localization is a real goal

**Related files:** `src/services/i18n.js`, `src/services/locales/en.js`, `src/services/locales/es.js`, `src/services/i18n.localeParity.test.js`, `src/App.jsx`, `src/features/home/ThemePanel.jsx`

**Related entries:** none found (grep "i18n|locale" across the scholar logs is clean)

### [2026-07-17] Untested data/content modules: four `src/game/` files (`achievements`, `bestiary`, `starterDecks`, `defaultState`) and three small services (`accuracyPalette`, `shortcuts`, `pwaUpdate`) have no co-located tests

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** scheduled cleanup/structure scan of the dungeon-scholar tree

**Description:**
The co-located-test convention is near-universal in `src/game/` and `src/services/`, but seven modules fall outside it: `game/achievements.js` (227 lines — achievement definitions + unlock predicates), `game/bestiary.js` (201 — creature/boss content), `game/starterDecks.js` (277 — the bundled starter tome content), `game/defaultState.js` (148 — the canonical new-player state shape that persistence/migrations/backfills all assume), `services/accuracyPalette.js` (94), `services/shortcuts.js` (58 — the keyboard-binding map several study modes consume), and `services/pwaUpdate.js` (36). The content-heavy ones (`starterDecks`, `bestiary`, `achievements`) would benefit most from cheap shape-validation tests (every deck card has front/back/domain; every achievement has an id/predicate; ids unique) — the same class of guard that caught real data bugs in dnd-app's 5e validation. `defaultState` deserves a shape-contract test because `persistence.js` migrations and `backfill.js` both key off its fields. This complements the [2026-07-15] entry covering the untested minority of `src/hooks/` — the hooks entry explicitly scoped itself to hooks; this covers the remaining untested non-hook modules.

**Proposed fix / improvement:**
- [ ] Add shape/invariant tests for the four `game/` data modules (unique ids, required fields, cross-references resolve — e.g. bestiary boss pools reference real biomes, starter-deck domains are non-empty strings).
- [ ] `defaultState.test.js`: assert the state contract fields that `persistence.js`/`backfill.js`/`usePlayerState.js` read (schemaVer/backfillVer present, library array, etc.).
- [ ] Small behavior tests for `accuracyPalette` (threshold boundaries) and `shortcuts` (binding-map completeness/no duplicate keys); `pwaUpdate` (36 lines, browser-API glue) is lowest value — a smoke import test or an explicit "excluded, DOM-glue" note in `services/README.md` is enough.

**Blocked by:** none

**Related files:** `src/game/achievements.js`, `src/game/bestiary.js`, `src/game/starterDecks.js`, `src/game/defaultState.js`, `src/services/accuracyPalette.js`, `src/services/shortcuts.js`, `src/services/pwaUpdate.js`

**Related entries:** [2026-07-15] Untested minority of `src/hooks/` (open — sibling entry, hooks half of the same gap)

### [2026-07-15] `dungeon-scholar/README.md` Project-structure section drifted — workflow path/branch wrong, ExamMode missing from the study row, design-gotcha pointer routes to the wrong doc

- **Category:** docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of `dungeon-scholar/` (README vs tree/workflow diff)

**Description:**
Four concrete drifts in `dungeon-scholar/README.md`:
1. The Project-structure diagram's first row places `.github/workflows/dungeon-scholar-deploy.yml` *inside* the `dungeon-scholar/` tree — no `dungeon-scholar/.github` directory exists; both workflows (`dungeon-scholar-ci.yml`, `dungeon-scholar-deploy.yml`) live at the repo root `.github/workflows/`.
2. The same row says the deploy runs "on push to main"; the workflow actually triggers on `branches: [master]`.
3. The `study/` row lists "Flashcards / Quiz / Lab / Chat / MistakeVault / DomainStudy" — it omits `ExamMode` (a headline study mode, 1,176 lines) and the `oracleSources` helper that `src/features/README.md` does list.
4. "Known limitations + future-ideas" routes "Future-ideas + design-gotchas" to `SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`, but per `docs/logs/LOG-INSTRUCTIONS.md` the durable design-gotcha home is now `dungeon-scholar/docs/DESIGN-CONSTRAINTS.md` (the suggestions log holds future-ideas only).

**Hypothesis / root cause:** The tree diagram is hand-maintained; the workflow row predates the repo-root workflow layout (or assumed a `main` default branch), the study row predates ExamMode's arrival, and the log-pointer predates the design-gotcha split into per-domain DESIGN-CONSTRAINTS docs.

**Proposed fix / improvement:**
- [ ] Move the workflow row out of the `dungeon-scholar/` tree in the diagram (or note it as repo-root) and correct "main" → "master".
- [ ] Add `ExamMode` (and `oracleSources`) to the `study/` row.
- [ ] Split the pointer: future-ideas → `SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`, design-gotchas → `docs/DESIGN-CONSTRAINTS.md`.

**Related files:** `dungeon-scholar/README.md`, `.github/workflows/dungeon-scholar-deploy.yml`, `dungeon-scholar/docs/DESIGN-CONSTRAINTS.md`

### [2026-07-15] `features/README.md` placement-rule paragraph still cites `phase11Guards.test.js here` — the file was relocated and renamed a batch ago

- **Category:** docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of `dungeon-scholar/src` (README cross-reference sweep)

**Description:**
`src/features/README.md`'s closing placement rule reads "Repo-wide convention-guard tests (e.g. `phase11Guards.test.js` here) are the exception — see `../__guards__/README.md`". That suite no longer exists in `src/features/`: the owner-approved test-org batch (`97138c8b`) moved it to `src/__guards__/studyModeHeadingsQuestVerb.guard.test.js` — precisely because phase-named suites at structural roots were flagged as an anti-pattern (QA-report-2026-07-02). So the README's one concrete example (a) names a file that isn't there and (b) models the phase-number naming the guards README it links to explicitly retired. Distinct from the earlier [2026-07-15] entry on this file's *folder table* (missing `ScholarsLedger`/`CertificateModal`) — same file, different paragraph; cheapest fixed together.

**Hypothesis / root cause:** The batch that relocated/renamed the guard suites updated `__guards__/README.md` but missed the back-reference in `features/README.md`.

**Proposed fix / improvement:**
- [ ] Reword to reference the current reality, e.g. "(these live in [`../__guards__/`](../__guards__/README.md), e.g. `studyModeHeadingsQuestVerb.guard.test.js` — originally `phase11Guards.test.js` here)".

**Related files:** `src/features/README.md`, `src/__guards__/README.md`, `src/__guards__/studyModeHeadingsQuestVerb.guard.test.js`

**Related entries:** [2026-07-15] "`services/README.md` concern-taxonomy and `features/README.md` folder table went stale after the 2026-07-03 feature batch".

### [2026-07-15] Untested minority of `src/hooks/`: `useOAuthCallback`, `useRlsProbe`, `useAppModals` (plus `components/dungeon/useDungeonState`) have no co-located tests

- **Category:** debt
- **Severity:** info
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of `dungeon-scholar/src` (test-parity sweep)

**Description:**
Every other module in `src/hooks/` carries a co-located suite (`useAuth` + its circuit-breaker suite, `useAppSurfaces`, `useDialogA11y`, `usePlayerState`), but three do not: `useOAuthCallback.js` (15 lines — consumes the Supabase OAuth `?code=` redirect on mount), `useRlsProbe.js` (26 lines — post-sign-in probe for RLS misconfiguration feeding `RlsWarningBanner`, with an `active`-flag cleanup worth pinning), and `useAppModals.js` (28 lines — the app-modal visibility registry, whose "modals are NOT mutually exclusive" semantics are stated only in a comment). In `components/dungeon/`, `useDungeonState.js` (74 lines) is likewise the only untested member of the delve triad's support files (`useDungeonInput`, `dungeonLogic`, `tileRenderer`, `dungeonMap` all have suites). Honest caveat: all four are thin glue over well-tested services (`supabase.js`, `cloudSync.js`), so this is parity/regression-pinning, not a coverage hole in logic — hence `info`. Distinct from the [2026-07-02] study-mode-screens entry (screens, not hooks) and the [2026-06-29] CI coverage-floor entry (metric budget).

**Hypothesis / root cause:** Three of the four were extracted from the `App.jsx` god-component during de-godding; the extractions moved code but did not add hook-level suites since the underlying services were already tested.

**Proposed fix / improvement:**
- [ ] Add small suites pinning: `useOAuthCallback` calls `consumeOAuthCallback` once on mount and logs (not throws) on rejection; `useRlsProbe` resets on sign-out and ignores stale async results after unmount; `useAppModals` allows concurrent open modals; `useDungeonState` initial-state/reset behavior.
- [ ] Or fold into whatever suite lands for the coverage-floor entry — no urgency on its own.

**Related files:** `src/hooks/useOAuthCallback.js`, `src/hooks/useRlsProbe.js`, `src/hooks/useAppModals.js`, `src/components/dungeon/useDungeonState.js`

**Related entries:** [2026-07-02] "Study-mode screens have no behavioral co-located tests"; [2026-06-29] "CI has no test-coverage floor and no bundle-size budget".

### [2026-07-15] PHASE-11 plan file marked done but never moved to `completed/` (PHASE-INDEX links inconsistent)

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of `dungeon-scholar/docs`

**Description:**
`docs/phases/PHASE-INDEX.md` row 11 reads `done — F1/F2/F3/F5 + F4/11D (11D landed 2026-07-03, owner-approved)`, but the plan file still sits at `docs/phases/PHASE-11-routing-headings-vault-exam-quest-copy-round.md` instead of `completed/`. The index header and `INSTRUCTIONS.md` both say finished plans move to `completed/`, and every other done phase (01-10, 12, 13) lives there. Cosmetic second half: rows 12/13 display bare `PHASE-12-…`/`PHASE-13-…` link text (hrefs correctly point into `./completed/`), while rows 01-10 display the `completed/PHASE-NN-…` form.

**Hypothesis / root cause:** PHASE-11 finished in two stages (main F-items, then 11D on 2026-07-03); whichever run flipped the status to done skipped the file move. Rows 12/13 were appended later with just the filename as link text.

**Proposed fix / improvement:**
- [ ] `git mv docs/phases/PHASE-11-routing-headings-vault-exam-quest-copy-round.md docs/phases/completed/` and point row 11 at `./completed/…`.
- [ ] Normalize rows 12/13 link text to the `completed/PHASE-NN-…` form used by rows 01-10.

**Related files:** `dungeon-scholar/docs/phases/PHASE-11-routing-headings-vault-exam-quest-copy-round.md`, `dungeon-scholar/docs/phases/PHASE-INDEX.md`

### [2026-07-15] `services/crossTomeExam.js` is an unwired module — zero production imports; its follow-up exists only in the resolved archive

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of `dungeon-scholar/src` (import-graph sweep)

**Description:**
`src/services/crossTomeExam.js` is imported by nothing except its own test — a repo-wide grep finds no other reference. It landed in the 2026-07-03 owner-approved feature batch as the tested pure core of the cross-tome practice exam, with the "full timed cross-tome ExamMode UI flow" explicitly noted as follow-up — but that note lives only in `RESOLVED-ISSUES-DUNGEON-SCHOLAR.md` (batch item 13), which active-backlog greps do not surface. Net effect: a shipped-but-unreachable feature core that no user can trigger and no active log tracks. (The batch named two other partial tails — cloze author-affordance, tome-version import-merge UI — but `cloze.js` and `tomeVersion.js` ARE wired into production imports; only `crossTomeExam.js` is fully dark.)

**Hypothesis / root cause:** The batch closed the original suggestion when the pure core merged; the UI-wiring remainder was recorded in the archive entry instead of being re-filed as an active item, so it fell out of the visible backlog.

**Proposed fix / improvement:**
- [ ] Wire the UI: an "All tomes / weak domains" preset on the exam entry point that builds its pool via `crossTomeExam.js` (weak-domain over-sampling is already implemented there).
- [ ] Until wired, THIS entry is the active-log tracker for that follow-up, so it cannot be lost in the archive. If the feature is instead abandoned, delete the module + test rather than carrying dead code.

**Related files:** `src/services/crossTomeExam.js`, `src/services/crossTomeExam.test.js`, `docs/logs/RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`

### [2026-07-15] `services/README.md` concern-taxonomy and `features/README.md` folder table went stale after the 2026-07-03 feature batch

- **Category:** docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of `dungeon-scholar/src` (README vs `ls` diff)

**Description:**
`src/services/README.md` states its purpose is to record the concern taxonomy "so new modules land in the right conceptual group", but its table covers only the pre-batch module set: the nine services added 2026-07-03 — `appBadge.js`, `cloze.js`, `crossTomeExam.js`, `dailyGoal.js`, `printExport.js`, `reportProblem.js`, `speech.js`, `studyPlan.js`, `tomeVersion.js` — appear in `ls src/services` but in no concern group. Similarly, `src/features/README.md`'s `progression/` row omits `ScholarsLedger.jsx` and `CertificateModal.jsx`, which live in that folder.

**Hypothesis / root cause:** The feature batch added modules without updating the two placement-rule READMEs; nothing gates README/table parity.

**Proposed fix / improvement:**
- [ ] Slot the nine services into groups (suggested: exam/SRS engine → `cloze`, `crossTomeExam`, `studyPlan`, `dailyGoal`, `printExport`; platform/UI infra → `appBadge`, `speech`, `reportProblem`; import/library → `tomeVersion` — editor's call, the point is table == `ls`).
- [ ] Add `ScholarsLedger` and `CertificateModal` to the `progression/` row in `features/README.md`.
- [ ] Optional: a tiny guard test diffing the README module list against `ls src/services/*.js` would keep this from drifting again.

**Related files:** `src/services/README.md`, `src/features/README.md`


### [2026-07-02] `router/screens.js` gating predicates are dead code — every production call site uses the raw arrays instead

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** scheduled cleanup/structure scan of dungeon-scholar/

**Description:**
`src/router/screens.js` describes itself as "the single source of truth for … screens and their gating rules" and exports three Set-backed predicates — `isValidScreen`, `screenRequiresCourseSet`, `screenSealedGated`. No production code calls any of them (only `screens.test.js` does): `useHashRoute.js:14` re-derives its own `const SCREEN_SET = new Set(SCREENS)` instead of `isValidScreen`, and `App.jsx` uses linear `COURSE_SET_GATED.includes(screen)` (~line 758) and `SEALED_GATED.includes(screen)` (~line 1896) instead of the predicates. The registry centralized the *data* as intended, but its intended API surface is unused, so gating is expressed in two idioms (private-Set predicate vs. raw-array `.includes`) and a future gating change has both to keep straight.

**Proposed fix / improvement:**
- [ ] Pick one idiom: switch the three call sites to the predicates (`useHashRoute` drops its local `SCREEN_SET`; `App.jsx` swaps the two `.includes` checks), OR delete the predicates and export the Sets directly.
- [ ] Point `screens.test.js` at whatever survives.

**Related files:** `src/router/screens.js`, `src/router/useHashRoute.js`, `src/App.jsx`, `src/router/screens.test.js`

**Related entries:** RESOLVED [2026-06-23] "`App.jsx` screen-router: render the ~22 `screen ===` branches through the `router/screens.js` registry" (the refactor that created the registry).

---

### [2026-07-02] `usePlayerActions.js` (1,336 lines) is the next god-file after the two already logged — seven-plus unrelated concern groups in one hook

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** scheduled cleanup/structure scan of dungeon-scholar/

**Description:**
The [2026-06-28] god-component entry covers `DungeonExplore.jsx` and `App.jsx` (and notes `tileRenderer.js` 1,576 as next-largest). The next hand-written logic module after those is `src/features/player/usePlayerActions.js` at 1,336 lines — a single hook mixing at least seven separable concern groups: (1) generic progress plumbing (`updateProgress`/`updateTomeProgress`/`updateCardProgress`/`setCardSuspended`), (2) economy + equipment (`awardXP`/`awardGold`/`purchaseItem`/`equipItem`/`unequipSlot`), (3) pets (`equipPet`/`awardPetXp`), (4) spell + potion loadouts, (5) crafting/bestiary/harvest records, (6) achievements + titles + ascension + daily reward, (7) the ~156-line `recordAnswer` SRS pipeline plus vault removal, and (8) three quest systems (daily/weekly/story chains, each with claim + claim-all). Any new player-facing action lands here by default, so the file grows every phase; the 526-line test covers slices but the hook is one indivisible unit to consumers.

**Hypothesis / root cause:** Same organic accretion as App.jsx — "the player actions hook" became the default home for every mutation.

**Proposed fix / improvement:**
- [ ] Carve cohesive sub-hooks (e.g. `useEconomyActions`, `useLoadoutActions`, `useQuestActions`, `useAnswerRecording`) composed *inside* `usePlayerActions` so the public API consumed by App.jsx is unchanged.
- [ ] Move pure helpers (quest-status derivations, achievement checks) into `src/game/` / `src/services/` where their siblings already live, and split the test alongside.

**Related files:** `src/features/player/usePlayerActions.js`, `src/features/player/usePlayerActions.test.jsx`

**Related entries:** [2026-06-28] "Extract logic/content out of the two god-component files".

---

### [2026-07-02] Study-mode screens have no behavioral co-located tests — ExamMode's is a typeof-only smoke whose comment is no longer true

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** scheduled cleanup/structure scan of dungeon-scholar/

**Description:**
The six study-mode screens are among the largest UI files in the tree (`ExamMode.jsx` 1,171, `DomainStudyScreen.jsx` 1,132, `QuizMode.jsx` 881, `ChatMode.jsx` 736, `LabMode.jsx` 534, `FlashcardsMode.jsx` 463), yet Quiz/Chat/Flashcards/Lab/DomainStudy have **no co-located test at all**, and `ExamMode.test.jsx` is a 10-line smoke asserting only `typeof ExamMode === 'function'`. That smoke's comment claims ExamMode "was the only study mode lacking a co-located test" — inaccurate today: no other mode screen has one (only `MistakeVault` and `oracleSources` in that folder do), so the comment actively misleads about coverage. The logic services underneath are well tested (`examSession`, `examPace`, `srs`, `oracleGrader`, …), but screen-level behavior — exam timers and resume, flag-for-review, keyboard shortcuts, answer-flow wiring into `usePlayerActions` — is exercised only indirectly. Distinct from the [2026-06-29] CI coverage-floor entry (that is a metric budget; this is the concrete missing test family the metric would expose).

**Proposed fix / improvement:**
- [ ] Add mount-level render smokes per mode (render with a minimal tome fixture; first card/riddle visible) — cheap and catches import/hook-order breakage.
- [ ] Then behavioral tests for the two highest-risk flows: practice-exam resume (`examSession` wiring) and timer expiry.
- [ ] Fix or delete the misleading comment in `ExamMode.test.jsx`.

**Related files:** `src/features/study/ExamMode.test.jsx`, `src/features/study/QuizMode.jsx`, `src/features/study/ChatMode.jsx`, `src/features/study/FlashcardsMode.jsx`, `src/features/study/LabMode.jsx`, `src/features/study/DomainStudyScreen.jsx`

**Related entries:** [2026-06-29] "CI has no test-coverage floor and no bundle-size budget…".

---

### [2026-07-02] QA-report multi-run filename convention is ad hoc and lexically missorts (`-2` sorts before the first run)

- **Category:** docs
- **Severity:** info
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** scheduled cleanup/structure scan of dungeon-scholar/

**Description:**
`docs/phases/QA/INSTRUCTIONS.md` (~lines 172/188) prescribes one `QA-report-YYYY-MM-DD.md` per pass, with no rule for same-day reruns. In practice reruns appended ad-hoc suffixes: `QA/completed/` holds `QA-report-2026-06-24.md` + `-2`/`-3` and `QA-report-2026-06-29.md` + `-2`…`-5`. Because `-` (0x2D) sorts before `.` (0x2E), the unsuffixed first run sorts *after* all its reruns in directory listings (…-29-2 … -29-5, then …-29.md), so a day's chronology reads backwards and "the latest report" is not the last file.

**Proposed fix / improvement:**
- [ ] Codify the rerun scheme in `QA/INSTRUCTIONS.md` — e.g. every run gets a run number (`QA-report-YYYY-MM-DD-1.md`, `-2`, …).
- [ ] Optionally `git mv` the two unsuffixed first-run files to `-1` for clean sorting (update the references in `PHASE-INDEX.md` and the logs that cite them).

**Related files:** `dungeon-scholar/docs/phases/QA/INSTRUCTIONS.md`, `dungeon-scholar/docs/phases/QA/completed/`

---

### [2026-07-02] This log has two `# Low-severity polish / info` headers (union-merge artifact) and the second holds mis-sectioned future-idea entries

- **Category:** docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** scheduled cleanup/structure scan of dungeon-scholar/

**Description:**
`docs/logs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md` contains the section header `# Low-severity polish / info` twice (~lines 366 and 652 at `b1128097`). This is the documented union-merge caveat (AUTOMATED-AGENT-GIT-WORKFLOW.md Rule 2: concurrent branches can duplicate section headers). The entries under the second copy (PWA App Badging, speech-to-text voice input, daily study goal + streak-freeze, etc.) are all `Category: future-idea` from scholar-suggestor, so they are additionally mis-sectioned — they belong under `# Future ideas`. Consequence: "insert at top of section" has two competing anchors and section-scoped reading is unreliable. Precedent: bmo-resolver fixed the same artifact class in `BMO-ISSUES-LOG.md` ("Removed the duplicated copy of the section").

**Proposed fix / improvement:**
- [ ] One small structural pass (resolver or human, in a quiet window to avoid racing parallel appends): move the future-idea entries under `# Future ideas`, delete the duplicate header, keep entry text byte-identical.

**Related files:** `docs/logs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`

---


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
