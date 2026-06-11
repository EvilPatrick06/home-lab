import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/ipc-channels'

const mocked = vi.hoisted(() => ({
  sendMock: vi.fn(),
  ollamaStreamChatMock: vi.fn(),
  streamResponses: [] as string[],
  readRequestedFileMock: vi.fn(),
  readResolve: null as null | ((v: { success: boolean; path: string; content?: string }) => void),
  performWebSearchMock: vi.fn(),
  searchResolve: null as null | ((v: unknown[]) => void),
  convInstances: [] as Array<{ getMessageCount: () => number }>
}))

vi.mock('electron', () => ({
  app: { isPackaged: false, getPath: vi.fn(() => 'C:/tmp'), getAppPath: vi.fn(() => 'C:/app') },
  BrowserWindow: { getAllWindows: vi.fn(() => [{ webContents: { send: mocked.sendMock } }]) }
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
    constructor() {
      mocked.convInstances.push(this)
    }
    setSummarizeCallback(): void {}
    setActiveCharacterIds(): void {}
    addMessage(role: 'user' | 'assistant', content: string): void {
      this.messages.push({ role, content })
    }
    async getMessagesForApi(): Promise<{
      systemPrompt: string
      messages: Array<{ role: 'user' | 'assistant'; content: string }>
    }> {
      return { systemPrompt: 'System prompt', messages: this.messages }
    }
    serialize(): { messages: unknown[]; summaries: unknown[]; activeCharacterIds: string[] } {
      return { messages: this.messages, summaries: [], activeCharacterIds: [] }
    }
    restore(): void {}
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
  return { ...actual, readRequestedFile: mocked.readRequestedFileMock }
})

vi.mock('./web-search', async () => {
  const actual = await vi.importActual<typeof import('./web-search')>('./web-search')
  return { ...actual, performWebSearch: mocked.performWebSearchMock }
})

vi.mock('../storage/ai-conversation-storage', () => ({ saveConversation: vi.fn(async () => {}) }))
vi.mock('./memory-manager', () => ({ getMemoryManager: vi.fn(() => ({ appendSessionLog: vi.fn(async () => {}) })) }))

import { approveWebSearch, cancelChat, getActiveStreamCount, startChat } from './ai-service'

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (predicate()) return
    await tick()
  }
  throw new Error(`Timed out waiting for: ${label}`)
}

const sawFileRead = (streamId: string): boolean =>
  mocked.sendMock.mock.calls.some(([channel, payload]) => {
    if (channel !== IPC_CHANNELS.AI_STREAM_FILE_READ) return false
    return (payload as { streamId?: string })?.streamId === streamId
  })

const sawWebSearch = (streamId: string, status: string): boolean =>
  mocked.sendMock.mock.calls.some(([channel, payload]) => {
    if (channel !== IPC_CHANNELS.AI_STREAM_WEB_SEARCH) return false
    const d = payload as { streamId?: string; status?: string }
    return d?.streamId === streamId && d?.status === status
  })

describe('ai-service stream-cancel cleanup (05E)', () => {
  beforeEach(() => {
    mocked.sendMock.mockClear()
    mocked.ollamaStreamChatMock.mockClear()
    mocked.readRequestedFileMock.mockClear()
    mocked.performWebSearchMock.mockClear()
    mocked.convInstances = []
    mocked.readResolve = null
    mocked.searchResolve = null
    mocked.streamResponses = []
    mocked.ollamaStreamChatMock.mockImplementation(
      async (_sp: string, _msgs: unknown[], callbacks: { onDone: (text: string) => void }) => {
        callbacks.onDone(mocked.streamResponses.shift() ?? 'Fallback response')
      }
    )
    mocked.readRequestedFileMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          mocked.readResolve = resolve
        })
    )
    mocked.performWebSearchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          mocked.searchResolve = resolve
        })
    )
  })

  it('cancel during a file read: no restream, no post-cancel conversation writes, no leak', async () => {
    mocked.streamResponses = ['Reading. [FILE_READ]{"path": "notes.md"}[/FILE_READ]', 'restreamed answer']
    const streamId = startChat(
      { campaignId: 'c-fr', message: 'read the notes', characterIds: [] },
      () => {},
      () => {},
      () => {}
    )

    await waitFor(() => sawFileRead(streamId), 'file-read status')
    const conv = mocked.convInstances.at(-1)
    const countBefore = conv?.getMessageCount() ?? -1

    cancelChat(streamId)
    mocked.readResolve?.({ success: true, path: 'notes.md', content: 'the notes' })
    await tick()
    await tick()

    expect(mocked.ollamaStreamChatMock).toHaveBeenCalledTimes(1) // no restream
    expect(conv?.getMessageCount()).toBe(countBefore) // nothing appended after cancel
    expect(getActiveStreamCount()).toBe(0) // no orphan left for the TTL sweep
  })

  it('uncancelled control: restream runs, conversation gains assistant + file messages, no leak', async () => {
    mocked.streamResponses = ['Reading. [FILE_READ]{"path": "notes.md"}[/FILE_READ]', 'Here is the summary.']
    let doneText = ''
    startChat(
      { campaignId: 'c-fr2', message: 'read the notes', characterIds: [] },
      () => {},
      (_full, display) => {
        doneText = display
      },
      () => {}
    )

    await waitFor(() => mocked.readResolve !== null, 'file read invoked')
    const conv = mocked.convInstances.at(-1)
    const countBefore = conv?.getMessageCount() ?? -1
    mocked.readResolve?.({ success: true, path: 'notes.md', content: 'the notes' })

    await waitFor(() => doneText === 'Here is the summary.', 'terminal onDone')
    expect(mocked.ollamaStreamChatMock).toHaveBeenCalledTimes(2) // restream happened
    expect((conv?.getMessageCount() ?? 0) > countBefore).toBe(true) // assistant + file content appended
    expect(getActiveStreamCount()).toBe(0)
  })

  it('cancel during a web search: no dangling assistant message, no restream, no leak', async () => {
    mocked.streamResponses = ['[WEB_SEARCH]{"query":"q"}[/WEB_SEARCH]']
    const streamId = startChat(
      { campaignId: 'c-ws', message: 'search', characterIds: [] },
      () => {},
      () => {},
      () => {}
    )

    await waitFor(() => sawWebSearch(streamId, 'pending_approval'), 'web-search pending')
    const conv = mocked.convInstances.at(-1)
    const countBefore = conv?.getMessageCount() ?? -1

    expect(approveWebSearch(streamId, true)).toEqual({ success: true })
    await waitFor(() => sawWebSearch(streamId, 'searching'), 'web-search searching')

    cancelChat(streamId)
    mocked.searchResolve?.([{ title: 'r', snippet: 's', url: 'https://e.com' }])
    await tick()
    await tick()

    expect(conv?.getMessageCount()).toBe(countBefore) // no assistant message committed post-cancel
    expect(mocked.ollamaStreamChatMock).toHaveBeenCalledTimes(1) // no restream
    expect(getActiveStreamCount()).toBe(0)
  })
})
