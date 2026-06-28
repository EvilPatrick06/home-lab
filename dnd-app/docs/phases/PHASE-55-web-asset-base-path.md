# PHASE-55 — Web-build runtime asset base-path resolution

> Authored from the 2026-06-28 WEB-build QA report (Dungeon Table Online, v2.6.3). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Fix the one High-severity web-build regression that **re-reproduced in v2.6.3**: built-in map background images (and other runtime `public/data/...` assets) 404 on the browser build because their stored `./data/...` relative paths are loaded raw, ignoring the Vite `base = /DungeonTableOnline/`. Every preset map (Wizard's Tower, etc.) renders as an empty grid with a persistent "Failed to load map image" toast. Also harden the error toast that surfaces the failure so a transient asset error doesn't pin a non-dismissable banner over the canvas. PLANNING ONLY — this phase authors the plan; no app code changes here.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Self-contained web-build portability + a small UX hardening.
- **Sibling to the PHASE-45 web-portability sweep.** PHASE-45 gated *desktop-only affordances* behind `isWebBuild()`; this is the *asset-path* portability gap that sweep didn't cover. Reuse the `isWebBuild()` helper (`utils/platform.ts:10`) and the existing `import.meta.env.BASE_URL` precedent already used for the router basename (`main.tsx:35-36`).
- **Carried, not new.** The map-404 was logged in the prior WEB reports and is **unchanged in v2.6.3** — the v2.6.2→v2.6.3 diff touched campaign-detail managers, web DM cleanup, and multiplayer/cloud-relay networking, not asset paths. It had no phase doc of its own (phases 44-48 came from the 2026-06-22 report and don't cover asset base-path); this phase creates it.
- **Cross-cutting audit:** the fix should sweep *all* runtime `public/data` consumers (maps, portraits, sounds, fonts), not just the map loader, so the same sub-path-base miss doesn't lurk elsewhere.

## Verified findings

All verification was against the live tree (worktree `auto/dnd-phase-maker`, v2.6.3).

### WEB-AP-1 (high) — built-in map backgrounds 404 on the web build (base not applied to `./data/...` URLs)

**Status: confirmed in source; matches the QA report's same-origin fetch probes exactly.**

Built-in map records store `imagePath` as a root-or-cwd-relative `"./data/5e/maps/<id>.png"` — both in the bundled data (`dnd-app/src/renderer/public/data/5e/world/built-in-maps.json`, e.g. `"./data/5e/maps/wizards-tower.png"`) and where the wizard constructs assignments (`components/campaign/CampaignWizard.tsx:319`: `` imagePath: `./data/5e/maps/${assignment.builtInMapId}.png` ``). The map loader calls PixiJS `Assets.load(map.imagePath)` with that raw path (`components/game/map/map-canvas/use-map-background.ts:48`; the line above it builds `resolvedUrl = new URL(map.imagePath, window.location.href).href` only for a debug log — the actual load uses the **raw** `map.imagePath`, and even that `resolvedUrl` resolves against the route, not the base). The toast is set in the `catch` at `:78` (`Failed to load map image: ${map.imagePath}`).

On desktop (served from root) `./data/...` resolves fine. On the web build, Vite sets `base = /DungeonTableOnline/` (`vite.web.config.ts:19`) and the in-game route is `/DungeonTableOnline/game/<id>`, so the raw relative path either normalizes to origin-root `/data/...` (**404**) or resolves against the route to `/DungeonTableOnline/game/data/...` (the SPA fallback **HTML**, not the PNG → decode fails). The QA same-origin probes confirm: `GET /data/5e/maps/wizards-tower.png` → **Failed to fetch**; `GET /DungeonTableOnline/data/5e/maps/wizards-tower.png` → **200 image/png**; `GET data/5e/maps/...` (route-relative) → 200 but SPA-fallback HTML. The correct served location is under the base, so the loader must resolve asset paths against `import.meta.env.BASE_URL`. (No JS console error is emitted — `Assets.load(...)` is awaited inside a `try/catch` that only sets the toast — so the toast is the sole signal; see WEB-AP-2.)

**Reproduction:** Web app → My Campaigns → "QA Solo Game" → Open → **Play** with the built-in "Wizard's Tower" map active → blank grid + toast "Failed to load map image: /data/5e/maps/wizards-tower.png".

**Expected:** built-in map backgrounds render on the canvas in the web build, same as desktop.

**Root cause (file:line):** stored relative `imagePath` `dnd-app/src/renderer/public/data/5e/world/built-in-maps.json` + `components/campaign/CampaignWizard.tsx:319`; raw load without base `components/game/map/map-canvas/use-map-background.ts:48`; web base `dnd-app/vite.web.config.ts:19`; existing base precedent `main.tsx:35-36`.

Verification:

```bash
cd dnd-app
sed -n '44,80p' src/renderer/src/components/game/map/map-canvas/use-map-background.ts
grep -n '"imagePath"' src/renderer/public/data/5e/world/built-in-maps.json | head
sed -n '315,322p' src/renderer/src/components/campaign/CampaignWizard.tsx
grep -n 'base' vite.web.config.ts
grep -rn 'import.meta.env.BASE_URL' src/renderer/src/main.tsx
```

**Fix direction:** add a tiny `resolveAssetUrl(path)` helper that, for a `public/data`-style path, strips a leading `./` or `/` and prefixes `import.meta.env.BASE_URL` (a no-op on desktop where `BASE_URL` is `/`), and route `Assets.load` through it in `use-map-background.ts`. Prefer resolving at the **loader** (one chokepoint) over rewriting stored paths, so existing campaigns with persisted `./data/...` paths are fixed without a data migration. Then audit other runtime `public/data` consumers (portraits, sounds, fonts) and route them through the same helper.

**Affected components:** `components/game/map/map-canvas/use-map-background.ts`, a new `utils/asset-url.ts` (or extend `utils/platform.ts`), other runtime `public/data` consumers (portraits/sounds/fonts), `CampaignWizard.tsx` (only if normalizing at write-time is chosen instead).

### WEB-AP-2 (low) — map-load error toast is persistent (no auto-dismiss, no close affordance)

**Status: confirmed in source.**

The toast is plain conditional JSX on `bgLoadError` state with no timeout and no dismiss control: set via `setBgLoadError(msg)` in the loader catch (`use-map-background.ts:78`) and rendered at `components/game/map/MapCanvas.tsx:916-918` (`{bgLoadError && !initError && (…{bgLoadError}…)}`). It is only cleared on a *successful* reload (`setBgLoadError(null)` at `use-map-background.ts:59`). The QA report confirms it stayed pinned top-left across a `/roll 1d20+3` and opening game-settings. Even after WEB-AP-1, a sticky non-dismissable error banner is a UX problem for any transient asset error.

**Root cause (file:line):** toast state set `use-map-background.ts:78`; render with no dismiss/timeout `components/game/map/MapCanvas.tsx:916-918`.

Verification:

```bash
cd dnd-app/src/renderer/src
grep -n 'bgLoadError\|setBgLoadError' components/game/map/MapCanvas.tsx components/game/map/map-canvas/use-map-background.ts
sed -n '914,920p' components/game/map/MapCanvas.tsx
```

**Fix direction:** give the error toast an auto-dismiss timeout and/or a close (×) affordance so it doesn't sit blocking-looking over the canvas; clear it on map change as well as on success.

**Affected components:** `components/game/map/MapCanvas.tsx`, `components/game/map/map-canvas/use-map-background.ts`.

## Sub-phases

> Per-sub-phase cheap check: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` + the affected vitest file. CI runs the full gate on push. The "map renders on the web build" effect needs the deployed web build — implementer-verified post-merge against `https://bmo.mybmoai.work/DungeonTableOnline/`.

### 55A — Resolve runtime asset URLs against `import.meta.env.BASE_URL` (WEB-AP-1)

**Objective:** built-in map backgrounds (and other runtime `public/data` assets) load correctly on the web build; desktop unaffected.

**Files:** new `utils/asset-url.ts` (or a helper in `utils/platform.ts`), `components/game/map/map-canvas/use-map-background.ts`, a unit test for the helper.

**Steps:**

1. Add `resolveAssetUrl(path: string): string` — if `path` is a data URL or absolute `http(s)` URL, return as-is; otherwise strip a leading `./`/`/` and prefix `import.meta.env.BASE_URL` (which is `/` on desktop, `/DungeonTableOnline/` on web).
2. Route `Assets.load(...)` in `use-map-background.ts` through `resolveAssetUrl(map.imagePath)`; update the debug-log `resolvedUrl` to match so the log isn't misleading.
3. Audit other runtime `public/data` consumers (portraits, sounds, fonts) for the same raw-relative load and route them through the helper.
4. Unit-test the helper: `./data/x.png` → `${BASE_URL}data/x.png`; `/data/x.png` → same; a `data:`/`https:` URL passes through; desktop `BASE_URL='/'` is a no-op.

**Acceptance:** vitest green; `tsc -p tsconfig.web.json` clean; on the deployed web build a built-in-map campaign renders the background (no 404 toast); desktop still loads maps. Implementer-verified live.

### 55B — Harden the map-load error toast (WEB-AP-2)

**Objective:** the asset-error toast auto-dismisses / is dismissable and clears on map change.

**Files:** `components/game/map/MapCanvas.tsx`, `components/game/map/map-canvas/use-map-background.ts`.

**Steps:**

1. Add an auto-dismiss timeout (e.g. a few seconds) and/or a close (×) control to the `bgLoadError` toast at `MapCanvas.tsx:916-918`.
2. Clear `bgLoadError` on `map?.imagePath` change (not only on a successful load) so a stale error doesn't linger after switching maps.

**Acceptance:** vitest/`tsc` clean; the toast no longer pins indefinitely; switching maps clears a prior error.
