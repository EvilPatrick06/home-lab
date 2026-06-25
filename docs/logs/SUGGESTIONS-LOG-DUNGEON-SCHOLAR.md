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


### [2026-06-24] App.jsx orchestration shell is a 2100-line God component (~48 hook calls)

- **Category:** debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of dungeon-scholar/

**Description:**
`src/App.jsx` (`DungeonScholarApp`) is ~2100 lines and makes ~48 `useState`/`useEffect`/`useCallback`/`useMemo`/`useRef` calls in one component. A large cluster is per-surface UI open/close state — `pendingConfirm`, `tutorialOpenedSurface`, `shareTomeId`, `editMetadataTomeId`, `editContentTomeId`, `notesTome`, `unsealedTomes` (in-memory sealed-tome decrypt map), `domainFilter`, `reviewMode` — alongside the RLS-exposure probe effect and the OAuth-callback effect. The shell mixes routing, auth, player-state, sealed-tome session lifetime, and modal flags, making the render switch and effect list hard to follow and risky to edit.

**Proposed fix / improvement:**
- [ ] Extract the surface/modal open-close cluster into a dedicated hook (e.g. `useAppSurfaces`) next to the existing `useAppModals`.
- [ ] Move the RLS-exposure probe and OAuth-callback consumption effects into small hooks (`useRlsProbe`, `useOAuthCallback`).
- [ ] Keep the `[screen, setScreen]` hash-router shape untouched (every `setScreen` call site stays valid). Net: App.jsx becomes a thin shell; surface state becomes unit-testable.

**Related files:** `src/App.jsx`, `src/hooks/useAppModals.js`

### [2026-06-24] DungeonExplore.jsx (2844 lines) is the repo's largest module and is monolithic

- **Category:** debt
- **Severity:** medium
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of dungeon-scholar/

**Description:**
`src/components/dungeon/DungeonExplore.jsx` is 2844 lines — the largest file in the tree — and appears to bundle map state, keyboard/turn input handling, and render orchestration in a single component. Its sibling `src/components/dungeon/tileRenderer.js` is 1576 lines (2nd largest) and has **no** test file, despite being largely pure rendering helpers that are cheap to cover.

**Proposed fix / improvement:**
- [ ] Decompose `DungeonExplore` into focused units — e.g. a `useDungeonInput` hook (key/turn handling), a `useDungeonState` reducer, and a presentational grid component.
- [ ] Add a unit test for `tileRenderer.js` (pure helpers → low-cost coverage of the 2nd-largest module).
- [ ] Behavior-preserving decomposition only, not a redesign.

**Related files:** `src/components/dungeon/DungeonExplore.jsx`, `src/components/dungeon/tileRenderer.js`

**Related entries:** App.jsx God-component entry [2026-06-24]

# Low-severity polish / info


### [2026-06-24] src/data/ is a single-file directory; starterDecks.js fits the src/game/ taxonomy

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of dungeon-scholar/

**Description:**
`src/data/` contains exactly one module, `starterDecks.js`. The README's own structure taxonomy describes `src/game/` as "Game data + pure helpers" (titles, quests, items, bestiary, defaultState, …). Starter-deck content is game data, so the lone `src/data/` directory is an orphan namespace that overlaps the role of `src/game/`.

**Proposed fix / improvement:**
- [ ] Move `src/data/starterDecks.js` → `src/game/starterDecks.js`, update imports, and remove the now-empty `src/data/`.
- [ ] OR, if a dedicated content layer is intended to grow, rename to `src/content/` and document it in the README "Project structure" block and `src/components/README.md` placement rules.
- [ ] Update README "Project structure" either way.

**Related files:** `src/data/starterDecks.js`, `README.md`

### [2026-06-24] services/ is a 31-module flat bucket with no placement README (components/ has one)

- **Category:** docs
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-cleanup
- **During:** automated cleanup/structure scan of dungeon-scholar/

**Description:**
`src/services/` holds 31 non-test modules spanning unrelated concerns — persistence/cloudSync/backfill, FSRS scheduling (`srs`, `forgettingCurve`, `weakDomain`), exam logic (`examSession`, `examPace`, `examPrediction`), crypto (`notesCrypto`), `oracleGrader`, `certificate`, `devotion`, `pets`, `spells`, `i18n`+`locales`, `tts`, `logger`, etc. `src/components/` ships a `components/README.md` documenting a clear placement rule, but `services/` — the larger, more heterogeneous bucket — has no equivalent, so there is no guidance on where a new service module belongs or how the bucket is organized.

**Proposed fix / improvement:**
- [ ] Add `src/services/README.md` documenting the grouping convention (mirroring the precedent in `src/components/README.md`).
- [ ] OR introduce sub-namespaces (e.g. `services/sync`, `services/study`, `services/exam`, `services/content`) and update the README structure block.
- [ ] Low effort; improves discoverability.

**Related files:** `src/services/`, `src/components/README.md`

# Design gotchas (warnings for future agents)

*(none currently logged)*

---

# Info / observations

*(none active)*

---

> dungeon-scholar active bugs / debt: [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md). Resolved dungeon-scholar entries: [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
