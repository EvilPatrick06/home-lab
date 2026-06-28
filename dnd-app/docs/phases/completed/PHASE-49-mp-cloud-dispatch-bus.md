# PHASE-49 — Multiplayer cloud dispatch-bus adapter

> Authored from the 2026-06-24 multiplayer QA report (dnd-vtt v2.6.2, MULTIPLAYER PASS — Cloud Relay + Local/Direct P2P). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Close the single shared root cause behind most of the cloud-multiplayer "nothing syncs" symptoms (report symptoms 3, 5, and the aggregate 8): the app has **two independent inbound dispatch paths** and the cloud relay only ever feeds one of them. The store dispatcher (`handleClientMessage` / `GameAuthority → handleHostMessage`) is correctly wired over the relay transport, but every UI **bridge** (`useChatBridge`, `useCharacterSelectBridge`, `useModerationBridge`, `useChatTimeoutBridge`, and the in-game chat bridge in `GameLayout`) subscribes only to the legacy P2P pub/sub emitters `onHostMessage` / `onClientMessage`, which the relay never drives. In a cloud session there is no PeerJS mesh, so those emitters never fire and the bridges receive nothing.

This phase wires cloud inbound to feed the same consumer set that P2P does, so chat and character-select state survive in cloud games. PLANNING ONLY — no app code changes here.

## Dependencies & cross-phase notes

- **No prerequisite phases.** This is the keystone of the 2026-06-24 multiplayer set; PHASE-50 (character sharing) and PHASE-51 (state-sync) list this phase as a dependency because their fixes assume the inbound fan-out is unified.
- **Drift correction — `dm:character-update` is ALREADY dispatcher-wired (verify-don't-rebuild).** The QA report listed symptom 6's player-apply (`dm:character-update`) as a dead-bus victim. That is **stale**: the live tree dispatches `dm:character-update` through `handleClientMessage` (`client-handlers.ts:583`) into `handleCharacterUpdate` (`client-handlers/game-action-handlers.ts:162-178`), which dual-writes `useCharacterStore.updateCharacterInState` + `useLobbyStore.setRemoteCharacter` (Phase 23c contract). Cloud players therefore **already receive** DM sheet edits via the dispatcher. `dm:chat-timeout` is likewise already a dispatcher case (`client-handlers.ts:473`). **Consequence for this phase:** the adapter must NOT blindly re-feed *every* relay frame into the P2P buses, or those already-dispatcher-handled types would be applied twice (a double-apply / non-idempotent-effect risk). Scope the adapter to the **bridge-only** types, or make it idempotent for any type the dispatcher already handles. Follows the PHASE-17 / PHASE-48 "verify against the live tree before writing new code" precedent.
- **Confirmed bridge-only (genuinely dead in cloud), per code read:** `chat:message` and `chat:file` (no `handleClientMessage` case — only `chat:whisper`/`chat:announcement`/`chat:clear`/`dm:chat-timeout` exist; host-handlers only *re-broadcast* `chat:message`/`chat:file` without writing the host's own chat log) and `player:character-select`'s `characterData` (host-handlers stores only `characterId`/`characterName` on the peer, never the `characterData` into `remoteCharacters`).
- **Two fix options for the executor (report's framing, verified):** (a) a thin adapter that re-emits each relay inbound frame into the existing `onHostMessage`/`onClientMessage` emitters so all bridges work unchanged — smallest blast radius, but must guard the double-apply types above; or (b) migrate the bridge-only logic (chat, character-select) into `handleClientMessage`/`handleHostMessage` cases that both transports already drive — cleaner long-term, larger diff. Either resolves symptoms 3 and 5.

## Verified findings

All verification was against the live tree (worktree `auto/dnd-phase-maker`, dnd-vtt v2.6.2).

### TR-1 (critical) — cloud relay inbound never reaches the UI message bridges

**Status: confirmed for `chat:message` / `chat:file` / `player:character-select`; `dm:character-update` and `dm:chat-timeout` are ALREADY dispatcher-wired (do not double-apply).**

Two inbound paths exist and only the store dispatcher is relay-fed:

1. *Store dispatcher* — host `new GameAuthority(transport)` (`stores/network-store/index.ts:119`) and client `transport.onMessage((from, msg) => handleClientMessage(...))` (`stores/network-store/index.ts:473`). In cloud mode `transport` is the relay/websocket transport, so this path works.
2. *UI bridges* — `pages/lobby/use-lobby-bridges.ts` mounts `useCharacterSelectBridge` (`:96`), `useChatBridge` (`:130`), `useCharacterUpdateBridge` (`:201`), `useModerationBridge` (`:237`), `useChatTimeoutBridge` (`:270`); the in-game chat bridge lives in `components/game/GameLayout.tsx:346`. Every one subscribes `onHostMessage` (`:113,181,294`) / `onClientMessage` (`:115,189,205,241,296`; `GameLayout.tsx:16,346`), which are re-exports of the **P2P** host-manager / client-manager `onMessage` emitters (`network/index.ts:7` `onMessage as onClientMessage`, `:27` `onMessage as onHostMessage`).

In a cloud session there is no PeerJS mesh; the P2P `client-manager` / `host-manager` `onMessage` emitters are **never invoked**, so the bridges receive nothing. For the bridge-only types this is fatal:

- *Symptom 3 (chat)* — a player's `chat:message` reaches the host transport; `handleHostMessage` only re-broadcasts it (`host-handlers.ts:156-164`, `broadcastExcluding`) and never writes the host's own chat log. The host's chat log + the client's display of others' chat are written **only** by `useChatBridge` over `onHostMessage`/`onClientMessage`. Dead in cloud → DM never sees player chat and vice-versa.
- *Symptom 5 (character-select)* — `player:character-select` carries `characterData`; only `useCharacterSelectBridge` (`use-lobby-bridges.ts:96-118`, via `onHostMessage`) stores it into `useLobbyStore.remoteCharacters` via `setRemoteCharacter`. `handleHostMessage`'s `player:character-select` case (`host-handlers.ts:146-154`) updates only the peer's `characterId`/`characterName`, never `remoteCharacters`. Dead in cloud → `remoteCharacters` stays empty (root of CH-1 / PHASE-50).

**Reproduction:**
1. Host a campaign with `hostingMode: cloud`; have a second client join via the relay.
2. Player types in chat → DM sees nothing (and vice-versa for non-self messages).
3. Player selects a character → the DM's view of that PC is empty.

**Expected:** cloud inbound feeds the same consumers P2P does.

**Root cause (file:line):** bridges subscribe `onHostMessage`/`onClientMessage` (`pages/lobby/use-lobby-bridges.ts:10,113,115,181,189,205,241,294,296`; `components/game/GameLayout.tsx:16,346`) = the P2P emitters (`network/index.ts:7,27`); the relay path terminates at the dispatcher only (`stores/network-store/index.ts:119` host, `:473` client), which has no case for `chat:message`/`chat:file` and does not store `player:character-select` `characterData`.

Verification:

```bash
cd dnd-app/src/renderer/src
grep -n "onMessage as onClientMessage\|onMessage as onHostMessage" network/index.ts
grep -n "onHostMessage\|onClientMessage\|useChatBridge\|useCharacterSelectBridge\|setRemoteCharacter" pages/lobby/use-lobby-bridges.ts
grep -n "transport.onMessage\|new GameAuthority\|onClientMessage" stores/network-store/index.ts
grep -n "case 'chat:message'\|case 'chat:file'\|case 'player:character-select'\|case 'chat:whisper'\|case 'dm:chat-timeout'" stores/network-store/client-handlers.ts
sed -n '139,170p' stores/network-store/host-handlers.ts
sed -n '162,178p' stores/network-store/client-handlers/game-action-handlers.ts   # proves dm:character-update already applies
```

**Fix direction:** unify the inbound fan-out so the relay transport feeds the same subscriber set as P2P, scoped to (or idempotent for) the bridge-only types. Option (a) adapter shim re-emitting relay frames into `onHostMessage`/`onClientMessage` — smallest change; gate it so already-dispatcher-handled types (`dm:character-update`, `dm:chat-timeout`) are not double-applied (e.g. only forward `chat:message`/`chat:file`/`player:character-select`, or make the bridges' effects idempotent). Option (b) move the chat + character-select bridge logic into `handleClientMessage`/`handleHostMessage` cases. Either resolves symptoms 3 and 5 and unblocks PHASE-50/51.

**Affected components:** `network/index.ts` (bus re-exports), `stores/network-store/index.ts` (cloud wiring), `pages/lobby/use-lobby-bridges.ts`, `components/game/GameLayout.tsx`, `stores/network-store/host-handlers.ts` / `client-handlers.ts` (missing chat / character-select-store cases).

## Sub-phases

> Per-sub-phase cheap check: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` on the changed surface + the affected vitest file(s). CI runs the full gate on push. The runtime "chat appears in a two-window cloud game" effect is verified by the 4-gate + the implementer's repro; do not stop for "needs a running app".

### 49A — Verify the dispatch split + pin which types are bridge-only

**Objective:** before writing the adapter, lock down exactly which inbound message types die in cloud vs. are already dispatcher-handled, so 49B doesn't double-apply.

**Files:** read-only across `network/index.ts`, `stores/network-store/index.ts`, `client-handlers.ts`, `host-handlers.ts`, `client-handlers/game-action-handlers.ts`, `pages/lobby/use-lobby-bridges.ts`, `components/game/GameLayout.tsx`; capture the result as a short table in this plan's Completed section.

**Steps:**

1. Enumerate every type each bridge consumes (chat, character-select, moderation, chat-timeout, in-game chat) and confirm whether `handleClientMessage`/`handleHostMessage` already has a case for it.
2. Confirm `dm:character-update` (dual-write) and `dm:chat-timeout` are dispatcher-handled (so the adapter must skip or idempotently handle them).
3. Produce the definitive bridge-only set: `chat:message`, `chat:file`, `player:character-select` (+ any moderation type found to lack a dispatcher case).

**Acceptance:** the bridge-only vs. already-handled table is recorded; 49B's scope is unambiguous.

### 49B — Adapter: feed cloud relay inbound to the bridges (bridge-only types)

**Objective:** in a cloud session, the bridge-only inbound types reach `onHostMessage`/`onClientMessage` consumers exactly as in P2P, with no double-apply of dispatcher-handled types.

**Files:** the cloud wiring in `stores/network-store/index.ts` (host `GameAuthority`/client `transport.onMessage` sites) and/or `network/index.ts` (bus emitters); a test (e.g. `network-store` cloud-inbound or a `use-lobby-bridges` test).

**Steps:**

1. Implement option (a): in the cloud host inbound and cloud client `transport.onMessage` handlers, after the dispatcher runs, re-emit the frame into the existing `onHostMessage`/`onClientMessage` emitter — but only for the bridge-only type set from 49A (or guard each forwarded type for idempotency).
2. Keep P2P behavior byte-for-byte unchanged (the P2P path already drives the emitters; do not double-drive there).
3. Test: a simulated cloud inbound `chat:message` reaches a `useChatBridge` subscriber and writes the chat log; a cloud `player:character-select` populates `remoteCharacters`; a cloud `dm:character-update` is applied exactly once (not twice).

**Acceptance:** vitest green; `tsc` clean; cloud chat + character-select reach the bridges (implementer-confirmed in a two-window cloud game); no message type is applied twice; P2P unaffected.

## Completed

### Completed — 2026-06-28 (dnd-phase-executer, verify-don’t-rebuild)

Verified against the live tree (`auto/dnd-phase-executer` off `origin/master`): **TR-1 is fully implemented and shipped** in commit `abab8b89` (`fix(mp): resolve multiplayer QA findings`), released in **v2.6.3**.

- **49A:** cloud HOST re-emits each inbound frame onto the host-manager bus via `emitHostMessage(message, ctx.peerId)` (`stores/network-store/index.ts:130`, after `handleHostMessage`); cloud CLIENT re-emits via `emitClientMessage(message)` (`:493`, after `handleClientMessage`). New emitters `network/host-manager.ts:emitHostMessage` + `network/client-manager.ts:emitClientMessage`, re-exported from `network/index.ts`.
- **No double-apply:** in cloud mode the store dispatcher runs DIRECTLY (not as a bus subscriber), so the re-emit drives ONLY the UI bridges — identical net effect to P2P (one bus drives both there). Pinned by the new `cloud TR-1 bridge re-emit` host+client tests in `stores/network-store/index.cloud.test.ts`.
- **49B:** bridge-only types (`chat:message`, `chat:file`, `player:character-select` data) reach the bridges in cloud games.

No code change required this run — pre-existing, CI-green, released. Plan moved to `completed/`.

_Authored 2026-06-24 from QA-report-2026-06-24-multiplayer.md (TR-1)._
