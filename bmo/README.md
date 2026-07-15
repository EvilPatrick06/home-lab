# bmo

BMO — Raspberry Pi 5 voice assistant + Discord bot + D&D Dungeon Master brain + smart-home hub + game-discovery registry for the [`dnd-app`](../dnd-app) VTT.

Named after the Adventure Time character. Lives in a 3D-printed BMO case on a Pi 5 with 8 GB RAM, microphone array, HDMI touchscreen, speakers, OLED face display, case fan, LED strip, and Chromecast / TV control.

**Stack:** Python 3.11 · Flask + SocketIO (gevent) · Google APIs (calendar, vision) · Anthropic Claude · Google Gemini · Groq Whisper STT · Fish Audio TTS · `discord.py` · `openwakeword` · `piper` · `vlc` (music) · `picamera2` · `pytest` · avahi-daemon.

> **Heads-up:** BMO is hardware-specific. The Pi, mic array, OLED face, speakers, fan, and LED strip are part of how it works — there's no "install BMO on your laptop" path. If you want to build your own, the [`Hardware`](#hardware) section below lists every part. If you just want to talk to an existing BMO that someone else set up, jump to [`Using BMO`](#using-bmo).

## What it does

- **Voice assistant** — wake-word (openwakeword) → STT (Groq Whisper) → 5-agent router → TTS (Fish Audio / piper). Runs continuously on the kitchen counter.
- **D&D DM brain** — narration generator (Claude / Gemini), initiative + combat state sync, NPC memory, end-of-session recaps, scene preparation.
- **Discord bots** — DM bot relays player chat / dice rolls / commands to the VTT; social bot handles a casual server (music control, calendar lookups, weather).
- **Smart home hub** — Chromecast / TV control, BLE thermostat, room presence detection via camera, audio-output routing across multiple speakers.
- **Game-discovery registry** (Phase 29f) — `/api/games*` REST + SSE that the `dnd-app` clients use to find hosted games on the LAN. Advertised via avahi (`_bmo._tcp`) so Windows clients can discover the Pi without installing Bonjour Print Services.
- **Embedded web IDE** — the production IDE is the dashboard's **IDE** tab → the standalone **`/ide`** page on **:5000** (self-contained xterm + Monaco + chat). A separate experimental `ide_app` rebuild runs on **:5001** but is **bound to loopback (127.0.0.1) only — not LAN-reachable** — and is a stalled/diverged second IDE pending cutover/retirement (see `docs/DESIGN-CONSTRAINTS.md` 47-56).

## Using BMO

For end users on the same household / LAN as a running BMO.

**Voice — wake word:**
- Say **"Hey BMO"** to wake him. The LED strip lights up while he's listening. Then ask anything — weather, calendar, music, D&D narration, a random trivia question.
- Examples: *"Hey BMO, what's the weather?"* · *"play some lo-fi"* · *"start a D&D session"* · *"what's on my calendar tomorrow?"* · *"turn on the kitchen lights"* · *"who is Princess Bubblegum?"*

**Touchscreen kiosk:**
- The HDMI display shows BMO's face. Tap it for the main menu — music, alarms, calendar, settings.
- The face animates when BMO talks.

**Discord:**
- BMO has two Discord bots. The **social bot** runs on a casual server (`!play`, `!skip`, `!queue`, `!weather`, `!calendar`).
- The **DM bot** sits in a D&D server and relays messages between Discord players and the VTT — Discord players can `/roll d20` and the roll lands in the VTT chat panel; VTT initiative pushes appear as Discord embeds.

**With the VTT ([`dnd-app`](../dnd-app)):**
- Same Wi-Fi → the VTT auto-discovers BMO on first launch.
- Hosted public games show up in the VTT's game-list browser via the Pi's game registry.
- The Pi narrates initiative + scene descriptions in the running session if you've turned on TTS.

**Web IDE (developers / Pi owner only):**
- The production editor is the dashboard **IDE** tab (`/ide` on **:5000**) for editing BMO's own source over LAN. Username/password is in `pi/.env`. (The `ide_app` on **:5001** is experimental and **loopback-only** — not reachable from other LAN machines; see `docs/DESIGN-CONSTRAINTS.md` 47-56.)

---

## Hardware

If you want to build your own:

| Part | Notes |
|---|---|
| Raspberry Pi 5 (16 GB) | 8 GB works but tight under load |
| 128 GB+ NVMe SSD + PCIe HAT | optional; durability + speed |
| USB mic array | ReSpeaker 2-Mic or 4-Mic Array HAT |
| HDMI touchscreen (~5") | for the kiosk face |
| Speakers | 3.5 mm or USB DAC |
| OLED display (SH1106 I2C) | for the BMO face |
| Case fan (PWM, I2C) | Pi 5 throttles without one |
| WS2812 LED strip | wake / status indicator |
| 3D-printed BMO case | STL files not in this repo |

Total ~$200–250 if you scavenge most of it.

## Thermal management

The Pi 5 throttles at 80 °C (soft) and 85 °C (hard). BMO uses two independent
cooling loops:

- **Official GPIO active cooler** — kernel-driven via `dtparam=fan_tempN_*` in
  `/boot/firmware/config.txt`. Four rungs at 60 / 67 / 75 / 80 °C, written by
  `setup-bmo.sh`. Top rung is at PWM 255 (full-speed) at 80 °C.
- **FNK0100K case fans** — userspace via `bmo-fan.service` →
  `pi/hardware/fan_control.py`. 7-rung curve (50 → 80 °C) with linear
  interpolation between rungs and EMA-smoothed input temperature so idle
  doesn't oscillate. PWM frequency 100 kHz (inaudible).

`pi/scripts/health-check.sh` raises a warning at > 75 °C and a critical alert
at > 80 °C, and reads `vcgencmd get_throttled` so sticky under-voltage /
past-throttle bits are surfaced even after the Pi cools off.

---

## Quick start (Pi owner)

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
| `bmo-ide` | Embedded web IDE — **experimental, loopback-only** (the production IDE is `/ide` on the `bmo` service, :5000) | 5001 |

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
│   ├── agents/                      5 specialized AI agents (orchestrator, router, dnd_dm, code_agent, ...)
│   ├── services/                    Service modules — calendar, music, weather, voice, game_registry, ...
│   ├── hardware/                    Pi drivers (fan, LED, OLED, camera, audio)
│   ├── bots/                        Discord bots — named `bots/` NOT `discord/` to avoid shadowing discord.py
│   ├── dev/                         Dev tooling (patches, benchmarks, file watchers)
│   ├── wake/                        Wake-word model + training clips
│   ├── web/                         Flask templates + static (CSS, JS, IDE)
│   ├── mcp_servers/                 MCP server for D&D data
│   ├── ide_app/                     Embedded web IDE
│   ├── systemd/                     systemd units (.service/.timer) + install-kiosk.sh
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
│   ├── README.md                   Docs index (start here)
│   ├── ARCHITECTURE.md              Overall BMO architecture
│   ├── AGENTS.md                    AI-agent catalog (28 routable) + routing
│   ├── SERVICES.md                  Services + ports + endpoints
│   ├── SYSTEMD.md                   Service management
│   ├── DESIGN-CONSTRAINTS.md        Intentional gotchas (read before refactors)
│   ├── TROUBLESHOOTING.md           Common failures + fixes
│   ├── DEPLOY.md                    Update from laptop via SSH
│   ├── NETWORK_ACCESS.md            LAN / Tailscale / Cloudflare tunnel setup
│   └── CLOUDFLARE_TUNNEL_SETUP.md
│
├── .env.template                    Copy to pi/.env and fill
├── setup-bmo.sh                     One-time install + systemd + avahi bootstrap
├── finalize-ssd.sh                  Optional: migrate to SSD
└── README.md
```

## Agents

A set of specialized AI agents (28 routable) — see the [docs index](./docs/README.md) and [`docs/AGENTS.md`](./docs/AGENTS.md) for the full list. Highlights:

- `orchestrator` — top-level director
- `router` — 3-tier intent classifier (prefix → keywords → LLM fallback)
- `dnd_dm` — D&D Dungeon Master brain
- `code_agent` — self-modification (edits BMO code, restarts services)
- `calendar_agent`, `weather_agent`, `music_agent`, `alert_agent`, … — specialized helpers

## Testing

```bash
cd pi
./venv/bin/python -m pytest                                # full suite (92 test files)
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

Active bugs / debt → [`../docs/logs/BMO-ISSUES-LOG.md`](../docs/logs/BMO-ISSUES-LOG.md). Design-gotchas + future-ideas → [`../docs/logs/BMO-SUGGESTIONS-LOG.md`](../docs/logs/BMO-SUGGESTIONS-LOG.md). Grep both before debugging or proposing.

## License

ISC. See [`LICENSE`](./LICENSE).
