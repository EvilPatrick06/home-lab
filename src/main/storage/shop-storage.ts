import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { StorageResult } from './types'

const TEMPLATE_ID_RE = /^[a-zA-Z0-9_-]+$/

let shopDirReady: Promise<string> | null = null

function getShopTemplateDir(): Promise<string> {
  if (!shopDirReady) {
    shopDirReady = (async () => {
      const dir = join(app.getPath('userData'), 'shop-templates')
      await mkdir(dir, { recursive: true })
      return dir
    })()
  }
  return shopDirReady
}

function isValidTemplateId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && TEMPLATE_ID_RE.test(id)
}

export interface ShopTemplate {
  id: string
  name: string
  inventory: unknown[]
  markup: number
  savedAt: string
}

/**
 * Save a shop template to disk.
 */
export async function saveShopTemplate(template: {
  id: string
  name: string
  inventory: unknown[]
  markup: number
}): Promise<StorageResult<void>> {
  if (!isValidTemplateId(template.id)) {
    return { success: false, error: 'Invalid template ID' }
  }
  if (!template.name || typeof template.name !== 'string') {
    return { success: false, error: 'Invalid template name' }
  }
  try {
    const dir = await getShopTemplateDir()
    const entry: ShopTemplate = {
      ...template,
      savedAt: new Date().toISOString()
    }
    await writeFile(join(dir, `${template.id}.json`), JSON.stringify(entry, null, 2), 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to save shop template: ${(err as Error).message}` }
  }
}

/**
 * List all saved shop templates (summary without full inventory).
 */
export async function listShopTemplates(): Promise<
  StorageResult<Array<{ id: string; name: string; markup: number; itemCount: number; savedAt: string }>>
> {
  try {
    const dir = await getShopTemplateDir()
    const files = await readdir(dir)
    const entries: Array<{ id: string; name: string; markup: number; itemCount: number; savedAt: string }> = []

    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const content = await readFile(join(dir, file), 'utf-8')
        const parsed = JSON.parse(content) as ShopTemplate
        entries.push({
          id: parsed.id,
          name: parsed.name,
          markup: parsed.markup,
          itemCount: Array.isArray(parsed.inventory) ? parsed.inventory.length : 0,
          savedAt: parsed.savedAt
        })
      } catch {
        // Skip corrupted files
      }
    }

    return { success: true, data: entries }
  } catch (err) {
    return { success: false, error: `Failed to list shop templates: ${(err as Error).message}` }
  }
}

/**
 * Get a specific shop template by ID.
 */
export async function getShopTemplate(id: string): Promise<StorageResult<ShopTemplate>> {
  if (!isValidTemplateId(id)) {
    return { success: false, error: 'Invalid template ID' }
  }
  try {
    const dir = await getShopTemplateDir()
    const content = await readFile(join(dir, `${id}.json`), 'utf-8')
    const entry = JSON.parse(content) as ShopTemplate
    return { success: true, data: entry }
  } catch (err) {
    return { success: false, error: `Failed to load shop template: ${(err as Error).message}` }
  }
}

/**
 * Delete a shop template by ID.
 */
export async function deleteShopTemplate(id: string): Promise<StorageResult<void>> {
  if (!isValidTemplateId(id)) {
    return { success: false, error: 'Invalid template ID' }
  }
  try {
    const dir = await getShopTemplateDir()
    await unlink(join(dir, `${id}.json`))
    return { success: true }
  } catch (err) {
    return { success: false, error: `Failed to delete shop template: ${(err as Error).message}` }
  }
}
