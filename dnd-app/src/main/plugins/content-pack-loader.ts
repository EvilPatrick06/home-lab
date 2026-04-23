import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { ContentCategory, PluginManifest } from '../../shared/plugin-types'
import { logToFile } from '../log'
import type { StorageResult } from '../storage/types'
import { getPluginsDir } from './plugin-scanner'

/**
 * Load content pack data for a specific category from a plugin's directory.
 * Each item gets tagged with `source: 'plugin:<pluginId>'`.
 */
export async function loadContentPackData(
  pluginId: string,
  category: ContentCategory,
  manifest: PluginManifest
): Promise<StorageResult<unknown[]>> {
  try {
    const pluginsDir = await getPluginsDir()
    const pluginDir = resolve(join(pluginsDir, pluginId))

    // Path traversal protection
    if (!pluginDir.startsWith(resolve(pluginsDir))) {
      return { success: false, error: 'Invalid plugin path' }
    }

    const dataMapping = manifest.data
    if (!dataMapping) {
      return { success: true, data: [] }
    }

    const fileRefs = dataMapping[category]
    if (!fileRefs) {
      return { success: true, data: [] }
    }

    const files = Array.isArray(fileRefs) ? fileRefs : [fileRefs]
    const allItems: unknown[] = []

    for (const file of files) {
      const filePath = resolve(join(pluginDir, file))

      // Ensure file stays within plugin directory
      if (!filePath.startsWith(pluginDir)) {
        logToFile('WARN', `Plugin ${pluginId}: path traversal attempt blocked: ${file}`)
        continue
      }

      try {
        const content = await readFile(filePath, 'utf-8')
        const parsed = JSON.parse(content)
        const items = Array.isArray(parsed) ? parsed : [parsed]

        for (const item of items) {
          if (item && typeof item === 'object') {
            ;(item as Record<string, unknown>).source = `plugin:${pluginId}`
          }
          allItems.push(item)
        }
      } catch (err) {
        logToFile('WARN', `Plugin ${pluginId}: failed to load ${file}: ${(err as Error).message}`)
      }
    }

    return { success: true, data: allItems }
  } catch (err) {
    return { success: false, error: `Failed to load content pack data: ${(err as Error).message}` }
  }
}

/**
 * Load all content data from a plugin across all categories.
 * Returns a map of category -> items[].
 */
export async function loadAllContentPackData(
  pluginId: string,
  manifest: PluginManifest
): Promise<StorageResult<Record<string, unknown[]>>> {
  try {
    const dataMapping = manifest.data
    if (!dataMapping) {
      return { success: true, data: {} }
    }

    const result: Record<string, unknown[]> = {}

    for (const category of Object.keys(dataMapping) as ContentCategory[]) {
      const loaded = await loadContentPackData(pluginId, category, manifest)
      if (loaded.success && loaded.data && loaded.data.length > 0) {
        result[category] = loaded.data
      }
    }

    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: `Failed to load all content pack data: ${(err as Error).message}` }
  }
}
