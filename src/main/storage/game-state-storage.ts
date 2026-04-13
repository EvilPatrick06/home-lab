import { access, mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { GameStateSaveSchema } from '../../shared/storage-schemas'
import { atomicWriteFile } from './atomic-write'
import type { StorageResult } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const GAME_STATE_SCHEMA_VERSION = 1

export function migrateGameState(state: any): Record<string, unknown> {
  if (!state || typeof state !== 'object') {
    return { schemaVersion: GAME_STATE_SCHEMA_VERSION }
  }

  let version = typeof state.schemaVersion === 'number' ? state.schemaVersion : 0

  if (version < 1) {
    // Migration logic for v0 -> v1
    state.entities = Array.isArray(state.entities) ? state.entities : []
    state.logs = Array.isArray(state.logs) ? state.logs : []
    state.maps = Array.isArray(state.maps) ? state.maps : []
    state.schemaVersion = 1
    version = 1
  }

  // Future schemas logic goes here

  return state
}
function isValidUUID(str: string): boolean {
  return UUID_RE.test(str)
}

let gameStateDirReady: Promise<string> | null = null

function getGameStateDir(): Promise<string> {
  if (!gameStateDirReady) {
    gameStateDirReady = (async () => {
      const dir = join(app.getPath('userData'), 'game-states')
      await mkdir(dir, { recursive: true })
      return dir
    })()
  }
  return gameStateDirReady
}

async function getGameStatePath(campaignId: string): Promise<string> {
  const dir = await getGameStateDir()
  return join(dir, `${campaignId}.json`)
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function saveGameState(campaignId: string, state: Record<string, unknown>): Promise<StorageResult<void>> {
  if (!isValidUUID(campaignId)) {
    return { success: false, error: 'Invalid campaign ID' }
  }
  try {
    const path = await getGameStatePath(campaignId)
    // Guarantee correct schema version on save
    state.schemaVersion = GAME_STATE_SCHEMA_VERSION
    await atomicWriteFile(path, JSON.stringify(state, null, 2))
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to save game state: ${(err as Error).message}` }
  }
}

export async function loadGameState(campaignId: string): Promise<StorageResult<Record<string, unknown> | null>> {
  if (!isValidUUID(campaignId)) {
    return { success: false, error: 'Invalid campaign ID' }
  }
  try {
    const path = await getGameStatePath(campaignId)
    if (!(await fileExists(path))) {
      return { success: true, data: null }
    }
    const data = await readFile(path, 'utf-8')
    let parsed: any
    try {
      parsed = JSON.parse(data)
    } catch {
      // If corrupted, fallback to an empty migrated state
      return { success: true, data: migrateGameState({}) }
    }
    const migrated = migrateGameState(parsed)
    const validate = GameStateSaveSchema.safeParse(migrated)
    if (!validate.success) {
      return { success: true, data: migrateGameState({}) }
    }
    return { success: true, data: migrated }
  } catch (err) {
    return { success: false, error: `Failed to load game state: ${(err as Error).message}` }
  }
}

export async function deleteGameState(campaignId: string): Promise<StorageResult<boolean>> {
  if (!isValidUUID(campaignId)) {
    return { success: false, error: 'Invalid campaign ID' }
  }
  try {
    const { unlink } = await import('node:fs/promises')
    const path = await getGameStatePath(campaignId)
    if (!(await fileExists(path))) {
      return { success: true, data: false }
    }
    await unlink(path)
    return { success: true, data: true }
  } catch (err) {
    return { success: false, error: `Failed to delete game state: ${(err as Error).message}` }
  }
}
