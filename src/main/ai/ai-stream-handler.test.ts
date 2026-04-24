import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ──

const mocked = vi.hoisted(() => ({
  sendMock: vi.fn()
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [{ webContents: { send: mocked.sendMock } }])
  }
}))

vi.mock('./ai-response-parser', () => ({
  finalizeAiResponse: vi.fn((fullText: string) => ({
    fullText,
    displayText: fullText,
    statChanges: [],
    dmActions: [],
    ruleCitations: []
  }))
}))

vi.mock('./file-reader', () => ({
  FILE_READ_MAX_DEPTH: 3,
  formatFileContent: vi.fn(() => '[FILE CONTENT] test data [/FILE CONTENT]'),
  hasFileReadTag: vi.fn(() => false),
  parseFileRead: vi.fn(() => null),
  readRequestedFile: vi.fn(async () => ({ success: true, content: 'file data' })),
  stripFileRead: vi.fn((t: string) => t.replace(/\[FILE_READ\][\s\S]*?\[\/FILE_READ\]/g, '').trim())
}))

vi.mock('./ollama-client', () => ({
  ollamaStreamChat: vi.fn()
}))

vi.mock('./web-search', () => ({
  formatSearchResults: vi.fn(() => '[WEB SEARCH RESULTS] data [/WEB SEARCH RESULTS]'),
  hasWebSearchTag: vi.fn(() => false),
  parseWebSearch: vi.fn(() => null),
  performWebSearch: vi.fn(async () => []),
  stripWebSearch: vi.fn((t: string) => t.replace(/\[WEB_SEARCH\][\s\S]*?\[\/WEB_SEARCH\]/g, '').trim())
}))

// ── Imports ──

import { finalizeAiResponse } from './ai-response-parser'
import {
  approveWebSearch,
  clearPendingWebSearchApproval,
  handleStreamCompletion,
  type StreamHandlerDeps
} from './ai-stream-handler'
import { hasFileReadTag, parseFileRead } from './file-reader'
import { hasWebSearchTag, parseWebSearch } from './web-search'

// ── Helpers ──

function makeConvMock() {
  return {
    addMessage: vi.fn(),
    getMessagesForApi: vi.fn(async () => ({ systemPrompt: 'sys', messages: [] })),
    serialize: vi.fn(() => ({ messages: [], summaries: [], activeCharacterIds: [] }))
  }
}

function makeDeps(overrides?: Partial<StreamHandlerDeps>): StreamHandlerDeps {
  return {
    activeStreams: new Map(),
    ollamaModel: 'llama3.1',
    streamWithRetry: vi.fn(async (fn) => {
      await fn(new AbortController().signal)
    }),
    ...overrides
  }
}

describe('ai-stream-handler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── clearPendingWebSearchApproval ──

  describe('clearPendingWebSearchApproval', () => {
    it('returns false when no pending approval exists', () => {
      expect(clearPendingWebSearchApproval('nonexistent')).toBe(false)
    })
  })

  // ── approveWebSearch ──

  describe('approveWebSearch', () => {
    it('returns error when no pending request', () => {
      const result = approveWebSearch('no-stream', true)
      expect(result.success).toBe(false)
      expect(result.error).toBe('No pending web search request for this stream.')
    })
  })

  // ── handleStreamCompletion ──

  describe('handleStreamCompletion', () => {
    it('finalizes response when no special tags are present', async () => {
      const conv = makeConvMock()
      const deps = makeDeps()
      const onDone = vi.fn()
      const onError = vi.fn()

      await handleStreamCompletion(
        'Normal AI response text',
        { campaignId: 'c1', message: 'hello', characterIds: [] },
        conv as any,
        'stream-1',
        new AbortController(),
        vi.fn(),
        onDone,
        onError,
        0,
        deps
      )

      expect(finalizeAiResponse).toHaveBeenCalledWith(
        'Normal AI response text',
        expect.objectContaining({ campaignId: 'c1' }),
        conv
      )
      expect(onDone).toHaveBeenCalled()
      expect(onError).not.toHaveBeenCalled()
    })

    it('handles file read tag and re-streams', async () => {
      vi.mocked(hasFileReadTag).mockReturnValueOnce(true)
      vi.mocked(parseFileRead).mockReturnValueOnce({ path: '/some/file.txt' })

      const conv = makeConvMock()
      const deps = makeDeps({
        streamWithRetry: vi.fn(async (_fn, _ac, _onErr) => {
          // Simulate the streamed response completing — calls onDone from nextCallbacks
          // This is simplified; the real flow is complex
        })
      })
      const onChunk = vi.fn()
      const onDone = vi.fn()
      const onError = vi.fn()

      await handleStreamCompletion(
        'Some text [FILE_READ]{"path":"/file.txt"}[/FILE_READ]',
        { campaignId: 'c1', message: 'read file', characterIds: [] },
        conv as any,
        'stream-2',
        new AbortController(),
        onChunk,
        onDone,
        onError,
        0,
        deps
      )

      // Verify file read was processed: conv.addMessage should be called
      expect(conv.addMessage).toHaveBeenCalledWith('assistant', expect.any(String))
      expect(conv.addMessage).toHaveBeenCalledWith('user', expect.any(String))
    })

    it('skips file read when depth exceeds max', async () => {
      vi.mocked(hasFileReadTag).mockReturnValueOnce(true)

      const conv = makeConvMock()
      const deps = makeDeps()
      const onDone = vi.fn()

      await handleStreamCompletion(
        'Text with [FILE_READ]{"path":"/file.txt"}[/FILE_READ]',
        { campaignId: 'c1', message: 'test', characterIds: [] },
        conv as any,
        'stream-3',
        new AbortController(),
        vi.fn(),
        onDone,
        vi.fn(),
        10, // depth > FILE_READ_MAX_DEPTH (3)
        deps
      )

      // Should still finalize since depth exceeds max
      expect(finalizeAiResponse).toHaveBeenCalled()
      expect(onDone).toHaveBeenCalled()
    })

    it('handles web search tag but does not re-stream when aborted', async () => {
      vi.mocked(hasWebSearchTag).mockReturnValueOnce(true)
      vi.mocked(parseWebSearch).mockReturnValueOnce({ query: 'test query' })

      const conv = makeConvMock()
      const deps = makeDeps()
      const abortController = new AbortController()

      // Abort shortly after the call so waitForWebSearchApproval resolves quickly
      setTimeout(() => abortController.abort(), 5)

      const onDone = vi.fn()

      await handleStreamCompletion(
        '[WEB_SEARCH]{"query":"test query"}[/WEB_SEARCH]',
        { campaignId: 'c1', message: 'search', characterIds: [] },
        conv as any,
        'stream-4',
        abortController,
        vi.fn(),
        onDone,
        vi.fn(),
        0,
        deps
      )

      // Should return early due to abort
      expect(onDone).not.toHaveBeenCalled()
    })

    it('sends web search status via BrowserWindow', async () => {
      vi.mocked(hasWebSearchTag).mockReturnValueOnce(true)
      vi.mocked(parseWebSearch).mockReturnValueOnce({ query: 'dragon lore' })

      const conv = makeConvMock()
      const deps = makeDeps()
      const abortController = new AbortController()

      // We need to handle the async approval flow — abort to short-circuit
      setTimeout(() => abortController.abort(), 10)

      await handleStreamCompletion(
        '[WEB_SEARCH]{"query":"dragon lore"}[/WEB_SEARCH]',
        { campaignId: 'c1', message: 'tell me about dragons', characterIds: [] },
        conv as any,
        'stream-5',
        abortController,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        0,
        deps
      )

      expect(mocked.sendMock).toHaveBeenCalled()
    })
  })
})
