import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', {
  api: {
    storage: {},
    game: {},
    ai: {
      chatStream: vi.fn().mockResolvedValue({ success: true, streamId: 'test' }),
      cancelStream: vi.fn(),
      loadConversation: vi.fn().mockResolvedValue({ success: false }),
      prepareScene: vi.fn().mockResolvedValue(undefined),
      getSceneStatus: vi.fn().mockResolvedValue({ status: 'idle' }),
      onStreamChunk: vi.fn(),
      onStreamDone: vi.fn(),
      onStreamError: vi.fn(),
      onStreamFileRead: vi.fn(),
      onStreamWebSearch: vi.fn(),
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
})
