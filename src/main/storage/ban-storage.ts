import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { isValidUUID } from '../../shared/utils/uuid'
import { atomicWriteFile } from './atomic-write'
import type { StorageResult } from './types'

export interface BanData {
  peerIds: string[]
  names: string[]
}

function getBansDir(): string {
  return join(app.getPath('userData'), 'bans')
}

function getBanPath(campaignId: string): string {
  return join(getBansDir(), `${campaignId}.json`)
}

export async function loadBans(campaignId: string): Promise<StorageResult<BanData>> {
  if (!isValidUUID(campaignId)) {
    return { success: false, error: 'Invalid campaign ID', data: { peerIds: [], names: [] } }
  }
  try {
    const banPath = getBanPath(campaignId)
    const content = await readFile(banPath, 'utf-8')
    const parsed = JSON.parse(content)
    return {
      success: true,
      data: {
        peerIds: Array.isArray(parsed.peerIds) ? (parsed.peerIds as string[]) : [],
        names: Array.isArray(parsed.names) ? (parsed.names as string[]) : []
      }
    }
  } catch {
    return { success: true, data: { peerIds: [], names: [] } }
  }
}

export async function saveBans(campaignId: string, banData: BanData): Promise<StorageResult<void>> {
  if (!isValidUUID(campaignId)) {
    return { success: false, error: 'Invalid campaign ID' }
  }
  if (!banData || typeof banData !== 'object') {
    return { success: false, error: 'Invalid ban data: expected object' }
  }
  const { peerIds, names } = banData
  if (!Array.isArray(peerIds) || !Array.isArray(names)) {
    return { success: false, error: 'Invalid peer IDs or names: expected array' }
  }
  if (peerIds.length > 1000 || names.length > 1000) {
    return { success: false, error: 'Invalid ban data: too many entries' }
  }
  for (const id of peerIds) {
    if (typeof id !== 'string' || id.length > 64) {
      return { success: false, error: 'Invalid peer ID in list' }
    }
  }
  for (const name of names) {
    if (typeof name !== 'string' || name.length > 64) {
      return { success: false, error: 'Invalid name in list' }
    }
  }
  try {
    const bansDir = getBansDir()
    await mkdir(bansDir, { recursive: true })
    const banPath = getBanPath(campaignId)
    await atomicWriteFile(banPath, JSON.stringify({ peerIds, names }))
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
