Tested: dnd-vtt WEB build (Dungeon Table Online) v2.4.77 — 2026-06-22 · URL: https://bmo.mybmoai.work/DungeonTableOnline/ · driven in-browser (Claude-for-Chrome), automated unattended run

> **This is a WEB-build QA report** (the browser SPA served by the Pi behind the Cloudflare tunnel), distinct from the desktop-build reports in this folder. Desktop-only surfaces (two-window launcher, native OS file dialogs, Discord DM bot, Electron auto-update) are adapted or marked out-of-scope/blocked per the web context.

## Top findings (Critical & High)

- **[High]** Hosting a Public game in the web build fails to list in the registry with a JS null-deref ("Cannot read properties of null (reading 'ok')")

## Phase 1 — Top-level pages & navigation
### "Check for Updates" hangs forever on "Checking…" in the web build (no result, no error)
- **Category:** bug | portability
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** About & Data page (web build)

**Description:** The About page exposes a **Check for Updates** button. Clicking it switches the label to "Checking…" and it **never resolves** — after 12+ seconds it is still "Checking…", with no "up to date" message, no error toast, and no console error. In the browser build there is no Electron auto-updater behind this IPC call, so the action silently hangs in a permanent in-progress state.

**Reproduction:**
1. Open https://bmo.mybmoai.work/DungeonTableOnline/ → About & Data.
2. Click "Check for Updates".
3. Button shows "Checking…" and stays there indefinitely (waited 12s+).

**Expected behavior:** In a browser build either hide the "Check for Updates" affordance entirely (web apps update on reload), or have it resolve to a clear terminal state ("You're on the latest version" / "Updates are managed by your browser") instead of hanging.

**Hypothesis / root cause:** The button calls an Electron `autoUpdater`/IPC bridge that doesn't exist in the web runtime, so the promise never settles and the UI is stuck. Speculation — the web build should feature-detect the updater. Likely in the About page component + an Electron-only update service.

**Suggested action:** Feature-detect Electron (`window.electron`/IPC) in the About page; hide or no-op "Check for Updates" with a terminal message in the web build.

**Environment:** web build · AI DM off · English · Dark theme · browser tab

**Related files:** `dnd-app/src/renderer/src/pages/` (About page), update/IPC service

### About copy says "desktop application … no browser required" — wrong for the web build
- **Category:** docs | UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** About & Data page (web build)

**Description:** The About page description reads: "A desktop application for playing Dungeons & Dragons 5th Edition online with friends. Create characters, build campaigns, and adventure together — no browser required." This text is shown **inside the browser SPA** (Dungeon Table Online), so the claims "desktop application" and "no browser required" are literally false in this context and are confusing to a web user.

**Expected behavior:** The web build should use copy appropriate to the browser (or a build-conditional string), not the desktop blurb.

**Suggested action:** Make the About description build-aware (web vs desktop), or use a neutral description that holds for both.

**Environment:** web build · English · Dark theme

**Related files:** `dnd-app/src/renderer/src/pages/` (About page), `i18n/locales/en.json`

## Phase 2 — Character builder + level-up
### Leaving the character builder mid-build discards the draft with no "unsaved changes" confirmation
- **Category:** UX
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Character builder → "← Back" with a substantial in-progress (unsaved) character

**Description:** After building a level-10 Wizard (class, background, species+lineage, ability scores, skills, 5 cantrips, 6 prepared spells) but before saving, clicking "← Back" immediately returned to Your Characters and **silently discarded the entire draft** — no "You have unsaved changes, discard?" confirmation, and the character list remained empty. Easy to lose substantial work with a single mis-click.

**Reproduction:**
1. Create Character; complete most of the build without clicking Save.
2. Click "← Back".
3. Returns to the list with the draft gone, no confirmation prompt.

**Expected behavior:** Prompt to confirm discarding unsaved changes (or auto-save a draft) before leaving the builder.

**Suggested action:** Add an unsaved-changes guard (confirm dialog or draft autosave) on builder exit / navigation away.

**Environment:** web build · English · Dark theme · browser tab

**Related files:** `dnd-app/src/renderer/src/components/builder/`, builder page route/back handler

### Builder becomes unresponsive for ~30s when switching to level 10 + opening the Spells tab (full Wizard list)
- **Category:** performance
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Character builder → set Level 1→10 (Wizard) then click Spells tab

**Description:** Setting the Level field to 10 and immediately opening the **Spells** tab (which renders the full Wizard spell list — cantrips + 31 first-level spells + higher levels, all as checkboxes) made the renderer unresponsive long enough that a screenshot CDP call timed out at 30s ("renderer may be frozen or unresponsive"). The page recovered on its own after a few more seconds and worked normally afterward. The non-virtualized long spell list is the likely cause.

**Reproduction:**
1. Create a Wizard, complete foundation to reach the main builder tabs.
2. Set Level to 10.
3. Click the Spells tab.
4. UI hangs ~30s before the spell list paints/responds.

**Expected behavior:** The spell list should render without freezing the main thread — virtualize the list or defer/debounce the level-change recompute.

**Hypothesis / root cause:** Re-rendering a large unvirtualized checkbox list synchronously on the level-10 recompute. Speculation. Likely in the builder Spells tab component.

**Suggested action:** Virtualize the spell list (e.g. react-window) and/or memoize the per-level spell computation; profile with React DevTools.

**Environment:** web build · AI DM off · English · Dark theme · browser tab

**Related files:** `dnd-app/src/renderer/src/components/builder/` (Spells tab)

**Note:** Positive verification (no finding): the prior desktop QA "level-10 makes the character uncompletable (caps stuck at 3/4)" High bug does **not** reproduce here — at level 10 the builder accepted 5/5 cantrips and prepared-spell selection advanced past 4 (reached 6/15), so the caps scale correctly in web v2.4.77.

## Phase 4 — Bastion + Calendar
### Bastion creation is gated on an Owner character; full Bastion subsystem needs a saved PC
- **Category:** UX
- **Severity:** info
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Bastions → + New Bastion (no saved characters)

**Description:** The Create Bastion dialog requires both a name and an **Owner (Character)**. With no saved characters the Owner dropdown contains only the "Select a character…" placeholder and **Create stays disabled**, so a new user who opens Bastions before making a character hits a dead-end with no inline guidance to go create one first. (Per the 2024 DMG a bastion belongs to a PC, so requiring an owner is correct — this is a discoverability nit, not a bug.) The deeper Bastion flow (facilities, treasury/BP, Advance Time → Bastion Turn, d100 events) could not be exercised in this run because it requires a saved owner PC (see Could not test).

**Expected behavior:** When no characters exist, surface a hint/CTA ("Create a character first") rather than only a disabled Create button.

**Suggested action:** Add empty-state guidance/CTA in the Create Bastion dialog when the character list is empty.

**Environment:** web build · English · Dark theme · browser tab

**Related files:** `dnd-app/src/renderer/src/pages/` (Bastion page / Create Bastion modal)

## Phase 11 — Multiplayer (web-adapted)

### [High] Hosting a Public game in the web build fails to list in the registry with a JS null-deref ("Cannot read properties of null (reading 'ok')")
- **Category:** bug | portability
- **Severity:** high
- **Domain:** dnd-app | bmo
- **Discovered by:** QA Agent
- **During:** Phase 11 — host "QA Web Test Campaign" (Cloud Relay, Public) → lobby

**Description:** Hosting a Public game from the web build connects the Cloud Relay fine (lobby shows "Connected"), but the public registry announce **fails**: the lobby shows a red **"PUBLIC — NOT LISTED (REGISTRY UNREACHABLE)"** badge and an error banner: *"Couldn't list this game in the public browser — The game registry couldn't be reached, so other players won't see this game in the browser… **(Cannot read properties of null (reading 'ok'))**."* So Public web-hosted games are not discoverable by other players in the browser (they'd need the invite code).

**Reproduction:**
1. Create a campaign with hosting = Cloud relay, visibility = Public.
2. Host Game → Start Hosting.
3. Lobby loads "Connected" but shows "PUBLIC — NOT LISTED (REGISTRY UNREACHABLE)" + the null-deref error above.

**Expected behavior:** A Public web-hosted game should register in the public browser (or, if the announce path is unavailable in the browser, fail gracefully with an explanatory message — never throw a null-deref).

**Hypothesis / root cause (strong):** The registry **server is reachable** — `GET https://bmo.mybmoai.work/api/games` returns **HTTP 200 `{"games":[]}`** same-origin. The failure is **client-side**: `registry-client.ts` notes the `/api/games*` REST surface "is no longer fetched directly from [the renderer]"; the host-announce path appears wired through Electron main-process IPC that doesn't exist in the web build, so `startHostAnnounce()` resolves to **null**, and `LobbyPage.tsx:266` then does `setRegistryListed(result.ok)` on a null `result` → "Cannot read properties of null (reading 'ok')". (Code-referenced, but `result` value at runtime is inferred — label hypothesis.)

**Suggested action:** In the web build, have the lobby POST/DELETE `/api/games` directly same-origin (the endpoint is reachable) instead of relying on the Electron IPC announce; and guard `LobbyPage.tsx:266-267` against a null `result` so a failed announce shows a clean message instead of a thrown null-deref.

**Environment:** host=Cloud Relay, Public · AI DM off · English · Dark theme · web build (host tab)

**Related files:** `dnd-app/src/renderer/src/pages/LobbyPage.tsx` (~lines 219-220, 266-267), `dnd-app/src/renderer/src/network/registry-client.ts`, `bmo/pi/routes/webapp_api.py` / registry routes

**Console output (if any):** surfaced in-UI: "Cannot read properties of null (reading 'ok')"

**Note:** This is the web-build analogue of the desktop QA report's High "Public game shows LISTED but registry has zero games" finding — here the web path throws a concrete null-deref, which gives a clear fix target.

### Web multiplayer — what worked, and the 2-tab profile limitation (env)
- **Category:** docs
- **Severity:** info
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Phase 11 — Cloud Relay host (tab 1) + invite-code join (tab 2)

**Description (verified working, no defect):** Cloud Relay hosting connects ("Connected"); lobby chat, player list, color confirm, slow-mode/files/auto-mod controls render and work; sending a host chat message posts. A second browser tab successfully **joined via invite code (9TNQ6Y)** — "QA Player has joined the lobby" appeared and the host then saw "QA Player" in its players list **with full moderation controls (Kick / Ban / Make DM / Demote)**. So invite-code Cloud Relay join is functional in the web build even though the public registry listing is broken (see the High finding above).

**Limitation (environment, not a bug):** Both tabs share **one browser profile** (same persistent client UUID + IndexedDB), so the two "clients" conflate — when the 2nd tab joined, the host tab's own DM identity/color was clobbered and replaced by the joiner's view. The desktop QA harness avoids this with separate `--user-data-dir` profiles; there is no in-browser equivalent with two tabs in the same profile. Full 2-client sync (HP/token/fog sync, ready toggles → start, kick/ban-rejoin, host/player rejoin-resume, End Session propagation) therefore **could not be cleanly validated** in this run — it needs two separate browsers/profiles (or two devices). See Could not test.

## Phase 13 — Settings + themes + i18n + accessibility
### Multiplayer "WebRTC signaling server" status stuck on "Checking the signaling server…" indefinitely
- **Category:** bug | portability
- **Severity:** medium
- **Domain:** dnd-app | bmo
- **Discovered by:** QA Agent
- **During:** Settings → Multiplayer section (web build)

**Description:** The Multiplayer section shows a "WebRTC signaling server" health row that remains on "Checking the signaling server…" with a neutral/grey status dot **indefinitely** (observed 13s+, never resolved to connected or unreachable). A health indicator that never reaches a terminal state gives the user no idea whether multiplayer will work. If the signaling endpoint is genuinely not reachable from the browser-served build, P2P/WebRTC multiplayer would be broken in the web version.

**Reproduction:**
1. Settings → scroll to Multiplayer.
2. Observe "WebRTC signaling server → Checking the signaling server…" — it never resolves.

**Expected behavior:** Resolve to a clear "Connected" / "Unreachable" state within a few seconds (with a timeout + error), so the user knows multiplayer status.

**Hypothesis / root cause:** The signaling-server probe never settles (no timeout), or the endpoint is unreachable from the web origin (CORS/mixed-content/host). Speculation. Likely the network/multiplayer status component + signaling client.

**Suggested action:** Add a timeout + explicit failure state to the signaling-server check; verify the signaling endpoint is reachable same-origin from the web build.

**Environment:** web build · English · Dark theme · browser tab

**Related files:** `dnd-app/src/renderer/src/` (settings Multiplayer/Network section, WebRTC signaling client)

**Console output (if any):** none captured (network tracking not active at load)

### OLLAMA AI settings offer an "Install Ollama" button that cannot work in a browser; local AI likely unusable in web build
- **Category:** portability | UX
- **Severity:** medium
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Settings → Ollama AI section (web build)

**Description:** The Ollama AI section reads "Ollama is not installed. Install it during campaign setup, or visit ollama.com." with an **"Install Ollama"** button and a "Re-check". In a browser tab the app cannot install a native binary, so "Install Ollama" is a non-functional/desktop-only affordance. More broadly, the only supported AI providers are local (Ollama / llama.cpp at `localhost:11434`); a web build served from `https://bmo.mybmoai.work` generally cannot reach the user's `localhost` (mixed-content/CORS/loopback restrictions), so the local AI DM may be unusable in the web build entirely. This needs a build-aware story for AI in the browser.

**Reproduction:**
1. Settings → Ollama AI.
2. See "Install Ollama" button + "Ollama is not installed".

**Expected behavior:** In the web build, hide/replace the native "Install Ollama" action and clearly explain how (or whether) local AI can be reached from a browser; feature-detect Electron.

**Suggested action:** Make the Ollama/AI section build-aware; if local AI isn't reachable from the web origin, say so instead of offering a desktop install button.

**Environment:** web build · English · Dark theme · browser tab

**Related files:** `dnd-app/src/renderer/src/` (Settings AI/Ollama section), AI provider client

### Full Electron auto-update UI (Updates section + "Auto-check on launch" ON by default) ships in the web build
- **Category:** portability | UX
- **Severity:** low
- **Domain:** dnd-app
- **Discovered by:** QA Agent
- **During:** Settings → Updates section (web build)

**Description:** Beyond the About page's "Check for Updates" (which hangs — see Phase 1), the Settings **Updates** section also exposes "Current version: 2.4.77", a "Check for Updates" button, and **Auto-update preferences** with "Auto-check for updates on launch" **enabled by default** ("App pings the release feed ~5s after startup"), plus "Auto-download when an update is found", auto-restart, etc. These are Electron-updater features with no meaning in a browser; auto-check-on-launch firing on every web load is wasted/again likely hangs.

**Expected behavior:** Hide the entire auto-update settings group in the web build (feature-detect Electron); the browser updates itself on reload.

**Suggested action:** Gate the Updates settings section behind an Electron check.

**Environment:** web build · English · Dark theme · browser tab

**Related files:** `dnd-app/src/renderer/src/` (Settings Updates section)

## Could not test
The following were not testable in this unattended web run and are genuine environment/dependency blockers (not out-of-scope omissions):

- **In-game surface (Phases 6–10: map/canvas, combat, DM tools, View As, AI-DM solo).** Reaching the in-game board requires either (a) a started multiplayer game — but the host's start control stays **"Waiting for Players…"** until a *distinct* second client joins, and the two-tabs-one-profile setup conflates client identities (see Phase 11), so a clean start could not be driven; or (b) a **Solo** game, which requires a **saved character** as the PC (the builder draft was not saved, and completing+saving a full sheet — equipment, languages, alignment — was not finished in the time available). Net: the map editor, combat tracker, DM panels, View-As, and AI-DM action surface were not exercised in-board this run.
- **AI Dungeon Master (local providers).** The only supported AI providers are local (Ollama / llama.cpp at `localhost:11434`). The web build is served from `https://bmo.mybmoai.work`, and the Settings → Ollama AI section reports "Ollama is not installed"; a cloud-served browser page generally cannot reach the user's loopback, so the AI DM could not be run (see the Phase 13 Ollama portability finding). No cloud AI creds are configured (known/intended — not listed as a gap).
- **Full 2-client multiplayer matrix** (lobby ready→start, cross-client HP/token/fog sync, kick/ban-rejoin, host/player/solo rejoin-resume, End Session propagation, Cloud-vs-Self host independence). Blocked by the shared-browser-profile limitation above; needs two separate browsers/profiles or two devices.
- **Bastion subsystem internals** (facilities, treasury/BP, Advance Time → Bastion Turn, d100 events, Turn Summary). Bastion creation requires a **saved owner PC**, which did not exist this run (see Phase 4).
- **Native file flows** (Export All Data, Export/Import Settings, Import, Audio upload). In the browser these become Blob downloads / `<input type=file>` pickers; not exercised to completion to honor the unattended-run no-download posture. The buttons render and are wired.
- **Discord DM bot (Phase 12).** Out of the web SPA's surface — the DM bot's slash commands and Dungeon VC live in Discord + the Pi, not the browser app, and there is no Discord access in this unattended run. The web Settings → Discord Integration section (just a "Push to Discord" toggle + Save) renders.

**Screenshots:** Chrome screenshots could not be persisted to disk in this automated web-driver environment, so the `screenshots/` folder is empty and findings are documented with detailed text reproductions instead. (Noted so a future run with a screenshot-capable driver can attach evidence.)
