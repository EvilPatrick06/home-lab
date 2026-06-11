# PHASE-30 — Combat automation: deterministic monster turns + tactical-suggestion assistant

> Part of the 2026-06-10 backlog phase set. Order/dependencies: PHASE-INDEX.md. Execute per INSTRUCTIONS.md.

## Goal

Add a deterministic, heuristic monster-turn engine that can plan and execute an enemy creature's entire combat turn (target selection, A\*-pathed movement, attack/multiattack resolution, recharge-ability usage, action-economy bookkeeping, retreat behavior) using the structured monster stat-block data already shipped in the library — with the LLM used **only** to narrate the already-resolved result, never to adjudicate mechanics. The same engine in plan-only mode powers a "suggest tactical action" assistant for human DMs. This follows the proven split from Foundry's mookAI (deterministic action engine) and the PF2e AI Combat Assistant (per-turn suggestion with rationale): mechanics stay hallucination-free and instant, narration stays rich. Everything user-visible is opt-in and off by default; the only always-available additions are two DM-triggered buttons/commands that do nothing until clicked.

## Dependencies & cross-phase notes

- **Depends on PHASE-08 (executor batch correctness).** PHASE-08 owns: (a) removing the dead duplicate initiative executors in `services/game-actions/creature-actions.ts` (lines 106–242 duplicate the live copies in `creature-initiative.ts`); (b) wiring legendary/recharge enrichment (`enrichWithLegendaryData`, currently only reachable from the dead path) into the LIVE AI + DM initiative paths; (c) creature stat-mutation fixes. This phase **reads** `InitiativeEntry.rechargeAbilities` / `legendaryActions` and must not assume they are populated — the planner falls back to parsing the stat block directly (see 30A step 6) — but after PHASE-08 the entry data is the preferred source. Do NOT add any new code to `creature-actions.ts` (it is scheduled for dead-code removal); new executors go in a new file.
- **Coordinate with PHASE-04 on `components/game/overlays/MutationApprovalPanel.tsx`** — PHASE-04 labels the 12 unlabeled pending-action types; this phase adds one new action type (`run_monster_turn`) that flows through the same `dmApprovalRequired` → `pendingActions` gate (`game-action-executor.ts:194-207`). Whichever phase lands second adds/keeps the label for `run_monster_turn`.
- **Coordinate with PHASE-09 on `services/chat-commands/index.ts`** — PHASE-09 dedupes command registrations and adds a registry collision test. This phase registers two NEW commands (`/monsterturn`, `/suggestturn`); both names and all aliases were verified unused (see Verified findings F13). If PHASE-09's collision test already landed, it will guard the addition automatically.
- **Coordinate with PHASE-11 on `src/main/ai/prompt-sections/dm-actions-schema.ts` and `combat-tactics.ts`** — PHASE-11 fixes prompt/schema contract drift in the same files. This phase appends one new action doc line and one tactics paragraph; merge textually, no semantic conflict.
- **PHASE-02 (stat-mutation correctness)** owns HP-mutation validation in the `[STAT_CHANGES]` pipeline; this phase applies damage directly via `updateToken` (the same mechanism `executeOpportunityAttack` uses) and is unaffected, but keep damage application `Math.max(0, …)`-clamped exactly like the precedent.
- **PHASE-28 (director/quests/oracle)** and **PHASE-29 (model routing)** touch the AI pipeline but no shared files with this phase beyond `combat-tactics.ts` (PHASE-28 does not list it; no conflict expected).
- No Pi/bmo code is touched; the end-of-phase gate is the standard dnd-app 4-gate only.

## Verified findings

All verified 2026-06-10 against the live tree. Repo root assumed as CWD; all paths below are under `dnd-app/`.

### F1 — No deterministic monster-turn engine exists; the LLM adjudicates monster turns today

The AI DM runs monster turns by narrating prose and emitting `[DM_ACTIONS]` (`roll_dice`, `opportunity_attack`, `move_token`, `next_turn`, …) and `[STAT_CHANGES]` (`creature_damage`) — i.e., the model itself decides AND resolves mechanics, with only per-action executors doing real rolls. There is no engine that plans or executes a full monster turn.

- `src/main/ai/prompt-sections/dm-actions-schema.ts:90` — `roll_dice` doc: "Use this for attack rolls, saves, checks…"; `:104` — `opportunity_attack` is the only fully-resolved creature attack action; `:110` — "When you run a monster's turn, emit the matching action…".
- `src/main/ai/prompt-sections/combat-tactics.ts:4-38` — `COMBAT_TACTICS_PROMPT` gives the model INT-tier tactical *guidelines* (prompt text only, no code).
- Verification:
  ```bash
  grep -rln "monsterTurn\|runMonster\|autoTurn" dnd-app/src --include="*.ts" --include="*.tsx" -i   # → no engine hits
  grep -n "roll_dice\|opportunity_attack" dnd-app/src/main/ai/prompt-sections/dm-actions-schema.ts
  ```
- Correction vs the audit text: the audit framed the gap as "solo play forcing the player to run both sides of combat". In this app the AI DM *does* run the monster side — the actual gap is that monster mechanics are LLM-resolved (slow, token-hungry, hallucination-prone on action economy) instead of engine-resolved.

### F2 — Structured monster action data exists and is nearly complete

`src/renderer/public/data/5e/dm/npcs/monsters.json` holds 379 aggregated `MonsterStatBlock` records with machine-readable actions: of 379 monsters, **378 have at least one action with numeric `toHit`**, **271 have `multiattackActions` expansion lists**, **116 have `recharge` actions**, **45 have `legendaryActions`**. Fields per action (`src/renderer/src/types/monster.ts:37-60`): `attackType`, `toHit`, `reach`, `rangeNormal/rangeLong`, `damageDice`, `damageType`, `additionalDamage`, `saveDC`, `saveAbility`, `areaOfEffect {type, size}`, `recharge`, `multiattackActions`, `spellAction`, `utility`, `usesPerDay`. The per-monster source files (e.g. `dm/npcs/monsters/fey/goblin-warrior.json`) carry prose only — the aggregate is the parsed source of truth. NPC/creature aggregates load through the same type (`data-provider.ts:432-470`: `load5eMonsters`, `load5eNpcs`, `load5eCreatures`, `loadAllStatBlocks`).

- Verification:
  ```bash
  node -e "const m=require('/home/patrick/home-lab/.claude/worktrees/ai-p6-roadmap/dnd-app/src/renderer/public/data/5e/dm/npcs/monsters.json');console.log(m.length,m.filter(x=>x.actions?.some(a=>typeof a.toHit==='number')).length,m.filter(x=>x.actions?.some(a=>a.multiattackActions)).length,m.filter(x=>x.actions?.some(a=>a.recharge)).length,m.filter(x=>x.legendaryActions).length)"
  # → 379 378 271 116 45
  ```

### F3 — Token → stat-block live resolution exists

`src/renderer/src/services/game/token-stats.ts` — `lookupTokenStatBlock(id)` (`:81-90`) scans library categories `['monsters','npcs','creatures']` in the library truth store synchronously; `getTokenStats(token)` (`:98-100`) resolves effective AC/maxHP/speeds/resistances with inline token fields as overrides; `getCreatureSaveMod(token, ability)` (`:126+`) returns the proficient save bonus or bare ability mod, falling back to +0 with a logged warning for tokens with no stat block (the established convention for PC saves in AoE resolution). `MapToken.monsterStatBlockId` (`src/renderer/src/types/map.ts:122`) is the link key; the AI game-state snapshot exposes it as `creature:<id>` per token line (`services/game-actions/state-snapshot.ts:68`).

- Verification: `grep -n "lookupTokenStatBlock\|getCreatureSaveMod" dnd-app/src/renderer/src/services/game/token-stats.ts`

### F4 — A\* pathfinding with walls, terrain costs, and movement budgets exists

`src/renderer/src/services/map/pathfinder.ts` — `findPath(startX, startY, goalX, goalY, gridWidth, gridHeight, walls, terrain, movementBudget, tokenSpeeds?, diagonalRule?, gridType?)` (`:245`) returns `{ path, totalCost, reachedGoal }`; `getReachableCellsWithWalls(...)` (`:368`) BFS-floods every cell reachable within a budget with per-cell cost; `isMovementBlockedByWall` (`:40`) handles doors/windows/one-way walls. Terrain costs (difficult ×2, water without swim ×2) via `stepCost` (`:163`). Hex grids supported. This is the "collision-free pathfinding" mookAI provides — already in-tree and unit-tested (`pathfinder.test.ts`).

### F5 — Distance, cover, line-of-sight, and AoE-targeting primitives exist

- Chebyshev distance ×5 ft is the codified metric: `state-snapshot.ts:227` — `Math.max(|dx|,|dy|) * 5`.
- `services/combat/cover-calculator.ts` — `calculateCover(attacker, target, walls, cellSize, tokens)` (`:91`) returns `none|half|three-quarters|total`; `hasLineOfSight` (`:166`).
- `services/combat/aoe-targeting.ts` — `AoEDefinition {shape, originX, originY, size, direction?, width?}` (`:16-27`), `getTokensInAoE` (`:50`), `countTargetsInAoE` (`:224`).
- `services/combat/flanking.ts` — `checkFlanking` (`:88`); optional-rule flag `flankingEnabled` lives in the game store (`stores/game/index.ts:90`), `diagonalRule` at `:92`.

### F6 — Deterministic creature-attack resolution precedent: `executeOpportunityAttack`

`src/renderer/src/services/game-actions/combat-economy-actions.ts:190-253` resolves a creature attack end-to-end: `rollDiceFormula('1d20')` (+ crit on nat 20 / fumble on nat 1), target AC via `getTokenStats`, damage roll with crit dice-doubling (`base.rolls` summed again, modifier not doubled), HP clamp via `gameStore.updateToken(mapId, token.id, { currentHP: Math.max(0, …) })`, concentration check via `checkConcentrationOnDamage` (imported from `../combat/concentration-manager`, `:12`) + `getCreatureSaveMod(target,'con')`, and a chat summary via local `postCombatNote` (`:19-31`, senderId `'ai-dm'`, `isSystem: true`). This is the exact mechanical template the turn executor generalizes.

### F7 — Initiative & turn-state machinery

- `stores/game/initiative-slice.ts` — `nextTurn()` (`:107-266`): advances index, resets the incoming entity's `TurnState` (speed default 30, `maxAttacks` hard-defaulted to 1 — `:154-157`), emits `pluginEventBus` events `game:turn-end` / `game:turn-start` (`:201-210`) / `game:round-end`, advances in-game time +6 s per round, expires round-counted conditions, prompts lair actions.
- `TurnState` (`types/game-state.ts:40-60`): `movementRemaining/Max`, `actionUsed`, `bonusActionUsed`, `reactionUsed`, `isDashing/isDisengaging/isDodging/isHidden`, `concentratingSpell`, `attackTracker`.
- `InitiativeEntry` (`types/game-state.ts:67-88`): `entityId`, `entityType: 'player'|'npc'|'enemy'`, `legendaryActions {used,maximum}`, `legendaryResistances {max,remaining}`, `rechargeAbilities: RechargeAbility[]` (`{name, rechargeOn, available}`, `:89-93`), `inLair`, `lairActions`, `isDelaying`, `readyAction`.
- Turn-state mutators on the slice: `useAction`, `useBonusAction`, `useReaction`, `useMovement(entityId, feet)`, `setDashing`, `setDisengaging`, `setDodging`, `setHidden`, `setConcentrating` (`initiative-slice.ts:486-611`).

### F8 — Recharge/legendary enrichment exists only on a dead path; recharge auto-roll runs on `next_turn`

- `services/game-actions/creature-actions.ts:37-84` — `enrichWithLegendaryData(entry, token, monsters)` populates `legendaryActions`, `legendaryResistances` (parsed from a "Legendary Resistance (3/Day)" trait), and `rechargeAbilities` (regex `\(Recharge (\d)(?:[–-]6)?\)` over action names). **This file's initiative executors (`:106-242`) are dead duplicates** — `game-action-executor.ts:50-60` imports the live copies from `creature-initiative.ts`, which do NOT call the enrichment. PHASE-08 fixes this.
- Live recharge auto-roll: `creature-initiative.ts:97-124` — on `executeNextTurn`, every unavailable `rechargeAbilities` entry of an `enemy` rolls 1d6 vs `rechargeOn` and posts a recharge chat note. `executeRechargeRoll` (`:224-267`) is the manual/AI path and **creates** the entry record if missing.
- Verification: `grep -n "executeStartInitiative" dnd-app/src/renderer/src/services/game-action-executor.ts dnd-app/src/renderer/src/services/game-actions/creature-initiative.ts dnd-app/src/renderer/src/services/game-actions/creature-actions.ts`

### F9 — Saving throws, AoE resolution, condition extraction, legendary spending exist as reusable services

- `services/combat/combat-resolver.ts:261` — `resolveSavingThrow(request)` (DC, half-on-success, cover bonus, counterspell prompts).
- `services/game-actions/creature-conditions.ts` — `executeApplyAreaEffect` (registered at `game-action-executor.ts:468`) rolls real saves + damage per target in an AoE and posts an `[Area Effect]` summary; the prompt documents that the AI "sees it next turn" (`dm-actions-schema.ts:122`) — the established **resolve-now, narrate-next-message** contract this phase reuses for whole turns.
- `services/combat/condition-extractor.ts:50` — `extractConditionsFromDescription(description)` parses "DC X … or be Y" rider conditions out of action prose.
- `services/combat/legendary-actions.ts` — `spendLegendaryAction` (`:13`), `useLegendaryResistance` (`:53`), `shouldTriggerLairAction` (`:92`).
- `services/game-actions/dice-helpers.ts:8` — `rollDiceFormula(formula)` → `{rolls, total}`.

### F10 — The INT-tier tactical policy is already specified in prompt text

`src/main/ai/prompt-sections/combat-tactics.ts:10-15` defines the tiers the planner must encode (so engine behavior matches what the model was already told): INT 1-3 attack nearest / no tactics; INT 4-7 focus wounded, retreat at 25% HP; INT 8-11 target concentrating casters, retreat 25%; INT 12-15 healer > caster > ranged > tank, use cover, retreat 33%; INT 16+ action-economy optimization, retreat 50%. AoE when 3+ targets; mindless (Undead/Construct) fight to the death; recharge abilities used as soon as available; ranged attackers keep 30+ ft. `conversation-manager.ts:96` includes this prompt section only when combat is active.

### F11 — DM-side UI host points

- `components/game/dm/InitiativeTracker.tsx` (439 lines) receives `isHost`, `initiative`, `tokens`, `onNextTurn`, … (props `:16-37`) and renders `InitiativeControls` + per-entry rows; the combat-timer config UI inside it is the precedent for a small host-only settings popover.
- `pluginEventBus` `'game:turn-start'` (emitted at `initiative-slice.ts:201-210`) currently has **no renderer subscriber outside the plugin system** — verified via `grep -rn "game:turn-start" dnd-app/src/renderer/src --include="*.ts*" | grep -v test | grep -v "initiative-slice\|event-bus\|plugin"` → empty. A new hook can subscribe without conflicts.
- `GameLayout.tsx:503` mounts `useGameEffects(...)` — the established place to mount a new session-scoped hook.

### F12 — Persistence pattern for DM combat preferences (combatTimer)

`CombatTimerConfig` persists campaign-side through `SavedGameState.combatTimer` (`types/campaign.ts:276`), written by `services/io/game-state-saver.ts:28` (`buildSavableCampaign`), hydrated by `loadGameState` (`stores/game/index.ts:140,159,179`), defaulted in store reset (`stores/game/index.ts:104`), with state+setter in `stores/game/timer-slice.ts:28-30` and the type fields at `stores/game/types.ts:227` and `:459`. The new `monsterAutomation` config copies this pattern exactly.

### F13 — Chat-command registry; new names are free

- Registry: `services/chat-commands/index.ts:72-135` (`allCommands` spread list); `ChatCommand` shape at `services/chat-commands/types.ts:28-37` (`name`, `aliases`, `description`, `usage`, `examples?`, `category: 'player'|'dm'|'ai'`, `dmOnly`, `execute(args, ctx)`).
- Verification: `grep -rin "monsterturn\|suggestturn\|runturn" dnd-app/src` → no hits (names free).

### F14 — AI delegation/validation plumbing for a new DM action

- Renderer executor: `services/game-action-executor.ts` — `executeDmActions(actions, bypassApproval)` (`:194`) queues to `useAiDmStore.pendingActions` when `dmApprovalRequired`; dispatch switch `executeOne` (`:254+`), unknown actions throw (`:555-561`); batch cap 50 (`:166`).
- Main-side type union: `src/main/ai/dm-actions.ts:9+` (combat-economy block `:140-158`).
- Zod registry: `src/main/ai/ai-schemas.ts` — per-action schemas (e.g. `OpportunityAttackSchema` `:644-652`) registered in `DM_ACTION_SCHEMAS` (`:1276+`).
- Prompt doc: `src/main/ai/prompt-sections/dm-actions-schema.ts` (combat economy section around `:99-110`).
- All four surfaces must be updated together for a new action.

### F15 — AI flavor-narration path

`useAiDmStore.sendMessage(campaignId, content, characterIds, senderName?, activeCreatures?, gameState?, actingCharacterId?)` (`stores/use-ai-dm-store.ts:111-126` type, `:323` impl) is the single send path; `routePlayerMessageToAiDm` (`services/ai-dm-routing.ts:119`) builds roster + snapshot and calls it. `getActiveCampaignId()` (`services/active-campaign-ref.ts:24`) supplies the campaign id outside React. `AiDmConfig.enabled` (`types/campaign.ts:63-74`) gates whether a campaign has an AI DM at all. The ai-dm store is NOT persisted (no `persist` wrapper — verified `grep -n "persist" dnd-app/src/renderer/src/stores/use-ai-dm-store.ts` → no zustand persist).

## Sub-phases

Order keeps the tree green: pure planner first (no consumers), then executor (consumed by nothing until 30C/30D wire it), then AI action, then UI/commands, then auto-run + flavor, then i18n/polish.

### 30A — Monster-turn planner (pure heuristic engine)

**Objective:** a pure, fully unit-testable module that converts a combat snapshot into a `MonsterTurnPlan` — no store imports, no side effects, no dice rolls (rolls happen at execution time).

**Files:**
- NEW `src/renderer/src/services/combat/monster-turn-planner.ts`
- NEW `src/renderer/src/services/combat/monster-turn-planner.test.ts`

**Steps:**
1. Define the context + plan types (export all):
   ```ts
   export interface MonsterTurnContext {
     actor: MapToken
     statBlock: MonsterStatBlock
     tokens: MapToken[]                       // all tokens on the active map
     walls: WallSegment[]
     terrain: TerrainCell[]
     gridWidth: number
     gridHeight: number
     turnStates: Record<string, TurnState>
     initiativeEntry?: InitiativeEntry        // recharge/legendary state when present
     round: number
     diagonalRule: DiagonalRule
     gridType?: GridSettings['type']
     flankingEnabled?: boolean
   }
   export type IntTier = 'mindless' | 'low' | 'average' | 'clever' | 'genius'
   export type MonsterTurnStep =
     | { kind: 'move'; path: Array<{ x: number; y: number }>; costFt: number }
     | { kind: 'stance'; stance: 'dash' | 'disengage' | 'dodge'; viaBonusAction?: boolean }
     | { kind: 'attack'; actionName: string; targetTokenId: string; toHit: number; damageDice: string; damageType?: string; additionalDamage?: string }
     | { kind: 'save-action'; actionName: string; targetTokenIds: string[]; saveDC: number; saveAbility: string; damageDice?: string; damageType?: string; halfOnSave: boolean; areaOfEffect?: { type: 'cone'|'cube'|'cylinder'|'emanation'|'line'|'sphere'; size: number; originX: number; originY: number; direction?: number }; rechargeName?: string; conditionRiders?: string[] }
     | { kind: 'note'; text: string }
   export interface MonsterTurnPlan {
     actorTokenId: string
     actorLabel: string
     intTier: IntTier
     targetTokenId: string | null
     retreating: boolean
     steps: MonsterTurnStep[]
     rationale: string[]                      // human-readable, used verbatim by /suggestturn
   }
   ```
2. `export function intTier(int: number): IntTier` — thresholds exactly per F10: ≤3 mindless, 4-7 low, 8-11 average, 12-15 clever, ≥16 genius.
3. Scoring helpers (export for tests): `averageRoll(formula: string): number` (mean of `NdS+M`; reuse the regex conventions of `dice-helpers.ts` but compute expectation, don't roll), `hitProbability(toHit: number, ac: number): number` = `clamp((21 + toHit - ac) / 20, 0.05, 0.95)`, `expectedDamage(action: MonsterAction, targetAc: number): number` = `hitProbability × (averageRoll(damageDice) + averageRoll(additionalDamageDicePart ?? '0'))`, `chebyshevFt(a, b)` = `Math.max(|dx|,|dy|) * 5` (F5).
4. **Hostile-target enumeration:** hostiles = tokens with `entityType === 'player'` plus tokens whose `ownerEntityId` belongs to a player token (companions); skip `currentHP === 0` and skip targets with `calculateCover(actor, t, walls, cellSize, tokens) === 'total'` (mookAI skips downed targets; PHB total cover is untargetable). Import `calculateCover` from `./cover-calculator`. Pass `cellSize` through the context if needed by cover (add `cellSize: number` to `MonsterTurnContext`).
5. **Target selection by tier** (encode F10 + the Ammann/BattleCast heuristics from Research notes):
   - mindless → nearest by **path** distance (`findPath` with generous budget; fall back to Chebyshev when unreachable).
   - low → lowest HP% among hostiles within reach this turn, else nearest.
   - average → prefer hostiles with `turnStates[entityId].concentratingSpell` set; tie-break lowest HP%, then nearest.
   - clever/genius → priority: concentrating > lowest HP% > lowest effective AC (`getTokenStats` is store-bound, so the **caller** pre-resolves AC/maxHP into the context tokens — document that `MapToken.ac/maxHP` must be pre-hydrated by the caller; the executor service does this in 30B) — and avoid switching targets unless the new candidate is much closer or current target is nearly dead (hysteresis per BattleCast).
6. **Recharge / save-action choice:** an action is *ready* when (a) `initiativeEntry.rechargeAbilities` has a matching entry with `available: true`, or (b) there is no entry data and the action has `recharge` (PHASE-08-pre fallback: assume ready round 1, never afterwards — deterministic and conservative), or (c) the action has `saveDC` and no `recharge` (at-will). Use a ready AoE save-action when `countTargetsInAoE` over hostiles ≥ 2 (≥ 3 for single-target-rich tiers per F10 — make the threshold 2 for genius, 3 otherwise) AND friendly-fire count is 0 for tiers ≥ low (mindless ignores friendly fire, per `combat-tactics.ts:20`). AoE placement: spheres centered on the hostile-pair midpoint maximizing `countTargetsInAoE`; cones/lines originate at the actor with `direction = atan2` toward the hostile centroid (degrees, 0 = +x, 90 = +y — matches `AoEDefinition.direction`, `aoe-targeting.ts:23`).
7. **Attack-plan assembly:** if a `Multiattack` action with `multiattackActions` exists, expand each referenced name (case-insensitive match against `statBlock.actions[].name`) into one `attack` step each, all against the chosen target (clever+ may split between two adjacent hostiles when the primary would be downed by the first expected hit — keep simple: split only when `expectedDamage ≥ target.currentHP`). Otherwise pick the single attack with max `expectedDamage` among those usable from final position (melee `reach ?? 5` vs ranged `rangeNormal`).
8. **Movement:** melee plan = `findPath` from actor to the nearest cell adjacent to the target (iterate the 8 neighbors, take cheapest reachable), budget = `movementRemaining` from `turnStates` (fall back to `statBlock.speed.walk ?? 30`). If unreachable within budget but reachable within budget ×2 → `stance: dash` + move (no attack unless a bonus-action attack exists). Ranged plan = hold position when within `rangeNormal` and no hostile adjacent; when a hostile is adjacent, step away to the nearest cell ≥ 10 ft from all hostiles (ranged-adjacent disadvantage, PHB 2024) unless the creature also has a melee action with higher expected damage. Ranged keep-away: prefer final cells ≥ 30 ft from the nearest melee hostile (F10).
9. **Retreat:** when `actor.currentHP / maxHP ≤ threshold` (tier: mindless never; low/average 0.25; clever 0.33; genius 0.50 — F10) and creature type is not Undead/Construct (`statBlock.type`), plan `stance: disengage` (use a bonus action when a bonus action's description contains "Disengage" — e.g. goblin Nimble Escape — so the action is kept; mark `viaBonusAction: true`) then move to the reachable cell maximizing min-distance from hostiles (`getReachableCellsWithWalls`), and add a `note` step "retreating (HP ≤ N%)".
10. **`planMonsterTurn(ctx): MonsterTurnPlan`** — orchestrates 4-9; every decision appends a one-line `rationale` entry ("Target: Aria (concentrating on Bless)", "Multiattack: 2× Scimitar", "Path 15 ft via (12,8)→(13,8)→(14,9)", "Breath Weapon ready, 3 targets in 15-ft cone, 0 allies"). Returns a plan with `steps: []` + a `note` when the actor has no usable actions (`utility`-only stat blocks).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/services/combat/monster-turn-planner.test.ts`.

**Acceptance (30A):**
- Planner module has zero imports from `stores/` (verify: `grep -n "stores/" dnd-app/src/renderer/src/services/combat/monster-turn-planner.ts` → empty).
- Tests cover: each INT tier's target choice; multiattack expansion (goblin-boss-style 2-action list); recharge AoE gating incl. friendly-fire veto; dash-when-unreachable; ranged step-away; retreat thresholds incl. Undead never-retreat; no-action stat block → note-only plan. Use hand-built `MonsterStatBlock`/`MapToken` fixtures (pattern: `combat-resolver.test.ts`).

### 30B — Monster-turn executor (applies a plan through the stores)

**Objective:** execute a `MonsterTurnPlan` with real dice against the live game store, posting an auditable mechanical summary — the runtime twin of `executeOpportunityAttack` generalized to a full turn.

**Files:**
- NEW `src/renderer/src/services/combat/monster-turn-executor.ts`
- NEW `src/renderer/src/services/combat/monster-turn-executor.test.ts`

**Steps:**
1. `export interface MonsterTurnRunResult { summaryLines: string[]; attacksResolved: number; damageDealt: number; turnAdvanced: boolean }`.
2. `export function buildMonsterTurnContext(entityLabelOrId: string, stores: StoreAccessors): MonsterTurnContext | { error: string }` — resolve token via `resolveTokenByLabel` (`name-resolver.ts:9`) on the active map; stat block via `lookupTokenStatBlock(token.monsterStatBlockId)` (F3) — error `"No stat block linked to <label>"` when missing; pre-hydrate each context token's `ac`/`maxHP`/`currentHP` via `getTokenStats` (per 30A step 5 contract); pull `walls`/`terrain`/grid dims/cellSize from the active map, `turnStates`/`initiative`/`flankingEnabled`/`diagonalRule` from the game store.
3. `export function executeMonsterTurnPlan(plan: MonsterTurnPlan, stores: StoreAccessors, opts?: { autoAdvance?: boolean }): MonsterTurnRunResult` — per step kind:
   - `move`: `gameStore.moveToken(mapId, token.id, lastCell.x, lastCell.y)` + `sendMessage('dm:token-move', { tokenId, gridX, gridY })` (mirror `token-actions.ts:71-91`, including the `map:token-moved` plugin emit) + `gameStore.useMovement(entityId, costFt)`.
   - `stance`: `setDashing`/`setDisengaging`/`setDodging`; when `viaBonusAction`, call `useBonusAction` instead of letting `setDisengaging` burn the action — note: `setDisengaging` sets `actionUsed: true` (`initiative-slice.ts:561-572`), so for `viaBonusAction` set the flag via `useBonusAction(entityId)` + post a note instead of calling `setDisengaging` (record the limitation in a code comment; the disengage effect is narrative for monsters since opportunity attacks vs monsters are DM/AI-adjudicated).
   - `attack`: replicate F6 mechanics exactly (d20 via `rollDiceFormula`, nat-20 crit doubles dice not modifier, nat-1 auto-miss, AC via pre-hydrated token stats, `updateToken` HP clamp, `checkConcentrationOnDamage` + `getCreatureSaveMod(target,'con')` when the target concentrates) but do NOT spend the reaction; parse the leading dice formula out of `additionalDamage` (e.g. `"1d4 Slashing"`) and add it on hit. Append a `logCombatEntry({ type:'attack', … })` (`combat-log.ts:14`) per attack. On a target reaching 0 HP: post "drops to 0 HP" in the summary; for `entityType==='player'` do nothing else (death-save machinery reacts via the existing `game:death-save-needed` emit on their turn, `initiative-slice.ts:186-198`).
   - `save-action` with `areaOfEffect`: delegate to the existing `executeApplyAreaEffect` (`creature-conditions.ts`, registered at `game-action-executor.ts:468`) by constructing its `DmAction` payload (`shape`, `originX/Y`, `radiusOrLength: size`, `damageFormula`, `damageType`, `saveType: saveAbility`, `saveDC`, `halfOnSave`) — single source of truth for AoE saves. Single-target `save-action`: roll `1d20 + getCreatureSaveMod(target, saveAbility)` vs DC, apply full/half damage, apply `conditionRiders` (from `extractConditionsFromDescription`, F9) on failure via `gameStore.addCondition` with `duration: 'permanent'` and `source: actionName`.
   - recharge bookkeeping: when a step carries `rechargeName`, flip the matching `initiativeEntry.rechargeAbilities` entry to `available: false` via `updateInitiativeEntry` (create the entry record if absent — mirror `executeRechargeRoll` `creature-initiative.ts:242-249`).
   - after steps: `gameStore.useAction(actorEntityId)`; broadcast via `broadcastTokenSync(mapId, stores)` + `broadcastInitiativeSync(stores)` (`broadcast-helpers.ts:7,17`).
4. Consolidated summary: one chat message via `postDmMessage(stores, 'mt', lines.join('\n'), true)` (`broadcast-helpers.ts:41`), first line `⚔️ [Monster Turn] <label> — <tier> tactics`, then one line per resolved step (same формат style as F6's line: `d20(14)+4=18 vs AC 16 → HIT — 6 slashing (HP 11)`). Plain professional strings; no i18n needed for dice math lines (matches existing executor convention — `combat-economy-actions.ts:221-232` is not localized).
5. `opts.autoAdvance === true` → finish by invoking the live next-turn executor `executeNextTurn({action:'next_turn'}, gameStore, activeMap, stores)` from `creature-initiative.ts:76` (keeps the recharge auto-roll + legendary reset semantics); default leaves the turn open for the DM.
6. `export function runMonsterTurn(entityLabel: string, stores: StoreAccessors, opts?): MonsterTurnRunResult | { error: string }` — context → `planMonsterTurn` → `executeMonsterTurnPlan` convenience wrapper (the single entry point 30C/30D/30E call).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/services/combat/monster-turn-executor.test.ts`.

**Acceptance (30B):**
- Executor test drives a seeded scenario (goblin-warrior fixture vs two PC tokens) through real stores (pattern: `services/game-action-executor.test.ts` builds stores via `register-stores`) and asserts: HP reduced within rolled bounds, action marked used, movement spent, summary posted to lobby chat, `turnAdvanced` false by default and true with `autoAdvance`.
- A token without `monsterStatBlockId` returns `{ error }` and mutates nothing.

### 30C — `run_monster_turn` DM action (AI delegation path)

**Objective:** let the AI DM delegate a monster's whole turn to the engine instead of hand-rolling mechanics — flowing through the existing approval gate.

**Files:**
- `src/renderer/src/services/game-action-executor.ts` (one switch case + import)
- NEW `src/renderer/src/services/game-actions/monster-automation-actions.ts` (+ NEW colocated `.test.ts`)
- `src/main/ai/dm-actions.ts` (union member)
- `src/main/ai/ai-schemas.ts` (schema + registry entry)
- `src/main/ai/prompt-sections/dm-actions-schema.ts` (doc line)
- `src/main/ai/prompt-sections/combat-tactics.ts` (delegation + narrate-only paragraph)
- `src/renderer/src/components/game/overlays/MutationApprovalPanel.tsx` (label for the new type — coordinate with PHASE-04)

**Steps:**
1. `monster-automation-actions.ts`: `export function executeRunMonsterTurn(action: DmAction, gameStore: GameStoreSnapshot, activeMap: ActiveMap, stores: StoreAccessors): boolean` — guards: initiative running (`throw new Error('No initiative running')`), active map present; calls `runMonsterTurn(action.entityLabel as string, stores)`; `{ error }` → throw (lands in `ExecutionResult.failed`, which the AI sees — same contract as every executor). Keep this file as the home for ALL automation executors (NOT `creature-actions.ts`, per PHASE-08 note).
2. `game-action-executor.ts`: add `case 'run_monster_turn': return executeRunMonsterTurn(action, gameStore, activeMap, stores)` in the Initiative section of the switch (after `:276 remove_from_initiative`); import from the new module.
3. `dm-actions.ts` (main): add `| { action: 'run_monster_turn'; entityLabel: string; reason?: string }` to the combat-economy block (`:140-158` area).
4. `ai-schemas.ts`: `const RunMonsterTurnSchema = z.object({ action: z.literal('run_monster_turn'), entityLabel: z.string(), reason: z.string().optional() })` next to `OpportunityAttackSchema` (`:644`); register `run_monster_turn: RunMonsterTurnSchema` in `DM_ACTION_SCHEMAS` (`:1276+`).
5. `dm-actions-schema.ts`: add under the combat-economy list (near `:104`):
   `- \`run_monster_turn\`: {entityLabel, reason?} — resolve the named enemy's ENTIRE turn deterministically (targeting, movement, attacks, recharge abilities, action economy). Results post as a "[Monster Turn]" summary you will see next turn. STRONGLY prefer this over hand-rolling attacks for any creature whose token line shows \`creature:<id>\`; after emitting it, do not also roll or apply damage for that creature this turn.`
6. `combat-tactics.ts`: append a short section "Engine-resolved turns": when a `[Monster Turn]` or `[RESOLVED COMBAT TURN]` summary appears in the conversation, those mechanics are final — narrate them, never re-roll, never emit duplicate `STAT_CHANGES`/`DM_ACTIONS` for them.
7. `MutationApprovalPanel.tsx`: add a human label for `run_monster_turn` ("Run monster turn (engine)") wherever the panel maps action types to labels (merge with PHASE-04's labeling work if already landed).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json`; `npx vitest run src/renderer/src/services/game-actions/monster-automation-actions.test.ts src/main/ai/ai-schemas.test.ts`.

**Acceptance (30C):**
- `executeDmActions([{action:'run_monster_turn', entityLabel:'Goblin 1'}])` with approval mode OFF runs a turn end-to-end in the test; with `dmApprovalRequired` ON it lands in `pendingActions` (assert via `useAiDmStore`).
- `parseDmActions`-produced payload validates through `DM_ACTION_SCHEMAS.run_monster_turn`.
- Unknown-label and no-initiative cases surface as `failed[]` reasons, not throws to the caller.

### 30D — DM-facing suggestion + manual run (UI, chat commands, config plumbing)

**Objective:** the human-DM surface — "Suggest turn" (plan-only, private) and "Run turn" (execute) — plus the persisted `monsterAutomation` config object that later sub-phases gate on. All additive; nothing changes for users who never click.

**Files:**
- NEW `src/renderer/src/services/chat-commands/commands-dm-automation.ts` (+ NEW colocated `.test.ts`)
- `src/renderer/src/services/chat-commands/index.ts` (import + spread into `allCommands`)
- `src/renderer/src/components/game/dm/InitiativeTracker.tsx` (two buttons + config rows)
- `src/renderer/src/stores/game/types.ts`, NEW `src/renderer/src/stores/game/automation-slice.ts` (+ NEW `.test.ts`), `src/renderer/src/stores/game/index.ts`
- `src/renderer/src/types/campaign.ts` (SavedGameState field)
- `src/renderer/src/services/io/game-state-saver.ts`

**Steps:**
1. Config type (in `stores/game/types.ts`):
   ```ts
   export interface MonsterAutomationConfig {
     autoRun: boolean            // auto-run enemy turns on turn start (30E)
     autoRunMaxInt: number       // only auto-run creatures with INT ≤ this (default 7, mook tier)
     autoAdvance: boolean        // auto-run also advances to the next turn
     flavorNarration: boolean    // send resolved turns to the AI DM for narration (30E)
   }
   ```
   Slice state `monsterAutomation: MonsterAutomationConfig | null` (null = fully disabled, the default) + `setMonsterAutomation(config | null)` in `automation-slice.ts`; register in the store composition in `stores/game/index.ts` exactly like `timer-slice` (state default `null` in the reset object near `:104`); add to `loadGameState` destructure + conditional spread (`:140,159,179` pattern); add `monsterAutomation?: MonsterAutomationConfig` to `SavedGameState` (`types/campaign.ts:256-280`) and write it in `buildSavableCampaign` (`game-state-saver.ts:11-32`).
2. `commands-dm-automation.ts` — two commands (`category: 'dm'`, `dmOnly: true`):
   - `/suggestturn [creature]` (aliases `[]`): default to the current initiative entry when no arg; build context + `planMonsterTurn`; return the plan's `rationale` + step list as a **local-only** message (use `postDmMessage(stores, 'mt-suggest', text, /*broadcast*/ false)` so players never see it). Errors ("not in initiative", "no stat block") returned as command error text.
   - `/monsterturn [creature]` (aliases `['runturn']`): same resolution, then `runMonsterTurn(label, stores)`; summary already posts via 30B.
   Register both in `index.ts` (`:72-135`) as `...dmAutomationCommands` next to `dmCombatCommands`.
3. `InitiativeTracker.tsx`: when `isHost` && the ACTIVE entry has `entityType === 'enemy'` && its token (match `tokens` prop by `entityId`) has `monsterStatBlockId`, render two small buttons beside the turn controls: "Suggest" → same code path as `/suggestturn`; "Run turn" → `/monsterturn` path with a `useState` busy-guard (prevent double-click double-execution). Add a "Monster automation" config row inside the existing timer-config popover area: master checkbox (creates/clears `monsterAutomation`, default object `{ autoRun: false, autoRunMaxInt: 7, autoAdvance: true, flavorNarration: false }`), plus the three sub-controls, all writing through `setMonsterAutomation`. All new strings via `t('initiative.automation.*')` keys (added in 30F; until then add the keys in the same commit — `useT` requires existing keys, so 30D and 30F's en.json additions land together in the working tree; keep key additions in this sub-phase and reserve 30F for es.json + key-union regeneration).
4. Buttons must be invisible (not merely disabled) for non-hosts and for entries without stat blocks.

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/services/chat-commands/commands-dm-automation.test.ts src/renderer/src/stores/game/automation-slice.test.ts`.

**Acceptance (30D):**
- `/suggestturn` posts a non-broadcast DM-only plan; `/monsterturn` mutates state (command tests assert both, including the no-arg current-entry default).
- `monsterAutomation` round-trips through `buildSavableCampaign` → `loadGameState` (slice test).
- With `monsterAutomation === null` nothing auto-fires anywhere (grep-level guard: every consumer null-checks).

### 30E — Opt-in auto-run on enemy turn start + opt-in LLM flavor narration

**Objective:** mookAI's "mooks take their own turns" mode and the narrate-only LLM hook — both strictly behind the 30D toggles (off by default).

**Files:**
- NEW `src/renderer/src/hooks/use-monster-auto-turn.ts` (+ NEW colocated `.test.ts`)
- `src/renderer/src/components/game/GameLayout.tsx` (mount the hook, one line near `:503`)
- `src/renderer/src/services/combat/monster-turn-executor.ts` (flavor dispatch at end of `runMonsterTurn`)

**Steps:**
1. `useMonsterAutoTurn()`: subscribe to `pluginEventBus.on('game:turn-start', …)` in a `useEffect` (unsubscribe on cleanup; F11 confirmed no competing subscriber). Guards, in order: `monsterAutomation?.autoRun` truthy; this client is the authority (`useNetworkStore` role `'host'` or solo `'none'` with DM rights — reuse the `isHost`/`isDM` props pattern of `GameLayout`); game not paused (`isPaused`); entry `entityType === 'enemy'`; token has `monsterStatBlockId`; stat block `abilityScores.int ≤ autoRunMaxInt`; re-entrancy ref `lastRun = `${entityId}:${round}`` to fire once per entity-turn. Then `setTimeout(≈800 ms)` (lets the turn-change UI settle, mirrors mookAI's visible cadence) → `runMonsterTurn(label, stores, { autoAdvance: monsterAutomation.autoAdvance })`. Wrap in try/catch + `logger.warn` — an automation failure must never break turn advancement.
2. Mount `useMonsterAutoTurn()` in `GameLayout` beside `useGameEffects` (`:503`).
3. Flavor narration (in `runMonsterTurn`, after the summary posts): when `flavorNarration` enabled AND the campaign's AI DM is enabled (read the active campaign via `getActiveCampaignId()` + campaign store) AND `useAiDmStore.getState().enabled` — call `sendMessage(campaignId, content, characterIds)` where `content` is:
   ```
   [RESOLVED COMBAT TURN]
   <the same summary lines>
   [/RESOLVED COMBAT TURN]
   Narrate this resolved combat turn in 2-4 vivid sentences. Every number above is final: do not roll dice, do not emit [STAT_CHANGES] or [DM_ACTIONS] for anything already resolved.
   ```
   `characterIds` from the lobby/campaign roster exactly as `routePlayerMessageToAiDm` builds them (`ai-dm-routing.ts:119-140`) — extract/reuse `buildPlayerRoster` rather than duplicating. Fire-and-forget (`void`), guarded so a failed AI call only logs. The 30C `combat-tactics.ts` paragraph already teaches the model the narrate-only contract.
4. Auto-run + flavor interaction: when both are on and `autoAdvance` is true, send the flavor request BEFORE advancing the turn so the narration references the correct actor (ordering inside `runMonsterTurn`: summary → flavor → optional advance).

**Cheap checks:** `npx tsc --noEmit -p tsconfig.web.json`; `npx vitest run src/renderer/src/hooks/use-monster-auto-turn.test.ts`.

**Acceptance (30E):**
- Hook test: with config off → no execution on `game:turn-start`; with on + INT 8 goblin-boss vs `autoRunMaxInt 7` → skipped; with on + INT 8 ≤ `autoRunMaxInt 10` → executes once (fake timers for the 800 ms delay), and a second identical event in the same round is ignored.
- Flavor test (executor test extension): with `flavorNarration` on and a mocked `useAiDmStore.sendMessage`, the call receives a `[RESOLVED COMBAT TURN]` payload; with the AI DM disabled it is never called.
- Player clients never auto-run (role guard test).

### 30F — i18n completion, docs, and hardening sweep

**Objective:** locale parity, key-union regeneration, and the final consistency pass before the phase gate.

**Files:**
- `src/renderer/src/i18n/locales/en.json`, `src/renderer/src/i18n/locales/es.json`
- `src/renderer/src/i18n/generated-keys.ts` (generated)
- `docs/` — none beyond this plan's Completed section

**Steps:**
1. Ensure every 30D UI string exists under `initiative.automation.*` in `en.json` (suggest, runTurn, configTitle, autoRun, autoRunMaxInt, autoAdvance, flavorNarration, busy) and add the Spanish translations in `es.json` (professional translations, consistent with existing combat terminology in that file).
2. Regenerate the key union: `cd dnd-app && npm run i18n:gen-keys` (package.json:34) and commit the regenerated `generated-keys.ts`.
3. Sweep: confirm no `biome-ignore` was introduced without reason text; confirm no new file imports from `creature-actions.ts`; confirm `monsterAutomation === null` paths short-circuit in tracker UI, commands (clear errors), hook, and executor flavor branch.
4. Update this plan's `## Completed` section per INSTRUCTIONS.md rule 17, then run the end-of-phase 4-gate (see Test plan).

**Cheap checks:** `node -e "const en=require('./dnd-app/src/renderer/src/i18n/locales/en.json'),es=require('./dnd-app/src/renderer/src/i18n/locales/es.json');..."` spot-check key parity; `npx tsc --noEmit -p tsconfig.web.json`.

**Acceptance (30F):** both locales carry the full key set; `generated-keys.ts` regenerated; 4-gate green.

## Research notes

- **mookAI (Foundry VTT)** — the closest prior art for deterministic monster turns: per-turn flow is *check vision → pick target → plan collision-free path → move into range → attack → end turn*, looping to react to battlefield changes; explicitly scoped to "low-intelligence, low-utility, high-quantity enemies"; offers an opt-in setting to auto-take turns for low-level enemies; targeting offers proximity-based, health-based, and random frameworks; skips targets at 0 HP; tries ranged attacks when no melee path exists; known limitation — no per-actor behavior customization and no hostile/friendly differentiation (our planner improves on both via INT tiers and entityType). Sources: https://foundryvtt.com/packages/mookAI-12 , https://github.com/dwonderley/mookAI/
- **AI Combat Assistant (PF2e, Foundry)** — the suggestion-assistant prior art: sends full combat state to an LLM and returns a recommended action with rationale; the GM executes manually then confirms/skips. Notable operational caveats: needs a ~7-8k-token context window and local-LLM setups with 4k defaults break it — a strong argument for our **deterministic** suggester (zero tokens, instant, works offline); the LLM is reserved for narration only. Source: https://github.com/AI-DM-Foundry/AI-Combat-Assistant-Pf2e
- **Keith Ammann, "The Monsters Know What They're Doing" methodology** — the tier policy's pedigree: monsters flee at ≤ 40% HP by default (we keep the in-repo prompt's 25/33/50% tiers to stay consistent with what the model is told); INT ≤ 7 = one preferred pattern, INT 8-11 = adjusts when failing, INT 12+ = picks among options, INT 14+ = targets weaknesses; WIS drives target discrimination; ability-saves preferred over attack rolls when available. Source: https://www.themonstersknow.com/why-these-tactics/
- **BattleCast combat simulator** — validates the pure-heuristic approach at scale ("~2,700 lines of heuristic logic, no LLM in the loop"): INT-scaled targeting (high INT = lowest-HP% focus with target-switch hysteresis; average = weakest-if-reachable else nearest; low = nearest), breath weapons only when ≥ 2 enemies in the cone, retreat only for INT-mod ≥ 0 creatures, all movement through one collision-checked move function — each of these is mirrored in 30A. Source: https://e4developer.com/posts/how-i-built-a-dnd-combat-simulator/
- **Simpler open-source simulators** (matteoferla/DnD-battler: "target weakest alive" global strategy) show single-heuristic targeting is playable but flat; tiering by INT is the differentiator worth the extra logic. Source: https://github.com/matteoferla/DnD-battler
- **Alternatives considered:** (a) LLM-planned turns with engine execution (PF2e-assistant style) — rejected for the core path: latency + context cost + hallucinated action economy; kept only as narration. (b) Implementing attacks through `combat-resolver.AttackRequest` — rejected: verified that no function consumes `AttackRequest` today (`grep -rn "AttackRequest" dnd-app/src --include="*.ts" | grep -v combat-resolver` → empty); the live precedents are `attack-resolver.resolveAttack` (PC/character-shaped) and `executeOpportunityAttack` (token+formula-shaped) — the latter matches monster data shape exactly. (c) Auto-running ALL enemies regardless of INT — rejected; mookAI's scoping and the audit both reserve automation for mook-tier creatures by default (`autoRunMaxInt` keeps it configurable).

## Test plan

- **30A** `monster-turn-planner.test.ts` — tier policy, targeting, multiattack expansion, AoE gating/placement, movement/dash/ranged-step-away, retreat (incl. Undead/Construct exception), no-action plans. Pure fixtures, no stores.
- **30B** `monster-turn-executor.test.ts` — end-to-end plan execution against real zustand stores (seeded RNG not required; assert bounds and state transitions), error paths, `autoAdvance` semantics, summary posting.
- **30C** `monster-automation-actions.test.ts` — executor wiring incl. approval-gate queueing; extend `ai-schemas.test.ts` with `run_monster_turn` validation; extend `dm-actions.test.ts` only if it enumerates the union (check first).
- **30D** `commands-dm-automation.test.ts` — both commands, defaults, dmOnly, non-broadcast suggestion; `automation-slice.test.ts` — defaults, setter, save/load round-trip via `buildSavableCampaign`/`loadGameState`.
- **30E** `use-monster-auto-turn.test.ts` — gating matrix (toggle, role, INT cap, pause, re-entrancy) with fake timers; flavor-dispatch assertions in the executor test.
- **End-of-phase 4-gate** (INSTRUCTIONS.md rule 5): `cd dnd-app && npm run lint && npx tsc --noEmit -p tsconfig.web.json && npx tsc --noEmit -p tsconfig.node.json && npx vitest run`. No Pi code touched → no pytest.

## Acceptance criteria

1. A DM (or solo player with DM rights) can click "Suggest" on an enemy's turn and receive a private, deterministic, rationale-annotated turn plan; clicking "Run turn" (or `/monsterturn`) executes it with real dice, correct action-economy bookkeeping, a broadcast mechanical summary, and combat-log entries — with zero LLM involvement.
2. The AI DM can emit `run_monster_turn` and the engine resolves the turn; the action validates through the zod registry, respects the approval gate, and the prompt instructs the model to prefer delegation and to treat resolved summaries as final.
3. With `monsterAutomation.autoRun` enabled (default OFF), enemy creatures at or below the configured INT cap take their turns automatically on turn start, exactly once, host-side only; with `flavorNarration` enabled (default OFF) and an AI-DM campaign, each resolved turn produces a narrate-only AI request.
4. All defaults preserve current behavior: fresh and existing campaigns have `monsterAutomation === null`; no automation fires; the only visible change is two host-only buttons on stat-block-backed enemy turns and two new DM commands.
5. Planner heuristics demonstrably follow the documented tier policy (tests are the spec); recharge abilities are consumed and tracked; multiattack expands per stat-block data.
6. 4-gate green; `en.json`/`es.json` parity; no new imports from `creature-actions.ts`; plan moved to `completed/` with the phase commit.

## Out of scope

- Legendary-action spending between turns and lair-action automation — the engine runs the creature's OWN turn only; reaction/legendary automation is a future follow-on (note in backlog if demanded; PHASE-08 owns legendary/recharge *enrichment* correctness).
- Monster spellcasting beyond stat-block `actions` (the `spellcasting` block with slots/spell lists) — planner treats `spellAction`/`utility` actions as unusable; full spell AI is not attempted here.
- Text-to-battlemap generation and encounter placement — PHASE-34.
- Director/oracle-driven encounter pacing — PHASE-28.
- Structured-output extraction of actions from prose — PHASE-23.
- PC-side automation or advice for players — deliberately DM-only.
- Stat-mutation pipeline fixes (`creature_damage` validation, NaN guards) — PHASE-02.
- Duplicate-executor deletion and initiative-enrichment wiring — PHASE-08.

## Completed

(filled during execution per INSTRUCTIONS.md rule 17)
