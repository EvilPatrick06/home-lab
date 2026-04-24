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

vi.mock('../log', () => ({
  logToFile: vi.fn()
}))

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { buildChunkIndex, loadChunkIndex } from './chunk-builder'

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
    expect(result.version).toBe(1)
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
    expect(parsed.version).toBe(1)
    expect(parsed.chunks).toEqual([])
  })
})

describe('loadChunkIndex', () => {
  it('returns null when no index files exist', () => {
    mockExistsSync.mockReturnValue(false)
    const result = loadChunkIndex()
    expect(result).toBeNull()
  })

  it('loads bundled index when available', () => {
    const index = { version: 1, createdAt: '2024-01-01', sources: [], chunks: [] }
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
})
