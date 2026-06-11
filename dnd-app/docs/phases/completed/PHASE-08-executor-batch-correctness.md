# PHASE-08 — Executor batch correctness

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Make the renderer-side DM-action executor (`executeDmActions` and the modules under `services/game-actions/`) behave correctly for multi-action batches and stop lying about success. The phase: (1) re-reads fresh store state per action so the prompt-mandated "place monsters + start_initiative in one response" combo links entities instead of generating orphan ids; (2) restores legendary-action / legendary-resistance / recharge enrichment to AI- and DM-started initiative (it exists only in dead code today); (3) deletes the 11 dead duplicate executors in `creature-actions.ts` and the dead `ai-stream-handler.ts`/`finalizeAiResponse` stream-completion pipeline, both of which pin obsolete behavior via passing tests; (4) surfaces creature stat-mutation failures and gives creature targeting the same prefix fallback DM actions have; (5) fixes the three shop broadcast bugs (stale open-shop payload, missing add/remove broadcasts); (6) stores a real character id in AI-started downtime entries; (7) lists drawing ids in the game-state snapshot so `remove_drawing` is usable; (8) makes line AoEs respect direction and stops `apply_area_effect` zod-stripping `direction`; (9) fixes the `cast_spell`/`query_aoe` case-sensitive caster/exclusion compares; (10) implements the two no-op bastion verbs and makes bastion failures honest. Net effect: the AI DM's combat opener, shop, downtime, drawing, AoE, and bastion verbs all do what the prompt tells the model they do.

## Dependencies & cross-phase notes

- **No prerequisite phases** (index row 08: depends on “—”; phases 01–19 are intentionally independent).
- **PHASE-30 (combat-automation) and PHASE-34 (battlemap-generation) depend on this phase** — they build on a fresh-state executor and enriched initiative entries. Do not weaken the executor public API (`executeDmActions`, `ExecutionResult`, `registerPluginDmAction`).
- **Coordinate with PHASE-04 on `src/renderer/src/services/game-action-executor.ts` and `src/renderer/src/stores/use-ai-dm-store.ts`.** PHASE-04 owns the approval-queue hygiene items (`setPendingActions` overwrite at `game-action-executor.ts:194-205`, `approvePendingActions` discarding the `ExecutionResult` at `use-ai-dm-store.ts:199-207`). This phase changes the execution loop *below* the approval gate (lines 208–251) and must not alter the approval-queueing block semantics.
- **Coordinate with PHASE-05 on `src/renderer/src/hooks/use-game-effects.ts`.** PHASE-05 owns the AI-listener lifecycle effect (`:211-216, 395-405`). This phase only touches `applyStatChangesDirectly` (`:37-130`) and the dm-action failure feedback block (`:469-486`).
- **Coordinate with PHASE-11 on `src/main/ai/dm-actions.ts`, `src/main/ai/ai-schemas.ts`, `src/main/ai/prompt-sections/dm-actions-schema.ts`.** PHASE-11 owns the `light_source`/`extinguish_source` union gap and the misdocumented `[DM_ACTIONS]`-vs-`[STAT_CHANGES]` trio. This phase makes three *additive* edits in those files: `direction` on the `apply_area_effect` schema + union variant + prompt doc, drawing-id wording, and bastion-verb doc updates. Keep edits additive so the two phases merge cleanly in either order.
- **Coordinate with PHASE-02** — it owns the *main-process* stat-mutation pipeline (`src/main/ai/stat-mutations.ts`) and the ignored `window.api.ai.applyMutations` result at `use-game-effects.ts:78` (character mutations). This phase only touches the *renderer-side creature* mutation path (`utils/creature-mutations.ts`).
- **PHASE-12 owns wording sweeps** (e.g. the `🛑 Spirit Guardians (Aria) ends.` phrasing at `spell-effect-actions.ts:216`); do not fix wording here beyond strings this phase introduces.

## Verified findings

All claims below were re-verified against the working tree on 2026-06-10. File paths are relative to `dnd-app/` unless noted. Line numbers are exact as of verification; re-run the listed commands if the tree has drifted.

### F1 — `executeDmActions` runs the whole batch against ONE pre-batch store snapshot (bug/high)

`executeDmActions` (`src/renderer/src/services/game-action-executor.ts:194`) reads the game store ONCE before the loop:

- `:215` `const gameStore = getGameStore().getState()`
- `:216` `const activeMap = gameStore.maps.find((m) => m.id === gameStore.activeMapId)`
- `:219` `filterValidActions(actions, gameStore, activeMap)` — batch validation against that same stale snapshot
- `:224-248` the loop passes the SAME `gameStore`/`activeMap` objects to every `executeOne(action, gameStore, activeMap)` call (`:231`).

Consequences, all confirmed in code:

1. The system prompt's "Dynamic Encounter Generation" section (`src/main/ai/prompt-sections/dm-actions-schema.ts:247-256`) instructs the model to place monsters (step 4 "Place tactically") AND "Always include a `start_initiative` action" (step 5) **in the same response** — i.e. the same batch.
2. `executeStartInitiative`/`executeAddToInitiative` (`src/renderer/src/services/game-actions/creature-initiative.ts:30, :59`) resolve tokens from the stale `activeMap` argument; tokens placed earlier in the same batch are invisible, so entries fall back to `entityId: crypto.randomUUID()` (`:33, :62`) — turn states, conditions, and concentration keyed on `entityId` never link to the real token.
3. `filterValidActions`'s per-action checks (`src/renderer/src/services/game-actions/action-validator.ts:235-258` for `move_token`/`remove_token`/`update_token`, `:289-305` for `use_legendary_*`/`add_entity_condition`/`remove_entity_condition`) reject actions targeting same-batch tokens with "Token … not found on the active map", because validation also ran against the pre-batch snapshot.
4. `executeNextTurn` already proves the fix pattern (the LOG-13 fix): it re-reads fresh state mid-execution via `stores.getGameStore().getState().initiative` (`creature-initiative.ts:88`). No other executor does this.

Mutations performed by executors DO land in the real store immediately (zustand action functions like `gameStore.startInitiative` write through; only the plain data fields on the captured snapshot go stale). Reading `getState()` again returns a fresh snapshot — the standard zustand non-reactive pattern.

Verification commands:

```bash
cd dnd-app
sed -n '194,251p' src/renderer/src/services/game-action-executor.ts
sed -n '247,256p' src/main/ai/prompt-sections/dm-actions-schema.ts
grep -n "getGameStore().getState()" src/renderer/src/services/game-actions/creature-initiative.ts   # only executeNextTurn (:88)
sed -n '28,74p' src/renderer/src/services/game-actions/creature-initiative.ts
```

### F2 — Legendary/recharge enrichment never happens on live paths; `use_legendary_action`/`use_legendary_resistance` always throw (bug/high)

- The LIVE initiative executors (`src/renderer/src/services/game-actions/creature-initiative.ts`) build bare `InitiativeEntry` objects (`:28-41` start, `:59-69` add) with NO `legendaryActions`, `legendaryResistances`, `rechargeAbilities`, or `lairActions`.
- `executeUseLegendaryAction` throws `"${label} has no legendary actions"` when `entry.legendaryActions` is undefined (`creature-initiative.ts:171`); `executeUseLegendaryResistance` throws at `:195-196`. For AI-started initiative these ALWAYS throw.
- Recharge auto-roll on turn change (`creature-initiative.ts:97-124`) only runs if `entry.rechargeAbilities` is populated — which today only happens after an explicit `recharge_roll` action seeds it (`:242-248`).
- The validator pre-filters `use_legendary_action`/`use_legendary_resistance` ONLY by token presence on the map (`action-validator.ts:289-296`), so they pass validation and then throw in the executor.
- The manual DM path (`src/renderer/src/components/game/dm/InitiativeTracker.tsx:163-214` — note the audit's `components/game/InitiativeTracker.tsx` path was stale; the file is under `game/dm/`) seeds only `legendaryResistances` from a hand-typed count (`:185`, `:205`) plus `inLair` (`:206`) — never `legendaryActions` or `rechargeAbilities`.
- A COMPLETE enrichment implementation exists but is dead: `enrichWithLegendaryData` (`src/renderer/src/services/game-actions/creature-actions.ts:37-83`) parses `statBlock.legendaryActions.uses`, the `Legendary Resistance (N/Day)` trait, `(Recharge N)`/`(Recharge N-6)` action names, and `lairActions` — but it is called only by the dead duplicate executors (F3) and uses an async module-level monster cache (`:15-31`, `ensureLegendaryMonsterCache` via `load5eMonsters`).
- The modern, synchronous lookup path exists: `lookupTokenStatBlock(id)` (`src/renderer/src/services/game/token-stats.ts:81-89`) resolves a `MonsterStatBlock` from the library truth store (`useLibraryStore`) across `['monsters', 'npcs', 'creatures']` categories — no cache needed, and it honors the library single-source-of-truth rule.
- Shapes confirmed: `MonsterStatBlock.legendaryActions?: { uses: number; actions: MonsterAction[] }` and `lairActions?: { description?, initiativeCount, actions[] }` (`src/renderer/src/types/monster.ts:126-131`); `InitiativeEntry` carries `legendaryResistances? { max, remaining }`, `legendaryActions? { used, maximum }`, `rechargeAbilities?: RechargeAbility[]`, `inLair?`, `lairActions?` (`src/renderer/src/types/game-state.ts:67-87`).
- Real data formats (from `src/renderer/public/data/5e/dm/npcs/monsters.json`, 379 monsters, 45 with `legendaryActions`): LR trait names are `Legendary Resistance (3/Day)`, `(4/Day)`, `(6/Day)`, and 2024-style `(3/Day, or 4/Day in Lair)` / `(4/Day, or 5/Day in Lair)`; recharge forms are `(Recharge 5-6)` (HYPHEN, not en-dash, in this dataset) and `(Recharges after a Short or Long Rest)` (which the `\(Recharge (\d)` regex correctly does NOT match).

Verification commands:

```bash
cd dnd-app
grep -n "legendaryActions\|legendaryResistances\|rechargeAbilities" src/renderer/src/services/game-actions/creature-initiative.ts
sed -n '37,83p' src/renderer/src/services/game-actions/creature-actions.ts
sed -n '163,214p' src/renderer/src/components/game/dm/InitiativeTracker.tsx
sed -n '81,99p' src/renderer/src/services/game/token-stats.ts
python3 -c "
import json,re
ms=json.load(open('src/renderer/public/data/5e/dm/npcs/monsters.json'))
lr={t['name'] for m in ms for t in (m.get('traits') or []) if 'legendary resistance' in t.get('name','').lower()}
rc={mm.group(0) for m in ms for a in (m.get('actions') or [])+(m.get('bonusActions') or []) for mm in [re.search(r'\(Recharge[^)]*\)', a.get('name',''))] if mm}
print(sorted(lr)); print(sorted(rc))"
```

### F3 — 11 dead duplicate executors in `creature-actions.ts`, pinned by their own test (debt/high)

`src/renderer/src/services/game-actions/creature-actions.ts` (836 lines) exports 18 functions. The ONLY production importer is `game-action-executor.ts:35-43`, which imports exactly 7: `executeAwardTreasure`, `executeAwardXp`, `executeLoadEncounter`, `executeLongRest`, `executeSetNpcAttitude`, `executeShortRest`, `executeTriggerLevelUp`. The other 11 are dead duplicates whose live copies moved to `creature-initiative.ts` and `creature-conditions.ts`:

| Dead export (creature-actions.ts line) | Live copy |
|---|---|
| `executeStartInitiative` (:106) | creature-initiative.ts:14 |
| `executeAddToInitiative` (:147) | creature-initiative.ts:53 |
| `executeNextTurn` (:172) | creature-initiative.ts:76 |
| `executeEndInitiative` (:215) | creature-initiative.ts:131 |
| `executeRemoveFromInitiative` (:226) | creature-initiative.ts:142 |
| `executeAddEntityCondition` (:244) | creature-conditions.ts:10 |
| `executeRemoveEntityCondition` (:272) | creature-conditions.ts:66 |
| `executeApplyAreaEffect` (:297) | creature-conditions.ts:99 |
| `executeUseLegendaryAction` (:371) | creature-initiative.ts:160 |
| `executeUseLegendaryResistance` (:396) | creature-initiative.ts:185 |
| `executeRechargeRoll` (:425) | creature-initiative.ts:224 |

Divergence runs BOTH directions: the dead `executeNextTurn` (`:172-213`) still computes `(currentIdx + 1) % entries.length` — the pre-LOG-13 bug that resets legendary actions / rolls recharge for the WRONG creature when entries delay — while the dead `executeStartInitiative`/`executeAddToInitiative` retain the `enrichWithLegendaryData` call that the live copies LOST during extraction (this is the root cause of F2). `creature-actions.test.ts` (868 lines) imports the dead duplicates (`:31-51`) and keeps the stale behavior green. The enrichment helpers (`monsterCacheForLegendary`, `ensureLegendaryMonsterCache`, `enrichWithLegendaryData`, `:15-83`) are used only by the dead duplicates. The live `creature-initiative.ts` and `creature-conditions.ts` have their own test files (`creature-initiative.test.ts`, `creature-conditions.test.ts`).

Verification commands:

```bash
cd dnd-app
grep -rn "from './game-actions/creature-actions'" src --include="*.ts*"        # only game-action-executor.ts (7 live fns)
grep -n "^export function" src/renderer/src/services/game-actions/creature-actions.ts
grep -n "^export function" src/renderer/src/services/game-actions/creature-initiative.ts
grep -n "^export function" src/renderer/src/services/game-actions/creature-conditions.ts
sed -n '172,213p' src/renderer/src/services/game-actions/creature-actions.ts   # pre-LOG-13 nextTurn
```

### F4 — `ai-stream-handler.ts` + `finalizeAiResponse` form a dead, divergent stream-completion pipeline (debt/high)

- `src/main/ai/ai-stream-handler.ts` (234 lines) is imported by production code ONLY for types: `ai-service.ts:19` `import type { PendingWebSearchApproval, StreamHandlerDeps } from './ai-stream-handler'`. `StreamHandlerDeps` is used at `ai-service.ts:289` (`getStreamDeps()`) and `:751` (default param); `PendingWebSearchApproval` types ai-service's own map.
- The module's RUNTIME exports are all dead: its `clearPendingWebSearchApproval` (`:33`), `approveWebSearch` (`:66`), and `handleStreamCompletion` (`:111`) have zero production callers. `ai-service.ts` has its own private copies: `pendingWebSearchApprovals` map (`:142`), `clearPendingWebSearchApproval` (`:511`), `approveWebSearch` (routed from `src/main/ipc/ai-handlers.ts:254` → `aiService.approveWebSearch`), and `handleStreamCompletion` (`:735`). An approval routed to the dead module's map would never find ai-service's entries.
- The dead pipeline lags the live one: it does not strip `[NPC:]`/`[EMOTION:]` voice tags, does not persist `npc_attitude` to NPC memory, does not send narration to Discord — `ai-service.ts` imports `parseVoiceTags`/`stripVoiceTags` etc. directly from `ai-response-parser` (`ai-service.ts:10-18`) and does all of that in its private completion path.
- `finalizeAiResponse` (`src/main/ai/ai-response-parser.ts:105`) is called ONLY by the dead `ai-stream-handler.ts:232` and by tests (`ai-response-parser.test.ts`, `ai-stream-handler.test.ts`). The live parse/strip helpers in the same file (`parseRuleCitations`, `stripRuleCitations`, `parseVoiceTags`, `stripVoiceTags`, `parseRulings`, `stripRulings`, `:13-86`) ARE production code — keep them.
- `ai-stream-handler.test.ts` (249 lines) certifies the dead pipeline; `ai-service.test.ts:141` mocks `finalizeAiResponse` in its `ai-response-parser` module mock even though ai-service never calls it.

Verification commands:

```bash
cd dnd-app
grep -rn "ai-stream-handler" src --include="*.ts" | grep -v test          # only the type import in ai-service.ts:19
grep -rn "finalizeAiResponse" src --include="*.ts" | grep -v test         # parser def :105 + dead handler :3,:232
grep -n "pendingWebSearchApprovals\|handleStreamCompletion\|approveWebSearch" src/main/ai/ai-service.ts | head
```

### F5 — Creature stat-mutation failures silently discarded; no prefix fallback; no-active-map drop (bug/medium)

- `applyCreatureMutations` (`src/renderer/src/utils/creature-mutations.ts:33-131`) returns `Array<{ change, applied, reason? }>` with reasons like `Token not found: ${label}` (`:52`) — but the caller `applyStatChangesDirectly` (`src/renderer/src/hooks/use-game-effects.ts:85-96`) discards the return value entirely.
- Token resolution is exact-only: `activeMap.tokens.find((t) => t.label.toLowerCase() === label.toLowerCase())` (`creature-mutations.ts:49`). DM actions use `resolveTokenByLabel` (`src/renderer/src/services/game-actions/name-resolver.ts:9-15`) which adds a `startsWith` prefix fallback ("Goblin" matches "Goblin 1") — creature mutations targeting `goblin-2`-style suffixed labels miss.
- The guard `if (creatureChanges.length > 0 && activeMap)` (`use-game-effects.ts:84`) silently drops ALL creature changes when no map is active — no alert, no log.
- The surfacing patterns to copy already exist in the same file: `pushDmAlert('warning', i18n.t('notify.aiDmStore.mutationUnknownCharacter', { name }))` (`use-game-effects.ts:63`; key exists in both `en.json:5078` and `es.json:5078`) and the per-failed-action system chat post in the auto-execute path (`:474-483`).

Verification commands:

```bash
cd dnd-app
sed -n '83,97p' src/renderer/src/hooks/use-game-effects.ts
sed -n '42,55p' src/renderer/src/utils/creature-mutations.ts
sed -n '9,15p' src/renderer/src/services/game-actions/name-resolver.ts
grep -n "mutationUnknownCharacter" src/renderer/src/i18n/locales/en.json src/renderer/src/i18n/locales/es.json
```

### F6 — Shop: `open_shop` broadcasts stale inventory; `add_shop_item`/`remove_shop_item` never broadcast (bug/high)

- `executeOpenShop` (`src/renderer/src/services/game-actions/effect-actions.ts:229-266`) calls `gameStore.openShop(name)` and `gameStore.setShopInventory(shopItems)` (which write through to the real store), then broadcasts `sendMessage('dm:shop-update', { shopInventory: gameStore.shopInventory, … })` (`:261-264`) — `gameStore` is the pre-batch snapshot, so the payload is the PREVIOUS (typically empty) inventory.
- `executeAddShopItem` (`:280-290`) mutates the host store and sends nothing. `executeRemoveShopItem` (`:292-303`) reads fresh state via `stores.getGameStore().getState()` (correct) but also sends nothing.
- The correct pattern exists host-side: the player purchase/sell handlers compute `updatedInventory` and broadcast `{ shopInventory: updatedInventory, shopName: gameStore.shopName }` on `dm:shop-update` (`src/renderer/src/stores/network-store/host-handlers.ts:285-300` buy, `:305-343` sell).
- Clients apply it via `handleShopUpdate` (`src/renderer/src/stores/network-store/client-handlers/game-action-handlers.ts:145-151`): `setShopInventory(payload.shopInventory)` + `openShop(payload.shopName)` when a name is present. There is no `shopInventory` shard in the periodic sync; full-state rejoin covers it (`client-handlers.ts:108`, `network-store/index.ts:842`) — so missing broadcasts mean divergence until rejoin.

Verification commands:

```bash
cd dnd-app
sed -n '229,303p' src/renderer/src/services/game-actions/effect-actions.ts
grep -n "dm:shop-update" -B2 -A4 src/renderer/src/stores/network-store/host-handlers.ts | head -30
sed -n '145,151p' src/renderer/src/stores/network-store/client-handlers/game-action-handlers.ts
```

### F7 — `executeStartDowntime` stores a lobby peerId (or the raw name) as `characterId` (bug/medium)

- `executeStartDowntime` (`src/renderer/src/services/game-actions/downtime-actions.ts:36`): `const characterId = resolvePlayerByName(characterName, stores) ?? characterName`, stored into `DowntimeProgressEntry.characterId` (`:41`).
- `resolvePlayerByName` returns `match?.peerId` (`name-resolver.ts:33-41`) — a transport id, not a character id. `LobbyPlayer` DOES carry the real id: `characterId: string | null` (`src/renderer/src/stores/use-lobby-store.ts:114`).
- Consumers filter by real character id: `getActiveDowntimeForCharacter(campaign, characterId)` (`src/renderer/src/services/downtime-service.ts:265-267`), called from `DowntimeModal.tsx:76` and `commands-dm-time.ts:233` (`char.id`). AI-started downtime therefore never appears in the per-character downtime UI. `executeAdvanceDowntime` works only because it matches by `characterName` (`downtime-actions.ts:77-82`).

Verification commands:

```bash
cd dnd-app
sed -n '33,41p' src/renderer/src/services/game-actions/downtime-actions.ts
sed -n '33,41p' src/renderer/src/services/game-actions/name-resolver.ts
grep -n "characterId" src/renderer/src/stores/use-lobby-store.ts | head -3
grep -rn "getActiveDowntimeForCharacter" src --include="*.ts*" | grep -v test
```

### F8 — `remove_drawing` is unusable: snapshot exposes only a count, and the executor reports success for missing ids (bug/medium)

- The snapshot emits only `Drawings: N on map (M DM-only)` (`src/renderer/src/services/game-actions/state-snapshot.ts:122-127`) — the AI can never learn a `drawingId`.
- `executeRemoveDrawing` (`src/renderer/src/services/game-actions/map-annotation-actions.ts:39-48`) calls `gameStore.removeDrawing(activeMap.id, action.drawingId)` and returns `true` unconditionally — store removal of a missing id is a silent no-op, so the AI is told the action succeeded.
- **Audit correction:** there is NO `update_drawing` action anywhere (`grep -rn "update_drawing" src` returns nothing — no schema, no executor, no prompt doc). The audit listed `remove_drawing`/`update_drawing`; only `remove_drawing` exists. Walls and regions already list ids in the snapshot (`state-snapshot.ts:100-120`) — the established pattern to follow.
- `DrawingData` shape (`src/renderer/src/types/map.ts:261-273`): `{ id, type, points[], color, strokeWidth, text?, visibleToPlayers?, floor? }`. Prompt doc for drawings: `dm-actions-schema.ts:151-153` (documents `remove_drawing: {drawingId}` with no way to learn ids).

Verification commands:

```bash
cd dnd-app
sed -n '122,127p' src/renderer/src/services/game-actions/state-snapshot.ts
sed -n '39,48p' src/renderer/src/services/game-actions/map-annotation-actions.ts
grep -rn "update_drawing" src --include="*.ts"      # expect: no matches
sed -n '151,153p' src/main/ai/prompt-sections/dm-actions-schema.ts
```

### F9 — Line AoEs ignore direction; `apply_area_effect` zod-strips `direction`; caster exclusion is case-sensitive (bug/medium ×2)

- `findTokensInArea` (`src/renderer/src/services/game-actions/dice-helpers.ts:30-69`) accepts `directionDeg` but consumes it ONLY in the cone branch (`:43-46` via `getConeCells`); the line branch is hardcoded +x: `Math.abs(dy) <= floor(w/2) && dx >= 0 && dx <= radiusCells` (`:61-64`).
- A direction-aware line implementation already exists but is private: `getLineCells(originX, originY, lengthFt, directionDeg, widthFt)` (`src/renderer/src/services/combat/aoe-targeting.ts:160-190`); `getConeCells` from the same module is already exported and consumed by dice-helpers (`:120`, precedent from the LOG-5 cone fix).
- `ApplyAreaEffectSchema` (`src/main/ai/ai-schemas.ts:700-714`) has NO `direction` field. zod v4 (`package.json`: `"zod": "^4.4.3"`) strips unknown keys by default on `z.object` (strip mode), so whatever `direction` the AI sends is removed before the action reaches the renderer — cones AND lines via `apply_area_effect` always face +x. The renderer executor `executeApplyAreaEffect` (`src/renderer/src/services/game-actions/creature-conditions.ts:99-122`) ALREADY passes `action.direction as number | undefined` to `findTokensInArea` — once the schema stops stripping it, the cone case works with zero renderer change.
- The hand-written union variant for `apply_area_effect` (`src/main/ai/dm-actions.ts:183-196`) also lacks `direction` (`query_aoe`/`cast_spell` variants have it at `:206`, `:218`). Prompt doc (`dm-actions-schema.ts:125`) documents `apply_area_effect` without `direction` while `query_aoe` (`:126`) and `cast_spell` (`:129`) document it.
- Caster exclusion case bug: `executeCastSpell` resolves the caster case-insensitively (`spell-effect-actions.ts:87` via `resolveTokenByLabel`) but filters AoE targets with the raw compare `.filter((t) => t.label !== caster)` (`:128`) — a caster labeled "Aria" is hit by their own fireball if the AI writes `caster: "aria"`. `executeQueryAoe` has the same raw compare for `excludeLabel` (`:52`) and never resolves anything.
- The schema↔executor contract test lives at `src/main/ai/ai-schemas.test.ts:717-744` ("DM action schema ↔ executor contract") — it checks action-type coverage both ways via regex over `game-action-executor.ts`; adding a field to an existing schema does not disturb it.

Verification commands:

```bash
cd dnd-app
sed -n '42,69p' src/renderer/src/services/game-actions/dice-helpers.ts
sed -n '160,190p' src/renderer/src/services/combat/aoe-targeting.ts
sed -n '700,714p' src/main/ai/ai-schemas.ts                       # no direction
sed -n '183,196p' src/main/ai/dm-actions.ts                       # no direction
grep -n "direction" src/renderer/src/services/game-actions/creature-conditions.ts   # executor already forwards it
grep -n "t.label !== caster\|t.label !== excludeLabel" src/renderer/src/services/game-actions/spell-effect-actions.ts
```

### F10 — Bastion: two chat-only no-op verbs; silent "success" on missing bastion/facility; swallowed callback errors (stub/medium)

- `executeBastionResolveEvent` (`src/renderer/src/services/game-actions/effect-actions.ts:535-545`) posts `Bastion event "X" resolved for Y's bastion.` to chat and touches NO store. `executeBastionAddCreature` (`:640-649`) likewise posts `"<creature> added to <owner>'s <facility>."` and does nothing.
- **Audit correction:** standalone event resolution DOES exist in the store — `rollAndResolveEvent(bastionId, turnNumber)` (`src/renderer/src/stores/bastion-store/event-slice.ts:196-262`) rolls a random bastion event, auto-resolves attack/friendly-visitors/refugees/gaming-hall outcomes, and saves. The audit claimed auto-resolution "lives inside `advanceTime`" — `advanceTime` (`event-slice.ts:37-114`) only advances construction and calls `checkAndTriggerTurn`; it never resolves events. The catch: `rollAndResolveEvent` rolls its OWN event type, while the AI schema passes one (`BastionResolveEventSchema { bastionOwner, eventType }`, `ai-schemas.ts:1156-1160`). Also `startTurn(bastionId)` exists (`event-slice.ts:123-150`) to open a turn when none is pending.
- `addCreature(bastionId, facilityId, creature: MenagerieCreature)` exists (`src/renderer/src/stores/bastion-store/facility-slice.ts:315`; type at `bastion-store/types.ts:65`). `MenagerieCreature` = `{ name, creatureType, size: 'tiny'|'small'|'medium'|'large'|'huge', isDefender }` (`src/renderer/src/types/bastion.ts:112-117`). `BastionAddCreatureSchema` currently carries only `{ bastionOwner, facilityName, creatureName }` (`ai-schemas.ts` near `:1162`).
- `withBastionStore` (`effect-actions.ts:134-140`) is a fire-and-forget dynamic import: `import(...).then(cb)` with NO `.catch` — a throw inside the callback becomes an unhandled rejection AFTER the executor already returned `true`. All bastion verbs guard with `if (bastion) …` / `if (!facility) return` inside the async callback (`:479-484` advance_time, `:492-508` issue_order, `:514-521` deposit, `:526-533` withdraw, `:550-560` recruit) — when the bastion or facility isn't found, nothing happens and the AI is still told the action succeeded.
- Prompt docs for the seven bastion verbs: `dm-actions-schema.ts:210-217`.

Verification commands:

```bash
cd dnd-app
sed -n '134,140p;474,560p;640,649p' src/renderer/src/services/game-actions/effect-actions.ts
sed -n '37,114p;123,150p;196,262p' src/renderer/src/stores/bastion-store/event-slice.ts
grep -n "addCreature" src/renderer/src/stores/bastion-store/facility-slice.ts src/renderer/src/stores/bastion-store/types.ts
grep -n "MenagerieCreature" -A 6 src/renderer/src/types/bastion.ts | head -10
sed -n '210,217p' src/main/ai/prompt-sections/dm-actions-schema.ts
```

## Sub-phases

Run in order; each leaves the tree compiling and its targeted tests green. Per INSTRUCTIONS.md rule 5, run only the listed cheap checks per sub-phase; the full 4-gate runs once at phase end.

### 08A — Fresh-state execution loop in `executeDmActions`

**Objective:** every action in a batch validates and executes against the store state as it exists at that action's turn, so same-batch sequencing (place → initiative → move/condition) links correctly.

**Files:** `src/renderer/src/services/game-action-executor.ts`, `src/renderer/src/services/game-action-executor.test.ts`.

**Steps:**

1. In `executeDmActions` (`game-action-executor.ts:194`), delete the pre-loop snapshot (`:215-216`) and the batch-level `filterValidActions` call (`:218-222`). Replace the loop body so each iteration:
   ```ts
   for (const action of actions) {
     const gameStore = getGameStore().getState()
     const activeMap = gameStore.maps.find((m) => m.id === gameStore.activeMapId)
     const { valid, rejected } = filterValidActions([action], gameStore, activeMap)
     if (rejected.length > 0) {
       result.failed.push({ action, reason: rejected[0].reason ?? 'Failed game-state validation' })
       continue
     }
     // existing plugin before-hook + try/executeOne(action, gameStore, activeMap)/after-hook + catch — unchanged
   }
   ```
   Keep the `MAX_ACTIONS_PER_BATCH` truncation (`:210-213`) before the loop. Keep the approval-queue block (`:195-206`) byte-identical (PHASE-04 territory).
2. Keep the exported `filterValidActions`/`validateActionsAgainstState` re-exports (`:11`) — external callers still batch-validate.
3. Add behavior tests to `game-action-executor.test.ts` (currently source-text assertions only, keep those). Mock `../stores/store-accessors` (pattern: `creature-initiative.test.ts:23-39`) with a minimal mutable store whose `addToken`-equivalent (`place_token` executor calls `gameStore.addToken`/`updateMapTokens` — mirror whatever `token-actions.ts` calls; read `executePlaceToken` first) appends to a shared `tokens` array that subsequent `getState()` calls see. Test cases:
   - `place_token` (or `place_creature`) followed by `start_initiative` naming the placed label in ONE batch → the initiative entry's `entityId` equals the placed token's `entityId` (not a fresh UUID).
   - `place_token` followed by `move_token` targeting the same label in one batch → `result.failed` is empty.
   - An action targeting a genuinely absent token still lands in `result.failed` with the validator reason.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/services/game-action-executor.test.ts`

**Acceptance:** the three new tests pass; no change to the approval-queue block; `executeOne` signature unchanged.

### 08B — Legendary/recharge/lair enrichment on live initiative paths (AI + DM)

**Objective:** AI-started and DM-started initiative entries carry `legendaryActions`/`legendaryResistances`/`rechargeAbilities`/`lairActions` resolved from the library stat block, so `use_legendary_action`/`use_legendary_resistance` and the next-turn recharge auto-roll actually function.

**Files:** new `src/renderer/src/services/game-actions/initiative-enrichment.ts` (+ colocated `.test.ts`), `src/renderer/src/services/game-actions/creature-initiative.ts`, `src/renderer/src/components/game/dm/InitiativeTracker.tsx`.

**Steps:**

1. Create `initiative-enrichment.ts` exporting `enrichInitiativeEntry(entry: InitiativeEntry, token: MapToken | undefined): InitiativeEntry`:
   - Return `entry` unchanged when `!token?.monsterStatBlockId` or `lookupTokenStatBlock(token.monsterStatBlockId)` (from `../game/token-stats`) returns undefined — synchronous, library-truth-store backed; NO monster cache.
   - `legendaryActions`: from `statBlock.legendaryActions` → `{ maximum: statBlock.legendaryActions.uses, used: 0 }`.
   - `legendaryResistances`: find the trait whose name lower-cases to include `legendary resistance`; parse base count with `/\((\d+)/` (default 3); if `entry.inLair` and the name matches `/or (\d+)\/Day in Lair/i`, use that count instead (2024 MM format, present in the shipped dataset: `Legendary Resistance (3/Day, or 4/Day in Lair)`).
   - `rechargeAbilities`: scan `[...(statBlock.actions ?? []), ...(statBlock.bonusActions ?? [])]` for `/\(Recharge (\d)(?:[–-]\d)?\)/` (handles `(Recharge 5-6)` hyphen, en-dash, and `(Recharge 6)`; must NOT match `(Recharges after a Short or Long Rest)`) → `{ name: name.replace(/\s*\(Recharge.*?\)/, ''), rechargeOn, available: true }`.
   - `lairActions`: when `statBlock.lairActions` exists AND `entry.inLair` → `statBlock.lairActions.actions`.
   - Do not mutate the input; spread-copy. Never overwrite a field the entry already carries (manual DM LR input wins: `entry.legendaryResistances ?? parsed`).
2. In `creature-initiative.ts`, call the helper in `executeStartInitiative` (wrap the object built at `:31-40`) and `executeAddToInitiative` (`:60-69`). The `token` is the one already resolved via `resolveTokenByLabel`. (With 08A landed, same-batch tokens resolve here.)
3. In `InitiativeTracker.tsx` `handleRollInitiative` (`:163-214`): for rows with a `tokenId`, look up the token (`tokens?.find((t) => t.id === e.tokenId)`, already done at `:190`) and pass the built entry through `enrichInitiativeEntry(entry, token)` before collecting. The manual `legendaryResistances` input (`:185`, `:205`) stays as an override (already on the entry → helper must not clobber, per step 1).
4. Tests (`initiative-enrichment.test.ts`): mock `../game/token-stats`'s `lookupTokenStatBlock`; cover: no statBlockId → unchanged; legendaryActions mapping; LR base + in-lair bump; recharge parse incl. the `(Recharges after a Short or Long Rest)` non-match; manual-LR-wins; lairActions gated on `inLair`. Extend `creature-initiative.test.ts`: start_initiative with a mocked statBlock-bearing token yields an enriched entry (mock the new module OR the token-stats lookup).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/services/game-actions/initiative-enrichment.test.ts src/renderer/src/services/game-actions/creature-initiative.test.ts`

**Acceptance:** enrichment helper green; both live initiative executors and the DM tracker path call it; no async/cache machinery introduced; library-boundary test untouched (lookup goes through `token-stats.ts`, which is already allowlisted).

### 08C — Delete the 11 dead duplicate executors + their pinning tests

**Objective:** `creature-actions.ts` keeps only live code; no test pins pre-LOG-13 behavior.

**Files:** `src/renderer/src/services/game-actions/creature-actions.ts`, `src/renderer/src/services/game-actions/creature-actions.test.ts`.

**Steps:**

1. From `creature-actions.ts` delete the 11 dead exports listed in F3 (`:106-458`) AND the now-orphaned enrichment block (`monsterCacheForLegendary`, `ensureLegendaryMonsterCache`, `enrichWithLegendaryData`, `:15-83` — superseded by 08B's `initiative-enrichment.ts`). Keep `postDmChatMessage` (`:90-103`) and the 7 live exports (`executeAwardXp :477`, `executeAwardTreasure :511`, `executeTriggerLevelUp :567`, `executeShortRest :583`, `executeLongRest :618`, `executeLoadEncounter :687`, `executeSetNpcAttitude :804`). Prune imports that go unused (`InitiativeEntry`, `MonsterStatBlock`, `resolveTokenByLabel`, `broadcastInitiativeSync`, possibly `rollDiceFormula`/`findTokensInArea` — verify per remaining usage).
2. Rewrite `creature-actions.test.ts` to import/test ONLY the 7 live exports; delete the describe blocks for the 11 dead duplicates. Before deleting any dead-duplicate test, check whether `creature-initiative.test.ts` / `creature-conditions.test.ts` already covers the equivalent live behavior; port any genuinely missing case to the live module's test file instead of dropping coverage (most are already covered — both files exist with full suites).
3. `grep -rn "creature-actions" src --include="*.ts*"` afterward — only `game-action-executor.ts` and the trimmed test should remain.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/services/game-actions/creature-actions.test.ts src/renderer/src/services/game-actions/creature-initiative.test.ts src/renderer/src/services/game-actions/creature-conditions.test.ts`

**Acceptance:** the 11 dead exports and the dead enrichment block are gone; the 7 live executors still imported by the executor and tested; lint (knip/unused-import) clean on the touched files.

### 08D — Delete the dead `ai-stream-handler.ts` / `finalizeAiResponse` pipeline

**Objective:** one stream-completion pipeline (ai-service's live private one); no divergent dead copy, no test certifying behavior players never get.

**Files:** delete `src/main/ai/ai-stream-handler.ts`, `src/main/ai/ai-stream-handler.test.ts`; edit `src/main/ai/ai-service.ts`, `src/main/ai/ai-response-parser.ts`, `src/main/ai/ai-response-parser.test.ts`, `src/main/ai/ai-service.test.ts`.

**Steps:**

1. Move the two type definitions ai-service consumes into `ai-service.ts` itself (directly above their first use): copy `PendingWebSearchApproval` (`ai-stream-handler.ts:21-26`) and `StreamHandlerDeps` (`:90-105`) verbatim; delete the `import type … from './ai-stream-handler'` at `ai-service.ts:19`. (Local definition preferred over `types.ts` — `StreamHandlerDeps` references `ChatMessage`/`StreamCallbacks` already imported there, and no other module needs them.)
2. `git rm` `ai-stream-handler.ts` and `ai-stream-handler.test.ts`.
3. In `ai-response-parser.ts` delete `finalizeAiResponse` (`:105-…end`) and the `FinalizedResponse` interface (`:90-103`) — first confirm no other importer: `grep -rn "FinalizedResponse\|finalizeAiResponse" src --include="*.ts"` must show only the parser, its test, and the just-deleted handler. Keep every other export (`parseRuleCitations`, `stripRuleCitations`, `parseVoiceTags`, `stripVoiceTags`, `parseRulings`, `stripRulings`, `ParsedRuling`).
4. In `ai-response-parser.test.ts` remove the `finalizeAiResponse` import and its describe block (`:119-…`); keep all other tests. In `ai-service.test.ts` drop the `finalizeAiResponse` key from the `ai-response-parser` module mock (`:141`) — the mock factory must keep providing the helpers ai-service really imports.
5. Sanity: `grep -rn "ai-stream-handler" src --include="*.ts"` → zero hits.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/main/ai/ai-response-parser.test.ts src/main/ai/ai-service.test.ts`

**Acceptance:** module + test deleted; ai-service compiles with locally-defined types; zero references to the deleted symbols anywhere; live web-search-approval flow (`ai-handlers.ts:254` → `aiService.approveWebSearch`) untouched.

### 08E — Surface creature stat-mutation failures + prefix fallback + no-map alert

**Objective:** the DM sees every creature mutation that didn't apply, and `goblin`-style prefix targeting works like DM actions.

**Files:** `src/renderer/src/utils/creature-mutations.ts` (+ its test if present, else create `creature-mutations.test.ts`), `src/renderer/src/hooks/use-game-effects.ts`, `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`.

**Steps:**

1. In `creature-mutations.ts:49`, replace the exact-match `find` with `resolveTokenByLabel(activeMap.tokens, label)` imported from `../services/game-actions/name-resolver` (exact case-insensitive first, then `startsWith` prefix — identical semantics to DM actions).
2. In `use-game-effects.ts` `applyStatChangesDirectly`:
   - Consume the return of `applyCreatureMutations` (`:88-94`): for each `{ applied: false, reason }`, `pushDmAlert('warning', i18n.t('notify.aiDmStore.creatureMutationFailed', { type: change.type, target: change.targetLabel ?? '?', reason }))`.
   - Replace the silent drop at `:84`: when `creatureChanges.length > 0 && !activeMap`, push ONE alert `i18n.t('notify.aiDmStore.creatureMutationsNoMap', { count: creatureChanges.length })` instead of doing nothing.
3. Add both keys to `en.json` and `es.json` under the existing `notify.aiDmStore` namespace (sibling of `mutationUnknownCharacter`, `en.json:5078`):
   - `creatureMutationFailed`: `"AI creature change {{type}} on \"{{target}}\" not applied — {{reason}}"` / es: `"Cambio de criatura de la IA {{type}} en \"{{target}}\" no aplicado — {{reason}}"`
   - `creatureMutationsNoMap`: `"{{count}} AI creature change(s) skipped — no active map"` / es: `"{{count}} cambio(s) de criatura de la IA omitido(s) — no hay mapa activo"`
4. Tests: creature-mutations test — prefix fallback resolves `"Goblin"` against a sole `"Goblin 1"` token; missing token returns `{ applied: false, reason }`. (Alert-path coverage at the hook level is not required — the unit seam is the returned results array.)

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/utils/creature-mutations.test.ts`

**Acceptance:** failures produce DM alerts (auto-approve path), prefix targeting works, no-map case alerts once, both locales updated.

### 08F — Shop broadcast correctness

**Objective:** clients always receive the post-mutation shop inventory for AI shop verbs.

**Files:** `src/renderer/src/services/game-actions/effect-actions.ts`, `src/renderer/src/services/game-actions/effect-actions.test.ts`.

**Steps:**

1. `executeOpenShop` (`:261-264`): broadcast `stores.getGameStore().getState().shopInventory` instead of the stale `gameStore.shopInventory`.
2. `executeAddShopItem` (`:280-290`): change the signature to the 4-arg form `(action, gameStore, _activeMap, stores)` (matching its switch call site — update `game-action-executor.ts:298-299` to pass all four args), and after `addShopItem` send `dm:shop-update` with `{ shopInventory: stores.getGameStore().getState().shopInventory, shopName: stores.getGameStore().getState().shopName }` (mirror the host buy/sell payload shape, `host-handlers.ts:293-300`).
3. `executeRemoveShopItem` (`:292-303`): after `removeShopItem`, send the same fresh `dm:shop-update`.
4. Note for the client side: `handleShopUpdate` calls `openShop(payload.shopName)` when `shopName` is truthy (`game-action-handlers.ts:148-150`) — sending the current `shopName` is correct for add/remove while a shop is open; when no shop is open (`shopName` empty) the update is inventory-only and must NOT force-open a shop client-side, which the existing truthiness guard already ensures.
5. Tests in `effect-actions.test.ts`: open_shop broadcast payload contains the JUST-SET items (assert `sendMessage` called with the inventory returned by the mocked fresh `getState()`, not the snapshot's); add/remove each emit exactly one `dm:shop-update` with fresh inventory.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/services/game-actions/effect-actions.test.ts`

**Acceptance:** all three executors broadcast fresh state; contract test (`ai-schemas.test.ts:722`) still green (no action types changed).

### 08G — Downtime: store the real character id

**Objective:** AI-started downtime appears in the per-character downtime UI.

**Files:** `src/renderer/src/services/game-actions/name-resolver.ts`, `src/renderer/src/services/game-actions/downtime-actions.ts`, `src/renderer/src/services/game-actions/name-resolver.test.ts`, `src/renderer/src/services/game-actions/downtime-actions.test.ts`.

**Steps:**

1. Add to `name-resolver.ts`:
   ```ts
   export function resolveCharacterIdByName(playerName: string, stores: StoreAccessors): string | undefined {
     const players = stores.getLobbyStore().getState().players
     const match = players.find(
       (p) =>
         p.displayName.toLowerCase() === playerName.toLowerCase() ||
         (p.characterName && p.characterName.toLowerCase() === playerName.toLowerCase())
     )
     return match?.characterId ?? undefined
   }
   ```
   (`LobbyPlayer.characterId: string | null`, `use-lobby-store.ts:114`.) Keep `resolvePlayerByName` — other callers may rely on peerId semantics; check with `grep -rn "resolvePlayerByName" src --include="*.ts"` and leave them as-is.
2. In `executeStartDowntime` (`downtime-actions.ts:36`): `const characterId = resolveCharacterIdByName(characterName, stores) ?? characterName` — the name fallback stays as the last resort so solo/offline flows (no lobby roster) keep functioning; `executeAdvanceDowntime` continues matching by `characterName` (unchanged, `:77-82`).
3. Tests: resolver returns `characterId` (not `peerId`) on displayName and characterName matches, `undefined` when absent; `executeStartDowntime` persists the resolved characterId into the entry (assert via the mocked campaign save).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/services/game-actions/name-resolver.test.ts src/renderer/src/services/game-actions/downtime-actions.test.ts`

**Acceptance:** new entries carry a real character id whenever the roster knows one; `getActiveDowntimeForCharacter` (`downtime-service.ts:265`) finds AI-started entries.

### 08H — Drawings: ids in the snapshot + honest `remove_drawing`

**Objective:** the AI can learn drawing ids and is told the truth when a removal targets a missing id.

**Files:** `src/renderer/src/services/game-actions/state-snapshot.ts`, `src/renderer/src/services/game-actions/map-annotation-actions.ts`, `src/main/ai/prompt-sections/dm-actions-schema.ts`, `src/renderer/src/services/game-actions/state-snapshot.test.ts`, `src/renderer/src/services/game-actions/map-annotation-actions.test.ts`.

**Steps:**

1. Replace the count-only block (`state-snapshot.ts:122-127`) with an id list following the walls/regions precedent (`:100-120`): header `Drawings:` then per drawing `- ${d.id}: ${d.type}${d.text ? ` "${truncated text}"` : ''}${d.visibleToPlayers === false ? ' [DM-only]' : ''}${d.floor != null ? ` [floor ${d.floor}]` : ''}` (truncate `text` to ~30 chars). Cap at the first 20 drawings and append `- …and N more (use clear_drawings to remove all)` beyond the cap — point data stays omitted (token budget).
2. `executeRemoveDrawing` (`map-annotation-actions.ts:39-48`): before calling `removeDrawing`, check `activeMap.drawings?.some((d) => d.id === action.drawingId)`; if absent, `throw new Error(\`Drawing not found: ${action.drawingId}\`)` — the executor's try/catch routes this into `result.failed`, which the auto-execute path posts to chat (`use-game-effects.ts:474-483`).
3. Update the prompt doc (`dm-actions-schema.ts:153`): note that drawing ids are listed in the game-state snapshot's `Drawings:` block ("use the id shown in [GAME STATE]").
4. Tests: snapshot lists ids/type/DM-only flag, caps at 20; remove with a bad id throws; remove with a good id calls the store.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx vitest run src/renderer/src/services/game-actions/state-snapshot.test.ts src/renderer/src/services/game-actions/map-annotation-actions.test.ts`

**Acceptance:** snapshot exposes targetable ids; `remove_drawing` failures surface in `result.failed`; prompt doc matches reality.

### 08I — AoE direction (line + `apply_area_effect`) and case-insensitive caster exclusion

**Objective:** lines fire along the requested direction everywhere; `apply_area_effect` keeps the `direction` the AI sends; casters never nuke themselves over letter case.

**Files:** `src/renderer/src/services/combat/aoe-targeting.ts`, `src/renderer/src/services/game-actions/dice-helpers.ts`, `src/main/ai/ai-schemas.ts`, `src/main/ai/dm-actions.ts`, `src/main/ai/prompt-sections/dm-actions-schema.ts`, `src/renderer/src/services/game-actions/spell-effect-actions.ts`, `src/renderer/src/services/game-actions/dice-helpers.test.ts`, `src/renderer/src/services/game-actions/spell-effect-actions.test.ts`, `src/main/ai/ai-schemas.test.ts`.

**Steps:**

1. Export `getLineCells` from `aoe-targeting.ts` (`:160` — add `export`, mirror the `getConeCells` LOG-5 precedent comment).
2. In `findTokensInArea` (`dice-helpers.ts`), build a `lineCellSet` when `shape === 'line'` using `getLineCells(originX, originY, radiusCells * 5, directionDeg ?? 0, (widthCells ?? 1) * 5)` and test membership in the `case 'line'` branch (replace `:61-64`). `directionDeg ?? 0` preserves today's +x behavior when no direction is provided.
3. `ai-schemas.ts` `ApplyAreaEffectSchema` (`:700-714`): add `direction: z.number().optional()` (zod v4 `z.object` strips unknown keys by default — this is the only way the field survives parsing).
4. `dm-actions.ts` `apply_area_effect` variant (`:183-196`): add `direction?: number` (additive; coordinate with PHASE-11 which edits the same union).
5. Prompt doc (`dm-actions-schema.ts:125`): add `direction?` to the `apply_area_effect` field list with the note used by `query_aoe` (degrees, 0 = +x/east, 90 = south/down-grid — match the convention `getConeCells` implements; verify by reading its header comment before writing the doc text).
6. Case-insensitive exclusion in `spell-effect-actions.ts`: in `executeCastSpell` replace `.filter((t) => t.label !== caster)` (`:128`) with a comparison against the RESOLVED caster token when available: `const casterLabel = (casterToken?.label ?? caster).toLowerCase()` then `.filter((t) => t.label.toLowerCase() !== casterLabel)`. In `executeQueryAoe` (`:52`) lower-case both sides of the `excludeLabel` compare.
7. Tests: dice-helpers — line at `direction: 90` hits a token at `(originX, originY + 2)` and misses `(originX + 2, originY)`; no-direction line keeps +x (regression). ai-schemas — `apply_area_effect` parse PRESERVES `direction` (assert the parsed output contains it). spell-effect-actions — caster labeled `Aria`, action `caster: 'aria'`, AoE covering the caster → caster takes no damage; `query_aoe` excludeLabel case-insensitive.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/renderer/src/services/game-actions/dice-helpers.test.ts src/renderer/src/services/game-actions/spell-effect-actions.test.ts src/main/ai/ai-schemas.test.ts`

**Acceptance:** line geometry direction-aware in both `query_aoe`/`cast_spell`/`apply_area_effect` paths (the renderer `executeApplyAreaEffect` already forwards `action.direction`, `creature-conditions.ts:121` — no renderer executor change needed); schema/union/doc all carry `direction`; contract test still green.

### 08J — Bastion verbs: implement the no-ops, surface the silent failures

**Objective:** `bastion_add_creature` and `bastion_resolve_event` do real store work; every bastion verb reports bastion/facility-not-found instead of pretending success.

**Files:** `src/renderer/src/services/game-actions/effect-actions.ts`, `src/main/ai/ai-schemas.ts`, `src/main/ai/prompt-sections/dm-actions-schema.ts`, `src/renderer/src/services/game-actions/effect-actions.test.ts`, `src/renderer/src/services/game-action-executor.ts` (call-site arg threading only, if signatures change).

**Steps:**

1. Harden `withBastionStore` (`effect-actions.ts:134-140`): add an optional `onUnavailable?: (reason: string) => void` second parameter and a `.catch((err) => onUnavailable?.(String(err)))`; inside callbacks, replace the silent `if (!bastion) return` / `if (!facility) return` guards across ALL bastion executors (`:479-484, :492-508, :514-521, :526-533, :550-560` and the two new implementations) with a `postDmChatMessage(stores, 'ai-bastion-err', \`⚠️ Bastion action ${action.action} failed: bastion/facility not found for "${ownerName}"\`)` (the helper already exists in `effect-actions.ts` scope — verify; if it is local to `creature-actions.ts`, use `postDmMessage` from `./broadcast-helpers` which IS imported by effect-actions). The executor still returns `true` synchronously (the store work is async by construction); honesty arrives via the chat line, which the model reads on its next turn — same feedback channel `query_aoe` uses.
2. Implement `executeBastionAddCreature` (`:640-649`): resolve bastion via `findBastionByOwnerName`; resolve facility by name across `[...basicFacilities, ...specialFacilities]` (same as `executeBastionIssueOrder`, `:495-497`); call `bastionStore.addCreature(bastion.id, facility.id, { name: action.creatureName as string, creatureType: (action.creatureType as string) ?? 'beast', size: (action.size as MenagerieCreature['size']) ?? 'medium', isDefender: (action.isDefender as boolean) ?? false })`; then post the existing chat line. Extend `BastionAddCreatureSchema` (ai-schemas.ts, near `:1162`) with `creatureType: z.string().optional()`, `size: z.enum(['tiny','small','medium','large','huge']).optional()`, `isDefender: z.boolean().optional()`; mirror the optional fields in the `dm-actions.ts` union variant and the prompt doc (`dm-actions-schema.ts:216`).
3. Implement `executeBastionResolveEvent` (`:535-545`): resolve bastion; find the latest turn with `eventRoll === null` (an open turn); if none, call `bastionStore.startTurn(bastion.id)` first (`event-slice.ts:123-150`); then `bastionStore.rollAndResolveEvent(bastion.id, turnNumber)` (`event-slice.ts:196-262` — VERIFIED to exist; the audit's claim that no standalone resolution exists was wrong); re-read the bastion and post the ACTUAL `eventType`/`eventOutcome` from the resolved turn to chat. The engine rolls the event — make `eventType` optional in `BastionResolveEventSchema` (`ai-schemas.ts:1156-1160`, change `eventType: z.string()` → `.optional()`) and rewrite the prompt doc line (`dm-actions-schema.ts:214`) to: `bastion_resolve_event: {bastionOwner} — rolls on the DMG bastion-event table for the current bastion turn and resolves it (attacks, visitors, refugee income, …); the rolled outcome is posted to chat`. Update the `dm-actions.ts` union variant accordingly (`eventType?: string`).
4. Tests in `effect-actions.test.ts` (mock the dynamic `use-bastion-store` import via `vi.mock('../../stores/use-bastion-store', …)` with `vi.waitFor`/flushed microtasks since `withBastionStore` is promise-based): add_creature calls `addCreature` with defaults; resolve_event calls `rollAndResolveEvent` on the open turn and `startTurn` when none; not-found owner posts the ⚠️ chat line and calls no store mutator.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run src/renderer/src/services/game-actions/effect-actions.test.ts src/main/ai/ai-schemas.test.ts`

**Acceptance:** both verbs mutate the bastion store; every bastion executor surfaces not-found via chat; schemas/union/prompt docs agree; contract test green.

## Research notes

- **zod v4 unknown-key behavior** — `z.object()` strips unrecognized keys by default ("strip" mode); `z.strictObject`/`z.looseObject` are the v4-preferred alternates. This confirms F9's mechanism (the AI's `direction` on `apply_area_effect` is silently removed at the parse boundary) and the fix (declare the field). Sources: [Zod — Defining schemas](https://zod.dev/api), [Zod v4 migration guide](https://zod.dev/v4/changelog).
- **zustand fresh-state pattern** — `store.getState()` returns a point-in-time snapshot; for imperative batch work the documented approach is re-calling `getState()` whenever fresh values are needed (stale-closure/stale-snapshot is a known pitfall class). The executor loop fix in 08A is exactly this; `executeNextTurn`'s LOG-13 fix already uses it in-repo. Sources: [zustand discussion #2335 — state vs getState()](https://github.com/pmndrs/zustand/discussions/2335), [zustand discussion #784 — stale closures](https://github.com/pmndrs/zustand/discussions/784).
- **D&D 2024 stat-block notation** — "Recharge 5–6" = regain on 5-6 at the start of the monster's turn; 2024 Monster Manual introduced lair-scaled usage `Legendary Resistance (3/Day, or 4/Day in Lair)` (more LR/LA while in lair). The shipped dataset (`monsters.json`, 379 entries) uses hyphenated `(Recharge 5-6)` plus `(Recharges after a Short or Long Rest)` (which must not parse as a recharge ability) and both LR formats — 08B's regexes were validated against the actual data, not just the spec. Sources: [D&D Beyond — 2024 stat block preview](https://www.dndbeyond.com/posts/1890-preview-the-new-stat-block-design-in-the-2024), [D&D Beyond Basic Rules 2024 — Creature Stat Blocks](https://www.dndbeyond.com/sources/dnd/br-2024/creature-stat-blocks).
- **Alternatives considered:**
  - *Per-batch single validation + re-validate-on-failure* (instead of 08A's per-action validate): rejected — it preserves a two-phase model that re-introduces the same staleness for any executor reading plain snapshot fields; per-action `getState()` is O(actions) with `MAX_ACTIONS_PER_BATCH = 50`, negligible.
  - *Porting the dead `enrichWithLegendaryData` + async monster cache verbatim*: rejected — `lookupTokenStatBlock` (token-stats.ts:81) gives a synchronous library-truth-store path; a parallel monster cache would violate the repo's library single-source-of-truth invariant (CLAUDE.md) and re-create the drift that produced F3.
  - *Making bastion executors async and awaiting the store import* (to return real `false` on not-found): rejected — `executeOne` is synchronous across all ~100 actions; changing the executor contract ripples into PHASE-30/34. Chat-line feedback matches the established `query_aoe`/recharge feedback channel the model already consumes.
  - *Dropping `remove_drawing` instead of exposing ids* (the audit offered both): exposing ids matches the wall/region snapshot precedent and keeps the verb useful for PHASE-34's battlemap work.
- **Caveat:** 08A makes `filterValidActions` run once per action; any future code relying on the executor validating the WHOLE batch against initial state (none found in-repo) would need the still-exported `validateActionsAgainstState` for that purpose.

## Test plan

Per sub-phase (cheap, targeted — see each sub-phase):

- 08A: `game-action-executor.test.ts` — new behavior suite (same-batch place→initiative entity linking, same-batch move validation, absent-target rejection).
- 08B: new `initiative-enrichment.test.ts`; extended `creature-initiative.test.ts`.
- 08C: rewritten `creature-actions.test.ts` (live 7 only); ported gap cases into `creature-initiative.test.ts`/`creature-conditions.test.ts`.
- 08D: trimmed `ai-response-parser.test.ts`, `ai-service.test.ts`; deleted `ai-stream-handler.test.ts`.
- 08E: `creature-mutations.test.ts` (prefix fallback, failure reasons).
- 08F: `effect-actions.test.ts` (fresh shop broadcasts ×3).
- 08G: `name-resolver.test.ts`, `downtime-actions.test.ts` (characterId resolution + persistence).
- 08H: `state-snapshot.test.ts` (id list + cap), `map-annotation-actions.test.ts` (throw on missing id).
- 08I: `dice-helpers.test.ts` (directional line), `spell-effect-actions.test.ts` (case-insensitive exclusion), `ai-schemas.test.ts` (direction preserved by parse).
- 08J: `effect-actions.test.ts` (bastion add_creature/resolve_event/not-found feedback), `ai-schemas.test.ts` (optional eventType + new add_creature fields).

End-of-phase 4-gate (INSTRUCTIONS.md rule 5), run once after 08J:

```bash
cd dnd-app
npm run lint
npx tsc --noEmit -p tsconfig.web.json
npx tsc --noEmit -p tsconfig.node.json
npx vitest run
```

No Pi code is touched — pytest is not required for this phase.

## Acceptance criteria

- [ ] A single AI batch `place_creature ×N` + `start_initiative` + `move_token`/`add_entity_condition` on the new tokens executes with zero "not found" rejections and initiative entries whose `entityId`s match the placed tokens.
- [ ] `use_legendary_action`/`use_legendary_resistance` succeed for a legendary monster in AI-started initiative; recharge abilities auto-roll on that monster's turn without a prior `recharge_roll`; DM-tracker-started initiative is equally enriched; a manually-entered LR count is not overwritten.
- [ ] `creature-actions.ts` contains exactly 7 exported executors + `postDmChatMessage`; `ai-stream-handler.ts`, its test, `finalizeAiResponse`, and `FinalizedResponse` no longer exist; `grep -rn "ai-stream-handler\|finalizeAiResponse" dnd-app/src --include="*.ts"` is empty.
- [ ] Failed creature mutations and the no-active-map case produce DM alerts (en + es keys present); `creature_damage` targeting `"Goblin"` applies to a sole `"Goblin 1"` token.
- [ ] `open_shop`/`add_shop_item`/`remove_shop_item` each broadcast `dm:shop-update` carrying post-mutation inventory.
- [ ] AI-started downtime rows appear in `DowntimeModal` for the named character (entry `characterId` equals the lobby roster's `characterId`).
- [ ] `[GAME STATE]` lists drawing ids (capped at 20); `remove_drawing` with an unknown id lands in `result.failed` and is posted to chat.
- [ ] A line AoE with `direction: 90` affects tokens along +y in `query_aoe`, `cast_spell`, AND `apply_area_effect`; `DM_ACTION_SCHEMAS.apply_area_effect.parse({...direction: 90})` preserves `direction`; a caster whose label case differs from the AI's `caster` string is excluded from their own spell.
- [ ] `bastion_add_creature` adds a `MenagerieCreature` to the named facility; `bastion_resolve_event` rolls + resolves a real bastion event (opening a turn if needed) and posts the actual outcome; bastion/facility not-found posts a ⚠️ chat line for every bastion verb.
- [ ] Full 4-gate green; one phase commit; plan moved to `completed/`.

## Out of scope

- `setPendingActions` overwrite of undecided approvals and `approvePendingActions` discarding `ExecutionResult` (`game-action-executor.ts:194-205`, `use-ai-dm-store.ts:199-207`) — **PHASE-04**.
- AI stream-listener lifecycle in `use-game-effects.ts` (`:211-216, 395-405`) — **PHASE-05**.
- Main-process character stat-mutations (`add_condition` always-throws, NaN HP, slot aliasing; the ignored `applyMutations` result at `use-game-effects.ts:78`) — **PHASE-02**.
- `light_source`/`extinguish_source` `DmAction`-union gap and the `[DM_ACTIONS]`-vs-`[STAT_CHANGES]` misdocumented trio — **PHASE-11**.
- Wording/i18n polish of existing executor strings (e.g. spell-end phrasing `spell-effect-actions.ts:216`) — **PHASE-12**.
- Trigger `spawn_creature` map-center placement (`trigger-action-executor.ts:43-46`) — **PHASE-13**.
- Automated monster turns / tactical-action suggestion built on this executor — **PHASE-30**.
- AI-generated battlemap specs consuming the drawing/wall verbs — **PHASE-34**.

## Completed

- **08A (2026-06-11):** `game-action-executor.ts executeDmActions` — replaced the single pre-batch `getState()`/`activeMap`/batch `filterValidActions` with a per-action loop that re-reads fresh `getGameStore().getState()` + `activeMap` and runs `filterValidActions([action], …)` each iteration (rejected→`result.failed`, continue); kept `MAX_ACTIONS_PER_BATCH` truncation + the approval-queue block intact; `executeOne` signature unchanged. So a same-batch place→initiative→move sequence links to the real tokens instead of validating/executing against a stale snapshot. `game-action-executor.test.ts` — new behavior suite (stateful store mock): place→start_initiative entity-id linking, place→move no-rejection, absent-target still rejected. tsc web clean; 11 tests green.
- **08B (2026-06-11):** New `initiative-enrichment.ts` — `enrichInitiativeEntry(entry, token)` resolves legendaryActions/legendaryResistances (with 2024 in-lair bump)/rechargeAbilities (handles `(Recharge 5-6)`/`5–6`/`6`, skips `(Recharges after …)`)/lairActions from `lookupTokenStatBlock` (sync, library truth store — no monster cache); never overwrites a value the entry already carries (manual DM LR wins). Called in `creature-initiative.ts` `executeStartInitiative`/`executeAddToInitiative` and `InitiativeTracker.tsx handleRollInitiative`. So AI- and DM-started initiative entries now actually support `use_legendary_action`/`use_legendary_resistance` + recharge auto-roll. New `initiative-enrichment.test.ts` (no-statblock, LA mapping, LR base+in-lair, recharge parse incl. non-match, manual-LR-wins, lairActions gated on inLair). tsc web clean; 6 + 24 tests green.
- **08C (2026-06-11):** `creature-actions.ts` — deleted the 11 dead duplicate executors (`executeStartInitiative`…`executeRechargeRoll`, whose live copies are in `creature-initiative.ts`/`creature-conditions.ts`) and the orphaned `monsterCacheForLegendary`/`ensureLegendaryMonsterCache`/`enrichWithLegendaryData` block (superseded by 08B); kept `postDmChatMessage`, `resolveCharacterIds`, and the 7 live executors; pruned now-unused imports (InitiativeEntry, MonsterStatBlock, getCreatureSaveMod, broadcastInitiativeSync, findTokensInArea, rollDiceFormula). `creature-actions.test.ts` rewritten to import/test only the 7 live (dead behavior already covered by `creature-initiative.test.ts`/`creature-conditions.test.ts`). grep confirms only `game-action-executor.ts` imports `creature-actions`. tsc web clean; 60 tests green across 3 files.
- **08D (2026-06-11):** `git rm` `ai-stream-handler.ts` + its test (dead duplicate stream-completion pipeline — only the two types were live-consumed). Moved `PendingWebSearchApproval` + `StreamHandlerDeps` into `ai-service.ts` (local interfaces; dropped the `import type … from './ai-stream-handler'`). Deleted `finalizeAiResponse` + `FinalizedResponse` from `ai-response-parser.ts` and collapsed its imports to just `RuleCitation` (the live parser/strip helpers stay). `ai-response-parser.test.ts` rewritten to the live string-parser tests (no mocks). `ai-service.test.ts` — replaced the unused `finalizeAiResponse` mock key with the 4 voice/ruling helpers ai-service actually imports (the finalize path was previously running via its catch fallback because those were undefined). No `ai-stream-handler`/`finalizeAiResponse` code refs remain. tsc node clean; 63 tests green.
- **08E (2026-06-11):** `creature-mutations.ts:49` — exact-match `find` → `resolveTokenByLabel` (exact-then-prefix, like DM actions: "Goblin" matches "Goblin 1"). `use-game-effects.ts applyStatChangesDirectly` — consumes `applyCreatureMutations`'s results: `pushDmAlert('warning', creatureMutationFailed)` per not-applied change; new `else if` no-map branch `pushDmAlert('warning', creatureMutationsNoMap)` (was a silent drop). New i18n keys (en+es). `creature-mutations.test.ts` — prefix-match applies, absent token returns not-applied + no updateToken. tsc web clean; 27 tests green.
- **08F (2026-06-11):** `effect-actions.ts` — `executeOpenShop` broadcasts `stores.getGameStore().getState().shopInventory` (fresh) instead of the stale snapshot's; `executeAddShopItem` now 4-arg + new `broadcastShop(stores)` after the mutation; `executeRemoveShopItem` also calls `broadcastShop`. `game-action-executor.ts` add_shop_item call site passes all 4 args. `effect-actions.test.ts` — fixed the add call; new "shop broadcasts fresh inventory (08F)" describe (stateful store fixture: open/add/remove each emit exactly one `dm:shop-update` carrying the post-mutation inventory). tsc web clean; 61 tests green.
- **08G (2026-06-11):** `name-resolver.ts` — new `resolveCharacterIdByName` (returns `LobbyPlayer.characterId`, not the transport `peerId` that `resolvePlayerByName` returns). `downtime-actions.ts executeStartDowntime` swaps to it (name fallback kept for solo/offline). So AI-started downtime entries surface in the per-character downtime UI (which filters by character id). `name-resolver.test.ts` (characterId on displayName/characterName match, undefined when no characterId / no match) + `downtime-actions.test.ts` mock updated. tsc web clean; 31 tests green.
- **08H (2026-06-11):** `state-snapshot.ts` — the `Drawings:` block now lists per-drawing `- id: type "text" [DM-only] [floor N]` (cap 20 + "…and N more") instead of a bare count, so the AI can target `remove_drawing`. `map-annotation-actions.ts executeRemoveDrawing` throws `Drawing not found: <id>` when the id isn't on the map (store removal was a silent no-op reporting success). Prompt doc updated to point at the `[GAME STATE]` `Drawings:` block. Tests: snapshot id-list + cap-at-20; remove missing-id throws + never calls the store, existing-id removes. tsc web+node clean; 41 tests green.
- **08I (2026-06-11):** `aoe-targeting.ts` exports `getLineCells`. `dice-helpers.ts findTokensInArea` line branch builds a direction-aware `lineCellSet` via `getLineCells(…, directionDeg ?? 0, …)` (was hardcoded +x). `ai-schemas.ts ApplyAreaEffectSchema` + `dm-actions.ts` union variant + prompt doc gain `direction?` (zod v4 was stripping it → cones/lines via apply_area_effect always faced +x). `spell-effect-actions.ts` — `executeCastSpell` caster exclusion + `executeQueryAoe` excludeLabel now compare lowercased (resolved caster token wins) so a different-case caster label no longer nukes itself. Tests: directional line (facing +y), apply_area_effect parse preserves direction, query_aoe case-insensitive exclusion. tsc web+node clean; 112 tests green across 3 files.
- **08J (2026-06-11):** `effect-actions.ts` — `withBastionStore` gains an `onUnavailable` callback (`.catch` reports the dynamic-import failure); new `postBastionNotFound` posts `⚠️ Bastion action <verb> failed: bastion/facility not found for "<owner>"` via `postDmChatMessage`. The 5 previously-silent bastion verbs (`bastion_advance_time`/`issue_order`/`deposit_gold`/`withdraw_gold`/`recruit_defenders`) are now 4-arg `(action, _gs, _map, stores)` and post a ⚠️ line on not-found instead of resolving as success. Implemented the two real no-ops: `executeBastionAddCreature` resolves bastion+facility and calls `bastionStore.addCreature(bastion.id, facility.id, {name, creatureType ?? 'beast', size ?? 'medium', isDefender ?? false})`; `executeBastionResolveEvent` finds the open turn (or `startTurn`s a fresh `max(turnNumber)+1`), `rollAndResolveEvent`s it, re-reads fresh state and posts the actual `eventType`/`eventOutcome`. `game-action-executor.ts` bastion call sites pass 4 args. `ai-schemas.ts` — `BastionResolveEventSchema.eventType` optional; `BastionAddCreatureSchema` gains optional `creatureType`/`size`/`isDefender`. `dm-actions.ts` union + prompt doc updated. `effect-actions.test.ts` — bastion store mock gains `addCreature`/`startTurn`/`rollAndResolveEvent`; new describe "bastion add_creature + resolve_event (08J)" (add_creature defaults, resolve_event opens-turn-then-rolls, unknown-owner ⚠️ chat line + no mutation). tsc web+node clean; 144 tests green across 2 files.
