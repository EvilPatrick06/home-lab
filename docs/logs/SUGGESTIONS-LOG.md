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

> **`Domain: both` routing** (see `LOG-INSTRUCTIONS.md`): whole-repo / structural / convention items (`Domain: both`) live **here** — one home, fix once, remove once. Items that affect several *specific* projects (not repo-wide structure) are **mirrored** into the per-domain suggestions logs instead.
