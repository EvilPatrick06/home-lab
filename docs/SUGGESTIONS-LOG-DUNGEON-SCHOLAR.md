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

### [2026-05-05] Code-split the major study modes (FlashcardsMode/QuizMode/LabMode/ShopScreen/RunHistoryScreen)

- **Category:** future-idea, performance
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** Claude Code (Opus 4.7)
- **During:** Phase 24 polish post-mortem

**Description:** The Phase 24 vendor split + DungeonExplore lazy-load took the main app chunk from 624 KB → 386 KB (under the 500 KB warning). The five biggest in-bundle components — `FlashcardsMode`, `QuizMode`, `LabMode`, `ShopScreen`, `RunHistoryScreen` — still ship in the main chunk. Splitting them further would cut initial load for users who land on the home screen or navigate to a non-mode route (Stable, Spellbook, Calendar, Bestiary).

**Why it's a planned future task, not an active blocker:** Current main chunk is 387 KB gzipped 104 KB — the warning is gone, the page is fast. The split is worth doing once a single mode component crosses ~80 KB (DungeonExplore's threshold for lazy load) or when adding a new heavy mode. We have the infrastructure already (`React.lazy` + `Suspense` is already used for DungeonExplore).

**Proposed fix (when scheduled):**
- [ ] Extract each of `FlashcardsMode`, `QuizMode`, `LabMode`, `ShopScreen`, `RunHistoryScreen` into `src/components/<name>.jsx` files (they currently live inline in `App.jsx`)
- [ ] Convert each import to `React.lazy(() => import('./components/<name>.jsx'))`
- [ ] Wrap each `screen === '<mode>' && courseSet && ...` render in a small `<Suspense fallback={...}>` block (mirror the DungeonExplore pattern)
- [ ] Verify `npm run build` chunk-size report shows 5 new chunks roughly proportional to each mode's responsibility
- [ ] Confirm 167 tests still pass — the modes share state via prop drilling, so extraction should be a near-mechanical move

**Related files:** `dungeon-scholar/src/App.jsx` (mode component definitions + screen routing block), `dungeon-scholar/vite.config.js` (manualChunks split is already in place — no change needed there), `dungeon-scholar/docs/PHASE-24-POLISH.md` (the deferred-polish entry that already names this work)

---

# Design gotchas (warnings for future agents)

*(none currently logged)*

---

> dungeon-scholar active bugs / debt: [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md). Resolved dungeon-scholar entries: [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
