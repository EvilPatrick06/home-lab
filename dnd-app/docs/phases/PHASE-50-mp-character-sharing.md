# PHASE-50 — Multiplayer character sharing & persistence

> Authored from the 2026-06-24 multiplayer QA report (dnd-vtt v2.6.2, MULTIPLAYER PASS). Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Fix the two character-ownership defects the cloud MP pass surfaced: (CH-1) in a cloud game the DM clicking a player's PC gets **"no character found"** because `remoteCharacters` is never populated (report symptom 5); and (CH-2b) editing a player's sheet **persists that player's PC into the DM's own saved-character library** — a transport-independent data-integrity bug that pollutes "My Characters" (report symptom 6, second half). CH-1 is mostly a downstream consequence of the dispatch-bus gap (PHASE-49) plus a missing host-side store write; CH-2b is an independent ownership guard. PLANNING ONLY.

## Dependencies & cross-phase notes

- **Depends on PHASE-49 (dispatch-bus adapter).** CH-1's primary fix is PHASE-49 restoring `remoteCharacters` population over the cloud relay; this phase adds the host-side belt-and-suspenders write so the host stores the PC regardless of transport. Execute 49 first; then verify CH-1 against the live cloud build and limit this phase to the residual host-side write + the CH-2b guard.
- **Drift correction — CH-2(a) "player never receives the edit in cloud" is ALREADY RESOLVED (verify-don't-rebuild).** The report listed the player-apply half of symptom 6 as dead-bus. The live tree dispatches `dm:character-update` through `handleClientMessage` (`client-handlers.ts:583`) → `handleCharacterUpdate` (`client-handlers/game-action-handlers.ts:162-178`, Phase 23c dual-write of `updateCharacterInState` + `setRemoteCharacter`), so a cloud player **does** receive DM edits today. Reproduce to confirm FIXED and record it; the only real remaining CH-2 defect is the persistence leak (b). Mirrors the PHASE-48 F3 "machinery exists — verify the gap" precedent.
- **CH-2b is transport-independent** — it reproduces in P2P too; it only surfaced now because MP was never exercised end-to-end. It can ship even if a live cloud repro is unavailable.

## Verified findings

All verification was against the live tree (worktree `auto/dnd-phase-maker`, v2.6.2).

### CH-1 (high) — DM can't open a player's character in cloud — "no character found" (symptom 5)

**Status: confirmed; primary fix is PHASE-49, this phase adds the host-side store write.**

The DM's view of a player's sheet resolves the character as `storeCharacter ?? remoteCharacters[id]` (`pages/CharacterSheet5ePage.tsx:49-51`: `const rawCharacter = storeCharacter ?? (id ? remoteCharacters[id] : undefined)`). The player's PC is not in the DM's local `useCharacterStore`, so it can only come from `useLobbyStore.remoteCharacters` — populated **exclusively** by `useCharacterSelectBridge` over `onHostMessage` (`pages/lobby/use-lobby-bridges.ts:96-118`, calling `setRemoteCharacter` at `:104`). Per PHASE-49/TR-1 that bridge is dead in cloud, and `handleHostMessage`'s `player:character-select` case stores only the peer's `characterId`/`characterName` (`host-handlers.ts:146-154`), never the `characterData` into `remoteCharacters`. So `remoteCharacters[id]` is undefined → the sheet shows the not-found path.

**Reproduction:** cloud game; player selects a character; DM clicks that player's PC → "no character found".

**Expected:** the DM opens the player's current sheet.

**Root cause (file:line):** resolution `pages/CharacterSheet5ePage.tsx:49-51`; missing population path = TR-1 (`pages/lobby/use-lobby-bridges.ts:96-118` not fed in cloud; `stores/network-store/host-handlers.ts:146-154` doesn't store `characterData`).

Verification:

```bash
cd dnd-app/src/renderer/src
sed -n '45,55p' pages/CharacterSheet5ePage.tsx
sed -n '96,118p' pages/lobby/use-lobby-bridges.ts
sed -n '146,154p' stores/network-store/host-handlers.ts
```

**Fix direction:** PHASE-49 restores `remoteCharacters` population over the relay. Belt-and-suspenders here: have `handleHostMessage`'s `player:character-select` case (`host-handlers.ts:146`) also call `useLobbyStore.getState().setRemoteCharacter(payload.characterId, payload.characterData)` when `characterData` is present — so the host stores the PC regardless of transport, independent of the bridge. (This requires `player:character-select` to carry `characterData`; confirm the player send-side includes it — the bridge consumes `payload.characterData`, so it does.)

**Affected components:** `pages/CharacterSheet5ePage.tsx`, `pages/lobby/use-lobby-bridges.ts`, `stores/network-store/host-handlers.ts`, `stores/use-lobby-store.ts` (`remoteCharacters` / `setRemoteCharacter`).

### CH-2b (high) — DM editing a player's PC saves it into the DM's own character library (symptom 6, second half)

**Status: confirmed; surgical ownership guard.**

`useCharacterEditor.saveAndBroadcast` calls `useCharacterStore.getState().saveCharacter(updated)` **unconditionally** before `broadcastIfDM` (`hooks/use-character-editor.ts:30-33`). `saveCharacter` writes to the **local** character store/disk — the DM's personal library — so when the DM edits a player's PC, that PC is inserted into the DM's "My Characters". Note `broadcastIfDM` *already* gates correctly: it only broadcasts `dm:character-update` and mirrors `setRemoteCharacter` when `role === 'host' && updated.playerId !== 'local'` (`hooks/use-character-editor.ts:20-29`). It is the *persistence* call that is ungated. The same unconditional-persist pattern exists at the sheet call site (`pages/CharacterSheet5ePage.tsx:138-142`; verify exact lines at execution).

**Reproduction:** cloud or P2P game; DM opens a player's sheet, changes HP → the DM's Characters list now contains the player's PC.

**Expected:** DM edits sync to the owning player and are **not** persisted into the DM's local library (the owning player persists on receipt — `use-lobby-bridges.ts:201-234` / `handleCharacterUpdate` already saves to disk only when the character exists locally).

**Root cause (file:line):** `hooks/use-character-editor.ts:30-33` (`saveAndBroadcast` unconditional `saveCharacter`); parallel path `pages/CharacterSheet5ePage.tsx:138-142`.

Verification:

```bash
cd dnd-app/src/renderer/src
cat hooks/use-character-editor.ts
sed -n '130,165p' pages/CharacterSheet5ePage.tsx
```

**Fix direction:** gate persistence on ownership — when the local user is the DM editing a PC they don't own (`updated.playerId !== 'local'`), update `remoteCharacters` + broadcast `dm:character-update` but do **not** call the local `saveCharacter`. Let the owning player persist on receipt. Apply the same guard at the sheet call site. Add a test asserting that editing a non-owned PC does not insert it into `useCharacterStore`.

**Affected components:** `hooks/use-character-editor.ts`, `pages/CharacterSheet5ePage.tsx`, `stores/use-character-store.ts`, `pages/lobby/use-lobby-bridges.ts` (owning-player persist path, unchanged).

## Sub-phases

> Per-sub-phase cheap check: `cd dnd-app && npx tsc --noEmit -p tsconfig.web.json` on the changed surface + the affected vitest file. CI runs the full gate on push.

### 50A — Verify CH-2a fixed + host-side `remoteCharacters` write (CH-1)

**Objective:** confirm cloud players already receive DM edits (CH-2a), and make the host store a selected PC into `remoteCharacters` regardless of transport.

**Files:** `stores/network-store/host-handlers.ts` (the `player:character-select` case), `stores/use-lobby-store.ts` (`setRemoteCharacter`); a `host-handlers`/lobby-store test.

**Steps:**

1. Reproduce the CH-2a path (DM edits a cloud player's sheet → player's sheet updates) against the live build; record FIXED with the dual-write evidence (`game-action-handlers.ts:162-178`).
2. In the `player:character-select` host case, when `payload.characterData` is present, call `useLobbyStore.getState().setRemoteCharacter(payload.characterId, payload.characterData)` in addition to the existing peer `characterId`/`characterName` update.
3. Test: a host-side `player:character-select` carrying `characterData` populates `remoteCharacters[id]`.

**Acceptance:** vitest green; `tsc` clean; after PHASE-49 + this, a cloud DM can open a joined player's sheet (no "no character found"); CH-2a recorded as already-fixed with verification.

### 50B — Ownership guard on character persistence (CH-2b)

**Objective:** editing a non-owned PC never writes it into the editor's local character library.

**Files:** `hooks/use-character-editor.ts`, `pages/CharacterSheet5ePage.tsx`; a `use-character-editor` test.

**Steps:**

1. In `saveAndBroadcast`, gate `saveCharacter(updated)` on ownership: persist locally only when `updated.playerId === 'local'` (the editor owns it); otherwise skip the local persist and rely on `broadcastIfDM` + the owning player's on-receipt save.
2. Apply the same ownership gate at the `CharacterSheet5ePage` persist call site.
3. Test: editing a PC with `playerId !== 'local'` broadcasts `dm:character-update` and mirrors `remoteCharacters` but does **not** add the PC to `useCharacterStore`; editing a local PC persists normally.

**Acceptance:** vitest green; `tsc` clean; the DM's "My Characters" is no longer polluted by editing players' PCs; local-character editing/persistence is unchanged.

## Completed

_(none yet — execution log appended here per sub-phase per INSTRUCTIONS.md)_

_Authored 2026-06-24 from QA-report-2026-06-24-multiplayer.md (CH-1, CH-2)._
