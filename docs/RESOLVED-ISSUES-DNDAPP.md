# dnd-app Resolved Issues

> **Archive of resolved dnd-app-domain entries** moved out of [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md) / [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md) — kept here so the active logs stay lean while preserving fix history.
>
> When fixing an entry, **move** it here (don't delete) and append resolution metadata. Resolved security entries (any domain) go in [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md) (gitignored), not here.
>
> Sibling logs:
> - BMO resolved → [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md)
> - Resolved security (any domain, gitignored) → [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md)
>
> Newest first.

---

### [2026-04-25] dnd-app Vitest: 30 failing tests (633 files / 6137 tests)

- **Original severity:** medium
- **Category:** test
- **Domain:** dnd-app
- **Discovered by:** Cursor agent
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** Full suite had 9 failed files / 30 failed tests (Pixi mocks, TokenContextMenu harness, etc.).

**Resolution:** Renderer test suite now passes: **635 files / 6299 tests** (see `npm test`). Remaining stderr lines from `data-provider` in some page tests are logged warnings, not failing assertions.

**Related files:** (various test mocks and components addressed in 2026-04-24–25 dnd-app cleanup)

---

### [2026-04-24] `import-export.ts` wrote arbitrary `localStorage` keys from imported backups — no key allowlist

- **Original severity:** low
- **Category:** debt, security
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** Import loop used `localStorage.setItem` for any key present under `payload.preferences`.

**Resolution:** Added `isImportablePreferenceKey()` — `dnd-vtt-` prefix, max length 128, pattern `^dnd-vtt-[\\w.-]+$`. Used for both **export** (`gatherLocalStoragePreferences`) and **import** preference restore. Crafted backups cannot inject keys outside that shape.

**Related files:** `dnd-app/src/renderer/src/services/io/import-export.ts`

---

### [2026-04-24] `ANALYZE=1 npm run build` fails — `rollup-plugin-visualizer@7` is ESM-only but `electron.vite.config.ts` used CJS `require()`

- **Original severity:** low
- **Category:** bug, debt, config
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** `require('rollup-plugin-visualizer')` threw `ERR_PACKAGE_PATH_NOT_EXPORTED` when `ANALYZE=1`.

**Resolution:** `analyzePlugin()` is async and uses `await import('rollup-plugin-visualizer')`. Root config is `defineConfig(async () => ({ ... }))` so the plugin loads at config resolution time. `ANALYZE=1 npm run build` completes and writes `bundle-stats.html`.

**Related files:** `dnd-app/electron.vite.config.ts`

---

### [2026-04-24] `bmo:sync-event` IPC used string literals instead of `IPC_CHANNELS` (and initiative channel)

- **Original severity:** low
- **Category:** debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** `bmo-bridge.ts` called `forwardToRenderer('bmo:sync-event', ...)` and `'bmo:sync-initiative'` as literals.

**Resolution:** All three call sites use `IPC_CHANNELS.BMO_SYNC_EVENT` and `IPC_CHANNELS.BMO_SYNC_INITIATIVE` from `src/shared/ipc-channels.ts`.

**Related files:** `dnd-app/src/main/bmo-bridge.ts`, `dnd-app/src/shared/ipc-channels.ts`

---

### [2026-04-24] `tools/*.js` referenced the old `Tests/` directory and `knip-summary.js` read a broken path

- **Original severity:** low
- **Category:** docs, debt, portability
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** Comments and `knip-summary.js` pointed at `Tests/`; `run-audit.js` help text and report paths were stale.

**Resolution:** Scripts under `dnd-app/tools/` now reference `tools/` in usage strings and reports; `knip-summary.js` resolves `knip-report.json` next to the script via `path.join(__dirname, '..', 'knip-report.json')`.

**Related files:** `dnd-app/tools/run-audit.js`, `dnd-app/tools/knip-summary.js`, `dnd-app/tools/rename-to-kebab.js`, `dnd-app/tools/replace-console-logs.js` (as applicable)

---

### [2026-04-24] 38 dead cross-references in 5e content — `effect-definitions.json` + `adventures.json` `mapId`s

- **Original severity:** medium
- **Category:** bug, debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-24
- **Commit:** 9ceabc0c1b07130df457c1b61aab7dd3802d1bbd

**Original summary:** The heuristic 5e cross-ref audit reported 20 dead `sourceId` values in `game/mechanics/effect-definitions.json` and 18 dead `mapId` values in `adventures/adventures.json` (adventure chapter map labels with no matching declared `id` in the 5e tree).

**Resolution:** `sourceId` values were aligned to canonical IDs in `equipment/magic-items.json` and related data (belts: `belt-of-giant-strength-*`; tools, grimoire, amulet: `*-plus-N`; potions: `potion-of-*`; fighting styles: same ids as `fighting-styles.json` — `archery`, `defense`, `dueling`, `great-weapon-fighting`, `two-weapon-fighting`, `thrown-weapon-fighting`). For adventure `mapId` strings, added `adventures/chapter-map-reference-ids.json` — a lightweight registry of `{ "id": "<mapId>" }` entries so the audit sees stable IDs for chapter art labels while runtime still uses `builtInMapId` for PNG paths. `npm run validate:5e` runs `check-5e-cross-refs.mjs` with **exit code 1** if any dead refs remain.

**Related files:** `dnd-app/src/renderer/public/data/5e/game/mechanics/effect-definitions.json`, `dnd-app/src/renderer/public/data/5e/adventures/chapter-map-reference-ids.json`, `dnd-app/scripts/audit/check-5e-cross-refs.mjs`, `dnd-app/package.json` (`validate:5e`), `dnd-app/scripts/audit/dump-dead-refs.mjs` (optional dev helper to list dead refs by file), `.github/workflows/dnd-app-validate-5e.yml`

---

### [2026-04-24] CSP `connect-src` has hardcoded LAN IP `10.10.20.242` — overrides `BMO_PI_URL` env var

- **Original severity:** high
- **Category:** bug, config, security (defense-in-depth)
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** Renderer CSP allowed a fixed IP while `bmo-bridge.ts` used `BMO_PI_URL` (default `http://bmo.local:5000`), so `connect-src` and real fetch/WebSocket targets could disagree.

**Resolution (initial):** Added `src/main/bmo-csp.ts` with `bmoCspConnectFragment()` / `bmoCspConnectFragmentForBaseUrl()` — derives `connect-src` from the resolved BMO base URL instead of a hardcoded `10.10.20.242`, with `ws(s)://<host>:*` and `http(s)://<host>:*` (port wildcard; IPv6-safe host formatting). `src/main/bmo-csp.test.ts` covers the fragment. See follow-up below for settings and dynamic CSP.

**Follow-up (settings vs env):** Added `src/main/bmo-config.ts` — `getBmoBaseUrl()` and `applyBmoBaseUrlFromSettings()` so the active URL is **saved `bmoPiBaseUrl` in `settings.json` → `BMO_PI_URL` → default** (same as product expectation). `bmo-bridge.ts` and `cloud-sync.ts` use `getBmoBaseUrl()` for all fetches. `app.whenReady` loads settings before the window; `SAVE_SETTINGS` reapplies after save. **CSP** is rebuilt on every `onHeadersReceived` so it updates without restart. **UI:** Settings → Cloud backup — **BMO Pi base URL** + **Save URL**. `AppSettings` + `preload` types; `docs/SETUP.md` + `dnd-app/README.md` updated.

**Related files:** `dnd-app/src/main/bmo-csp.ts`, `dnd-app/src/main/bmo-csp.test.ts`, `dnd-app/src/main/bmo-config.ts`, `dnd-app/src/main/index.ts`, `dnd-app/src/main/bmo-bridge.ts`, `dnd-app/src/main/cloud-sync.ts`, `dnd-app/src/main/ipc/storage-handlers.ts`, `dnd-app/src/main/storage/settings-storage.ts`, `dnd-app/src/renderer/src/pages/SettingsPage.tsx`, `dnd-app/src/preload/index.d.ts`, `docs/SETUP.md`, `dnd-app/README.md`

---

### [2026-04-24] `dnd-app/docs/IPC-SURFACE.md` is ~95% stale — 20 documented channels don't exist; 139 actual channels undocumented

- **Original severity:** high
- **Category:** docs, debt
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** The markdown doc listed fictional channel names and omitted most of `IPC_CHANNELS`.

**Resolution:** Added `dnd-app/scripts/build/gen-ipc-surface.mjs` to regenerate `docs/IPC-SURFACE.md` from `src/shared/ipc-channels.ts` (146 channels, grouped by the existing `// ===` section comments). Replaced the hand-written handler tables with the generated catalog plus short static sections (architecture, how to add a channel, debugging). `npm run gen:ipc-surface` runs the generator. Per-channel request/response shapes are not in scope — those remain in handler source and zod where present.

**Related files:** `dnd-app/docs/IPC-SURFACE.md`, `dnd-app/scripts/build/gen-ipc-surface.mjs`, `dnd-app/package.json` (`gen:ipc-surface` script), `dnd-app/src/shared/ipc-channels.ts`

---

### [2026-04-24] AI context-builder + SRD provider load monster data from a non-existent path — AI DM silently has no creature stats

- **Original severity:** high
- **Category:** bug
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit)

**Original summary:** Code loaded `creatures/{monsters,creatures,npcs}.json` but the data lives under `dm/npcs/`, so the in-memory cache stayed empty and SRD creature blurbs never matched.

**Resolution:** `context-builder.ts` now loads `dm/npcs/monsters.json`, `dm/npcs/creatures.json`, and `dm/npcs/npcs.json`. `srd-provider.ts` uses `dm/npcs/monsters.json` for creature lookup. Load failures log at `ERROR` instead of `WARN`. Added `src/main/ai/monster-data-paths.test.ts` to assert the three files exist, parse as arrays, and contain `id` fields (aligned with `getDataDir()` dev layout under `src/renderer/public/data/5e`).

**Related files:** `dnd-app/src/main/ai/context-builder.ts`, `dnd-app/src/main/ai/srd-provider.ts`, `dnd-app/src/main/ai/monster-data-paths.test.ts`

---

### [2026-04-24] dnd-app release pipeline is broken — `package.json` references scripts at old paths after `scripts/build/` reorg

- **Original severity:** critical
- **Category:** bug, config
- **Domain:** dnd-app
- **Discovered by:** Claude Opus
- **Resolved by:** Cursor agent
- **Date resolved:** 2026-04-25
- **Commit:** (include when you commit — fixes were uncommitted in session)

**Original summary:** `build:index` and `prerelease` in `dnd-app/package.json` still pointed at `scripts/build-chunk-index.mjs` and `scripts/prerelease-clean.mjs` after files moved to `scripts/build/`, so `npm run build:win` / `npm run release` failed before `electron-vite build`. `build-chunk-index.mjs` and `prerelease-clean.mjs` also used one `..` too few from `scripts/build/`, so they targeted `scripts/` instead of the dnd-app root for `resources/` and `dist/`.

**Resolution:** Updated `package.json` to `node scripts/build/build-chunk-index.mjs` and `node scripts/build/prerelease-clean.mjs`. Set project-root resolution in both `.mjs` files (`ROOT` / `distDir` from `scripts/build/`). Aligned `5.5e References` with the monorepo layout: added `scripts/lib/5e-refs-path.ts` (`get5eReferencesDir()`), the same two-path resolution in `build-chunk-index.mjs`, dev lookup in `src/main/ai/chunk-builder.ts` (`../5.5e References` vs in-app), and refactored extract/generate/audit scripts to use the helper. Regenerated `dnd-app/resources/chunk-index.json` (5383 chunks). Optional follow-ups from the log (CI smoke for `prerelease` + `build:index`, full `build:win` on a Windows builder) not done in the same pass.

**Related files:** `dnd-app/package.json`, `dnd-app/scripts/build/build-chunk-index.mjs`, `dnd-app/scripts/build/prerelease-clean.mjs`, `dnd-app/scripts/lib/5e-refs-path.ts`, `dnd-app/src/main/ai/chunk-builder.ts`, `dnd-app/resources/chunk-index.json`

---

### [2026-04-23] Pi-deploy duplicate `vtt_sync.py`

- **Original severity:** low
- **Category:** debt
- **Domain:** dnd-app, bmo *(primary: bmo — agent module — also archived in [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md))*
- **Resolved by:** Claude Opus
- **Commit:** `2c52d5a`
- **Date resolved:** 2026-04-23
- **Resolution:** `scripts/pi-deploy/vtt_sync.py` was byte-identical to `bmo/pi/agents/vtt_sync.py`. Archived the pi-deploy copy. `apply_patch.py` moved to `bmo/pi/scripts/apply_patch.py` (canonical location for BMO deploy tooling). The dnd-app side of this dependency surfaces only because the script lived under `scripts/pi-deploy/` (cross-domain tooling) — no in-app code paths affected.

---

> BMO resolved entries: [`BMO-RESOLVED-ISSUES.md`](./BMO-RESOLVED-ISSUES.md). Resolved security (gitignored): [`RESOLVED-SECURITY-ISSUES.md`](./RESOLVED-SECURITY-ISSUES.md). Active dnd-app bugs: [`ISSUES-LOG-DNDAPP.md`](./ISSUES-LOG-DNDAPP.md). Active dnd-app suggestions: [`SUGGESTIONS-LOG-DNDAPP.md`](./SUGGESTIONS-LOG-DNDAPP.md).
