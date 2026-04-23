# DnD

Monorepo for a Dungeons & Dragons virtual tabletop (VTT) paired with an AI voice assistant.

## What's in here

| Path | What |
|---|---|
| [`dnd-app/`](./dnd-app/) | Electron desktop VTT (TypeScript + React 19 + Vite). Runs on player + DM laptops. |
| [`bmo/`](./bmo/) | BMO — Raspberry Pi voice assistant with 41 AI agents, Discord bots, smart home, and D&D DM brain. Runs 24/7 on a Pi 5. |
| [`docs/`](./docs/) | Cross-domain docs — architecture, setup, commands, glossary, known issues. |
| [`_archive/`](./_archive/) | Quarantined dead code (not git-deleted, moved here for audit). |

## Quick start

Clone + setup (one-time):

```bash
git clone https://github.com/EvilPatrick06/DnD.git
cd DnD
```

**dnd-app (VTT):**
```bash
cd dnd-app
npm install
npm run dev               # starts electron-vite dev server
```

**bmo (Pi voice assistant):**
```bash
cd bmo
bash setup-bmo.sh         # installs deps, creates systemd services
cd pi
./venv/bin/python app.py  # dev run (systemctl for prod)
```

Full clone-to-running guide: [`docs/SETUP.md`](./docs/SETUP.md)

## How the two domains talk

```
┌─────────────────────┐    HTTP :5000    ┌────────────────────┐
│  dnd-app (VTT)      │ ───────────────► │  bmo/pi (Flask)    │
│  Electron + React   │ ◄─────────────── │  Python 3.11       │
│                     │   HTTP :5001     │                    │
└─────────────────────┘                  └────────────────────┘
```

Protocol: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

## For AI agents (Cursor / Claude / Copilot / Gemini)

Primary context files, read in order:

1. [`.cursorrules`](./.cursorrules) — structure map (every dir explained)
2. [`AGENTS.md`](./AGENTS.md) — cross-tool AI rules
3. [`docs/KNOWN-ISSUES.md`](./docs/KNOWN-ISSUES.md) — preexisting bugs to avoid re-fixing

Tool-specific: [`CLAUDE.md`](./CLAUDE.md), [`GEMINI.md`](./GEMINI.md), [`.github/copilot-instructions.md`](./.github/copilot-instructions.md)

## Docs index

**User/dev onboarding:**
- [`docs/SETUP.md`](./docs/SETUP.md) — first clone → running
- [`docs/COMMANDS.md`](./docs/COMMANDS.md) — common commands cheat sheet
- [`docs/GLOSSARY.md`](./docs/GLOSSARY.md) — beginner term index
- [`docs/BACKUP.md`](./docs/BACKUP.md) — backup strategy

**Architecture:**
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — how DnD + BMO communicate
- [`docs/DATA-FLOW.md`](./docs/DATA-FLOW.md) — where data lives, how it moves
- [`dnd-app/docs/IPC-SURFACE.md`](./dnd-app/docs/IPC-SURFACE.md) — Electron IPC channels
- [`dnd-app/docs/PLUGIN-SYSTEM.md`](./dnd-app/docs/PLUGIN-SYSTEM.md) — game system plugin API
- [`bmo/docs/AGENTS.md`](./bmo/docs/AGENTS.md) — 41 BMO AI agents
- [`bmo/docs/SERVICES.md`](./bmo/docs/SERVICES.md) — BMO services + ports

**Ops / security:**
- [`bmo/docs/TROUBLESHOOTING.md`](./bmo/docs/TROUBLESHOOTING.md) — BMO issue fixes
- [`bmo/docs/DEPLOY.md`](./bmo/docs/DEPLOY.md) — update BMO on Pi
- [`bmo/docs/SYSTEMD.md`](./bmo/docs/SYSTEMD.md) — service management
- [`docs/SECRETS-ROTATION.md`](./docs/SECRETS-ROTATION.md) — rotate leaked keys
- [`SECURITY.md`](./SECURITY.md) — report security issues

**Process:**
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — branch/commit conventions
- [`CHANGELOG.md`](./CHANGELOG.md) — version history

## Current state

- Running on a single Raspberry Pi 5 (`/home/patrick/DnD/`)
- 5 BMO systemd services live: `bmo, bmo-fan, bmo-kiosk, bmo-dm-bot, bmo-social-bot`
- DnD app installed manually on player laptops (Windows + Mac)
- LFS used for D&D 2024 rulebook PDFs (`5.5e References/` — gitignored locally, pulled on-demand)

## License

ISC. See [`LICENSE`](./LICENSE).
