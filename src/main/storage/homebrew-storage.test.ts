import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') }
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(() => []),
  unlink: vi.fn()
}))

vi.mock('../../shared/utils/uuid', () => ({
  isValidUUID: vi.fn((str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str))
}))

import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { deleteHomebrewEntry, loadAllHomebrew, loadHomebrewEntries, saveHomebrewEntry } from './homebrew-storage'

const VALID_UUID = '12345678-1234-1234-1234-123456789abc'
const INVALID_UUID = 'not-a-uuid'

describe('homebrew-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mkdir).mockResolvedValue(undefined)
  })

  describe('saveHomebrewEntry', () => {
    it('should return error if entry has no id or type', async () => {
      const result = await saveHomebrewEntry({})
      expect(result).toEqual({ success: false, error: 'Entry must have id and type' })
    })

    it('should return error if entry has id but no type', async () => {
      const result = await saveHomebrewEntry({ id: VALID_UUID })
      expect(result).toEqual({ success: false, error: 'Entry must have id and type' })
    })

    it('should return error for invalid UUID', async () => {
      const result = await saveHomebrewEntry({ id: INVALID_UUID, type: 'spells' })
      expect(result).toEqual({ success: false, error: 'Invalid entry ID' })
    })

    it('should save entry to category directory', async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const entry = { id: VALID_UUID, type: 'spells', name: 'Custom Fireball' }
      const result = await saveHomebrewEntry(entry)

      expect(result).toEqual({ success: true })
      expect(writeFile).toHaveBeenCalledWith(expect.stringContaining(`${VALID_UUID}.json`), expect.any(String), 'utf-8')
    })

    it('should return error on write failure', async () => {
      vi.mocked(writeFile).mockRejectedValue(new Error('write error'))

      const result = await saveHomebrewEntry({ id: VALID_UUID, type: 'spells' })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to save homebrew entry')
    })
  })

  describe('loadHomebrewEntries', () => {
    it('should return empty array when no files exist', async () => {
      vi.mocked(readdir).mockResolvedValue([])

      const result = await loadHomebrewEntries('spells')
      expect(result).toEqual({ success: true, data: [] })
    })

    it('should load and return all entries for a category', async () => {
      vi.mocked(readdir).mockResolvedValue(['a.json', 'b.json'] as never)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ id: 'test', name: 'Spell' }))

      const result = await loadHomebrewEntries('spells')
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
    })

    it('should skip non-json files', async () => {
      vi.mocked(readdir).mockResolvedValue(['a.json', 'notes.txt'] as never)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ id: 'test' }))

      const result = await loadHomebrewEntries('spells')
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
    })
  })

  describe('loadAllHomebrew', () => {
    it('should return empty array when no category directories exist', async () => {
      vi.mocked(readdir).mockResolvedValue([])

      const result = await loadAllHomebrew()
      expect(result).toEqual({ success: true, data: [] })
    })

    it('should combine entries from multiple categories', async () => {
      // First readdir: list category directories
      vi.mocked(readdir).mockResolvedValueOnce([
        { name: 'spells', isDirectory: () => true },
        { name: 'feats', isDirectory: () => true }
      ] as never)
      // Second readdir: files in spells category
      vi.mocked(readdir).mockResolvedValueOnce(['a.json'] as never)
      vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({ id: '1', name: 'Spell' }))
      // Third readdir: files in feats category
      vi.mocked(readdir).mockResolvedValueOnce(['b.json'] as never)
      vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({ id: '2', name: 'Feat' }))

      const result = await loadAllHomebrew()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
    })
  })

  describe('deleteHomebrewEntry', () => {
    it('should return error for invalid UUID', async () => {
      const result = await deleteHomebrewEntry('spells', INVALID_UUID)
      expect(result).toEqual({ success: false, error: 'Invalid entry ID' })
    })

    it('should delete file and return true', async () => {
      vi.mocked(unlink).mockResolvedValue(undefined)

      const result = await deleteHomebrewEntry('spells', VALID_UUID)
      expect(result).toEqual({ success: true, data: true })
      expect(unlink).toHaveBeenCalled()
    })

    it('should return error on delete failure', async () => {
      vi.mocked(unlink).mockRejectedValue(new Error('ENOENT'))

      const result = await deleteHomebrewEntry('spells', VALID_UUID)
      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to delete homebrew entry')
    })
  })
})
