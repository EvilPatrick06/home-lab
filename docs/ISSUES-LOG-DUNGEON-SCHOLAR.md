# Issues Log — dungeon-scholar

> **Active dungeon-scholar bugs / tech debt / broken config — Vite/React D&D-themed study app issues only.**
> Sibling logs:
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - dungeon-scholar future ideas / design gotchas / observations → [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)
> - dnd-app future ideas / design gotchas / observations → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO future ideas / design gotchas / observations → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - Resolved dungeon-scholar entries → [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Routing:** Bug / debt / config / perf / test failure scoped to `dungeon-scholar/` (Vite/React/Vitest study app, the per-tome run/quiz/lab content set, the Supabase auth wiring) → here. `Domain: both` cross-cutting entries → mirror in any other relevant issue log; small duplication is intentional.

New entries go at the TOP of their severity section (newest first within each section).

---

# Active Issues

> **2026-06-10 — Backlog consolidated.** All previously-open entries (the Phase 27
> remainder: H1–H5/H7, M2–M7/M10/M12/M13, plus the L/F entries from the suggestions
> log) became the numbered phase plans under `dnd-app/docs/phases/` (start at `PHASE-INDEX.md`); the consolidating audit was deleted once the phase set was authored (2026-06-11). Add new dungeon-scholar issues below as they
> appear.

## Critical

*(none currently logged)*

## High

*(none currently logged)*

## Medium

*(none currently logged)*

## Low

### [2026-06-18] Celestial (and devotion) item caps are not enforced in purchaseItem

- **Category:** bug
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code
- **During:** Phase 41G — adding automated tests for the Phase-30 QA "couldn't test" gap list (ascension + celestial spend gap).

**Description:**
`purchaseItem` (src/features/player/usePlayerActions.js) calls `sanctumAtCap(playerState, item)` for `sanctum`, `devotion`, AND `celestial` categories to block over-cap purchases. But `sanctumCount` (src/game/items.js) short-circuits to `0` for any item whose `category !== 'sanctum'`:
`if (item.category !== 'sanctum' || !item.permKey) return 0;`
So for celestial/devotion items `sanctumCount` is always 0, `sanctumAtCap` is always `0 >= cap` → false, and the cap is never enforced. A player can buy a celestial ware (e.g. `celestial_revive`, documented `cap: 1`) repeatedly, spending tokens and stacking `permUpgrades[permKey]` past its cap.

**Reproduction (if bug):**
1. Seed `ascensionTokens: 10`, `permUpgrades: { ascAutoRevive: 1 }` (at the documented cap of 1).
2. Call `purchaseItem('celestial_revive')`.
3. Observed: `{ ok: true }`, token spent, `ascAutoRevive` becomes 2 (over cap). Expected the purchase to reject with a "reached the cap" reason.

**Expected behavior (if bug):** celestial/devotion purchases reject once `permUpgrades[permKey] / step >= item.cap`, same as sanctum wares.

**Hypothesis / root cause:** `sanctumCount`'s category guard was written before devotion/celestial categories existed and was never widened. The `step`-aware count math is otherwise generic.

**Proposed fix / improvement:**
- [ ] Widen `sanctumCount`'s guard to `['sanctum','devotion','celestial'].includes(item.category)` (or drop the category check and rely on `permKey`), so the `step`-aware count + `sanctumAtCap` work for all permKey-bearing wares.
- [ ] Flip the Phase-41G real-behavior-lock test in `usePlayerActions.test.jsx` ("purchaseItem(celestial) does NOT enforce the documented cap") to assert rejection once fixed.

**Blocked by:** nothing.

---

### [2026-06-18] Curse/modifier run mechanic is vestigial — `cursed_run`/`double_curse` achievements unreachable

**Severity:** Low
**Category:** debt / dead-content
**Domain:** dungeon-scholar

`DungeonExplore` always records `modifiers: []` on completed runs (the curse/modifier system was never wired up), so the `cursed_run` ("win a run with ≥1 curse active") and `double_curse` ("win with 2 curses active") achievements in `src/game/achievements.js` can never be earned — dead content. Found during PHASE-41 41H while writing the manual QA checklist (which notes "curses/modifiers are vestigial, nothing to test").

**Decision needed:** either reimplement run modifiers (a delve-setup curse picker + tracking active modifiers into the run-history `modifiers` field) OR remove the two unreachable achievements. Not fixed inline — out of PHASE-41's scope.

**Blocked by:** nothing.

---

> dungeon-scholar future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app issues: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
