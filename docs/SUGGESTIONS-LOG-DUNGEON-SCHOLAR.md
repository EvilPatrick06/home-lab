# dungeon-scholar Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — dungeon-scholar domain only.**
>
> Sibling logs:
> - dnd-app suggestions → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO suggestions → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - dungeon-scholar active bugs / debt → [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md)
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Triage rule:** `Domain: dungeon-scholar` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to dungeon-scholar behavior → mirrored here AND in the other relevant suggestions log. Cross-tooling rules that touch dungeon-scholar contributors → here (and mirror in another file if it touches them too).

New entries go at the TOP of their section (newest first).

---

# Future ideas

### ~~[2026-04-30] Plug `migrateTutorialIndex` into the localStorage hydrate path~~ — Resolved 2026-05-05

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Status:** Done. `services/persistence.js` now imports `migrateTutorialIndex` and the `migrateIfNeeded` case `schemaVer < 1` runs it on the saved `tutorialStepIndex`. localStorage call site still passes `CURRENT_SCHEMA_VER` (no persisted version on disk), so this is a no-op there until a future bump. Cloud restores that carry `schema_ver < 1` will be migrated on hydrate.

---

### [2026-04-30] Vault deduplication inconsistency between per-stage and per-lab IDs

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code
- **During:** Tutorial overhaul — Task 7 deferred-item logging

**Description:** The mistake vault deduplicates by `item.id` (`dungeon-scholar/src/App.jsx` ~line 848). For lab failures, the deduped item is the parent trial, and after the tutorial overhaul (Task 5) the per-stage `${labId}_step_${idx}` IDs from `submitStep`/`skipStep` accumulate distinct entries per stage — which is intentional and correct behavior. However, older code paths in `recordAnswer` that pass the parent-lab item will still dedupe at the trial level. This creates a minor inconsistency: per-stage paths generate more granular vault entries while the parent-lab path collapses them.

**No action needed unless:** The inconsistency surfaces in vault UX feedback (e.g., users wonder why some lab mistakes show per-stage breakdowns and others don't).

**Proposed fix (if needed):**
- [ ] Audit all call sites of `recordAnswer` to confirm which pass parent-lab vs per-stage IDs
- [ ] Standardize on per-stage IDs throughout, or document the split as intentional in a code comment

**Related files:** `dungeon-scholar/src/App.jsx` (vault dedupe ~line 848, `submitStep`, `skipStep`, `recordAnswer`)

---

# Design gotchas (warnings for future agents)

### [2026-04-30] Tutorial action-button steps grant credit before user engages with the opened surface

- **Category:** design-gotcha
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code
- **During:** Tutorial overhaul — Task 7 deferred-item logging

**Context:** Tutorial steps `library_tour`, `vault_intro`, `quest_board`, `view_achievements`, and `view_titles_levels` all advance the moment their action button is clicked — before the user has actually engaged with the modal or screen that opens. A user who closes the surface immediately still receives credit for the step.

**Why it's an explicit tradeoff (not a bug):** The panel description for each of these steps does the teaching. The button tap is the commitment signal, not the engagement time on the opened surface. This was documented as an explicit design decision in `docs/superpowers/specs/2026-04-30-dungeon-scholar-tutorial-overhaul-design.md`.

**Worth revisiting if:** User feedback suggests players feel confused or that they "didn't do the step." If that surfaces, the fix is to gate advancement on the modal/screen actually being dismissed rather than on click.

**Related files:** `dungeon-scholar/src/App.jsx` (tutorial dispatch logic), `dungeon-scholar/src/tutorial.js`

---

### ~~[2026-04-30] `OLD_TUTORIAL_ORDER` is duplicated in `tutorial.js` and the test file~~ — Resolved 2026-05-05

- **Category:** design-gotcha, debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Status:** Done. `OLD_TUTORIAL_ORDER` is now exported from `src/tutorial.js`; the test imports it instead of maintaining a parallel `OLD_ORDER` copy. Renaming a legacy id can no longer silently desync test from prod.

---

> dungeon-scholar active bugs / debt: [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
