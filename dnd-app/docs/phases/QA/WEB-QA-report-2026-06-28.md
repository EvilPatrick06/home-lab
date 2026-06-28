Tested: dnd-vtt WEB build (Dungeon Table Online) v2.6.3 — 2026-06-28 · URL: https://bmo.mybmoai.work/DungeonTableOnline/ · driven in-browser (Claude-for-Chrome), automated unattended run

> **This is a WEB-build QA report** (the browser SPA served by the Pi behind the Cloudflare tunnel), distinct from the desktop-build reports in this folder. Desktop-only surfaces (two-window launcher, native OS file dialogs, Discord DM bot voice, Electron auto-update) are adapted or marked out-of-scope/blocked per the web context. Multiplayer is exercised with extra browser tabs rather than the two-window desktop launcher. Version confirmed three ways: in-app **About → "Version 2.6.3"**, the deployed bundle string (`grep 2.6.x` in `/home/patrick/web-apps/DungeonTableOnline/assets/*.js` → `2.6.3`, deployed 2026-06-28 11:24), and repo `dnd-app/package.json` (`"version": "2.6.3"`). The prior WEB report (2026-06-23) covered v2.6.2, so this is a new build needing QA.

## Top findings (Critical & High)

- **[High]** Built-in map background images still 404 on the web build (base-path not applied) — **carried from the v2.6.2 WEB report and NOT fixed in v2.6.3.** Every preset map (e.g. Wizard's Tower) loads as an empty grid.

## Re-verification of prior WEB report (2026-06-23, v2.6.2)

Every prior WEB finding was re-checked against the deployed v2.6.3 build. **All of them still reproduce** — none were fixed in v2.6.3 (the v2.6.2→v2.6.3 diff touched campaign-detail managers, web DM cleanup, and multiplayer/cloud-relay networking, but did not address the asset-base-path, `<html lang>`, slider-accent, branding, or storage-namespacing issues). They are re-filed below under their phases with refreshed evidence. The two prior multiplayer-dependent could-not-test items (public-host null-deref re-exercise) remain not exercised this run (see "Could not test").

## Phase 6 — In-game: map & canvas

### Built-in map background images 404 on the web build (base-path not applied to `./data/...` asset URLs) — STILL PRESENT in v2.6.3
- **Category:** bug | portability
- **Severity:** high
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 6 — opening "QA Solo Game" → Play, with the built-in "Wizard's Tower" map active

**Description:** On entering a game whose active map is a built-in preset, the canvas shows an empty grid and a persistent error toast appears top-left: **"Failed to load map image: /data/5e/maps/wizards-tower.png"**. The image exists on the server; it is just requested at the wrong URL. This is unchanged from the v2.6.2 WEB report.

**Reproduction:**
1. Web app → My Campaigns → Your Campaigns → "QA Solo Game" → Open → **Play**.
2. The map canvas is blank (grid only); toast reads "Failed to load map image: /data/5e/maps/wizards-tower.png".
3. From the in-game page context (route `/DungeonTableOnline/game/<id>`), same-origin fetch probes:
   - `GET /data/5e/maps/wizards-tower.png` → **Failed to fetch** (not served at origin root).
   - `GET /DungeonTableOnline/data/5e/maps/wizards-tower.png` → **200 image/png** (correct location).
   - `GET data/5e/maps/wizards-tower.png` (relative to the `/game/<id>` route) → **200**, but this is the **SPA fallback HTML**, not the PNG — so a relative load "succeeds" with the wrong content type and the image decode fails.

**Expected behavior:** Built-in map backgrounds render on the canvas in the web build, same as desktop.

**Hypothesis / root cause:** Built-in map records store `imagePath` as `"./data/5e/maps/<id>.png"` (`dnd-app/src/renderer/public/data/5e/world/built-in-maps.json`; also constructed at `dnd-app/src/renderer/src/components/campaign/CampaignWizard.tsx:~319`). The map loader calls PixiJS `Assets.load(map.imagePath)` directly with that raw relative path (`dnd-app/src/renderer/src/components/game/map/map-canvas/use-map-background.ts:49`, toast at `:77`). On desktop (served from root) `./data/...`/`/data/...` resolves fine; the web build is served under Vite `base = /DungeonTableOnline/` (`vite.web.config.ts`) and the in-game route is `/DungeonTableOnline/game/<id>`, so the relative path either normalizes to the origin root `/data/...` (404) or resolves against the route to `/DungeonTableOnline/game/data/...` (SPA-fallback HTML, not the image). The loader needs to resolve asset paths against `import.meta.env.BASE_URL`.

**Suggested action:** Prefix runtime `public/data/...` asset URLs with `import.meta.env.BASE_URL` (or normalize stored `imagePath` to include the base on the web build) in `use-map-background.ts` before `Assets.load`. Audit other runtime `public/data` assets (portraits, sounds, fonts) for the same sub-path-base miss.

**Environment:** web build · external browser (Chrome) · base `/DungeonTableOnline/` · in-game route `/game/<id>` · solo · AI DM off

**Related files:** `dnd-app/src/renderer/src/components/game/map/map-canvas/use-map-background.ts:49,77`, `dnd-app/src/renderer/public/data/5e/world/built-in-maps.json`, `dnd-app/src/renderer/src/components/campaign/CampaignWizard.tsx:~319`, `dnd-app/vite.web.config.ts`

**Console output / HTTP:** toast "Failed to load map image: /data/5e/maps/wizards-tower.png"; `fetch('/data/5e/maps/wizards-tower.png')` → TypeError: Failed to fetch; `fetch('/DungeonTableOnline/data/5e/maps/wizards-tower.png')` → 200 image/png. (No JS console error is emitted — `Assets.load(...).catch(()=>{})` swallows it — so the toast is the only signal.)

### Map-load error toast is persistent (does not auto-dismiss) — STILL PRESENT in v2.6.3
- **Category:** UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 6 — in-game, after the map-image 404 above

**Description:** The "Failed to load map image" toast stayed pinned top-left for the entire in-game session (it remained visible across a `/roll 1d20+3` dice roll and opening the game-settings panel) with no visible dismiss control and no auto-timeout. Even after the asset bug is fixed, a sticky, non-dismissable error toast is a UX problem for any transient error.

**Suggested action:** Give error toasts an auto-dismiss timeout and/or a close affordance; don't leave a blocking-looking banner pinned over the canvas.

**Environment:** web build · in-game

## Phase 13 — Settings, themes, i18n & accessibility

### `<html lang>` attribute does not update when the UI language changes (stuck at "en") — STILL PRESENT in v2.6.3
- **Category:** bug | UX
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 13 — Settings → Language → Español

**Description:** Switching the interface language to Español translates the UI correctly (Settings renders "AJUSTES / PERFIL / IDIOMA / TEMA", themes "Oscuro/Pergamino/Alto contraste/Púrpura real"), but `document.documentElement.lang` stays `"en"`. With the page rendered in Spanish under `lang="en"`, screen readers and translation tooling treat the content as English (wrong pronunciation/voice, wrong hyphenation, broken auto-translate). `document.documentElement.dir` is also empty.

**Reproduction:**
1. Settings → Idioma → Español. UI switches to Spanish.
2. Console: `document.documentElement.lang` → `"en"` while the visible UI is Spanish. (Verified before=`en`, after switching to `es`=`en`.)

**Expected behavior:** `<html lang>` (and ideally `dir`) updates to `es`/`en` in lockstep with the selected locale.

**Hypothesis / root cause:** i18n init sets `<html lang>` once at load but has no `languageChanged` handler to update it at runtime (e.g. missing `i18n.on('languageChanged', l => document.documentElement.lang = l)`).

**Suggested action:** On language change, set `document.documentElement.lang` (and `dir`) from the active locale.

**Environment:** web build · language toggled EN↔ES

### Range sliders inconsistent — Audio sliders use the browser-default blue accent, others use the themed amber — STILL PRESENT in v2.6.3
- **Category:** UX | design-gotcha
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 13 — Settings, comparing range inputs' computed `accent-color`

**Description:** Within one Settings screen, slider styling is inconsistent. Measured computed `accent-color`:
- `master-volume` → `auto` (browser-default **blue**)
- `ambient-volume` → `auto` (browser-default **blue**)
- `ui-scale` → `oklch(0.769 0.188 70.08)` (themed **amber**)
- `grid-opacity` → `oklch(0.769 0.188 70.08)` (themed **amber**)

So the Audio sliders render blue while the UI-scale/Grid-opacity sliders are amber.

**Suggested action:** Apply the themed `accent-color` (the amber used by ui-scale/grid-opacity) to all range inputs, including the Audio sliders.

**Environment:** web build · Settings · Dark theme

## Phase 1 — Top-level pages, navigation & i18n smoke

### Web public name "Dungeon Table Online" vs in-app brand "D&D Virtual Tabletop" — STILL PRESENT in v2.6.3
- **Category:** UX | docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 1 — document title vs in-app header

**Description:** The web build's document/tab title and public URL name is "Dungeon Table Online" (`document.title`), but every in-app surface (main-menu wordmark, About header) brands the app "D&D Virtual Tabletop" / "Mesa virtual de D&D". Likely a deliberate public-name choice, but the two never reference each other, so a user may be unsure they're in the right app.

**Suggested action:** Pick one public name, or add a one-line "Dungeon Table Online is the web edition of D&D Virtual Tabletop" note in About.

**Environment:** web build · any browser

### VTT browser-storage keys share the origin with unrelated apps and aren't all namespaced — STILL PRESENT in v2.6.3
- **Category:** debt | portability
- **Severity:** low
- **Domain:** dnd-app | bmo
- **Discovered by:** QA Agent
- **During:** Phase 1 — inspecting localStorage on bmo.mybmoai.work

**Description:** The web build runs on shared origin `bmo.mybmoai.work`, so its localStorage coexists with unrelated BMO-app keys. Of 21 keys present, the non-`dnd-vtt*`/`dndapp*` keys were: `bmo_laptop_mic`, `bmo_music_last_query`, `bmo-ide-state`, `bmo_weather_cached`, `bmo_music_last_mode`, `bmo_mic_granted`, `bmo_health_summary`, `bmo_cal_events`, `bmo_laptop_audio` (other BMO apps) **plus two VTT keys that are not namespaced: `library-recent` and `lobby-chat-<gameId>`**. On a shared origin, un-namespaced keys risk collisions and make per-app data hard to clear.

**Suggested action:** Prefix all VTT storage keys (`dnd-vtt:`/`dndapp:`), specifically `library-recent` and `lobby-chat-*`; consider giving the web build its own origin/subdomain rather than sharing with the BMO dashboard apps.

**Environment:** web build · origin bmo.mybmoai.work

### i18n leaks carried from the v2.6.2 WEB report — not re-verified this run
- **Category:** UX | i18n
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 1 — i18n smoke

**Description:** The prior WEB report logged two low i18n leaks under Español: (a) character-card data nouns untranslated ("Nivel 1 Dwarf fighter", alignment "Lawful Good"), and (b) the **main-menu hero title** rendering "D&D VIRTUAL TABLETOP" in English while the About header translates to "Mesa virtual de D&D". These were **not re-exercised this run** (the Spanish pass this run covered the Settings page, which translated cleanly). Carried forward as **unverified — not re-walked in Spanish this run**; recommend a dedicated Spanish walk of the menu + character cards.

**Suggested action:** Re-verify and, if still present, decide a localization policy for race/class/alignment nouns and translate the menu hero title via the same key as the About header.

**Environment:** web build · language=Español (unverified this run)

## Could not test

- **Console-message capture returned nothing all run (tooling).** Claude-for-Chrome `read_console_messages` reported "No console messages found" at every checkpoint (page load, the map-image error, navigation, dice roll) — same as the prior WEB run. Worked around it by injecting an in-page hook overriding `console.error`/`console.warn` and listening for `error`/`unhandledrejection`; after install it captured **0** errors/warnings across the in-game dice roll, the game-settings panel, End Session, and the language switch. Pre-hook page-load console output could not be confirmed clean (the hook can only catch events after it is installed).
- **Full two-tab multiplayer not exercised** (host LAN/Public/Self/Cloud + second-tab join + lobby/character-assignment + rejoin/resume + kick/ban). The registry GET endpoint is reachable (`GET /api/games` → 200; `GET /api/games/public` → 405 method-not-allowed; `GET /api/dnd/public` → fetch error). The prior-report public-host null-deref ("reading 'ok'") was **not re-exercised** — it needs an actual Public host + second-tab join. v2.6.3's changelog claims multiplayer fixes ("cloud relay, char-sharing, roles, NAT"); these were not validated end-to-end this run. Recommend a dedicated two-tab multiplayer pass next run.
- **AI DM (local Ollama / llama.cpp) not exercised.** A local model endpoint is not reachable from the hosted web tab in an unattended run; AI-DM narration/action-surface/RAG/memory flows were not driven.
- **Discord DM bot not exercised.** Out of browser scope for the web run (Discord desktop/voice control isn't part of the in-browser web pass).
- **Export All Data / Import round-trip not exercised.** These trigger a browser file download / file-picker that an unattended run does not drive; only endpoint/UI wiring is implied, not a round-trip.

---
*Notes for the reader:* This run prioritized (1) re-verifying every prior WEB finding against v2.6.3 — all still reproduce — and (2) confirming core in-game flow works on the deployed build: opening a campaign, entering play, a `/roll 1d20+3` chat dice roll (resolved to 12 correctly, shown in log + Dice Tray), the End-Session confirm dialog, and End Session returning cleanly to the main menu with DM controls stripped (no privilege leak observed in the solo path). A `beforeunload` "unsaved changes" guard correctly fires on hard-navigation away from an active in-game session.
