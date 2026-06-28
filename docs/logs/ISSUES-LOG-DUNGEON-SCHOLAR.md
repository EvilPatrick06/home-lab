# Issues Log — dungeon-scholar

> **Active dungeon-scholar bugs / tech debt / broken config — Vite/React D&D-themed study app issues only.**
> Sibling logs:
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - dungeon-scholar future ideas / design gotchas / observations → [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)
> - dnd-app future ideas / design gotchas / observations → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO future ideas / design gotchas / observations → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - Resolved dungeon-scholar entries → [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Routing:** Bug / debt / config / perf / test failure scoped to `dungeon-scholar/` (Vite/React/Vitest study app, the per-tome run/quiz/lab content set, the Supabase auth wiring) → here. `Domain: both` cross-cutting entries → mirror in any other relevant issue log; small duplication is intentional.

New entries go at the TOP of their severity section (newest first within each section).

---

# Active Issues

> **2026-06-10 — Backlog consolidated.** All previously-open entries (the Phase 27
> remainder: H1–H5/H7, M2–M7/M10/M12/M13, plus the L/F entries from the suggestions
> log) became the numbered phase plans under `dnd-app/docs/phases/` (start at `PHASE-INDEX.md`); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new dungeon-scholar issues below as they
> appear.

## Critical

*(none currently logged)*

## High

*(none currently logged)*

## Medium

### [2026-06-28] Branch `auto/scholar-phase-executer` is stale/superseded — won't merge (integrator)
**Owner:** dungeon-scholar domain / `scholar-phase-executer` (+ `scholar-resolver` to rebase or retire).
**Status:** left intact by the integrator on 2026-06-28; NOT merged.
**Branch:** `origin/auto/scholar-phase-executer` @ `14f8c541` ("chore(ds): repo-wide biome format + CI lint gate; align executer agent-id"), 151 files / +8049 / -3723. Its own CI was green, but it does **not** merge into current `master`.
**Root cause:** the branch's entire purpose — a repo-wide biome format + a CI lint gate — was **independently landed on `master`** as `9e454930` ("chore(dungeon-scholar): clean biome lint tree-wide + gate lint in CI"). Master then advanced 52 commits past the branch's merge-base (`92e08ae0`, 2026-06-24), including feature commits that re-touch the same reformatted files: `0070472f` (image-occlusion flashcard type), `59b0bd73` (library multi-select bulk actions), `eb846863` (approved-log resolutions). The result is 6+ content conflicts that are **format-vs-feature** collisions in: `src/components/RichContent.jsx`, `src/components/dungeon/DungeonExplore.jsx` (+`.test.js`), `src/features/library/LibraryScreen.jsx`, `src/features/player/usePlayerActions.js`, `src/features/study/FlashcardsMode.jsx`.
**Why not fix-forward:** hand-resolving a pure-reformat branch against newer feature edits risks silently reverting the feature work in `0070472f`/`59b0bd73`. The correct resolution is not a manual merge.
**Needed (route to scholar domain):** confirm whether the branch carries anything NOT already on `master` after `9e454930`. If nothing material → **retire the branch** (`git push origin :auto/scholar-phase-executer`). If something remains → reset the worktree onto current `origin/master`, re-run `biome format`/lint there (likely a near no-op now), and re-push a clean branch for the next integrator run.


*(none currently logged)*

## Low

*(none currently logged)*

---

> dungeon-scholar future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app issues: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
