import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_EMBEDDING_MODEL, embedQuery, embedTexts, prefixesFor } from './embedding-client'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

afterEach(() => vi.clearAllMocks())

describe('embedding-client (PHASE-24 24C)', () => {
  it('posts truncate + num_ctx 8192 + keep_alive and returns vectors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        embeddings: [
          [1, 2],
          [3, 4]
        ]
      })
    })
    const out = await embedTexts(DEFAULT_EMBEDDING_MODEL, ['a', 'b'], 'http://x')
    expect(out).toEqual([
      [1, 2],
      [3, 4]
    ])
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(mockFetch.mock.calls[0][0]).toBe('http://x/api/embed')
    expect(body.truncate).toBe(true)
    expect(body.options.num_ctx).toBe(8192)
    expect(body.keep_alive).toBeDefined()
    expect(body.input).toEqual(['a', 'b'])
  })

  it('404 → actionable "ollama pull" error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'not found' })
    await expect(embedTexts('nomic-embed-text', ['a'], 'http://x')).rejects.toThrow('ollama pull nomic-embed-text')
  })

  it('throws when the vector count mismatches the input count', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ embeddings: [[1]] }) })
    await expect(embedTexts('m', ['a', 'b'], 'http://x')).rejects.toThrow(/1 vectors for 2 inputs/)
  })

  it('embedQuery adds the model query prefix', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ embeddings: [[9]] }) })
    await embedQuery('nomic-embed-text', 'grapple', 'http://x')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.input).toEqual(['search_query: grapple'])
  })

  it('prefixesFor defaults to no prefix for unknown models', () => {
    expect(prefixesFor('mystery-model')).toEqual({ document: '', query: '' })
    expect(prefixesFor('nomic-embed-text:latest').query).toBe('search_query: ')
  })
})
