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
