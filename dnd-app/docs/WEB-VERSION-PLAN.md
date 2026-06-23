# dnd-app Web Version — Feasibility, Hosting & Plan (Phase 1)

> Goal: a browser build of the dnd-app renderer with feature-parity to the
> desktop Electron app, auto-deployed whenever the app changes, drivable by
> Claude-for-Chrome for automated QA.

## Feasibility verdict: HIGH

The renderer (`src/renderer`) is a clean Vite + React + Tailwind SPA:

- **0** direct `electron` imports in renderer source.
- **0** `node:`/`fs`/`path` imports in non-test renderer source (the 17 hits are all tests).
- Routing is `MemoryRouter` → no server-side history fallback needed.
- Every native/main-process capability is reached through a single `window.api`
  object (defined in `src/preload/index.ts`, typed in `src/preload/index.d.ts`),
  used by 127 renderer files. **The web port = provide a `window.api` polyfill.**

## Capability classification (227 IPC channels)

### (a) Works in-browser as-is / trivial shim
- Window controls: `toggleFullscreen` → Fullscreen API; `isFullscreen` → `document.fullscreenElement`; `openDevTools` → no-op.
- `app:version` → build-time constant (`__APP_VERSION__` already defined).
- `game:load-json` → static JSON already under `src/renderer/public/data` (fetch).

### (b) Needs a client-side web shim (IndexedDB / File System Access)
- **All Storage:** characters, campaigns, bastions, custom-creatures, homebrew,
  game-state, bans, settings, character-versions, map-library, shop-templates,
  image-library, books → IndexedDB object stores keyed by id (mirrors the
  per-entity JSON files in `src/main/storage`). Bulk of the work, but mechanical.
- File dialogs (`dialog:show-save/open`) → File System Access API w/ download-upload fallback.
- File I/O (`fs:read-file*`, `fs:write-file*`) → IndexedDB blobs / File System Access.
- Audio custom tracks (`audio:*`) → IndexedDB blobs + object URLs.
- Plugins + plugin storage → IndexedDB; filesystem-based plugin scan/install degrades or backs to Pi.
- Security log (`security:log-event`) → console / POST to Pi.

### (c) Needs a backend — route through the BMO Pi (mostly already exists, CORS-ready)
The Pi (Flask app behind cloudflared at `https://bmo.mybmoai.work`) already
exposes and CORS-allows these prefixes: `/api/games*`, `/api/library*`,
`/api/rclone*`, `/api/sounds*`. Same-origin hosting removes CORS entirely.

- **AI DM core** (`ai:chat-stream`, scene/quest/oracle/entities/world-state…) —
  desktop runs this in the main process (RAG index + Ollama@localhost:11434 /
  cloud SDKs). Web has no main process → route to the Pi agent
  (`/api/dnd/*`, `/api/chat*`) over SSE/WebSocket (Pi already has SocketIO /
  realtime_ws). **Biggest bridge; phase it.**
- AI image gen (`ai-image:*`) → Pi or cloud.
- Cloud sync (`cloud:*`) → Pi `/api/rclone*` (CORS-allowed).
- Sound cache (`sound-cache:*`) → Pi `/api/sounds*` (CORS-allowed).
- Pi game registry (`registry:*`) → Pi `/api/games*` (already a main-process proxy; web calls directly).
- Pi 5e library (`library:*`) → Pi `/api/library*`.
- BMO bridge (`bmo:*` — Discord DM, narration, play-by-post, voice cast) → Pi endpoints.
  Note: the desktop bmo-bridge runs an *inbound* HTTP sync receiver in main to get
  Pi callbacks; in web replace that with the Pi's existing realtime WS/SSE push.
- Discord integration (`discord:*`) → Pi.

### (d) Desktop-only / N/A for web
- App updates (`update:*`, electron-updater) → **replaced by deploy-on-release** (the whole point). Hidden/no-op.
- Ollama lifecycle (`ai:detect/install/download/pull/vram/...-ollama`) → desktop-only; web uses Pi-hosted models or cloud keys.
- LAN/mDNS discovery (`lan:*`, Bonjour) → browsers can't do mDNS; web uses the Pi registry + tunnel (already the off-LAN path).
- `window:open-devtools` → no-op.

### Multiplayer (PeerJS) — browser-native, verified
Renderer uses `peerjs` in `network-store` / `network/peer-manager.ts`. Signaling
is the Pi's PeerServer at `bmo.mybmoai.work/myapp` (cloudflared routes `^/myapp.*`
to :9000 with an Access bypass). Same-origin on the tunnel → multiplayer works
in-browser unchanged.

## Hosting recommendation: **Cloudflare tunnel (`bmo.mybmoai.work`), same-origin**

Reasoning vs GitHub Pages:
1. **Backend-heavy app.** AI DM, registry, library, cloud sync, sounds, Discord,
   narration all hit the Pi. Same-origin = **zero CORS**, and the browser is
   already authenticated to **Cloudflare Access** (cookie) so the Access-protected
   endpoints (`/api/dnd`, `/api/chat`) work with no service-token-in-browser hack.
2. **GitHub Pages is cross-origin.** Only 4 path prefixes are CORS-allowed; the AI
   DM endpoints are not, and are behind Access → a github.io app can't reach them
   without broad CORS loosening + an Access bypass that weakens the Pi's posture.
3. **Pages site collision.** The repo's single Pages site is already owned by
   dungeon-scholar at `/home-lab/` (live: https://evilpatrick06.github.io/home-lab/).
   Adding dnd-web means merging both into one artifact/deploy → extra coupling.
4. **PeerJS signaling** (`/myapp`) is same-origin on the tunnel → multiplayer "just works."
5. Custom domain already exists; cloudflared ingress routes a path/subdomain to a static server.

Serve plan: SPA built with Vite `base: '/play/'`, served by Flask (static route)
or a cloudflared ingress path at `https://bmo.mybmoai.work/play/`. MemoryRouter
means no history-fallback config needed.

## Auto-update mechanism

Replicate the proven `bmo-deploy.yml` pattern as `dnd-web-deploy.yml`:
- Trigger: push to `master` touching `dnd-app/**` (+ release tags, + workflow_dispatch).
- Gate: green `dnd-app CI`.
- Build the web bundle on the GH runner (`npm ci && npm run build:web`).
- Join the tailnet (ephemeral Tailscale OAuth, `tag:ci` — secrets already exist
  for bmo-deploy), rsync `dist-web/` to the Pi, Flask/cloudflared serves it.
- Idempotent deploy script mirroring `bmo/pi/scripts/deploy.sh`.
- Net: every app change auto-redeploys the web version → always in sync.

## Step-by-step plan (Phase 2, branch `auto/web-version`)

1. **Web build target** — `vite.web.config.ts` (plain Vite, reusing renderer
   react/tailwind/aliases, `base:'/play/'`, entry = existing `index.html`/`main.tsx`);
   add `build:web` + `dev:web` scripts.
2. **`window.api` polyfill** — `src/web/web-api.ts` implementing the preload
   contract: IndexedDB-backed storage (idb), File System Access shims, BMO-backed
   methods (same-origin `fetch('/api/*')`). Injected before app mount when `!window.api`.
3. **Core flows building + serving** — main menu, character builder, library
   (Pi `/api/library`), settings (IndexedDB). Desktop-only methods → safe no-ops +
   capability flags so the UI hides them (updater, ollama-manage, LAN).
4. **AI-DM MVP** — route `ai.chatStream` to a Pi SSE endpoint (reuse `/api/dnd`
   agent). If full bridge is too big for MVP, ship the cloud-provider-key path first.
5. **Deploy** — add `dnd-web-deploy.yml` (build → tailnet → rsync → serve) + the Pi
   serve route + cloudflared/Access config for `/play/`.
6. **PR + CI gate**, then iterate to full parity; wire Claude-for-Chrome QA against `/play/`.
