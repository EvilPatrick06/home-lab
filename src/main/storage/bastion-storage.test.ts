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

vi.mock('./migrations', () => ({
  CURRENT_SCHEMA_VERSION: 3,
  migrateData: vi.fn((data: unknown) => data)
}))

import { access, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { deleteBastion, loadBastion, loadBastions, saveBastion } from './bastion-storage'

const VALID_UUID = '12345678-1234-1234-1234-123456789abc'
const INVALID_UUID = 'not-a-uuid'

describe('bastion-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // mkdir is called for directory initialization
    vi.mocked(mkdir).mockResolvedValue(undefined)
  })

  describe('saveBastion', () => {
    it('should return error if bastion has no id', async () => {
      const result = await saveBastion({})
      expect(result).toEqual({ success: false, error: 'Bastion must have an id' })
    })

    it('should return error for invalid UUID', async () => {
      const result = await saveBastion({ id: INVALID_UUID })
      expect(result).toEqual({ success: false, error: 'Invalid bastion ID' })
    })

    it('should save bastion with schema version', async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const bastion: Record<string, unknown> = { id: VALID_UUID, name: 'Test Bastion' }
      const result = await saveBastion(bastion)

      expect(result).toEqual({ success: true })
      expect(writeFile).toHaveBeenCalledWith(expect.stringContaining(`${VALID_UUID}.json`), expect.any(String), 'utf-8')
      expect(bastion.schemaVersion).toBe(3)
    })

    it('should return error on write failure', async () => {
      vi.mocked(writeFile).mockRejectedValue(new Error('disk full'))

      const result = await saveBastion({ id: VALID_UUID })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to save bastion')
    })
  })

  describe('loadBastions', () => {
    it('should return empty array when no files exist', async () => {
      vi.mocked(readdir).mockResolvedValue([])

      const result = await loadBastions()
      expect(result).toEqual({ success: true, data: [] })
    })

    it('should load and return all bastion files', async () => {
      vi.mocked(readdir).mockResolvedValue(['a.json', 'b.json'] as never)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ id: 'test' }))

      const result = await loadBastions()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
    })

    it('should skip non-json files', async () => {
      vi.mocked(readdir).mockResolvedValue(['a.json', 'readme.txt'] as never)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ id: 'test' }))

      const result = await loadBastions()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
    })
  })

  describe('loadBastion', () => {
    it('should return error for invalid UUID', async () => {
      const result = await loadBastion(INVALID_UUID)
      expect(result).toEqual({ success: false, error: 'Invalid bastion ID' })
    })

    it('should return null data if file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await loadBastion(VALID_UUID)
      expect(result).toEqual({ success: true, data: null })
    })

    it('should load and migrate bastion data', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ id: VALID_UUID }))

      const result = await loadBastion(VALID_UUID)
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ id: VALID_UUID })
    })
  })

  describe('deleteBastion', () => {
    it('should return error for invalid UUID', async () => {
      const result = await deleteBastion(INVALID_UUID)
      expect(result).toEqual({ success: false, error: 'Invalid bastion ID' })
    })

    it('should return false if file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await deleteBastion(VALID_UUID)
      expect(result).toEqual({ success: true, data: false })
    })

    it('should delete file and return true', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(unlink).mockResolvedValue(undefined)

      const result = await deleteBastion(VALID_UUID)
      expect(result).toEqual({ success: true, data: true })
      expect(unlink).toHaveBeenCalled()
    })
  })
})
