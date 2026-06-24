# PHASE-01 — Routing & service-worker update resilience

> Authored from the 2026-06-24 dungeon-scholar QA report (tested @ deployed `dd0b1d97` · `origin/master` `08772fa6`). Order/dependencies: [`PHASE-INDEX.md`](./PHASE-INDEX.md). Execute per [`INSTRUCTIONS.md`](./INSTRUCTIONS.md). PLANNING ONLY — this phase authors the plan; no app changes here.

## Goal

Stop an in-app navigation to a lazy-loaded route from dead-ending on the global error boundary after a new deploy has landed. With the SPA already loaded on `#/home` (served from the precached app shell), navigating to a code-split route (`#/library`, the dungeon, any study mode) currently throws `Failed to fetch dynamically imported module … <oldhash>.js` straight to the `ErrorBoundary` ("⚠ Something went wrong / A spell misfired in this chamber"); only a manual hard-reload recovers. The fix gives a failed dynamic import a **self-recovery path** (one-shot reload-to-latest) and a **clear update affordance** in the boundary, so a deploy that changes chunk hashes mid-session never strands the user on a crash screen.

## Dependencies & cross-phase notes

- **No prerequisite phases.** Self-contained dungeon-scholar web-resilience work (router lazy imports + PWA registration + error boundary).
- **Cross-domain precedent:** this is the dungeon-scholar analogue of **PHASE-44C** (`dnd-app/docs/phases/completed/PHASE-44-web-build-serving-resilience.md` — "redeploy mid-session hard-crashes active players: Failed to fetch dynamically imported module"). The dnd-app fix added a `lazyWithReload()` helper + an `ErrorBoundary` chunk-load backstop; this phase ports the same defence-in-depth to dungeon-scholar's `React.lazy` screens. Keep the recovery semantics (one-shot `sessionStorage` guard, chunk-error signature) consistent with `dnd-app/src/renderer/src/utils/lazy-with-reload.ts` so the two apps behave the same way.
- **Difference from PHASE-44:** dungeon-scholar is a **GitHub-Pages** deploy with an **injectManifest PWA** (`vite.config.js` `VitePWA({ strategies: 'injectManifest', registerType: 'autoUpdate' })`, custom `src/sw.js`), not a Pi rsync. The "old chunk gets deleted" half (PHASE-44B's `--delete` retention) has **no analogue we control** — GitHub Pages atomically replaces the published tree on each `deploy.yml` run, and the SW's `cleanupOutdatedCaches()` purges the previous precache the moment the new SW activates. So dungeon-scholar can only fix the **client recovery** side (PHASE-44C), plus tighten the **SW update → reload** handshake. This is called out in the report's suggested action (a)/(b)/(c).
- **PHASE-40 (`ds-pwa-cloud`)** and **PHASE-41 (`ds-sealed-tomes-theme`)** (both in `dnd-app/docs/phases/completed/`) established the current PWA/SW config and the `ErrorBoundary` placement (App.jsx:1777). This phase modifies that surface; re-read those plans' SW notes before touching `vite.config.js`/`src/sw.js`.

## Verified findings

All verification was performed read-only against the live tree at `origin/master` (worktree `auto/scholar-phase-maker`).

### F1 (High) — A lazy-route navigation after a new deploy crashes into the error boundary (stale app shell → failed dynamic import)

**Status: confirmed; root cause confirmed in source (router lazy graph + PWA config + error boundary).**

QA repro (signed-out · Dark · desktop · SW-cached shell, pre-hard-refresh):

1. Load `https://evilpatrick06.github.io/home-lab/#/home` and let the service-worker-cached shell serve it.
2. Navigate in-app to `#/library` **without** hard-refreshing.
3. The global error boundary renders ("A spell misfired in this chamber"); **Technical details** = `Failed to fetch dynamically imported module: …/assets/…DpP_q3kX.js`.
4. Hard reload (Ctrl+Shift+R) on `#/library` → the screen loads correctly. So the failure is the **cached/old app shell requesting a code-split chunk the latest deploy no longer ships.**

Root cause, confirmed in source:

1. **Every screen but Home is `React.lazy`.** `dungeon-scholar/src/App.jsx` lazily imports ~21 screens — `LibraryScreen` (App.jsx:170), the study modes (`FlashcardsMode`/`QuizMode`/`LabMode`/`ChatMode`/`MistakeVault`/`DomainStudyScreen`, App.jsx:195-200), `ExamMode` (App.jsx:23), `DungeonExplore` (App.jsx:27), and the progression screens (App.jsx:181-191). Each becomes its own content-hashed chunk (`<Name>-<hash>.js`). All sit under **one** `<React.Suspense>` boundary (App.jsx:1900) inside the `<ErrorBoundary onReset={() => setScreen('home')}>` (App.jsx:1777).
2. **A deploy changes the chunk hashes.** `.github/workflows/deploy.yml` rebuilds with `VITE_BASE=/home-lab/` and republishes to GitHub Pages on every `dungeon-scholar/**` push. The new build emits `LibraryScreen-<newhash>.js`; the old `…DpP_q3kX.js` is gone from the published tree.
3. **The SW aggressively swaps the shell and purges the old precache.** `vite.config.js:73` sets `registerType: 'autoUpdate'` and `src/sw.js:12-14` calls `self.skipWaiting(); clientsClaim(); cleanupOutdatedCaches();`. So when the new SW is detected it activates **immediately**, claims the open tab, and `cleanupOutdatedCaches()` deletes the previous precache entries — including the old hashed chunk the **already-rendered** page still references in its lazy-import graph.
4. **The dynamic `import()` then 404s with no recovery.** The in-memory page (old shell) calls `import('./features/library/LibraryScreen.jsx')` → the old chunk URL is neither in the (now-cleaned) cache nor on the server → the promise rejects with `TypeError: Failed to fetch dynamically imported module`. `React.lazy` propagates the rejection up through `<Suspense>` to the `<ErrorBoundary>` (App.jsx:1777, render at `components/ErrorBoundary.jsx:29-62`), which shows the generic crash panel. There is **no `vite:preloadError` handler** (grep: zero hits in `dungeon-scholar/src`) and **no chunk-load detection** in `ErrorBoundary` — it treats a stale-chunk fetch exactly like a genuine render crash.

Verification commands (read-only):

```bash
grep -n "React.lazy(() => import" dungeon-scholar/src/App.jsx
grep -n "Suspense\|ErrorBoundary" dungeon-scholar/src/App.jsx | head
sed -n '69,108p' dungeon-scholar/vite.config.js          # VitePWA registerType: 'autoUpdate'
sed -n '1,18p'  dungeon-scholar/src/sw.js                 # skipWaiting + clientsClaim + cleanupOutdatedCaches
grep -rn "vite:preloadError\|ChunkLoad\|dynamically imported" dungeon-scholar/src   # → none today
```

**Why this fires often:** the report notes `autoUpdate` + `skipWaiting`/`clientsClaim` is exactly the configuration that swaps the shell out from under a live tab. Every deploy that changes a screen's chunk hash strands any open tab on its **next** lazy navigation, until the user happens to hard-refresh. Home is static (not lazy), so the tab looks fine right up until the first navigation.

**Three complementary mitigations** (this phase plans all three — defence-in-depth, mirroring PHASE-44's a/b/c):

- **(a) Catch the failed dynamic import and reload-to-latest** — a global `window.addEventListener('vite:preloadError', …)` (Vite fires this on a failed `import()` of a build chunk) plus a `lazyWithReload()` wrapper around the `React.lazy` factories: on a chunk-load rejection, do exactly one `window.location.reload()`, guarded by a `sessionStorage` one-shot flag so a genuinely-missing chunk can't reload-loop.
- **(b) Make the boundary chunk-aware** — teach `ErrorBoundary` to recognise the chunk-load error signature and render a terse "A new version is available — Reload" affordance (auto-reloading once) instead of the generic "A spell misfired" crash, as the backstop for any chunk error that slips past (a).
- **(c) Tighten the SW update → reload handshake** — ensure the page reloads when a new SW takes control (`controllerchange`) so the shell and its chunk graph are swapped **together**, rather than the shell being claimed while the old chunk references live on. Keep `skipWaiting`/`clientsClaim` (offline-first intent) but pair them with a controlled reload.

## Sub-phases

> dungeon-scholar checks (run from `dungeon-scholar/`): single test `npx vitest run src/.../that.test.jsx` during sub-phase work; CI (`dungeon-scholar-ci.yml`) runs the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) gate on push. `vite.config.js`/`sw.js` changes have no unit gate beyond the build — validate with the build + a careful read + the next real deploy.

### 01A — `lazyWithReload()` helper + `vite:preloadError` recovery (F1a)

**Objective:** a failed lazy-route import triggers a single reload-to-latest, not the crash boundary.

**Files:** new `dungeon-scholar/src/utils/lazyWithReload.js` + `dungeon-scholar/src/utils/lazyWithReload.test.js`; `dungeon-scholar/src/main.jsx` (global listener); `dungeon-scholar/src/App.jsx` (route the `React.lazy` factories through it).

**Steps:**

1. Add `lazyWithReload(factory)` wrapping `React.lazy`: when the dynamic import rejects with a message matching `/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError/`, trigger exactly one `window.location.reload()` guarded by a `sessionStorage` one-shot flag (e.g. `ds:chunk-reload`) that is cleared on any successful import, so a chunk that is genuinely gone cannot reload-loop. Re-throw non-chunk errors unchanged so real crashes still reach the boundary.
2. In `main.jsx`, add `window.addEventListener('vite:preloadError', (e) => { … })` performing the same guarded one-shot reload (this catches Vite's own preload/`modulepreload` failures that don't flow through `React.lazy`). Call `e.preventDefault()` only when reloading.
3. Route every `React.lazy(() => import('./…'))` in `App.jsx` (lines 23, 27, 170, 181-191, 195-200) through `lazyWithReload`.
4. Unit-test the helper: a rejecting import with each chunk-load message reloads once (mock `window.location.reload` + `sessionStorage`); a second failure while the flag is set does **not** reload; a successful import clears the flag; an unrelated error re-throws (reaches the boundary).

**Acceptance:** new vitest file green; `npm run build` (`VITE_BASE=/home-lab/`) clean; a simulated chunk-load rejection reloads exactly once then stops; non-chunk errors are unaffected; all `App.jsx` lazy screens import through the wrapper (no bare `React.lazy(() => import…` remains for a routed screen).

### 01B — Chunk-aware `ErrorBoundary` backstop (F1b)

**Objective:** any chunk-load error that reaches the boundary shows a clear "new version — reload" path, not the generic crash copy.

**Files:** `dungeon-scholar/src/components/ErrorBoundary.jsx` (+ extend/author `dungeon-scholar/src/components/ErrorBoundary.test.jsx` if present; add one if not).

**Steps:**

1. Add an `isChunkLoadError(error)` check (shared with 01A's matcher — export it from `lazyWithReload.js` and import here so the signature lives in one place).
2. In `getDerivedStateFromError`/`render`, when the caught error is a chunk-load error, render a dedicated, in-theme panel — e.g. "✦ A new edition of the tome has arrived" + a single **Reload** button — instead of the "A spell misfired in this chamber" copy (`ErrorBoundary.jsx:38-49`). Optionally auto-reload once via the same `sessionStorage` guard as a belt-and-suspenders backstop (only if 01A's guard hasn't already fired this session).
3. Keep the existing generic crash UI + "← Return to Hearth" / "Reload page" buttons (ErrorBoundary.jsx:50-60) for non-chunk errors unchanged.

**Acceptance:** unit test — a thrown chunk-load error renders the update/reload affordance; a thrown generic error still renders "A spell misfired in this chamber" + "Return to Hearth"; `npm run build` clean.

### 01C — Controlled SW-update reload handshake (F1c)

**Objective:** when a new SW takes control mid-session, the shell + its chunk graph swap together, so an old chunk reference is never left live against a cleaned cache.

**Files:** `dungeon-scholar/src/main.jsx` (or a small `dungeon-scholar/src/services/pwaUpdate.js` it imports). `vite.config.js`/`src/sw.js` only if the registration strategy needs adjusting — keep `skipWaiting`/`clientsClaim`.

**Steps:**

1. With `injectRegister: 'auto'` + `registerType: 'autoUpdate'`, the plugin injects a registration; add an explicit `navigator.serviceWorker.addEventListener('controllerchange', …)` one-shot `window.location.reload()` (guarded by the same `sessionStorage` flag as 01A so it can't loop with the preloadError path) so the page reloads onto the new shell the instant the new SW claims it — closing the window where the old shell references a purged chunk. Guard the listener so it is a no-op in non-SW contexts (dev, tests, unsupported browsers).
2. Confirm this does not double-reload with 01A: the shared one-shot flag must make whichever fires first win and suppress the other for that load.
3. Document inline why `skipWaiting`/`clientsClaim` stay (offline-first: a returning offline user must get a controlling SW immediately) and how the controlled reload makes the aggressive swap safe.

**Acceptance:** `npm run build` (`VITE_BASE=/home-lab/`) clean; manual/next-deploy check — a deploy landing on an open tab reloads the tab onto the new build instead of throwing on the next navigation; no reload loop (the `sessionStorage` guard holds across 01A/01C); offline load still works from the precache.

### 01D — Note the index.html-caching caveat (F1c residue, docs only)

**Objective:** record the one factor outside the app's control so it isn't re-discovered.

**Files:** `dungeon-scholar/docs/DESIGN-CONSTRAINTS.md` (append a short, dated note).

**Steps:**

1. Add a constraint note: GitHub Pages sets the `index.html` cache headers (the app cannot send HTTP headers); the app's mitigation is the SW precache (auto-revalidated) + the 01A-01C client recovery, not header control. If a future SW-update bug recurs, check the browser's HTTP cache on `index.html` / the published `assets/` before assuming an app bug. This is a `DESIGN-CONSTRAINTS` note (a durable gotcha), **not** a code change.

**Acceptance:** the note lands in `DESIGN-CONSTRAINTS.md` with an ISO date and a one-line rationale; no code/behaviour change.

## Research notes

- `vite:preloadError` is Vite's official hook for failed dynamic-import preloads (`https://vite.dev/guide/build#load-error-handling`); the canonical recovery is a guarded `window.location.reload()`. Pairing it with a `React.lazy` wrapper covers both the `import()` rejection path (reaches `Suspense`/boundary) and the preload path (window event).
- The `sessionStorage` one-shot guard (cleared on a successful load) is the standard anti-loop for "the chunk is genuinely gone, reloading won't help" — without it, a deleted chunk would reload forever. dnd-app uses the key `dnd:chunk-reload` (PHASE-44C); use `ds:chunk-reload` here.
- `skipWaiting` + `clientsClaim` are correct for an offline-first PWA; the bug is not that they exist but that nothing reloads the page when they swap the controller. 01C adds exactly that.

## Test plan

- `npx vitest run src/utils/lazyWithReload.test.js` (01A) and the `ErrorBoundary` test (01B) during sub-phase work.
- At phase end: `npm run lint:fix`, then push and let CI (`dungeon-scholar-ci.yml`) run the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) gate.
- Manual / next-deploy verification (not CI-gated): open a tab, ship a deploy that changes a screen's chunk hash, navigate to that screen → the tab reloads onto the new build instead of crashing; confirm no reload loop and that offline load still serves from the precache.

## Acceptance criteria

- A failed lazy-route dynamic import after a deploy results in **one** automatic reload-to-latest (via 01A or 01C), not the generic error boundary.
- Any chunk-load error that still reaches the boundary renders a clear "new version — Reload" affordance (01B), never the bare "A spell misfired" crash.
- No reload loop under a genuinely-missing chunk (the shared `sessionStorage` guard holds).
- Non-chunk render crashes still show the existing recoverable boundary + "Return to Hearth".
- `dungeon-scholar-ci.yml` green (full `npm run test` + `npm run build`).

## Out of scope

- The server-side "retain old chunks across a deploy" mitigation (PHASE-44B's rsync `--delete` retention) — **N/A on GitHub Pages**, which atomically replaces the published tree; dungeon-scholar can only fix the client side. Noted in Dependencies.
- Runtime-caching the cross-origin Supabase/Oracle requests — deliberately network-only per `vite.config.js:65-68`; do not add runtime caching here.
- Any change to which screens are lazy vs. static — the lazy split (Home static, rest lazy) is intentional (PHASE-39 39H); this phase only makes the lazy loads recoverable.

## Completed

Implemented 2026-06-24 on `auto/scholar-phase-executer` (run agent-id `scholar-phase-executer`).

- **01A** — `src/utils/lazyWithReload.js` (new): `lazyWithReload()` wraps `lazy()` and, on a chunk-load rejection, fires one `guardedReloadOnce()` (sessionStorage one-shot `ds:chunk-reload`, cleared on any successful load) returning a never-resolving promise to hold Suspense; exports `isChunkLoadError`/`CHUNK_RELOAD_FLAG`/`clearReloadFlag`/`guardedReloadOnce`. `src/main.jsx:18-20` adds the `vite:preloadError` listener (preventDefault only when reloading). `src/App.jsx:22` imports the wrapper; all 20 routed `React.lazy(() => import(...))` screens (App.jsx:24,28,171,182-192,196-201) now go through `lazyWithReload` (zero bare `React.lazy` remain). Tests: `src/utils/lazyWithReload.test.js` (8 cases) green.
- **01B** — `src/components/ErrorBoundary.jsx:3` imports `isChunkLoadError`/`guardedReloadOnce`; `componentDidCatch` attempts one guarded auto-reload on a chunk error, and `render` shows a dedicated "A new edition of the tome has arrived — Reload" panel for chunk errors, leaving the generic "A spell misfired" + "Return to Hearth" UI unchanged for all other errors. Tests: `src/components/ErrorBoundary.test.jsx` (3 cases) green.
- **01C** — `src/services/pwaUpdate.js` (new) `registerControlledReload()` adds a `navigator.serviceWorker` `controllerchange` one-shot reload via the shared `guardedReloadOnce()`; called from `src/main.jsx:25`. Guarded as a no-op in non-SW contexts AND on the first-visit initial claim (only reloads when a controller already existed at registration), so it never spuriously reloads a fresh visit and never double-reloads with 01A (shared flag). `vite.config.js`/`src/sw.js` left unchanged — `skipWaiting`/`clientsClaim` kept by design.
- **01D** — `docs/DESIGN-CONSTRAINTS.md`: dated note recording that GitHub Pages controls `index.html` caching (no app HTTP-header control); the SW precache + 01A-01C client recovery is the only lever; if the bug recurs, check the browser HTTP cache + published `assets/` before assuming an app bug. Docs-only, no behaviour change.

Notes: ran the two affected vitest files locally (11/11 green) per rule 5; the full `npm run test` + `npm run build` (`VITE_BASE=/home-lab/`) sweep is left to CI. Runtime/next-deploy verification (a deploy reloading an open tab instead of crashing; no reload loop; offline still serves) is not CI-gated, per the plan's Test plan.
