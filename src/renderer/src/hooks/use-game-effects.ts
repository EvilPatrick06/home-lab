import { type MutableRefObject, useCallback, useEffect } from 'react'
import type { MessageType, TypingPayload } from '../network'
import { startGameSync, stopGameSync } from '../network'
import { pushDmAlert } from '../components/game/overlays/DmAlertTray'
import { startAiMemorySync, stopAiMemorySync } from '../services/io/ai-memory-sync'
import { speakNarrationThroughBmo } from '../services/bmo-narration'
import { loadPersistedGameState, startAutoSave, stopAutoSave } from '../services/io/game-auto-save'
import { init as initSounds } from '../services/sound-manager'
import { useAiDmStore } from '../stores/use-ai-dm-store'
import { useGameStore } from '../stores/use-game-store'
import type { ChatMessage } from '../stores/use-lobby-store'
import { useLobbyStore } from '../stores/use-lobby-store'
import { useNarrationTtsStore } from '../stores/use-narration-tts-store'
import type { Campaign } from '../types/campaign'
import type { GameMap, MapToken } from '../types/map'

interface UseGameEffectsOptions {
  campaign: Campaign
  isDM: boolean
  addChatMessage: (msg: ChatMessage) => void
  sendMessage: (type: MessageType, payload: unknown) => void
  aiInitRef: MutableRefObject<boolean>
  activeMap: GameMap | null
  setIsFullscreen: (fs: boolean) => void
}

export function useGameEffects({
  campaign,
  isDM,
  addChatMessage,
  sendMessage,
  aiInitRef,
  activeMap,
  setIsFullscreen
}: UseGameEffectsOptions): void {
  const aiDmStore = useAiDmStore()
  const narrationTtsEnabled = useNarrationTtsStore((s) => s.enabled)

  const narrateThroughBmo = useCallback(
    (text: string): void => {
      if (!narrationTtsEnabled || !text.trim()) return

      void speakNarrationThroughBmo(text).then((result) => {
        if (!result.success) {
          pushDmAlert('error', `BMO narration failed: ${result.error ?? 'Unknown error'}`)
        }
      })
    },
    [narrationTtsEnabled]
  )

  // Add "Game session started" message on mount (once)
  useEffect(() => {
    addChatMessage({
      id: 'system-game-start',
      senderId: 'system',
      senderName: 'System',
      content: `Game session started for "${campaign.name}"`,
      timestamp: Date.now(),
      isSystem: true
    })
    initSounds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addChatMessage, campaign.name])

  // Host: broadcast game state changes to connected clients
  useEffect(() => {
    if (!isDM) return
    startGameSync(sendMessage)
    return () => stopGameSync()
  }, [isDM, sendMessage])

  // DM: auto-save game state with debouncing + load persisted state on mount
  useEffect(() => {
    if (!isDM) return
    loadPersistedGameState(campaign.id)
    startAutoSave(campaign.id)
    return () => stopAutoSave()
  }, [isDM, campaign.id])

  // AI DM: sync live game state to AI memory files (world-state.json, combat-state.json)
  useEffect(() => {
    if (!isDM || !campaign.aiDm?.enabled) return
    startAiMemorySync(campaign.id)
    return () => stopAiMemorySync()
  }, [isDM, campaign.id, campaign.aiDm?.enabled])

  // AI DM initialization (host only)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot init hook — aiInitRef/addChatMessage/sendMessage are stable
  useEffect(() => {
    if (!isDM || !campaign.aiDm?.enabled || aiInitRef.current) return
    aiInitRef.current = true

    // Set up stream listeners
    const cleanupListeners = aiDmStore.setupListeners()

    // Track timers for cleanup
    let pollInterval: ReturnType<typeof setInterval> | null = null
    let pollTimeout: ReturnType<typeof setTimeout> | null = null
    let sceneTimeout: ReturnType<typeof setTimeout> | null = null

    const cleanupTimers = (): void => {
      if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = null
      }
      if (pollTimeout) {
        clearTimeout(pollTimeout)
        pollTimeout = null
      }
      if (sceneTimeout) {
        clearTimeout(sceneTimeout)
        sceneTimeout = null
      }
    }

    // Initialize AI DM (preserves sceneStatus if already set from lobby)
    aiDmStore.initFromCampaign(campaign)

    /** Post the pre-generated opening narration to chat (scene was ready from lobby). */
    const postSceneNarration = (msgs: Array<{ role: string; content: string; timestamp: number }>): void => {
      const lastAssistant = [...msgs].reverse().find((m) => m.role === 'assistant')
      if (!lastAssistant) return
      const alreadyPosted = useLobbyStore
        .getState()
        .chatMessages.some((cm) => cm.senderId === 'ai-dm' && cm.timestamp === lastAssistant.timestamp)
      if (alreadyPosted) return
      addChatMessage({
        id: `ai-dm-${lastAssistant.timestamp}`,
        senderId: 'ai-dm',
        senderName: 'AI Dungeon Master',
        content: lastAssistant.content,
        timestamp: lastAssistant.timestamp,
        isSystem: true
      })
      sendMessage('chat:message', {
        message: lastAssistant.content,
        isSystem: true,
        senderId: 'ai-dm',
        senderName: 'AI Dungeon Master'
      })
      narrateThroughBmo(lastAssistant.content)
    }

    // Get character IDs — prefer lobby players, fall back to campaign players (solo mode)
    const getCharacterIds = (): string[] => {
      const lobbyPlayers = useLobbyStore.getState().players
      if (lobbyPlayers.length > 0) {
        return lobbyPlayers.filter((p) => p.characterId).map((p) => p.characterId!)
      }
      // Solo mode: derive from campaign players
      return campaign.players.filter((p) => p.isActive && p.characterId).map((p) => p.characterId!)
    }

    // Check if scene was already pre-generated in lobby
    const checkAndSetScene = async (): Promise<void> => {
      const status = await window.api.ai.getSceneStatus(campaign.id)

      if (status.status === 'ready') {
        // Scene already generated — explicitly post it to chat rather than relying on the
        // reactive effect (which can miss due to timing of the async initFromCampaign reset)
        const waitForMessages = async (): Promise<void> => {
          let msgs = useAiDmStore.getState().messages
          if (msgs.length === 0) {
            await new Promise<void>((resolve) => setTimeout(resolve, 500))
            msgs = useAiDmStore.getState().messages
          }
          if (msgs.length === 0) {
            // Force reload from disk
            const result = await window.api.ai.loadConversation(campaign.id)
            if (result.success && result.data) {
              const data = result.data as { messages?: Array<{ role: string; content: string; timestamp?: string }> }
              if (data.messages?.length) {
                const loaded = data.messages.map((m) => ({
                  role: m.role as 'user' | 'assistant',
                  content: m.content,
                  timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now()
                }))
                useAiDmStore.setState({ messages: loaded, sceneStatus: 'ready' })
                msgs = loaded
              }
            }
          }
          postSceneNarration(msgs)
        }
        waitForMessages()
        return // Don't call setScene
      }

      if (status.status === 'preparing') {
        // Scene still streaming — poll until ready, then load conversation
        pollInterval = setInterval(async () => {
          const s = await window.api.ai.getSceneStatus(campaign.id)
          if (s.status === 'ready') {
            if (pollInterval) {
              clearInterval(pollInterval)
              pollInterval = null
            }
            const result = await window.api.ai.loadConversation(campaign.id)
            if (result.success && result.data) {
              const data = result.data as { messages?: Array<{ role: string; content: string; timestamp?: string }> }
              if (data.messages?.length) {
                const loaded = data.messages.map((m) => ({
                  role: m.role as 'user' | 'assistant',
                  content: m.content,
                  timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now()
                }))
                useAiDmStore.setState({ messages: loaded, sceneStatus: 'ready', isTyping: false })
                postSceneNarration(loaded)
              }
            }
          }
        }, 1000)
        // Safety: stop polling after 60s
        pollTimeout = setTimeout(() => {
          if (pollInterval) {
            clearInterval(pollInterval)
            pollInterval = null
          }
        }, 60000)
        return
      }

      // Fallback: no scene prep happened — use original behavior
      // Works for both multiplayer (lobby players) and solo mode (campaign players)
      const characterIds = getCharacterIds()

      if (characterIds.length > 0) {
        sceneTimeout = setTimeout(() => {
          useAiDmStore.getState().setScene(campaign.id, characterIds)
        }, 1500)
      }
    }

    checkAndSetScene()

    return (): void => {
      cleanupTimers()
      cleanupListeners()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isDM,
    campaign.id, // Initialize AI DM (preserves sceneStatus if already set from lobby)
    aiDmStore.initFromCampaign,
    aiDmStore.setupListeners,
    campaign
  ])

  // When AI DM finishes streaming, add the message to chat and broadcast
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // biome-ignore lint/correctness/useExhaustiveDependencies: addChatMessage/sendMessage are stable props — not re-running on every render
  useEffect(() => {
    if (!isDM || !campaign.aiDm?.enabled) return

    const messages = aiDmStore.messages
    if (messages.length === 0) return

    const lastMsg = messages[messages.length - 1]
    if (lastMsg.role !== 'assistant') return

    // Check if we already posted this (use timestamp as dedup key)
    const chatMessages = useLobbyStore.getState().chatMessages
    const alreadyPosted = chatMessages.some((cm) => cm.senderId === 'ai-dm' && cm.timestamp === lastMsg.timestamp)
    if (alreadyPosted) return

    // Build message content with optional rule citations
    let messageContent = lastMsg.content
    if (lastMsg.ruleCitations?.length) {
      const citeList = lastMsg.ruleCitations.map((c) => `${c.source}: ${c.rule}`).join(', ')
      messageContent += `\n\n\u{1F4D6} ${citeList}`
    }

    // Add to chat
    addChatMessage({
      id: `ai-dm-${lastMsg.timestamp}`,
      senderId: 'ai-dm',
      senderName: 'AI Dungeon Master',
      content: messageContent,
      timestamp: lastMsg.timestamp,
      isSystem: true
    })

    // Broadcast to clients
    sendMessage('chat:message', {
      message: messageContent,
      isSystem: true,
      senderId: 'ai-dm',
      senderName: 'AI Dungeon Master'
    })

    narrateThroughBmo(lastMsg.content)

    // Apply stat changes if any
    if (lastMsg.statChanges && lastMsg.statChanges.length > 0) {
      const creatureChanges = lastMsg.statChanges.filter((c: { type: string }) => c.type.startsWith('creature_'))
      const characterChanges = lastMsg.statChanges.filter((c: { type: string }) => !c.type.startsWith('creature_'))

      // Apply character changes via IPC — route each change to the correct character by name
      if (characterChanges.length > 0) {
        const players = useLobbyStore.getState().players
        const playersWithChars = players.filter((p) => p.characterId)
        if (playersWithChars.length > 0) {
          // Group changes by characterName; fall back to first character if unspecified
          const changesByCharId = new Map<string, typeof characterChanges>()
          for (const change of characterChanges) {
            const named = (change as { characterName?: string }).characterName
            let charId: string | undefined
            if (named) {
              const match = playersWithChars.find(
                (p) =>
                  p.displayName?.toLowerCase() === named.toLowerCase() ||
                  p.characterName?.toLowerCase() === named.toLowerCase()
              )
              charId = match?.characterId ?? playersWithChars[0].characterId ?? undefined
            } else {
              charId = playersWithChars[0].characterId ?? undefined
            }
            if (charId) {
              const existing = changesByCharId.get(charId) ?? []
              existing.push(change)
              changesByCharId.set(charId, existing)
            }
          }
          for (const [charId, changes] of changesByCharId) {
            window.api.ai.applyMutations(charId, changes)
          }
        }
      }

      // Apply creature changes directly to map tokens
      if (creatureChanges.length > 0 && activeMap) {
        import('../utils/creature-mutations').then(({ applyCreatureMutations }) => {
          const gameStore = useGameStore.getState()
          applyCreatureMutations(
            creatureChanges,
            activeMap,
            (mapId: string, tokenId: string, updates: Partial<MapToken>) => {
              gameStore.updateToken(mapId, tokenId, updates)
            }
          )
        })
      }
    }

    // Execute DM actions if any
    if (lastMsg.dmActions && lastMsg.dmActions.length > 0) {
      import('../services/game-action-executor').then(({ executeDmActions }) => {
        const result = executeDmActions(lastMsg.dmActions!)
        for (const f of result.failed) {
          addChatMessage({
            id: `ai-err-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
            senderId: 'system',
            senderName: 'System',
            content: `AI DM action failed: ${f.action.action} \u2014 ${f.reason}`,
            timestamp: Date.now(),
            isSystem: true
          })
        }
      })
    }

    // Save conversation (debounced)
    window.api.ai.saveConversation(campaign.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    aiDmStore.messages,
    activeMap,
    campaign.aiDm?.enabled,
    campaign.id,
    isDM, // Broadcast to clients
    narrateThroughBmo,
    sendMessage
  ])

  // Broadcast AI typing status
  useEffect(() => {
    if (!isDM || !campaign.aiDm?.enabled) return
    const typingPayload: TypingPayload = { isTyping: aiDmStore.isTyping }
    sendMessage('ai:typing', typingPayload)
  }, [aiDmStore.isTyping, isDM, campaign.aiDm?.enabled, sendMessage])

  // Auto-populate sidebar allies from connected players
  useEffect(() => {
    const gameStore = useGameStore.getState()
    const players = useLobbyStore.getState().players
    players.forEach((player) => {
      if (player.isHost) return
      const existing = gameStore.allies.find((a) => a.sourceId === player.peerId)
      if (!existing) {
        gameStore.addSidebarEntry('allies', {
          id: crypto.randomUUID(),
          name: player.characterName || player.displayName,
          description: player.characterName ? `Player: ${player.displayName}` : undefined,
          visibleToPlayers: true,
          isAutoPopulated: true,
          sourceId: player.peerId
        })
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Check initial fullscreen state + listen for F11
  useEffect(() => {
    window.api.isFullscreen().then((fs) => setIsFullscreen(fs))

    const handleF11 = (e: KeyboardEvent): void => {
      if (e.key === 'F11') {
        e.preventDefault()
        window.api.toggleFullscreen().then((fs) => setIsFullscreen(fs))
      }
    }
    window.addEventListener('keydown', handleF11)
    return () => window.removeEventListener('keydown', handleF11)
  }, [setIsFullscreen])
}
