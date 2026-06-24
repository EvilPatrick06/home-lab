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

### [2026-06-24] Stale superseded branch `feat/user-accounts-cloud-sync` won't merge — recommend delete

- **Category:** chore / repo-hygiene
- **Severity:** medium
- **Found by:** integrator (daily branch consolidation)
- **Responsible:** dnd-app domain owner (human-owned `feat/*` branch, not an `auto/<agent>`)

**Description:**
The integrator could not cleanly merge `feat/user-accounts-cloud-sync` into master (real conflicts in `dnd-app/src/renderer/src/pages/SettingsPage.tsx` plus add/add conflicts in `dnd-app/src/renderer/src/services/sync/{domains.ts,sync-engine.ts}`). **Root cause:** the branch's feature was already integrated into master via **squash PR #30** (`ba088b84 feat: user accounts + per-user cloud sync (Discord OAuth)`) and then *extended* by newer master commits — `b18c3747` (wire all remaining sync domains), `9e3d7617` (pause sync polling when tab hidden), `049e5a72` (knip cleanup). Because PR #30 was squash-merged, git shares no commit with the branch, so its now-old file versions collide as add/add. The branch's merge-base is the ancient `5cbbe926`; `git diff master..origin/feat/user-accounts-cloud-sync` would **revert 6478 lines across 288 files** — undoing the full-domain sync, the polling perf fix, and unrelated dungeon-scholar/qa-infra work. Merging it would be destructive, so the integrator left it untouched.

**What's needed:** Confirm the feature is fully captured on master (it is — see PR #30 + follow-ups) and **delete the stale branch** (`git push origin :feat/user-accounts-cloud-sync`). Left for the human owner because it is a `feat/*` branch and deletion of human-owned branches is outside the integrator's auto-cleanup scope. Do NOT merge it.

### [2026-06-23] Cloud-sync residual: book config/PDFs not synced; binary re-hashed each reconcile

- **Category:** debt
- **Severity:** low
- **During:** user-accounts / cloud-sync feature

**Description:**
The sync engine now covers ALL user-data domains (`src/renderer/src/services/sync/domains.ts`): characters, campaigns, bastions, custom-creatures, homebrew, shop-templates, map-library, **settings** (device-local/secret stripped; theme+accessibility applied on pull), **game-state**, **ai-conversations**, **bans**, **book-data**, and the binary **image-library** + **audio** (packed container, byte-cached). Two residual gaps: (1) book CONFIG + custom PDF files aren't synced — only per-book bookmarks/annotations are, so custom-book notes re-attach only if the same PDF is re-imported with the same id (core books are fine). (2) Each reconcile re-serializes + re-hashes every entity; binary bytes are cached (no re-read) but still re-hashed every cycle — a manifest-diff that skips unchanged entities via a cheap metadata change-key would cut reconcile cost for large libraries.

## Low

*(none currently logged)*

---

> dnd-app future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app issues: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
