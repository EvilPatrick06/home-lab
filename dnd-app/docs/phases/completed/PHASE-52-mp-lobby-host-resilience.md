# PHASE-52 — Multiplayer cloud lobby host-state resilience

> Authored from the 2026-06-24 multiplayer QA report (dnd-vtt v2.6.2, MULTIPLAYER PASS). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Restore the cloud DM's host-only lobby controls (report symptoms 1, 2, 4): the cloud DM has no **Start Game** button (symptom 1), no **DM chat controls** row (symptom 2), and **promote/demote** doesn't propagate to players (symptom 4). All three hinge on the lobby store's `isHost` staying true (and host intents reaching players) across the cloud relay's known connect/reconnect flakiness. The prime suspect is the lobby-reset effect clearing `isHost` on a transient connection blip. This phase makes lobby host-state resilient to recoverable cloud reconnects. PLANNING ONLY.

## Dependencies & cross-phase notes

- **No hard prerequisite, but verify after PHASE-49.** Promote propagation (symptom 4) is partially entangled with the dead bus (the lobby-player mirror); landing PHASE-49 first removes that variable so symptom 4 can be isolated to the host-state / reconnect issue.
- **This is the one cluster the QA could not fully close by static reading.** The host-only gates and the `setIsHost` setter are each individually correct (verified below), so the reported failure is a **runtime/ordering** issue — a transient `connectionState` flip firing `resetLobby()` and stripping `isHost`. The plan therefore leads with a **live two-window repro** to confirm the `resetLobby`-on-reconnect trigger before/while implementing the resilience fix (which is small once confirmed). Follows the PHASE-48 F3 "reproduce against the live build, then fix the precise gap" precedent.

## Verified findings

All verification was against the live tree (worktree `auto/dnd-phase-maker`, v2.6.2).

### RL-1 (high) — cloud DM lacks host-only lobby UI; promote/demote doesn't propagate (symptoms 1, 2, 4)

**Status: gates + setter individually correct; failure is a runtime reset of `isHost` on a recoverable cloud blip — confirm with a live repro.**

Three host-side controls fail for the cloud DM, all gated on the lobby store's `isHost`:

- *Symptom 1 — Start Game.* `ReadyButton` renders it only when `useLobbyStore(s => s.isHost)` (`components/lobby/ReadyButton.tsx:14` selector, `:80` `if (isHost)` gate).
- *Symptom 2 — DM chat controls.* The slow-mode / files / auto-mod control row is gated on the same `isHost` (`components/lobby/ChatInput.tsx:28` selector, `:182` `{isHost && (`, `:259` `(fileSharingEnabled || isHost)`). The plain text chat input always renders, so "no chat input at all" most likely describes the missing DM control row + chat being non-functional via PHASE-49/TR-1.
- *Symptom 4 — promote/demote.* The DM controls in the lobby `PlayerList` send `dm:promote-codm` / `dm:demote-codm` / `dm:role-change` via `sendMessage` (`components/lobby/PlayerList.tsx:123,128,141,145`); the player applies `dm:promote-codm` / `dm:transfer-dm` in `handleClientMessage` (`client-handlers.ts:188,202`).

By static reading the cloud path *should* satisfy all three (host role + `setIsHost(role === 'host')` mirror; host outbound override; relay authorizes host `dm:*`). So the reported failure is a **runtime** break. **Prime suspect: the lobby-reset effect.** `LobbyPage` destructures `reset: resetLobby` (`pages/LobbyPage.tsx:34`) and, in a `connectionState === 'disconnected'` branch (`:111`), calls `resetLobby()` (`:142`). `reset` sets `isHost: false` (`stores/use-lobby-store.ts:580`; default `isHost: false` at `:220`, setter `:500`). The cloud relay is known-flaky on connect/reconnect (`network/websocket-transport.ts` documents `connect_error` spam, polling-vs-WS upgrade, Cloudflare Access on `/socket.io`). A transient `connectionState` flip to `disconnected`/`error` after the lobby mounts would fire `resetLobby()` and silently strip `isHost` (→ symptoms 1 & 2); the same instability would drop the host's outbound promote (→ symptom 4).

**Reproduction:** host a cloud game → land in lobby → observe Start Game / DM chat-control row absent; promote a joined player → the player's badge/abilities unchanged.

**Expected:** the cloud DM sees Start Game + DM chat controls; promote/demote reflects on the target client.

**Root cause (file:line):** gates `components/lobby/ReadyButton.tsx:80`, `components/lobby/ChatInput.tsx:182`, `components/lobby/PlayerList.tsx:123-145`; lobby host-state default/setter `stores/use-lobby-store.ts:220,500,580`; prime suspect reset `pages/LobbyPage.tsx:111-145`; relay instability `network/websocket-transport.ts`.

Verification:

```bash
cd dnd-app/src/renderer/src
grep -n "isHost" components/lobby/ReadyButton.tsx components/lobby/ChatInput.tsx
grep -n "dm:promote-codm\|dm:demote-codm\|dm:role-change\|sendMessage" components/lobby/PlayerList.tsx
sed -n '30,150p' pages/LobbyPage.tsx                       # resetLobby trigger + connectionState branch
grep -n "isHost\|reset:\|setIsHost" stores/use-lobby-store.ts
```

**Fix direction:** make lobby host-state resilient to transient cloud reconnects — do **not** `resetLobby()` (or do not clear `isHost`) on a recoverable `connectionState` blip while `role === 'host'`; re-assert `setIsHost(true)` whenever `role` is `host`. Then re-test promote propagation once PHASE-49 and the reconnect handling are in. Add a cloud-host lobby test asserting `isHost` survives a simulated `connect_error` / transient disconnect. The deeper related work (hardening the relay connect/reconnect lifecycle and Cloudflare Access on `/socket.io`) is out of scope for this phase beyond not letting a recoverable blip clear host state.

**Affected components:** `pages/LobbyPage.tsx`, `stores/use-lobby-store.ts`, `components/lobby/ReadyButton.tsx`, `components/lobby/ChatInput.tsx`, `components/lobby/PlayerList.tsx`, `network/websocket-transport.ts`.

## Sub-phases

> Per-sub-phase cheap check: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` + the affected vitest file. CI runs the full gate on push. The "controls present in a live cloud lobby" effect is implementer-verified with the running build.

### 52A — Reproduce + pin the `isHost` reset trigger (RL-1 diagnosis)

**Objective:** confirm the exact runtime trigger that strips `isHost` in a cloud lobby (prime suspect: `resetLobby()` on a transient disconnect).

**Files:** read-only across `pages/LobbyPage.tsx`, `stores/use-lobby-store.ts`, `network/websocket-transport.ts`; record findings in this plan's Completed section.

**Steps:**

1. In a two-window cloud session, watch `useLobbyStore.isHost` + `connectionState` from lobby-mount onward; capture whether a transient `disconnected`/`error` flip fires the `LobbyPage` reset branch (`:111-145`).
2. Confirm whether promote (symptom 4) fails because the host outbound drops on the same blip vs. the lobby-player mirror being dead pre-PHASE-49.

**Acceptance:** the trigger is pinned to a specific effect/line; 52B's change is scoped to it.

### 52B — Keep host state across recoverable cloud reconnects (RL-1 fix)

**Objective:** a transient cloud reconnect no longer strips the DM's host-only lobby UI.

**Files:** `pages/LobbyPage.tsx` (reset effect), `stores/use-lobby-store.ts` (if a guarded reset variant is needed); a lobby host-state test.

**Steps:**

1. Guard the reset path: while `role === 'host'`, do not `resetLobby()` / clear `isHost` on a recoverable `connectionState` blip; only fully reset on a deliberate leave/teardown.
2. Re-assert `setIsHost(true)` whenever `role` is `host` (so a stale `false` self-heals on reconnect).
3. Re-test promote/demote propagation after PHASE-49 + this change.
4. Test: a simulated `connect_error` / transient disconnect during a cloud host lobby leaves `isHost === true` and the Start Game + DM chat-control gates rendered.

**Acceptance:** vitest green; `tsc` clean; the cloud DM retains Start Game + DM chat controls across a transient reconnect; promote/demote reflects on the target client (implementer-verified live); deliberate leave still resets the lobby.

## Completed

### Completed — 2026-06-28 (dnd-phase-executer, verify-don’t-rebuild)

Verified: **RL-1 implemented and shipped** in `abab8b89` / **v2.6.3**.

- **52A:** cloud `isHost` loss traced to `resetLobby()` clearing `isHost` on a transient `connectionState` blip.
- **52B:** `LobbyPage` adds a `useEffect` re-asserting `setIsHost(true)` whenever `role === 'host'`, re-running on `connectionState` transitions (`pages/LobbyPage.tsx:337-350`). A recoverable cloud reconnect can no longer strip the DM’s Start-Game / DM-chat-controls / promote gates; a deliberate leave still resets.

No code change required this run. Plan moved to `completed/`.

_Authored 2026-06-24 from QA-report-2026-06-24-multiplayer.md (RL-1)._
