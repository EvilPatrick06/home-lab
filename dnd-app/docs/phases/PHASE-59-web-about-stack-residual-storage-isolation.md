# PHASE-59 — Web About tech-stack residual & shared-origin storage isolation

> Authored from the 2026-06-29 WEB-build QA report (Dungeon Table Online, v2.6.4). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md. PLANNING ONLY — this phase authors the plan; no app code changes here.

## Goal

Clear the **two low-severity portability residuals** the 2026-06-29 WEB pass flagged after confirming the larger About web-framing finding (PHASE-57 WEB-ABOUT-1 / 57A) and the storage-namespacing finding (PHASE-56) had landed. Both are tails of already-shipped work:

1. **WEB-ABOUT-2** — PHASE-57 57A relabeled the *first* `TECH_STACK` entry ("Electron 40 / Desktop framework" → "Vite / Web runtime") on the web build, but **two desktop-specific mentions remain ungated**: the `electron-vite` build-tooling entry (still shown on web) and the literal "Electron" inside the open-source-libraries paragraph. The browser edition is built with plain Vite (`npm run build:web`), not electron-vite, and does not ship Electron.
2. **WEB-STORAGE-1** — PHASE-56 fixed the *collision risk* by namespacing all VTT localStorage keys (`dnd-vtt-*` / `dndapp:*`), so this is **downgraded** from the prior report. The residual is purely **isolation/clearing ergonomics**: the web build still shares the `bmo.mybmoai.work` origin with unrelated BMO-app storage, so per-app data is not trivially separable. This is an owner-decision / deployment item (subdomain or path-scoped storage), not a correctness bug.

Both are low severity. WEB-ABOUT-2 is a small, self-contained code fix; WEB-STORAGE-1 is primarily a documented owner decision.

## Dependencies & cross-phase notes

- **Directly continues PHASE-57 (57A) on the same file.** 57A added the `isWebBuild()`-gated `techStack` const in `AboutPage.tsx` (`:29-30`) and the web multiplayer-feature ternary (`:40`). It replaced only `TECH_STACK[0]` (the Electron entry). WEB-ABOUT-2 is the **remaining tail**: `TECH_STACK[10]` (`electron-vite`) and the OSS-libraries string. Because 57A already established the web-override pattern (`isWebBuild() ? [...] : TECH_STACK`), this fix slots straight into it. **If PHASE-57 has not yet merged when this runs, fold WEB-ABOUT-2 into 57A** rather than churning `AboutPage.tsx` twice.
- **Continues PHASE-56 on storage.** PHASE-56 did the namespacing migration (`utils/storage-migrations.ts`) that closes the collision risk; this phase records the residual isolation item and (optionally) pins a stray un-namespaced key found during investigation (see WEB-STORAGE-1).
- **i18n key discipline:** WEB-ABOUT-2's OSS-libraries fix edits an existing string value (or adds a web variant) — follow the i18n contract (en+es, regenerate `generated-keys.ts`, parity test) for any new/changed key.
- **`isWebBuild()` is already imported and used in `AboutPage.tsx`** (`utils/platform.ts`, used at `:29`, `:40`, `:166-167`), so the build-target signal is in hand — WEB-ABOUT-2 just extends it to two more spots.

## Verified findings

All verification was against the live tree (worktree `auto/dnd-phase-maker`, v2.6.4 / commit `5d4fd98`).

### WEB-ABOUT-2 (low) — About tech-stack still lists desktop-only `electron-vite` (+ "Electron" in OSS libs) on the web edition

**Status: confirmed in source — the web `techStack` override only replaces the first entry; the build-tooling entry and the OSS-libraries string are ungated.**

On the web build the About page advertises two desktop-only mentions:

1. **`electron-vite` build-tooling entry.** `TECH_STACK` (`pages/AboutPage.tsx:10-21`) ends with `{ name: 'electron-vite', detailKey: 'pages.aboutPage.techBuildTooling' }` (`:21`; `techBuildTooling` = "Build tooling", `en.json:5685`). The web override only swaps index 0: `const techStack = isWebBuild() ? [{ name: 'Vite', detailKey: 'pages.aboutPage.techWebRuntime' }, ...TECH_STACK.slice(1)] : TECH_STACK` (`:29-30`). Since `electron-vite` lives at the **end** of the array, `TECH_STACK.slice(1)` keeps it — so the web Tech-Stack grid (`:316` `techStack.map(...)`) shows both "Vite — Web runtime" **and** "electron-vite — Build tooling". The web edition is built with plain Vite (`npm run build:web`), so the `electron-vite` entry is inaccurate on web.
2. **"Electron" in the open-source-libraries paragraph.** `openSourceLibraries` (`en.json:5724`) = "This application uses open-source libraries under MIT and other permissive licenses, including React, **Electron**, PeerJS, PixiJS, Zustand, Tailwind CSS, and React Router." It is rendered ungated (`AboutPage.tsx:395` `{t('pages.aboutPage.openSourceLibraries')}`). The web edition does not ship Electron, so listing it among "libraries this application uses" is inaccurate on web.

**Reproduction:** Web app → About & Data → scroll to TECH STACK → the grid still shows an "electron-vite / Build tooling" card alongside the new "Vite / Web runtime" card; scroll to the open-source-libraries paragraph → it still names "Electron".

**Expected:** on the web build the tech-stack omits/relabels `electron-vite` (e.g. drop it, or it is already represented by the "Vite" card) and the OSS-libraries line does not name Electron.

**Root cause (file:line):** `pages/AboutPage.tsx:21` (`electron-vite` entry, end of `TECH_STACK`), `:29-30` (web `techStack` override replaces only index 0 — `slice(1)` retains `electron-vite`), `:316` (render); string `i18n/locales/en.json:5724` (`openSourceLibraries`, names "Electron"), rendered `pages/AboutPage.tsx:395`. Existing gate signal: `utils/platform.ts` `isWebBuild` (already used `:29,40,166`).

Verification:

```bash
cd dnd-app/src/renderer/src
sed -n '10,31p' pages/AboutPage.tsx                       # TECH_STACK + web override (only index 0)
grep -n 'openSourceLibraries\|electron-vite\|techBuildTooling' pages/AboutPage.tsx i18n/locales/en.json
```

**Fix direction:** in the existing `techStack` web override (`:29-30`), also drop (or relabel) the trailing `electron-vite` entry on web — e.g. build the web array by filtering out the build-tooling entry, or compose the web stack explicitly. For the OSS-libraries line, add a web variant string (`openSourceLibrariesWeb`, en+es) that omits "Electron" and render it under `isWebBuild()` (mirroring the existing `featureMultiplayerWeb` / `webEditionNote` pattern from PHASE-56/57). Regenerate `generated-keys.ts`; keep parity green. Desktop strings/array stay the default — desktop unchanged. **Coordinate with PHASE-57** (same file) if 57 has not merged.

**Affected components:** `pages/AboutPage.tsx`, `i18n/locales/{en,es}.json`, `utils/platform.ts` (existing `isWebBuild`).

### WEB-STORAGE-1 (low, debt | portability — owner decision) — web build still shares origin `bmo.mybmoai.work` with unrelated BMO-app storage

**Status: confirmed — namespacing is in place (collision risk closed); the residual is isolation/clearing ergonomics + one stray un-namespaced key.**

The web build is served at `https://bmo.mybmoai.work/DungeonTableOnline/`, sharing the `bmo.mybmoai.work` origin (and therefore one localStorage/IndexedDB partition) with unrelated BMO apps (the QA run observed `bmo_laptop_mic`, `bmo_music_last_query`, `bmo-ide-state`, `bmo_weather_cached`, `bmo_cal_events`, `bmo_health_summary`, … alongside the VTT keys). PHASE-56 **closed the collision risk** by migrating VTT keys to a `dnd-vtt-*` / `dndapp:*` namespace (`src/renderer/src/utils/storage-migrations.ts` — e.g. `library-recent` → `dnd-vtt-library-recent`, `lobby-chat-` → `dnd-vtt-lobby-chat-`, `macro-storage-`/`builder-draft-` prefixed). So this finding is **downgraded** to isolation ergonomics: the two apps' data still co-mingle in one partition, so "clear just the VTT's data" or "export/separate per-app state" is not trivial.

**Residual pin (found during investigation, strengthens the isolation case):** at least one VTT localStorage key is still **un-namespaced** — `components/game/player/PlayerNotesPanel.tsx:28` `const STORAGE_PREFIX = 'player-notes-'` (used `:32`, `:51`). It is not in the `storage-migrations.ts` rename map, so player notes write bare `player-notes-<characterId>` keys onto the shared origin. (The QA run reported "all VTT keys namespaced," but the player-notes panel was likely not exercised — see the report's "Could not fully test.") This is a small namespacing gap in the otherwise-complete PHASE-56 migration.

**Reproduction:** Web app → DevTools → Application → Local Storage for `https://bmo.mybmoai.work` → VTT keys (`dnd-vtt-*`, `dndapp:*`) sit alongside unrelated `bmo_*` keys in one partition; open a player's notes panel in a game and observe a bare `player-notes-<id>` key with no `dnd-vtt-` prefix.

**Expected:** per-app data is trivially separable (own subdomain or path-scoped storage), and every VTT key carries the `dnd-vtt-*` / `dndapp:*` namespace.

**Root cause:** deployment topology — the web bundle is served under a **path** (`/DungeonTableOnline/`) on a **shared origin** (`bmo.mybmoai.work`), and browser storage is partitioned per-origin, not per-path; plus the residual bare key at `src/renderer/src/components/game/player/PlayerNotesPanel.tsx:28`. The serving path is defined by the Vite `base` (`/DungeonTableOnline/`) and the Pi deploy target (`/home/patrick/web-apps/DungeonTableOnline/`).

Verification:

```bash
cd dnd-app/src/renderer/src
grep -rn "player-notes-\|STORAGE_PREFIX" components/game/player/PlayerNotesPanel.tsx
grep -n "library-recent\|lobby-chat-\|dnd-vtt-" utils/storage-migrations.ts   # PHASE-56 rename map (player-notes- absent)
```

**Fix direction (owner decision — default is low-touch):**

- **Storage hygiene (small code fix, recommended):** add `player-notes-` → `dnd-vtt-player-notes-` to the `storage-migrations.ts` migrate-on-read map and update `PlayerNotesPanel.tsx` to use the namespaced prefix, completing PHASE-56's namespacing. (Self-contained; same pattern as the existing migrations.)
- **True isolation (deployment, owner decision):** give the web build its own subdomain (e.g. `dnd.mybmoai.work`) so it gets a dedicated storage partition — a Pi/Cloudflare-tunnel + Vite `base` change, not an app-logic change. **Default if the owner does not want the infra change: document the shared-origin trade-off** (namespacing already prevents collisions) and treat the isolation item as accepted-as-is.

**Affected components:** `src/renderer/src/components/game/player/PlayerNotesPanel.tsx` + `src/renderer/src/utils/storage-migrations.ts` (the residual-key fix); deployment config (Vite `base`, Pi serve path, Cloudflare tunnel) for the subdomain option — owner decision.

## Sub-phases

> Per-sub-phase cheap check: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` + the affected vitest file (+ i18n parity/generated-keys for any new string). CI runs the authoritative full gate on push. About/text effects implementer-verified on the deployed web build (`https://bmo.mybmoai.work/DungeonTableOnline/`).

### 59A — Web About `electron-vite` + OSS-libraries residual (WEB-ABOUT-2)

**Objective:** on the web build the About tech-stack omits/relabels `electron-vite` and the OSS-libraries line does not name Electron; desktop unchanged.

**Files:** `pages/AboutPage.tsx`, `i18n/locales/{en,es}.json`; reuse `utils/platform.ts` `isWebBuild`.

**Steps:**

1. Extend the web `techStack` override (`:29-30`) to also drop/relabel the trailing `electron-vite` entry (filter it out on web, or compose the web array explicitly). Desktop `TECH_STACK` stays default.
2. Add a web OSS-libraries string (`openSourceLibrariesWeb`, en+es) without "Electron" and render it under `isWebBuild()` at `:395` (mirror the `featureMultiplayerWeb` pattern). `npm run i18n:gen-keys`.
3. **Coordinate with PHASE-57** (same file) — if 57 hasn't merged, fold this into 57A.

**Acceptance:** `tsc -p tsconfig.web.json` clean; parity/generated-keys green; live web About shows no `electron-vite` card and no "Electron" in the OSS-libraries line; desktop About unchanged. Implementer-verified live.

### 59B — Shared-origin storage: complete namespacing + isolation decision (WEB-STORAGE-1)

**Objective:** every VTT key is namespaced; the shared-origin isolation trade-off is resolved (documented, or a subdomain is adopted by owner choice).

**Files:** default — `src/renderer/src/components/game/player/PlayerNotesPanel.tsx` + `src/renderer/src/utils/storage-migrations.ts` (residual-key namespacing); plus a short note in `i18n/README.md` or a deploy/portability doc for the shared-origin decision. Alternative — deployment config (Vite `base`, Pi serve path, Cloudflare tunnel) if the owner elects the subdomain.

**Steps:**

1. Add `player-notes-` → `dnd-vtt-player-notes-` to the migrate-on-read map and switch `PlayerNotesPanel.tsx` to the namespaced prefix (keep the migration so existing notes survive).
2. Resolve the isolation decision: **default** — document that the web build shares the `bmo.mybmoai.work` origin and that namespacing (not partitioning) is the chosen mitigation; close the QA item as accepted-with-rationale. **Alternative** — only if the owner wants true isolation, plan the dedicated-subdomain change (separate, deployment-scoped).

**Acceptance:** no bare (un-namespaced) VTT localStorage key remains (player-notes migrated); the shared-origin trade-off is documented (or a subdomain is adopted by owner decision); parity green if any string changed. Implementer/owner-verified.

## Completed

> _Not yet implemented — authored 2026-06-29 by phase-maker from the 2026-06-29 WEB QA report. To be implemented by the phase-executer per INSTRUCTIONS.md (web-build-only; desktop unchanged). 59A is a direct continuation of PHASE-57 57A; 59B completes PHASE-56's storage namespacing and records the shared-origin owner decision._
