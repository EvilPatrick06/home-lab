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

### [2026-06-22] `npm run circular` can never fail (`--exit-code circular:0`) — the circular-dep gate is a silent no-op, and 4 cycles already exist.

- **Category:** config, debt
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated dnd-app error scan (running repo gates on bmo).

**Description:**
The `circular` script — `dpdm --no-warning --no-tree --transform --extensions ts,tsx --exit-code circular:0 src/main/index.ts src/renderer/src/main.tsx` — passes `--exit-code circular:0`, which tells dpdm to exit **0** when circular dependencies are found. So the gate reports cycles but always succeeds. Confirmed empirically: this run printed 4 circular-dependency chains yet exited 0. Because `check:full` chains `npm run circular`, that step can never catch a newly-introduced cycle. The 4 cycles currently present:
1. `src/main/ai/ai-service.ts → ai/campaign-context.ts → storage/campaign-storage.ts (→ ai-service.ts)`
2. `renderer/stores/use-ai-dm-store.ts → services/game-action-executor.ts → game-actions/monster-automation-actions.ts → combat/monster-turn-executor.ts (→ use-ai-dm-store.ts)`
3. same as (2) extended through `services/ai-dm-routing.ts`
4. `services/game-action-executor.ts → game-actions/monster-automation-actions.ts → combat/monster-turn-executor.ts → services/ai-dm-routing.ts (→ game-action-executor.ts)`

**Expected behavior (if bug):** the gate fails (non-zero) when any cycle is detected, so cycles can't be introduced silently. (Mirrors the already-logged "pre-commit lints 0 staged files — silent no-op" pattern: a gate that doesn't gate.)

**Hypothesis / root cause:** `circular:0` was likely intended to mean "allow 0 cycles" but dpdm's `--exit-code <type>:<code>` sets the *exit code emitted when that type is found* — `circular:0` = "exit 0 on circular", i.e. never fail. The enforcing value would be a non-zero code (e.g. `circular:1`).

**Proposed fix / improvement:**
- [ ] Change to `--exit-code circular:1` (fail on any cycle) — or first break the existing 4 cycles, then flip it so the gate goes green-on-zero.
- [ ] Decide per-cycle: break (extract shared types / invert a dependency) vs. document as accepted.

**Related files:** `dnd-app/package.json` (`scripts.circular`, `scripts.check:full`), `dnd-app/src/main/ai/ai-service.ts`, `dnd-app/src/renderer/src/services/game-action-executor.ts`, `dnd-app/src/renderer/src/services/combat/monster-turn-executor.ts`

- **[2026-06-11] AI character context is missing weapons/armor/prepared-spells/feats for all v4 characters.** `character-context.ts` still reads v4-stripped inline arrays: `knownSpells`/`preparedSpellIds` (`:137-144`), `armor` (`:168-177`), `weapons` (`:179-184`), `feats` (`:225-228`) — so the AI's "full sheet" omits them. Weapons/armor recoverable from ref `overrides`; spells need library name resolution. *(found during PHASE-02 verification; not in any phase's allocation — the conditions read was fixed in PHASE-02 02B.)*

## Low

- **[2026-06-20] Builder multiclass per-level class swap doesn't recompute spell-selection caps.** `setClassLevelChoice` (`src/renderer/src/stores/builder/slices/core-slice.ts`) regenerates build slots but, unlike `setTargetLevel` (now fixed for the single-class Level-field path, QA-2026-06-19 task 3), does NOT recompute the store's `maxCantrips`/`maxPreparedSpells` enforcement caps. A multiclass build whose caster level changes via the per-level class panel could still hit stale caps in `setSelectedSpellIds`. A fully-correct fix recomputes the caps keyed on the primary/combined caster class. *(found during QA-2026-06-19 task 3 fix; the reported single-class path is fully fixed.)*
- **[2026-06-11] Renderer rest-service: Ranger "Tireless" exhaustion reduction + innate-spell-use restoration still dropped.** `rest-service-5e.ts:248-250` (Tireless) and the comment near `:410` (innate uses) were disabled in 15c.5; PHASE-02 02A re-enabled the condition `value` substrate, so Tireless reduction is now implementable. *(found during PHASE-02 verification.)*
- **[2026-06-11] Renderer rest executors swallow rejected AI rest mutations.** `creature-actions.ts:609,673` call `window.api.ai.longRest/shortRest` fire-and-forget with `.catch(() => {})` — a rejected rest batch is invisible (PHASE-02 02F routed the direct applyMutations path through the DM-alert tray, but not these two rest entry points). *(found during PHASE-02 verification.)*

---

> dnd-app future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app issues: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
