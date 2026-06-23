# PHASE-45 — Web-build Electron-feature portability sweep

> Authored from the 2026-06-22 WEB-build QA report (Dungeon Table Online, v2.4.77). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Stop the browser SPA from shipping desktop-only (Electron) affordances that either hang forever, lie, or offer impossible actions. The web build already has the lever — `src/renderer/src/utils/platform.ts` `isWebBuild()` (true when the web entry sets `window.__DND_WEB__`) — but it is used in exactly one place (`OllamaFirstRunPrompt`). This phase build-gates five surfaces that have no meaning in a browser: the About-page "Check for Updates" (hangs on "Checking…" forever), the About description copy ("desktop application … no browser required"), the Settings → Updates section (auto-check-on-launch + updater UI), the Settings → Ollama "Install Ollama" button + local-AI reachability story, and the Settings → Multiplayer "WebRTC signaling server" status (stuck on "Checking…"). Each fix is small and shares the same `isWebBuild()`/feature-detect pattern; together they remove the "web build pretends to be Electron" class of bug. PLANNING ONLY.

## Dependencies & cross-phase notes

- **No prerequisite phases.** All findings are dnd-app renderer + the web shim (`src/web/web-api.ts`).
- **Shared lever:** `isWebBuild()` (`src/renderer/src/utils/platform.ts:10`). Prefer gating in the renderer component so the desktop build is untouched; where the web shim is the cleaner fix (a no-op IPC that should resolve to a terminal state), fix the shim (`src/web/web-api.ts`) instead — noted per finding.
- **i18n:** F3 (About copy) needs a build-aware or neutral string in `src/renderer/src/i18n/locales/en.json` (and the other locale files). The repo's i18n sweep convention is PHASE-12 — match its key style; keep this edit surgical.
- **Overlaps:** F1 (About "Check for Updates") and F4 (Settings Updates section) are the same updater capability surfaced in two places — fix them together so the gate is consistent. The Ollama first-run prompt is already gated (`OllamaFirstRunPrompt.tsx:25`); F5 extends that posture to the Settings Ollama panel.

## Verified findings

All verification was against the live tree (worktree `auto/phase-maker`).

### F1 (medium) — "Check for Updates" hangs forever on "Checking…" in the web build

**Status: confirmed; exact root cause in source.**

`AboutPage.tsx` drives an update state machine `'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'downloaded' | 'error'` (AboutPage.tsx:51-53). The button's onClick (AboutPage.tsx:163-186) sets `'checking'`, then calls `window.api.update.checkForUpdates()` and switches on `result.state` for the values `'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'`. It also subscribes to `window.api.update.onStatus(...)` (AboutPage.tsx:67-...) which only transitions on `'not-available' | 'available' | 'downloading' | 'downloaded'`.

In the web build the shim resolves with a shape **none of those handlers match**, and the status listener never fires:

- `src/web/web-api.ts:224-228`:
  ```ts
  update: {
    checkForUpdates: () => Promise.resolve({ state: 'web', message: 'Web build auto-updates on deploy' }),
    // …
    onStatus: (_cb) => () => undefined
  }
  ```
- So `checkForUpdates()` resolves to `{ state: 'web' }` → the onClick switch has no `'web'` branch → `updateStatus` stays `'checking'`; and `onStatus` never calls its callback → no terminal transition. The button label is stuck on `t('pages.aboutPage.checking')` indefinitely (QA waited 12s+).

Verification:

```bash
sed -n '160,200p' dnd-app/src/renderer/src/pages/AboutPage.tsx
grep -n "checkForUpdates\|onStatus\|state: 'web'" dnd-app/src/web/web-api.ts
```

**Fix:** in the web build, hide the entire "Check for Updates" affordance (web apps update on reload) — gate the Hero update block (AboutPage.tsx ~158-247) behind `!isWebBuild()`. (Alternative, if the control must stay: have the shim's `onStatus` immediately emit a terminal `{ state: 'web' }` AND add a `'web'` → terminal "Updates managed by your browser" branch in both the onClick switch and the label. Hiding is simpler and matches the desktop-affordance posture — prefer it.)

### F2 (low) — About copy says "desktop application … no browser required" (wrong in the browser)

**Status: confirmed.** `AboutPage.tsx:247` renders `t('pages.aboutPage.appDescription')`, whose en.json value (`src/renderer/src/i18n/locales/en.json:5580`) is: *"A desktop application for playing Dungeons & Dragons 5th Edition online with friends. Create characters, build campaigns, and adventure together — no browser required."* Shown inside the browser SPA, "desktop application" and "no browser required" are literally false.

**Fix:** make the description build-aware — either a second key (`appDescriptionWeb`) selected via `isWebBuild()` in AboutPage, or reword `appDescription` to a neutral string true for both ("An app for playing D&D 5e online with friends. Create characters, build campaigns, and adventure together."). Mirror the change across all locale files that carry `appDescription` (`en.json`, `es.json`, …).

### F3 (low/portability) — Settings → Updates section + auto-check-on-launch ships in the web build

**Status: confirmed.** `SettingsPage.tsx:1875-1878` renders `<Section title=updates><UpdateSection /></Section>` unconditionally. `UpdateSection` exposes "Current version", a "Check for Updates" button (`SettingsPage.tsx:510` calls `window.api.update.checkForUpdates()` — same hanging shim as F1), and **auto-update preferences** with "Auto-check for updates on launch" **defaulting ON** (`autoCheckUpdates` state defaults `true`, SettingsPage.tsx:462; persisted `s.autoCheckUpdates !== false`, line 480). The desktop auto-check-on-launch wiring lives in `src/main/index.ts:375-376` + `src/main/updater.ts` — Electron-only; in the web build the toggle is meaningless and the manual check hangs.

**Fix:** gate the entire Updates `<Section>` (and the Cloud Backup section if it is likewise desktop-only — verify `CloudBackupSection`) behind `!isWebBuild()`. The web build updates on reload; no updater UI should render. Confirm no other code path fires `checkForUpdates()` automatically in the web build.

### F4 (medium/portability) — Ollama "Install Ollama" button + local-AI reachability in the web build

**Status: confirmed.** `SettingsPage.tsx:1885-1888` renders `<Section title=ollamaAi><OllamaManagement /></Section>`. `OllamaManagement.tsx` shows an **"Install Ollama"** button (label `t('ui.ollamaManagement.installOllama')`, OllamaManagement.tsx:264) whose handler calls `window.api.ai.installOllama(dl.path)` (line 104) — a native download/install. In the web shim that is a no-op (`installOllama: (_p) => notWired()`, web-api.ts:623; `checkOllamaUpdate` / `getConnectionStatus` also stubbed, lines 629-634). A browser tab cannot install a native binary, and the only supported AI providers are local (Ollama / llama.cpp at `localhost:11434`), which a page served from `https://bmo.mybmoai.work` generally cannot reach (mixed-content / loopback / CORS) — so the local AI DM is likely unusable in the web build entirely. The first-run Ollama prompt is *already* gated (`OllamaFirstRunPrompt.tsx:25` early-returns when `isWebBuild()`); the Settings panel was not given the same treatment.

**Fix:** make `OllamaManagement` (or the Settings Ollama `<Section>`) build-aware. In the web build, hide/replace the native "Install Ollama" action and the install/update affordances, and show a clear explanation of whether/how local AI can be reached from a browser (e.g. "Local AI runs on your computer and isn't reachable from this browser build") instead of an impossible install button. Keep the desktop panel unchanged.

### F5 (medium) — Multiplayer "WebRTC signaling server" status stuck on "Checking…" forever

**Status: confirmed; root cause in source.**

`SettingsPage.tsx:1895-1898` renders `MultiplayerStatusSection`. That component (`src/renderer/src/components/ui/MultiplayerStatusSection.tsx`) shows `t('pages.settingsPage.signalingChecking')` while `checkedAt === null` (line 33-35) and, on mount, calls `window.api?.lan?.probeSignaling?.()` (line 26-28) expecting the result to arrive via the module-level `BMO_SIGNALING_STATUS` subscription in `use-signaling-status-store.ts:29-34` (`window.api.lan.onBmoSignalingStatus(...)`).

In the web shim neither resolves the store:

- `src/web/web-api.ts:233-243` — `lan.onBmoSignalingStatus: (_cb) => () => undefined` (never invokes the callback) and `lan.probeSignaling: () => Promise.resolve({ reachable: null })` (resolves a value, but nothing routes it into the store).
- So `checkedAt` stays `null` forever → the badge sits on "Checking the signaling server…" indefinitely (QA observed 13s+, never resolved).

Note the store's documented semantics already cover the "not applicable" case: `reachable === null` with `checkedAt !== null` is meant to render `signalingNotApplicable` (the off-LAN/tunnel default). The web build should land in exactly that terminal state.

Verification:

```bash
sed -n '20,45p' dnd-app/src/renderer/src/components/ui/MultiplayerStatusSection.tsx
sed -n '20,40p' dnd-app/src/renderer/src/stores/use-signaling-status-store.ts
grep -n "lan:\|probeSignaling\|onBmoSignalingStatus" dnd-app/src/web/web-api.ts
```

**Fix (prefer the shim):** in `src/web/web-api.ts`, make `lan.probeSignaling()` drive a terminal status into the store — simplest is for the web shim to emit a single `BMO_SIGNALING_STATUS`-equivalent event with `{ reachable: null, host: '' }` on probe (so `checkedAt` becomes non-null and the badge renders `signalingNotApplicable`), wiring it through the same bus the store subscribes to. Alternatively, gate `MultiplayerStatusSection`'s "Checking…" so that in the web build it resolves to a terminal state within a short timeout. Either way the badge must reach a terminal state ("Not applicable" / "Unreachable") within ~1-2s, never sit on "Checking…".

## Sub-phases

> Per-sub-phase cheap check: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` on the changed surface + the affected component's vitest file (`AboutPage.test.tsx` exists; add coverage where missing). CI runs the full gate on push. For each gate, add a test that asserts the affordance is ABSENT (or terminal) when `__DND_WEB__` is set and PRESENT on desktop.

### 45A — Build-gate the updater UI (F1 + F3)

**Objective:** no updater affordance renders in the web build; the desktop build is unchanged.

**Files:** `dnd-app/src/renderer/src/pages/AboutPage.tsx`, `dnd-app/src/renderer/src/pages/SettingsPage.tsx`, `AboutPage.test.tsx` (+ a SettingsPage test if one exists).

**Steps:**

1. In AboutPage, wrap the Hero update block (the "Check for Updates" button + download/progress/install affordances, ~lines 158-247) in `{!isWebBuild() && ( … )}`; import `isWebBuild` from `../utils/platform`.
2. In SettingsPage, wrap the `Updates` `<Section>` (lines 1875-1878) in `{!isWebBuild() && …}`. Verify `CloudBackupSection` (1880-1883) — if it is desktop-only too, gate it the same way; otherwise leave it.
3. Confirm nothing in the web build auto-invokes `window.api.update.checkForUpdates()` on mount (the desktop auto-check lives in `src/main/*`, absent in web — confirm no renderer-side auto-check exists).
4. Tests: with `window.__DND_WEB__ = true`, AboutPage renders no "Check for Updates" control and SettingsPage renders no Updates section; with it unset, both render.

**Acceptance:** vitest green; `tsc` clean; web build shows no updater UI and never hangs on "Checking…"; desktop unchanged.

### 45B — Build-aware About description (F2)

**Objective:** the About copy is true in the browser.

**Files:** `dnd-app/src/renderer/src/pages/AboutPage.tsx`, `dnd-app/src/renderer/src/i18n/locales/en.json` (+ other locale files carrying `appDescription`).

**Steps:**

1. Choose: (preferred) reword `pages.aboutPage.appDescription` to a build-neutral sentence, OR add `pages.aboutPage.appDescriptionWeb` and select it in AboutPage via `isWebBuild()`.
2. Apply the same change to every locale file that defines the key (keep translations consistent — PHASE-12 convention).

**Acceptance:** the web About page no longer claims "desktop application"/"no browser required"; desktop copy still accurate; i18n key-presence test (if any) passes.

### 45C — Build-aware Ollama / local-AI panel (F4)

**Objective:** the web build never offers an impossible native install and explains local-AI reachability.

**Files:** `dnd-app/src/renderer/src/components/ui/OllamaManagement.tsx` and/or `dnd-app/src/renderer/src/pages/SettingsPage.tsx` (the Ollama `<Section>`), i18n strings as needed.

**Steps:**

1. In the web build, hide the "Install Ollama" button + the install/update/re-check controls (gate with `isWebBuild()` — mirror `OllamaFirstRunPrompt.tsx:25`).
2. Replace with a short build-aware notice explaining that local AI runs on the user's computer and isn't reachable from the browser build (and, if a future cloud provider exists, point at it). Keep "visit ollama.com" as an informational link only.
3. Desktop panel unchanged.

**Acceptance:** web Settings → Ollama AI shows the explanatory notice, no install button; desktop shows the full management UI; tests assert the gate both ways.

### 45D — Terminal signaling status in the web build (F5)

**Objective:** the WebRTC signaling badge reaches a terminal state (not "Checking…") in the web build.

**Files:** `dnd-app/src/web/web-api.ts` (preferred), or `dnd-app/src/renderer/src/components/ui/MultiplayerStatusSection.tsx`; `use-signaling-status-store.ts` if the wiring needs a shim event.

**Steps:**

1. Make the web shim's `lan.probeSignaling()` route a single status into the store so `checkedAt` becomes non-null with `reachable: null` (→ renders `signalingNotApplicable`). Wire it through the same event channel the store's module-level subscription listens on (mirror how the real `BMO_SIGNALING_STATUS` reaches `onBmoSignalingStatus`).
2. If a shim event channel is impractical, add a short client-side timeout in `MultiplayerStatusSection` (web-only) that flips "Checking…" to a terminal "Not applicable"/"Unreachable" after ~1-2s.
3. Test: with `__DND_WEB__` set, the badge resolves out of "Checking…" to a terminal label within the timeout.

**Acceptance:** web Settings → Multiplayer never sits on "Checking…"; resolves to a clear terminal state quickly; desktop probe behaviour unchanged.

## Completed

_None yet — planning authored 2026-06-23 from WEB-QA-report-2026-06-22._
