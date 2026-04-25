# bmo

BMO — Raspberry Pi 5 voice assistant + Discord bot + D&D Dungeon Master brain + smart home hub.

Named after the Adventure Time character. Lives in a 3D-printed BMO case on a Pi 5 with 16GB RAM, microphone array, HDMI touchscreen, speakers, OLED face display, case fan, LED strip, and Chromecast/TV control.

**Stack:** Python 3.11, Flask + SocketIO (gevent), Google APIs (calendar, vision), Anthropic Claude, Google Gemini, Groq Whisper STT, Fish Audio TTS, `discord.py`, `openwakeword`, `piper`, `vlc` (music), `picamera2`, `pytest`.

## Quick start

One-time setup on a fresh Pi:

```bash
# Clone repo somewhere (currently at /home/patrick/home-lab/)
cd bmo
bash setup-bmo.sh              # idempotent: installs apt deps, creates venv, writes systemd services
bash finalize-ssd.sh           # optional: moves BMO to SSD for speed/durability
```

Configure secrets:

```bash
cp .env.template pi/.env
nano pi/.env                    # fill in API keys (see comments in template)
```

Start services:

```bash
sudo systemctl start bmo bmo-fan bmo-kiosk bmo-dm-bot bmo-social-bot
sudo systemctl enable bmo bmo-fan bmo-kiosk bmo-dm-bot bmo-social-bot   # run at boot
```

## Directory layout

```
bmo/
├── pi/                              Pi runtime code (Python Flask app + services + agents)
│   ├── app.py                       Flask entry — starts on port 5000
│   ├── agent.py                     Main agent router entry
│   ├── cli.py                       REPL / CLI entry
│   │
│   ├── agents/                      41 specialized AI agents (base_agent, orchestrator, router, ...)
│   ├── services/                    26 service modules (calendar, music, weather, voice, ...)
│   ├── hardware/                    Pi-specific drivers (fan, LED, OLED, camera, audio devs)
│   ├── bots/                        Discord bots (named `bots/` NOT `discord/` — avoids shadowing discord.py)
│   ├── dev/                         Dev tooling (patches, benchmarks, file watchers)
│   ├── wake/                        Wake-word model + training clips
│   ├── web/                         Flask templates + static assets (CSS, JS, IDE)
│   ├── mcp_servers/                 MCP server for D&D data
│   ├── ide_app/                     Embedded web IDE (self-contained sub-app on port 5001)
│   ├── kiosk/                       Systemd service files + install-kiosk.sh
│   ├── scripts/                     Deploy scripts (cloudflare, tailscale, e2e test, health check, apply-patch)
│   ├── tests/                       Pytest suite (all test_*.py here — incl. files that were at pi/ root)
│   ├── data/                        Canonical data dir (content JSON + runtime state)
│   ├── config/                      Gitignored secrets (credentials.json, token.json)
│   ├── venv/                        Python venv (gitignored)
│   ├── requirements.txt             Runtime deps
│   ├── requirements-test.txt        Test deps
│   ├── pytest.ini
│   └── tailwind.config.js
│
├── docs/                            BMO docs
│   ├── ARCHITECTURE.md              Overall BMO architecture
│   ├── AGENTS.md                    41 AI agent roles + routing
│   ├── SERVICES.md                  Services + ports + endpoints
│   ├── TROUBLESHOOTING.md           Common failures + fixes
│   ├── DEPLOY.md                    Update from laptop via SSH
│   ├── SYSTEMD.md                   Service management
│   ├── NETWORK_ACCESS.md            LAN/Tailscale/Cloudflare tunnel setup
│   └── CLOUDFLARE_TUNNEL_SETUP.md
│
├── .env.template                    Copy to pi/.env and fill in
├── setup-bmo.sh                     One-time install + systemd bootstrap
├── finalize-ssd.sh                  Optional: migrate to SSD
└── README.md (this file)
```

## Running services

5 systemd services running as user `patrick`:

| Service | What | Port |
|---|---|---|
| `bmo` | Main Flask app + WebSocket server | 5000 |
| `bmo-fan` | Case fan controller (I2C) | — |
| `bmo-kiosk` | Chromium fullscreen on HDMI touchscreen | — |
| `bmo-dm-bot` | Discord DM (player-facing D&D session bot) | — |
| `bmo-social-bot` | Discord social bot (casual server) | — |

Plus optional sub-app:

| Service | What | Port |
|---|---|---|
| `bmo-ide` | Embedded web IDE for Pi development | 5001 |

Check status: `systemctl status bmo bmo-fan bmo-kiosk bmo-dm-bot bmo-social-bot`

## Talking to dnd-app (VTT)

BMO listens on `:5000` for HTTP calls from the dnd-app (VTT).
BMO pushes callbacks to VTT on VTT's sync receiver (`VTT_SYNC_URL` env, default `http://10.10.20.100:5001`).

See [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md).

## Agents (41 of them)

See [`docs/AGENTS.md`](./docs/AGENTS.md) for full list + roles.

Highlights:
- `orchestrator` — top-level director
- `router` — 3-tier intent classifier (prefix → keywords → LLM fallback)
- `dnd_dm` — D&D Dungeon Master brain
- `code_agent` — self-modification (edits BMO code, restarts services)
- `calendar_agent`, `weather_agent`, `music_agent`, `alert_agent`, ... — specialized

## Known limitations

Preexisting bugs tracked in [`docs/BMO-ISSUES-LOG.md`](../docs/BMO-ISSUES-LOG.md) (BMO bugs/debt) and design-gotchas in [`docs/BMO-SUGGESTIONS-LOG.md`](../docs/BMO-SUGGESTIONS-LOG.md). Check there before debugging "something's broken".

## Testing

```bash
cd pi
./venv/bin/python -m pytest                            # full suite (660+ tests)
./venv/bin/python -m pytest tests/test_calendar_service.py -v    # single file
./venv/bin/python -m pytest -m "not live"              # skip tests hitting real APIs
./venv/bin/python -m pytest -m "not hardware"          # skip Pi-hardware tests
```

`tests/conftest.py` mocks all Pi-specific modules (RPi.GPIO, smbus, picamera2, luma, etc.) so tests run on any OS.

## Development loop

```bash
cd pi
# make changes
./venv/bin/python -m pytest tests/  # validate
sudo systemctl restart bmo          # reload running service
journalctl -u bmo -f                # tail logs
```

For remote laptop-to-Pi editing, see [`docs/DEPLOY.md`](./docs/DEPLOY.md).
