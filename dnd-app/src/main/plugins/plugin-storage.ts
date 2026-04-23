import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { logToFile } from '../log'
import { getPluginsDir } from './plugin-scanner'

/**
 * Per-plugin key-value JSON storage.
 * Each plugin gets its own storage.json file at userData/plugins/<id>/storage.json.
 */

async function getStoragePath(pluginId: string): Promise<string | null> {
  if (!/^[a-zA-Z0-9._-]+$/.test(pluginId)) return null

  const pluginsDir = await getPluginsDir()
  const pluginDir = resolve(join(pluginsDir, pluginId))

  if (!pluginDir.startsWith(resolve(pluginsDir))) return null

  await mkdir(pluginDir, { recursive: true })
  return join(pluginDir, 'storage.json')
}

async function readStorage(pluginId: string): Promise<Record<string, unknown>> {
  const path = await getStoragePath(pluginId)
  if (!path) return {}

  try {
    const content = await readFile(path, 'utf-8')
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}

async function writeStorage(pluginId: string, data: Record<string, unknown>): Promise<void> {
  const path = await getStoragePath(pluginId)
  if (!path) return

  try {
    await writeFile(path, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    logToFile('ERROR', `Plugin storage write failed for ${pluginId}: ${(err as Error).message}`)
  }
}

export async function getPluginStorage(pluginId: string, key: string): Promise<unknown> {
  const data = await readStorage(pluginId)
  return data[key] ?? null
}

export async function setPluginStorage(pluginId: string, key: string, value: unknown): Promise<{ success: boolean }> {
  const data = await readStorage(pluginId)
  data[key] = value
  await writeStorage(pluginId, data)
  return { success: true }
}

export async function deletePluginStorage(pluginId: string, key: string): Promise<{ success: boolean }> {
  const data = await readStorage(pluginId)
  delete data[key]
  await writeStorage(pluginId, data)
  return { success: true }
}
