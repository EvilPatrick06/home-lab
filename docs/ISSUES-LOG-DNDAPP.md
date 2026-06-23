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

### [2026-06-22] `@google/genai` not installed locally — `tsc -p tsconfig.node.json` + 4 AI test suites fail on bmo.

- **Category:** config
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated dnd-app error scan (running the repo's own gates on bmo).

**Description:**
On the bmo checkout, `node_modules/@google/genai` is missing while `package.json` (`"@google/genai": "^2.8.0"`) and `package-lock.json` both reference it (lockfile has the package; the orphaned, no-longer-declared `@google/generative-ai` is what is actually present on disk). The installed tree is stale relative to the manifests. Consequences observed this run:
- `npx tsc --noEmit -p tsconfig.node.json` → `error TS2307: Cannot find module '@google/genai'` at `src/main/ai/gemini-client.ts:1` → exit 1 (so `npm run check:release` / `check:full` fail at the tsc step).
- `npm test` → 4 suites fail to even load with `Error: Cannot find package '@google/genai'`: `src/main/ai/ai-service-file-read-cancel.test.ts`, `ai-service-restream-context.test.ts`, `ai-service-web-search-approval.test.ts`, `src/main/ipc/ai-handlers.test.ts` (all reach the real module via `provider-registry.ts → gemini-client.ts`; the dedicated `gemini-client.test.ts` passes because it mocks the import).

**Reproduction (if bug):**
1. On bmo: `cd /home/patrick/home-lab/dnd-app`
2. `npx tsc --noEmit -p tsconfig.node.json` → TS2307, and `npm test` → 4 failed suites.
3. `ls node_modules/@google/` shows only `generative-ai`, not `genai`.

**Expected behavior (if bug):** local install matches the lockfile; tsc:node and the AI suites pass.

**Hypothesis / root cause:** Local `node_modules` drift — `npm ci`/`npm install` has not been run on bmo since the migration from `@google/generative-ai` to `@google/genai`. The repo manifests are internally consistent, so a fresh-install CI run should be unaffected; this is an environment problem on the bmo checkout, not a repo defect. (Logging because it currently red-lines every local test/tsc run on bmo and can mask real regressions.)

**Proposed fix / improvement:**
- [ ] Run `npm ci` (or `npm install`) in `dnd-app/` on bmo to install `@google/genai` and prune the orphaned `@google/generative-ai`.
- [ ] Re-run `npm test` + `tsc -p tsconfig.node.json` to confirm green.

**Related files:** `dnd-app/package.json`, `dnd-app/package-lock.json`, `dnd-app/src/main/ai/gemini-client.ts`, `dnd-app/src/main/ai/provider-registry.ts`

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

### [2026-06-22] Biome reports ~70 lint warnings (incl. unused import/var) — non-blocking but accumulating.

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** automated dnd-app error scan (`npm run lint`).

**Description:**
`biome check src/` passes (exit 0) but emits **70 warnings + 1 info**. Sampled rule breakdown: `suspicious/noExplicitAny` (~22, many in tests), `suspicious/noAssignInExpressions` (3), and one each of `correctness/noUnusedVariables`, `correctness/noUnusedImports`, `style/useTemplate`, `complexity/useOptionalChain`. The unused-import/unused-variable ones are trivially real dead code; the `noExplicitAny` ones are mostly test doubles. Because these are configured as warnings (not errors), they don't fail lint/CI, so the count quietly grows.

**Expected behavior:** zero (or a deliberately ratcheted-down) warning count.

**Proposed fix / improvement:**
- [ ] `npm run lint:fix` to clear the auto-fixable ones (unused import, useTemplate, useOptionalChain).
- [ ] Triage remaining `noExplicitAny` — annotate intentional ones with `biome-ignore` + reason, type the rest.

**Related files:** `dnd-app/biome.json`, `dnd-app/src/**`

- **[2026-06-20] Builder multiclass per-level class swap doesn't recompute spell-selection caps.** `setClassLevelChoice` (`src/renderer/src/stores/builder/slices/core-slice.ts`) regenerates build slots but, unlike `setTargetLevel` (now fixed for the single-class Level-field path, QA-2026-06-19 task 3), does NOT recompute the store's `maxCantrips`/`maxPreparedSpells` enforcement caps. A multiclass build whose caster level changes via the per-level class panel could still hit stale caps in `setSelectedSpellIds`. A fully-correct fix recomputes the caps keyed on the primary/combined caster class. *(found during QA-2026-06-19 task 3 fix; the reported single-class path is fully fixed.)*
- **[2026-06-11] Renderer rest-service: Ranger "Tireless" exhaustion reduction + innate-spell-use restoration still dropped.** `rest-service-5e.ts:248-250` (Tireless) and the comment near `:410` (innate uses) were disabled in 15c.5; PHASE-02 02A re-enabled the condition `value` substrate, so Tireless reduction is now implementable. *(found during PHASE-02 verification.)*
- **[2026-06-11] Renderer rest executors swallow rejected AI rest mutations.** `creature-actions.ts:609,673` call `window.api.ai.longRest/shortRest` fire-and-forget with `.catch(() => {})` — a rejected rest batch is invisible (PHASE-02 02F routed the direct applyMutations path through the DM-alert tray, but not these two rest entry points). *(found during PHASE-02 verification.)*

---

> dnd-app future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app issues: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
