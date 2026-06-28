import { beforeEach, describe, expect, it, vi } from 'vitest'

const vs = vi.hoisted(() => ({
  loadVectorStore: vi.fn(),
  saveVectorStore: vi.fn(),
  deleteVectorStore: vi.fn(),
  computeIndexFingerprint: vi.fn(() => 'fp'),
  searchVectors: vi.fn(),
  VECTOR_STORE_VERSION: 1
}))
vi.mock('./vector-store', () => vs)
const { embedTexts } = vi.hoisted(() => ({ embedTexts: vi.fn() }))
vi.mock('../clients/embedding-client', () => ({ embedTexts, prefixesFor: () => ({ document: 'search_document: ', query: '' }) }))
vi.mock('../../log', () => ({ logToFile: vi.fn() }))

import { clearEmbeddingIndex, ensureEmbeddingIndex, getActiveVectorStore, getEmbedIndexStatus } from './embedding-index'
import type { ChunkIndex } from '../types'

function mkIndex(n: number): ChunkIndex {
  return {
    version: 2,
    createdAt: '',
    sources: [],
    chunks: Array.from({ length: n }, (_, i) => ({
      id: `c${i}`,
      source: 'PHB' as const,
      headingPath: ['H'],
      heading: 'H',
      content: `content ${i}`,
      tokenEstimate: 1,
      keywords: []
    }))
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  clearEmbeddingIndex()
})

describe('embedding-index (PHASE-24 24C)', () => {
  it('cache hit → ready without embedding', async () => {
    vs.loadVectorStore.mockReturnValue({ ids: ['c0'], dims: 2, vectors: new Float32Array([1, 0]) })
    await ensureEmbeddingIndex(mkIndex(1), 'nomic', 'http://x')
    expect(embedTexts).not.toHaveBeenCalled()
    expect(getEmbedIndexStatus().status).toBe('ready')
    expect(getActiveVectorStore()).not.toBeNull()
  })

  it('cache miss → embeds in batches and saves', async () => {
    vs.loadVectorStore.mockReturnValue(null)
    embedTexts.mockResolvedValue([[1, 0]]) // one vector per single-item batch... use bigger batches
    embedTexts.mockImplementation(async (_m: string, inputs: string[]) => inputs.map(() => [1, 0]))
    await ensureEmbeddingIndex(mkIndex(40), 'nomic', 'http://x') // 40 chunks → 2 batches of 32/8
    expect(embedTexts).toHaveBeenCalledTimes(2)
    expect(vs.saveVectorStore).toHaveBeenCalledTimes(1)
    expect(getEmbedIndexStatus().status).toBe('ready')
  })

  it('error → status error, never throws', async () => {
    vs.loadVectorStore.mockReturnValue(null)
    embedTexts.mockRejectedValue(new Error('endpoint down'))
    await expect(ensureEmbeddingIndex(mkIndex(5), 'nomic', 'http://x')).resolves.toBeUndefined()
    expect(getEmbedIndexStatus().status).toBe('error')
    expect(getActiveVectorStore()).toBeNull()
  })

  it('single-flight: concurrent calls embed once', async () => {
    vs.loadVectorStore.mockReturnValue(null)
    embedTexts.mockImplementation(async (_m: string, inputs: string[]) => inputs.map(() => [1, 0]))
    const idx = mkIndex(10)
    await Promise.all([ensureEmbeddingIndex(idx, 'nomic', 'http://x'), ensureEmbeddingIndex(idx, 'nomic', 'http://x')])
    expect(embedTexts).toHaveBeenCalledTimes(1) // 10 chunks → 1 batch, only once despite 2 calls
  })
})
