import type {
  CoDMPayload,
  ColorChangePayload,
  ColorRejectedPayload,
  GameStateFullPayload,
  InspectResponsePayload,
  JoinRejectedPayload,
  NetworkGameState,
  NetworkMessage,
  PeerInfo,
  RoleChangePayload,
  TransferDmPayload
} from '../../network'
import { playAmbient as playAmbientSound, stopAmbient } from '../../services/sound-manager'
import { logger } from '../../utils/logger'
import { useGameStore } from '../use-game-store'
import { useLobbyStore } from '../use-lobby-store'
import {
  handlePlayAmbient,
  handlePlayCustomAudio,
  handlePlaySound,
  handleStopAmbient,
  handleStopCustomAudio
} from './client-handlers/audio-handlers'
import {
  handleAnnouncement,
  handleConcentrationCheck,
  handleDiceResult,
  handleDiceReveal,
  handleDiceRoll3d,
  handleDiceRollHidden,
  handleGameStart,
  handleHaggleResponse,
  handleLootAward,
  handleMapPing,
  handleNarration,
  handleOpportunityAttack,
  handlePushMacros,
  handleTimerStart,
  handleTimerStop,
  handleTimeShare,
  handleWhisper,
  handleWhisperPlayer,
  handleXpAward
} from './client-handlers/chat-handlers'
import {
  handleCharacterUpdate,
  handleChatTimeout,
  handleFileSharing,
  handleHandout,
  handleJournalAdd,
  handleJournalDelete,
  handleJournalSync,
  handleJournalUpdate,
  handleLightSourceUpdate,
  handleReactionPrompt,
  handleRollRequest,
  handleShareHandout,
  handleShopUpdate,
  handleSlowMode,
  handleTimeSync,
  handleTradeCancel,
  handleTradeRequest,
  handleTradeResult
} from './client-handlers/game-action-handlers'
import {
  handleConditionUpdate,
  handleDrawingAdd,
  handleDrawingsClear,
  handleFogReveal,
  handleInitiativeUpdate,
  handleMapChange,
  handleTokenMove
} from './client-handlers/game-sync-handlers'
import { applyGameState, handleGameStateUpdate } from './client-handlers/shared'
import type { NetworkState } from './index'

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
        // Phase 14d: hydrate the currently playing ambient track so a
        // late joiner hears whatever the DM has running. The host's
        // game-sync includes `currentAmbient: AmbientSound | null` in
        // the full-state payload; null means stop, a name means play.
        const currentAmbient = (gs as unknown as { currentAmbient?: string | null }).currentAmbient
        if (typeof currentAmbient === 'string' && currentAmbient.length > 0) {
          playAmbientSound(currentAmbient as Parameters<typeof playAmbientSound>[0])
        } else if (currentAmbient === null) {
          stopAmbient()
        }
      }
      break
    }

    case 'player:join': {
      const payload = message.payload as PeerInfo & { displayName: string }
      const newPeer: PeerInfo = {
        peerId: payload.peerId || message.senderId,
        clientId: payload.clientId,
        role: payload.role ?? 'player',
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

    case 'dm:transfer-dm': {
      // Phase 30e — the host transferred DM authority. Set `isDM` on the named
      // peer and clear it on everyone else, then update the local flag so this
      // client's DM-tool gates flip on/off accordingly.
      const payload = message.payload as TransferDmPayload
      for (const peer of get().peers) {
        const isDM = peer.peerId === payload.newDmPeerId
        get().updatePeer(peer.peerId, { isDM })
        useLobbyStore.getState().updatePlayer(peer.peerId, { isDM })
      }
      set({ localIsDM: payload.newDmPeerId === get().localPeerId })
      break
    }

    case 'player:color-change': {
      const payload = message.payload as ColorChangePayload
      get().updatePeer(message.senderId, { color: payload.color })
      // Phase 29d: an authoritative color-change from the host is the signal
      // that the player's pick was accepted — flip colorConfirmed so the Ready
      // button unlocks for the local player and other clients see the same
      // state for every peer.
      useLobbyStore.getState().updatePlayer(message.senderId, {
        color: payload.color,
        colorConfirmed: true,
        // Phase 17d — confirmed color supersedes any uncommitted preview.
        previewColor: null
      })
      break
    }

    case 'player:color-preview': {
      // Phase 17d — host is forwarding another peer's live color preview.
      // Update that peer's previewColor so the local UI renders the
      // uncommitted swatch (dashed/dimmed) until they Confirm.
      const previewPayload = message.payload as { color: string | null; peerId?: string }
      const targetPeerId = previewPayload.peerId ?? message.senderId
      if (targetPeerId) {
        useLobbyStore.getState().updatePlayer(targetPeerId, { previewColor: previewPayload.color })
      }
      break
    }

    case 'player:color-rejected': {
      // Phase 29d: the host rejected our color-confirm because another peer
      // already holds that color. Revert any optimistic local change by
      // clearing colorConfirmed so the Ready button stays disabled until the
      // player picks a different color. Local UI also surfaces a toast/system
      // message via the chat (rendered from the host's broadcast or here).
      const payload = message.payload as ColorRejectedPayload
      const localId = get().localPeerId
      if (localId) {
        useLobbyStore.getState().updatePlayer(localId, { colorConfirmed: false })
      }
      useLobbyStore.getState().addChatMessage({
        id: `color-rej-local-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: 'system',
        senderName: 'System',
        content: `Color ${payload.color} is already taken — pick a different color.`,
        timestamp: Date.now(),
        isSystem: true
      })
      break
    }

    case 'player:join-rejected': {
      // Phase 29e: host refused our join (full / banned / spectator-cap /
      // name-conflict / invalid). Surface the reason and disconnect.
      const payload = message.payload as JoinRejectedPayload
      const niceReason =
        payload.reason === 'full'
          ? 'The game is full.'
          : payload.reason === 'spectator-cap'
            ? 'All spectator slots are taken.'
            : payload.reason === 'banned'
              ? 'You are banned from this game.'
              : payload.reason === 'name-conflict'
                ? 'That display name is already in use.'
                : 'Your join was rejected by the host.'
      set({
        connectionState: 'disconnected',
        role: 'none',
        campaignId: null,
        peers: [],
        error: payload.message || niceReason,
        disconnectReason: 'rejected'
      })
      break
    }

    case 'dm:role-change': {
      // Phase 29e: host changed a peer's role (promote/demote spectator).
      const payload = message.payload as RoleChangePayload
      get().updatePeer(payload.peerId, { role: payload.role })
      useLobbyStore.getState().updatePlayer(payload.peerId, { role: payload.role })
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
      handleTokenMove(message)
      break
    }

    case 'dm:fog-reveal': {
      handleFogReveal(message)
      break
    }

    case 'dm:drawing-add': {
      handleDrawingAdd(message)
      break
    }

    case 'dm:drawings-clear': {
      handleDrawingsClear(message)
      break
    }

    case 'dm:map-change': {
      handleMapChange(message)
      break
    }

    case 'dm:initiative-update': {
      handleInitiativeUpdate(message)
      break
    }

    case 'dm:condition-update': {
      handleConditionUpdate(message)
      break
    }

    case 'game:state-resync': {
      // Phase 29h: the host replayed missed messages from its per-client
      // buffer. Re-dispatch each through this handler so the existing
      // case branches apply them (no special apply paths needed).
      const payload = message.payload as {
        fromSequence: number
        toSequence: number
        fallback: boolean
        messages?: NetworkMessage[]
      }
      if (payload.fallback) {
        // Host couldn't replay — clients fall through to the existing
        // game:state-full snapshot that arrives separately.
        break
      }
      for (const inner of payload.messages ?? []) {
        try {
          handleClientMessage(inner, get, set)
        } catch (err) {
          logger.warn('[ClientHandlers] resync inner-message dispatch failed:', err)
        }
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
      handleSlowMode(message)
      break
    }

    case 'dm:file-sharing': {
      handleFileSharing(message)
      break
    }

    case 'chat:whisper': {
      handleWhisper(message)
      break
    }

    case 'combat:reaction-prompt': {
      handleReactionPrompt(message)
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
      handleTradeRequest(message)
      break
    }

    case 'player:trade-cancel': {
      handleTradeCancel(message)
      break
    }

    case 'dm:trade-result': {
      handleTradeResult(message)
      break
    }

    // --- Journal messages ---
    case 'player:journal-add': {
      handleJournalAdd(message)
      break
    }

    case 'player:journal-update': {
      handleJournalUpdate(message)
      break
    }

    case 'player:journal-delete': {
      handleJournalDelete(message)
      break
    }

    case 'dm:journal-sync': {
      handleJournalSync(message)
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
      handleRollRequest(message)
      break
    }

    // --- Macro sharing ---
    case 'dm:push-macros': {
      handlePushMacros(message)
      break
    }

    // --- DM action messages ---

    case 'dm:chat-timeout': {
      handleChatTimeout(message)
      break
    }

    case 'dm:loot-award': {
      handleLootAward(message)
      break
    }

    case 'dm:xp-award': {
      handleXpAward(message)
      break
    }

    case 'dm:time-sync': {
      handleTimeSync(message)
      break
    }

    case 'dm:time-share': {
      handleTimeShare(message)
      break
    }

    case 'dm:timer-start': {
      handleTimerStart(message)
      break
    }

    case 'dm:timer-stop': {
      handleTimerStop()
      break
    }

    case 'dm:narration': {
      handleNarration(message)
      break
    }

    case 'dm:play-sound': {
      handlePlaySound(message)
      break
    }

    case 'dm:play-ambient': {
      handlePlayAmbient(message)
      break
    }

    case 'dm:stop-ambient': {
      handleStopAmbient()
      break
    }

    case 'dm:play-custom-audio': {
      handlePlayCustomAudio(message)
      break
    }

    case 'dm:stop-custom-audio': {
      handleStopCustomAudio(message)
      break
    }

    case 'dm:handout': {
      handleHandout(message)
      break
    }

    case 'dm:share-handout': {
      handleShareHandout(message)
      break
    }

    case 'dm:light-source-update': {
      handleLightSourceUpdate(message)
      break
    }

    case 'dm:whisper-player': {
      handleWhisperPlayer(message)
      break
    }

    case 'dm:unban-player': {
      // No action needed client-side
      break
    }

    case 'dm:haggle-response': {
      handleHaggleResponse(message)
      break
    }

    case 'dm:shop-update': {
      handleShopUpdate(message)
      break
    }

    case 'dm:game-start': {
      handleGameStart()
      break
    }

    case 'dm:character-update': {
      handleCharacterUpdate(message)
      break
    }

    // --- Game messages ---

    case 'game:dice-result': {
      handleDiceResult(message)
      break
    }

    case 'game:dice-reveal': {
      handleDiceReveal(message)
      break
    }

    case 'game:dice-roll-hidden': {
      handleDiceRollHidden(message)
      break
    }

    case 'game:dice-roll-3d': {
      handleDiceRoll3d(message)
      break
    }

    case 'game:map-ping': {
      handleMapPing(message)
      break
    }

    case 'game:concentration-check': {
      handleConcentrationCheck(message)
      break
    }

    case 'game:opportunity-attack': {
      handleOpportunityAttack(message)
      break
    }

    // --- Other messages ---

    case 'ai:typing': {
      // AI typing indicator — informational only, no persistent state needed
      break
    }

    case 'chat:announcement': {
      handleAnnouncement(message)
      break
    }

    case 'chat:clear': {
      // PHASE-09 09D — DM (or co-DM) cleared chat; wipe our local history to match.
      useLobbyStore.getState().clearChatHistory()
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
