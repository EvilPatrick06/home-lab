/**
 * Cloud Sync Service — Google Drive backup via Rclone on BMO Pi
 *
 * Campaign data lives on THIS machine (under app userData), but the Google Drive
 * credentials live only on the Pi. So a backup tars the campaign's files, uploads
 * the archive to the Pi (`POST /api/rclone/backup`), and the Pi rclone-copies it
 * to `gdrive:DND-VTT-Backups/<id>/campaign.tar.gz`. Restore is the reverse: the Pi
 * streams the archive back (`GET /api/rclone/restore`) and we extract it into
 * userData. No credentials are ever stored in the VTT.
 *
 * (Earlier this passed the client's LOCAL file paths to the Pi's rclone — which
 * runs on the Pi and can't see this machine's filesystem — so backup never
 * actually worked. The Pi also had no /api/rclone routes at all. Both fixed: the
 * Pi grew the purpose-built routes and we now ship the bytes, not the paths.)
 */

import { createWriteStream, existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app } from 'electron'
import { create as tarCreate, extract as tarExtract } from 'tar'
import { getBmoAccessHeaders, getBmoBaseUrl } from './bmo-config'
import { logToFile } from './log'

// A reachability/status probe must fail FAST. Without a short ceiling, the
// "Check Status" button against an unreachable Pi (stale LAN IP, down tunnel)
// hung for the full OS TCP timeout — tens of seconds of a spinning button that
// read as a freeze. 8s covers tunnel + Cloudflare Access latency comfortably.
const STATUS_TIMEOUT_MS = 8_000
// Archive transfer (up/down) — generous; a campaign with map/audio assets over
// the upstream link can take a while, but still bounded so a hung tunnel fails.
const TRANSFER_TIMEOUT_MS = 180_000
// Ceiling for the campaign-list query (drives the restore picker). CLD-1 — 15s
// was too tight: the Pi's rclone list + Cloudflare-tunnel latency could exceed it
// (especially when a concurrent backup is mid-flight), so the first "List Backups"
// click intermittently failed "This operation was aborted" and only a retry
// succeeded. 30s gives enough headroom while still bounding a genuinely hung tunnel.
const LIST_TIMEOUT_MS = 30_000
// The BMO `/backup` route caps the upload at 512 MiB (BMO_MAX_BACKUP_SIZE). Catch
// it client-side with a clear message instead of a raw 413 after a long upload.
const MAX_BACKUP_BYTES = 512 * 1024 * 1024

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

/** A campaign's data files/dirs, RELATIVE to userData (the tar root). The Pi
 * stores the archive opaquely, so this client owns the layout on both ends. */
function campaignRelPaths(campaignId: string): string[] {
  return [
    join('campaigns', `${campaignId}.json`), // campaign config
    join('game-states', `${campaignId}.json`), // world state
    join('ai-conversations', `${campaignId}.json`), // AI chat history
    join('campaigns', campaignId) // campaign assets subfolder
  ]
}

/**
 * Check if the Rclone remote is reachable and configured (drives "Check Status").
 */
export async function checkRemoteStatus(): Promise<RcloneStatus> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS)
  try {
    const res = await fetch(`${getBmoBaseUrl()}/api/rclone/status`, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...getBmoAccessHeaders() }
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
    const reason =
      err instanceof Error && err.name === 'AbortError'
        ? `Pi did not respond within ${STATUS_TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : String(err)
    logToFile('ERROR', 'Failed to check rclone remote status:', reason)
    return {
      configured: false,
      remotes: [],
      error: reason
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Back up a campaign: tar its files → upload the archive to the Pi → the Pi
 * rclone-copies it to Google Drive. One-way (local → remote).
 */
export async function syncCampaignToDrive(campaignId: string, campaignName: string): Promise<CloudSyncResult> {
  logToFile('INFO', `Starting cloud backup for campaign: ${campaignName} (${campaignId})`)
  let tmpDir: string | null = null
  try {
    const status = await checkRemoteStatus()
    if (!status.configured) {
      return { success: false, error: `Cloud backup not configured on the Pi: ${status.error || 'unknown'}` }
    }

    const userData = app.getPath('userData')
    // Only archive paths that actually exist (a fresh campaign may have no
    // assets dir / no AI history yet — tar errors on missing entries).
    const present = campaignRelPaths(campaignId).filter((rel) => existsSync(join(userData, rel)))
    if (present.length === 0) {
      return { success: false, error: 'Nothing to back up — this campaign has no saved data yet.' }
    }

    tmpDir = await mkdtemp(join(tmpdir(), 'vtt-backup-'))
    const archivePath = join(tmpDir, 'campaign.tar.gz')
    await tarCreate({ gzip: true, file: archivePath, cwd: userData }, present)
    const { size } = await stat(archivePath)
    if (size > MAX_BACKUP_BYTES) {
      const mb = (n: number): number => Math.round(n / (1024 * 1024))
      return {
        success: false,
        error: `This campaign's backup is ${mb(size)} MB — larger than the ${mb(MAX_BACKUP_BYTES)} MB cloud-backup limit. Trim large map/audio assets, or back it up locally (Export).`
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TRANSFER_TIMEOUT_MS)
    try {
      const buf = await readFile(archivePath)
      const form = new FormData()
      form.append('campaign_id', campaignId)
      // A Blob from the buffer — fetch sets the multipart boundary itself, so we
      // deliberately do NOT set Content-Type here.
      form.append('archive', new Blob([buf], { type: 'application/gzip' }), 'campaign.tar.gz')
      const res = await fetch(`${getBmoBaseUrl()}/api/rclone/backup`, {
        method: 'POST',
        signal: controller.signal,
        headers: { ...getBmoAccessHeaders() },
        body: form
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        return { success: false, error: `Upload failed (HTTP ${res.status}): ${detail || res.statusText}` }
      }
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; bytes?: number }
      if (!body.ok) {
        return { success: false, error: body.error || 'Pi rejected the backup' }
      }
      logToFile('INFO', `Cloud backup completed for ${campaignName} (${size} bytes)`)
      return {
        success: true,
        message: `Campaign "${campaignName}" backed up to Google Drive`,
        details: { bytes: body.bytes ?? size }
      }
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'AbortError'
        ? `Upload timed out after ${TRANSFER_TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : String(err)
    logToFile('ERROR', 'Cloud backup error:', reason)
    return { success: false, error: reason }
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/**
 * Restore a campaign FROM Google Drive: the Pi streams the archive back and we
 * extract it into userData (overwrites the local campaign files). Destructive —
 * callers should confirm with the user first.
 */
export async function restoreCampaignFromDrive(campaignId: string): Promise<CloudSyncResult> {
  logToFile('INFO', `Starting cloud restore for campaign: ${campaignId}`)
  let tmpDir: string | null = null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TRANSFER_TIMEOUT_MS)
    try {
      const res = await fetch(`${getBmoBaseUrl()}/api/rclone/restore?campaignId=${encodeURIComponent(campaignId)}`, {
        method: 'GET',
        signal: controller.signal,
        headers: { ...getBmoAccessHeaders() }
      })
      if (res.status === 404) {
        return { success: false, error: 'No backup found for this campaign on Google Drive.' }
      }
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => '')
        return { success: false, error: `Restore failed (HTTP ${res.status}): ${detail || res.statusText}` }
      }

      const userData = app.getPath('userData')
      tmpDir = await mkdtemp(join(tmpdir(), 'vtt-restore-'))
      const archivePath = join(tmpDir, 'campaign.tar.gz')
      // Stream the response to disk (bounded memory) before extracting.
      await pipeline(
        Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]),
        createWriteStream(archivePath)
      )
      // tar defaults strip leading "/" and ".." segments, so extraction is
      // jailed to userData even though the archive is our own.
      await tarExtract({ file: archivePath, cwd: userData })
      logToFile('INFO', `Cloud restore completed for ${campaignId}`)
      return { success: true, message: 'Campaign restored from Google Drive', details: { campaignId } }
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'AbortError'
        ? `Restore timed out after ${TRANSFER_TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : String(err)
    logToFile('ERROR', 'Cloud restore error:', reason)
    return { success: false, error: reason }
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined)
  }
}

/** Fetch the list of campaigns that have a backup on the remote. */
async function fetchRemoteList(): Promise<Array<{ id: string; size: number; modified?: string }>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LIST_TIMEOUT_MS)
  try {
    const res = await fetch(`${getBmoBaseUrl()}/api/rclone/list`, {
      method: 'GET',
      signal: controller.signal,
      headers: { ...getBmoAccessHeaders() }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as {
      ok?: boolean
      campaigns?: Array<{ id: string; size: number; modified?: string }>
      error?: string
    }
    if (!body.ok) throw new Error(body.error || 'Pi returned an error')
    return body.campaigns ?? []
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Check whether a campaign has a backup on Drive (drives the per-campaign
 * "last backed up" hint).
 */
export async function checkCampaignSyncStatus(
  campaignId: string
): Promise<CloudSyncResult & { hasRemoteData?: boolean; lastSync?: string }> {
  try {
    const campaigns = await fetchRemoteList()
    const match = campaigns.find((c) => c.id === campaignId)
    return {
      success: true,
      hasRemoteData: Boolean(match),
      lastSync: match?.modified,
      message: match ? 'Backup found on Google Drive' : 'No backup found on Google Drive'
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * List all campaigns backed up to Google Drive (for the restore picker).
 */
export async function listRemoteCampaigns(): Promise<
  CloudSyncResult & { campaigns?: Array<{ id: string; name: string; modified?: string }> }
> {
  try {
    const remote = await fetchRemoteList()
    const campaigns = remote.map((c) => ({ id: c.id, name: c.id, modified: c.modified }))
    return {
      success: true,
      campaigns,
      message: `Found ${campaigns.length} backed-up campaign${campaigns.length === 1 ? '' : 's'}`
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
