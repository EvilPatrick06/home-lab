# Phase 30 — Player-as-Host (transport seam + GameAuthority)

> Authored 2026-05-29 from the open backlog in `REVIEW-REPORT-2026-05-29.md`.
> Follow `INSTRUCTIONS.md` (the 27-rule playbook) when executing.

## Context

Today the multiplayer core hard-couples three concerns: the **network host**
(the PeerJS peer that owns the mesh), the **authoritative game state** (lives in
the zustand stores on whichever client is host), and the **DM role** (game-rule
authority). "Host" and "DM" are assumed to be the same client. Phase 30 introduces
a transport seam (`TransportAdapter`, already stubbed in 30b) and a `GameAuthority`
that owns state independently of *which* transport carries it — so (a) any player
can host, (b) host can transfer, and (c) Phase 32 can later run the same
`GameAuthority` on the Pi over a WebSocket transport instead of P2P.

This is a **behavior-preserving-then-extending** refactor: the existing PeerJS path
keeps working throughout; new seams are additive until the final decouple.

## Depends on / blocks

- **Depends on:** Phase 29 (registry/lobby) — shipped.
- **Blocks:** Phase 31 (live-state sync broadcaster/applier run *on* GameAuthority),
  Phase 32 (cloud host = GameAuthority on the Pi over WebSocketTransport).

## Files touched

- `src/renderer/src/network/transport/transport-adapter.ts` (exists — the interface)
- `src/renderer/src/network/transport/p2p-transport.ts` (NEW — wraps host-manager)
- `src/renderer/src/network/transport/memory-transport.ts` (NEW — in-process, for tests)
- `src/renderer/src/network/transport/*.test.ts` (NEW)
- `src/renderer/src/network/authority/game-authority.ts` (NEW — 30a)
- `src/renderer/src/network/host-manager.ts`, `host-connection.ts`, `peer-manager.ts`
  (decouple host-from-DM; transfer — 30c–f)
- `src/renderer/src/stores/network-store/*` (route through GameAuthority — 30c–f)
- persistence (30g), migration (30i)

## Sub-phase summary

- **30a** `GameAuthority` — extract the authoritative-state owner (apply intent →
  mutate state → emit changes) from the host-side store handlers, transport-agnostic.
- **30b** `TransportAdapter` interface — **DONE** (the stub exists).
- **30b.1** `P2PTransport` — wrap the existing host-manager send/broadcast/onMessage
  in the interface. Additive, zero behavior change.
- **30b.2** `MemoryTransport` — in-process TransportAdapter for deterministic tests.
- **30c** Route host-side message handling through `GameAuthority` over a
  `TransportAdapter` (P2PTransport in prod) instead of direct host-manager calls.
- **30d** Decouple "host" (network) from "DM" (game role): a non-DM player can be
  the network host; DM authority is a separate flag carried in PeerInfo/permissions.
- **30e** Host-transfer protocol: hand the GameAuthority + transport host role to
  another peer without dropping the session.
- **30f** Client-side: tolerate host change (re-point, resync).
- **30g** Persistence: GameAuthority state survives host transfer / reconnect.
- **30h** Tests: GameAuthority over MemoryTransport (apply/emit/transfer); P2P wrap.
- **30i** Migration: existing in-flight sessions / saved games keep working.

## Sub-phase details

### 30b.1 — P2PTransport (additive)
Implements `TransportAdapter` by delegating to `host-manager`:
`send`→`sendToPeer`, `broadcast`→`broadcastMessage`,
`broadcastExcluding(exclude,msg)`→`broadcastExcluding(msg,exclude)`,
`onMessage(cb)`→`onMessage((msg,peerId)=>cb(peerId,msg))` (arg-order adapt),
`onPeerJoin`→`onPeerJoined`, `onPeerLeave(cb)`→`onPeerLeft((peer)=>cb(peer.peerId))`,
`disconnect`→`kickPeer`, `close`→`stopHosting`. No host-manager edits.
**Acceptance:** unit test wires fake host-manager fns, asserts delegation + arg adapt.

### 30b.2 — MemoryTransport (additive)
In-process hub: a shared registry maps peerId→inbound handler; `send`/`broadcast`
deliver synchronously (microtask) to the target(s); `onPeerJoin/Leave` fire when
peers register/unregister. Two MemoryTransports sharing a hub model host↔client.
**Acceptance:** test — two endpoints exchange messages, join/leave fire, exclude works.

### 30a — GameAuthority
A transport-agnostic class: holds the authoritative game state (or a reference to
the host stores), exposes `applyIntent(peerId, message)` → validates (reuses
`host-message-handlers.validateMessage` + permission checks) → mutates → returns the
resulting outbound message(s) the caller broadcasts via the transport. No PeerJS
imports. **Acceptance:** test over MemoryTransport — an intent mutates state and the
expected broadcast is emitted; an unauthorized intent is rejected + audited (20g).

### 30c–30f — wiring + decouple + transfer
(Detailed when 30a/30b land — they verify the seam before the risky decouple.)

## Constraints & edge cases

- The PeerJS path MUST keep working at every commit (4-gate green). Additive first;
  delete the old path only in the final decouple sub-phase, never mid-chain.
- Do not change `validateMessage` / permission semantics — GameAuthority *reuses* them.
- Host-transfer must not drop connected peers (graceful re-point, not reconnect storm).
- Keep `NetworkMessage` wire shape stable (Phase 31/32 depend on it).

## Completed

- 30b — TransportAdapter interface (pre-existing stub, `transport/transport-adapter.ts`).
- 30b.1 — DONE (`transport/p2p-transport.ts`) — P2PTransport wraps host-manager; +6 tests.
- 30b.2 — DONE (`transport/memory-transport.ts`) — MemoryTransport + MemoryHub; +6 tests.
- 30a — DONE (`authority/game-authority.ts`) — GameAuthority: validate→dispatch→broadcast over a transport; +`registerDefault` fallback; +5 tests over MemoryTransport.
- 30c — DONE (`stores/network-store/index.ts`) — host inbound dispatch now flows through `GameAuthority` over a `P2PTransport`; the whole `handleHostMessage` switch is the default handler (behavior-preserving — `host-connection` still validates upstream, broadcasts unchanged). Full vitest 6740 green. **Next: 30d** — peel per-type handlers off the monolith + decouple host(network) from DM(role).
