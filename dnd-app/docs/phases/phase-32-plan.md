# Phase 32 — Cloud host (Pi-relayed multiplayer)

> Authored 2026-05-29. Builds on Phase 30 (TransportAdapter/GameAuthority, v2.2.6)
> and Phase 31 (shard broadcaster/applier, v2.2.7). Follow `INSTRUCTIONS.md`.

## Context
Today a dnd-app multiplayer game is a WebRTC mesh: one player's laptop is the host
(PeerJS signaling at `bmo-peerjs:9000` + a TURN relay), and every other client
connects peer-to-peer. That requires the host's machine to be reachable and stay
online, and NAT/firewall traversal is brittle.

Phase 32 adds an **opt-in cloud transport**: the always-on Pi runs a Socket.IO
**relay** (star topology). The DM/host client and every player client each open a
single WebSocket to the Pi and join a room keyed by the invite code. The Pi relays
`NetworkMessage`s between them (`broadcast` → everyone-but-sender in the room,
`send(peerId)` → one peer, `broadcastExcluding` → everyone-but-two), and tracks
peer join/leave. This replaces the WebRTC mesh's *connectivity* layer only.

**The game-rules authority does NOT move to the Pi.** `GameAuthority`'s dispatch
(`handleHostMessage`) and the shard broadcaster both read/write the renderer's
Zustand game store, which has no Python equivalent. So the DM client remains the
logical host (runs `GameAuthority` + `createShardBroadcaster`); the Pi is a
**role-aware validating relay** — it knows each peer's role and enforces the
transport-level boundary the P2P host enforced (only the host/DM may emit
`sync:delta` / `dm:*`; players may only emit player intents), then forwards.

Because `GameAuthority`, `createShardBroadcaster`, and `createShardApplier` all take
a `TransportAdapter` (Phase 30 seam), the entire client-side game logic is reused
verbatim — Phase 32 only adds a **third `TransportAdapter` implementation**
(`WebSocketTransport`, alongside `P2PTransport`/`MemoryTransport`) and branches
`hostGame`/`joinGame` on a per-campaign `hostingMode`.

This is **additive and opt-in**: `hostingMode` defaults to `'p2p'`; existing games
are untouched. A broken cloud path cannot break P2P games.

## Depends on / blocks
- **Depends on:** Phase 30 (TransportAdapter/GameAuthority — v2.2.6) + Phase 31
  (shard broadcaster/applier — v2.2.7). Both shipped.
- **Blocks:** Phase 36 (Pi-hosted library reuses the same Pi-client plumbing, but is
  independent of the relay).

## Architecture decision — Socket.IO on both ends
The Pi **already runs flask-socketio 5.6.1** (gevent async mode, port 5000, used by
the IDE via `register_ide(app, socketio, agent)` + `@socketio.on('connect')`). Reusing
it (new `@socketio.on(..., namespace='/game')` handlers) is far lower-risk than adding
`flask-sock`/raw-WS to a proven production server. The matching JS client is
`socket.io-client` 4.x (compatible with python-socketio 5.x / python-engineio 4.x).

- **New dnd-app dep:** `socket.io-client@^4`.
- **No CSP change:** `bmo-csp.ts` already emits `wss://<piHost>:* ws://<piHost>:*`
  into `connect-src` (verified `src/main/index.ts:157`).
- **Namespace isolation:** the relay lives on the `/game` Socket.IO namespace so it
  never collides with the IDE's default-namespace handlers.

## Files
**Pi (Python):**
- `bmo/pi/services/game_relay.py` (NEW) — pure-Python room/peer/routing logic (unit-testable, no SocketIO).
- `bmo/pi/app.py` — register `/game`-namespace SocketIO handlers (thin glue → `game_relay`).
- `bmo/pi/tests/test_game_relay.py` (NEW) — routing unit tests + a flask-socketio test-client smoke test.

**dnd-app (TS):**
- `src/renderer/src/network/transport/websocket-transport.ts` (NEW) + `.test.ts`.
- `src/renderer/src/network/transport/transport-adapter.ts` — (read-only; the contract).
- `src/renderer/src/stores/network-store/index.ts` + `types.ts` — `hostGame`/`joinGame` cloud branch + `connectionMode`.
- `src/renderer/src/network/index.ts` — export `createWebSocketTransport`.
- `src/renderer/src/types/campaign.ts` — `hostingMode?: 'p2p' | 'cloud'`.
- `src/renderer/src/components/campaign/CampaignWizard.tsx` — host-mode toggle in the Details step.
- `src/renderer/src/pages/CampaignDetailPage.tsx` — route host start on `hostingMode`.
- `src/renderer/src/network/registry-client.ts` — optional `hosting_mode` on the announce payload.
- `src/renderer/src/components/game/cloud/CloudStatusPanel.tsx` (NEW) — DM-only relay status (connected peers).
- `package.json` — add `socket.io-client`.

## Sub-phase summary
- **32a** — Pi `GameRelay` core (pure Python): rooms, peer↔sid map, role-aware routing.
- **32b** — Pi SocketIO `/game`-namespace glue + tests.
- **32c** — dnd-app `WebSocketTransport` (TransportAdapter over an injected socket) + tests + `socket.io-client` dep.
- **32d** — network-store `hostGame`/`joinGame` cloud branch + `connectionMode` state.
- **32e** — `Campaign.hostingMode` + CampaignWizard toggle + CampaignDetailPage routing + registry `hosting_mode`.
- **32f** — DM-only `CloudStatusPanel` (relay connection + connected players).

## Sub-phase details

### 32a — Pi `GameRelay` core (pure Python)
`bmo/pi/services/game_relay.py`: a `GameRelay` class, no Flask/SocketIO import (mirror
`game_registry.py`'s testable style). State: `rooms: dict[str, Room]` where a `Room`
holds `peers: dict[sid, PeerRef]` (`PeerRef` = `{peer_id, client_id, role, display_name}`)
and a `host_sid`. Methods (all pure — return routing decisions, never emit):
- `join(code, sid, peer_ref) -> JoinResult` — create room if absent; first host-role
  peer becomes `host_sid`; returns the existing peer list to send to the joiner + the
  joiner's PeerRef to announce to others.
- `leave(sid) -> LeaveResult` — remove; return `(code, peer_id, was_host, remaining_sids)`;
  drop the room when empty.
- `route(from_sid, message, target_peer_id=None, exclude_peer_id=None) -> list[sid]` —
  given a relayed `NetworkMessage` dict, return the recipient sids:
  - `target_peer_id` set → the single sid for that peer (point-to-point `send`).
  - `exclude_peer_id` set → all room sids except sender + excluded (`broadcastExcluding`).
  - neither → all room sids except sender (`broadcast`).
- `authorize(from_sid, message) -> bool` — role-aware gate: the message `type` is read;
  if it starts with `dm:` or is `sync:delta` / `game:state-update`, only `host`/`dm`
  roles may send; otherwise allow. Unknown sid → deny.
- `host_sid_for(code)` / `peers_for(code)` accessors for the glue layer.

**Acceptance:** `test_game_relay.py` covers join (host election, peer-list return),
leave (host-leave flag, room GC), route (broadcast/send/exclude target sets), authorize
(player blocked from `dm:*` + `sync:delta`, host allowed, unknown sid denied).

### 32b — Pi SocketIO `/game`-namespace glue
In `app.py`, add `register_game_relay(socketio)` (called near `register_ide`). Handlers
on `namespace='/game'`:
- `connect` — no-op (room join is explicit).
- `join` (payload `{code, peer_id, client_id, role, display_name}`) — `flask_socketio.join_room(code)`;
  `relay.join(...)`; `emit('peers', existing_peers)` to the joiner; `emit('peer-joined', joiner, room=code, skip_sid=sid)`.
- `relay` (payload `{message, target_peer_id?, exclude_peer_id?}`) — if not
  `relay.authorize(sid, message)` → `emit('relay-rejected', {type})` back + return; else
  for each sid in `relay.route(...)`: `emit('message', {from_peer_id, message}, to=sid)`.
- `disconnect` — `relay.leave(sid)`; `emit('peer-left', {peer_id}, room=code)`.

Reuse the existing auth posture: the relay rides the same `before_request`/SocketIO
auth as the rest of the app (open by default, `BMO_API_KEY` opt-in). Connection auth:
accept an optional `api_key` in the connect auth dict and reject when `BMO_API_KEY` is
set and the key mismatches (mirror `_bmo_optional_api_key`'s SSE branch).

**Acceptance:** a `flask_socketio` test client connects to `/game`, emits `join`,
receives `peers`; a second client triggers `peer-joined`; `relay` from a player with a
`dm:*` type yields `relay-rejected`; `relay` from the host fans out. Keep the smoke test
minimal (the routing logic is already covered in 32a).

### 32c — dnd-app `WebSocketTransport`
`network/transport/websocket-transport.ts`: `createWebSocketTransport(opts)` returning a
`TransportAdapter`. `opts`: `{ url, code, self: PeerInfo, apiKey?, socketFactory? }`. The
`socketFactory` (defaulting to `io(url + '/game', {auth})` from `socket.io-client`) is
injected so tests pass a mock socket. On construct: connect, `emit('join', {...self})`.
Map the contract onto socket events:
- `send(peerId, msg)` → `emit('relay', { message: msg, target_peer_id: peerId })`.
- `broadcast(msg)` → `emit('relay', { message: msg })`.
- `broadcastExcluding(exclude, msg)` → `emit('relay', { message: msg, exclude_peer_id: exclude })`.
- `on('message', ({from_peer_id, message}) => msgCbs(from_peer_id, message))`.
- `on('peers', list => list.forEach(p => joinCbs(p)))` + `on('peer-joined', p => joinCbs(p))`.
- `on('peer-left', ({peer_id}) => leaveCbs(peer_id))`.
- `disconnect(peerId)` → host-only `emit('kick', {peer_id})` (relay drops that sid). For
  the local end, `close()` → `socket.disconnect()`.

**Acceptance:** `.test.ts` injects a mock socket (records `emit`s, lets the test fire
inbound events) and asserts: join on construct; send/broadcast/exclude emit the right
`relay` shapes; inbound `message`/`peers`/`peer-joined`/`peer-left` invoke the right
callbacks with the right args; `close()` disconnects + unsubscribes.

### 32d — network-store cloud branch
Add `connectionMode: 'p2p' | 'cloud'` to `NetworkState` (default `'p2p'`). `hostGame`/
`joinGame` gain an optional `mode` arg (or read a passed campaign flag). When `'cloud'`:
construct `createWebSocketTransport({ url: <resolved Pi base>, code: inviteCode, self })`
and pass THAT to `new GameAuthority(...)` / `createShardBroadcaster(...)` (host) or
`createShardApplier(...)` (client) — everything else identical. Resolve the Pi base URL
via the same path `registry-client.getBaseUrl()` uses (settings `bmoPiBaseUrl` → mDNS →
default), converting `http(s)→ws(s)`. P2P path unchanged. Inspect the existing
`configureForCloud()` export (`network/index.ts`, used by `CampaignDetailPage:126`) and
fold the relay wiring into/alongside it rather than duplicating.

**Acceptance:** existing network-store tests stay green; a new test drives `hostGame` in
`'cloud'` mode with a `MemoryHub`-style fake (or a mocked `createWebSocketTransport`) and
asserts the authority/broadcaster are constructed over the WS transport, not P2P.

### 32e — Campaign hosting mode (UI + persistence + registry)
- `types/campaign.ts`: add `hostingMode?: 'p2p' | 'cloud'`.
- `CampaignWizard.tsx` Details step: a two-option toggle ("This device (peer-to-peer)" /
  "Pi cloud relay") writing `hostingMode`; default `'p2p'`. Thread through `handleCreate`.
- `CampaignDetailPage.tsx`: in the start-host handler, pass `campaign.hostingMode` to
  `hostGame` (drives 32d's branch).
- `registry-client.ts`: add optional `hosting_mode` to `RegistryAnnouncePayload`; the Pi
  registry already tolerates unknown/extra fields (validation only checks player counts).

**Acceptance:** wizard renders the toggle, persists `hostingMode`; tsc + the wizard/detail
tests green; announce payload carries `hosting_mode` when set.

### 32f — DM-only Cloud Status panel
`components/game/cloud/CloudStatusPanel.tsx`: a small DM-only panel showing the relay
connection state (`connectionMode === 'cloud'` + connected?), the Pi URL in use, and the
connected-peer list (name / role / latency) read from `network-store.peers`. Surface it
where DM tools already render (a sidebar section or a Settings sub-panel — pick the
lowest-friction insertion that the a11y/test conventions already support). Reuse existing
peer state; no new store reads beyond `peers` + `connectionMode`.

**Acceptance:** renders the peer list for a cloud game, hidden for P2P / non-DM; a
colocated `.test.tsx` asserts both branches.

## Constraints
- **Additive + opt-in.** `hostingMode` defaults to `'p2p'`; the P2P mesh path is not
  modified. No existing test changes behavior.
- **The Pi is a relay, not the rules authority.** Do NOT attempt to mirror
  `handleHostMessage`/the game store in Python. The Pi validates envelope shape + role +
  room membership and forwards.
- **`NetworkMessage` wire shape is unchanged.** The relay carries it opaquely.
- **Cannot integration-test the live Pi↔client Socket.IO loop** (no running Pi + two
  clients in CI). Per INSTRUCTIONS rule 159 that is a test-later concern: ship the code +
  unit tests (mock socket on the client, fake-emit on the Pi) + the 4-gate + pytest.
- 4-gate green at end-of-phase; `pytest bmo/pi/tests/` green (rule 5/70, Pi-side).
- Single end-of-phase commit; one release (v2.2.8).

## Completed
- 32a — DONE (`bmo/pi/services/game_relay.py:1`) — pure-Python `GameRelay` (rooms,
  sid↔room index, host election, `join`/`leave`/`route`/`authorize`, singleton
  `get_relay`/`reset_relay_for_tests`). 19 unit tests in
  `bmo/pi/tests/test_game_relay.py` cover join/host-election, leave/room-GC,
  route broadcast/p2p/exclude, and the authorize role gate. All pass.
  (Additive accessors `peer_id_for` + `join.joiner` added for the 32b glue.)
- 32b — DONE (`bmo/pi/routes/game_relay_ws.py:1`) — `register_game_relay(socketio,
  api_key=…)` attaches connect/join/relay/kick/disconnect handlers on the `/game`
  namespace; wired into `app.py` `__main__` next to `register_ide`
  (`bmo/pi/app.py:5374,5382`). 8 flask-socketio test-client smoke tests
  (join→peers, second-join announce/list, player state-push rejected, host relay
  reaches player with from_peer, point-to-point, disconnect→peer-left, api-key
  connect gate). 27 tests total in the file pass.
- 32c — DONE (`src/renderer/src/network/transport/websocket-transport.ts:1`) —
  `createWebSocketTransport(opts)` implements `TransportAdapter` over an injected
  `RelaySocket` (default = `socket.io-client` `io(url + '/game')`). join-on-construct;
  send/broadcast/broadcastExcluding → `relay` emits; inbound message/peers/
  peer-joined/peer-left → callbacks; `disconnect`→`kick`; `close`→socket.disconnect
  + unsubscribe. `socket.io-client@^4.8.1` added (`audit:ci` prod-only = 0 vulns).
  12 unit tests with a fake socket, all pass; tsc web clean. (Imported by
  direct path in 32d, matching `createP2PTransport` — no barrel export, avoids a
  knip unused-export. Note: `peer-manager.configureForCloud` is the WebRTC
  force-TURN config, unrelated to this WS relay — not conflated.)
- 32d — DONE — `connectionMode: 'p2p' | 'cloud'` added to `NetworkState`
  (`types.ts:25`, default `'p2p'`). `hostGame`/`joinGame` take an optional `mode`.
  New `cloud-session.ts` (`connectCloudSession` + `__setCloudSocketFactoryForTests`)
  resolves the Pi URL (`resolveBmoBaseUrl`, exported from registry-client) + builds
  the WS transport with a generated `cloud-<uuid>` peer id. **Seam:** rather than
  rewrite the P2P-coupled `handleHostMessage` monolith, added an outbound override
  to `host-manager` (`setHostOutboundOverride` — reroutes broadcastMessage/
  broadcastExcluding/sendToPeer/kickPeer/getConnectedPeers/getPeerInfo) + a peer-id
  override to `peer-manager` (`setPeerIdOverride` — getPeerId). The cloud `hostGame`
  branch installs both, wires `GameAuthority` + shard broadcaster over the relay
  transport, sources recipients/peers from `get().peers` (driven by transport
  onPeerJoin/onPeerLeave), and ships the join snapshot via `transport.send`; the
  cloud `joinGame` branch wires applier + onMessage→handleClientMessage; cloud
  client `sendMessage` routes point-to-point to the host. Teardown clears both
  overrides + closes the transport. P2P path untouched (gated on mode). 5 new
  cloud store tests (`index.cloud.test.ts`); full network + network-store suite
  (377 tests, 36 files) green; tsc web clean.
- 32e — DONE — `Campaign.hostingMode?: 'p2p' | 'cloud'` (`types/campaign.ts:104`,
  optional → pre-32 campaigns read as p2p). `DetailsStep` gains a "Hosting"
  two-option toggle (This device / Pi cloud relay) threaded through
  `CampaignWizard` state + `createCampaign`. `CampaignDetailPage.handleConfirmHostName`
  passes `campaign.hostingMode` to `hostGame`. `RegistryAnnouncePayload.hosting_mode`
  added + `LobbyPage` announce passes `campaign.hostingMode` (Pi tolerates the
  extra field). tsc web clean.
- 32f — DONE (`src/renderer/src/components/game/cloud/CloudStatusPanel.tsx:1`) —
  pure-props DM-only panel (relay connection indicator + connected-peer list);
  returns null for P2P or non-DM. Mounted in `LobbyPage` above the lobby layout
  (`isHost && connectionMode === 'cloud'`). 4 RTL tests (cloud-DM render, empty
  room, P2P→null, non-DM→null) pass; tsc web clean.
