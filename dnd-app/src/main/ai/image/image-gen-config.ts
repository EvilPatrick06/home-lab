/**
 * PHASE-33 33A — AI image-generation config persistence. Mirrors `ai-service.ts`'s config store, but
 * nothing here is secret (cloud calls reuse the AI DM's encrypted API keys; the SD endpoint is keyless
 * on a LAN), so no `encryptOptional`. `enabled` defaults to false — the whole feature is opt-in.
 */

import { app } from 'electron'
import { readFileSync } from 'fs'
import path from 'path'
import { AiImageConfigSchema, type ValidatedAiImageConfig } from '../../../shared/ipc-schemas'
import { logToFile } from '../../log'
import { atomicWriteFile } from '../../storage/atomic-write'

export function getImageGenConfigPath(): string {
  return path.join(app.getPath('userData'), 'ai-image-config.json')
}

// In-memory cache (mirrors ai-service). Parse of `{}` yields all defaults → enabled:false.
let cached: ValidatedAiImageConfig | null = null

export function getImageGenConfig(): ValidatedAiImageConfig {
  if (cached) return cached
  try {
    const raw = readFileSync(getImageGenConfigPath(), 'utf-8')
    cached = AiImageConfigSchema.parse(JSON.parse(raw))
  } catch {
    // Missing or corrupt → defaults (never throw; feature stays inert/off).
    cached = AiImageConfigSchema.parse({})
  }
  return cached
}

export async function configureImageGen(config: ValidatedAiImageConfig): Promise<void> {
  cached = config
  try {
    await atomicWriteFile(getImageGenConfigPath(), JSON.stringify(config, null, 2))
  } catch (err) {
    logToFile('ERROR', `[AI Image] Failed to persist config: ${String(err)}`)
  }
}

/** Test-only: drop the in-memory cache so a fresh read hits disk. */
export function __resetImageGenConfigCache(): void {
  cached = null
}
