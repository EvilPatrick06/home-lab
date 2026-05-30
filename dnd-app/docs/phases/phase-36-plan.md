# Phase 36 — Pi-hosted library (remote 5e data + cache + fallback)

> Authored 2026-05-30. Builds on Phase 32 (Pi-client plumbing) + the i18n-era
> data-provider. Follow `INSTRUCTIONS.md`.

## Context
The renderer's D&D 5e library data lives in `src/renderer/public/data/5e/**` and
loads through a single choke point: `data-provider.ts` `loadJson(path)` →
`window.api.game.loadJson(path)` (IPC → main reads the bundled file). Every
category loader routes through `loadJson`. The data is the **canonical source**
and ships in the app bundle.

Phase 36 lets the app **optionally** load that JSON from the always-on Pi (an
HTTP "library API") so content can be served/updated centrally, with a persistent
cache and an unconditional fallback to the bundled file. Per the
`docs/DATA-FLOW.md` rule "BMO and dnd-app do NOT read each other's data dirs —
HTTP only," a build-time **seed script** copies the JSON tree (NOT the 82 MB
`maps/`) into a Pi-served dir; the runtime path is HTTP.

**Additive + opt-in + safe-by-default.** A new `piLibraryEnabled` setting defaults
**off**; with it off, `loadJson` behaves exactly as today. With it on, `loadJson`
tries the Pi (cached by content hash), and on ANY miss/error falls back to the
bundled file — so the canonical bundle is always the floor. No category can break.

## Depends on / blocks
- **Depends on:** Phase 32 Pi-client plumbing (`resolveBmoBaseUrl`) — shipped.
- **Blocks:** nothing (last deferred phase).

## Files
**Pi (Python):**
- `bmo/pi/scripts/seed-5e-library.sh` (NEW) — copy `dnd-app/.../public/data/5e` JSON
  (excluding `maps/`) → `bmo/pi/data/5e-library/` (gitignored). Mirrors
  `sync-shared-5e-json.sh` (build-time cross-dir copy is the established exception).
- `bmo/pi/routes/library_api.py` (NEW) — blueprint: `GET /api/library/manifest`
  (per-file rel-path → sha256/size) + `GET /api/library/file?path=<rel>` (path-jailed
  JSON serve). Base dir configurable (defaults to `data/5e-library/`).
- `bmo/pi/app.py` — `register_library(app)` + `/api/library*` CORS/cache headers.
- `bmo/pi/tests/test_library_api.py` (NEW).
- `.gitignore` — ignore `bmo/pi/data/5e-library/`.

**dnd-app (TS):**
- `src/renderer/src/services/library/remote-library.ts` (NEW, allowlisted dir) —
  manifest fetch + per-path fetch + `localStorage` cache keyed by content hash +
  `data/5e/...`-path → Pi-rel-path mapping. Injected `fetch` for tests.
- `src/renderer/src/services/data-provider.ts` (OR `services/library/data-provider.ts`) —
  `loadJson` tries `remote-library` first when enabled, else/on-error the existing
  `window.api.game.loadJson`. (Verify exact path in 36c; add to boundary allowlist
  if outside `services/library/`.)
- `src/renderer/src/stores/use-config-store.ts` — `piLibraryEnabled: boolean` (default false).
- `src/renderer/src/pages/SettingsPage.tsx` — a toggle in the Pi/cloud section.

## Sub-phases
- **36a** — seed script + `.gitignore`.
- **36b** — Pi `library_api.py` blueprint (manifest + path-jailed file serve) + register + CORS/cache + tests.
- **36c** — dnd-app `remote-library.ts` (manifest + cache + path map + fallback signal) + tests; integrate into `loadJson`.
- **36d** — `piLibraryEnabled` config + Settings toggle.

## Sub-phase details
### 36a — seed script
`seed-5e-library.sh`: `rsync`/`cp -r` the 5e JSON tree minus `maps/` into
`bmo/pi/data/5e-library/`. Idempotent. Print a count. Gitignore the target (the
served copy is generated, not committed — keeps the repo lean, mirrors how the
Pi's other `data/` runtime dirs are handled). If never run, the dir is absent →
the manifest is empty → the app falls back to bundled (the feature is dormant
until the Pi is seeded, which is correct opt-in infra).

### 36b — Pi library API
Blueprint under `/api/library`. `LIBRARY_DIR` defaults to `data/5e-library/`
(overridable for tests). `manifest`: walk the dir, return `{version, files: {
<relpath>: {sha256, size} }}` (empty if dir absent). `file?path=<rel>`: realpath-jail
under `LIBRARY_DIR` (reject `..`/escapes with 400/403), 404 if missing, serve JSON
with `Cache-Control` + `ETag: <sha256>`. Rides open-by-default auth; `/api/library*`
added to the CORS allowlist (read-only public content). **Acceptance:** tests
(pointing `LIBRARY_DIR` at the committed `data/5e/` fixtures) cover manifest shape,
a successful file fetch, path-traversal rejection, and a 404.

### 36c — dnd-app remote loader + integration
`remote-library.ts`: `mapDataPathToRel(path)` turns `./data/5e/spells/spells.json`
→ `spells/spells.json`; `loadRemote(path)` → resolve base URL, GET the cached
manifest (per session), look up the rel-path's hash, return the `localStorage`-cached
JSON if the hash matches, else fetch `file?path=`, cache under the hash, return it;
returns `null` on any miss/error (caller falls back). `loadJson` gains: `if
(piLibraryEnabled) { const r = await loadRemote(path); if (r != null) return cache(r) }`
then the existing bundled load. **Acceptance:** unit tests with an injected fetch +
a localStorage shim — manifest cache, hash-hit serves cache, hash-miss refetches,
error/disabled → null (fallback). `data-provider`'s existing tests stay green.

### 36d — config + settings
`piLibraryEnabled` in `use-config-store` (persisted, default false). A Settings
toggle ("Load library content from the Pi") near the existing Pi/cloud controls,
with a one-line explainer that the bundled data is always the fallback.

## Constraints
- **Default off → zero behavior change.** With the toggle off, `loadJson` is the
  current bundled path verbatim.
- **Bundled file is always the fallback** — remote is best-effort; any error,
  missing manifest entry, disabled flag, or unreachable Pi → bundled.
- Runtime is HTTP-only (no cross-dir reads); the seed script is build-time.
- `maps/` (82 MB) is NOT served (JSON library only).
- 4-gate green; `pytest bmo/pi/tests/` green. One end-of-phase commit; one release.

## Completed
- 36a — DONE (`bmo/pi/scripts/seed-5e-library.sh`) — copies the canonical 5e JSON
  tree (maps/ excluded) → `bmo/pi/data/5e-library/` (gitignored, `.gitignore`
  updated). Verified: 3029 files, 23 MB.
- 36b — DONE (`bmo/pi/routes/library_api.py`) — `/api/library/manifest` (relpath →
  sha256/size + a content-derived version) + `/api/library/file?path=` (path-jailed
  JSON serve + ETag + Cache-Control). Registered in `app.py` + `/api/library*` CORS.
  Empty/dormant until seeded. 8 tests (`tests/test_library_api.py`): manifest shape,
  content-derived version, file serve + ETag, 404, 400 (missing/non-json path),
  traversal rejection, empty-dir → empty manifest. All pass.
- 36c — DONE (`src/renderer/src/services/library/remote-library.ts`) —
  `loadRemoteLibrary(path)`: gated on `piLibraryEnabled`, maps `./data/5e/...` →
  served relpath, fetches the manifest (per-session cache), serves from a
  `localStorage` cache keyed by the file's content hash (refetch on hash change),
  returns `null` on any miss/error → caller falls back to bundled. Integrated into
  `data-provider.loadJson` (remote-first, bundled fallback). 9 unit tests (injected
  fetch/storage) + the data-provider/boundary tests stay green. tsc web+node 0.
- 36d — DONE — `piLibraryEnabled?: boolean` added to the settings type
  (`preload/index.d.ts`) + Zod schema (`settings-storage.ts`); a toggle in
  SettingsPage's CloudBackupSection (load/save via `window.api`), default off, with
  an explainer that bundled data is the fallback. New i18n keys added + key-check
  green (5907 keys).
