# PHASE-63 — Web serving headers: immutable caching for hashed assets + route-scoped VTT CSP

> Authored from the 2026-07-02 WEB-build QA report (Dungeon Table Online, v2.7.1). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md. PLANNING ONLY — this phase authors the plan; no app code changes here.

## Goal

Address the two serving-layer findings from the 2026-07-02 v2.7.1 WEB pass — the run's **most severe new finding** (Medium, performance): content-hashed build assets under `/DungeonTableOnline/assets/` are served `Cache-Control: no-cache`, so every app boot re-issues a conditional GET for ~60 modulepreloaded chunks through the Cloudflare tunnel to the Pi (and `no-cache` also stops the Cloudflare edge from caching, landing all asset traffic on the Pi); and the paired Low security finding: the VTT's HTML inherits the site-wide kiosk/IDE CSP (`unsafe-eval`, `unsafe-inline`, IDE CDNs, YouTube image hosts), none of which the Vite-built VTT needs.

Both findings live in the same two files — `bmo/pi/app.py` (`_cache_policy` after-request hook) and `bmo/pi/routes/webapp_api.py` (the VTT blueprint) — and share a root cause: the site-wide header policy predates the VTT mount, and the VTT blueprint never sets its own headers. **The fix surface is bmo/pi (Flask serving layer) only — no `dnd-app` source change, no rebuild, no redeploy of the web bundle.**

## Dependencies & cross-phase notes

- **Cross-domain like PHASE-42/44 lineage — but Pi-side only.** The change is in the BMO Flask app, not `dnd-app` or the deploy workflow. The cheap check is the Pi suite (`bmo/pi/pytest.ini`, `ruff.toml`) plus live `curl -sI` header verification — not `tsc`/`vitest`.
- **Complements PHASE-61 (deploy asset retention), does not touch it.** PHASE-61 hardens *which files exist* in the serve dir; this phase fixes *the headers they are served with*. Independent; freely reorderable. Note the interplay guard: long-caching hashed assets is only safe **because** they are content-hashed (a changed chunk gets a new URL) — the retention sweep deleting a still-referenced chunk (PHASE-61's residual) would become a *cached* 404 only for uncached first-time visitors, unchanged by this phase.
- **Service-worker interplay (verified, no SW change needed).** `sw.js` already fetches hashed assets cache-first under per-version caches (PHASE-61 correction), which masks the header cost for returning SW-installed visitors. The header fix targets the unmasked cases the report calls out: cold boots, private windows, SW-less contexts, and the Cloudflare edge. `sw.js` itself and `index.html` are stable-named and MUST stay `no-cache` (63A explicitly preserves this).
- **CSP tightening is verification-gated.** The deployed v2.7.1 `index.html` references zero external script/style origins (verified — pure self-hosted Vite bundle), but the report itself gates dropping allowances on "a browser-connected run enumerat[ing] actual loads." 63B ships a conservative VTT policy that keeps the runtime-required allowances (pdf.js blob worker, PeerJS/relay websockets, the tunnel-injected Cloudflare Insights beacon) and drops only what is provably kiosk/IDE-only; the final squeeze is an attended follow-up check, not a blocker.
- **PHASE-60 / PHASE-62 (the other live v2.7.x items) are unrelated surfaces** (renderer web-api parity; es.json values). The 2026-07-02 report re-verified PHASE-60 still live in deployed v2.7.1 and added a small spot-check to PHASE-62 (same-value key count 163 → 168; carry-forward recorded there) — no re-authoring here.

## Verified findings

All verification was against the live tree (worktree `auto/dnd-phase-maker`, post-v2.7.2 master) and live headers on the Pi (`curl` against `localhost:5000`, read-only).

### WEB-SERVE-1 (medium, performance) — content-hashed VTT assets served `Cache-Control: no-cache`; every boot revalidates the full chunk graph through the tunnel

**Status: confirmed exactly as reported.**

`GET /DungeonTableOnline/assets/app-constants-CCwwQIPA.js` returns `Cache-Control: no-cache` (verified live). Root cause is a two-part gap, both confirmed in source:

1. `bmo/pi/routes/webapp_api.py` `webapp_asset()` (line 72) serves assets via `send_from_directory(_DIST_DIR, subpath)` with **no `max_age`** — Flask emits `no-cache` when `max_age` is unset.
2. `bmo/pi/app.py` `_cache_policy()` (lines 85–97) only long-caches paths under `/static/` (`public, max-age=3600, must-revalidate`); the VTT mounts under `/DungeonTableOnline/` and never matches, so nothing upgrades the header.

The deployed `index.html` modulepreloads ~60 hashed chunks, so a cold boot is ~60 conditional GETs, each a round trip through cloudflared to the Pi; `no-cache` also prevents Cloudflare-edge caching. These files are content-hashed and immutable — the one class of asset that should be cached forever.

**Authoring precision (two invariants the fix must respect):**

- **Scope the immutable header to the hashed subtree only.** Only `/DungeonTableOnline/assets/**` is content-hashed. `index.html`, `sw.js`, `manifest.webmanifest`, `icons/**`, and `data/**` are **stable-named** (the `public/` dir is copied verbatim by the build) and must keep revalidating — long-caching `data/**` would pin stale game data; long-caching `sw.js` would slow SW updates.
- **The SPA fallback is already safe, by construction.** A miss under `/DungeonTableOnline/<path>` (BrowserRouter deep link — including a hypothetical miss under `assets/`) falls back to `_serve_index()` → an HTML response → `_cache_policy`'s `text/html` branch **assigns** (`=`, not `setdefault`) `no-cache`, overriding anything set earlier. So a route-level immutable header can only ever stick to a real asset hit. No extra guard needed; record it in the code comment.

**Reproduction:**

1. `curl -sI http://localhost:5000/DungeonTableOnline/assets/app-constants-CCwwQIPA.js` (on the Pi; any current hashed chunk)
2. Observe `Cache-Control: no-cache` (plus ETag/Last-Modified).

**Expected:** hashed assets under `/DungeonTableOnline/assets/` serve `Cache-Control: public, max-age=31536000, immutable`; `index.html` / `sw.js` / `data/**` stay `no-cache` (index already is).

**Root cause (file:line):** `bmo/pi/routes/webapp_api.py:72` (`send_from_directory` without `max_age`); `bmo/pi/app.py:95-97` (`_cache_policy` cache branch is `/static/`-only).

Verification:

```bash
# Live header (on the Pi; substitute a current hashed chunk name):
curl -sI http://localhost:5000/DungeonTableOnline/assets/$(ls /home/patrick/web-apps/DungeonTableOnline/assets | grep '^app-constants' | head -1) | grep -i cache-control
# Source: no max_age at the callsite; /static/-only cache branch:
grep -n "send_from_directory" bmo/pi/routes/webapp_api.py
sed -n '85,98p' bmo/pi/app.py
```

**Fix direction (route-local preferred; app-hook branch acceptable):**

- **Primary: set the header at the blueprint** (keeps VTT serving policy in the VTT blueprint, next to the SPA-fallback logic it must respect). In `webapp_asset()`, when `subpath.startswith("assets/")` and the file resolves, set `Cache-Control: public, max-age=31536000, immutable` on the response (Flask's `max_age=` kwarg emits `public, max-age=…` but not `immutable`, so set the header explicitly after `send_from_directory` returns).
- **Alternative:** add an `elif request.path.startswith("/DungeonTableOnline/assets/")` branch to `_cache_policy` next to the `/static/` branch (after the HTML branch, so the SPA fallback keeps `no-cache`). Functionally equivalent; choose one, don't do both.
- Leave `_serve_index()` and every non-`assets/` path untouched.

**Affected components:** `bmo/pi/routes/webapp_api.py` (primary) or `bmo/pi/app.py` (`_cache_policy`). Reference only (no change): `dnd-app/src/renderer/public/sw.js`, `.github/workflows/dnd-web-deploy.yml`.

### WEB-SERVE-2 (low, security) — VTT HTML inherits the site-wide kiosk/IDE CSP (`unsafe-eval`/`unsafe-inline` + IDE-CDN + YouTube-image allowances)

**Status: confirmed exactly as reported.**

`_cache_policy` (`bmo/pi/app.py:172-213`) sets the BMO-wide CSP on **every** `text/html` response via `setdefault`; the VTT blueprint never sets its own, so the kiosk-oriented default wins on `/DungeonTableOnline/` HTML. That policy carries `script-src … 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net https://cdn.socket.io …`, YouTube/Google image hosts, and Google Fonts origins — all justified in-source for the kiosk (Alpine.js `AsyncFunction` eval) and IDE (Monaco/xterm CDNs), none needed by the Vite-built VTT. Defense-in-depth on the game app is therefore weaker than necessary: an injected script in any rendered VTT field could eval and inline-script freely.

**Verified supporting facts:**

- The deployed v2.7.1 `index.html` references **zero** external script/style origins — one same-origin module entry + modulepreloads; no CDN tags, no fonts, no inline `<script>`.
- The in-repo contrast the report cites is real: `dungeon-scholar/vite.config.js:41-52` builds a tight app-specific CSP (`script-src 'self'`, no eval) injected as a meta tag at build time.
- Override mechanics are clean: because `_cache_policy` uses `setdefault` for the CSP, **any CSP set before the after-request hook runs wins** — and headers set inside the view function (on the response `_serve_index()` returns) always precede after-request hooks. No hook-ordering subtleties; this is the exact override path the `setdefault` comment ("per-route can override if needed") was designed for.

**Proposed VTT policy (conservative start; final squeeze verification-gated):**

Keep (runtime-required): `worker-src 'self' blob:` (pdf.js worker via blob URL); `connect-src 'self' data: ws: wss: https://cloudflareinsights.com` (PeerJS `/myapp` + relay websockets; PixiJS's `data:` ImageBitmap probe; CF RUM beacon endpoint); `script-src 'self' https://static.cloudflareinsights.com` (the tunnel auto-injects the CF Web Analytics beacon into HTML responses); `style-src 'self' 'unsafe-inline'` (React `style={{}}`/Tailwind runtime — same rationale as dungeon-scholar); `img-src 'self' data: blob:` (uploaded maps/portraits render from blob/data URLs); `font-src 'self' data:`; `frame-ancestors 'self'; base-uri 'self'; object-src 'none'`.

Drop (kiosk/IDE-only): `'unsafe-eval'`, script-src `'unsafe-inline'` + `blob:`, `https://cdn.jsdelivr.net`, `https://cdn.socket.io`, the three YouTube/Google image hosts, both Google Fonts origins.

An attended browser-connected run (DevTools console CSP-violation sweep across the report's Phase 1–13 surfaces, especially map upload, PDF viewer, 3D dice, multiplayer) confirms nothing legitimate is blocked before any further tightening (e.g. narrowing `ws: wss:`).

**Reproduction:**

1. `curl -sI http://localhost:5000/DungeonTableOnline/ | grep -i content-security-policy`
2. Observe the kiosk/IDE policy (`unsafe-eval`, `cdn.jsdelivr.net`, `i.ytimg.com`, …) on the VTT HTML.

**Expected:** `/DungeonTableOnline/*` HTML responses carry a VTT-scoped CSP without eval/CDN/YouTube allowances; kiosk and IDE HTML keep the existing policy unchanged.

**Root cause (file:line):** `bmo/pi/app.py:173` (site-wide CSP `setdefault` on all HTML); `bmo/pi/routes/webapp_api.py` `_serve_index()` (never sets a CSP, so the default wins).

Verification:

```bash
# Live: kiosk CSP on the VTT HTML today
curl -sI http://localhost:5000/DungeonTableOnline/ | grep -i content-security-policy
# Deployed shell references no external script/style origins:
grep -cE 'src="https?://|href="https?://' /home/patrick/web-apps/DungeonTableOnline/index.html   # -> 0
# Contrast: dungeon-scholar's tight build-time CSP
sed -n '41,52p' dungeon-scholar/vite.config.js
```

**Fix direction:** define the VTT CSP as a module constant in `webapp_api.py` and set it on the response in `_serve_index()` (both the index route and the SPA fallback flow through it, so one chokepoint covers all VTT HTML). `setdefault` semantics in `_cache_policy` make this a clean, ordering-safe override. Do **not** use a build-time meta tag (the dungeon-scholar pattern) — a header can also cover the SPA-fallback response and needs no dnd-app rebuild.

**Affected components:** `bmo/pi/routes/webapp_api.py` (primary). Reference only (no change): `bmo/pi/app.py` (`_cache_policy` CSP block), `dungeon-scholar/vite.config.js` (pattern reference), `dnd-app/index.web.html`.

## Sub-phases

> Per-sub-phase cheap check: this is a **bmo/pi Flask** change — `ruff check bmo/pi` + the Pi pytest suite (`bmo/pi/pytest.ini`; extend `tests/test_app_endpoints.py` with header assertions), then live `curl -sI` verification on the Pi after restart. No `tsc`/`vitest` surface; no web-bundle rebuild or redeploy.

### 63A — Immutable long-cache for hashed VTT assets (WEB-SERVE-1)

**Objective:** hashed assets under `/DungeonTableOnline/assets/` serve `public, max-age=31536000, immutable`; every stable-named VTT path (`index.html`, `sw.js`, `manifest.webmanifest`, `icons/**`, `data/**`) keeps revalidating; the SPA fallback stays `no-cache`.

**Files:** `bmo/pi/routes/webapp_api.py` (or the `_cache_policy` branch in `bmo/pi/app.py` — one of the two); `bmo/pi/tests/test_app_endpoints.py` (header regression tests).

**Steps:**

1. In `webapp_asset()`, on a successful `send_from_directory` hit where `subpath.startswith("assets/")`, set `Cache-Control: public, max-age=31536000, immutable` on the response (explicit header — Flask's `max_age=` alone does not emit `immutable`). Comment why the SPA fallback is exempt by construction (`_cache_policy`'s HTML branch assigns `no-cache`).
2. Add pytest coverage against a temp serve dir: (a) `assets/foo-HASH.js` → immutable long-cache; (b) `/DungeonTableOnline/` and a deep-link miss (e.g. `/DungeonTableOnline/settings`, and an `assets/` miss) → `no-cache` HTML; (c) `data/…`/`sw.js` → not long-cached.
3. Restart the Pi service; verify live with `curl -sI` (asset → immutable; index + deep link → `no-cache`; `sw.js` → not immutable).

**Acceptance:** ruff + Pi pytest green with the new header tests; live headers match the matrix in step 3; a cold boot in an SW-less/private window issues no per-chunk conditional GETs on the second load (chunks come from HTTP cache). Implementer-verified on the Pi.

### 63B — Route-scoped CSP for VTT HTML (WEB-SERVE-2)

**Objective:** `/DungeonTableOnline/*` HTML carries a VTT-specific CSP without `unsafe-eval`/script-`unsafe-inline`/IDE-CDN/YouTube allowances; kiosk + IDE HTML keep the existing site-wide policy byte-identical.

**Files:** `bmo/pi/routes/webapp_api.py`; `bmo/pi/tests/test_app_endpoints.py`.

**Steps:**

1. Add a `_VTT_CSP` module constant per the proposed policy above (keep: blob worker, ws/wss + data: connect, CF-insights beacon script + RUM endpoint, style `unsafe-inline`, data:/blob: img+font; drop: eval, script inline/blob, jsdelivr, socket.io CDN, YouTube/Google img hosts, Google Fonts) and set it on the response in `_serve_index()`, with a comment noting the `setdefault` override contract with `_cache_policy`.
2. Add pytest coverage: VTT index **and** SPA-fallback responses carry `_VTT_CSP` (no `unsafe-eval` substring); a kiosk/IDE HTML route still carries the site-wide policy (regression guard for the `setdefault` contract).
3. Restart + live-verify headers on `/DungeonTableOnline/` and one deep link; then run the app in a browser (attended or next browser-connected QA run) and sweep the DevTools console for CSP violations across map upload, PDF viewer, 3D dice, and a multiplayer join — the gate for keeping the drops (or restoring a specific allowance with an in-source justification comment, matching the kiosk CSP's comment style).
4. (Follow-up, optional, post-sweep) tighten further — e.g. scope `ws:`/`wss:` — only with the violation sweep clean.

**Acceptance:** ruff + Pi pytest green including both CSP tests; live VTT HTML shows the scoped policy while kiosk/IDE HTML is unchanged; the browser-connected violation sweep shows zero legitimate loads blocked (any restore is comment-justified). Implementer-verified on the Pi.

## Completed

> _Authored 2026-07-02 by phase-maker from the 2026-07-02 v2.7.1 WEB QA report. Implemented 2026-07-15 by dnd-phase-executer (user-approved via status board)._

- 63A Step 1 — DONE (`bmo/pi/routes/webapp_api.py:132`) — `webapp_asset()` sets `Cache-Control: public, max-age=31536000, immutable` (module constant `_IMMUTABLE_CACHE`) on real `assets/**` hits only; explicit header (Flask `max_age=` never emits `immutable`); in-source comment records the SPA-fallback-exempt-by-construction invariant (`_cache_policy` HTML branch assigns `no-cache`).
- 63A Step 2 — DONE (`bmo/pi/tests/test_app_endpoints.py`, `TestWebappServingHeaders`) — temp-serve-dir fixture; asserts hashed asset → immutable long-cache; index + deep link + `assets/` miss → `no-cache` HTML; `sw.js`/`data/**` → not long-cached. 7/7 pass; full `test_app_endpoints.py` 77/77; ruff clean.
- 63A Step 3 — DONE (verified live 2026-07-15) — service restarted; `curl -sI` on the Pi: hashed chunk → `public, max-age=31536000, immutable`; `/DungeonTableOnline/` + deep link → `no-cache`; `sw.js` → not immutable.
- 63B Step 1 — DONE (`bmo/pi/routes/webapp_api.py:78`) — `_VTT_CSP` module constant per the plan policy (kept: blob worker, `data:`+`ws:`/`wss:` connect, CF-insights script host + RUM endpoint, style `unsafe-inline`, `data:`/`blob:` img+font; dropped: `unsafe-eval`, script inline/blob, jsdelivr, socket.io CDN, YouTube/Google img hosts, Google Fonts), set in `_serve_index()` (single chokepoint for index + SPA fallback) with the `setdefault` override-contract comment.
- 63B Step 2 — DONE (`bmo/pi/tests/test_app_endpoints.py`, `TestWebappServingHeaders`) — VTT index + SPA fallback carry exactly `_VTT_CSP` (no `unsafe-eval`, no jsdelivr); `/bmo` kiosk HTML still carries the site-wide policy (setdefault-contract regression guard).
- 63B Step 3 — DONE (headers, verified live 2026-07-15) — live VTT HTML shows the scoped policy; kiosk HTML unchanged. The attended browser-connected CSP-violation sweep (map upload, PDF viewer, 3D dice, multiplayer join) remains the gate for any further tightening and is carried to the next browser-connected QA run per the plan (explicitly \"an attended follow-up check, not a blocker\").
- 63B Step 4 — Not taken (optional, post-sweep only by design).
