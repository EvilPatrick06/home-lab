# Suggestions log (split by domain)

This file is a **compatibility pointer**. Future ideas, design gotchas, and notes are split by domain:

- **BMO:** [`BMO-SUGGESTIONS-LOG.md`](./BMO-SUGGESTIONS-LOG.md)
- **dnd-app:** [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md)
- **dungeon-scholar:** [`SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)

How to triage: [`LOG-INSTRUCTIONS.md`](./LOG-INSTRUCTIONS.md)

---

## Cross-cutting / repo-wide suggestions

> Whole-repo structural + convention items (`Domain: both`). Per-project items live in the domain-split logs.

### [2026-06-24] Monorepo subproject metadata — oracle-worker README + description added; LICENSE convention still open

- **Category:** docs, debt
- **Severity:** low
- **Domain:** both
- **Discovered by:** overall-cleanup
- **During:** scheduled overall-cleanup cross-cutting scan (2026-06-24)

> **2026-06-24 (overall-resolver, user-approved):** Partially resolved on branch `auto/overall-resolver`. **Done:** added `oracle-worker/README.md` (what it is, dev/deploy via wrangler, link back to dungeon-scholar) and filled the empty `oracle-worker/package.json` `description`. **Still open (kept here):** the LICENSE convention — a root `LICENSE` + a duplicate `dnd-app/LICENSE`, with none in `dungeon-scholar`/`bmo`/`oracle-worker`. Which way to standardise (single root LICENSE covering all subprojects vs. a LICENSE per subproject) is a human/licensing decision the approval did not resolve, so it is left for a human call rather than guessed.

**Remaining proposed fix:**
- [x] Add `oracle-worker/README.md`.
- [x] Fill `oracle-worker/package.json` `description`.
- [ ] Decide the LICENSE convention: keep a single root `LICENSE` (drop the duplicate `dnd-app/LICENSE`, document root coverage) **or** add `LICENSE` to every subproject — not the current two-of-five.

**Blocked by:** The LICENSE half is a (small) human/licensing decision — note it, don't guess.

**Related files:** `LICENSE`, `dnd-app/LICENSE`, `oracle-worker/`, `oracle-worker/package.json`, `README.md`
