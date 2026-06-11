import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ──

// Stable, per-test-configurable provider streamChat so 06C can drive a prep stream to
// 'error' (and then hang a retry) deterministically. Defaults to a clean resolve.
const hoisted = vi.hoisted(() => ({
  providerStreamChat: vi.fn(async () => {}),
  addMessageCalls: [] as Array<[string, string, string[] | undefined]>
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp/test'),
    getAppPath: vi.fn(() => '/tmp/app')
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => false)
  }
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn(),
  renameSync: vi.fn()
}))

// Phase 17d (NET-10) — configure now writes asynchronously via fs/promises.
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  unlink: vi.fn(async () => undefined)
}))

vi.mock('./chunk-builder', () => ({
  buildChunkIndex: vi.fn(() => ({ chunks: [{ id: '1' }, { id: '2' }] })),
  loadChunkIndex: vi.fn(() => null)
}))

vi.mock('./context-builder', () => ({
  buildContext: vi.fn(async () => ({
    text: '',
    breakdown: {
      rulebookChunks: 0,
      srdData: 0,
      characterData: 0,
      campaignData: 0,
      creatures: 0,
      gameState: 0,
      memory: 0,
      total: 0
    },
    chunkIds: []
  })),
  recordTokenBreakdown: vi.fn(),
  clearTokenBreakdown: vi.fn(),
  setSearchEngine: vi.fn()
}))

vi.mock('./conversation-manager', () => ({
  ConversationManager: class {
    public contextWasTruncated = false
    public lastTokenEstimate = 100
    private messages: Array<{ role: string; content: string }> = []

    setSummarizeCallback(): void {}
    setActiveCharacterIds(): void {}
    addMessage(role: string, content: string, chunkIds?: string[]): void {
      this.messages.push({ role, content })
      hoisted.addMessageCalls.push([role, content, chunkIds])
    }
    async getMessagesForApi(): Promise<{
      systemPrompt: string
      messages: Array<{ role: string; content: string }>
    }> {
      return { systemPrompt: 'System', messages: this.messages }
    }
    serialize(): unknown {
      return { messages: this.messages, summaries: [], activeCharacterIds: [] }
    }
    restore(): void {}
    getMessageCount(): number {
      return this.messages.length
    }
    removeTrailingUserMessage(content: string): boolean {
      const last = this.messages[this.messages.length - 1]
      if (last && last.role === 'user' && last.content === content) {
        this.messages.pop()
        return true
      }
      return false
    }
    clearScenePrepExchange(prompt: string): boolean {
      const onlyPrep =
        this.messages.length >= 1 &&
        this.messages.length <= 2 &&
        this.messages[0].role === 'user' &&
        this.messages[0].content === prompt
      if (onlyPrep) {
        this.messages = []
        return true
      }
      return false
    }
    async generateSessionSummary(): Promise<string | null> {
      return 'Session summary text'
    }
  }
}))

vi.mock('./ollama-client', () => ({
  getOllamaUrl: vi.fn(() => 'http://localhost:11434'),
  isOllamaRunning: vi.fn(async () => true),
  listOllamaModels: vi.fn(async () => ['llama3.1', 'mistral']),
  fetchOllamaModels: vi.fn(async () => ['llama3.1', 'mistral']),
  ollamaChatOnce: vi.fn(async () => 'summary result'),
  ollamaStreamChat: vi.fn(),
  setOllamaUrl: vi.fn(),
  ollamaProvider: {
    type: 'ollama',
    streamChat: vi.fn(),
    chatOnce: vi.fn(async () => 'summary result'),
    isAvailable: vi.fn(async () => true),
    listModels: vi.fn(async () => ['llama3.1', 'mistral'])
  }
}))

vi.mock('./ollama-manager', () => ({
  OLLAMA_BASE_URL: 'http://localhost:11434'
}))

vi.mock('./provider-registry', () => ({
  configureProviders: vi.fn(),
  getActiveProvider: vi.fn(() => ({
    type: 'ollama',
    streamChat: hoisted.providerStreamChat,
    chatOnce: vi.fn(async () => 'summary result'),
    isAvailable: vi.fn(async () => true),
    listModels: vi.fn(async () => ['llama3.1', 'mistral'])
  })),
  getActiveProviderType: vi.fn(() => 'ollama'),
  getProviderContextBlurb: vi.fn(() => 'You are running via a local Ollama instance.'),
  checkAllProviders: vi.fn(async () => ({ ollama: true, claude: false, openai: false, gemini: false }))
}))

vi.mock('./search-engine', () => ({
  SearchEngine: class {
    private count = 0
    load(index: { chunks: unknown[] }): void {
      this.count = index.chunks.length
    }
    getChunkCount(): number {
      return this.count
    }
  }
}))

vi.mock('../storage/ai-conversation-storage', () => ({
  saveConversation: vi.fn(async () => {})
}))

vi.mock('./memory-manager', () => ({
  getMemoryManager: vi.fn(() => ({
    appendSessionLog: vi.fn(async () => {})
  }))
}))

vi.mock('../log', () => ({
  logToFile: vi.fn()
}))

vi.mock('./dm-actions', () => ({
  parseDmActions: vi.fn(() => []),
  stripDmActions: vi.fn((t: string) => t)
}))

vi.mock('./ai-response-parser', () => ({
  parseRuleCitations: vi.fn(() => []),
  stripRuleCitations: vi.fn((t: string) => t),
  finalizeAiResponse: vi.fn((fullText: string) => ({
    fullText,
    displayText: fullText,
    statChanges: [],
    dmActions: [],
    ruleCitations: []
  }))
}))

vi.mock('./stat-mutations', () => ({
  parseStatChanges: vi.fn(() => []),
  stripStatChanges: vi.fn((t: string) => t),
  applyMutations: vi.fn(),
  describeChange: vi.fn(),
  isNegativeChange: vi.fn()
}))

vi.mock('./tone-validator', () => ({
  hasViolations: vi.fn(() => false),
  cleanNarrativeText: vi.fn((t: string) => t)
}))

vi.mock('./file-reader', () => ({
  FILE_READ_MAX_DEPTH: 3,
  formatFileContent: vi.fn(() => ''),
  hasFileReadTag: vi.fn(() => false),
  parseFileRead: vi.fn(() => null),
  readRequestedFile: vi.fn(async () => ({ success: true, content: '' })),
  stripFileRead: vi.fn((t: string) => t)
}))

vi.mock('./web-search', () => ({
  formatSearchResults: vi.fn(() => ''),
  hasWebSearchTag: vi.fn(() => false),
  parseWebSearch: vi.fn(() => null),
  performWebSearch: vi.fn(async () => []),
  stripWebSearch: vi.fn((t: string) => t)
}))

// ── Imports (after mocks) ──

import { existsSync, readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import {
  cancelChat,
  cancelScenePrep,
  cancelStreamsForCampaign,
  checkProviders,
  configure,
  getChunkCount,
  getConfig,
  getConnectionStatus,
  getConsecutiveFailures,
  getConversationManager,
  getLastTokenEstimate,
  getSceneStatus,
  hasActiveStreamForCampaign,
  initFromSavedConfig,
  loadConfigFromDisk,
  loadIndex,
  prepareScene,
  removeConversation,
  resolveOllamaModel,
  startChat,
  streamChatRetryable,
  streamWithRetry,
  wasContextTruncated
} from './ai-service'
import { loadChunkIndex } from './chunk-builder'
import { buildContext } from './context-builder'
import { fetchOllamaModels, getOllamaUrl, setOllamaUrl } from './ollama-client'
import { getActiveProviderType } from './provider-registry'

describe('ai-service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Connection Status ──

  describe('getConnectionStatus', () => {
    it('returns "connected" initially (0 failures)', () => {
      expect(getConnectionStatus()).toBe('connected')
    })

    it('returns consecutive failures count', () => {
      expect(getConsecutiveFailures()).toBe(0)
    })
  })

  // ── Config Management ──

  describe('configure', () => {
    it('saves config to disk and sets ollama URL', async () => {
      await configure({ provider: 'ollama', model: 'mistral', ollamaUrl: 'http://gpu-server:11434' })

      expect(setOllamaUrl).toHaveBeenCalledWith('http://gpu-server:11434')
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/ai-config\.json\..*\.tmp$/),
        expect.stringContaining('mistral'),
        'utf-8'
      )
      expect(rename).toHaveBeenCalledWith(
        expect.stringMatching(/ai-config\.json\..*\.tmp$/),
        expect.stringMatching(/ai-config\.json$/)
      )
    })

    it('leaves the model EMPTY when not provided (resolved against installed models at stream time)', async () => {
      // No hardcoded model fallback — pinning a specific id here would 404 on any
      // setup lacking that exact model. An unset model stays '' and is resolved by
      // resolveOllamaModel against the live installed list when a stream starts.
      await configure({ provider: 'ollama', model: '', ollamaUrl: '' })

      const writtenJson = (writeFile as ReturnType<typeof vi.fn>).mock.calls[0][1]
      const parsed = JSON.parse(writtenJson)
      expect(parsed.model).toBe('')
    })
  })

  // 03G: disk reads moved out of getConfig() into loadConfigFromDisk() (the single
  // startup load point). getConfig() is now a pure in-memory snapshot.
  describe('loadConfigFromDisk', () => {
    it('loads config from disk if file exists', () => {
      vi.mocked(existsSync).mockReturnValueOnce(true)
      vi.mocked(readFileSync).mockReturnValueOnce(
        JSON.stringify({ provider: 'ollama', model: 'phi3', ollamaUrl: 'http://remote:11434' })
      )

      loadConfigFromDisk()
      const config = getConfig()
      expect(config.model).toBe('phi3')
      expect(config.ollamaUrl).toBe('http://remote:11434')
      expect(config.provider).toBe('ollama')
    })

    it('loads legacy config with ollamaModel field', () => {
      vi.mocked(existsSync).mockReturnValueOnce(true)
      vi.mocked(readFileSync).mockReturnValueOnce(
        JSON.stringify({ ollamaModel: 'phi3', ollamaUrl: 'http://remote:11434' })
      )

      loadConfigFromDisk()
      const config = getConfig()
      expect(config.model).toBe('phi3')
      expect(config.provider).toBe('ollama')
    })

    it('keeps current config if file does not exist', () => {
      vi.mocked(existsSync).mockReturnValueOnce(false)

      loadConfigFromDisk()
      const config = getConfig()
      expect(config.model).toBeDefined()
      expect(config.ollamaUrl).toBeDefined()
      expect(config.provider).toBe('ollama')
    })

    it('keeps current config if file has invalid JSON', () => {
      vi.mocked(existsSync).mockReturnValueOnce(true)
      vi.mocked(readFileSync).mockReturnValueOnce('not json')

      loadConfigFromDisk()
      const config = getConfig()
      expect(config.model).toBeDefined()
    })
  })

  describe('getConfig', () => {
    it('does NOT touch disk (pure in-memory snapshot) — 03G', () => {
      vi.mocked(existsSync).mockClear()
      vi.mocked(readFileSync).mockClear()

      getConfig()
      expect(existsSync).not.toHaveBeenCalled()
      expect(readFileSync).not.toHaveBeenCalled()
    })

    it('survives an auto-switch — a later getConfig() does not revert the model (03G)', async () => {
      // Configure a model that is NOT installed; the installed list offers a real one.
      vi.mocked(getActiveProviderType).mockReturnValue('ollama')
      await configure({ provider: 'ollama', model: 'ghost-model', ollamaUrl: '' })
      vi.mocked(fetchOllamaModels).mockResolvedValueOnce(['real-model'])

      const picked = await resolveOllamaModel('ghost-model')
      expect(picked).toBe('real-model')

      // Even with a stale disk file primed, getConfig() must return the in-memory switch.
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ provider: 'ollama', model: 'ghost-model' }))
      expect(getConfig().model).toBe('real-model')
    })
  })

  describe('initFromSavedConfig', () => {
    it('loads config and sets ollama URL', () => {
      vi.mocked(existsSync).mockReturnValueOnce(false)
      initFromSavedConfig()
      expect(setOllamaUrl).toHaveBeenCalled()
    })
  })

  // ── Provider Status ──

  describe('checkProviders', () => {
    it('returns ollama status and model list', async () => {
      const result = await checkProviders()
      expect(result.ollama).toBe(true)
      expect(result.ollamaModels).toEqual(['llama3.1', 'mistral'])
    })
  })

  // ── Index Management ──

  describe('loadIndex', () => {
    it('returns false when no chunk index available', () => {
      vi.mocked(loadChunkIndex).mockReturnValueOnce(null)
      expect(loadIndex()).toBe(false)
    })

    it('returns true and sets up search engine when index is available', () => {
      vi.mocked(loadChunkIndex).mockReturnValueOnce({
        version: 1,
        createdAt: '',
        sources: [],
        chunks: [
          { id: '1', source: 'PHB', headingPath: [], heading: 'A', content: 'B', tokenEstimate: 10, keywords: [] }
        ]
      })
      expect(loadIndex()).toBe(true)
    })
  })

  describe('getChunkCount', () => {
    it('returns 0 when no search engine loaded', () => {
      // After fresh mock, search engine may not be loaded
      expect(typeof getChunkCount()).toBe('number')
    })
  })

  // ── Conversation Management ──

  describe('getConversationManager', () => {
    it('returns a ConversationManager for a campaign', () => {
      const conv = getConversationManager('campaign-test')
      expect(conv).toBeDefined()
      expect(typeof conv.addMessage).toBe('function')
    })

    it('returns the same instance for the same campaignId', () => {
      const conv1 = getConversationManager('campaign-same')
      const conv2 = getConversationManager('campaign-same')
      expect(conv1).toBe(conv2)
    })
  })

  // ── Chat ──

  describe('startChat', () => {
    it('returns a streamId string', () => {
      const streamId = startChat(
        { campaignId: 'c1', message: 'Hello', characterIds: ['char1'] },
        () => {},
        () => {},
        () => {}
      )
      expect(streamId).toMatch(/^stream-\d+$/)
    })

    it('generates unique stream IDs for each call', () => {
      const id1 = startChat(
        { campaignId: 'c1', message: 'msg1', characterIds: [] },
        () => {},
        () => {},
        () => {}
      )
      const id2 = startChat(
        { campaignId: 'c1', message: 'msg2', characterIds: [] },
        () => {},
        () => {},
        () => {}
      )
      expect(id1).not.toBe(id2)
    })

    it('attaches retrieval chunk ids to the finalized assistant message (07C)', async () => {
      hoisted.addMessageCalls.length = 0
      vi.mocked(buildContext).mockResolvedValueOnce({
        text: '',
        breakdown: {
          rulebookChunks: 0,
          srdData: 0,
          characterData: 0,
          campaignData: 0,
          creatures: 0,
          gameState: 0,
          memory: 0,
          total: 0
        },
        chunkIds: ['phb-1', 'dmg-2']
      })
      hoisted.providerStreamChat.mockImplementation(((
        _sp: unknown,
        _msgs: unknown,
        cb: { onDone: (t: string) => void }
      ) => {
        cb.onDone('reply')
        return Promise.resolve()
      }) as never)

      startChat(
        { campaignId: 'c-prov', message: 'grapple rules', characterIds: [] },
        () => {},
        () => {},
        () => {}
      )

      await vi.waitFor(() => {
        const assistant = hoisted.addMessageCalls.find(([role]) => role === 'assistant')
        expect(assistant?.[2]).toEqual(['phb-1', 'dmg-2'])
      })
      hoisted.providerStreamChat.mockImplementation((() => Promise.resolve()) as never)
    })
  })

  // 07D — campaign-scoped stream tracking.
  describe('campaign stream tracking', () => {
    it('hasActiveStreamForCampaign tracks the lifecycle and cancelStreamsForCampaign aborts', () => {
      expect(hasActiveStreamForCampaign('track-A')).toBe(false)
      const sid = startChat(
        { campaignId: 'track-A', message: 'hi', characterIds: [] },
        () => {},
        () => {},
        () => {}
      )
      expect(hasActiveStreamForCampaign('track-A')).toBe(true)
      expect(hasActiveStreamForCampaign('track-B')).toBe(false) // another campaign unaffected

      cancelChat(sid)
      expect(hasActiveStreamForCampaign('track-A')).toBe(false) // removeStream cleared it

      // cancelStreamsForCampaign aborts every stream for the campaign and counts them.
      startChat(
        { campaignId: 'track-C', message: 'hi', characterIds: [] },
        () => {},
        () => {},
        () => {}
      )
      expect(cancelStreamsForCampaign('track-C')).toBe(1)
      expect(hasActiveStreamForCampaign('track-C')).toBe(false)
      expect(cancelStreamsForCampaign('track-C')).toBe(0) // idempotent
    })
  })

  describe('cancelChat', () => {
    it('does not throw when cancelling a non-existent stream', () => {
      expect(() => cancelChat('nonexistent-stream')).not.toThrow()
    })

    it('aborts an active stream', () => {
      const streamId = startChat(
        { campaignId: 'c-cancel', message: 'test', characterIds: [] },
        () => {},
        () => {},
        () => {}
      )
      expect(() => cancelChat(streamId)).not.toThrow()
    })
  })

  // ── Scene Preparation ──

  describe('getSceneStatus', () => {
    it('returns idle for unknown campaign', () => {
      const status = getSceneStatus('unknown-campaign')
      expect(status.status).toBe('idle')
      expect(status.streamId).toBeNull()
    })
  })

  // 06A — main-process scene-prep cancellation.
  describe('cancelScenePrep', () => {
    it('returns { success: true } on an unknown campaign without throwing', () => {
      expect(cancelScenePrep('never-prepped')).toEqual({ success: true })
    })

    it('makes getSceneStatus return idle after a prep stream was started', () => {
      const id = 'scene-cancel-test'
      prepareScene(id, [])
      expect(getSceneStatus(id).status).toBe('preparing')
      cancelScenePrep(id)
      expect(getSceneStatus(id).status).toBe('idle')
    })
  })

  // 06C — a retry after a failed prep trims ONLY the dangling prompt; real history survives.
  describe('prepareScene error-retry trim', () => {
    const SCENE_PROMPT =
      'The adventure begins. Set the scene for the party. Describe the opening location and atmosphere.'
    const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
    // A "timed out" error fails fast (streamWithRetry skips retries on timeouts), so the prep
    // reaches 'error' status without backoff delays.
    const failFast = (): void => {
      hoisted.providerStreamChat.mockImplementation(((
        _sp: unknown,
        _msgs: unknown,
        cb: { onError: (e: Error) => void }
      ) => {
        cb.onError(new Error('timed out'))
        return Promise.resolve()
      }) as never)
    }
    const hang = (): void => {
      hoisted.providerStreamChat.mockImplementation((() => new Promise<void>(() => {})) as never)
    }

    afterEach(() => {
      hoisted.providerStreamChat.mockReset()
      hoisted.providerStreamChat.mockImplementation((() => Promise.resolve()) as never)
    })

    async function waitForError(id: string): Promise<void> {
      for (let i = 0; i < 50; i++) {
        if (getSceneStatus(id).status === 'error') return
        await tick()
      }
      throw new Error('prep never reached error status')
    }

    it('fresh failed prep: retry trims the lone prompt and regenerates (not short-circuit)', async () => {
      const id = 'retry-fresh'
      failFast()
      prepareScene(id, [])
      await waitForError(id)
      expect(getConversationManager(id).getMessageCount()).toBe(1) // dangling [prompt]

      hang() // the retry's stream stays in flight so status stays 'preparing'
      prepareScene(id, [])
      // Trimmed → count 0 → regenerates → 'preparing'. (Un-trimmed would short-circuit to 'ready'.)
      expect(getSceneStatus(id).status).toBe('preparing')
    })

    it('populated conversation: retry preserves real history and short-circuits to ready', async () => {
      const id = 'retry-populated'
      failFast()
      prepareScene(id, [])
      await waitForError(id)

      // Simulate the user entering the game and chatting after the failure.
      const conv = getConversationManager(id)
      conv.addMessage('assistant', 'A scene unfolds')
      conv.addMessage('user', 'I attack the goblin')
      conv.addMessage('assistant', 'Roll for initiative')
      expect(conv.getMessageCount()).toBe(4)

      prepareScene(id, [])
      expect(getSceneStatus(id).status).toBe('ready')
      expect(conv.getMessageCount()).toBe(4) // history intact (trailing msg ≠ prompt → no trim)
    })

    it('SCENE_PROMPT constant matches the prep request (guards the trim match)', () => {
      // Drift guard: cancelScenePrep / retry-trim match on this exact string.
      expect(SCENE_PROMPT.startsWith('The adventure begins.')).toBe(true)
    })
  })

  // ── Context Truncation ──

  describe('wasContextTruncated', () => {
    it('returns false for a campaign with no conversation', () => {
      expect(wasContextTruncated('no-conversation')).toBe(false)
    })
  })

  describe('getLastTokenEstimate', () => {
    it('returns 0 for a campaign with no conversation', () => {
      expect(getLastTokenEstimate('no-conversation')).toBe(0)
    })

    it('returns the token estimate from an active conversation', () => {
      // Create conversation manager to populate the map
      getConversationManager('token-test')
      const estimate = getLastTokenEstimate('token-test')
      expect(typeof estimate).toBe('number')
    })
  })

  // Phase 22d — the campaign-delete cascade calls removeConversation() to keep
  // the in-memory conversations Map from growing without bound.
  describe('removeConversation (delete cascade)', () => {
    it('evicts the conversation so a re-fetch yields a fresh manager', () => {
      const id = 'cascade-test'
      const first = getConversationManager(id)
      // Same id before removal returns the SAME cached manager instance.
      expect(getConversationManager(id)).toBe(first)

      removeConversation(id)

      // After eviction, re-fetching builds a brand-new manager (different ref).
      const second = getConversationManager(id)
      expect(second).not.toBe(first)
    })

    it('is a no-op for an unknown campaign id (no throw)', () => {
      expect(() => removeConversation('never-existed')).not.toThrow()
    })
  })

  // ── Stream retry lifecycle ──
  // Providers report failures via callbacks.onError (they don't throw), which
  // used to make streamWithRetry's retry loop dead code. streamChatRetryable
  // bridges the gap: a pre-output failure rejects (→ retry), a mid-stream
  // failure surfaces without retry (→ no duplicate text).
  describe('streamChatRetryable + streamWithRetry', () => {
    const cb = () => ({ onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() })

    it('REJECTS when the provider fails before any text (retryable)', async () => {
      const callbacks = cb()
      const run = streamChatRetryable(
        async (_s, _m, c) => {
          c.onError(new Error('boom'))
        },
        'sys',
        [],
        callbacks,
        'm'
      )
      await expect(run(new AbortController().signal)).rejects.toThrow('boom')
      // The rejection (not callbacks.onError) is what drives the retry loop.
      expect(callbacks.onError).not.toHaveBeenCalled()
    })

    it('RESOLVES and surfaces the error when it fails AFTER text (no retry)', async () => {
      const callbacks = cb()
      const run = streamChatRetryable(
        async (_s, _m, c) => {
          c.onText('partial ')
          c.onError(new Error('mid-stream'))
        },
        'sys',
        [],
        callbacks,
        'm'
      )
      await expect(run(new AbortController().signal)).resolves.toBeUndefined()
      expect(callbacks.onText).toHaveBeenCalledWith('partial ')
      expect(callbacks.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'mid-stream' }))
    })

    it('RESOLVES on onDone and forwards the final text', async () => {
      const callbacks = cb()
      const run = streamChatRetryable(
        async (_s, _m, c) => {
          c.onText('hello')
          c.onDone('hello')
        },
        'sys',
        [],
        callbacks,
        'm'
      )
      await expect(run(new AbortController().signal)).resolves.toBeUndefined()
      expect(callbacks.onDone).toHaveBeenCalledWith('hello')
    })

    it('RESOLVES on abort (provider returns without firing a callback)', async () => {
      const callbacks = cb()
      const run = streamChatRetryable(async () => {}, 'sys', [], callbacks, 'm')
      await expect(run(new AbortController().signal)).resolves.toBeUndefined()
      expect(callbacks.onError).not.toHaveBeenCalled()
      expect(callbacks.onDone).not.toHaveBeenCalled()
    })

    it('RETRIES a pre-output failure then succeeds (loop was previously dead)', async () => {
      vi.useFakeTimers()
      try {
        const callbacks = cb()
        let attempts = 0
        const run = streamChatRetryable(
          async (_s, _m, c) => {
            attempts++
            if (attempts < 3) {
              c.onError(new Error(`fail ${attempts}`))
              return
            }
            c.onText('ok')
            c.onDone('ok')
          },
          'sys',
          [],
          callbacks,
          'm'
        )
        const terminalError = vi.fn()
        const p = streamWithRetry(run, new AbortController(), terminalError)
        await vi.runAllTimersAsync()
        await p
        expect(attempts).toBe(3) // 1 initial + 2 retries
        expect(callbacks.onDone).toHaveBeenCalledWith('ok')
        expect(terminalError).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('surfaces the error after exhausting all retries', async () => {
      vi.useFakeTimers()
      try {
        const callbacks = cb()
        let attempts = 0
        const run = streamChatRetryable(
          async (_s, _m, c) => {
            attempts++
            c.onError(new Error('always fails'))
          },
          'sys',
          [],
          callbacks,
          'm'
        )
        const terminalError = vi.fn()
        const p = streamWithRetry(run, new AbortController(), terminalError)
        await vi.runAllTimersAsync()
        await p
        expect(attempts).toBe(3)
        expect(terminalError).toHaveBeenCalledWith('always fails')
      } finally {
        vi.useRealTimers()
      }
    })

    it('does NOT retry a timeout — fails fast on the first attempt', async () => {
      vi.useFakeTimers()
      try {
        const callbacks = cb()
        let attempts = 0
        const run = streamChatRetryable(
          async (_s, _m, c) => {
            attempts++
            c.onError(new Error('Ollama timed out (no first token within 300s)'))
          },
          'sys',
          [],
          callbacks,
          'm'
        )
        const terminalError = vi.fn()
        const p = streamWithRetry(run, new AbortController(), terminalError)
        await vi.runAllTimersAsync()
        await p
        // Retrying a prefill timeout just re-runs prefill — wasteful and hopeless.
        expect(attempts).toBe(1)
        expect(terminalError).toHaveBeenCalledWith('Ollama timed out (no first token within 300s)')
      } finally {
        vi.useRealTimers()
      }
    })
  })

  // ── Ollama model preflight ──
  // Resolve the configured model against what's actually installed so solo "just
  // works" (and a missing/empty model fails fast + actionable instead of hanging).
  describe('resolveOllamaModel', () => {
    beforeEach(() => {
      vi.mocked(getActiveProviderType).mockReturnValue('ollama')
      vi.mocked(getOllamaUrl).mockReturnValue('http://localhost:11434')
    })

    it('returns the configured model unchanged when it IS installed', async () => {
      vi.mocked(fetchOllamaModels).mockResolvedValueOnce(['llama3.1', 'mistral'])
      expect(await resolveOllamaModel('mistral')).toBe('mistral')
    })

    it('falls back to the first installed model when the configured one is NOT installed', async () => {
      vi.mocked(fetchOllamaModels).mockResolvedValueOnce(['gemma3:4b', 'mistral'])
      expect(await resolveOllamaModel('llama3.2:3b')).toBe('gemma3:4b')
    })

    it('falls back to the first installed model when none is configured (empty)', async () => {
      vi.mocked(fetchOllamaModels).mockResolvedValueOnce(['gemma3:4b'])
      expect(await resolveOllamaModel('')).toBe('gemma3:4b')
    })

    it('throws an actionable "ollama pull" error when NO models are installed', async () => {
      vi.mocked(fetchOllamaModels).mockResolvedValueOnce([])
      await expect(resolveOllamaModel('')).rejects.toThrow('ollama pull')
    })

    it('PHASE-03 03E: unreachable host throws "Cannot reach Ollama" (not "no models")', async () => {
      vi.mocked(fetchOllamaModels).mockRejectedValueOnce(new Error('fetch failed'))
      await expect(resolveOllamaModel('mistral')).rejects.toThrow('Cannot reach Ollama at')
    })

    it('leaves a cloud provider model untouched (no Ollama preflight)', async () => {
      vi.mocked(getActiveProviderType).mockReturnValue('claude')
      expect(await resolveOllamaModel('claude-opus-4-7')).toBe('claude-opus-4-7')
      expect(fetchOllamaModels).not.toHaveBeenCalled()
    })
  })
})
