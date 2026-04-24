/**
 * Creature & combat actions — initiative, conditions, HP, resting, XP, encounters,
 * NPC attitude, area effects, legendary actions/resistances, recharge.
 */

import type { InitiativeEntry } from '../../types/game-state'
import { play as playSound } from '../sound-manager'
import { broadcastConditionSync, broadcastInitiativeSync, broadcastTokenSync } from './broadcast-helpers'
import { findTokensInArea, rollDiceFormula } from './dice-helpers'
import { resolveTokenByLabel } from './name-resolver'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

// ── Internal Helpers ──

/**
 * Posts a chat message as the Dungeon Master and broadcasts it to all clients.
 */
function postDmChatMessage(stores: StoreAccessors, idPrefix: string, msg: string): void {
  const addChat = stores.getLobbyStore().getState().addChatMessage
  const sendMsg = stores.getNetworkStore().getState().sendMessage
  addChat({
    id: `${idPrefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    senderId: 'ai-dm',
    senderName: 'Dungeon Master',
    content: msg,
    timestamp: Date.now(),
    isSystem: true
  })
  sendMsg('chat:message', { message: msg, isSystem: true })
}

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
          const msg = `${nextEntry.entityName}'s ${ability.name} has recharged! (rolled ${roll.total})`
          postDmChatMessage(stores, 'ai-recharge', msg)
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
  const sendMsg = stores.getNetworkStore().getState().sendMessage
  sendMsg('dm:condition-update', {
    targetId: token.entityId,
    condition: action.condition as string,
    active: true
  })
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
  const sendMsg = stores.getNetworkStore().getState().sendMessage
  sendMsg('dm:condition-update', {
    targetId: token.entityId,
    condition: action.condition as string,
    active: false
  })
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
    action.widthOrHeight as number | undefined
  )

  if (affectedTokens.length === 0) return true

  const saveType = action.saveType as string | undefined
  const saveDC = action.saveDC as number | undefined
  const damageFormula = action.damageFormula as string | undefined
  const halfOnSave = action.halfOnSave as boolean | undefined
  const condition = action.condition as string | undefined
  const conditionDuration = action.conditionDuration as number | 'permanent' | undefined

  for (const token of affectedTokens) {
    let saved = false
    if (saveType && saveDC) {
      const saveRoll = rollDiceFormula('1d20')
      saved = saveRoll.total >= saveDC
    }

    if (damageFormula) {
      const dmg = rollDiceFormula(damageFormula)
      let finalDamage = dmg.total
      if (saved && halfOnSave) finalDamage = Math.floor(finalDamage / 2)
      else if (saved && !halfOnSave) finalDamage = 0

      if (finalDamage > 0 && token.currentHP != null) {
        const newHP = Math.max(0, token.currentHP - finalDamage)
        gameStore.updateToken(activeMap.id, token.id, { currentHP: newHP })
      }
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
    }
  }

  broadcastTokenSync(activeMap.id, stores)
  broadcastConditionSync(stores)
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

  const remaining = entry.legendaryResistances.remaining - 1
  const msg = `${label} uses a Legendary Resistance! (${remaining}/${entry.legendaryResistances.max} remaining)`
  postDmChatMessage(stores, 'ai-lr', msg)
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

  const resultText = recharged
    ? `${label}'s ${abilityName} has recharged! (rolled ${roll.total}, needed ${rechargeOn}+)`
    : `${label}'s ${abilityName} did not recharge. (rolled ${roll.total}, needed ${rechargeOn}+)`
  postDmChatMessage(stores, 'ai-recharge', resultText)
  broadcastInitiativeSync(stores)
  return true
}

/**
 * Looks up character IDs for the given character/player names from the lobby.
 * Matches against player displayName and characterName (case-insensitive).
 */
function resolveCharacterIds(names: string[], stores: StoreAccessors): { name: string; charId: string | null }[] {
  const players = stores.getLobbyStore().getState().players
  return names.map((name) => {
    const lname = name.toLowerCase()
    const player = players.find(
      (p) => p.displayName.toLowerCase() === lname || (p.characterName?.toLowerCase() ?? '') === lname
    )
    return { name, charId: player?.characterId ?? null }
  })
}

// ── XP & Level-Up ──

export function executeAwardXp(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const characterNames = action.characterNames as string[]
  const amount = action.amount as number
  const reason = action.reason as string | undefined
  if (!Array.isArray(characterNames) || characterNames.length === 0) throw new Error('No character names for award_xp')
  if (typeof amount !== 'number' || amount <= 0) throw new Error('Invalid XP amount')

  playSound('xp-gain')
  const msg = `${characterNames.join(', ')} gained ${amount} XP${reason ? ` (${reason})` : ''}!`
  postDmChatMessage(stores, 'ai-xp', msg)

  // Apply XP to each character's sheet
  const resolved = resolveCharacterIds(characterNames, stores)
  for (const { name, charId } of resolved) {
    if (charId) {
      window.api.ai
        .applyMutations(charId, [{ type: 'xp', value: amount, reason: reason ?? `Award XP for ${name}` }])
        .catch(() => {})
    }
  }
  return true
}

export function executeTriggerLevelUp(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const characterName = action.characterName as string
  if (!characterName) throw new Error('Missing character name for trigger_level_up')
  playSound('level-up')
  const msg = `${characterName} has enough XP to level up! Open your character sheet to advance.`
  postDmChatMessage(stores, 'ai-lvl', msg)
  return true
}

// ── Resting ──

export function executeShortRest(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const names = action.characterNames as string[]
  if (!Array.isArray(names) || names.length === 0) throw new Error('No character names for short_rest')

  // Advance time by 1 hour
  gameStore.advanceTimeSeconds(3600)

  // Track rest timing
  const totalSec = stores.getGameStore().getState().inGameTime?.totalSeconds ?? 0
  gameStore.setRestTracking({
    lastLongRestSeconds: gameStore.restTracking?.lastLongRestSeconds ?? null,
    lastShortRestSeconds: totalSec
  })

  const msg = `Short rest completed for ${names.join(', ')}. Hit dice may be spent to recover HP. Warlock spell slots restored.`
  postDmChatMessage(stores, 'ai-rest', msg)

  // Apply short rest mutations (Pact Magic slot restoration, short-rest resource recharge)
  const resolved = resolveCharacterIds(names, stores)
  for (const { charId } of resolved) {
    if (charId) {
      window.api.ai.shortRest(charId).catch(() => {})
    }
  }

  const newTime = stores.getGameStore().getState().inGameTime
  if (newTime) stores.getNetworkStore().getState().sendMessage('dm:time-sync', { totalSeconds: newTime.totalSeconds })
  return true
}

export function executeLongRest(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const names = action.characterNames as string[]
  if (!Array.isArray(names) || names.length === 0) throw new Error('No character names for long_rest')

  // Advance time by 8 hours
  gameStore.advanceTimeSeconds(28800)

  // Track rest timing
  const totalSec = stores.getGameStore().getState().inGameTime?.totalSeconds ?? 0
  gameStore.setRestTracking({
    lastLongRestSeconds: totalSec,
    lastShortRestSeconds: gameStore.restTracking?.lastShortRestSeconds ?? null
  })

  // Remove all Exhaustion conditions for named characters
  if (activeMap) {
    for (const name of names) {
      const token = resolveTokenByLabel(activeMap.tokens, name)
      if (token) {
        const exhaustionConditions = gameStore.conditions.filter(
          (c) => c.entityId === token.entityId && c.condition.toLowerCase() === 'exhaustion'
        )
        for (const ec of exhaustionConditions) {
          gameStore.removeCondition(ec.id)
        }
      }
    }
  }

  const msg = `Long rest completed for ${names.join(', ')}. All HP restored, spell slots recovered, class resources reset, and all Exhaustion removed.`
  postDmChatMessage(stores, 'ai-rest', msg)

  // Apply long rest mutations (HP, spell slots, class resources, hit dice)
  const resolved = resolveCharacterIds(names, stores)
  for (const { charId } of resolved) {
    if (charId) {
      window.api.ai.longRest(charId).catch(() => {})
    }
  }

  const newTime = stores.getGameStore().getState().inGameTime
  if (newTime) stores.getNetworkStore().getState().sendMessage('dm:time-sync', { totalSeconds: newTime.totalSeconds })

  // Broadcast condition changes
  broadcastConditionSync(stores)
  return true
}

// ── Encounters ──

export function executeLoadEncounter(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const encounterName = action.encounterName as string
  if (!encounterName) throw new Error('Missing encounter name')

  postDmChatMessage(stores, 'ai-enc', `Loading encounter: "${encounterName}"...`)

  // Async: load presets + monsters, then place tokens
  ;(async () => {
    const { load5eEncounterPresets, load5eMonsters } = await import('../data-provider')
    const { getSizeTokenDimensions } = await import('../../types/monster')
    const [presets, monsters] = await Promise.all([load5eEncounterPresets(), load5eMonsters()])

    const preset = presets.find((p) => p.name.toLowerCase() === encounterName.toLowerCase())
    if (!preset) {
      postDmChatMessage(
        stores,
        'ai-enc-err',
        `Encounter "${encounterName}" not found in encounter presets. You may need to place creatures manually.`
      )
      return
    }

    // Get fresh map state after async
    const freshState = stores.getGameStore().getState()
    const map = freshState.maps.find((m) => m.id === freshState.activeMapId)
    if (!map) {
      postDmChatMessage(stores, 'ai-enc-err', `No active map to place encounter on.`)
      return
    }

    // Place monsters in a grid pattern starting at center of map
    const centerX = Math.floor((map.width ?? 20) / 2)
    const centerY = Math.floor((map.height ?? 20) / 2)
    let offset = 0
    let spawnedCount = 0

    for (const entry of preset.monsters) {
      const monster = monsters.find((m) => m.id === entry.id)
      if (!monster) continue
      const dims = getSizeTokenDimensions(monster.size)

      for (let i = 0; i < entry.count; i++) {
        const col = offset % 5
        const row = Math.floor(offset / 5)
        const token = {
          id: crypto.randomUUID(),
          entityId: crypto.randomUUID(),
          entityType: 'enemy' as const,
          label: entry.count > 1 ? `${monster.name} ${i + 1}` : monster.name,
          gridX: centerX + col * dims.x,
          gridY: centerY + row * dims.y,
          sizeX: dims.x,
          sizeY: dims.y,
          visibleToPlayers: false,
          conditions: [],
          currentHP: monster.hp,
          maxHP: monster.hp,
          ac: monster.ac,
          monsterStatBlockId: monster.id,
          walkSpeed: monster.speed.walk ?? 30,
          swimSpeed: monster.speed.swim,
          climbSpeed: monster.speed.climb,
          flySpeed: monster.speed.fly,
          initiativeModifier: monster.abilityScores ? Math.floor((monster.abilityScores.dex - 10) / 2) : 0,
          resistances: monster.resistances,
          vulnerabilities: monster.vulnerabilities,
          immunities: monster.damageImmunities,
          darkvision: !!(monster.senses?.darkvision && monster.senses.darkvision > 0),
          darkvisionRange: monster.senses?.darkvision || undefined
        }
        stores.getGameStore().getState().addToken(map.id, token)
        offset++
        spawnedCount++
      }
    }

    if (spawnedCount > 0) {
      broadcastTokenSync(map.id, stores)
      postDmChatMessage(
        stores,
        'ai-enc-done',
        `Encounter "${preset.name}" loaded with ${spawnedCount} creature${spawnedCount !== 1 ? 's' : ''}! ${preset.description}`
      )
    } else {
      postDmChatMessage(stores, 'ai-enc-err', `Encounter "${preset.name}" found but no monsters could be placed.`)
    }
  })().catch(() => {})
  return true
}

// ── NPC Attitude ──

export function executeSetNpcAttitude(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const npcName = action.npcName as string
  const attitude = action.attitude as 'friendly' | 'indifferent' | 'hostile'
  if (!npcName || !attitude) throw new Error('Missing npcName or attitude')
  if (!['friendly', 'indifferent', 'hostile'].includes(attitude)) throw new Error(`Invalid attitude: ${attitude}`)

  // Find sidebar entry across all categories and update attitude
  const categories: Array<'allies' | 'enemies' | 'places'> = ['allies', 'enemies', 'places']
  let found = false
  for (const cat of categories) {
    const entries = gameStore[cat]
    const entry = entries.find((e) => e.name.toLowerCase() === npcName.toLowerCase())
    if (entry) {
      gameStore.updateSidebarEntry(cat, entry.id, { attitude })
      found = true
      break
    }
  }

  // If not found, add to allies/enemies based on attitude
  if (!found) {
    const category = attitude === 'hostile' ? 'enemies' : 'allies'
    gameStore.addSidebarEntry(category, {
      id: crypto.randomUUID(),
      name: npcName,
      description: action.reason as string | undefined,
      attitude,
      visibleToPlayers: true,
      isAutoPopulated: false
    })
  }
  return true
}
