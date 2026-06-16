import { type MutableRefObject, useEffect, useRef } from 'react'
import { pushDmAlert } from '../components/game/overlays/DmAlertTray'
import {
  SCENE_FALLBACK_DELAY_MS,
  SCENE_MESSAGE_WAIT_MS,
  SCENE_POLL_INTERVAL_MS,
  SCENE_POLL_SLOW_NOTICE_MS
} from '../constants'
import { i18n } from '../i18n'
import type { MessageType, TypingPayload } from '../network'
import { startGameSync, stopGameSync } from '../network'
import { configureAiFromCampaign } from '../services/ai-dm-routing'
import { startAiMemorySync, stopAiMemorySync } from '../services/io/ai-memory-sync'
import { loadPersistedGameState, startAutoSave, stopAutoSave } from '../services/io/game-auto-save'
import { init as initSounds } from '../services/sound-manager'
import { useAiDmStore } from '../stores/use-ai-dm-store'
import { useGameStore } from '../stores/use-game-store'
import type { ChatMessage } from '../stores/use-lobby-store'
import { useLobbyStore } from '../stores/use-lobby-store'
import type { Campaign } from '../types/campaign'
import type { GameMap, MapToken } from '../types/map'
import { logger } from '../utils/logger'

interface UseGameEffectsOptions {
  campaign: Campaign
  isDM: boolean
  addChatMessage: (msg: ChatMessage) => void
  sendMessage: (type: MessageType, payload: unknown) => void
  aiInitRef: MutableRefObject<boolean>
  activeMap: GameMap | null
  setIsFullscreen: (fs: boolean) => void
}

/** Apply stat changes directly — used for auto-approve and after manual approval */
function applyStatChangesDirectly(
  statChanges: Array<{ type: string; [key: string]: unknown }>,
  activeMap: GameMap | null
): void {
  const creatureChanges = statChanges.filter((c) => c.type.startsWith('creature_'))
  const characterChanges = statChanges.filter((c) => !c.type.startsWith('creature_'))

  // Apply character changes via IPC — route each change to the correct character by name
  if (characterChanges.length > 0) {
    const players = useLobbyStore.getState().players
    const playersWithChars = players.filter((p) => p.characterId)
    if (playersWithChars.length > 0) {
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
          if (!match) {
            // The AI named a character that isn't in the roster — surface it and
            // skip, rather than silently applying the change to the first (wrong)
            // character as the old `?? playersWithChars[0]` fallback did.
            pushDmAlert('warning', i18n.t('notify.aiDmStore.mutationUnknownCharacter', { name: named }))
            continue
          }
          charId = match.characterId ?? undefined
        } else {
          // No name given — default to the sole/first character (typical solo play).
          charId = playersWithChars[0].characterId ?? undefined
        }
        if (charId) {
          const existing = changesByCharId.get(charId) ?? []
          existing.push(change)
          changesByCharId.set(charId, existing)
        }
      }
      for (const [charId, changes] of changesByCharId) {
        // PHASE-02 02F — consume the result so rejected/failed mutations aren't
        // silent: surface a DM alert for a thrown handler (error envelope) or a
        // MutationResult with rejects. Alert-tray only (chat feedback is PHASE-04).
        window.api.ai
          .applyMutations(charId, changes)
          .then((result) => {
            const r = result as
              | { success?: false; error?: string }
              | { applied: unknown[]; rejected: Array<{ reason: string }> }
            if (r && 'success' in r && r.success === false) {
              pushDmAlert('warning', i18n.t('notify.aiDmStore.mutationApplyFailed', { reason: r.error ?? 'unknown' }))
              return
            }
            if (r && 'rejected' in r && r.rejected.length > 0) {
              const reasons = r.rejected
                .slice(0, 3)
                .map((x) => x.reason)
                .join('; ')
              pushDmAlert('warning', i18n.t('notify.aiDmStore.mutationRejected', { count: r.rejected.length, reasons }))
            }
          })
          .catch((err) => {
            pushDmAlert('warning', i18n.t('notify.aiDmStore.mutationApplyFailed', { reason: String(err) }))
          })
      }
    }
  }

  // Apply creature changes directly to map tokens
  if (creatureChanges.length > 0 && activeMap) {
    import('../utils/creature-mutations')
      .then(({ applyCreatureMutations }) => {
        const gameStore = useGameStore.getState()
        const results = applyCreatureMutations(
          creatureChanges,
          activeMap,
          (mapId: string, tokenId: string, updates: Partial<MapToken>) => {
            gameStore.updateToken(mapId, tokenId, updates)
          }
        )
        // 08E — surface every creature change that didn't apply (was silently discarded).
        for (const r of results) {
          if (!r.applied) {
            pushDmAlert(
              'warning',
              i18n.t('notify.aiDmStore.creatureMutationFailed', {
                type: r.change.type,
                target: (r.change as { targetLabel?: string }).targetLabel ?? '?',
                reason: r.reason ?? 'unknown'
              })
            )
          }
        }
      })
      .catch((err) => logger.error('[game-effects] creature-mutations import failed', err))

    // Concentration: any concentrating creature that took damage rolls a CON save;
    // a failed save breaks its spell (auto-resolved + surfaced in the DM alert tray).
    const turnStates = useGameStore.getState().turnStates ?? {}
    const damaged = creatureChanges.filter((c) => c.type === 'creature_damage') as Array<{
      targetLabel?: string
      value?: number
    }>
    if (damaged.length > 0 && Object.values(turnStates).some((t) => t.concentratingSpell)) {
      void Promise.all([import('../services/combat/concentration-manager'), import('../services/game/token-stats')])
        .then(([{ checkConcentrationOnDamage }, { getCreatureSaveMod }]) => {
          for (const change of damaged) {
            const token = activeMap.tokens.find((t) => t.label === change.targetLabel)
            if (!token?.entityId || !turnStates[token.entityId]?.concentratingSpell) continue
            const res = checkConcentrationOnDamage(
              token.entityId,
              token.label,
              change.value ?? 0,
              turnStates,
              getCreatureSaveMod(token, 'con')
            )
            if (res.needsCheck && res.result) {
              pushDmAlert(res.result.maintained ? 'info' : 'warning', res.result.summary)
              if (!res.result.maintained) useGameStore.getState().setConcentrating(token.entityId, undefined)
            }
          }
        })
        .catch((err) => logger.error('[game-effects] concentration check failed', err))
    }
  } else if (creatureChanges.length > 0) {
    // 08E — no active map: don't silently drop creature changes; tell the DM.
    pushDmAlert('warning', i18n.t('notify.aiDmStore.creatureMutationsNoMap', { count: creatureChanges.length }))
  }
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

  // Keep the latest active map available to the mount-time approval listener
  // below without re-registering the listener on every map change.
  const activeMapRef = useRef(activeMap)
  activeMapRef.current = activeMap

  // PHASE-20 20F: the single automatic narration sender now lives in the main
  // process (it owns the parsed npc/emotion + the toggle gate). Here we only
  // SURFACE failures it reports, deduped by reason so an inactive Discord
  // session doesn't alert on every AI turn (re-alert after 60s or a new reason).
  const lastNarrationAlertRef = useRef<{ key: string; at: number } | null>(null)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.api?.onBmoNarrationStatus) return undefined
    return window.api.onBmoNarrationStatus((status) => {
      const key = status.result ?? status.error ?? String(status.statusCode ?? 'unknown')
      const now = Date.now()
      const last = lastNarrationAlertRef.current
      if (last && last.key === key && now - last.at < 60_000) return
      lastNarrationAlertRef.current = { key, at: now }
      const errText =
        status.statusCode === 404 ? 'No active Discord session' : (status.result ?? status.error ?? 'Unknown error')
      pushDmAlert('error', i18n.t('notify.gameEffects.narrationFailed', { error: errText }))
    })
  }, [])

  // Add "Game session started" message on mount (once)
  useEffect(() => {
    addChatMessage({
      id: `system-game-start-${Date.now()}`,
      senderId: 'system',
      senderName: 'System',
      content: `Game session started for "${campaign.name}"`,
      timestamp: Date.now(),
      isSystem: true
    })
    initSounds()
  }, [addChatMessage, campaign.name])

  // DM-approved mutations funnel here from use-ai-dm-store via a custom event, so
  // manual approval applies through the SAME path as auto-approve — including
  // creature token mutations (which need the active map and were previously
  // dropped because this listener didn't exist).
  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ mutations?: Array<{ type: string; [key: string]: unknown }> }>).detail
      if (detail?.mutations?.length) {
        applyStatChangesDirectly(detail.mutations, activeMapRef.current)
      }
    }
    window.addEventListener('ai-mutations-approved', handler)
    return () => window.removeEventListener('ai-mutations-approved', handler)
  }, [])

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

  // Latest-campaign ref so the one-shot init effect below can read fresh campaign data from
  // its nested closures WITHOUT keying on the campaign object's identity (any saveCampaign
  // swaps the object) — mirrors the activeMapRef pattern above. (PHASE-05 05C / F1)
  const campaignRef = useRef(campaign)
  campaignRef.current = campaign
  const aiDmEnabled = campaign.aiDm?.enabled ?? false

  // AI DM stream listeners (host only). Separate from the one-shot init below so a
  // campaign-object identity change (any saveCampaign) re-registers instead of killing them —
  // cleanup is per-listener (05B), so re-running is safe. (F1)
  useEffect(() => {
    if (!isDM || !aiDmEnabled) return undefined
    return aiDmStore.setupListeners()
  }, [isDM, aiDmEnabled, aiDmStore.setupListeners])

  // AI DM initialization (host only)
  // biome-ignore lint/correctness/useExhaustiveDependencies: one-shot init hook — aiInitRef/addChatMessage/sendMessage are stable; campaign read via campaignRef
  useEffect(() => {
    if (!isDM || !aiDmEnabled || aiInitRef.current) return
    aiInitRef.current = true
    const currentCampaign = campaignRef.current

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
    aiDmStore.initFromCampaign(currentCampaign)
    // S-4 / BUG-1 — apply THIS campaign's chosen model/provider to the main
    // process so solo + in-game turns use the picked model (the lobby host does
    // the same before scene prep). Fire-and-forget; configure is idempotent.
    void configureAiFromCampaign(currentCampaign)

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
      // 20F: narration is sent by the main process (single gated sender).
    }

    // Get character IDs — prefer lobby players, fall back to campaign players (solo mode)
    const getCharacterIds = (): string[] => {
      const lobbyPlayers = useLobbyStore.getState().players
      if (lobbyPlayers.length > 0) {
        return lobbyPlayers.filter((p) => p.characterId).map((p) => p.characterId!)
      }
      // Solo mode: derive from campaign players (read fresh via the latest-campaign ref).
      return campaignRef.current.players.filter((p) => p.isActive && p.characterId).map((p) => p.characterId!)
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
            await new Promise<void>((resolve) => setTimeout(resolve, SCENE_MESSAGE_WAIT_MS))
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
        // Tell the player the DM is working — a cold/large local model can spend a
        // minute or two on the opening scene, and an empty chat read as "nothing
        // happened". Show the typing indicator + a one-time chat note.
        useAiDmStore.setState({ isTyping: true, sceneStatus: 'preparing' })
        const alreadyNoted = useLobbyStore
          .getState()
          .chatMessages.some((cm) => cm.senderId === 'ai-dm' && cm.id === `ai-dm-scene-prep-${campaign.id}`)
        if (!alreadyNoted) {
          addChatMessage({
            id: `ai-dm-scene-prep-${campaign.id}`,
            senderId: 'ai-dm',
            senderName: 'AI Dungeon Master',
            content:
              '🎬 *The Dungeon Master is setting the scene… (a local model may take a minute on the first response)*',
            timestamp: Date.now(),
            isSystem: true
          })
        }
        // Scene still streaming — poll until ready/error/idle, then load conversation.
        pollInterval = setInterval(async () => {
          try {
            const s = await window.api.ai.getSceneStatus(campaign.id)
            if (s.status === 'ready') {
              if (pollInterval) {
                clearInterval(pollInterval)
                pollInterval = null
              }
              const result = await window.api.ai.loadConversation(campaign.id)
              if (result.success && result.data) {
                const data = result.data as {
                  messages?: Array<{ role: string; content: string; timestamp?: string }>
                }
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
            } else if (s.status === 'error') {
              // Surface the failure instead of polling silently.
              if (pollInterval) {
                clearInterval(pollInterval)
                pollInterval = null
              }
              useAiDmStore.setState({
                sceneStatus: 'error',
                isTyping: false,
                lastError: s.error ?? 'Scene prep failed'
              })
              addChatMessage({
                id: `ai-dm-scene-err-${campaign.id}`,
                senderId: 'ai-dm',
                senderName: 'AI Dungeon Master',
                content: `⚠️ The Dungeon Master couldn't set the scene: ${s.error ?? 'request failed'}`,
                timestamp: Date.now(),
                isSystem: true
              })
            } else if (s.status === 'idle') {
              // Prep was cancelled elsewhere (06A/06B) — stop indicating work that isn't
              // happening. No chat note (the user already saw the cancel).
              if (pollInterval) {
                clearInterval(pollInterval)
                pollInterval = null
              }
              useAiDmStore.setState({ isTyping: false, sceneStatus: 'idle' })
            }
          } catch {
            // Keep polling; a transient getSceneStatus IPC failure must not kill the poll.
          }
        }, SCENE_POLL_INTERVAL_MS)
        // Soft notice only — polling CONTINUES until ready/error/idle or unmount. (Previously
        // this cap silently killed the poll: isTyping stayed wedged on and a scene finishing
        // after the cap never posted.)
        pollTimeout = setTimeout(() => {
          addChatMessage({
            id: `ai-dm-scene-slow-${campaign.id}`,
            senderId: 'ai-dm',
            senderName: 'AI Dungeon Master',
            content:
              '⏳ *Still setting the scene — a large local model can take several minutes on the first response.*',
            timestamp: Date.now(),
            isSystem: true
          })
        }, SCENE_POLL_SLOW_NOTICE_MS)
        return
      }

      // Fallback: no scene prep happened — use original behavior
      // Works for both multiplayer (lobby players) and solo mode (campaign players)
      const characterIds = getCharacterIds()

      if (characterIds.length > 0) {
        sceneTimeout = setTimeout(() => {
          useAiDmStore.getState().setScene(campaign.id, characterIds)
        }, SCENE_FALLBACK_DELAY_MS)
      }
    }

    checkAndSetScene()

    return (): void => {
      cleanupTimers()
    }
  }, [
    isDM,
    campaign.id, // Initialize AI DM (preserves sceneStatus if already set from lobby)
    aiDmEnabled,
    aiDmStore.initFromCampaign,
    aiDmStore.setupListeners
  ])

  // When AI DM finishes streaming, add the message to chat and broadcast
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

    // 20F: narration is sent by the main process (single gated sender with npc/emotion).

    // Apply stat changes if any — route through approval queue or auto-apply
    if (lastMsg.statChanges && lastMsg.statChanges.length > 0) {
      const { autoApproveAiMutations, queueMutations } = useAiDmStore.getState()

      if (autoApproveAiMutations) {
        // Auto-approve path: apply immediately (original behavior)
        applyStatChangesDirectly(lastMsg.statChanges, activeMap)
      } else {
        // Queue for DM approval
        queueMutations({
          id: crypto.randomUUID(),
          messageId: lastMsg.timestamp,
          mutations: lastMsg.statChanges,
          source: 'ai-dm',
          timestamp: Date.now()
        })
      }
    }

    // Execute DM actions if any
    if (lastMsg.dmActions && lastMsg.dmActions.length > 0) {
      import('../services/game-action-executor')
        .then(({ executeDmActions }) => {
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
        .catch((err) => logger.error('[game-effects] game-action-executor import failed', err))
    }

    // Save conversation (debounced)
    window.api.ai.saveConversation(campaign.id)
  }, [
    aiDmStore.messages,
    activeMap,
    campaign.aiDm?.enabled,
    campaign.id,
    isDM, // Broadcast to clients
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
