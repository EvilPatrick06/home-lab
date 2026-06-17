/**
 * PHASE-26 26B — per-campaign scene-memory settings (engine-owned, default off).
 *
 * Mirrors the PHASE-25 entity-store flag pattern: a tiny JSON file in the campaign's
 * ai-context dir, an in-memory cache so the per-request hot path (26C) never hits disk
 * twice, and an atomic write. Stored OUTSIDE AiConfig because that file is app-wide and
 * contested by other phases (F7).
 */

import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { z } from 'zod'
import { atomicWriteFile } from '../storage/atomic-write'

export interface SceneMemorySettings {
  enabled: boolean
}

const SceneMemorySettingsSchema = z.object({ enabled: z.boolean() })

const cache = new Map<string, SceneMemorySettings>()

function fileFor(campaignId: string): string {
  return path.join(app.getPath('userData'), 'campaigns', campaignId, 'ai-context', 'scene-memory.json')
}

/** Read the per-campaign settings (cached). Missing/corrupt file → `{ enabled: false }`. */
export async function getSceneMemorySettings(campaignId: string): Promise<SceneMemorySettings> {
  const cached = cache.get(campaignId)
  if (cached) return cached
  let settings: SceneMemorySettings = { enabled: false }
  try {
    const raw = await fs.readFile(fileFor(campaignId), 'utf-8')
    const parsed = SceneMemorySettingsSchema.safeParse(JSON.parse(raw))
    if (parsed.success) settings = parsed.data
  } catch {
    // missing/unreadable/corrupt → default off
  }
  cache.set(campaignId, settings)
  return settings
}

export async function setSceneMemoryEnabled(campaignId: string, enabled: boolean): Promise<void> {
  const settings: SceneMemorySettings = { enabled }
  cache.set(campaignId, settings)
  const file = fileFor(campaignId)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await atomicWriteFile(file, JSON.stringify(settings, null, 2))
}

/** Drop the cache (tests + the campaign-delete cascade, called from removeConversation). */
export function clearSceneMemoryCache(campaignId?: string): void {
  if (campaignId) cache.delete(campaignId)
  else cache.clear()
}
