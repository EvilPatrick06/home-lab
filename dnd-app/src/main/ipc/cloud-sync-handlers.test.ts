import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockHandle,
  mockCheckRemoteStatus,
  mockSyncCampaignToDrive,
  mockCheckCampaignSyncStatus,
  mockListRemoteCampaigns
} = vi.hoisted(() => ({
  mockHandle: vi.fn(),
  mockCheckRemoteStatus: vi.fn(),
  mockSyncCampaignToDrive: vi.fn(),
  mockCheckCampaignSyncStatus: vi.fn(),
  mockListRemoteCampaigns: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userdata') },
  ipcMain: { handle: mockHandle }
}))

vi.mock('../../shared/ipc-channels', () => ({
  IPC_CHANNELS: {
    CLOUD_SYNC_STATUS: 'cloud:sync-status',
    CLOUD_SYNC_BACKUP: 'cloud:sync-backup',
    CLOUD_SYNC_CHECK_STATUS: 'cloud:sync-check-campaign',
    CLOUD_SYNC_LIST_CAMPAIGNS: 'cloud:sync-list-campaigns'
  }
}))

vi.mock('../cloud-sync', () => ({
  checkRemoteStatus: mockCheckRemoteStatus,
  syncCampaignToDrive: mockSyncCampaignToDrive,
  checkCampaignSyncStatus: mockCheckCampaignSyncStatus,
  listRemoteCampaigns: mockListRemoteCampaigns
}))

vi.mock('../../shared/utils/uuid', () => ({
  isValidUUID: (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}))

vi.mock('../log', () => ({ logToFile: vi.fn() }))

import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { registerCloudSyncHandlers } from './cloud-sync-handlers'

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'

describe('cloud-sync-handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('registers all cloud sync IPC handlers', () => {
    registerCloudSyncHandlers()
    const channels = mockHandle.mock.calls.map((c) => c[0])
    expect(channels).toContain(IPC_CHANNELS.CLOUD_SYNC_STATUS)
    expect(channels).toContain(IPC_CHANNELS.CLOUD_SYNC_BACKUP)
    expect(channels).toContain(IPC_CHANNELS.CLOUD_SYNC_CHECK_STATUS)
    expect(channels).toContain(IPC_CHANNELS.CLOUD_SYNC_LIST_CAMPAIGNS)
  })

  describe('CLOUD_SYNC_STATUS handler', () => {
    it('returns success with status data', async () => {
      mockCheckRemoteStatus.mockResolvedValueOnce({ configured: true, remotes: ['gdrive'] })
      registerCloudSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.CLOUD_SYNC_STATUS)![1]
      const result = await handler()

      expect(result.success).toBe(true)
      expect(result.configured).toBe(true)
    })

    it('returns success:false when checkRemoteStatus throws', async () => {
      mockCheckRemoteStatus.mockRejectedValueOnce(new Error('Connection refused'))
      registerCloudSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.CLOUD_SYNC_STATUS)![1]
      const result = await handler()

      expect(result.success).toBe(false)
    })
  })

  describe('CLOUD_SYNC_BACKUP handler', () => {
    it('delegates to syncCampaignToDrive with valid inputs', async () => {
      mockSyncCampaignToDrive.mockResolvedValueOnce({ success: true, message: 'Backed up' })
      registerCloudSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.CLOUD_SYNC_BACKUP)![1]
      const result = await handler({}, VALID_UUID, 'My Campaign')

      expect(mockSyncCampaignToDrive).toHaveBeenCalledWith(VALID_UUID, 'My Campaign')
      expect(result.success).toBe(true)
    })

    it('rejects invalid UUID without calling service', async () => {
      registerCloudSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.CLOUD_SYNC_BACKUP)![1]
      const result = await handler({}, 'not-a-uuid', 'My Campaign')

      expect(mockSyncCampaignToDrive).not.toHaveBeenCalled()
      expect(result.success).toBe(false)
    })

    it('rejects empty campaign name', async () => {
      registerCloudSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.CLOUD_SYNC_BACKUP)![1]
      const result = await handler({}, VALID_UUID, '')

      expect(mockSyncCampaignToDrive).not.toHaveBeenCalled()
      expect(result.success).toBe(false)
    })

    it('rejects null campaign ID', async () => {
      registerCloudSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.CLOUD_SYNC_BACKUP)![1]
      const result = await handler({}, null, 'My Campaign')

      expect(mockSyncCampaignToDrive).not.toHaveBeenCalled()
      expect(result.success).toBe(false)
    })

    it('returns error when syncCampaignToDrive throws', async () => {
      mockSyncCampaignToDrive.mockRejectedValueOnce(new Error('Drive quota exceeded'))
      registerCloudSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.CLOUD_SYNC_BACKUP)![1]
      const result = await handler({}, VALID_UUID, 'My Campaign')

      expect(result.success).toBe(false)
    })
  })

  describe('CLOUD_SYNC_CHECK_STATUS handler', () => {
    it('delegates to checkCampaignSyncStatus with valid UUID', async () => {
      mockCheckCampaignSyncStatus.mockResolvedValueOnce({ success: true, hasRemoteData: true })
      registerCloudSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.CLOUD_SYNC_CHECK_STATUS)![1]
      const result = await handler({}, VALID_UUID)

      expect(mockCheckCampaignSyncStatus).toHaveBeenCalledWith(VALID_UUID)
      expect(result.success).toBe(true)
    })

    it('rejects invalid UUID', async () => {
      registerCloudSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.CLOUD_SYNC_CHECK_STATUS)![1]
      const result = await handler({}, 'bad-id')

      expect(mockCheckCampaignSyncStatus).not.toHaveBeenCalled()
      expect(result.success).toBe(false)
    })
  })

  describe('CLOUD_SYNC_LIST_CAMPAIGNS handler', () => {
    it('delegates to listRemoteCampaigns and returns list', async () => {
      mockListRemoteCampaigns.mockResolvedValueOnce({ success: true, campaigns: [] })
      registerCloudSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.CLOUD_SYNC_LIST_CAMPAIGNS)![1]
      const result = await handler()

      expect(mockListRemoteCampaigns).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('returns error when listRemoteCampaigns throws', async () => {
      mockListRemoteCampaigns.mockRejectedValueOnce(new Error('Pi offline'))
      registerCloudSyncHandlers()

      const handler = mockHandle.mock.calls.find((c) => c[0] === IPC_CHANNELS.CLOUD_SYNC_LIST_CAMPAIGNS)![1]
      const result = await handler()

      expect(result.success).toBe(false)
    })
  })
})
