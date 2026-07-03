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

### [2026-06-29] CI has no test-coverage floor and no bundle-size budget, despite "keep the initial bundle small" being a stated design value

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar tooling

**Description:**
`dungeon-scholar-ci.yml` gates on lint + typecheck + `vitest run` + build, but enforces no coverage threshold and no JS bundle-size budget (grep for `chunkSizeWarningLimit` / `size-limit` / `bundlesize` / `lighthouse` returns nothing across the project + workflow). The repo invests heavily in a small initial bundle — `vite.config.js` ships a `manualChunks` splitter, every screen is `React.lazy`-loaded, and `richContent.js` explicitly rejects bundling KaTeX/Mermaid eagerly "to keep the bundle small" — yet nothing in CI prevents a regression: a heavy dependency landing in the initial chunk, or `manualChunks` silently degrading, would pass green. Likewise, the existing-issue note that exhaustive-deps hooks lack behavioral test coverage (see ISSUES-LOG) has no coverage metric to track whether that gap is shrinking or growing.

**Hypothesis / root cause:** CI was built to gate correctness (lint/types/tests/build); the performance + coverage *budgets* that protect the app's stated design values were never added.

**Proposed fix / improvement:**
- [ ] Add a build-output size check (e.g. a tiny script asserting the largest initial JS chunk stays under a committed budget, or `size-limit`) as a non-blocking-then-blocking CI step.
- [ ] Enable `vitest --coverage` (v8 provider) and set a modest floor that ratchets up, so coverage can't silently regress.
- [ ] Keep both advisory at first (report in the PR) before making them gating, matching the repo's incremental-tightening posture.

**Related files:** `.github/workflows/dungeon-scholar-ci.yml`, `dungeon-scholar/vite.config.js`, `dungeon-scholar/package.json`

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

### [2026-06-29] Pin Biome as a devDependency instead of `npx --yes @biomejs/biome@2.5.0` on every lint/format run

- **Category:** portability
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement scan of dungeon-scholar tooling

**Description:**
`package.json` runs lint/format via `npx --yes @biomejs/biome@2.5.0 ...` for all three of `lint`, `lint:fix`, and `format`. Because Biome is not a declared devDependency, every invocation can trigger an on-demand npm fetch of the `@biomejs/biome` package, so linting cannot run offline (a hit for the offline-first ethos of this PWA repo and for CI cold caches) and is not locked in `package-lock.json` the way every other tool is. The version is also pinned in three string literals rather than one place, so a Biome bump means editing three script lines instead of one dependency entry (and Dependabot, which the repo relies on per the agent git workflow, cannot see/manage a version that lives only inside a script string).

**Proposed fix / improvement:**
- [ ] Add `@biomejs/biome` at `2.5.0` to `devDependencies` so it is installed + lockfile-pinned with everything else.
- [ ] Change the scripts to `biome check src` / `biome check --write src` / `biome format --write src` (resolve from `node_modules/.bin`), dropping `npx --yes` and the inline version.
- [ ] This also lets Dependabot track Biome version bumps like the other dev tools.

**Related files:** `dungeon-scholar/package.json`, `dungeon-scholar/biome.json`

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


### [2026-07-02] `docs/phases/PHASE-INDEX.md` — broken links for completed PHASE-01/02, a mislabeled PHASE-10 link, and provenance narrative crowding out the index

- **Category:** docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** scheduled cleanup/structure scan of dungeon-scholar/

**Description:**
Three staleness/structure problems in the phase index. (1) **Broken links:** rows 01 and 02 are marked `done` and their plan files were moved to `completed/` (they are in `docs/phases/completed/`), but the table still links `./PHASE-01-routing-pwa-update-resilience.md` and `./PHASE-02-load-noise-ux-docs-round.md` — both 404 as relative links now. (2) **Mislabeled link:** row 10's link *text* reads `PHASE-10-...md` as if in the active folder while its href correctly points at `./completed/...` — inconsistent with rows 03–09, which show the `completed/` prefix in the label. (3) **Structure:** each QA run appends a large `> **Source (NN)** ...` provenance blockquote; these narratives are now ~85% of the file (~20 KB total for a 13-row table) and bury the closing "Add a row per future plan..." maintenance instruction beneath ~10 dense paragraphs. The INSTRUCTIONS.md-declared purpose of the file is a dependency manifest / execution order; the provenance prose is valuable history but no longer index material.

**Hypothesis / root cause:** The executer moves finished plan files into `completed/` but nothing re-points the 01/02 index rows (03–09 were fixed at some point; 01/02 predate that habit). The provenance blobs accumulate because the phase-maker appends per run with no size/placement rule.

**Proposed fix / improvement:**
- [ ] Re-point rows 01 and 02 at `./completed/PHASE-01-...md` / `./completed/PHASE-02-...md`, and fix row 10's label to show the `completed/` path like its siblings.
- [ ] Move the per-run `> **Source (NN)**` provenance blockquotes into a sibling `PHASE-PROVENANCE.md` (or into each phase file's own header), leaving PHASE-INDEX as the lean table + the row-maintenance instruction; add a one-line rule to `docs/phases/INSTRUCTIONS.md` telling the phase-maker where provenance prose goes.
- [ ] Optional: a tiny vitest guard (like the existing convention-guard tests) asserting every `Plan file` link in PHASE-INDEX resolves to an existing file, so future moves to `completed/` can't silently break rows.

**Related files:** `dungeon-scholar/docs/phases/PHASE-INDEX.md`, `dungeon-scholar/docs/phases/INSTRUCTIONS.md`, `dungeon-scholar/docs/phases/completed/`

**Related entries:** ISSUES-LOG-DUNGEON-SCHOLAR.md [2026-06-29] phase-maker/executer merge-collision entries (both touch PHASE-INDEX churn)

---

### [2026-07-02] `dungeon-scholar/CHANGELOG.md` has been frozen since it was seeded — phases 03–13 and all resolver fixes are absent, and no process owns updating it

- **Category:** docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** scheduled cleanup/structure scan of dungeon-scholar/

**Description:**
`CHANGELOG.md` (38 lines) instructs "Keep it updated on each release; group new work under `[Unreleased]` and cut a dated, versioned section when a release is tagged" — but it has not been touched since its two seed commits (last change 2026-06-23), while master has since landed dungeon-scholar phases 03 through 11-partial (light-theme contrast rounds, import robustness, vault gate, exam/date/copy fixes, the auth circuit-breaker) plus resolver fixes (FSRS-5 forecast alignment, notes stripping, etc.). Two structural mismatches make the freeze inevitable: (a) dungeon-scholar has **no release/tag cadence at all** — the integrator's merge auto-deploys GitHub Pages continuously and `package.json` stays at `0.1.0`, so the promised "cut a versioned section when a release is tagged" trigger never fires; (b) no agent's task definition mentions this file, so nobody appends to `[Unreleased]` either. A changelog whose own header promises upkeep but is visibly weeks stale is worse than no changelog — it misleads readers about what the live app contains.

**Hypothesis / root cause:** The file was seeded during the 2026-06-23 App.jsx de-god refactor as an aspirational Keep-a-Changelog document, but the domain's release model (continuous Pages deploys, no tags) never matched the versioned-sections format, and changelog upkeep was never added to the scholar-phase-executer / scholar-resolver checklists.

**Proposed fix / improvement:**
- [ ] Decide the model: either (a) repurpose the file as a pointer — a short header explaining that completed phase plans (`docs/phases/completed/`), `docs/logs/RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`, and the git history of `dungeon-scholar/` ARE the living changelog (mirroring how dnd-app's GitHub Releases page is its changelog) — or (b) keep Keep-a-Changelog format and add "append a bullet to `[Unreleased]`" to the scholar-phase-executer's and scholar-resolver's per-run checklists, with the integrator cutting a dated section on deploy.
- [ ] Whichever is chosen, remove the stale "when a release is tagged" promise — there are no tags in this domain.

**Related files:** `dungeon-scholar/CHANGELOG.md`, `dungeon-scholar/docs/phases/completed/`, `docs/logs/RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`

**Related entries:** none

---

### [2026-06-29] Root README "Project structure" diagram omits the `components/dungeon/` crawler subsystem (and `utils/`, `services/locales/`, `sw.js`)

- **Category:** docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** scheduled cleanup/structure scan of dungeon-scholar/

**Description:**
The `## Project structure` tree in `dungeon-scholar/README.md` lists `components/` and `components/ui/` but never mentions `components/dungeon/` — which is the single largest subsystem in the codebase (`DungeonExplore.jsx` 2739 lines, `tileRenderer.js` 1576, plus `dungeonLogic.js`, `useDungeonState.js`, `useDungeonInput.js`, `dungeonMap` content). The diagram also omits `src/utils/`, `src/services/locales/` (the en/es i18n bundles), and `src/sw.js` (the service worker, which is central to the PWA offline story the README itself emphasizes). A newcomer reading the structure map gets no pointer to the dungeon-crawler rendering/logic layer, the place most likely to confuse. This is distinct from the already-logged "inconsistent README coverage across src/ subdirectories" item, which is about missing per-directory `README.md` files, not the accuracy/completeness of the root README structure diagram.

**Proposed fix / improvement:**
- [ ] Add a `components/dungeon/` line to the structure diagram with a one-line description (canvas crawler render loop + input/state hooks + map data).
- [ ] Add `utils/`, `services/locales/`, and `sw.js` lines (or fold locales under the `services/` line and call out `sw.js` next to `main.jsx`).
- [ ] Keep it in sync going forward, or add a tiny test/lint that flags top-level `src/` dirs absent from the README block.

**Related files:** `dungeon-scholar/README.md`, `src/components/dungeon/`, `src/utils/`, `src/services/locales/`, `src/sw.js`

**Related entries:** [2026-06-28] Inconsistent README coverage across `src/` subdirectories

---

### [2026-06-29] `tsconfig.json` excludes ALL test files (and `src/sw.js`) from the `checkJs` typecheck, leaving a large type-coverage gap

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** scheduled cleanup/structure scan of dungeon-scholar/

**Description:**
`tsconfig.json` enables `allowJs` + `checkJs` (JSDoc-based type checking over the JS/JSX source) and `npm run typecheck` runs `tsc --noEmit`, but the `exclude` block lists `**/*.test.js`, `**/*.test.jsx`, and `src/sw.js`. Test files are a very large fraction of this tree (roughly one `.test.*` per module across `src/`), and they exercise the real public API of the app modules — so a breaking signature/shape change in app code that a test would surface is invisible to `tsc`, even though the test files themselves are never type-checked. `src/sw.js` (the service worker, a non-trivial PWA-critical module) is likewise outside the typecheck net.

**Hypothesis / root cause:** Likely a deliberate choice to keep `tsc` fast and green and avoid typing the Vitest/happy-dom test surface, and to skip `sw.js` because it runs in a Worker global scope that tsc's default DOM lib does not model. Flagging as speculation — the exclusion may be intentional, but it is undocumented, so future contributors can mistake "typecheck passed" for "the tests type-check too."

**Proposed fix / improvement:**
- [ ] If intentional, add a short comment in `tsconfig.json` (or a line in DESIGN-CONSTRAINTS) explaining why tests and `sw.js` are excluded, so the coverage gap is a documented decision rather than a silent one.
- [ ] If not, consider a second `tsconfig.test.json` (or a `checkJs` pass that includes tests with `@testing-library`/`vitest` types) so test files get at least loose type-checking; and add `WebWorker` lib coverage for `sw.js`.

**Related files:** `dungeon-scholar/tsconfig.json`, `src/sw.js`

---

### [2026-06-29] Module-less convention-guard tests (`src/theme.test.js`, `src/components/lucide-a11y.test.jsx`) break the co-location convention and are hard to find

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** scheduled cleanup/structure scan of dungeon-scholar/

**Description:**
Almost every test in the tree sits next to the module it covers (`srs.js` + `srs.test.js`, etc.). Two tests have no module-under-test and instead statically scan the whole codebase as cross-cutting guards: `src/theme.test.js` (reads `index.css` and greps JSX for Tailwind color utilities to assert the light-theme ramp overrides exist) and `src/components/lucide-a11y.test.jsx` (an a11y convention check over lucide icon usage). Because they are named like ordinary co-located unit tests but have no sibling source file, they read as orphans (they surfaced in a "test with no matching module" scan) and their cross-cutting, repo-guard nature is non-obvious. There is no single place a contributor can look to see "what global conventions are enforced by tests."

**Proposed fix / improvement:**
- [ ] Adopt a distinguishing convention for codebase-wide guard tests — e.g. a `*.guard.test.js` suffix and/or a dedicated `src/__guards__/` (or `src/conventions/`) directory — and relocate `theme.test.js` and `lucide-a11y.test.jsx` there.
- [ ] Add a one-paragraph note (in `src/components/README.md` or a new `docs/` testing-conventions doc) listing the active guard tests and what each enforces, so the theme-ramp and icon-a11y guarantees are discoverable.

**Related files:** `src/theme.test.js`, `src/components/lucide-a11y.test.jsx`, `src/components/README.md`

**Related entries:** [2026-06-28] Test-file extension convention is inconsistent (`.test.js` testing a `.jsx` component)

> **[2026-07-02] scholar-cleanup follow-up:** the module-less guard-test family has since **grown by two**, both landed 2026-06-29 with phase-numbered names in yet more locations: `src/phase10-contrast.test.js` (src root — statically greps `index.css`/JSX for the PHASE-10 light-theme muted-label token) and `src/features/phase11Guards.test.js` (features root — greps three study-mode JSX files for `<h2>` and QuestBoard for verb agreement). So there are now 4 guard tests in 3 different directories, and the two new ones are named after *phase numbers* that will mean nothing to a future reader (the phase files will long since have moved to `completed/`). This strengthens the case for the proposed `src/__guards__/` + `*.guard.test.js` convention; the relocation should also rename the phase-numbered files after *what they enforce* (e.g. `lightThemeMutedLabel.guard.test.js`, `studyModeHeadings.guard.test.js`), keeping the PHASE-NN reference in a comment.


---


### [2026-06-29] `dungeonMap.js`'s entire unit suite is misfiled as `components/dungeon/DungeonExplore.test.js` (wrong name, wrong directory)

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of `dungeon-scholar/src`

**Description:**
`src/components/dungeon/DungeonExplore.test.js` does not import a single symbol from `DungeonExplore.jsx` -- its only `import` lines pull from `../../game/dungeonMap.js` (BIOMES, BIOME_BOSS_POOL, generateMap, makeSeededRng, pickBiomeForSubject, revealDecoration, buildQuestionLogEntry, takeForesightPreview, TILE, POTION_EFFECTS, ROOMS/SIZE_BY_DIFFICULTY) and `../../game/difficulty.js`. All nine `describe` blocks assert on those `dungeonMap.js` exports. So this file is really the unit suite for `src/game/dungeonMap.js` (656 lines of core map-gen/biome/boss logic), but it lives two directories away under the component name. Consequences: (1) a `find src/game -name dungeonMap.test.js` or a co-located-test check reports `dungeonMap.js` as **untested** when in fact it is well covered; (2) the test sits in `components/dungeon/` next to the canvas component it never touches, so a reader editing `dungeonMap.js` would not find its tests beside it.

Note: this also **corrects a factual premise** in two earlier entries (the [2026-06-28] god-component entry and the [2026-06-28] test-extension entry), both of which describe `DungeonExplore.test.js` as exercising constants “exported from the component file `DungeonExplore.jsx`” / constants that “want their own module.” Those constants already live in their own module (`game/dungeonMap.js`); the component merely re-imports them. The remaining real problem is purely the **test files name + location**, not constants trapped inside the `.jsx`.

**Hypothesis / root cause:** The logic now in `game/dungeonMap.js` was likely once inlined in `DungeonExplore.jsx`; when it was extracted to `game/`, its test file kept the old component name and old location instead of moving to `game/dungeonMap.test.js`.

**Proposed fix / improvement:**
- [ ] `git mv src/components/dungeon/DungeonExplore.test.js src/game/dungeonMap.test.js` and fix the now-shorter relative import paths (`../../game/dungeonMap.js` -> `./dungeonMap.js`, `../../game/difficulty.js` -> `./difficulty.js`). No assertion changes needed.
- [ ] Leave `DungeonExplore.smoke.test.jsx` where it is -- that one genuinely renders the component.
- [ ] This supersedes the rename half of the [2026-06-28] test-extension entry: once the suite lives at `game/dungeonMap.test.js`, the `.test.js`-testing-a-`.jsx` concern is gone (it tests a `.js` module), and the component is left with exactly one test file (`.smoke.test.jsx`).

**Related files:** `src/components/dungeon/DungeonExplore.test.js`, `src/game/dungeonMap.js`, `src/components/dungeon/DungeonExplore.smoke.test.jsx`

**Related entries:** SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md [2026-06-28] “Extract logic/content out of the two god-component files” and [2026-06-28] “Test-file extension convention is inconsistent” (both partly mis-attribute the dungeonMap constants to `DungeonExplore.jsx`).

---

### [2026-06-29] `src/services/README.md` concern-taxonomy table is stale -- 8 of 32 service modules are absent from it

- **Category:** docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of `dungeon-scholar/src`

**Description:**
`src/services/README.md` documents a four-group “concern taxonomy” table whose stated purpose is “so new modules land in the right conceptual group.” But the table lists only 24 of the 32 non-test service modules. Eight are missing entirely (verified by checking each filename against the README): `accuracyPalette.js`, `certificate.js`, `deckImport.js`, `leech.js`, `libraryBulk.js`, `occlusion.js`, `pwaUpdate.js`, `shortcuts.js`. A doc that exists specifically to map every service into a group, but silently omits a quarter of them, sends the wrong signal: a contributor adding a sibling to (say) `deckImport.js` finds no row to pattern-match against, and the omitted modules have no documented home group.

**Hypothesis / root cause:** The taxonomy table was written as a point-in-time snapshot and not updated as new service modules (import/deck handling, certificate, leech/SRS extras, PWA update, keyboard shortcuts, accuracy palette) were added.

**Proposed fix / improvement:**
- [ ] Add the eight missing modules to the existing table under a sensible group -- e.g. `deckImport.js`, `libraryBulk.js`, `importLimits.js`(already listed) cohere as an **import / library** group; `certificate.js`, `occlusion.js`, `leech.js`, `accuracyPalette.js` fit **exam/SRS engine** or a new **study artifacts** group; `pwaUpdate.js`, `shortcuts.js` fit **platform / UI infra**.
- [ ] Consider adding a tiny CI/test guard (or a note) that every `src/services/*.js` non-test module appears exactly once in the README table, so the taxonomy cannot silently drift again -- mirrors the locale-parity test already used for i18n.

**Related files:** `src/services/README.md`, `src/services/accuracyPalette.js`, `src/services/certificate.js`, `src/services/deckImport.js`, `src/services/leech.js`, `src/services/libraryBulk.js`, `src/services/occlusion.js`, `src/services/pwaUpdate.js`, `src/services/shortcuts.js`

**Related entries:** SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md [2026-06-28] “Inconsistent README coverage across `src/` subdirectories” (that entry is about which dirs lack a README; this one is about the existing services README being internally incomplete).

---

### [2026-06-28] Orphaned utility modules `utils/time.js` + `utils/shuffle.js` — unused, and the duplication they were meant to remove still exists

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of `dungeon-scholar/src`

**Description:**
`src/utils/time.js` (exports `formatSec`, `formatMs`) and `src/utils/shuffle.js` (exports a generic Fisher-Yates `shuffle`) have **zero importers anywhere in `src/`** (grep for `utils/time`, `utils/shuffle`, `formatSec`, `formatMs`, and `import { shuffle }` all return nothing — including tests). They are dead module files. Note this is NOT caught by the biome `noUnusedImports` warnings already logged: nothing imports the files, so there is no unused-import to flag — biome only sees within-file dead code. Worse, both files were created (their own header comments say so, "S22") to be the *canonical home* that removes duplication, yet the duplication persists:
- m/s formatting is still inlined in `features/study/ExamMode.jsx` (lines 26, 252) and `game/tome.js` (line 124) instead of using `time.js`.
- bespoke shuffles still live in `game/items.js`, `game/dungeonMap.js` (its own local `shuffle`), `game/tome.js` (`shuffleArray`), `game/quests.js`, and `services/examSession.js` (`shuffleInPlace`) instead of using `utils/shuffle.js`.

So the refactor was half-done: the shared helpers were written but never wired in, leaving orphans + ongoing duplication.

**Hypothesis / root cause:** The consolidation commit (tagged "S22") added the shared util files but never completed the call-site migration; the originals were left in place and the new files stranded.

**Proposed fix / improvement:**
- [ ] Decide one direction. Either: (a) finish the consolidation — replace the inline m/s formatters with `time.js` and the bespoke shuffles with `utils/shuffle.js`, and add the missing `time.test.js` / `shuffle.test.js`; or (b) if the per-call-site variants are intentionally different (seeded vs `Math.random`, in-place vs copy), delete the two orphaned files so they stop implying a shared path that isn't used.
- [ ] If keeping `utils/shuffle.js`, reconcile the seeded-RNG signature so `dungeonMap.js`/`quests.js`/`examSession.js` (which need a deterministic `rng`) can actually adopt it.

**Related files:** `src/utils/time.js`, `src/utils/shuffle.js`, `src/features/study/ExamMode.jsx`, `src/game/tome.js`, `src/game/items.js`, `src/game/dungeonMap.js`, `src/game/quests.js`, `src/services/examSession.js`

---

### [2026-06-28] Inconsistent README coverage across `src/` subdirectories

- **Category:** docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of `dungeon-scholar/src`

**Description:**
Only three `src` subdirectories carry a `README.md` (`src/components/`, `src/components/dungeon/`, `src/services/`). The rest have none — including the most populous and least self-explanatory ones: `src/features/` and its 7 feature folders (11+ screen components across study/progression/library/etc.), `src/game/` (the run/quiz/lab content + rules engine), `src/prompts/` (11 per-vendor Oracle prompt modules), `src/hooks/`, and `src/router/`. A newcomer can learn the `components`/`services` conventions but gets no orientation for the feature-folder layout or the game/prompts content model, which is where most of the domain logic lives.

**Hypothesis / root cause:** READMEs were added ad hoc for the first few directories touched and the practice was never extended as `features/` and `game/` grew.

**Proposed fix / improvement:**
- [ ] Add a short `README.md` to `src/features/` explaining the feature-folder convention (one folder per screen group; co-located hooks/modals), plus one-liners per feature folder.
- [ ] Add a `src/game/README.md` (what the run/quiz/lab content set is, how `starterDecks`/`bestiary`/`items`/`quests` relate) and a `src/prompts/README.md` (the per-vendor prompt + `_META` pattern and how `index.js` aggregates `ORG_PROMPTS`).
- [ ] Alternatively, document all of these in one `src/README.md` architecture map rather than scattering files.

**Related files:** `src/features/`, `src/game/`, `src/prompts/`, `src/hooks/`, `src/router/`

---

### [2026-06-28] Test-file extension convention is inconsistent (`.test.js` testing a `.jsx` component)

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of `dungeon-scholar/src`

**Description:**
The repo overwhelmingly co-locates tests as `<name>.test.<ext>` matching the source extension, but `src/components/dungeon/DungeonExplore.test.js` (16 KB) is a `.test.js` whose subject is `DungeonExplore.jsx`, while a second test for the same component uses the expected `.jsx` extension (`DungeonExplore.smoke.test.jsx`). So the same component has one `.test.js` and one `.smoke.test.jsx`. It works because the `.test.js` actually exercises plain logic constants exported from the component file (not JSX rendering), which is itself a smell — those constants want their own module (see the god-component entry above). Two test files with divergent extensions for one component is an avoidable naming inconsistency for anyone grepping `*.test.jsx`.

**Hypothesis / root cause:** `DungeonExplore.test.js` predates the smoke test and was named for the logic it tests; once the logic and the component live in the same `.jsx` file, neither extension is clearly "right".

**Proposed fix / improvement:**
- [ ] Adopt one rule: test file extension matches the module it imports/asserts against. If `DungeonExplore.test.js` keeps testing logic exported from the `.jsx`, either rename it `.test.jsx` for consistency, or (preferred) move those constants to a `.js` content module and have the `.test.js` target that module.
- [ ] Optionally add a one-line convention note to `src/components/README.md`.

**Related files:** `src/components/dungeon/DungeonExplore.test.js`, `src/components/dungeon/DungeonExplore.smoke.test.jsx`
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
