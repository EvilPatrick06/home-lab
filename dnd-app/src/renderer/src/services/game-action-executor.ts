/**
 * DM Action Executor — orchestrator that dispatches AI DM actions to sub-modules.
 * Resolves entity names to IDs and validates grid coordinates.
 */

import { getGameStore, getLobbyStore, getNetworkStore } from '../stores/store-accessors'
import { logger } from '../utils/logger'
import type { ActiveMap, DmAction, ExecutionResult, GameStoreSnapshot, StoreAccessors } from './game-actions/types'
import { pluginEventBus } from './plugin-system/event-bus'

export { filterValidActions, validateActionsAgainstState } from './game-actions/action-validator'
// Re-export types for external consumers
export type { DmAction, ExecutionFailure, ExecutionResult, GameStoreSnapshot } from './game-actions/types'

const stores: StoreAccessors = { getGameStore, getLobbyStore, getNetworkStore }

// ── Creature / Combat Actions ──
import {
  executeAwardXp,
  executeLoadEncounter,
  executeLongRest,
  executeSetNpcAttitude,
  executeShortRest,
  executeTriggerLevelUp
} from './game-actions/creature-actions'
// ── Entity Conditions & Area Effects ──
import {
  executeAddEntityCondition,
  executeApplyAreaEffect,
  executeRemoveEntityCondition
} from './game-actions/creature-conditions'
// ── Initiative & Legendary Actions ──
import {
  executeAddToInitiative,
  executeEndInitiative,
  executeNextTurn,
  executeRechargeRoll,
  executeRemoveFromInitiative,
  executeStartInitiative,
  executeUseLegendaryAction,
  executeUseLegendaryResistance
} from './game-actions/creature-initiative'
// ── Effect / State Actions ──
import {
  executeAddJournalEntry,
  executeAddShopItem,
  executeAddSidebarEntry,
  executeAdvanceTime,
  executeBastionAddCreature,
  executeBastionAdvanceTime,
  executeBastionDepositGold,
  executeBastionIssueOrder,
  executeBastionRecruit,
  executeBastionResolveEvent,
  executeBastionWithdrawGold,
  executeCloseShop,
  executeHiddenDiceRoll,
  executeLogNpcInteraction,
  executeOpenShop,
  executeRemoveShopItem,
  executeRemoveSidebarEntry,
  executeSetNpcRelationship,
  executeSetTime,
  executeShareHandout,
  executeShareTime,
  executeStartTimer,
  executeStopTimer,
  executeSwitchMap,
  executeSystemMessage,
  executeWhisperPlayer
} from './game-actions/effect-actions'
// ── State Snapshot ──
import { buildGameStateSnapshot as _buildSnapshot } from './game-actions/state-snapshot'
// ── Token Actions ──
import {
  executeMoveToken,
  executePlaceCreature,
  executePlaceToken,
  executeRemoveToken,
  executeUpdateToken
} from './game-actions/token-actions'
// ── Visibility / Environment Actions ──
import {
  executeClearWeather,
  executeExtinguishSource,
  executeHideFog,
  executeLightSource,
  executePlayAmbient,
  executeRevealFog,
  executeSetAmbientLight,
  executeSetMoon,
  executeSetTravelPace,
  executeSetUnderwaterCombat,
  executeSetWeather,
  executeSoundEffect,
  executeStopAmbient
} from './game-actions/visibility-actions'

const MAX_ACTIONS_PER_BATCH = 50

// ── Plugin action handlers (only accept 'plugin:*' prefixed types) ──

type PluginActionHandler = (action: DmAction, gameStore: GameStoreSnapshot, activeMap: ActiveMap) => boolean
const pluginActionHandlers = new Map<string, PluginActionHandler>()

export function registerPluginDmAction(actionType: string, handler: PluginActionHandler): void {
  if (!actionType.startsWith('plugin:')) {
    throw new Error(`Plugin action types must be prefixed with 'plugin:' — got '${actionType}'`)
  }
  pluginActionHandlers.set(actionType, handler)
}

export function unregisterPluginDmAction(actionType: string): void {
  pluginActionHandlers.delete(actionType)
}

// ── Main Executor ──

/**
 * Execute DM actions. If DM approval is required (useAiDmStore.dmApprovalRequired),
 * actions are queued as pendingActions instead of executing immediately.
 * Pass `bypassApproval: true` to force execution (used when DM approves pending actions).
 */
import { getAiDmStore } from '../stores/store-accessors'
import { filterValidActions } from './game-actions/action-validator'

export function executeDmActions(actions: DmAction[], bypassApproval = false): ExecutionResult {
  if (!bypassApproval) {
    const aiStore = getAiDmStore().getState()
    if (aiStore.dmApprovalRequired && actions.length > 0) {
      aiStore.setPendingActions({
        id: crypto.randomUUID(),
        text: actions.map((a) => `${a.action}: ${JSON.stringify(a)}`).join('\n'),
        actions,
        statChanges: []
      })
      return { executed: [], failed: [] }
    }
  }

  const result: ExecutionResult = { executed: [], failed: [] }

  if (actions.length > MAX_ACTIONS_PER_BATCH) {
    logger.warn(`AI DM: action batch exceeded ${MAX_ACTIONS_PER_BATCH} limit (got ${actions.length}); truncating.`)
    actions = actions.slice(0, MAX_ACTIONS_PER_BATCH)
  }

  const gameStore = getGameStore().getState()
  const activeMap = gameStore.maps.find((m) => m.id === gameStore.activeMapId)

  // Pre-execution validation: reject actions that are physically impossible
  const { valid: validatedActions, rejected } = filterValidActions(actions, gameStore, activeMap)
  for (const r of rejected) {
    result.failed.push({ action: r.action, reason: r.reason ?? 'Failed game-state validation' })
  }

  for (const action of validatedActions) {
    try {
      // Emit before-action hook
      if (pluginEventBus.hasSubscribers('dm:before-action')) {
        pluginEventBus.emit('dm:before-action', { action: action.action, payload: action })
      }

      const success = executeOne(action, gameStore, activeMap)
      if (success) {
        result.executed.push(action)

        // Emit after-action hook
        if (pluginEventBus.hasSubscribers('dm:after-action')) {
          pluginEventBus.emit('dm:after-action', { action: action.action, payload: action, success: true })
        }
      } else {
        result.failed.push({ action, reason: 'Action returned false' })
      }
    } catch (err) {
      result.failed.push({
        action,
        reason: err instanceof Error ? err.message : String(err)
      })
    }
  }

  return result
}

function executeOne(action: DmAction, gameStore: GameStoreSnapshot, activeMap: ActiveMap): boolean {
  switch (action.action) {
    // ── Token Management ──
    case 'place_token':
      return executePlaceToken(action, gameStore, activeMap, stores)
    case 'move_token':
      return executeMoveToken(action, gameStore, activeMap, stores)
    case 'remove_token':
      return executeRemoveToken(action, gameStore, activeMap, stores)
    case 'update_token':
      return executeUpdateToken(action, gameStore, activeMap, stores)
    case 'place_creature':
      return executePlaceCreature(action, gameStore, activeMap, stores)

    // ── Initiative ──
    case 'start_initiative':
      return executeStartInitiative(action, gameStore, activeMap, stores)
    case 'add_to_initiative':
      return executeAddToInitiative(action, gameStore, activeMap, stores)
    case 'next_turn':
      return executeNextTurn(action, gameStore, activeMap, stores)
    case 'end_initiative':
      return executeEndInitiative(action, gameStore, activeMap, stores)
    case 'remove_from_initiative':
      return executeRemoveFromInitiative(action, gameStore, activeMap, stores)

    // ── Fog of War ──
    case 'reveal_fog':
      return executeRevealFog(action, gameStore, activeMap, stores)
    case 'hide_fog':
      return executeHideFog(action, gameStore, activeMap, stores)

    // ── Environment ──
    case 'set_ambient_light':
      return executeSetAmbientLight(action, gameStore)
    case 'set_underwater_combat':
      return executeSetUnderwaterCombat(action, gameStore)
    case 'set_travel_pace':
      return executeSetTravelPace(action, gameStore)

    // ── Shop ──
    case 'open_shop':
      return executeOpenShop(action, gameStore, activeMap, stores)
    case 'close_shop':
      return executeCloseShop(action, gameStore, activeMap, stores)
    case 'add_shop_item':
      return executeAddShopItem(action, gameStore)
    case 'remove_shop_item':
      return executeRemoveShopItem(action, gameStore, activeMap, stores)

    // ── Map ──
    case 'switch_map':
      return executeSwitchMap(action, gameStore, activeMap, stores)

    // ── Sidebar ──
    case 'add_sidebar_entry':
      return executeAddSidebarEntry(action, gameStore)
    case 'remove_sidebar_entry':
      return executeRemoveSidebarEntry(action, gameStore)

    // ── Timer ──
    case 'start_timer':
      return executeStartTimer(action, gameStore, activeMap, stores)
    case 'stop_timer':
      return executeStopTimer(action, gameStore, activeMap, stores)

    // ── Hidden Dice ──
    case 'hidden_dice_roll':
      return executeHiddenDiceRoll(action, gameStore)

    // ── Communication ──
    case 'whisper_player':
      return executeWhisperPlayer(action, gameStore, activeMap, stores)
    case 'system_message':
      return executeSystemMessage(action, gameStore, activeMap, stores)

    // ── Entity Conditions ──
    case 'add_entity_condition':
      return executeAddEntityCondition(action, gameStore, activeMap, stores)
    case 'remove_entity_condition':
      return executeRemoveEntityCondition(action, gameStore, activeMap, stores)

    // ── Time Management ──
    case 'advance_time':
      return executeAdvanceTime(action, gameStore, activeMap, stores)
    case 'set_time':
      return executeSetTime(action, gameStore, activeMap, stores)
    case 'share_time':
      return executeShareTime(action, gameStore, activeMap, stores)

    // ── Light Sources ──
    case 'light_source':
      return executeLightSource(action, gameStore, activeMap, stores)
    case 'extinguish_source':
      return executeExtinguishSource(action, gameStore, activeMap, stores)

    // ── Sound ──
    case 'sound_effect':
      return executeSoundEffect(action)
    case 'play_ambient':
      return executePlayAmbient(action)
    case 'stop_ambient':
      return executeStopAmbient()

    // ── Journal ──
    case 'add_journal_entry':
      return executeAddJournalEntry(action, gameStore)

    // ── Weather & Moon ──
    case 'set_weather':
      return executeSetWeather(action, gameStore)
    case 'clear_weather':
      return executeClearWeather(action, gameStore)
    case 'set_moon':
      return executeSetMoon(action, gameStore)

    // ── XP & Level-Up ──
    case 'award_xp':
      return executeAwardXp(action, gameStore, activeMap, stores)
    case 'trigger_level_up':
      return executeTriggerLevelUp(action, gameStore, activeMap, stores)

    // ── Bastion Management ──
    case 'bastion_advance_time':
      return executeBastionAdvanceTime(action)
    case 'bastion_issue_order':
      return executeBastionIssueOrder(action)
    case 'bastion_deposit_gold':
      return executeBastionDepositGold(action)
    case 'bastion_withdraw_gold':
      return executeBastionWithdrawGold(action)
    case 'bastion_resolve_event':
      return executeBastionResolveEvent(action, gameStore, activeMap, stores)
    case 'bastion_recruit':
      return executeBastionRecruit(action)
    case 'bastion_add_creature':
      return executeBastionAddCreature(action, gameStore, activeMap, stores)

    // ── Encounters ──
    case 'load_encounter':
      return executeLoadEncounter(action, gameStore, activeMap, stores)

    // ── NPC Attitude ──
    case 'set_npc_attitude':
      return executeSetNpcAttitude(action, gameStore)

    // ── NPC Relationship Tracking ──
    case 'log_npc_interaction':
      return executeLogNpcInteraction(action, gameStore)
    case 'set_npc_relationship':
      return executeSetNpcRelationship(action, gameStore)

    // ── Resting ──
    case 'short_rest':
      return executeShortRest(action, gameStore, activeMap, stores)
    case 'long_rest':
      return executeLongRest(action, gameStore, activeMap, stores)

    // ── Area Effects ──
    case 'apply_area_effect':
      return executeApplyAreaEffect(action, gameStore, activeMap, stores)

    // ── Legendary Actions & Resistances ──
    case 'use_legendary_action':
      return executeUseLegendaryAction(action, gameStore, activeMap, stores)
    case 'use_legendary_resistance':
      return executeUseLegendaryResistance(action, gameStore, activeMap, stores)

    // ── Recharge Roll ──
    case 'recharge_roll':
      return executeRechargeRoll(action, gameStore, activeMap, stores)

    // ── Handouts ──
    case 'share_handout':
      return executeShareHandout(action, gameStore, activeMap, stores)

    default: {
      // Check plugin-registered action handlers
      const pluginHandler = pluginActionHandlers.get(action.action)
      if (pluginHandler) {
        return pluginHandler(action, gameStore, activeMap)
      }
      throw new Error(`Unknown DM action: ${action.action}`)
    }
  }
}

/**
 * Build a compact text snapshot of the current game state for AI context.
 */
export function buildGameStateSnapshot(): string {
  return _buildSnapshot(stores)
}
