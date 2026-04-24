import { access, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { isValidUUID } from '../../shared/utils/uuid'
import { logToFile } from '../log'
import { CURRENT_SCHEMA_VERSION, migrateData } from './migrations'
import type { StorageResult } from './types'

let bastionsDirReady: Promise<string> | null = null

function getBastionsDir(): Promise<string> {
  if (!bastionsDirReady) {
    bastionsDirReady = (async () => {
      const dir = join(app.getPath('userData'), 'bastions')
      await mkdir(dir, { recursive: true })
      return dir
    })()
  }
  return bastionsDirReady
}

async function getBastionPath(id: string): Promise<string> {
  const dir = await getBastionsDir()
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

export async function saveBastion(bastion: Record<string, unknown>): Promise<StorageResult<void>> {
  try {
    const id = bastion.id as string
    if (!id) {
      return { success: false, error: 'Bastion must have an id' }
    }
    if (!isValidUUID(id)) {
      return { success: false, error: 'Invalid bastion ID' }
    }
    bastion.schemaVersion = CURRENT_SCHEMA_VERSION
    const path = await getBastionPath(id)
    await writeFile(path, JSON.stringify(bastion, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to save bastion: ${(err as Error).message}` }
  }
}

export async function loadBastions(): Promise<StorageResult<Record<string, unknown>[]>> {
  try {
    const dir = await getBastionsDir()
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
    const results = await Promise.allSettled(
      files.map(async (f) => {
        const data = await readFile(join(dir, f), 'utf-8')
        return JSON.parse(data)
      })
    )
    const bastions: Record<string, unknown>[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') {
        bastions.push(r.value)
      } else {
        logToFile('ERROR', 'Failed to load a bastion file:', String(r.reason))
      }
    }
    return { success: true, data: bastions }
  } catch (err) {
    return { success: false, error: `Failed to load bastions: ${(err as Error).message}` }
  }
}

export async function loadBastion(id: string): Promise<StorageResult<Record<string, unknown> | null>> {
  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid bastion ID' }
  }
  try {
    const path = await getBastionPath(id)
    if (!(await fileExists(path))) {
      return { success: true, data: null }
    }
    const data = await readFile(path, 'utf-8')
    return { success: true, data: migrateData(JSON.parse(data)) }
  } catch (err) {
    return { success: false, error: `Failed to load bastion: ${(err as Error).message}` }
  }
}

export async function deleteBastion(id: string): Promise<StorageResult<boolean>> {
  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid bastion ID' }
  }
  try {
    const path = await getBastionPath(id)
    if (!(await fileExists(path))) {
      return { success: true, data: false }
    }
    await unlink(path)
    return { success: true, data: true }
  } catch (err) {
    return { success: false, error: `Failed to delete bastion: ${(err as Error).message}` }
  }
}
