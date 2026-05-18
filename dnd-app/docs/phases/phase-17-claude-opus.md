# Phase 17 — Claude Opus 4.6 Max Error Analysis

**Date:** March 9, 2026
**Scope:** Full codebase error audit across 6 categories
**Tools used:** TypeScript compiler (`tsc --noEmit`), Biome linter, manual code review
**Files analyzed:** 4,417 source files

## Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Syntax Errors | 1 | 0 | 0 | 0 | 1 |
| Logical Errors | 0 | 6 | 9 | 10 | 25 |
| Network Errors | 3 | 17 | 30 | 18 | 68 |
| GUI/UI Errors | 1 | 10 | 25 | 8 | 44 |
| Runtime Errors | 1 | 8 | 12 | 5 | 26 |
| Type Errors | 0 | 2 | 2 | 3 | 7 |
| **Total** | **6** | **43** | **78** | **44** | **171** |

---

## 1. Syntax Errors

**TypeScript compiler:** 0 errors (`tsc --noEmit` passes clean).
**Biome linter:** 72 errors, 56 warnings, 3 infos across 4,417 files.

### SYN-1 [CRITICAL] — JSX in `.ts` file causes 20+ cascading parse errors

- **File:** `src/renderer/src/utils/chat-links.ts`
- **Lines:** 87, 96, 103, 106, 117, 120
- **Function:** `renderChatContent()`
- **Description:** This file uses JSX syntax (`<span>`, `<button>`) but has a `.ts` extension instead of `.tsx`. Biome's parser cannot parse JSX in a `.ts` file, producing 20+ cascading parse errors (unterminated regex literal, unexpected tokens, invalid assignments). The file compiles fine under `tsc` because the tsconfig enables JSX globally, but Biome cannot lint or format this file at all. All 20 parse errors in the Biome output trace back to this single root cause.
- **Fix:** Rename `chat-links.ts` to `chat-links.tsx`.

### SYN-2 — Biome lint warnings (56 total, grouped)

| Rule | Count | Files | Severity |
|------|-------|-------|----------|
| `useHookAtTopLevel` | 22 | `PlayerHUDOverlay.tsx`, `ActionEconomyBar.tsx`, `GamePrompts.tsx`, `ReactionPrompts.tsx`, `MountModal.tsx`, `AttackModal.tsx`, `MechanicsModals.tsx`, `UtilityModals.tsx`, `CharacterSheet5ePage.tsx`, `use-game-handlers.ts`, `combat-resolver.ts`, `initiative-slice.ts`, `commands-player-movement.ts` | warn |
| `useExhaustiveDependencies` | 6 | `MapCanvas.tsx` (x4), `AoETemplateModal.tsx`, `CraftingBrowser.tsx`, `TablesPanel.tsx` | warn |
| `noUnusedImports` | 5 | `InitiativeTracker.tsx`, `chat-links.ts`, `sound-occlusion.ts` (x2), `MapCanvas.tsx` | warn |
| `noUnusedVariables` | 5 | `GameLayout.tsx` (x2), `MapCanvas.tsx`, `audio-emitter-overlay.ts`, `map-event-handlers.ts` (x2), `sound-occlusion.ts` (x2) | warn |
| `noRedeclare` | 2 | `InitiativeTracker.tsx`, `MapCanvas.tsx` | warn |
| `useParseIntRadix` | 1 | `TablesPanel.tsx:98` | warn |
| `useExponentiationOperator` | 1 | `sound-occlusion.ts:80` | warn |
| `noUselessEscapeInString` | 7 | `discord-service.test.ts` | warn |
| `organizeImports` | 10 | Various files | info |
| Format violations | 18 | Various files | info |

---

## 2. Logical Errors

### LOG-1 [HIGH] — Champion Fighter expanded crit range never applied

- **File:** `src/renderer/src/services/combat/crit-range.ts` (definition), `src/renderer/src/services/combat/attack-resolver.ts` line 481, `src/renderer/src/services/combat/combat-resolver.ts` line 452
- **Function:** `getCritThreshold()` defined but never called; `resolveAttack()` hardcodes `attackRoll === 20`
- **Description:** `crit-range.ts` correctly returns 19 for Champion Fighters level 3+ and 18 for level 15+. Neither attack resolver calls it. `attack-resolver.ts:481` uses `const isCrit = attackRoll === 20`. A Champion Fighter rolling 19 never gets a critical hit.
- **Correct behavior (PHB 2024 p.75):** Check `attackRoll >= getCritThreshold(character)`.

### LOG-2 [HIGH] — Critical hit only doubles first dice group in formula

- **File:** `src/renderer/src/services/combat/combat-resolver.ts`
- **Lines:** 870–875
- **Function:** `doubleDiceInFormula()`
- **Description:** Uses `formula.replace(/(\d*)d(\d+)/, ...)` without the `g` flag. Only the first XdY block is doubled. `"2d6+1d8+4"` becomes `"4d6+1d8+4"` instead of `"4d6+2d8+4"`.
- **Fix:** Add `g` flag: `formula.replace(/(\d*)d(\d+)/g, ...)`.

### LOG-3 [HIGH] — `isInMeleeRange()` ignores token size for Large+ creatures

- **File:** `src/renderer/src/services/combat/combat-rules.ts`
- **Lines:** 291–301
- **Function:** `isInMeleeRange()`
- **Description:** Only measures from `attacker.gridX/gridY` origin. A 2x2 Large creature at (0,0) targeting (2,0) calculates 10ft from origin, returning false for 5ft reach. But cell (1,0) is only 5ft away. The companion `isAdjacent()` at line 198 correctly iterates all occupied cells, creating an inconsistency.
- **Correct behavior (PHB 2024 p.14):** Measure minimum distance from any occupied cell.

### LOG-4 [HIGH] — Area effect saving throws ignore target's save modifier

- **File:** `src/renderer/src/services/game-actions/creature-conditions.ts` lines 113–115, `src/renderer/src/services/game-actions/creature-actions.ts` lines 256–258
- **Function:** `executeApplyAreaEffect()`
- **Description:** Rolls bare `1d20` with no ability modifier or proficiency: `const saveRoll = rollDiceFormula('1d20'); saved = saveRoll.total >= saveDC`. Every creature treated as having +0 to saves. A Fireball DC 15 against a creature with +8 DEX save should succeed on raw 7+, but this code requires raw 15+.
- **Impact:** All AI DM area effects (Fireball, Dragon Breath, etc.) are dramatically overpowered.

### LOG-5 [HIGH] — `findTokensInArea()` cone uses square geometry

- **File:** `src/renderer/src/services/game-actions/dice-helpers.ts`
- **Lines:** 46–49
- **Function:** `findTokensInArea()`
- **Description:** The `'cone'` case falls through to `'cube'` logic: `Math.abs(dx) <= half && Math.abs(dy) <= half`. A 15-foot cone facing east hits every token in a 30x30ft square, including targets behind the caster. The correct `getConeCells()` exists in `aoe-targeting.ts` but is unused here.
- **Correct behavior (PHB 2024 p.233):** Cone width equals distance from origin, extending in one direction only.

### LOG-6 [HIGH] — Long rest removes ALL exhaustion instead of reducing by 1

- **File:** `src/renderer/src/services/game-actions/creature-actions.ts`
- **Lines:** 497–509
- **Function:** `executeLongRest()`
- **Description:** Finds all exhaustion conditions and calls `removeCondition()` for each. A character at exhaustion 3 drops to 0 after one rest. The character-level `applyLongRest()` in `rest-service-5e.ts:396` correctly decrements by 1, creating an inconsistency between the two code paths.
- **Correct behavior (PHB 2024 p.365):** Reduce exhaustion by 1 per long rest.

### LOG-7 [MEDIUM] — Thrown weapons always classified as melee

- **File:** `src/renderer/src/services/combat/attack-resolver.ts`
- **Lines:** 70–72
- **Function:** `isMeleeWeapon()`
- **Description:** Returns `!weapon.range || weapon.properties.some(p => p.toLowerCase() === 'thrown')`. The OR condition means Javelins, Handaxes, Daggers always return true from `isMeleeWeapon()` even when thrown at range. Dueling fighting style +2 damage incorrectly applies to ranged thrown attacks.

### LOG-8 [MEDIUM] — Exhaustion death at level 6 uses 2014 rule in 2024 codebase

- **File:** `src/renderer/src/stores/game/conditions-slice.ts`
- **Lines:** 21, 47
- **Function:** `addCondition()`, `updateCondition()`
- **Description:** Checks `condition.value >= 6` and kills the entity. This is the 2014 PHB rule. The 2024 PHB replaced this with cumulative -2 penalties per level (no death threshold). Meanwhile `attack-condition-effects.ts:90` correctly applies the 2024 -2-per-level penalty, creating internal inconsistency.

### LOG-9 [MEDIUM] — Heavy armor AC calculation depends on ambiguous `acBonus`

- **File:** `src/renderer/src/services/character/armor-class-calculator.ts`
- **Lines:** 28–29
- **Function:** `calculateArmorClass5e()`
- **Description:** `baseAC = 10 + equippedArmor.acBonus` for heavy armor. If `acBonus` is the full AC value (16 for Chain Mail), result is 26 (wrong). If it's the delta above 10, result is 16 (correct). No validation or documentation enforces which convention is used.

### LOG-10 [MEDIUM] — `removeFromInitiative()` shifts active turn to wrong entity

- **File:** `src/renderer/src/stores/game/initiative-slice.ts`
- **Lines:** 265–288
- **Function:** `removeFromInitiative()`
- **Description:** Uses `Math.min(initiative.currentIndex, newEntries.length - 1)` without accounting for index shift when an entry before the current one is removed. Entries [A,B,C] with B active: remove A, new array [B,C], index stays 1, active jumps to C.
- **Fix:** Track active entry by ID, not index.

### LOG-11 [MEDIUM] — Cover treats dead tokens and allies as full obstacles

- **File:** `src/renderer/src/services/combat/cover-calculator.ts`
- **Lines:** 104–116
- **Function:** `calculateCover()`
- **Description:** Every token except attacker/target is treated identically as a wall segment. Dead/unconscious tokens, allied tokens, and Tiny creatures all provide cover. Multiple creatures can combine to produce total cover. PHB says creatures provide at most half cover, dead creatures provide none, Tiny creatures provide none.

### LOG-12 [MEDIUM] — Initiative validator checks `e.label` instead of `e.entityName`

- **File:** `src/renderer/src/services/game-actions/action-validator.ts`
- **Line:** 104
- **Function:** `validateOne()` — `remove_from_initiative` case
- **Description:** `e.label?.toLowerCase()` is always `undefined` because `InitiativeEntry` has `entityName`, not `label`. Type cast `{ label?: string }` masks the error. Every `remove_from_initiative` action is rejected as "not found."

### LOG-13 [MEDIUM] — `executeNextTurn()` targets wrong entity for legendary/recharge

- **File:** `src/renderer/src/services/game-actions/creature-initiative.ts` lines 85–87
- **Function:** `executeNextTurn()`
- **Description:** Pre-computes next index as `(currentIdx + 1) % length` then calls `gameStore.nextTurn()` which may skip delaying entities. The pre-computed and actual next index differ. Legendary actions reset and recharge rolls target the wrong creature.

### LOG-14 [MEDIUM] — Async data loading race conditions

- **Files:** `src/renderer/src/data/effect-definitions.ts`, `conditions.ts`, `xp-thresholds.ts`, `weapon-mastery.ts`
- **Description:** Modules export synchronous accessors to caches populated by `.then()` callbacks. If game code calls before the async load resolves, it gets empty defaults. First combat encounter may have no feat effects, no magic item bonuses, empty conditions.

### LOG-15 [MEDIUM] — Half/third caster spell slots empty on startup

- **File:** `src/renderer/src/systems/dnd5e/index.ts`
- **Lines:** 22–23 (init), 37–44 (async load), 96–97 (usage)
- **Function:** `dnd5ePlugin.getSpellSlotProgression()`
- **Description:** `HALF_CASTER_SLOTS` and `THIRD_CASTER_SLOTS` initialized as `{}`, populated asynchronously. If called before promise resolves, Rangers, Paladins, Eldritch Knights, Arcane Tricksters get 0 spell slots. Full casters work because they load synchronously.

### LOG-16 [LOW] — Condition round-duration may expire one round early

- **File:** `src/renderer/src/stores/game/initiative-slice.ts`
- **Line:** 182
- **Function:** `nextTurn()`
- **Description:** Uses `>=` comparison: `newRound - c.appliedRound >= c.duration`. A 1-round condition applied in round 3 expires at start of round 4 before anyone acts. Should use `>`.

### LOG-17 [LOW] — Saving throw half-damage "(halved)" annotation unreachable

- **File:** `src/renderer/src/services/combat/combat-resolver.ts`
- **Lines:** 679–683
- **Function:** `resolveSavingThrow()`
- **Description:** The `else if` branch with "(halved)" label only fires when `totalFinalDamage` is 0, because the first `if` catches all `> 0` cases first. Successful saves with half damage display generic "Takes X damage" without indicating it was halved.

### LOG-18 [LOW] — `inline-roller.ts` uses `Math.random()` instead of `cryptoRandom()`

- **File:** `src/renderer/src/services/dice/inline-roller.ts` lines 19, 22
- **Function:** `rollInline()`
- **Description:** Character sheet click-to-roll uses `Math.random()` while the main dice engine uses `cryptoRandom()`. Inconsistent RNG quality in a multiplayer fairness context.

### LOG-19 [LOW] — `roll4d6DropLowest()` uses `Math.random()`

- **File:** `src/renderer/src/stores/builder/types.ts` lines 43–47
- **Function:** `roll4d6DropLowest()`
- **Description:** Same inconsistency as LOG-18. Character creation bypasses the dice engine.

### LOG-20 [LOW] — `applyLongRest()` uses `Math.random()` for item recharge

- **File:** `src/renderer/src/services/character/rest-service-5e.ts` line 432
- **Function:** `applyLongRest()`

### LOG-21 [LOW] — Standard array unassigned abilities default to 10 instead of 8

- **File:** `src/renderer/src/stores/builder/slices/ability-score-slice.ts` lines 64–72
- **Function:** `setStandardArrayAssignment()`
- **Description:** Partial assignment gives 74 total stat points instead of intended 72 (standard array sums to 72).

### LOG-22 [LOW] — Movement overlay doesn't pass swim/climb speeds to BFS

- **File:** `src/renderer/src/components/game/map/movement-overlay.ts` lines 29–32
- **Function:** `drawMovementOverlay()`
- **Description:** Never passes `tokenSpeeds` to `getReachableCells()`. Tokens with swim/climb speed see water/climbing cells displayed as 2x cost instead of 1x.

### LOG-23 [LOW] — BFS produces duplicate cell entries in reachable array

- **File:** `src/renderer/src/services/combat/combat-rules.ts` lines 185–187
- **Function:** `getReachableCells()`
- **Description:** When a cell is reached via a shorter path, old entry isn't removed. Array can contain duplicate (x,y) entries with different costs.

### LOG-24 [LOW] — Token movement cost ignores alternate diagonal rule

- **File:** `src/renderer/src/hooks/use-token-movement.ts` lines 275–277
- **Function:** `handleTokenMoveWithOA()`
- **Description:** Always uses Chebyshev distance (`Math.max(dx,dy)*5`). The game supports alternate 5/10/5/10 diagonal rule via `gridDistanceFeetAlternate()` but this hook ignores the setting.

### LOG-25 [LOW] — Standing from prone only works as first move of turn

- **File:** `src/renderer/src/hooks/use-token-movement.ts` lines 258–259
- **Function:** `handleTokenMoveWithOA()`
- **Description:** Checks `ts.movementRemaining === ts.movementMax` instead of just having enough remaining movement. Forced movement earlier in the turn prevents standing.

---

## 3. Network Errors

### NET-1 [CRITICAL] — Arbitrary directory deletion via unvalidated `campaignId`

- **File:** `src/main/ipc/ai-handlers.ts` lines 290–340
- **Handlers:** `AI_CLEAR_MEMORY`, `AI_LIST_MEMORY_FILES`, `AI_READ_MEMORY_FILE`
- **Description:** `campaignId` used directly in `path.join(app.getPath('userData'), 'campaigns', campaignId, 'ai-context')`. `AI_CLEAR_MEMORY` calls `fs.rm(memoryDir, { recursive: true, force: true })`. A payload of `campaignId = '../../../'` could recursively delete arbitrary directories. Affects 10+ handlers.

### NET-2 [CRITICAL] — Destroyed BrowserWindow crashes main process during AI streaming

- **File:** `src/main/ipc/ai-handlers.ts` lines 162–183
- **Handler:** `AI_CHAT_STREAM`
- **Description:** Streaming callbacks capture `win` by closure. If user closes window during AI streaming, `win.webContents.send()` throws `Error: Object has been destroyed` outside Electron's error boundary, causing an unhandled exception in the main process.

### NET-3 [CRITICAL] — Same destroyed-window issue in download/update progress

- **File:** `src/main/ipc/ai-handlers.ts` lines 422–432, 452–462, 484–497
- **Handlers:** `AI_DOWNLOAD_OLLAMA`, `AI_OLLAMA_UPDATE`, `AI_PULL_MODEL`
- **Description:** Progress callbacks use `win?.webContents.send()` — optional chaining prevents null but not destroyed window. Missing `win.isDestroyed()` check.

### NET-4 [HIGH] — Client peer errors silently swallowed after connection

- **File:** `src/renderer/src/network/client-manager.ts` lines 368–375
- **Function:** `attemptConnection()` — `peer.on('error')`
- **Description:** Once `connected` is true, peer-level errors (socket-error, socket-closed, SSL) silently dropped. Client stays in stale "connected" state.

### NET-5 [HIGH] — Unguarded `JSON.stringify` in broadcast functions

- **File:** `src/renderer/src/network/host-manager.ts` lines 321, 329, 342
- **Functions:** `broadcastMessage()`, `broadcastExcluding()`, `sendToPeer()`
- **Description:** No try/catch around `JSON.stringify(msg)`. Circular refs or BigInt crash all message sending for every connected player.

### NET-6 [HIGH] — 27+ AI IPC handlers without try/catch

- **File:** `src/main/ipc/ai-handlers.ts` (various)
- **Description:** `AI_GET_CONFIG`, `AI_CHECK_PROVIDERS`, `AI_LOAD_INDEX`, `AI_CANCEL_STREAM`, `AI_APPLY_MUTATIONS`, `AI_LONG_REST`, `AI_SHORT_REST`, `AI_DETECT_OLLAMA`, `AI_GET_VRAM`, `AI_LIST_INSTALLED_MODELS`, all BMO handlers — raw unstructured errors propagated to renderer.

### NET-7 [HIGH] — `GAME_LOAD_JSON` unprotected `readFile` + `JSON.parse`

- **File:** `src/main/ipc/game-data-handlers.ts` lines 28–29
- **Description:** The primary data-loading handler. Corrupt JSON causes raw `SyntaxError` with no file path context. Every call to `loadJson()` in `data-provider.ts` routes through this.

### NET-8 [HIGH] — No timeouts on cloud API calls (Claude, OpenAI, Gemini)

- **Files:** `src/main/ai/claude-client.ts` lines 37–44, 67–89; `src/main/ai/openai-client.ts` lines 40–48, 68–89; `src/main/ai/gemini-client.ts` lines 52–64, 73–95
- **Functions:** `streamChat`, `chatOnce` in all providers
- **Description:** No timeout on any cloud API call. Hung API blocks indefinitely. Only Ollama has `AbortSignal.timeout(120_000)`.

### NET-9 [HIGH] — Non-atomic writes risk campaign data corruption

- **File:** `src/main/storage/campaign-storage.ts` line 47 (and 13 other storage files)
- **Description:** All storage uses `writeFile(path, JSON.stringify(...))`. Process crash during write produces partial/corrupt JSON. No backup mechanism.

### NET-10 [HIGH] — `writeFileSync` blocks main process

- **File:** `src/main/ai/ai-service.ts` lines 244–256
- **Function:** `configure()`
- **Description:** Synchronous write blocks Electron main process. Disk error crashes configuration flow.

### NET-11 [HIGH] — MemoryManager read-modify-write race conditions

- **File:** `src/main/ai/memory-manager.ts` lines 119–128, 135–144, 182–189, 212–221, 235–287
- **Functions:** `upsertNPC`, `upsertPlace`, `addRuling`, `setNpcPersonality`, `logNpcInteraction`, `addNpcRelationship`
- **Description:** Every method reads array from file, modifies, writes back. Concurrent AI DM actions lose data — last write wins.

### NET-12 [HIGH] — `CHARACTER_RESTORE_VERSION` path traversal

- **File:** `src/main/ipc/storage-handlers.ts` lines 91–93
- **Description:** `fileName` passed directly without sanitization. `../../other-file.json` could read/write outside intended directory.

### NET-13 [HIGH] — `BOOK_IMPORT`/`BOOK_READ_FILE` accept arbitrary paths

- **File:** `src/main/ipc/storage-handlers.ts` lines 324–337
- **Description:** Unlike `FS_READ`/`FS_WRITE` which use `isPathAllowed()`, these accept any path from renderer.

### NET-14 [HIGH] — `AI_INSTALL_OLLAMA` unvalidated installer path

- **File:** `src/main/ipc/ai-handlers.ts` lines 434–441
- **Description:** `installerPath` passed directly to `installOllama()` with no validation. Arbitrary path execution risk.

### NET-15 [HIGH] — `FS_WRITE_BINARY` missing size limit

- **File:** `src/main/ipc/index.ts` lines 197–210
- **Description:** `FS_WRITE` has `MAX_WRITE_CONTENT_SIZE` check but `FS_WRITE_BINARY` has none. Disk exhaustion vector.

### NET-16 [HIGH] — `AUDIO_PICK_FILE` unprotected `fs.readFile`

- **File:** `src/main/ipc/audio-handlers.ts` lines 118–130
- **Description:** File could be deleted between dialog return and readFile. No size check before reading entire file into memory.

### NET-17 [HIGH] — `AI_CONNECTION_STATUS` dead code — handler not in preload

- **File:** `src/main/ipc/ai-handlers.ts` lines 240–246
- **Description:** Registered handler returns useful data but renderer can never call it.

### NET-18 [HIGH] — BMO bridge dynamic imports without catch

- **File:** `src/main/ipc/ai-handlers.ts` lines 510–528
- **Handlers:** `BMO_START_DM`, `BMO_STOP_DM`, `BMO_NARRATE`, `BMO_STATUS`

### NET-19 [HIGH] — `AI_CONFIGURE` uses raw config instead of Zod-parsed data

- **File:** `src/main/ipc/ai-handlers.ts` lines 70–77
- **Description:** `aiService.configure(config)` should be `aiService.configure(parsed.data)`. Bypasses validation.

### NET-20 [HIGH] — `AI_CHAT_STREAM` uses raw request instead of parsed data

- **File:** `src/main/ipc/ai-handlers.ts` lines 154–162
- **Description:** Same pattern as NET-19.

### NET-21 through NET-50 [MEDIUM] (30 issues, summarized)

| ID | File | Issue |
|----|------|-------|
| NET-21 | `host-manager.ts:226` | `peer.reconnect()` failure unhandled |
| NET-22 | `client-manager.ts:421` | Heartbeat interval leaks on forced disconnection |
| NET-23 | `host-manager.ts:276` | `stopHosting()` closes connections before game-end message transmits |
| NET-24 | `peer-manager.ts:163` | Concurrent `createPeer()` leaks previous peer |
| NET-25 | `game-sync.ts:71` | Async map image encoding races with rapid map changes |
| NET-26 | `schemas.ts:457` | ~20 network message types have no Zod payload schema |
| NET-27 | `host-connection.ts:67` | Non-string data bypasses size limits |
| NET-28 | `peer-manager.ts:22` | Hardcoded TURN credentials in source code |
| NET-29 | `storage-handlers.ts:55` | All 34 storage IPC handlers have zero try/catch |
| NET-30 | `plugin-handlers.ts:10` | All 10 plugin IPC handlers have zero try/catch |
| NET-31 | `storage-handlers.ts` | No ID/UUID validation on 16+ storage handlers |
| NET-32 | `storage-handlers.ts` | No body validation on 6 save handlers |
| NET-33 | `ai-handlers.ts:154` | `AI_CHAT_STREAM` uses raw request instead of parsed data |
| NET-34 | `storage-handlers.ts` | Three different error response formats |
| NET-35 | `ai-handlers.ts` | Mix of `throw` and `{success: false}` patterns |
| NET-36 | `claude-client.ts:68` | `getClient()` outside try-catch in `chatOnce` |
| NET-37 | `claude-client.ts:61` | Partial AI text lost on mid-stream error |
| NET-38 | `ai-stream-handler.ts:174` | `handleStreamCompletion` missing try-catch |
| NET-39 | `ai-stream-handler.ts:129` | `restreamConversation` doesn't catch failure |
| NET-40 | `ai-service.ts:687` | `chatOnce` has no retry wrapper |
| NET-41 | `ollama-manager.ts:195` | `downloadOllama` — no timeout/retry/resume |
| NET-42 | `ollama-manager.ts:310` | `pullModel` — no retry for multi-GB downloads |
| NET-43 | `settings-storage.ts:36` | `saveSettings` doesn't use `StorageResult` pattern |
| NET-44 | `ai-conversation-storage.ts:39` | `loadConversation` swallows ALL errors silently |
| NET-45 | `book-storage.ts:142` | `readBookFile` allows arbitrary PDF paths |
| NET-46 | `audio-handlers.ts:25` | `AUDIO_UPLOAD_CUSTOM` no file size limit |
| NET-47 | `index.ts:179` | `FS_WRITE` content type not enforced |
| NET-48 | `shared/ipc-schemas.ts` | Only 2/100+ IPC channels have Zod validation |
| NET-49 | `storage-handlers.ts:291` | `IMAGE_LIBRARY_SAVE` no extension validation |
| NET-50 | `ai-handlers.ts:264` | `AI_SAVE_CONVERSATION` partial error handling |

### NET-51 through NET-68 [LOW] (18 issues, summarized)

| ID | File | Issue |
|----|------|-------|
| NET-51 | `client-manager.ts` | No `peer.on('disconnected')` handler for signaling server loss |
| NET-52 | `client-manager.ts:264` | Non-string data unsafe cast |
| NET-53 | `host-connection.ts:72` | Raw string regex bypass for message size limits |
| NET-54 | `host-message-handlers.ts:64` | `validateMessage()` no default case |
| NET-55 | `peer-manager.ts:57` | No hostname validation in `setSignalingServer()` |
| NET-56 | `host-state-sync.ts:31` | Redundant delete after `handleDisconnection` |
| NET-57 | `host-manager.ts:116` | 100ms kick delay races with `stopHosting()` |
| NET-58 | `client-manager.ts:400` | `lastInviteCode!` non-null assertion |
| NET-59 | `game-sync.ts:13` | Unbounded `imageCache` |
| NET-60 | `claude-client.ts:91` | `isAvailable` no retry on cloud providers |
| NET-61 | `ai-service.ts:456` | IIFE async no final `.catch()` |
| NET-62 | `ai-conversation-storage.ts:23` | Mixes `existsSync` with async operations |
| NET-63 | `settings-storage.ts:27` | `loadSettings` swallows all errors |
| NET-64 | `preload/index.ts:136` | `ipcRenderer.on` listeners accumulate |
| NET-65 | `preload/index.ts:65` | `OPEN_DEVTOOLS` exposed in production |
| NET-66 | `preload/index.ts:160` | Stream events not traceable |
| NET-67 | `index.ts:128` | `DIALOG_SAVE`/`DIALOG_OPEN` no window edge case |
| NET-68 | `ai-conversation-storage.ts:17` | Throw raw errors instead of `StorageResult` |

---

## 4. GUI/UI Errors

### GUI-1 [CRITICAL] — Conditional hooks violation in PlayerHUDOverlay

- **File:** `src/renderer/src/components/game/overlays/PlayerHUDOverlay.tsx`
- **Line:** 82
- **Component:** `PlayerHUDOverlay`
- **Description:** Early return `if (!character) return <></>` at line 82, with `useMemo` and multiple `useCallback` hooks after the return (lines 86, 96, 118, 153, etc.). Hook call order changes depending on `character` truthiness. Violates React's Rules of Hooks.
- **Impact:** Crashes or inconsistent state. Biome flags 10 `useHookAtTopLevel` warnings in this file.

### GUI-2 [HIGH] — DmAlertTray subscription leak

- **File:** `src/renderer/src/components/game/overlays/DmAlertTray.tsx`
- **Lines:** 33–38
- **Hook:** `useAlerts`
- **Description:** Cleanup function returned as initial state value, never invoked. Listeners accumulate on mount/unmount cycles.

### GUI-3 [HIGH] — DiceOverlay setTimeout leak

- **File:** `src/renderer/src/components/game/dice3d/DiceOverlay.tsx`
- **Lines:** 119–137
- **Function:** `handleAnimationComplete`
- **Description:** Nested `setTimeout` without storing IDs or clearing on unmount. State updates on unmounted component.

### GUI-4 [HIGH] — Three.js resource leaks per dice roll

- **File:** `src/renderer/src/components/game/dice3d/DiceRenderer.tsx` lines 129–134; `dice-textures.ts` lines 6–73; `dice-physics.ts` lines 91–148
- **Functions:** `clearDice`, `createDieTexture`, `createTetrahedronShape`
- **Description:** `scene.remove()` on meshes but never calls `.geometry.dispose()`, `.material.dispose()`, or `.texture.dispose()`. Geometries, materials, and textures leak with every dice roll. `CanvasTexture` instances never disposed. Geometries created for cannon-es shapes never disposed.

### GUI-5 [HIGH] — MapCanvas undefined `selectedTokenId`

- **File:** `src/renderer/src/components/game/map/MapCanvas.tsx`
- **Lines:** 357–362
- **Function:** `useMapOverlayEffects`
- **Description:** Passes `selectedTokenId` (singular) which is not defined in scope. Props use `selectedTokenIds: string[]`. Movement overlay breaks in initiative mode.

### GUI-6 [HIGH] — Index keys on editable lists

- **Files:** `StatBlockFormSections.tsx:66`, `StatBlockForm.tsx:305`, `StatBlockEditor.tsx:93,175,666`
- **Description:** Editable, reorderable lists use `key={idx}`. Reordering/deleting causes wrong items to update.

### GUI-7 [HIGH] — RulingApprovalModal cannot be dismissed

- **File:** `src/renderer/src/components/game/modals/utility/RulingApprovalModal.tsx` lines 50–109
- **Description:** No Escape handler, no backdrop click, no Cancel button. Only closable via Approve or Override. Can block DM's UI.

### GUI-8 [HIGH] — 11 modals missing Escape key handling

- **Files:** `NarrowModalShell.tsx`, `LightSourceModal.tsx`, `TimeEditModal.tsx`, `SentientItemModal.tsx`, `NetworkSettingsModal.tsx`, `WhisperModal.tsx`, `HandoutModal.tsx`, `DMNotesModal.tsx`, `SharedJournalModal.tsx`, `ConfirmDialog.tsx`

### GUI-9 [HIGH] — Modal headers scroll away

- **File:** `src/renderer/src/components/ui/Modal.tsx` line 73
- **Description:** `overflow-y-auto flex flex-col` on same element. Header and body scroll together, header disappears on long content.

### GUI-10 [HIGH] — Scrollbar utility classes are no-ops

- **File:** `src/renderer/src/components/game/bottom/DMTabPanel.tsx` line 363
- **Description:** `scrollbar-thin scrollbar-thumb-gray-700` — no `tailwind-scrollbar` plugin installed. Firefox gets default ugly scrollbars (no `scrollbar-width`/`scrollbar-color` fallback).

### GUI-11 [HIGH] — ShopView setTimeout leak

- **File:** `src/renderer/src/components/game/player/ShopView.tsx` lines 214–219
- **Function:** `handleHaggle`
- **Description:** `setTimeout(..., 10000)` without storing ID. Callback fires after navigation.

### GUI-12 through GUI-36 [MEDIUM] (25 issues, summarized)

| ID | File/Component | Issue |
|----|----------------|-------|
| GUI-12 | `EncounterBuilderModal` | No loading spinner or error feedback for `load5eMonsters()` |
| GUI-13 | `TreasureGeneratorModal` | No loading/error UI for treasure tables |
| GUI-14 | `SubclassSelector5e` | No loading/error UI for subclass data |
| GUI-15 | `CoreBooksGrid` | No loading/error UI for books |
| GUI-16 | `CompanionsSection5e:188,197,223` | Index keys on semi-static lists |
| GUI-17 | `MagicItemTracker:157,161` | Index keys |
| GUI-18 | `MapCanvas:294` | No texture cache eviction — memory growth |
| GUI-19 | `grid-layer.ts` | No spatial culling — all cells drawn |
| GUI-20 | Z-index conflicts | `z-20`, `z-30`, `z-40`, `z-50` all collide |
| GUI-21 | `NarrowModalShell` | No focus trap |
| GUI-22 | All modals | No body scroll lock |
| GUI-23 | `HandoutModal`, `SharedJournalModal`, `TimeEditModal` | State not reset on close |
| GUI-24 | `NarrowModalShell:23` | No max-height — overflows on small screens |
| GUI-25 | `CreatureModal` | `w-[900px]` fixed — clips on <900px screens |
| GUI-26 | `SpellReferenceModal`, `FamiliarSelectorModal`, `SteedSelectorModal` | `w-[700px]` fixed |
| GUI-27 | `DowntimeModal` | `w-[600px]` fixed |
| GUI-28 | `InitiativeControls:94` | `truncate` without `min-w-0` on flex parent |
| GUI-29 | `CreateMapModal` | No validation (empty name, 0 dimensions allowed) |
| GUI-30 | `NetworkSettingsModal` | TURN URL format not validated |
| GUI-31 | `CreatureModal` | Custom name/HP inputs no validation |
| GUI-32 | `HandoutModal`, `SharedJournalModal`, `WhisperModal` | Lost draft content on close |
| GUI-33 | `ModalFormFooter` | No `isSubmitting` prop — double submit possible |
| GUI-34 | `CraftingSection5e` | Multiple setTimeout without cleanup |
| GUI-35 | `SessionZeroStep`, `AdventureSelector` | Hardcoded `bg-white`/`text-black` — dark mode clash |
| GUI-36 | `EncounterBuilderModal` | `bg-white` XP threshold — not theme-aware |

### GUI-37 through GUI-44 [LOW] (8 issues)

Static index keys on non-editable lists, redundant overflow classes, short-lived setTimeout leaks, and minor dark mode inconsistencies across various components.

---

## 5. Runtime Errors

### RUN-1 [CRITICAL] — `JSON.parse` without try/catch in primary data IPC handler

- **File:** `src/main/ipc/game-data-handlers.ts`
- **Lines:** 28–29
- **Function:** Handler for `IPC_CHANNELS.GAME_LOAD_JSON`
- **Description:** `JSON.parse(content)` with no try/catch. Corrupt JSON in any of 85+ data files crashes the entire data pipeline. Since most pages load data on mount, app shows blank screen.

### RUN-2 [HIGH] — Four `.then()` without `.catch()` in builder selection slice

- **File:** `src/renderer/src/stores/builder/slices/selection-slice.ts`
- **Lines:** 170, 227, 247, 279
- **Function:** `acceptSelection()`
- **Description:** `load5eSpecies().then(...)`, `load5eBackgrounds().then(...)`, `load5eClasses().then(...)` — all without `.catch()`. Failed data load leaves builder in inconsistent state.

### RUN-3 [HIGH] — Fire-and-forget dynamic import in AI DM store

- **File:** `src/renderer/src/stores/use-ai-dm-store.ts`
- **Lines:** 136–138
- **Function:** `approvePendingActions()`
- **Description:** `import('../services/game-action-executor').then(...)` with no `.catch()`. Actions cleared from state but never executed. DM gets no feedback.

### RUN-4 [HIGH] — Fire-and-forget IPC call in AI DM store

- **File:** `src/renderer/src/stores/use-ai-dm-store.ts`
- **Lines:** 182–196
- **Function:** `initFromCampaign()`
- **Description:** `window.api.ai.loadConversation(campaign.id).then(...)` without `.catch()`.

### RUN-5 [HIGH] — Two fire-and-forget dynamic imports in game effects hook

- **File:** `src/renderer/src/hooks/use-game-effects.ts`
- **Lines:** 334, 349
- **Function:** `useDmMessageProcessor()`
- **Description:** `import('../utils/creature-mutations').then(...)` and `import('../services/game-action-executor').then(...)` — no `.catch()`. AI creature mutations silently dropped.

### RUN-6 [HIGH] — `.then()` without `.catch()` in character details slice

- **File:** `src/renderer/src/stores/builder/slices/character-details-slice.ts`
- **Lines:** 117–132
- **Function:** `setClassEquipmentChoice()`

### RUN-7 [HIGH] — Dialog handlers access null window

- **File:** `src/main/ipc/index.ts`
- **Lines:** 127–128, 143–144
- **Functions:** `DIALOG_SAVE`, `DIALOG_OPEN`
- **Description:** `BrowserWindow.getAllWindows()[0]` returns `undefined` if no windows exist. Passing `undefined` to `dialog.showSaveDialog()` throws TypeError.

### RUN-8 [HIGH] — 8+ AI IPC handlers without try/catch

- **File:** `src/main/ipc/ai-handlers.ts`
- **Lines:** 79–85, 144–150, 414–420, 468–474
- **Functions:** `AI_GET_CONFIG`, `AI_CHECK_PROVIDERS`, `AI_LOAD_INDEX`, `AI_GET_CHUNK_COUNT`, `AI_DETECT_OLLAMA`, `AI_GET_VRAM`, `AI_LIST_INSTALLED_MODELS`, `AI_LIST_INSTALLED_MODELS_DETAILED`

### RUN-9 [HIGH] — `AI_SAVE_CONVERSATION` partial error handling

- **File:** `src/main/ipc/ai-handlers.ts` lines 264–271
- **Description:** `getConversationManager()` and `serialize()` without try/catch. If conversation manager doesn't exist, save fails silently. User loses conversation history.

### RUN-10 [MEDIUM] — `Promise.all` in `loadAllStatBlocks` — one failure kills all

- **File:** `src/renderer/src/services/data-provider.ts` line 678
- **Description:** One corrupt file (monsters, NPCs, or creatures) prevents all stat blocks from loading.

### RUN-11 [MEDIUM] — `Promise.all` in `loadExtendedDowntimeActivities`

- **File:** `src/renderer/src/services/downtime-service.ts` line 113
- **Description:** One corrupt downtime file prevents all activities from loading. Cached, so failure is permanent.

### RUN-12 [MEDIUM] — Non-null assertion on possibly-null conditions data

- **File:** `src/renderer/src/data/conditions.ts` lines 40–41, 44–45
- **Functions:** `getConditions5e()`, `getBuffs5e()`
- **Description:** Returns `_conditions!` and `_buffs!` which may be null if load failed. First `.map()` or `.filter()` on result throws `TypeError`.

### RUN-13 [MEDIUM] — `JSON.parse` on corrupt metadata (image, map, shop storage)

- **Files:** `image-library-storage.ts:124`, `map-library-storage.ts:101`, `shop-storage.ts:104`
- **Description:** Outer try/catch exists but error messages are generic. Corrupt metadata makes resources permanently unavailable.

### RUN-14 [MEDIUM] — HTMLAudioElement pools never disposed on `reinit()`

- **File:** `src/renderer/src/services/sound-manager.ts` lines 294–298
- **Description:** ~240 Audio elements orphaned per `reinit()` call. Progressive degradation hitting Chromium media element limit.

### RUN-15 [MEDIUM] — `uncaughtException` handler doesn't exit process

- **File:** `src/main/index.ts` lines 13–15
- **Description:** Only logs, doesn't exit. Process continues in undefined state. Risk of data corruption on next write.

### RUN-16 [MEDIUM] — Keyboard shortcuts persist across route navigation

- **File:** `src/renderer/src/services/keyboard-shortcuts.ts` lines 127–131
- **Description:** Global `keydown` listener remains active on non-game pages.

### RUN-17 [MEDIUM] — Module-level `setInterval` in AI service never cleared

- **File:** `src/main/ai/ai-service.ts` lines 114–125
- **Description:** Stale stream cleanup interval. In dev mode with HMR, intervals multiply.

### RUN-18 through RUN-21 [MEDIUM] — BMO dynamic imports, campaignId validation, app init chain

| ID | File | Issue |
|----|------|-------|
| RUN-18 | `ai-handlers.ts:510` | BMO handlers no error handling on dynamic imports |
| RUN-19 | `ai-handlers.ts:283,333` | No campaignId validation — `undefined` causes TypeError |
| RUN-20 | `index.ts:114` | App init in `.then()` — partial init on throw |
| RUN-21 | `data-provider.ts:159` | `parseInt` on object speed silently returns 30 |

### RUN-22 through RUN-26 [LOW]

| ID | File | Issue |
|----|------|-------|
| RUN-22 | `game-sync.ts:75` | `encodeMapImage` potential sync throw (has `.catch()` for async) |
| RUN-23 | `index.ts:114` | Top-level async chain — partial init on throw |
| RUN-24 | `data-provider.ts:159` | `parseInt` masks complex speed objects |
| RUN-25 | `ai-renderer-actions.ts:63` | `parseInt` NaN propagation — "NaN gp" display |
| RUN-26 | `apply-level-up.ts:62` | `parseInt` on empty string from `hitPointDie` |

---

## 6. Type Errors

**TypeScript compiler:** `tsc --noEmit` reports **0 errors** — the codebase is type-clean at the compiler level. However, several type-safety issues exist that the compiler cannot catch:

### TYP-1 [HIGH] — Preload type declarations missing `discord` and `cloudSync` namespaces

- **File:** `src/preload/index.d.ts` lines 579–609
- **Description:** Preload exposes `window.api.discord.*` and `window.api.cloudSync.*` at runtime but TypeScript types don't declare them. Any renderer code using these APIs has no type checking.

### TYP-2 [HIGH] — Preload type declarations missing 4 AI methods

- **File:** `src/preload/index.d.ts`
- **Description:** `listCloudModels`, `validateApiKey`, `syncWorldState`, `syncCombatState` exposed in preload but absent from `AiAPI` type. Renderer calls succeed at runtime but have no type safety.

### TYP-3 [MEDIUM] — `AI_CONFIGURE` bypasses Zod-validated type

- **File:** `src/main/ipc/ai-handlers.ts` line 75
- **Description:** After Zod validation succeeds, `aiService.configure(config)` passes the original unvalidated `config` instead of `parsed.data`. The Zod schema's type narrowing is wasted.

### TYP-4 [MEDIUM] — Type cast masks property name mismatch in validator

- **File:** `src/renderer/src/services/game-actions/action-validator.ts` line 104
- **Description:** `(e: { label?: string })` overrides the actual `InitiativeEntry` type which has `entityName`, not `label`. The cast silences what should be a compile error, hiding a runtime bug (LOG-12).

### TYP-5 [LOW] — 3 `noImplicitAnyLet` violations

- **File:** `src/renderer/src/utils/chat-links.ts` lines 30, 44, 57
- **Description:** `let match` without type annotation. Biome flags as implicit `any`.

### TYP-6 [LOW] — Non-null assertions on potentially null values

- **File:** `src/renderer/src/data/conditions.ts` lines 40–41, 44–45
- **Description:** `_conditions!` and `_buffs!` assertions when the values could genuinely be null if async load failed.

### TYP-7 [LOW] — `noRedeclare` in two components

- **Files:** `InitiativeTracker.tsx:10`, `MapCanvas.tsx:168`
- **Description:** Variable names shadow outer scope declarations. Could cause confusion but not runtime errors.

---

## Top 10 Most Critical Issues (Recommended Fix Order)

| Priority | ID | Issue | Impact |
|----------|----|-------|--------|
| 1 | NET-1 | Unvalidated `campaignId` enables directory deletion | Security — data loss |
| 2 | NET-2/3 | Destroyed window crashes main process | App crash during AI use |
| 3 | RUN-1/NET-7 | `JSON.parse` without try/catch in data loader | App blank screen on corrupt data |
| 4 | LOG-4 | Area saves ignore modifiers | All AI DM area effects overpowered |
| 5 | LOG-5 | Cone AoE uses square geometry | Wrong targets hit by cones |
| 6 | LOG-2 | Critical hit only doubles first dice group | Incorrect damage on crits |
| 7 | LOG-1 | Champion crit range never applied | Class feature completely broken |
| 8 | GUI-1 | Conditional hooks in PlayerHUDOverlay | React crashes during gameplay |
| 9 | NET-9 | Non-atomic writes corrupt campaigns | Data loss on crash |
| 10 | LOG-6 | Long rest removes all exhaustion | Trivializes exhaustion mechanic |
