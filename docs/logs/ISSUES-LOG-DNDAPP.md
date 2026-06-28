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

### [2026-06-23] Cloud-sync residual: book config/PDFs not synced; binary re-hashed each reconcile

> **2026-06-28 (dnd-resolver) — approved, not done this run.** Syncing book config + custom PDFs and a manifest-diff to skip unchanged re-hashing is feature-sized work on the sync engine (new domain serialization + change-keys); left for a focused run rather than shipping it unverified onto the shared branch.

> _dnd-resolver 2026-06-24: approved but deferred this run - the manifest-diff + book-file sync is feature-sized work left for a focused effort (see SUGGESTIONS-LOG note)._

- **Category:** debt
- **Severity:** low
- **During:** user-accounts / cloud-sync feature

**Description:**
The sync engine now covers ALL user-data domains (`src/renderer/src/services/sync/domains.ts`): characters, campaigns, bastions, custom-creatures, homebrew, shop-templates, map-library, **settings** (device-local/secret stripped; theme+accessibility applied on pull), **game-state**, **ai-conversations**, **bans**, **book-data**, and the binary **image-library** + **audio** (packed container, byte-cached). Two residual gaps: (1) book CONFIG + custom PDF files aren't synced — only per-book bookmarks/annotations are, so custom-book notes re-attach only if the same PDF is re-imported with the same id (core books are fine). (2) Each reconcile re-serializes + re-hashes every entity; binary bytes are cached (no re-read) but still re-hashed every cycle — a manifest-diff that skips unchanged entities via a cheap metadata change-key would cut reconcile cost for large libraries.

## Low
