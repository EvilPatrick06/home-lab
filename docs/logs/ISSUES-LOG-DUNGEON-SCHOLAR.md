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

*(none currently logged)*


## Low

### [2026-07-15] oracle-worker Dependabot group PR #64 red — workers-types v4→v5 major bump breaks `npm ci` against wrangler 4.x peer range

- **Category:** config
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (CI status sweep of scholar-domain workflows)

**Description:**
`oracle-worker CI` is red on Dependabot PR **#64** (`build(deps-dev): bump the npm-deps group in /oracle-worker with 2 updates`, opened 2026-07-10; runs 29064958933 / 29064960187 fail in ~19s). The failing step is `./.github/actions/setup-node-project` → `npm ci` in `oracle-worker/`. Reproduced locally from `pull/64/head` (git archive → clean `npm ci`): the group bump takes `@cloudflare/workers-types` `^4.20260629.1` → **`^5.20260703.1` (a MAJOR bump inside a "deps-dev" group PR)** while also bumping `wrangler` `^4.105.0` → `^4.107.0`. `wrangler@4.107.0` declares `peerOptional @cloudflare/workers-types@"^4.20260701.1"`, so the PR lockfile is internally inconsistent and `npm ci` dies with `ETARGET — No matching version found for @cloudflare/workers-types@^4.20260701.1` (the 4.x peer target is not in the v5-updated lock). Typecheck/build/test steps never run.

**Hypothesis / root cause:** Dependabot grouped a major `workers-types` bump with a minor `wrangler` bump; wrangler 4.x still pins its optional peer to workers-types 4.x. Not an app-code problem — the PR itself is unmergeable as generated. Per AUTOMATED-AGENT-GIT-WORKFLOW.md Rule 3B this is correctly a leave-for-manual-review (major + red), but left un-diagnosed it will recur every weekly Dependabot run.

**Proposed fix / improvement:**
- [ ] Close/ignore the major half: add a Dependabot `ignore` (or `versions: [">=5"]` constraint) for `@cloudflare/workers-types` in `oracle-worker` until wrangler declares v5 peer support, so the group PR regenerates as the mergeable wrangler-only bump.
- [ ] Alternative: drop the standalone `@cloudflare/workers-types` devDep entirely and generate runtime types via `wrangler types` (Cloudflare-recommended for wrangler ≥3.66), removing the peer-range coupling for good.
- [ ] Re-check `oracle-worker/tsconfig.json` `types` after whichever path is taken.

**Blocked by:** upstream wrangler peer-range (if waiting for v5 support).

**Related files:** `oracle-worker/package.json`, `oracle-worker/package-lock.json`, `.github/workflows/oracle-worker-ci.yml`, `.github/actions/setup-node-project/action.yml`

**Related entries:** none (first oracle-worker dependency-CI entry in this log).

---

### [2026-07-15] Main-checkout `dungeon-scholar/node_modules` is prod-only — `npm run lint`/`typecheck` broken there, and bare `npx biome`/`npx tsc` silently run the WRONG registry packages

- **Category:** config
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-errors
- **During:** automated error scan (running the standard check suite)

**Description:**
`/home/patrick/home-lab/dungeon-scholar/node_modules` (the main checkout on bmo) currently contains only production deps — `.bin/` has 24 entries (`vite`, `vitest`, …) and **no `@biomejs/biome` and no `typescript`**, despite both being devDependencies. Consequences observed this run: (1) `npm run lint` / `npm run typecheck` cannot work in the main checkout; (2) far worse, a bare `npx biome check src` **silently downloads the deprecated `biome` registry package** (not `@biomejs/biome`) and crashes with `Cannot find module ./util/assign` from its ancient `fs-extra`, and `npx tsc` resolves to the `tsc` **squatter package** ("This is not the tsc command you are looking for"). Any agent that runs npx-based checks from the main checkout gets confusing failures — or, worse, could mistake the squatter output for a real toolchain result. Earlier scholar-errors runs (2026-07-02) ran `biome check src` successfully there, so this is drift, likely from a prod-only install (`npm ci --omit=dev` / audit tooling) pruning dev deps at some point after 2026-07-02.

**Reproduction:**
1. `cd /home/patrick/home-lab/dungeon-scholar`
2. `ls node_modules/.bin | grep -c biome` → 0; `npx biome --version` → MODULE_NOT_FOUND crash from the wrong package.

**Expected behavior:** dev toolchain (`biome`, `tsc`) resolvable in the main checkout, or agents consistently `npm ci` in their own worktrees before checks (this run did the latter — checks were green: 945/945 tests, tsc clean, build + bundle budget OK).

**Hypothesis / root cause:** a prod-scoped npm invocation in the main checkout pruned devDependencies; bare `npx` then falls through to same-named registry packages — a known npx foot-gun.

**Proposed fix / improvement:**
- [ ] Re-run a full `npm ci` in the main checkout `dungeon-scholar/` (or document that the main checkout is prod-only and agents MUST `npm ci` in their worktree).
- [ ] Prefer `npm run lint` / `./node_modules/.bin/biome` over bare `npx biome` in agent instructions/scripts so a missing local install fails loudly instead of fetching a same-named registry package.

**Related files:** `dungeon-scholar/package.json`, `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md` (worktree setup section)

**Related entries:** none.


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

> **2026-07-02 (scholar-errors):** count drifting UP — `biome check src` now reports 161 warnings total, `useExhaustiveDependencies` at **133** (was ~91), plus a handful of `noUnusedVariables`/`noUnusedFunctionParameters` returned post-sweep (`App.jsx` x4, `QuestBoard.jsx`, `DungeonExplore.jsx`, `usePlayerActions.js`, `ShopScreen.jsx`, `QuizMode.jsx`) — phases 08–11 added hooks/vars without dep hygiene. The triage below is getting more expensive the longer it waits.

> **2026-07-15 (scholar-errors):** drift continues — full sweep in a fresh worktree (`npm ci`, biome 2.5.1): **187 diagnostics** (185 warnings + 2 infos; was 161 on 07-02). `useExhaustiveDependencies` **134** (App.jsx 39, DungeonExplore.jsx 55, usePlayerState.js 13, FlashcardsMode.jsx 6, usePlayerActions.js 6). Post-sweep regressions: `useOptionalChain` back at **16** (was 0 after the 06-29 sweep), `noUnusedVariables` 6 / `noUnusedFunctionParameters` 4 persist (App.jsx x4: `totalDungeonRunsAttempted`, `canAscend`, `trackModeUseDaily`, `claimableStoryStepCount`; QuestBoard `claimedSteps`; DungeonExplore `streak`), plus newly-surfaced `noImportantStyles` 18 (all `src/index.css`), `noAssignInExpressions` 4 (while-regex idiom in cloze.js/richContent.js/one guard — benign), `noGlobalIsFinite` 1 (`tome.js:239` `formatDuration`). Everything else green this run: 945/945 tests, tsc clean, build OK (known PWA warn), bundle 439.4/600 KB.

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

> **[2026-07-03] WAIT-on-upstream confirmed (scholar-debt-batch):** re-checked — `vite-plugin-pwa` is **still at 1.3.0** (`npm view vite-plugin-pwa version` → `1.3.0`; latest published, no newer release). The deprecated `inlineDynamicImports: true` is still hardcoded in the plugin's SW-build path, and the app still does not set it in `vite.config.js`. There is **nothing app-side to change** until upstream ships a version using `codeSplitting: false`; forcing a change here would mean patching a dependency's internals. Entry **kept open (WAIT)**, not resolved — bump the plugin when a fixed release appears. Build still succeeds; treat the warning as known noise per the checklist.

**Proposed fix / improvement:**
- [ ] Track `vite-plugin-pwa` releases for a version that switches to `codeSplitting: false`; bump when available.
- [ ] Until then, treat the warning as known build noise (do not let it mask new warnings in CI logs).

**Related files:** `dungeon-scholar/vite.config.js` (VitePWA `injectManifest`), `dungeon-scholar/package.json` (`vite-plugin-pwa` pin)


---

> dungeon-scholar future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app issues: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).

### 2026-06-29 — Light-theme secondary surfaces not covered by Phase 03 (low)
- **Category:** bug (contrast) · **Severity:** low

> **Partly resolved 2026-07-02 (scholar-resolver):** the flashcard SRS rating buttons ("Again"/"Hard") now route through new `--surface-red-raised` / `--surface-amber-raised` triplets (dark byte-identical 127,29,29 / 146,64,14; light flips to the red-200/amber-200 tier under the ramp-inverted `text-red-200`/`text-amber-200` labels) — guarded in `phase10-contrast.test.js`. The `text-amber-700` micro-labels were converted app-wide by the 2026-06-30 entry's fix (see RESOLVED log). **Still open:** the app-wide gold action-button family (`linear-gradient(#fde047,#f59e0b)` + `text-amber-950` flipping to light-on-gold in light theme) needs a non-inverting button-text token across WelcomeModal/HomeScreen/LabMode/ChatMode + ConfirmModal/ErrorBoundary/PromptModal — a cross-cutting design decision, posted to the board for approval (`issue-light-theme-gold-buttons`).
- Flashcard SRS rating buttons (`FlashcardsMode.jsx` "Again"/"Hard": rgba(127,29,29,.55) / rgba(146,64,14,.55)) keep hardcoded-dark backgrounds under inverting text-red-200/text-amber-200 -> mild dark-on-dark in light theme (post-flip only).
- App-wide gold action buttons (linear-gradient(to bottom,#fde047,#f59e0b) + text-amber-950) flip to light-on-gold text in light theme (reduced contrast). Cross-cutting (ConfirmModal/ErrorBoundary/ChatMode/PromptModal).
- text-amber-700 decorative micro-labels go light-on-light on lightened panels (consistent with existing OrnatePanel glyphs).
- Deferred from Phase 03 (not QA-flagged; would expand the contrast pass). Fix in a dedicated follow-up via --surface-* triplets / a non-inverting button-text token.
