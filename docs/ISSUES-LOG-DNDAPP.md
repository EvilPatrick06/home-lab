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

> **2026-06-10 — Backlog consolidated.** All previously-open entries became
> the numbered phase plans under [`../dnd-app/docs/phases/`](../dnd-app/docs/phases/) (start at [`PHASE-INDEX.md`](../dnd-app/docs/phases/PHASE-INDEX.md)); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new dnd-app issues
> below as they appear.

## Critical

*(none currently logged)*

## High

*(none currently logged)*

## Medium

- **[2026-06-11] AI character context is missing weapons/armor/prepared-spells/feats for all v4 characters.** `character-context.ts` still reads v4-stripped inline arrays: `knownSpells`/`preparedSpellIds` (`:137-144`), `armor` (`:168-177`), `weapons` (`:179-184`), `feats` (`:225-228`) — so the AI's "full sheet" omits them. Weapons/armor recoverable from ref `overrides`; spells need library name resolution. *(found during PHASE-02 verification; not in any phase's allocation — the conditions read was fixed in PHASE-02 02B.)*

## Low

- **[2026-06-20] Builder multiclass per-level class swap doesn't recompute spell-selection caps.** `setClassLevelChoice` (`src/renderer/src/stores/builder/slices/core-slice.ts`) regenerates build slots but, unlike `setTargetLevel` (now fixed for the single-class Level-field path, QA-2026-06-19 task 3), does NOT recompute the store's `maxCantrips`/`maxPreparedSpells` enforcement caps. A multiclass build whose caster level changes via the per-level class panel could still hit stale caps in `setSelectedSpellIds`. A fully-correct fix recomputes the caps keyed on the primary/combined caster class. *(found during QA-2026-06-19 task 3 fix; the reported single-class path is fully fixed.)*
- **[2026-06-11] Renderer rest-service: Ranger "Tireless" exhaustion reduction + innate-spell-use restoration still dropped.** `rest-service-5e.ts:248-250` (Tireless) and the comment near `:410` (innate uses) were disabled in 15c.5; PHASE-02 02A re-enabled the condition `value` substrate, so Tireless reduction is now implementable. *(found during PHASE-02 verification.)*

---

> dnd-app future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app issues: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
