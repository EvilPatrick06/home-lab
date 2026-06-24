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

### [2026-06-24] `auto/scholar-resolver` won't merge — divergent devotion/auth refactor vs `auto/scholar-phase-executer`

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

## Medium

### [2026-06-24] dungeon-scholar lint never runs in CI; 222 biome errors accumulated

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


## Low

*(none currently logged)*

---

> dungeon-scholar future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app issues: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
