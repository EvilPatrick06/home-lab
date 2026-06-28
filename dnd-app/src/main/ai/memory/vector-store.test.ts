import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp/test-userdata') } }))
vi.mock('../../log', () => ({ logToFile: vi.fn() }))

// In-memory fs so save→load round-trips real bytes.
const files = new Map<string, Buffer>()
vi.mock('node:fs', () => ({
  existsSync: vi.fn((p: string) => files.has(p)),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn((p: string, enc?: string) => {
    const b = files.get(p)
    if (!b) throw new Error('ENOENT')
    return enc ? b.toString('utf-8') : b
  }),
  writeFileSync: vi.fn((p: string, data: string | Buffer) => {
    files.set(p, Buffer.isBuffer(data) ? data : Buffer.from(data))
  })
}))

import type { ChunkIndex } from '../types'
import { computeIndexFingerprint, loadVectorStore, saveVectorStore, searchVectors } from './vector-store'

beforeEach(() => files.clear())

const mkIndex = (ids: string[]): ChunkIndex => ({
  version: 2,
  createdAt: '',
  sources: [],
  chunks: ids.map((id) => ({
    id,
    source: 'PHB' as const,
    headingPath: [],
    heading: id,
    content: id,
    tokenEstimate: 1,
    keywords: []
  }))
})

describe('vector-store (PHASE-24 24C)', () => {
  it('round-trips meta + vectors', () => {
    const fp = computeIndexFingerprint(mkIndex(['a', 'b']))
    const vecs = new Float32Array([1, 0, 0, 1])
    saveVectorStore({ version: 1, model: 'nomic', dims: 2, indexFingerprint: fp, ids: ['a', 'b'] }, vecs)
    const loaded = loadVectorStore(fp, 'nomic')
    expect(loaded?.ids).toEqual(['a', 'b'])
    expect(loaded?.dims).toBe(2)
    expect(Array.from(loaded?.vectors ?? [])).toEqual([1, 0, 0, 1])
  })

  it('returns null on fingerprint or model mismatch', () => {
    const vecs = new Float32Array([1, 0])
    saveVectorStore({ version: 1, model: 'nomic', dims: 2, indexFingerprint: 'fp1', ids: ['a'] }, vecs)
    expect(loadVectorStore('fp2', 'nomic')).toBeNull() // fingerprint
    expect(loadVectorStore('fp1', 'other')).toBeNull() // model
    expect(loadVectorStore('fp1', 'nomic')).not.toBeNull()
  })

  it('searchVectors ranks by dot product', () => {
    const store = { ids: ['x', 'y', 'z'], dims: 2, vectors: new Float32Array([1, 0, 0, 1, 0.7, 0.7]) }
    const out = searchVectors(store, [1, 0], 2)
    expect(out[0].id).toBe('x') // dot 1.0
    expect(out[1].id).toBe('z') // dot 0.7
    expect(out).toHaveLength(2)
  })

  it('computeIndexFingerprint changes with the chunk-id set', () => {
    expect(computeIndexFingerprint(mkIndex(['a', 'b']))).not.toBe(computeIndexFingerprint(mkIndex(['a', 'c'])))
  })
})
