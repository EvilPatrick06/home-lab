# AGENTS.md

> Canonical AI agent instructions — read by Cursor, Codex, Claude Code, most AI tools.
> Tool-specific overrides: `.cursorrules`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`

## Project Identity

**home-lab** is a monorepo with two domains that communicate via HTTP:

1. **`dnd-app/`** — Electron desktop Virtual Tabletop (VTT) for running D&D 5e games. TypeScript + React 19 + Vite. Runs on player/DM laptops.
2. **`bmo/`** — Raspberry Pi voice assistant named BMO. Python Flask. Runs 24/7 on a Pi 5. Hosts Discord DM bot, music, calendar, weather, smart home, and the AI Dungeon Master brain for D&D sessions.

Both live in the same git repo because they're tightly coupled: BMO narrates D&D sessions via the VTT, VTT sends combat state to BMO, Discord players interact through BMO to the VTT.

## How to Start Working

```bash
# 1. Always orient yourself first
cat .cursorrules                              # structure map
cat docs/ARCHITECTURE.md                      # cross-domain protocol
# preexisting bugs (grep both domain logs so you don't re-discover):
cat docs/BMO-ISSUES-LOG.md docs/ISSUES-LOG-DNDAPP.md
# preexisting future-ideas / design-gotchas (active logs) + canonical constraints:
cat docs/BMO-SUGGESTIONS-LOG.md docs/SUGGESTIONS-LOG-DNDAPP.md
cat bmo/docs/DESIGN-CONSTRAINTS.md

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
4. **Canonical paths**: always use `/home/patrick/home-lab/bmo/pi/...` in docs/code. NEVER `~/bmo/...` (aliases of the past).
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
| Build | `npm run build` (electron-vite) → `npm run build:{win,linux,cross}` (electron-builder NSIS / AppImage+deb). `npm run release{,:linux,:all}` to publish. |

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

## When You Find Bugs / Tech Debt / Ideas

The logs are for work that **crosses session boundaries**:

- `docs/BMO-ISSUES-LOG.md` — BMO-domain bugs + debt
- `docs/ISSUES-LOG-DNDAPP.md` — dnd-app-domain bugs + debt
- `docs/BMO-SUGGESTIONS-LOG.md` — BMO-domain ideas / design gotchas / info
- `docs/SUGGESTIONS-LOG-DNDAPP.md` — dnd-app-domain ideas / design gotchas / info
- `docs/SECURITY-LOG.md` — security (gitignored, any domain)
- `Domain: both` entries → mirrored in BOTH issue logs (or BOTH suggestion logs). Triage table: `docs/LOG-INSTRUCTIONS.md`

Before appending, decide:

- **Fixing in this session?** → Just fix it. Mention in commit body if non-trivial. Do NOT log — it clutters the log with already-resolved entries.
- **Out of scope / deferred?** → Log it (even if minor). Do NOT silently fix.
- **Unsure?** → If 2-line fix in-scope → fix. If it'd derail current work → log.

**For out-of-scope items:**

1. Reproduce + verify it's preexisting (not caused by your change)
2. Read `docs/LOG-INSTRUCTIONS.md` for the triage table (which log), template, severity/category guidance, and "log vs fix inline" examples
3. Append an entry to the right log per the **Domain** field — see triage rule in `LOG-INSTRUCTIONS.md`. Minor/optional out-of-scope items count — log them too.
4. Mention it in your summary/PR but don't fix unless user asks

This keeps the log useful + avoids "while I was here" scope creep AND avoids entries that are stale before they land.

## Task List Discipline (avoid "25/43 completed" drift)

If you use a task list (Cursor `TodoWrite`, Claude todo tool, etc.), Cursor's UI counts status literally — items left as `pending` or `in_progress` at session end are reported as incomplete even when the actual work is done. This wastes user attention debugging phantom gaps.

**Rules for every session that uses a task list:**

1. **Update status the moment a task finishes** — don't batch "I'll flip them all at the end". You will forget.
2. **Only ONE `in_progress` at a time.** If you're about to start another, the current one is either done (→ `completed`) or abandoned (→ `cancelled`) — decide before proceeding.
3. **Before writing your final summary, reconcile the list.** Walk every `pending` / `in_progress` ID and either:
   - Mark `completed` (with evidence in the summary — commit SHA, service status, file path)
   - Mark `cancelled` (with one-line reason)
   - Flag as genuine follow-up the user must do (e.g., `manual` IDs — keep as `pending` but call them out explicitly)
4. **Prefer `merge: true` for incremental updates, but re-read the accumulated state before the final write.** Drifted IDs silently persist across merge calls — the Cursor UI aggregates them all.
5. **Don't spawn speculative sub-tasks.** A todo exists because you committed to doing it. If you're unsure, don't add it yet.
6. **When you reorganize a plan mid-session** (e.g., replacing one big task with sub-phases), mark the parent `cancelled` with a note like "split into 4a-4f" — don't leave it `pending` alongside its children.

A session that ends with "23 pending, 0 completed" but a perfect summary looks broken from the outside. Treat the task list as a first-class artifact, not a scratchpad.

## Security Reminders

- `.gitignore` has broad patterns for `*.env`, `*.pem`, `credentials.json`, `token.json`
- Verify `git status` before every commit — no secrets in diff
- Repo is private; treat env files + keys as local-only regardless

## Build/Test Cheat Sheet

```bash
# dnd-app
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
