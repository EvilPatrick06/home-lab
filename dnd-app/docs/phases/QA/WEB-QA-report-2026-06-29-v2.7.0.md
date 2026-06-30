Tested: dnd-vtt WEB build (Dungeon Table Online) v2.7.0 — 2026-06-29 · URL: https://bmo.mybmoai.work/DungeonTableOnline/ · automated unattended run

> **This is a WEB-build QA report** for the browser SPA served by the Pi behind the Cloudflare tunnel, distinct from the desktop-build reports archived in `completed/`. The prior WEB report covered **v2.6.4**; the build now deployed is **v2.7.0** (entry `assets/index.web-mjgptdOc.js`, redeployed to the Pi **2026-06-29 16:24**; version confirmed in the deployed bundle `version:`2.7.0`` and in repo `dnd-app/package.json`). 50 commits landed on master in `a2d87c53..origin/master` affecting dnd-app — mostly refactors (PdfViewer/GameLayout hook extractions), logical-CSS RTL prep, and mobile/CI — with the only new user-facing web work being the **campaign version-history restore UI** (451a9fd1) and **character-card status-badge localization** (451a9fd1), plus sync/auth + storage-namespacing hardening (c396d299).
>
> **Run-mode limitation (read first):** this scheduled run executed **unattended, with no Claude-for-Chrome browser connected** (`list_connected_browsers` → `[]`), so the deployed app could **not** be driven interactively this run. Coverage is therefore a **static + deployed-artifact pass**: the live deployed bundle/chunks/assets on the Pi (`/home/patrick/web-apps/DungeonTableOnline/`) and the v2.7.0 source (read-only) were inspected to verify reachability, the new v2.7.0 features, web/Electron API parity, and i18n. Every hands-on/interactive surface (clicking through builder, in-game canvas/combat, DM tools, live multiplayer tabs, settings toggles, console/network-in-app) is listed under **Could not test** with the reason. Findings below are what static/deployed analysis could establish with confidence.

## Top findings (Critical & High)
- **None.** No Critical or High issues were established this run. The most severe verified finding is **Medium**: the new v2.7.0 Campaign Version History restore UI is non-functional on the web build (web `window.api` shim never implements `listCampaignVersions`/`restoreCampaignVersion`). See §5.

## 5. Campaign management — Version History restore UI is dead on the web build

### Campaign "Version History" list + restore fails on web — web `window.api` shim missing `listCampaignVersions` / `restoreCampaignVersion`
- **Category:** bug
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** static + deployed-bundle analysis of the new v2.7.0 campaign version-history feature (commit 451a9fd1) on the web build

**Description:** v2.7.0 adds a Campaign Version History panel on the Campaign Detail page (`CampaignVersionHistory.tsx`, rendered unconditionally from `CampaignDetailPage.tsx:331`). It calls `window.api.listCampaignVersions(campaignId)` (`CampaignVersionHistory.tsx:37`) to load the list and `window.api.restoreCampaignVersion(campaignId, fileName)` (`:49`) to restore. These methods exist only in the **Electron** preload bridge (`src/preload/index.ts:40-41`, backed by main-process IPC in `src/main/ipc/storage-handlers.ts` + `src/main/storage/campaign-storage.ts`). The **web** `window.api` shim (`src/web/web-api.ts`, installed by `src/web/install-web-api.ts` as `globalThis.api = createWebApi()`) does **not** define either method — verified two ways: (1) source grep of `web-api.ts` returns "NOT FOUND" for both names, and (2) grep across all **deployed** JS chunks finds the two method names only in the `CampaignDetailPage-*.js` route chunk (the call sites) and never in the web-shim bundle (the definition site). Notably the shim DOES stub the *character* equivalents — `listCharacterVersions: () => Promise.resolve([])` and `restoreCharacterVersion: () => Promise.resolve(null)` (`web-api.ts:226-227`) — so the campaign-version methods were simply never mirrored when the feature landed.

**Reproduction:**
1. Open the web build, open/create a campaign, go to the Campaign Detail page.
2. Click the "Version History" button.
3. Observed (by code path): `window.api.listCampaignVersions` is `undefined` → calling it throws `TypeError: window.api.listCampaignVersions is not a function` → caught at `:39` → error toast `toastLoadFailed` ("failed to load versions"), empty history. Restore similarly throws → caught at `:57` → `toastRestoreFailed`.

**Expected behavior:** On web the Version History panel should either function (web shim implements list/restore against IndexedDB or the BMO backend, mirroring the character-version stubs) or be hidden behind `isWebBuild()` so a permanently-failing affordance isn't shown.

**Hypothesis / root cause:** web/Electron `window.api` parity gap. Commit 451a9fd1 added `listCampaignVersions`/`restoreCampaignVersion` to the Electron preload + main IPC but did not add them to `src/web/web-api.ts`. The character-version methods were stubbed earlier (`web-api.ts:226-227`); the campaign-version methods were missed. No catch-all/Proxy exists in `web-api.ts`, so the call resolves to `undefined`.

**Suggested action:** Add `listCampaignVersions`/`restoreCampaignVersion` to `createWebApi()` (even as IndexedDB-backed implementations or the same `Promise.resolve([])`/`Promise.resolve(null)` stubs used for character versions), **or** gate `<CampaignVersionHistory>` behind `!isWebBuild()` in `CampaignDetailPage.tsx` until the web path is implemented. Prefer a real implementation if web autosave/version snapshots already live in IndexedDB (`dnd-vtt-web` DB).

**Environment:** web build v2.7.0 · deployed `index.web-mjgptdOc.js` + `CampaignDetailPage-DG8fxKBu.js` · static/deployed analysis (browser not connected)

**Related files:** `dnd-app/src/renderer/src/pages/campaign-detail/CampaignVersionHistory.tsx:37,49`, `dnd-app/src/renderer/src/pages/CampaignDetailPage.tsx:331`, `dnd-app/src/web/web-api.ts:226-227` (missing campaign-version methods), `dnd-app/src/preload/index.ts:40-41`

**Console output (if any):** (predicted) `Uncaught (in promise) TypeError: window.api.listCampaignVersions is not a function` — surfaced to user as the `toastLoadFailed` toast.

## 0. Deploy / infra — stale hashed chunks accumulate in the deployed assets dir

### Deployed `assets/` accumulates every prior build's hashed chunks (additive deploy, never purged) — 8 copies each of entry + key route chunks; PWA service worker present
- **Category:** debt
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** inspection of the deployed build directory `/home/patrick/web-apps/DungeonTableOnline/`

**Description:** The live deploy dir holds **1,214 JS chunks (~41 MB in `assets/`)**, including **8** `index.web-*.js` entry bundles, **8** `CampaignDetailPage-*.js`, and **8** `CharacterSheet5ePage-*.js` — one current copy per file plus ~7 stale copies from prior deploys (entry mtimes span 2026-06-28 16:24 → 2026-06-29 16:24, i.e. ~8 deploys). Only one of each is referenced by the current `index.html`/module graph (e.g. `CampaignDetailPage-DG8fxKBu.js`); the rest are orphaned. A PWA service worker is present (`sw.js`, 3596 bytes, regenerated each deploy). The deploy is evidently an **additive file copy** that never clears superseded hashed assets.

**Expected behavior:** Each deploy should replace the `assets/` dir wholesale (or prune unreferenced hashed files) so only the current build's chunks remain, keeping the surface small and unambiguous.

**Hypothesis / root cause:** the deploy step (`rsync`/`cp` into `/home/patrick/web-apps/DungeonTableOnline/`) copies new build output over the old without `--delete`/clean, so content-hashed filenames from every past build pile up.

**Suggested action:** Make the deploy clean/replace the `assets/` dir (or `rsync --delete`) so stale chunks are removed. Secondary: confirm the service worker precache manifest references only current-build assets (a precache that pins a stale chunk hash could serve a returning PWA user a mismatched chunk → runtime/version-skew errors). This is the more serious latent risk and is worth a one-time verification.

**Environment:** web build v2.7.0 · Pi deploy dir `/home/patrick/web-apps/DungeonTableOnline/assets/`

**Related files:** deploy script for `DungeonTableOnline` (Pi-side), `dnd-app/vite.web.config.ts`, `dnd-app/src/web/register-sw.ts`

## 13. i18n — carried-forward Spanish leaks (unaddressed by v2.7.0)

### Character-card data nouns (race / class / alignment) still render English under Español
- **Category:** bug
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** i18n source review (en.json/es.json parity + v2.7.0 CharacterCard diff)

**Description:** en.json and es.json now have **perfect keyed-string parity** (6,541 keys each, 0 missing, 0 extra) — good. v2.7.0's "character-card status-badge localization" (451a9fd1) correctly localizes only the retired/deceased status badge (`statusRetired`→"Retirado", `statusDeceased`→"Fallecido", gated by `status !== 'active'` — no mislabel bug). It does **not** touch the character-card data nouns (race/class/alignment, e.g. "Dwarf fighter", "Lawful Good") flagged in the prior v2.6.4 WEB report. Those are **data-driven** (rendered from content keys, not i18n strings), so they remain English under Español in v2.7.0 — carried-forward, still present, unverified-at-runtime this run (browser not connected) but unchanged in source.

**Expected behavior:** Localize race/class/alignment display nouns (or map data keys through i18n) on the character card under Español.

**Hypothesis / root cause:** race/class/alignment are rendered directly from character data, bypassing i18n; no mapping layer localizes them.

**Suggested action:** Add an i18n mapping for the data nouns on the character card (and confirm whether a deliberate keep-English policy applies — if so, document it).

**Environment:** web build v2.7.0 · locale=Español · static source review

**Related files:** `dnd-app/src/renderer/src/components/ui/CharacterCard.tsx`, `dnd-app/src/renderer/src/i18n/locales/es.json`

### Brand/terminology inconsistency: app title English vs Spanish "Mesa virtual"; "Dungeon Master" untranslated in es
- **Category:** UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** i18n same-value scan (es value == en value)

**Description:** Of 163 keys whose Spanish value equals the English value, most are intentional brand/proper nouns ("Ollama AI", "D&D", dice/command syntax like `/roll 1d20+$mod.str`). A few are worth aligning: `pages.mainMenuPage.appTitle` = "D&D Virtual Tabletop" (English) while the in-app brand elsewhere is the Spanish "Mesa virtual de D&D" (About) — same product named two ways across locales. And `game.chatPanel.dungeonMaster` / `lobby.characterSelector.dungeonMaster` / `campaign.hostNamePrompt.hostNamePlaceholder` / `pages.campaignDetailPage.defaultHostName` all keep "Dungeon Master" in es; Spanish D&D conventionally uses "Director de Juego"/"Máster". Low severity and possibly covered by the phase-57 keep-English policy — flagging for a consistency decision, not asserting a bug.

**Expected behavior:** One consistent product name per locale; a deliberate, documented choice on whether "Dungeon Master" stays English in es.

**Suggested action:** Either translate `appTitle` to match the "Mesa virtual de D&D" branding under es, or standardize both surfaces on one name; decide+document the "Dungeon Master" keep-English call.

**Environment:** web build v2.7.0 · locale=Español · static source review

**Related files:** `dnd-app/src/renderer/src/i18n/locales/es.json` (keys: `pages.mainMenuPage.appTitle`, `game.chatPanel.dungeonMaster`, `lobby.characterSelector.dungeonMaster`, `campaign.hostNamePrompt.hostNamePlaceholder`, `pages.campaignDetailPage.defaultHostName`)

## Could not test (genuine blockers this run)

- **All interactive / in-browser surfaces — env: Claude-for-Chrome browser not connected during this unattended scheduled run** (`list_connected_browsers` → `[]`). The web-qa-tester mandate is to drive the deployed app in-browser via Claude-for-Chrome with extra tabs for multiplayer; with no connected browser this run, none of the hands-on phases could be exercised. Specifically not tested this run: Phase 1 top-level navigation + 60s i18n/theme/colorblind smoke; Phase 2 character builder + level-up; Phase 3 Library spot-check; Phase 4 Bastion + Calendar; Phase 5 campaign wizard end-to-end (only the version-history feature was analyzed statically); Phase 6 map & canvas; Phase 7 combat (incl. 3D dice / reduced-motion fallback); Phase 8 DM tools; Phase 9 player views / View As; Phase 10 AI DM (Solo/Scene Prep, RAG, approvals — also depends on a reachable local Ollama, untested); Phase 11 multiplayer via extra tabs (lobby, hosting modes, rejoin/resume matrix, End Session); Phase 13 settings/themes/accessibility toggles and in-app console/network inspection. These are **not** out-of-scope omissions — they require a connected browser, which an unattended run does not have. Re-run with Claude-for-Chrome connected (or run attended) to cover them.
- **Phase 12 Discord (DM bot)** — out of reach unattended (no Discord client driven) and largely a desktop/bot-voice surface; deferred to an attended run.
- **HTTP response headers (e.g. Content-Security-Policy, cache-control) on the deployed VTT** — the deployed `DungeonTableOnline/index.html` carries no CSP `<meta>` (unlike the separate Dungeon Scholar GitHub-Pages build, which does), so any CSP must arrive as a server/tunnel response header; verifying response headers requires an HTTP client/browser that wasn't available this run. Worth confirming a CSP is actually served for the web VTT.
