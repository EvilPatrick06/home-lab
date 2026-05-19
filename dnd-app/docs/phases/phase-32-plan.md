# Phase 32 — Cloud Host (Pi-as-host)

> Pi implements `GameAuthority` (Phase 17) speaking the shard protocol (Phase 18). Game creators get a "Local (P2P)" vs "Cloud (Pi)" toggle. Cloud mode = game persists across all client disconnects, accessible from anywhere, hosted by infrastructure instead of a player's machine.
>
> Renumbered from "Phase D" in conversation planning. Depends on **Phase 17** (Player-as-Host rewrite) and **Phase 18** (Live-state sync overhaul) landing first.

---

## Context

By the time Phase 19 starts, the prerequisites are in place:

- **Phase 16** has made all permissions data-driven (no hardcoded role checks).
- **Phase 17** has consolidated host-side logic into a single `GameAuthority` module behind a `TransportAdapter` interface. "The host" is no longer tied to whoever started the game.
- **Phase 18** has unified all state sync into one shard protocol. Adding cloud sync means implementing ONE protocol on the Pi, not 30 feature-specific message handlers.

This phase plugs the Pi into those abstractions:

- **Pi-side `GameAuthority` implementation** in Python (in the existing `bmo/pi/services/` directory pattern).
- **WebSocket transport** as a new `TransportAdapter` implementation. Authority logic on both sides is identical — just the transport changes.
- **Per-campaign cloud-host toggle.** Local P2P stays as the default; cloud is opt-in. No forced migration.

What you and your friend get out of it:

- **Game survives disconnect.** Pi keeps running. DM can step away, close laptop, change devices. State persists.
- **Cross-network is the default.** Pi has a stable address (Cloudflare Tunnel already in place). No NAT-traversal pain for new players.
- **Spectator scaling.** Pi can fan out broadcasts to N spectators more efficiently than a single client machine.
- **Event log / audit / replay.** Pi logs every shard delta for the whole campaign. Easy to debug "what happened on turn 47?"

What it costs:

- **Latency.** Pi adds ~20–50ms RTT vs LAN-direct P2P. Fine for D&D pacing; noticeable for fast-twitch (dice animations, rapid drawing).
- **Pi is a single point of failure.** One Pi reboot takes down all cloud-hosted games. Local P2P stays as the alternative.
- **Voice doesn't move.** When voice chat lands (sometime after the Phase 17r mic settings get a consumer), it stays peer-to-peer or via SFU — not through Pi.

---

## Sub-phase summary

| # | Sub-phase | Scope |
|---|-----------|-------|
| 19a | Pi-side `GameAuthority` service skeleton | New Python service in `bmo/pi/services/game_server.py`. Same external contract as the TS authority |
| 19b | WebSocket transport — Pi side | Flask-SocketIO endpoint (matches existing Pi service pattern); campaign room management |
| 19c | WebSocket transport — client side | New `WebSocketTransport` adapter slotting into Phase 17's `TransportAdapter` interface |
| 19d | Shard protocol port — Pi side | Same shard message types from Phase 18; Pi validates against Phase 16 permissions |
| 19e | Pi-side persistence | Event sourcing — per-campaign delta log + periodic snapshots; replay on restart |
| 19f | Authentication | Per-campaign session tokens; JWT validation on every WS frame; Cloudflare Tunnel for WAN |
| 19g | Game-creation UI: Local vs Cloud toggle | New game flow picks the host destination; default Local for backwards compat |
| 19h | Migrate-running-game flow | "Move this game to cloud" button leverages Phase 17 host-transfer protocol |
| 19i | Pi admin surface in BMO | Hosted Games tab — list rooms, view event logs, archive / kick |
| 19j | Auto-resume / catch-up | Client reconnect → Phase 18's replay protocol handles missed deltas |
| 19k | Voice transport boundary | Document: voice stays P2P even when game state is cloud-hosted |
| 19l | Stability + monitoring | Pi-side metrics (active rooms, peer counts, delta rates, errors); auto-archive of idle rooms |

12 sub-phases. Each ends with the 4-gate suite (lint + tsc-web + tsc-node + vitest) AND the BMO pytest suite. One release: **v6.0.0** (major bump — new opt-in deployment mode).

---

## Sub-phase details

### 19a — Pi-side `GameAuthority` service skeleton

**Files (new — `bmo/pi/services/`):**
- `game_server.py` — main service. Patterns after the existing Pi services (Flask gevent, threaded coroutines per active game). Exposes:
  - `GET /api/games/<campaign_id>` — room status (active peers, last activity).
  - `POST /api/games/<campaign_id>/start` — start hosting a campaign (provisioned with initial snapshot).
  - `POST /api/games/<campaign_id>/stop` — graceful shutdown (final snapshot, disconnect peers).
  - `GET /api/games/<campaign_id>/log` — event log paged by sequence.
- `game_authority.py` — Python class with the same external contract as the TypeScript `GameAuthority` from Phase 17:
  - `apply_action(actor, action) → { accepted, broadcast }`
  - `get_snapshot(for_peer) → state`
  - `add_peer(peer_info)`, `remove_peer(peer_id)`
  - `validate(actor, action) → bool` (Python port of `hasPermission`)
- `room.py` — per-campaign room state (in-memory authority + connected peer list + log handle).

**Files (modify):**
- `bmo/pi/app.py` — register `game_server` blueprint, add CORS for the WS upgrade path.
- `bmo/setup-bmo.sh` — ensure the systemd unit includes the game-server. New dependency: `flask-socketio` (or `gevent-websocket` — pick at this phase).
- `bmo/docs/SERVICES.md` — document the new service.

**Acceptance:**
- Service starts on Pi boot.
- `curl http://pi-host/api/games/foo` returns 404 (no rooms yet).
- `pytest bmo/pi/tests/test_game_server.py` covers room create / stop / status.

---

### 19b — WebSocket transport — Pi side

**Files (modify — `bmo/pi/services/game_server.py`):**
- Flask-SocketIO endpoint at `/ws/games/<campaign_id>`. Connection handshake includes the session token (from 19f).
- Per-campaign Socket.IO room mapping. Inbound message → `GameAuthority.apply_action`. Authority result's `broadcast` payload → `socketio.emit(...)` to room.
- Peer join: `socketio.join_room(campaign_id)` + `authority.add_peer(peer_info)` + send initial snapshot.
- Peer leave: graceful disconnect handler + `authority.remove_peer(peer_id)`.

**Acceptance:**
- `wscat -c ws://pi-host/ws/games/<id>` connects (auth permitting).
- Multiple peers in the same campaign get each other's messages.
- Peer disconnect → room state cleans up correctly.

---

### 19c — WebSocket transport — client side

**Files (new):**
- `dnd-app/src/renderer/src/network/transport/websocket-transport.ts` — implements the `TransportAdapter` interface from Phase 17. Same `send / broadcast / onMessage / onPeerJoin / onPeerLeave / disconnect / close` surface. Uses native `WebSocket` API (Electron renderer can use it directly) or `socket.io-client` if we go the Flask-SocketIO route.

**Files (modify):**
- `network-store/index.ts` — `hostGame` action gains a parameter `{ mode: 'local' | 'cloud' }`. Picks `P2PTransport` or `WebSocketTransport` accordingly.

**Acceptance:**
- Client connects to Pi-hosted game via WebSocket.
- Authority logic on Pi is invoked correctly.
- Same gameplay works as in local P2P mode.

---

### 19d — Shard protocol port — Pi side

**Files (new — `bmo/pi/services/`):**
- `shards.py` — Python port of the shard registry from Phase 18. Each shard is a Python class with:
  - `source` — extracts current value from authority state.
  - `diff` — structural diff (Python port of Phase 18b's diff engine — simpler in Python because dict-based).
  - `apply_delta` — mutates authority state.
  - `permission_filter` — Python port; reads Phase 16 permissions from campaign data.
- One shard per file: `shards/chat.py`, `shards/map_tokens.py`, etc., mirroring the TS structure.

**Files (modify):**
- `game_authority.py` — runs the shard registry. Subscribes to state mutations, diffs, emits `state:delta` over WebSocket per-peer.

**Acceptance:**
- All Phase 18 shards have Python implementations.
- A round-trip test: client sends chat → Pi receives → shard system → broadcasts back → client applies → message appears for all peers.
- Permission filtering works identically to the TS authority (hidden tokens stay hidden for non-DM peers).

---

### 19e — Pi-side persistence

**Files (new):**
- `bmo/pi/data/games/<campaign_id>/` — per-campaign data directory.
- Inside each: `snapshot.json` (latest snapshot) + `events.log` (append-only JSONL of every shard delta with sequence number).
- `bmo/pi/services/persistence.py` — write-behind snapshotting (every N=100 events or every 60 seconds, whichever first). Tail-event reads for resync.

**Files (modify):**
- `game_authority.py` — on accept, write delta to `events.log`. Snapshot periodically. On restart, replay events from last snapshot to current.

**Acceptance:**
- Game runs for an hour. Pi reboots. Game resumes from last snapshot + tail events. No state lost beyond the last few seconds (the unwritten ones).
- `events.log` can be inspected with `cat` for debugging.

---

### 19f — Authentication

**Files (new):**
- `bmo/pi/services/auth.py` — issues per-campaign session tokens (JWT signed with a Pi-side secret). Validated on every WS frame.
- Token issuance: client calls `POST /api/games/<id>/join` with displayName + invite code → Pi validates invite code → returns JWT.

**Files (modify):**
- `game_server.py` WS handshake — require valid JWT.
- `bmo/setup-bmo.sh` — generate the signing secret on first install if missing.
- Cloudflare Tunnel config (`/etc/cloudflared/config.yml`) — ensure `/ws/games/*` is reachable (already covered by the existing wildcard rule for `bmo.mybmoai.work`).

**Acceptance:**
- Token issued only after valid invite-code check.
- WS frame with missing/expired/invalid token is rejected.
- Cross-WAN game works (your friend on a different network connects via Cloudflare Tunnel without VPN).

---

### 19g — Game-creation UI: Local vs Cloud toggle

**Files (modify):**
- `src/renderer/src/components/campaign/CampaignWizard.tsx` (or wherever the "create game" flow ends) — new step: "Where should this game be hosted?" with two options:
  - **Local (P2P)** — recommended for local-network play, lowest latency, host's machine stays connected to keep the game alive. (Default.)
  - **Cloud (Pi)** — recommended for cross-network play, persists across disconnects, requires Pi to be reachable.
- The selection feeds into the existing `hostGame(displayName, { mode })` action.

**Acceptance:**
- New game flow exposes the toggle.
- Local mode unchanged from today.
- Cloud mode connects to Pi.

---

### 19h — Migrate-running-game flow

**Files (modify):**
- Campaign settings page — "Move this game to cloud" button (visible if game is currently Local and Pi is reachable). Uses Phase 17's host-transfer protocol:
  1. Current host (a player's machine) serializes authority state.
  2. Pi accepts via `POST /api/games/<id>/start` with the snapshot.
  3. All peers receive a `host:transfer-broadcast` pointing them at the Pi WS endpoint.
  4. Peers reconnect to Pi; local-host's authority shuts down.

**Acceptance:**
- Game in progress → DM clicks "Move to cloud" → after a brief pause, everyone's connected to the Pi and the game continues seamlessly.
- Reverse path (cloud → local) is intentionally NOT supported in this phase. Once cloud, stay cloud.

---

### 19i — Pi admin surface in BMO

**Files (modify):**
- BMO admin web UI (in `bmo/web/templates/`) — new "Hosted Games" tab. Lists active rooms with:
  - Campaign name
  - Current peer count
  - Last activity timestamp
  - Event count
  - "View Log" button (paged event display)
  - "Archive" button (graceful shutdown, snapshot saved)
  - "Force Kick All" button (emergency)

**Acceptance:**
- You can browse to the Pi admin page and see what games are running.
- Event log is paginated, not crash-the-browser-on-huge-campaigns.

---

### 19j — Auto-resume / catch-up

Already covered by Phase 18k's resync protocol. This sub-phase verifies it works end-to-end against the Pi-side authority.

**Acceptance:**
- Client disconnects mid-session, reconnects 30 seconds later → server replays missed deltas, no state flash.
- Client disconnects for an hour, reconnects → server detects out-of-window cursor, ships a full snapshot. Game catches up gracefully.

---

### 19k — Voice transport boundary

**Files (new):**
- `docs/ARCHITECTURE-VOICE.md` — documents the design boundary. Voice chat (when wired up post-Phase 17r) does NOT route through Pi. Stays peer-to-peer (or via SFU later). Game state sync goes via Pi; audio doesn't.

**Why this matters:** the moment voice ships, someone will be tempted to "centralize everything on Pi." That's the wrong call (audio latency budget is tighter; Pi CPU isn't sized for N-way audio mixing).

**Acceptance:**
- Architecture doc is committed.
- When voice lands, its transport choice references this doc.

---

### 19l — Stability + monitoring

**Files (new / modify):**
- `bmo/pi/services/game_server.py` — expose Prometheus-style metrics at `/api/games/metrics`:
  - `active_rooms_total`
  - `connected_peers_total`
  - `deltas_emitted_total` (counter, per-shard)
  - `messages_rejected_total` (per rejection reason)
  - `room_age_seconds` (per room)
- Idle-room auto-archive: rooms with zero peers for > 1 hour get snapshotted to disk and removed from memory. Reopened on demand.
- BMO Grafana board (your existing infra) gains a Pi-Hosted-Games row.

**Acceptance:**
- Metrics scrapeable.
- Idle rooms don't accumulate in memory forever.

---

## Cross-cutting decisions

- **Local P2P stays first-class.** Cloud is opt-in. Some games are better local (LAN play, ultra-low latency). Both modes remain supported indefinitely.
- **One way migration in this phase.** Local → Cloud is supported. Cloud → Local is NOT (would require host-transfer in the other direction, which works in theory but isn't a common-case feature worth shipping until requested).
- **Cloudflare Tunnel handles WAN reach.** Already in place. No new infrastructure.
- **Pi is a single point of failure.** Acknowledged. Mitigation: Local P2P remains available as fallback. Pi auto-restart via systemd. Snapshots survive Pi crashes.
- **No multi-tenant resource limits this phase.** Single Pi serving your own games. If load becomes a concern later, per-campaign CPU/memory budgets can be added in a follow-up.

---

## Critical files (multi-touch hotspots)

- `bmo/pi/services/game_server.py` *(new)*
- `bmo/pi/services/game_authority.py` *(new — Python port of TS authority)*
- `bmo/pi/services/shards.py` *(new — Python shard registry)*
- `bmo/pi/services/shards/*.py` *(new — one file per shard, mirroring TS)*
- `bmo/pi/services/persistence.py` *(new)*
- `bmo/pi/services/auth.py` *(new — JWT issuance + validation)*
- `bmo/pi/app.py` — register new blueprints
- `bmo/setup-bmo.sh` — systemd unit + dependencies
- `dnd-app/src/renderer/src/network/transport/websocket-transport.ts` *(new)*
- `dnd-app/src/renderer/src/components/campaign/CampaignWizard.tsx` — host-mode toggle
- BMO admin templates — "Hosted Games" tab
- `docs/ARCHITECTURE-VOICE.md` *(new)*

---

## Commit cadence

```
19a — feat(bmo): Pi-side game_server.py service skeleton
19b — feat(bmo): WebSocket transport (Pi side) — Flask-SocketIO + room management
19c — feat(dnd-app): WebSocketTransport adapter (client side)
19d — feat(bmo): Python shard registry port + per-shard implementations
19e — feat(bmo): event-sourced persistence (snapshots + delta log)
19f — feat(bmo): per-campaign JWT auth on WS frames
19g — feat(dnd-app): Local vs Cloud host toggle in campaign creation
19h — feat(net): "Move this game to cloud" flow via Phase 17 host transfer
19i — feat(bmo): Hosted Games admin tab in BMO web UI
19j — test(net): end-to-end resync verification against Pi authority
19k — docs(arch): voice-transport boundary doc
19l — feat(bmo): metrics + idle-room auto-archive
```

One release: **v6.0.0** after 19l. Major version bump for the new deployment mode.

---

## Estimated scope

8–12 working sessions. The biggest pieces are 19a/b (Pi service stand-up) and 19d (Python shard port). The Phase 18 abstraction means most of this is mechanical translation between TS and Python rather than fresh design.

---

## Dependencies

- **Requires Phase 16** (permissions) for the authority's validation logic.
- **Requires Phase 17** (Player-as-Host rewrite) for the `GameAuthority` and `TransportAdapter` contracts.
- **Requires Phase 18** (live-state sync overhaul) for the shard protocol Pi implements.

---

## Open questions to lock before starting

1. **Flask-SocketIO vs raw WebSocket?** Default: Flask-SocketIO for consistency with the existing Flask gevent pattern on Pi. Confirm at 19b.
2. **Cloudflare Tunnel routing.** Already set up for `bmo.mybmoai.work/api/*`. Need to verify WebSocket upgrade (`/ws/*`) is unblocked. Confirm with a quick test before 19f.
3. **Per-campaign event-log size limit.** Default: unlimited on disk, indexed by date. Compaction on game-archive only. Confirm if you want a per-game cap.
4. **What's the right reaction to a Pi restart mid-game?** Default: snapshot replay catches everyone up automatically (Phase 18k). Confirm — no explicit user-facing "Pi rebooted, reconnecting…" toast unless you want one.

---

## Plans superseded or modified by Phase 32

| Plan | Item | Disposition |
|------|------|-------------|
| Phase 20 (deprioritized "no authentication" finding) | Auth gap for cloud surface | Covered by Phase 32 JWT on WS frames. Local-P2P invite-code auth unchanged. |
| Phase 27 Sub-Phase J (A9 custom audio sync) | File transfer transport | Stays peer-to-peer per voice-transport-boundary doc (Step 19k). Phase 32 does NOT route audio through Pi. |
| Phase 28 Step 28a.4 (Auth Bearer to BMO) | Token shape for BMO bridge | Reconcile JWT issuer/secret so one credential covers both LAN sync Bearer and cloud WS frame auth. |
| Phase 28 Step 28a.2 (BMO sync receiver hardening) | LAN sync receiver | Hardening still applies to local-P2P mode. Cloud-host uses the new WS path, not this receiver. Both code paths need their own hardening. |

---

## Post-Phase-19 ideas (out of scope here)

- **Cloud-mode-only features.** Things like async DM (DM logs in tomorrow, sees what happened today) only make sense once the authority is persistent. Future phase.
- **Multiple Pis.** Sharding active games across multiple Pis. Out of scope until you actually want it.
- **Replay viewer.** Browse old campaign event logs as a UI. Out of scope.
- **Cloud → Local migration.** Reverse of 19h. Out of scope unless requested.
