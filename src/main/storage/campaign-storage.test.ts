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
  access: vi.fn(),
  rm: vi.fn().mockResolvedValue(undefined)
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
import { deleteCampaign, loadCampaign, loadCampaigns, saveCampaign } from './campaign-storage'

const VALID_UUID = '12345678-1234-1234-1234-123456789abc'
const INVALID_UUID = 'not-a-uuid'

describe('campaign-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(mkdir).mockResolvedValue(undefined)
  })

  describe('saveCampaign', () => {
    it('should return error if campaign has no id', async () => {
      const result = await saveCampaign({})
      expect(result).toEqual({ success: false, error: 'Campaign must have an id' })
    })

    it('should return error for invalid UUID', async () => {
      const result = await saveCampaign({ id: INVALID_UUID })
      expect(result).toEqual({ success: false, error: 'Invalid campaign ID' })
    })

    it('should save campaign with schema version', async () => {
      vi.mocked(writeFile).mockResolvedValue(undefined)

      const campaign: Record<string, unknown> = { id: VALID_UUID, name: 'Test Campaign' }
      const result = await saveCampaign(campaign)

      expect(result).toEqual({ success: true })
      expect(writeFile).toHaveBeenCalledWith(expect.stringContaining(`${VALID_UUID}.json`), expect.any(String), 'utf-8')
      expect(campaign.schemaVersion).toBe(3)
    })

    it('should return error on write failure', async () => {
      vi.mocked(writeFile).mockRejectedValue(new Error('permission denied'))

      const result = await saveCampaign({ id: VALID_UUID })
      expect(result.success).toBe(false)
      expect(result.error).toContain('Failed to save campaign')
    })
  })

  describe('loadCampaigns', () => {
    it('should return empty array when no files exist', async () => {
      vi.mocked(readdir).mockResolvedValue([])

      const result = await loadCampaigns()
      expect(result).toEqual({ success: true, data: [] })
    })

    it('should load and return all campaign files', async () => {
      vi.mocked(readdir).mockResolvedValue(['c1.json', 'c2.json'] as never)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ id: 'test' }))

      const result = await loadCampaigns()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
    })

    it('should skip non-json files', async () => {
      vi.mocked(readdir).mockResolvedValue(['c1.json', 'notes.txt'] as never)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ id: 'test' }))

      const result = await loadCampaigns()
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(1)
    })

    it('should handle read errors gracefully', async () => {
      vi.mocked(readdir).mockResolvedValue(['bad.json'] as never)
      vi.mocked(readFile).mockRejectedValue(new Error('corrupt'))

      const result = await loadCampaigns()
      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
    })
  })

  describe('loadCampaign', () => {
    it('should return error for invalid UUID', async () => {
      const result = await loadCampaign(INVALID_UUID)
      expect(result).toEqual({ success: false, error: 'Invalid campaign ID' })
    })

    it('should return null data if file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await loadCampaign(VALID_UUID)
      expect(result).toEqual({ success: true, data: null })
    })

    it('should load and migrate campaign data', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readFile).mockResolvedValue(JSON.stringify({ id: VALID_UUID, name: 'My Campaign' }))

      const result = await loadCampaign(VALID_UUID)
      expect(result.success).toBe(true)
      expect(result.data).toEqual({ id: VALID_UUID, name: 'My Campaign' })
    })
  })

  describe('deleteCampaign', () => {
    it('should return error for invalid UUID', async () => {
      const result = await deleteCampaign(INVALID_UUID)
      expect(result).toEqual({ success: false, error: 'Invalid campaign ID' })
    })

    it('should return false if file does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))

      const result = await deleteCampaign(VALID_UUID)
      expect(result).toEqual({ success: true, data: false })
    })

    it('should delete file and return true', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(unlink).mockResolvedValue(undefined)

      const result = await deleteCampaign(VALID_UUID)
      expect(result).toEqual({ success: true, data: true })
      expect(unlink).toHaveBeenCalled()
    })
  })
})
