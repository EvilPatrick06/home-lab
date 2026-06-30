# Suggestions log (split by domain)

This file is a **compatibility pointer**. Future ideas, design gotchas, and notes are split by domain:

- **BMO:** [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
- **dnd-app:** [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
- **dungeon-scholar:** [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting / repo-wide suggestions

### [2026-06-29] dnd-app/mobile shares dnd-app src/shared via tsconfig path-mapping; TS project references evaluated and rejected

- **Category:** future-idea, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-resolver
- **During:** evaluating whether to convert the mobile consumption of `dnd-app/src/shared` from a tsconfig path alias to TS project references.

**Description:**
`dnd-app/mobile` type-checks against `dnd-app/src/shared/*` (the bridge protocol/types) via a tsconfig path alias (`@shared/*` to `../src/shared/*`), plus a `@msgpack/msgpack` path mapping and a parent-test exclusion so tsc resolves everything in the mobile resolution context. Converting this to TS **project references** was attempted and reverted: with a composite `tsconfig.shared.json` referenced by mobile, tsc requires the shared project to be **built** standalone (`tsc -b`, error TS6305), and the shared external dependency `@msgpack/msgpack` only resolves from the **consuming** app node_modules (mobile has it; a shared project built from `dnd-app/` would need `dnd-app/node_modules`, which the mobile CI job does not install). So project references would force either installing dnd-app deps in the mobile job or emitting build artifacts, both worse than the current path-mapping, which correctly compiles the shared sources in the mobile resolution context.

**Hypothesis / root cause:** `src/shared` is physically part of the dnd-app project (compiled by `tsconfig.node.json` / `tsconfig.web.json`) rather than a standalone package; project references want a self-contained project with its own resolvable dependency graph.

**Workspace-package extraction — scope assessed 2026-06-29 (large; do in an environment that can build/test dnd-app):**
The extraction is the right long-term move but is a high-blast-radius migration that must be validated by a full dnd-app build + vitest run, so it was NOT attempted from the automated resolver (the resolver worktree has no dnd-app node_modules and cannot run electron-vite/vitest/electron-builder; the only check would be blind CI round-trips). Concrete scope discovered:
- **135 files** under `dnd-app/src` import `src/shared`, ALL via **relative paths** at varying depths (`../shared/`, `../../shared/`, ... `../../../../../shared/`). There is no `@shared` alias to repoint, so each import must be rewritten.
- **Name collision:** `shared/` also denotes a renderer UI-component dir (`renderer/.../shared/SheetSectionWrapper`, `SectionBanner`, `SkillsModal`, ...). A blind find/replace on `shared/` would corrupt these. The migration must distinguish the `src/shared` module from `renderer/**/shared` components.
- **No workspace tooling** (no root `package.json`; projects install independently). Extraction requires introducing npm/pnpm workspaces (or `file:` deps) — a repo-wide tooling decision.
- **Non-TS / out-of-band consumers** also coupled to the path: `bmo/pi/agents/vtt_sync.py`, `dnd-app/mobile/scripts/sync-shared.mjs`, plus `electron.vite.config.ts`, vitest, and biome includes.

Suggested sequenced plan (interactive, with builds runnable):
- [ ] Decide the workspace tool (npm workspaces is lowest-friction) + package name/location (e.g. `dnd-app/packages/shared` as `@dnd/shared`).
- [ ] Add an `@shared` (or `@dnd/shared`) path alias to dnd-app tsconfig + electron-vite + vitest FIRST, migrate the 135 files` relative imports to the alias (codemod), and verify the dnd-app build + full vitest stay green — all WITHOUT moving files yet.
- [ ] Then physically move `src/shared` into the package, point the alias/package at the new location, update `sync-shared.mjs` + the bmo Python path, re-verify both apps build/test.
- [ ] Finally switch mobile to a normal package dep / project reference and drop the path-mapping workarounds.
- Until all that lands, keep the current path-mapping; it is the standard, correct approach for the present layout.

**Related files:** `dnd-app/mobile/tsconfig.json`, `dnd-app/src/shared/**`, `dnd-app/tsconfig.node.json`, `dnd-app/tsconfig.web.json`

**Related entries:** RESOLVED-ISSUES-DNDAPP.md [2026-06-29] dnd-app/mobile lint + typecheck gate (where the path-mapping was introduced).

### [2026-06-29] No shared `tsconfig.base.json` parallel to `biome.base.json` — TS compiler defaults are defined independently per project

- **Category:** debt, future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** cross-cutting scan of root configs / shared tooling across the four JS/TS code areas.

**Description:**
The repo has a shared `biome.base.json` at root that every JS project extends (`dnd-app/biome.json`, `dnd-app/mobile/biome.json`, `dungeon-scholar/biome.json` all `"extends": ["../biome.base.json"]`), giving lint/format one source of truth. There is **no equivalent shared TS base config.** Each of the six tracked tsconfigs sets its own compiler strictness in isolation: `oracle-worker/tsconfig.json`, `dungeon-scholar/tsconfig.json`, `dnd-app/mobile/tsconfig.json`, and dnd-app's own three (`tsconfig.json`, `tsconfig.web.json`, `tsconfig.node.json`) — none of which `extends` a common base, not even within dnd-app. So `strict`, `target`, `moduleResolution`, `noUncheckedIndexedAccess`, etc. can silently drift between projects (and the dungeon-scholar / oracle-worker tsconfigs are deliberately non-strict `checkJs`, while mobile is strict), with no single place to set or audit a repo-wide strictness floor. This was explicitly raised as an `[ ] Optionally add a shared tsconfig.base.json` checkbox in the now-resolved 2026-06-28 "TypeScript type-checking coverage is uneven" entry (RESOLVED-ISSUES.md) but was left undone and never tracked as its own item.

**Hypothesis / root cause:** the typecheck-coverage work added per-project tsconfigs one at a time (each bootstrapped from its own Vite/Wrangler/Expo template), and the optional shared-base step was dropped when the blocking work landed.

**Proposed fix / improvement:**
- [ ] Add a root `tsconfig.base.json` (parallel to `biome.base.json`) holding the shared strictness/target defaults.
- [ ] Point each project tsconfig at it via `"extends": "../tsconfig.base.json"` (relative depth per project), overriding only the genuinely project-specific bits (lib/jsx/allowJs/checkJs/types).
- [ ] Have dnd-app's three tsconfigs extend it too, so they share a base instead of restating options three times.

**Related files:** `biome.base.json`, `dnd-app/tsconfig.json`, `dnd-app/tsconfig.web.json`, `dnd-app/tsconfig.node.json`, `dnd-app/mobile/tsconfig.json`, `dungeon-scholar/tsconfig.json`, `oracle-worker/tsconfig.json`

**Related entries:** RESOLVED-ISSUES.md [2026-06-28] TypeScript type-checking coverage is uneven across the three TS projects (where the shared base was listed as an optional, never-done follow-up).

### [2026-06-29] `dnd-app` is the only JS project missing the canonical `typecheck` npm script that CONTRIBUTING documents and the other three define

- **Category:** debt, docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** cross-cutting scan of `package.json` script vocabulary across the four JS projects.

**Description:**
`docs/CONTRIBUTING.md` ("Script vocabulary") declares `typecheck` → `tsc --noEmit` as canonical "for the project (where a tsconfig exists)." Three of the four JS projects honor it: `dnd-app/mobile`, `dungeon-scholar`, and `oracle-worker` each define `"typecheck": "tsc --noEmit"`. `dnd-app` — which has three tsconfigs — defines **no** `typecheck` script. Instead the type-check is open-coded everywhere it is needed: the root `Makefile` runs `npx tsc --noEmit -p tsconfig.web.json` inline, `check:release` inlines `tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.node.json`, and the Husky pre-commit hook calls `tsc --noEmit -p tsconfig.web.json` directly. So the one project that most needs a single named entry point (two tsconfigs to check) is the one lacking it, and the documented canonical vocabulary is violated by the flagship project. A `dnd-app typecheck` script would also let the Makefile and CI call `npm run typecheck` uniformly across all four areas instead of dnd-app being the special-cased inline case.

**Hypothesis / root cause:** dnd-app predates the script-vocabulary standardization (RESOLVED-ISSUES.md 2026-06-23) and was never back-filled because its two-tsconfig setup has no single obvious `tsc --noEmit` invocation; callers reached for the explicit `-p tsconfig.web.json` form instead.

**Proposed fix / improvement:**
- [ ] Add to `dnd-app/package.json`: `"typecheck": "tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.node.json"` (matching what `check:release` already runs).
- [ ] Repoint the Makefile `typecheck` recipe and the Husky hook at `npm run typecheck` so the invocation lives in one place.

**Related files:** `dnd-app/package.json`, `Makefile`, `.husky/pre-commit`, `docs/CONTRIBUTING.md`

**Related entries:** RESOLVED-ISSUES.md [2026-06-23] `format` npm script means different things in dnd-app vs dungeon-scholar (the standardization that documented the canonical vocabulary).

### [2026-06-29] `_archive/README.md` "What's inside" tree is stale — three of the five batch dirs are undocumented in the index

- **Category:** docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** cross-cutting scan of stale top-level dirs and their documentation.

**Description:**
`_archive/` now holds five dated batch directories on disk: `2026-04-24-dead-code/`, `2026-04-reorg/`, `2026-06-10-completed-docs/`, `2026-06-22-completed-docs/`, and `2026-06-29-completed-docs/`. But the README's "## What's inside" ASCII tree — the human-facing index of the archive — documents **only** the two 2026-04 batches. `2026-06-10-completed-docs/` and `2026-06-22-completed-docs/` appear nowhere in the README at all, and `2026-06-29-completed-docs/` is described only in a later free-text section appended out-of-band rather than in the tree. So the index undercounts the archive by three batches, and a reader using the tree to find what was archived will miss the bulk of the recent (docs) batches. Because the archive grows by one dated batch per cleanup with no convention requiring the index be updated, this drift will keep recurring.

**Hypothesis / root cause:** each cleanup batch is dropped into a new dated dir but the README "What's inside" tree is hand-maintained and only the very first batches were ever added to it; later batches were noted (if at all) in ad-hoc prose sections.

**Proposed fix / improvement:**
- [ ] Bring the "What's inside" tree current: add one-line entries for `2026-06-10-completed-docs/`, `2026-06-22-completed-docs/`, and `2026-06-29-completed-docs/`.
- [ ] Document a lightweight retention/index convention in `_archive/README.md` (e.g. "every new dated batch adds a one-line row to the tree above; consider deleting batches older than N months since git history is the real audit trail"), so the index can't silently fall behind again. Optionally a tiny CI/`check-*` guard asserting every `_archive/*/` dir is named in the README.

**Related files:** `_archive/README.md`, `_archive/2026-06-10-completed-docs/`, `_archive/2026-06-22-completed-docs/`, `_archive/2026-06-29-completed-docs/`

### [2026-06-29] `audit:ci` vulnerability threshold diverges across projects — the security-sensitive oracle-worker uses the *loosest* level (`high`) while the rest use `moderate`

- **Category:** config, security
- **Severity:** info
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** cross-cutting scan of `package.json` script vocabulary across the four JS projects.

**Description:**
The `audit:ci` script name was standardized across projects, but the **threshold** it enforces was not. `dnd-app` runs `npm audit --audit-level=moderate --omit=dev`, `dungeon-scholar` runs `npm audit --omit=dev --audit-level=moderate`, but `oracle-worker` runs `npm audit --audit-level=high`. `--audit-level=high` is the *weakest* gate (it ignores moderate-severity advisories), and oracle-worker is the Cloudflare Worker proxy that performs AI grading/chat for dungeon-scholar — arguably the most exposed of the four surfaces — so the component with the loosest dependency-audit threshold is the internet-facing one. `docs/CONTRIBUTING.md` does describe `audit:ci` as running "at the project's CI threshold," which leaves per-project thresholds technically sanctioned, so this is logged as an observation to confirm intent rather than a clear defect. (Note also `oracle-worker` omits `--omit=dev` that the other two pass, so it audits devDependencies too — a minor flag inconsistency.)

**Hypothesis / root cause:** oracle-worker's `audit:ci` was added later (when uniforming the script *name* across projects) and copied a `high` threshold rather than the repo-standard `moderate`; the level was never reconciled.

**Proposed fix / improvement:**
- [ ] Decide the intended per-project policy; if there's no deliberate reason, lower oracle-worker to `--audit-level=moderate` to match dnd-app/dungeon-scholar (tighten the gate on the exposed component).
- [ ] Align the `--omit=dev` flag across the three so the audit scope is consistent, and note the chosen threshold convention in `docs/CONTRIBUTING.md`.

**Related files:** `oracle-worker/package.json`, `dnd-app/package.json`, `dungeon-scholar/package.json`, `docs/CONTRIBUTING.md`
### [2026-06-29] Audit-coverage parity gap: `dnd-app/mobile` has no `npm audit` gate (no `audit:ci` script, absent from `security-audit.yml`); `make audit` also omits mobile + bmo

- **Category:** future-idea, portability
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting CI/tooling review of `security-audit.yml`, the root `Makefile`, and each project's `package.json` scripts

**Description:**
`dnd-app/mobile` is the only npm-lockfile project with **no `npm audit` coverage anywhere**, even though Dependabot was explicitly given a `/dnd-app/mobile` entry *because* its Expo/EAS toolchain "accumulated security alerts unremediated" (see `.github/dependabot.yml`). Concretely: (1) mobile's `package.json` defines no `audit:ci` script — the other three npm projects all do; (2) `security-audit.yml` has jobs for dnd-app, dungeon-scholar, oracle-worker (npm) and bmo (bandit + pip-audit) but **none for mobile** (`grep mobile .github/workflows/security-audit.yml` -> 0 hits); and (3) the new `dnd-app-mobile-ci.yml` runs only `biome check` + `tsc`, no audit step. So Dependabot opens *version*-update PRs for mobile, but nothing ever runs `npm audit` against its lockfile to *surface* a vulnerability between those PRs.

Separately, the root `Makefile` `audit` target runs only `npm run audit:ci` for the three npm projects — it omits **mobile** (same gap) **and bmo** (no `bandit` / `pip-audit`, which `security-audit.yml` does run). So a developer running `make audit` locally gets materially less coverage than CI and no signal at all for two of the five code areas. This is the still-open tail of the resolved 2026-06-29 "mobile excluded from Makefile + CI" entry, whose resolution explicitly left one box unchecked: *"Decide whether mobile gets a `security-audit` job like the other npm projects."* It was never tracked as an open item afterward.

**Hypothesis / root cause:** mobile's CI/Makefile wiring was retrofitted for lint+typecheck only; the audit half (script + workflow job) was deferred as a decision and dropped. `make audit` was authored around the three npm projects and never extended to bmo's Python audits or mobile.

**Proposed fix / improvement:**
- [ ] Add an `audit:ci` script to `dnd-app/mobile/package.json` mirroring its siblings (e.g. `npm audit --omit=dev --audit-level=moderate`), tuned for the Expo/EAS toolchain's known dev-only noise.
- [ ] Add a `mobile-npm-audit` job to `security-audit.yml` (composite `setup-node-project` + `npm run audit:ci`, path-filtered to `dnd-app/mobile/**`).
- [ ] Extend the root `Makefile` `audit` target to include `dnd-app/mobile` and a bmo audit (`bandit` / `pip-audit`) so `make audit` matches CI's security coverage; update the help text.

**Related files:** `dnd-app/mobile/package.json`, `.github/workflows/security-audit.yml`, `.github/workflows/dnd-app-mobile-ci.yml`, `Makefile`, `.github/dependabot.yml`

**Related entries:** `RESOLVED-ISSUES.md` -> [2026-06-28] "`dnd-app/mobile` is excluded from both the root Makefile fan-out and all CI" (closes that entry's unchecked `security-audit` decision); same coverage-parity theme as the resolved "security-audit never runs for dungeon-scholar or oracle-worker".

### [2026-06-29] `dnd-app/mobile` has no local pre-commit floor — the husky hook's `^dnd-app/` block runs dnd-app's web checks, not mobile's own biome/tsc

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** reviewing `.husky/pre-commit` coverage against the per-project script set

**Description:**
The repo-root `.husky/pre-commit` gives every subproject a fast local pre-flight: dnd-app (biome `--staged` + web `tsc`), dungeon-scholar (biome + vitest), bmo/pi (ruff + no-new-prints), oracle-worker (vitest). `dnd-app/mobile` gets none of its own. Its files sit under `dnd-app/`, so a mobile-only commit *matches* the `staged | grep -q '^dnd-app/'` block and runs **dnd-app's** `biome check --staged` (scoped to `dnd-app/biome.json`) and **dnd-app's** `tsc -p tsconfig.web.json` — neither of which covers mobile sources (mobile has its own `biome.json` and an Expo/RN `tsconfig.json` that `tsconfig.web.json` does not include). So mobile changes are either unchecked or run under the wrong project's config locally. The new `dnd-app-mobile-ci.yml` is the authoritative gate, but mobile is the one area with a declared `lint`+`typecheck` and no matching local fast-feedback floor — a consistency gap with the other four areas.

**Hypothesis / root cause:** the hook predates the nested mobile package; the `^dnd-app/` prefix match silently swallows mobile paths into the dnd-app block, masking the absence of a dedicated mobile block.

**Proposed fix / improvement:**
- [ ] Add a `dnd-app/mobile` block to `.husky/pre-commit`: when `^dnd-app/mobile/` files are staged, run `( cd dnd-app/mobile && npx @biomejs/biome check --staged ... )` + `tsc --noEmit`.
- [ ] Make the existing dnd-app block exclude `dnd-app/mobile/**` so a mobile-only change isn't (incorrectly) typechecked against the web tsconfig.

**Related files:** `.husky/pre-commit`, `dnd-app/mobile/package.json`, `dnd-app/mobile/biome.json`, `dnd-app/mobile/tsconfig.json`

**Related entries:** Same mobile coverage-parity theme as the audit-parity entry above and `RESOLVED-ISSUES.md` -> [2026-06-28] mobile Makefile/CI exclusion.

### [2026-06-29] CI hygiene lints workflows for *security* (zizmor) but not *correctness* — no `actionlint` job to catch shell/expression bugs

- **Category:** future-idea
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** reviewing `ci-hygiene.yml` and `scripts/check-ci-hygiene.sh`

**Description:**
`scripts/check-ci-hygiene.sh` notes as a future item that "a deeper actions linter (actionlint / zizmor) could subsume guards 1,2,5." The *security* half landed — `ci-hygiene.yml` now runs `zizmorcore/zizmor-action`. The *correctness* half, **actionlint**, is still missing: there is no actionlint CI job (`grep -rln actionlint .github/workflows` -> none); resolved CI entries say workflows were "validated with actionlint" only by hand at authoring time. actionlint and zizmor are complementary — zizmor finds security smells (injection, cache poisoning, over-broad tokens), while actionlint finds *correctness* bugs: shellcheck over every `run:` step, invalid `${{ }}` expressions, bad `needs:`/`matrix` refs, unknown event keys. Exactly the class of drift behind the resolved `dnd-e2e.yml` convention break. With ~20 workflows plus hand-rolled `run:` shell in the hygiene/agent-docs scripts, a one-step actionlint job is cheap recurrence insurance.

**Hypothesis / root cause:** zizmor was adopted for supply-chain hardening; actionlint was used ad hoc during authoring but never wired as a standing gate, so workflow-correctness regressions are only caught if a human remembers to run it.

**Proposed fix / improvement:**
- [ ] Add an `actionlint` job to `ci-hygiene.yml` (SHA-pinned `rhysd/actionlint` action or the pinned binary), alongside the existing `zizmor` job, scoped to `.github/`.
- [ ] Once green, update the `check-ci-hygiene.sh` "Future:" comment to record that actionlint+zizmor now jointly cover the workflow-lint surface.

**Related files:** `.github/workflows/ci-hygiene.yml`, `scripts/check-ci-hygiene.sh`, `.github/workflows/*.yml`

**Related entries:** `ISSUES-LOG.md` -> [2026-06-28] dnd-e2e convention-drift (an actionlint gate is recurrence insurance for that class); `RESOLVED-ISSUES.md` -> composite-action entry ("validated with actionlint" — manual, not a standing gate).

### [2026-06-29] Repo-root `scripts/` has no README — the only shared-tooling dir without an index, while bmo/pi/scripts and dnd-app/scripts both already have one logged

- **Category:** docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** cross-cutting scan of repo-root shared tooling and directory-level documentation.

**Description:**
The repo-root `scripts/` directory holds cross-cutting tooling that is wired into CI and the husky hooks — `check-agent-instructions.sh` (run by `agent-docs-check.yml`), `check-ci-hygiene.sh` (run by `ci-hygiene.yml`), and `claude-tools/watchdog.sh` — but has **no `scripts/README.md`**. Nothing tells a contributor or scanning agent what each script does, where it runs (CI vs. local hook vs. agent/cron), or which are safe to invoke by hand. This is the repo-root instance of a recurring missing-index pattern already logged for two *other* script dirs: `BMO-SUGGESTIONS-LOG.md` [2026-06-28] (`bmo/pi/scripts/` has no README) and `SUGGESTIONS-LOG-DNDAPP.md` [2026-06-28] (`dnd-app/scripts/` has ~40 scripts, no README). With three script dirs now flagged for the same gap, the cross-cutting fix is to adopt one convention — a one-line-per-script index README in every `scripts/` dir (root + per-project) — rather than three independent one-offs. The root dir is the smallest (3 files) so it is the cheapest place to set the pattern.

**Hypothesis / root cause:** the root `scripts/` dir accreted CI guard scripts one at a time as workflows were added; no index pass was ever done, mirroring the per-project script dirs.

**Proposed fix / improvement:**
- [ ] Add `scripts/README.md`: one line per script (`check-agent-instructions.sh`, `check-ci-hygiene.sh`, `claude-tools/watchdog.sh`) with purpose + where-it-runs (CI workflow name / hook / cron).
- [ ] Capture the "every `scripts/` dir carries a one-line index README" convention once (e.g. in `docs/CONTRIBUTING.md`) so the root + per-project entries can all close against a single standard.

**Related files:** `scripts/`, `scripts/check-agent-instructions.sh`, `scripts/check-ci-hygiene.sh`, `scripts/claude-tools/watchdog.sh`, `docs/CONTRIBUTING.md`

**Related entries:** `BMO-SUGGESTIONS-LOG.md` -> [2026-06-28] `pi/scripts/` has no README; `SUGGESTIONS-LOG-DNDAPP.md` -> [2026-06-28] `scripts/` has no README / [2026-06-?] `dnd-app/docs/` has no index (same missing-index pattern across sibling dirs).

### [2026-06-29] Build/tooling config file-extension convention diverges across the two Vite projects: dnd-app uses `.ts`, dungeon-scholar uses `.js`

- **Category:** config, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** cross-cutting scan of build/test tooling-config conventions across the JS/TS projects.

**Description:**
The two Vite-based projects write their build/test config files in different languages. `dnd-app` authors every tooling config in TypeScript — `electron.vite.config.ts`, `vite.web.config.ts`, `vite.embed.config.ts`, `vitest.config.ts`, `playwright.config.ts`. `dungeon-scholar` authors the equivalents in plain JavaScript — `vite.config.js`, `postcss.config.js`. Both are TS projects (each ships a `tsconfig.json` and `biome.json`), so there is no inherent reason the config layer differs; it is unguided drift from two separate Vite scaffolds. The practical cost is small but real: a contributor moving between the two projects has to context-switch on config language, `.js` configs get no type-checking of Vite/Plugin options, and there is no documented repo-wide answer to "what extension do tooling configs use here?" (Note: dungeon-scholar's own tsconfig is the looser `checkJs`/JS-leaning posture per the open `tsconfig.base.json` entry, so `.js` configs are *somewhat* consistent with its stance — logged as a convention observation to standardize, not a defect.)

**Hypothesis / root cause:** each project was bootstrapped from its own Vite template (TS template for dnd-app, JS template for dungeon-scholar) and the config-file language was never reconciled when the repo standardized lint/format/script vocabulary.

**Proposed fix / improvement:**
- [ ] Decide one repo-wide convention for tooling configs (TS is the stronger default — typed plugin options, matches the flagship project) and record it in `docs/CONTRIBUTING.md` alongside the script vocabulary.
- [ ] If TS is chosen, migrate `dungeon-scholar/vite.config.js` (and `postcss.config.js` where practical) to `.ts`; if JS is deliberately kept for dungeon-scholar, document why so it doesn't read as drift.

**Related files:** `dnd-app/vite.web.config.ts`, `dnd-app/vitest.config.ts`, `dnd-app/electron.vite.config.ts`, `dungeon-scholar/vite.config.js`, `dungeon-scholar/postcss.config.js`, `docs/CONTRIBUTING.md`

**Related entries:** `SUGGESTIONS-LOG.md` -> [2026-06-29] No shared `tsconfig.base.json` (same "per-project tooling configured in isolation, no repo-wide floor" theme).

### [2026-06-29] `docs/README.md` index mislabels `CHANGELOG.md` as "Release history" and omits the living-changelog + per-project CHANGELOG convention

- **Category:** docs
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** cross-cutting scan of `docs/` organization and the docs index.

**Description:**
`docs/CHANGELOG.md` states up front that it is the **frozen archive of releases ≤ v2.1.16** and that "the living changelog is the GitHub Releases page" (written by `cut.mjs --notes-file` at cut time) — a convention also codified in `AUTOMATED-AGENT-GIT-WORKFLOW.md` Rule 3D. But the `docs/README.md` index row labels it simply `CHANGELOG.md | Release history`, which reads as *the* current changelog and points a reader at a file that is intentionally no longer extended. The index also never surfaces (a) that current release notes live on GitHub Releases, nor (b) that `dnd-app/` and `dungeon-scholar/` each keep their own per-project `CHANGELOG.md`. So the one place that catalogs repo docs gives an out-of-date mental model of where release history actually lives. (The index is otherwise complete and current — all 15 non-log docs are listed — so this is a labeling/accuracy fix, not a missing-entry fix.)

**Hypothesis / root cause:** the index row predates the v2.1.16 freeze + "GitHub Releases is the living changelog" switchover and was never updated when `docs/CHANGELOG.md` became an archive.

**Proposed fix / improvement:**
- [ ] Reword the index row, e.g. `CHANGELOG.md | Frozen release archive (<= v2.1.16); current notes live on the GitHub Releases page`.
- [ ] Add a one-line note that `dnd-app/` and `dungeon-scholar/` carry their own per-project CHANGELOGs, so the index reflects the real changelog layout.

**Related files:** `docs/README.md`, `docs/CHANGELOG.md`, `dnd-app/CHANGELOG.md`, `dungeon-scholar/CHANGELOG.md`, `docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`

### [2026-06-29] Five byte-identical `LICENSE` files (root + each package) with no single source or drift guard

- **Category:** debt, docs
- **Severity:** info
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** cross-cutting scan of duplicated top-level files across the repo.

**Description:**
The repo carries five `LICENSE` files — `LICENSE`, `bmo/LICENSE`, `dnd-app/LICENSE`, `dungeon-scholar/LICENSE`, `oracle-worker/LICENSE` — all byte-identical (md5 `664425a071832fc9381f1869505731d8`, ISC). Per-package LICENSE copies are a *legitimate, conventional* practice for independently-publishable/cloneable packages (each of the four areas is described in the root README as standing on its own), so this is logged as an observation to confirm intent rather than a defect. The only real cost is the duplication has no single source and no guard: if the license/holder ever changes, all five must be edited in lockstep, and nothing (no `check-*` script) asserts they stay identical — so a partial edit could leave the repo licensed inconsistently across packages without any signal.

**Hypothesis / root cause:** each package was scaffolded with its own LICENSE; the root LICENSE was added for the monorepo. All happen to be the same ISC text today, kept in sync only by hand.

**Proposed fix / improvement:**
- [ ] Confirm the per-package LICENSE copies are intended (keep them — standard for publishable packages).
- [ ] If kept, add a tiny guard (a line in `scripts/check-ci-hygiene.sh`, or a step in `ci-hygiene.yml`) asserting all `*/LICENSE` files match the root `LICENSE` byte-for-byte, so they cannot silently diverge.

**Related files:** `LICENSE`, `bmo/LICENSE`, `dnd-app/LICENSE`, `dungeon-scholar/LICENSE`, `oracle-worker/LICENSE`, `scripts/check-ci-hygiene.sh`


> **`Domain: both` routing** (see `LOG-INSTRUCTIONS.md`): whole-repo / structural / convention items (`Domain: both`) live **here** — one home, fix once, remove once. Items that affect several *specific* projects (not repo-wide structure) are **mirrored** into the per-domain suggestions logs instead.
