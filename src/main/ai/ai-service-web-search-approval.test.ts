import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/ipc-channels'

const mocked = vi.hoisted(() => ({
  sendMock: vi.fn(),
  performWebSearchMock: vi.fn(async () => [{ title: 'Result', snippet: 'Snippet', url: 'https://example.com' }]),
  ollamaStreamChatMock: vi.fn(),
  streamResponses: [] as string[]
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => 'C:/tmp'),
    getAppPath: vi.fn(() => 'C:/app')
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => [{ webContents: { send: mocked.sendMock } }])
  }
}))

vi.mock('./context-builder', () => ({
  buildContext: vi.fn(async () => ''),
  setSearchEngine: vi.fn(),
  getLastTokenBreakdown: vi.fn(() => null)
}))

vi.mock('./conversation-manager', () => ({
  ConversationManager: class {
    public contextWasTruncated = false
    public lastTokenEstimate = 0
    private messages: Array<{ role: 'user' | 'assistant'; content: string }> = []

    setSummarizeCallback(_cb: (text: string) => Promise<string>): void {}

    setActiveCharacterIds(_ids: string[]): void {}

    addMessage(role: 'user' | 'assistant', content: string): void {
      this.messages.push({ role, content })
    }

    async getMessagesForApi(
      _context: string
    ): Promise<{ systemPrompt: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> }> {
      return { systemPrompt: 'System prompt', messages: this.messages }
    }

    serialize(): {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
      summaries: unknown[]
      activeCharacterIds: string[]
    } {
      return { messages: this.messages, summaries: [], activeCharacterIds: [] }
    }

    restore(_data: unknown): void {}

    getMessageCount(): number {
      return this.messages.length
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

vi.mock('./web-search', async () => {
  const actual = await vi.importActual<typeof import('./web-search')>('./web-search')
  return {
    ...actual,
    performWebSearch: mocked.performWebSearchMock
  }
})

vi.mock('../storage/ai-conversation-storage', () => ({
  saveConversation: vi.fn(async () => {})
}))

vi.mock('./memory-manager', () => ({
  getMemoryManager: vi.fn(() => ({
    appendSessionLog: vi.fn(async () => {})
  }))
}))

import { approveWebSearch, startChat } from './ai-service'

async function waitForWebSearchStatus(streamId: string, query: string, status: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const found = mocked.sendMock.mock.calls.some(([channel, payload]) => {
      if (channel !== IPC_CHANNELS.AI_STREAM_WEB_SEARCH) return false
      if (!payload || typeof payload !== 'object') return false
      const data = payload as { streamId?: string; query?: string; status?: string }
      return data.streamId === streamId && data.query === query && data.status === status
    })
    if (found) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error(`Timed out waiting for web search status "${status}"`)
}

describe('ai-service web search approval flow', () => {
  beforeEach(() => {
    mocked.sendMock.mockClear()
    mocked.performWebSearchMock.mockClear()
    mocked.ollamaStreamChatMock.mockClear()
    mocked.streamResponses = []
    mocked.ollamaStreamChatMock.mockImplementation(
      async (_systemPrompt: string, _messages: unknown[], callbacks: { onDone: (text: string) => void }) => {
        callbacks.onDone(mocked.streamResponses.shift() ?? 'Fallback response')
      }
    )
  })

  it('waits for approval before running web search', async () => {
    mocked.streamResponses = ['[WEB_SEARCH]{"query":"weather in waterdeep"}[/WEB_SEARCH]', 'Approved search response']

    let streamId = ''
    const donePromise = new Promise<{ fullText: string; displayText: string }>((resolve, reject) => {
      streamId = startChat(
        {
          campaignId: 'campaign-1',
          message: 'Set the weather scene',
          characterIds: []
        },
        () => {},
        (fullText, displayText) => resolve({ fullText, displayText }),
        (error) => reject(new Error(error))
      )
    })

    await waitForWebSearchStatus(streamId, 'weather in waterdeep', 'pending_approval')
    expect(mocked.performWebSearchMock).not.toHaveBeenCalled()

    expect(approveWebSearch(streamId, true)).toEqual({ success: true })
    const done = await donePromise

    expect(mocked.performWebSearchMock).toHaveBeenCalledWith('weather in waterdeep')
    await waitForWebSearchStatus(streamId, 'weather in waterdeep', 'searching')
    expect(done.displayText).toBe('Approved search response')
  })

  it('rejects search and continues without external results', async () => {
    mocked.streamResponses = ['[WEB_SEARCH]{"query":"deep lore"}[/WEB_SEARCH]', 'Fallback answer without web']

    let streamId = ''
    const donePromise = new Promise<{ fullText: string; displayText: string }>((resolve, reject) => {
      streamId = startChat(
        {
          campaignId: 'campaign-2',
          message: 'Tell me deep lore',
          characterIds: []
        },
        () => {},
        (fullText, displayText) => resolve({ fullText, displayText }),
        (error) => reject(new Error(error))
      )
    })

    await waitForWebSearchStatus(streamId, 'deep lore', 'pending_approval')
    expect(approveWebSearch(streamId, false)).toEqual({ success: true })

    const done = await donePromise
    expect(mocked.performWebSearchMock).not.toHaveBeenCalled()
    await waitForWebSearchStatus(streamId, 'deep lore', 'rejected')
    expect(done.displayText).toBe('Fallback answer without web')
  })

  it('returns an error when no web search approval is pending', () => {
    expect(approveWebSearch('missing-stream', true)).toEqual({
      success: false,
      error: 'No pending web search request for this stream.'
    })
  })
})
