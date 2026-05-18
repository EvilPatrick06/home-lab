# Phase 17 — Player-as-Host architecture rewrite

> Decouple the *network host* (who holds authoritative state + routes messages) from the *DM* (who has permission-set we'd call "DM"). Consolidate host-side logic into a `GameAuthority` module behind a transport adapter. Add host-role transfer protocol.
>
> Renumbered from "Phase B" in conversation planning. Depends on **Phase 16** (permissions matrix) landing first.

---

## Context

Today, "the host" and "the DM" are the same peer by accident. Whoever calls `startHosting()` (i.e., whoever creates the game) becomes:

1. The **network host** — holds the authoritative `useGameStore` state, runs `host-handlers.ts`, validates inbound messages, broadcasts changes to peers.
2. The **DM** — has every gameplay permission by default, holds the `dmId` in the campaign settings.

This conflation produces several problems:

- **DM can't transfer.** If the DM has to step away from their machine, the game ends — because the DM IS the host, closing their app shuts down the network.
- **Players can't host for someone else.** Want one friend to host (better connection / always-on machine) while a different friend DMs? No way to express that.
- **Phase 18 needs this abstraction.** When Phase 18 (Live-state sync overhaul) consolidates the sync model, "the host" still needs to be something specific — but we want it to be a role, not a peer that started PeerJS first.
- **Phase 19 needs this abstraction.** Pi-as-host means a Pi runs the authority. That's only sensible if "authority" is a thing that can be different from "the human DM."

Goal: separate the two concepts cleanly. Any peer can be the host; any peer (or zero peers) can hold the DM role; both can transfer mid-session.

Phase 16's permission system makes the gameplay side already role-driven. This phase makes the network side authority-driven, with the authority abstracted so it can run anywhere (player's machine in this phase, Pi in Phase 19).

---

## Sub-phase summary

| # | Sub-phase | Scope |
|---|-----------|-------|
| 17a | Extract `GameAuthority` module | Consolidate host-handlers + host-connection + network-store host paths into one module with a clean interface |
| 17b | Transport adapter abstraction | `TransportAdapter` interface; current PeerJS code becomes `P2PTransport`; authority no longer knows what's underneath |
| 17c | Decouple host-peer from DM-role | Record host-peer separately from `campaign.dmId`; permission checks already use Phase 16, so this finishes the data separation |
| 17d | Host-role transfer protocol | `host:transfer-request` + `host:transfer-accept`; state snapshot serialization; atomic switchover |
| 17e | DM-role transfer | Independent of host transfer. Just a permission/role reassignment via Phase 16 |
| 17f | Transfer UI in PlayerCard menu | "Transfer Host" + "Transfer DM" gated by `transfer_host` + `change_player_role` permissions |
| 17g | Persistence on host-side | Local host saves campaign state on debounced interval; snapshot moves to new host on transfer |
| 17h | Tests + verify-don't-assume sweep | Existing host-handler tests run against GameAuthority; new tests for transfer atomicity and DM-transfer independence |
| 17i | Migration for in-flight games and saved campaigns | Map old `campaign.dmId` to new DM-role assignment; map old host-peer to new authority record |

9 sub-phases. Each ends with the 4-gate suite. One release: **v4.0.0** (major bump — fundamental network rewrite, invisible to users in normal play but breaking for any extension that pokes at the old host-handlers API).

---

## Sub-phase details

### 17a — Extract `GameAuthority` module

**Files (new):**
- `src/renderer/src/network/authority/game-authority.ts` — the single module. Exports a class or namespace with:
  - `init(campaign, hostPeerInfo, transport)`
  - `applyAction(actor: PeerInfo, action: NetworkMessage) → { accepted: boolean, broadcast: NetworkMessage[] }`
  - `getSnapshot(forPeer: PeerInfo) → NetworkGameState` (per-peer filtered, uses Phase 16 permissions)
  - `onSnapshotChange(callback)` — for diff broadcasting
  - `addPeer(peerInfo)`, `removePeer(peerId)`
  - `validate(actor, action) → boolean` (uses `hasPermission`)
  - `serialize()` / `deserialize(snapshot)` — for host transfer + persistence

**Files (modify / consolidate-out-of):**
- `src/renderer/src/network/host-connection.ts` — handleJoin, message router, ban check, peer dedup
- `src/renderer/src/network/host-manager.ts` — connections map, peerInfoMap, lastHeartbeat
- `src/renderer/src/network/host-message-handlers.ts` — applyChatModeration, validateMessage
- `src/renderer/src/stores/network-store/host-handlers.ts` — case-by-case message handling
- `src/renderer/src/stores/network-store/index.ts` — `filterGameStateForRole`, `transformUpdatePayloadForPeer`, sendMessage's host branch

All of this logic moves INTO `GameAuthority` behind a clean interface. The existing files become thin shims that call into the new module while migration is in flight, then get deleted in a follow-up cleanup commit.

**Acceptance:**
- Existing tests pass — `GameAuthority` produces identical outputs to the old scattered code.
- Adding a new message type now requires editing exactly one file (`game-authority.ts`).

---

### 17b — Transport adapter abstraction

**Files (new):**
- `src/renderer/src/network/transport/transport-adapter.ts` — interface:
  ```typescript
  interface TransportAdapter {
    send(peerId: string, msg: NetworkMessage): void
    broadcast(msg: NetworkMessage): void
    broadcastExcluding(msg: NetworkMessage, peerId: string): void
    onMessage(cb: (msg, fromPeerId) => void): () => void
    onPeerJoin(cb: (peerInfo) => void): () => void
    onPeerLeave(cb: (peerId) => void): () => void
    disconnect(peerId: string, reason?: NetworkMessage): void
    close(): void
  }
  ```
- `src/renderer/src/network/transport/p2p-transport.ts` — current PeerJS code wrapped into this interface. Same behavior; new file.

**Files (modify):**
- `GameAuthority` constructor takes a `TransportAdapter` instead of importing PeerJS directly. Authority doesn't know — and doesn't care — that the transport is WebRTC DataChannel.

**Acceptance:**
- Game still runs on PeerJS; no transport behavior change.
- Code search confirms `GameAuthority` has zero imports from `peerjs` directly.
- A stub `MemoryTransport` exists for tests (peer simulation in-process).

---

### 17c — Decouple host-peer from DM-role

**Files (modify):**
- `src/renderer/src/types/campaign.ts` — add `Campaign.hostPeerClientId: string | null` (the current host's stable clientId). Existing `dmId` stays as the DM-role assignment (but its meaning is "who has the DM role" not "who runs the network").
- `src/renderer/src/network/authority/game-authority.ts` — `hostPeerInfo` is a runtime concept (passed in init). DM-role is a campaign data concept. They're never coupled.
- Every "isHost" check in renderer code becomes either:
  - `peer.clientId === campaign.hostPeerClientId` (rare — usually only for transport-routing display)
  - `hasPermission(peer, 'some_dm_perm', campaign)` (almost everywhere — Phase 16's mechanism)

**Acceptance:**
- A campaign can have `hostPeerClientId === 'client-alice'` and DM role assigned to `client-bob`. Game runs. Alice's machine routes traffic; Bob has DM perms.
- Default behavior (host creates game → host is DM) still works because the create-game flow assigns both.

---

### 17d — Host-role transfer protocol

**Files (new):**
- `src/renderer/src/network/transport/host-transfer.ts` — atomic handover. New message types:
  - `host:transfer-request` (current host → target): payload = `{ targetClientId, snapshotPayload, sequenceCursor }`. The target receives the full serialized authority state.
  - `host:transfer-accept` (target → current host): payload = `{ targetClientId, acceptedAt }`. Target signals it has applied the snapshot and is ready.
  - `host:transfer-broadcast` (sent by current host on accept): payload = `{ newHostClientId }`. Tells all peers to re-route to the new host.

**Files (modify):**
- `src/renderer/src/network/transport/p2p-transport.ts` — implement re-routing. Existing peer connections to the OLD host get closed; new connections initiated to the NEW host. Brief switchover window (~1–2s); existing 17g auto-reconnect path covers it.
- `src/renderer/src/network/authority/game-authority.ts` — `transferTo(targetClientId)` method. Validates target has `accept_host_transfer` permission. Pauses inbound message processing during transfer. Serializes snapshot, sends, waits for accept, broadcasts switch.

**Acceptance:**
- Alice (current host) clicks Transfer Host → Bob. Game pauses for ~1–2s. State snapshot ships to Bob. Bob's app is now the authority. Everyone reconnects via Bob's transport. Game resumes.
- Alice can leave the session entirely after the transfer; game keeps running.
- If the transfer fails (Bob's machine dies mid-transfer), the original host stays authoritative and the transfer is aborted with a system chat message.

---

### 17e — DM-role transfer

**Files (modify):**
- `src/renderer/src/stores/use-campaign-store.ts` — `transferDmRole(campaignId, fromClientId, toClientId)`. Just a campaign update — reassigns whoever has the DM role to a new peer. No transport implications.
- Sends a campaign-update broadcast so all peers see the new DM assignment.

**Why this is trivial after Phase 16:** DM-role transfer is just `setPlayerRole(targetPeer, 'role-dm')`. Phase 16 already supports per-player role assignment. This sub-phase is mostly the UI affordance + a permission check (`change_player_role`).

**Acceptance:**
- Alice has DM role. Bob has Player role. Alice clicks "Transfer DM → Bob". Bob now has DM role, Alice gets demoted to Player (or to whatever role Alice picks at transfer time).
- Independent of host transfer. Either can happen without the other.

---

### 17f — Transfer UI in PlayerCard menu

**Files (modify):**
- `src/renderer/src/components/lobby/PlayerCard.tsx` — add two menu items, gated by permissions:
  - "Transfer Host →" (visible if local peer has `transfer_host` AND target is not currently the host)
  - "Transfer DM →" (visible if local peer has `change_player_role` AND target is not currently the DM)
- Confirmation modal for both, because they're disruptive.

**Acceptance:**
- DM (who's also host) sees both menu items on other players' cards.
- A non-DM peer can be granted `transfer_host` via Phase 16 overrides if the user wants that flexibility.

---

### 17g — Persistence on host-side

**Files (new):**
- `src/renderer/src/network/authority/persistence.ts` — debounced (~5s) snapshot serialization to disk via `window.api.saveCampaignSnapshot(campaignId, snapshot)`. On host startup, attempts `window.api.loadCampaignSnapshot(campaignId)` and seeds the authority if found.

**Files (modify):**
- `src/main/io/campaign-snapshots.ts` (new IPC handler) — read/write to `<userData>/snapshots/<campaignId>.json`.

**Why this matters for Phase 19:** Pi-as-host needs to persist state too. The serialization format defined here gets reused. By the time Phase 19 starts, "snapshot the authority" is a solved primitive.

**Acceptance:**
- Host crashes mid-game. Reopens app. Game loads from last snapshot, peers reconnect, play resumes from the snapshot's state.
- Host transfer ships the snapshot to the new host (same `serialize()` API).

---

### 17h — Tests + verify-don't-assume sweep

**Files (new / modify):**
- `src/renderer/src/network/authority/game-authority.test.ts` — comprehensive test suite for the new module.
- `src/renderer/src/network/transport/p2p-transport.test.ts` — wraps existing host-manager tests under the adapter.
- `src/renderer/src/network/transport/host-transfer.test.ts` — atomic-transfer specs (success, target rejection, target crash mid-transfer, network blip during transfer).

Acceptance criteria for each migrated piece of host logic: produces byte-identical output to the pre-17a code path for the same inputs.

**Acceptance:**
- 4-gate suite green. New tests cover transfer + DM-role separation + permission integration. Existing tests untouched in behavior.

---

### 17i — Migration for in-flight games and saved campaigns

**Files (modify):**
- `src/main/io/campaign-io.ts` — on load, if `campaign.hostPeerClientId` is missing but `campaign.dmId` is set, set `hostPeerClientId = dmId`. Preserves the host=DM coupling for legacy saves.
- Auto-rejoin flow handles the case where the host changed between sessions.

**Acceptance:**
- Loading a pre-17 save works exactly as today. Host = DM by default.
- Once the user transfers host, the new value persists.

---

## Cross-cutting decisions

- **Host-peer and DM-role default to the same peer at campaign creation.** Backwards compatible. Only diverges when explicitly transferred.
- **Phase 16 permissions are the single source of truth for "who can do what."** The host-peer concept is purely about transport routing.
- **Transfer protocol pauses gameplay briefly.** ~1–2s is acceptable. The alternative (live-migrate state without pausing) is much more complex and not worth it for the use case (DM stepping away).
- **Persistence is local-host disk for this phase.** Phase 19 moves it to Pi.
- **TransportAdapter is the seam Phase 19 plugs into.** WebSocket transport (Phase 19) implements the same interface — no changes needed to `GameAuthority`.

---

## Critical files (multi-touch hotspots)

- `src/renderer/src/network/authority/game-authority.ts` *(new)*
- `src/renderer/src/network/transport/transport-adapter.ts` *(new)*
- `src/renderer/src/network/transport/p2p-transport.ts` *(new)*
- `src/renderer/src/network/transport/host-transfer.ts` *(new)*
- `src/renderer/src/network/authority/persistence.ts` *(new)*
- `src/renderer/src/types/campaign.ts` — `hostPeerClientId` field
- `src/renderer/src/stores/use-campaign-store.ts` — DM-role transfer action
- `src/renderer/src/components/lobby/PlayerCard.tsx` — transfer menu items
- Eventually deleted: `host-connection.ts`, `host-manager.ts`, `host-message-handlers.ts`, `host-handlers.ts` (their content moves into `GameAuthority`)

---

## Commit cadence

```
17a — refactor(net): extract GameAuthority module from scattered host logic
17b — refactor(net): TransportAdapter interface + P2PTransport implementation
17c — feat(net): decouple host-peer from DM-role (campaign.hostPeerClientId)
17d — feat(net): host-role transfer protocol + atomic switchover
17e — feat(dnd-app): DM-role transfer (role reassignment via Phase 16)
17f — feat(dnd-app): Transfer Host / Transfer DM menu items in PlayerCard
17g — feat(net): debounced host-side snapshot persistence
17h — test(net): comprehensive GameAuthority + transfer tests
17i — feat(net): migration for legacy campaigns lacking hostPeerClientId
```

One release: **v4.0.0** after 17i. Major version bump — `GameAuthority` is a new public-ish surface, and the old host-handler shims will be removed in a follow-up.

---

## Estimated scope

10–15 working sessions. The biggest sub-phases are 17a (consolidation grind — every line of host logic gets moved) and 17d (transfer protocol is genuinely hairy because of the atomic switchover requirement).

This phase is invisible to users in normal play — game still works exactly as before. The user-visible value comes from being able to transfer host/DM mid-session, which is a niche but high-value feature for long campaigns.

---

## Dependencies

- **Requires Phase 16** (permissions matrix) to be landed. The `hasPermission` checks for `transfer_host` and `change_player_role` need to exist.
- **Blocks Phase 18** (Live-state sync overhaul). Phase 18 mounts its shard registry inside `GameAuthority` — that module needs to exist first.
- **Blocks Phase 19** (Cloud host). Phase 19 builds a Pi-side implementation of `GameAuthority` speaking the same transport-adapter contract.

---

## Open questions to lock before starting

1. **Can a peer hold the host-peer role without having the DM role?** Default: yes (that's the whole point — "player hosts for the DM"). Confirm.
2. **What happens if the host-peer disconnects without transferring?** Default: pick a remaining peer with the highest "host-eligibility" (probably the peer with the DM role, falling back to the longest-connected peer with `transfer_host` permission) and offer them an "Accept host responsibility" toast. They can decline; if no one accepts within ~30s, game pauses and waits for the original host to reconnect. Confirm or adjust.
3. **Should host transfer require both the old host and the new host to be online?** Default: yes (atomic handshake). Confirm.
