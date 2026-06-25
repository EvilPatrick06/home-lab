Tested: dnd-vtt v2.6.2 — 2026-06-24 — **MULTIPLAYER PASS** (Cloud Relay + Local/Direct P2P)

> First QA pass scoped to **multiplayer**. Prior passes (`QA-report-2026-06-19`,
> `WEB-QA-report-2026-06-2x`) were single-player / web; the two-window MP matrix
> was blocked in the 06-19 run ("player cannot discover/join"), so cloud + local
> co-op state sync had never been exercised end-to-end. The user manually drove a
> real cloud session (DM + player on the BMO Cloud relay) and a local/direct host
> session and reported the symptoms triaged below.
>
> Findings grouped by subsystem: **transport / state-sync / roles / character-sharing /
> local-host NAT**. Each finding gives symptom, severity, root cause (file:line +
> mechanism), affected components, and a suggested fix direction for the planner.
> Investigation was read-only on the code; no app source was changed.

## Top findings (Critical & High)

_Critical (1):_

1. **[Critical] Cloud relay delivers messages only to the store dispatcher, never to the UI "bridges" — so chat, character-sharing, moderation, and most live state silently die in any cloud game.** A single wiring gap: cloud inbound flows through `transport.onMessage → handleClientMessage` / `GameAuthority(handleHostMessage)`, but every UI bridge (`useChatBridge`, `useCharacterSelectBridge`, `useCharacterUpdateBridge`, `useModerationBridge`, `useChatTimeoutBridge`) and several message types (`chat:message`, `chat:file`, `player:character-select`) are wired ONLY to the legacy P2P pub/sub buses `onHostMessage` / `onClientMessage`, which the relay never feeds. **Shared root cause of symptoms 3, 5, 6 (player side), and the overall "nothing syncs" feel (8).** (Transport / dispatch)

_High (4):_

2. **[High] Local/direct (non-cloud) host can't open a WebRTC data channel — players are rejected at the lobby with the "firewall or NAT" error (symptom 9).** The default self-host ICE config provides **no reachable TURN relay** and there is **no automatic relay fallback**, so any client that can't form a direct/STUN-reflexive pair with the host's Electron process never gets a candidate pair and times out. (Local-host NAT)

3. **[High] Host-only lobby UI is absent for the cloud DM — no Start Game button (symptom 1), no DM chat controls (symptom 2), and promote/demote doesn't propagate (symptom 4).** These all hinge on host-role state reaching the lobby store + the host's intents reaching players; the most likely trigger is the cloud relay's known connect/reconnect flakiness tripping the lobby-reset effect. Needs a live repro to pin the exact trigger; diagnosis + suspects below. (Roles)

4. **[High] DM↔player game-state diverges in cloud — players don't see map/drawing/token changes; views differ (symptom 7).** The shard sync layer IS transport-wired for the relay, so the divergence points at the per-recipient permission filter denying state to cloud joiners that aren't in the campaign roster, compounded by the non-shard state that rides the dead bus (finding 1). (State-sync)

5. **[High] DM editing a player's character writes the PC into the DM's OWN saved-character library (symptom 6, second half).** `saveAndBroadcast` persists the edited player PC to the local character store unconditionally — transport-independent data-integrity bug that pollutes the DM's character list. (Character-sharing)

---

## Symptom → root-cause map (which are shared)

| # | Symptom | Cluster | Root cause | Shared with |
|---|---|---|---|---|
| 1 | Cloud DM: no Start Game button | Roles | host-role/lobby `isHost` not stable in cloud session | 2, 4 |
| 2 | Cloud DM: no chat controls / input | Roles | same host-only-UI gate (`useLobbyStore.isHost`) | 1, 4 |
| 3 | Cloud DM: no chat from players | Transport | **dispatch-bus gap** (relay never feeds `onHostMessage`) | 5, 6, 8 |
| 4 | Promote/demote doesn't reflect player-side | Roles | host intent broadcast / lobby host state in cloud | 1, 2 |
| 5 | DM clicks player PC → "no character found" | Char-sharing | `remoteCharacters` never populated (= bus gap) | 3, 6 |
| 6 | DM edit applies DM-side only + saved to DM's list | Char-sharing | (a) player-apply via dead bus; (b) unconditional local `saveCharacter` | 3, 5 (part a) |
| 7 | Players don't see map/drawings/tokens | State-sync | shard permission-filter vs. roster + bus gap for non-shard state | 8 |
| 8 | Overall: nothing stays in sync | (aggregate) | dominated by **dispatch-bus gap** (finding 1) | 3, 5, 6, 7 |
| 9 | Local host: "couldn't open a data channel" | Local-host NAT | no TURN/relay fallback in default ICE | — |

**Two clusters dominate.** The **dispatch-bus gap (finding 1)** is the single shared root cause behind 3, 5, 6(player-apply), and the aggregate "nothing syncs" perception (8). The **local-host TURN gap (finding 9 / TR-2)** is fully independent. The **character-persistence leak (6b)** is independent of transport. The **roles cluster (1, 2, 4)** and the **shard-divergence (7)** are role/permission-adjacent but distinct from the bus gap and are the two areas that most need a live repro to finish pinning.

---

## Transport / dispatch

### TR-1 — [Critical] Cloud relay inbound never reaches the UI message bridges (`onHostMessage`/`onClientMessage`)

- **Category:** bug
- **Severity:** critical
- **Domain:** dnd-app
- **Discovered by:** MP Investigation
- **During:** cloud game — DM and player exchanging chat, character selects, moderation
- **Symptoms covered:** 3 (DM gets no player chat), 5 (no character found), 6 player-apply, contributes to 8.

**Description:** The app has **two independent inbound dispatch paths** and the cloud relay only ever feeds one of them:

1. *Store dispatcher* — `handleClientMessage` (client) / `GameAuthority → handleHostMessage` (host). In cloud mode this is correctly wired over the relay transport (`network-store/index.ts:473` client `transport.onMessage(... handleClientMessage)`; `index.ts:119-121` host `new GameAuthority(transport)`).
2. *UI bridges* — `useChatBridge`, `useCharacterSelectBridge`, `useCharacterUpdateBridge`, `useModerationBridge`, `useChatTimeoutBridge` (`pages/lobby/use-lobby-bridges.ts`) and the in-game chat bridge (`components/game/GameLayout.tsx:240`). Every one of these subscribes `onHostMessage` / `onClientMessage`, which are re-exports of the **P2P** host-manager / host-connection `onMessage` emitters (`network/index.ts:7` `onMessage as onClientMessage`, `network/index.ts:27` `onMessage as onHostMessage`).

In a cloud session there is no PeerJS mesh, so the P2P host-manager / host-connection emitters are **never invoked** — only the relay transport delivers frames. The bridges therefore receive nothing.

Crucially, the affected message types have **no handler in the store dispatcher either**: `handleClientMessage` has cases for `chat:whisper` (`client-handlers.ts:393`) but **none for plain `chat:message` / `chat:file`**, and `handleHostMessage` only *re-broadcasts* `chat:message` / `player:character-select` (`host-handlers.ts:146`, `:156-157`, `:161-162`) without storing them locally. So the bridge is the **sole** consumer of those types — and it is dead in cloud.

**Result mechanism per symptom:**
- *Symptom 3* — a player's `chat:message` reaches the host transport and `handleHostMessage` re-broadcasts it, but the host's own chat log is only written by `useChatBridge`'s `onHostMessage` subscription → DM never sees it. Same for client display of others' chat.
- *Symptom 5* — `player:character-select` carries `characterData`; only `useCharacterSelectBridge` (`use-lobby-bridges.ts:96-118`, via `onHostMessage`) stores it into `useLobbyStore.remoteCharacters`. Dead in cloud → `remoteCharacters` stays empty (see CH-1).
- *Symptom 6 (player side)* — `dm:character-update` is applied to the player only by `useCharacterUpdateBridge` (`use-lobby-bridges.ts:201-234`, via `onClientMessage`); `handleClientMessage` has no `dm:character-update` case. Dead in cloud → the player never receives the DM's edit.

**Reproduction:**
1. Host a campaign with `hostingMode: cloud`; have a second client join via the relay.
2. Player types in chat → DM sees nothing (and vice-versa for non-self messages).
3. Player selects a character → DM's view of that PC is empty.

**Expected:** Cloud inbound should feed the same consumers P2P does.

**Root cause (file:line):** `pages/lobby/use-lobby-bridges.ts:112-116, 130-198, 201-298` + `components/game/GameLayout.tsx:240` subscribe `onHostMessage`/`onClientMessage` (`network/index.ts:7,27`), which the relay path never drives. Cloud inbound terminates at `network-store/index.ts:473` (client) and the host `GameAuthority` (`index.ts:119`).

**Suggested fix direction:** Unify the inbound fan-out so the relay transport feeds the same subscriber set as P2P. Two clean options for the planner to phase: (a) have the cloud `transport.onMessage` handler re-emit each frame into the existing `onHostMessage`/`onClientMessage` emitter (a single adapter shim so all bridges work unchanged); or (b) migrate the bridge logic (chat/character/moderation) out of the P2P-only buses into `handleClientMessage`/`handleHostMessage` cases that both transports already drive. Option (a) is the smaller, lower-risk change and immediately resolves 3, 5, and 6(player-apply).

**Affected components:** `use-lobby-bridges.ts`, `GameLayout.tsx` (in-game chat bridge), `network/index.ts` (bus re-exports), `network-store/index.ts` (cloud wiring), `host-handlers.ts` / `client-handlers.ts` (missing chat/character cases).

---

## State-sync / replication

### SS-1 — [High] DM↔player state divergence in cloud (map / drawings / tokens) — symptom 7 / 8

- **Category:** bug
- **Severity:** high
- **Domain:** dnd-app
- **Discovered by:** MP Investigation
- **During:** cloud game — DM moving tokens, drawing, switching maps

**Description:** The shard replication layer is **transport-agnostic and IS wired for the relay** on both ends: host `createShardBroadcaster(transport)` (`network-store/index.ts:123-128`) and client `createShardApplier(transport)` (`index.ts:470-471`). The broadcaster subscribes every registered shard and ships `sync:delta` over `transport.broadcast` / `transport.send` (`sync/broadcaster.ts:65-145`); the applier applies them (`sync/applier.ts:28-51`). So shard-managed state (tokens, drawings, fog, walls, regions, initiative, conditions, turn-states, party-vision) is architecturally *capable* of syncing in cloud, and the relay explicitly authorizes `sync:delta` from the host (`bmo/pi/services/game_relay.py:31,249`).

Given that, the observed divergence most plausibly comes from two places:

1. **Per-recipient permission filtering keyed on a roster the cloud joiner isn't in.** For a shard with a `permissionFilter`, the broadcaster abandons the broadcast and ships a per-recipient `replace` of `permissionFilter(next, recipient.clientId)` (`sync/broadcaster.ts:81-89`). Recipients come from `get().peers.map(... clientId ...)` (`index.ts:124`). A cloud player's `clientId` is its locally-generated `getOrCreateClientId()` — if the filter resolves visibility/ownership against the campaign's player roster and that `clientId` isn't enrolled, deny-by-default strips DM-only (or all) tokens for that peer → the player sees fewer/different tokens than the DM ("views diverge"). This is consistent with "tokens differ DM vs player."
2. **Non-shard state rides the dead bus.** `dm:map-change`, `dm:drawing-add`, `dm:token-move` *are* handled by `handleClientMessage` (`client-handlers.ts:312-342`), but the surrounding chat/character/role context that rides `onHostMessage`/`onClientMessage` is dead (TR-1), so the player's overall view never fully reconciles → reinforces the "nothing syncs" impression (symptom 8).

**Confidence note:** (1) is the strongest concrete mechanism but should be confirmed with a live repro — the filtered shards' `permissionFilter` implementations and the cloud peer's `clientId`↔roster mapping need to be observed against a real session. The shard plumbing itself is sound.

**Reproduction:** Cloud game; DM places/moves tokens and draws → compare DM and player canvases.

**Expected:** Player canvas mirrors the DM's (modulo intentionally hidden DM-only tokens), token positions identical.

**Root cause (file:line):** `sync/broadcaster.ts:81-89` (per-recipient filter keyed on `recipient.clientId`) + the cloud recipient list `network-store/index.ts:124`; aggravated by TR-1.

**Suggested fix direction:** Verify the cloud joiner's `clientId` is registered in the campaign roster the `permissionFilter` consults (enroll the relay peer on join), and add a regression test for a filtered shard (tokens/fog) delivering to a cloud recipient. Resolve TR-1 in tandem so the full state picture reconciles.

**Affected components:** `sync/broadcaster.ts`, `sync/shards/tokens-shard.ts` / `fog-shard.ts` / `drawings-shard.ts` (permissionFilter), `network-store/index.ts` (cloud recipients + initial `game:state-full` seed at `index.ts:150-174`).

### SS-2 — [Info] Relay correctly carries state, not just presence (positive finding)

- **Category:** debt
- **Severity:** info
- **Domain:** dnd-app

**Description:** Worth recording for the planner: the relay is **not** presence-only. `game_relay.py`/`game_relay_ws.py` route `sync:delta`, `game:state-*`, and `dm:*` with a host-only authority gate (`game_relay.py:224-256`) and host re-election for co-DMs (`:162-187`). The cloud host also seeds joiners with `game:state-full` + a map-image `game:state-update` (`network-store/index.ts:150-174`). So the "no sync" symptoms are **client-app wiring gaps (TR-1, SS-1), not a relay transport limitation.** The transport is the healthy part of the stack.

---

## Roles / host-authority

### RL-1 — [High] Cloud DM lacks host-only lobby UI; promote/demote doesn't propagate — symptoms 1, 2, 4

- **Category:** bug
- **Severity:** high
- **Domain:** dnd-app
- **Discovered by:** MP Investigation
- **During:** cloud lobby — DM expecting Start Game + chat controls; DM promoting a player

**Description:** Three host-side controls fail for the cloud DM:
- *Symptom 1* — Start Game button. `ReadyButton` renders it only when `useLobbyStore.isHost` (`components/lobby/ReadyButton.tsx:80`).
- *Symptom 2* — DM chat controls (slow-mode / files / auto-mod row). Gated on the same `useLobbyStore.isHost` (`components/lobby/ChatInput.tsx:182`). (The plain text chat input at `ChatInput.tsx:283` always renders, so "no chat input box at all" most likely describes the missing DM control row + chat being non-functional via TR-1.)
- *Symptom 4* — promote/demote. The DM control lives in the lobby `PlayerList` and sends `dm:promote-codm` / `dm:demote-codm` / `dm:role-change` via `sendMessage` (`components/lobby/PlayerList.tsx:123,128,141,145`), gated on the `promote_codm` permission and host view.

By static reading, the cloud path *should* satisfy all three: `hostGame(cloud)` sets `role:'host'` + `localIsDM:true` (`network-store/index.ts:230,256-261`); `LobbyPage` mirrors that into the lobby store via `setIsHost(role === 'host')` (`pages/LobbyPage.tsx:60,315`); promote intents broadcast through the host outbound override (`index.ts:110-117`) and the relay authorizes host `dm:*` (`game_relay.py:251-255`); and the player applies `dm:promote-codm` / `dm:transfer-dm` directly in `handleClientMessage` (`client-handlers.ts:188-213`). So the *reported* failure means one of those is breaking at runtime.

**Primary suspect:** the lobby-reset effect. `LobbyPage` calls `resetLobby()` from an effect keyed on connection state/error (`pages/LobbyPage.tsx:142`, deps include `connectionState`/`error`), and `resetLobby` clears `isHost` back to `false` (`stores/use-lobby-store.ts:220` default). The cloud relay is known-flaky on connect/reconnect — `websocket-transport.ts:55-81` documents `connect_error` spam, polling-vs-WS upgrade issues, and Cloudflare Access blocking `/socket.io` off-LAN. A transient `connectionState` flip to `error`/`disconnected` after the lobby mounts would fire `resetLobby()` and silently strip `isHost` (→ symptoms 1 & 2), and the same instability would drop the host's outbound promote (→ symptom 4). Secondary possibility: promote propagation is partially entangled with the dead bus (TR-1) for the lobby-player mirror.

**Confidence note:** This is the one cluster I could not fully close by static reading — the gates and setters are individually correct, so the failure is a runtime/ordering issue. Flagged for a live two-window repro to confirm the `resetLobby` trigger (watch `useLobbyStore.isHost` + `connectionState` during a cloud session).

**Reproduction:** Host cloud game → land in lobby → observe Start Game / DM chat-control row absent; promote a joined player → player's badge/abilities unchanged.

**Expected:** Cloud DM sees Start Game + DM chat controls; promote/demote reflects on the target client.

**Root cause (file:line):** gates `ReadyButton.tsx:80`, `ChatInput.tsx:182`, `PlayerList.tsx:123-145`; host-state setter `LobbyPage.tsx:315`; prime suspect reset `LobbyPage.tsx:142` + `use-lobby-store.ts:220`; relay instability `websocket-transport.ts:55-81`.

**Suggested fix direction:** Make lobby host-state resilient to transient cloud reconnects — don't `resetLobby()` (or don't clear `isHost`) on a recoverable `connectionState` blip while `role === 'host'`; re-assert `setIsHost` whenever `role` is `host`. Then re-test promote propagation once TR-1 and the reconnect handling are fixed. Add a cloud-host lobby test asserting `isHost` survives a simulated `connect_error`.

**Affected components:** `LobbyPage.tsx`, `use-lobby-store.ts`, `ReadyButton.tsx`, `ChatInput.tsx`, `PlayerList.tsx`, `websocket-transport.ts`.

---

## Character ownership / sharing

### CH-1 — [High] DM can't open a player's character in cloud — "no character found" (symptom 5)

- **Category:** bug
- **Severity:** high
- **Domain:** dnd-app
- **Discovered by:** MP Investigation
- **During:** cloud game — DM clicking a player's PC

**Description:** The DM view of a player's sheet resolves the character as `storeCharacter ?? remoteCharacters[id]` (`pages/CharacterSheet5ePage.tsx:49-51`). The player's PC is not in the DM's local `useCharacterStore`, so it can only come from `useLobbyStore.remoteCharacters` — which is populated **exclusively** by `useCharacterSelectBridge` over `onHostMessage` (`use-lobby-bridges.ts:96-118`). Per TR-1 that bridge is dead in cloud, and `handleHostMessage`'s `player:character-select` case only re-broadcasts (`host-handlers.ts:146`), never storing the data host-side. So `remoteCharacters[id]` is undefined → the sheet shows the not-found path.

**Reproduction:** Cloud game; player selects a character; DM clicks that player's PC → "no character found".

**Expected:** DM opens the player's current sheet.

**Root cause (file:line):** resolution `CharacterSheet5ePage.tsx:49-51`; missing population path = TR-1 (`use-lobby-bridges.ts:96-118` not fed; `host-handlers.ts:146` doesn't store).

**Suggested fix direction:** Fixing TR-1 restores `remoteCharacters` population. Belt-and-suspenders: have `handleHostMessage`'s `player:character-select` case (`host-handlers.ts:146`) also call `useLobbyStore.setRemoteCharacter(...)` so the host stores the PC regardless of transport.

**Affected components:** `CharacterSheet5ePage.tsx`, `use-lobby-bridges.ts`, `host-handlers.ts`, `use-lobby-store.ts` (`remoteCharacters`).

### CH-2 — [High] DM edits to a player's PC apply DM-side only AND are saved into the DM's own character library (symptom 6)

- **Category:** bug
- **Severity:** high
- **Domain:** dnd-app
- **Discovered by:** MP Investigation
- **During:** cloud game — DM editing a player's sheet

**Description:** Two distinct defects:

- **(a) Player never receives the edit (cloud).** `useCharacterEditor.broadcastIfDM` / sheet edit send `dm:character-update` (`hooks/use-character-editor.ts:21-28`, `CharacterSheet5ePage.tsx:155-161`). The player applies it only via `useCharacterUpdateBridge` over `onClientMessage` (`use-lobby-bridges.ts:201-234`); `handleClientMessage` has no `dm:character-update` case. Dead in cloud (TR-1) → the change stays DM-side. **Shares root cause with TR-1.**
- **(b) Player's PC is persisted into the DM's saved characters.** `saveAndBroadcast` calls `useCharacterStore.getState().saveCharacter(updated)` unconditionally (`hooks/use-character-editor.ts:31-32`; same pattern `CharacterSheet5ePage.tsx:138-142`). `saveCharacter` writes to the **local** character store/disk — the DM's personal character library — so editing a player's PC inserts that PC into the DM's "My Characters" list. **Transport-independent**: this also happens in P2P; it only surfaced now because MP was never exercised. This is a data-integrity bug (the DM's library gets polluted with players' characters).

**Reproduction:** Cloud game; DM opens a player's sheet, changes HP; (a) player's sheet unchanged; (b) DM's Characters list now contains the player's PC.

**Expected:** DM edits sync to the owning player and are NOT persisted into the DM's local character library (the player owns persistence).

**Root cause (file:line):** (a) `use-character-editor.ts:21-28` / `CharacterSheet5ePage.tsx:155-161` apply path dead via TR-1 (`use-lobby-bridges.ts:201-234`); (b) `use-character-editor.ts:31-32` + `CharacterSheet5ePage.tsx:138-142` unconditional `saveCharacter`.

**Suggested fix direction:** (a) resolved by TR-1. (b) Gate persistence on ownership: when the local user is the DM editing a PC they don't own (`updated.playerId !== 'local'`), update `remoteCharacters` + broadcast `dm:character-update` but do **not** call the local `saveCharacter` (let the owning player persist on receipt — that path already saves to disk only when the character exists locally, `use-lobby-bridges.ts:213-228`).

**Affected components:** `hooks/use-character-editor.ts`, `pages/CharacterSheet5ePage.tsx`, `use-lobby-bridges.ts`, `use-character-store.ts`.

---

## Local-host NAT / transport

### TR-2 — [High] Local/direct (non-cloud) host: WebRTC data channel never opens — players blocked at the lobby (symptom 9)

- **Category:** bug
- **Severity:** high
- **Domain:** dnd-app
- **Discovered by:** MP Investigation
- **During:** local self-host (P2P) — player joining via invite code

**Description:** With a local/direct host, PeerJS signaling succeeds (the host's peer ID resolves — otherwise `peer-unavailable` fires), but the **WebRTC data channel** times out, producing the user's exact error at `network/client-manager.ts:253-259` ("Found that game but couldn't open a data channel. Likely a firewall or NAT issue…").

Root cause is the default ICE configuration: `getDefaultIceServers()` (`network/peer-manager.ts:23-37`) returns, for an insecure (LAN, http base) self-host, **STUN-only** `[{ urls: 'stun:<host>:3478' }]` (and the secure/off-LAN path only *adds public STUN*). **Neither path supplies a TURN relay** — Phase 20c deliberately removed the only bundled TURN credentials (`peer-manager.ts:17-22`) and never replaced them with a runtime-reachable relay. Combined with `forceRelay = false` by default (`peer-manager.ts:84`, `iceTransportPolicy` stays `'all'`), any client that cannot form a direct host candidate or a STUN server-reflexive pair with the host's Electron process — symmetric NAT, AP/client isolation, a host-side firewall blocking the Electron app's UDP, or simply a player not on the host's L2 LAN — gets **no nominated candidate pair** and the data channel times out. There is **no automatic relay fallback**: TURN only exists if the user manually enters credentials in Network Settings (`setIceConfig`, `peer-manager.ts:90`), and the `stun:<host>:3478` entry silently assumes the Pi runs a STUN/coturn listener on 3478 (unverified — a deployment item).

**Reproduction:** Set a campaign to local/self-host; have a player on a different network (or behind a restrictive NAT/firewall) join → ~`CONNECTION_TIMEOUT_MS` later, the firewall/NAT error; player never enters the lobby.

**Expected:** Joins succeed across common NAT setups, or degrade gracefully to a relay.

**Root cause (file:line):** `network/peer-manager.ts:23-37` (no TURN in default ICE) + `:84` (`forceRelay=false`, no relay fallback) → timeout surfaced at `network/client-manager.ts:253-259`.

**Suggested fix direction:** (1) Stand up / point to a reachable TURN server (coturn on the always-on Pi) and include it in the default self-host ICE set (mirrors how `configureForP2P` already points signaling at the Pi). (2) Add an automatic fallback: on data-channel timeout, offer/auto-switch the join to the cloud relay (the relay works behind any NAT and is already the off-LAN default — `registry-client.ts:120-122`). (3) Verify coturn is actually listening on `<host>:3478` before advertising `stun:<host>:3478`. This is part config (deploy TURN), part app logic (fallback) — see depth assessment below.

**Affected components:** `network/peer-manager.ts`, `network/client-manager.ts`, BMO Pi infra (coturn deployment), Network Settings (TURN entry UX).

---

## Fix-depth assessment (for the planner)

- **TR-1 (cloud dispatch-bus gap):** moderate, localized. A single adapter that re-emits relay frames into the existing `onHostMessage`/`onClientMessage` buses fixes 3, 5, and 6(a) at once. Low blast radius; high payoff. **Phase this first — it unblocks the most symptoms.**
- **CH-2(b) (saveCharacter leak):** small, surgical — an ownership guard around one `saveCharacter` call. Transport-independent; can ship independently.
- **CH-1, 6(a):** mostly resolved by TR-1 + a one-line host-side `setRemoteCharacter`.
- **SS-1 (shard divergence):** moderate — likely an enrollment/roster fix for cloud peers feeding the `permissionFilter`, plus a regression test. Needs a live repro to confirm the exact filter behavior; not an architectural rewrite (the shard plumbing is sound).
- **RL-1 (roles / host-only UI):** moderate but **needs a live repro** to confirm the `resetLobby`-on-reconnect trigger; the fix (don't drop `isHost` on a recoverable blip) is small once confirmed. The deeper, related work is hardening the relay connection lifecycle (`websocket-transport.ts` connect/reconnect, Cloudflare Access on `/socket.io`).
- **TR-2 (local-host TURN):** part **infra/config** (deploy coturn on the Pi, add to default ICE) and part **app logic** (auto-fallback to the relay on data-channel timeout). Not architectural, but it does touch deployment — the cleanest user-facing fix is the relay auto-fallback.

**Bottom line:** none of these require an architectural rewrite of the networking stack. The transport + shard layers are fundamentally sound (SS-2). The breakage is (1) a missing adapter between the relay and the legacy UI bridges (TR-1, the big one), (2) a couple of ownership/persistence + permission-roster bugs (CH-2b, SS-1), (3) lobby host-state resilience to relay reconnects (RL-1), and (4) a missing TURN/relay fallback for local hosting (TR-2). TR-1 alone clears the majority of the reported cloud symptoms.

---

## Verification performed

- Read-only investigation against the live checkout at `/home/patrick/home-lab/dnd-app` (v2.6.2) — networking (`src/renderer/src/network/**`), the network store + handlers (`stores/network-store/**`), lobby + game UI (`components/lobby/**`, `components/game/**`, `pages/**`), character editor/sheet, permissions, and the Pi relay (`bmo/pi/services/game_relay.py`, `bmo/pi/routes/game_relay_ws.py`).
- Traced each of the 9 reported symptoms to a concrete file:line + mechanism; cross-checked the relay's authorize/route logic and the shard broadcaster/applier wiring to confirm the transport is sound (SS-2) and isolate the breakage to client-app wiring.
- Confidence is high for TR-1, CH-1, CH-2, TR-2 (closed by static reading). RL-1 and SS-1 are diagnosed with a primary mechanism + named suspects and are flagged for a live two-window repro to finish pinning the runtime trigger — called out explicitly rather than overstated.
- No app source modified; this report is the only artifact.
