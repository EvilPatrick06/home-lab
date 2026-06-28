# PHASE-51 — Multiplayer cloud state-sync roster & permission filter

> Authored from the 2026-06-24 multiplayer QA report (dnd-vtt v2.6.2, MULTIPLAYER PASS). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Resolve the cloud DM↔player game-state divergence the MP pass reported (symptom 7 / contributing 8): in a cloud game, players don't reliably see the DM's map/drawing/token changes, and the two canvases diverge. The shard replication layer **is** transport-wired for the relay on both ends, so the divergence points at the per-recipient permission filter denying state to cloud joiners whose `clientId` isn't enrolled in the campaign roster the filter consults — compounded by the non-shard context that rode the dead bus (PHASE-49). This phase enrolls cloud peers so filtered shards deliver correctly, and records the positive finding that the relay carries state (not just presence). PLANNING ONLY.

## Dependencies & cross-phase notes

- **Depends on PHASE-49 (dispatch-bus adapter).** The report flags this divergence as *aggravated by* TR-1: the shard plane syncs, but surrounding chat/character/role context that rides `onHostMessage`/`onClientMessage` is dead, so the player's overall view never fully reconciles. Fix PHASE-49 first so the only remaining divergence is the shard permission/roster issue, then verify SS-1 in isolation.
- **Path correction.** The QA report cited `sync/broadcaster.ts` / `sync/applier.ts`; the live path is **`network/sync/broadcaster.ts`** and **`network/sync/applier.ts`**. All file:line refs below use the real path.
- **Needs a live two-window repro to finish pinning.** The shard plumbing is sound (see SS-2); the precise filter-vs-roster behavior must be observed against a real cloud session — the `clientId`↔roster mapping for a relay joiner cannot be fully closed by static reading. This phase implements the enrollment fix + a regression test; the implementer confirms the divergence is gone with the running build.

## Verified findings

All verification was against the live tree (worktree `auto/dnd-phase-maker`, v2.6.2).

### SS-1 (high) — cloud DM↔player state divergence (map / drawings / tokens) — symptom 7 / 8

**Status: confirmed shard plane is relay-wired; divergence mechanism = per-recipient permission filter keyed on a roster the cloud joiner isn't in; needs live repro to close.**

The shard replication layer is transport-agnostic and **is** wired for the relay on both ends: host `createShardBroadcaster(transport, { getRecipients })` (`stores/network-store/index.ts:123-128`) and client `createShardApplier(transport)` (`stores/network-store/index.ts:470-471`). The broadcaster subscribes every registered shard and ships `sync:delta` over `transport.broadcast` / `transport.send` (`network/sync/broadcaster.ts`). So shard-managed state (tokens, drawings, fog, walls, regions, initiative, conditions, turn-states, party-vision) **can** sync in cloud, and the Pi relay explicitly authorizes `sync:delta` from the host (`bmo/pi/services/game_relay.py`).

The most plausible divergence source is **per-recipient permission filtering keyed on a roster the cloud joiner isn't enrolled in.** For a shard that declares a `permissionFilter` AND when `opts.getRecipients` is supplied, the broadcaster abandons the plain broadcast and ships a per-recipient full `replace` of `permissionFilter(next, recipient.clientId)` (`network/sync/broadcaster.ts:81-89`). Recipients come from `get().peers.map((p) => ({ peerId: p.peerId, clientId: p.clientId }))` (`stores/network-store/index.ts:124`). A cloud player's `clientId` is its locally-generated id; if the filter resolves visibility/ownership against the campaign's player roster and that `clientId` isn't enrolled, deny-by-default strips DM-only (or all) tokens for that peer → the player sees fewer/different tokens than the DM. Consistent with "tokens differ DM vs player."

Secondary: non-shard `dm:map-change` / `dm:drawing-add` / `dm:token-move` *are* handled by `handleClientMessage` (`client-handlers.ts:332,322,312`), but the surrounding bus-borne context is dead pre-PHASE-49, reinforcing the "nothing syncs" impression.

**Reproduction:** cloud game; DM places/moves tokens and draws → compare DM and player canvases.

**Expected:** the player canvas mirrors the DM's (modulo intentionally hidden DM-only tokens); token positions identical.

**Root cause (file:line):** `network/sync/broadcaster.ts:81-89` (per-recipient filter keyed on `recipient.clientId`) + the cloud recipient list `stores/network-store/index.ts:124`; aggravated by PHASE-49/TR-1.

Verification:

```bash
cd dnd-app/src/renderer/src
sed -n '78,99p' network/sync/broadcaster.ts
sed -n '119,175p' stores/network-store/index.ts        # broadcaster wiring, getRecipients, game:state-full seed
grep -rln "permissionFilter" network/sync/shards/      # which shards filter (tokens/fog/drawings...)
```

**Fix direction:** verify the cloud joiner's `clientId` is registered in the campaign roster the `permissionFilter` consults — enroll the relay peer on join so `permissionFilter(next, clientId)` resolves the joiner's visibility/ownership correctly. Add a regression test for a filtered shard (tokens/fog) delivering to a cloud recipient. Resolve PHASE-49 in tandem so the full state picture reconciles. (The initial `game:state-full` + map-image seed at `stores/network-store/index.ts:147-174` is already sent to cloud joiners; confirm the seed itself isn't over-filtered.)

**Affected components:** `network/sync/broadcaster.ts`, `network/sync/shards/*` (the filtered shards — tokens/fog/drawings), `stores/network-store/index.ts` (cloud recipients + `game:state-full` seed).

### SS-2 (info) — relay correctly carries state, not just presence (positive finding)

**Status: recorded for the planner — no action.**

The relay is **not** presence-only: `bmo/pi/services/game_relay.py` / `game_relay_ws.py` route `sync:delta`, `game:state-*`, and `dm:*` with a host-only authority gate and host re-election for co-DMs; the cloud host seeds joiners with `game:state-full` + a map-image `game:state-update` (`stores/network-store/index.ts:147-174`). So the "no sync" symptoms are **client-app wiring gaps (PHASE-49/TR-1, SS-1), not a relay transport limitation** — the transport + shard layers are the healthy part of the stack. Keep this in mind so the fix stays on the client side and does not perturb the relay.

## Sub-phases

> Per-sub-phase cheap check: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` + the affected vitest file. CI runs the full gate on push. The "canvases match" effect needs the running build — implementer-verified post-merge; do not stop for "needs a running app".

### 51A — Enroll cloud peers in the permission-filter roster (SS-1)

**Objective:** a cloud joiner's `clientId` is known to the `permissionFilter` so filtered shards deliver the correct (non-empty / correctly-scoped) state.

**Files:** `stores/network-store/index.ts` (cloud join / peer-registration path + `getRecipients`), whichever roster/permission source the shard `permissionFilter`s consult (`network/sync/shards/*`, the permissions module); a broadcaster/shard test.

**Steps:**

1. Trace, against a live cloud session, how a relay joiner's `clientId` maps (or fails to map) to the campaign roster the filtered shards' `permissionFilter` consults.
2. Enroll the cloud peer on join so `permissionFilter(next, clientId)` resolves its visibility/ownership (e.g. register the relay peer's `clientId` into the roster/permission source used by the token/fog/drawings shards).
3. Confirm the initial `game:state-full` seed isn't itself over-filtered for cloud joiners.

**Acceptance:** vitest green; `tsc` clean; a cloud player's canvas mirrors the DM's (positions identical, only intentionally-hidden DM tokens withheld) — implementer-confirmed in a two-window cloud game.

### 51B — Regression test: filtered shard delivers to a cloud recipient

**Objective:** lock in that a `permissionFilter`-bearing shard ships correct per-recipient state to an enrolled cloud peer.

**Files:** a new/extended test alongside `network/sync/broadcaster.ts` (and/or the tokens/fog shard tests).

**Steps:**

1. Add a test where a filtered shard with a recipient list including an enrolled cloud `clientId` produces a per-recipient `replace` that contains the expected (correctly-scoped) tokens — not an empty/deny-all set.
2. Cover the monotonic-sequence invariant (the broadcaster bumps the shared sequence once across recipients).

**Acceptance:** the test fails against the pre-51A roster gap and passes after; CI green on push.

## Completed

_(none yet — execution log appended here per sub-phase per INSTRUCTIONS.md)_

_Authored 2026-06-24 from QA-report-2026-06-24-multiplayer.md (SS-1, SS-2)._
