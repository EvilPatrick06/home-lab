# dnd-app

Electron desktop Virtual Tabletop (VTT) for running Dungeons & Dragons 5e games. Multiplayer via PeerJS WebRTC. Optional AI Dungeon Master (Ollama / Claude / Gemini), optional BMO Pi integration for game discovery + narration TTS.

**Current version:** v2.1.16

## What's in it

- **Map canvas** (PixiJS): tokens with custom colors / border styles / image masks, drag-select, fog of war, dynamic lighting, AoE templates with live preview, walls + doors, drawings.
- **Multiplayer** (PeerJS WebRTC): host + up to 8 players + 5 spectators per session; persistent client UUIDs for ban survival; public/private game toggle; LAN + Pi-registry game browser; resume-on-reconnect via per-client message replay buffer; msgpack ± gzip wire codec with capability handshake.
- **Character sheets** (D&D 2024): full 5e builder, level-up flow, spell management, class resources, condition tracker, downtime activities.
- **Combat**: initiative tracker, AoE templates, group rolls, conditions, opportunity attacks, mounted combat, concentration tracking, dice (3D Three.js renderer with Reduced-Motion fallback).
- **AI DM**: Ollama (local), Claude, Gemini, OpenAI. Scene preparation, NPC interaction logging, end-of-session recaps, token-budget tracking, proactive triggers.
- **Library**: 3000+ JSON files of D&D 2024 content (monsters, spells, items, equipment, traps, hazards, environments). Recently-viewed list with Clear button. Homebrew per category.
- **Bastions** (2024 PHB): facilities, hirelings, events.
- **BMO Pi integration** (optional): narration TTS, Discord bot relay, AI memory sync, calendar lookups.

## Stack

TypeScript 5 · React 19 · Vite · electron-vite · biome · vitest · Zustand · tiptap · PeerJS · PixiJS · Three.js · cannon-es · @msgpack/msgpack · bonjour-service · electron-updater.

## Quick start

```bash
npm install
npm run dev        # launches electron + Vite dev server with HMR
```

## Build for release

Cross-platform: ships as **Windows NSIS installer** + **Linux AppImage**.

```bash
npm run build:index            # regenerate chunk index for lazy loading
npm run build                  # electron-vite build (current platform only, no installer)

# Per-platform builders — local artifacts in dist/, no publish
npm run build:win              # Windows NSIS installer
npm run build:linux            # Linux AppImage
npm run build:cross            # Both (requires wine on Linux for cross-compile)

# Cutting a real release — use the helper, NOT a manual tag
node scripts/release/cut.mjs X.Y.Z --notes-file=/tmp/vX.Y.Z-notes.md
```

`cut.mjs` keeps `package.json` and the git tag in lockstep — versions drifted out of sync would silently ship 0–3 of the 6 expected assets (this bit us before v2.1.3). The release workflow's `verify-assets` job hard-fails if anything is missing.

**Auto-update** — `electron-updater` handles diff updates on Windows (NSIS) and Linux (AppImage). Users can opt into auto-check on launch / auto-download / auto-restart / silent install via Settings → Updates.

## Test + lint

```bash
npm test                       # vitest run (one-shot)
npm run test:watch             # vitest watch
npm run test:coverage          # with coverage
npm run lint                   # biome check
npm run lint:fix               # biome write
npx tsc --noEmit               # type-check only (use -p tsconfig.web.json / tsconfig.node.json for scoped)
npm run dead-code              # knip unused exports
npm run circular               # dpdm circular-deps report
npm run check:release          # mirror the CI preflight gates before cutting a tag
```

Current baseline: **6360 tests across 643 files**, lint + both tsc projects clean.

## Multiplayer architecture (Phase 29)

```
┌──────────────────────┐                        ┌──────────────────────┐
│   HOST (DM)          │                        │   CLIENT (player)    │
│   PeerJS host        │ ◄─── WebRTC ─────────► │   PeerJS guest       │
│   port = invite_code │     reliable, msgpack  │                      │
└──────────┬───────────┘                        └──────────┬───────────┘
           │                                               │
           │  POST /api/games           GET /api/games     │
           │  PATCH /api/games/<code>   /stream (SSE)      │
           │  heartbeat / DELETE                           │
           ▼                                               ▼
┌────────────────────────────────────────────────────────────────────┐
│              BMO Pi  (Flask :5000)                                 │
│   /api/games + SSE — game-discovery registry                       │
│   _bmo._tcp avahi advertisement — Windows zero-config              │
└────────────────────────────────────────────────────────────────────┘
```

**Discovery** — Pi advertises `_bmo._tcp` (port 5000) via avahi; main process browses it via `bonjour-service` and emits `BMO_RESOLVED_URL` to the renderer. Direct HTTP probe at `bmo.local:5000/health` fires 3 s later as a fallback for hosts where Windows Firewall blocks the mDNS browse path.

**Wire format** — single messages ship as `{ ... }`. Same-microtask bursts coalesce into one `batch` envelope. When the peer advertised `clientCapabilities.msgpack`, the frame is tagged binary (`0x01` raw, `0x02` gzipped past 4 KB). Pre-v29j peers get JSON strings.

**Reconnect resync** — host keeps a 500-entry circular buffer per `clientId`; a returning client sends `player:join` with `lastSequence`, host ships a `game:state-resync` with just the missed messages (or falls back to full state).

## Directory layout

```
dnd-app/
├── src/                          ELECTRON-VITE ENFORCED (don't restructure)
│   ├── main/                     Electron main process (Node)
│   │   ├── index.ts              entry — BrowserWindow + IPC bootstrap
│   │   ├── bmo-bridge.ts         HTTP client to BMO Pi
│   │   ├── bmo-config.ts         BMO URL precedence (settings > discovered > env > default)
│   │   ├── bmo-csp.ts            connect-src CSP fragment for the resolved BMO host
│   │   ├── cloud-sync.ts         Google Drive sync via Rclone (on Pi)
│   │   ├── lan-discovery.ts      bonjour-service: publish hosted game + browse _dndvtt._tcp + _bmo._tcp
│   │   ├── updater.ts            electron-updater wiring + auto-update prefs
│   │   ├── ai/                   AI service layer (Claude, Gemini, OpenAI, Ollama, stream handler, context builder)
│   │   ├── ipc/                  IPC handlers — ai, audio, bmo-sync, cloud-sync, discord, game-data, lan, plugin, storage
│   │   ├── storage/              persistent storage (characters, campaigns, bastion, game state, migrations)
│   │   ├── plugins/              plugin system (content packs, runner, scanner, storage, protocol)
│   │   ├── discord-integration/  Discord relay from the DM machine
│   │   └── data/                 static JSON
│   ├── preload/                  contextBridge: window.api shape
│   ├── renderer/                 React app
│   │   ├── src/
│   │   │   ├── App.tsx
│   │   │   ├── components/       feature-grouped — builder, campaign, game, sheet, library, levelup, lobby, ui
│   │   │   ├── services/         feature-grouped — character, chat-commands, combat, dice, game-actions, io, library, map, plugin-system
│   │   │   ├── stores/           Zustand — bastion, builder, game, level-up, network, accessibility, ai-dm, …
│   │   │   ├── pages/            route components (MainMenuPage, JoinGamePage, LobbyPage, InGamePage, CharacterSheet5ePage, …)
│   │   │   ├── data/             TS-exported game content
│   │   │   ├── network/          peerjs multiplayer — host/client managers, message handlers, game sync, registry client, msgpack codec, replay buffer, host-announce lifecycle
│   │   │   └── utils/, types/, hooks/, systems/, constants/, events/, styles/
│   │   └── public/data/5e/       D&D 2024 content (3000+ JSON files)
│   ├── shared/                   cross-process types + IPC channels + zod schemas
│   └── __mocks__/                vitest mocks
│
├── scripts/
│   ├── build/                    chunk-index, prerelease-clean, fetch-ollama
│   ├── release/                  cut.mjs (single-command tag + push)
│   ├── extract/                  PDF → JSON extraction pipeline
│   ├── generate/                 schema + batch generation
│   ├── submit/                   Anthropic Batch API submission
│   ├── audit/                    data validation
│   ├── batch-utils/, fix/, schemas/
│
├── tools/                        dev utilities (audit runner, console→logger sweep, knip-summary)
├── docs/
│   ├── IPC-SURFACE.md            Electron IPC channel reference
│   ├── PLUGIN-SYSTEM.md          game-system plugin API
│   └── phases/                   open-work plans (phase-15 through phase-28)
├── resources/                    icons + installer.nsh + chunk-index.json (+ ollama bundle on Windows CI)
├── package.json
├── electron.vite.config.ts       resolve aliases (@renderer, @data), manual chunking
├── vitest.config.ts
├── tsconfig.{json,node,web}.json references split between main/preload/shared and renderer
├── biome.json
└── dev-app-update.yml            electron-updater config
```

## Path aliases

- `@renderer/*` → `src/renderer/src/*`
- `@data/*` → `src/renderer/public/data/*`

## Talking to BMO

| Direction | Surface | Used for |
|---|---|---|
| VTT → BMO | HTTP client at `src/main/bmo-bridge.ts`. Base URL = settings.bmoPiBaseUrl > discovered URL > `BMO_PI_URL` env > `http://bmo.local:5000`. 15 s timeout. | Narration sync, combat-state push, Discord DM session control, AI memory sync |
| BMO → VTT | Sync receiver HTTP server in main on `BMO_SYNC_PORT \|\| 5001` | Discord message events, initiative updates, player join/leave, dice rolls |
| VTT → Pi registry | REST + SSE to `:5000/api/games*` (renderer-side `network/registry-client.ts`) | Public game-list discovery |

Full protocol: [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

## Plugin system

Game systems are pluggable. Currently only D&D 5e 2024. To add a system:
1. Create `src/renderer/src/systems/<system-name>/`
2. Register in `src/renderer/src/systems/registry.ts`
3. Add JSON data to `src/renderer/public/data/<system-name>/`

Spec: [`docs/PLUGIN-SYSTEM.md`](./docs/PLUGIN-SYSTEM.md).

## Tips

- Run `npm run circular` before any structural refactor.
- `npm run dead-code` finds unused exports.
- 3000+ JSON files in `public/data/5e/` make the renderer bundle big — lazy load via the `@data` alias + dynamic `import()`.
- The Ollama bundle is ~2 GB; it's downloaded only on Windows CI and cached across releases via `actions/cache` keyed on the upstream tag.
- Use `cut.mjs` for releases — never `git tag` manually. Version drift between `package.json` and the tag silently broke v2.0.1 / v2.0.2 / v2.1.0 / v2.1.1 / v2.1.2.
