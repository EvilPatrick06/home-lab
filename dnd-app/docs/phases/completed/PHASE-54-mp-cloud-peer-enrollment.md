# PHASE-54 — Multiplayer cloud peer enrollment & readiness resilience

> Authored from the 2026-06-24 multiplayer REPRO report (dnd-vtt v2.6.2, live two-window Cloud Relay confirmation). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Fix the **unifying multiplayer root cause the live two-window repro confirmed**: a cloud joiner is identified by an **ephemeral per-connection id** (`cloud-<uuid>` peer-id + a fresh Socket.IO `sid`), so every (re)connect mints a brand-new room member that is **never reconciled into the host's authoritative peer roster against its stable `dndapp:client-id`.** The repro drove a real DM window + a distinct player window over the Pi relay and observed the player **relay-connected in the banner yet ABSENT from the host's `game:state-full` `peers[]`**, and after reconnect churn **both sides split-brain to "1 connected."** Three reported symptom clusters fall directly out of this one cause: (a) the Start control's readiness gate never clears ("Waiting for Players…"), (b) per-recipient permission-filtered broadcasts (tokens / map / drawings **and** chat) drop the unenrolled peer, and (c) split-brain. This phase enrolls/reconciles cloud peers by stable client-id and makes lobby readiness survive a recoverable reconnect. PLANNING ONLY — this phase authors the plan; no app code changes here.

## Why this re-opens PHASE-51 / re-scopes PHASE-52 (verify-don't-rebuild)

This report is the **live confirmation pass** the prior multiplayer triage (`QA-report-2026-06-24-multiplayer.md`) explicitly deferred to "needs a live repro." Its findings materially correct two phases that were closed on static reading:

- **PHASE-51 (cloud state-sync) was closed 2026-06-28 "no code change required — the live peer list IS the roster."** The repro shows that conclusion is half-right and operationally wrong: the live `get().peers` list *is* what the permission filter keys on, but it is keyed on the **churning `cloud-<uuid>`/`clientId` of an unenrolled peer**, so the per-recipient filtered `replace` (and the chat re-broadcast) target a peer the relay can no longer resolve → tokens/map/drawings/chat never reach the live player connection. The SS-1 divergence is **still reproducing in v2.6.3**; the enrollment fix PHASE-51 punted on is the actual fix, and it lives here.
- **PHASE-52 (lobby host-state resilience) was closed 2026-06-28 on the `isHost`-reset hypothesis.** The repro **refutes that hypothesis**: `isHost` was **never cleared** — the host's `game:state-full` carried `isHost:true, isDM:true` throughout, and the DM badge, moderation row (Slow mode / Files / Auto-mod, Kick / Ban / Make-DM) and chat input were present the entire session. Symptoms #2 (no DM chat controls) and #4 (promote/demote) **did not reproduce** (promote/demote reflected on the player's card with matching `dm:promote-codm` frames). Symptom #1 ("no Start Game") is **mischaracterised**: the Start control exists (`aria-label="Start game session"`) but renders **disabled / "Waiting for Players…"** because reconnect churn resets the host's `isReady` **and** the player is never enrolled+ready. So PHASE-52's `setIsHost(true)` re-assert (`pages/LobbyPage.tsx:337-350`) addressed a non-defect; the real RL-1 defect is **readiness + enrollment churn**, re-scoped into 54C below. Leave PHASE-52's harmless re-assert in place; do not build further on the `isHost` theory.

## Dependencies & cross-phase notes

- **Builds on PHASE-49 (dispatch-bus adapter), which remains valid but is NOT sufficient alone.** The repro confirms lobby chat is broken **both directions** with two contributing causes: the PHASE-49 bridge gap (relay inbound never feeding `onHostMessage`/`onClientMessage`) **and** the enrollment churn here (the unenrolled `cloud-<uuid>` is filtered out of the per-recipient chat re-broadcast — the host was even observed re-broadcasting the player's frame with `exclude_peer_id`). Even with the bus fed, enrollment churn still starves chat. **Both must land.** Verify 54 after PHASE-49 so the only remaining chat gap is enrollment.
- **Subsumes the open enrollment work from PHASE-51 (SS-1).** 54B is the enrollment/keying fix PHASE-51's 51A deferred; reuse PHASE-51's `broadcaster.ts:81-89` analysis and 51B regression-test scaffold.
- **Re-scopes PHASE-52 (RL-1).** The readiness-resilience half (54C) replaces the `isHost`-reset framing.
- **PHASE-50 (#5, DM clicking a player PC → "no character found") remains untested live.** The repro could not exercise it — the player window had **no character** selected/created. Carry it forward; it needs a live repro with a player character present. Out of scope here beyond the note.
- **PHASE-53 (local TURN / relay fallback) was not exercised** this run — the cloud path was tested, not local/direct P2P. No new data either way; unaffected.
- **Cross-domain:** the keying fix spans the renderer (`dnd-app/`) **and** the Pi relay (`bmo/pi/services/game_relay.py` + its `app.py` Socket.IO glue). Both the `dnd-app-ci.yml` and `bmo-pi-pytest.yml` gates apply.

## Verified findings

All verification was against the live tree (worktree `auto/dnd-phase-maker`); the behavioural claims are from the live two-window cloud repro in the source report.

### MP-EN-1 (high) — cloud peers are keyed on an ephemeral id, never reconciled to the stable client-id (lead finding)

**Status: confirmed live (player relay-connected but absent from host `peers[]`; split-brain after churn); root cause confirmed in source on both client and relay.**

The cloud peer's identity is ephemeral end-to-end:

- **Client mints a fresh peer-id every connect.** `connectCloudSession` builds `self.peerId = genCloudPeerId()` = `cloud-${crypto.randomUUID()}` (`stores/network-store/cloud-session.ts:34,57`). A reconnect calls this again → a **new** `cloud-<uuid>`. The stable id (`getOrCreateClientId()` → `dndapp:client-id`, `utils/client-id.ts:3,16`) is carried as `self.clientId` but is **not** what membership is keyed on.
- **Relay rooms peers by Socket.IO `sid`.** `game_relay.py` `Room.peers: dict[sid → peer-ref]` and `GameRelay.join(code, sid, ref)` index by `sid`. A real socket reconnect gets a **new `sid`**, so the reconnecting client is a brand-new room entry. The re-join preservation path only fires for the **same** sid (`join()`: `prior = room.peers.get(sid)`), which never recurs across a genuine reconnect — so `joined_seq`/seniority and the existing membership are not reused. The old `sid` entry lingers until its `disconnect` → `leave()` lands, and `leave()`/`peer-left` delivery rides the documented Cloudflare-Access/polling flakiness in `network/transport/websocket-transport.ts`.
- **Host roster is the relay's churn, verbatim.** The host enrolls peers from `transport.onPeerJoin(peer => get().addPeer(peer))` (`stores/network-store/index.ts:146-147`); `addPeer` dedupes by `peer.peerId` only (`stores/network-store/index.ts:782-791`), and the host seeds joiners with `game:state-full { peers: [self, ...get().peers...] }` (`:162-167`). So when the relay churns peer-ids, the host roster accumulates a **stale `cloud-<uuid>` plus a new one** (no client-id dedupe), or — if the new `peer-joined` is dropped on the flaky link while the old `peer-left` lands — **loses the peer entirely**. Either way the live player is missing/duplicated in `game:state-full peers[]`, exactly as observed, and prolonged churn leaves each side seeing only itself ("1 connected" → split-brain).

**Reproduction (from the live repro):** two web-build windows (DM + distinct player) over the cloud relay; observe the relay banner shows the player connected while the host's `game:state-full peers[]` omits it; force a reconnect blip → both windows report "1 connected."

**Expected:** a cloud joiner is reconciled to a single stable roster entry (its `dndapp:client-id`); a reconnect updates that entry in place rather than creating a duplicate or orphan; both sides agree on the member count.

**Root cause (file:line):** ephemeral peer-id mint `stores/network-store/cloud-session.ts:34,57`; sid-keyed relay room + same-sid-only re-join `bmo/pi/services/game_relay.py` (`Room.peers`, `join()`); peerId-only host dedupe `stores/network-store/index.ts:782-791`; host roster source for `game:state-full` `stores/network-store/index.ts:162-167`; flaky leave/peer-left delivery `network/transport/websocket-transport.ts`.

Verification:

```bash
cd dnd-app/src/renderer/src
sed -n '30,72p' stores/network-store/cloud-session.ts        # genCloudPeerId + self.clientId
sed -n '780,795p' stores/network-store/index.ts              # addPeer dedupe key
sed -n '144,170p' stores/network-store/index.ts              # onPeerJoin enroll + game:state-full peers[]
sed -n '1,40p' utils/client-id.ts
cd ../../../.. && sed -n '75,130p' bmo/pi/services/game_relay.py   # join(): sid-keyed, same-sid-only preserve
```

**Fix direction:** make the **stable `dndapp:client-id` the membership key** end-to-end. On the **relay**, reconcile a `join` whose `client_id` already exists in the room to the existing entry (replace its `sid`/`peer_id` in place, preserve `joined_seq`/`is_co_dm`/role) instead of adding a duplicate, and prefer client-id over sid when deciding "returning vs new"; emit `peer-left` for the superseded sid only if no live `client_id` remains. On the **client/host**, dedupe `addPeer` by `clientId` (replace the prior entry for the same client) and ensure `getRecipients` / the permission filter key on `clientId`. Add tests (relay: same-client_id new-sid replaces, not duplicates; host: `addPeer` dedupes by clientId).

**Affected components:** `bmo/pi/services/game_relay.py` (+ its `app.py` Socket.IO glue), `stores/network-store/cloud-session.ts`, `stores/network-store/index.ts` (`addPeer`, `getRecipients`, `game:state-full` seed), `network/transport/websocket-transport.ts`.

### MP-EN-2 (high) — permission-filtered broadcasts (tokens/map/drawings + chat) drop the unenrolled peer — symptom #7 CONFIRMED, re-opens PHASE-51 SS-1

**Status: confirmed live (DM saw the full board + the player saw a filtered/empty view; chat crossed neither direction while presence/role/ready events DID cross). Mechanism confirmed in source.**

For a shard that declares a `permissionFilter` with `opts.getRecipients` supplied, the broadcaster ships a per-recipient full `replace` of `permissionFilter(next, recipient.clientId)` (`network/sync/broadcaster.ts:81-89`); recipients come from `get().peers.map(p => ({ peerId: p.peerId, clientId: p.clientId }))` (`stores/network-store/index.ts:135`) and are routed point-to-point via `transport.send(peerId, …)` → relay `route(target_peer_id)` → `_sid_for_peer` (`game_relay.py`). When MP-EN-1 leaves the roster carrying a **stale/duplicate `cloud-<uuid>`**, the filtered `replace` targets a `peer_id` the relay can't resolve (`_sid_for_peer → None → []`, dropped) while the live player connection — under its **new** peer-id — was never added as a recipient. Result: the player receives a filtered/empty board and the canvases diverge. The **same** filter starves chat: the host re-broadcasts the player's `chat:message` with `exclude_peer_id`, but the unenrolled peer is not a resolvable recipient. The tell that this is an enrollment/roster filter problem and **not** a transport outage: **control-plane events (presence / role / ready) cross, filtered payloads don't.**

**Root cause (file:line):** per-recipient filter keyed on `recipient.clientId` `network/sync/broadcaster.ts:81-89`; recipient list `stores/network-store/index.ts:135`; routing resolution `bmo/pi/services/game_relay.py` (`route`/`_sid_for_peer`) — all downstream of MP-EN-1.

Verification:

```bash
cd dnd-app/src/renderer/src
sed -n '78,99p' network/sync/broadcaster.ts
grep -rln "permissionFilter" network/sync/shards/    # tokens / fog / drawings shards
sed -n '130,140p' stores/network-store/index.ts      # getRecipients
```

**Fix direction:** **resolving MP-EN-1 fixes this** — once the roster carries one stable client-id entry per live peer, the per-recipient filtered `replace` and chat re-broadcast resolve to the live connection. Key the permission filter and `getRecipients` on the stable `dndapp:client-id` rather than the ephemeral `cloud-<uuid>`. Restore/confirm PHASE-51's 51B filtered-shard regression test against an *enrolled-by-client-id* cloud recipient (the current `index.cloud.test.ts` asserts delivery to a peer that is enrolled in the test harness — extend it to cover the reconnect/new-peer-id case that the live build fails).

**Affected components:** `network/sync/broadcaster.ts`, `network/sync/shards/*` (filtered shards), `stores/network-store/index.ts`.

### MP-EN-3 (high) — Start readiness gate never clears; host `isReady` reset by reconnect churn — symptom #1 re-characterised, re-scopes PHASE-52 RL-1

**Status: confirmed live (Start control present but disabled "Waiting for Players…"; host `game:state-full isReady:false` after churn; `isHost` never cleared). Gate logic confirmed in source.**

The Start control is a **readiness gate, not a missing control**. `ReadyButton` (host branch) computes `canStartGame = everyoneReady && aiReady && !gameStarting`, where `everyoneReady = allPlayersReady()` and the disabled label is `t('lobby.readyButton.waitingForPlayers')` = "Waiting for Players..." (`components/lobby/ReadyButton.tsx:77,133-134`). `allPlayersReady()` returns `false` when `players.length === 0` and otherwise requires `players.every(p => p.isReady)` (`stores/use-lobby-store.ts:502-509`). So the gate can never clear when (a) the player is never enrolled into the lobby `players` list (MP-EN-1), and/or (b) reconnect churn resets readiness — the cloud peer always (re)connects with `isReady:false` (`cloud-session.ts:62`) and the repro observed the **host's own** `isReady` flipped back to `false` after a blip. `isHost` was confirmed unchanged throughout (refuting PHASE-52), so the defect is **readiness + enrollment churn**, not host-state loss.

**Reproduction (from the live repro):** cloud DM in lobby with a connected player → Start stays disabled "Waiting for Players…" even though the player's window shows connected; a reconnect blip flips the host ready indicator off.

**Expected:** with the player enrolled and ready and the host ready (+ color-confirmed), Start enables; a recoverable reconnect does not silently clear the host's or player's readiness.

**Root cause (file:line):** gate `components/lobby/ReadyButton.tsx:77,133-134`; readiness predicate `stores/use-lobby-store.ts:502-509`; cloud peer re-mints `isReady:false` `stores/network-store/cloud-session.ts:62`; reconnect-churn readiness reset (downstream of MP-EN-1 + the `LobbyPage` reconnect handling `pages/LobbyPage.tsx:111-145`).

Verification:

```bash
cd dnd-app/src/renderer/src
sed -n '70,140p' components/lobby/ReadyButton.tsx
sed -n '500,510p' stores/use-lobby-store.ts
sed -n '30,150p' pages/LobbyPage.tsx
```

**Fix direction:** make readiness survive a recoverable reconnect. Reconcile the reconnecting peer to its existing lobby entry (by client-id, per MP-EN-1) so it keeps `isReady`/color rather than re-appearing as a fresh not-ready member; do not reset the host's `isReady` on a recoverable `connectionState` blip (mirror PHASE-52's role-preserving guard, but for readiness). Add a lobby test asserting `allPlayersReady()` / the host `isReady` survives a simulated reconnect of an already-ready peer.

**Affected components:** `stores/use-lobby-store.ts`, `pages/LobbyPage.tsx`, `stores/network-store/index.ts`, `components/lobby/ReadyButton.tsx`.

### MP-EN-4 (info) — relay intermittently reports "No cloud registry connected"

**Status: observation, consistent with MP-EN-1's churn — no separate fix.**

During the repro the relay registry intermittently reported "No cloud registry connected," consistent with the reconnect flakiness that drives the roster churn (the same churn that resets host `isReady` and re-issues a fresh `cloud-<uuid>`). No separate action: stabilising MP-EN-1 (client-id reconciliation) and the documented `websocket-transport.ts` reconnect hardening (tracked elsewhere) cover it. Recorded so the implementer doesn't chase it as an independent defect.

## Sub-phases

> Per-sub-phase cheap check: dnd-app — `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` + the affected vitest file; Pi — `cd bmo/pi && python -m pytest <file> -q`. CI runs the full gate on push. The "two windows agree / canvas matches / Start enables" effects need the running build — implementer-verified post-merge in a two-window cloud session; do not stop for "needs a running app."

### 54A — Relay: reconcile a re-joining client_id to its existing room entry (MP-EN-1, relay side)

**Objective:** a reconnect (new `sid` + new `cloud-<uuid>`) for a `client_id` already in the room updates the existing member in place instead of creating a duplicate/orphan.

**Files:** `bmo/pi/services/game_relay.py` (`join`, `_normalize_peer`, helpers), its `app.py` Socket.IO glue (peer-joined/peer-left emission), `bmo/pi/tests/test_game_relay.py`.

**Steps:**

1. In `join()`, before inserting, look up any existing sid in the room whose ref has the same `client_id`; if found, remove the stale sid entry, carry forward its `joined_seq` / `is_co_dm` / `role` / host slot, and insert the new sid as the **same logical member** (host slot follows the client when `host_sid` pointed at the superseded sid).
2. Have the glue announce the reconnect as an **update** (or a paired `peer-left old` + `peer-joined new`) so the host roster replaces rather than accumulates; suppress a spurious `peer-left` when the same `client_id` is still live under a new sid.
3. Tests: same `client_id`, new sid/peer_id → room size unchanged, `joined_seq` preserved, host slot preserved if it was the host; a genuinely new `client_id` still increments.

**Acceptance:** `pytest bmo/pi/tests/test_game_relay.py -q` green; a reconnect-by-client-id replaces (not duplicates) the room entry and preserves seniority/host slot.

### 54B — Client/host: dedupe + key the roster on stable client-id (MP-EN-1 / MP-EN-2)

**Objective:** the host roster holds one entry per live `clientId`; filtered shards + chat re-broadcast resolve to the live connection.

**Files:** `stores/network-store/index.ts` (`addPeer`, `getRecipients`, `game:state-full` seed), `stores/network-store/cloud-session.ts` (if peer-id stability helps), `network/sync/broadcaster.ts` (confirm `clientId` keying), a broadcaster/store test (extend `stores/network-store/index.cloud.test.ts`).

**Steps:**

1. Make `addPeer` replace any existing peer with the same `clientId` (not just same `peerId`), so a reconnecting cloud peer supersedes its stale entry.
2. Confirm `getRecipients` and `permissionFilter(next, clientId)` key on the stable `clientId`; ensure the `game:state-full` seed reflects the deduped roster.
3. Extend the cloud regression test: a peer that reconnects under a NEW peer-id but the SAME `clientId` still receives the filtered shard (the case the live v2.6.3 build fails).

**Acceptance:** vitest green; `tsc -p tsconfig.web.json` clean; a reconnected cloud player's canvas mirrors the DM's and chat crosses both ways — implementer-confirmed in a two-window cloud game.

### 54C — Readiness survives a recoverable reconnect (MP-EN-3, re-scoped RL-1)

**Objective:** the Start gate clears when the player is enrolled+ready and the host ready; a recoverable reconnect does not silently reset readiness.

**Files:** `stores/use-lobby-store.ts` (readiness reconcile), `pages/LobbyPage.tsx` (reconnect handling), `components/lobby/ReadyButton.tsx` (no behaviour change expected), a lobby test.

**Steps:**

1. Reconcile a reconnecting peer to its existing lobby `players` entry (by client-id, leaning on 54A/54B) so it retains `isReady`/`colorConfirmed` rather than reappearing not-ready.
2. Do not clear the host's `isReady` on a recoverable `connectionState` blip (mirror PHASE-52's role-preserving guard, applied to readiness).
3. Test: an already-ready peer reconnecting leaves `allPlayersReady()` true and the host `isReady` intact; a deliberate leave still resets.

**Acceptance:** vitest green; `tsc` clean; in a two-window cloud lobby Start enables once both are ready and stays enabled across a transient reconnect — implementer-verified live.

### 54D — Documentation: carry-forward of PHASE-50 / PHASE-53 untested items

**Objective:** the two items the repro could not exercise are not silently lost.

**Files:** PHASE-INDEX.md (notes), this plan's Completed section at execution.

**Steps:** record that PHASE-50 (#5, DM clicking a player PC) still needs a live repro with a player character present, and PHASE-53 (local TURN) was not exercised this run; recommend the next multiplayer pass create a player character and drive the local/direct host path. No code change.

**Acceptance:** the carry-forward is captured in PHASE-INDEX so the next QA/phase cycle picks it up.

## Completed

- 54A — DONE (`bmo/pi/services/game_relay.py` `join` + new `_sid_for_client`) — `join()` now reconciles a re-joining `client_id` to its existing room entry: a reconnect on a new sid/peer_id supersedes the stale sid in place, carrying `joined_seq` / `is_co_dm` / `role` / host slot forward and dropping the stale sid from `_sid_room` (its dead socket's later `disconnect` no-ops). Returns `superseded_peer_id`. Glue (`routes/game_relay_ws.py` `on_game_join`) emits a paired `peer-left(superseded)` before `peer-joined(new)`. Verified by direct pure-relay assertions (replace-not-duplicate, seq/co-dm/host-slot preserved, stale-sid disconnect no-op, routing resolves to live peer) + `tests/test_game_relay.py` reconciliation suite (pure + ws-glue) — CI `bmo-pi-pytest.yml` is the authoritative gate.
- 54B — DONE (`stores/network-store/index.ts` `addPeer`) — `addPeer` dedupes on the stable `clientId` (falls back to `peerId` for P2P/legacy), so a reconnecting cloud peer under a fresh `cloud-<uuid>` replaces its prior roster entry rather than accumulating a stale duplicate. `getRecipients` (`:135`) + `broadcaster.ts:81-89` already key the permission filter on `clientId`, so the filtered shards + chat re-broadcast now resolve to the live connection. Regression test added in `index.cloud.test.ts` (reconnect under new peerId/same clientId → single roster entry under the new peerId, snapshot routes to the live peer). vitest green (11 tests).
- 54C — DONE (`stores/use-lobby-store.ts` `addPlayer`) — the reconnect re-add path now preserves `isReady` + `colorConfirmed` from the existing entry (mirroring the existing color/characterId preservation), so reconnect churn no longer regresses the Start gate to "Waiting for Players…". A deliberate un-ready still flows through `setPlayerReady`; a deliberate `removePlayer` still drops the entry so a true rejoin starts not-ready. `pages/LobbyPage.tsx` / `ReadyButton.tsx` unchanged (host readiness lives in the host's own `players` entry, which the preserve covers). Lobby tests added (`use-lobby-store.test.ts`: ready peer survives reconnect → `allPlayersReady()` stays true; leave+rejoin starts not-ready). vitest green (17 tests).
- 54D — DONE (`PHASE-INDEX.md`) — carry-forward recorded: PHASE-50 #5 (DM clicking a player PC) needs a live repro with a player character present; PHASE-53 local TURN not exercised this run. No code change.
