import type {
  BuyItemPayload,
  ColorChangePayload,
  ColorConfirmPayload,
  HaggleRequestPayload,
  InspectRequestPayload,
  JournalAddPayload,
  JournalDeletePayload,
  JournalUpdatePayload,
  MessageType,
  MoveDeclarePayload,
  NetworkMessage,
  RollResultPayload,
  SellItemPayload,
  ShopItem,
  TimeRequestPayload,
  TradeCancelPayload,
  TradeRequestPayload,
  TradeResponsePayload,
  TurnEndPayload,
  WhisperPayload
} from '../../network'
import {
  broadcastExcluding,
  broadcastMessage,
  getPeerId,
  getPeerInfo,
  PAYLOAD_SCHEMAS,
  sendToPeer,
  updatePeerInfo
} from '../../network'
import { hasPermission } from '../../services/permissions/has-permission'
import type { Character } from '../../types/character'
import type { Character5e } from '../../types/character-5e'
import type { Permission } from '../../types/permissions'
import { useCampaignStore } from '../use-campaign-store'
import { useGameStore } from '../use-game-store'
import { useLobbyStore } from '../use-lobby-store'
import { handleMapPing } from './client-handlers/chat-handlers'
import type { NetworkState } from './index'

// In-memory trade tracking
const pendingTrades = new Map<string, TradeRequestPayload>()

/**
 * Phase 29e: messages a spectator is allowed to send to the host. Anything
 * else gets dropped with a warning. Keep this list narrow — read-only
 * presence + chat is the spectator's surface; gameplay actions are not.
 */
const SPECTATOR_ALLOWED_TYPES = new Set<MessageType>([
  'chat:message',
  'chat:file',
  'chat:whisper',
  'player:typing',
  'player:ready',
  'player:color-confirm',
  'player:color-change',
  // Phase 17d — spectators can preview their picked color the same way
  // players can; just like color-change/confirm this is presence, not gameplay.
  'player:color-preview',
  'player:character-select',
  'ping',
  'pong'
])

/**
 * Phase 29e: inbound message type → required permission. When the sender lacks
 * the key (and a campaign permissions block exists), the host drops the message.
 * Types not listed here fall back to the spectator allow-list gate only.
 */
const MESSAGE_PERMISSION: Partial<Record<MessageType, Permission>> = {
  'dm:kick-player': 'kick_player',
  'dm:ban-player': 'ban_player',
  'dm:promote-codm': 'promote_codm',
  'dm:demote-codm': 'demote_codm',
  // Phase 30e — DM-authority transfer. Reuses the promote_codm key as the
  // defensive inbound gate (only a current DM may hand off authority); the
  // network host is exempt from this check as it is for every other type.
  'dm:transfer-dm': 'promote_codm',
  'dm:role-change': 'change_player_role',
  'player:trade-request': 'edit_party_inventory',
  'player:journal-add': 'manage_journal',
  'player:journal-update': 'manage_journal',
  'player:journal-delete': 'manage_journal',
  // PHASE-09 09D — only a peer with chat_clear (DM / co-DM) may clear chat for everyone.
  'chat:clear': 'chat_clear'
}

/**
 * Handle messages received by the host from connected peers.
 * Routes messages and rebroadcasts as needed.
 */
export function handleHostMessage(
  message: NetworkMessage,
  fromPeerId: string,
  get: () => NetworkState,
  _set: (partial: Partial<NetworkState> | ((state: NetworkState) => Partial<NetworkState>)) => void
): void {
  if (message.senderId && message.senderId !== fromPeerId) {
    console.warn('[host-handlers] Rejecting message (senderId !== connection peer):', {
      type: message.type,
      fromPeerId,
      senderId: message.senderId
    })
    return
  }

  const payloadSchema = PAYLOAD_SCHEMAS[message.type as keyof typeof PAYLOAD_SCHEMAS]
  if (payloadSchema) {
    const pr = payloadSchema.safeParse(message.payload)
    if (!pr.success) {
      console.warn('[host-handlers] Invalid payload for', message.type, pr.error.issues)
      return
    }
  }

  // Phase 29e: spectators may only chat, type, and tweak their own lobby
  // presence — they cannot perform gameplay actions. Drop gameplay-mutating
  // messages from any peer whose `role === 'spectator'`.
  const senderPeer = getPeerInfo(fromPeerId)
  if (senderPeer?.role === 'spectator' && !SPECTATOR_ALLOWED_TYPES.has(message.type)) {
    console.warn('[host-handlers] Dropping gameplay message from spectator:', message.type, fromPeerId)
    return
  }

  // Phase 29e: permission-gated inbound types. Only enforce when the campaign
  // has a permissions block (otherwise legacy behavior: the spectator floor
  // above is the only gate). The host itself is exempt (it doesn't route its own
  // actions through here).
  const requiredKey = MESSAGE_PERMISSION[message.type]
  if (requiredKey && senderPeer) {
    const campaign = useCampaignStore.getState().campaigns.find((c) => c.id === get().campaignId) ?? null
    if (campaign?.permissions && !hasPermission(senderPeer, requiredKey, campaign)) {
      console.warn('[host-handlers] Dropping message; sender lacks permission:', message.type, requiredKey, fromPeerId)
      return
    }
  }

  switch (message.type) {
    case 'player:ready': {
      const readyPayload = message.payload as { isReady?: boolean }
      get().updatePeer(fromPeerId, { isReady: readyPayload.isReady ?? true })
      broadcastExcluding(message, fromPeerId)
      break
    }

    case 'player:character-select': {
      const payload = message.payload as {
        characterId: string | null
        characterName: string | null
        characterData?: unknown
      }
      get().updatePeer(fromPeerId, {
        characterId: payload.characterId,
        characterName: payload.characterName
      })
      // CH-1 — store the player's character host-side so the DM can open it
      // ("no character found" otherwise). Stamp `playerId` to the owning peer so
      // the DM's edit/broadcast guards (`playerId !== 'local'`) treat it as a
      // foreign PC: the edit reaches the player and is NOT persisted into the
      // DM's own library (CH-2). Belt-and-suspenders to `useCharacterSelectBridge`,
      // which only runs while the lobby/in-game view is mounted.
      if (payload.characterId && payload.characterData && typeof payload.characterData === 'object') {
        const stamped = { ...(payload.characterData as Character), playerId: fromPeerId }
        useLobbyStore.getState().setRemoteCharacter(payload.characterId, stamped)
      }
      broadcastExcluding(message, fromPeerId)
      break
    }

    case 'chat:message': {
      broadcastExcluding(message, fromPeerId)
      break
    }

    case 'chat:file': {
      broadcastExcluding(message, fromPeerId)
      break
    }

    case 'chat:clear': {
      // PHASE-09 09D — a co-DM cleared chat: wipe the host's own history, then relay
      // to every other peer so all panels match. (Permission-gated above by chat_clear.)
      useLobbyStore.getState().clearChatHistory()
      broadcastExcluding(message, fromPeerId)
      break
    }

    case 'player:color-change': {
      // Phase 29d: clients should send player:color-confirm instead so the host
      // can enforce uniqueness. We keep this handler for backward-compat (older
      // clients) — but it bypasses the uniqueness check, matching pre-29d behavior.
      const colorPayload = message.payload as ColorChangePayload
      get().updatePeer(fromPeerId, { color: colorPayload.color })
      useLobbyStore.getState().updatePlayer(fromPeerId, {
        color: colorPayload.color,
        colorConfirmed: true,
        // Phase 17d — confirmed color supersedes any uncommitted preview.
        previewColor: null
      })
      updatePeerInfo(fromPeerId, { color: colorPayload.color })
      broadcastExcluding(message, fromPeerId)
      break
    }

    case 'player:color-preview': {
      // Phase 17d — symmetric live color preview. A peer is cycling through
      // swatches before clicking Confirm. Update local lobby store so the
      // host's UI shows the pending swatch dashed/dimmed, then re-broadcast
      // to all other peers (with peerId injected so receivers know whose
      // preview this is — the client-side raw payload only carries the
      // color value).
      const previewPayload = message.payload as { color: string | null }
      useLobbyStore.getState().updatePlayer(fromPeerId, { previewColor: previewPayload.color })
      const senderInfo = getPeerInfo(fromPeerId)
      broadcastMessage({
        type: 'player:color-preview' as MessageType,
        payload: { color: previewPayload.color, peerId: fromPeerId },
        senderId: fromPeerId,
        senderName: senderInfo?.displayName ?? '',
        timestamp: Date.now(),
        sequence: 0
      })
      break
    }

    case 'player:color-confirm': {
      // Phase 29d: authoritative color uniqueness check. If the requested color
      // is held by another peer, reject; otherwise apply + broadcast the
      // authoritative color-change so all clients (including the sender) see
      // the same outcome and set colorConfirmed=true.
      const confirmPayload = message.payload as ColorConfirmPayload
      const players = useLobbyStore.getState().players
      const senderInfo = getPeerInfo(fromPeerId)
      const conflict = players.find((p) => p.peerId !== fromPeerId && p.color === confirmPayload.color)

      if (conflict) {
        // Reject the sender's pick.
        sendToPeer(fromPeerId, {
          type: 'player:color-rejected' as MessageType,
          payload: { color: confirmPayload.color, reason: 'taken' },
          senderId: getPeerId() || '',
          senderName: get().displayName,
          timestamp: Date.now(),
          sequence: 0
        })
        // Surface a system chat note so the DM (and the sender) see the contention.
        useLobbyStore.getState().addChatMessage({
          id: `color-rej-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          senderId: 'system',
          senderName: 'System',
          content: `${senderInfo?.displayName ?? 'A player'}'s color pick was already taken — they'll need to choose a different color.`,
          timestamp: Date.now(),
          isSystem: true
        })
        break
      }

      // Accept: persist locally + broadcast authoritative change.
      get().updatePeer(fromPeerId, { color: confirmPayload.color })
      useLobbyStore.getState().updatePlayer(fromPeerId, {
        color: confirmPayload.color,
        colorConfirmed: true
      })
      updatePeerInfo(fromPeerId, { color: confirmPayload.color })
      broadcastMessage({
        type: 'player:color-change' as MessageType,
        payload: { color: confirmPayload.color },
        senderId: fromPeerId,
        senderName: senderInfo?.displayName ?? '',
        timestamp: Date.now(),
        sequence: 0
      })
      break
    }

    case 'chat:whisper': {
      const payload = message.payload as WhisperPayload
      const localId = getPeerId()

      // If targeted at the host, display it locally
      if (payload.targetPeerId === localId) {
        useLobbyStore.getState().addChatMessage({
          id: `whisper-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          senderId: message.senderId,
          senderName: `${message.senderName} (Whisper)`,
          content: payload.message,
          timestamp: Date.now(),
          isSystem: false
        })
      } else {
        // Forward whisper only to the target, after validating they exist
        const targetInfo = getPeerInfo(payload.targetPeerId)
        if (targetInfo) {
          ;(message.payload as Record<string, unknown>).targetName = targetInfo.displayName
          sendToPeer(payload.targetPeerId, message)
        }
      }
      break
    }

    case 'game:dice-roll': {
      broadcastExcluding(message, fromPeerId)
      break
    }

    case 'game:map-ping': {
      // PHASE-09 09G — render the ping on the host's own map, then relay to the
      // other peers (the default case does NOT relay). Presence-grade, so no
      // MESSAGE_PERMISSION gate — parity with the double-click ping any client renders.
      handleMapPing(message)
      broadcastExcluding(message, fromPeerId)
      break
    }

    case 'player:buy-item': {
      const buyPayload = message.payload as BuyItemPayload
      {
        const gameStore = useGameStore.getState()
        const updatedInventory = gameStore.shopInventory.map((item: ShopItem) => {
          if (item.id !== buyPayload.itemId) return item
          const updates: Partial<ShopItem> = {}
          if (item.quantity > 0) updates.quantity = item.quantity - 1
          if (item.stockRemaining != null && item.stockRemaining > 0) updates.stockRemaining = item.stockRemaining - 1
          return { ...item, ...updates }
        })
        gameStore.setShopInventory(updatedInventory)
        broadcastMessage({
          type: 'dm:shop-update' as MessageType,
          payload: { shopInventory: updatedInventory, shopName: gameStore.shopName },
          senderId: getPeerId() || '',
          senderName: get().displayName,
          timestamp: Date.now(),
          sequence: 0
        })
      }
      broadcastExcluding(message, fromPeerId)
      break
    }
    case 'player:sell-item': {
      const sellPayload = message.payload as SellItemPayload
      {
        const gameStore = useGameStore.getState()
        const existing = gameStore.shopInventory.find(
          (item: ShopItem) => item.name.toLowerCase() === sellPayload.itemName.toLowerCase()
        )
        let updatedInventory: ShopItem[]
        if (existing) {
          updatedInventory = gameStore.shopInventory.map((item: ShopItem) =>
            item.id === existing.id
              ? {
                  ...item,
                  quantity: item.quantity + 1,
                  stockRemaining: item.stockRemaining != null ? item.stockRemaining + 1 : undefined
                }
              : item
          )
        } else {
          const newItem: ShopItem = {
            id: crypto.randomUUID(),
            name: sellPayload.itemName,
            category: 'other',
            price: sellPayload.price,
            quantity: 1,
            shopCategory: 'other'
          }
          updatedInventory = [...gameStore.shopInventory, newItem]
        }
        gameStore.setShopInventory(updatedInventory)
        broadcastMessage({
          type: 'dm:shop-update' as MessageType,
          payload: { shopInventory: updatedInventory, shopName: gameStore.shopName },
          senderId: getPeerId() || '',
          senderName: get().displayName,
          timestamp: Date.now(),
          sequence: 0
        })
      }
      broadcastExcluding(message, fromPeerId)
      break
    }

    case 'player:turn-end': {
      const turnEndPayload = message.payload as TurnEndPayload
      const gs = useGameStore.getState()
      const { initiative } = gs
      if (initiative) {
        const currentEntry = initiative.entries[initiative.currentIndex]
        if (currentEntry && currentEntry.entityId === turnEndPayload.entityId) {
          gs.nextTurn()
          broadcastMessage({
            type: 'game:turn-advance' as MessageType,
            payload: {},
            senderId: getPeerId() || '',
            senderName: get().displayName,
            timestamp: Date.now(),
            sequence: 0
          })
        }
      }
      break
    }

    case 'combat:reaction-response': {
      broadcastExcluding(message, fromPeerId)
      break
    }

    case 'player:trade-request': {
      const payload = message.payload as TradeRequestPayload
      if (payload.fromPeerId !== fromPeerId) {
        console.warn('[host-handlers] trade-request fromPeerId mismatch')
        break
      }
      pendingTrades.set(payload.tradeId, payload)
      // Forward to the target player
      sendToPeer(payload.toPeerId, message)
      break
    }

    case 'player:trade-response': {
      const payload = message.payload as TradeResponsePayload
      if (payload.fromPeerId !== fromPeerId) {
        console.warn('[host-handlers] trade-response fromPeerId mismatch')
        break
      }
      const trade = pendingTrades.get(payload.tradeId)
      if (!trade) break
      pendingTrades.delete(payload.tradeId)

      const lobby = useLobbyStore.getState()
      const remoteChars = lobby.remoteCharacters
      const fromChar = remoteChars[trade.fromPeerId]
      const toChar = remoteChars[trade.toPeerId]

      if (payload.accepted && fromChar && toChar) {
        const result = validateAndExecuteTrade(trade, fromChar, toChar)
        if (result.success && result.fromChar && result.toChar) {
          // Update remote characters
          lobby.setRemoteCharacter(trade.fromPeerId, result.fromChar as Character5e)
          lobby.setRemoteCharacter(trade.toPeerId, result.toChar as Character5e)
          // Notify both parties
          const resultMsg = {
            tradeId: trade.tradeId,
            accepted: true,
            fromPlayerName: trade.fromPlayerName,
            toPlayerName: getPeerInfo(trade.toPeerId)?.displayName ?? 'Unknown',
            summary: result.summary
          }
          const tradeResultMessage: NetworkMessage = {
            type: 'dm:trade-result' as MessageType,
            payload: resultMsg,
            senderId: getPeerId() || '',
            senderName: get().displayName,
            timestamp: Date.now(),
            sequence: 0
          }
          sendToPeer(trade.fromPeerId, tradeResultMessage)
          sendToPeer(trade.toPeerId, tradeResultMessage)
          // Send updated character data back
          sendToPeer(trade.fromPeerId, {
            type: 'dm:character-update' as MessageType,
            payload: { characterId: (result.fromChar as Record<string, unknown>).id, characterData: result.fromChar },
            senderId: getPeerId() || '',
            senderName: get().displayName,
            timestamp: Date.now(),
            sequence: 0
          })
          sendToPeer(trade.toPeerId, {
            type: 'dm:character-update' as MessageType,
            payload: { characterId: (result.toChar as Record<string, unknown>).id, characterData: result.toChar },
            senderId: getPeerId() || '',
            senderName: get().displayName,
            timestamp: Date.now(),
            sequence: 0
          })
        }
      } else {
        // Declined
        const resultMsg = {
          tradeId: trade.tradeId,
          accepted: false,
          fromPlayerName: trade.fromPlayerName,
          toPlayerName: getPeerInfo(trade.toPeerId)?.displayName ?? 'Unknown',
          summary: 'Trade declined.'
        }
        const tradeResultMessage: NetworkMessage = {
          type: 'dm:trade-result' as MessageType,
          payload: resultMsg,
          senderId: getPeerId() || '',
          senderName: get().displayName,
          timestamp: Date.now(),
          sequence: 0
        }
        sendToPeer(trade.fromPeerId, tradeResultMessage)
        sendToPeer(trade.toPeerId, tradeResultMessage)
      }
      break
    }

    case 'player:trade-cancel': {
      const payload = message.payload as TradeCancelPayload
      const trade = pendingTrades.get(payload.tradeId)
      if (trade) {
        pendingTrades.delete(payload.tradeId)
        const counterpartId = fromPeerId === trade.fromPeerId ? trade.toPeerId : trade.fromPeerId
        sendToPeer(counterpartId, message)
      }
      break
    }

    case 'player:journal-add': {
      const payload = message.payload as JournalAddPayload
      useGameStore.getState().addJournalEntry(payload.entry)
      broadcastExcluding(message, fromPeerId)
      break
    }

    case 'player:journal-update': {
      const payload = message.payload as JournalUpdatePayload
      const updates: Record<string, unknown> = {}
      if (payload.title !== undefined) updates.title = payload.title
      if (payload.content !== undefined) updates.content = payload.content
      if (payload.visibility !== undefined) updates.visibility = payload.visibility
      useGameStore
        .getState()
        .updateJournalEntry(
          payload.entryId,
          updates as Partial<
            Pick<import('../../types/game-state').SharedJournalEntry, 'title' | 'content' | 'visibility'>
          >
        )
      broadcastExcluding(message, fromPeerId)
      break
    }

    case 'player:journal-delete': {
      const payload = message.payload as JournalDeletePayload
      useGameStore.getState().deleteJournalEntry(payload.entryId)
      broadcastExcluding(message, fromPeerId)
      break
    }

    // --- Group roll result from player ---
    case 'player:roll-result': {
      const payload = message.payload as RollResultPayload
      useGameStore.getState().addGroupRollResult(payload)
      break
    }

    case 'player:inspect-request': {
      const payload = message.payload as InspectRequestPayload
      if (payload.requesterPeerId !== fromPeerId) {
        console.warn('[host-handlers] inspect-request requesterPeerId mismatch')
        break
      }
      const lobby = useLobbyStore.getState()
      // Try to find the character from remote characters
      let charData: unknown = null
      for (const char of Object.values(lobby.remoteCharacters)) {
        if (char.id === payload.characterId) {
          charData = char
          break
        }
      }
      if (charData) {
        sendToPeer(payload.requesterPeerId, {
          type: 'dm:inspect-response' as MessageType,
          payload: {
            characterId: payload.characterId,
            characterData: charData,
            targetPeerId: payload.requesterPeerId
          },
          senderId: getPeerId() || '',
          senderName: get().displayName,
          timestamp: Date.now(),
          sequence: 0
        })
      }
      break
    }

    case 'player:haggle-request': {
      const payload = message.payload as HaggleRequestPayload
      useLobbyStore.getState().addChatMessage({
        id: `sys-haggle-req-${Date.now()}`,
        senderId: message.senderId,
        senderName: 'System',
        content: `🏪 ${message.senderName} is haggling for ${payload.itemName} (Persuasion: ${payload.persuasionTotal})`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    case 'player:move-declare': {
      const _payload = message.payload as MoveDeclarePayload
      broadcastExcluding(message, fromPeerId)
      break
    }

    case 'pong': {
      const payload = message.payload as { timestamp?: number }
      if (payload.timestamp) {
        const latencyMs = Date.now() - payload.timestamp
        get().updatePeer(fromPeerId, { latencyMs })
      }
      break
    }

    case 'player:time-request': {
      const payload = message.payload as TimeRequestPayload
      useLobbyStore.getState().addChatMessage({
        id: `sys-time-req-${Date.now()}`,
        senderId: message.senderId,
        senderName: 'System',
        content: `🕐 ${payload.requesterName} is requesting the current in-game time`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    case 'player:typing': {
      broadcastExcluding(message, fromPeerId)
      break
    }

    default: {
      // Other messages from clients get rebroadcast by default
      // The host can decide which to relay
      break
    }
  }
}

/** Validate items/gold and execute a trade between two characters */
function validateAndExecuteTrade(
  trade: TradeRequestPayload,
  fromCharRaw: unknown,
  toCharRaw: unknown
): { success: boolean; fromChar?: unknown; toChar?: unknown; summary: string } {
  const fromChar = structuredClone(fromCharRaw) as Record<string, unknown>
  const toChar = structuredClone(toCharRaw) as Record<string, unknown>

  const fromEquip = (fromChar.equipment ?? []) as Array<{ name: string; quantity?: number; description?: string }>
  const toEquip = (toChar.equipment ?? []) as Array<{ name: string; quantity?: number; description?: string }>

  // Validate offered items exist with sufficient quantity
  for (const item of trade.offeredItems) {
    const found = fromEquip.find((e) => e.name.toLowerCase() === item.name.toLowerCase())
    if (!found || (found.quantity ?? 1) < item.quantity) {
      return { success: false, summary: `${trade.fromPlayerName} doesn't have enough ${item.name}.` }
    }
  }

  // Validate requested items exist with sufficient quantity
  for (const item of trade.requestedItems) {
    const found = toEquip.find((e) => e.name.toLowerCase() === item.name.toLowerCase())
    if (!found || (found.quantity ?? 1) < item.quantity) {
      return { success: false, summary: `Trade target doesn't have enough ${item.name}.` }
    }
  }

  // Validate gold (use currency.cp or a flat currency object)
  const fromCurrency = (fromChar.currency ?? { cp: 0, sp: 0, gp: 0, pp: 0 }) as Record<string, number>
  const toCurrency = (toChar.currency ?? { cp: 0, sp: 0, gp: 0, pp: 0 }) as Record<string, number>
  const fromTotalCp =
    (fromCurrency.cp ?? 0) + (fromCurrency.sp ?? 0) * 10 + (fromCurrency.gp ?? 0) * 100 + (fromCurrency.pp ?? 0) * 1000
  const toTotalCp =
    (toCurrency.cp ?? 0) + (toCurrency.sp ?? 0) * 10 + (toCurrency.gp ?? 0) * 100 + (toCurrency.pp ?? 0) * 1000

  if (trade.offeredGold > 0 && fromTotalCp < trade.offeredGold) {
    return { success: false, summary: `${trade.fromPlayerName} doesn't have enough gold.` }
  }
  if (trade.requestedGold > 0 && toTotalCp < trade.requestedGold) {
    return { success: false, summary: `Trade target doesn't have enough gold.` }
  }

  // Execute item transfers
  for (const item of trade.offeredItems) {
    const idx = fromEquip.findIndex((e) => e.name.toLowerCase() === item.name.toLowerCase())
    if (idx !== -1) {
      const existing = fromEquip[idx]
      if ((existing.quantity ?? 1) <= item.quantity) {
        fromEquip.splice(idx, 1)
      } else {
        existing.quantity = (existing.quantity ?? 1) - item.quantity
      }
    }
    const toIdx = toEquip.findIndex((e) => e.name.toLowerCase() === item.name.toLowerCase())
    if (toIdx !== -1) {
      toEquip[toIdx].quantity = (toEquip[toIdx].quantity ?? 1) + item.quantity
    } else {
      toEquip.push({ name: item.name, quantity: item.quantity, description: item.description })
    }
  }

  for (const item of trade.requestedItems) {
    const idx = toEquip.findIndex((e) => e.name.toLowerCase() === item.name.toLowerCase())
    if (idx !== -1) {
      const existing = toEquip[idx]
      if ((existing.quantity ?? 1) <= item.quantity) {
        toEquip.splice(idx, 1)
      } else {
        existing.quantity = (existing.quantity ?? 1) - item.quantity
      }
    }
    const fromIdx = fromEquip.findIndex((e) => e.name.toLowerCase() === item.name.toLowerCase())
    if (fromIdx !== -1) {
      fromEquip[fromIdx].quantity = (fromEquip[fromIdx].quantity ?? 1) + item.quantity
    } else {
      fromEquip.push({ name: item.name, quantity: item.quantity })
    }
  }

  // Execute gold transfers (in copper pieces)
  if (trade.offeredGold > 0) {
    fromCurrency.gp = (fromCurrency.gp ?? 0) - Math.floor(trade.offeredGold / 100)
    fromCurrency.cp = (fromCurrency.cp ?? 0) - (trade.offeredGold % 100)
    toCurrency.gp = (toCurrency.gp ?? 0) + Math.floor(trade.offeredGold / 100)
    toCurrency.cp = (toCurrency.cp ?? 0) + (trade.offeredGold % 100)
  }
  if (trade.requestedGold > 0) {
    toCurrency.gp = (toCurrency.gp ?? 0) - Math.floor(trade.requestedGold / 100)
    toCurrency.cp = (toCurrency.cp ?? 0) - (trade.requestedGold % 100)
    fromCurrency.gp = (fromCurrency.gp ?? 0) + Math.floor(trade.requestedGold / 100)
    fromCurrency.cp = (fromCurrency.cp ?? 0) + (trade.requestedGold % 100)
  }

  fromChar.equipment = fromEquip
  fromChar.currency = fromCurrency
  toChar.equipment = toEquip
  toChar.currency = toCurrency

  const parts: string[] = []
  if (trade.offeredItems.length > 0)
    parts.push(`${trade.offeredItems.map((i) => `${i.quantity}x ${i.name}`).join(', ')}`)
  if (trade.offeredGold > 0) parts.push(`${Math.floor(trade.offeredGold / 100)} gp`)
  const summary = parts.length > 0 ? `Trade complete: ${parts.join(' + ')} exchanged.` : 'Trade complete.'

  return { success: true, fromChar, toChar, summary }
}
