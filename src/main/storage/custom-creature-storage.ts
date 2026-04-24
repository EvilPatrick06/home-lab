import { access, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { isValidUUID } from '../../shared/utils/uuid'
import { logToFile } from '../log'
import type { StorageResult } from './types'

let creaturesDirReady: Promise<string> | null = null

function getCreaturesDir(): Promise<string> {
  if (!creaturesDirReady) {
    creaturesDirReady = (async () => {
      const dir = join(app.getPath('userData'), 'custom-creatures')
      await mkdir(dir, { recursive: true })
      return dir
    })()
  }
  return creaturesDirReady
}

async function getCreaturePath(id: string): Promise<string> {
  const dir = await getCreaturesDir()
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

export async function saveCustomCreature(creature: Record<string, unknown>): Promise<StorageResult<void>> {
  try {
    const id = creature.id as string
    if (!id) {
      return { success: false, error: 'Creature must have an id' }
    }
    if (!isValidUUID(id)) {
      return { success: false, error: 'Invalid creature ID' }
    }
    const path = await getCreaturePath(id)
    await writeFile(path, JSON.stringify(creature, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to save creature: ${(err as Error).message}` }
  }
}

export async function loadCustomCreatures(): Promise<StorageResult<Record<string, unknown>[]>> {
  try {
    const dir = await getCreaturesDir()
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
    const results = await Promise.allSettled(
      files.map(async (f) => {
        const data = await readFile(join(dir, f), 'utf-8')
        return JSON.parse(data)
      })
    )
    const creatures: Record<string, unknown>[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') {
        creatures.push(r.value)
      } else {
        logToFile('ERROR', 'Failed to load a custom creature file:', String(r.reason))
      }
    }
    return { success: true, data: creatures }
  } catch (err) {
    return { success: false, error: `Failed to load custom creatures: ${(err as Error).message}` }
  }
}

export async function loadCustomCreature(id: string): Promise<StorageResult<Record<string, unknown> | null>> {
  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid creature ID' }
  }
  try {
    const path = await getCreaturePath(id)
    if (!(await fileExists(path))) {
      return { success: true, data: null }
    }
    const data = await readFile(path, 'utf-8')
    return { success: true, data: JSON.parse(data) }
  } catch (err) {
    return { success: false, error: `Failed to load creature: ${(err as Error).message}` }
  }
}

export async function deleteCustomCreature(id: string): Promise<StorageResult<boolean>> {
  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid creature ID' }
  }
  try {
    const path = await getCreaturePath(id)
    if (!(await fileExists(path))) {
      return { success: true, data: false }
    }
    await unlink(path)
    return { success: true, data: true }
  } catch (err) {
    return { success: false, error: `Failed to delete creature: ${(err as Error).message}` }
  }
}
