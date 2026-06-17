import { app } from 'electron'
import { mkdir, readFile } from 'fs/promises'
import { join } from 'path'
import { z } from 'zod'
import { atomicWriteFile } from './atomic-write'
import { decryptOptional, encryptOptional } from './safe-secret-storage'
import type { StorageResult } from './types'

const SETTINGS_SCHEMA_VERSION = 1

export const AppSettingsSchema = z
  .object({
    version: z.number().optional().default(SETTINGS_SCHEMA_VERSION),
    turnServers: z
      .array(
        z.object({
          urls: z.union([z.string(), z.array(z.string())]),
          username: z.string().optional(),
          credential: z.string().optional()
        })
      )
      .optional(),
    userProfile: z
      .object({
        id: z.string(),
        displayName: z.string(),
        avatarPath: z.string().optional(),
        createdAt: z.string()
      })
      .optional(),
    /** BMO Pi HTTP base (main fetches, cloud sync, CSP). Empty/unset → BMO_PI_URL env or default. */
    bmoPiBaseUrl: z.string().optional(),
    /** Persisted UI language (e.g. 'en', 'es'). Default 'en'. */
    language: z.string().optional(),
    /** ISO timestamp of the last successful cloud backup — drives the staleness nudge. */
    lastBackupTime: z.string().optional(),
    /** Auto-run a cloud backup on launch when the last one is stale (default on;
     * no-op unless cloud/rclone is configured). Set false to only get the nudge. */
    autoBackupOnLaunch: z.boolean().optional(),
    /** PHASE-22 22D: shared secret for the BMO sync receiver's bearer gate; must
     * match the Pi's VTT_SYNC_TOKEN/BMO_API_KEY. Encrypted at rest. */
    bmoApiKey: z.string().optional(),
    /** PHASE-22 22D: opt-in LAN bind for the sync receiver (default loopback).
     * Only takes effect when bmoApiKey is also set (keyed exposure). */
    bmoSyncLanEnabled: z.boolean().optional()
  })
  .passthrough()

export type AppSettings = z.infer<typeof AppSettingsSchema>

function decryptTurnCredentials(data: AppSettings): AppSettings {
  // PHASE-22 22D: bmoApiKey is encrypted at rest alongside the TURN credentials.
  const withKey: AppSettings = data.bmoApiKey ? { ...data, bmoApiKey: decryptOptional(data.bmoApiKey) } : data
  if (!withKey.turnServers?.length) {
    return withKey
  }
  return {
    ...withKey,
    turnServers: withKey.turnServers.map((s) => ({
      ...s,
      credential: decryptOptional(s.credential)
    }))
  }
}

function encryptTurnCredentials(data: AppSettings): AppSettings {
  const withKey: AppSettings = data.bmoApiKey ? { ...data, bmoApiKey: encryptOptional(data.bmoApiKey) } : data
  if (!withKey.turnServers?.length) {
    return withKey
  }
  return {
    ...withKey,
    turnServers: withKey.turnServers.map((s) => ({
      ...s,
      credential: encryptOptional(s.credential)
    }))
  }
}

function getSettingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export async function loadSettings(): Promise<StorageResult<AppSettings>> {
  try {
    const content = await readFile(getSettingsPath(), 'utf-8')
    const parsed = JSON.parse(content)

    // Migrate schema definition
    if (!parsed.version) {
      parsed.version = SETTINGS_SCHEMA_VERSION
    }

    const result = AppSettingsSchema.safeParse(parsed)
    if (!result.success) {
      return { success: false, error: 'Invalid settings schema', data: { version: SETTINGS_SCHEMA_VERSION } }
    }
    return { success: true, data: decryptTurnCredentials(result.data) }
  } catch {
    return { success: true, data: { version: SETTINGS_SCHEMA_VERSION } }
  }
}

export async function saveSettings(settings: AppSettings): Promise<StorageResult<void>> {
  try {
    const dir = app.getPath('userData')
    await mkdir(dir, { recursive: true })
    const parsed = AppSettingsSchema.parse(settings)
    const toStore = encryptTurnCredentials(parsed)
    await atomicWriteFile(getSettingsPath(), JSON.stringify(toStore, null, 2))
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
