import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { StorageResult } from './types'

const MAP_ID_RE = /^[a-zA-Z0-9_-]+$/

let mapLibDirReady: Promise<string> | null = null

function getMapLibraryDir(): Promise<string> {
  if (!mapLibDirReady) {
    mapLibDirReady = (async () => {
      const dir = join(app.getPath('userData'), 'map-library')
      await mkdir(dir, { recursive: true })
      return dir
    })()
  }
  return mapLibDirReady
}

function isValidMapId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && MAP_ID_RE.test(id)
}

export interface MapLibraryEntry {
  id: string
  name: string
  /** Map data stored as JSON */
  data: Record<string, unknown>
  savedAt: string
}

/**
 * Save a map to the map library.
 */
export async function saveMapToLibrary(
  id: string,
  name: string,
  data: Record<string, unknown>
): Promise<StorageResult<void>> {
  if (!isValidMapId(id)) {
    return { success: false, error: 'Invalid map ID' }
  }
  if (!name || typeof name !== 'string') {
    return { success: false, error: 'Invalid map name' }
  }
  try {
    const dir = await getMapLibraryDir()
    const entry: MapLibraryEntry = {
      id,
      name,
      data,
      savedAt: new Date().toISOString()
    }
    await writeFile(join(dir, `${id}.json`), JSON.stringify(entry, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to save map: ${(err as Error).message}` }
  }
}

/**
 * List all saved maps in the library. Returns summary (id, name, savedAt) without full data.
 */
export async function listMapLibrary(): Promise<StorageResult<Array<{ id: string; name: string; savedAt: string }>>> {
  try {
    const dir = await getMapLibraryDir()
    const files = await readdir(dir)
    const entries: Array<{ id: string; name: string; savedAt: string }> = []

    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const content = await readFile(join(dir, file), 'utf-8')
        const parsed = JSON.parse(content) as MapLibraryEntry
        entries.push({
          id: parsed.id,
          name: parsed.name,
          savedAt: parsed.savedAt
        })
      } catch {
        // Skip corrupted files
      }
    }

    return { success: true, data: entries }
  } catch (err) {
    return { success: false, error: `Failed to list maps: ${(err as Error).message}` }
  }
}

/**
 * Get a specific map from the library by ID.
 */
export async function getMapFromLibrary(id: string): Promise<StorageResult<MapLibraryEntry>> {
  if (!isValidMapId(id)) {
    return { success: false, error: 'Invalid map ID' }
  }
  try {
    const dir = await getMapLibraryDir()
    const content = await readFile(join(dir, `${id}.json`), 'utf-8')
    const entry = JSON.parse(content) as MapLibraryEntry
    return { success: true, data: entry }
  } catch (err) {
    return { success: false, error: `Failed to load map: ${(err as Error).message}` }
  }
}

/**
 * Delete a map from the library.
 */
export async function deleteMapFromLibrary(id: string): Promise<StorageResult<void>> {
  if (!isValidMapId(id)) {
    return { success: false, error: 'Invalid map ID' }
  }
  try {
    const dir = await getMapLibraryDir()
    await unlink(join(dir, `${id}.json`))
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to delete map: ${(err as Error).message}` }
  }
}
