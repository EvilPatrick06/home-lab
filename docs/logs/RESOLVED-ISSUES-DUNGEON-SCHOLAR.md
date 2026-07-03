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

### [2026-07-03] Dungeon-scholar feature backlog batch — 15 approved suggestions + PHASE-11D

> **Resolved 2026-07-03 (`auto/scholar-features-batch`, approved backlog batch):** Owner approved the whole dungeon-scholar FEATURE backlog. Implemented on `auto/scholar-features-batch` as tested, gate-green (lint / typecheck / test / build) first versions. Each item below is moved here from `SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`.

- **Category:** feature / suggestion (approved backlog)
- **Severity:** n/a (enhancement)
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **Resolved by:** scholar-features-batch (cowork session)

**Items landed:**

1. **sugg-csv-export** — `exportTomeCsv`/`csvQuoteField` in `services/deckImport.js` emit RFC-4180 `term,definition,domain` rows that round-trip through the importer; `ShareTomeModal` gains a Download-CSV action.
2. **sugg-cloze-cards** — `services/cloze.js` parses Anki `{{c1::answer}}` (and bare `{{answer}}`, `::hint`) cloze spans and expands one study item per masked cluster; `FlashcardsMode` expands cloze cards at deck build. (Author "make cloze" text-wrap affordance left as a small follow-up.)
3. **sugg-srs-knobs** — `services/srs.js` exposes `setDesiredRetention` (clamped 0.8–0.97, future-only rescale) + `capNewCards`/`normalizeNewCardCap` (default 20); `FlashcardsMode` review queue caps new cards; `ThemePanel` Study-load controls.
4. **sugg-tome-versioning** — `services/tomeVersion.js` adds a monotonic `revision` + `compareTomeVersions`/`importDecision`; `TomeEditor` bumps revision on save. (Import-side "newer available, merge?" MergeChooser wiring left as follow-up — the compare/decide core is tested.)
5. **sugg-confidence-calibration** — already implemented in-app (`DomainStudyScreen` Confidence Calibration section reads per-tome `confidenceStats`); verified present, no new code needed.
6. **sugg-pdf-print-export** — `services/printExport.js` builds a clean standalone study sheet (questions-only or with answers, HTML-escaped) and opens the browser print/Save-as-PDF path; `ShareTomeModal` actions + defensive `@media print` CSS.
7. **sugg-daily-goal** — `services/dailyGoal.js` adds a configurable daily target (default 20) + rollover progress + a distinct streak-freeze token (`evaluateStreakFreeze` forgives one missed day); `HomeScreen` progress bar, `ThemePanel` setting, `recordAnswer` bumps progress.
8. **sugg-text-scale** — `--text-scale` root scaling (90–130%) + a dyslexia-friendly font toggle in `ThemePanel`, applied via App root effect + `index.css`.
9. **sugg-pwa-badging** — `services/appBadge.js` (feature-detected App Badging) sets the installed-icon badge to total library due-card count; App effect wires it, degrades gracefully.
10. **sugg-diagram-a11y** — `richContent` parses an optional caption from a diagram fence info line; `RichContent` renders diagram fences as a single `role="img"` + `aria-label` unit (caption or generic "ASCII diagram").
11. **sugg-forced-colors** — `@media (forced-colors: active)` block in `index.css` honoring Windows High Contrast (system colors, visible focus/borders, non-color-only affordances).
12. **sugg-report-problem** — `services/reportProblem.js` (make/add/resolve/remove, deduped) stores per-tome defect reports on `progress.reportedProblems`; `QuizMode` post-answer reporter with reason picker; `TomeEditor` author review panel.
13. **sugg-cross-tome-exam** — `services/crossTomeExam.js` pools quiz across tomes + weak-domain sampling weights (weaker domains over-sampled) reusing `pickStratifiedSample`; pure tested core. (Full timed cross-tome ExamMode UI flow left as follow-up.)
14. **sugg-study-plan** — `services/studyPlan.js` composes exam pace + prediction + weakest domain into a daily "what to study today" recommendation, rendered in `DomainStudyScreen`.
15. **sugg-speech-input** — `services/speech.js` feature-detected Web Speech dictation; `QuizMode` free-text answer gets an optional mic button (hidden where unsupported).

**PHASE-11D (F4):** `presetsForPool` in `services/examSession.js` collapses practice-exam presets that clamp to the same effective riddle count on small tomes (keeps the shortest-timer survivor); `ExamMode` maps over it instead of `EXAM_PRESETS`. Guaranteed no two cards share an `effective`+`minutes` pair.

**Notes / on-device caveats:** UI-visual changes (ThemePanel sliders, HomeScreen goal bar, QuizMode report/mic, print sheet, forced-colors/high-contrast rendering, PWA badge) verified via unit tests + full build; not manually exercised on a device — a visual QA pass is worthwhile. Speech + PWA-badging + forced-colors are feature-detected and degrade silently where unsupported.

**Deferred / partial:** cloze author-affordance, tome-version import-merge UI, and the full cross-tome timed ExamMode flow are the coherent-but-larger tails; their tested pure cores landed and the remaining UI wiring is noted above.

---

### [2026-06-29] `auto/scholar-phase-maker` (tip `850f8404`) won't merge — competing PHASE-06 + PHASE-03 amendment vs the already-merged run

> **Resolved 2026-07-03 (scholar-debt-batch, approved backlog batch):** Reconciled on `master`, which already carries the **canonical split** — `PHASE-06-vault-redeemed-unlock-gate.md` + `PHASE-07-import-toast-exam-copy.md` both in `docs/phases/completed/` (the split 06/07 won; the stale combined `PHASE-06-vault-title-import-activation-exam-copy.md` does not exist on master). The stale `auto/scholar-phase-maker` branch (tip `850f8404`) is **already gone** — no local or remote ref points to it; commit `850f8404` is now an orphaned/dangling object (`git branch -a --contains 850f8404` = empty), so there was nothing to delete. `PHASE-INDEX.md` was reconciled (rows 01/02/10 links fixed) and a phase-maker rule added (INSTRUCTIONS.md + PHASE-INDEX pointer) to **check the index for an existing plan from the same QA report before authoring**, closing the duplicate-number race that caused this. No app code change.

- **Category:** integration / merge-conflict (duplicate work)
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** integrator
- **During:** daily branch integration (2026-06-29 run)

**Description:**
An earlier `auto/scholar-phase-maker` run was merged to `master` this same pass, adding `PHASE-06-vault-redeemed-unlock-gate.md` + `PHASE-07-import-toast-exam-copy.md` (the `QA-report-2026-06-28.md` findings, split into two plans) and an `03G` amendment to `PHASE-03`. A **second** `auto/scholar-phase-maker` branch (tip `850f8404`) then appeared and re-authored the **same** report into a single combined `PHASE-06-vault-title-import-activation-exam-copy.md` plus its own competing `PHASE-03` provenance/03E amendment — so it no longer merges: conflicts in `PHASE-INDEX.md` (PHASE-06 row: one combined `06` vs the merged `06`+`07`) and `PHASE-03-light-theme-dark-on-dark-contrast.md` (two different wordings of the same 2026-06-28 light-on-light amendment).

**Root cause:** Two scholar phase-maker runs raced over the same `QA-report-2026-06-28.md`; the first landed (split 06/07), so the second is a redundant re-authoring (combined 06) rather than a mechanical conflict. Not fixed-forward because choosing the canonical PHASE-06 shape (split vs combined) and the canonical PHASE-03 amendment text is a scholar-domain decision. Note this also interacts with the routed `auto/scholar-phase-executer` (which marks PHASE-03/04/05 done) — reconcile together.

**Proposed fix / improvement (scholar phase-maker owner):**
- [ ] Decide canonical shape: keep the merged split `PHASE-06`+`PHASE-07`, OR adopt `850f8404`'s combined `PHASE-06` (port any better wording into the merged docs); keep ONE `PHASE-03` amendment.
- [ ] Delete `auto/scholar-phase-maker` (tip `850f8404`) once reconciled — it has no unique code, only duplicate phase docs.
- [ ] Have the phase-maker check `PHASE-INDEX.md` for an existing plan from the same QA report before authoring, to stop duplicate-number races.

**Related files:** `dungeon-scholar/docs/phases/PHASE-INDEX.md`, `dungeon-scholar/docs/phases/PHASE-03-light-theme-dark-on-dark-contrast.md`, `dungeon-scholar/docs/phases/PHASE-06-*.md`, `dungeon-scholar/docs/phases/PHASE-07-import-toast-exam-copy.md`, branch `auto/scholar-phase-maker` (tip `850f8404`)

---

### [2026-06-29] Pin Biome as a devDependency instead of `npx --yes @biomejs/biome@2.5.0` on every lint/format run

> **Resolved 2026-07-03 (scholar-debt-batch, approved backlog batch):** Added `@biomejs/biome@2.5.0` to `devDependencies` (lockfile-pinned, all 24 platform CLI packages resolved in `package-lock.json`) and changed the scripts to `biome check src` / `biome check --write src` / `biome format --write src`, dropping the `npx --yes @biomejs/biome@2.5.0` on-demand fetch from lint/format. Biome now resolves from `node_modules/.bin`, so lint runs offline and Dependabot can track the version. Verified: `npm run lint` exits 0 (163 pre-existing `useExhaustiveDependencies`/`noAssignInExpressions` warnings, 0 errors).

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

### [2026-07-02] `docs/phases/PHASE-INDEX.md` — broken links for completed PHASE-01/02, a mislabeled PHASE-10 link, and provenance narrative crowding out the index

> **Resolved 2026-07-03 (scholar-debt-batch, approved backlog batch):** (1) Re-pointed PHASE-INDEX rows **01** and **02** at `./completed/PHASE-0X-...md` (both files are in `completed/`, the old `./PHASE-0X` links 404'd) and fixed row **10**'s label to show the `completed/` prefix like its siblings. (2) Moved the per-run `> **Source (NN)**` provenance blockquotes out to a new sibling **`PHASE-PROVENANCE.md`**, leaving PHASE-INDEX a lean dependency-manifest table + a pointer. (3) Added a rule to `docs/phases/INSTRUCTIONS.md` (and the index pointer) directing provenance prose to PHASE-PROVENANCE and telling the phase-maker to check the index for an existing plan from the same QA report first.

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

> **Resolved 2026-07-03 (scholar-debt-batch, approved backlog batch):** Repurposed `CHANGELOG.md` as a **pointer doc** (option a) rather than fabricating history: a header now explains dungeon-scholar has no release/tag cadence (continuous Pages deploy, `package.json` stays 0.1.0) so the Keep-a-Changelog format never fit, and names the living changelog — completed phase plans (`docs/phases/completed/`), `RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`, and the git history — mirroring how dnd-app treats its Releases page. The stale "cut a versioned section when a release is tagged" promise is removed; the original seed (`[0.1.0]` + the aspirational `[Unreleased]` list) is preserved verbatim below a clearly-marked **frozen archive** divider. No fabricated entries.

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

> **Resolved 2026-07-03 (scholar-debt-batch, approved backlog batch):** Added the missing entries to the `README.md` project-structure diagram: a `components/dungeon/` line (canvas crawler subsystem — DungeonExplore render loop, tileRenderer, dungeonLogic, input/state hooks, map data), a `services/locales/` line (en/es i18n bundles), a `utils/` line (cross-cutting helpers), and an `sw.js` line (service worker / injectManifest PWA offline cache) next to `main.jsx`.

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

> **Resolved 2026-07-03 (scholar-debt-batch, approved backlog batch):** Documented the exclusion as an intentional decision (option a): added JSONC comments in `tsconfig.json` above the `exclude` block explaining that `**/*.test.js(x)` are kept out of the `checkJs` typecheck to keep `tsc --noEmit` fast/green (Vitest is the tests' gate), and `src/sw.js` is excluded because it runs in a WebWorker global scope the config's DOM lib does not model. Verified `npm run typecheck` still exits 0 with the comments (tsconfig is JSONC; tsc accepts them).

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

> **Resolved 2026-07-03 (scholar-debt-batch, approved backlog batch):** Relocated all codebase-wide guard tests into one **`src/__guards__/`** home with descriptive, what-they-enforce names (PHASE-NN kept in code comments): `theme.test.js` → `lightThemeColorRamp.guard.test.js`, `phase10-contrast.test.js` → `lightThemeAccentDangerContrast.guard.test.js`, `components/lucide-a11y.test.jsx` → `lucideIconA11y.guard.test.jsx`, `features/phase11Guards.test.js` → `studyModeHeadingsQuestVerb.guard.test.js`, `features/phase12Guards.test.js` → `activeTomePanelInk.guard.test.js`. Fixed the two that read files relative to their own location (`here` → `srcRoot = join(dirname(...), '..')`); the cwd-relative ones needed no path change. Added `src/__guards__/README.md` listing every active guard + the convention. All 5 guards pass under Vitest (44 tests) from the new location.

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

> **Resolved 2026-07-03 (scholar-debt-batch, approved backlog batch):** `git mv src/components/dungeon/DungeonExplore.test.js src/game/dungeonMap.test.js` (the suite only imports `dungeonMap.js` + `difficulty.js`, never the component) and fixed the now-shorter relative imports (`../../game/…` → `./…`). `DungeonExplore.smoke.test.jsx` stays put (it genuinely renders the component). 43 tests pass at the new path. This also subsumes the `.test.js`-testing-a-`.jsx` half of the test-extension entry — the suite now tests a `.js` module as a `.test.js`.

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

> **Resolved 2026-07-03 (scholar-debt-batch, approved backlog batch):** Added all 8 missing modules to the `src/services/README.md` concern-taxonomy table: `deckImport.js` + `libraryBulk.js` (with `importLimits.js`) form a new **import / library** group; `leech.js`, `occlusion.js`, `certificate.js`, `accuracyPalette.js` join the **exam / SRS engine** group; `pwaUpdate.js` + `shortcuts.js` join **platform / UI infra**. Verified all 32 non-test service modules now appear in the table exactly once.

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

> **Resolved 2026-07-03 (scholar-debt-batch, approved backlog batch):** Chose option (b) — **deleted** the two dead files (`git rm src/utils/time.js src/utils/shuffle.js`) after re-verifying zero importers anywhere in `src/` (grep for `utils/time`, `utils/shuffle`, `formatSec`, `formatMs`, `import { shuffle }` all empty; no test files). Deleting dead code cannot regress runtime behavior — nothing referenced them. Wiring them into the inlined m/s formatters / bespoke shuffles was declined: the call-site formatters differ subtly (some `Math.ceil`, inline-JSX `Xm`), the shuffle file's own header documents that the seeded variants **intentionally** keep their own algorithms, and those sites lack the behavioral coverage to verify a blind swap under the OOM constraint — so consolidation carried real regression risk for no live benefit, while deletion removes the misleading orphan cleanly.

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

> **Resolved 2026-07-03 (scholar-debt-batch, approved backlog batch):** Added orientation `README.md` files to the three most-populous undocumented dirs: `src/features/` (the feature-folder convention + a table of what each folder owns), `src/game/` (the game data/rules-engine module table, and how it differs from `services/`), and `src/prompts/` (the per-vendor `*_PROMPT` / `*_PROMPT_META` pattern, the `_shared.js` blocks, and how `index.js` aggregates `ORG_PROMPTS`). Each carries a placement rule for new files.

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

> **Resolved 2026-07-03 (scholar-debt-batch, approved backlog batch):** Adopted and documented one rule in `src/components/README.md`: a co-located test takes the extension of the module it asserts against — `*.test.js` for a `.js` module, `*.test.jsx` when it renders React / targets a `.jsx` component — so no single component carries both. The concrete offender is already fixed by the dungeonMap-test-move entry (the misfiled `.test.js` now lives at `game/dungeonMap.test.js` testing a `.js` module). Codebase-wide guards are noted as the `src/__guards__/*.guard.test.js` exception.

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

---

### [2026-06-29] CI has no test-coverage floor and no bundle-size budget, despite "keep the initial bundle small" being a stated design value

> **Resolved 2026-07-03 (scholar-debt-batch, approved backlog batch):** Added both budgets to `dungeon-scholar-ci.yml` as **advisory** (`continue-on-error: true`) steps after the build, matching the repo's incremental-tightening posture. (1) **Bundle-size budget**: a dependency-free `scripts/check-bundle-budget.mjs` that checks the largest initial JS chunk in `dist/assets` against a committed 600 KB budget (measured largest today = `index-*.js` @ 425 KB, well under) — `--strict`/`BUNDLE_BUDGET_STRICT=1` flips it to gating later. (2) **Coverage floor**: added `@vitest/coverage-v8@^4.1.9` (lockfile-pinned) + a `test:coverage` script and a v8 `coverage.thresholds` block in `vite.config.js` set just below the current actuals (lines 45 / stmts 45 / funcs 35 / branches 30 vs measured 51.7/49.8/38.3/32.7) so the floor passes today and is meant to ratchet up. Both verified green locally through the `run-check.sh` gate; full suite 848 tests + build stay green.

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


### [2026-07-02] Cloud-sync sign-in reconciliation trusts client clocks — cross-device skew can silently drop the newer save without the MergeChooser
> **Resolved 2026-07-02 (scholar-resolver, auto-approved bug fix):** Sign-in reconciliation (`usePlayerState.js`) now decides "has the cloud changed since my last sync?" by comparing `cloud.updated_at` against the recorded `lastSyncedAt` for **identity** (string equality, with epoch-equality accepted only for serialization drift of the same instant) instead of wall-clock **ordering** — every `lastSyncedAt` the hook records is a stamp that was actually stored on the cloud row, so "same stamp" means nobody pushed since, regardless of device clock skew. A skewed-but-different stamp now routes to apply-cloud (clean) or the MergeChooser (dirty + divergent content) instead of a silent overwrite. `pushSave` (`cloudSync.js`) now reads back the stored `updated_at` via `.select()` — server-authoritative once the new `touch_saves_updated_at` before-insert/update trigger (added to `docs/supabase-setup.md`, with a run-once migration note for existing projects) is installed; without the trigger it echoes the client stamp, i.e. today's behavior, so the client change is backward-compatible. Regression tests added: dirty + older-but-different cloud stamp → chooser (the exact silent-loss scenario), clean + older-but-different → applies cloud, same-instant format drift (`...Z` vs `+00:00`) → still "unchanged" (dirty pushes, no false chooser), plus pushSave server-stamp read-back/fallback tests. Lint 0 errors, tsc green, cloudSync + usePlayerState suites 46/46, full vitest suite green. The optional optimistic-concurrency upsert (compare-and-swap via RPC) was deliberately NOT taken: identity comparison + server stamps close the described loss window without a schema/API change; it can ride a future entry if the remaining sub-second race (two devices pushing near-simultaneously while both offline-signed-out) ever matters. Code on `auto/scholar-resolver`.

- **Category:** bug
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (manual review of the cloud-sync reconciliation path)

**Description:**
`pushSave` (`src/services/cloudSync.js`) stamps `updated_at` from the pushing device’s clock (`new Date().toISOString()`), and the sign-in reconciliation in `src/hooks/usePlayerState.js` (~line 378) decides “has the cloud changed since my last sync?” by comparing that cross-device timestamp against the locally recorded `lastSyncedAt`: `cloudTime <= lastSyncTime` ⇒ “cloud unchanged.” Both sides of that comparison come from *different devices’ wall clocks*. If device B (clock behind) pushes newer work after device A’s last sync, A can compute `cloudTime <= lastSyncTime` and misclassify B’s newer save as “nothing new”:

- A dirty → A pushes its local state over B’s newer cloud save with **no MergeChooser** (silent lost update);
- A clean → A keeps playing on stale local state and its next dirty push overwrites B’s work.

`pushSave` is an unconditional upsert with no optimistic-concurrency guard (no `WHERE updated_at = <expected>` / no DB-side `now()`), so nothing server-side catches the lost update either. Mitigations that keep this medium rather than high: the Realtime subscription applies B’s push live when A is online at that moment; `semanticHashState` suppresses false chooser prompts only when contents match (it does not rescue divergent content); and the loss window is bounded by the clock skew relative to the gap between syncs. But devices with minutes of skew (common on machines without NTP, VMs, phones with manual time) syncing in close succession can silently lose the smaller session’s work.

**Reproduction (if bug):**
1. Device A signs in, plays, syncs (A’s `lastSyncedAt` = A-clock T0).
2. Device B (clock set a few minutes behind A) plays offline-from-A’s-perspective (A not running), pushes at real time > T0 but B-clock stamp < T0.
3. Device A opens the app with local dirty changes and signs in / resumes session.
4. Observed: A pushes over B’s save without showing the MergeChooser; B’s session is gone on next pull.

**Expected behavior (if bug):** Newer cloud content is never silently discarded/overwritten due to clock disagreement — either timestamps are server-authoritative, or content divergence (not wall-clock ordering) drives the chooser.

**Hypothesis / root cause:** last-write-wins reconciliation keyed on client-generated `updated_at`; no server-side timestamping or compare-and-swap on the `saves` row.

**Proposed fix / improvement:**
- [ ] Make `updated_at` server-authoritative: DB default/trigger `now()` on the `saves` table (drop the client-supplied value), and have `pushSave` `.select(updated_at)` the stored value back — the existing “record exactly what’s in the cloud” return contract already anticipates this.
- [ ] Optionally add optimistic concurrency: include the last-seen `updated_at` in the upsert (`WHERE updated_at = expected` via RPC) and route a mismatch to the MergeChooser instead of overwriting.
- [ ] Fall back to the existing `semanticHashState` divergence check (not timestamp ordering) when deciding the “cloud unchanged” fast path.

**Blocked by:** none

**Related files:** `dungeon-scholar/src/services/cloudSync.js` (pushSave), `dungeon-scholar/src/hooks/usePlayerState.js` (sign-in reconciliation ~lines 330–410), `dungeon-scholar/docs/supabase-setup.md` (saves table DDL)

**Related entries:** none (grep: no prior skew/LWW entry in the dungeon-scholar logs)


### [2026-07-02] Entry chunk grew to 638 kB — exceeds the 500 kB warning the manualChunks split was added to stay under
> **Resolved 2026-07-02 (scholar-bug-resolver, re-measure per the entry's own 2026-07-02-evening note):** Second clean build agrees the budget is met — fresh worktree off origin/master (e1972fe0), `npm ci` + `vite build` (vite 8.1.0, launched via the `run-check.sh` admission gate): **no** "larger than 500 kB" warning; entry chunk `index-CGtb9UCo.js` **435.46 kB** (130.20 kB gzip), with katex (257.77 kB), vendor-react (182.16 kB) and vendor-icons (24.67 kB) split out as designed. Matches the 2026-07-02 evening scan (434.89 kB), so closing per the entry's instruction ("close it if a second clean build agrees"). The morning 638 kB figure could not be reproduced from any clean tree — most plausibly a stale/dirty build tree or a pre-manualChunks artifact measured during the morning scan. No code change needed; the vite.config.js manualChunks comment is currently accurate. The companion CI bundle-size-budget suggestion (SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md 2026-06-29) stays open as the durable guard against real drift.

> **2026-07-02 evening (scholar-errors):** does NOT reproduce on current `master` (`4c7bcd82`, no dungeon-scholar code change since the morning scan): fresh `npm ci` + `vite build` (vite 8.1.0) emits **no** “larger than 500 kB” warning and the entry chunk is **`index-CW6viw_r.js` 434.89 kB (129.99 kB gzip)** — under the budget, with katex (257.77 kB) / vendor-react (182.16 kB) / vendor-icons split out as designed. The morning measurement (638 kB) could not be reconstructed from this tree; treat this entry as unconfirmed — re-measure before spending effort on it, and close it if a second clean build agrees. The companion bundle-size-budget suggestion remains the durable fix for silent drift either way.

- **Category:** performance
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (production build)

**Description:**
A fresh production build emits Vite's "Some chunks are larger than 500 kB after minification" warning: `dist/assets/index-*.js` is **638.36 kB** (181.97 kB gzip). The `manualChunks` splitter in `vite.config.js` carries a comment saying it exists "so the initial bundle drops below the 500 KB warning" — that claim has drifted: react (182 kB) and lucide vendors are split out and katex (258 kB) auto-splits via lazy import, but the remaining entry chunk (App shell + eagerly-imported services/game modules) has outgrown the budget as phases 03–11 landed. Screens are `React.lazy`-loaded, so the growth is concentrated in what App.jsx and the service/game layer import eagerly.

**Hypothesis / root cause:** steady feature growth in eagerly-imported `src/services/` + `src/game/` modules (all imported by the App shell) with no bundle-size gate to flag the crossing; the vite.config comment was true when written, is stale now.

**Proposed fix / improvement:**
- [ ] Audit the entry-chunk composition (`vite build` with a visualizer or `--debug`) and move heavy, screen-specific eager imports behind the existing lazy-screen boundaries (or add `manualChunks` entries for large stable vendor/game-content modules).
- [ ] Update or remove the stale "drops below the 500 KB warning" comment.
- [ ] Longer-term: the already-logged CI bundle-size budget suggestion would have caught this crossing automatically.

**Blocked by:** none

**Related files:** `dungeon-scholar/vite.config.js` (build.rollupOptions.output.manualChunks), `dungeon-scholar/src/App.jsx`

**Related entries:** SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md [2026-06-29] "CI has no test-coverage floor and no bundle-size budget, despite 'keep the initial bundle small' being a stated design value"



### [2026-07-02] SW precache glob omits KaTeX font files — math typography degrades offline
> **Resolved 2026-07-02 (scholar-resolver, auto-approved bug fix):** Added `woff2` to `injectManifest.globPatterns` in `dungeon-scholar/vite.config.js` (with a comment on the KaTeX offline-font rationale; woff2-only keeps the precache delta ~350 KB — browsers pick the first woff2 source in KaTeX's `@font-face` stacks). Verified on a fresh build: 19 woff2 entries in `dist/sw.js` (was 0), precache 63 entries / 1.55 MB, build green. Code on branch `auto/scholar-resolver`.

- **Category:** bug, config
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (production build + dist/sw.js inspection)

**Description:**
`vite.config.js` sets `injectManifest.globPatterns: ["**/*.{js,css,html,svg,png,ico}"]`, which excludes the `.woff2`/`.woff`/`.ttf` files KaTeX emits into `dist/assets/` (~60 font files; `grep -c woff2 dist/sw.js` = 0 on a fresh build). The CSS that references them IS precached (`css` is in the glob), and the CSP (`font-src 'self' data:`) plus its comment ("KaTeX fonts are bundled same-origin") assume same-origin fonts. Offline, the precached KaTeX CSS requests font URLs that are not in any cache and there is no runtimeCaching (deliberately none for cross-origin — but these are same-origin), so `@font-face` fetches fail and math renders in fallback serif fonts: legible, but with degraded/misaligned glyphs and spacing — undercutting the PWA's "playable offline" rich-content story for math-heavy tomes. Intermittently masked when the browser HTTP cache still holds fonts from an online session.

**Reproduction (if bug):**
1. `npm run build`; serve `dist/`; load the app once online WITHOUT opening a math tome (fonts are lazy — only fetched when KaTeX renders).
2. Go offline (DevTools → Network → Offline).
3. Open a tome question containing LaTeX → math renders in fallback serif; font requests fail in the Network tab.

**Expected behavior (if bug):** KaTeX math renders identically offline and online.

**Hypothesis / root cause:** the precache glob predates (or overlooked) KaTeX's Vite-emitted font assets; nothing else in the pipeline caches same-origin fonts.

**Proposed fix / improvement:**
- [ ] Add `woff2` to `injectManifest.globPatterns` (modern browsers pick the first `woff2` source in KaTeX's `@font-face` stacks; precaching only woff2 adds ~350 KB rather than all three formats' ~1 MB+).
- [ ] Verify with `grep -c woff2 dist/sw.js` > 0 and an offline math render; consider asserting font entries in a small build-output test alongside `generate-pwa-icons.test.mjs`.

**Blocked by:** none

**Related files:** `dungeon-scholar/vite.config.js` (injectManifest.globPatterns, CSP font-src), `dungeon-scholar/src/sw.js`, `dungeon-scholar/src/services/richContent.js`

**Related entries:** SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md [2026-06-29] "CI has no test-coverage floor and no bundle-size budget" (a build-output assertion would also catch this class of drift)


### [2026-06-30] Light-theme muted accent-label wash-out persists on non-enumerated screens (same family as PHASE-10 F1)
> **Resolved 2026-07-02 (scholar-resolver, auto-approved bug fix):** Converted the 31 `text-amber-700[/NN]` secondary labels across AscensionScreen / RunHistoryScreen / SpellbookScreen / CalendarScreen / StableScreen / CraftingScreen, plus App.jsx's home-hero subtitle (⚜ A SCHOLAR'S QUEST ⚜) and the four home-card corner glyphs, to the PHASE-10 `.text-accent-muted[-NN]` utilities (dark theme byte-identical via the token). The Bestiary boss lore-tier inline-hex line gets a light-theme darken via a new `.biome-accent-text` override (the `.biome-heading` pattern). Also converted OcclusionCard's hint label (same family, touched for a security fix in the same run). Static guards appended to `phase10-contrast.test.js`: each converted screen uses the utility and carries no raw `text-amber-700`. Lint + targeted suites green (69 tests). Code on `auto/scholar-resolver`.

- **Category:** bug
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-phase-executer
- **During:** PHASE-10 implementation (out-of-scope same-family finding, logged per INSTRUCTIONS rule 12)

**Description:**
PHASE-10 F1 introduced the `--text-accent-muted` token + `.text-accent-muted[-NN]` utilities and converted the app-wide player-stats header (App.jsx) plus the Inventory / Shop / Bestiary screens that QA run-4 enumerated. The identical Phase-41 ramp-inversion wash-out (`text-amber-700` muted labels brightening to ~1.4:1 on light parchment) still affects screens run-4 did **not** flag, so they were left in scope-discipline and logged here instead:

- `src/features/progression/AscensionScreen.jsx`, `RunHistoryScreen.jsx`, `SpellbookScreen.jsx`, `CalendarScreen.jsx`, `StableScreen.jsx`, `CraftingScreen.jsx` — `text-amber-700` / `text-amber-700/NN` secondary labels.
- `src/App.jsx` home-hero subtitle `⚜ A SCHOLAR'S QUEST ⚜` (:1515) and the four home-card corner `⚜` glyphs (:1726-1729) — outside PHASE-10's enumerated player-stats-header band.
- `src/features/progression/BestiaryScreen.jsx` (~:149) boss lore-tier hint — inline `style={{ color: meta.accent }}` body text (same non-inverting-inline-hex family as the biome `<h3>` PHASE-10 fixed, but a non-heading element).

**Root cause:** same as PHASE-10 F1 — `text-amber-700` / inline per-biome hex accents authored for the dark theme brighten (not darken) under the Phase-41 light-theme ramp inversion.

**Proposed fix:** a follow-up round converts the above `text-amber-700[/NN]` labels to `.text-accent-muted[-NN]`, and gives the inline-hex boss-lore line a light-theme darken (e.g. the `.biome-heading` light-override pattern). Infrastructure already exists from PHASE-10; this is a mechanical extension. Dark theme is byte-identical via the token.


### [2026-06-29] Source comments point to a non-existent `.github/workflows/deploy.yml` (workflow is `dungeon-scholar-deploy.yml`)
> **Resolved 2026-07-02 (scholar-resolver, auto-approved fix):** Replaced the three drifted `deploy.yml` references with the real workflow name `dungeon-scholar-deploy.yml`: `vite.config.js` header comment, `services/supabase.js` base-mismatch warning string (the user-visible one, fixed per the entry's priority note), and `utils/lazyWithReload.js` header comment. Code on `auto/scholar-resolver`.

- **Category:** docs, config
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error/problem scan of the dungeon-scholar tree

**Description:**
Three dungeon-scholar source files document the GitHub-Pages deploy by referring to a workflow file named `deploy.yml`, but no such workflow exists. The actual Pages deploy workflow is `.github/workflows/dungeon-scholar-deploy.yml` (confirmed: the only deploy workflows present are `dungeon-scholar-deploy.yml`, `bmo-deploy.yml`, `dnd-web-deploy.yml`, `oracle-worker-deploy.yml` — there is no bare `deploy.yml`). A reader who follows the comment and greps `.github/workflows/deploy.yml` finds nothing. The README, `docs/`, and `docs/phases/INSTRUCTIONS.md` already use the correct `dungeon-scholar-deploy.yml` name, so only these in-code comments are drifted.

Offending references:
- `dungeon-scholar/vite.config.js:10` — `// .github/workflows/deploy.yml. Forks should either rename their repo to`
- `dungeon-scholar/src/services/supabase.js:74` — `'Fix: set VITE_BASE (deploy.yml / .env.local) or vite.config.js base to "/<repo-name>/", ' +` (this string is shown to users in the base-mismatch console warning, so the wrong filename is user-visible, not just an internal comment)
- `dungeon-scholar/src/utils/lazyWithReload.js:4` — `// content-hashed chunk. When deploy.yml republishes mid-session the already`

**Expected behavior:** Comments / the user-facing warning name the real workflow file (`dungeon-scholar-deploy.yml`), or refer to it generically ("the Pages deploy workflow") so they cannot drift again on rename.

**Hypothesis / root cause:** The Pages workflow was renamed from a generic `deploy.yml` to the domain-scoped `dungeon-scholar-deploy.yml` (the monorepo hosts several deploy workflows); the docs/README were updated but these three inline references were missed. Not speculative — verified by `ls .github/workflows/` (no `deploy.yml`) against the three grep hits above.

**Proposed fix / improvement:**
- [ ] Replace `deploy.yml` with `dungeon-scholar-deploy.yml` in the three locations above (or use a rename-proof generic phrasing).
- [ ] Prefer fixing the `supabase.js:74` warning string first — it is the only one that surfaces to an end user troubleshooting a broken OAuth redirect.

**Related files:** `dungeon-scholar/vite.config.js`, `dungeon-scholar/src/services/supabase.js`, `dungeon-scholar/src/utils/lazyWithReload.js`, `.github/workflows/dungeon-scholar-deploy.yml`



### [2026-06-29] Forgetting-curve forecast still uses the pre-FSRS-5 retrievability formula — diverges from the actual scheduler (up to ~11pp)
> **Resolved 2026-06-29 (scholar-resolver):** Fixed. `src/services/forgettingCurve.js` `retrievabilityAt` now uses the FSRS-5 power-law `R = (1 + FACTOR * elapsed/stability)^DECAY`, importing `DECAY`/`FACTOR` from `srs.js` (single source of truth) instead of the legacy `1/(1 + elapsed/(9*stability))`. The Domain Codex forecast/milestones now match the scheduler at every horizon (previously diverged up to ~11pp by 20x stability). Stale "same formula as the scheduler" header comment rewritten. `forgettingCurve.test.js`: corrected the two legacy-value comments, tightened the 4x-stability assertion to the FSRS-5 value (~0.718), and added a long-horizon lock asserting ~0.547 at 10x / ~0.419 at 20x stability (the values that distinguish the power-law from the legacy curve). dungeon-scholar lint clean, full suite 793 tests green, `VITE_BASE=/home-lab/` build green. Code on branch `auto/scholar-resolver`.



- **Category:** bug
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan of the dungeon-scholar SRS services

**Description:**
`src/services/forgettingCurve.js` (powering the Domain Codex retention forecast — `computeRetentionCurve` / `computeMilestones`, consumed by `src/features/study/DomainStudyScreen.jsx`) computes retrievability with the **legacy** formula `R = (1 + elapsed_days / (9 * stability)) ** -1`. Its header comment asserts this is "the same retrievability formula as the SRS scheduler". That is no longer true: the 2026-06-24 FSRS-5 upgrade replaced the scheduler's curve with the canonical **power-law** form `R = (1 + FACTOR * elapsed_days / stability) ** DECAY` (`DECAY = -0.5`, `FACTOR = 0.9 ** (1 / DECAY) - 1 = 19/81 ~= 0.2346`) in `src/services/srs.js` (`retrievability`). The two curves are calibrated to agree only at `elapsed = stability` (both = 0.90) and then diverge as the horizon grows.

Numeric divergence (elapsed measured in units of stability S):

| elapsed | srs.js (FSRS-5) | forgettingCurve.js (legacy) | diff |
|---|---|---|---|
| 1S | 0.900 | 0.900 | 0.000 |
| 2S | 0.825 | 0.818 | +0.007 |
| 5S | 0.678 | 0.643 | +0.036 |
| 10S | 0.547 | 0.474 | +0.073 |
| 20S | 0.419 | 0.310 | +0.109 |

So the Domain Codex "what will my retention look like in N days if I skip reviews" forecast (and the 0/1/7/30-day milestones) systematically **under-predicts** retention versus the scheduler that actually sets due dates — the gap reaches ~11 percentage points at long horizons. Two parts of the same SRS feature now disagree about the forgetting model.

**Reproduction:**
1. Rate a flashcard so it gets FSRS state with, say, `stability = 5` days.
2. Open the Domain Codex retention curve / milestones in `DomainStudyScreen`.
3. Compare the forecast retention at ~50-100 days out against `retrievability()` from `srs.js` for the same card/time.
4. Observed: forgettingCurve's value is several points lower; at 20x stability ~0.31 vs the scheduler's ~0.42.

**Expected behavior:** The forecast curve uses the same FSRS-5 power-law retrievability the scheduler uses, so the Domain Codex projection matches the due-date logic (they agree at every horizon, not just at elapsed = stability).

**Hypothesis / root cause:** The FSRS-5 migration (RESOLVED-ISSUES-DUNGEON-SCHOLAR.md, 2026-06-24, "Upgrade the SRS scheduler to full FSRS-5") updated `srs.js` but not `forgettingCurve.js`; the resolved entry noting "31 srs + 16 forgettingCurve tests pass" masked the gap because `forgettingCurve.test.js` was written against the legacy `1 / (1 + t/(9S))` shape (see its `R = 1 / (1 + 20/45) ~= 0.692` assertion at line ~83 and the `toBeCloseTo(0.9, 1)` calibration check, both of which still pass with the old formula). So the tests lock in the stale model rather than catching the divergence.

**Proposed fix / improvement:**
- [ ] Replace `forgettingCurve.js` `retrievabilityAt` with the FSRS-5 power-law form, importing `DECAY`/`FACTOR` from `srs.js` (already exported) rather than re-deriving — single source of truth for the curve.
- [ ] Update `forgettingCurve.test.js` long-horizon expectations to the power-law values (the `~0.9 at elapsed = stability` calibration check stays valid).
- [ ] Fix the now-false "same retrievability formula as the SRS scheduler" comment, or delete it once the formula is genuinely shared.

**Related files:** `src/services/forgettingCurve.js`, `src/services/srs.js`, `src/services/forgettingCurve.test.js`, `src/features/study/DomainStudyScreen.jsx`

**Related entries:** RESOLVED-ISSUES-DUNGEON-SCHOLAR.md [2026-06-24] "Upgrade the SRS scheduler to full FSRS-5 with per-user parameter optimization"


### [2026-06-28] PromptModal copy tests fire async copy outside `act()` (React warnings)
> **Resolved 2026-06-29 (scholar-resolver):** Fixed. Both PromptModal copy tests now wrap the copy click in `await act(async () => { fireEvent.click(...) })` so the async `onCopy`'s post-await `setCopied(ok)` flushes inside React's act scope — the two `An update to PromptModal inside a test was not wrapped in act(...)` warnings are gone. Tests made `async`; `act` imported from `@testing-library/react`. PromptModal.test.jsx (9 tests) + full suite (749 tests) green. Code on branch `auto/scholar-resolver`.


- **Category:** test
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (full vitest run, 65 files / 694 tests all green)

**Description:**
The two tests under `PromptModal — copy behavior` ("clicking copy with a filled exam-target…" and "clicking copy with empty exam-target…") emit `An update to PromptModal inside a test was not wrapped in act(...)` on stderr. The handler `onCopy` (PromptModal.jsx:271) is `async` — it `await`s `copyToClipboard()` then runs `setCopied(ok)` and `setTimeout(() => setCopied(false), 2000)`. The tests call `fireEvent.click(... copy ...)` synchronously with no `await` and no `act()` wrapper, so the post-await `setCopied` state update lands after the test body returns, outside React's act scope.

**Reproduction (if bug):**
1. `cd dungeon-scholar && node_modules/.bin/vitest run src/components/ui/PromptModal.test.jsx`
2. Observe two `not wrapped in act(...)` warnings on stderr.
3. Tests still PASS (they assert on the clipboard mock, not on the `copied` state).

**Expected behavior (if bug):** No act() warnings; the async state update is awaited/flushed inside the test.

**Hypothesis / root cause:** `onCopy` is async + schedules a 2s `setTimeout`; the tests do not `await`/`act()` the click, so `setCopied(ok)` fires outside act. The dangling 2s timer is also never cleared (no fake timers / cleanup), a minor leak. Two real act violations are masked by the noise.

**Proposed fix / improvement:**
- [ ] Make the copy click `await act(async () => { fireEvent.click(...) })` (or use `userEvent` + `findBy*`).
- [ ] Optionally use fake timers and clear the 2s `setCopied(false)` timeout.

**Related files:** `src/components/ui/PromptModal.test.jsx`, `src/components/ui/PromptModal.jsx`
### [2026-06-29] checkJs typecheck gate added (non-blocking) — 167 pre-existing type errors to burn down

- **Resolved by:** overall-resolver (automated)
- **Date resolved:** 2026-06-29
- **Resolution:** All 167 checkJs errors burned down to 0 across ~20 files (2026-06-29). Highlights: a JSDoc typedef for the DungeonExplore stateRef game-state aggregate (53); explicit optional JSDoc params on shared components/hooks — useDialogA11y (cleared ~22 modal call sites), ModeCard, RichContent, AccountPanel, RecordTile; BufferSource casts for WebCrypto (sealedTome, notesCrypto); tuple casts for Object.entries(...).map (examPrediction, examSession); Date.getTime arithmetic (devotion); CSSProperties annotations (RichContent); plus assorted casts (FileReader result, location.href, webkitAudioContext, MOBS_BY_BIOME record) and a mis-parsed JSDoc comment in usePlayerState. dungeon-scholar `npm run typecheck` is now clean and biome lint stays green, so the gate was flipped to BLOCKING (removed continue-on-error in dungeon-scholar-ci.yml and the leading `-` in the Makefile typecheck line).
- **Branch:** auto/overall-resolver

- **Category:** debt, test
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** overall-resolver
- **During:** adding a type-check gate to the JS projects per user request (cross-cutting SUGGESTIONS-LOG `TypeScript type-checking coverage is uneven`, resolved 2026-06-29).

**Description:**
dungeon-scholar is a JavaScript/JSX app (no `.ts` sources). A new `tsconfig.json` (allowJs + checkJs, non-strict, jsx react-jsx, scoped to `src`, `src/sw.js` excluded) plus a `vite-env.d.ts` and a `typecheck` script (`tsc --noEmit`) were added so `tsc` can check the JS via JSDoc/inference. checkJs currently reports **167 errors**, so the CI gate (`dungeon-scholar-ci.yml`) and the root `Makefile typecheck` entry are **non-blocking** (continue-on-error / leading `-`) until the backlog is burned down. Top error codes: TS2339 (79, property does not exist on inferred type), TS2739/TS2741/TS2322 (~51, object/JSX prop shape mismatches), TS2353 (20, unknown object-literal keys). Worst files: `components/dungeon/DungeonExplore.jsx` (53), `features/home/HomeScreen.jsx` (19), `services/sealedTome.js` (10), `components/RichContent.jsx` (9).

**Proposed fix / improvement:**
- [ ] Burn down the 167 errors incrementally (add JSDoc `@param`/`@type`, prop typedefs, narrow object shapes), worst-offender files first.
- [ ] Once `npm run typecheck` is clean, drop `continue-on-error: true` from `dungeon-scholar-ci.yml` and the leading `-` from the `Makefile` dungeon-scholar typecheck line to make the gate blocking.
- [ ] Consider raising strictness (`noImplicitAny`, then `strict`) once the baseline is green.

**Related files:** `dungeon-scholar/tsconfig.json`, `dungeon-scholar/src/vite-env.d.ts`, `dungeon-scholar/package.json`, `.github/workflows/dungeon-scholar-ci.yml`, `Makefile`

**Related entries:** RESOLVED-ISSUES.md [2026-06-29] "TypeScript type-checking coverage is uneven across the three TS projects".


*(none currently logged)*

### [2026-06-28] DungeonExplore: extract the React-coupled input + state into useDungeonInput / useDungeonState
> **Resolved 2026-06-28 (scholar-resolver):** Done. Added a DungeonExplore mount smoke test plus an 11-case `useDungeonInput` unit test (arrow/WASD movement, held-key debounce, Z/X/C spells, 1/2/3 potions, E interact, Escape, phase/battle/alive gating, unmount cleanup) as the missing safety net, then extracted **`useDungeonInput`** (keydown/keyup handlers + held-key refs + quaff/cast/interact action refs) behavior-preserving — same `[phase, battle, runState, map, onExit]` effect deps, `tryMove` still invoked from the effect closure — and **`useDungeonState`** (the run-state cluster: pos/facing, hp/shields/mana, score/streak/mistakes, battle, runState, banners) as a grouping hook with plain `useState` relocated and initial vitals passed in. Full suite (749 tests) + build green. Commits `9c4afd13`, `d5377b3e`.

- **Category:** debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-resolver
- **During:** resolving the 2026-06-24 DungeonExplore monolith suggestion

**Description:**
The DungeonExplore decomposition was partly landed (see the resolved entry):
`tileRenderer.js` now has a unit test, and the pure movement/grading/question
logic was extracted into `src/components/dungeon/dungeonLogic.js` (fully tested).
What remains is the React-coupled half the original entry named — a
`useDungeonInput` hook (keydown handler + held-key cadence + the
quaffPotion/castSpell/interact action refs) and a `useDungeonState` reducer
(pos/hp/shields/mana/score/streak/…). This was deliberately not done blind:
DungeonExplore has **zero** component-level interaction tests (the existing
43-test `DungeonExplore.test.js` only covers the `dungeonMap.js` game-data
module), so the dungeon-scholar CI (lint + vitest + build) cannot catch a
movement/input regression — a blind extraction would risk silently breaking the
delve with no safety net.

**Proposed fix / improvement:**
- [ ] FIRST add component-interaction tests for DungeonExplore (render + simulate keydown movement, a battle answer, an interact/pickup) so the extraction is verifiable.
- [ ] THEN extract `useDungeonInput` and a `useDungeonState` reducer, behavior-preserving, keeping those new tests green.

**Related files:** `src/components/dungeon/DungeonExplore.jsx`, `src/components/dungeon/dungeonLogic.js`

### [2026-06-28] Branch `auto/scholar-phase-executer` is stale/superseded — won't merge (integrator)
> **Resolved 2026-06-28 (scholar-resolver):** Already retired. The `origin/auto/scholar-phase-executer` branch was deleted from origin earlier on 2026-06-28; its sole purpose (repo-wide biome format + the CI lint gate) is confirmed landed on `master` as `9e454930`, so retiring it lost nothing material (a reformat is reproducible; the lint gate is identical). No code change needed — entry archived.
**Owner:** dungeon-scholar domain / `scholar-phase-executer` (+ `scholar-resolver` to rebase or retire).
**Status:** left intact by the integrator on 2026-06-28; NOT merged.
**Branch:** `origin/auto/scholar-phase-executer` @ `14f8c541` ("chore(ds): repo-wide biome format + CI lint gate; align executer agent-id"), 151 files / +8049 / -3723. Its own CI was green, but it does **not** merge into current `master`.
**Root cause:** the branch's entire purpose — a repo-wide biome format + a CI lint gate — was **independently landed on `master`** as `9e454930` ("chore(dungeon-scholar): clean biome lint tree-wide + gate lint in CI"). Master then advanced 52 commits past the branch's merge-base (`92e08ae0`, 2026-06-24), including feature commits that re-touch the same reformatted files: `0070472f` (image-occlusion flashcard type), `59b0bd73` (library multi-select bulk actions), `eb846863` (approved-log resolutions). The result is 6+ content conflicts that are **format-vs-feature** collisions in: `src/components/RichContent.jsx`, `src/components/dungeon/DungeonExplore.jsx` (+`.test.js`), `src/features/library/LibraryScreen.jsx`, `src/features/player/usePlayerActions.js`, `src/features/study/FlashcardsMode.jsx`.
**Why not fix-forward:** hand-resolving a pure-reformat branch against newer feature edits risks silently reverting the feature work in `0070472f`/`59b0bd73`. The correct resolution is not a manual merge.
**Needed (route to scholar domain):** confirm whether the branch carries anything NOT already on `master` after `9e454930`. If nothing material → **retire the branch** (`git push origin :auto/scholar-phase-executer`). If something remains → reset the worktree onto current `origin/master`, re-run `biome format`/lint there (likely a near no-op now), and re-push a clean branch for the next integrator run.


*(none currently logged)*

### [2026-06-24] App.jsx orchestration shell is a 2100-line God component (~48 hook calls)
> **Resolved 2026-06-28 (scholar-resolver):** Extracted the per-surface open/close + filter cluster into `useAppSurfaces` (unit-tested) and the RLS-exposure probe + OAuth-callback effects into `useRlsProbe` / `useOAuthCallback`; `[screen,setScreen]` hash-router shape and every `setScreen` call site untouched, App mount smoke tests stay green. Commit `a491c8e3`.

- **Category:** debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of dungeon-scholar/

**Description:**
`src/App.jsx` (`DungeonScholarApp`) is ~2100 lines and makes ~48 `useState`/`useEffect`/`useCallback`/`useMemo`/`useRef` calls in one component. A large cluster is per-surface UI open/close state — `pendingConfirm`, `tutorialOpenedSurface`, `shareTomeId`, `editMetadataTomeId`, `editContentTomeId`, `notesTome`, `unsealedTomes` (in-memory sealed-tome decrypt map), `domainFilter`, `reviewMode` — alongside the RLS-exposure probe effect and the OAuth-callback effect. The shell mixes routing, auth, player-state, sealed-tome session lifetime, and modal flags, making the render switch and effect list hard to follow and risky to edit.

**Proposed fix / improvement:**
- [ ] Extract the surface/modal open-close cluster into a dedicated hook (e.g. `useAppSurfaces`) next to the existing `useAppModals`.
- [ ] Move the RLS-exposure probe and OAuth-callback consumption effects into small hooks (`useRlsProbe`, `useOAuthCallback`).
- [ ] Keep the `[screen, setScreen]` hash-router shape untouched (every `setScreen` call site stays valid). Net: App.jsx becomes a thin shell; surface state becomes unit-testable.

**Related files:** `src/App.jsx`, `src/hooks/useAppModals.js`

### [2026-06-24] DungeonExplore.jsx (2844 lines) is the repo's largest module and is monolithic
> **Resolved 2026-06-28 (scholar-resolver):** Partly landed: added a unit test for `tileRenderer.js` (the untested 2nd-largest module) and extracted the pure movement predicates, answer grading, and question selection into `src/components/dungeon/dungeonLogic.js` with full tests — behavior-preserving (existing 43-test suite stays green). The remaining React-coupled `useDungeonInput`/`useDungeonState` split is filed as a fresh SUGGESTIONS follow-up: DungeonExplore has no component-interaction tests, so that half can't be CI-verified until those tests exist. Commit `40dd6ed4`.

- **Category:** debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of dungeon-scholar/

**Description:**
`src/components/dungeon/DungeonExplore.jsx` is 2844 lines — the largest file in the tree — and appears to bundle map state, keyboard/turn input handling, and render orchestration in a single component. Its sibling `src/components/dungeon/tileRenderer.js` is 1576 lines (2nd largest) and has **no** test file, despite being largely pure rendering helpers that are cheap to cover.

**Proposed fix / improvement:**
- [ ] Decompose `DungeonExplore` into focused units — e.g. a `useDungeonInput` hook (key/turn handling), a `useDungeonState` reducer, and a presentational grid component.
- [ ] Add a unit test for `tileRenderer.js` (pure helpers → low-cost coverage of the 2nd-largest module).
- [ ] Behavior-preserving decomposition only, not a redesign.

**Related files:** `src/components/dungeon/DungeonExplore.jsx`, `src/components/dungeon/tileRenderer.js`

**Related entries:** App.jsx God-component entry [2026-06-24]

### [2026-06-24] src/data/ is a single-file directory; starterDecks.js fits the src/game/ taxonomy
> **Resolved 2026-06-28 (scholar-resolver):** Moved `src/data/starterDecks.js` to `src/game/starterDecks.js`, removed the orphan `src/data/`, updated the App.jsx import + README structure block. Commit `674ef948`.

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of dungeon-scholar/

**Description:**
`src/data/` contains exactly one module, `starterDecks.js`. The README's own structure taxonomy describes `src/game/` as "Game data + pure helpers" (titles, quests, items, bestiary, defaultState, …). Starter-deck content is game data, so the lone `src/data/` directory is an orphan namespace that overlaps the role of `src/game/`.

**Proposed fix / improvement:**
- [ ] Move `src/data/starterDecks.js` → `src/game/starterDecks.js`, update imports, and remove the now-empty `src/data/`.
- [ ] OR, if a dedicated content layer is intended to grow, rename to `src/content/` and document it in the README "Project structure" block and `src/components/README.md` placement rules.
- [ ] Update README "Project structure" either way.

**Related files:** `src/data/starterDecks.js`, `README.md`

### [2026-06-24] services/ is a 31-module flat bucket with no placement README (components/ has one)
> **Resolved 2026-06-28 (scholar-resolver):** Already satisfied on `master`: `src/services/README.md` documents the concern-group taxonomy + placement rule, mirroring `components/README.md`. No change needed — archived.

- **Category:** docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of dungeon-scholar/

**Description:**
`src/services/` holds 31 non-test modules spanning unrelated concerns — persistence/cloudSync/backfill, FSRS scheduling (`srs`, `forgettingCurve`, `weakDomain`), exam logic (`examSession`, `examPace`, `examPrediction`), crypto (`notesCrypto`), `oracleGrader`, `certificate`, `devotion`, `pets`, `spells`, `i18n`+`locales`, `tts`, `logger`, etc. `src/components/` ships a `components/README.md` documenting a clear placement rule, but `services/` — the larger, more heterogeneous bucket — has no equivalent, so there is no guidance on where a new service module belongs or how the bucket is organized.

**Proposed fix / improvement:**
- [ ] Add `src/services/README.md` documenting the grouping convention (mirroring the precedent in `src/components/README.md`).
- [ ] OR introduce sub-namespaces (e.g. `services/sync`, `services/study`, `services/exam`, `services/content`) and update the README structure block.
- [ ] Low effort; improves discoverability.

**Related files:** `src/services/`, `src/components/README.md`

### [2026-06-24] Leech detection — auto-flag (and optionally suspend) chronic-lapse cards
> **Resolved 2026-06-28 (scholar-resolver):** Implemented `services/leech.js` (`isLeech`/`listLeeches`/`leechCount` + `LEECH_LAPSE_THRESHOLD`) with unit tests; `srs.isCardDue` now drops suspended cards from the due queue (back-compatible); added a `setCardSuspended` player action and a Leeches panel in the Scholar Ledger with per-card Suspend/Resume + Edit-in-TomeEditor. Commit `e4e0e1a1`.

- **Category:** future-idea
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** automated suggestion scan of the SRS + study-mode code

**Description:**
The FSRS-5 scheduler already records a per-card `lapses` counter (`services/srs.js` — incremented on every `Again`/rating-1 review), but nothing in the app ever *reads* it. A card the learner keeps forgetting just cycles back into the due queue indefinitely, burning review time on material that isn't sticking. Anki's "leech" mechanic is the standard answer: once a card crosses a lapse threshold (commonly 8), flag it as a leech so the learner (or tome author) can rewrite it, break it into smaller cards, add a mnemonic/hint, or temporarily suspend it from the queue. This is a high-leverage, learning-science-backed retention feature whose input data is *already being tracked* — only the consumer is missing.

**Proposed fix / improvement:**
- [ ] Add a pure helper (e.g. `services/leech.js` `isLeech(cardState, threshold=8)` + `listLeeches(cardProgress)`), unit-tested like the other SRS helpers.
- [ ] Surface leeches in Scholar's Ledger and/or the Mistake Vault ("N cards keep slipping away").
- [ ] Offer a per-card action: suspend from the due queue, or jump to edit it in TomeEditor.
- [ ] Make the threshold a constant (consistent with `weakDomain.js` / `examPrediction.js` exporting their tuning constants).

**Related files:** `src/services/srs.js`, `src/features/progression/ScholarsLedger.jsx`, `src/features/study/MistakeVault.jsx`, `src/game/tome.js`

### [2026-06-24] TomeEditor: live rendered preview for Markdown / Mermaid / code / LaTeX content
> **Resolved 2026-06-28 (scholar-resolver):** Added a Preview toggle that renders each rich-text field (front/back/hint, question/explanation/hint) through the same `RichContent` pipeline the study modes use. Commit `f1121659`.

- **Category:** future-idea, UX
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** automated suggestion scan of the in-app tome authoring flow

**Description:**
`features/library/TomeEditor.jsx` is a plain set of `<textarea>` fields — it imports nothing from `components/RichContent.jsx`, so an author writing a question that uses the app's rich-content pipeline (Markdown, Mermaid diagrams, syntax-highlighted code blocks, KaTeX/LaTeX math — all supported at study time via `services/richContent.js` + `RichContent.jsx`) gets zero feedback on how it will render until they save the tome and open it in a study mode. That round-trip makes diagram- and code-heavy authoring painful and error-prone (a malformed Mermaid block or unbalanced `$…$` only shows up after leaving the editor). A side-by-side or toggled live preview that pipes the field's text through the same `RichContent` renderer the study modes use would close the loop and reuse code that already exists.

**Proposed fix / improvement:**
- [ ] Add a "Preview" toggle (or split pane) next to the question/answer textareas that renders the current text via `<RichContent>`.
- [ ] Reuse the existing renderer so preview == study-time rendering exactly (no second markdown path to drift).
- [ ] Optionally show inline parse warnings (bad Mermaid / unterminated code fence) before save.

**Related files:** `src/features/library/TomeEditor.jsx`, `src/components/RichContent.jsx`, `src/services/richContent.js`

### [2026-06-24] Surface per-question item analysis — the declared `questionStats` field is a never-populated stub
> **Resolved 2026-06-28 (scholar-resolver):** Populated `questionStats` in `recordAnswer` (attempts/correct/highConfWrong, keyed by item id) with unit tests, added a Hardest questions panel to the Scholar Ledger (lowest accuracy + dangerous-overconfidence flag), and corrected the over-claim in the resolved FSRS-5 entry. Commit `5a3d8a72`.

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** automated suggestion scan of the tome progress schema

**Description:**
`game/tome.js` declares `questionStats: {}` in the tome-progress schema (line ~66), but a repo-wide grep shows it is **never written or read anywhere else in `src/`** — it is dead scaffolding. (Note: the resolved FSRS-5 entry in RESOLVED-ISSUES-DUNGEON-SCHOLAR.md states the app "already records per-card review outcomes (`questionStats`/`cardProgress`)" — that is only half true; `cardProgress` is recorded, `questionStats` is an empty stub.) Populating it would unlock genuinely useful **item analysis**: per-question attempt counts, accuracy, and average confidence. For the *learner*, a "hardest questions" view (lowest accuracy, or high-confidence-but-wrong = dangerous overconfidence, cross-referencing the existing `confidenceStats`). For the *tome author*, a flag for questions the population reliably misses — often a sign of a bad/ambiguous question or wrong key, not a hard topic. The plumbing point (`recordAnswer`) already exists.

**Proposed fix / improvement:**
- [ ] Decide whether to populate `questionStats` or remove the dead field (if removing, it is an issue-log debt entry instead).
- [ ] If populating: increment attempts/correct/confidence in the answer-recording path; add a small "hardest questions" panel in Scholar's Ledger.
- [ ] Correct the over-claim in the resolved FSRS entry when this is touched.

**Related files:** `src/game/tome.js`, `src/features/player/usePlayerActions.js`, `src/features/study/QuizMode.jsx`, `src/features/progression/ScholarsLedger.jsx`

### [2026-06-24] Optional per-card hint field with progressive reveal
> **Resolved 2026-06-28 (scholar-resolver):** Added an optional `hint` field to flashcard/quiz items (back-compatible) with a collapsed Show-hint reveal in FlashcardsMode/QuizMode and a hint textarea in TomeEditor; documented the content-item shape in `game/tome.js`. Commit `0048709a`.

- **Category:** future-idea, UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** automated suggestion scan of the flashcard/quiz content model

**Description:**
The tome content model has no learner-facing **hint** field (the only "hints" in the codebase are keyboard-hotkey legends in ExamMode/LabMode — unrelated). A common study-app affordance is an optional per-card hint the learner can choose to reveal before flipping/answering: it supports retrieval practice with scaffolding (a nudge beats giving up and revealing the full answer, which short-circuits the memory benefit) and pairs naturally with the leech idea above — a chronically-lapsed card is exactly where an author would add a mnemonic hint. Cost is small: an optional `hint` string on flashcard/quiz items, a "Show hint" affordance in the study modes, and an extra textarea in TomeEditor.

**Proposed fix / improvement:**
- [ ] Add optional `hint` to the flashcard/quiz item shape in `game/tome.js` (back-compatible; absent = no hint button).
- [ ] Render a "Show hint" reveal in FlashcardsMode/QuizMode (collapsed by default; track reveals if desired).
- [ ] Add the field to TomeEditor (ties in with the live-preview idea).

**Related files:** `src/game/tome.js`, `src/features/study/FlashcardsMode.jsx`, `src/features/study/QuizMode.jsx`, `src/features/library/TomeEditor.jsx`

### [2026-06-24] Vite 8 build warns: `inlineDynamicImports` deprecated (PWA service-worker build)
> **Resolved 2026-06-28 (scholar-resolver):** Accepted as a known upstream deprecation — no app-code change is correct. Re-checked npm: `vite-plugin-pwa` latest published is still `1.3.0` (our current pin), so no Vite-8/Rolldown-aware release that swaps the deprecated `inlineDynamicImports` for `codeSplitting: false` exists yet. The warning originates inside the plugin's own service-worker sub-build (`vite-plugin-pwa/dist/...`), not our `vite.config.js`/rollupOptions; confirmed nothing in `src`/`vite.config.js` sets `inlineDynamicImports`. Action: leave app config untouched (do NOT add the option), let Dependabot carry the plugin bump when a Vite-8-aware release lands; the single known line can be log-filtered later if it ever masks a real warning. Non-fatal (build exits 0). Archived per user approval.

- **Category:** config, debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (ran `npx vite build`)

**Description:**
Every `vite build` of dungeon-scholar prints, during the PWA service-worker
sub-build, a Rolldown/Vite 8 deprecation warning:

```
PWA v1.3.0
Building src/sw.js service worker ("es" format)...
 WARN  inlineDynamicImports option is deprecated, please use codeSplitting: false instead.
```

The client build itself is clean (1926 modules, vendor-react / vendor-icons
chunks emitted, built in ~1.8s); the warning is emitted only by the second,
`injectManifest` SW build that bundles `src/sw.js` into a single file. It is
non-fatal today (build exits 0, tests 61 files / 647 pass, `npm audit` clean)
but it is noise on every CI/deploy build log and will become a hard error once
Rolldown removes the deprecated alias.

**Hypothesis / root cause (diagnosed):** not app config — `grep -rn inlineDynamicImports src vite.config.js` finds nothing. The option is set inside the pinned dependency: `node_modules/vite-plugin-pwa/dist/vite-build-BGK4YAIU.js:109` does `inlineDynamicImports: true` to force the SW into one file. Under Vite 8 (Rolldown) that rollup output option is deprecated in favour of `output.codeSplitting: false`. `vite-plugin-pwa@1.3.0` (current pin) predates the rename, so the warning fires on the SW build of every Vite-8 project using it.

**Proposed fix / improvement:**
- [ ] Bump `vite-plugin-pwa` once a release that uses `codeSplitting: false` (Vite-8/Rolldown-aware) is published; re-run `vite build` and confirm the warning is gone.
- [ ] Until then, accept it as a known upstream deprecation (nothing to change in app code — do NOT add `inlineDynamicImports`/`codeSplitting` to `vite.config.js`, as the SW is a separate plugin-owned build, not the app rollupOptions).
- [ ] Optional: if the warning ever masks a real one in CI, filter the single known line rather than silencing all build warnings.

**Related files:** `dungeon-scholar/vite.config.js` (VitePWA injectManifest block), `dungeon-scholar/package.json` (`vite-plugin-pwa` pin), `dungeon-scholar/src/sw.js`

---
### [2026-06-24] Duplicate `engines` key in dungeon-scholar package.json
> **Resolved 2026-06-28 (scholar-resolver):** Already fixed in current `master` — `dungeon-scholar/package.json` now declares a single `"engines": { "node": ">=22" }` block (verified: only one `engines` key present), so the duplicate copy-paste artifact is gone. Landed in commit `eb846863` ("resolve approved log entries … test speed"); the log entry was simply never archived. No further change needed this run; verified against the tree. Archived per user approval.

- **Category:** config
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (manifest inspection)

**Description:**
`dungeon-scholar/package.json` declares the `engines` field twice:

```json
  "engines": {
    "node": ">=22"
  },
  "type": "module",
  "engines": { "node": ">=22" },
```

Both blocks are identical so behavior is unaffected (JSON last-key-wins), but it is
config drift / a copy-paste artifact. It also sits outside `src/`, so `biome check src`
will never catch it. Some strict JSON tooling warns on duplicate keys.

**Hypothesis / root cause:** A second `engines` block was appended (next to `type`) without removing the original.

**Proposed fix / improvement:**
- [ ] Delete one of the two `engines` blocks (keep a single `"engines": { "node": ">=22" }`).

**Related files:** `dungeon-scholar/package.json`

---
### [2026-06-24] usePlayerState cloud-sync tests wait on real-timer backoff (~52s for one file)
> **Resolved 2026-06-28 (scholar-resolver):** Already fixed in current `master` — both slow describe-blocks in `usePlayerState.test.jsx` ("retries on push failure with backoff…" and "(a) recovers from offline…") now call `vi.useFakeTimers()` and step the `[1000, 4000, 16000]` backoff with `vi.advanceTimersByTimeAsync(...)` instead of waiting real wall-clock. Re-ran the file: 30 tests pass in ~5.4s (was ~52s). Landed in commit `eb846863`; the entry was just never archived. No further change needed; verified by timing the file. Archived per user approval.

- **Category:** test, performance
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (ran `npm test`; 59 files / 627 tests all PASS)

**Description:**
The full suite passes but takes ~54s, and `src/hooks/usePlayerState.test.jsx` alone
accounts for ~52s. Two cases dominate: "retries on push failure with backoff and ends
in offline" (~22.5s) and "(a) recovers from offline ... after backoff exhausts" (~24s).
These describe-blocks do NOT call `vi.useFakeTimers()` (unlike the `local-only behavior`
block which does), so they wait through the *real* retry schedule
`RETRY_DELAYS_MS = [1000, 4000, 16000]` (~21s wall-clock) with `waitFor` timeouts of
30000/35000ms. This wall-clock wait is paid on every CI run of the dungeon-scholar test
gate (deploy.yml + dungeon-scholar-ci.yml).

**Hypothesis / root cause:** Real timers + a real backoff schedule in `usePlayerState` retry logic; the retry/offline tests assert end-state after the full backoff window instead of advancing fake timers.

**Proposed fix / improvement:**
- [ ] Use `vi.useFakeTimers()` in the retry/offline describe-blocks and `vi.advanceTimersByTimeAsync(...)` to step through 1s/4s/16s instantly.
- [ ] Or make `RETRY_DELAYS_MS` injectable so tests pass tiny delays.

**Related files:** `dungeon-scholar/src/hooks/usePlayerState.test.jsx`, `dungeon-scholar/src/hooks/usePlayerState.js`

---

### [2026-06-24] `auto/scholar-resolver` won't merge — divergent devotion/auth refactor vs `auto/scholar-phase-executer`
> **Resolved 2026-06-24 (scholar-resolver):** Rebased `auto/scholar-resolver` onto `origin/master` (now carrying `scholar-phase-executer`’s PHASE-02 work). **Master won on the conflicting devotion/Supabase/auth behavior:** kept `autoRefreshToken: false` with the session-gated explicit refresh in `useAuth.js`, and master’s devotion API (`devotionStatus()` 4-state + `evaluateClaim`/`dayDiff`/`computeNextClaim`, incl. the day-1 “Streak broken” fix) with `CalendarScreen.jsx` + `devotion.test.js` aligned to it. Dropped the branch’s contradictory `autoRefreshToken: true` and its `devotionStatus()` removal entirely. Took master’s `main.jsx` PWA reload wiring; kept `QuestBoard.jsx` Coins `aria-label`/`title` a11y attrs. All **non-conflicting scholar-resolver work preserved** (FSRS-5 scheduler, CSV/TSV/Quizlet import, completion certificate, library bulk actions, image-occlusion cards, the approved log-resolution fixes). Re-ran the branch’s tree-wide biome pass (safe fixes + format only, no behavior change) so the branch’s own new CI lint gate stays green against the rebased base. `npm ci` + `VITE_BASE=/home-lab/ npm run build` pass; targeted vitest (devotion/auth/usePlayerActions/backfill/occlusion/a11y — 78 tests) green; `npm run lint` exits 0. Conflicts resolved (6): `supabase.js`, `useAuth.js`, `devotion.test.js`, `CalendarScreen.jsx`, `main.jsx`, `QuestBoard.jsx` (+ `devotion.js`, `useAuth.test.jsx` force-aligned to master). Pushed for the integrator.

- **Category:** integration / merge-conflict (branch left unmerged by integrator)
- **Discovered by:** integrator (daily branch integration run)
- **During:** merging `origin/auto/scholar-resolver` (head `fccc9d17`, 7 ahead / 2 behind) into `master` after `origin/auto/scholar-phase-executer` had already been merged this run.

**Description:**
`auto/scholar-resolver` does NOT merge cleanly into current `master`. 6 content conflicts, all in dungeon-scholar source that `auto/scholar-phase-executer` (already merged into master this run) also refactored:
`src/services/supabase.js`, `src/hooks/useAuth.js`, `src/main.jsx`,
`src/features/progression/CalendarScreen.jsx`, `src/features/quests/QuestBoard.jsx`,
`src/services/devotion.test.js`.

**Root cause (diagnosed):** the two branches refactored the same devotion/auth subsystem in divergent directions, so this is not a mechanical conflict:
- `supabase.js` — **contradictory behavioral change**: master sets `autoRefreshToken: false` with a deliberate PHASE-02 rationale ("refresh driven explicitly in useAuth so a signed-out load never starts GoTrue's refresh retry loop"); `scholar-resolver` sets `autoRefreshToken: true`. Picking either side silently changes auth-refresh behavior.
- `devotion.js` API diverged — master/`CalendarScreen.jsx` + `devotion.test.js` use the new `devotionStatus()` 4-state API; `scholar-resolver` uses the older `gap===1` logic and imports `evaluateClaim / dayDiff / computeNextClaim`. The two test/usage surfaces are incompatible.
- `main.jsx` — master adds PWA `registerControlledReload` + `guardedReloadOnce`; the branch's `main.jsx` predates that machinery.
- `useAuth.js` / `QuestBoard.jsx` — smaller (import-order; master also keeps `aria-label`/`title` on the Coins icon the branch dropped).

The integrator did **not** auto-resolve: the `autoRefreshToken` choice and the devotion.js API direction are product/behavioral decisions this branch's owner must make — resolving blind risks shipping broken auth/streak logic even with green tests. Left intact per Rule 3A (genuine blocker / new decision).

**Proposed fix / what's needed (owner: `scholar-resolver` / dungeon-scholar domain):**
- [ ] Rebase `auto/scholar-resolver` onto current `origin/master` (now contains `scholar-phase-executer`'s devotion `devotionStatus()` API, PWA reload machinery, and the PHASE-02 `autoRefreshToken: false` fix).
- [ ] Decide the intended `autoRefreshToken` behavior — keep master's `false` (PHASE-02) unless intentionally superseding it, and update the rationale comment if changed.
- [ ] Reconcile `devotion.js` to a single API (`devotionStatus()` vs `evaluateClaim/dayDiff`) and align `devotion.test.js` + `CalendarScreen.jsx` to it.
- [ ] Preserve master's `main.jsx` PWA reload wiring and `QuestBoard.jsx` icon a11y attrs.
- [ ] Push; the next integrator run will merge it once it applies cleanly with green CI.

**Related files:** `dungeon-scholar/src/services/supabase.js`, `dungeon-scholar/src/hooks/useAuth.js`, `dungeon-scholar/src/main.jsx`, `dungeon-scholar/src/features/progression/CalendarScreen.jsx`, `dungeon-scholar/src/features/quests/QuestBoard.jsx`, `dungeon-scholar/src/services/devotion.test.js`, `dungeon-scholar/src/services/devotion.js`

---

### [2026-06-24] dungeon-scholar lint never runs in CI; 222 biome errors accumulated
> **Resolved 2026-06-24 (scholar-resolver):** Ran `biome check --write src` to auto-fix the safe classes (organizeImports, unused imports, useOptionalChain, useTemplate, etc.), then hand-fixed the remaining error-level diagnostics: 7 `useIterableCallbackReturn` (forEach callbacks given block bodies), the `useHookAtTopLevel` false positive (renamed `usePotion`->`quaffPotion`, a plain handler not a hook), and a justified `noDangerouslySetInnerHtml` suppression on the trusted KaTeX render. `npm run lint` now exits 0 (errors cleared; `useExhaustiveDependencies` kept as `warn` per the existing biome.json policy, the 'rule-config' option the entry called for). Added a `npm run lint` step to `dungeon-scholar-ci.yml` (right after `npm ci`) so the tree cannot regress. Full vitest suite (667 tests) + production build green.

- **Category:** config, debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (ran `npm run lint`)

**Description:**
`dungeon-scholar/package.json` defines a `lint` script (`biome check src`) but no CI
workflow ever invokes it. `.github/workflows/dungeon-scholar-ci.yml` runs only
`npm ci` -> `npm run test` -> `npm run build`; `deploy.yml` runs test+build; the
security-audit workflow runs only `npm audit`. With no gate, lint errors have piled up:
`npm run lint` currently exits 1 with **222 errors, 236 warnings, 14 infos** across 181
files. Breakdown of the errors includes correctness-class issues, not just style:
useExhaustiveDependencies x91, organizeImports x101 (assist), useOptionalChain x59,
noUnusedImports x44, noUnusedVariables x18, useHookAtTopLevel x3 (see the BattleModal
entry above), useIterableCallbackReturn x7 (mostly false-positive `set.add` arrows),
noAssignInExpressions x3, noGlobalIsFinite x1, etc.

**Expected behavior:** Either lint is enforced in CI (gate stays green by keeping the
tree clean), or the script is acknowledged as advisory. Right now it is silently broken.

**Hypothesis / root cause:** `dungeon-scholar-ci.yml` job has no `npm run lint` step; the
script was added to package.json but never wired into the pipeline, so the error count
drifted upward unnoticed (CI stays green on test+build alone).

**Proposed fix / improvement:**
- [ ] Triage: auto-fix the safe classes first (`npm run lint:fix` handles organizeImports / unused imports / useTemplate / useOptionalChain), then hand-fix the correctness items (useExhaustiveDependencies, useHookAtTopLevel).
- [ ] Add a `npm run lint` step to `dungeon-scholar-ci.yml` once the tree is clean so it cannot regress.
- [ ] Decide policy on `useExhaustiveDependencies` (fix vs. rule-config) before gating, since it is the bulk of the count.

**Related files:** `dungeon-scholar/package.json`, `.github/workflows/dungeon-scholar-ci.yml`

### [2026-06-24] Image-occlusion flashcards for diagram-heavy material
> **Resolved 2026-06-24 (scholar-resolver):** Added an `occlusion` flashcard type (`src/services/occlusion.js`: fractional-coord masks, validation, image-src allowlist, authoring helpers — 9 unit tests). `OcclusionCard` renders masked regions in FlashcardsMode (opaque + '?' unflipped, translucent + answer on flip); occlusion cards ride the existing SRS path unchanged (they carry a card id) and import like any flashcard. A click-to-place `OcclusionAuthor` modal (pick image -> click to drop masks -> label each) inscribes a one-card tome via `addTomeToLibrary`, reachable from a new Home 'Author Occlusion Card' button. Production build green. (Per-region-per-review masking left as a possible refinement; current behavior masks all regions and reveals all on flip.)

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-scan of the dungeon-scholar tree

**Description:**
`src/components/RichContent.jsx` already renders inline images (the `n.type === 'image'` branch) alongside Mermaid diagrams and code blocks, so cards can *show* a network topology, an OSI stack, an AWS architecture, etc. What's missing is the single most effective way to *study* such images: image occlusion — masking one or more labeled regions and asking the learner to recall what's hidden. This is a staple of medical/IT exam prep (Anki's Image Occlusion add-on is one of its most popular). Given that diagram-heavy cert content (subnetting layouts, port maps, trust boundaries) is squarely in this app's wheelhouse, an occlusion card type would be a high-value, on-brand learning enhancement. Honest severity: low — net-new study mode, not a gap in existing function.

**Hypothesis / root cause:** N/A — additive feature.

**Proposed fix / improvement:**
- [ ] Define an `occlusion` card type: image + array of rectangular mask regions (each with the answer text).
- [ ] Author UI to draw/place masks over an uploaded image; render one masked region per review with reveal-on-flip.
- [ ] Route through the existing SRS/quiz scoring so occlusion cards earn progress like any other.

**Related files:** `src/components/RichContent.jsx`, `src/features/study/FlashcardsMode.jsx`, `src/services/richContent.js`

### [2026-06-24] Library bulk / multi-select actions (export, delete, tag many tomes at once)
> **Resolved 2026-06-24 (scholar-resolver):** Added a Select mode to the Library: a per-row checkbox + a bulk action bar (Select-all-shown, Clear, Export, Tag, Banish). Export bundles the selected tomes' data into a downloadable JSON; Tag applies a shared tag to every selected tome; Banish reuses the existing per-tome delete. New pure helpers in `src/services/libraryBulk.js` (`buildTomeBundle`/`bundleFilename`/`applyTagToTomes`/`downloadTextFile`) with 6 unit tests; LibraryScreen tests + production build green.

- **Category:** UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-scan of the dungeon-scholar tree

**Description:**
`LibraryScreen.jsx` now has search and virtualization (per resolved entries), so a large library scales for *finding* one tome. It still has no way to act on *several* tomes at once — every operation (export, delete, edit metadata) is one tome at a time. A user curating a sizeable shelf (the virtualization work was driven by a 120-tome QA scenario) has no "select all matching → export" or "select 5 → delete" affordance. A lightweight multi-select mode (checkbox per row + a bulk action bar: export-as-bundle, delete, add a shared tag/category) would meaningfully cut the click cost of housekeeping. Honest severity: low — pure quality-of-life; everything is already achievable one-by-one.

**Hypothesis / root cause:** N/A — the library was built around single-tome interactions; bulk selection was never added.

**Proposed fix / improvement:**
- [ ] Add a "Select" toggle that shows a checkbox per library row.
- [ ] Surface a bulk-action bar (export selected, delete selected, tag selected) when ≥1 is checked.
- [ ] Reuse the existing export/delete/metadata paths per selected id.

**Related files:** `src/features/library/LibraryScreen.jsx`, `src/features/library/MetadataEditModal.jsx`

### [2026-06-24] Exportable / shareable tome-completion certificate ("diploma")
> **Resolved 2026-06-24 (scholar-resolver):** Added `src/services/certificate.js`: a per-tome mastery milestone (`tomeMasteryPct`/`isTomeMastered` — >=80% of cards reviewed >=2x and past a 1-week stability horizon) + a canvas-rendered illuminated certificate (`renderCertificatePng`) naming the scholar, earned title, tome, date and mastery%, with PNG download + print-to-PDF. New `CertificateModal`; the Scholar's Ledger now shows a Diplomas section listing mastered tomes each with a Certificate button (scholar name from the signed-in profile, title from `getTitle`). 9 unit tests + production build green.

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-scan of the dungeon-scholar tree

**Description:**
The app has a rich progression/identity layer — titles (`game/titles.js`), achievements (`game/achievements.js`), the Scholar's Ledger, the Ascension screen — but all of it stays *inside* the app. There is no artifact a learner can take *out* to mark finishing a tome or hitting mastery. An on-theme, generated "Certificate of Completion / diploma" (canvas → PNG, or print-to-PDF via the browser) when a tome reaches a mastery threshold would give a satisfying capstone and a shareable proof-of-study, leaning into the existing D&D framing (an illuminated scroll naming the scholar, the tome, the date, and the title earned). Honest severity: low — celebratory/motivational, not functional.

**Hypothesis / root cause:** N/A — additive feature.

**Proposed fix / improvement:**
- [ ] Detect a per-tome "mastery" milestone (e.g. all cards past an SRS interval / exam passed).
- [ ] Render a styled certificate (scholar name from profile, tome title, date, earned title) to canvas → downloadable PNG + print stylesheet for PDF.
- [ ] Offer it from the tome screen / achievements modal when the milestone is reached.

**Related files:** `src/game/titles.js`, `src/game/achievements.js`, `src/features/progression/ScholarsLedger.jsx`, `src/features/progression/AscensionScreen.jsx`

### [2026-06-24] Import external study-deck formats (Anki .apkg / Quizlet / CSV) into tomes
> **Resolved 2026-06-24 (scholar-resolver):** Added `src/services/deckImport.js` (quote-aware CSV + TSV/Quizlet tab-export parser, header-row detection, optional 3rd column -> card domain) that builds a tome via `normalizeTomeData` and routes through the existing `addTomeToLibrary` path. New `ImportDeckModal` + a Home-screen 'Import Deck (CSV/Quizlet)' button (modal key `importDeck`). 11 unit tests + production build green. `.apkg` (zipped SQLite, needs a sql.js/WASM reader + bundle-size decision) left as a documented follow-up, matching the entry's own stretch-goal framing.

- **Category:** future-idea
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-scan of the dungeon-scholar tree

**Description:**
Today the only ways to get content into the app are: hand-write/author a tome, paste/file-pick a `TOME-V1:` share code, or import the bundled starter decks (`src/data/starterDecks.js`). All inbound paths assume the app's own JSON schema (`encodeTomeShareCode`/`decodeTomeShareCode` + `normalizeTomeData` in `src/game/tome.js`). The huge existing corpus of study content already lives in Anki `.apkg`, Quizlet exports, and plain CSV/TSV — none of which can be brought in without manual retyping. A small client-side converter (file-pick → parse → map fields to flashcards/quiz, then route through the existing import path) would dramatically lower the content barrier and complement the resolved "bundle more starter tomes" + "in-app authoring" work rather than duplicate it (those create content; this *imports* existing content). CSV is trivial (header→field mapping); Quizlet's tab/newline export is nearly as easy; `.apkg` is a zipped SQLite DB so it needs sql.js or a lightweight reader and is the stretch goal.

**Hypothesis / root cause:** N/A — additive feature, not a defect.

**Proposed fix / improvement:**
- [ ] Add a "Import from CSV/Quizlet" modal alongside `ImportCodeModal`/`PasteTomeModal` with a column→field mapping step.
- [ ] Parse CSV/TSV + Quizlet tab-export into `{flashcards, quiz}` and feed through `normalizeTomeData` → existing import flow.
- [ ] (Stretch) `.apkg` reader via sql.js to extract notes/fields; map basic note types to flashcards.

**Related files:** `src/game/tome.js`, `src/features/library/ImportCodeModal.jsx`, `src/features/library/PasteTomeModal.jsx`, `src/data/starterDecks.js`

**Related entries:** distinct from the resolved "PWA Web Share Target to import a tome JSON" (that is a *transport* for the app's own JSON, not a format converter).

### [2026-06-24] Upgrade the SRS scheduler to full FSRS-5 with per-user parameter optimization
> **Resolved 2026-06-24 (scholar-resolver):** Replaced the simplified `srs.js` model with canonical FSRS-5: the published 19-weight default vector + the full update equations (initial S0/D0, linear-damped difficulty with mean reversion, recall/forget/short-term stability, power-law retrievability with DECAY=-0.5) behind the unchanged `scheduleCard`/`retrievability`/`isCardDue` API and per-card state shape (old saves keep working). Exposed `FSRS_DEFAULT_WEIGHTS` + `getSchedulerWeights`/`setSchedulerWeights` so the stretch-goal per-user optimizer can feed fitted weights without touching the equations (optimizer itself left as a follow-up). `srs.test.js` updated to FSRS-5 behavior; 31 srs + 16 forgettingCurve tests pass.

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-scan of the dungeon-scholar tree

**Description:**
`src/services/srs.js` self-describes as "FSRS-inspired (not literal FSRS-5 with 17+ weights — a simpler model)". That is a reasonable, dependency-free choice, but for long-horizon cert prep the difference is real: full FSRS-5 fits its weight vector to the *individual learner's* review history (via the published optimizer) and consistently beats fixed-parameter heuristics on retention-per-review. Because the app records per-card FSRS review state (`cardProgress`) — and, as of 2026-06-28, per-question item-analysis stats (`questionStats`: attempts/correct/high-confidence-wrong, populated in `recordAnswer`) — it has the training data an optimizer needs. (Correction: the original wording implied `questionStats` was already populated; until 2026-06-28 it was a declared-but-never-written stub, so only `cardProgress` was real review-outcome data at the time this entry was filed.) A future enhancement: ship the canonical FSRS-5 default weights, and optionally run the optimizer client-side over the user's own log to personalize scheduling. Honest severity: low — the current model works and this is an accuracy refinement, not a fix.

**Hypothesis / root cause:** N/A — deliberate simplification documented in `srs.js`.

**Proposed fix / improvement:**
- [ ] Adopt FSRS-5 default weights + the full stability/difficulty update equations behind the existing `srs.js` API.
- [ ] (Stretch) Optional "optimize my schedule" action that fits weights from the user's recorded review history.

**Related files:** `src/services/srs.js`, `src/services/forgettingCurve.js`

### [2026-06-24] Make the Oracle worker's allowed origin (and model) configurable instead of hardcoded — fork portability
> **Resolved 2026-06-24 (scholar-resolver):** `oracle-worker/src/worker.js` now reads `ALLOWED_ORIGIN` (-> `DEFAULT_ALLOWED_ORIGIN` fallback) and `ORACLE_MODEL` (-> `DEFAULT_MODEL` fallback) from `env`, threaded through the CORS headers, the Origin/Referer cross-check, and the Groq call. Documented the two optional `[vars]` in `wrangler.toml` + `docs/oracle-setup.md`. `node --check` green.

- **Category:** portability
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** scheduled improvement-scan of the dungeon-scholar tree

**Description:**
The front end already made its deployment path fork-friendly: `vite.config.js` reads `VITE_BASE` (defaulting to `/dungeon-scholar/`) so a fork doesn't have to edit source. The Oracle proxy did **not** get the same treatment. `oracle-worker/src/worker.js` hardcodes `const ALLOWED_ORIGIN = "https://evilpatrick06.github.io";` (used for both the CORS allow-origin and the Origin/Referer cross-check) and `const MODEL = "llama-3.3-70b-versatile";`. Secrets and the proxy token are already read from `env` (`env.GROQ_API_KEY`, `env.ORACLE_PROXY_TOKEN`), so the pattern exists — origin and model are the lone remaining source-edits a fork must make to stand up its own Oracle. Reading them from `env` (via `wrangler.toml [vars]` / `wrangler secret`) would make the worker deployable to a fork's own Pages origin with zero code changes, matching the front end's portability story.

**Hypothesis / root cause:** Origin/model were inlined as constants when the worker was first written for the canonical deployment; they were simply never promoted to env vars the way the API key and token were.

**Proposed fix / improvement:**
- [ ] Read `ALLOWED_ORIGIN` from `env.ALLOWED_ORIGIN` (fallback to the current default) so CORS + the Origin/Referer checks track the deploying origin.
- [ ] Read `MODEL` from `env.ORACLE_MODEL` (fallback to current) so a fork can pick a different Groq model without editing source.
- [ ] Document the two new `[vars]` in `docs/oracle-setup.md`.

**Related files:** `oracle-worker/src/worker.js`, `oracle-worker/wrangler.toml`, `dungeon-scholar/docs/oracle-setup.md`

### [2026-06-24] Rules-of-hooks violation in BattleModal (hooks after early returns)
> **Resolved 2026-06-24 (scholar-resolver):** Moved BattleModal's `useState`/`useEffect` above the two early returns; the `if (!battle)` / `if (!q)` guards now sit below the hooks and the effect dep uses `battle?.type`, so the hook order is identical on every render. `dungeon-scholar/src/components/dungeon/DungeonExplore.jsx`.

- **Category:** bug
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (biome lint correctness + manual confirmation)

**Description:**
`BattleModal` in `src/components/dungeon/DungeonExplore.jsx` calls hooks *after* two
conditional early returns:

```js
function BattleModal({ ... }) {
  if (!battle) return null;   // early return
  if (!q) return null;        // early return
  const [revealResult, setRevealResult] = useState(null);          // hook AFTER returns
  ...
  useEffect(() => { setRevealResult(null); }, [q?.id, battle.type]); // hook AFTER returns
}
```

This violates the Rules of Hooks (hooks must run unconditionally, in the same order,
every render). When `battle`/`q` toggle between null and non-null across renders the
hook count changes, which React surfaces as "Rendered fewer hooks than expected" and
can crash the component. It works today only because the modal is currently never
mounted while `battle`/`q` are null, but the guard makes that fragility implicit.

**Reproduction (if bug):**
1. Render `BattleModal` once with a non-null `battle` and `q` (hooks run).
2. Re-render with `battle` (or `q`) null so an early return fires before the hooks.
3. React throws a hook-order error / the component crashes.

**Expected behavior:** Hooks declared unconditionally at the top of the component;
the null checks moved below the hook declarations (or the modal not rendered at all by
the parent when `battle`/`q` are null).

**Hypothesis / root cause:** `useState`/`useEffect` placed below `if (!battle) return null; if (!q) return null;` in `BattleModal`. Confirmed by biome `lint/correctness/useHookAtTopLevel` firing at DungeonExplore.jsx:263 and :290. (A third hit at :2262 is a FALSE POSITIVE — `usePotion(i)` is a regular handler named like a hook, not an actual hook.)

**Proposed fix / improvement:**
- [ ] Move the `if (!battle) return null; if (!q) return null;` guards below the `useState`/`useEffect` calls, OR have the parent skip rendering `BattleModal` entirely when `battle`/`q` are null.
- [ ] Keep the effect deps stable.

**Related files:** `dungeon-scholar/src/components/dungeon/DungeonExplore.jsx`

### [2026-06-24] Duplicate `engines` key in dungeon-scholar package.json
> **Resolved 2026-06-24 (scholar-resolver):** Removed the duplicate one-line `engines` block from `package.json`; a single `engines: { node: >=22 }` remains (JSON re-validated).

- **Category:** config
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (manifest inspection)

**Description:**
`dungeon-scholar/package.json` declares the `engines` field twice:

```json
  "engines": {
    "node": ">=22"
  },
  "type": "module",
  "engines": { "node": ">=22" },
```

Both blocks are identical so behavior is unaffected (JSON last-key-wins), but it is
config drift / a copy-paste artifact. It also sits outside `src/`, so `biome check src`
will never catch it. Some strict JSON tooling warns on duplicate keys.

**Hypothesis / root cause:** A second `engines` block was appended (next to `type`) without removing the original.

**Proposed fix / improvement:**
- [ ] Delete one of the two `engines` blocks (keep a single `"engines": { "node": ">=22" }`).

**Related files:** `dungeon-scholar/package.json`

### [2026-06-24] usePlayerState cloud-sync tests wait on real-timer backoff (~52s for one file)
> **Resolved 2026-06-24 (scholar-resolver):** Converted the retries->offline and offline-recovery tests to `vi.useFakeTimers()` + `advanceTimersByTimeAsync`, stepping the 1s/4s/16s backoff instantly. The file now runs ~6s (was ~52s); all 30 tests pass.

- **Category:** test, performance
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (ran `npm test`; 59 files / 627 tests all PASS)

**Description:**
The full suite passes but takes ~54s, and `src/hooks/usePlayerState.test.jsx` alone
accounts for ~52s. Two cases dominate: "retries on push failure with backoff and ends
in offline" (~22.5s) and "(a) recovers from offline ... after backoff exhausts" (~24s).
These describe-blocks do NOT call `vi.useFakeTimers()` (unlike the `local-only behavior`
block which does), so they wait through the *real* retry schedule
`RETRY_DELAYS_MS = [1000, 4000, 16000]` (~21s wall-clock) with `waitFor` timeouts of
30000/35000ms. This wall-clock wait is paid on every CI run of the dungeon-scholar test
gate (deploy.yml + dungeon-scholar-ci.yml).

**Hypothesis / root cause:** Real timers + a real backoff schedule in `usePlayerState` retry logic; the retry/offline tests assert end-state after the full backoff window instead of advancing fake timers.

**Proposed fix / improvement:**
- [ ] Use `vi.useFakeTimers()` in the retry/offline describe-blocks and `vi.advanceTimersByTimeAsync(...)` to step through 1s/4s/16s instantly.
- [ ] Or make `RETRY_DELAYS_MS` injectable so tests pass tiny delays.

**Related files:** `dungeon-scholar/src/hooks/usePlayerState.test.jsx`, `dungeon-scholar/src/hooks/usePlayerState.js`

### [2026-06-23] Local autosave-snapshot ring buffer for crash / accidental-reset recovery
> **Resolved 2026-06-23 (scholar-resolver):** Implemented per the user's per-entry approval (branch `auto/scholar-resolver`). Added a throttled rotating snapshot ring buffer in `persistence.js` (`writeSnapshot`/`listSnapshots`/`restoreSnapshot`/`pruneSnapshots` — last 5 snapshots + ~1.5 MB cap, quota-aware), wired into the debounced local save in `usePlayerState.js`; a "Restore a recent snapshot" affordance in `AccountPanel.jsx`; and a pre-reset snapshot + Undo toast in `App.jsx` so a reset is undoable once (works signed-out). New unit tests in `persistence.snapshots.test.js`. Targeted vitest + production build (VITE_BASE=/home-lab/) green.

- **Category:** future-idea
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** automated improvement scan of the dungeon-scholar tree

**Description:**
Persistence keeps a single live save under `dungeon-scholar:save:v1`. The only recovery path today is the manual "Export journal (backup file)" button in AccountPanel plus optional cloud sync — the README troubleshooting section explicitly states "there's no recovery without sync." A user who clears browsing data, hits a corrupt write, or fat-fingers "Reset progress" loses everything with no local undo. A small rotating ring buffer of the last N good saves (e.g. 3–5 snapshots keyed `dungeon-scholar:save:snap:<ts>`, written on a debounce and pruned to a byte/age cap) would give a local "restore a recent snapshot" option without requiring a cloud account, and would also let "Reset progress" be undoable for one step.

**Proposed fix / improvement:**
- [ ] Add a snapshot writer in `persistence.js` (debounced; prune to last N + a total-bytes cap to respect localStorage quota — reuse `isQuotaExceededError` handling).
- [ ] Surface a "Restore a recent snapshot" affordance in `AccountPanel.jsx` (list timestamps; confirm before overwrite).
- [ ] Capture a pre-reset snapshot in the reset flow so a reset is undoable once.

**Related files:** `src/services/persistence.js`, `src/components/AccountPanel.jsx`, `src/components/ui/ResetConfirmModal.jsx`

### [2026-06-23] PWA Web Share Target to import a tome JSON from the OS share sheet
> **Resolved 2026-06-23 (scholar-resolver):** Implemented per the user's per-entry approval (branch `auto/scholar-resolver`). Added a POST/multipart `share_target` to the PWA manifest and switched vite-plugin-pwa to `injectManifest` with a custom `src/sw.js` that stashes the shared file/text and redirects to `?share-target=1`; `App.jsx` ingests the payload through the existing paste-import path. README documents the Chromium/Android-only caveat. Targeted vitest + production build (VITE_BASE=/home-lab/) green.

- **Category:** future-idea, portability
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** automated improvement scan of the dungeon-scholar tree

**Description:**
Tomes are plain JSON imported today via paste / file-pick / share code (Library modals). The app is already an installable PWA (`vite-plugin-pwa`), but the manifest declares no `share_target`. Adding one would let a user share a `.json` tome (or shared text) from another app / the OS share sheet straight into the installed Dungeon Scholar, which then routes to the existing import path. Pure additive portability win on Android/desktop installs; iOS ignores it harmlessly.

**Proposed fix / improvement:**
- [ ] Add a `share_target` entry to the PWA manifest in `vite.config.js` (method POST, `enctype multipart/form-data`, accept `application/json` + text).
- [ ] Handle the share-target landing route and feed the payload into the existing import-tome flow.
- [ ] Note the platform support caveat (Chromium/Android only) in `README.md`.

**Related files:** `vite.config.js`, `src/features/library/ImportCodeModal.jsx`, `src/features/library/PasteTomeModal.jsx`, `src/App.jsx`

### [2026-06-23] i18n locale-completeness check + in-app language picker to unlock incremental translation
> **Resolved 2026-06-23 (scholar-resolver):** Implemented per the user's per-entry approval (branch `auto/scholar-resolver`). Seeded a Spanish catalog (`locales/es.js`), added `getCatalogKeys` + a key-parity test (`i18n.localeParity.test.js`) that fails on any missing/extra key, and a language `<select>` in `ThemePanel.jsx` bound to `availableLocales()`/`setLocale`, persisted in `playerState.locale`. Targeted vitest + production build (VITE_BASE=/home-lab/) green.

- **Category:** future-idea, portability
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** automated improvement scan of the dungeon-scholar tree

**Description:**
`src/services/i18n.js` is a deliberately minimal `t()` foundation built for incremental string migration, but `CATALOGS` contains only `en` (the sole file in `src/services/locales/`), and there is no UI to call `setLocale` and no guard that a second catalog is key-complete. The scaffolding's value can't be realized until (a) at least one more locale exists and (b) there's a way to pick it. Even before real translations land, two cheap DX steps make the foundation real: a test/CI assertion that every non-`en` catalog has exactly the `en` keys (so partial catalogs fail loudly instead of silently falling back), and a small language selector in the Theme/Home panel wired to `availableLocales()`/`setLocale()`.

**Proposed fix / improvement:**
- [ ] Add a vitest that asserts key-parity between `en` and every other catalog (no missing/extra keys).
- [ ] Add a language `<select>` to `ThemePanel.jsx` (or AccountPanel) bound to `availableLocales()` + `setLocale()`, persisted to the save like the theme choice.
- [ ] Seed one stub non-`en` catalog to exercise the path (even if machine-drafted), gated behind the completeness test.

**Related files:** `src/services/i18n.js`, `src/services/locales/en.js`, `src/features/home/ThemePanel.jsx`


### [2026-06-23] In-app keyboard-shortcut help overlay (the shortcuts exist but are undiscoverable)
> **Resolved 2026-06-23 (scholar-resolver):** Implemented per the user's per-entry approval (branch `auto/scholar-resolver`). Added a shared binding map (`services/shortcuts.js`) and a `ShortcutHelpModal` opened by `?` (plus a header help button), listing the global + per-mode bindings. Targeted vitest + production build (VITE_BASE=/home-lab/) green.

- **Category:** UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** automated improvement scan of the dungeon-scholar tree

**Description:**
Study modes already implement a solid set of keyboard shortcuts — Flashcards has Space/Enter flip parity with Quiz/Lab/Exam, Quiz binds 1/2/3 to confidence and Enter/Space to advance, and the Dungeon delve binds WASD/arrows/E/ZXC/123 (its `role="application"` aria-label even spells these out). But there is no in-app place that lists them: a new user has no way to discover the shortcuts short of reading source. A single global "press ? for keyboard shortcuts" modal listing the per-mode bindings (and the delve controls) would make the existing accessibility/efficiency work discoverable. Low effort, pure additive UX.

**Proposed fix / improvement:**
- [ ] Add a small `ShortcutHelpModal` listing global + per-mode bindings, opened by `?` (and a header icon for pointer users).
- [ ] Source the binding list from one shared map so the modal can't drift from the real handlers.

**Related files:** `src/features/study/QuizMode.jsx`, `src/features/study/FlashcardsMode.jsx`, `src/features/study/ExamMode.jsx`, `src/features/study/LabMode.jsx`, `src/components/DungeonExplore.jsx`, `src/components/ui/` (new modal)

### [2026-06-23] Colorblind-safe / high-contrast palette option for the domain heatmaps and analytics
> **Resolved 2026-06-23 (scholar-resolver):** Implemented per the user's per-entry approval (branch `auto/scholar-resolver`). Added a colorblind-safe palette toggle (`playerState.colorblind`, `data-cvd` on root) and a shared `accuracyPalette.js` helper; the Domain Study + Scholar's Ledger accuracy bars now use a CVD-safe blue-orange ramp paired with a hue-independent tier word. QA checklist updated. Targeted vitest + production build (VITE_BASE=/home-lab/) green.

- **Category:** UX
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-suggestor
- **During:** automated improvement scan of the dungeon-scholar tree

**Description:**
The app ships a full light/dark theme and otherwise strong a11y (off-canvas live announcements for the delve, focus-ring QA, lucide-a11y test), but the per-domain accuracy bars / "weak domain" surfacing in Domain Study and the Scholar's Ledger analytics encode meaning largely through red↔green color. For deuteranopia/protanopia users red-green is the worst-case axis, and no colorblind-safe or high-contrast analytics palette option exists (grep finds none). Offering an alternate palette (or pairing color with a shape/label/pattern so hue isn't the only signal) would make the progress analytics legible to colorblind learners. Worth a QA-checklist line too.

**Proposed fix / improvement:**
- [ ] Add a "colorblind-safe palette" toggle (persisted like the theme) and apply a CVD-safe scale to the domain bars / heatmap.
- [ ] Ensure status is never conveyed by hue alone — add a label or icon to weak/strong indicators.
- [ ] Add a colorblind-palette visual check to `docs/QA-CHECKLIST.md`.

**Related files:** `src/features/study/DomainStudyScreen.jsx`, `src/features/progression/ScholarsLedger.jsx`, `src/services/weakDomain.js`, `src/index.css`

### [2026-06-23] Resolved by scholar-resolver — App.jsx screen router collapsed through the registry (branch auto/scholar-resolver)

> **Resolved 2026-06-23 (scholar-resolver):** Follow-up to the App.jsx God-component resolution, completed on the user's explicit go-ahead. Added an App-level smoke test (`src/App.test.jsx`) that mounts the full app and drives home / library / course-set-gated quiz / ledger by hash as the safety net, then replaced the ~21-branch `{screen === 'x' && (...)}` ladder with a single `screenViews[screen]?.()` dispatch — a screen->renderer map where each thunk returns exactly the prior JSX and preserves its courseSet / sealedLocked guard. The canonical screen list + gating still live in `router/screens.js`. Local vitest (57 files / 620 tests, incl. the new smoke test) + production build (VITE_BASE=/home-lab/) green.

### [2026-06-23] `App.jsx` screen-router: render the ~22 `screen ===` branches through the `router/screens.js` registry

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-resolver
- **During:** resolving the App.jsx God-component entry

**Description:**
The App.jsx God-component entry was resolved in three parts (see `RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`): the tutorial auto-condition `switch` moved to `game/tutorial.js`, the modal-visibility flag cluster moved behind a `useAppModals()` hook, and a screen registry was added at `router/screens.js` (now the single source of truth for the valid-screen list and the course-set / sealed gating sets). What remains is the deepest structural piece: App.jsx still renders the ~22 `{screen === 'x' && (<Screen .../>)}` branches inline. Collapsing that ladder into a registry-driven `<ActiveScreen />` is valuable but was held back from the resolver run because App.jsx has no component-level test (`App.test.jsx` does not exist), so a blind prop-threading rewrite of every screen is not safely verifiable.

**Proposed fix / improvement:**
- [ ] Add a minimal `App.test.jsx` smoke test (mount + switch a few screens + open/close a modal) so the refactor is verifiable.
- [ ] Extend `router/screens.js` to map each screen id to its lazy component + a props selector, then replace the inline `screen === ...` ladder with a single `<ActiveScreen screen={screen} ctx={...} />`.

**Related files:** `src/App.jsx`, `src/router/screens.js`, `src/hooks/useAppModals.js`, `src/game/tutorial.js`

**Related entries:** Resolved — "`src/App.jsx` is a ~1,700-line God-component" (this run's partial resolution; this is the tracked remainder).

---


### [2026-06-23] Resolved by scholar-resolver — App.jsx de-godding + structure & docs wave (branch auto/scholar-resolver)

> Five user-approved dungeon-scholar suggestions implemented this run. Local vitest suite (56 files / 616 tests) + production build (VITE_BASE=/home-lab/) green.

> **Resolved 2026-06-23 (scholar-resolver):** App.jsx de-godded in three parts — tutorial auto-condition `switch` extracted to a pure `tutorialAutoConditionMet()` in `game/tutorial.js` (+unit tests); the ~8 boolean modal-visibility flags collapsed behind a new `useAppModals()` hook (`hooks/useAppModals.js`); and a screen registry added at `router/screens.js` (now the single source of truth for the valid-screen list — `useHashRoute.js` re-exports it — plus the course-set / sealed gating sets, replacing the inline literal arrays in App.jsx). App.jsx dropped 1,702 -> 1,646 lines. The remaining piece (rendering the inline `screen ===` JSX ladder through the registry) is tracked as a new low-severity follow-up in SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md, deferred only because App.jsx has no component test to make a blind prop-threading rewrite safe.

### [2026-06-23] `src/App.jsx` is a ~1,700-line God-component (root screen router + modal state + tutorial dispatch)

- **Category:** debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** dungeon-scholar tree cleanup/structure scan

**Description:**
`src/App.jsx` is 1,702 lines — now the largest source file after the DungeonExplore split (which was extracted into `components/dungeon/tileRenderer.js` + `game/dungeonMap.js`). The single `DungeonScholarApp` component concentrates several unrelated concerns: (1) a ~20-branch screen router (`{screen === 'home' && ...}` ... `'library'`, `'quests'`, `'inventory'`, `'shop'`, `'crafting'`, `'practiceExam'`, `'quiz'`, `'flashcards'`, etc.), (2) ~25 `useState` modal/dialog flags (`showPromptModal`, `showAchievements`, `showTitles`, `showPasteModal`, `showResetConfirm`, `shareTomeId`, `editMetadataTomeId`, `notesTome`, `showImportCodeModal`, `showWelcomeModal`, `showAccountPanel`, ...), (3) the tutorial-event `switch` (`has_tome`/`studied_card`/`solved_quiz`/`lab_step`/`oracle_used`/...), and (4) the daily-rollover quest baseline logic. The PHASE-39 architecture split moved data/helpers into `src/game/` and primitives into `src/components/ui/` but only partially reduced App.jsx (the resolved DungeonExplore God-file entry itself notes "PHASE-39 split App.jsx but did not touch DungeonExplore" — App.jsx remained large and has since grown back to ~1,700).

**Hypothesis / root cause:** App.jsx accreted screen-routing + every top-level modal flag + tutorial wiring incrementally across phases; no router/screen-registry or modal-manager abstraction was introduced, so each new screen/modal added more inline state to the same component.

**Proposed fix / improvement:**
- [ ] Extract the screen router into a small registry (e.g. `src/router/screens.js` mapping `screen` -> lazy component) so `App.jsx` renders `<ActiveScreen />` instead of ~20 inline `screen === ...` blocks.
- [ ] Move the cluster of top-level modal flags behind a single modal-manager hook (e.g. `useAppModals()` in `src/hooks/`) returning `{ open, close, active }`, collapsing ~25 booleans.
- [ ] Lift the tutorial-event `switch` into `src/game/tutorial.js` (or a `useTutorialEvents` hook) and have App.jsx just dispatch.
- [ ] Keep `App.jsx` as top-level layout + composition only.

**Related files:** `src/App.jsx`, `src/router/useHashRoute.js`, `src/hooks/usePlayerState.js`, `src/game/tutorial.js`

**Related entries:** Resolved — "DungeonExplore.jsx is a 4,536-line God-file" (RESOLVED-ISSUES-DUNGEON-SCHOLAR.md) called out App.jsx as the next-largest file; this is its dedicated follow-up.

---

> **Resolved 2026-06-23 (scholar-resolver):** Added `src/services/README.md` documenting the four-group concern taxonomy (cloud/auth/persistence, exam/SRS engine, game systems, platform/UI infra) plus a placement rule, mirroring `components/README.md` — the lighter-touch option offered by the entry.

### [2026-06-23] `src/services/` is a flat 24-file directory mixing four distinct concern groups

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** dungeon-scholar tree cleanup/structure scan

**Description:**
`src/services/` holds 24 non-test modules with no internal grouping, spanning four clearly separable concerns: cloud/auth/persistence (`supabase.js`, `cloudSync.js`, `backfill.js`, `persistence.js`, `sessionResume.js`), the exam/SRS engine (`examPace.js`, `examPrediction.js`, `examSession.js`, `srs.js`, `forgettingCurve.js`, `weakDomain.js`, `oracleGrader.js`), game systems (`pets.js`, `spells.js`, `devotion.js`), and platform/UI infra (`logger.js`, `notifications.js`, `i18n.js`, `tts.js`, `timerAnnounce.js`, `importLimits.js`, `notesCrypto.js`, `richContent.js`, `sealedTome.js`). The `src/components/README.md` documents a placement rule for `components/` and `features/`, but `services/` has no documented taxonomy, so new modules land at the flat root by default and the boundaries blur over time.

**Hypothesis / root cause:** services accreted one file at a time with no grouping convention; the only structural docs (components/README.md) don't cover `services/`.

**Proposed fix / improvement:**
- [ ] Either group into subfolders — e.g. `services/cloud/` (supabase, cloudSync, backfill, persistence, sessionResume), `services/exam/` (examPace, examPrediction, examSession, srs, forgettingCurve, weakDomain, oracleGrader), `services/game/` (pets, spells, devotion), `services/platform/` (logger, notifications, i18n, tts, timerAnnounce, importLimits, notesCrypto, richContent, sealedTome) — updating import paths and colocating `*.test.js`,
- [ ] OR (lighter touch) add a `src/services/README.md` documenting the concern taxonomy and where new service modules should go, mirroring `components/README.md`.

**Related files:** `src/services/` (all), `src/components/README.md` (precedent for a placement doc)

---

> **Resolved 2026-06-23 (scholar-resolver):** Moved `DungeonExplore.jsx` + its test into `src/components/dungeon/` (colocated with `tileRenderer.js`); updated the lazy import in App.jsx and the moved files' relative imports; fixed a stale path comment in `utils/shuffle.js`; added `components/dungeon/README.md` describing the component <-> renderer <-> map-gen triad. Build confirms the lazy `DungeonExplore` chunk still bundles.

### [2026-06-23] Relocate `DungeonExplore.jsx` into `src/components/dungeon/` to colocate with its renderer

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** dungeon-scholar tree cleanup/structure scan

**Description:**
After the DungeonExplore God-file split, the delve's code is now spread across three locations: the React component `src/components/DungeonExplore.jsx` (2,504 lines) sits at the `components/` root, while its extracted-only companion `tileRenderer.js` (1,503 lines) lives in `src/components/dungeon/` and the map-gen lives in `src/game/dungeonMap.js`. The `src/components/dungeon/` folder exists specifically for delve-rendering code yet contains only `tileRenderer.js`; the component that consumes it sits one level up at the flat `components/` root next to unrelated app chrome (`AccountPanel`, `SignInButton`, banners). Colocating the component with its renderer makes the dungeon feature self-contained and the `dungeon/` folder meaningful.

**Proposed fix / improvement:**
- [ ] Move `src/components/DungeonExplore.jsx` -> `src/components/dungeon/DungeonExplore.jsx` (and its test `src/components/DungeonExplore.test.js` -> `src/components/dungeon/DungeonExplore.test.js`), updating the lazy import in `App.jsx` and any other importers.
- [ ] Optionally add a one-paragraph `src/components/dungeon/README.md` describing the component + renderer + `game/dungeonMap.js` triad.

**Related files:** `src/components/DungeonExplore.jsx`, `src/components/DungeonExplore.test.js`, `src/components/dungeon/tileRenderer.js`, `src/game/dungeonMap.js`, `src/App.jsx` (lazy import)

**Related entries:** Resolved — "DungeonExplore.jsx is a 4,536-line God-file" (the split that created this placement asymmetry).

---

> **Resolved 2026-06-23 (scholar-resolver):** Added `dungeon-scholar/CHANGELOG.md` (Keep-a-Changelog), seeded from the resolved-issues log + phase history, with an `[Unreleased]` section and a `0.1.0` baseline.

### [2026-06-23] No `CHANGELOG.md` for dungeon-scholar (sibling dnd-app has one)

- **Category:** docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** dungeon-scholar tree cleanup/structure scan

**Description:**
`dnd-app/CHANGELOG.md` exists and the repo root has `docs/CHANGELOG.md`, but `dungeon-scholar/` has no changelog despite an active phase history (PHASE-19B/24/30/39/41G references appear throughout the code and resolved log) and a versioned `package.json` (`"version": "0.1.0"`). There is no human-readable record of what shipped per phase/release on the dungeon-scholar side, so release history lives only in git log and scattered phase docs.

**Proposed fix / improvement:**
- [ ] Add `dungeon-scholar/CHANGELOG.md` (Keep-a-Changelog style, mirroring `dnd-app/CHANGELOG.md`), seeded from the resolved-issues log + phase docs, and keep it updated on release.

**Related files:** `dungeon-scholar/package.json`, `dnd-app/CHANGELOG.md` (precedent), `docs/CHANGELOG.md` (repo-root precedent)

---

> **Resolved 2026-06-23 (scholar-resolver):** Validated the i18n scaffold in production (Option A) — the Marketplace and Scholar's Ledger nav buttons now resolve their `title`/`aria-label` via `t()`, with matching keys added to `locales/en.js`.

### [2026-06-23] i18n scaffold (`services/i18n.js` + `locales/en.js`) is unreferenced in production code

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** dungeon-scholar tree cleanup/structure scan

**Description:**
The minimal i18n foundation added previously (`src/services/i18n.js` exporting `t`, `setLocale`, `getLocale`, `availableLocales`, over `src/services/locales/en.js`) is currently wired up but never used: grep finds no non-test import of `services/i18n`, no `t(` call sites in `src/features/` or `src/components/`, and `locales/en.js` holds only ~11 keys while UI strings remain hardcoded inline. The scaffold is correct and intentionally opt-in (its own header comment says full extraction is "an incremental, opt-in effort"), but an unused abstraction tends to rot — keys drift from real copy and the next contributor can't tell whether to use `t()` or keep hardcoding. Logged as info so the gap between "scaffold exists" and "scaffold used" is visible.

**Hypothesis / root cause:** the i18n layer was added as a foundation (resolved entry "App is English-only…") but no follow-up migrated any real strings through `t()`, so the module sits unreferenced.

**Proposed fix / improvement:**
- [ ] Migrate a first slice of high-traffic chrome strings (nav labels, common buttons, modal titles) through `t()` to validate the API and grow `en.js`, OR
- [ ] If i18n is not a near-term goal, add a short note in `docs/DESIGN-CONSTRAINTS.md` recording that the scaffold is intentionally dormant (so it isn't mistaken for dead code and removed).

**Related files:** `src/services/i18n.js`, `src/services/locales/en.js`

**Related entries:** Resolved — "App is English-only with no internationalization layer" (added the scaffold this entry observes is still unused).

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
