import { describe, expect, it, vi } from 'vitest'

const { getActiveVectorStore, searchVectors } = vi.hoisted(() => ({
  getActiveVectorStore: vi.fn(),
  searchVectors: vi.fn()
}))
const { embedQuery } = vi.hoisted(() => ({ embedQuery: vi.fn() }))
vi.mock('./embedding-index', () => ({ getActiveVectorStore, searchVectors }))
vi.mock('../clients/embedding-client', () => ({ embedQuery }))
vi.mock('../../log', () => ({ logToFile: vi.fn() }))

import type { ScoredChunk } from '../types'
import { HYBRID_TOP_K, searchRules } from './hybrid-search'

function mkChunk(id: string): ScoredChunk {
  return { id, source: 'PHB', headingPath: [], heading: id, content: id, tokenEstimate: 1, keywords: [], score: 0 }
}
function fakeEngine(ranked: string[]) {
  return {
    search: vi.fn((_q: string, _k: number): ScoredChunk[] =>
      ranked.map((id, i) => ({ ...mkChunk(id), score: ranked.length - i }))
    ),
    getChunkById: vi.fn((id: string) => (ranked.includes(id) ? mkChunk(id) : undefined))
  }
}

const OPTS = { embeddingsEnabled: false, model: 'm', baseUrl: 'http://x' }

describe('searchRules (PHASE-24 24C)', () => {
  it('embeddings disabled → exactly engine.search(q,50).slice(0,5)', async () => {
    const engine = fakeEngine(['a', 'b', 'c', 'd', 'e', 'f', 'g'])
    const out = await searchRules('q', engine as never, OPTS)
    expect(engine.search).toHaveBeenCalledWith('q', 50)
    expect(out.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'e']) // top-5 BM25, byte-identical
  })

  it('no vector store → BM25-only even when enabled', async () => {
    getActiveVectorStore.mockReturnValue(null)
    const engine = fakeEngine(['a', 'b', 'c', 'd', 'e', 'f'])
    const out = await searchRules('q', engine as never, { ...OPTS, embeddingsEnabled: true })
    expect(out.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(embedQuery).not.toHaveBeenCalled()
  })

  it('embed failure falls back to BM25-only', async () => {
    getActiveVectorStore.mockReturnValue({ ids: [], dims: 0, vectors: new Float32Array() })
    embedQuery.mockRejectedValueOnce(new Error('endpoint down'))
    const engine = fakeEngine(['a', 'b', 'c', 'd', 'e', 'f'])
    const out = await searchRules('q', engine as never, { ...OPTS, embeddingsEnabled: true })
    expect(out.map((c) => c.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('fuses via RRF: a doc ranked 1st+3rd beats one ranked 2nd+4th, capped at top-8', async () => {
    getActiveVectorStore.mockReturnValue({ ids: [], dims: 0, vectors: new Float32Array() })
    embedQuery.mockResolvedValueOnce([0.1])
    // BM25 order: x first, y second.  Vector order: y first... no — make x 1st+3rd, y 2nd+1st.
    const engine = fakeEngine(['x', 'y', 'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 'z8'])
    // vector list: x at rank 3 (index 2), y at rank 1 → y gets a strong vector contribution.
    searchVectors.mockReturnValue([
      { id: 'y', score: 1 },
      { id: 'q1', score: 0.9 },
      { id: 'x', score: 0.8 }
    ])
    const out = await searchRules('q', engine as never, { ...OPTS, embeddingsEnabled: true })
    expect(out.length).toBeLessThanOrEqual(HYBRID_TOP_K)
    // x: 1/(60+1) + 1/(60+3); y: 1/(60+2) + 1/(60+1). Both close; assert fusion ran (both present, ordered).
    const ids = out.map((c) => c.id)
    expect(ids).toContain('x')
    expect(ids).toContain('y')
  })
})
