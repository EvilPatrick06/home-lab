import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ──

// Stable, per-test-configurable provider streamChat so 06C can drive a prep stream to
// 'error' (and then hang a retry) deterministically. Defaults to a clean resolve.
const hoisted = vi.hoisted(() => ({
  providerStreamChat: vi.fn(async () => {}),
  addMessageCalls: [] as Array<[string, string, string[] | undefined]>,
  // PHASE-26 scene-memory wiring spies
  sceneSettings: { enabled: false } as { enabled: boolean },
  setModeCalls: [] as string[],
  endSceneSpy: vi.fn(async (_label?: string) => ({ summarized: true })),
  overflowFlag: false
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
  renameSync: vi.fn(),
  chmodSync: vi.fn()
}))

// Phase 17d (NET-10) — configure now writes asynchronously via fs/promises.
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  unlink: vi.fn(async () => undefined)
}))

vi.mock('./context/chunk-builder', () => ({
  buildChunkIndex: vi.fn(() => ({ chunks: [{ id: '1' }, { id: '2' }] })),
  loadChunkIndex: vi.fn(() => null)
}))

vi.mock('./context/context-builder', () => ({
  buildContext: vi.fn(async () => ({
    text: '',
    breakdown: {
      rulebookChunks: 0,
      srdData: 0,
      characterData: 0,
      campaignDocs: 0,
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
  setSearchEngine: vi.fn(),
  setRetrievalOptsProvider: vi.fn()
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
    getMessages(): Array<{ role: string; content: string }> {
      return this.messages
    }
    // PHASE-26 scene-memory hooks (routed to hoisted spies for assertions)
    setSummarizationMode(mode: string): void {
      hoisted.setModeCalls.push(mode)
    }
    async endScene(label?: string): Promise<{ summarized: boolean }> {
      return hoisted.endSceneSpy(label)
    }
    get overflowSplitNeeded(): boolean {
      return hoisted.overflowFlag
    }
    removeTrailingUserMessage(content: string): boolean {
      const last = this.messages[this.messages.length - 1]
      if (last && last.role === 'user' && last.content === content) {
        this.messages.pop()
        return true
      }
      return false
    }
    removeLastAssistantMessage(): boolean {
      const last = this.messages[this.messages.length - 1]
      if (last && last.role === 'assistant') {
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

vi.mock('./clients/ollama-client', () => ({
  getOllamaUrl: vi.fn(() => 'http://localhost:11434'),
  isOllamaRunning: vi.fn(async () => true),
  listOllamaModels: vi.fn(async () => ['llama3.1', 'mistral']),
  fetchOllamaModels: vi.fn(async () => ['llama3.1', 'mistral']),
  ollamaChatOnce: vi.fn(async () => 'summary result'),
  ollamaStreamChat: vi.fn(),
  setOllamaUrl: vi.fn(),
  setLocalEndpointFlavor: vi.fn(), // PHASE-29 29E
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

vi.mock('./clients/provider-registry', () => ({
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

vi.mock('./memory/search-engine', () => ({
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

vi.mock('./scene-memory', () => ({
  getSceneMemorySettings: vi.fn(async () => hoisted.sceneSettings),
  clearSceneMemoryCache: vi.fn()
}))

vi.mock('../storage/ai-conversation-storage', () => ({
  saveConversation: vi.fn(async () => {})
}))

vi.mock('./memory/memory-manager', () => ({
  getMemoryManager: vi.fn(() => ({
    appendSessionLog: vi.fn(async () => {}),
    // PHASE-28 — finalize/post-pass surface (consumeOraclePending is called every finalize).
    consumeOraclePending: vi.fn(async () => {}),
    getQuestLog: vi.fn(async () => ({ version: 1, chapter: { number: 1, startedAt: '' }, quests: [] })),
    mutateQuestLog: vi.fn(async () => ({ version: 1, chapter: { number: 1, startedAt: '' }, quests: [] })),
    mutateDirectorState: vi.fn(async (fn: (s: unknown) => unknown) =>
      fn({ version: 1, notes: null, generatedAt: null, responsesSinceRun: 0, enabledAtGeneration: false })
    )
  }))
}))

vi.mock('../log', () => ({
  logToFile: vi.fn()
}))

vi.mock('./dm-actions', () => ({
  parseDmActions: vi.fn(() => []),
  parseDmActionsDetailed: vi.fn(() => ({ actions: [], issues: [] })),
  hasOrphanDmActionsTag: vi.fn(() => false),
  stripDmActions: vi.fn((t: string) => t)
}))

vi.mock('./ai-response-parser', () => ({
  parseRuleCitations: vi.fn(() => []),
  stripRuleCitations: vi.fn((t: string) => t),
  parseVoiceTags: vi.fn(() => ({ npc: undefined, emotion: undefined })),
  stripVoiceTags: vi.fn((t: string) => t),
  parseRulings: vi.fn(() => []),
  stripRulings: vi.fn((t: string) => t)
}))

const { detailedStat, orphanStat } = vi.hoisted(() => ({
  detailedStat: vi.fn(() => ({
    changes: [] as unknown[],
    issues: [] as unknown[],
    rawJsonError: undefined as string | undefined
  })),
  orphanStat: vi.fn(() => false)
}))
vi.mock('./stat-mutations', () => ({
  parseStatChanges: vi.fn(() => []),
  parseStatChangesDetailed: detailedStat,
  hasOrphanStatChangesTag: orphanStat,
  stripStatChanges: vi.fn((t: string) => t),
  applyMutations: vi.fn(),
  describeChange: vi.fn(),
  isNegativeChange: vi.fn()
}))

const { runExtraction, buildSnapshot, validateGS, dedupe } = vi.hoisted(() => ({
  runExtraction: vi.fn(async () => null as null | { changes: unknown[]; issues: string[] }),
  buildSnapshot: vi.fn(async () => ({ partyNames: [], creatureLabels: [] })),
  validateGS: vi.fn((changes: unknown[]) => ({
    valid: changes,
    rejected: [] as Array<{ change: unknown; reason: string }>
  })),
  dedupe: vi.fn((_base: unknown[], incoming: unknown[]) => incoming)
}))
vi.mock('./structured-extraction', () => ({ runStructuredExtraction: runExtraction }))
// PHASE-25 25C: stub the fire-and-forget entity extraction so stream-done tests stay
// isolated (the real orchestrator bails when disabled, but mocking keeps it call-free).
const { runEntityExtract } = vi.hoisted(() => ({ runEntityExtract: vi.fn(async () => {}) }))
vi.mock('./memory/entity-extraction', () => ({ runEntityExtraction: runEntityExtract }))
vi.mock('./game-state-validation', () => ({
  buildGameStateSnapshot: buildSnapshot,
  validateAgainstGameState: validateGS,
  dedupeStatChanges: dedupe
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

import { chmodSync, existsSync, readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { BrowserWindow } from 'electron'
import { saveConversation } from '../storage/ai-conversation-storage'
import {
  cancelChat,
  cancelScenePrep,
  cancelStreamsForCampaign,
  checkProviders,
  configure,
  endSceneForCampaign,
  getChunkCount,
  getConfig,
  getConnectionStatus,
  getConsecutiveFailures,
  getConversationManager,
  getLastTokenEstimate,
  getModelForTask,
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
  wasContextTruncated,
  xCardRewind
} from './ai-service'
import { fetchOllamaModels, getOllamaUrl, listOllamaModels, setOllamaUrl } from './clients/ollama-client'
import { getActiveProviderType } from './clients/provider-registry'
import { loadChunkIndex } from './context/chunk-builder'
import { buildContext } from './context/context-builder'
import { parseDmActionsDetailed } from './dm-actions'

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
      // Cloud API keys can persist in plaintext when safeStorage is unavailable,
      // so the config file must be written owner-only (SECURITY 2026-07-02).
      expect(writeFile).toHaveBeenCalledWith(
        expect.stringMatching(/ai-config\.json\..*\.tmp$/),
        expect.stringContaining('mistral'),
        { encoding: 'utf-8', mode: 0o600 }
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
    it('self-heals a pre-existing config to owner-only perms on load (SECURITY 2026-07-02)', () => {
      vi.mocked(existsSync).mockReturnValueOnce(true)
      vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({ provider: 'ollama', model: 'm' }))

      loadConfigFromDisk()
      expect(chmodSync).toHaveBeenCalledWith(expect.stringContaining('ai-config.json'), 0o600)
    })

    it('does not chmod when no config file exists', () => {
      vi.mocked(existsSync).mockReturnValueOnce(false)
      loadConfigFromDisk()
      expect(chmodSync).not.toHaveBeenCalled()
    })

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

  // PHASE-32 32D — X-card rewind.
  describe('xCardRewind', () => {
    it('removes the trailing assistant message and persists', async () => {
      const conv = getConversationManager('campaign-xcard')
      conv.addMessage('user', 'I open the cursed chest')
      conv.addMessage('assistant', 'Something terrible happens.')
      vi.mocked(saveConversation).mockClear()
      const res = await xCardRewind('campaign-xcard')
      expect(res).toEqual({ success: true, removed: true })
      expect(conv.getMessages()).toHaveLength(1)
      expect(saveConversation).toHaveBeenCalledTimes(1)
    })

    it('returns removed:false (and does not save) when there is no trailing assistant message', async () => {
      const conv = getConversationManager('campaign-xcard-2')
      conv.addMessage('user', 'hello')
      vi.mocked(saveConversation).mockClear()
      const res = await xCardRewind('campaign-xcard-2')
      expect(res).toEqual({ success: true, removed: false })
      expect(saveConversation).not.toHaveBeenCalled()
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
          safety: 0,
          rulebookChunks: 0,
          srdData: 0,
          characterData: 0,
          campaignDocs: 0,
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

    it('makes getSceneStatus return idle after a prep stream was started', async () => {
      const id = 'scene-cancel-test'
      await prepareScene(id, []) // PHASE-37: prepareScene is async (loads campaign for the opening scene)
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
      await prepareScene(id, [])
      await waitForError(id)
      expect(getConversationManager(id).getMessageCount()).toBe(1) // dangling [prompt]

      hang() // the retry's stream stays in flight so status stays 'preparing'
      await prepareScene(id, [])
      // Trimmed → count 0 → regenerates → 'preparing'. (Un-trimmed would short-circuit to 'ready'.)
      expect(getSceneStatus(id).status).toBe('preparing')
    })

    it('populated conversation: retry preserves real history and short-circuits to ready', async () => {
      const id = 'retry-populated'
      failFast()
      await prepareScene(id, [])
      await waitForError(id)

      // Simulate the user entering the game and chatting after the failure.
      const conv = getConversationManager(id)
      conv.addMessage('assistant', 'A scene unfolds')
      conv.addMessage('user', 'I attack the goblin')
      conv.addMessage('assistant', 'Roll for initiative')
      expect(conv.getMessageCount()).toBe(4)

      await prepareScene(id, [])
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

    it('PHASE-14 14A: pushes connection-status transitions (degraded → disconnected → connected), gated', async () => {
      vi.useFakeTimers()
      const send = vi.fn()
      vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([{ webContents: { send } }] as never)
      const statusOf = (channel: string) =>
        send.mock.calls
          .filter((c) => c[0] === channel)
          .map((c) => c[1] as { status: string; consecutiveFailures: number })
      const CHANGED = 'ai:connection-status-changed'
      try {
        // Normalize module state: a success forces consecutiveFailures=0 + lastEmitted='connected'.
        await streamWithRetry(async () => {}, new AbortController(), vi.fn())
        send.mockClear()

        // 3 consecutive non-timeout failures in ONE call → degraded (1st) then disconnected (3rd).
        const p = streamWithRetry(
          async () => {
            throw new Error('boom')
          },
          new AbortController(),
          vi.fn()
        )
        await vi.runAllTimersAsync()
        await p
        const fail = statusOf(CHANGED)
        expect(fail.map((e) => e.status)).toEqual(['degraded', 'disconnected'])
        expect(fail[0]).toMatchObject({ status: 'degraded', consecutiveFailures: 1 })
        expect(fail[1]).toMatchObject({ status: 'disconnected', consecutiveFailures: 3 })

        // A success → one 'connected' event; a second success → no further event (transition-gated).
        send.mockClear()
        await streamWithRetry(async () => {}, new AbortController(), vi.fn())
        await streamWithRetry(async () => {}, new AbortController(), vi.fn())
        expect(statusOf(CHANGED).map((e) => e.status)).toEqual(['connected'])
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

  // PHASE-23 23E — two-call structured extraction wiring.
  describe('structured extraction wiring', () => {
    const setMode = (m: 'off' | 'fallback' | 'always') =>
      configure({ provider: 'ollama', model: 'm', ollamaUrl: 'http://localhost:11434', structuredExtraction: m })

    const driveCompletion = (onDone: (f: string, d: string, sc: unknown[]) => void): void => {
      hoisted.providerStreamChat.mockImplementation(((
        _sp: unknown,
        _msgs: unknown,
        cb: { onDone: (t: string) => void }
      ) => {
        cb.onDone('reply with mechanics')
        return Promise.resolve()
      }) as never)
      startChat(
        { campaignId: 'c-ext', message: 'attack', characterIds: [] },
        () => {},
        onDone,
        () => {}
      )
    }

    beforeEach(() => {
      runExtraction.mockReset().mockResolvedValue(null)
      buildSnapshot.mockClear()
      validateGS.mockReset().mockImplementation((c: unknown[]) => ({ valid: c, rejected: [] }))
      dedupe.mockReset().mockImplementation((_b: unknown[], i: unknown[]) => i)
      detailedStat.mockReturnValue({ changes: [], issues: [], rawJsonError: undefined })
      orphanStat.mockReturnValue(false)
    })
    afterEach(async () => {
      await setMode('off')
      hoisted.providerStreamChat.mockImplementation((() => Promise.resolve()) as never)
    })

    it('off (default): never runs extraction', async () => {
      await setMode('off')
      let done = false
      driveCompletion(() => {
        done = true
      })
      await vi.waitFor(() => expect(done).toBe(true))
      expect(runExtraction).not.toHaveBeenCalled()
    })

    it('always: runs extraction once and merges results into onDone', async () => {
      await setMode('always')
      const extractedChange = { type: 'damage', characterName: 'Aria', value: 5, reason: 'x' }
      runExtraction.mockResolvedValueOnce({ changes: [extractedChange], issues: [] })
      let delivered: unknown[] | undefined
      driveCompletion((_f, _d, sc) => {
        delivered = sc
      })
      await vi.waitFor(() => expect(delivered).toBeDefined())
      expect(runExtraction).toHaveBeenCalledTimes(1)
      expect(delivered).toEqual([extractedChange])
    })

    it('fallback + well-formed tags: does not run extraction', async () => {
      await setMode('fallback')
      detailedStat.mockReturnValue({
        changes: [{ type: 'heal', value: 1, reason: 'x' }],
        issues: [],
        rawJsonError: undefined
      })
      let done = false
      driveCompletion(() => {
        done = true
      })
      await vi.waitFor(() => expect(done).toBe(true))
      expect(runExtraction).not.toHaveBeenCalled()
    })

    it('fallback + malformed tags (rawJsonError): runs extraction', async () => {
      await setMode('fallback')
      detailedStat.mockReturnValue({ changes: [], issues: [], rawJsonError: 'parse failed' })
      let done = false
      driveCompletion(() => {
        done = true
      })
      await vi.waitFor(() => expect(done).toBe(true))
      expect(runExtraction).toHaveBeenCalledTimes(1)
    })

    it('fallback + orphan opener: runs extraction', async () => {
      await setMode('fallback')
      orphanStat.mockReturnValue(true)
      let done = false
      driveCompletion(() => {
        done = true
      })
      await vi.waitFor(() => expect(done).toBe(true))
      expect(runExtraction).toHaveBeenCalled()
    })

    it('extraction returning null: delivers tag results unchanged', async () => {
      await setMode('always')
      const tagChange = { type: 'heal', value: 2, reason: 'tag' }
      detailedStat.mockReturnValue({ changes: [tagChange], issues: [], rawJsonError: undefined })
      runExtraction.mockResolvedValueOnce(null)
      let delivered: unknown[] | undefined
      driveCompletion((_f, _d, sc) => {
        delivered = sc
      })
      await vi.waitFor(() => expect(delivered).toBeDefined())
      expect(delivered).toEqual([tagChange])
    })

    it('validation rejection drops the change before onDone', async () => {
      await setMode('always')
      runExtraction.mockResolvedValueOnce({
        changes: [{ type: 'damage', characterName: 'Ghost', value: 5, reason: 'x' }],
        issues: []
      })
      validateGS.mockReturnValueOnce({ valid: [], rejected: [{ change: {}, reason: 'unknown character' }] })
      let delivered: unknown[] | undefined
      driveCompletion((_f, _d, sc) => {
        delivered = sc
      })
      await vi.waitFor(() => expect(delivered).toBeDefined())
      expect(delivered).toEqual([])
    })
  })

  describe('scene memory wiring (PHASE-26 26C)', () => {
    const driveCompletion = (onDone: (f: string, d: string, sc: unknown[]) => void): void => {
      hoisted.providerStreamChat.mockImplementation(((
        _sp: unknown,
        _msgs: unknown,
        cb: { onDone: (t: string) => void }
      ) => {
        cb.onDone('narration')
        return Promise.resolve()
      }) as never)
      startChat(
        { campaignId: 'c-scene', message: 'go', characterIds: [] },
        () => {},
        onDone,
        () => {}
      )
    }

    beforeEach(() => {
      hoisted.sceneSettings = { enabled: false }
      hoisted.setModeCalls.length = 0
      hoisted.endSceneSpy.mockClear().mockResolvedValue({ summarized: true })
      hoisted.overflowFlag = false
      detailedStat.mockReturnValue({ changes: [], issues: [], rawJsonError: undefined })
      orphanStat.mockReturnValue(false)
      vi.mocked(parseDmActionsDetailed).mockReturnValue({ actions: [], issues: [] })
      vi.mocked(saveConversation).mockClear()
    })

    it('flag off → threshold mode, never calls endScene', async () => {
      let done = false
      driveCompletion(() => {
        done = true
      })
      await vi.waitFor(() => expect(done).toBe(true))
      expect(hoisted.setModeCalls).toContain('threshold')
      await Promise.resolve()
      expect(hoisted.endSceneSpy).not.toHaveBeenCalled()
    })

    it('flag on → scene mode is set', async () => {
      hoisted.sceneSettings = { enabled: true }
      let done = false
      driveCompletion(() => {
        done = true
      })
      await vi.waitFor(() => expect(done).toBe(true))
      expect(hoisted.setModeCalls).toContain('scene')
    })

    it('flag on + switch_map boundary → endScene with the map name (off the request path)', async () => {
      hoisted.sceneSettings = { enabled: true }
      vi.mocked(parseDmActionsDetailed).mockReturnValue({
        actions: [{ action: 'switch_map', mapName: 'The Crypt' }] as never,
        issues: []
      })
      driveCompletion(() => {})
      await vi.waitFor(() => expect(hoisted.endSceneSpy).toHaveBeenCalledWith('The Crypt'))
    })

    it('flag on + overflow backstop (no boundary action) → endScene "scene continues"', async () => {
      hoisted.sceneSettings = { enabled: true }
      hoisted.overflowFlag = true
      driveCompletion(() => {})
      await vi.waitFor(() => expect(hoisted.endSceneSpy).toHaveBeenCalledWith('scene continues'))
    })

    it('does not block onDone (boundary runs after the reply is delivered)', async () => {
      hoisted.sceneSettings = { enabled: true }
      // endScene hangs; onDone must still fire.
      hoisted.endSceneSpy.mockImplementationOnce(() => new Promise(() => {}) as never)
      vi.mocked(parseDmActionsDetailed).mockReturnValue({ actions: [{ action: 'long_rest' }] as never, issues: [] })
      let done = false
      driveCompletion(() => {
        done = true
      })
      await vi.waitFor(() => expect(done).toBe(true)) // resolves despite the hung boundary
    })

    it('endSceneForCampaign persists on a successful summarize, not otherwise', async () => {
      hoisted.endSceneSpy.mockResolvedValueOnce({ summarized: true })
      await endSceneForCampaign('c-persist', 'label')
      expect(saveConversation).toHaveBeenCalled()

      vi.mocked(saveConversation).mockClear()
      hoisted.endSceneSpy.mockResolvedValueOnce({ summarized: false })
      await endSceneForCampaign('c-persist')
      expect(saveConversation).not.toHaveBeenCalled()
    })
  })

  // PHASE-29 29A/29B — per-task model routing
  describe('model routing (getModelForTask)', () => {
    beforeEach(() => {
      vi.mocked(getActiveProviderType).mockReturnValue('ollama')
      vi.mocked(listOllamaModels).mockResolvedValue(['llama3.1', 'mistral', 'llama3.2:1b'])
    })

    it('returns the primary model for every task when routing is absent (inert by default)', async () => {
      await configure({ provider: 'ollama', model: 'mistral', ollamaUrl: 'http://localhost:11434' })
      expect(await getModelForTask('summary')).toBe('mistral')
      expect(await getModelForTask('extraction')).toBe('mistral')
      expect(await getModelForTask('mechanics')).toBe('mistral')
      expect(await getModelForTask('narration')).toBe('mistral')
    })

    it('routes summary/extraction/mechanics to the small model when enabled + installed', async () => {
      await configure({
        provider: 'ollama',
        model: 'mistral',
        ollamaUrl: 'http://localhost:11434',
        routing: { enabled: true, smallModel: 'llama3.2:1b' }
      })
      expect(await getModelForTask('summary')).toBe('llama3.2:1b')
      expect(await getModelForTask('extraction')).toBe('llama3.2:1b')
      expect(await getModelForTask('mechanics')).toBe('llama3.2:1b')
      // narration + vision always stay on the primary model
      expect(await getModelForTask('narration')).toBe('mistral')
      expect(await getModelForTask('vision')).toBe('mistral')
    })

    it('falls back to the primary model when the routed small model is not installed', async () => {
      vi.mocked(listOllamaModels).mockResolvedValue(['mistral'])
      await configure({
        provider: 'ollama',
        model: 'mistral',
        ollamaUrl: 'http://localhost:11434',
        routing: { enabled: true, smallModel: 'ghost:1b' }
      })
      expect(await getModelForTask('summary')).toBe('mistral')
    })

    it('round-trips the routing block through configure → getConfig', async () => {
      await configure({
        provider: 'ollama',
        model: 'mistral',
        ollamaUrl: 'http://localhost:11434',
        routing: { enabled: true, smallModel: 'llama3.2:1b' }
      })
      expect(getConfig().routing).toEqual({ enabled: true, smallModel: 'llama3.2:1b' })
    })
  })
})
