# Issues Log — dnd-app

> **Active dnd-app bugs / tech debt / broken config — Electron VTT issues only.**
> Sibling logs:
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - dnd-app future ideas / design gotchas / observations → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO future ideas / design gotchas / observations → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
> - Resolved dnd-app entries → [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md)
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Routing:** Bug / debt / config / perf / test failure scoped to `dnd-app/` (TS/React/Electron/Vite/biome/vitest/Pixi/peerjs/the 5e JSON content set) → here. `Domain: both` cross-cutting entries → mirror in BOTH `BMO-ISSUES-LOG.md` AND this file (small duplication is intentional; one fix removes both copies).

New entries go at the TOP of their severity section (newest first within each section).

---

# Active Issues

> **Backlog absorbed into phase plans (2026-05-18).** All previously-tracked active issues are now scoped inside the dnd-app phase-plan files at `dnd-app/docs/phases/`. New issues should be triaged into the appropriate phase plan, not added here. This log is kept as an entry point and may surface new triaged entries that haven't yet been routed.

## Critical

*(none active — all prior entries absorbed into Phase 28; verification stamps at `dnd-app/docs/phases/phase-28-plan.md`)*

## High

*(none active)*

## Medium

*(none active)*

## Low

- **[debt] LOG-11 Tiny-creature cover exclusion not implementable on `MapToken`.** `cover-calculator.ts` now excludes downed + allied creatures from cover and clamps creature cover to half (Phase 17c). PHB also says Tiny creatures grant no cover, but `MapToken` (`types/map.ts`) carries only `sizeX`/`sizeY` (grid footprint, min 1) — no size *category* — so Tiny can't be distinguished from Medium. Follow-up: add a `sizeCategory`/`creatureSize` field (or resolve it from the linked `monsterStatBlockId`) and skip Tiny in the cover loop. Domain: dnd-app.

---

> dnd-app future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app issues: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
