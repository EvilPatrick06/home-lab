import { create } from 'zustand'
import { pushDmAlert } from '../components/game/overlays/DmAlertTray'
import { announce } from '../components/ui/ScreenReaderAnnouncer'
import { AI_MESSAGE_QUEUE_MAX, AI_MUTATIONS_AUTO_REJECT_MS, STREAM_SAFETY_TIMEOUT_MS } from '../constants'
import { i18n } from '../i18n'
import { type AiRendererAction, parseRendererActions, stripActionTags } from '../services/ai-renderer-actions'
import type { Campaign } from '../types/campaign'
import { logger } from '../utils/logger'
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

/** A player message that arrived while a stream was in flight, snapshotted at ENQUEUE time —
 *  the world (gameState/activeCreatures) as it was when the player spoke is the narratively
 *  correct context to answer with. Drained FIFO when the current reply finishes. (05F) */
interface QueuedAiMessage {
  campaignId: string
  content: string
  characterIds: string[]
  senderName?: string
  activeCreatures?: Array<{
    label: string
    currentHP: number
    maxHP: number
    ac: number
    conditions: string[]
    monsterStatBlockId?: string
  }>
  gameState?: string
  actingCharacterId?: string
}

interface AiDmState {
  // Config
  enabled: boolean
  paused: boolean

  // DM approval gating
  dmApprovalRequired: boolean
  // FIFO queue of undecided AI ruling sets — a second AI response no longer overwrites an
  // undecided ruling; the modal renders the head and the rest wait behind it (F3).
  pendingActionSets: PendingActionSet[]

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
  // S-2 — the reason scene prep failed (e.g. Ollama unreachable / model missing),
  // so the lobby can show it + offer a Retry instead of a bare "Scene prep failed".
  sceneError: string | null

  // File read / web search status
  fileReadStatus: { path: string; status: string } | null
  // streamId is carried so the approval UI can call approveWebSearch(streamId, …).
  // receivedAt stamps when the pending request arrived so the prompt can render an
  // accurate auto-reject countdown (deadline = receivedAt + WEB_SEARCH_APPROVAL_TIMEOUT_MS).
  webSearchStatus: { query: string; status: string; streamId: string; receivedAt: number } | null
  // True once the DM explicitly decided the current request, so the silent-auto-reject alert
  // (fired when main's 30s timeout flips pending_approval→rejected) doesn't double-fire.
  webSearchDecided: boolean
  // Advisory stream status (e.g. 'loading_model' while a cold model prefills). Doesn't
  // touch isTyping, but each 'loading_model' heartbeat DOES reset the inactivity safety
  // backstop (rearmSafetyTimeout) so a valid-but-slow prefill isn't wrongly cancelled.
  streamStatus: 'loading_model' | null

  // Stat mutation approval
  pendingMutations: PendingMutationSet[]
  autoApproveAiMutations: boolean

  // Player messages that arrived while a stream was in flight (bounded FIFO, drained on
  // done/error). Replaces the old "cancel the in-flight reply on every new message" (F6).
  queuedMessages: QueuedAiMessage[]

  // Errors
  lastError: string | null

  // Actions
  setDmApprovalRequired: (required: boolean) => void
  clearWebSearchStatus: () => void
  markWebSearchDecided: () => void
  enqueuePendingActions: (setToAdd: PendingActionSet) => void
  approvePendingActions: () => void
  rejectPendingActions: (dmNote: string) => void
  dismissPendingActions: () => void
  queueMutations: (set: PendingMutationSet) => void
  approveMutations: (id: string) => void
  rejectMutations: (id: string) => void
  approveAllMutations: () => void
  rejectAllMutations: () => void
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

export const useAiDmStore = create<AiDmState>((set, get) => {
  // Stream safety backstop, armed as an INACTIVITY timeout: each call RESETS the
  // deadline. The main process heartbeats 'loading_model' every 12s all through a slow
  // prefill (ai-service.ts firstTokenTimer) and tokens flow during streaming, so
  // re-arming on every heartbeat/token means we only surface "timed out" when the
  // stream is GENUINELY dead (no signal for the whole window) — NOT when a large-context
  // follow-up (system prompt + the just-generated scene + game state) is merely slow to
  // prefill on CPU. (The old fixed total-duration timeout wrongly cancelled those.)
  const rearmSafetyTimeout = (): void => {
    const existing = get().safetyTimeoutId
    if (existing) clearTimeout(existing)
    const id = setTimeout(async () => {
      const s = get()
      if (s.isTyping && s.activeStreamId) {
        if (s.queuedMessages.length > 0) {
          pushDmAlert('warning', i18n.t('notify.aiDmStore.queuedMessagesDiscarded', { count: s.queuedMessages.length }))
        }
        set({
          isTyping: false,
          lastError: 'AI response timed out',
          activeStreamId: null,
          streamingText: '',
          safetyTimeoutId: null,
          webSearchStatus: null,
          fileReadStatus: null,
          streamStatus: null,
          queuedMessages: []
        })
        await window.api.ai.cancelStream(s.activeStreamId)
      }
    }, STREAM_SAFETY_TIMEOUT_MS)
    set({ safetyTimeoutId: id })
  }

  // Dispose every live auto-reject timer held in pendingMutations and return empty approval
  // queues. Called on reset()/initFromCampaign() so a queued set's 60s timer can't fire a
  // stale `mutationsAutoRejected` alert in the NEXT campaign, and no campaign-A approval UI
  // survives into campaign B (F2).
  const clearApprovalState = (): { pendingActionSets: never[]; pendingMutations: never[] } => {
    for (const m of get().pendingMutations) if (m.timeoutId) clearTimeout(m.timeoutId)
    return { pendingActionSets: [], pendingMutations: [] }
  }

  // Pop the oldest queued player message and send it. Called when the current reply finishes
  // (done/error) or a send fails synchronously, so the queue can never strand. (05F / F6)
  const drainQueue = (): void => {
    const next = get().queuedMessages[0]
    if (!next) return
    set({ queuedMessages: get().queuedMessages.slice(1) })
    void get().sendMessage(
      next.campaignId,
      next.content,
      next.characterIds,
      next.senderName,
      next.activeCreatures,
      next.gameState,
      next.actingCharacterId
    )
  }

  return {
    enabled: false,
    paused: false,
    dmApprovalRequired: false,
    pendingActionSets: [],

    messages: [],

    activeStreamId: null,
    streamingText: '',
    isTyping: false,
    safetyTimeoutId: null,

    sceneStatus: 'idle',
    sceneError: null,
    lastStatChanges: [],
    lastDmActions: [],
    lastRuleCitations: [],
    fileReadStatus: null,
    webSearchStatus: null,
    webSearchDecided: false,
    streamStatus: null,
    pendingMutations: [],
    autoApproveAiMutations: false,
    queuedMessages: [],
    lastError: null,

    setDmApprovalRequired: (required: boolean) => set({ dmApprovalRequired: required }),

    // Used by the web-search prompt when approveWebSearch returns success:false (the
    // request already timed out / was cancelled) so the modal unmounts instead of wedging.
    clearWebSearchStatus: () => set({ webSearchStatus: null }),

    // The DM clicked Approve/Reject — suppress the silent-auto-reject alert that would
    // otherwise fire when main's pending_approval→rejected transition arrives.
    markWebSearchDecided: () => set({ webSearchDecided: true }),

    enqueuePendingActions: (setToAdd: PendingActionSet) => {
      const queued = get().pendingActionSets
      // A second AI ruling lands BEHIND the first instead of clobbering it. Tell the DM
      // another ruling is waiting so it isn't silently buried (the other half of F3).
      if (queued.length >= 1) {
        pushDmAlert('info', i18n.t('notify.aiDmStore.rulingQueued', { count: queued.length + 1 }))
      }
      set({ pendingActionSets: [...queued, setToAdd] })
    },

    approvePendingActions: () => {
      const head = get().pendingActionSets[0]
      if (!head) return
      // Execute the head set via game-action-executor with bypassApproval.
      // Phase 17d (RUN-3/4) — surface a failed dynamic import instead of silently dropping the
      // approved actions (the DM would otherwise get no feedback that nothing ran).
      import('../services/game-action-executor')
        .then(({ executeDmActions }) => {
          // F4 — surface post-approval failures the same way the auto-execute path does
          // (use-game-effects.ts), so the DM (and the AI's chat history) learn what didn't run.
          const result = executeDmActions(head.actions, true)
          for (const f of result.failed) {
            useLobbyStore.getState().addChatMessage({
              id: `ai-approve-fail-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
              senderId: 'system',
              senderName: 'System',
              content: i18n.t('notify.aiDmStore.approvedActionFailed', { action: f.action.action, reason: f.reason }),
              timestamp: Date.now(),
              isSystem: true
            })
          }
          if (result.failed.length > 0) {
            const first = result.failed[0]
            pushDmAlert(
              'warning',
              i18n.t('notify.aiDmStore.approvedActionFailed', { action: first.action.action, reason: first.reason })
            )
          }
        })
        .catch((err) => {
          pushDmAlert('error', i18n.t('notify.aiDmStore.runApprovedFailed'))
          logger.error('[ai-dm] game-action-executor import failed', err)
        })
      set({ pendingActionSets: get().pendingActionSets.slice(1) })
    },

    rejectPendingActions: (dmNote: string) => {
      const head = get().pendingActionSets[0]
      if (!head) return
      // Log the override to chat
      useLobbyStore.getState().addChatMessage({
        id: `dm-override-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        senderId: 'dm',
        senderName: 'DM',
        content: `[DM Override] AI ruling rejected${dmNote ? `: ${dmNote}` : ''}`,
        timestamp: Date.now(),
        isSystem: true
      })
      set({ pendingActionSets: get().pendingActionSets.slice(1) })
    },

    // Drop the head set WITHOUT logging an override — matches the Dismiss button's
    // "dismiss without applying or logging an override" tooltip (F5).
    dismissPendingActions: () => {
      const queued = get().pendingActionSets
      if (queued.length === 0) return
      set({ pendingActionSets: queued.slice(1) })
    },

    queueMutations: (mutationSet: PendingMutationSet) => {
      // Dedup by source message — the AI-message effect can re-run (re-render /
      // re-subscribe), and re-queuing the same set would double-apply on approval.
      if (get().pendingMutations.some((m) => m.messageId === mutationSet.messageId)) return
      // Auto-reject after AI_MUTATIONS_AUTO_REJECT_MS
      const timeoutId = setTimeout(() => {
        const state = get()
        const still = state.pendingMutations.find((m) => m.id === mutationSet.id)
        if (still) {
          set({ pendingMutations: state.pendingMutations.filter((m) => m.id !== mutationSet.id) })
          pushDmAlert('warning', i18n.t('notify.aiDmStore.mutationsAutoRejected'))
          // Make the silent 60s auto-reject audible to a non-sighted DM (F12).
          announce(i18n.t('notify.aiDmStore.mutationsAutoRejected'))
        }
      }, AI_MUTATIONS_AUTO_REJECT_MS)
      set((state) => ({
        pendingMutations: [...state.pendingMutations, { ...mutationSet, timeoutId }]
      }))
    },

    approveMutations: (id: string) => {
      const state = get()
      const found = state.pendingMutations.find((m) => m.id === id)
      if (!found) return
      if (found.timeoutId) clearTimeout(found.timeoutId)

      // Funnel ALL approved mutations (character + creature) through the single
      // apply path in use-game-effects via this event. That hook holds the active
      // map needed for creature token mutations and shares the same name-matching
      // as the auto-approve path — so manual approval no longer drops creature
      // changes (the listener for this event used to be missing) and the
      // character-routing logic isn't duplicated here.
      if (found.mutations.length > 0) {
        window.dispatchEvent(new CustomEvent('ai-mutations-approved', { detail: { mutations: found.mutations } }))
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

    // One-shot mass reject: dispose every auto-reject timer then clear the queue in a single
    // set (unlike approveAll's per-id loop, so the timers can't race a partially-cleared list).
    rejectAllMutations: () => {
      for (const m of get().pendingMutations) if (m.timeoutId) clearTimeout(m.timeoutId)
      set({ pendingMutations: [] })
    },

    setAutoApproveAiMutations: (auto: boolean) => set({ autoApproveAiMutations: auto }),

    initFromCampaign: (campaign) => {
      const aiDm = campaign.aiDm
      if (!aiDm?.enabled) {
        // Clear any stale campaign-A approval UI/timers so they don't survive into an
        // AI-disabled campaign B (RulingApprovalModal/MutationApprovalPanel mount on queue
        // contents, not on `enabled`). (F2)
        set({
          ...clearApprovalState(),
          queuedMessages: [],
          enabled: false,
          webSearchStatus: null,
          fileReadStatus: null
        })
        return
      }

      const currentSceneStatus = get().sceneStatus

      set({
        ...clearApprovalState(),
        queuedMessages: [],
        webSearchStatus: null,
        fileReadStatus: null,
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
      window.api.ai
        .loadConversation(campaign.id)
        .then((result) => {
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
        .catch((err) => logger.error('[ai-dm] loadConversation failed', err))
    },

    sendMessage: async (
      campaignId,
      content,
      characterIds,
      senderName,
      activeCreatures,
      gameState,
      actingCharacterId
    ) => {
      const state = get()
      if (!state.enabled || state.paused) return

      // A stream is in flight (or about to be — isTyping covers the pre-streamId window between
      // chatStream invoke and activeStreamId set). Queue this message instead of cancelling the
      // current reply, which used to silently destroy another player's in-progress answer (F6).
      if (state.activeStreamId || state.isTyping) {
        if (state.queuedMessages.length >= AI_MESSAGE_QUEUE_MAX) {
          pushDmAlert('warning', i18n.t('notify.aiDmStore.messageQueueFull', { count: AI_MESSAGE_QUEUE_MAX }))
          return
        }
        set({
          queuedMessages: [
            ...state.queuedMessages,
            { campaignId, content, characterIds, senderName, activeCreatures, gameState, actingCharacterId }
          ]
        })
        pushDmAlert('info', i18n.t('notify.aiDmStore.messageQueued', { sender: senderName ?? '' }))
        return
      }

      set({
        isTyping: true,
        streamingText: '',
        lastError: null,
        fileReadStatus: null,
        webSearchStatus: null,
        streamStatus: null
      })

      // Inactivity safety backstop — reset on each heartbeat/token (see rearmSafetyTimeout).
      rearmSafetyTimeout()

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
          // AI-2 — surface the failure instead of dying silently. A common cause is
          // the campaign's model not being installed (Ollama 404); the user
          // previously saw nothing (no toast, no "thinking" indicator, counter at 0).
          const t = get().safetyTimeoutId
          if (t) clearTimeout(t)
          const errorMsg = result.error || 'Failed to start chat'
          set({ isTyping: false, lastError: errorMsg, safetyTimeoutId: null })
          pushDmAlert('error', i18n.t('notify.aiDmStore.aiDmError', { error: errorMsg }))
          drainQueue() // a failed send must not strand a queued message
        }
      } catch (error) {
        const t = get().safetyTimeoutId
        if (t) clearTimeout(t)
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        set({ isTyping: false, lastError: errorMsg, safetyTimeoutId: null })
        pushDmAlert('error', i18n.t('notify.aiDmStore.aiDmError', { error: errorMsg }))
        drainQueue()
      }
    },

    cancelStream: async () => {
      const { activeStreamId, safetyTimeoutId, queuedMessages } = get()
      if (safetyTimeoutId) {
        clearTimeout(safetyTimeoutId)
      }
      // An explicit cancel means "stop the AI" — discarding any queued sends (auto-firing them
      // right after a cancel would be surprising). Tell the DM if anything was waiting. (05F)
      if (queuedMessages.length > 0) {
        pushDmAlert('warning', i18n.t('notify.aiDmStore.queuedMessagesDiscarded', { count: queuedMessages.length }))
      }
      // Clear UI + stale approval/status state UNCONDITIONALLY (even when activeStreamId is
      // already null) so a dead stream can never leave webSearchStatus pinning the
      // full-screen approval modal open with no way to dismiss it (F1).
      set({
        activeStreamId: null,
        isTyping: false,
        streamingText: '',
        safetyTimeoutId: null,
        webSearchStatus: null,
        fileReadStatus: null,
        streamStatus: null,
        queuedMessages: []
      })
      if (activeStreamId) {
        // Then perform the async cancellation
        await window.api.ai.cancelStream(activeStreamId)
      }
    },

    prepareScene: async (campaignId, characterIds) => {
      const state = get()
      // Allow a retry from the 'error' state (S-2); only block while actively
      // preparing or already ready.
      if (!state.enabled || state.sceneStatus === 'preparing' || state.sceneStatus === 'ready') return

      set({ sceneStatus: 'preparing', sceneError: null })
      try {
        await window.api.ai.prepareScene(campaignId, characterIds)
      } catch (err) {
        set({ sceneStatus: 'error', sceneError: err instanceof Error ? err.message : String(err) })
      }
    },

    checkSceneStatus: async (campaignId) => {
      const result = await window.api.ai.getSceneStatus(campaignId)
      set({
        sceneStatus: result.status === 'idle' ? 'idle' : result.status,
        sceneError: result.status === 'error' ? (result.error ?? 'Scene preparation failed.') : null
      })
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
        ...clearApprovalState(),
        queuedMessages: [],
        enabled: false,
        paused: false,
        messages: [],
        sceneStatus: 'idle',
        sceneError: null,
        activeStreamId: null,
        streamingText: '',
        isTyping: false,
        streamStatus: null,
        webSearchStatus: null,
        fileReadStatus: null,
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
          // First real token clears any "loading model" notice.
          set({ streamingText: state.streamingText + data.text, ...(state.streamStatus ? { streamStatus: null } : {}) })
          // A token means the stream is alive — reset the inactivity backstop.
          rearmSafetyTimeout()
        }
      }

      const handleStreamStatus = (data: { streamId: string; status: string; from?: string; to?: string }): void => {
        const state = get()
        if (data.streamId !== state.activeStreamId) return
        if (data.status === 'loading_model') {
          // Prefill heartbeat: the model is alive and cold-loading/prefilling. Show the
          // notice AND reset the inactivity backstop so a valid-but-slow prefill (large
          // follow-up context on CPU) is never wrongly cancelled. This completes the
          // contract the main process assumes (ai-service.ts firstTokenTimer comment).
          set({ streamStatus: 'loading_model' })
          rearmSafetyTimeout()
        } else if (data.status === 'model_switched' && data.to) {
          // The configured model wasn't installed — tell the player WHICH model is now
          // in use and WHY, both as a persistent chat note and an immediate alert.
          const content = data.from
            ? i18n.t('notify.aiDmStore.modelSwitched', { from: data.from, to: data.to })
            : i18n.t('notify.aiDmStore.modelAutoSelected', { to: data.to })
          useLobbyStore.getState().addChatMessage({
            id: `ai-model-switch-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
            senderId: 'system',
            senderName: 'System',
            content,
            timestamp: Date.now(),
            isSystem: true
          })
          pushDmAlert('warning', content)
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
            streamStatus: null,
            webSearchStatus: null,
            fileReadStatus: null,
            safetyTimeoutId: null,
            lastStatChanges: data.statChanges,
            lastDmActions: dmActions,
            lastRuleCitations: ruleCitations,
            messages: [...state.messages, newMessage]
          })
          // The current reply finished — answer the next queued player message (FIFO). (05F)
          drainQueue()
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
            streamStatus: null,
            webSearchStatus: null,
            fileReadStatus: null,
            safetyTimeoutId: null,
            lastError: data.error
          })
          pushDmAlert('error', i18n.t('notify.aiDmStore.aiDmError', { error: data.error }))
          // Even on error, drain the queue so a later message still gets answered. (05F)
          drainQueue()
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
        if (data.streamId !== state.activeStreamId) return
        // A fresh request resets the decided flag so a later auto-reject can be announced.
        if (data.status === 'pending_approval') {
          set({ webSearchDecided: false })
        } else if (
          data.status === 'rejected' &&
          state.webSearchStatus?.status === 'pending_approval' &&
          !state.webSearchDecided
        ) {
          // Main's 30s timeout flipped pending→rejected and the DM never clicked — tell them
          // WHY the modal vanished instead of letting it disappear silently (F7).
          pushDmAlert('info', i18n.t('notify.aiDmStore.webSearchAutoRejected', { query: data.query }))
        }
        set({
          webSearchStatus: { query: data.query, status: data.status, streamId: data.streamId, receivedAt: Date.now() }
        })
      }

      // Collect per-listener unsubscribes (05A) so cleanup removes ONLY the six listeners
      // this call registered — never the global nuke, which would deafen any other consumer
      // and (because the old effect ran cleanup on every campaign-identity change) leave the
      // renderer permanently deaf (F1). Per-listener removal makes re-registration safe (05C).
      const unsubscribes = [
        window.api.ai.onStreamChunk(handleChunk),
        window.api.ai.onStreamDone(handleDone),
        window.api.ai.onStreamError(handleError),
        window.api.ai.onStreamFileRead(handleFileRead),
        window.api.ai.onStreamWebSearch(handleWebSearch),
        window.api.ai.onStreamStatus(handleStreamStatus)
      ]

      return () => {
        for (const unsubscribe of unsubscribes) unsubscribe()
      }
    }
  }
})
