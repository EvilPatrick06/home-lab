# home-lab

Three apps plus one edge worker, shipped from a single repo. They share a Pi, a release pipeline, and one set of contributor conventions; each one stands on its own and can be cloned + run in isolation.

## Projects

| Path | What it is | Stack | Where it runs |
|---|---|---|---|
| [`dnd-app/`](./dnd-app/) | Electron Virtual Tabletop for D&D 5e — multiplayer, AI DM, maps, character sheets | TypeScript · React 19 · Vite · electron-vite · PixiJS · PeerJS | Windows / Linux laptops |
| [`bmo/`](./bmo/) | BMO — voice assistant + Discord bots + smart-home hub + D&D narration engine | Python 3.11 · Flask + gevent · 5 AI agents · `discord.py` · `picamera2` | Raspberry Pi 5 (24/7 systemd services) |
| [`dungeon-scholar/`](./dungeon-scholar/) | D&D-themed exam-prep study app — spaced repetition, timed practice, dungeon-delve gamification | React · Vite · Supabase · GitHub Pages | Browser (deployed via Pages) |
| [`oracle-worker/`](./oracle-worker/) | Cloudflare Worker backing dungeon-scholar’s Oracle proxy (AI grading/chat) | TypeScript · Wrangler · Cloudflare Workers | Cloudflare edge |

Each project's own README has the details:
- 📖 [`dnd-app/README.md`](./dnd-app/README.md)
- 📖 [`bmo/README.md`](./bmo/README.md)
- 📖 [`dungeon-scholar/README.md`](./dungeon-scholar/README.md)

## Try it (no source build required)

| Project | How to use it |
|---|---|
| **dnd-app** | Download the latest installer from [Releases](https://github.com/EvilPatrick06/home-lab/releases/latest) — `dnd-vtt-*-setup.exe` on Windows, `dnd-vtt-*-x86_64.AppImage`, the one-line `install-linux.sh` on Linux, or visit: https://bmo.mybmoai.work/DungeonTableOnline/. Full install + first-game walkthrough: [`dnd-app/README.md`](./dnd-app/README.md#install-end-users). |
| **dungeon-scholar** | Open **[EvilPatrick06.github.io/dungeon-scholar](https://EvilPatrick06.github.io/dungeon-scholar/)** in any browser. No download. Usage guide: [`dungeon-scholar/README.md`](./dungeon-scholar/README.md#using-the-app-no-install-needed). |
| **bmo** | Hardware project — you need a Pi + mic + screen. Parts list + setup script: [`bmo/README.md`](./bmo/README.md#hardware). If you're on the same Wi-Fi as an already-running BMO, jump to [Using BMO](./bmo/README.md#using-bmo) for voice / Discord / VTT integration. |

Everything below is for **developers / contributors** — building from source, running tests, contributing fixes.

## Why one repo

These projects share infrastructure rather than features:

- **Releases**: one cut.mjs helper, one electron-builder config, one GitHub Actions workflow with Ollama caching across cuts.
- **Dev conventions**: one set of AI rules (`AGENTS.md`, `CLAUDE.md`, etc.), one issue-log triage doc, one log-instructions file.
- **The Pi**: BMO lives there, but the same machine hosts the game-discovery registry that `dnd-app` clients connect to (Phase 29).

`dnd-app` and `bmo` cross-talk over HTTP; `dungeon-scholar` is fully independent.

```
┌─────────────────────────┐    HTTP :5000    ┌──────────────────────────┐
│  dnd-app (Electron)     │ ───────────────► │  bmo/pi (Flask + gevent) │
│  TS · React 19          │ ◄─────────────── │  Python 3.11             │
│                         │   HTTP :5001     │  /api/games (registry)   │
│                         │   _bmo._tcp mDNS │  /api/chat (AI DM)       │
└─────────────────────────┘                  └──────────────────────────┘

┌─────────────────────────┐
│  dungeon-scholar        │   (independent — deployed to GitHub Pages,
│  React · Supabase       │    no Pi involvement)
└─────────────────────────┘
```

Full protocol spec: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

## Current state (2026-07-03)

- **`dnd-app`** at **v2.7.3**. Multiplayer (Phase 29), Token System (Phase 13), DM View (Phase 14), and the complete AI Dungeon Master (P6 roadmap — solo play, 127 DM actions, 37 stat-change types, Discord VC narration) shipped. 862 test files. Ships as Windows NSIS installer + Linux AppImage. Open backlog + deferred work: [`dnd-app/docs/phases/PHASE-INDEX.md`](./dnd-app/docs/phases/PHASE-INDEX.md) (the backlog phase set for the whole repo).
- **`bmo`** runs 5 systemd services live on the Pi: `bmo`, `bmo-fan`, `bmo-kiosk`, `bmo-dm-bot`, `bmo-social-bot`. 82 pytest files. Game-discovery registry at `/api/games*` advertises via avahi for Windows-zero-config.
- **`dungeon-scholar`** at Phase 34b (theme toggle); the Phase 27 audit remainder is now part of the backlog phase set ([`dnd-app/docs/phases/PHASE-INDEX.md`](./dnd-app/docs/phases/PHASE-INDEX.md), phases 17–19/39–41). Deployed via GitHub Pages workflow.

## Quick start

```bash
git clone https://github.com/EvilPatrick06/home-lab.git
cd home-lab
```

Then jump into whichever project you care about — each project's README owns its install / run / build steps.

For the all-in-one Pi + laptop setup: [`docs/SETUP.md`](./docs/SETUP.md).

## For AI agents (Cursor / Claude / Copilot / Gemini)

Read in order:
1. [`.cursorrules`](./.cursorrules) — full directory map
2. [`AGENTS.md`](./AGENTS.md) — cross-tool conventions
3. [`docs/LOG-INSTRUCTIONS.md`](./docs/LOG-INSTRUCTIONS.md) — which log to write to + when not to
4. [`dnd-app/docs/phases/PHASE-INDEX.md`](./dnd-app/docs/phases/PHASE-INDEX.md) — the backlog phase set (2026-06-11) for all three domains
5. The active issue / suggestion logs for the domain you're working in:
   - **dnd-app** → [`docs/logs/ISSUES-LOG-DNDAPP.md`](./docs/logs/ISSUES-LOG-DNDAPP.md) + [`docs/logs/SUGGESTIONS-LOG-DNDAPP.md`](./docs/logs/SUGGESTIONS-LOG-DNDAPP.md)
   - **bmo** → [`docs/logs/BMO-ISSUES-LOG.md`](./docs/logs/BMO-ISSUES-LOG.md) + [`docs/logs/BMO-SUGGESTIONS-LOG.md`](./docs/logs/BMO-SUGGESTIONS-LOG.md)
   - **dungeon-scholar** → [`docs/logs/ISSUES-LOG-DUNGEON-SCHOLAR.md`](./docs/logs/ISSUES-LOG-DUNGEON-SCHOLAR.md) + [`docs/logs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./docs/logs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)
6. Project READMEs ([`dnd-app/README.md`](./dnd-app/README.md), [`bmo/README.md`](./bmo/README.md), [`dungeon-scholar/README.md`](./dungeon-scholar/README.md)) before touching code.

Tool-specific instruction files: [`CLAUDE.md`](./CLAUDE.md), [`GEMINI.md`](./GEMINI.md), [`.github/copilot-instructions.md`](./.github/copilot-instructions.md).

**Automated / scheduled agents** (scanners, QA, the phase agents, the log-resolver) follow a per-agent branch + worktree workflow and never commit to `master` — each pushes its own `auto/<agent-id>` branch and a daily integrator consolidates them. See [`docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`](./docs/AUTOMATED-AGENT-GIT-WORKFLOW.md).

## Docs index

**Cross-cutting:**
- [`docs/README.md`](./docs/README.md) — index of every doc + log in `docs/`, grouped by purpose
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — how dnd-app + bmo communicate
- [`docs/DATA-FLOW.md`](./docs/DATA-FLOW.md) — where data lives, how it moves
- [`docs/RULES-RETRIEVAL.md`](./docs/RULES-RETRIEVAL.md) — cross-engine rules-retrieval stack (dnd-app TS + bmo Python)
- [`docs/SETUP.md`](./docs/SETUP.md) — full clone-to-running guide
- [`docs/COMMANDS.md`](./docs/COMMANDS.md) — common-commands cheat sheet
- [`docs/GLOSSARY.md`](./docs/GLOSSARY.md) — beginner-friendly term index
- [`docs/BACKUP.md`](./docs/BACKUP.md) — backup strategy (Pi + GitHub LFS + cloud)
- [`docs/SECURITY.md`](./docs/SECURITY.md) — posture, reporting, secret-handling
- [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) — branch / commit conventions
- [`docs/AUTOMATED-AGENT-GIT-WORKFLOW.md`](./docs/AUTOMATED-AGENT-GIT-WORKFLOW.md) — per-agent branch + worktree + integrator workflow
- [`docs/CHANGELOG.md`](./docs/CHANGELOG.md) — release history

**Active logs (split by domain — grep before opening a "new" bug):**
- Bugs: [`docs/logs/ISSUES-LOG-DNDAPP.md`](./docs/logs/ISSUES-LOG-DNDAPP.md) · [`docs/logs/BMO-ISSUES-LOG.md`](./docs/logs/BMO-ISSUES-LOG.md) · [`docs/logs/ISSUES-LOG-DUNGEON-SCHOLAR.md`](./docs/logs/ISSUES-LOG-DUNGEON-SCHOLAR.md)
- Future-ideas / gotchas: [`docs/logs/SUGGESTIONS-LOG-DNDAPP.md`](./docs/logs/SUGGESTIONS-LOG-DNDAPP.md) · [`docs/logs/BMO-SUGGESTIONS-LOG.md`](./docs/logs/BMO-SUGGESTIONS-LOG.md) · [`docs/logs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md`](./docs/logs/SUGGESTIONS-LOG-DUNGEON-SCHOLAR.md)
- Resolved archive: [`docs/logs/RESOLVED-ISSUES-DNDAPP.md`](./docs/logs/RESOLVED-ISSUES-DNDAPP.md) · [`docs/logs/BMO-RESOLVED-ISSUES.md`](./docs/logs/BMO-RESOLVED-ISSUES.md) · [`docs/logs/RESOLVED-ISSUES-DUNGEON-SCHOLAR.md`](./docs/logs/RESOLVED-ISSUES-DUNGEON-SCHOLAR.md)
- Security log (gitignored): `docs/logs/SECURITY-LOG.md`

**Per-project deep dives:**
- [`dnd-app/docs/IPC-SURFACE.md`](./dnd-app/docs/IPC-SURFACE.md) — Electron IPC channel catalogue
- [`dnd-app/docs/PLUGIN-SYSTEM.md`](./dnd-app/docs/PLUGIN-SYSTEM.md) — game-system plugin API
- [`bmo/docs/AGENTS.md`](./bmo/docs/AGENTS.md) — the 5 BMO AI agents
- [`bmo/docs/SERVICES.md`](./bmo/docs/SERVICES.md) — Python services + ports
- [`bmo/docs/TROUBLESHOOTING.md`](./bmo/docs/TROUBLESHOOTING.md) — common BMO failures
- [`bmo/docs/SYSTEMD.md`](./bmo/docs/SYSTEMD.md) — service management
- [`bmo/docs/DEPLOY.md`](./bmo/docs/DEPLOY.md) — push code → BMO on Pi
- [`dungeon-scholar/docs/supabase-setup.md`](./dungeon-scholar/docs/supabase-setup.md) — backend bootstrap

## License

ISC. See [`LICENSE`](./LICENSE).
