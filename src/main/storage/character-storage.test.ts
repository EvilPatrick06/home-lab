import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') }
}))

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(() => []),
  stat: vi.fn(),
  unlink: vi.fn(),
  access: vi.fn(),
  copyFile: vi.fn()
}))

vi.mock('../../shared/utils/uuid', () => ({
  isValidUUID: vi.fn((str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str))
}))

vi.mock('../log', () => ({
  logToFile: vi.fn()
}))

vi.mock('./migrations', () => ({
  CURRENT_SCHEMA_VERSION: 3,
  migrateData: vi.fn((data: unknown) => data)
}))

import { access, copyFile, mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import {
  deleteCharacter,
  listCharacterVersions,
  loadCharacter,
  loadCharacters,
  restoreCharacterVersion,
  saveCharacter
} from './character-storage'

const VALID_UUID = '12345678-1234-1234-1234-123456789abc'
const INVALID_UUID = 'not-a-uuid'

describe('character-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mkdir).mockResolvedValue(undefined)
  })

  describe('saveCharacter', () => {
    it('should return error if character has no id', async () => {
      const result = await saveCharacter({})
      expect(result).toEqual({ success: false, error: 'Character must have an id' })
    })

    it('should return error for invalid UUID', async () => {
      const result = await saveCharacter({ id: INVALID_UUID })
      expect(result).toEqual({ success: false, error: 'Invalid character ID' })
    })

    it('should save character with schema version', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const character: Record<string, unknown> = { id: VALID_UUID, name: 'Test Character' }
      const result = await saveCharacter(character)

      expect(result).toEqual({ success: true })
      expect(writeFile).toHaveBeenCalledWith(expect.stringContaining(`${VALID_UUID}.json`), expect.any(String), 'utf-8')
      expect(character.schemaVersion).toBe(3)
    })

    it('should create versioned backup when file already exists', async () => {
      // File exists check (for backup)
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(copyFile).mockResolvedValue(undefined)
      vi.mocked(readdir).mockResolvedValue([])
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const result = await saveCharacter({ id: VALID_UUID, name: 'Updated' })
      expect(result).toEqual({ success: true })
      expect(copyFile).toHaveBeenCalled()
    })

    it('should return error on write failure', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
      vi.mocked(writeFile).mockRejectedValue(new Error('write error'))

      const result = await saveCharacter({ id: VALID_UUID })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to save character')
    })
  })

  describe('loadCharacters', () => {
    it('should return empty array when no files exist', async () => {
      vi.mocked(readdir).mockResolvedValue([])

      const result = await loadCharacters()
      expect(result).toEqual({ success: true, data: [] })
    })

    it('should load and return all character files', async () => {
      vi.mocked(readdir).mockResolvedValue(['a.json', 'b.json'] as never)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ id: 'test' }))

      const result = await loadCharacters()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
    })

    it('should skip non-json files', async () => {
      vi.mocked(readdir).mockResolvedValue(['a.json', 'readme.md'] as never)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ id: 'test' }))

      const result = await loadCharacters()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
    })
  })

  describe('loadCharacter', () => {
    it('should return error for invalid UUID', async () => {
      const result = await loadCharacter(INVALID_UUID)
      expect(result).toEqual({ success: false, error: 'Invalid character ID' })
    })

    it('should return null data if file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await loadCharacter(VALID_UUID)
      expect(result).toEqual({ success: true, data: null })
    })

    it('should load and migrate character data', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ id: VALID_UUID, name: 'Hero' }))

      const result = await loadCharacter(VALID_UUID)
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ id: VALID_UUID, name: 'Hero' })
    })
  })

  describe('deleteCharacter', () => {
    it('should return error for invalid UUID', async () => {
      const result = await deleteCharacter(INVALID_UUID)
      expect(result).toEqual({ success: false, error: 'Invalid character ID' })
    })

    it('should return false if file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await deleteCharacter(VALID_UUID)
      expect(result).toEqual({ success: true, data: false })
    })

    it('should delete file and return true', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(unlink).mockResolvedValue(undefined)

      const result = await deleteCharacter(VALID_UUID)
      expect(result).toEqual({ success: true, data: true })
      expect(unlink).toHaveBeenCalled()
    })
  })

  describe('listCharacterVersions', () => {
    it('should return error for invalid UUID', async () => {
      const result = await listCharacterVersions(INVALID_UUID)
      expect(result).toEqual({ success: false, error: 'Invalid character ID' })
    })

    it('should return empty array if versions directory does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await listCharacterVersions(VALID_UUID)
      expect(result).toEqual({ success: true, data: [] })
    })

    it('should return version entries sorted newest first', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readdir).mockResolvedValue([
        `${VALID_UUID}_2024-01-01T10-00-00.json`,
        `${VALID_UUID}_2024-01-02T10-00-00.json`
      ] as never)
      vi.mocked(stat).mockResolvedValue({
        size: 1024,
        mtime: new Date('2024-01-01')
      } as never)

      const result = await listCharacterVersions(VALID_UUID)
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.data![0].sizeBytes).toBe(1024)
    })
  })

  describe('restoreCharacterVersion', () => {
    it('should return error for invalid UUID', async () => {
      const result = await restoreCharacterVersion(INVALID_UUID, 'file.json')
      expect(result).toEqual({ success: false, error: 'Invalid character ID' })
    })

    it('should reject filenames with path traversal', async () => {
      const result = await restoreCharacterVersion(VALID_UUID, '../evil.json')
      expect(result).toEqual({ success: false, error: 'Invalid version file name' })
    })

    it('should reject non-json filenames', async () => {
      const result = await restoreCharacterVersion(VALID_UUID, 'file.txt')
      expect(result).toEqual({ success: false, error: 'Invalid version file name' })
    })

    it('should return error if version file not found', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await restoreCharacterVersion(VALID_UUID, 'backup.json')
      expect(result).toEqual({ success: false, error: 'Version file not found' })
    })
  })
})
