import { useEffect } from 'react'
import { trigger3dDice } from '../components/game/dice3d'
import type {
  ChatPayload,
  DiceResultPayload,
  MessageType,
  NarrationPayload,
  ShopUpdatePayload,
  TimeRequestPayload,
  TimerStartPayload,
  TimeSharePayload,
  TimeSyncPayload,
  WhisperPlayerPayload
} from '../network'
import { onClientMessage, onHostMessage } from '../network'
import { buildPlayerRoster, routePlayerMessageToAiDm } from '../services/ai-dm-routing'
import { useAiDmStore } from '../stores/use-ai-dm-store'
import { useGameStore } from '../stores/use-game-store'
import type { ChatMessage } from '../stores/use-lobby-store'
import { useLobbyStore } from '../stores/use-lobby-store'
import type { CampaignPlayer } from '../types/campaign'

interface UseGameNetworkOptions {
  networkRole: 'none' | 'host' | 'client'
  campaignId: string
  aiDmEnabled: boolean
  /** Campaign players used as fallback when lobby players is empty (solo mode) */
  campaignPlayers?: CampaignPlayer[]
  addChatMessage: (msg: ChatMessage) => void
  sendMessage: (type: MessageType, payload: unknown) => void
  setTimeRequestToast: (toast: { requesterId: string; requesterName: string } | null) => void
  setNarrationText: (text: string | null) => void
}

export function useGameNetwork({
  networkRole,
  campaignId,
  aiDmEnabled,
  campaignPlayers = [],
  addChatMessage,
  sendMessage,
  setTimeRequestToast,
  setNarrationText
}: UseGameNetworkOptions): void {
  const aiDmStore = useAiDmStore()

  // biome-ignore lint/correctness/useExhaustiveDependencies: campaignPlayers/aiDmStore are stable — not re-running unnecessarily
  useEffect(() => {
    if (networkRole === 'none') return

    const handler = (msg: { type: string; payload?: unknown; senderId?: string; senderName?: string }): void => {
      const gs = useGameStore.getState()
      if (msg.type === 'dm:shop-update') {
        const payload = msg.payload as ShopUpdatePayload
        if (payload.shopInventory.length > 0) {
          gs.openShop(payload.shopName || 'Shop')
          gs.setShopInventory(payload.shopInventory)
        } else {
          gs.closeShop()
        }
      }
      if (msg.type === 'dm:timer-start') {
        const payload = msg.payload as TimerStartPayload
        gs.startTimer(payload.seconds, payload.targetName)
      }
      if (msg.type === 'dm:timer-stop') {
        gs.stopTimer()
      }
      // Phase 27d — audio (dm:play-sound / dm:play-ambient / dm:stop-ambient) is
      // handled by the store-based client handler (client-handlers.ts); handling
      // it here too caused a double-play on clients.
      if (msg.type === 'game:dice-result') {
        const payload = msg.payload as DiceResultPayload
        trigger3dDice({
          formula: payload.formula,
          rolls: payload.rolls,
          total: payload.total,
          rollerName: payload.rollerName
        })
      }
      if (msg.type === 'chat:message') {
        const payload = msg.payload as ChatPayload
        addChatMessage({
          id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          // Prefer payload-level overrides so AI DM messages show as "AI Dungeon Master"
          senderId: (payload.senderId as string | undefined) || msg.senderId || 'unknown',
          senderName: (payload.senderName as string | undefined) || msg.senderName || 'Unknown',
          content: payload.message,
          timestamp: Date.now(),
          isSystem: payload.isSystem ?? false,
          isDiceRoll: payload.isDiceRoll ?? false,
          diceResult: payload.diceResult
        })

        // Route a PEER's message to the AI DM (host only; non-system, non-AI, not a
        // slash command). The host's OWN message is routed from ChatPanel — it never
        // arrives here. The shared helper builds roster + game state + creatures.
        if (
          networkRole === 'host' &&
          aiDmEnabled &&
          !aiDmStore.paused &&
          !payload.isSystem &&
          msg.senderId !== 'system' &&
          msg.senderId !== 'ai-dm' &&
          !payload.message.startsWith('/')
        ) {
          routePlayerMessageToAiDm(campaignId, payload.message, msg.senderName ?? 'Player', campaignPlayers)
        }
      }
      if (msg.type === 'dm:whisper-player') {
        const payload = msg.payload as WhisperPlayerPayload
        addChatMessage({
          id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          senderId: msg.senderId || 'dm',
          senderName: 'DM (Whisper)',
          content: payload.message,
          timestamp: Date.now(),
          isSystem: false
        })
      }
      if (msg.type === 'player:time-request') {
        const payload = msg.payload as TimeRequestPayload
        if (networkRole === 'host') {
          if (aiDmEnabled && !useAiDmStore.getState().paused) {
            const lobbyPlayers = useLobbyStore.getState().players
            const { charIds, rosterText } = buildPlayerRoster(lobbyPlayers, campaignPlayers)
            aiDmStore.sendMessage(
              campaignId,
              `${payload.requesterName} asks: What time is it?`,
              charIds,
              payload.requesterName,
              undefined,
              rosterText || undefined
            )
          } else {
            setTimeRequestToast({ requesterId: payload.requesterId, requesterName: payload.requesterName })
          }
        }
      }
      if (msg.type === 'dm:time-share') {
        const payload = msg.payload as TimeSharePayload
        addChatMessage({
          id: `msg-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
          senderId: 'system',
          senderName: 'System',
          content: `Current time: ${payload.formattedTime}`,
          timestamp: Date.now(),
          isSystem: true
        })
      }
      if (msg.type === 'dm:time-sync') {
        const payload = msg.payload as TimeSyncPayload
        useGameStore.getState().setInGameTime({ totalSeconds: payload.totalSeconds })
      }
      if (msg.type === 'dm:narration') {
        const payload = msg.payload as NarrationPayload
        if (payload.style === 'dramatic') {
          setNarrationText(payload.text)
        } else {
          addChatMessage({
            id: `narration-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
            senderId: msg.senderId || 'dm',
            senderName: 'DM (Narration)',
            content: payload.text,
            timestamp: Date.now(),
            isSystem: false
          })
        }
      }
    }

    if (networkRole === 'client') {
      return onClientMessage(handler)
    } else if (networkRole === 'host') {
      return onHostMessage(handler)
    }
  }, [
    networkRole,
    addChatMessage,
    aiDmStore.paused,
    aiDmStore.sendMessage,
    aiDmEnabled,
    campaignId,
    sendMessage,
    setTimeRequestToast,
    setNarrationText
  ])
}
