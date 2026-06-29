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

**Proposed fix / improvement (only if the path-mapping ever becomes insufficient):**
- [ ] Extract `dnd-app/src/shared` into its own workspace package (e.g. `@dnd/shared` with its own package.json declaring `@msgpack/msgpack`), consumed by BOTH dnd-app and dnd-app/mobile; then project references (or a plain package dep) become clean.
- [ ] Until then keep the path-mapping; it is the standard, correct approach for this layout.

**Related files:** `dnd-app/mobile/tsconfig.json`, `dnd-app/src/shared/**`, `dnd-app/tsconfig.node.json`, `dnd-app/tsconfig.web.json`

**Related entries:** RESOLVED-ISSUES-DNDAPP.md [2026-06-29] dnd-app/mobile lint + typecheck gate (where the path-mapping was introduced).

> **`Domain: both` routing** (see `LOG-INSTRUCTIONS.md`): whole-repo / structural / convention items (`Domain: both`) live **here** — one home, fix once, remove once. Items that affect several *specific* projects (not repo-wide structure) are **mirrored** into the per-domain suggestions logs instead.
