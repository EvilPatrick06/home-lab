/**
 * Token management actions — place_token, place_creature, move_token, remove_token, update_token, teleport_token.
 */

import type { MapToken } from '../../types/map'
import type { MonsterStatBlock } from '../../types/monster'
import { getSizeTokenDimensions } from '../../types/monster'
import { pluginEventBus } from '../plugin-system/event-bus'
import { broadcastTokenSync } from './broadcast-helpers'
import { resolveTokenByLabel } from './name-resolver'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

// Monster cache for place_creature — loaded lazily
let monsterCache: MonsterStatBlock[] | null = null

async function ensureMonsterCache(): Promise<void> {
  if (monsterCache) return
  try {
    const { load5eMonsters } = await import('../data-provider')
    monsterCache = await load5eMonsters()
  } catch {
    monsterCache = []
  }
}

// Eagerly load on first import
ensureMonsterCache()

export function executePlaceToken(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const gridX = action.gridX as number
  const gridY = action.gridY as number
  if (typeof gridX !== 'number' || typeof gridY !== 'number') throw new Error('Missing gridX/gridY')

  const token: MapToken = {
    id: crypto.randomUUID(),
    entityId: crypto.randomUUID(),
    entityType: (action.entityType as 'player' | 'npc' | 'enemy') || 'enemy',
    label: action.label as string,
    gridX,
    gridY,
    sizeX: (action.sizeX as number) || 1,
    sizeY: (action.sizeY as number) || 1,
    visibleToPlayers: action.visibleToPlayers !== false,
    conditions: (action.conditions as string[]) || [],
    currentHP: action.hp as number | undefined,
    maxHP: action.hp as number | undefined,
    ac: action.ac as number | undefined,
    walkSpeed: action.speed as number | undefined
  }
  gameStore.addToken(activeMap.id, token)

  // Initialize turn state if in initiative
  if (gameStore.initiative && token.walkSpeed) {
    gameStore.initTurnState(token.entityId, token.walkSpeed)
  }
  broadcastTokenSync(activeMap.id, stores)

  if (pluginEventBus.hasSubscribers('map:token-placed')) {
    pluginEventBus.emit('map:token-placed', { tokenId: token.id, label: token.label, gridX, gridY })
  }
  return true
}

export function executeMoveToken(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const token = resolveTokenByLabel(activeMap.tokens, action.label as string)
  if (!token) throw new Error(`Token not found: ${action.label}`)
  const gridX = action.gridX as number
  const gridY = action.gridY as number
  if (typeof gridX !== 'number' || typeof gridY !== 'number') throw new Error('Missing gridX/gridY')
  gameStore.moveToken(activeMap.id, token.id, gridX, gridY)
  const sendMsg = stores.getNetworkStore().getState().sendMessage
  sendMsg('dm:token-move', { tokenId: token.id, gridX, gridY })

  if (pluginEventBus.hasSubscribers('map:token-moved')) {
    pluginEventBus.emit('map:token-moved', { tokenId: token.id, label: token.label, gridX, gridY })
  }
  return true
}

export function executeRemoveToken(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const token = resolveTokenByLabel(activeMap.tokens, action.label as string)
  if (!token) throw new Error(`Token not found: ${action.label}`)
  gameStore.removeToken(activeMap.id, token.id)
  broadcastTokenSync(activeMap.id, stores)

  if (pluginEventBus.hasSubscribers('map:token-removed')) {
    pluginEventBus.emit('map:token-removed', { tokenId: token.id, label: token.label })
  }
  return true
}

export function executeUpdateToken(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const token = resolveTokenByLabel(activeMap.tokens, action.label as string)
  if (!token) throw new Error(`Token not found: ${action.label}`)
  const updates: Partial<MapToken> = {}
  if (action.hp !== undefined) {
    updates.currentHP = action.hp as number
    if (token.maxHP === undefined || (action.hp as number) > token.maxHP) {
      updates.maxHP = action.hp as number
    }
  }
  if (action.ac !== undefined) updates.ac = action.ac as number
  if (action.conditions !== undefined) updates.conditions = action.conditions as string[]
  if (action.visibleToPlayers !== undefined) updates.visibleToPlayers = action.visibleToPlayers as boolean
  if (action.label_new) updates.label = action.label_new as string
  gameStore.updateToken(activeMap.id, token.id, updates)
  broadcastTokenSync(activeMap.id, stores)
  return true
}

export function executePlaceCreature(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (!activeMap) throw new Error('No active map')
  const creatureName = action.creatureName as string | undefined
  const creatureId = action.creatureId as string | undefined
  if (!creatureName && !creatureId) throw new Error('Missing creatureName or creatureId')
  const gridX = action.gridX as number
  const gridY = action.gridY as number
  if (typeof gridX !== 'number' || typeof gridY !== 'number') throw new Error('Missing gridX/gridY')

  // Look up creature from loaded monster data
  const monsters = monsterCache
  const creature = monsters?.find((m) => {
    if (creatureId && m.id.toLowerCase() === creatureId.toLowerCase()) return true
    if (creatureName && m.name.toLowerCase() === creatureName.toLowerCase()) return true
    return false
  })
  const fallbackLabel = (action.label as string) || creatureName || creatureId || 'Creature'

  if (!creature) {
    // Fall back to basic place_token behavior
    const token: MapToken = {
      id: crypto.randomUUID(),
      entityId: crypto.randomUUID(),
      entityType: (action.entityType as 'player' | 'npc' | 'enemy') || 'enemy',
      label: fallbackLabel,
      gridX,
      gridY,
      sizeX: (action.sizeX as number) || 1,
      sizeY: (action.sizeY as number) || 1,
      visibleToPlayers: action.visibleToPlayers !== false,
      conditions: [],
      currentHP: action.hp as number | undefined,
      maxHP: action.hp as number | undefined,
      ac: action.ac as number | undefined,
      walkSpeed: action.speed as number | undefined
    }
    gameStore.addToken(activeMap.id, token)
    broadcastTokenSync(activeMap.id, stores)
    return true
  }

  const dims = getSizeTokenDimensions(creature.size)
  const token: MapToken = {
    id: crypto.randomUUID(),
    entityId: crypto.randomUUID(),
    entityType: (action.entityType as 'player' | 'npc' | 'enemy') || 'enemy',
    label: (action.label as string) || creature.name,
    gridX,
    gridY,
    sizeX: dims.x,
    sizeY: dims.y,
    visibleToPlayers: action.visibleToPlayers !== false,
    conditions: [],
    currentHP: creature.hp,
    maxHP: creature.hp,
    ac: creature.ac,
    monsterStatBlockId: creature.id,
    walkSpeed: creature.speed.walk ?? 0,
    swimSpeed: creature.speed.swim,
    climbSpeed: creature.speed.climb,
    flySpeed: creature.speed.fly,
    initiativeModifier: creature.abilityScores ? Math.floor((creature.abilityScores.dex - 10) / 2) : 0,
    resistances: creature.resistances,
    vulnerabilities: creature.vulnerabilities,
    immunities: creature.damageImmunities,
    darkvision: !!(creature.senses.darkvision && creature.senses.darkvision > 0),
    darkvisionRange: creature.senses.darkvision || undefined
  }
  gameStore.addToken(activeMap.id, token)

  // Initialize turn state if in initiative
  if (gameStore.initiative && token.walkSpeed) {
    gameStore.initTurnState(token.entityId, token.walkSpeed)
  }
  broadcastTokenSync(activeMap.id, stores)
  return true
}
