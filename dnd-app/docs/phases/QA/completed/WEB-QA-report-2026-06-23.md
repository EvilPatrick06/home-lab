Tested: dnd-vtt WEB build (Dungeon Table Online) v2.6.2 — 2026-06-23 · URL: https://bmo.mybmoai.work/DungeonTableOnline/ · driven in-browser (Claude-for-Chrome), automated unattended run

> **This is a WEB-build QA report** (the browser SPA served by the Pi behind the Cloudflare tunnel), distinct from the desktop-build reports in this folder. Desktop-only surfaces (two-window launcher, native OS file dialogs, Discord DM bot voice, Electron auto-update) are adapted or marked out-of-scope/blocked per the web context. Multiplayer is exercised with extra browser tabs rather than the two-window desktop launcher. Version confirmed three ways: footer "Version 2.6.2", About page, and the deployed bundle (`/home/patrick/web-apps/DungeonTableOnline`, deployed 17:37) — the prior WEB report (2026-06-22) covered v2.4.77, so this is a new build needing QA.

## Top findings (Critical & High)

- **[High]** Built-in map background images 404 on the web build — every preset map (e.g. Wizard's Tower) loads as an empty grid because image URLs are built without the `/DungeonTableOnline/` base path.

## Re-verification of prior WEB report (2026-06-22, v2.4.77) — informational

Two of the three prior top findings appear **resolved** in v2.6.2 (verified, not re-filed):
- Prior **[Critical]** "Enabling BMO_API_KEY makes the whole web app 401" → **resolved**: `bmo/pi/app.py` now defines `_PUBLIC_UNAUTH_PREFIXES = ("/api/library", "/api/sounds", "/DungeonTableOnline", "/api/dnd/public", "/api/games")` (app.py ~L264), so the SPA shell and its runtime data routes are exempt from the API-key gate.
- Prior **[High]** "Entering a game hard-crashes (Failed to fetch dynamically imported module InGamePage-*.js) for a session open across a redeploy" → **could not reproduce**: resumed the "QA Solo Game" (hosted 22h ago, i.e. before today's 17:37 redeploy) and pressed Play — the in-game surface loaded normally with no dynamic-import error.
- Prior **[High]** "Hosting a Public game fails to list in registry (null-deref reading 'ok')" → **not re-exercised this run** (would require hosting a Public game + a second-tab join; see Could not test).

## Phase 6 — In-game: map & canvas

### Built-in map background images 404 on the web build (base-path not applied to `/data/...` asset URLs)
- **Category:** bug | portability
- **Severity:** high
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 6 — entering "QA Solo Game" (Play) with the built-in "Wizard's Tower" map active

**Description:** On entering any game whose active map is a built-in preset, the canvas shows an empty grid and a persistent error toast appears top-left: **"Failed to load map image: /data/5e/maps/wizards-tower.png"**. The image file is present on the server — it just isn't being requested at the right URL. The app requests it at the origin root (`/data/5e/maps/...`) instead of under the SPA's base path (`/DungeonTableOnline/data/5e/maps/...`).

**Reproduction:**
1. Open the web app → My Campaigns → resume/open a campaign with a built-in map (e.g. "QA Solo Game" → Wizard's Tower) → Play.
2. The map canvas is blank (grid only); a toast reads "Failed to load map image: /data/5e/maps/wizards-tower.png".
3. Confirmed from the page context (same-origin fetch):
   - `GET /data/5e/maps/wizards-tower.png` → **Failed to fetch** (not served at root).
   - `GET /DungeonTableOnline/data/5e/maps/wizards-tower.png` → **200, image/png**.
4. The file exists on disk: `/home/patrick/web-apps/DungeonTableOnline/data/5e/maps/wizards-tower.png` (and all 15 preset maps).

**Expected behavior:** The map background loads and renders on the canvas for built-in maps in the web build, same as desktop.

**Hypothesis / root cause:** Built-in map records store `imagePath` as a root/relative path that ignores the Vite base. `dnd-app/src/renderer/public/data/5e/world/built-in-maps.json` stores `"imagePath": "./data/5e/maps/<id>.png"` and `dnd-app/src/renderer/src/components/campaign/CampaignWizard.tsx:319` builds `imagePath: ` + "`./data/5e/maps/${assignment.builtInMapId}.png`". On desktop the app is served from root so `./data/...`/`/data/...` resolves correctly; the web build is served under base `/DungeonTableOnline/` (Vite `base` in `vite.web.config.ts`), and the in-game route is `/DungeonTableOnline/game/<id>`, so a root-anchored `/data/...` URL (or a `./data/...` relative path resolved against the routed URL) misses the base and 404s. The map-image loader needs to resolve asset paths against `import.meta.env.BASE_URL` rather than emitting a root/relative `/data/...` URL.

**Suggested action:** Prefix built-in map image URLs (and any other `public/data/...` asset URLs surfaced at runtime) with `import.meta.env.BASE_URL` when loading, or store/normalize `imagePath` to include the base on the web build. Verify the same fix covers other `public/data` assets referenced at runtime (portraits, sounds, fonts) on the sub-path base.

**Environment:** web build · external browser · base `/DungeonTableOnline/` · in-game route `/game/<id>` · Reduced Motion ON

**Related files:** `dnd-app/src/renderer/public/data/5e/world/built-in-maps.json`, `dnd-app/src/renderer/src/components/campaign/CampaignWizard.tsx:319`, map-canvas image loader (renderer), `dnd-app/vite.web.config.ts` (base)

**Console output / HTTP:** toast "Failed to load map image: /data/5e/maps/wizards-tower.png"; `fetch('/data/5e/maps/wizards-tower.png')` → TypeError: Failed to fetch; `fetch('/DungeonTableOnline/data/5e/maps/wizards-tower.png')` → 200 image/png

### Map-load error toast is persistent (does not auto-dismiss)
- **Category:** UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 6 — in-game, after the map-image 404 above

**Description:** The "Failed to load map image" toast remained pinned top-left for the entire in-game session (it stayed visible across a dice roll and other interactions) with no visible dismiss control and no auto-timeout. Even once the underlying asset bug is fixed, a sticky, non-dismissable error toast is a UX problem for any transient error.

**Suggested action:** Give error toasts an auto-dismiss timeout and/or a close affordance; don't leave a blocking-looking banner pinned over the canvas.

**Environment:** web build · in-game

## Phase 13 — Settings, themes, i18n & accessibility

### `<html lang>` attribute does not update when the UI language changes (stuck at "en")
- **Category:** bug | UX
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 13 — switching Settings → Language → Español

**Description:** Switching the interface language to Español translates the UI correctly, but `document.documentElement.lang` stays `"en"`. With the whole page rendered in Spanish but `lang="en"`, screen readers and translation tooling will treat the content as English (wrong pronunciation/voice, wrong hyphenation, broken auto-translate). The `lang` attribute should track the active i18n locale.

**Reproduction:**
1. Settings → Idioma → Español (UI switches to Spanish; persists across reload via IndexedDB).
2. In the console: `document.documentElement.lang` → `"en"` while the visible UI is Spanish.

**Expected behavior:** `<html lang>` updates to `es` (and back to `en`) in lockstep with the selected language.

**Hypothesis / root cause:** The i18n init sets `<html lang>` once at load from the default/browser language but no `languageChanged` handler updates it (e.g. no `i18n.on('languageChanged', l => document.documentElement.lang = l)`), so runtime locale switches never propagate to the attribute.

**Suggested action:** On language change, set `document.documentElement.lang` (and ideally `dir`) from the active locale.

**Environment:** web build · language toggled EN↔ES

### Range sliders use the browser-default blue accent, inconsistent with the amber theme
- **Category:** UX | design-gotcha
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 13 — Settings → Audio vs Grid sliders

**Description:** The Audio sliders (Master Volume, Ambient Music) render with the browser-default **blue** range accent, while the Grid Opacity slider in the same Settings screen is **amber/orange** themed. So slider styling is inconsistent within one page — some themed, some default-blue.

**Suggested action:** Apply the themed `accent-color` (or the custom range styling used by Grid Opacity) to all range inputs.

**Environment:** web build · Settings · Dark theme

## Phase 1 — Top-level pages, navigation & i18n smoke

### Untranslated character-derived strings under Español (race / class / alignment)
- **Category:** UX | i18n
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 1/2 — Your Characters (Tus personajes) with language=Español

**Description:** With the UI in Spanish, the character card summary mixes languages: "**Nivel 1** Dwarf fighter" ("Nivel 1" translated, "Dwarf fighter" not) and the alignment "**Lawful Good**" stays English. Chrome/labels are translated but data-derived nouns (race, class, alignment) are not localized. (May be partly intentional for D&D proper nouns, but "Lawful Good" → "Legal y bueno" is a common localization; the mixed-language line reads as a gap.)

**Suggested action:** Decide a policy for race/class/alignment localization and apply it consistently (translate, or intentionally keep canonical and document it).

**Environment:** web build · language=Español

### Web public name "Dungeon Table Online" vs in-app brand "D&D Virtual Tabletop"
- **Category:** UX | docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 1 — document title vs in-app header

**Description:** The web build's document/tab title and public URL name is "Dungeon Table Online", but every in-app surface (main-menu wordmark, About header) brands the app "D&D Virtual Tabletop" / "Mesa virtual de D&D". Likely a deliberate public-name choice (avoiding the D&D wordmark on the public URL), but the two never reference each other, so a user may be unsure they're in the right app.

**Suggested action:** Pick one public name or add a one-line "Dungeon Table Online is the web edition of D&D Virtual Tabletop" note in About.

**Environment:** web build · any browser

### Main-menu hero title not translated under Español (the About header is)
- **Category:** UX | i18n
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 1 — i18n smoke (Español)

**Description:** Under language=Español, the **main-menu** hero title renders "D&D VIRTUAL TABLETOP" (English) while its subtitle ("Tu aventura te espera") and all menu cards are translated — and the **About** page renders the same title translated as "Mesa virtual de D&D". So the title is localized in one place and not the other.

**Suggested action:** Translate the menu hero title via the same i18n key, or leave the About header untranslated to match — make the two consistent.

**Environment:** web build · language=Español

### Main-menu cards sometimes need a second click right after page load — unverified
- **Category:** UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 1 — clicking "My Campaigns" and "Library" immediately after a fresh load

**Description:** On two occasions, the first click on a main-menu card immediately after navigating to the menu only applied the hover/highlight state and did not navigate; a second click then navigated. Could be a hydration-timing window (handlers not yet attached) or a tooling artifact of synthetic clicks landing before React hydration. **Unverified — possibly a tool/timing artifact rather than an app bug;** flagged for a human to confirm with a real pointer.

**Suggested action:** Confirm manually; if real, ensure menu cards are interactive as soon as they're painted (avoid a hydration gap where the card looks clickable but isn't).

**Environment:** web build · main menu, right after load

### VTT browser-storage keys share the origin with unrelated apps and aren't all namespaced
- **Category:** debt | portability
- **Severity:** low
- **Domain:** dnd-app | bmo
- **Discovered by:** QA Agent
- **During:** Phase 1 — inspecting localStorage on bmo.mybmoai.work

**Description:** The web build runs on the shared origin `bmo.mybmoai.work`, so its localStorage coexists with unrelated BMO-app keys (`bmo_laptop_mic`, `bmo_music_last_query`, `bmo-ide-state`, `bmo_weather_cached`, `bmo_health_summary`, `bmo_mic_granted`, …). Most VTT keys are namespaced (`dnd-vtt-*`, `dndapp:*`), but a few are not (`library-recent`, `lobby-chat-<id>`). On a shared origin, un-namespaced keys risk collisions and make per-app data hard to clear. (Language preference is stored in IndexedDB, not localStorage — it does persist across reload.)

**Suggested action:** Prefix all VTT storage keys (`dnd-vtt:`/`dndapp:`); consider whether the web build should live on its own origin/subdomain rather than sharing with the BMO dashboard apps.

**Environment:** web build · origin bmo.mybmoai.work

## Could not test

- **Console-message capture returned nothing all run (tooling).** The Claude-for-Chrome `read_console_messages` tool reported "No console messages found" at every checkpoint (page loads, the map-image error, navigation, dice roll), so console-only findings (React key/controlled-input warnings, unhandled rejections, PixiJS/WebGL/WebRTC noise) could not be gathered. Findings here are based on UI error toasts, same-origin `fetch` probes, network inspection, and source cross-checks instead. A clean console could not be confirmed.
- **Prior-HIGH "Public game not listed in registry (null-deref)" not re-exercised.** Re-verifying it needs hosting a Public game and joining from a second tab; not reached this run (not a hard blocker — a coverage gap). Recommend a dedicated multiplayer pass (host LAN/Public/Cloud + second-tab join + rejoin/resume + kick/ban) next run.
- **Export All Data / Import Data not exercised.** Export triggers a browser file download and Import opens a file picker; in an unattended run these were not driven (download/file-picker gating), so only their presence/wiring on the About page was confirmed, not a round-trip.
