import { access, mkdir, readdir, readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { app } from 'electron'
import type { PluginManifest, PluginStatus } from '../../shared/plugin-types'
import { logToFile } from '../log'
import type { StorageResult } from '../storage/types'
import { getEnabledPluginIds } from './plugin-config'

const VALID_TYPES = ['content-pack', 'plugin', 'game-system'] as const

let pluginsDirReady: Promise<string> | null = null

export function getPluginsDir(): Promise<string> {
  if (!pluginsDirReady) {
    pluginsDirReady = (async () => {
      const dir = join(app.getPath('userData'), 'plugins')
      await mkdir(dir, { recursive: true })
      return dir
    })()
  }
  return pluginsDirReady
}

export function validateManifest(raw: unknown): { valid: boolean; manifest?: PluginManifest; error?: string } {
  if (!raw || typeof raw !== 'object') {
    return { valid: false, error: 'Manifest must be a JSON object' }
  }

  const obj = raw as Record<string, unknown>

  if (typeof obj.id !== 'string' || obj.id.length === 0 || obj.id.length > 128) {
    return { valid: false, error: 'Missing or invalid id' }
  }
  // Only allow safe characters in id (alphanumeric, dash, underscore, dots)
  if (!/^[a-zA-Z0-9._-]+$/.test(obj.id)) {
    return { valid: false, error: 'Plugin id contains invalid characters' }
  }
  if (typeof obj.name !== 'string' || obj.name.length === 0) {
    return { valid: false, error: 'Missing or invalid name' }
  }
  if (typeof obj.version !== 'string' || obj.version.length === 0) {
    return { valid: false, error: 'Missing or invalid version' }
  }
  if (typeof obj.description !== 'string') {
    return { valid: false, error: 'Missing or invalid description' }
  }
  if (typeof obj.author !== 'string') {
    return { valid: false, error: 'Missing or invalid author' }
  }
  if (!VALID_TYPES.includes(obj.type as (typeof VALID_TYPES)[number])) {
    return { valid: false, error: `Invalid type: ${String(obj.type)}` }
  }
  if (obj.type !== 'game-system' && typeof obj.gameSystem !== 'string') {
    return { valid: false, error: 'Missing gameSystem' }
  }
  if ((obj.type === 'plugin' || obj.type === 'game-system') && typeof obj.entry !== 'string') {
    return { valid: false, error: 'Code plugins must have an entry field' }
  }

  return { valid: true, manifest: obj as unknown as PluginManifest }
}

/**
 * Verify that a code plugin's entry file exists on disk and is within bounds.
 * Returns an error string if invalid, undefined if OK.
 */
async function validateEntryFile(pluginDir: string, entry: string): Promise<string | undefined> {
  const entryPath = resolve(join(pluginDir, entry))
  if (!entryPath.startsWith(resolve(pluginDir))) {
    return `Entry path traversal: ${entry}`
  }
  try {
    await access(entryPath)
  } catch {
    return `Entry file not found: ${entry}`
  }
  return undefined
}

export async function scanPlugins(): Promise<StorageResult<PluginStatus[]>> {
  try {
    const pluginsDir = await getPluginsDir()
    const entries = await readdir(pluginsDir, { withFileTypes: true })
    const enabledIds = await getEnabledPluginIds()
    const results: PluginStatus[] = []

    const stubManifest = (name: string) => ({
      id: name,
      name,
      version: '0.0.0',
      description: '',
      author: '',
      type: 'content-pack' as const,
      gameSystem: 'dnd5e',
      data: {}
    })

    for (const entry of entries) {
      if (!entry.isDirectory()) continue

      const pluginDir = join(pluginsDir, entry.name)
      const manifestPath = join(pluginDir, 'manifest.json')

      // Path traversal protection
      const resolvedDir = resolve(pluginDir)
      const resolvedBase = resolve(pluginsDir)
      if (!resolvedDir.startsWith(resolvedBase)) continue

      try {
        const raw = JSON.parse(await readFile(manifestPath, 'utf-8'))
        const validation = validateManifest(raw)

        if (!validation.valid || !validation.manifest) {
          results.push({
            id: entry.name,
            manifest: stubManifest(entry.name),
            enabled: false,
            loaded: false,
            error: validation.error ?? 'Invalid manifest'
          })
          continue
        }

        const manifest = validation.manifest

        // Validate entry file exists for code plugins
        if ((manifest.type === 'plugin' || manifest.type === 'game-system') && 'entry' in manifest) {
          const entryError = await validateEntryFile(pluginDir, manifest.entry)
          if (entryError) {
            results.push({
              id: manifest.id,
              manifest,
              enabled: false,
              loaded: false,
              error: entryError
            })
            continue
          }
        }

        results.push({
          id: manifest.id,
          manifest,
          enabled: enabledIds.has(manifest.id),
          loaded: false
        })
      } catch (err) {
        results.push({
          id: entry.name,
          manifest: stubManifest(entry.name),
          enabled: false,
          loaded: false,
          error: `Failed to read manifest: ${(err as Error).message}`
        })
      }
    }

    return { success: true, data: results }
  } catch (err) {
    logToFile('ERROR', `Plugin scan failed: ${(err as Error).message}`)
    return { success: false, error: `Plugin scan failed: ${(err as Error).message}` }
  }
}
