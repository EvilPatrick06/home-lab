import { randomUUID } from 'node:crypto'
import { access, mkdir, readdir, readFile, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { isValidUUID } from '../../shared/utils/uuid'
import { atomicWriteFile } from './atomic-write'
import type { StorageResult } from './types'

let homebrewDirReady: Promise<string> | null = null

function getHomebrewDir(): Promise<string> {
  if (!homebrewDirReady) {
    homebrewDirReady = (async () => {
      const dir = join(app.getPath('userData'), 'homebrew')
      await mkdir(dir, { recursive: true })
      return dir
    })()
  }
  return homebrewDirReady
}

async function getCategoryDir(category: string): Promise<string> {
  const base = await getHomebrewDir()
  const dir = join(base, category)
  await mkdir(dir, { recursive: true })
  return dir
}

/**
 * How an id collision (file already exists with a *different* name) is resolved.
 * Phase 25a Step 3 — the import UI passes an explicit choice; everything else
 * keeps the historical `'auto'` behaviour (silently assign a fresh id, i.e. copy).
 *  - `'auto'`    : different-name collision → assign a new id (default, back-compat)
 *  - `'copy'`    : always assign a new id, even for a same-name collision
 *  - `'replace'` : overwrite the existing file, keeping the incoming id
 */
export type HomebrewConflictMode = 'auto' | 'copy' | 'replace'

export async function saveHomebrewEntry(entry: Record<string, unknown>): Promise<StorageResult<void>> {
  try {
    let id = entry.id as string
    const type = entry.type as string
    const conflictMode = (entry.__conflictMode as HomebrewConflictMode | undefined) ?? 'auto'
    if (entry.__conflictMode !== undefined) {
      // Strip the transient hint so it never lands on disk.
      const { __conflictMode: _drop, ...rest } = entry
      entry = rest
    }
    if (!id || !type) {
      return { success: false, error: 'Entry must have id and type' }
    }
    if (!isValidUUID(id)) {
      return { success: false, error: 'Invalid entry ID' }
    }
    const dir = await getCategoryDir(type)
    const path = join(dir, `${id}.json`)

    if (conflictMode === 'copy') {
      // Caller explicitly wants a duplicate — always a fresh id.
      id = randomUUID()
      entry = { ...entry, id }
    } else if (conflictMode === 'auto') {
      // Historical behaviour: only regenerate on a different-name collision.
      try {
        await access(path)
        const existing = JSON.parse(await readFile(path, 'utf-8'))
        if (existing.id === id && existing.name !== entry.name) {
          id = randomUUID()
          entry = { ...entry, id }
        }
        // Same name = intentional update, allow overwrite.
      } catch {
        // File doesn't exist — safe to write.
      }
    }
    // conflictMode === 'replace' → keep id, overwrite unconditionally.

    const writePath = join(dir, `${id}.json`)
    await atomicWriteFile(writePath, JSON.stringify(entry, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to save homebrew entry: ${(err as Error).message}` }
  }
}

export async function loadHomebrewEntries(category: string): Promise<StorageResult<Record<string, unknown>[]>> {
  try {
    const dir = await getCategoryDir(category)
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
    const results = await Promise.allSettled(
      files.map(async (f) => {
        const data = await readFile(join(dir, f), 'utf-8')
        return JSON.parse(data)
      })
    )
    const entries: Record<string, unknown>[] = []
    for (const r of results) {
      if (r.status === 'fulfilled') entries.push(r.value)
    }
    return { success: true, data: entries }
  } catch (err) {
    return { success: false, error: `Failed to load homebrew entries: ${(err as Error).message}` }
  }
}

export async function loadAllHomebrew(): Promise<StorageResult<Record<string, unknown>[]>> {
  try {
    const base = await getHomebrewDir()
    let allEntries: Record<string, unknown>[] = []
    const dirs = await readdir(base, { withFileTypes: true })
    for (const d of dirs) {
      if (!d.isDirectory()) continue
      const result = await loadHomebrewEntries(d.name)
      if (result.success && result.data) {
        allEntries = allEntries.concat(result.data)
      }
    }
    return { success: true, data: allEntries }
  } catch (err) {
    return { success: false, error: `Failed to load all homebrew: ${(err as Error).message}` }
  }
}

export async function deleteHomebrewEntry(category: string, id: string): Promise<StorageResult<boolean>> {
  if (!isValidUUID(id)) {
    return { success: false, error: 'Invalid entry ID' }
  }
  try {
    const dir = await getCategoryDir(category)
    const path = join(dir, `${id}.json`)
    await unlink(path)
    return { success: true, data: true }
  } catch (err) {
    return { success: false, error: `Failed to delete homebrew entry: ${(err as Error).message}` }
  }
}
