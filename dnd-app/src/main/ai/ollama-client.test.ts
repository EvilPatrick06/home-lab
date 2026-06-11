import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./ollama-manager', () => ({
  OLLAMA_BASE_URL: 'http://localhost:11434'
}))

// Stub num_ctx resolution so the transport tests don't fire a real /api/show fetch
// (which would consume a queued mock response). Keeps OLLAMA_KEEP_ALIVE real.
vi.mock('./ollama-context', async (orig) => ({
  ...(await orig<typeof import('./ollama-context')>()),
  resolveNumCtx: vi.fn(async () => 16384)
}))

import {
  getLastOllamaStats,
  getOllamaUrl,
  isOllamaRunning,
  listOllamaModels,
  ollamaChatOnce,
  ollamaStreamChat,
  setOllamaUrl
} from './ollama-client'

/** Build a ReadableStream of NDJSON lines (native /api/chat shape). */
function ndjsonStream(lines: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const l of lines) controller.enqueue(new TextEncoder().encode(l))
      controller.close()
    }
  })
}
const tok = (content: string) => `${JSON.stringify({ message: { role: 'assistant', content }, done: false })}\n`
const doneLine = (extra: Record<string, unknown> = {}) =>
  `${JSON.stringify({ message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop', ...extra })}\n`

// ── Mock fetch globally ──

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('ollama-client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setOllamaUrl('http://localhost:11434') // Reset URL
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── setOllamaUrl / getOllamaUrl ──

  describe('setOllamaUrl / getOllamaUrl', () => {
    it('sets and gets the Ollama URL', () => {
      setOllamaUrl('http://gpu-server:11434')
      expect(getOllamaUrl()).toBe('http://gpu-server:11434')
    })

    it('strips trailing slashes from URL', () => {
      setOllamaUrl('http://gpu-server:11434///')
      expect(getOllamaUrl()).toBe('http://gpu-server:11434')
    })

    it('handles URL with no trailing slash', () => {
      setOllamaUrl('http://localhost:11434')
      expect(getOllamaUrl()).toBe('http://localhost:11434')
    })
  })

  // ── isOllamaRunning ──

  describe('isOllamaRunning', () => {
    it('returns true when Ollama API responds OK', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })
      expect(await isOllamaRunning()).toBe(true)
    })

    it('returns false when Ollama API responds with error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })
      expect(await isOllamaRunning()).toBe(false)
    })

    it('returns false when fetch throws (connection refused)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'))
      expect(await isOllamaRunning()).toBe(false)
    })

    it('calls the correct URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true })
      await isOllamaRunning()
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      )
    })
  })

  // ── listOllamaModels ──

  describe('listOllamaModels', () => {
    it('returns model names from API response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [{ name: 'llama3.1:latest' }, { name: 'mistral:7b' }, { name: 'phi3:14b' }]
        })
      })

      const models = await listOllamaModels()
      expect(models).toEqual(['llama3.1:latest', 'mistral:7b', 'phi3:14b'])
    })

    it('returns empty array when API responds with error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })
      expect(await listOllamaModels()).toEqual([])
    })

    it('returns empty array when fetch throws', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))
      expect(await listOllamaModels()).toEqual([])
    })

    it('returns empty array when models field is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      })
      expect(await listOllamaModels()).toEqual([])
    })
  })

  // ── ollamaStreamChat ──

  describe('ollamaStreamChat', () => {
    it('calls the native /api/chat endpoint with model, messages and keep_alive', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, body: ndjsonStream([tok('Hello'), doneLine()]) })

      const callbacks = { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      await ollamaStreamChat('You are a DM', [{ role: 'user' as const, content: 'Hello' }], callbacks, 'llama3.1')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"model":"llama3.1"')
        })
      )
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.keep_alive).toBe('60m')
      expect(body.stream).toBe(true)
      expect(body.options).toEqual({ num_ctx: 16384 })

      expect(callbacks.onText).toHaveBeenCalledWith('Hello')
      expect(callbacks.onDone).toHaveBeenCalledWith('Hello')
      expect(callbacks.onError).not.toHaveBeenCalled()
    })

    it('records prompt/eval counts from the final done chunk', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: ndjsonStream([tok('Hi'), doneLine({ prompt_eval_count: 120, eval_count: 8 })])
      })
      await ollamaStreamChat('sys', [], { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }, 'llama3.1')
      expect(getLastOllamaStats()).toMatchObject({ model: 'llama3.1', promptEvalCount: 120, evalCount: 8 })
    })

    it('ignores message.thinking (reasoning never leaks into narration)', async () => {
      const thinking = `${JSON.stringify({ message: { role: 'assistant', thinking: 'hmm', content: '' }, done: false })}\n`
      mockFetch.mockResolvedValueOnce({ ok: true, body: ndjsonStream([thinking, tok('Answer'), doneLine()]) })
      const callbacks = { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      await ollamaStreamChat('sys', [], callbacks, 'deepseek-r1:8b')
      expect(callbacks.onDone).toHaveBeenCalledWith('Answer')
      expect(callbacks.onText).not.toHaveBeenCalledWith('hmm')
    })

    it('surfaces a mid-stream JSON error object via onError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: ndjsonStream([tok('partial'), `${JSON.stringify({ error: 'model runner crashed' })}\n`])
      })
      const callbacks = { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      await ollamaStreamChat('sys', [], callbacks, 'llama3.1')
      expect(callbacks.onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'model runner crashed' }))
      expect(callbacks.onDone).not.toHaveBeenCalled()
    })

    it('calls onError when API returns non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      })

      const callbacks = {
        onText: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn()
      }

      await ollamaStreamChat('sys', [], callbacks, 'llama3.1')

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('500')
        })
      )
    })

    it('calls onError with an actionable "ollama pull" message on a 404 (model not installed)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => '{"error":{"message":"model not found"}}'
      })

      const callbacks = { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      await ollamaStreamChat('sys', [], callbacks, 'llama3.2:3b')

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining('ollama pull llama3.2:3b') })
      )
    })

    it('calls onError when response has no body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: null
      })

      const callbacks = {
        onText: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn()
      }

      await ollamaStreamChat('sys', [], callbacks, 'llama3.1')

      expect(callbacks.onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('No response body')
        })
      )
    })

    it('handles multiple streaming chunks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: ndjsonStream([tok('The '), tok('adventure '), tok('begins!'), doneLine()])
      })

      const chunks: string[] = []
      const callbacks = {
        onText: vi.fn((text: string) => chunks.push(text)),
        onDone: vi.fn(),
        onError: vi.fn()
      }

      await ollamaStreamChat('sys', [], callbacks, 'llama3.1')

      expect(chunks).toEqual(['The ', 'adventure ', 'begins!'])
      expect(callbacks.onDone).toHaveBeenCalledWith('The adventure begins!')
    })

    it('reassembles an NDJSON object split across network chunks', async () => {
      // One token object delivered in two reads (split mid-JSON, no newline until the 2nd).
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"message":{"role":"assistant","content":"Hel'))
          controller.enqueue(new TextEncoder().encode('lo"},"done":false}\n'))
          controller.enqueue(new TextEncoder().encode(doneLine()))
          controller.close()
        }
      })
      mockFetch.mockResolvedValueOnce({ ok: true, body: stream })
      const callbacks = { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      await ollamaStreamChat('sys', [], callbacks, 'llama3.1')
      expect(callbacks.onText).toHaveBeenCalledWith('Hello')
      expect(callbacks.onDone).toHaveBeenCalledWith('Hello')
    })

    it('skips malformed NDJSON lines gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: ndjsonStream([tok('OK'), '{malformed json}\n', '\n', doneLine()])
      })

      const callbacks = { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() }
      await ollamaStreamChat('sys', [], callbacks, 'llama3.1')

      expect(callbacks.onText).toHaveBeenCalledTimes(1)
      expect(callbacks.onText).toHaveBeenCalledWith('OK')
      expect(callbacks.onError).not.toHaveBeenCalled()
    })

    it('does not call onError when abortSignal is already aborted', async () => {
      const abortController = new AbortController()
      abortController.abort()

      mockFetch.mockRejectedValueOnce(new DOMException('Aborted', 'AbortError'))

      const callbacks = {
        onText: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn()
      }

      await ollamaStreamChat('sys', [], callbacks, 'llama3.1', abortController.signal)

      expect(callbacks.onError).not.toHaveBeenCalled()
    })

    it('includes system prompt as first message', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close()
        }
      })

      mockFetch.mockResolvedValueOnce({ ok: true, body: stream })

      await ollamaStreamChat(
        'You are a DM',
        [{ role: 'user', content: 'Hello' }],
        { onText: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
        'llama3.1'
      )

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.messages[0]).toEqual({ role: 'system', content: 'You are a DM' })
      expect(body.messages[1]).toEqual({ role: 'user', content: 'Hello' })
    })
  })

  // ── ollamaChatOnce ──

  describe('ollamaChatOnce', () => {
    it('returns content from non-streaming response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { role: 'assistant', content: 'Summary of the battle' }, done: true })
      })

      const result = await ollamaChatOnce('Summarize', [{ role: 'user', content: 'What happened?' }], 'llama3.1')
      expect(result).toBe('Summary of the battle')
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/chat', expect.anything())
      expect(JSON.parse(mockFetch.mock.calls[0][1].body).keep_alive).toBe('60m')
    })

    it('returns empty string when no content in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { role: 'assistant' }, done: true })
      })

      const result = await ollamaChatOnce('sys', [{ role: 'user', content: 'test' }], 'test-model')
      expect(result).toBe('')
    })

    it('throws when the response body carries an error field', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ error: 'context overflow' }) })
      await expect(ollamaChatOnce('sys', [{ role: 'user', content: 'x' }], 'llama3.1')).rejects.toThrow(
        'context overflow'
      )
    })

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error'
      })

      await expect(ollamaChatOnce('sys', [{ role: 'user', content: 'test' }], 'test-model')).rejects.toThrow('500')
    })

    it('turns a 404 into an actionable "ollama pull" message naming the model', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => '{"error":{"message":"model not found"}}'
      })

      await expect(ollamaChatOnce('sys', [{ role: 'user', content: 'test' }], 'llama3.2:3b')).rejects.toThrow(
        'ollama pull llama3.2:3b'
      )
    })

    it('sends system prompt and messages in correct order', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: { role: 'assistant', content: 'ok' }, done: true })
      })
      await ollamaChatOnce('You summarize', [{ role: 'user', content: 'Summarize this' }], 'mistral')

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.model).toBe('mistral')
      expect(body.stream).toBe(false)
      expect(body.messages[0].role).toBe('system')
      expect(body.messages[1].role).toBe('user')
    })
  })
})
