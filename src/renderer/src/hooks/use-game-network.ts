import { useEffect } from 'react'
import { trigger3dDice } from '../components/game/dice3d'
import type {
  ChatPayload,
  DiceResultPayload,
  MessageType,
  NarrationPayload,
  PlayAmbientPayload,
  PlaySoundPayload,
  ShopUpdatePayload,
  StopAmbientPayload,
  TimeRequestPayload,
  TimerStartPayload,
  TimeSharePayload,
  TimeSyncPayload,
  WhisperPlayerPayload
} from '../network'
import { onClientMessage, onHostMessage } from '../network'
import type { AmbientSound, SoundEvent } from '../services/sound-manager'
import { playAmbient, play as playSound, setAmbientVolume, stopAmbient } from '../services/sound-manager'
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

/** Build a player roster string for AI context.
 *  Uses lobby players if available (multiplayer), falls back to campaign players (solo). */
function buildPlayerRoster(
  lobbyPlayers: Array<{
    displayName: string
    characterId: string | null
    characterName: string | null
    peerId: string
  }>,
  campaignPlayers: CampaignPlayer[]
): { charIds: string[]; rosterText: string } {
  const resolved =
    lobbyPlayers.length > 0
      ? lobbyPlayers
          .filter((p) => p.characterId)
          .map((p) => ({ displayName: p.displayName, characterId: p.characterId!, characterName: p.characterName }))
      : campaignPlayers
          .filter((p) => p.characterId && p.isActive)
          .map((p) => ({ displayName: p.displayName, characterId: p.characterId!, characterName: null }))

  const charIds = resolved.map((p) => p.characterId)
  const isSolo = lobbyPlayers.length <= 1

  if (resolved.length === 0) return { charIds: [], rosterText: '' }

  let rosterText: string
  if (isSolo) {
    const p = resolved[0]
    const charLabel = p.characterName ? `${p.characterName} (charId: ${p.characterId})` : `(charId: ${p.characterId})`
    rosterText = `[PARTY ROSTER]\nSolo play: ${p.displayName} controls ${charLabel}\n[/PARTY ROSTER]`
  } else {
    const lines = resolved.map((p) => {
      const charLabel = p.characterName ? `${p.characterName} (charId: ${p.characterId})` : `(charId: ${p.characterId})`
      return `- ${p.displayName} → ${charLabel}`
    })
    rosterText = `[PARTY ROSTER]\nParty roster (${resolved.length} players):\n${lines.join('\n')}\n[/PARTY ROSTER]`
  }

  return { charIds, rosterText }
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
      if (msg.type === 'dm:play-sound') {
        const payload = msg.payload as PlaySoundPayload
        playSound(payload.event as SoundEvent)
      }
      if (msg.type === 'dm:play-ambient') {
        const payload = msg.payload as PlayAmbientPayload
        if (payload.volume !== undefined) setAmbientVolume(payload.volume)
        playAmbient(payload.ambient as AmbientSound)
      }
      if (msg.type === 'dm:stop-ambient') {
        const _stopPayload = msg.payload as StopAmbientPayload
        stopAmbient()
      }
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

        // Route player messages to AI DM (host only, non-system, non-host messages)
        if (
          networkRole === 'host' &&
          aiDmEnabled &&
          !aiDmStore.paused &&
          !payload.isSystem &&
          msg.senderId !== 'system' &&
          msg.senderId !== 'ai-dm' &&
          !payload.message.startsWith('/')
        ) {
          const lobbyPlayers = useLobbyStore.getState().players
          const { charIds, rosterText } = buildPlayerRoster(lobbyPlayers, campaignPlayers)
          import('../services/game-action-executor').then(({ buildGameStateSnapshot }) => {
            const baseGameState = buildGameStateSnapshot()
            const gameState = rosterText ? `${baseGameState}\n\n${rosterText}` : baseGameState
            const currentMap = useGameStore.getState().maps.find((m) => m.id === useGameStore.getState().activeMapId)
            const activeCreatures =
              currentMap?.tokens
                .filter((t) => t.entityType === 'enemy' || t.entityType === 'npc')
                .filter((t) => t.currentHP != null)
                .map((t) => ({
                  label: t.label,
                  currentHP: t.currentHP!,
                  maxHP: t.maxHP!,
                  ac: t.ac ?? 10,
                  conditions: t.conditions,
                  monsterStatBlockId: t.monsterStatBlockId
                })) ?? []
            aiDmStore.sendMessage(
              campaignId,
              payload.message,
              charIds,
              msg.senderName,
              activeCreatures.length > 0 ? activeCreatures : undefined,
              gameState
            )
          })
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
