Tested: dnd-vtt WEB build (Dungeon Table Online) v2.7.1 — 2026-07-02 · URL: https://bmo.mybmoai.work/DungeonTableOnline/ · automated unattended run

> **This is a WEB-build QA report** for the browser SPA served by the Pi behind the Cloudflare tunnel, distinct from the desktop-build reports in `completed/`. The prior WEB report covered **v2.7.0**; the build now deployed is **v2.7.1** (entry `assets/index.web-DmNAAm_P.js`, rsynced to the Pi **2026-06-30 00:21**; version confirmed in the current module graph — `SettingsPage-uX9VwquA.js` carries `version: 2.7.1` and is the chunk the current entry references — and in repo `dnd-app/package.json`).
>
> **The v2.7.0 → v2.7.1 dnd-app delta is web-inert.** Every dnd-app source change in `223fd832..248d37b1` is confined to `src/main/**` (Electron main process only: credential at-rest/leak hardening in the bridge modules, chunk-id NUL drift fix, Discord config persistence, atomic-write hardening) plus docs and the release bump. No `src/renderer/**` or `src/web/**` file changed, so the deployed web bundle is functionally identical to the QA-covered v2.7.0 aside from the version string. One relevant infra improvement landed: **cbc427a4** now gates the live web deploy on lint + typecheck + tests before rsync.
>
> **Run-mode limitation (read first):** this scheduled run executed **unattended, with no Claude-for-Chrome browser connected** (`list_connected_browsers` → `[]`), so the deployed app could **not** be driven interactively. Coverage is a **static + deployed-artifact + live-HTTP-header pass** (headers verified via `curl` against `localhost:5000` on the Pi, read-only). All hands-on surfaces are listed under **Could not test**.
>
> **Prior-report concerns closed by this run’s verification (no action needed):**
> - **Stale-chunk accumulation (PHASE-61):** the bounded retention sweep is live and working — deployed `assets/` is down from 1,214 files / ~41 MB / 8 entry generations (v2.7.0 run) to **756 files / 26 MB / 5 entry generations**, all within the 24 h retention window. Behaving as designed.
> - **Service-worker version-skew risk:** `sw.js` uses per-version cache namespaces (`dto-*-2.7.1-mr09d5p2`), evicts old `dto-*` caches on activate, and precaches only the shell (no hashed-chunk precache manifest). The prior report’s latent SW concern is cleared.
> - **“Is a CSP even served?”:** yes — confirmed on live HTML responses (see the CSP finding below for its breadth).

## Top findings (Critical & High)
- **None.** No Critical or High issues this run. Most severe: **Medium ×2** — hashed build assets served `Cache-Control: no-cache` (every boot revalidates the full chunk graph through the tunnel), and the PHASE-60 web-api parity gap is still live in the deployed build.

## 0. Deploy / infra

### Content-hashed build assets served with `Cache-Control: no-cache` — every app boot revalidates ~60+ chunks through the Cloudflare tunnel to the Pi
- **Category:** performance
- **Severity:** medium
- **Domain:** both
- **Discovered by:** QA Agent
- **During:** live HTTP-header inspection of the deployed web build (curl against localhost:5000 on the Pi)

**Description:** `GET /DungeonTableOnline/assets/app-constants-CCwwQIPA.js` returns `Cache-Control: no-cache` (verified live). The Flask route (`bmo/pi/routes/webapp_api.py` `webapp_asset`) serves assets via `send_from_directory` with no `max_age`, and Flask emits `no-cache` when max_age is unset; the app-wide `_cache_policy` hook (`bmo/pi/app.py`) only long-caches paths under `/static/`, which the VTT does not use. Consequences: (a) the SPA shell modulepreloads ~60 hashed chunks — every cold boot re-issues a conditional GET per chunk, each a round trip through the Cloudflare tunnel to the Pi; (b) `no-cache` also stops the Cloudflare edge from caching, so all asset traffic lands on the Pi; (c) the service worker’s cache-first asset strategy only mitigates after first visit/SW install, and not in private windows or SW-less contexts. These files are content-hashed and immutable — the one class of asset that should be cached forever.

**Reproduction:**
1. `curl -sI http://localhost:5000/DungeonTableOnline/assets/app-constants-CCwwQIPA.js` (on the Pi)
2. Observe `Cache-Control: no-cache` (plus ETag/Last-Modified).

**Expected behavior:** Hashed assets under `/DungeonTableOnline/assets/` served with `Cache-Control: public, max-age=31536000, immutable`. `index.html` correctly stays `no-cache` (it already is).

**Hypothesis / root cause:** `_cache_policy`’s `/static/`-only cache branch predates the VTT mount; `webapp_api.py` never passes `max_age` to `send_from_directory`.

**Suggested action:** Add a branch in `_cache_policy` for `request.path.startswith("/DungeonTableOnline/assets/")` setting the immutable long-cache header (or pass `max_age` in the route). Leave HTML at `no-cache`.

**Environment:** web build v2.7.1 · live deployed headers · Pi localhost:5000 behind cloudflared

**Related files:** `bmo/pi/app.py` (`_cache_policy`), `bmo/pi/routes/webapp_api.py` (`webapp_asset`)

### VTT inherits the site-wide kiosk/IDE CSP — `unsafe-eval`/`unsafe-inline` plus IDE-CDN and YouTube-image allowances apply to the game app
- **Category:** security
- **Severity:** low
- **Domain:** both
- **Discovered by:** QA Agent
- **During:** live HTTP-header inspection of `GET /DungeonTableOnline/`

**Description:** The CSP on the VTT’s HTML is the BMO-wide policy written for the kiosk/IDE surface: `script-src self unsafe-inline unsafe-eval blob: https://cdn.jsdelivr.net https://cdn.socket.io https://static.cloudflareinsights.com`, `img-src` includes `yt3.googleusercontent.com`/`lh3.googleusercontent.com`/`i.ytimg.com`, `style-src` includes Google Fonts, etc. The Vite-built VTT needs none of these relaxations (`unsafe-eval` exists for the kiosk’s Alpine.js; the CDN/YouTube hosts are the IDE/music surfaces’). Defense-in-depth on the game app is therefore weaker than necessary — an injected script in any rendered VTT field could eval and inline-script freely. Contrast: the dungeon-scholar deploy ships a tight app-specific CSP meta.

**Expected behavior:** A route-scoped, tighter CSP on `/DungeonTableOnline/*` HTML responses.

**Hypothesis / root cause:** `_cache_policy` sets the CSP via `setdefault` after every request; the VTT blueprint never sets its own, so the kiosk-oriented default wins.

**Suggested action:** Set a VTT-specific CSP on `_serve_index()` responses in `webapp_api.py` (setdefault semantics make this a clean override). Keep `blob:`/`worker-src` (pdf.js worker), `connect-src self ws: wss:` (PeerJS `/myapp`, relay, Supabase-style endpoints as applicable) and `static.cloudflareinsights.com` (tunnel-injected beacon); drop `unsafe-eval`, the IDE CDNs, and the YouTube img hosts after a browser-connected run enumerates actual loads.

**Environment:** web build v2.7.1 · live deployed headers

**Related files:** `bmo/pi/app.py` (CSP setdefault), `bmo/pi/routes/webapp_api.py`

## 5. Campaign management — carried from v2.7.0

### PHASE-60 web-api parity gap still live in deployed v2.7.1 — campaign Version History panel remains dead on web
- **Category:** bug
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** re-verification of the prior report’s top finding against the v2.7.1 deployed artifacts — **already tracked in PHASE-60** (`PHASE-60-web-campaign-version-history-api-parity.md`)

**Description:** Re-verified, still present in the deployed build: `src/web/web-api.ts` still defines neither `listCampaignVersions` nor `restoreCampaignVersion`, and the **current** route chunk referenced by the v2.7.1 entry (`CampaignDetailPage-CO5GY0Kx.js`) still contains both call sites while no deployed chunk contains a definition. Expected (the PHASE-60 fix has not landed); logged so the deployed status is on record — every web user who opens Campaign Detail → Version History gets a permanently failing panel.

**Suggested action:** Prioritize PHASE-60 (implement the two methods in `createWebApi()` or gate the panel behind `!isWebBuild()`).

**Environment:** web build v2.7.1 · deployed `index.web-DmNAAm_P.js` + `CampaignDetailPage-CO5GY0Kx.js` · static/deployed analysis

**Related files:** `dnd-app/src/web/web-api.ts`, `dnd-app/src/renderer/src/pages/campaign-detail/CampaignVersionHistory.tsx`, `dnd-app/docs/phases/PHASE-60-web-campaign-version-history-api-parity.md`

## 13. i18n — carried, plus a small drift to spot-check

### Same-English-value key count crept 163 → 168 since v2.7.0; carried noun/terminology items unchanged
- **Category:** UX
- **Severity:** info
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** i18n source re-scan (en/es flatten + compare)

**Description:** en/es keyed parity remains perfect (6,541 keys each, 0 missing / 0 extra). The carried v2.6.4/v2.7.0 items — character-card data nouns (race/class/alignment) rendering English under Español, and the brand/“Dungeon Master” terminology inconsistencies — are unchanged in source and now tracked in **PHASE-62**. New this run: the count of es keys whose value is identical to English rose from 163 to **168** (5 new same-value strings added since v2.7.0). Most same-value keys are intentional proper nouns/dice syntax; the 5 new ones should get a quick intentionality check in the next attended pass.

**Suggested action:** During the PHASE-62 pass, diff the same-value key set against the v2.7.0 baseline and confirm the 5 additions are deliberate keep-English strings.

**Environment:** web build v2.7.1 · static source review

**Related files:** `dnd-app/src/renderer/src/i18n/locales/en.json`, `es.json`, `dnd-app/docs/phases/PHASE-62-web-i18n-brand-terminology-consistency.md`

## Could not test (genuine blockers this run)

- **All interactive / in-browser surfaces — env: Claude-for-Chrome browser not connected during this unattended scheduled run** (`list_connected_browsers` → `[]`). Not exercised: Phase 1 navigation + i18n/theme/colorblind smoke; Phase 2 character builder + level-up; Phase 3 Library; Phase 4 Bastion + Calendar; Phase 5 campaign wizard end-to-end; Phase 6 map & canvas; Phase 7 combat (3D dice / reduced-motion); Phase 8 DM tools; Phase 9 player views; Phase 10 AI DM (note: the web shim stubs AI entirely — `web-api.ts` `ai: createAiStub()` — so web AI-DM coverage is bounded regardless); Phase 11 multiplayer via extra tabs (lobby, hosting modes, rejoin/resume matrix, End Session); Phase 13 settings/themes/accessibility and in-app console/network. Re-run with a connected browser (or attended) to cover them. Given the v2.7.1 web delta is version-string-only, the v2.7.0 interactive backlog is the same backlog — one attended run would clear it for both versions.
- **Phase 12 Discord (DM bot)** — unattended; no Discord client available. Deferred to an attended run.
