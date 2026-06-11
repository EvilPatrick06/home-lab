import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CURATED_MODELS,
  clearNumCtxCache,
  curatedContextSize,
  DEFAULT_NUM_CTX,
  fetchModelMaxContext,
  getOllamaKvCacheType,
  MIN_NUM_CTX,
  resolveNumCtx,
  setConfiguredContextLength,
  setOllamaKvCacheType
} from './ollama-context'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

/** Mock a /api/show response declaring a model max context window. */
function showOk(arch: string, ctx: number) {
  return {
    ok: true,
    json: async () => ({ model_info: { 'general.architecture': arch, [`${arch}.context_length`]: ctx } })
  }
}

describe('ollama-context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setConfiguredContextLength(undefined) // also clears the resolve cache
    clearNumCtxCache()
  })
  afterEach(() => vi.restoreAllMocks())

  describe('curatedContextSize', () => {
    it('matches an exact model id', () => {
      expect(curatedContextSize('llama3.2:3b')).toBe(16384)
      expect(curatedContextSize('phi3:14b')).toBe(4096)
      expect(curatedContextSize('gemma2:9b')).toBe(8192)
    })
    it('falls back to a family-name prefix match', () => {
      expect(curatedContextSize('llama3.1:8b-instruct-q5_K_M')).toBe(16384)
    })
    it('returns undefined for an unknown model', () => {
      expect(curatedContextSize('totally-unknown:1b')).toBeUndefined()
    })
    it('every curated entry advertises at least the floor', () => {
      for (const m of CURATED_MODELS) expect(m.contextSize).toBeGreaterThanOrEqual(MIN_NUM_CTX)
    })
  })

  describe('fetchModelMaxContext', () => {
    it('reads the architecture-keyed context_length from model_info', async () => {
      mockFetch.mockResolvedValueOnce(showOk('llama', 131072))
      expect(await fetchModelMaxContext('llama3.2:3b', 'http://localhost:11434')).toBe(131072)
    })
    it('returns undefined on a failed request', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false })
      expect(await fetchModelMaxContext('x', 'http://localhost:11434')).toBeUndefined()
    })
    it('returns undefined when fetch throws (offline)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
      expect(await fetchModelMaxContext('x', 'http://localhost:11434')).toBeUndefined()
    })
    it('caches per model (one fetch for repeat calls)', async () => {
      mockFetch.mockResolvedValueOnce(showOk('llama', 8192))
      await fetchModelMaxContext('cache-me', 'http://localhost:11434')
      await fetchModelMaxContext('cache-me', 'http://localhost:11434')
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('resolveNumCtx', () => {
    it('uses curated size when no override, clamped to model max', async () => {
      mockFetch.mockResolvedValueOnce(showOk('llama', 131072)) // max well above curated 16384
      expect(await resolveNumCtx('llama3.2:3b', 'http://localhost:11434')).toBe(16384)
    })
    it('clamps DOWN to the model max when the choice exceeds it', async () => {
      setConfiguredContextLength(64000)
      mockFetch.mockResolvedValueOnce(showOk('gemma', 8192))
      expect(await resolveNumCtx('gemma2:9b', 'http://localhost:11434')).toBe(8192)
    })
    it('clamps UP to MIN_NUM_CTX', async () => {
      setConfiguredContextLength(2048) // below floor
      mockFetch.mockResolvedValueOnce(showOk('llama', 131072))
      expect(await resolveNumCtx('llama3.1:8b', 'http://localhost:11434')).toBe(MIN_NUM_CTX)
    })
    it('config override beats curated', async () => {
      setConfiguredContextLength(12000)
      mockFetch.mockResolvedValueOnce(showOk('llama', 131072))
      expect(await resolveNumCtx('llama3.2:3b', 'http://localhost:11434')).toBe(12000)
    })
    it('uses DEFAULT_NUM_CTX for an uncurated model with no override', async () => {
      mockFetch.mockResolvedValueOnce(showOk('qwen', 131072))
      expect(await resolveNumCtx('some-random:7b', 'http://localhost:11434')).toBe(DEFAULT_NUM_CTX)
    })
    it('proceeds unclamped when /api/show fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('offline'))
      expect(await resolveNumCtx('llama3.2:3b', 'http://localhost:11434')).toBe(16384)
    })
    it('is byte-stable: repeat calls return the cached value with no new fetch', async () => {
      mockFetch.mockResolvedValueOnce(showOk('llama', 131072))
      const a = await resolveNumCtx('llama3.2:3b', 'http://localhost:11434')
      const b = await resolveNumCtx('llama3.2:3b', 'http://localhost:11434')
      expect(a).toBe(b)
      expect(mockFetch).toHaveBeenCalledTimes(1) // /api/show fetched once, num_ctx cached
    })
    it('setConfiguredContextLength invalidates the cache', async () => {
      mockFetch.mockResolvedValue(showOk('llama', 131072))
      expect(await resolveNumCtx('llama3.2:3b', 'http://localhost:11434')).toBe(16384)
      setConfiguredContextLength(10000)
      expect(await resolveNumCtx('llama3.2:3b', 'http://localhost:11434')).toBe(10000)
    })
  })

  describe('KV-cache tuning setter/getter', () => {
    it('is undefined by default', () => {
      expect(getOllamaKvCacheType()).toBeUndefined()
    })
    it('round-trips a set value', () => {
      setOllamaKvCacheType('q8_0')
      expect(getOllamaKvCacheType()).toBe('q8_0')
      setOllamaKvCacheType(undefined)
      expect(getOllamaKvCacheType()).toBeUndefined()
    })
  })
})
