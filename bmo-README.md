# bmo

BMO — Raspberry Pi 5 voice assistant + Discord bot + D&D Dungeon Master brain + smart-home hub + game-discovery registry for the [`dnd-app`](../dnd-app) VTT.

Named after the Adventure Time character. Lives in a 3D-printed BMO case on a Pi 5 with 16 GB RAM, microphone array, HDMI touchscreen, speakers, OLED face display, case fan, LED strip, and Chromecast / TV control.

**Stack:** Python 3.11 · Flask + SocketIO (gevent) · Google APIs (calendar, vision) · Anthropic Claude · Google Gemini · Groq Whisper STT · Fish Audio TTS · `discord.py` · `openwakeword` · `piper` · `vlc` (music) · `picamera2` · `pytest` · avahi-daemon.

## What it does

- **Voice assistant** — wake-word (openwakeword) → STT (Groq Whisper) → 41-agent router → TTS (Fish Audio / piper). Runs continuously on the kitchen counter.
- **D&D DM brain** — narration generator (Claude / Gemini), initiative + combat state sync, NPC memory, end-of-session recaps, scene preparation.
- **Discord bots** — DM bot relays player chat / dice rolls / commands to the VTT; social bot handles a casual server (music control, calendar lookups, weather).
- **Smart home hub** — Chromecast / TV control, BLE thermostat, room presence detection via camera, audio-output routing across multiple speakers.
- **Game-discovery registry** (Phase 29f) — `/api/games*` REST + SSE that the `dnd-app` clients use to find hosted games on the LAN. Advertised via avahi (`_bmo._tcp`) so Windows clients can discover the Pi without installing Bonjour Print Services.
- **Embedded web IDE** — a sub-app on port 5001 for editing BMO code from any browser on the LAN. Self-contained xterm + Monaco + chat.

## Quick start

One-time setup on a fresh Pi:

```bash
git clone https://github.com/EvilPatrick06/home-lab.git
cd home-lab/bmo
bash setup-bmo.sh              # idempotent: apt deps, venv, systemd services, avahi service file
bash finalize-ssd.sh           # optional: migrate root to SSD for durability + speed
```

Configure secrets:

```bash
cp .env.template pi/.env
nano pi/.env                    # API keys (see template comments)
```

Start services:

```bash
sudo systemctl enable --now bmo bmo-fan bmo-kiosk bmo-dm-bot bmo-social-bot
```

`setup-bmo.sh` also drops `/etc/avahi/services/bmo.service` advertising `_http._tcp` + `_bmo._tcp` + `_ssh._tcp` so the VTT can discover the Pi without manual URL config.

## Running services

5 systemd services live as user `patrick`:

| Service | What | Port |
|---|---|---|
| `bmo` | Main Flask + SocketIO + game registry + voice pipeline | 5000 |
| `bmo-fan` | Case-fan controller (I2C) | — |
| `bmo-kiosk` | Chromium fullscreen on HDMI touchscreen | — |
| `bmo-dm-bot` | Discord DM bot (player-facing D&D session relay) | — |
| `bmo-social-bot` | Discord social bot (casual server) | — |

Optional sub-app:

| Service | What | Port |
|---|---|---|
| `bmo-ide` | Embedded web IDE | 5001 |

Status: `systemctl status bmo bmo-fan bmo-kiosk bmo-dm-bot bmo-social-bot`.

## Game-discovery registry (Phase 29f)

The VTT's GameList browser pulls from two sources merged into one card grid:

- **LAN mDNS** — same-subnet hosts publish themselves via `_dndvtt._tcp` and the client browses for it.
- **Pi registry** — public games announce to `POST /api/games` on this Pi; the GameList streams updates via `GET /api/games/stream` (SSE).

The registry is intentionally LAN-public — auth on announce / heartbeat / patch / delete is via the optional `BMO_REGISTRY_API_KEY` header (orthogonal to `BMO_API_KEY`). All routes have a 30-per-minute rate limit, 4 KB body cap, and CORS headers for the Electron renderer's `file://` origin.

Endpoints:
- `GET  /api/games[?client_id=…]` — list with `banned_from_this_game` annotation
- `POST /api/games` — register / update an entry
- `PATCH /api/games/<code>` — update fields (typically player / spectator counts)
- `POST /api/games/<code>/heartbeat` — refresh the 60 s TTL
- `DELETE /api/games/<code>` — deregister
- `GET  /api/games/stream[?client_id=…]` — SSE: `games:full` snapshot then `games:added`/`updated`/`removed`

Spec: [`pi/services/game_registry.py`](./pi/services/game_registry.py).

## Talking to dnd-app

| Direction | Surface | Used for |
|---|---|---|
| VTT → BMO | HTTP at `:5000` | Narration sync, combat state push, Discord DM session control, AI memory sync, game registry |
| BMO → VTT | HTTP push to `VTT_SYNC_URL` (default `http://10.10.20.100:5001`) | Discord message events, initiative updates, player join/leave, dice rolls |

Full protocol: [`../docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

## Directory layout

```
bmo/
├── pi/                              Pi runtime (Python Flask + services + agents)
│   ├── app.py                       Flask entry — port 5000
│   ├── agent.py                     Main agent router entry
│   ├── cli.py                       REPL / CLI entry
│   ├── agents/                      41 specialized AI agents (orchestrator, router, dnd_dm, code_agent, ...)
│   ├── services/                    Service modules — calendar, music, weather, voice, game_registry, ...
│   ├── hardware/                    Pi drivers (fan, LED, OLED, camera, audio)
│   ├── bots/                        Discord bots — named `bots/` NOT `discord/` to avoid shadowing discord.py
│   ├── dev/                         Dev tooling (patches, benchmarks, file watchers)
│   ├── wake/                        Wake-word model + training clips
│   ├── web/                         Flask templates + static (CSS, JS, IDE)
│   ├── mcp_servers/                 MCP server for D&D data
│   ├── ide_app/                     Embedded web IDE
│   ├── kiosk/                       systemd files + install-kiosk.sh
│   ├── scripts/                     Deploy + diagnostics (cloudflare, tailscale, e2e test, health check, apply-patch)
│   ├── tests/                       Pytest suite (test_game_registry.py + ~30 other test files)
│   ├── data/                        Content JSON + runtime state
│   ├── config/                      Gitignored secrets (credentials.json, token.json)
│   ├── venv/                        Python venv (gitignored)
│   ├── requirements.txt / requirements-test.txt
│   ├── pytest.ini
│   └── tailwind.config.js
│
├── docs/
│   ├── ARCHITECTURE.md              Overall BMO architecture
│   ├── AGENTS.md                    41 AI-agent roles + routing
│   ├── SERVICES.md                  Services + ports + endpoints
│   ├── TROUBLESHOOTING.md           Common failures + fixes
│   ├── DEPLOY.md                    Update from laptop via SSH
│   ├── SYSTEMD.md                   Service management
│   ├── NETWORK_ACCESS.md            LAN / Tailscale / Cloudflare tunnel setup
│   └── CLOUDFLARE_TUNNEL_SETUP.md
│
├── .env.template                    Copy to pi/.env and fill
├── setup-bmo.sh                     One-time install + systemd + avahi bootstrap
├── finalize-ssd.sh                  Optional: migrate to SSD
└── README.md
```

## Agents

41 specialized AI agents — see [`docs/AGENTS.md`](./docs/AGENTS.md) for the full list. Highlights:

- `orchestrator` — top-level director
- `router` — 3-tier intent classifier (prefix → keywords → LLM fallback)
- `dnd_dm` — D&D Dungeon Master brain
- `code_agent` — self-modification (edits BMO code, restarts services)
- `calendar_agent`, `weather_agent`, `music_agent`, `alert_agent`, … — specialized helpers

## Testing

```bash
cd pi
./venv/bin/python -m pytest                                # full suite (~772 tests, ~25 s)
./venv/bin/python -m pytest tests/test_game_registry.py    # single file
./venv/bin/python -m pytest -m "not live"                  # skip tests hitting real APIs
./venv/bin/python -m pytest -m "not hardware"              # skip Pi-hardware tests
```

`tests/conftest.py` mocks all Pi-specific modules (`RPi.GPIO`, `smbus`, `picamera2`, `luma`, …) so tests run on any OS — useful when developing from a laptop.

## Development loop

```bash
cd pi
# edit code locally (or via the embedded IDE on :5001)
./venv/bin/python -m pytest tests/                         # validate
sudo systemctl restart bmo                                 # reload running service
journalctl -u bmo -f                                       # tail logs
```

For remote laptop-to-Pi editing + push: [`docs/DEPLOY.md`](./docs/DEPLOY.md).

## Known limitations

Active bugs / debt → [`../docs/BMO-ISSUES-LOG.md`](../docs/BMO-ISSUES-LOG.md). Design-gotchas + future-ideas → [`../docs/BMO-SUGGESTIONS-LOG.md`](../docs/BMO-SUGGESTIONS-LOG.md). Grep both before debugging or proposing.

## License

ISC — inherited from the parent repo.
