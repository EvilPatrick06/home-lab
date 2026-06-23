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

# Low-severity polish / info

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
### [2026-06-23] Local autosave-snapshot ring buffer for crash / accidental-reset recovery

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


# Low-severity polish / info

### [2026-06-23] In-app keyboard-shortcut help overlay (the shortcuts exist but are undiscoverable)

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


# Design gotchas (warnings for future agents)

*(none currently logged)*

---

# Info / observations

*(none active)*

---

> dungeon-scholar active bugs / debt: [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md). Resolved dungeon-scholar entries: [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
