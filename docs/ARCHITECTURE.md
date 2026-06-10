# Architecture — dnd-app + bmo + dungeon-scholar

How the three projects relate, plus quarantine/run conventions.

## Project boundaries

| Project | Path | Runtime | Talks to |
|---|---|---|---|
| VTT (D&D app) | `dnd-app/` | Electron + React 19 (DM/player machines) | BMO + other VTTs |
| Voice assistant + game registry | `bmo/pi/` | Python Flask + gevent (Pi 24/7) | VTT + cloud APIs |
| Study app | `dungeon-scholar/` | React + Vite (GitHub Pages) | Optional Supabase |

**`dnd-app` ↔ `bmo` coupling:** HTTP only — VTT → BMO `:5000`, BMO callbacks → VTT `:5001`. **No** TypeScript `import` of `bmo/`, no Python `import` of `dnd-app/` sources. Shared contract = HTTP + manually mirrored shapes (see `dnd-app/src/shared/`, BMO clients).

**`dungeon-scholar`:** fully independent — no contact with BMO or the VTT. Lives in the same repo only because it shares the release pipeline conventions and AI-agent rules.

**Configs:** Keep at domain roots (`dnd-app/*`, `bmo/*`). Full tree map: [`../.cursorrules`](../.cursorrules) (Repository Structure).

**Quarantine:** Dead/uncertain code → `_archive/<preserved-relative-path>/` (tracked, audit trail). For non-source bloat (caches, old logs, broken venvs), just delete it — it's regenerable, and the commit/summary should note what was removed and why.

## Run / verify

```bash
cd dnd-app && npm test && npm run lint && npx tsc --noEmit
cd bmo/pi && ./venv/bin/python -m pytest
```

## Big picture

```
  ┌─────────────────────────┐                   ┌────────────────────────┐
  │    dnd-app (VTT)              │                   │      BMO Pi            │
  │    dnd-app/             │                   │      bmo/pi/           │
  │    Electron + React     │                   │      Python Flask      │
  │    (Player/DM laptop)   │                   │      (Raspberry Pi 5)  │
  │                         │                   │                        │
  │                         │   HTTP :5000      │   ┌──────────────┐    │
  │   main/bmo-bridge.ts ───┼──────────────────►│──►│ app.py       │    │
  │                         │   (control plane) │   │ + agents/    │    │
  │                         │                   │   │ + services/  │    │
  │   main/bmo-sync-        │                   │   └──────┬───────┘    │
  │   handlers.ts ◄─────────┼──HTTP :5001───────┤          │            │
  │   (HTTP server on VTT)  │   (callbacks)     │          ▼            │
  │                         │                   │   ┌─────────────┐    │
  │   renderer:             │                   │   │ Discord bots │    │
  │   ├── components/       │                   │   │ (dm + social)│    │
  │   ├── services/         │                   │   └──────────────┘    │
  │   ├── stores/           │                   │                        │
  │   └── network/          │◄──────peerjs─────►│  (multiplayer VTT-VTT) │
  └─────────────────────────┘                   └────────────────────────┘
```

## Communication protocols

### 1. VTT → BMO (control plane)

**Transport:** HTTP JSON to the resolved BMO base URL — by default `https://bmo.mybmoai.work` (the Cloudflare tunnel), configurable via `BMO_PI_URL` env / settings / mDNS discovery (see precedence below).

**Client:** `dnd-app/src/main/bmo-bridge.ts`

**Endpoints BMO exposes (examples — not exhaustive):**

| Path | Method | Purpose |
|---|---|---|
| `/health` | GET | Liveness check (returns `{"status":"ok"}`) |
| `/api/health/full` | GET | Full health (Pi stats + service statuses) |
| `/api/music/state` | GET | Current music playback state |
| `/api/music/play`, `/pause`, `/skip`, `/search` | POST | Music control |
| `/api/calendar/events` | GET | Upcoming calendar events |
| `/api/timers` | GET/POST | List/create timers |
| `/api/discord/start-session` | POST | Start D&D Discord session for campaign |
| `/api/discord/end-session` | POST | End Discord session |
| `/api/narrate` | POST | Speak text via BMO's voice + send to Discord channel |
| `/api/chat` | POST (SSE) | Stream chat with BMO's agent router |
| `/api/agent/:name/invoke` | POST | Directly invoke one of the 28 agents |
| `/api/games` | GET / POST | Game-discovery registry — list (GET) + announce (POST) [Phase 29f] |
| `/api/games/<code>` | PATCH / DELETE | Update player/spectator counts; deregister on host stop |
| `/api/games/<code>/heartbeat` | POST | Refresh the 60 s entry TTL (host pings every 30 s) |
| `/api/games/stream[?client_id=…]` | GET (SSE) | Live registry events — `games:full` snapshot then `games:added`/`updated`/`removed` |

**Resolved BMO URL precedence (VTT side, see `dnd-app/src/main/bmo-config.ts`):**

```
settings.bmoPiBaseUrl  >  discoveredBmoUrl (via _bmo._tcp mDNS)  >  $BMO_PI_URL  >  BMO_PI_URL_DEFAULT
```

The final fallback is `BMO_PI_URL_DEFAULT` in `bmo-config.ts`, currently `https://bmo.mybmoai.work` (the Cloudflare tunnel) — **not** `http://bmo.local:5000`. `bmo.local:5000` is only the mDNS *direct-probe target*: Pi advertises `_bmo._tcp` on port 5000 via `/etc/avahi/services/bmo.service`; the VTT main process (`src/main/lan-discovery.ts`) browses it via `bonjour-service` and, 3 s after a no-hit browse, fires a direct HTTP probe at `bmo.local:5000/health` (helps Windows machines where the firewall blocks UDP 5353). A successful discovery/probe sets `discoveredBmoUrl`; otherwise requests go to the tunnel default.

Discovery resolves to a literal **IPv4** (from the mDNS `addresses`, else the responder's `referer.address`), NOT the `bmo.local` hostname — Windows can't resolve `.local` without Bonjour, which previously made Cloud Backup + the signaling probe report "could not reach the Pi" on LAN even though the Pi was up. Boot discovery runs at app start (not just on a game scan), and is what feeds `discoveredBmoUrl`.

**Off-LAN access (zero per-user setup).** On-LAN uses the discovered IP directly. Off-LAN goes through the `bmo.mybmoai.work` Cloudflare Tunnel, which is gated by a Cloudflare Access app:
- `/api/library/*` (read-only 5e content; renderer fetches it directly, BMO returns `Access-Control-Allow-Origin: *`) → a **public Access Bypass** policy.
- `/api/games*` (multiplayer registry/relay; P2P signaling `:9000` is NOT tunnel-proxied, so off-LAN multiplayer uses the relay) → already public-bypassed.
- `/api/rclone/*` (cloud backup, sensitive) → reached with a Cloudflare Access **service token** baked into the MAIN bundle at build (`electron.vite.config` `main.define` ← `CF_ACCESS_CLIENT_ID`/`CF_ACCESS_CLIENT_SECRET` GitHub Actions secrets), sent only from main-process fetches (`getBmoAccessHeaders()` in cloud-sync + bmo-bridge) — **never** the renderer. Empty token in unconfigured builds → no headers (on-LAN unaffected).

The renderer's `connect-src` allows the `http:`/`ws:` scheme-sources so renderer LAN fetches (`/api/games` to the discovered IP) aren't CSP-blocked — the CSP is baked pre-discovery and can't wildcard arbitrary LAN IPs. Renderer runs only first-party bundled code (script-src locked, sandbox + contextIsolation), so this is a bounded relaxation.

### 2. BMO → VTT (callback plane)

**Transport:** HTTP JSON back to VTT's sync receiver (VTT hosts an HTTP server in the Electron main process).

**Server:** `dnd-app/src/main/ipc/bmo-sync-handlers.ts` (starts at `SYNC_RECEIVER_PORT = process.env.BMO_SYNC_PORT || 5001`)

**Client:** `bmo/pi/agents/vtt_sync.py` (env: `VTT_SYNC_URL`, default `http://vtt.local:5001`)

**Event types BMO pushes to VTT:**

```typescript
interface SyncEvent {
  type: 'discord_message' | 'initiative_sync' | 'state_request'
      | 'player_join' | 'player_leave' | 'discord_roll'
  payload: Record<string, unknown>
  timestamp: number
}
```

Examples:
- Player sends message in Discord → BMO forwards to VTT chat panel
- Player rolls dice via Discord slash command → BMO relays roll result to VTT
- DM starts combat on VTT → pushes initiative order to BMO → BMO posts it to Discord

> **Status (2026-06-10):** parts of this plane are scaffolded but not end-to-end wired —
> the renderer never exposes/consumes `BMO_SYNC_EVENT` or the initiative/state push
> channels, and the Pi never registers `register_sync_routes(app)`. Narration
> (`/api/discord/dm/narrate`) IS live. Full finding: `dnd-app/docs/AI-DM-AUDIT.md` → Discord.

### 3. VTT ↔ VTT (multiplayer)

**Transport:** WebRTC via `peerjs` (P2P; signalling either through the public peerjs cloud or a self-hosted server).

**Code:** `dnd-app/src/renderer/src/network/`

The DM machine hosts a peer session. Players join via:
- **GameList browser** — same-subnet hosts advertise themselves via `_dndvtt._tcp` mDNS; public hosts also POST to the Pi's `/api/games` registry. The renderer merges both sources into one card grid (deduped by `peer_id`). Phase 29g.
- **Invite code** — fallback path; manually-entered codes still work for private games.

State updates (token moves, dice rolls, chat, initiative, fog) propagate via the WebRTC data channel. Phase 29 perf passes batch same-microtask broadcasts into one `batch` envelope, throttle `dm:token-move` to ~15 Hz, ship initiative/condition deltas instead of full arrays, and encode binary frames as msgpack ± gzip when both peers advertise `clientCapabilities.msgpack`. Pre-29j peers stay on JSON strings.

**Reconnect resync** — the host keeps a 500-entry circular buffer per `clientId`. A returning client sends `player:join` with `lastSequence`; the host replies with `game:state-resync` (delta) or falls back to `game:state-full` if outside the window.

**ICE policy** — `iceTransportPolicy: 'all'` by default (`peer-manager.ts:forceRelay = false`). Cloud mode flips relay on; LAN mode never needs it.

BMO is the discovery channel (via `/api/games`) but **not** in the data path — multiplayer state is purely VTT-to-VTT WebRTC.

### 4. BMO ↔ cloud APIs

BMO's own outbound calls (not involving VTT):

| Service | Used for |
|---|---|
| Anthropic Claude | D&D DM, code agent, long-form responses |
| Google Gemini | Fast routing, general chat |
| Groq Whisper | Speech-to-text |
| Fish Audio | Text-to-speech (BMO voice) |
| Piper (local) | TTS fallback |
| Google Calendar | Reminder retrieval |
| Google Maps / Geocoding | Location resolution |
| Discord API | Bot interactions |
| Cloudflare tunnel | Remote access to BMO |
| Tailscale | Private mesh networking |

Configured via `bmo/pi/.env` (see `bmo/.env.template`).

## Data ownership

| Data | Owner | Location |
|---|---|---|
| D&D 2024 content (spells, monsters, equipment) | dnd-app | `dnd-app/src/renderer/public/data/5e/*.json` |
| Character sheets | dnd-app | `dnd-app/src/main/storage/character-storage.ts` → `%APPDATA%/dnd-vtt/characters/` |
| Campaign state | dnd-app | `dnd-app/src/main/storage/campaign-storage.ts` → `%APPDATA%/dnd-vtt/campaigns/` |
| Game session state | dnd-app | hosted in DM's RAM, synced via peerjs |
| BMO runtime state | bmo | `bmo/pi/data/*.json, *.db` |
| Music history / play counts | bmo | `bmo/pi/data/{music_history,play_counts}.json` |
| Chat history | bmo | `bmo/pi/data/recent_chat.json` + per-agent memory files |
| Google Calendar tokens | bmo | `bmo/pi/config/token.json` (gitignored) |
| BMO wake-word model | bmo | `bmo/pi/wake/hey_bmo.onnx` |
| IDE job state | bmo | `bmo/pi/data/ide_jobs.json` + `ide_state.json` |
| LFS PDFs (rulebooks) | both | `5.5e References/*.pdf` (LFS, gitignored locally) |

Full map: [`DATA-FLOW.md`](./DATA-FLOW.md)

## Deployment topology

Current (single Pi + laptops):

```
┌─────────────────────────────┐            ┌──────────────────────────┐
│  DM laptop (Windows)        │   WiFi     │  Raspberry Pi 5          │
│  - dnd-app installed        │◄──────────►│  - bmo/pi/ runs 24/7     │
│  - Hosts multiplayer session│            │  - Discord bots connect  │
└─────────────────────────────┘            │    outbound to Discord   │
                                            │  - Cloudflare tunnel     │
┌─────────────────────────────┐   WiFi      │    for remote access     │
│  Player laptop(s) (Windows/ │◄────────────┤  - Tailscale for mesh    │
│  Mac)                       │             │    networking            │
│  - dnd-app installed        │             └──────────────────────────┘
│  - Joins via invite         │
└─────────────────────────────┘
```

## Why monorepo?

`dnd-app` and `bmo` are tightly coupled:
- BMO narrates D&D sessions → dnd-app sends game state to BMO
- Discord players interact with the game → BMO relays their events to dnd-app
- Changes to IPC schema (in `dnd-app/src/shared/`) affect BMO's HTTP clients
- The Pi-side game-discovery registry (`/api/games*`) and the mDNS `_bmo._tcp` service file are part of the same atomic change as the VTT-side `lan-discovery.ts` browser

Keeping both in one repo means atomic changes across the protocol boundary.

`dungeon-scholar` rides along because it shares: the release workflow (Pages deploy), the AI-agent rules, the cut.mjs / commit conventions, and the LFS setup. Splitting it out would be valid; not splitting it costs nothing.

## Boundary enforcement

**Do NOT:**
- `import` Python from TS or vice versa
- Share filesystem paths (each writes only under its own domain)
- Share process memory (separate runtimes)

**DO:**
- Define shared types in `dnd-app/src/shared/` and duplicate structurally on BMO side (manual)
- Version HTTP endpoints (future: add `/api/v1/...` prefix if breaking changes coming)
- Document every new endpoint in this file + [`SERVICES.md`](../bmo/docs/SERVICES.md)

## Related docs

- [`DATA-FLOW.md`](./DATA-FLOW.md) — every data kind and its storage
- [`../dnd-app/docs/IPC-SURFACE.md`](../dnd-app/docs/IPC-SURFACE.md) — Electron IPC channels
- [`../bmo/docs/SERVICES.md`](../bmo/docs/SERVICES.md) — BMO services + HTTP endpoints
- [`../bmo/docs/AGENTS.md`](../bmo/docs/AGENTS.md) — 28 AI agents
- [`COMMANDS.md`](./COMMANDS.md) — common operational commands
