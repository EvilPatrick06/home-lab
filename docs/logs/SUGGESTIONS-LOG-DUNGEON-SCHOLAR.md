# dungeon-scholar Suggestions Log

> **Future ideas, design gotchas (warnings for future contributors), and notable observations — dungeon-scholar domain only.**
>
> Sibling logs:
> - dnd-app suggestions → [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
> - BMO suggestions → [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
> - dungeon-scholar active bugs / debt → [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md)
> - dnd-app active bugs / debt → [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md)
> - BMO active bugs / debt → [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md)
> - Resolved dungeon-scholar entries → [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md)
> - Security concerns (global, any domain) → [`SECURITY-LOG.md`](./SECURITY-LOG.md) *(gitignored)*
>
> Logging templates + triage rules: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md).

**Triage rule:** `Domain: dungeon-scholar` design-gotchas / future-ideas / info → here. `Domain: both` entries that meaningfully apply to dungeon-scholar behavior → mirrored here AND in the other relevant suggestions log. Cross-tooling rules that touch dungeon-scholar contributors → here (and mirror in another file if it touches them too).

New entries go at the TOP of their section (newest first).

---

# Future ideas

### [2026-06-28] DungeonExplore: extract the React-coupled input + state into useDungeonInput / useDungeonState

- **Category:** debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-resolver
- **During:** resolving the 2026-06-24 DungeonExplore monolith suggestion

**Description:**
The DungeonExplore decomposition was partly landed (see the resolved entry):
`tileRenderer.js` now has a unit test, and the pure movement/grading/question
logic was extracted into `src/components/dungeon/dungeonLogic.js` (fully tested).
What remains is the React-coupled half the original entry named — a
`useDungeonInput` hook (keydown handler + held-key cadence + the
quaffPotion/castSpell/interact action refs) and a `useDungeonState` reducer
(pos/hp/shields/mana/score/streak/…). This was deliberately not done blind:
DungeonExplore has **zero** component-level interaction tests (the existing
43-test `DungeonExplore.test.js` only covers the `dungeonMap.js` game-data
module), so the dungeon-scholar CI (lint + vitest + build) cannot catch a
movement/input regression — a blind extraction would risk silently breaking the
delve with no safety net.

**Proposed fix / improvement:**
- [ ] FIRST add component-interaction tests for DungeonExplore (render + simulate keydown movement, a battle answer, an interact/pickup) so the extraction is verifiable.
- [ ] THEN extract `useDungeonInput` and a `useDungeonState` reducer, behavior-preserving, keeping those new tests green.

**Related files:** `src/components/dungeon/DungeonExplore.jsx`, `src/components/dungeon/dungeonLogic.js`

# Low-severity polish / info

*(none currently logged)*

# Design gotchas (warnings for future agents)

*(none currently logged)*

---

# Info / observations

*(none active)*

---


> dungeon-scholar active bugs / debt: [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md). Resolved dungeon-scholar entries: [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
