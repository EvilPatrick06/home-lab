import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { STREAM_SAFETY_TIMEOUT_MS } from '../constants'

// Capture the listener callbacks setupListeners registers so tests can drive events.
const aiHandlers: Record<string, (data: unknown) => void> = {}

vi.stubGlobal('window', {
  dispatchEvent: vi.fn(),
  api: {
    storage: {},
    game: {},
    ai: {
      chatStream: vi.fn().mockResolvedValue({ success: true, streamId: 'test' }),
      cancelStream: vi.fn(),
      loadConversation: vi.fn().mockResolvedValue({ success: false }),
      prepareScene: vi.fn().mockResolvedValue({ success: true, streamId: 'scene-1' }),
      getSceneStatus: vi.fn().mockResolvedValue({ status: 'idle' }),
      cancelScene: vi.fn().mockResolvedValue({ success: true }),
      onStreamChunk: vi.fn((cb: (d: unknown) => void) => {
        aiHandlers.chunk = cb
        return vi.fn()
      }),
      onStreamDone: vi.fn((cb: (d: unknown) => void) => {
        aiHandlers.done = cb
        return vi.fn()
      }),
      onStreamError: vi.fn((cb: (d: unknown) => void) => {
        aiHandlers.error = cb
        return vi.fn()
      }),
      onStreamFileRead: vi.fn((cb: (d: unknown) => void) => {
        aiHandlers.fileRead = cb
        return vi.fn()
      }),
      onStreamWebSearch: vi.fn((cb: (d: unknown) => void) => {
        aiHandlers.webSearch = cb
        return vi.fn()
      }),
      onStreamStatus: vi.fn((cb: (d: unknown) => void) => {
        aiHandlers.status = cb
        return vi.fn()
      }),
      removeAllAiListeners: vi.fn()
    }
  }
})

// 04B — approvePendingActions dynamically imports the executor; mock it so we can drive
// the post-approval failure-surfacing path. Default: no failures.
vi.mock('../services/game-action-executor', () => ({
  executeDmActions: vi.fn(() => ({ executed: [], failed: [] }))
}))

import { executeDmActions } from '../services/game-action-executor'
import { useAiDmStore } from './use-ai-dm-store'

describe('useAiDmStore', () => {
  it('can be imported', async () => {
    const mod = await import('./use-ai-dm-store')
    expect(mod).toBeDefined()
  })

  it('exports the store hook', () => {
    expect(typeof useAiDmStore).toBe('function')
  })

  it('has expected initial state shape', () => {
    const state = useAiDmStore.getState()
    expect(state).toHaveProperty('enabled')
    expect(state).toHaveProperty('paused')
    expect(state).toHaveProperty('dmApprovalRequired')
    expect(state).toHaveProperty('pendingActionSets')
    expect(state).toHaveProperty('messages')
    expect(state).toHaveProperty('activeStreamId')
    expect(state).toHaveProperty('streamingText')
    expect(state).toHaveProperty('isTyping')
    expect(state).toHaveProperty('lastStatChanges')
    expect(state).toHaveProperty('lastDmActions')
    expect(state).toHaveProperty('lastRuleCitations')
    expect(state).toHaveProperty('sceneStatus')
    expect(state).toHaveProperty('fileReadStatus')
    expect(state).toHaveProperty('webSearchStatus')
    expect(state).toHaveProperty('lastError')
  })

  it('has expected initial state values', () => {
    const state = useAiDmStore.getState()
    expect(state.enabled).toBe(false)
    expect(state.paused).toBe(false)
    expect(state.dmApprovalRequired).toBe(false)
    expect(state.pendingActionSets).toEqual([])
    expect(state.messages).toEqual([])
    expect(state.activeStreamId).toBeNull()
    expect(state.streamingText).toBe('')
    expect(state.isTyping).toBe(false)
    expect(state.lastStatChanges).toEqual([])
    expect(state.lastDmActions).toEqual([])
    expect(state.lastRuleCitations).toEqual([])
    expect(state.sceneStatus).toBe('idle')
    expect(state.fileReadStatus).toBeNull()
    expect(state.webSearchStatus).toBeNull()
    expect(state.lastError).toBeNull()
  })

  it('has expected actions', () => {
    const state = useAiDmStore.getState()
    expect(typeof state.setDmApprovalRequired).toBe('function')
    expect(typeof state.enqueuePendingActions).toBe('function')
    expect(typeof state.approvePendingActions).toBe('function')
    expect(typeof state.rejectPendingActions).toBe('function')
    expect(typeof state.dismissPendingActions).toBe('function')
    expect(typeof state.initFromCampaign).toBe('function')
    expect(typeof state.sendMessage).toBe('function')
    expect(typeof state.cancelStream).toBe('function')
    expect(typeof state.setScene).toBe('function')
    expect(typeof state.prepareScene).toBe('function')
    expect(typeof state.checkSceneStatus).toBe('function')
    expect(typeof state.clearMessages).toBe('function')
    expect(typeof state.setPaused).toBe('function')
    expect(typeof state.reset).toBe('function')
    expect(typeof state.setupListeners).toBe('function')
  })

  describe('mutation approval flow', () => {
    const cleanup = (): void => {
      for (const m of useAiDmStore.getState().pendingMutations) if (m.timeoutId) clearTimeout(m.timeoutId)
      useAiDmStore.setState({ pendingMutations: [] })
    }

    it('queueMutations dedups by source messageId', () => {
      cleanup()
      const base = { id: 'a', messageId: 111, mutations: [], source: 'ai-dm' as const, timestamp: 1 }
      useAiDmStore.getState().queueMutations(base)
      useAiDmStore.getState().queueMutations({ ...base, id: 'b' }) // same messageId → ignored
      expect(useAiDmStore.getState().pendingMutations).toHaveLength(1)
      cleanup()
    })

    it('approveMutations dispatches ONE ai-mutations-approved event with all mutations', () => {
      cleanup()
      const dispatch = window.dispatchEvent as unknown as ReturnType<typeof vi.fn>
      dispatch.mockClear()
      const mutations = [
        { type: 'damage', characterName: 'Aria', value: 5, reason: 'trap' },
        { type: 'creature_damage', targetLabel: 'Goblin', value: 3, reason: 'arrow' }
      ]
      useAiDmStore.setState({
        pendingMutations: [{ id: 'x', messageId: 1, mutations: mutations as never, source: 'ai-dm', timestamp: 1 }]
      })
      useAiDmStore.getState().approveMutations('x')

      expect(dispatch).toHaveBeenCalledTimes(1)
      const evt = dispatch.mock.calls[0][0] as CustomEvent<{ mutations: unknown[] }>
      expect(evt.type).toBe('ai-mutations-approved')
      expect(evt.detail.mutations).toEqual(mutations) // creature changes no longer dropped
      expect(useAiDmStore.getState().pendingMutations).toHaveLength(0)
      cleanup()
    })

    it('rejectAllMutations clears every set and disposes all auto-reject timers (04E)', () => {
      vi.useFakeTimers()
      try {
        useAiDmStore.setState({ pendingMutations: [] })
        const baseline = vi.getTimerCount()
        useAiDmStore
          .getState()
          .queueMutations({ id: 'r1', messageId: 91, mutations: [], source: 'ai-dm', timestamp: 1 })
        useAiDmStore
          .getState()
          .queueMutations({ id: 'r2', messageId: 92, mutations: [], source: 'ai-dm', timestamp: 1 })
        expect(vi.getTimerCount()).toBe(baseline + 2)

        useAiDmStore.getState().rejectAllMutations()
        expect(useAiDmStore.getState().pendingMutations).toHaveLength(0)
        expect(vi.getTimerCount()).toBe(baseline)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('stream status (loading_model watchdog)', () => {
    it('sets streamStatus from an onStreamStatus event WITHOUT clearing isTyping', () => {
      const cleanupListeners = useAiDmStore.getState().setupListeners()
      useAiDmStore.setState({ activeStreamId: 'sid-1', isTyping: true, streamStatus: null })

      aiHandlers.status?.({ streamId: 'sid-1', status: 'loading_model' })

      const s = useAiDmStore.getState()
      expect(s.streamStatus).toBe('loading_model')
      expect(s.isTyping).toBe(true) // advisory only — must not end the stream
      cleanupListeners()
      useAiDmStore.setState({ activeStreamId: null, isTyping: false, streamStatus: null })
    })

    it('ignores a status event for a different streamId', () => {
      const cleanupListeners = useAiDmStore.getState().setupListeners()
      useAiDmStore.setState({ activeStreamId: 'sid-1', isTyping: true, streamStatus: null })

      aiHandlers.status?.({ streamId: 'other', status: 'loading_model' })

      expect(useAiDmStore.getState().streamStatus).toBeNull()
      cleanupListeners()
      useAiDmStore.setState({ activeStreamId: null, isTyping: false, streamStatus: null })
    })

    it('model_switched posts a persistent system chat note naming from→to model', async () => {
      const { useLobbyStore } = await import('./use-lobby-store')
      const cleanupListeners = useAiDmStore.getState().setupListeners()
      useAiDmStore.setState({ activeStreamId: 'sid-1', isTyping: true })
      const before = useLobbyStore.getState().chatMessages.length

      aiHandlers.status?.({ streamId: 'sid-1', status: 'model_switched', from: 'llama3.2:3b', to: 'gemma3:4b' })

      const msgs = useLobbyStore.getState().chatMessages
      expect(msgs.length).toBe(before + 1)
      const note = msgs[msgs.length - 1]
      expect(note.isSystem).toBe(true)
      expect(note.content).toContain('llama3.2:3b')
      expect(note.content).toContain('gemma3:4b')
      // Advisory — must not end the stream.
      expect(useAiDmStore.getState().isTyping).toBe(true)
      cleanupListeners()
      useAiDmStore.setState({ activeStreamId: null, isTyping: false })
    })

    it('web-search status persists the streamId + stamps receivedAt (needed by the approval UI)', () => {
      const cleanupListeners = useAiDmStore.getState().setupListeners()
      useAiDmStore.setState({ activeStreamId: 'sid-7', webSearchStatus: null })

      aiHandlers.webSearch?.({ streamId: 'sid-7', query: 'lich phylactery rules', status: 'pending_approval' })

      const ws = useAiDmStore.getState().webSearchStatus
      expect(ws).toEqual(
        expect.objectContaining({ streamId: 'sid-7', query: 'lich phylactery rules', status: 'pending_approval' })
      )
      expect(typeof ws?.receivedAt).toBe('number')
      cleanupListeners()
      useAiDmStore.setState({ activeStreamId: null, webSearchStatus: null })
    })

    // Bug fix: the renderer safety timeout is an INACTIVITY backstop — each prefill
    // heartbeat / token resets it — so a valid-but-slow large-context follow-up prefill
    // isn't wrongly cancelled, while a genuinely dead stream still surfaces a timeout.
    describe('safety timeout is reset by heartbeats (inactivity backstop)', () => {
      afterEach(() => {
        vi.useRealTimers()
        const { safetyTimeoutId } = useAiDmStore.getState()
        if (safetyTimeoutId) clearTimeout(safetyTimeoutId)
        useAiDmStore.setState({ activeStreamId: null, isTyping: false, streamStatus: null, safetyTimeoutId: null })
      })

      it('keeps the stream alive past the total window when heartbeats keep arriving', () => {
        vi.useFakeTimers()
        const cleanupListeners = useAiDmStore.getState().setupListeners()
        useAiDmStore.setState({ activeStreamId: 'sid-1', isTyping: true, safetyTimeoutId: null })

        // Arm via the first heartbeat, then keep heartbeating just under the window.
        for (let i = 0; i < 4; i++) {
          aiHandlers.status?.({ streamId: 'sid-1', status: 'loading_model' })
          vi.advanceTimersByTime(STREAM_SAFETY_TIMEOUT_MS - 10_000)
        }
        // Total elapsed (~4×320s) far exceeds the single window, but each heartbeat reset
        // the deadline — so the stream must NOT have been cancelled.
        expect(useAiDmStore.getState().isTyping).toBe(true)
        expect(useAiDmStore.getState().lastError).toBeNull()

        cleanupListeners()
      })

      it('still times out when no heartbeat/token arrives for the full window', () => {
        vi.useFakeTimers()
        const cleanupListeners = useAiDmStore.getState().setupListeners()
        useAiDmStore.setState({ activeStreamId: 'sid-1', isTyping: true, lastError: null, safetyTimeoutId: null })

        aiHandlers.status?.({ streamId: 'sid-1', status: 'loading_model' }) // arms the backstop
        vi.advanceTimersByTime(STREAM_SAFETY_TIMEOUT_MS + 1000) // ...then silence past the window

        const s = useAiDmStore.getState()
        expect(s.isTyping).toBe(false)
        expect(s.lastError).toBe('AI response timed out')
        cleanupListeners()
      })
    })

    it('a first chunk clears a pending loading_model notice', () => {
      const cleanupListeners = useAiDmStore.getState().setupListeners()
      useAiDmStore.setState({
        activeStreamId: 'sid-1',
        isTyping: true,
        streamStatus: 'loading_model',
        streamingText: ''
      })

      aiHandlers.chunk?.({ streamId: 'sid-1', text: 'Once upon' })

      const s = useAiDmStore.getState()
      expect(s.streamStatus).toBeNull()
      expect(s.streamingText).toBe('Once upon')
      cleanupListeners()
      useAiDmStore.setState({ activeStreamId: null, isTyping: false, streamStatus: null, streamingText: '' })
    })
  })

  // 04A — a dead/finished stream must never leave webSearchStatus/fileReadStatus/streamStatus
  // pinning the full-screen approval modal open (F1).
  describe('stream-status lifecycle clearing (F1)', () => {
    const seedStatuses = (streamId: string | null): void =>
      useAiDmStore.setState({
        activeStreamId: streamId,
        webSearchStatus: { query: 'q', status: 'pending_approval', streamId: streamId ?? 'x', receivedAt: 1 },
        fileReadStatus: { path: 'p', status: 'reading' },
        streamStatus: 'loading_model'
      })

    const expectCleared = (): void => {
      const s = useAiDmStore.getState()
      expect(s.webSearchStatus).toBeNull()
      expect(s.fileReadStatus).toBeNull()
      expect(s.streamStatus).toBeNull()
    }

    afterEach(() => {
      useAiDmStore.setState({
        activeStreamId: null,
        isTyping: false,
        webSearchStatus: null,
        fileReadStatus: null,
        streamStatus: null
      })
    })

    it('cancelStream clears all three statuses (with an active stream)', async () => {
      seedStatuses('sid-c')
      await useAiDmStore.getState().cancelStream()
      expectCleared()
    })

    it('cancelStream clears statuses even when activeStreamId is already null (the old skipped branch)', async () => {
      seedStatuses(null)
      await useAiDmStore.getState().cancelStream()
      expectCleared()
    })

    it('the inactivity safety backstop clears statuses on timeout', () => {
      vi.useFakeTimers()
      try {
        const cleanupListeners = useAiDmStore.getState().setupListeners()
        useAiDmStore.setState({ activeStreamId: 'sid-t', isTyping: true, safetyTimeoutId: null })
        aiHandlers.status?.({ streamId: 'sid-t', status: 'loading_model' }) // arms + seeds streamStatus
        useAiDmStore.setState({
          webSearchStatus: { query: 'q', status: 'pending_approval', streamId: 'sid-t', receivedAt: 1 },
          fileReadStatus: { path: 'p', status: 'reading' }
        })
        vi.advanceTimersByTime(STREAM_SAFETY_TIMEOUT_MS + 1000)
        expectCleared()
        cleanupListeners()
      } finally {
        vi.useRealTimers()
      }
    })

    it('handleDone clears webSearchStatus + fileReadStatus', () => {
      const cleanupListeners = useAiDmStore.getState().setupListeners()
      seedStatuses('sid-d')
      useAiDmStore.setState({ isTyping: true })
      aiHandlers.done?.({
        streamId: 'sid-d',
        fullText: 'x',
        displayText: 'x',
        statChanges: [],
        dmActions: [],
        ruleCitations: []
      })
      expectCleared()
      cleanupListeners()
    })

    it('handleError clears webSearchStatus + fileReadStatus', () => {
      const cleanupListeners = useAiDmStore.getState().setupListeners()
      seedStatuses('sid-e')
      useAiDmStore.setState({ isTyping: true })
      aiHandlers.error?.({ streamId: 'sid-e', error: 'boom' })
      expectCleared()
      cleanupListeners()
    })

    it('reset clears webSearchStatus + fileReadStatus', () => {
      seedStatuses('sid-r')
      useAiDmStore.getState().reset()
      expectCleared()
    })

    it('clearWebSearchStatus nulls just the web-search status', () => {
      useAiDmStore.setState({
        webSearchStatus: { query: 'q', status: 'pending_approval', streamId: 'x', receivedAt: 1 }
      })
      useAiDmStore.getState().clearWebSearchStatus()
      expect(useAiDmStore.getState().webSearchStatus).toBeNull()
    })
  })

  // 04B — undecided rulings queue (FIFO) instead of overwriting; approve surfaces failures;
  // dismiss is silent; override still logs (F3/F4/F5).
  describe('pending-actions queue (F3/F4/F5)', () => {
    const makeSet = (id: string, action = 'move_token') => ({
      id,
      text: id,
      actions: [{ action }],
      statChanges: []
    })

    afterEach(() => {
      useAiDmStore.setState({ pendingActionSets: [] })
      vi.mocked(executeDmActions).mockReset()
      vi.mocked(executeDmActions).mockReturnValue({ executed: [], failed: [] })
    })

    it('enqueue keeps both sets in FIFO order', () => {
      useAiDmStore.setState({ pendingActionSets: [] })
      useAiDmStore.getState().enqueuePendingActions(makeSet('first'))
      useAiDmStore.getState().enqueuePendingActions(makeSet('second'))
      const q = useAiDmStore.getState().pendingActionSets
      expect(q.map((s) => s.id)).toEqual(['first', 'second'])
    })

    it('approvePendingActions removes only the head', () => {
      useAiDmStore.setState({ pendingActionSets: [makeSet('a'), makeSet('b')] })
      useAiDmStore.getState().approvePendingActions()
      expect(useAiDmStore.getState().pendingActionSets.map((s) => s.id)).toEqual(['b'])
    })

    it('dismissPendingActions drops the head and writes NO chat message', async () => {
      const { useLobbyStore } = await import('./use-lobby-store')
      useAiDmStore.setState({ pendingActionSets: [makeSet('a'), makeSet('b')] })
      const before = useLobbyStore.getState().chatMessages.length
      useAiDmStore.getState().dismissPendingActions()
      expect(useAiDmStore.getState().pendingActionSets.map((s) => s.id)).toEqual(['b'])
      expect(useLobbyStore.getState().chatMessages.length).toBe(before)
    })

    it('rejectPendingActions logs a [DM Override] chat line and drops the head', async () => {
      const { useLobbyStore } = await import('./use-lobby-store')
      useAiDmStore.setState({ pendingActionSets: [makeSet('a')] })
      const before = useLobbyStore.getState().chatMessages.length
      useAiDmStore.getState().rejectPendingActions('bad call')
      const msgs = useLobbyStore.getState().chatMessages
      expect(msgs.length).toBe(before + 1)
      expect(msgs[msgs.length - 1].content).toContain('[DM Override]')
      expect(useAiDmStore.getState().pendingActionSets).toHaveLength(0)
    })

    it('approve surfaces each failed action as a system chat line (F4)', async () => {
      const { useLobbyStore } = await import('./use-lobby-store')
      vi.mocked(executeDmActions).mockReturnValueOnce({
        executed: [],
        failed: [{ action: { action: 'move_token' }, reason: 'not found' }]
      })
      useAiDmStore.setState({ pendingActionSets: [makeSet('a')] })
      useAiDmStore.getState().approvePendingActions()
      await vi.waitFor(() => {
        const msgs = useLobbyStore.getState().chatMessages
        const last = msgs[msgs.length - 1]
        expect(last?.content).toContain('move_token')
        expect(last?.content).toContain('not found')
      })
    })
  })

  // 04C — no approval state or live auto-reject timer survives a campaign switch / leave (F2).
  describe('approval-queue + timer hygiene on reset / initFromCampaign (F2)', () => {
    const mutationSet = (id: string, messageId: number) => ({
      id,
      messageId,
      mutations: [],
      source: 'ai-dm' as const,
      timestamp: 1
    })
    const actionSet = (id: string) => ({ id, text: id, actions: [{ action: 'move_token' }], statChanges: [] })

    afterEach(() => {
      vi.useRealTimers()
      for (const m of useAiDmStore.getState().pendingMutations) if (m.timeoutId) clearTimeout(m.timeoutId)
      useAiDmStore.setState({
        pendingMutations: [],
        pendingActionSets: [],
        activeStreamId: null,
        safetyTimeoutId: null
      })
    })

    it('reset() clears both queues and disposes the auto-reject timer', () => {
      vi.useFakeTimers()
      useAiDmStore.setState({ pendingMutations: [], pendingActionSets: [actionSet('a')] })
      const baseline = vi.getTimerCount()
      useAiDmStore.getState().queueMutations(mutationSet('m1', 1))
      expect(vi.getTimerCount()).toBe(baseline + 1)

      useAiDmStore.getState().reset()
      expect(useAiDmStore.getState().pendingMutations).toHaveLength(0)
      expect(useAiDmStore.getState().pendingActionSets).toHaveLength(0)
      expect(vi.getTimerCount()).toBe(baseline) // timer actually cleared — no cross-campaign alert
    })

    it('initFromCampaign (AI-enabled) clears both queues and disposes the timer', () => {
      vi.useFakeTimers()
      useAiDmStore.setState({ pendingMutations: [], pendingActionSets: [actionSet('a')] })
      const baseline = vi.getTimerCount()
      useAiDmStore.getState().queueMutations(mutationSet('m2', 2))
      expect(vi.getTimerCount()).toBe(baseline + 1)

      useAiDmStore.getState().initFromCampaign({ id: 'c-on', aiDm: { enabled: true } } as never)
      expect(useAiDmStore.getState().pendingMutations).toHaveLength(0)
      expect(useAiDmStore.getState().pendingActionSets).toHaveLength(0)
      expect(vi.getTimerCount()).toBe(baseline)
    })

    it('initFromCampaign (AI-disabled) also clears both queues and disposes the timer', () => {
      vi.useFakeTimers()
      useAiDmStore.setState({ pendingMutations: [], pendingActionSets: [actionSet('a')] })
      const baseline = vi.getTimerCount()
      useAiDmStore.getState().queueMutations(mutationSet('m3', 3))
      expect(vi.getTimerCount()).toBe(baseline + 1)

      useAiDmStore.getState().initFromCampaign({ id: 'c-off', aiDm: { enabled: false } } as never)
      expect(useAiDmStore.getState().pendingMutations).toHaveLength(0)
      expect(useAiDmStore.getState().pendingActionSets).toHaveLength(0)
      expect(useAiDmStore.getState().enabled).toBe(false)
      expect(vi.getTimerCount()).toBe(baseline)
    })
  })

  // 04D — webSearchDecided suppresses the silent-auto-reject alert when the DM actually clicked.
  describe('web-search decided flag (04D)', () => {
    afterEach(() => {
      useAiDmStore.setState({ activeStreamId: null, webSearchStatus: null, webSearchDecided: false })
    })

    it('a pending_approval event resets webSearchDecided to false', () => {
      const cleanupListeners = useAiDmStore.getState().setupListeners()
      useAiDmStore.setState({ activeStreamId: 'sid-9', webSearchDecided: true, webSearchStatus: null })
      aiHandlers.webSearch?.({ streamId: 'sid-9', query: 'q', status: 'pending_approval' })
      expect(useAiDmStore.getState().webSearchDecided).toBe(false)
      expect(useAiDmStore.getState().webSearchStatus?.status).toBe('pending_approval')
      cleanupListeners()
    })

    it('pending → rejected transitions status (auto-reject path) without the decided flag', () => {
      const cleanupListeners = useAiDmStore.getState().setupListeners()
      useAiDmStore.setState({ activeStreamId: 'sid-9', webSearchStatus: null, webSearchDecided: false })
      aiHandlers.webSearch?.({ streamId: 'sid-9', query: 'q', status: 'pending_approval' })
      aiHandlers.webSearch?.({ streamId: 'sid-9', query: 'q', status: 'rejected' })
      expect(useAiDmStore.getState().webSearchStatus?.status).toBe('rejected')
      expect(useAiDmStore.getState().webSearchDecided).toBe(false)
      cleanupListeners()
    })

    it('markWebSearchDecided sets the flag (the DM-clicked path)', () => {
      useAiDmStore.setState({ webSearchDecided: false })
      useAiDmStore.getState().markWebSearchDecided()
      expect(useAiDmStore.getState().webSearchDecided).toBe(true)
    })
  })

  // 05B — setupListeners cleans up per-listener (the six it registered), never the global nuke.
  describe('setupListeners per-listener cleanup (05B)', () => {
    afterEach(() => {
      useAiDmStore.setState({ activeStreamId: null, isTyping: false, streamingText: '' })
    })

    it('cleanup calls each returned unsubscribe once and never removeAllAiListeners', () => {
      const onChunk = window.api.ai.onStreamChunk as unknown as ReturnType<typeof vi.fn>
      const removeAll = window.api.ai.removeAllAiListeners as unknown as ReturnType<typeof vi.fn>
      onChunk.mockClear()
      removeAll.mockClear()

      const cleanup = useAiDmStore.getState().setupListeners()
      // Each onX returned a vi.fn() unsubscribe; grab chunk's to assert it fires on cleanup.
      const chunkUnsub = onChunk.mock.results.at(-1)?.value as ReturnType<typeof vi.fn>
      expect(chunkUnsub).not.toHaveBeenCalled()

      cleanup()
      expect(chunkUnsub).toHaveBeenCalledTimes(1)
      expect(removeAll).not.toHaveBeenCalled()
    })

    it('cleaning up the FIRST registration does not detach the SECOND (re-registration safe)', () => {
      const cleanup1 = useAiDmStore.getState().setupListeners()
      const cleanup2 = useAiDmStore.getState().setupListeners()
      useAiDmStore.setState({ activeStreamId: 'sid-2', isTyping: true, streamingText: '' })

      cleanup1() // tears down only the first registration's listeners

      // The second registration's chunk handler is still live → events still update state.
      aiHandlers.chunk?.({ streamId: 'sid-2', text: 'alive' })
      expect(useAiDmStore.getState().streamingText).toBe('alive')
      cleanup2()
    })
  })

  // 05F — a player message arriving during an in-flight stream queues (bounded FIFO) instead of
  // cancelling the current reply; the queue drains on done/error; deliberate stops clear it (F6).
  describe('message queue during in-flight stream (05F)', () => {
    const chatStream = window.api.ai.chatStream as unknown as ReturnType<typeof vi.fn>
    const cancelStreamApi = window.api.ai.cancelStream as unknown as ReturnType<typeof vi.fn>

    beforeEach(() => {
      chatStream.mockClear()
      cancelStreamApi.mockClear()
      useAiDmStore.setState({ queuedMessages: [], activeStreamId: null, isTyping: false })
    })

    afterEach(() => {
      useAiDmStore.setState({
        enabled: false,
        paused: false,
        activeStreamId: null,
        isTyping: false,
        queuedMessages: []
      })
      chatStream.mockClear()
      cancelStreamApi.mockClear()
    })

    it('a message during an active stream is queued — no re-send, no cancel', async () => {
      useAiDmStore.setState({ enabled: true, paused: false, activeStreamId: 'sid-1', isTyping: true })
      chatStream.mockClear()
      await useAiDmStore.getState().sendMessage('camp', 'hello', ['c1'], 'Alice')
      expect(chatStream).not.toHaveBeenCalled()
      expect(cancelStreamApi).not.toHaveBeenCalled()
      expect(useAiDmStore.getState().queuedMessages).toHaveLength(1)
      expect(useAiDmStore.getState().queuedMessages[0].content).toBe('hello')
    })

    it('handleDone drains the queue FIFO, preserving the queued args', async () => {
      const cleanup = useAiDmStore.getState().setupListeners()
      useAiDmStore.setState({ enabled: true, paused: false, activeStreamId: 'sid-1', isTyping: true })
      await useAiDmStore.getState().sendMessage('camp', 'second', ['c1'], 'Bob', undefined, 'GS')
      expect(useAiDmStore.getState().queuedMessages).toHaveLength(1)
      chatStream.mockClear()

      aiHandlers.done?.({
        streamId: 'sid-1',
        fullText: 'x',
        displayText: 'x',
        statChanges: [],
        dmActions: [],
        ruleCitations: []
      })
      await vi.waitFor(() => expect(chatStream).toHaveBeenCalledTimes(1))
      const sent = chatStream.mock.calls[0][0] as { message: string; senderName?: string; gameState?: string }
      expect(sent.message).toBe('second')
      expect(sent.senderName).toBe('Bob')
      expect(sent.gameState).toBe('GS')
      expect(useAiDmStore.getState().queuedMessages).toHaveLength(0)
      cleanup()
    })

    it('handleError also drains the queue', async () => {
      const cleanup = useAiDmStore.getState().setupListeners()
      useAiDmStore.setState({ enabled: true, paused: false, activeStreamId: 'sid-1', isTyping: true })
      await useAiDmStore.getState().sendMessage('camp', 'after-error', ['c1'], 'Cara')
      chatStream.mockClear()

      aiHandlers.error?.({ streamId: 'sid-1', error: 'boom' })
      await vi.waitFor(() => expect(chatStream).toHaveBeenCalledTimes(1))
      expect((chatStream.mock.calls[0][0] as { message: string }).message).toBe('after-error')
      cleanup()
    })

    it('caps the queue — the 6th enqueue is dropped', async () => {
      useAiDmStore.setState({
        enabled: true,
        paused: false,
        activeStreamId: 'sid-1',
        isTyping: true,
        queuedMessages: [1, 2, 3, 4, 5].map((n) => ({ campaignId: 'c', content: `m${n}`, characterIds: [] }))
      })
      await useAiDmStore.getState().sendMessage('camp', 'overflow', ['c1'])
      expect(useAiDmStore.getState().queuedMessages).toHaveLength(5) // dropped, not appended
      expect(useAiDmStore.getState().queuedMessages.some((m) => m.content === 'overflow')).toBe(false)
    })

    it('cancelStream clears the queue', async () => {
      useAiDmStore.setState({
        enabled: true,
        activeStreamId: 'sid-1',
        queuedMessages: [{ campaignId: 'c', content: 'x', characterIds: [] }]
      })
      await useAiDmStore.getState().cancelStream()
      expect(useAiDmStore.getState().queuedMessages).toHaveLength(0)
    })

    it('reset clears the queue', () => {
      useAiDmStore.setState({ queuedMessages: [{ campaignId: 'c', content: 'x', characterIds: [] }] })
      useAiDmStore.getState().reset()
      expect(useAiDmStore.getState().queuedMessages).toHaveLength(0)
    })

    it('solo regression: no active stream → sends immediately (not queued)', async () => {
      useAiDmStore.setState({ enabled: true, paused: false, activeStreamId: null, isTyping: false })
      chatStream.mockClear()
      await useAiDmStore.getState().sendMessage('camp', 'solo', ['c1'])
      expect(chatStream).toHaveBeenCalledTimes(1)
      expect(useAiDmStore.getState().queuedMessages).toHaveLength(0)
    })
  })

  // 06B — scene-prep cancel wiring: capture the prep stream id, real cancel, reset clears it.
  describe('scene-prep cancel wiring (06B)', () => {
    afterEach(() => {
      useAiDmStore.setState({ enabled: false, sceneStatus: 'idle', sceneError: null, sceneStreamId: null })
    })

    it('prepareScene stores the returned sceneStreamId', async () => {
      useAiDmStore.setState({ enabled: true, sceneStatus: 'idle' })
      await useAiDmStore.getState().prepareScene('camp', ['c1'])
      expect(useAiDmStore.getState().sceneStreamId).toBe('scene-1')
    })

    it('cancelScenePrep invokes ai.cancelScene and resets scene state', async () => {
      const cancelScene = window.api.ai.cancelScene as unknown as ReturnType<typeof vi.fn>
      cancelScene.mockClear()
      useAiDmStore.setState({ sceneStatus: 'preparing', sceneError: 'x', sceneStreamId: 'scene-1' })
      await useAiDmStore.getState().cancelScenePrep('camp')
      expect(cancelScene).toHaveBeenCalledWith('camp')
      const s = useAiDmStore.getState()
      expect(s.sceneStatus).toBe('idle')
      expect(s.sceneError).toBeNull()
      expect(s.sceneStreamId).toBeNull()
    })

    it('reset clears sceneStreamId', () => {
      useAiDmStore.setState({ sceneStreamId: 'scene-1' })
      useAiDmStore.getState().reset()
      expect(useAiDmStore.getState().sceneStreamId).toBeNull()
    })
  })
})
