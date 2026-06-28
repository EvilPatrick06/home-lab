import { getCreatureSaveMod } from '../game/token-stats'
import { pluginEventBus } from '../plugin-system/event-bus'
import { broadcastConditionSync, broadcastTokenSync, postDmMessage } from './broadcast-utils'
import { findTokensInArea, rollDiceFormula } from './dice-helpers'
import { resolveTokenByLabel } from './name-resolver'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

// ── Entity Conditions ──

export function executeAddEntityCondition(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const token = resolveTokenByLabel(activeMap.tokens, action.entityLabel as string)
  if (!token) throw new Error(`Token not found: ${action.entityLabel}`)
  gameStore.addCondition({
    id: crypto.randomUUID(),
    entityId: token.entityId,
    entityName: token.label,
    condition: action.condition as string,
    value: action.value as number | undefined,
    duration: (action.duration as number | 'permanent') ?? 'permanent',
    source: (action.source as string) || 'AI DM',
    appliedRound: gameStore.round
  })
  const sendMessage = stores.getNetworkStore().getState().sendMessage
  sendMessage('dm:condition-update', {
    targetId: token.entityId,
    condition: action.condition as string,
    active: true
  })

  // A condition that makes the creature Incapacitated automatically breaks its
  // concentration (PHB) — mirror the damage-path auto-break for the condition path.
  const cond = (action.condition as string).toLowerCase()
  const breaksConcentration = ['incapacitated', 'paralyzed', 'stunned', 'petrified', 'unconscious'].includes(cond)
  if (breaksConcentration && gameStore.turnStates?.[token.entityId]?.concentratingSpell) {
    const spell = gameStore.turnStates[token.entityId].concentratingSpell
    gameStore.setConcentrating(token.entityId, undefined)
    stores
      .getLobbyStore()
      .getState()
      .addChatMessage({
        id: `ai-conc-break-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: 'ai-dm',
        senderName: 'Dungeon Master',
        content: `🧠 ${token.label} loses concentration on ${spell} (${action.condition})`,
        timestamp: Date.now(),
        isSystem: true
      })
  }

  if (pluginEventBus.hasSubscribers('entity:condition-added')) {
    pluginEventBus.emit('entity:condition-added', {
      entityId: token.entityId,
      entityName: token.label,
      condition: action.condition as string
    })
  }
  return true
}

export function executeRemoveEntityCondition(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const token = resolveTokenByLabel(activeMap.tokens, action.entityLabel as string)
  if (!token) throw new Error(`Token not found: ${action.entityLabel}`)
  const condition = gameStore.conditions.find(
    (c) => c.entityId === token.entityId && c.condition.toLowerCase() === (action.condition as string).toLowerCase()
  )
  if (!condition) throw new Error(`Condition "${action.condition}" not found on ${action.entityLabel}`)
  gameStore.removeCondition(condition.id)
  const sendMessage = stores.getNetworkStore().getState().sendMessage
  sendMessage('dm:condition-update', {
    targetId: token.entityId,
    condition: action.condition as string,
    active: false
  })

  if (pluginEventBus.hasSubscribers('entity:condition-removed')) {
    pluginEventBus.emit('entity:condition-removed', {
      entityId: token.entityId,
      entityName: token.label,
      condition: action.condition as string
    })
  }
  return true
}

// ── Area Effects ──

export function executeApplyAreaEffect(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const originX = action.originX as number
  const originY = action.originY as number
  const radius = action.radiusOrLength as number
  const shape = action.shape as string
  if (typeof originX !== 'number' || typeof originY !== 'number' || typeof radius !== 'number')
    throw new Error('Missing origin/radius for area effect')

  const radiusCells = Math.ceil(radius / 5)
  const affectedTokens = findTokensInArea(
    activeMap.tokens,
    originX,
    originY,
    radiusCells,
    shape,
    action.widthOrHeight as number | undefined,
    action.direction as number | undefined
  )

  if (affectedTokens.length === 0) return true

  const saveType = action.saveType as string | undefined
  const saveDC = action.saveDC as number | undefined
  const damageFormula = action.damageFormula as string | undefined
  const damageType = action.damageType as string | undefined
  const halfOnSave = action.halfOnSave as boolean | undefined
  const condition = action.condition as string | undefined
  const conditionDuration = action.conditionDuration as number | 'permanent' | undefined

  // G9 — collect a per-target outcome summary and post it to chat, so the AI gets
  // post-execution feedback (who saved, damage dealt, conditions applied) on its next turn.
  const outcomes: string[] = []
  for (const token of affectedTokens) {
    let saved = false
    if (saveType && saveDC) {
      // Phase 17c (LOG-4) — add the target's save modifier (was a bare d20 vs DC).
      const saveRoll = rollDiceFormula('1d20')
      saved = saveRoll.total + getCreatureSaveMod(token, saveType) >= saveDC
    }

    const parts: string[] = []
    if (damageFormula) {
      const dmg = rollDiceFormula(damageFormula)
      let finalDamage = dmg.total
      if (saved && halfOnSave) finalDamage = Math.floor(finalDamage / 2)
      else if (saved && !halfOnSave) finalDamage = 0

      if (finalDamage > 0 && token.currentHP != null) {
        const newHP = Math.max(0, token.currentHP - finalDamage)
        gameStore.updateToken(activeMap.id, token.id, { currentHP: newHP })
      }
      parts.push(`${finalDamage} ${damageType ?? ''} dmg`.trim())
    }

    if (condition && (!saved || !saveType)) {
      gameStore.addCondition({
        id: crypto.randomUUID(),
        entityId: token.entityId,
        entityName: token.label,
        condition,
        duration: conditionDuration ?? 'permanent',
        source: 'Area Effect',
        appliedRound: gameStore.round
      })
      parts.push(condition)
    }
    const verdict = saveType ? (saved ? 'saved' : 'failed') : 'hit'
    outcomes.push(`${token.label} (${verdict}${parts.length > 0 ? `: ${parts.join(', ')}` : ''})`)
  }

  broadcastTokenSync(activeMap.id, stores)
  broadcastConditionSync(stores)
  if (outcomes.length > 0) {
    postDmMessage(
      stores,
      'aoe-effect',
      `💥 [Area Effect] ${shape} at (${originX}, ${originY}) → ${outcomes.join('; ')}`
    )
  }
  return true
}
