# Suggestions log (split by domain)

This file is a **compatibility pointer**. Future ideas, design gotchas, and notes are split by domain:

- **BMO:** [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
- **dnd-app:** [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
- **dungeon-scholar:** [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting / repo-wide suggestions

> **`Domain: both` routing** (see `LOG-INSTRUCTIONS.md`): whole-repo / structural / convention items (`Domain: both`) live **here** — one home, fix once, remove once. Items that affect several *specific* projects (not repo-wide structure) are **mirrored** into the per-domain suggestions logs instead.

### [2026-06-28] TypeScript type-checking coverage is uneven across the three TS projects — only dnd-app has a `tsc` gate

> **[2026-06-29 overall-resolver — correction; LEFT OPEN, needs a human decision]** Premise is inaccurate: `dungeon-scholar` and `oracle-worker` are **JavaScript**, not TypeScript. `dungeon-scholar/src` = 128 `.js` + 81 `.jsx`, **zero** `.ts/.tsx`, no `typescript` dep / no `tsconfig`; `oracle-worker` is a single `.js` worker with no `typescript`. There is no existing TS surface to type-check in either; adding a `tsc --noEmit` gate would mean *introducing* TypeScript (or `allowJs`+`checkJs`) onto a JS codebase never written for it — an architecture decision (which strictness? accept the error cascade?) the resolver approval did not cover (INSTRUCTIONS rule 9b). The one genuinely-TS surface lacking a gate was `dnd-app/mobile`, now covered (RESOLVED-ISSUES `dnd-app/mobile excluded from Makefile + CI`, 2026-06-29). The Makefile `typecheck` comment was corrected to state these two are JS. **Decision for a human:** adopt JS type-checking (`checkJs`) for dungeon-scholar/oracle-worker, or close as wontfix.**

- **Category:** future-idea
- **Severity:** medium
- **Domain:** both
- **Discovered by:** overall-suggestor
- **During:** cross-cutting CI/tooling review

**Description:**
Three of the repo's code areas are TypeScript, but only `dnd-app` is ever type-checked. `dnd-app` runs `tsc --noEmit` (Makefile `typecheck` + `dnd-app-ci`). `dungeon-scholar` has **no `tsconfig*.json` and no typecheck/`check` script at all** — Vite/esbuild transpiles by stripping types without checking them, so a type error there only ever surfaces at runtime. `oracle-worker` has only `check: wrangler deploy --dry-run` (an esbuild bundle, not a full project type-check). So two production TS surfaces ship with zero compiler-enforced type safety, while a third is fully gated — an inconsistency that mirrors the (now-resolved) lint/audit-coverage gaps overall-suggestor previously closed for these same two projects. The Makefile documents the omission ("dungeon-scholar has no tsconfig/tsc step … Revisit if either gains a tsconfig") but it is not tracked as an improvement.

**Hypothesis / root cause:** Both projects were bootstrapped from Vite/Wrangler templates that rely on the bundler for transpile and never added a standalone `tsc` config; the bundler-transpiles-so-no-typecheck assumption was accepted as permanent rather than as debt.

**Proposed fix / improvement:**
- [ ] Add a `tsconfig.json` (strict) + `"typecheck": "tsc --noEmit"` script to `dungeon-scholar`, and a `"typecheck": "tsc --noEmit"` (or `wrangler types` + tsc) to `oracle-worker`.
- [ ] Extend Makefile `typecheck` to fan out to all three TS projects (today it covers dnd-app only, by design-note).
- [ ] Wire the new typecheck step into `dungeon-scholar-ci` / `oracle-worker-ci`.
- [ ] Optionally add a shared `tsconfig.base.json` at repo root (parallel to the existing `biome.base.json`) so the three projects share compiler-strictness defaults.

**Related files:** `dungeon-scholar/package.json`, `oracle-worker/package.json`, `Makefile`, `.github/workflows/dungeon-scholar-ci.yml`, `.github/workflows/oracle-worker-ci.yml`, `biome.base.json`
