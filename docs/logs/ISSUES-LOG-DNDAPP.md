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

### [2026-06-24] Web DM: dead client-side `buildDmSystemPrompt` (+ orphaned `DM_TAGGING_DIRECTIVE`/`DM_ROLE`)

- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** scheduled error scan — `npm run dead-code` (knip, the non-blocking CI gate) reports an unused export

**Description:**
`src/web/ai-mutations.ts` exports `buildDmSystemPrompt(ctx)` (assembles `DM_ROLE` + `DM_TAGGING_DIRECTIVE` + live `activeCreatures`/`gameState`), but nothing imports it (`grep -rn buildDmSystemPrompt src` → only the definition). `DM_TAGGING_DIRECTIVE` and `DM_ROLE` are likewise only referenced from inside that dead function, so they are effectively orphaned too (knip suppresses them via `ignoreExportsUsedInFile`, so it only surfaces `buildDmSystemPrompt`). The web DM path (`web-api.ts` `chatStream`) was migrated to the **server-owned** `/api/dnd/public/dm` endpoint where the Pi builds the system prompt; the client now only sends `{message, history, context}`. The client-side prompt builder is leftover from the pre-migration design.

**Hypothesis / root cause:** Prompt ownership moved client→server (`/api/dnd/public/dm`); the now-unused client builder + its constants were not removed.

**Proposed fix / improvement:**
- [ ] Delete `buildDmSystemPrompt`, `DM_TAGGING_DIRECTIVE`, `DM_ROLE`, `DmPromptContext`, and the `capJson` helper if it has no other caller — keeping only `parseAiMutations` (still used by `web-api.ts` + tests). Confirm `npx knip` then reports no unused export here.

**Related files:** `dnd-app/src/web/ai-mutations.ts`, `dnd-app/src/web/web-api.ts`

### [2026-06-24] Web DM: contradictory comments about whether structured mutations are produced

- **Category:** docs, debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** scheduled error scan — reading `web-api.ts` `chatStream` while triaging the dead `buildDmSystemPrompt`

**Description:**
Inside the single `chatStream` function in `src/web/web-api.ts`, two adjacent comment blocks make opposite claims. The first (just above the handler) says: *"Structured mutations (statChanges/dmActions) are not produced by the HTTP agent yet, so those are emitted empty — a known parity gap vs. desktop."* The second (just above the `fetch`) says: *"the Pi runs the LLM with OUR system prompt (role + action-tag contract + live state), so tag emission is reliable."* The code itself runs `parseAiMutations(text)` on the server response and emits whatever tags are present, so at minimum one comment is stale. A future reader cannot tell from the source whether web structured mutations work or are a known gap.

**Hypothesis / root cause:** The "not produced yet / known parity gap" comment predates the move to the dedicated server-owned `/api/dnd/public/dm` endpoint and was not updated; the newer "tag emission is reliable" comment describes current/intended behavior.

**Proposed fix / improvement:**
- [ ] Confirm whether `/api/dnd/public/dm` actually emits `[STAT_CHANGES]`/`[DM_ACTIONS]` tags, then delete the stale comment and keep a single accurate statement of web↔desktop mutation parity.

**Related files:** `dnd-app/src/web/web-api.ts` (`chatStream`)

### [2026-06-24] Unused devDependency `@langchain/langgraph` left in package.json

- **Category:** config, debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** scheduled error scan — `npm run dead-code` (knip) reports an unused devDependency

**Description:**
`@langchain/langgraph` (`^1.4.5`, package.json:186) is the only `@langchain/*` package declared and is imported nowhere (`grep -rn langgraph src scripts` → none). It was orphaned by commit `277ff977` ("chore(dnd-app): remove ~10.3k LOC of retired one-time tooling", 2026-06-22), which deleted the code that used it but left the dependency declared. It bloats `node_modules`/install time and keeps knip's dead-code baseline dirty.

**Hypothesis / root cause:** Tooling-removal commit `277ff977` dropped the consumer but not the `package.json` entry (and its `package-lock.json` subtree).

**Proposed fix / improvement:**
- [ ] `npm uninstall @langchain/langgraph` (removes it from `package.json` + `package-lock.json`); re-run `npx knip` to confirm the "Unused devDependencies" finding clears.

**Related files:** `dnd-app/package.json`

### [2026-06-24] README doc-counts drift; `sync:doc-counts` not gated by CI and has no dry-run mode

- **Category:** docs, config
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** dnd-errors
- **During:** scheduled error scan — running `scripts/build/sync-doc-counts.mjs` surfaced uncommitted doc drift

**Description:**
The auto-maintained file-count claims in the README files are stale. `dnd-app/README.md` says *"Current baseline: 849 test files"* while the tree now has 850–851 dnd-app test files (vitest ran **851** test files / 8261 tests this scan); the repo-root `README.md` ("849 test files" / "61 pytest files") and `bmo/README.md` ("61 test files") are likewise behind (actual 850/62). Running `node scripts/build/sync-doc-counts.mjs` rewrites 5 sites to the correct counts, confirming the drift. Two contributing gaps: (1) `sync:doc-counts` is **not** part of `check:full` nor referenced by any `.github/workflows/*.yml`, so nothing fails when the counts drift; (2) the script has **no `--check`/dry-run mode** — it always writes — so it cannot be used as a non-mutating CI guard as-is. (Note: only the `dnd-app/README.md` count is in-domain here; the root/bmo counts are noted for context and belong to the BMO domain.)

**Hypothesis / root cause:** `sync:doc-counts` is a manual, write-only helper with no CI hook, so counts silently fall behind as test files are added.

**Proposed fix / improvement:**
- [ ] Add a `--check` (dry-run, non-zero exit on drift) mode to `sync-doc-counts.mjs`.
- [ ] Wire `npm run sync:doc-counts -- --check` into `check:full` and/or the dnd-app CI workflow so doc-count drift is gated.

**Related files:** `dnd-app/scripts/build/sync-doc-counts.mjs`, `dnd-app/README.md`, `dnd-app/package.json`, `README.md`, `bmo/README.md`

---

> dnd-app future ideas / design gotchas / observations: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md). Security (any domain): [`SECURITY-LOG.md`](./SECURITY-LOG.md) (gitignored). Resolved dnd-app issues: [`RESOLVED-ISSUES-DNDAPP.md`](./RESOLVED-ISSUES-DNDAPP.md). BMO issues: [`BMO-ISSUES-LOG.md`](./BMO-ISSUES-LOG.md).
