import { useCampaignStore } from '../../stores/use-campaign-store'
import { rollDiceFormula } from './dice-action-utils'
import { findBastionByOwnerName, resolveMapByName, resolvePlayerByName } from './name-resolver'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

// ── Internal Helpers ──

/**
 * Posts a chat message as the Dungeon Master and broadcasts it to all clients.
 * Returns the resulting chat message id.
 */
function postDmChatMessage(
  stores: StoreAccessors,
  idPrefix: string,
  msg: string,
  senderId: 'ai-dm' | 'system' = 'ai-dm',
  senderName = 'Dungeon Master',
  broadcast = true
): void {
  const addChat = stores.getLobbyStore().getState().addChatMessage
  const sendMsg = stores.getNetworkStore().getState().sendMessage
  addChat({
    id: `${idPrefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
    senderId,
    senderName,
    content: msg,
    timestamp: Date.now(),
    isSystem: true
  })
  // broadcast=false keeps a roll DM-only (the players don't see a "hidden" roll).
  if (broadcast) sendMsg('chat:message', { message: msg, isSystem: true })
}

/**
 * Engine-side dice roll requested by the AI DM via [DM_ACTIONS]. Rolls the formula
 * for real (so the AI reacts to genuine randomness instead of inventing a result),
 * posts it to chat, and — for visibility:'hidden' — keeps it DM-only.
 */
export function executeRollDice(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const a = action as { formula?: string; reason?: string; visibility?: 'public' | 'hidden' }
  const formula = (a.formula ?? '').trim()
  const { rolls, total } = rollDiceFormula(formula)
  if (rolls.length === 0) {
    postDmChatMessage(stores, 'ai-roll', `\u{1F3B2} Invalid dice formula: "${formula}"`, 'system', 'System')
    return false
  }
  const reason = a.reason ? ` (${a.reason})` : ''
  const msg = `\u{1F3B2} ${formula}${reason}: ${total} [${rolls.join(', ')}]`
  postDmChatMessage(stores, 'ai-roll', msg, 'ai-dm', 'Dungeon Master', a.visibility !== 'hidden')
  return true
}

/**
 * AI DM calls for a group ability/save/skill check (mid-turn DM prompt). Drives the
 * existing GroupRollRequest infra: sets the local pending roll (so the DM's
 * RollRequestOverlay appears and results are tracked) AND broadcasts a typed
 * `dm:roll-request` so every player's overlay pops. `secret` keeps it DM-only.
 */
export function executeRequestRoll(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const a = action as {
    rollType?: 'ability' | 'save' | 'skill'
    ability?: string
    skill?: string
    dc?: number
    secret?: boolean
    reason?: string
  }
  const type = a.rollType ?? 'ability'
  const dc = typeof a.dc === 'number' && a.dc > 0 ? Math.round(a.dc) : 10
  const isSecret = a.secret === true
  const id = crypto.randomUUID()

  // 1) Local pending — DM's RollRequestOverlay + result tracking.
  gameStore.setPendingGroupRoll({ id, type, ability: a.ability, skill: a.skill, dc, scope: 'all', isSecret })

  // 2) Broadcast so each player's overlay pops. requesterName is the local DM's
  // display name (falls back to "Dungeon Master" for a standalone/solo session).
  const net = stores.getNetworkStore().getState()
  const localPeerId = net.localPeerId ?? ''
  const requesterName =
    stores
      .getLobbyStore()
      .getState()
      .players.find((p) => p.peerId === localPeerId)?.displayName ?? 'Dungeon Master'
  net.sendMessage('dm:roll-request', {
    id,
    type,
    ability: a.ability,
    skill: a.skill,
    dc,
    isSecret,
    requesterId: localPeerId,
    requesterName
  })

  // 3) Announce in chat (skip the broadcast for a secret check — DM-only).
  const label = a.skill ? a.skill : a.ability ? `${a.ability} ${type}` : type
  const reason = a.reason ? ` — ${a.reason}` : ''
  postDmChatMessage(
    stores,
    'ai-rollreq',
    `\u{1F3B2} Roll request: ${label} check (DC ${dc})${reason}`,
    'ai-dm',
    'Dungeon Master',
    !isSecret
  )
  return true
}

/**
 * Broadcasts the current in-game time to all clients.
 */
function broadcastTimeSync(stores: StoreAccessors): void {
  const newTime = stores.getGameStore().getState().inGameTime
  if (newTime) {
    const sendMsg = stores.getNetworkStore().getState().sendMessage
    sendMsg('dm:time-sync', { totalSeconds: newTime.totalSeconds })
  }
}

/**
 * Loads the bastion store dynamically and calls the given callback with its state.
 */
function withBastionStore(
  callback: (
    bastionStore: ReturnType<typeof import('../../stores/use-bastion-store').useBastionStore.getState>
  ) => void,
  onUnavailable?: (reason: string) => void
): void {
  // 08J — `.catch` so a throw inside the async callback no longer becomes an unhandled rejection
  // AFTER the executor already returned true.
  import('../../stores/use-bastion-store')
    .then(({ useBastionStore }) => callback(useBastionStore.getState()))
    .catch((err) => onUnavailable?.(String(err)))
}

/** Post a not-found chat line so the AI learns a bastion verb did nothing (the model reads it
 *  on its next turn — same feedback channel query_aoe uses). The executor still returned true
 *  synchronously because the store work is async by construction. (08J) */
function postBastionNotFound(stores: StoreAccessors, action: string, owner: string): void {
  postDmChatMessage(
    stores,
    'ai-bastion-err',
    `⚠️ Bastion action ${action} failed: bastion/facility not found for "${owner}"`
  )
}

// ── Time Management ──

export function executeAdvanceTime(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  let totalSeconds = 0
  if (action.seconds) totalSeconds += action.seconds as number
  if (action.minutes) totalSeconds += (action.minutes as number) * 60
  if (action.hours) totalSeconds += (action.hours as number) * 3600
  if (action.days) totalSeconds += (action.days as number) * 86400

  if (totalSeconds <= 0) throw new Error('advance_time requires positive time values')

  gameStore.advanceTimeSeconds(totalSeconds)

  // If advancing days, also advance bastions
  if (action.days && (action.days as number) > 0) {
    withBastionStore((bastionStore) => {
      const campaignId = gameStore.campaignId
      const linked = bastionStore.bastions.filter((b: { campaignId: string | null }) => b.campaignId === campaignId)
      for (const bastion of linked) {
        bastionStore.advanceTime(bastion.id, action.days as number)
      }
    })
  }

  // Broadcast time sync
  broadcastTimeSync(stores)

  // Check expired light sources
  const expired = stores.getGameStore().getState().checkExpiredSources()
  if (expired.length > 0) {
    for (const ls of expired) {
      const msg = `${ls.entityName}'s ${ls.sourceName} goes out.`
      postDmChatMessage(stores, 'ai-light', msg, 'system', 'System')
    }
  }
  return true
}

export function executeSetTime(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  if (action.totalSeconds !== undefined) {
    gameStore.setInGameTime({ totalSeconds: action.totalSeconds as number })
  } else if (gameStore.inGameTime) {
    // Adjust hour/minute on current day
    const hour = (action.hour as number) ?? 0
    const minute = (action.minute as number) ?? 0
    const currentSeconds = gameStore.inGameTime.totalSeconds
    const daySeconds = Math.floor(currentSeconds / 86400) * 86400
    gameStore.setInGameTime({ totalSeconds: daySeconds + hour * 3600 + minute * 60 })
  }

  broadcastTimeSync(stores)
  return true
}

export function executeShareTime(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const time = gameStore.inGameTime
  if (!time) throw new Error('No in-game time set')

  const customMsg = action.message as string | undefined

  if (customMsg) {
    postDmChatMessage(stores, 'ai-time', customMsg)
  }

  // Also broadcast dm:time-share for client UI
  const sendMsg = stores.getNetworkStore().getState().sendMessage
  sendMsg('dm:time-share', { formattedTime: customMsg || `Time: ${time.totalSeconds}s` })
  return true
}

// ── Shop ──

export function executeOpenShop(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const name = (action.name as string) || 'Shop'
  gameStore.openShop(name)

  const items = action.items as
    | Array<{
        name: string
        category: string
        price: { gp?: number; sp?: number; cp?: number }
        quantity: number
        description?: string
      }>
    | undefined
  if (items && Array.isArray(items)) {
    const shopItems = items.map((item) => ({
      id: crypto.randomUUID(),
      name: item.name,
      category: item.category || 'General',
      price: item.price || { gp: 0 },
      quantity: item.quantity || 1,
      description: item.description
    }))
    gameStore.setShopInventory(shopItems)
  }

  // Broadcast to clients — read FRESH inventory (the snapshot's shopInventory is pre-batch,
  // i.e. the PREVIOUS/empty inventory; setShopInventory above wrote through to the real store). (08F)
  const sendMessage = stores.getNetworkStore().getState().sendMessage
  sendMessage('dm:shop-update', {
    shopInventory: stores.getGameStore().getState().shopInventory,
    shopName: name
  })
  return true
}

export function executeCloseShop(
  _action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  gameStore.closeShop()
  const sendMessage = stores.getNetworkStore().getState().sendMessage
  sendMessage('dm:shop-update', { shopInventory: [], shopName: '' })
  return true
}

export function executeAddShopItem(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  gameStore.addShopItem({
    id: crypto.randomUUID(),
    name: action.name as string,
    category: (action.category as string) || 'General',
    price: (action.price as { gp?: number; sp?: number; cp?: number }) || { gp: 0 },
    quantity: (action.quantity as number) || 1,
    description: action.description as string | undefined
  })
  // 08F — broadcast the post-mutation inventory (clients had no add/remove broadcast before).
  broadcastShop(stores)
  return true
}

export function executeRemoveShopItem(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const shop = stores.getGameStore().getState().shopInventory
  const item = shop.find((i) => i.name.toLowerCase() === (action.name as string).toLowerCase())
  if (!item) throw new Error(`Shop item not found: ${action.name}`)
  stores.getGameStore().getState().removeShopItem(item.id)
  broadcastShop(stores) // 08F
  return true
}

/** Broadcast the current shop inventory + name (mirrors the host buy/sell payload). (08F) */
function broadcastShop(stores: StoreAccessors): void {
  const gs = stores.getGameStore().getState()
  stores.getNetworkStore().getState().sendMessage('dm:shop-update', {
    shopInventory: gs.shopInventory,
    shopName: gs.shopName
  })
}

// ── Map ──

export function executeSwitchMap(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const map = resolveMapByName(gameStore.maps, action.mapName as string)
  if (!map) throw new Error(`Map not found: ${action.mapName}`)
  gameStore.setActiveMap(map.id)
  const sendMsg = stores.getNetworkStore().getState().sendMessage
  sendMsg('dm:map-change', { mapId: map.id })
  return true
}

// ── Sidebar ──

export function executeAddSidebarEntry(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const category = action.category as 'allies' | 'enemies' | 'places'
  if (!['allies', 'enemies', 'places'].includes(category)) throw new Error(`Invalid sidebar category: ${category}`)
  gameStore.addSidebarEntry(category, {
    id: crypto.randomUUID(),
    name: action.name as string,
    description: action.description as string | undefined,
    visibleToPlayers: action.visibleToPlayers !== false,
    isAutoPopulated: false
  })
  return true
}

export function executeRemoveSidebarEntry(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const category = action.category as 'allies' | 'enemies' | 'places'
  const entries = gameStore[category]
  const entry = entries.find((e) => e.name.toLowerCase() === (action.name as string).toLowerCase())
  if (!entry) throw new Error(`Sidebar entry not found: ${action.name}`)
  gameStore.removeSidebarEntry(category, entry.id)
  return true
}

// ── Timer ──

export function executeStartTimer(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const seconds = action.seconds as number
  const targetName = (action.targetName as string) || ''
  gameStore.startTimer(seconds, targetName)
  const sendMessage = stores.getNetworkStore().getState().sendMessage
  sendMessage('dm:timer-start', { seconds, targetName })
  return true
}

export function executeStopTimer(
  _action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  gameStore.stopTimer()
  const sendMessage = stores.getNetworkStore().getState().sendMessage
  sendMessage('dm:timer-stop', {})
  return true
}

// ── Hidden Dice ──

export function executeHiddenDiceRoll(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const formula = action.formula as string
  const { rolls, total } = rollDiceFormula(formula)
  gameStore.addHiddenDiceResult({
    id: crypto.randomUUID(),
    formula,
    rolls,
    total,
    timestamp: Date.now()
  })
  return true
}

// ── Communication ──

export function executeWhisperPlayer(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const peerId = resolvePlayerByName(action.playerName as string, stores)
  if (!peerId) throw new Error(`Player not found: ${action.playerName}`)
  const sendMessage = stores.getNetworkStore().getState().sendMessage
  sendMessage('dm:whisper-player', {
    targetPeerId: peerId,
    targetName: action.playerName as string,
    message: action.message as string
  })
  return true
}

export function executeSystemMessage(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  postDmChatMessage(stores, 'ai-sys', action.message as string, 'ai-dm', 'System')
  return true
}

// ── Journal ──

export function executeAddJournalEntry(action: DmAction, _gameStore: GameStoreSnapshot): boolean {
  const content = action.content as string
  const title = (action.title as string) || 'AI DM Reflection'
  if (!content) throw new Error('No content for journal entry')

  const inGameTimestamp =
    _gameStore.inGameTime && typeof _gameStore.inGameTime.totalSeconds === 'number'
      ? String(_gameStore.inGameTime.totalSeconds)
      : undefined
  _gameStore.addLogEntry(content, inGameTimestamp)

  const campaignStore = useCampaignStore.getState()
  const campaign = campaignStore.getActiveCampaign()
  if (!campaign) {
    // Fallback to postDmChatMessage if no campaign is found
    postDmChatMessage(
      // boundary cast: minimal no-op accessors stub (omits getGameStore) for the no-campaign fallback path
      {
        getLobbyStore: () => ({ getState: () => ({ addChatMessage: () => {} }) }),
        getNetworkStore: () => ({ getState: () => ({ sendMessage: () => {} }) })
      } as unknown as StoreAccessors,
      'ai-journal',
      `Journal Entry (${title}): ${content}`
    )
    return true
  }

  const maxSession = campaign.journal.entries.reduce((max, e) => Math.max(max, e.sessionNumber), 0)

  const newEntry = {
    id: crypto.randomUUID(),
    sessionNumber: maxSession, // Post to the current active session number
    date: new Date().toISOString(),
    title,
    content,
    isPrivate: true,
    authorId: 'ai-dm',
    createdAt: new Date().toISOString()
  }

  const updatedCampaign = {
    ...campaign,
    journal: {
      ...campaign.journal,
      entries: [...campaign.journal.entries, newEntry]
    },
    updatedAt: new Date().toISOString()
  }

  campaignStore.saveCampaign(updatedCampaign)
  return true
}

// ── Bastion Management ──

export function executeBastionAdvanceTime(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const days = action.days as number
  const ownerName = action.bastionOwner as string
  if (typeof days !== 'number' || days <= 0) throw new Error('Invalid days for bastion_advance_time')

  withBastionStore((bastionStore) => {
    const bastion = findBastionByOwnerName(bastionStore.bastions, ownerName)
    if (!bastion) return postBastionNotFound(stores, action.action, ownerName)
    bastionStore.advanceTime(bastion.id, days)
  })
  return true
}

export function executeBastionIssueOrder(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const ownerName = action.bastionOwner as string
  const facilityName = action.facilityName as string
  const orderType = action.orderType as string
  if (!ownerName || !facilityName || !orderType) throw new Error('Missing bastion order params')

  withBastionStore((bastionStore) => {
    const bastion = findBastionByOwnerName(bastionStore.bastions, ownerName)
    if (!bastion) return postBastionNotFound(stores, action.action, ownerName)
    const allFacilities = [...bastion.basicFacilities, ...bastion.specialFacilities]
    const facility = allFacilities.find((f) => f.name.toLowerCase() === facilityName.toLowerCase())
    if (!facility) return postBastionNotFound(stores, action.action, ownerName)
    bastionStore.issueOrder(
      bastion.id,
      bastion.turns.length > 0 ? bastion.turns[bastion.turns.length - 1].turnNumber : 1,
      facility.id,
      orderType as import('../../types/bastion').BastionOrderType,
      (action.details as string) || ''
    )
  })
  return true
}

export function executeBastionDepositGold(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const ownerName = action.bastionOwner as string
  const amount = action.amount as number
  if (!ownerName || typeof amount !== 'number') throw new Error('Missing bastion deposit params')

  withBastionStore((bastionStore) => {
    const bastion = findBastionByOwnerName(bastionStore.bastions, ownerName)
    if (!bastion) return postBastionNotFound(stores, action.action, ownerName)
    bastionStore.depositGold(bastion.id, amount)
  })
  return true
}

export function executeBastionWithdrawGold(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const ownerName = action.bastionOwner as string
  const amount = action.amount as number
  if (!ownerName || typeof amount !== 'number') throw new Error('Missing bastion withdraw params')

  withBastionStore((bastionStore) => {
    const bastion = findBastionByOwnerName(bastionStore.bastions, ownerName)
    if (!bastion) return postBastionNotFound(stores, action.action, ownerName)
    bastionStore.withdrawGold(bastion.id, amount)
  })
  return true
}

export function executeBastionResolveEvent(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const ownerName = action.bastionOwner as string
  // 08J — the engine ROLLS its own bastion event (DMG table); resolve it and post the actual
  // outcome. Own dynamic import so we can re-read fresh state after the mutations.
  import('../../stores/use-bastion-store')
    .then(({ useBastionStore }) => {
      const bastion = findBastionByOwnerName(useBastionStore.getState().bastions, ownerName)
      if (!bastion) return postBastionNotFound(stores, action.action, ownerName)
      const openTurn = bastion.turns.find((t) => t.eventRoll === null)
      let turnNumber: number
      if (openTurn) {
        turnNumber = openTurn.turnNumber
      } else {
        useBastionStore.getState().startTurn(bastion.id)
        turnNumber = bastion.turns.length > 0 ? Math.max(...bastion.turns.map((t) => t.turnNumber)) + 1 : 1
      }
      useBastionStore.getState().rollAndResolveEvent(bastion.id, turnNumber)
      const fresh = findBastionByOwnerName(useBastionStore.getState().bastions, ownerName)
      const turn = fresh?.turns.find((t) => t.turnNumber === turnNumber)
      postDmChatMessage(
        stores,
        'ai-bastion',
        `🏰 Bastion event for ${ownerName}: ${turn?.eventType ?? 'resolved'}${turn?.eventOutcome ? ` — ${turn.eventOutcome}` : ''}`
      )
    })
    .catch((err) => postDmChatMessage(stores, 'ai-bastion-err', `⚠️ Bastion event failed: ${String(err)}`))
  return true
}

export function executeBastionRecruit(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const ownerName = action.bastionOwner as string
  const facilityName = action.facilityName as string
  const names = action.names as string[]
  if (!ownerName || !facilityName || !Array.isArray(names)) throw new Error('Missing bastion recruit params')

  withBastionStore((bastionStore) => {
    const bastion = findBastionByOwnerName(bastionStore.bastions, ownerName)
    if (!bastion) return postBastionNotFound(stores, action.action, ownerName)
    const allFacilities = [...bastion.basicFacilities, ...bastion.specialFacilities]
    const facility = allFacilities.find((f) => f.name.toLowerCase() === facilityName.toLowerCase())
    if (!facility) return postBastionNotFound(stores, action.action, ownerName)
    bastionStore.recruitDefenders(bastion.id, facility.id, names)
  })
  return true
}

// ── NPC Relationship Tracking ──

export function executeLogNpcInteraction(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const npcName = action.npcName as string
  const summary = action.summary as string
  const attitudeAfter = action.attitudeAfter as string
  if (!npcName || !summary || !attitudeAfter) throw new Error('Missing params for log_npc_interaction')
  const campaignId = gameStore.campaignId
  if (campaignId) {
    window.api.ai.logNpcInteraction?.(campaignId, npcName, summary, attitudeAfter)
  }
  return true
}

// PHASE-25 25B — record a durable entity record (npc/location/item/faction).
export function executeRecordEntity(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const kind = action.kind as string
  const name = action.name as string
  const summary = action.summary as string
  if (!kind || !name || !summary) throw new Error('Missing params for record_entity')
  const campaignId = gameStore.campaignId
  if (campaignId) {
    window.api.ai.upsertEntity?.(campaignId, {
      kind: kind as 'npc' | 'location' | 'item' | 'faction',
      name,
      summary,
      keywords: action.keywords as string[] | undefined,
      source: 'ai'
    })
  }
  return true
}

// ── World-state deltas (PHASE-27 27E) ──
// Engine owns truth: build a flat delta, send it, and surface engine REJECTIONS as a DM-only
// chat note (the executor stays synchronous-boolean; the result is consumed via .then, not awaited).

type WorldDeltaResult = { success: boolean; applied?: boolean; detail?: string; error?: string } | undefined

function noteWorldDeltaResult(stores: StoreAccessors, res: WorldDeltaResult): void {
  if (res && (!res.success || res.applied === false)) {
    postDmChatMessage(
      stores,
      'ai-world-state',
      `World state: ${res.detail ?? res.error ?? 'rejected'}`,
      'system',
      'System'
    )
  }
}

export function executeDiscoverLocation(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  stores: StoreAccessors
): boolean {
  const name = action.name as string
  if (!name) throw new Error('Missing params for discover_location')
  const campaignId = gameStore.campaignId
  if (campaignId) {
    window.api.ai
      .applyWorldDelta?.(campaignId, {
        op: 'discover_location',
        name,
        type: action.type as string | undefined,
        description: action.description as string | undefined,
        connectsTo: action.connectsTo as string | undefined,
        exitLabel: action.exitLabel as string | undefined
      })
      .then((res) => noteWorldDeltaResult(stores, res))
      .catch(() => {})
  }
  return true
}

export function executeMoveParty(action: DmAction, gameStore: GameStoreSnapshot, stores: StoreAccessors): boolean {
  const locationName = action.locationName as string
  if (!locationName) throw new Error('Missing params for move_party')
  const campaignId = gameStore.campaignId
  if (campaignId) {
    window.api.ai
      .applyWorldDelta?.(campaignId, { op: 'move_party', locationName })
      .then((res) => noteWorldDeltaResult(stores, res))
      .catch(() => {})
  }
  return true
}

export function executeLinkLocations(action: DmAction, gameStore: GameStoreSnapshot, stores: StoreAccessors): boolean {
  const fromName = action.fromName as string
  const toName = action.toName as string
  if (!fromName || !toName) throw new Error('Missing params for link_locations')
  const campaignId = gameStore.campaignId
  if (campaignId) {
    window.api.ai
      .applyWorldDelta?.(campaignId, {
        op: 'link_locations',
        fromName,
        toName,
        label: action.label as string | undefined
      })
      .then((res) => noteWorldDeltaResult(stores, res))
      .catch(() => {})
  }
  return true
}

export function executeSetNpcOpinion(action: DmAction, gameStore: GameStoreSnapshot, stores: StoreAccessors): boolean {
  const npcName = action.npcName as string
  const characterName = action.characterName as string
  if (!npcName || !characterName) throw new Error('Missing params for set_npc_opinion')
  const campaignId = gameStore.campaignId
  if (campaignId) {
    window.api.ai
      .applyWorldDelta?.(campaignId, {
        op: 'set_npc_opinion',
        npcName,
        characterName,
        delta: action.delta as number | undefined,
        score: action.score as number | undefined,
        summary: action.summary as string | undefined
      })
      .then((res) => noteWorldDeltaResult(stores, res))
      .catch(() => {})
  }
  return true
}

export function executeRecordFact(action: DmAction, gameStore: GameStoreSnapshot, stores: StoreAccessors): boolean {
  const text = action.text as string
  if (!text) throw new Error('Missing params for record_fact')
  const campaignId = gameStore.campaignId
  if (campaignId) {
    window.api.ai
      .applyWorldDelta?.(campaignId, { op: 'record_fact', text, tags: action.tags as string[] | undefined })
      .then((res) => noteWorldDeltaResult(stores, res))
      .catch(() => {})
  }
  return true
}

export function executeSetNpcRelationship(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const npcName = action.npcName as string
  const targetNpcName = action.targetNpcName as string
  const relationship = action.relationship as string
  const disposition = action.disposition as string
  if (!npcName || !targetNpcName || !relationship || !disposition)
    throw new Error('Missing params for set_npc_relationship')
  const campaignId = gameStore.campaignId
  if (campaignId) {
    window.api.ai.setNpcRelationship?.(campaignId, npcName, targetNpcName, relationship, disposition)
  }
  return true
}

// ── NPC world-state writes (P6.16): faction / location / secret motivation ──
// All three persist to the campaign's NPC personality memory via one IPC channel.

export function executeSetNpcFaction(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const npcName = action.npcName as string
  const faction = action.faction as string
  if (!npcName || !faction) throw new Error('Missing params for set_npc_faction')
  const campaignId = gameStore.campaignId
  if (campaignId) window.api.ai.setNpcFields?.(campaignId, npcName, { faction })
  return true
}

export function executeSetNpcLocation(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const npcName = action.npcName as string
  const location = action.location as string
  if (!npcName || !location) throw new Error('Missing params for set_npc_location')
  const campaignId = gameStore.campaignId
  if (campaignId) window.api.ai.setNpcFields?.(campaignId, npcName, { location })
  return true
}

export function executeSetNpcSecretMotivation(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const npcName = action.npcName as string
  const secretMotivation = action.secretMotivation as string
  if (!npcName || !secretMotivation) throw new Error('Missing params for set_npc_secret_motivation')
  const campaignId = gameStore.campaignId
  if (campaignId) window.api.ai.setNpcFields?.(campaignId, npcName, { secretMotivation })
  return true
}

// ── Quest log & faction reputation (P6.17) — persisted in campaign memory via IPC ──

export function executeUpdateQuestLog(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const operation = action.operation as 'add' | 'update' | 'complete' | 'remove'
  const name = action.name as string
  const description = action.description as string | undefined
  const chapterQuest = action.chapterQuest as boolean | undefined
  if (!operation || !name) throw new Error('Missing params for update_quest_log')
  const campaignId = gameStore.campaignId
  if (campaignId) window.api.ai.updateQuestLog?.(campaignId, operation, name, description, chapterQuest)
  return true
}

// PHASE-28 28B — quest objectives + chapter advancement (fire-and-forget, like update_quest_log).
export function executeUpdateQuestObjective(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const questName = action.questName as string
  const operation = action.operation as 'add' | 'complete' | 'fail' | 'reopen'
  const objective = action.objective as string
  if (!questName || !operation || !objective) throw new Error('Missing params for update_quest_objective')
  const campaignId = gameStore.campaignId
  if (campaignId) window.api.ai.updateQuestObjective?.(campaignId, { questName, operation, objective })
  return true
}

export function executeAdvanceChapter(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const campaignId = gameStore.campaignId
  if (campaignId)
    window.api.ai.advanceChapter?.(campaignId, {
      title: action.title as string | undefined,
      goal: action.goal as string | undefined,
      reason: action.reason as string | undefined
    })
  return true
}

export function executeAdjustFactionStanding(action: DmAction, gameStore: GameStoreSnapshot): boolean {
  const factionName = action.factionName as string
  const delta = action.delta as number
  if (!factionName || typeof delta !== 'number') throw new Error('Missing params for adjust_faction_standing')
  const campaignId = gameStore.campaignId
  if (campaignId) window.api.ai.adjustFactionStanding?.(campaignId, factionName, delta)
  return true
}

export function executeBastionAddCreature(
  action: DmAction,
  _gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const ownerName = action.bastionOwner as string
  const facilityName = action.facilityName as string
  // 08J — actually add a MenagerieCreature to the named facility (was a chat-only no-op).
  withBastionStore((bastionStore) => {
    const bastion = findBastionByOwnerName(bastionStore.bastions, ownerName)
    if (!bastion) return postBastionNotFound(stores, action.action, ownerName)
    const allFacilities = [...bastion.basicFacilities, ...bastion.specialFacilities]
    const facility = allFacilities.find((f) => f.name.toLowerCase() === facilityName.toLowerCase())
    if (!facility) return postBastionNotFound(stores, action.action, ownerName)
    bastionStore.addCreature(bastion.id, facility.id, {
      name: action.creatureName as string,
      creatureType: (action.creatureType as string) ?? 'beast',
      size: (action.size as import('../../types/bastion').MenagerieCreature['size']) ?? 'medium',
      isDefender: (action.isDefender as boolean) ?? false
    })
    postDmChatMessage(stores, 'ai-bastion-cr', `${action.creatureName} added to ${ownerName}'s ${facilityName}.`)
  })
  return true
}

// ── Handouts ──

export function executeShareHandout(
  action: DmAction,
  gameStore: GameStoreSnapshot,
  _activeMap: ActiveMap,
  stores: StoreAccessors
): boolean {
  const title = action.title as string
  const content = action.content as string
  if (!title || !content) throw new Error('Missing title or content for share_handout')

  const handout = {
    id: crypto.randomUUID(),
    title,
    content,
    contentType: ((action.contentType as string) || 'text') as 'text' | 'image',
    visibility: 'all' as const,
    createdAt: Date.now()
  }

  gameStore.addHandout(handout)
  stores.getNetworkStore().getState().sendMessage('dm:share-handout', { handout })
  return true
}
