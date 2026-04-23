import { access, copyFile, mkdir, readdir, readFile, rm, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { isValidUUID } from '../../shared/utils/uuid'
import { logToFile } from '../log'
import { atomicWriteFile } from './atomic-write'
import { CURRENT_SCHEMA_VERSION, migrateData } from './migrations'
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
  try {
    const id = campaign.id as string
    if (!id) {
      return { success: false, error: 'Campaign must have an id' }
    }
    if (!isValidUUID(id)) {
      return { success: false, error: 'Invalid campaign ID' }
    }
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
      } catch {
        // Non-fatal: versioning failure shouldn't block saving
      }
    }

    await atomicWriteFile(path, JSON.stringify(campaign, null, 2))
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to save campaign: ${(err as Error).message}` }
  }
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

    logToFile('INFO', `Campaign deleted with cascade: ${id}`)
    return { success: true, data: true }
  } catch (err) {
    return { success: false, error: `Failed to delete campaign: ${(err as Error).message}` }
  }
}
