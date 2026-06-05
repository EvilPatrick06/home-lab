import { describe, expect, it, vi } from 'vitest'

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
      prepareScene: vi.fn().mockResolvedValue(undefined),
      getSceneStatus: vi.fn().mockResolvedValue({ status: 'idle' }),
      onStreamChunk: vi.fn((cb: (d: unknown) => void) => {
        aiHandlers.chunk = cb
      }),
      onStreamDone: vi.fn(),
      onStreamError: vi.fn(),
      onStreamFileRead: vi.fn(),
      onStreamWebSearch: vi.fn((cb: (d: unknown) => void) => {
        aiHandlers.webSearch = cb
      }),
      onStreamStatus: vi.fn((cb: (d: unknown) => void) => {
        aiHandlers.status = cb
      }),
      removeAllAiListeners: vi.fn()
    }
  }
})

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
    expect(state).toHaveProperty('pendingActions')
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
    expect(state.pendingActions).toBeNull()
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
    expect(typeof state.setPendingActions).toBe('function')
    expect(typeof state.approvePendingActions).toBe('function')
    expect(typeof state.rejectPendingActions).toBe('function')
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

    it('web-search status persists the streamId (needed by the approval UI)', () => {
      const cleanupListeners = useAiDmStore.getState().setupListeners()
      useAiDmStore.setState({ activeStreamId: 'sid-7', webSearchStatus: null })

      aiHandlers.webSearch?.({ streamId: 'sid-7', query: 'lich phylactery rules', status: 'pending_approval' })

      const ws = useAiDmStore.getState().webSearchStatus
      expect(ws).toEqual({ streamId: 'sid-7', query: 'lich phylactery rules', status: 'pending_approval' })
      cleanupListeners()
      useAiDmStore.setState({ activeStreamId: null, webSearchStatus: null })
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
})
