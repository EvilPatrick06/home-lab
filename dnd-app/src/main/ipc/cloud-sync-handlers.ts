/**
 * Cloud Sync IPC Handlers
 *
 * Handles IPC requests for Google Drive backup via Rclone on BMO Pi.
 * All credential handling is delegated to the Pi; no credentials stored locally.
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { isValidUUID } from '../../shared/utils/uuid'
import {
  type CloudSyncResult,
  checkCampaignSyncStatus,
  checkRemoteStatus,
  listRemoteCampaigns,
  syncCampaignToDrive
} from '../cloud-sync'
import { logToFile } from '../log'

export interface CloudSyncStatusResult {
  success: boolean
  configured: boolean
  remotes: string[]
  version?: string
  error?: string
}

export interface CampaignBackupResult extends CloudSyncResult {
  campaignId: string
  campaignName: string
}

export function registerCloudSyncHandlers(): void {
  // Check Rclone remote status
  ipcMain.handle(IPC_CHANNELS.CLOUD_SYNC_STATUS, async (): Promise<CloudSyncStatusResult> => {
    try {
      const status = await checkRemoteStatus()
      return {
        success: true,
        configured: status.configured,
        remotes: status.remotes,
        version: status.version,
        error: status.error
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      logToFile('ERROR', 'Cloud sync status check failed:', errorMsg)
      return {
        success: false,
        configured: false,
        remotes: [],
        error: errorMsg
      }
    }
  })

  // Backup campaign to Google Drive
  ipcMain.handle(
    IPC_CHANNELS.CLOUD_SYNC_BACKUP,
    async (_event, campaignId: string, campaignName: string): Promise<CampaignBackupResult> => {
      // Validate campaign ID
      if (!isValidUUID(campaignId)) {
        return {
          success: false,
          error: 'Invalid campaign ID',
          campaignId,
          campaignName
        }
      }

      // Validate campaign name
      if (!campaignName || typeof campaignName !== 'string' || campaignName.trim().length === 0) {
        return {
          success: false,
          error: 'Invalid campaign name',
          campaignId,
          campaignName
        }
      }

      // Enforce reasonable name length
      if (campaignName.length > 100) {
        return {
          success: false,
          error: 'Campaign name too long (max 100 characters)',
          campaignId,
          campaignName
        }
      }

      try {
        logToFile('INFO', `IPC: Starting cloud backup for campaign ${campaignId}`)
        const result = await syncCampaignToDrive(campaignId, campaignName.trim())

        return {
          ...result,
          campaignId,
          campaignName
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        logToFile('ERROR', `Cloud backup failed for campaign ${campaignId}:`, errorMsg)
        return {
          success: false,
          error: errorMsg,
          campaignId,
          campaignName
        }
      }
    }
  )

  // Check sync status for a specific campaign
  ipcMain.handle(
    IPC_CHANNELS.CLOUD_SYNC_CHECK_STATUS,
    async (
      _event,
      campaignId: string
    ): Promise<CloudSyncResult & { campaignId: string; hasRemoteData?: boolean; lastSync?: string }> => {
      if (!isValidUUID(campaignId)) {
        return {
          success: false,
          error: 'Invalid campaign ID',
          campaignId
        }
      }

      try {
        const result = await checkCampaignSyncStatus(campaignId)
        return {
          ...result,
          campaignId
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        logToFile('ERROR', `Sync status check failed for campaign ${campaignId}:`, errorMsg)
        return {
          success: false,
          error: errorMsg,
          campaignId
        }
      }
    }
  )

  // List all campaigns backed up to remote
  ipcMain.handle(
    IPC_CHANNELS.CLOUD_SYNC_LIST_CAMPAIGNS,
    async (): Promise<CloudSyncResult & { campaigns?: Array<{ id: string; name: string }> }> => {
      try {
        return await listRemoteCampaigns()
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        logToFile('ERROR', 'Failed to list remote campaigns:', errorMsg)
        return {
          success: false,
          error: errorMsg
        }
      }
    }
  )

  logToFile('INFO', 'Cloud sync IPC handlers registered')
}
