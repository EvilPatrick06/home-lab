import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') }
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
  unlink: vi.fn()
}))

import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { deleteGameState, loadGameState, saveGameState } from './game-state-storage'

const VALID_UUID = '12345678-1234-1234-1234-123456789abc'
const INVALID_UUID = 'not-a-uuid'

describe('game-state-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mkdir).mockResolvedValue(undefined)
  })

  describe('saveGameState', () => {
    it('should return error for invalid campaign ID', async () => {
      const result = await saveGameState(INVALID_UUID, {})
      expect(result).toEqual({ success: false, error: 'Invalid campaign ID' })
    })

    it('should save game state to file', async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const state = { initiative: [], round: 1 }
      const result = await saveGameState(VALID_UUID, state)

      expect(result).toEqual({ success: true })
      expect(writeFile).toHaveBeenCalledWith(expect.stringContaining(`${VALID_UUID}.json`), expect.any(String), 'utf-8')
    })

    it('should return error on write failure', async () => {
      vi.mocked(writeFile).mockRejectedValue(new Error('disk error'))

      const result = await saveGameState(VALID_UUID, {})
      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to save game state')
    })
  })

  describe('loadGameState', () => {
    it('should return error for invalid campaign ID', async () => {
      const result = await loadGameState(INVALID_UUID)
      expect(result).toEqual({ success: false, error: 'Invalid campaign ID' })
    })

    it('should return null data if file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await loadGameState(VALID_UUID)
      expect(result).toEqual({ success: true, data: null })
    })

    it('should load and return game state data', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      const mockState = { initiative: [], round: 3 }
      vi.mocked(readFile).mockResolvedValue(JSON.stringify(mockState))

      const result = await loadGameState(VALID_UUID)
      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockState)
    })

    it('should return error on read failure', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockRejectedValue(new Error('read error'))

      const result = await loadGameState(VALID_UUID)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to load game state')
    })
  })

  describe('deleteGameState', () => {
    it('should return error for invalid campaign ID', async () => {
      const result = await deleteGameState(INVALID_UUID)
      expect(result).toEqual({ success: false, error: 'Invalid campaign ID' })
    })

    it('should return false if file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await deleteGameState(VALID_UUID)
      expect(result).toEqual({ success: true, data: false })
    })

    it('should delete file and return true', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      // deleteGameState dynamically imports unlink
      const { unlink } = await import('node:fs/promises')
      vi.mocked(unlink).mockResolvedValue(undefined)

      const result = await deleteGameState(VALID_UUID)
      expect(result).toEqual({ success: true, data: true })
    })
  })
})
