# dnd-app

Electron desktop Virtual Tabletop (VTT) for running Dungeons & Dragons 5e games.

**Stack:** TypeScript 5, React 19, Vite, electron-vite, biome, vitest, zustand, tiptap, peerjs, pixi.js, three.js.

## Run it

```bash
npm install
npm run dev        # launches electron + vite dev server with HMR
```

## Build for release

Cross-platform: ships as **Windows NSIS installer** + **Linux AppImage**.

```bash
npm run build:index            # regenerate chunk index for lazy loading
npm run build                  # electron-vite build (no installer; current platform)

# Per-platform builders (no publish — local artifacts in dist/)
npm run build:win              # Windows NSIS installer
npm run build:linux            # Linux AppImage
npm run build:cross            # Both (requires wine on Linux for cross-compile)

# Release (publishes to GitHub Releases)
npm run release                # Windows only (current default)
npm run release:linux          # Linux only
npm run release:all            # Windows + Linux
```

**Auto-update** — `electron-updater` handles updates on Windows (NSIS differential) and Linux (AppImage). On Linux, the running app must be the AppImage (`process.env.APPIMAGE` set) for in-app update to engage.

## Test + lint

```bash
npm test                       # vitest (once)
npm run test:watch             # vitest watch
npm run test:coverage          # with coverage
npm run lint                   # biome check
npm run lint:fix               # biome fix
npx tsc --noEmit               # type-check only
npm run dead-code              # knip unused exports
npm run circular               # dpdm circular deps (report only; exit 0)
```

## Directory layout

```
dnd-app/
├── src/                           ELECTRON-VITE ENFORCED (do NOT restructure)
│   ├── main/                      Electron main process (Node)
│   │   ├── index.ts               Entry point — BrowserWindow setup
│   │   ├── bmo-bridge.ts          HTTP client to BMO Pi (port 5000)
│   │   ├── cloud-sync.ts          Optional cloud sync relay
│   │   ├── log.ts, updater.ts     Logging + auto-update
│   │   ├── ai/                    67 files — AI service layer (Claude, Gemini, stream handler, context builder, etc.)
│   │   ├── ipc/                   17 files — IPC handlers (AI, audio, bmo-sync, cloud-sync, discord, game-data, plugin, storage)
│   │   ├── storage/               26 files — persistent storage (characters, campaigns, bastion, game state, migrations)
│   │   ├── plugins/               13 files — plugin system (content packs, runner, scanner, storage, protocol)
│   │   ├── discord-integration/   3 files — Discord bot relay from the DM machine
│   │   └── data/                  3 files — static JSON (dnd-terms, token-budgets, tone-validation)
│   ├── preload/                   Electron contextBridge
│   ├── renderer/                  React app (Vite)
│   │   ├── index.html             entry
│   │   ├── src/
│   │   │   ├── App.tsx, main.tsx  entry
│   │   │   ├── components/        637 files by feature: builder, campaign, game, sheet, library, levelup, lobby, ui
│   │   │   ├── services/          277 files by feature: character, chat-commands, combat, dice, game-actions, io, library, map, plugin-system
│   │   │   ├── stores/            130 files — zustand stores (bastion, builder, game, level-up, network, accessibility, ai-dm, ...)
│   │   │   ├── pages/             87 files — route components (CharacterSheet5ePage, CampaignDetailPage, BastionPage, etc.)
│   │   │   ├── data/              44 files — TS-exported game content (alignments, class-resources, conditions, effects, light-sources, moderation, ...)
│   │   │   ├── network/           25 files — peerjs multiplayer (client/host managers, message handlers, game sync)
│   │   │   ├── utils/, types/, hooks/, systems/, constants/, events/, styles/
│   │   └── public/
│   │       └── data/5e/           3028 JSON files — D&D 2024 content (spells, equipment, monsters, classes, feats, origins, ...)
│   ├── shared/                    10 files — cross-process types, schemas, IPC channels
│   └── __mocks__/                 vitest mocks
│
├── scripts/                       CLI tooling, grouped by purpose
│   ├── build/                     used by package.json (chunk-index, prerelease-clean)
│   ├── extract/                   17 files — PDF→JSON extraction pipeline (extract-armor, extract-monsters, etc.)
│   ├── generate/                  9 files — schema + batch generation
│   ├── submit/                    6 files — Anthropic Batch API submission
│   ├── audit/                     6 files — data validation (ultimate-audit.ts is canonical)
│   ├── batch-utils/               8 files — batch job monitors
│   ├── fix/                       4 files — one-off data migrations
│   └── schemas/                   9 zod schemas (shared by extract/)
│
├── tools/                         Dev utilities (not actual tests despite legacy "Tests/" folder name)
│   ├── run-audit.js               Master audit runner
│   ├── electron-security.js       Security scanner
│   ├── rename-to-kebab.js         File rename utility
│   ├── replace-console-logs.js    Console → structured logger
│   ├── find-data.js, find-unused-imports.js, knip-summary.js
│
├── docs/
│   ├── IPC-SURFACE.md             Electron IPC channel reference
│   ├── PLUGIN-SYSTEM.md           game system plugin API
│   └── phases/                    30 planning docs (phase-13-kimi.md ... phase-27-plan.md)
│
├── resources/                     icons + installer.nsh + chunk-index.json
│
├── package.json
├── electron.vite.config.ts        resolve aliases (@renderer, @data), manual chunking
├── vitest.config.ts
├── tsconfig.json                  references web + node
├── tsconfig.node.json             main/preload/shared
├── tsconfig.web.json              renderer + public
├── biome.json                     lint + format
├── dev-app-update.yml             electron-updater config
└── README.md
```

## Path aliases

- `@renderer/*` → `src/renderer/src/*`
- `@data/*` → `src/renderer/public/data/*`

## Talking to BMO

VTT → BMO: HTTP client at `src/main/bmo-bridge.ts`.
- Base URL: saved **BMO Pi base URL** in app settings, else `BMO_PI_URL`, else `http://bmo.local:5000` (see `src/main/bmo-config.ts`)
- Timeout: 15s
- Used for: narration sync, combat state push, Discord DM session control

BMO → VTT: sync receiver HTTP server in main process on `process.env.BMO_SYNC_PORT || 5001`.
- Receives: Discord message events, initiative updates, player join/leave, dice rolls

See [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) for full protocol.

## Plugin system

Game systems are pluggable. Currently only D&D 5e 2024. To add a system:
1. Create `src/renderer/src/systems/<system-name>/`
2. Register in `src/renderer/src/systems/registry.ts`
3. Add JSON data to `src/renderer/public/data/<system-name>/`

Full spec: [`docs/PLUGIN-SYSTEM.md`](./docs/PLUGIN-SYSTEM.md)

## Tips

- Run `npm run circular` before big refactors
- `npm run dead-code` to find unused exports
- The 3000+ JSON files in `public/data/5e/` make the renderer bundle big — lazy load via `@data` alias + dynamic import
- `biome.json` has ignore rules for generated files — check it when adding new tooling
