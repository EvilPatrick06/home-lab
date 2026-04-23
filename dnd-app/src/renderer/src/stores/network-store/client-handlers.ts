import type {
  AnnouncementPayload,
  CharacterUpdatePayload,
  ChatTimeoutPayload,
  CoDMPayload,
  ColorChangePayload,
  ConditionUpdatePayload,
  DiceResultPayload,
  DiceRevealPayload,
  DiceRoll3dPayload,
  DiceRollHiddenPayload,
  DrawingAddPayload,
  DrawingRemovePayload,
  DrawingsClearPayload,
  FileSharingPayload,
  FogRevealPayload,
  GameStateFullPayload,
  HaggleResponsePayload,
  HandoutPayload,
  HandoutSharePayload,
  InspectResponsePayload,
  JournalAddPayload,
  JournalDeletePayload,
  JournalSyncPayload,
  JournalUpdatePayload,
  LootAwardPayload,
  MacroPushPayload,
  MapChangePayload,
  MapPingPayload,
  NarrationPayload,
  NetworkGameState,
  NetworkMessage,
  PeerInfo,
  PlayAmbientPayload,
  PlaySoundPayload,
  ReactionPromptPayload,
  RollRequestPayload,
  ShopUpdatePayload,
  SlowModePayload,
  TimerStartPayload,
  TimeSharePayload,
  TimeSyncPayload,
  TokenMovePayload,
  TradeCancelPayload,
  TradeRequestPayload,
  TradeResultPayload,
  WhisperPayload,
  WhisperPlayerPayload,
  XpAwardPayload
} from '../../network'
import {
  playAmbient as playAmbientSound,
  play as playSound,
  setAmbientVolume,
  stopAmbient
} from '../../services/sound-manager'
import { useGameStore } from '../use-game-store'
import { useLobbyStore } from '../use-lobby-store'
import { useMacroStore } from '../use-macro-store'
import type { NetworkState } from './index'

/** Apply a partial game state update from the network */
function applyGameState(data: Record<string, unknown>): void {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return
  // Prototype pollution protection
  if ('__proto__' in data || 'constructor' in data || 'prototype' in data) {
    console.warn('[Network] Blocked state update with unsafe prototype keys')
    return
  }
  useGameStore.getState().loadGameState(data)
}

/** Handle granular game:state-update messages with add/remove/update operations */
function handleGameStateUpdate(payload: Record<string, unknown>): void {
  const gs = useGameStore.getState()

  if (payload.addToken) {
    const { mapId, token } = payload.addToken as { mapId: string; token: import('../../types/map').MapToken }
    gs.addToken(mapId, token)
    return
  }

  if (payload.removeToken) {
    const { mapId, tokenId } = payload.removeToken as { mapId: string; tokenId: string }
    gs.removeToken(mapId, tokenId)
    return
  }

  if (payload.updateToken) {
    const { mapId, tokenId, updates } = payload.updateToken as {
      mapId: string
      tokenId: string
      updates: Partial<import('../../types/map').MapToken>
    }
    gs.updateToken(mapId, tokenId, updates)
    return
  }

  if (payload.addMap) {
    gs.addMap(payload.addMap as import('../../types/map').GameMap)
    return
  }

  if (payload.wallSegments) {
    const { mapId, segments } = payload.wallSegments as {
      mapId: string
      segments: import('../../types/map').WallSegment[]
    }
    const maps = gs.maps.map((m) => (m.id === mapId ? { ...m, wallSegments: segments } : m))
    useGameStore.setState({ maps })
    return
  }

  // Generic partial state update
  applyGameState(payload)
}

/**
 * Handle messages received by a client from the host.
 * Applies game state updates, peer changes, and DM actions.
 */
export function handleClientMessage(
  message: NetworkMessage,
  get: () => NetworkState,
  set: (partial: Partial<NetworkState> | ((state: NetworkState) => Partial<NetworkState>)) => void
): void {
  switch (message.type) {
    case 'game:state-full': {
      const payload = message.payload as GameStateFullPayload
      const updates: Partial<NetworkState> = { peers: payload.peers }
      if (payload.campaignId) {
        updates.campaignId = payload.campaignId
      }
      set(updates)
      if (payload.gameState) {
        // Convert maps with imageData: use imageData as imagePath for client rendering
        const gs = payload.gameState as NetworkGameState
        if (gs.maps) {
          gs.maps = gs.maps.map((m) => ({
            ...m,
            imagePath: m.imageData || m.imagePath
          }))
        }
        applyGameState(gs as unknown as Record<string, unknown>)
        // Apply shop state if present
        if (gs.shopOpen) {
          useGameStore.getState().openShop(gs.shopName)
          if (gs.shopInventory) useGameStore.getState().setShopInventory(gs.shopInventory)
        }
      }
      break
    }

    case 'player:join': {
      const payload = message.payload as PeerInfo & { displayName: string }
      const newPeer: PeerInfo = {
        peerId: payload.peerId || message.senderId,
        displayName: payload.displayName,
        characterId: payload.characterId || null,
        characterName: payload.characterName || null,
        isReady: false,
        isHost: false
      }
      get().addPeer(newPeer)
      break
    }

    case 'player:leave': {
      const payload = message.payload as { peerId?: string }
      const peerId = payload.peerId || message.senderId
      get().removePeer(peerId)
      break
    }

    case 'player:ready': {
      const readyPayload = message.payload as { isReady?: boolean }
      get().updatePeer(message.senderId, { isReady: readyPayload.isReady ?? true })
      break
    }

    case 'player:character-select': {
      const payload = message.payload as { characterId: string | null; characterName: string | null }
      get().updatePeer(message.senderId, {
        characterId: payload.characterId,
        characterName: payload.characterName
      })
      break
    }

    case 'dm:kick-player': {
      // Already handled in client-manager, but just in case
      set({
        connectionState: 'disconnected',
        role: 'none',
        campaignId: null,
        peers: [],
        error: 'You were kicked from the game',
        disconnectReason: 'kicked'
      })
      break
    }

    case 'dm:ban-player': {
      set({
        connectionState: 'disconnected',
        role: 'none',
        campaignId: null,
        peers: [],
        error: 'You were banned from the game',
        disconnectReason: 'banned'
      })
      break
    }

    case 'dm:promote-codm': {
      const payload = message.payload as CoDMPayload
      get().updatePeer(payload.peerId, { isCoDM: payload.isCoDM })
      useLobbyStore.getState().updatePlayer(payload.peerId, { isCoDM: payload.isCoDM })
      break
    }

    case 'dm:demote-codm': {
      const payload = message.payload as CoDMPayload
      get().updatePeer(payload.peerId, { isCoDM: false })
      useLobbyStore.getState().updatePlayer(payload.peerId, { isCoDM: false })
      break
    }

    case 'player:color-change': {
      const payload = message.payload as ColorChangePayload
      get().updatePeer(message.senderId, { color: payload.color })
      useLobbyStore.getState().updatePlayer(message.senderId, { color: payload.color })
      break
    }

    case 'dm:game-end': {
      set({
        connectionState: 'disconnected',
        role: 'none',
        campaignId: null,
        peers: [],
        error: 'The game session has ended'
      })
      break
    }

    // --- Game state sync messages (host -> client) ---

    case 'dm:token-move': {
      const payload = message.payload as TokenMovePayload
      useGameStore.getState().moveToken(payload.mapId, payload.tokenId, payload.gridX, payload.gridY)
      break
    }

    case 'dm:fog-reveal': {
      const payload = message.payload as FogRevealPayload & {
        fogOfWar?: { revealedCells: Array<{ x: number; y: number }>; enabled?: boolean }
      }
      if (payload.fogOfWar) {
        const gs = useGameStore.getState()
        const maps = gs.maps.map((m) =>
          m.id === payload.mapId ? { ...m, fogOfWar: { enabled: m.fogOfWar.enabled, ...payload.fogOfWar! } } : m
        )
        useGameStore.setState({ maps })
      } else if (payload.reveal) {
        useGameStore.getState().revealFog(payload.mapId, payload.cells)
      } else {
        useGameStore.getState().hideFog(payload.mapId, payload.cells)
      }
      break
    }

    case 'dm:drawing-add': {
      const payload = message.payload as DrawingAddPayload
      useGameStore.getState().addDrawing(payload.mapId, payload.drawing as import('../../types/map').DrawingData)
      break
    }

    case 'dm:drawing-remove': {
      const payload = message.payload as DrawingRemovePayload
      useGameStore.getState().removeDrawing(payload.mapId, payload.drawingId)
      break
    }

    case 'dm:drawings-clear': {
      const payload = message.payload as DrawingsClearPayload
      useGameStore.getState().clearDrawings(payload.mapId)
      break
    }

    case 'dm:region-add': {
      const payload = message.payload as { mapId: string; region: import('../../types/map').SceneRegion }
      useGameStore.getState().addRegion(payload.mapId, payload.region)
      break
    }

    case 'dm:region-remove': {
      const payload = message.payload as { mapId: string; regionId: string }
      useGameStore.getState().removeRegion(payload.mapId, payload.regionId)
      break
    }

    case 'dm:region-update': {
      const payload = message.payload as {
        mapId: string
        regionId: string
        updates: Partial<import('../../types/map').SceneRegion>
      }
      useGameStore.getState().updateRegion(payload.mapId, payload.regionId, payload.updates)
      break
    }

    case 'dm:map-change': {
      const payload = message.payload as MapChangePayload
      if (payload.mapData) {
        const gs = useGameStore.getState()
        const existing = gs.maps.find((m) => m.id === payload.mapId)
        if (existing) {
          const maps = gs.maps.map((m) =>
            m.id === payload.mapId
              ? {
                  ...m,
                  ...(payload.mapData as unknown as Record<string, unknown>),
                  imagePath: payload.mapData!.imageData || m.imagePath
                }
              : m
          ) as import('../../types/map').GameMap[]
          useGameStore.setState({ maps })
        } else {
          const newMap = {
            ...payload.mapData,
            imagePath: payload.mapData.imageData || payload.mapData.imagePath
          } as unknown as import('../../types/map').GameMap
          gs.addMap(newMap)
        }
      }
      useGameStore.getState().setActiveMap(payload.mapId)
      break
    }

    case 'dm:initiative-update': {
      const payload = message.payload as {
        initiative: unknown
        round: number
        turnMode?: 'initiative' | 'free'
      }
      applyGameState({
        initiative: payload.initiative,
        round: payload.round,
        ...(payload.turnMode ? { turnMode: payload.turnMode } : {})
      } as Record<string, unknown>)
      break
    }

    case 'dm:condition-update': {
      const payload = message.payload as ConditionUpdatePayload & { conditions?: unknown[] }
      if (payload.conditions) {
        applyGameState({ conditions: payload.conditions } as Record<string, unknown>)
      }
      break
    }

    case 'game:state-update': {
      const payload = message.payload as Record<string, unknown>
      handleGameStateUpdate(payload)
      break
    }

    case 'game:turn-advance': {
      useGameStore.getState().nextTurn()
      break
    }

    case 'dm:slow-mode': {
      const payload = message.payload as SlowModePayload
      useLobbyStore.getState().setSlowMode(payload.seconds)
      break
    }

    case 'dm:file-sharing': {
      const payload = message.payload as FileSharingPayload
      useLobbyStore.getState().setFileSharingEnabled(payload.enabled)
      break
    }

    case 'chat:whisper': {
      const payload = message.payload as WhisperPayload
      useLobbyStore.getState().addChatMessage({
        id: `whisper-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: message.senderId,
        senderName: `${message.senderName} (Whisper)`,
        content: payload.message,
        timestamp: Date.now(),
        isSystem: false
      })
      break
    }

    case 'dm:vision-update': {
      const payload = message.payload as { partyVisionCells: Array<{ x: number; y: number }> }
      useGameStore.getState().setPartyVisionCells(payload.partyVisionCells)
      break
    }

    case 'combat:reaction-prompt': {
      const payload = message.payload as ReactionPromptPayload
      useGameStore.getState().setPendingReactionPrompt({
        promptId: payload.promptId,
        targetEntityId: payload.targetEntityId,
        triggerType: payload.triggerType,
        triggerContext: payload.triggerContext
      })
      break
    }

    case 'pong': {
      const payload = message.payload as { timestamp?: number }
      if (payload.timestamp) {
        const rtt = Date.now() - payload.timestamp
        set({ latencyMs: rtt })
      }
      break
    }

    // --- Trade messages ---
    case 'player:trade-request': {
      const payload = message.payload as TradeRequestPayload
      useGameStore.getState().setPendingTradeOffer(payload)
      break
    }

    case 'player:trade-cancel': {
      const _payload = message.payload as TradeCancelPayload
      useGameStore.getState().clearPendingTradeOffer()
      break
    }

    case 'dm:trade-result': {
      const payload = message.payload as TradeResultPayload
      useGameStore.getState().setPendingTradeResult({
        tradeId: payload.tradeId,
        accepted: payload.accepted,
        summary: payload.summary
      })
      useGameStore.getState().clearPendingTradeOffer()
      break
    }

    // --- Journal messages ---
    case 'player:journal-add': {
      const payload = message.payload as JournalAddPayload
      useGameStore.getState().addJournalEntry(payload.entry)
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
      break
    }

    case 'player:journal-delete': {
      const payload = message.payload as JournalDeletePayload
      useGameStore.getState().deleteJournalEntry(payload.entryId)
      break
    }

    case 'dm:journal-sync': {
      const payload = message.payload as JournalSyncPayload
      useGameStore.getState().setSharedJournal(payload.entries)
      break
    }

    // --- Inspect messages ---
    case 'dm:inspect-response': {
      const payload = message.payload as InspectResponsePayload
      const localId = get().localPeerId
      if (payload.targetPeerId === localId) {
        useGameStore.getState().setInspectedCharacter(payload.characterData)
      }
      break
    }

    // --- Group roll request from DM ---
    case 'dm:roll-request': {
      const payload = message.payload as RollRequestPayload
      useGameStore.getState().setPendingGroupRoll({
        id: payload.id ?? `roll-${Date.now()}`,
        type: payload.type,
        ability: payload.ability,
        skill: payload.skill,
        dc: payload.dc,
        isSecret: payload.isSecret,
        scope: 'all',
        targetEntityIds: []
      })
      break
    }

    // --- Macro sharing ---
    case 'dm:push-macros': {
      const payload = message.payload as MacroPushPayload
      useMacroStore.getState().importMacros(payload.macros)
      useLobbyStore.getState().addChatMessage({
        id: `sys-macros-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        content: `DM shared ${payload.macros.length} macro${payload.macros.length === 1 ? '' : 's'} with the party!`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    // --- DM action messages ---

    case 'dm:chat-timeout': {
      const payload = message.payload as ChatTimeoutPayload
      useLobbyStore.getState().setChatMutedUntil(Date.now() + payload.duration * 1000)
      break
    }

    case 'dm:loot-award': {
      const payload = message.payload as LootAwardPayload
      const parts: string[] = []
      if (payload.items.length > 0) {
        parts.push(payload.items.map((i) => `${i.quantity}x ${i.name}`).join(', '))
      }
      if (payload.currency) {
        const currParts: string[] = []
        if (payload.currency.pp) currParts.push(`${payload.currency.pp} pp`)
        if (payload.currency.gp) currParts.push(`${payload.currency.gp} gp`)
        if (payload.currency.sp) currParts.push(`${payload.currency.sp} sp`)
        if (payload.currency.cp) currParts.push(`${payload.currency.cp} cp`)
        if (currParts.length > 0) parts.push(currParts.join(', '))
      }
      useLobbyStore.getState().addChatMessage({
        id: `sys-loot-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        content: `🎁 Loot awarded: ${parts.join(' + ') || 'nothing'}`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    case 'dm:xp-award': {
      const payload = message.payload as XpAwardPayload
      const reason = payload.reason ? ` — ${payload.reason}` : ''
      useLobbyStore.getState().addChatMessage({
        id: `sys-xp-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        content: `⭐ ${payload.xp} XP awarded${reason}`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    case 'dm:time-sync': {
      const payload = message.payload as TimeSyncPayload
      applyGameState({ inGameTime: { totalSeconds: payload.totalSeconds } })
      break
    }

    case 'dm:time-share': {
      const payload = message.payload as TimeSharePayload
      useLobbyStore.getState().addChatMessage({
        id: `sys-time-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        content: `🕐 Current time: ${payload.formattedTime}`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    case 'dm:timer-start': {
      const payload = message.payload as TimerStartPayload
      useLobbyStore.getState().addChatMessage({
        id: `sys-timer-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        content: `⏱️ Timer started: ${payload.seconds}s for ${payload.targetName}`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    case 'dm:timer-stop': {
      useLobbyStore.getState().addChatMessage({
        id: `sys-timer-stop-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        content: '⏱️ Timer stopped',
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    case 'dm:narration': {
      const payload = message.payload as NarrationPayload
      useLobbyStore.getState().addChatMessage({
        id: `narration-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: message.senderId,
        senderName: payload.style === 'dramatic' ? '🎭 Narrator' : 'DM',
        content: payload.text,
        timestamp: Date.now(),
        isSystem: payload.style === 'dramatic'
      })
      break
    }

    case 'dm:play-sound': {
      const payload = message.payload as PlaySoundPayload
      try {
        playSound(payload.event as Parameters<typeof playSound>[0])
      } catch {
        // Sound system not available
      }
      break
    }

    case 'dm:play-ambient': {
      const payload = message.payload as PlayAmbientPayload
      try {
        if (payload.volume != null) setAmbientVolume(payload.volume)
        playAmbientSound(payload.ambient as Parameters<typeof playAmbientSound>[0])
      } catch {
        // Sound system not available
      }
      break
    }

    case 'dm:stop-ambient': {
      try {
        stopAmbient()
      } catch {
        // Sound system not available
      }
      break
    }

    case 'dm:handout': {
      const payload = message.payload as HandoutPayload
      useGameStore.getState().addHandout({
        id: payload.id,
        title: payload.title,
        contentType: payload.imagePath ? 'image' : 'text',
        content: payload.imagePath || payload.content,
        visibility: 'all',
        createdAt: Date.now()
      })
      break
    }

    case 'dm:share-handout': {
      const payload = message.payload as HandoutSharePayload
      useGameStore.getState().addHandout(payload.handout)
      break
    }

    case 'dm:light-source-update': {
      const payload = message.payload as Record<string, unknown>
      applyGameState(payload)
      break
    }

    case 'dm:whisper-player': {
      const payload = message.payload as WhisperPlayerPayload
      useLobbyStore.getState().addChatMessage({
        id: `whisper-dm-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: message.senderId,
        senderName: `${message.senderName} (DM Whisper)`,
        content: payload.message,
        timestamp: Date.now(),
        isSystem: false
      })
      break
    }

    case 'dm:unban-player': {
      // No action needed client-side
      break
    }

    case 'dm:haggle-response': {
      const payload = message.payload as HaggleResponsePayload
      const result = payload.accepted
        ? `Haggle successful! ${payload.discountPercent}% discount applied.`
        : 'The shopkeeper rejected your offer.'
      useLobbyStore.getState().addChatMessage({
        id: `sys-haggle-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        content: `🏪 ${result}`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    case 'dm:shop-update': {
      const payload = message.payload as ShopUpdatePayload
      useGameStore.getState().setShopInventory(payload.shopInventory)
      if (payload.shopName) {
        useGameStore.getState().openShop(payload.shopName)
      }
      break
    }

    case 'dm:game-start': {
      useLobbyStore.getState().addChatMessage({
        id: `sys-game-start-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        content: '🎮 The game has started!',
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    case 'dm:character-update': {
      const payload = message.payload as CharacterUpdatePayload
      if (payload.characterData) {
        useLobbyStore
          .getState()
          .setRemoteCharacter(
            payload.characterId,
            payload.characterData as import('../../types/character-5e').Character5e
          )
      }
      break
    }

    // --- Game messages ---

    case 'game:dice-result': {
      const payload = message.payload as DiceResultPayload
      const critText = payload.isCritical ? ' 💥 Critical!' : payload.isFumble ? ' 😰 Fumble!' : ''
      useLobbyStore.getState().addChatMessage({
        id: `dice-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: message.senderId,
        senderName: payload.rollerName,
        content: `🎲 ${payload.formula} = ${payload.total}${payload.reason ? ` (${payload.reason})` : ''}${critText}`,
        timestamp: Date.now(),
        isSystem: false,
        isDiceRoll: true,
        diceResult: { formula: payload.formula, total: payload.total, rolls: payload.rolls }
      })
      break
    }

    case 'game:dice-reveal': {
      const payload = message.payload as DiceRevealPayload
      useLobbyStore.getState().addChatMessage({
        id: `dice-reveal-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: message.senderId,
        senderName: payload.rollerName,
        content: `🎲 Revealed: ${payload.formula} = ${payload.total}${payload.label ? ` (${payload.label})` : ''}`,
        timestamp: Date.now(),
        isSystem: false,
        isDiceRoll: true,
        diceResult: { formula: payload.formula, total: payload.total, rolls: payload.rolls }
      })
      break
    }

    case 'game:dice-roll-hidden': {
      const payload = message.payload as DiceRollHiddenPayload
      useLobbyStore.getState().addChatMessage({
        id: `dice-hidden-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: message.senderId,
        senderName: payload.rollerName,
        content: `🎲 ${payload.rollerName} made a hidden roll...`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    case 'game:dice-roll-3d': {
      const payload = message.payload as DiceRoll3dPayload
      if (!payload.isSecret) {
        useLobbyStore.getState().addChatMessage({
          id: `dice-3d-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          senderId: message.senderId,
          senderName: payload.rollerName,
          content: `🎲 ${payload.formula} = ${payload.total}${payload.reason ? ` (${payload.reason})` : ''}`,
          timestamp: Date.now(),
          isSystem: false,
          isDiceRoll: true,
          diceResult: { formula: payload.formula, total: payload.total, rolls: payload.results }
        })
      }
      break
    }

    case 'game:map-ping': {
      const payload = message.payload as MapPingPayload
      useLobbyStore.getState().addChatMessage({
        id: `sys-ping-${Date.now()}`,
        senderId: message.senderId,
        senderName: 'System',
        content: `📍 ${message.senderName} pinged the map at (${payload.gridX}, ${payload.gridY})${payload.label ? `: ${payload.label}` : ''}`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    case 'game:concentration-check': {
      const payload = message.payload as { damage?: number }
      useLobbyStore.getState().addChatMessage({
        id: `sys-conc-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        content: `⚡ Concentration check required!${payload.damage ? ` DC ${Math.max(10, Math.floor(payload.damage / 2))}` : ''}`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    case 'game:opportunity-attack': {
      const payload = message.payload as { targetName?: string; attackerName?: string }
      useLobbyStore.getState().addChatMessage({
        id: `sys-opp-${Date.now()}`,
        senderId: 'system',
        senderName: 'System',
        content: `⚔️ Opportunity attack available!${payload.targetName ? ` Target: ${payload.targetName}` : ''}`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    // --- Other messages ---

    case 'ai:typing': {
      // AI typing indicator — informational only, no persistent state needed
      break
    }

    case 'chat:announcement': {
      const payload = message.payload as AnnouncementPayload
      useLobbyStore.getState().addChatMessage({
        id: `announce-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: message.senderId,
        senderName: 'Announcement',
        content: `📢 ${payload.message}`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    case 'ping': {
      const payload = message.payload as { timestamp?: number }
      get().sendMessage('pong', { timestamp: payload.timestamp ?? Date.now() })
      break
    }

    default: {
      break
    }
  }
}
