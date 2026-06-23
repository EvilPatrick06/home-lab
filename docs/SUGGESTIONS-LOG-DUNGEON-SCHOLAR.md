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

### [2026-06-23] `App.jsx` screen-router: render the ~22 `screen ===` branches through the `router/screens.js` registry

- **Category:** debt
- **Severity:** low
- **Domain:** dungeon-scholar
- **Discovered by:** scholar-resolver
- **During:** resolving the App.jsx God-component entry

**Description:**
The App.jsx God-component entry was resolved in three parts (see `RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`): the tutorial auto-condition `switch` moved to `game/tutorial.js`, the modal-visibility flag cluster moved behind a `useAppModals()` hook, and a screen registry was added at `router/screens.js` (now the single source of truth for the valid-screen list and the course-set / sealed gating sets). What remains is the deepest structural piece: App.jsx still renders the ~22 `{screen === 'x' && (<Screen .../>)}` branches inline. Collapsing that ladder into a registry-driven `<ActiveScreen />` is valuable but was held back from the resolver run because App.jsx has no component-level test (`App.test.jsx` does not exist), so a blind prop-threading rewrite of every screen is not safely verifiable.

**Proposed fix / improvement:**
- [ ] Add a minimal `App.test.jsx` smoke test (mount + switch a few screens + open/close a modal) so the refactor is verifiable.
- [ ] Extend `router/screens.js` to map each screen id to its lazy component + a props selector, then replace the inline `screen === ...` ladder with a single `<ActiveScreen screen={screen} ctx={...} />`.

**Related files:** `src/App.jsx`, `src/router/screens.js`, `src/hooks/useAppModals.js`, `src/game/tutorial.js`

**Related entries:** Resolved — "`src/App.jsx` is a ~1,700-line God-component" (this run's partial resolution; this is the tracked remainder).

# Low-severity polish / info

*(none currently logged)*

# Design gotchas (warnings for future agents)

*(none currently logged)*

---

# Info / observations

*(none active)*

---

> dungeon-scholar active bugs / debt: [`ISSUES-LOG-DUNGEON-SCHOLAR.md`](./ISSUES-LOG-DUNGEON-SCHOLAR.md). Resolved dungeon-scholar entries: [`RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./RESOLVED-ISSUES-DUNGEON-SCHOLAR.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). BMO suggestions: [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md).
