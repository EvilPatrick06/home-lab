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

### [2026-04-30] Plug `migrateTutorialIndex` into the localStorage hydrate path

- **Category:** future-idea
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code
- **During:** Tutorial overhaul — Task 7 deferred-item logging

**Description:** `migrateTutorialIndex` (in `dungeon-scholar/src/tutorial.js`) currently fires only on the file-import path (`importProgress` in `App.jsx`). The localStorage hydrate path goes through `migrateIfNeeded` in `dungeon-scholar/src/services/persistence.js`, which is currently a no-op stub. When a future schema version bump lands, the persistence track should plug `migrateTutorialIndex` into `migrateIfNeeded`'s relevant case so users restoring a saved-locally pre-overhaul state get the correct step index.

Estimated fix: two-line addition. Pre-overhaul state is unlikely to exist in many users' localStorage (the persistence layer was wired in around the same time as this overhaul) but the gap is worth closing for completeness.

**Proposed fix:**
- [ ] In `migrateIfNeeded`, handle the tutorial-step-index migration case by calling `migrateTutorialIndex` when schema version < overhaul cutoff

**Related files:** `dungeon-scholar/src/tutorial.js`, `dungeon-scholar/src/services/persistence.js`, `dungeon-scholar/src/App.jsx`

**Related entries:** `[2026-04-30] Vault deduplication inconsistency between per-stage and per-lab IDs`

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

### [2026-04-30] `OLD_TUTORIAL_ORDER` is duplicated in `tutorial.js` and the test file

- **Category:** design-gotcha, debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code
- **During:** Tutorial overhaul — Task 7 deferred-item logging

**Context:** The 8-item legacy ID array is defined as `OLD_TUTORIAL_ORDER` (module-private) in `dungeon-scholar/src/tutorial.js` and is duplicated as `OLD_ORDER` inside the `migrateTutorialIndex` describe block in the test file.

**Why it matters:** If a future commit renames or removes one of the legacy IDs (e.g., rebrands `enter_dungeon`), both copies need updating. The test would still catch divergence — production returns 0 via the `>= 0 ? newIdx : 0` fallback while the test expects -1 — but the maintenance cost is real.

**Why it's acceptable for now:** The migration helper is expected to be deleted in ~12 months once pre-overhaul saves age out. At this scale it's not worth the export churn.

**What to do if the helper outlives its expected lifetime:**
- [ ] Export `OLD_TUTORIAL_ORDER` from `tutorial.js`
- [ ] Import it in the test file instead of maintaining a parallel copy

**Related files:** `dungeon-scholar/src/tutorial.js` (line ~134), `dungeon-scholar/src/tutorial.test.js`

---

> dungeon-scholar active bugs / debt: [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
