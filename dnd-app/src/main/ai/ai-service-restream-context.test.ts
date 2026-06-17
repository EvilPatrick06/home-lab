import { beforeEach, describe, expect, it, vi } from 'vitest'

const SENTINEL = '[GAME STATE]\nInitiative: 12\n[/GAME STATE]'

const mocked = vi.hoisted(() => ({
  ollamaStreamChatMock: vi.fn(),
  streamResponses: [] as string[],
  getMessagesForApiArgs: [] as string[]
}))

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => '/tmp'), getAppPath: vi.fn(() => '/app') },
  BrowserWindow: { getAllWindows: vi.fn(() => [{ webContents: { send: vi.fn() } }]) }
}))

// buildContext returns the sentinel game-state block; the continuation must re-send it.
vi.mock('./context-builder', () => ({
  buildContext: vi.fn(async () => ({
    text: SENTINEL,
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
  setSearchEngine: vi.fn(),
  getLastTokenBreakdown: vi.fn(() => null)
}))

vi.mock('./conversation-manager', () => ({
  ConversationManager: class {
    public contextWasTruncated = false
    public lastTokenEstimate = 0
    private messages: Array<{ role: 'user' | 'assistant'; content: string }> = []
    setSummarizeCallback(): void {}
    setActiveCharacterIds(): void {}
    addMessage(role: 'user' | 'assistant', content: string): void {
      this.messages.push({ role, content })
    }
    async getMessagesForApi(
      context: string
    ): Promise<{ systemPrompt: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> }> {
      mocked.getMessagesForApiArgs.push(context)
      return { systemPrompt: 'System prompt', messages: this.messages }
    }
    serialize(): { messages: unknown[]; summaries: unknown[]; activeCharacterIds: string[] } {
      return { messages: this.messages, summaries: [], activeCharacterIds: [] }
    }
    restore(): void {}
    getMessageCount(): number {
      return this.messages.length
    }
    getMessages(): Array<{ role: 'user' | 'assistant'; content: string }> {
      return this.messages
    }
    setSummarizationMode(): void {}
    async endScene(): Promise<{ summarized: boolean }> {
      return { summarized: false }
    }
    get overflowSplitNeeded(): boolean {
      return false
    }
    async generateSessionSummary(): Promise<string | null> {
      return null
    }
  }
}))

vi.mock('./ollama-client', () => ({
  getOllamaUrl: vi.fn(() => 'http://localhost:11434'),
  isOllamaRunning: vi.fn(async () => true),
  listOllamaModels: vi.fn(async () => ['llama3.1']),
  fetchOllamaModels: vi.fn(async () => ['llama3.1']),
  ollamaChatOnce: vi.fn(async () => 'summary'),
  ollamaStreamChat: mocked.ollamaStreamChatMock,
  setOllamaUrl: vi.fn(),
  ollamaProvider: {
    type: 'ollama',
    streamChat: mocked.ollamaStreamChatMock,
    chatOnce: vi.fn(async () => 'summary'),
    isAvailable: vi.fn(async () => true),
    listModels: vi.fn(async () => ['llama3.1'])
  }
}))

vi.mock('./file-reader', async () => {
  const actual = await vi.importActual<typeof import('./file-reader')>('./file-reader')
  return {
    ...actual,
    readRequestedFile: vi.fn(async () => ({ success: true, path: 'notes.md', content: 'the notes' }))
  }
})

vi.mock('../storage/ai-conversation-storage', () => ({ saveConversation: vi.fn(async () => {}) }))
vi.mock('./memory-manager', () => ({ getMemoryManager: vi.fn(() => ({ appendSessionLog: vi.fn(async () => {}) })) }))

import { startChat } from './ai-service'

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('ai-service restream context (06D)', () => {
  beforeEach(() => {
    mocked.ollamaStreamChatMock.mockClear()
    mocked.getMessagesForApiArgs = []
    mocked.streamResponses = ['Reading. [FILE_READ]{"path": "notes.md"}[/FILE_READ]', 'Final answer.']
    mocked.ollamaStreamChatMock.mockImplementation(
      async (_sp: string, _msgs: unknown[], callbacks: { onDone: (text: string) => void }) => {
        callbacks.onDone(mocked.streamResponses.shift() ?? 'fallback')
      }
    )
  })

  it('re-sends the original context block on a FILE_READ continuation (not empty)', async () => {
    let doneText = ''
    startChat(
      { campaignId: 'c-restream', message: 'read the notes', characterIds: [] },
      () => {},
      (_full, display) => {
        doneText = display
      },
      () => {}
    )

    // Wait for the restream to complete.
    for (let i = 0; i < 50 && doneText !== 'Final answer.'; i++) await tick()
    expect(doneText).toBe('Final answer.')

    // First call = original turn; second call = the FILE_READ continuation. Both must carry
    // the game-state sentinel (the bug re-sent '' on the continuation).
    expect(mocked.getMessagesForApiArgs.length).toBeGreaterThanOrEqual(2)
    expect(mocked.getMessagesForApiArgs[0]).toContain('Initiative: 12')
    expect(mocked.getMessagesForApiArgs[1]).toContain('Initiative: 12')
  })
})
