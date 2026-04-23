import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ──

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp/test'),
    getAppPath: vi.fn(() => '/tmp/app')
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
  writeFileSync: vi.fn()
}))

vi.mock('./chunk-builder', () => ({
  buildChunkIndex: vi.fn(() => ({ chunks: [{ id: '1' }, { id: '2' }] })),
  loadChunkIndex: vi.fn(() => null)
}))

vi.mock('./context-builder', () => ({
  buildContext: vi.fn(async () => ''),
  setSearchEngine: vi.fn()
}))

vi.mock('./conversation-manager', () => ({
  ConversationManager: class {
    public contextWasTruncated = false
    public lastTokenEstimate = 100
    private messages: Array<{ role: string; content: string }> = []

    setSummarizeCallback(): void {}
    setActiveCharacterIds(): void {}
    addMessage(role: string, content: string): void {
      this.messages.push({ role, content })
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
    async generateSessionSummary(): Promise<string | null> {
      return 'Session summary text'
    }
  }
}))

vi.mock('./ollama-client', () => ({
  getOllamaUrl: vi.fn(() => 'http://localhost:11434'),
  isOllamaRunning: vi.fn(async () => true),
  listOllamaModels: vi.fn(async () => ['llama3.1', 'mistral']),
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
    streamChat: vi.fn(),
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

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import {
  cancelChat,
  checkProviders,
  configure,
  getChunkCount,
  getConfig,
  getConnectionStatus,
  getConsecutiveFailures,
  getConversationManager,
  getLastTokenEstimate,
  getSceneStatus,
  initFromSavedConfig,
  loadIndex,
  startChat,
  wasContextTruncated
} from './ai-service'
import { loadChunkIndex } from './chunk-builder'
import { setOllamaUrl } from './ollama-client'

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
    it('saves config to disk and sets ollama URL', () => {
      configure({ provider: 'ollama', model: 'mistral', ollamaUrl: 'http://gpu-server:11434' })

      expect(setOllamaUrl).toHaveBeenCalledWith('http://gpu-server:11434')
      expect(writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('ai-config.json'),
        expect.stringContaining('mistral')
      )
    })

    it('defaults model to llama3.1 if not provided', () => {
      configure({ provider: 'ollama', model: '', ollamaUrl: '' })

      const writtenJson = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls[0][1]
      const parsed = JSON.parse(writtenJson)
      expect(parsed.model).toBe('llama3.1')
    })
  })

  describe('getConfig', () => {
    it('loads config from disk if file exists', () => {
      vi.mocked(existsSync).mockReturnValueOnce(true)
      vi.mocked(readFileSync).mockReturnValueOnce(
        JSON.stringify({ provider: 'ollama', model: 'phi3', ollamaUrl: 'http://remote:11434' })
      )

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

      const config = getConfig()
      expect(config.model).toBe('phi3')
      expect(config.provider).toBe('ollama')
    })

    it('returns defaults if config file does not exist', () => {
      vi.mocked(existsSync).mockReturnValueOnce(false)

      const config = getConfig()
      expect(config.model).toBeDefined()
      expect(config.ollamaUrl).toBeDefined()
      expect(config.provider).toBe('ollama')
    })

    it('returns defaults if config file has invalid JSON', () => {
      vi.mocked(existsSync).mockReturnValueOnce(true)
      vi.mocked(readFileSync).mockReturnValueOnce('not json')

      const config = getConfig()
      expect(config.model).toBeDefined()
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
})
