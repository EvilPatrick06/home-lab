Tested: dnd-vtt WEB build (Dungeon Table Online) v2.6.4 — 2026-06-29 · URL: https://bmo.mybmoai.work/DungeonTableOnline/ · driven in-browser (Claude-for-Chrome), automated unattended run

> **This is a WEB-build QA report** (the browser SPA served by the Pi behind the Cloudflare tunnel), distinct from the desktop-build reports in this folder. Desktop-only surfaces (two-window launcher, native OS file dialogs, Discord DM bot voice, Electron auto-update) are adapted or marked out-of-scope/blocked per the web context. Multiplayer is exercised with extra browser tabs rather than the desktop launcher.
>
> **Build under test:** the web bundle was redeployed to the Pi **2026-06-29 03:24** (`/home/patrick/web-apps/DungeonTableOnline/`, entry `assets/index.web-Doj_2EV7.js`). Version confirmed two ways: in-app **About → "Versión 2.6.4"** and repo `dnd-app/package.json` (`"version": "2.6.4"`). The version label did **not** bump, but **many web-affecting commits landed on master AFTER the prior v2.6.4 WEB report was merged** (`a2d87c53`) — notably PHASE 55 (`12334327` resolve runtime asset URLs against the Vite base + map-load toast), PHASE 56 (`848d893a` html lang/dir tracking, slider theming, branding note, storage namespacing), PHASE 57 web About edition-framing (`e14a7943`), the responsive-mobile fixes for Library / character builder / Bastion / Calendar / Lobby, and IndexedDB autosave (`07fcfb6c`). These phases were authored specifically to address findings in the prior v2.6.4 WEB report, so this redeployed build is a new surface needing QA. This run **re-verified each prior finding against the 2026-06-29 build** and recorded what is fixed vs. still present.
>
> **Coverage note (unattended browser run):** Surfaces were driven and inspected via Claude-for-Chrome (DOM/JS/network/console inspection). Two limitations applied this run and are filed under "Could not fully test": (1) screenshots against the live SPA timed out repeatedly (heavy PixiJS/React renderer), so verification leaned on DOM/network/console evidence rather than pixel screenshots; (2) an OS-level window resize to 390px did not reduce the page's reported CSS viewport (`innerWidth` stayed 2294 on this high-DPI display), so the mobile-responsive layout phases could not be visually confirmed at true phone width.

## Top findings (Critical & High)

- **None this run.** The prior report's only High finding — built-in/preset map background images 404 on the web build (Vite base not applied) — is **resolved at the asset/render level in the 2026-06-29 build** (see "Prior findings — re-verified" #6). No new Critical/High issues were found across the surfaces exercised.

## Prior findings — re-verified against the 2026-06-29 build (FIXED)

1. **`<html lang>` / `dir` not tracking active locale — FIXED.** With the UI in Español, `document.documentElement.lang === "es"` and `dir === "ltr"` (was previously stuck at the build-time default). PHASE 56 html lang/dir tracking confirmed working.
2. **Bare (un-namespaced) browser-storage keys on the shared origin — FIXED.** The two previously-bare keys are now namespaced: `library-recent` → `dnd-vtt-library-recent`, and `lobby-chat-<id>` → `dnd-vtt-lobby-chat-<id>` (observed `dnd-vtt-lobby-chat-253adf0e-...`). All VTT keys now carry a `dnd-vtt-*` / `dndapp:*` prefix. (Residual shared-origin note below.)
3. **Web vs in-app brand never cross-referenced — FIXED.** About now states: "Dungeon Table Online es la edición web de Mesa virtual de D&D." (PHASE 57 edition-framing.)
4. **About tech-stack advertised "Electron 40 — Desktop framework" on the web build — FIXED.** The stack now leads with "Vite — Entorno de ejecución web" (web runtime); the "Electron — Desktop framework" entry is gone. (Minor residual below.)
5. **Range sliders used the browser-default accent on the web build — FIXED.** Settings sliders now compute `accent-color: oklch(0.769 0.188 70.08)` (the themed amber), all 4 range inputs themed. (PHASE 56 slider theming.)
6. **Built-in/preset map background images 404 (Vite base not applied) [prior High] — RESOLVED at asset level.** Preset map assets now serve and render at the correct base path: `HEAD /DungeonTableOnline/data/5e/maps/wizards-tower.png` → 200, and an in-page `new Image()` loads it fully (naturalWidth 2742 × 3755). The old root path `GET /data/5e/maps/wizards-tower.png` fails (404). This is the exact base-path resolution PHASE 55 introduced. **Caveat:** see "Could not fully test" #1 — the in-app preset-map *picker* was not reached through the Scene "Arte de la escena" panel this run, so the asset is confirmed renderable but the end-to-end in-app preset-apply flow was not re-walked.

Also newly confirmed working: **IndexedDB autosave** (PHASE `07fcfb6c`) — a namespaced `dnd-vtt-web` IndexedDB database is created on the web build.

## Phase 1 — i18n: untranslated strings under Español (still present / newly observed)

The app translates the vast majority of chrome into Spanish, but several surfaces still render English while the locale is Español. Each is low severity but user-visible.

### Character-card data nouns (race / class / alignment) untranslated under Español — STILL PRESENT
- **Severity:** low · **Category:** i18n · **Domain:** dnd-app
- **Where:** Tus personajes (characters list). Card reads "Nivel 1 **Dwarf fighter**" and "**Lawful Good**" while the surrounding chrome is Spanish.
- **Carried from** the prior v2.6.4 WEB report; unchanged in the 2026-06-29 build.
- **Suggested action:** Localize race/class/alignment display nouns (or map data keys through i18n) on the character card.

### In-game command-category tabs untranslated under Español — NEW (observed this run)
- **Severity:** low · **Category:** i18n · **Domain:** dnd-app
- **Where:** in-game command palette tab strip renders "Combat, Magic, Dice & Rolls, Map, Party, Audio, DM Tools, AI DM, Campaign, Utility, Chat & Social, Combat Log, Journal" in English while the left sidebar (PERSONAJES, PNJ, ALIADOS, ENEMIGOS, LUGARES, BASTIONES…) is Spanish.
- **Suggested action:** Localize the command-module category labels, or confirm they are intentionally English command-namespace names (if so, note it).

### Map-editor layer tabs untranslated under Español — NEW (observed this run)
- **Severity:** low · **Category:** i18n · **Domain:** dnd-app
- **Where:** Scene/Map editor layer tabs render "Tokens, Fog, Terrain, Regions, Grid, Npcs, Notes, Shop" in English (size labels beside them — Diminuto/Pequeño/Mediano/Grande/Enorme — are correctly Spanish).
- **Suggested action:** Localize the map-editor layer tab labels.

### Library category section headers untranslated under Español — NEW (observed this run)
- **Severity:** low · **Category:** i18n · **Domain:** dnd-app
- **Where:** Biblioteca page section headers render "MY CONTENT, BESTIARY, SPELLBOOK, CHARACTER OPTIONS, EQUIPMENT & ITEMS, RULES REFERENCE, WORLD BUILDING, TABLES & ENCOUNTERS, MEDIA…" in English while the page title (Biblioteca), filters (Todas las categorías, Favoritos, Libros básicos) are Spanish.
- **Suggested action:** Localize the Library category group headers.

### Calendar month name + weekday headers untranslated under Español — NEW (observed this run)
- **Severity:** low · **Category:** i18n · **Domain:** dnd-app
- **Where:** Calendario de sesiones renders "June 2026" and weekday headers "Sun Mon Tue Wed Thu Fri Sat" in English while the rest (Calendario de sesiones, Sesión propuesta, Hoy) is Spanish. (The `/calendar` route is reachable by direct URL but, as the desktop instructions note, has no main-menu entry — orphaned.)
- **Suggested action:** Use a locale-aware date formatter (e.g. `Intl.DateTimeFormat` with the active locale) for the month label and weekday headers.

## Phase 1 — About / portability residuals (low)

### About tech-stack still lists desktop-only "electron-vite" (+ "Electron" in OSS libs) on the web edition
- **Severity:** low · **Category:** portability | docs · **Domain:** dnd-app
- **Where:** About → STACK TECNOLÓGICO still includes "**electron-vite** — Herramientas de compilación" as the build tooling, and the open-source-libraries paragraph still names "**Electron**" among the libraries. The web edition is built with plain Vite (`npm run build:web`), not electron-vite.
- **Note:** This is the residual tail of the (now largely fixed) About web-framing finding — the headline "Electron — Desktop framework" entry was removed, but these two desktop-specific mentions remain.
- **Suggested action:** On the web build target, swap "electron-vite — build tooling" for "Vite — build tooling" and drop "Electron" from the OSS libraries line.

### Web build still shares origin `bmo.mybmoai.work` with unrelated BMO-app storage (namespacing now fixed)
- **Severity:** low · **Category:** debt | portability · **Domain:** dnd-app | bmo
- **Where:** localStorage on the shared origin still contains unrelated BMO keys (`bmo_laptop_mic`, `bmo_music_last_query`, `bmo-ide-state`, `bmo_weather_cached`, `bmo_cal_events`, `bmo_health_summary`, …) alongside the VTT keys. The collision risk is now mitigated because all VTT keys are namespaced (finding #2 above), so this is **downgraded** from the prior report — the remaining suggestion is purely about isolation/clearing ergonomics.
- **Suggested action:** Consider giving the web build its own subdomain (or path-scoped storage) so per-app data is trivially separable.

## Could not fully test (hard limitations this run)

1. **In-app preset battle-map picker.** The Scene "Arte de la escena" panel only exposes None (gradient) / Subir (upload) / Biblioteca de imágenes (saved uploads — empty: "Aún no hay imágenes guardadas") / Mapa actual. The built-in preset battle maps (`data/5e/maps/*.png`) were not reachable through this panel (they appear to be applied via adventure-module content), so the end-to-end in-app preset-apply was not re-walked. The base-path fix itself is confirmed at the asset/render level (Fixed #6).
2. **Mobile-responsive layout phases (Library / character builder / Bastion / Calendar / Lobby).** An OS window resize to 390×844 did not reduce the page's reported CSS viewport (`innerWidth` stayed 2294 on this high-DPI display), and screenshots timed out, so layouts could not be visually confirmed at true phone width. The responsive CSS changes shipped in this build but are not visually verified here. Recommend re-running with real device-emulation (CDP `Emulation.setDeviceMetricsOverride`) to confirm.
3. **Live multiplayer sync across tabs, AI DM (Ollama/llama.cpp) live responses, and 3D dice physics under load** were not exercised this run (single solo session resumed for the map/console checks). No errors were observed in what was exercised.

## Notes (not findings)
- In-game sessions install a `beforeunload` "Leave site?" guard (blocks hard refresh/navigation while a session is active) — expected behavior to prevent accidental loss; exit via in-app navigation.
- Console was clean (no errors/warnings matching error|warn|404|Uncaught|controlled|act()) across main menu, About, Library, Bastions, Characters, Calendar, Settings, and the resumed in-game session at the points sampled.
- Stale test data present (duplicate "QA Test Keep" bastions, "QA Solo Game/Fighter") — disposable, not a bug.
