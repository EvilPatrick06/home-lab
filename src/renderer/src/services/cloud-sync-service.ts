/**
 * Cloud Sync Service — Google Drive backup via Rclone on BMO Pi
 *
 * Provides renderer-side interface to the cloud sync functionality.
 * All credential handling is delegated to the Pi.
 */

import { addToast } from '../hooks/use-toast'
import { logger } from '../utils/logger'

export interface CloudSyncStatus {
  success: boolean
  configured: boolean
  remotes: string[]
  version?: string
  error?: string
}

export interface CloudBackupResult {
  success: boolean
  message?: string
  error?: string
  campaignId: string
  campaignName: string
}

export interface CampaignSyncStatus {
  success: boolean
  campaignId: string
  hasRemoteData?: boolean
  lastSync?: string
  message?: string
  error?: string
}

export interface RemoteCampaign {
  id: string
  name: string
}

export interface RemoteCampaignsResult {
  success: boolean
  campaigns?: RemoteCampaign[]
  message?: string
  error?: string
}

/**
 * Check if the Rclone remote is configured and reachable on the Pi
 */
export async function checkCloudSyncStatus(): Promise<CloudSyncStatus> {
  try {
    const result = await window.api.cloudSync.getStatus()
    return {
      success: result.success,
      configured: result.configured,
      remotes: result.remotes || [],
      version: result.version,
      error: result.error
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('[CloudSync] Failed to check status:', errorMsg)
    return {
      success: false,
      configured: false,
      remotes: [],
      error: errorMsg
    }
  }
}

/**
 * Backup a campaign to Google Drive
 * Triggers rclone copy on the Pi to sync local campaign data to gdrive: remote
 */
export async function backupCampaignToCloud(
  campaignId: string,
  campaignName: string,
  { showToast = true }: { showToast?: boolean } = {}
): Promise<CloudBackupResult> {
  logger.info(`[CloudSync] Starting backup for campaign: ${campaignName}`)

  try {
    const result = await window.api.cloudSync.backupCampaign(campaignId, campaignName)

    if (result.success) {
      logger.info('[CloudSync] Backup successful:', result.message)
      if (showToast) {
        addToast(`Backed up "${campaignName}" to Google Drive`, 'success', 5000)
      }
    } else {
      logger.error('[CloudSync] Backup failed:', result.error)
      if (showToast) {
        addToast(`Backup failed: ${result.error || 'Unknown error'}`, 'error', 6000)
      }
    }

    return {
      success: result.success,
      message: result.message,
      error: result.error,
      campaignId: result.campaignId,
      campaignName: result.campaignName
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('[CloudSync] Backup error:', errorMsg)
    if (showToast) {
      addToast(`Backup error: ${errorMsg}`, 'error', 6000)
    }
    return {
      success: false,
      error: errorMsg,
      campaignId,
      campaignName
    }
  }
}

/**
 * Check the sync status of a specific campaign
 * Returns information about whether the campaign exists on the remote
 */
export async function checkCampaignCloudStatus(campaignId: string): Promise<CampaignSyncStatus> {
  try {
    const result = await window.api.cloudSync.checkCampaignStatus(campaignId)
    return {
      success: result.success,
      campaignId: result.campaignId,
      hasRemoteData: result.hasRemoteData,
      lastSync: result.lastSync,
      message: result.message,
      error: result.error
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('[CloudSync] Failed to check campaign status:', errorMsg)
    return {
      success: false,
      campaignId,
      error: errorMsg
    }
  }
}

/**
 * List all campaigns that have been backed up to Google Drive
 */
export async function listCloudCampaigns(): Promise<RemoteCampaignsResult> {
  try {
    const result = await window.api.cloudSync.listRemoteCampaigns()
    return {
      success: result.success,
      campaigns: result.campaigns,
      message: result.message,
      error: result.error
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logger.error('[CloudSync] Failed to list remote campaigns:', errorMsg)
    return {
      success: false,
      error: errorMsg
    }
  }
}

/**
 * Quick check if cloud sync is available (for UI indicators)
 */
export async function isCloudSyncAvailable(): Promise<boolean> {
  const status = await checkCloudSyncStatus()
  return status.success && status.configured
}
