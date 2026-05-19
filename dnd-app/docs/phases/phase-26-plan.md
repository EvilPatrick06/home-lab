# Phase 26 — Encounter Builder & Combat Tracker

## Context

The encounter builder UI (`EncounterBuilderModal.tsx`) is feature-complete for monster search, count, party-size XP budgets (DMG 2024), and preset save/load. The combat tracker supports group initiative for identical monsters. The remaining gaps are wiring failures, not missing logic: (1) `GroupRollModal` ships with hardcoded mock players (`['Theron', 'Lyra', 'Grimjaw', 'Senna']`) and `Math.random()` modifiers — the DM sees fictional results; (2) the "Place All & Start Initiative" button only broadcasts a chat string and never instantiates tokens; (3) AI encounter deployment via `executeLoadEncounter` dumps every monster in a tight 5-wide grid at map center, ignoring walls and player positions; (4) no wave/reinforcement model; (5) `Encounter.mapId` exists in the type but has no UI to set it, and no per-monster pre-positioning.

Phase 15 reshapes how encounters store monsters (refs into the library, not embedded JSON) and Phase 31 reshapes how token mutations propagate (structural shard diff replaces explicit broadcast). Both affect Step 6 (data model) and Step 11 (broadcast removal) here.

## Depends on / blocks

- Depends on: Phase 1 (`RollRequestOverlay` reused in Step 2); Phase 15 Sub-Phase E (encounter monster `ref` shape, `instanceOverrides`); Phase 17 (group-save modifier bug feeds Step 3)
- Blocks: none — downstream phases consume the wave data model and smart placement but don't gate on this

## Files touched

| Path | Role |
|------|------|
| `src/renderer/src/components/game/modals/combat/GroupRollModal.tsx` | Strip mock players, wire to lobby + network |
| `src/renderer/src/components/game/modals/dm-tools/EncounterBuilderModal.tsx` | Real "Place All", wave tabs, map dropdown, pre-position canvas |
| `src/renderer/src/services/game-actions/creature-actions.ts` | Replace grid placement in `executeLoadEncounter` with smart placement; honor pre-positions |
| `src/renderer/src/services/game-actions/token-placement.ts` | New — `smartPlaceTokens`, `findEmptyCell`, large-token aware |
| `src/renderer/src/types/encounter.ts` | Add `EncounterWave`, per-monster `startX/startY`, migrate `monsters → waves` |
| `src/renderer/src/components/game/overlays/RollRequestOverlay.tsx` | Reused for player group-save prompts |
| `src/renderer/src/stores/use-lobby-store.ts` | Source of `connectedPlayers` for Step 1 |
| `src/renderer/src/stores/network-store/index.ts` | New IPC messages: `dm:group-roll-request`, `player:group-roll-result` |

## Sub-phase summary

| # | Sub-phase | Theme |
|---|-----------|-------|
| 26a | Fix GroupRollModal | Real players, networked rolls, monster auto-saves |
| 26b | Wire "Place All & Start Initiative" | Actually create tokens, hook initiative |
| 26c | Smart token placement | Spread away from players, respect walls + size |
| 26d | Wave support | Multi-stage encounters, deploy mid-combat |
| 26e | Encounter-map linkage | Map dropdown, pre-position monsters |
| 26f | AI deployment uses smart placement | `executeLoadEncounter` honors pre-positions |

## Sub-phase details

### 26a — Fix GroupRollModal

**Files:** `src/renderer/src/components/game/modals/combat/GroupRollModal.tsx`, `src/renderer/src/stores/use-lobby-store.ts`, `src/renderer/src/components/game/overlays/RollRequestOverlay.tsx`, `src/renderer/src/stores/network-store/index.ts`

**Steps:**
1. Delete the hardcoded simulated players block at `GroupRollModal.tsx:70-78` (`const simulatedPlayers = ['Theron', 'Lyra', 'Grimjaw', 'Senna']` and the fake `Math.random()` modifier). Replace with `const players = useLobbyStore(s => s.players.filter(p => p.status === 'connected'))` (status field at `use-lobby-store.ts:128`).
2. Register two new IPC messages in `network-store/index.ts`: `dm:group-roll-request` (`{ requestId, ability|skill, dc, rollType: 'save'|'check' }`) and `player:group-roll-result` (`{ requestId, playerId, roll, modifier, total }`). Add Zod schemas in `ipc-schemas.ts`.
3. In `handleRequestRoll`, broadcast `dm:group-roll-request` to all target players, collect results into a `Map<playerId, RollResult>`, update UI as each arrives. Show "X/Y players responded" progress. Set 30s timeout, mark unresponsive players "No Response".
4. On the player side, on receipt of `dm:group-roll-request`, mount `RollRequestOverlay` (existing — `overlays/RollRequestOverlay.tsx:34`); on player roll, send back `player:group-roll-result`.
5. Add monster auto-roll path: for any selected enemy tokens (Phase 17 LOG-4 fix), look up `monsterStatBlockId`, pull `save.<ability>` modifier from stat block; `rollSingle(20) + saveMod`. If no stat block, fall back to +0 with a console warning.
6. Disconnected mid-roll → auto-fail; DM can override via a per-row "Manual: Pass/Fail" select.

**Acceptance:**
- `GroupRollModal.tsx` contains no `'Theron'`/`'Lyra'`/`'Grimjaw'`/`'Senna'` literals (`grep` returns zero hits).
- With two connected peers, DM-initiated save shows two real names; each peer sees a roll prompt; results stream in.
- Monster row uses correct save modifier from stat block.
- Unit test simulates timeout → marks "No Response".

### 26b — Wire "Place All & Start Initiative"

**Files:** `src/renderer/src/components/game/modals/dm-tools/EncounterBuilderModal.tsx`, `src/renderer/src/services/game-actions/token-placement.ts` (new)

**Steps:**
1. Replace `handleStartInitiative` body at `EncounterBuilderModal.tsx:133-141`. After broadcasting the chat summary, fetch `activeMap` via `useGameStore.getState()`; if absent, toast "No active map" and return.
2. For each selected monster entry × `count`, build a `Partial<MapToken>` carrying `label`, `entityType: 'enemy'`, `currentHP/maxHP`, `ac`, `walkSpeed`, `monsterStatBlockId`, `visibleToPlayers: false` (hidden by default — DM reveals later).
3. Call `smartPlaceTokens(activeMap, tokens)` from 26c.
4. Build `InitiativeEntry[]` from the placed tokens (`rollD20() + initiativeModifier`); call `gameStore.startInitiative(entries)`; close modal.
5. If `groupInitiativeEnabled` (`stores/game/index.ts:88`) is on, dedupe identical monsters into one initiative roll per group.

**Acceptance:**
- Clicking "Place All & Start Initiative" with 3 goblins + 1 ogre selected adds 4 tokens to `activeMap.tokens` and pushes 4 entries (or 2 with group init) into `gameStore.initiative`.
- Tokens start `visibleToPlayers: false` (players see nothing until DM toggles).
- New unit test in `EncounterBuilderModal.test.tsx` asserts `addToken` is called N times.

### 26c — Smart token placement

**Files:** `src/renderer/src/services/game-actions/token-placement.ts` (new), test alongside

**Steps:**
1. New module exports `smartPlaceTokens(map: GameMap, tokens: Partial<MapToken>[]): MapToken[]`:
   - Build `occupied = new Set` from existing `map.tokens` (account for `sizeX×sizeY`).
   - Build `blocked = new Set` from `map.walls` (`types/map.ts:202-219`): any cell within 0.5 of a wall segment is blocked.
   - Compute `playerCenter = average(gridX, gridY)` over tokens with `entityType === 'player'`; pick deployment start opposite (if `playerCenter.x > mapCols/2` start at col `2`, else `mapCols - 5`; mirror for Y).
   - For each new token, spiral outward from start via `findEmptyCell(startX, startY, occupied, blocked, mapCols, mapRows, sizeX, sizeY)`; call `gameStore.addToken(map.id, { ...token, gridX, gridY })` and add all occupied cells to `occupied`.
2. `findEmptyCell` must check all `sizeX × sizeY` cells the token would occupy (Large=2×2, Huge=3×3, Gargantuan=4×4) — none may be in `occupied ∪ blocked` and all within map bounds.
3. Use `getSizeTokenDimensions(monster.size)` from `types/monster.ts` (already imported by `executeLoadEncounter`).

**Acceptance:**
- Unit test with a 20×20 map, 4 player tokens at (10,10) cluster, deploying 8 goblins → all 8 placed on opposite half, no overlap, no wall cell.
- Test with Huge dragon (3×3): all 9 underlying cells clear.
- No infinite loop when map is too full (return what was placed, log warning).

### 26d — Wave support

**Files:** `src/renderer/src/types/encounter.ts`, `src/renderer/src/components/game/modals/dm-tools/EncounterBuilderModal.tsx`, `src/renderer/src/components/game/dm/InitiativeTracker.tsx`

**Steps:**
1. In `types/encounter.ts:1-26`, add `EncounterWave { id; name; monsters: EncounterMonster[]; triggerCondition?: string }`. Change `Encounter.monsters: EncounterMonster[]` to `Encounter.waves: EncounterWave[]`.
2. Add migration helper `migrateEncounter(raw): Encounter`: if `raw.monsters` exists and `raw.waves` does not, wrap as `waves: [{ id: 'wave-1', name: 'Wave 1', monsters: raw.monsters }]`. Run at load time wherever encounters are read from `localStorage` (`EncounterBuilderModal.tsx:153` preset load path).
3. Wave tabs in `EncounterBuilderModal.tsx` above the monster table: render `waves.map(...)`, active-wave underline, `+ Add Wave` button. Each wave shows its own monster list + XP subtotal; total encounter XP sums across waves.
4. Trigger condition is free-text only ("round 3", "boss < 50% HP"); no automation.
5. In `InitiativeTracker.tsx`, add "Deploy Wave N" buttons (one per pending wave). On click → run `smartPlaceTokens` for that wave, add to initiative, broadcast a one-shot chat message "Reinforcements arrive!". Mark wave deployed.

**Acceptance:**
- Existing preset in `localStorage` with flat `monsters` still loads (migration test).
- New 2-wave encounter saves and reloads with both waves intact.
- Per-wave XP sum equals total; difficulty bar reflects total.
- "Deploy Wave 2" button only appears when wave 2 has not yet been deployed.

### 26e — Encounter-map linkage

**Files:** `src/renderer/src/components/game/modals/dm-tools/EncounterBuilderModal.tsx`, `src/renderer/src/types/encounter.ts`

**Steps:**
1. Add a `<select>` for `mapId` in `EncounterBuilderModal.tsx`: options pulled from `useGameStore(s => s.maps)`. Persist to encounter preset.
2. When `mapId` is set, render a small canvas preview of the linked map.
3. Per-monster pre-position: extend `EncounterMonster` to `{ ref: EntryRef<'monsters' | 'creatures' | 'npcs'>, count, startX?: number, startY?: number, instanceOverrides? }`. Field name is `instanceOverrides` (Phase 15 Sub-Phase E alignment).
4. Click on the mini-map sets `startX/startY` for the currently selected monster row.
5. If the visual canvas is too costly, ship grid X/Y number inputs per monster row first; the visual click handler can land in a follow-up.

**Acceptance:**
- Setting `mapId` then "Place All" causes tokens with `startX/startY` to use those coords (bypassing smart placement), and tokens without them to fall through to smart placement.
- Per-monster `instanceOverrides` round-trips through save/load.

### 26f — AI deployment uses smart placement

**Files:** `src/renderer/src/services/game-actions/creature-actions.ts`

**Steps:**
1. In `executeLoadEncounter` at `creature-actions.ts:622-715`, delete the tight-grid block (`centerX + col * dims.x`, `centerY + row * dims.y` at lines 658-700) and call `smartPlaceTokens(map, tokens)` from 26c instead.
2. If the preset has any monster with `startX/startY`, honor those exact coords; pass only the remainder through `smartPlaceTokens`.
3. Phase 31 coordination: after Phase 31 lands, the `map-tokens` shard auto-broadcasts. Remove the explicit `broadcastTokenSync(map.id, stores)` call at `creature-actions.ts:704`. Until Phase 31 ships, leave the broadcast call in.

**Acceptance:**
- Loading "Goblin Ambush" preset with 6 goblins on a 25×25 map with players clustered at (5,5) → goblins placed in the (15-22, 15-22) region, none on walls.
- Encounter with pre-positioned monsters places them at exact coords.

## Constraints & edge cases

- **GroupRollModal timeouts:** 30s default; show progress; disconnected mid-roll auto-fails (DM can override row-by-row).
- **Monster auto-roll fallback:** if no stat block linked → +0 modifier with console warning, not a thrown error.
- **Large-token placement:** Large (2×2), Huge (3×3), Gargantuan (4×4) — `findEmptyCell` checks every underlying cell.
- **Tokens hidden by default:** placed enemy tokens start `visibleToPlayers: false`; DM toggles visibility when revealing.
- **Initiative integration:** when starting from the builder, include player tokens already on the map. Respect `groupInitiativeEnabled`.
- **Wave backward compat:** flat `monsters` array → wrap in single wave at load. XP budget shown per-wave AND as total.
- **Wave triggers are free-text only:** no engine automation.
- **Pre-position fallback:** if visual canvas is too heavy, ship X/Y number inputs first.
- **Phase 15 rule:** encounter monster entries are `{ ref, startX, startY, count, instanceOverrides? }` — never embed monster JSON. `instanceOverrides.actions` replaces the whole action array atomically (Phase 15 array-atomic constraint).
- **Phase 31 rule:** `smartPlaceTokens` and `executeLoadEncounter` both write to `gameStore.maps[].tokens`; the `map-tokens` shard diff propagates. Drop explicit `broadcastTokenSync` calls once Phase 31 is live. Wave-trigger "Reinforcements arrive!" stays a chat-shard message.
- **Encounter as its own shard:** Phase 31 Sub-Phase 31i — the `Encounter` object becomes a shard once Phase 31 lands; the data model in 26d should not have hidden cycles or non-serializable fields.

## Verification

- `grep "Theron\|Lyra\|Grimjaw\|Senna" src/` → zero hits.
- Unit tests: `GroupRollModal.test.tsx` covers real-player wiring + timeout; `token-placement.test.ts` covers spread, walls, large tokens; `EncounterBuilderModal.test.tsx` covers wave migration + "Place All" actually adds tokens; `creature-actions.test.ts` covers smart placement and pre-position honoring.
- Manual: open builder, add 4 monsters, click "Place All & Start Initiative" → 4 tokens appear on opposite side of map from players, initiative tracker populated.
- Manual: open group save modal with two connected players → both names appear, both get prompted, results stream in.
- Manual: create 2-wave preset, start initiative on wave 1, click "Deploy Wave 2" → second batch appears with chat broadcast.
- `npm run lint && npm run test && tsc --noEmit` clean.

## Completed

- (none — all five items E1-E5 verified NOT DONE as of 2026-05-19; no steps to archive)
