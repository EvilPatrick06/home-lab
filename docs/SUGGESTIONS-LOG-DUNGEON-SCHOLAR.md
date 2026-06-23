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
