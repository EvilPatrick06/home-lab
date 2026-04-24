import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') }
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(() => []),
  unlink: vi.fn(),
  access: vi.fn()
}))

vi.mock('../../shared/utils/uuid', () => ({
  isValidUUID: vi.fn((str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str))
}))

vi.mock('../log', () => ({
  logToFile: vi.fn()
}))

import { access, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import {
  deleteCustomCreature,
  loadCustomCreature,
  loadCustomCreatures,
  saveCustomCreature
} from './custom-creature-storage'

const VALID_UUID = '12345678-1234-1234-1234-123456789abc'
const INVALID_UUID = 'not-a-uuid'

describe('custom-creature-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mkdir).mockResolvedValue(undefined)
  })

  describe('saveCustomCreature', () => {
    it('should return error if creature has no id', async () => {
      const result = await saveCustomCreature({})
      expect(result).toEqual({ success: false, error: 'Creature must have an id' })
    })

    it('should return error for invalid UUID', async () => {
      const result = await saveCustomCreature({ id: INVALID_UUID })
      expect(result).toEqual({ success: false, error: 'Invalid creature ID' })
    })

    it('should save creature to file', async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const creature = { id: VALID_UUID, name: 'Dragon' }
      const result = await saveCustomCreature(creature)

      expect(result).toEqual({ success: true })
      expect(writeFile).toHaveBeenCalledWith(expect.stringContaining(`${VALID_UUID}.json`), expect.any(String), 'utf-8')
    })

    it('should return error on write failure', async () => {
      vi.mocked(writeFile).mockRejectedValue(new Error('disk full'))

      const result = await saveCustomCreature({ id: VALID_UUID })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to save creature')
    })
  })

  describe('loadCustomCreatures', () => {
    it('should return empty array when no files exist', async () => {
      vi.mocked(readdir).mockResolvedValue([])

      const result = await loadCustomCreatures()
      expect(result).toEqual({ success: true, data: [] })
    })

    it('should load and return all creature files', async () => {
      vi.mocked(readdir).mockResolvedValue(['a.json', 'b.json'] as never)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ id: 'test', name: 'Goblin' }))

      const result = await loadCustomCreatures()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
    })

    it('should skip non-json files', async () => {
      vi.mocked(readdir).mockResolvedValue(['a.json', 'image.png'] as never)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ id: 'test' }))

      const result = await loadCustomCreatures()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
    })

    it('should handle individual file read errors gracefully', async () => {
      vi.mocked(readdir).mockResolvedValue(['bad.json'] as never)
      vi.mocked(readFile).mockRejectedValue(new Error('corrupt'))

      const result = await loadCustomCreatures()
      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
    })
  })

  describe('loadCustomCreature', () => {
    it('should return error for invalid UUID', async () => {
      const result = await loadCustomCreature(INVALID_UUID)
      expect(result).toEqual({ success: false, error: 'Invalid creature ID' })
    })

    it('should return null data if file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await loadCustomCreature(VALID_UUID)
      expect(result).toEqual({ success: true, data: null })
    })

    it('should load creature data', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ id: VALID_UUID, name: 'Orc' }))

      const result = await loadCustomCreature(VALID_UUID)
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ id: VALID_UUID, name: 'Orc' })
    })
  })

  describe('deleteCustomCreature', () => {
    it('should return error for invalid UUID', async () => {
      const result = await deleteCustomCreature(INVALID_UUID)
      expect(result).toEqual({ success: false, error: 'Invalid creature ID' })
    })

    it('should return false if file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await deleteCustomCreature(VALID_UUID)
      expect(result).toEqual({ success: true, data: false })
    })

    it('should delete file and return true', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(unlink).mockResolvedValue(undefined)

      const result = await deleteCustomCreature(VALID_UUID)
      expect(result).toEqual({ success: true, data: true })
      expect(unlink).toHaveBeenCalled()
    })
  })
})
