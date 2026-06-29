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

> **`Domain: both` routing** (see `LOG-INSTRUCTIONS.md`): whole-repo / structural / convention items (`Domain: both`) live **here** — one home, fix once, remove once. Items that affect several *specific* projects (not repo-wide structure) are **mirrored** into the per-domain suggestions logs instead.
