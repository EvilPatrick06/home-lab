import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => '/tmp/test'),
    getAppPath: vi.fn(() => '/app')
  }
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}))

vi.mock('../../log', () => ({
  logToFile: vi.fn()
}))

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { buildChunkIndex, loadChunkIndex, stableChunkId } from './chunk-builder'

const mockExistsSync = vi.mocked(existsSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockWriteFileSync = vi.mocked(writeFileSync)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildChunkIndex', () => {
  it('skips source directories that do not exist', () => {
    mockExistsSync.mockReturnValue(false)

    const result = buildChunkIndex()
    expect(result.chunks).toEqual([])
    expect(result.version).toBe(2)
    expect(result.createdAt).toBeTruthy()
  })

  it('calls onProgress callback', () => {
    mockExistsSync.mockReturnValue(false)
    const onProgress = vi.fn()

    buildChunkIndex(onProgress)

    expect(onProgress).toHaveBeenCalledWith(0, 'Scanning rulebook files...')
    expect(onProgress).toHaveBeenCalledWith(90, 'Saving index...')
    expect(onProgress).toHaveBeenCalledWith(100, expect.stringContaining('Done'))
  })

  it('writes index to disk', () => {
    mockExistsSync.mockReturnValue(false)

    buildChunkIndex()

    expect(mockWriteFileSync).toHaveBeenCalled()
    const [, content] = mockWriteFileSync.mock.calls[0]
    const parsed = JSON.parse(content as string)
    expect(parsed.version).toBe(2)
    expect(parsed.chunks).toEqual([])
  })
})

describe('loadChunkIndex', () => {
  it('returns null when no index files exist', () => {
    mockExistsSync.mockReturnValue(false)
    const result = loadChunkIndex()
    expect(result).toBeNull()
  })

  it('loads a v2 bundled index unchanged (passthrough)', () => {
    const index = { version: 2, createdAt: '2024-01-01', sources: [], chunks: [] }
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(index))

    const result = loadChunkIndex()
    expect(result).toEqual(index)
  })

  it('returns null on malformed JSON', () => {
    mockExistsSync.mockImplementation((p) => {
      if (typeof p === 'string' && p.includes('resources')) return false
      return true
    })
    mockReadFileSync.mockReturnValue('not valid json')

    const result = loadChunkIndex()
    expect(result).toBeNull()
  })

  // PHASE-24 24A: v1→v2 load migration.
  it('migrates a v1 index to v2 content-stable ids at load', () => {
    const v1 = {
      version: 1,
      createdAt: '2024-01-01',
      sources: [],
      chunks: [
        {
          id: 'phb-101',
          source: 'PHB',
          headingPath: ['Combat', 'Grappling'],
          heading: 'Grappling',
          content: 'rules',
          tokenEstimate: 1,
          keywords: []
        }
      ]
    }
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(v1))

    const result = loadChunkIndex()
    expect(result?.version).toBe(2)
    expect(result?.chunks[0].id).toBe(stableChunkId('PHB', ['Combat', 'Grappling'], 'rules'))
    expect(result?.chunks[0].id).not.toBe('phb-101')
  })
})

describe('stableChunkId (PHASE-24 24A)', () => {
  it('is deterministic for the same inputs', () => {
    expect(stableChunkId('PHB', ['A', 'B'], 'x')).toBe(stableChunkId('PHB', ['A', 'B'], 'x'))
  })
  it('changes when content changes', () => {
    expect(stableChunkId('PHB', ['A'], 'x')).not.toBe(stableChunkId('PHB', ['A'], 'y'))
  })
  it('prefixes with the lowercased source', () => {
    expect(stableChunkId('PHB', ['A'], 'x')).toMatch(/^phb-[0-9a-f]{16}$/)
  })

  // Cross-engine invariant guard. These digests are derived from the Python twin
  // (bmo/pi/services/rag_search.py stable_chunk_id): sha256(parts.join(' ')) first
  // 16 hex, source lowercased. They are hardcoded (NOT computed via stableChunkId)
  // so the TS engine cannot silently drift off the documented single-space join
  // again — regression guard for the 2026-06-29 NUL-delimiter bug. If this fails,
  // the TS and Python engines no longer produce identical ids for identical input.
  it('matches the Python twin (rag_search.py) byte-for-byte for known inputs', () => {
    expect(stableChunkId('doc', ['H1'], 'body')).toBe('doc-f0b326612cf78bc4')
    expect(stableChunkId('SRD', ['Combat', 'Actions'], 'You can move.')).toBe('srd-4ea724ea4cfd0a69')
    expect(stableChunkId('phb', [], 'plain')).toBe('phb-72d161a8145ec70d')
  })
})
