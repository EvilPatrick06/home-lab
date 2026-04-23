# AGENTS.md

> Canonical AI agent instructions — read by Cursor, Codex, Claude Code, most AI tools.
> Tool-specific overrides: `.cursorrules`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`

## Project Identity

**DnD** is a monorepo with two domains that communicate via HTTP:

1. **`dnd-app/`** — Electron desktop Virtual Tabletop (VTT) for running D&D 5e games. TypeScript + React 19 + Vite. Runs on player/DM laptops.
2. **`bmo/`** — Raspberry Pi voice assistant named BMO. Python Flask. Runs 24/7 on a Pi 5. Hosts Discord DM bot, music, calendar, weather, smart home, and the AI Dungeon Master brain for D&D sessions.

Both live in the same git repo because they're tightly coupled: BMO narrates D&D sessions via the VTT, VTT sends combat state to BMO, Discord players interact through BMO to the VTT.

## How to Start Working

```bash
# 1. Always orient yourself first
cat .cursorrules                           # structure map
cat docs/ARCHITECTURE.md                   # cross-domain protocol
cat docs/KNOWN-ISSUES.md                   # preexisting bugs to avoid re-fixing

# 2. Work in the right directory
cd dnd-app   # for VTT work
cd bmo/pi    # for BMO work

# 3. Test your changes before declaring done
cd dnd-app && npm test && npm run lint && npx tsc --noEmit
cd bmo/pi && ./venv/bin/python -m pytest
```

## Structure Rules (enforce on every change)

1. **Feature over type**: group by what it does (inventory, combat, calendar) not what kind (components, services, utils)
2. **Flat hierarchy**: max 2 subdir levels below domain root. If adding a 3rd, justify in commit message.
3. **No cross-domain imports**: dnd-app/ cannot `import` from bmo/, vice versa. They only talk HTTP.
4. **Canonical paths**: always use `/home/patrick/DnD/bmo/pi/...` in docs/code. NEVER `~/bmo/...` (aliases of the past).
5. **Tests next to source**: `.test.ts` beside `.ts`, pytest tests in `bmo/pi/tests/`.
6. **Secrets stay out**: verify `.gitignore` catches anything resembling credentials before committing.

## dnd-app/ Guidelines

| Topic | Rule |
|---|---|
| Framework | `electron-vite` — its layout is fixed. `src/{main,preload,renderer,shared}` cannot be restructured. |
| Main process | Node.js. Can use `node:*` modules, electron APIs, fs. |
| Renderer | Browser sandbox. Goes through `preload/index.ts` for privileged ops. |
| State | zustand stores in `src/renderer/src/stores/*`. Register in `register-stores.ts`. |
| IPC | define channels in `src/shared/ipc-channels.ts`. Handlers in `src/main/ipc/`. |
| Types | shared types in `src/shared/`, domain types in `src/renderer/src/types/`. |
| Validation | zod schemas for runtime (`src/shared/ipc-schemas.ts`). |
| Data | game content JSON in `src/renderer/public/data/5e/`. TS-exported data in `src/renderer/src/data/`. |
| Game systems | pluggable via `src/renderer/src/systems/registry.ts`. Currently only `dnd5e/`. |
| Network (multiplayer) | peerjs in `src/renderer/src/network/`. DM hosts, players join via invite code. |
| BMO integration | HTTP client in `src/main/bmo-bridge.ts`. Receives callbacks on port 5001 via sync receiver. |
| Tests | vitest. `.test.ts(x)` colocated. Run with `npm test`. |
| Lint | biome (`dnd-app/biome.json`). Run `npm run lint`. |
| Build | `npm run build` (electron-vite) → `npm run release` (electron-builder for Windows NSIS installer). |

## bmo/ Guidelines

| Topic | Rule |
|---|---|
| Runtime | Python 3.11 in venv at `bmo/pi/venv/`. System packages for hardware (smbus, RPi.GPIO). |
| Entry points | `app.py` (Flask), `agent.py` (CLI agent), `cli.py` (repl). |
| Subpackages | Always import via prefix: `from services.calendar_service import X`. Never bare. |
| Agents | 41 modular AI agents in `agents/`. Each owns one capability. Router picks which to invoke. |
| Services | Business logic in `services/` (calendar, music, weather, voice_pipeline, monitoring, etc.) |
| Hardware | Pi-specific drivers in `hardware/` (fan, LED, OLED, camera). |
| Discord bots | In `bots/` — package is NAMED `bots` not `discord` to avoid shadowing `discord.py` library. |
| Dev tools | `dev/` — benchmarks, patches, file watchers (non-production). |
| Wake word | `wake/` — onnx model + training clips. |
| Web UI | `web/static/` + `web/templates/` (Jinja). Flask serves on port 5000. |
| Data | Runtime state in `data/*.json, *.db`. Content in `data/{games,personality,5e,rag_data}/`. |
| Tests | pytest in `tests/`. Run with `./venv/bin/python -m pytest`. |
| Systemd | 5 services: `bmo, bmo-fan, bmo-kiosk, bmo-dm-bot, bmo-social-bot`. Reload on changes. |
| Install | `bash setup-bmo.sh` (idempotent, writes service files + deps). |

## Cross-Domain Communication

```
┌─────────────┐       HTTP 5000        ┌──────────────┐
│  dnd-app    │ ─────────────────────► │   bmo/pi     │
│  (Electron) │ ◄──────────────────── │   (Flask)    │
│             │    HTTP 5001 callbacks │              │
└─────────────┘                        └──────────────┘
      │                                       │
      │                                       ├── Discord DM bot
      │                                       ├── Discord social bot
      │                                       ├── Voice (wake-word + STT/TTS)
      └── peerjs multiplayer                  ├── Smart home (Chromecast, TV, lights)
                                              ├── 41 AI agents (routed)
                                              └── Calendar/weather/music/timers
```

Protocol details: `docs/ARCHITECTURE.md`

## When You Find Bugs

**Do not silently fix preexisting bugs outside your task scope.** Instead:

1. Reproduce + verify it's preexisting (not caused by your change)
2. Append to `docs/KNOWN-ISSUES.md` with: date, category, reproduction, hypothesis, proposed fix
3. Mention it in your summary/PR but don't fix unless user asks

This keeps bug log useful + avoids "while I was here" scope creep.

## Security Reminders

- Secrets purged from git history on 2026-04-23 via `git filter-repo`
- `.gitignore` has broad patterns for `*.env`, `*.pem`, `credentials.json`, `token.json`
- If re-introducing a secret accidentally: rotate it externally first, then fix tree+history, force-push
- See `docs/SECRETS-ROTATION.md`

## Build/Test Cheat Sheet

```bash
# DnD app
cd dnd-app
npm install
npm run dev              # electron-vite dev server
npm run build            # production build
npm run test             # vitest
npm run lint             # biome
npx tsc --noEmit         # type-check

# BMO
cd bmo/pi
./venv/bin/python app.py                          # dev run (port 5000)
./venv/bin/python -m pytest                       # tests
sudo systemctl restart bmo                        # reload running service
journalctl -u bmo -f                              # tail service logs
sudo systemctl status bmo bmo-fan bmo-kiosk \     # check all BMO services
    bmo-dm-bot bmo-social-bot
```

Full list in `docs/COMMANDS.md`.
