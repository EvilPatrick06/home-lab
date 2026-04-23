/**
 * Initiative-related creature actions — start, add, next turn, end, remove,
 * legendary actions/resistances, recharge rolls.
 */

import type { InitiativeEntry } from '../../types/game-state'
import { broadcastInitiativeSync } from './broadcast-helpers'
import { rollDiceFormula } from './dice-helpers'
import { resolveTokenByLabel } from './name-resolver'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

// ── Initiative ──

export function executeStartInitiative(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const rawEntries = action.entries as Array<{
    label: string
    roll: number
    modifier: number
    entityType: 'player' | 'npc' | 'enemy'
  }>
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) throw new Error('No initiative entries')

  const entries: InitiativeEntry[] = rawEntries.map((e) => {
    // Try to resolve entity ID from existing tokens
    const token = activeMap ? resolveTokenByLabel(activeMap.tokens, e.label) : undefined
    return {
      id: crypto.randomUUID(),
      entityId: token?.entityId || crypto.randomUUID(),
      entityName: e.label,
      entityType: e.entityType || 'enemy',
      roll: e.roll,
      modifier: e.modifier || 0,
      total: e.roll + (e.modifier || 0),
      isActive: false
    }
  })
  gameStore.startInitiative(entries)

  // Init turn states for all entries with speed from tokens
  for (const entry of entries) {
    const token = activeMap?.tokens.find((t) => t.entityId === entry.entityId)
    gameStore.initTurnState(entry.entityId, token?.walkSpeed ?? 30)
  }
  broadcastInitiativeSync(stores)
  return true
}

export function executeAddToInitiative(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const token = activeMap ? resolveTokenByLabel(activeMap.tokens, action.label as string) : undefined
  const entry: InitiativeEntry = {
    id: crypto.randomUUID(),
    entityId: token?.entityId || crypto.randomUUID(),
    entityName: action.label as string,
    entityType: (action.entityType as 'player' | 'npc' | 'enemy') || 'enemy',
    roll: action.roll as number,
    modifier: (action.modifier as number) || 0,
    total: (action.roll as number) + ((action.modifier as number) || 0),
    isActive: false
  }
  gameStore.addToInitiative(entry)
  gameStore.initTurnState(entry.entityId, token?.walkSpeed ?? 30)
  broadcastInitiativeSync(stores)
  return true
}

export function executeNextTurn(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!gameStore.initiative) throw new Error('No initiative running')

  // Reset legendary actions for the creature whose turn is starting
  const currentIdx = gameStore.initiative.currentIndex
  const nextIdx = (currentIdx + 1) % gameStore.initiative.entries.length
  const nextEntry = gameStore.initiative.entries[nextIdx]
  if (nextEntry?.legendaryActions) {
    gameStore.updateInitiativeEntry(nextEntry.id, {
      legendaryActions: { maximum: nextEntry.legendaryActions.maximum, used: 0 }
    })
  }

  // Auto-roll recharge abilities for the next creature
  if (nextEntry?.rechargeAbilities && nextEntry.entityType === 'enemy') {
    const abilities = [...nextEntry.rechargeAbilities]
    let anyRecharged = false
    for (const ability of abilities) {
      if (!ability.available) {
        const roll = rollDiceFormula('1d6')
        if (roll.total >= ability.rechargeOn) {
          ability.available = true
          anyRecharged = true
          const addChat = stores.getLobbyStore().getState().addChatMessage
          const sendMsg = stores.getNetworkStore().getState().sendMessage
          const msg = `${nextEntry.entityName}'s ${ability.name} has recharged! (rolled ${roll.total})`
          addChat({
            id: `ai-recharge-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
            senderId: 'ai-dm',
            senderName: 'Dungeon Master',
            content: msg,
            timestamp: Date.now(),
            isSystem: true
          })
          sendMsg('chat:message', { message: msg, isSystem: true })
        }
      }
    }
    if (anyRecharged) {
      gameStore.updateInitiativeEntry(nextEntry.id, { rechargeAbilities: abilities })
    }
  }

  gameStore.nextTurn()
  broadcastInitiativeSync(stores)
  return true
}

export function executeEndInitiative(
  _action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  gameStore.endInitiative()
  broadcastInitiativeSync(stores)
  return true
}

export function executeRemoveFromInitiative(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!gameStore.initiative) throw new Error('No initiative running')
  const entry = gameStore.initiative.entries.find(
    (e) => e.entityName.toLowerCase() === (action.label as string).toLowerCase()
  )
  if (!entry) throw new Error(`Initiative entry not found: ${action.label}`)
  gameStore.removeFromInitiative(entry.id)
  broadcastInitiativeSync(stores)
  return true
}

// ── Legendary Actions & Resistances ──

export function executeUseLegendaryAction(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!gameStore.initiative) throw new Error('No initiative running')
  const label = action.entityLabel as string
  const cost = (action.cost as number) || 1
  const entry = gameStore.initiative.entries.find((e) => e.entityName.toLowerCase() === label.toLowerCase())
  if (!entry) throw new Error(`Initiative entry not found: ${label}`)
  if (!entry.legendaryActions) throw new Error(`${label} has no legendary actions`)
  const available = entry.legendaryActions.maximum - entry.legendaryActions.used
  if (available < cost) throw new Error(`${label} has only ${available} legendary actions remaining (needs ${cost})`)

  gameStore.updateInitiativeEntry(entry.id, {
    legendaryActions: {
      maximum: entry.legendaryActions.maximum,
      used: entry.legendaryActions.used + cost
    }
  })
  broadcastInitiativeSync(stores)
  return true
}

export function executeUseLegendaryResistance(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!gameStore.initiative) throw new Error('No initiative running')
  const label = action.entityLabel as string
  const entry = gameStore.initiative.entries.find((e) => e.entityName.toLowerCase() === label.toLowerCase())
  if (!entry) throw new Error(`Initiative entry not found: ${label}`)
  if (!entry.legendaryResistances || entry.legendaryResistances.remaining <= 0)
    throw new Error(`${label} has no legendary resistances remaining`)

  gameStore.updateInitiativeEntry(entry.id, {
    legendaryResistances: {
      max: entry.legendaryResistances.max,
      remaining: entry.legendaryResistances.remaining - 1
    }
  })

  const addChat = stores.getLobbyStore().getState().addChatMessage
  const sendMsg = stores.getNetworkStore().getState().sendMessage
  const remaining = entry.legendaryResistances.remaining - 1
  const msg = `${label} uses a Legendary Resistance! (${remaining}/${entry.legendaryResistances.max} remaining)`
  addChat({
    id: `ai-lr-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    senderId: 'ai-dm',
    senderName: 'Dungeon Master',
    content: msg,
    timestamp: Date.now(),
    isSystem: true
  })
  sendMsg('chat:message', { message: msg, isSystem: true })
  broadcastInitiativeSync(stores)
  return true
}

// ── Recharge Roll ──

export function executeRechargeRoll(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!gameStore.initiative) throw new Error('No initiative running')
  const label = action.entityLabel as string
  const abilityName = action.abilityName as string
  const rechargeOn = action.rechargeOn as number
  if (!abilityName || typeof rechargeOn !== 'number') throw new Error('Missing abilityName or rechargeOn')

  const entry = gameStore.initiative.entries.find((e) => e.entityName.toLowerCase() === label.toLowerCase())
  if (!entry) throw new Error(`Initiative entry not found: ${label}`)

  const roll = rollDiceFormula('1d6')
  const recharged = roll.total >= rechargeOn

  const abilities = entry.rechargeAbilities ? [...entry.rechargeAbilities] : []
  const existing = abilities.find((a) => a.name.toLowerCase() === abilityName.toLowerCase())
  if (existing) {
    existing.available = recharged
  } else {
    abilities.push({ name: abilityName, rechargeOn, available: recharged })
  }
  gameStore.updateInitiativeEntry(entry.id, { rechargeAbilities: abilities })

  const addChat = stores.getLobbyStore().getState().addChatMessage
  const sendMsg = stores.getNetworkStore().getState().sendMessage
  const resultText = recharged
    ? `${label}'s ${abilityName} has recharged! (rolled ${roll.total}, needed ${rechargeOn}+)`
    : `${label}'s ${abilityName} did not recharge. (rolled ${roll.total}, needed ${rechargeOn}+)`
  addChat({
    id: `ai-recharge-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    senderId: 'ai-dm',
    senderName: 'Dungeon Master',
    content: resultText,
    timestamp: Date.now(),
    isSystem: true
  })
  sendMsg('chat:message', { message: resultText, isSystem: true })
  broadcastInitiativeSync(stores)
  return true
}
