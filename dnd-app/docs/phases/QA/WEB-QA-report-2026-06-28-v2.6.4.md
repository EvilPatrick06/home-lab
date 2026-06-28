Tested: dnd-vtt WEB build (Dungeon Table Online) v2.6.4 — 2026-06-28 · URL: https://bmo.mybmoai.work/DungeonTableOnline/ · driven in-browser (Claude-for-Chrome), automated unattended run

> **This is a WEB-build QA report** (the browser SPA served by the Pi behind the Cloudflare tunnel), distinct from the desktop-build reports in this folder. Desktop-only surfaces (two-window launcher, native OS file dialogs, Discord DM bot voice, Electron auto-update) are adapted or marked out-of-scope/blocked per the web context. Multiplayer is exercised with extra browser tabs rather than the two-window desktop launcher. Version confirmed three ways this run: in-app **About → "Version 2.6.4"**, the deployed bundle version constant (`version: 2.6.4` in the deployed `/home/patrick/web-apps/DungeonTableOnline/assets/*.js`, redeployed 2026-06-28 14:05), and repo `dnd-app/package.json` (`"version": "2.6.4"`). The prior WEB report (2026-06-28, `WEB-QA-report-2026-06-28.md`) covered v2.6.3, so this is a new build needing QA. **Every prior WEB finding was re-checked against the deployed v2.6.4 build — all of them still reproduce; none were fixed in v2.6.4** (the v2.6.3→v2.6.4 diff did not address the asset-base-path, `<html lang>`, slider-accent, branding, or storage-namespacing issues). They are re-filed below under their phases with refreshed v2.6.4 evidence.

## Top findings (Critical & High)

- **[High]** Built-in map background images still 404 on the web build (base-path not applied) — **carried from the v2.6.2/v2.6.3 WEB reports and NOT fixed in v2.6.4.** Every preset map (e.g. Wizard's Tower) loads as an empty grid.

## Phase 1 — Top-level pages, navigation & i18n smoke

### Web public name "Dungeon Table Online" vs in-app brand "D&D Virtual Tabletop" — STILL PRESENT in v2.6.4
- **Category:** UX | docs
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 1 — document title vs in-app header (About page)

**Description:** Carried from the v2.6.3 WEB report and unchanged in v2.6.4. The browser tab title / public URL name is "Dungeon Table Online" (`document.title`), while every in-app surface (main-menu wordmark, About header "D&D Virtual Tabletop / Version 2.6.4") brands the app "D&D Virtual Tabletop". The two never reference each other.

**Suggested action:** Pick one public name, or add a one-line "Dungeon Table Online is the web edition of D&D Virtual Tabletop" note in About.

**Environment:** web build · any browser

### VTT browser-storage keys still not all namespaced on the shared origin — STILL PRESENT in v2.6.4
- **Category:** debt | portability
- **Severity:** low
- **Domain:** dnd-app | bmo
- **Discovered by:** QA Agent
- **During:** Phase 1 — inspecting localStorage on bmo.mybmoai.work

**Description:** Carried from the v2.6.3 WEB report; unchanged in v2.6.4. The web build shares origin `bmo.mybmoai.work` with unrelated BMO-app keys (`bmo_laptop_mic`, `bmo_music_last_query`, `bmo-ide-state`, `bmo_weather_cached`, `bmo_music_last_mode`, `bmo_mic_granted`, `bmo_health_summary`, `bmo_cal_events`, `bmo_laptop_audio`). Most VTT keys are namespaced (`dnd-vtt-*`, `dndapp:*`), but two are still bare: **`library-recent`** and **`lobby-chat-<gameId>`** (observed `lobby-chat-253adf0e-c855-42a4-8e36-d908fd9bc599`). On a shared origin these risk collision and make per-app data hard to clear.

**Suggested action:** Prefix `library-recent` and `lobby-chat-*` with the VTT namespace; consider giving the web build its own subdomain.

**Environment:** web build · origin bmo.mybmoai.work

### About page presents desktop-only framing on the web build ("Electron 40 — Desktop framework")
- **Category:** portability | docs | UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 1 — About page, TECH STACK + feature list on the web edition

**Description:** On the web build, the About page's TECH STACK section lists **"Electron 40 — Desktop framework"** as the first entry, and the description/feature copy is the desktop copy verbatim ("An app for playing D&D 5e online with friends", "P2P Multiplayer via WebRTC"). The browser edition is not Electron — it is a Vite/React SPA served over HTTP — so advertising Electron as the framework is inaccurate for what the user is actually running, and there is no mention that this is the web edition.

**Reproduction:**
1. Web app → About & Data → scroll to TECH STACK.
2. First card reads "Electron 40 / Desktop framework".

**Expected behavior:** On the web build, omit or relabel the Electron/desktop-only stack entries (or gate the tech-stack list by build target), and/or note this is the web edition.

**Hypothesis / root cause:** The About page renders a single hard-coded tech-stack/feature array regardless of build target (Vite `base`/web flag not consulted) — `dnd-app/src/renderer/src/pages/AboutPage.tsx` (tech-stack array).

**Suggested action:** Branch the About tech-stack/feature copy on the web build target, or add a "Web edition" qualifier.

**Environment:** web build · About page · Dark theme

### i18n: character-card data nouns (race/class/alignment) untranslated under Español — STILL PRESENT in v2.6.4
- **Category:** UX | i18n
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 1 — i18n smoke, Characters page under Español

**Description:** Carried from prior WEB reports and re-verified this run. With the UI in Español, the Characters page chrome translates correctly ("Tus personajes", "Activos / Retirados / Fallecidos / Todos", "Eliminar todos", "Nuevo personaje", "PG"=HP, "CA"=AC), but the character-card data line stays English: **"Nivel 1 Dwarf fighter"** (race "Dwarf" and class "fighter" untranslated) and alignment **"Lawful Good"** (untranslated). Casing is also inconsistent within the same line ("Dwarf" capitalized, "fighter" lowercase). NOTE: the prior report's separate "menu hero title in English" item is **not** a leak — the main-menu wordmark "D&D Virtual Tabletop" is the brand name and is intentionally kept English everywhere (it matches the About header); the menu cards otherwise translate fully ("Tus personajes", "Mis campañas", "Biblioteca", "Bastiones", "Tu aventura te espera"). Only the data-noun leak is a real finding.

**Reproduction:**
1. Settings → Idioma → Español.
2. Menu → "Tus personajes" → the character card reads "Nivel 1 Dwarf fighter" / "Lawful Good".

**Expected behavior:** Race, class, and alignment render in Spanish (or a deliberate policy is documented to keep game-term nouns in English), with consistent casing.

**Hypothesis / root cause:** Character-card composes the descriptor from raw stored race/class/alignment strings rather than i18n keys (no locale lookup for the `5e` term tables).

**Suggested action:** Localize race/class/alignment via i18n term tables (or document an explicit keep-English policy) and normalize casing of the "Level N <race> <class>" line.

**Environment:** web build · language=Español · Dark theme

### i18n: "Dungeon Master" left untranslated in the Join-Game menu subtitle under Español
- **Category:** UX | i18n
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 1 — i18n smoke, main menu under Español

**Description:** Under Español the "Unirse a la partida" menu card subtitle reads "Conéctate a una partida alojada por tu **Dungeon Master**" — "Dungeon Master" stays English mid-sentence. Minor consistency leak (other menu cards translate fully).

**Suggested action:** Translate or intentionally keep "Dungeon Master"/"DM" consistently across locales.

**Environment:** web build · language=Español · main menu

### Export All Data works on web (direct download) — info, for context
- **Category:** docs
- **Severity:** info
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 1 — About → Export All Data on the web build

**Description:** On the web build, "Export All Data" does not open a native save dialog (desktop behavior); it triggers a direct browser download and shows a success toast ("Exported 1 character, 2 campaigns, 2 bastions, 0 creatures, 0 homebrew"). Wiring is functional. The desktop report's "blank-filename export dialog" concern does not apply on web (the browser names the file). Recorded as info; the import round-trip was not driven (file-picker, unattended).

**Environment:** web build · About page

## Phase 6 — In-game: map & canvas

### Built-in map background images still 404 on the web build (base-path not applied to `./data/...` asset URLs) — STILL PRESENT in v2.6.4
- **Category:** bug | portability
- **Severity:** high
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 6 — resuming "QA Solo Game" → Play, built-in "Wizard's Tower" map active

**Description:** Carried from the v2.6.2 and v2.6.3 WEB reports and **still NOT fixed in v2.6.4.** On entering a game whose active map is a built-in preset, the canvas shows an empty grid and a persistent error toast appears top-left: **"Failed to load map image: /data/5e/maps/wizards-tower.png"**. The image exists on the server; it is requested at the wrong (un-based) URL.

**Reproduction:**
1. Web app → My Campaigns → Resume "QA Solo Game" → campaign detail → **Play**.
2. Canvas is blank (grid only); toast reads "Failed to load map image: /data/5e/maps/wizards-tower.png".
3. From the in-game route (`/DungeonTableOnline/game/<id>`), same-origin fetch probes (re-run this v2.6.4 run):
   - `GET /data/5e/maps/wizards-tower.png` → **Failed to fetch** (not served at origin root).
   - `GET /DungeonTableOnline/data/5e/maps/wizards-tower.png` → **200 image/png** (correct, base-prefixed location).

**Expected behavior:** Built-in map backgrounds render on the canvas in the web build, same as desktop.

**Hypothesis / root cause:** Built-in map records store `imagePath` as `"./data/5e/maps/<id>.png"` (`dnd-app/src/renderer/public/data/5e/world/built-in-maps.json`; also constructed in `CampaignWizard.tsx`). The map loader calls PixiJS `Assets.load(map.imagePath)` with that raw relative path (`dnd-app/src/renderer/src/components/game/map/map-canvas/use-map-background.ts`). The web build is served under Vite `base = /DungeonTableOnline/`, so the un-based path resolves to origin root `/data/...` (404). The loader must resolve asset paths against `import.meta.env.BASE_URL`.

**Suggested action:** Prefix runtime `public/data/...` asset URLs with `import.meta.env.BASE_URL` (or normalize stored `imagePath` to include the base on the web build) before `Assets.load`. Audit other runtime `public/data` assets (portraits, sounds, fonts) for the same sub-path-base miss.

**Environment:** web build · external browser (Chrome) · base `/DungeonTableOnline/` · in-game route `/game/<id>` · solo · AI DM off

**Console output / HTTP:** toast "Failed to load map image: /data/5e/maps/wizards-tower.png"; `fetch('/data/5e/maps/wizards-tower.png')` → "Failed to fetch"; `fetch('/DungeonTableOnline/data/5e/maps/wizards-tower.png')` → 200 image/png. (No JS console error is emitted — the `Assets.load(...)` rejection is swallowed — so the toast is the only signal; the in-page console hook captured 0 errors across the in-game session.)

### Map-load error toast is still persistent (does not auto-dismiss, no close affordance) — STILL PRESENT in v2.6.4
- **Category:** UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 6 — in-game, after the map-image 404 above

**Description:** Carried from v2.6.3; unchanged. The "Failed to load map image" toast stays pinned top-left for the entire in-game session with no visible dismiss control and no auto-timeout (it overlaps the left sidebar's "AI Characters/NPCs" header across a `/roll` dice roll and the initiative tracker). Even once the asset bug is fixed, a sticky, non-dismissable error toast is a UX problem for any transient error.

**Suggested action:** Give error toasts an auto-dismiss timeout and/or a close affordance; don't leave a blocking-looking banner pinned over the canvas/sidebar.

**Environment:** web build · in-game

## Phase 13 — Settings, themes, i18n & accessibility

### `<html lang>` attribute still does not update on language change (stuck at "en") — STILL PRESENT in v2.6.4
- **Category:** bug | UX
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 13 — Settings → Idioma → Español

**Description:** Carried from the v2.6.3 WEB report; unchanged in v2.6.4. Switching the interface language to Español translates the UI correctly (Settings → "AJUSTES / PERFIL / IDIOMA / TEMA / Audio / Accesibilidad / Sistema"; themes "Oscuro / Pergamino / Alto contraste / Púrpura real"), but `document.documentElement.lang` stays `"en"` and `document.documentElement.dir` is empty. Screen readers and auto-translate then treat Spanish content as English.

**Reproduction:**
1. Settings → Idioma → Español (UI switches to Spanish; `<select>` value = `es`).
2. Console: `document.documentElement.lang` → `"en"`; `document.documentElement.dir` → `""`.

**Expected behavior:** `<html lang>` (and ideally `dir`) updates to the active locale in lockstep with the language selection.

**Hypothesis / root cause:** i18n init sets `<html lang>` once at load with no runtime `languageChanged` handler (missing `i18n.on('languageChanged', l => document.documentElement.lang = l)`).

**Suggested action:** On language change, set `document.documentElement.lang` (and `dir`) from the active locale.

**Environment:** web build · language toggled EN↔ES · Dark theme

### Audio range sliders still use browser-default blue accent while other sliders use themed amber — STILL PRESENT in v2.6.4
- **Category:** UX | design-gotcha
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 13 — Settings, computed `accent-color` of range inputs

**Description:** Carried from the v2.6.3 WEB report; unchanged in v2.6.4. Measured computed `accent-color`: `master-volume` → `auto` (browser blue), `ambient-volume` → `auto` (browser blue), `ui-scale` → `oklch(0.769 0.188 70.08)` (themed amber), `grid-opacity` → `oklch(0.769 0.188 70.08)` (themed amber). Audio sliders render blue; the others render amber within the same screen. The mismatch is theme-independent — under the Parchment theme the Master-Volume thumb still renders the browser-default blue.

**Suggested action:** Apply the themed `accent-color` to all range inputs, including the Audio sliders.

**Environment:** web build · Settings · Dark and Parchment themes

## Could not test (genuine blockers / env limits — unattended web run)

- **Full multi-tab multiplayer not exercised end-to-end** (host LAN/Public/Self Host/Cloud Host + second-tab join + lobby/character-assignment + Ready/Start + kick/ban + the rejoin/resume matrix + End Session). The registry is reachable from the hosted tab (`GET /api/games` → 200; `GET /api/games/public` → 405 method-not-allowed; `GET /api/dnd/public` → fetch error), and the Join-Game browser renders with a clean "No games found" empty state, but a public/cloud host plus a coordinated second tab with character assignment was not driven this unattended run. The prior-report public-host null-deref ("reading 'ok'") was not re-exercised. Recommend a dedicated multi-tab multiplayer pass next run.
- **AI DM (local Ollama / llama.cpp) not exercised.** A local model endpoint is not reachable from the hosted web tab in an unattended run; AI-DM narration / action-surface / RAG / memory / approval flows were not driven.
- **Discord DM bot not exercised.** Out of browser scope for the web run (Discord desktop/voice control is not part of the in-browser web pass).
- **Import round-trip not driven.** Export All Data verified as a direct browser download; the matching Import (file-picker) round-trip was not driven unattended.
- **Console-capture limitation.** Native `read_console_messages` returns nothing on this origin (same tooling gap as prior WEB runs); worked around with an in-page hook overriding `console.error`/`console.warn` and listening for `error`/`unhandledrejection`. The hook resets on every full navigation, so only post-install events are captured — it caught **0** errors/warnings across the in-game `/roll` dice roll and the initiative tracker. Pre-hook page-load console output could not be confirmed clean.

---
*Notes for the reader:* This run (1) re-verified every prior WEB finding against v2.6.4 — all still reproduce, none fixed — and (2) confirmed core flows work on the deployed build: About reports v2.6.4; Export All Data downloads a backup; the Library renders fully (379 monsters / 395 spells / etc., a full Aboleth stat block with actions + legendary actions, Recently-Viewed populated); resuming a campaign enters play; an in-game `/roll 1d20+5` resolved correctly (7+5 = 12, shown in log + Dice Tray); the Initiative Tracker opens with round/turn controls; the `/campaigns` typo route shows the Page-Not-Found state correctly; the `beforeunload` "unsaved changes" guard fires on hard-navigation away from an active in-game session; and theme switching (Dark ↔ Parchment) applies cleanly. Screenshots are not committed for this automated web run (consistent with prior WEB reports); evidence is captured inline as HTTP/console output and computed-style measurements.
