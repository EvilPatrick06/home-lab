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

> **`Domain: both` routing** (see `LOG-INSTRUCTIONS.md`): whole-repo / structural / convention items (`Domain: both`) live **here** — one home, fix once, remove once. Items that affect several *specific* projects (not repo-wide structure) are **mirrored** into the per-domain suggestions logs instead.
