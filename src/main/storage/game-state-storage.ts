import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { StorageResult } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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
    await writeFile(path, JSON.stringify(state, null, 2), 'utf-8')
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
    return { success: true, data: JSON.parse(data) }
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
