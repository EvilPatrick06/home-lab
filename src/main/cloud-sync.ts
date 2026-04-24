/**
 * Cloud Sync Service — Google Drive backup via Rclone on BMO Pi
 *
 * This module provides secure cloud backup functionality by executing
 * rclone commands on the Raspberry Pi host via the BMO bridge.
 * No credentials are stored in the VTT; all rclone configuration
 * resides on the Pi in the patrick@bmo shell environment.
 */

import { join } from 'node:path'
import { app } from 'electron'
import { logToFile } from './log'

const BMO_BASE_URL = process.env.BMO_PI_URL || 'http://bmo.local:5000'
const TIMEOUT_MS = 60_000 // 60 second timeout for sync operations

export interface CloudSyncResult {
  success: boolean
  message?: string
  error?: string
  details?: Record<string, unknown>
}

export interface RcloneStatus {
  configured: boolean
  remotes: string[]
  version?: string
  error?: string
}

interface BridgeResponse {
  ok?: boolean
  error?: string
  [key: string]: unknown
}

/**
 * Execute rclone command via BMO Pi bridge
 * All rclone commands run on the Pi with the patrick@bmo user context
 */
async function executeRcloneCommand(
  command: 'sync' | 'copy' | 'check' | 'ls' | 'version',
  args: string[]
): Promise<BridgeResponse> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${BMO_BASE_URL}/api/rclone/execute`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        command,
        args,
        timeout: TIMEOUT_MS
      })
    })

    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP ${res.status}: ${res.statusText}`
      }
    }

    return await res.json()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        ok: false,
        error: 'Rclone command timed out after 60 seconds'
      }
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err)
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Check if the Rclone remote is reachable and configured
 */
export async function checkRemoteStatus(): Promise<RcloneStatus> {
  try {
    const res = await fetch(`${BMO_BASE_URL}/api/rclone/status`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    })

    if (!res.ok) {
      return {
        configured: false,
        remotes: [],
        error: `HTTP ${res.status}: ${res.statusText}`
      }
    }

    const data = await res.json()
    return {
      configured: data.configured ?? false,
      remotes: data.remotes ?? [],
      version: data.version,
      error: data.error
    }
  } catch (err) {
    logToFile('ERROR', 'Failed to check rclone remote status:', String(err))
    return {
      configured: false,
      remotes: [],
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

/**
 * Get all campaign-related paths that need to be synced
 */
function getCampaignSyncPaths(campaignId: string): {
  sourcePaths: string[]
  remoteFolder: string
} {
  const userData = app.getPath('userData')

  // Primary campaign data files and folders
  const sourcePaths = [
    join(userData, 'campaigns', `${campaignId}.json`), // Campaign config
    join(userData, 'game-states', `${campaignId}.json`), // World state
    join(userData, 'ai-conversations', `${campaignId}.json`), // AI chat history
    join(userData, 'campaigns', campaignId) // Campaign assets subfolder
  ]

  // Remote folder structure: DND-VTT-Backups/{campaignId}/
  const remoteFolder = `DND-VTT-Backups/${campaignId}`

  return { sourcePaths, remoteFolder }
}

/**
 * Sync a campaign to Google Drive using rclone sync
 * This is a one-way sync (local → remote) that backs up all campaign data
 */
export async function syncCampaignToDrive(campaignId: string, campaignName: string): Promise<CloudSyncResult> {
  logToFile('INFO', `Starting cloud sync for campaign: ${campaignName} (${campaignId})`)

  try {
    // First check if remote is available
    const status = await checkRemoteStatus()
    if (!status.configured) {
      return {
        success: false,
        error: `Rclone not configured on Pi: ${status.error || 'Unknown error'}`
      }
    }

    const { sourcePaths, remoteFolder } = getCampaignSyncPaths(campaignId)

    // Use rclone copy (safer than sync - won't delete remote files)
    // Target: gdrive:DND-VTT-Backups/{campaignId}/
    const result = await executeRcloneCommand('copy', [
      '--transfers',
      '4',
      '--checkers',
      '8',
      '--stats',
      '1s',
      '--stats-one-line',
      '--include',
      '*.json',
      '--include',
      '*.png',
      '--include',
      '*.jpg',
      '--include',
      '*.jpeg',
      '--include',
      '*.webp',
      '--include',
      '*.mp3',
      '--include',
      '*.wav',
      '--include',
      '*.ogg',
      '--exclude',
      '*.tmp',
      '--exclude',
      '.cache/**',
      ...sourcePaths,
      `gdrive:${remoteFolder}`
    ])

    if (!result.ok) {
      logToFile('ERROR', 'Rclone sync failed:', result.error || 'Unknown error')
      return {
        success: false,
        error: result.error || 'Rclone command failed',
        details: result
      }
    }

    logToFile('INFO', `Cloud sync completed for campaign: ${campaignName}`)
    return {
      success: true,
      message: `Campaign "${campaignName}" backed up to Google Drive`,
      details: result
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    logToFile('ERROR', 'Cloud sync error:', errorMsg)
    return {
      success: false,
      error: errorMsg
    }
  }
}

/**
 * Check the sync status of a campaign
 * Compares local files with remote to show what's out of sync
 */
export async function checkCampaignSyncStatus(
  campaignId: string
): Promise<CloudSyncResult & { hasRemoteData?: boolean; lastSync?: string }> {
  try {
    const status = await checkRemoteStatus()
    if (!status.configured) {
      return {
        success: false,
        error: `Rclone not configured: ${status.error || 'Unknown error'}`
      }
    }

    const { remoteFolder } = getCampaignSyncPaths(campaignId)

    // List remote files to check if campaign exists
    const listResult = await executeRcloneCommand('ls', [`gdrive:${remoteFolder}`])

    if (!listResult.ok) {
      // Campaign folder doesn't exist on remote yet
      return {
        success: true,
        hasRemoteData: false,
        message: 'No backup found on Google Drive'
      }
    }

    // Parse the ls output to get file info
    const files = (listResult.files as Array<{ name: string; size: number; modTime: string }>) || []

    // Find the most recent modification time
    let lastSync: string | undefined
    if (files.length > 0) {
      const sorted = files
        .filter((f) => f.modTime)
        .sort((a, b) => new Date(b.modTime).getTime() - new Date(a.modTime).getTime())
      if (sorted[0]) {
        lastSync = sorted[0].modTime
      }
    }

    return {
      success: true,
      hasRemoteData: files.length > 0,
      lastSync,
      message: files.length > 0 ? `Backup found with ${files.length} files` : 'Empty backup folder exists'
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      error: errorMsg
    }
  }
}

/**
 * Get a list of all campaigns backed up to Google Drive
 */
export async function listRemoteCampaigns(): Promise<
  CloudSyncResult & { campaigns?: Array<{ id: string; name: string }> }
> {
  try {
    const status = await checkRemoteStatus()
    if (!status.configured) {
      return {
        success: false,
        error: `Rclone not configured: ${status.error || 'Unknown error'}`
      }
    }

    const listResult = await executeRcloneCommand('ls', ['gdrive:DND-VTT-Backups'])

    if (!listResult.ok) {
      // No backups folder yet
      return {
        success: true,
        campaigns: [],
        message: 'No backups folder found on Google Drive'
      }
    }

    const items = (listResult.items as Array<{ name: string; isDir: boolean }>) || []
    const campaignFolders = items
      .filter((item) => item.isDir)
      .map((item) => ({
        id: item.name,
        name: item.name // We could enhance this to read a metadata file
      }))

    return {
      success: true,
      campaigns: campaignFolders,
      message: `Found ${campaignFolders.length} backed-up campaigns`
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    return {
      success: false,
      error: errorMsg
    }
  }
}
