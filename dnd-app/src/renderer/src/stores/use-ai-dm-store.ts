import { create } from 'zustand'
import { pushDmAlert } from '../components/game/overlays/DmAlertTray'
import { type AiRendererAction, parseRendererActions, stripActionTags } from '../services/ai-renderer-actions'
import type { Campaign } from '../types/campaign'
import { useLobbyStore } from './use-lobby-store'

interface AiStatChange {
  type: string
  [key: string]: unknown
}

interface AiDmAction {
  action: string
  [key: string]: unknown
}

interface AiRuleCitation {
  source: string
  rule: string
  text: string
}

interface AiMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  statChanges?: AiStatChange[]
  dmActions?: AiDmAction[]
  ruleCitations?: AiRuleCitation[]
}

interface PendingActionSet {
  id: string
  text: string
  actions: AiDmAction[]
  statChanges: AiStatChange[]
}

export interface PendingMutationSet {
  id: string
  messageId: number
  mutations: AiStatChange[]
  source: 'ai-dm' | 'discord'
  timestamp: number
  timeoutId?: ReturnType<typeof setTimeout>
}

interface AiDmState {
  // Config
  enabled: boolean
  paused: boolean

  // DM approval gating
  dmApprovalRequired: boolean
  pendingActions: PendingActionSet | null

  // Conversation
  messages: AiMessage[]

  // Streaming
  activeStreamId: string | null
  streamingText: string
  isTyping: boolean
  safetyTimeoutId: ReturnType<typeof setTimeout> | null

  // Stat changes from last response
  lastStatChanges: AiStatChange[]

  // DM actions from last response
  lastDmActions: AiDmAction[]

  // Rule citations from last response
  lastRuleCitations: AiRuleCitation[]

  // Scene preparation
  sceneStatus: 'idle' | 'preparing' | 'ready' | 'error'

  // File read / web search status
  fileReadStatus: { path: string; status: string } | null
  webSearchStatus: { query: string; status: string } | null

  // Stat mutation approval
  pendingMutations: PendingMutationSet[]
  autoApproveAiMutations: boolean

  // Errors
  lastError: string | null

  // Actions
  setDmApprovalRequired: (required: boolean) => void
  setPendingActions: (pending: PendingActionSet | null) => void
  approvePendingActions: () => void
  rejectPendingActions: (dmNote: string) => void
  queueMutations: (set: PendingMutationSet) => void
  approveMutations: (id: string) => void
  rejectMutations: (id: string) => void
  approveAllMutations: () => void
  setAutoApproveAiMutations: (auto: boolean) => void
  initFromCampaign: (campaign: Campaign) => void
  sendMessage: (
    campaignId: string,
    content: string,
    characterIds: string[],
    senderName?: string,
    activeCreatures?: Array<{
      label: string
      currentHP: number
      maxHP: number
      ac: number
      conditions: string[]
      monsterStatBlockId?: string
    }>,
    gameState?: string,
    actingCharacterId?: string
  ) => Promise<void>
  cancelStream: () => Promise<void>
  setScene: (campaignId: string, characterIds: string[], gameState?: string) => Promise<void>
  prepareScene: (campaignId: string, characterIds: string[]) => Promise<void>
  checkSceneStatus: (campaignId: string) => Promise<void>
  clearMessages: () => void
  setPaused: (paused: boolean) => void
  reset: () => void
  setupListeners: () => () => void
}

export const useAiDmStore = create<AiDmState>((set, get) => ({
  enabled: false,
  paused: false,
  dmApprovalRequired: false,
  pendingActions: null,

  messages: [],

  activeStreamId: null,
  streamingText: '',
  isTyping: false,
  safetyTimeoutId: null,

  sceneStatus: 'idle',
  lastStatChanges: [],
  lastDmActions: [],
  lastRuleCitations: [],
  fileReadStatus: null,
  webSearchStatus: null,
  pendingMutations: [],
  autoApproveAiMutations: false,
  lastError: null,

  setDmApprovalRequired: (required: boolean) => set({ dmApprovalRequired: required }),

  setPendingActions: (pending: PendingActionSet | null) => set({ pendingActions: pending }),

  approvePendingActions: () => {
    const { pendingActions } = get()
    if (!pendingActions) return
    // Execute the pending actions via game-action-executor with bypassApproval
    import('../services/game-action-executor').then(({ executeDmActions }) => {
      executeDmActions(pendingActions.actions, true)
    })
    set({ pendingActions: null })
  },

  rejectPendingActions: (dmNote: string) => {
    const { pendingActions } = get()
    if (!pendingActions) return
    // Log the override to chat
    useLobbyStore.getState().addChatMessage({
      id: `dm-override-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
      senderId: 'dm',
      senderName: 'DM',
      content: `[DM Override] AI ruling rejected${dmNote ? `: ${dmNote}` : ''}`,
      timestamp: Date.now(),
      isSystem: true
    })
    set({ pendingActions: null })
  },

  queueMutations: (mutationSet: PendingMutationSet) => {
    // Auto-reject after 60 seconds
    const timeoutId = setTimeout(() => {
      const state = get()
      const still = state.pendingMutations.find((m) => m.id === mutationSet.id)
      if (still) {
        set({ pendingMutations: state.pendingMutations.filter((m) => m.id !== mutationSet.id) })
        pushDmAlert('warning', `AI mutations auto-rejected (60s timeout)`)
      }
    }, 60_000)
    set((state) => ({
      pendingMutations: [...state.pendingMutations, { ...mutationSet, timeoutId }]
    }))
  },

  approveMutations: (id: string) => {
    const state = get()
    const found = state.pendingMutations.find((m) => m.id === id)
    if (!found) return
    if (found.timeoutId) clearTimeout(found.timeoutId)

    // Apply via IPC
    const players = useLobbyStore.getState().players
    const playersWithChars = players.filter((p) => p.characterId)
    if (playersWithChars.length > 0) {
      const creatureChanges = found.mutations.filter((c) => c.type.startsWith('creature_'))
      const characterChanges = found.mutations.filter((c) => !c.type.startsWith('creature_'))

      if (characterChanges.length > 0) {
        const changesByCharId = new Map<string, typeof characterChanges>()
        for (const change of characterChanges) {
          const named = change.characterName as string | undefined
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

      // Creature changes are applied via game store event (emitted from use-game-effects)
      if (creatureChanges.length > 0) {
        // Emit a custom event so use-game-effects can pick it up
        window.dispatchEvent(new CustomEvent('ai-mutations-approved', { detail: { mutations: creatureChanges } }))
      }
    }

    set({ pendingMutations: state.pendingMutations.filter((m) => m.id !== id) })
  },

  rejectMutations: (id: string) => {
    const state = get()
    const found = state.pendingMutations.find((m) => m.id === id)
    if (found?.timeoutId) clearTimeout(found.timeoutId)
    set({ pendingMutations: state.pendingMutations.filter((m) => m.id !== id) })
  },

  approveAllMutations: () => {
    const state = get()
    for (const m of state.pendingMutations) {
      state.approveMutations(m.id)
    }
  },

  setAutoApproveAiMutations: (auto: boolean) => set({ autoApproveAiMutations: auto }),

  initFromCampaign: (campaign) => {
    const aiDm = campaign.aiDm
    if (!aiDm?.enabled) {
      set({ enabled: false })
      return
    }

    const currentSceneStatus = get().sceneStatus

    set({
      enabled: true,
      paused: false,
      messages: [],
      // Preserve stream state if scene prep is active
      activeStreamId: currentSceneStatus === 'preparing' ? get().activeStreamId : null,
      streamingText: currentSceneStatus === 'preparing' ? get().streamingText : '',
      isTyping: currentSceneStatus === 'preparing',
      lastStatChanges: [],
      lastDmActions: [],
      lastRuleCitations: [],
      lastError: null
      // sceneStatus NOT reset — preserved from lobby
    })

    // Load saved conversation
    window.api.ai.loadConversation(campaign.id).then((result) => {
      if (result.success && result.data) {
        const data = result.data as { messages?: Array<{ role: string; content: string; timestamp?: string }> }
        if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
          set({
            messages: data.messages.map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
              timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now()
            })),
            sceneStatus: 'ready'
          })
        }
      }
    })
  },

  sendMessage: async (campaignId, content, characterIds, senderName, activeCreatures, gameState, actingCharacterId) => {
    const state = get()
    if (!state.enabled || state.paused) return

    // Cancel any active stream first
    if (state.activeStreamId) {
      await get().cancelStream()
    }

    set({ isTyping: true, streamingText: '', lastError: null, fileReadStatus: null, webSearchStatus: null })

    // Safety timeout: if still typing after 60s, auto-clear
    const streamStartTime = Date.now()
    const timeoutId = setTimeout(async () => {
      const s = get()
      if (s.isTyping && s.activeStreamId && Date.now() - streamStartTime >= 59000) {
        // Update UI state immediately to prevent race conditions
        set({
          isTyping: false,
          lastError: 'AI response timed out',
          activeStreamId: null,
          streamingText: '',
          safetyTimeoutId: null
        })
        // Then perform the async cancellation
        await window.api.ai.cancelStream(s.activeStreamId)
      }
    }, 60000)

    // Store timeout ID in state for cleanup when stream completes
    set({ safetyTimeoutId: timeoutId })

    try {
      const result = await window.api.ai.chatStream({
        campaignId,
        message: content,
        characterIds,
        actingCharacterId,
        senderName,
        activeCreatures,
        gameState
      })

      if (result.success && result.streamId) {
        set({ activeStreamId: result.streamId })
      } else {
        set({ isTyping: false, lastError: result.error || 'Failed to start chat' })
      }
    } catch (error) {
      set({
        isTyping: false,
        lastError: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  },

  cancelStream: async () => {
    const { activeStreamId, safetyTimeoutId } = get()
    if (safetyTimeoutId) {
      clearTimeout(safetyTimeoutId)
    }
    if (activeStreamId) {
      // Update UI state immediately to prevent race conditions
      set({
        activeStreamId: null,
        isTyping: false,
        streamingText: '',
        safetyTimeoutId: null
      })
      // Then perform the async cancellation
      await window.api.ai.cancelStream(activeStreamId)
    }
  },

  prepareScene: async (campaignId, characterIds) => {
    const state = get()
    if (!state.enabled || state.sceneStatus !== 'idle') return

    set({ sceneStatus: 'preparing' })
    try {
      await window.api.ai.prepareScene(campaignId, characterIds)
    } catch {
      set({ sceneStatus: 'error' })
    }
  },

  checkSceneStatus: async (campaignId) => {
    const result = await window.api.ai.getSceneStatus(campaignId)
    set({ sceneStatus: result.status === 'idle' ? 'idle' : result.status })
  },

  setScene: async (campaignId, characterIds, gameState?: string) => {
    const state = get()
    if (!state.enabled) return

    await state.sendMessage(
      campaignId,
      'The adventure begins. Set the scene for the party. Describe the opening location and atmosphere.',
      characterIds,
      undefined,
      undefined,
      gameState
    )
  },

  clearMessages: () => {
    set({ messages: [] })
  },

  setPaused: (paused) => {
    set({ paused })
  },

  reset: () => {
    const { activeStreamId, safetyTimeoutId } = get()
    if (safetyTimeoutId) {
      clearTimeout(safetyTimeoutId)
    }
    if (activeStreamId) {
      window.api.ai.cancelStream(activeStreamId)
    }
    set({
      enabled: false,
      paused: false,
      messages: [],
      sceneStatus: 'idle',
      activeStreamId: null,
      streamingText: '',
      isTyping: false,
      safetyTimeoutId: null,
      lastStatChanges: [],
      lastDmActions: [],
      lastRuleCitations: [],
      lastError: null
    })
  },

  setupListeners: () => {
    const handleChunk = (data: { streamId: string; text: string }): void => {
      const state = get()
      if (data.streamId === state.activeStreamId) {
        set({ streamingText: state.streamingText + data.text })
      }
    }

    const handleDone = (data: {
      streamId: string
      fullText: string
      displayText: string
      statChanges: AiStatChange[]
      dmActions: AiDmAction[]
      ruleCitations?: AiRuleCitation[]
    }): void => {
      const state = get()
      if (data.streamId === state.activeStreamId) {
        // Clear the safety timeout since stream completed successfully
        if (state.safetyTimeoutId) {
          clearTimeout(state.safetyTimeoutId)
        }

        const dmActions = data.dmActions ?? []
        const ruleCitations = data.ruleCitations ?? []

        // Parse and strip renderer action tags from display text
        const rendererActions: AiRendererAction[] = parseRendererActions(data.displayText)
        const cleanDisplayText = rendererActions.length > 0 ? stripActionTags(data.displayText) : data.displayText

        const newMessage: AiMessage = {
          role: 'assistant',
          content: cleanDisplayText,
          timestamp: Date.now(),
          statChanges: data.statChanges.length > 0 ? data.statChanges : undefined,
          dmActions: dmActions.length > 0 ? dmActions : undefined,
          ruleCitations: ruleCitations.length > 0 ? ruleCitations : undefined
        }

        set({
          activeStreamId: null,
          isTyping: false,
          streamingText: '',
          safetyTimeoutId: null,
          lastStatChanges: data.statChanges,
          lastDmActions: dmActions,
          lastRuleCitations: ruleCitations,
          messages: [...state.messages, newMessage]
        })
      }
    }

    const handleError = (data: { streamId: string; error: string }): void => {
      const state = get()
      if (data.streamId === state.activeStreamId) {
        // Clear the safety timeout since stream ended with error
        if (state.safetyTimeoutId) {
          clearTimeout(state.safetyTimeoutId)
        }

        set({
          activeStreamId: null,
          isTyping: false,
          streamingText: '',
          safetyTimeoutId: null,
          lastError: data.error
        })
        pushDmAlert('error', `AI DM: ${data.error}`)
      }
    }

    const handleFileRead = (data: { streamId: string; path: string; status: string }): void => {
      const state = get()
      if (data.streamId === state.activeStreamId) {
        set({ fileReadStatus: { path: data.path, status: data.status } })
      }
    }

    const handleWebSearch = (data: { streamId: string; query: string; status: string }): void => {
      const state = get()
      if (data.streamId === state.activeStreamId) {
        set({ webSearchStatus: { query: data.query, status: data.status } })
      }
    }

    window.api.ai.onStreamChunk(handleChunk)
    window.api.ai.onStreamDone(handleDone)
    window.api.ai.onStreamError(handleError)
    window.api.ai.onStreamFileRead(handleFileRead)
    window.api.ai.onStreamWebSearch(handleWebSearch)

    // Return cleanup function
    return () => {
      window.api.ai.removeAllAiListeners()
    }
  }
}))
