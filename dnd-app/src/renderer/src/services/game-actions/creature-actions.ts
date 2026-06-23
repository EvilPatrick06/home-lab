/**
 * Creature & combat actions — resting, XP, treasure, encounters, NPC attitude, level-up.
 * (Initiative / conditions / area-effects / legendary live in creature-initiative.ts +
 * creature-conditions.ts; the dead duplicates here were removed in PHASE-08 08C.)
 */

import { pushDmAlert } from '../../components/game/overlays/DmAlertTray'
import { i18n } from '../../i18n'
import { play as playSound } from '../sound-manager'
import { broadcastConditionSync, broadcastTokenSync } from './broadcast-helpers'
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

/**
 * Roll DMG treasure (individual or hoard, by CR tier) from the real loot tables and
 * distribute it to the party: coins split evenly across the named characters, and
 * gems / art objects / magic items handed to the first character as the party stash.
 * The roll uses the engine's rarity-balanced generator, so the AI never invents items.
 */
export function executeAwardTreasure(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const characterNames = action.characterNames as string[]
  const type = action.type as 'individual' | 'hoard'
  const crTier = action.crTier as '0-4' | '5-10' | '11-16' | '17+'
  const reason = action.reason as string | undefined
  if (!Array.isArray(characterNames) || characterNames.length === 0)
    throw new Error('No character names for award_treasure')

  ;(async () => {
    const { generateIndividual, generateHoard, formatTreasureResult } = await import(
      '../../components/game/modals/dm-tools/treasure-generator-utils'
    )
    const { load5eTreasureTables } = await import('../data-provider')
    const tables = (await load5eTreasureTables().catch(() => null)) as Parameters<typeof generateIndividual>[1]
    const result = type === 'hoard' ? generateHoard(crTier, tables) : generateIndividual(crTier, tables)

    playSound('xp-gain')
    postDmChatMessage(
      stores,
      'ai-treasure',
      `💰 Treasure (${type}, CR ${crTier})${reason ? ` — ${reason}` : ''}:\n${formatTreasureResult(result)}`
    )

    const resolved = resolveCharacterIds(characterNames, stores)
    const n = resolved.length
    const reasonText = reason ?? `Treasure (${type}, CR ${crTier})`

    // Coins: split each denomination evenly; the remainder goes to the first character.
    const denominations = ['cp', 'sp', 'ep', 'gp', 'pp'] as const
    resolved.forEach(({ charId }, idx) => {
      if (!charId) return
      const mutations: Array<{ type: string; [key: string]: unknown }> = []
      for (const denom of denominations) {
        const total = result.coins[denom]
        if (total <= 0) continue
        const base = Math.floor(total / n)
        const share = base + (idx === 0 ? total - base * n : 0)
        if (share > 0) mutations.push({ type: 'gold', value: share, denomination: denom, reason: reasonText })
      }
      // Valuables + magic items go to the first character as the party stash.
      if (idx === 0) {
        for (const name of [...result.gems, ...result.artObjects, ...result.magicItems]) {
          mutations.push({ type: 'add_item', name, quantity: 1, reason: reasonText })
        }
      }
      if (mutations.length > 0) window.api.ai.applyMutations(charId, mutations).catch(() => {})
    })
  })().catch(() => {})
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
      window.api.ai
        .shortRest(charId)
        .catch((err) => pushDmAlert('error', i18n.t('notify.creatureActions.shortRestFailed', { error: String(err) })))
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

  // PHB 2024: Cannot long rest again within 24 hours of last long rest
  const lastLR = gameStore.restTracking?.lastLongRestSeconds
  const currentSec = stores.getGameStore().getState().inGameTime?.totalSeconds ?? 0
  if (lastLR != null && currentSec - lastLR < 86400) {
    const hoursLeft = Math.ceil((86400 - (currentSec - lastLR)) / 3600)
    postDmChatMessage(stores, 'ai-rest', `Cannot long rest yet. Must wait ${hoursLeft} more hours.`)
    return true
  }

  // Advance time by 8 hours
  gameStore.advanceTimeSeconds(28800)

  // Track rest timing
  const totalSec = stores.getGameStore().getState().inGameTime?.totalSeconds ?? 0
  gameStore.setRestTracking({
    lastLongRestSeconds: totalSec,
    lastShortRestSeconds: gameStore.restTracking?.lastShortRestSeconds ?? null
  })

  // PHB 2024: Long rest reduces Exhaustion by 1 level (not remove all)
  if (activeMap) {
    for (const name of names) {
      const token = resolveTokenByLabel(activeMap.tokens, name)
      if (token) {
        const exhCondition = gameStore.conditions.find(
          (c) => c.entityId === token.entityId && c.condition.toLowerCase() === 'exhaustion'
        )
        if (exhCondition) {
          const currentLevel = exhCondition.value ?? 1
          if (currentLevel <= 1) {
            gameStore.removeCondition(exhCondition.id)
          } else {
            gameStore.updateCondition(exhCondition.id, { value: currentLevel - 1 })
          }
        }
      }
    }
  }

  const msg = `Long rest completed for ${names.join(', ')}. All HP restored, spell slots recovered, class resources reset, and Exhaustion reduced by 1 level.`
  postDmChatMessage(stores, 'ai-rest', msg)

  // Apply long rest mutations (HP, spell slots, class resources, hit dice)
  const resolved = resolveCharacterIds(names, stores)
  for (const { charId } of resolved) {
    if (charId) {
      window.api.ai
        .longRest(charId)
        .catch((err) => pushDmAlert('error', i18n.t('notify.creatureActions.longRestFailed', { error: String(err) })))
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

    // Phase 26f — build the token list, then place. Monsters with explicit
    // pre-positioned `startX`/`startY` (from the encounter builder's
    // mini-map / X-Y input UI) land at exactly those coords. Everything
    // else flows through `smartPlaceTokens` (opposite players, off walls,
    // footprint-aware).
    const { smartPlaceTokens } = await import('./token-placement')
    const buildToken = (monster: (typeof monsters)[number], dims: { x: number; y: number }, label: string) => ({
      id: crypto.randomUUID(),
      entityId: crypto.randomUUID(),
      entityType: 'enemy' as const,
      label,
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
    })
    const prePositioned: Array<{ token: ReturnType<typeof buildToken>; x: number; y: number }> = []
    const toPlace: Array<ReturnType<typeof buildToken>> = []
    for (const entry of preset.monsters) {
      const monster = monsters.find((m) => m.id === entry.id)
      if (!monster) continue
      const dims = getSizeTokenDimensions(monster.size)
      for (let i = 0; i < entry.count; i++) {
        const token = buildToken(monster, dims, entry.count > 1 ? `${monster.name} ${i + 1}` : monster.name)
        if (typeof entry.startX === 'number' && typeof entry.startY === 'number') {
          prePositioned.push({ token, x: entry.startX, y: entry.startY })
        } else {
          toPlace.push(token)
        }
      }
    }
    const auto = smartPlaceTokens(map, toPlace)
    const placed = [...prePositioned.map(({ token, x, y }) => ({ ...token, gridX: x, gridY: y })), ...auto]
    for (const token of placed) {
      stores
        .getGameStore()
        .getState()
        .addToken(map.id, token as import('../../types/map').MapToken)
    }
    const spawnedCount = placed.length

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

    // G20 — surface the preset's treasure hint (previously ignored) so the AI knows
    // what this encounter is worth and can hand it out (award_treasure / add_item / gold)
    // when the party prevails, instead of inventing rewards or forgetting them.
    if (preset.treasureHint?.trim()) {
      postDmChatMessage(
        stores,
        'ai-enc-loot',
        `[ENCOUNTER LOOT] "${preset.name}" treasure: ${preset.treasureHint.trim()}. Distribute it to the party when they prevail (award_treasure, or add_item / gold mutations).`
      )
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
