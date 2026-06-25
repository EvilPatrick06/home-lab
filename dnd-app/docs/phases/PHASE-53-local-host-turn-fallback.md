# PHASE-53 — Local-host TURN / relay fallback

> Authored from the 2026-06-24 multiplayer QA report (dnd-vtt v2.6.2, MULTIPLAYER PASS). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Fix local/direct (non-cloud) hosting so players aren't rejected at the lobby with the "firewall or NAT" error (report symptom 9). With a local self-host, PeerJS signaling succeeds but the **WebRTC data channel** never opens because the default self-host ICE config supplies **no reachable TURN relay** and there is **no automatic relay fallback** — any client that can't form a direct/STUN-reflexive pair with the host's Electron process times out. This phase adds a TURN relay to the default self-host ICE set and/or an automatic fallback to the cloud relay on data-channel timeout. This finding is **independent** of the cloud-dispatch cluster (PHASE-49–52). PLANNING ONLY — but note one part is infra/config (coturn on the Pi), the other is app logic (fallback).

## Dependencies & cross-phase notes

- **No prerequisite phases.** Fully independent of the cloud-relay findings; the cloud transport itself is healthy (see PHASE-51 SS-2).
- **Part infra/config, part app logic.** The cleanest user-facing fix is the app-side relay auto-fallback (no deployment dependency); standing up coturn on the always-on Pi and advertising it in the default ICE set is the more complete fix but touches deployment. The executor should land the app-logic fallback regardless, and pair it with the coturn/ICE work where the Pi deploy allows. Do **not** advertise `stun:<host>:3478` as though a STUN/coturn listener is guaranteed — verify the Pi actually listens before relying on it (a deployment item).
- **STOP-and-ask only if** the coturn deployment requires a new infra decision the approval/scope didn't cover (rule 9/27 (b)); the app-side fallback is in scope and should be implemented, not deferred.

## Verified findings

All verification was against the live tree (worktree `auto/dnd-phase-maker`, v2.6.2).

### TR-2 (high) — local/direct host: WebRTC data channel never opens — players blocked (symptom 9)

**Status: confirmed by code read; default self-host ICE is STUN-only with no TURN and no relay fallback.**

With a local/direct host, PeerJS signaling succeeds (the host's peer id resolves — otherwise `peer-unavailable` fires), but the WebRTC data channel times out, producing the user's exact error at `network/client-manager.ts:250-260` ("Found that game but couldn't open a data channel. Likely a firewall or NAT issue — try a different network or ask the host to check theirs."), fired after `CONNECTION_TIMEOUT_MS`.

Root cause is the default ICE configuration. `getDefaultIceServers()` (`network/peer-manager.ts:23-37`) returns, for a self-host, a **STUN-only** set built around `{ urls: \`stun:${customHost}:3478\` }` (`:25`) plus a public STUN fallback on the secure/off-LAN path — **neither path supplies a TURN relay.** Phase 20c deliberately removed the only bundled TURN credentials and never replaced them with a runtime-reachable relay (`network/peer-manager.ts:17-22`). Combined with `forceRelay = false` by default (`:84`, so `iceTransportPolicy` stays `'all'` — see `:189` `...(forceRelay && { iceTransportPolicy: 'relay' })`), any client that cannot form a direct host candidate or a STUN server-reflexive pair with the host's Electron process (symmetric NAT, AP/client isolation, a host-side firewall blocking the Electron app's UDP, or simply a player not on the host's L2 LAN) gets **no nominated candidate pair** and the data channel times out. There is **no automatic relay fallback**: TURN only exists if the user manually enters credentials in Network Settings (`setIceConfig`, `network/peer-manager.ts:90`), and the `stun:<host>:3478` entry silently assumes the Pi runs a STUN/coturn listener on 3478 (unverified — a deployment item).

**Reproduction:** set a campaign to local/self-host; have a player on a different network (or behind a restrictive NAT/firewall) join → ~`CONNECTION_TIMEOUT_MS` later, the firewall/NAT error; the player never enters the lobby.

**Expected:** joins succeed across common NAT setups, or degrade gracefully to a relay.

**Root cause (file:line):** `network/peer-manager.ts:23-37` (no TURN in default self-host ICE) + `:84` (`forceRelay=false`, no relay fallback) → timeout surfaced at `network/client-manager.ts:250-260`.

Verification:

```bash
cd dnd-app/src/renderer/src
sed -n '11,40p' network/peer-manager.ts          # getDefaultIceServers, stun-only, Phase 20c note
grep -n "forceRelay\|iceTransportPolicy\|setIceConfig\|setForceRelay" network/peer-manager.ts
sed -n '245,262p' network/client-manager.ts      # data-channel timeout error
grep -rn "registry-client\|relay\|cloud" network/registry-client.ts | head   # off-LAN/cloud default
```

**Fix direction:** three complementary moves for the executor to phase: (1) stand up / point to a reachable TURN server (coturn on the always-on Pi) and include it in the default self-host ICE set — mirroring how signaling already points at the Pi; (2) add an **automatic fallback**: on data-channel timeout, offer/auto-switch the join to the cloud relay (the relay works behind any NAT and is already the off-LAN default — `network/registry-client.ts`); (3) verify coturn is actually listening on `<host>:3478` before advertising `stun:<host>:3478`. The app-logic fallback (2) is the lowest-dependency, highest-value piece and should land regardless of the coturn deploy.

**Affected components:** `network/peer-manager.ts`, `network/client-manager.ts`, `network/registry-client.ts`, BMO Pi infra (coturn deployment), Network Settings (TURN entry UX).

## Sub-phases

> Per-sub-phase cheap check: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` + the affected vitest file. CI runs the full gate on push. The "a NAT'd player joins a local host" effect needs a real two-network repro — implementer-verified; do not stop for "needs a running app".

### 53A — Auto-fallback to the cloud relay on data-channel timeout (app logic)

**Objective:** a local-host join that can't open a data channel degrades to the cloud relay instead of dead-ending at the NAT error.

**Files:** `network/client-manager.ts` (the `CONNECTION_TIMEOUT_MS` data-channel-timeout branch), `network/registry-client.ts` / the relay-join path; a client-manager test.

**Steps:**

1. On the data-channel timeout (`client-manager.ts:250-260`), instead of only surfacing the firewall/NAT error, attempt an automatic switch of the join to the cloud relay (or present a one-click "retry over relay" affordance), reusing the existing off-LAN relay-join path.
2. Preserve the existing error as the final state only if the relay fallback also fails.
3. Test: a simulated data-channel timeout triggers the relay-fallback path; a fallback success enters the lobby; a fallback failure surfaces the (updated) error.

**Acceptance:** vitest green; `tsc` clean; a NAT-blocked local-host join degrades to the relay rather than failing outright (implementer-verified across two networks); a genuinely unreachable host still surfaces a clear error.

### 53B — TURN in the default self-host ICE set + coturn verification (infra/config)

**Objective:** the default self-host ICE set includes a reachable TURN relay, and the advertised `stun:<host>:3478` is backed by a real listener.

**Files:** `network/peer-manager.ts` (`getDefaultIceServers`, `forceRelay` default), Network Settings TURN UX; BMO Pi coturn deploy (coordinate with the bmo deploy automation, PHASE-42) — note any deploy step that needs a human infra decision per rule 9(b).

**Steps:**

1. Verify whether the Pi already runs a STUN/coturn listener on `<host>:3478`; if not, stand up coturn (or flag the deploy as a STOP-and-ask infra decision) before advertising it.
2. Add the reachable TURN relay to the default self-host ICE set so common NAT setups get a relay candidate without manual Network Settings entry.
3. Keep `forceRelay=false` (gather direct + STUN + TURN, let ICE pick) — TURN is a fallback candidate, not forced.
4. Test/data check: the default ICE set includes the TURN entry on the self-host path; Network Settings still allows overriding with user TURN credentials.

**Acceptance:** `tsc`/vitest green; the default self-host config offers a TURN candidate; `stun:<host>:3478` is only advertised when the listener is verified; manual TURN override unchanged. (If the coturn deploy is blocked on an infra decision, 53A still resolves the user-facing symptom; record the deploy item.)

## Completed

_(none yet — execution log appended here per sub-phase per INSTRUCTIONS.md)_

_Authored 2026-06-24 from QA-report-2026-06-24-multiplayer.md (TR-2)._
