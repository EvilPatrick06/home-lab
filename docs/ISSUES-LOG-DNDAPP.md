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


## Low

### [2026-06-23] Object-array roll tables (Weather) roll 1dN by count, ignoring d20Min/d20Max weighting

- **Category:** bug (correctness)
- **Severity:** low
- **During:** PHASE-47 F3 (TablesPanel object-array formatter) — display fix landed; weighting deferred per the plan's "land (1), log (2)".

**Description:**
`src/renderer/src/components/game/sidebar/TablesPanel.tsx` normalizes a bare JSON array as `type:'array'` and rolls `1d(arrayData.length)` by element count. The Weather table (`src/renderer/public/data/5e/encounters/random-tables.json:330`) is a 5-element array of `{ d20Min, d20Max, condition }` range rows (1-14, 15-17, 18, 19-20, 20), so it is rolled **1d5 uniformly** instead of **1d20 across the ranges** — each row is equally likely (20%) rather than weighted (e.g. "Normal for the season" should be 14/20 = 70%). PHASE-47 F3 fixed the `[object Object]` display (`formatTableEntry`), but the weighting is still wrong.

**Proposed fix:**
- [ ] Teach the TablesPanel normalizer to detect a min/max-keyed object array (`d20Min`/`d20Max`, `d100Min`/…) as a range table; roll the implied die (parse `d20` from the key prefix) and match the rolled value against each row's `[min,max]`, mirroring the existing `diceTable` range-match branch.
- [ ] Add a test rolling the Weather table many times and asserting the distribution follows the ranges, not uniform-by-count.

**Related files:** `src/renderer/src/components/game/sidebar/TablesPanel.tsx`, `src/renderer/public/data/5e/encounters/random-tables.json`.

---

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

---

> dnd-app future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app issues: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
