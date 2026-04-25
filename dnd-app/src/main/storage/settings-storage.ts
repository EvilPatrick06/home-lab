import { app } from 'electron'
import { mkdir, readFile } from 'fs/promises'
import { join } from 'path'
import { z } from 'zod'
import { atomicWriteFile } from './atomic-write'
import type { StorageResult } from './types'

export const SETTINGS_SCHEMA_VERSION = 1

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
    bmoPiBaseUrl: z.string().optional()
  })
  .passthrough()

export type AppSettings = z.infer<typeof AppSettingsSchema>

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
    return { success: true, data: result.data }
  } catch {
    return { success: true, data: { version: SETTINGS_SCHEMA_VERSION } }
  }
}

export async function saveSettings(settings: AppSettings): Promise<StorageResult<void>> {
  try {
    const dir = app.getPath('userData')
    await mkdir(dir, { recursive: true })
    const parsed = AppSettingsSchema.parse(settings)
    await atomicWriteFile(getSettingsPath(), JSON.stringify(parsed, null, 2))
    return { success: true }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
