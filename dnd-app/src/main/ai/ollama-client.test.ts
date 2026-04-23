import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./ollama-manager', () => ({
  OLLAMA_BASE_URL: 'http://localhost:11434'
}))

import {
  getOllamaUrl,
  isOllamaRunning,
  listOllamaModels,
  ollamaChatOnce,
  ollamaStreamChat,
  setOllamaUrl
} from './ollama-client'

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
    it('calls the correct endpoint with model and messages', async () => {
      // Create a readable stream that completes immediately
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'))
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
          controller.close()
        }
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: stream
      })

      const callbacks = {
        onText: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn()
      }

      await ollamaStreamChat('You are a DM', [{ role: 'user' as const, content: 'Hello' }], callbacks, 'llama3.1')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"model":"llama3.1"')
        })
      )

      expect(callbacks.onText).toHaveBeenCalledWith('Hello')
      expect(callbacks.onDone).toHaveBeenCalledWith('Hello')
      expect(callbacks.onError).not.toHaveBeenCalled()
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
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"The "}}]}\n'))
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"adventure "}}]}\n'))
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"begins!"}}]}\n'))
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n'))
          controller.close()
        }
      })

      mockFetch.mockResolvedValueOnce({ ok: true, body: stream })

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

    it('skips malformed SSE lines gracefully', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"OK"}}]}\n'))
          controller.enqueue(new TextEncoder().encode('data: {malformed json}\n'))
          controller.enqueue(new TextEncoder().encode('not a data line\n'))
          controller.enqueue(new TextEncoder().encode('\n'))
          controller.enqueue(new TextEncoder().encode('data: [DONE]\n'))
          controller.close()
        }
      })

      mockFetch.mockResolvedValueOnce({ ok: true, body: stream })

      const callbacks = {
        onText: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn()
      }

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
        json: async () => ({
          choices: [{ message: { content: 'Summary of the battle' } }]
        })
      })

      const result = await ollamaChatOnce('Summarize', [{ role: 'user', content: 'What happened?' }], 'llama3.1')
      expect(result).toBe('Summary of the battle')
    })

    it('returns empty string when no content in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: {} }] })
      })

      const result = await ollamaChatOnce('sys', [{ role: 'user', content: 'test' }])
      expect(result).toBe('')
    })

    it('throws on non-OK response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Model not found'
      })

      await expect(ollamaChatOnce('sys', [{ role: 'user', content: 'test' }])).rejects.toThrow('404')
    })

    it('sends system prompt and messages in correct order', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ choices: [{ message: { content: 'ok' } }] })
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
