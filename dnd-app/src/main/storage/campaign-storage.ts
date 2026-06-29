import { access, copyFile, mkdir, readdir, readFile, rm, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { isValidUUID } from '../../shared/utils/uuid'
import { logToFile } from '../log'
import { atomicWriteFile } from './atomic-write'
import { CURRENT_SCHEMA_VERSION, migrateData } from './migrations'
import { withSaveLock } from './save-queue'
import type { StorageResult } from './types'

let campaignsDirReady: Promise<string> | null = null

function getCampaignsDir(): Promise<string> {
  if (!campaignsDirReady) {
    campaignsDirReady = (async () => {
      const dir = join(app.getPath('userData'), 'campaigns')
      await mkdir(dir, { recursive: true })
      return dir
    })()
  }
  return campaignsDirReady
}

async function getCampaignPath(id: string): Promise<string> {
  const dir = await getCampaignsDir()
  return join(dir, `${id}.json`)
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function saveCampaign(campaign: Record<string, unknown>): Promise<StorageResult<void>> {
  const id = campaign.id as string
  if (!id) {
    return { success: false, error: 'Campaign must have an id' }
  }
  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid campaign ID' }
  }

  // Serialize concurrent same-id saves so the read → backup → write sequence
  // is atomic per id.
  return withSaveLock('campaign', id, async () => {
    try {
      campaign.schemaVersion = CURRENT_SCHEMA_VERSION
      const path = await getCampaignPath(id)

      // Create versioned backup of existing file before overwriting
      if (await fileExists(path)) {
        try {
          const dir = await getCampaignsDir()
          const versionsDir = join(dir, '.versions', id)
          await mkdir(versionsDir, { recursive: true })
          const ts = new Date().toISOString().replace(/[:.]/g, '-')
          const bakPath = join(versionsDir, `${id}_${ts}.json`)
          await copyFile(path, bakPath)

          // Prune old versions, keep latest 20
          const allVersions = (await readdir(versionsDir)).filter((f) => f.endsWith('.json')).sort()
          if (allVersions.length > 20) {
            const toDelete = allVersions.slice(0, allVersions.length - 20)
            await Promise.allSettled(toDelete.map((f) => unlink(join(versionsDir, f))))
          }
        } catch (err) {
          // Non-fatal: versioning failure shouldn't block saving — log breadcrumb
          logToFile('WARN', `[campaign-storage] version backup failed for ${id}:`, String(err))
        }
      }

      await atomicWriteFile(path, JSON.stringify(campaign, null, 2))
      return { success: true }
    } catch (err) {
      return { success: false, error: `Failed to save campaign: ${(err as Error).message}` }
    }
  })
}

export async function loadCampaigns(): Promise<StorageResult<Record<string, unknown>[]>> {
  try {
    const dir = await getCampaignsDir()
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
    const results = await Promise.allSettled(
      files.map(async (f) => {
        const data = await readFile(join(dir, f), 'utf-8')
        return migrateData(JSON.parse(data))
      })
    )
    const campaigns: Record<string, unknown>[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') {
        campaigns.push(r.value)
      } else {
        logToFile('ERROR', 'Failed to load a campaign file:', String(r.reason))
      }
    }
    return { success: true, data: campaigns }
  } catch (err) {
    return { success: false, error: `Failed to load campaigns: ${(err as Error).message}` }
  }
}

export async function loadCampaign(id: string): Promise<StorageResult<Record<string, unknown> | null>> {
  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid campaign ID' }
  }
  try {
    const path = await getCampaignPath(id)
    if (!(await fileExists(path))) {
      return { success: true, data: null }
    }
    const data = await readFile(path, 'utf-8')
    return { success: true, data: migrateData(JSON.parse(data)) }
  } catch (err) {
    return { success: false, error: `Failed to load campaign: ${(err as Error).message}` }
  }
}

export async function deleteCampaign(id: string): Promise<StorageResult<boolean>> {
  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid campaign ID' }
  }
  try {
    const path = await getCampaignPath(id)
    if (!(await fileExists(path))) {
      return { success: true, data: false }
    }
    await unlink(path)

    // Cascade: remove all associated data
    const userData = app.getPath('userData')
    const cascadePaths = [
      join(userData, 'campaigns', id), // custom-audio, ai-context subdirs
      join(userData, 'game-states', `${id}.json`),
      join(userData, 'ai-conversations', `${id}.json`),
      join(userData, 'bans', `${id}.json`)
    ]
    for (const p of cascadePaths) {
      await rm(p, { recursive: true, force: true }).catch(() => {})
    }

    // Phase 22d — also drop the in-memory ConversationManager so the map doesn't
    // grow monotonically and a re-created same-id campaign starts fresh. Dynamic
    // import avoids a static cycle (ai-service → campaign-context → campaign-storage).
    await import('../ai/ai-service').then((m) => m.removeConversation(id)).catch(() => {})

    logToFile('INFO', `Campaign deleted with cascade: ${id}`)
    return { success: true, data: true }
  } catch (err) {
    return { success: false, error: `Failed to delete campaign: ${(err as Error).message}` }
  }
}

// ---------------------------------------------------------------------------
// Version history (mirrors the character version API). The on-disk `.versions/`
// backups written by saveCampaign were previously write-only — no way to list
// or roll back to them. These expose them with the same path-traversal guard
// the character restore handler applies.
// ---------------------------------------------------------------------------

export interface CampaignVersion {
  fileName: string
  timestamp: string
  sizeBytes: number
}

export async function listCampaignVersions(id: string): Promise<StorageResult<CampaignVersion[]>> {
  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid campaign ID' }
  }
  try {
    const dir = await getCampaignsDir()
    const versionsDir = join(dir, '.versions', id)
    if (!(await fileExists(versionsDir))) {
      return { success: true, data: [] }
    }
    const files = (await readdir(versionsDir))
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
    const versions: CampaignVersion[] = []
    for (const f of files) {
      const fileStat = await stat(join(versionsDir, f))
      // Filename timestamp is UTC but the capture drops the trailing `Z`; re-append
      // it so the renderer parses as UTC (mirrors the character-storage CHR-2 fix).
      const tsMatch = f.match(/_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})/)
      const timestamp = tsMatch
        ? `${tsMatch[1].replace(/-/g, (m, offset: number) => (offset > 9 ? ':' : m))}Z`
        : fileStat.mtime.toISOString()
      versions.push({ fileName: f, timestamp, sizeBytes: fileStat.size })
    }
    return { success: true, data: versions }
  } catch (err) {
    return { success: false, error: `Failed to list versions: ${(err as Error).message}` }
  }
}

export async function restoreCampaignVersion(
  id: string,
  fileName: string
): Promise<StorageResult<Record<string, unknown>>> {
  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid campaign ID' }
  }
  if (!fileName.endsWith('.json') || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    return { success: false, error: 'Invalid version file name' }
  }
  try {
    const dir = await getCampaignsDir()
    const versionPath = join(dir, '.versions', id, fileName)
    if (!(await fileExists(versionPath))) {
      return { success: false, error: 'Version file not found' }
    }
    const data = await readFile(versionPath, 'utf-8')
    const parsed = migrateData(JSON.parse(data)) as Record<string, unknown>
    // Re-save as the current campaign (which creates its own backup of the state
    // being overwritten, so a restore is itself reversible).
    await saveCampaign(parsed)
    return { success: true, data: parsed }
  } catch (err) {
    return { success: false, error: `Failed to restore version: ${(err as Error).message}` }
  }
}
