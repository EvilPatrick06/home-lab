import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { logToFile } from '../log'
import type { StorageResult } from './types'

/**
 * Content directories under `userData` that hold user-generated save data.
 *
 * Reset All Data (Settings → last button) wipes all of these. Notably EXCLUDED:
 * `core_books` — the user's reference PDFs (PHB/DMG/MM) are large, manually
 * sourced, and read-only reference material, not save data. They survive a
 * reset; delete that folder by hand if you really want them gone.
 */
const WIPE_DIRS = [
  'characters',
  'campaigns',
  'bastions',
  'bans',
  'game-states',
  'ai-conversations',
  'homebrew',
  'custom-creatures',
  'image-library',
  'map-library',
  'shop-templates',
  'books'
] as const

/** Standalone files under `userData` that should also go. */
const WIPE_FILES = ['settings.json', 'book-config.json'] as const

/**
 * Delete every user-data content directory + standalone settings files under
 * `userData`. Idempotent — a missing path is treated as already-clean. Returns
 * the list of paths removed so the caller can log/confirm.
 */
export async function wipeAllData(): Promise<StorageResult<{ removed: string[] }>> {
  const userData = app.getPath('userData')
  const removed: string[] = []
  const errors: string[] = []

  for (const dir of WIPE_DIRS) {
    const target = join(userData, dir)
    try {
      await rm(target, { recursive: true, force: true })
      removed.push(dir)
    } catch (err) {
      errors.push(`${dir}: ${(err as Error).message}`)
    }
  }

  for (const file of WIPE_FILES) {
    const target = join(userData, file)
    try {
      await rm(target, { force: true })
      removed.push(file)
    } catch (err) {
      errors.push(`${file}: ${(err as Error).message}`)
    }
  }

  if (errors.length > 0) {
    logToFile('ERROR', `[wipe-storage] partial wipe — errors: ${errors.join('; ')}`)
    return { success: false, error: `Some data could not be removed: ${errors.join('; ')}` }
  }

  logToFile('INFO', `[wipe-storage] wiped: ${removed.join(', ')}`)
  return { success: true, data: { removed } }
}
