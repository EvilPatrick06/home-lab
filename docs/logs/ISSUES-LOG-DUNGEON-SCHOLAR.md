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

### [2026-06-29] PHASE-05 implementation (`auto/scholar-phase-executer`) won't integrate — 83 commits stale across an App.jsx god-file refactor

- **Category:** integration / tech-debt
- **Severity:** high
- **Domain:** dungeon-scholar
- **Discovered by:** integrator
- **During:** daily branch consolidation

**Description:**
The `auto/scholar-phase-executer` branch (head `1b3c00ed`) is a genuine, unmerged implementation of **PHASE-05** (interaction recovery, themed `TextInputModal`, Oracle payload + copy, import-warning toast, exam-prediction services). It does **not** merge into current `master`: the merge-base is `605e712f` (~83 master commits behind), and `master` has since landed a **god-file extraction refactor of `dungeon-scholar/src/App.jsx`** that removed/relocated most of App.jsx's named imports (e.g. `WEEKLY_QUEST_POOL`, `encodeTomeShareCode`, `formatDuration`, `generateTomeId`, `normalizeTomeData`, `summarizeRunHistory`, `computeExamPace`, `computeExamPrediction`, `computeMilestones/RetentionCurve`). The branch is built on the **old** App.jsx import graph and adds new logic on top of it, so the merge conflicts irreconcilably in `src/App.jsx` and `src/features/library/LibraryScreen.jsx` (plus a stale `PHASE-INDEX.md` that still shows 03–05 and predates master's PHASE-06/07).

**Root cause:** branch base diverged from `master` by a major structural refactor; the executer's PHASE-05 diff targets a file layout that no longer exists on master. The integrator cannot safely hand-resolve the import graph without high risk of breaking Dungeon Scholar CI.

**Proposed fix / improvement (re-execute, do NOT hand-merge):**
- [ ] Have the **scholar-phase-executer** re-run **PHASE-05** from a **fresh `origin/master`** worktree (`-B auto/scholar-phase-executer origin/master` per AUTOMATED-AGENT-GIT-WORKFLOW.md), re-targeting the import-warning toast + exam-prediction wiring onto master's **already-refactored** App.jsx structure, and re-deriving the `PHASE-INDEX.md` status row from current master (which now also has PHASE-06/07).
- [ ] The stale `auto/scholar-phase-executer` branch has been **left in place** (not merged, not deleted); the executer's `-B` reset will supersede it on its next run. PHASE-05's plan is preserved on master, so no work is lost.

**Related files:** `dungeon-scholar/src/App.jsx`, `dungeon-scholar/src/features/library/LibraryScreen.jsx`, `dungeon-scholar/docs/phases/PHASE-05-interaction-recovery-dialogs-oracle-copy.md`, `dungeon-scholar/docs/phases/PHASE-INDEX.md`


## Medium

### [2026-06-29] Forgetting-curve forecast still uses the pre-FSRS-5 retrievability formula — diverges from the actual scheduler (up to ~11pp)

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


## Low

### [2026-06-29] Source comments point to a non-existent `.github/workflows/deploy.yml` (workflow is `dungeon-scholar-deploy.yml`)

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

### [2026-06-29] `auto/scholar-phase-maker` (tip `850f8404`) won't merge — competing PHASE-06 + PHASE-03 amendment vs the already-merged run

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

### [2026-06-29] `auto/scholar-phase-executer` won't merge — collides with already-merged scholar-resolver (App.jsx imports, LibraryScreen bulk-tag) + PHASE-INDEX status rows

- **Category:** integration / merge-conflict
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** integrator
- **During:** daily branch integration (2026-06-29 run)

**Description:**
The integrator merged `auto/scholar-resolver` into `master` cleanly first; `auto/scholar-phase-executer` (PHASE-03/04/05 implementation — interaction recovery, themed dialogs, Oracle payload & copy; tip `1b3c00ed`) then no longer merges cleanly against the updated `master`. Three conflicts, all because both branches edited the same regions:
  1. `dungeon-scholar/src/App.jsx` — import block. scholar-resolver trimmed/reordered imports; scholar-phase-executer adds a large new import set (`encodeTomeShareCode`, `formatDuration`, `generateTomeId`, `normalizeTomeData`/`normalizeTomeDataWithReport`, `summarizeRunHistory`, `migrateTutorialIndex`, `computeNextClaim`, `DAILY_REWARDS`, `dayDiff`, `evaluateClaim`, `computeExamPace`, `computeExamPrediction` + `PREDICTION_*` consts, `computeMilestones`, `computeRetentionCurve`). A naive resolution risks dead-import (now an **error** in `biome.json`) or missing-symbol breakage.
  2. `dungeon-scholar/src/features/library/LibraryScreen.jsx` — bulk-tag handler. Two **different** implementations of the same feature: master/scholar-resolver keeps the inline `window.prompt` path; scholar-phase-executer replaces it with a `PromptModal` (`setBulkTagOpen` / `confirmBulkTag`) — the PHASE-05 "replace native dialogs" intent. Reconciling is a UI-design decision (modal should win) and needs the modal state + JSX (added elsewhere on the executer branch) to land consistently.
  3. `dungeon-scholar/docs/phases/PHASE-INDEX.md` — status rows: master (scholar-phase-maker) lists 03-07 `pending`; executer marks 03/04/05 `done` with `./completed/` paths. (Trivial: take executer's done rows for 03-05, keep 06/07 pending.)

**Root cause:** Two scholar-domain branches (resolver + phase-executer) modified the same files in parallel; the resolver landed first, so the executer now needs a rebase that reconciles the overlap. The integrator did **not** fix-forward because (1) and (2) are competing feature implementations / an import set that must match post-merge usage — a domain decision, not a mechanical conflict — and a blind auto-resolution risks a red `master`.

**Proposed fix / improvement (scholar-resolver / scholar-phase-executer owner):**
- [ ] Rebase `auto/scholar-phase-executer` onto current `master`.
- [ ] App.jsx: keep the union of imports actually referenced by the merged file; run `biome check` (`noUnusedImports` is `error`) to confirm no dead/missing imports.
- [ ] LibraryScreen.jsx: adopt the PHASE-05 `PromptModal` bulk-tag (drop the `window.prompt` path), ensuring the modal state + JSX land together.
- [ ] PHASE-INDEX.md: set 03/04/05 -> `done` (`./completed/…` paths), keep 06/07 `pending`.
- [ ] Verify dungeon-scholar lint + full vitest + build green, then let the next integrator run merge it.

**Related files:** `dungeon-scholar/src/App.jsx`, `dungeon-scholar/src/features/library/LibraryScreen.jsx`, `dungeon-scholar/docs/phases/PHASE-INDEX.md`, branch `auto/scholar-phase-executer` (tip `1b3c00ed`)

---

### [2026-06-28] biome `useExhaustiveDependencies` warnings — hook-dependency triage (dead-code half + lint gate now done)

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (`biome check src`)

> **Partly resolved 2026-06-29 (scholar-resolver):** The mechanical half shipped on `auto/scholar-resolver`. Swept the dead code (`noUnusedImports` / `noUnusedVariables` / `noUnusedFunctionParameters`, 22 files) and the safe cosmetic rewrites (`useOptionalChain` / `useTemplate`, 29 files) via targeted `biome check --write --unsafe --only=…`, dropping the tree from 287 → 157 warnings, then **promoted `noUnusedImports` to `"error"`** in `biome.json` so dead imports can no longer silently return (lint gate stays green; full suite 749 tests green). **Still open below:** the ~91 `useExhaustiveDependencies` warnings.

**Description:**
The remaining warnings are `useExhaustiveDependencies` (latent stale-closure / missed-rerender risks), concentrated in `App.jsx` (~34), `components/dungeon/DungeonExplore.jsx` (~25), `hooks/usePlayerState.js` (~12), `features/player/usePlayerActions.js` (~6). They were deliberately NOT auto-fixed: there is no component-level behavioral/interaction test coverage for these hooks, so a blind dependency-array rewrite can introduce an infinite render loop or a perf regression that neither lint, the unit suite, nor build would catch. Each site needs per-hook judgment (add the real missing dep vs. annotate an intentional omission with `// biome-ignore` + reason).

**Proposed fix / improvement:**
- [ ] Triage the ~91 `useExhaustiveDependencies` warnings per hook — add real missing deps (verifying no render-loop regression), annotate intentional omissions with `// biome-ignore lint/correctness/useExhaustiveDependencies: <reason>`.
- [ ] Add component-interaction tests for the high-density files (`App.jsx`, `DungeonExplore.jsx`) FIRST so the dep fixes are verifiable, then fix.
- [ ] Once the deps backlog is clear, consider promoting `useExhaustiveDependencies` (and `noUnusedFunctionParameters`) from `warn` toward `error`.

**Related files:** `dungeon-scholar/biome.json`, `src/App.jsx`, `src/components/dungeon/DungeonExplore.jsx`, `src/hooks/usePlayerState.js`, `src/features/player/usePlayerActions.js`

---

### [2026-06-28] `vite build` emits `inlineDynamicImports` deprecation from vite-plugin-pwa SW build

- **Category:** config
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (`vite build`)

**Description:**
A production `vite build` prints `WARN inlineDynamicImports option is deprecated, please use codeSplitting: false instead.` during the service-worker (injectManifest) build step. It is not from `vite.config.js` (the app does not set `inlineDynamicImports`) — it originates inside the pinned dependency: `node_modules/vite-plugin-pwa/dist/vite-build-BGK4YAIU.js:109` hardcodes `inlineDynamicImports: true` when it builds `src/sw.js`. The build still succeeds today, but the option is slated for removal in Rolldown/Vite, at which point the SW build would break.

**Hypothesis / root cause:** `vite-plugin-pwa@1.3.0` uses the deprecated Rollup/Rolldown `inlineDynamicImports` flag for the SW bundle; Vite 8 (Rolldown) now warns on it. App code can not fix it directly — it needs a plugin upgrade.

**Proposed fix / improvement:**
- [ ] Track `vite-plugin-pwa` releases for a version that switches to `codeSplitting: false`; bump when available.
- [ ] Until then, treat the warning as known build noise (do not let it mask new warnings in CI logs).

**Related files:** `dungeon-scholar/vite.config.js` (VitePWA `injectManifest`), `dungeon-scholar/package.json` (`vite-plugin-pwa` pin)


---

> dungeon-scholar future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app issues: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).

### 2026-06-29 — Light-theme secondary surfaces not covered by Phase 03 (low)
- **Category:** bug (contrast) · **Severity:** low
- Flashcard SRS rating buttons (`FlashcardsMode.jsx` "Again"/"Hard": rgba(127,29,29,.55) / rgba(146,64,14,.55)) keep hardcoded-dark backgrounds under inverting text-red-200/text-amber-200 -> mild dark-on-dark in light theme (post-flip only).
- App-wide gold action buttons (linear-gradient(to bottom,#fde047,#f59e0b) + text-amber-950) flip to light-on-gold text in light theme (reduced contrast). Cross-cutting (ConfirmModal/ErrorBoundary/ChatMode/PromptModal).
- text-amber-700 decorative micro-labels go light-on-light on lightened panels (consistent with existing OrnatePanel glyphs).
- Deferred from Phase 03 (not QA-flagged; would expand the contrast pass). Fix in a dedicated follow-up via --surface-* triplets / a non-inverting button-text token.
