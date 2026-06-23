# PHASE-44 — Web-build serving & deploy resilience

> Authored from the 2026-06-22 WEB-build QA report (Dungeon Table Online, v2.4.77). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Make the browser SPA (the Pi-served Dungeon Table Online build, base `/DungeonTableOnline/`) survive the two infrastructure failure modes the web QA found: (1) the always-on `BMO_API_KEY` front-door gate 401-ing the public web surface — **already fixed in the live tree** by the integrator, kept here only as a verified/regression-guarded finding; and (2) a redeploy landing mid-session hard-crashing every active player on their next lazy-route navigation, because the deploy `rsync --delete`s the old hashed chunks the already-loaded SPA still references and a failed dynamic import throws straight to the error boundary with no reload-to-latest path. PLANNING ONLY — this phase authors the plan; no app/infra changes here.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Both findings are self-contained web-build infrastructure.
- **Cross-domain:** F1 touches `bmo/pi/app.py` + `bmo/pi/tests/` (Pi); F3 touches `dnd-app/` renderer **and** `.github/workflows/dnd-web-deploy.yml`. Both the Pi (`bmo-pi-pytest.yml`) and the dnd-app (`dnd-app-ci.yml`) gates apply.
- **PHASE-42 (bmo deploy automation)** owns the bmo-side deploy workflow philosophy; this phase's `dnd-web-deploy.yml` change (drop `--delete` / asset retention) is the dnd-app analogue — keep them consistent if 42 ships first.
- **Relationship to PHASE-46 (web registry announce):** the F1 auth-gate exemption set (`_PUBLIC_UNAUTH_PREFIXES`) is the same gate that decides whether `/api/games` is reachable anonymously — PHASE-46 discusses the registry-announce side; keep the exemption reasoning in lockstep.

## Verified findings

All verification was performed against the live tree at `origin/master` (worktree `auto/phase-maker`).

### F1 (Critical) — `BMO_API_KEY` hardening 401s the entire web app: ALREADY FIXED (no work, regression-guarded)

**Status: confirmed FIXED in the live tree; verified + test-covered. No code change required — keep as a documented finding + a passive regression check.**

The QA report (mid-session, after `BMO_API_KEY` was set on BMO) saw `GET https://bmo.mybmoai.work/DungeonTableOnline/` return **HTTP 401** `{"error":"unauthorized",…}`, taking the whole public site offline. Root cause at the time: the global `@app.before_request` gate `_bmo_optional_api_key()` exempted only `("/health", "/favicon.ico")` + `"/static/"`, not the web-app prefix.

The live tree already fixes this. `bmo/pi/app.py:228-233` now defines:

```python
_PUBLIC_UNAUTH_EXACT = frozenset({"/api/dnd/public/dm"})
_PUBLIC_UNAUTH_PREFIXES = ("/api/library", "/api/sounds", "/DungeonTableOnline")

def _is_public_unauthenticated_path(p: str) -> bool:
    return p in _PUBLIC_UNAUTH_EXACT or any(p.startswith(pre) for pre in _PUBLIC_UNAUTH_PREFIXES)
```

and `_bmo_optional_api_key()` (app.py:277-281) early-returns `None` for `_is_public_unauthenticated_path(p)`. The blueprint serves the SPA shell + assets under `/DungeonTableOnline` (`bmo/pi/routes/webapp_api.py:38`, `static_url_path="/DungeonTableOnline"`), so the prefix covers `/DungeonTableOnline/assets/*`, `/data`, `/fonts`, `/sounds`, the pdf worker, etc.; the `/api/library` + `/api/sounds` content routes the SPA also needs are separately exempted; `/api/*` data/mutation routes stay gated.

Landed as commit `a4059f99` (`fix(bmo): exempt the anonymous public surface from the API-key gate`, integrator, **2026-06-22 23:29** — after the QA run that day). Already test-guarded: `bmo/pi/tests/test_bmo_auth.py:76-90` (`test_public_web_surface_exempt_from_key` asserts `/DungeonTableOnline/` + `/DungeonTableOnline/assets/app.js` return `None` with `BMO_API_KEY` set; `test_sibling_private_dnd_route_still_gated` confirms the rest of `/api/*` still 401s).

Verification commands:

```bash
sed -n '219,300p' bmo/pi/app.py
sed -n '60,95p' bmo/pi/tests/test_bmo_auth.py
git show -s --format='%h %ci %s' a4059f99
cd bmo/pi && python -m pytest tests/test_bmo_auth.py -q
```

**Only residual work (sub-phase 44A):** harden the regression guard so this can never silently regress — assert the exemption set stays in lockstep with the Cloudflare-Access bypass apps (a code comment already says "KEEP THIS SET IN LOCKSTEP"). No app behaviour change.

### F2 (info, from F1) — exemption set has no drift guard

**Status: observation.** `_PUBLIC_UNAUTH_PREFIXES` is hand-maintained and documented as needing lockstep with the CF-Access "bypass" applications, but nothing fails CI if a new public route (or a new SPA asset prefix) is added without exempting it, or if an exemption is removed. The existing `test_bmo_auth.py` only checks the four current paths. A future SPA that adds e.g. a `/DungeonTableOnline/api-proxy` would silently 401 under hardening with no test catching it.

### F3 (High) — redeploy mid-session hard-crashes active players ("Failed to fetch dynamically imported module")

**Status: confirmed; root cause confirmed in source + deploy workflow.**

Clicking **Play** on a Solo game (or navigating to any not-yet-fetched lazy route) after a redeploy landed threw the app error boundary: *"Something went wrong … Failed to fetch dynamically imported module: …/assets/InGamePage-ey1ziH5k.js"* (`TypeError: Failed to fetch dynamically imported module`, from `index.web-*.js`). A full reload recovered (the in-game board itself works). Cause is a **stale hashed chunk after redeploy**, with no recovery path:

1. **Routes are lazy-loaded.** `dnd-app/src/renderer/src/App.tsx:27-42` declares every page via `lazy(() => import('./pages/…'))`, including `const InGamePage = lazy(() => import('./pages/InGamePage'))` (App.tsx:33). Each becomes its own content-hashed chunk (`InGamePage-<hash>.js`).
2. **The deploy deletes old chunks.** `.github/workflows/dnd-web-deploy.yml` (Rsync step) runs `rsync -az --delete … dist-web/ …:/home/patrick/web-apps/DungeonTableOnline/`. `--delete` removes files absent from the new build — i.e. the **previous** build's hashed chunks. A browser tab that loaded `index.web-C8ECHjSO.js` still references `InGamePage-ey1ziH5k.js`; after a redeploy the server only has `InGamePage-<newhash>.js`, so the lazy import 404s (QA verified `GET …/assets/InGamePage-ey1ziH5k.js` → **HTTP 404**).
3. **It fires on every `dnd-app` push.** The workflow triggers on `push: branches: [master] paths: ["dnd-app/**", …]` — frequent. So **every active session breaks on its next lazy navigation after any dnd-app deploy.**
4. **No recovery.** There is no service worker / app-shell cache to serve the old chunk, and the failed dynamic import is not caught with a "new version — reload" prompt: it propagates to the top-level `<ErrorBoundary>` (App.tsx:223) and hard-crashes to "Something went wrong".

Verification commands:

```bash
grep -n "lazy(() => import" dnd-app/src/renderer/src/App.tsx
grep -n "rsync\|--delete" .github/workflows/dnd-web-deploy.yml
grep -n "ErrorBoundary\|Suspense" dnd-app/src/renderer/src/App.tsx | head
sed -n '1,40p' dnd-app/vite.web.config.ts
```

**Three independent mitigations** (the plan does all three — they are complementary, defence-in-depth):

- **(a) Stop deleting old chunks immediately** — drop `--delete` from the rsync (or add a retention/grace window), so an in-flight session's old chunk survives long enough for the user to finish/reload. Trade-off: the serve dir accumulates stale assets; pair with a retention sweep (delete assets older than N deploys / X hours) so it doesn't grow unbounded.
- **(b) Catch the failed dynamic import and reload-to-latest** — wrap the lazy imports (or the error boundary) so a chunk-load failure (`Failed to fetch dynamically imported module` / `ChunkLoadError`) triggers a one-time `window.location.reload()` (guarded by a sessionStorage flag to avoid a reload loop) instead of throwing to the generic boundary, optionally surfacing "A new version is available — reloading…".
- **(c) Consider a PWA/service-worker app shell** (larger; can be split to a PHASE-40-style follow-up) that caches the shell + chunks so a redeploy never 404s an in-flight import.

## Sub-phases

> Pi checks: `cd bmo/pi && python -m pytest <file>`. dnd-app checks: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` on the changed surface + the affected vitest file; CI runs the full gate on push. Workflow YAML has no unit gate — validate with `actionlint` if available, else a careful read + the next real deploy.

### 44A — Lockstep regression guard for the public-unauth exemption set (F1/F2)

**Objective:** the Critical never silently regresses; the exemption set is asserted, not just commented.

**Files:** `bmo/pi/tests/test_bmo_auth.py` (extend), optionally `bmo/pi/app.py` (comment only — no behaviour change).

**Steps:**

1. Extend `test_public_web_surface_exempt_from_key` (or add a sibling test) to assert, with `BMO_API_KEY` set, that a representative asset under each exempted prefix returns `None` (not 401): `/DungeonTableOnline/`, `/DungeonTableOnline/assets/index.web-x.js`, `/DungeonTableOnline/data/5e/...`, `/api/library/manifest`, `/api/sounds/x`, `/api/dnd/public/dm`.
2. Add an assertion that a NON-exempt sibling under the same tree (e.g. `/api/dnd/load`, `/api/chat`) still 401s — pinning that the exemption is prefix-scoped, not a blanket open.
3. Add a short docstring/comment cross-referencing the Cloudflare-Access bypass list so a future editor updates both.

**Acceptance:** `python -m pytest bmo/pi/tests/test_bmo_auth.py -q` green; removing any prefix from `_PUBLIC_UNAUTH_PREFIXES` makes the new test fail; `/api/dnd/load` stays 401.

### 44B — `dnd-web-deploy.yml`: retain old hashed chunks across a redeploy (F3a)

**Objective:** a redeploy no longer 404s an already-loaded SPA's chunks for a grace window.

**Files:** `.github/workflows/dnd-web-deploy.yml`.

**Steps:**

1. Remove `--delete` from the `rsync` of `dist-web/` → the Pi serve dir (so new builds overlay without removing prior hashed assets). Keep `-az`.
2. Add a bounded retention sweep after the rsync (over Tailscale SSH): delete files in `assets/` whose mtime is older than a grace window (e.g. `find … -type f -mtime +1 -delete`, or keep the last N `index.web-*.js` generations) so the dir does not grow unbounded. Never delete `index.html` or the freshly-synced current generation.
3. Document the retention rationale inline (in-flight sessions reference old hashed chunks until they reload).

**Acceptance:** workflow lints/parses; after two consecutive deploys the previous build's `InGamePage-<oldhash>.js` is still served (HTTP 200) for the grace window; assets older than the window are pruned; `index.html` always reflects the latest build.

### 44C — Renderer: recover from a stale chunk instead of hard-crashing (F3b)

**Objective:** a failed lazy-route import triggers a single reload-to-latest, not the generic error boundary.

**Files:** `dnd-app/src/renderer/src/App.tsx` (lazy wrappers / Suspense), the shared `ErrorBoundary` in `dnd-app/src/renderer/src/components/ui`, plus a small new helper + test.

**Steps:**

1. Add a `lazyWithReload(factory)` helper that wraps `lazy()` so a rejected dynamic import whose message matches `/Failed to fetch dynamically imported module|ChunkLoadError|error loading dynamically imported module/` triggers exactly one `window.location.reload()`, guarded by a `sessionStorage` one-shot flag (`dnd:chunk-reload`) cleared on a successful load, to avoid a reload loop when the chunk is genuinely gone.
2. Route every `lazy(() => import('./pages/…'))` in App.tsx:27-42 through the helper.
3. As a backstop, teach `ErrorBoundary` (or a dedicated boundary around the routed `<Suspense>`) to detect the same chunk-load signature in `componentDidCatch` and render a "A new version is available — Reload" affordance instead of the generic "Something went wrong".
4. Unit-test the helper: a rejecting import with the chunk-load message reloads once (mock `location.reload` + `sessionStorage`); a second failure does not loop; an unrelated error still throws to the boundary.

**Acceptance:** new vitest file green; `tsc -p tsconfig.web.json` clean; simulated chunk-load rejection reloads once then surfaces the reload prompt rather than the generic boundary; non-chunk errors are unaffected.

### 44D — (Optional, larger) PWA/service-worker app shell (F3c)

**Objective:** cache the app shell + chunks so a redeploy never 404s an in-flight import; offline-tolerant load.

**Files:** `dnd-app/vite.web.config.ts` (+ a service-worker registration in the web entry `src/web/main.web.tsx`; consider `vite-plugin-pwa`).

**Steps:** scope a service worker that precaches the shell and runtime-caches hashed `assets/*` with a cache-first + update-on-reload strategy; register it only in the web build (guard with `isWebBuild()`); add an update-available → reload prompt. If this proves large, split it to a dedicated follow-up phase (PHASE-40 `ds-pwa-cloud` is the precedent for PWA-scoped work) and land 44A-44C first.

**Acceptance:** web build registers the SW; a forced redeploy mid-session no longer throws a dynamic-import error (the cached chunk serves, then the update prompt offers reload). If deferred to a follow-up, note it here and in PHASE-INDEX.

## Completed

- 44A — DONE (2026-06-23) (`bmo/pi/tests/test_bmo_auth.py`) — hardened `test_public_web_surface_exempt_from_key` to pin a representative path under EVERY exempted prefix (SPA shell, hashed asset chunk, bundled 5e content, `/api/library`, `/api/sounds`, exact `/api/dnd/public/dm`) + added `test_exemption_set_covers_every_documented_prefix` that iterates the live `_PUBLIC_UNAUTH_PREFIXES`/`_PUBLIC_UNAUTH_EXACT` sets so removing any entry fails CI; existing sibling-still-gated test already covers `/api/dnd/load` 401. Added a lockstep cross-ref docstring to the CF-Access bypass list. `pytest tests/test_bmo_auth.py -q` → 15 passed. No app behaviour change (F1 stays fixed by integrator a4059f99).
- 44B — DONE (2026-06-23) (`.github/workflows/dnd-web-deploy.yml`) — dropped `--delete` from the Pi rsync so a redeploy overlays new hashed chunks without removing the previous build's chunks an in-flight SPA still imports; added a bounded retention sweep (`find assets/ -mmin +RETENTION_MINUTES -delete`, default 1440 = 24h grace) so the serve dir doesn't grow unbounded; index.html + the freshly-synced current generation are never pruned. YAML parses; no unit gate (validated by read + next real deploy).
- 44C — DONE (2026-06-23) (`dnd-app/src/renderer/src/utils/lazy-with-reload.ts`, `App.tsx`, `components/ui/ErrorBoundary.tsx`, `i18n/locales/{en,es}.json` + regenerated `generated-keys.ts`, `utils/lazy-with-reload.test.ts`) — added `lazyWithReload()` wrapping `lazy()`: a chunk-load rejection (`/Failed to fetch dynamically imported module|error loading…|Importing a module script failed|ChunkLoadError/`) triggers exactly one `window.location.reload()`, guarded by the `dnd:chunk-reload` sessionStorage one-shot flag (cleared on any successful load) so a genuinely-missing chunk can't reload-loop. Routed all 16 `lazy(() => import('./pages/…'))` in App.tsx through it (removed now-unused `lazy` import). ErrorBoundary backstop: `getDerivedStateFromError` flags `isChunkError` via `isChunkLoadError`, rendering a terse "A new version is available — Reload" affordance (i18n-keyed en+es) instead of the generic crash UI. New vitest: 6 tests green (reload-once, no-loop-when-flagged, non-chunk-error untouched, guard-cleared-on-success, detector matrix).
- 44D — SPLIT to a follow-up (PWA/service-worker app shell). The plan explicitly authorizes splitting 44D to a dedicated follow-up phase if large ("If this proves large, split it to a dedicated follow-up phase … and land 44A-44C first"); a service worker needs a new `vite-plugin-pwa` dependency + precache-manifest + SW-registration + update-prompt wiring (a PHASE-40-style PWA effort). 44A-44C deliver the immediate defence-in-depth (retain chunks + reload-to-latest); the SW shell is the optional belt-and-suspenders layer. Recommend a PHASE-49 `web-pwa-app-shell` follow-up (noted for PHASE-INDEX).

_Implemented 2026-06-23 from WEB-QA-report-2026-06-22._
