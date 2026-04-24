# Architecture — dnd-app + bmo

**Quick entrypoint:** [`../ARCHITECTURE.md`](../ARCHITECTURE.md) (boundary + commands) — **this** file is the full protocol reference.

How the two domains communicate.

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

**Transport:** HTTP JSON to `http://bmo.local:5000` (configurable via `BMO_PI_URL` env on VTT side).

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
| `/api/agent/:name/invoke` | POST | Directly invoke one of the 41 agents |

### 2. BMO → VTT (callback plane)

**Transport:** HTTP JSON back to VTT's sync receiver (VTT hosts an HTTP server in the Electron main process).

**Server:** `dnd-app/src/main/ipc/bmo-sync-handlers.ts` (starts at `SYNC_RECEIVER_PORT = process.env.BMO_SYNC_PORT || 5001`)

**Client:** `bmo/pi/agents/vtt_sync.py` (env: `VTT_SYNC_URL`, default `http://10.10.20.100:5001`)

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

### 3. VTT ↔ VTT (multiplayer)

**Transport:** WebRTC via `peerjs` (P2P, no central server required).

**Code:** `dnd-app/src/renderer/src/network/`

The DM machine hosts a peer session. Players join via invite code. State updates (token moves, dice rolls, chat, initiative, fog-of-war) propagate via peerjs data channel. BMO is *not* part of this — multiplayer is VTT-only.

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

BMO and dnd-app are tightly coupled:
- BMO narrates D&D sessions → dnd-app sends game state to BMO
- Discord players interact with the game → BMO relays their events to dnd-app
- Changes to IPC schema (in `dnd-app/src/shared/`) affect BMO's HTTP clients

Keeping both in one repo means atomic changes across the protocol boundary. Split would be premature given the current scale.

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
- [`../bmo/docs/AGENTS.md`](../bmo/docs/AGENTS.md) — 41 AI agents
- [`COMMANDS.md`](./COMMANDS.md) — common operational commands
