import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') }
}))

vi.mock('node:fs/promises', () => ({
  rename: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  readdir: vi.fn(() => []),
  stat: vi.fn(),
  copyFile: vi.fn(),
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
  CURRENT_SCHEMA_VERSION: 4,
  migrateData: vi.fn((data: unknown) => data)
}))

import { access, mkdir, readdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import {
  deleteCampaign,
  listCampaignVersions,
  loadCampaign,
  loadCampaigns,
  restoreCampaignVersion,
  saveCampaign
} from './campaign-storage'

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
      expect(campaign.schemaVersion).toBe(4)
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

  describe('listCampaignVersions', () => {
    it('should return error for invalid UUID', async () => {
      const result = await listCampaignVersions(INVALID_UUID)
      expect(result).toEqual({ success: false, error: 'Invalid campaign ID' })
    })

    it('should return empty array if versions directory does not exist', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
      const result = await listCampaignVersions(VALID_UUID)
      expect(result).toEqual({ success: true, data: [] })
    })

    it('should return version entries sorted newest first', async () => {
      vi.mocked(access).mockResolvedValue(undefined)
      vi.mocked(readdir).mockResolvedValue([
        `${VALID_UUID}_2024-01-01T10-00-00.json`,
        `${VALID_UUID}_2024-01-02T10-00-00.json`
      ] as never)
      vi.mocked(stat).mockResolvedValue({ size: 2048, mtime: new Date('2024-01-01') } as never)

      const result = await listCampaignVersions(VALID_UUID)
      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
      expect(result.data![0].sizeBytes).toBe(2048)
      // newest-first: the 2024-01-02 file sorts ahead of 2024-01-01
      expect(result.data![0].fileName).toContain('2024-01-02')
    })
  })

  describe('restoreCampaignVersion', () => {
    it('should return error for invalid UUID', async () => {
      const result = await restoreCampaignVersion(INVALID_UUID, 'file.json')
      expect(result).toEqual({ success: false, error: 'Invalid campaign ID' })
    })

    it('should reject filenames with path traversal', async () => {
      const result = await restoreCampaignVersion(VALID_UUID, '../evil.json')
      expect(result).toEqual({ success: false, error: 'Invalid version file name' })
    })

    it('should reject non-json filenames', async () => {
      const result = await restoreCampaignVersion(VALID_UUID, 'file.txt')
      expect(result).toEqual({ success: false, error: 'Invalid version file name' })
    })

    it('should return error if version file not found', async () => {
      vi.mocked(access).mockRejectedValue(new Error('ENOENT'))
      const result = await restoreCampaignVersion(VALID_UUID, 'backup.json')
      expect(result).toEqual({ success: false, error: 'Version file not found' })
    })
  })
})
