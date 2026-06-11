import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getDataDir } from '../paths'

/**
 * Minimal id→name lookup over the bundled 5e data (PHASE-11 11G). v4 character
 * spell/feat/magic-item refs are id-only (no inline name), so the AI context
 * resolves their display names here. Mirrors srd-provider's loader pattern
 * (getDataDir + existsSync + per-file module cache). Returns null on miss or an
 * unreadable file — callers fall back to overrides/title-cased slug.
 */

export type NameCategory = 'spells' | 'feats' | 'magic-items'

const FILES: Record<NameCategory, string> = {
  spells: 'spells/spells.json',
  feats: 'feats/index.json',
  'magic-items': 'equipment/magic-items.json'
}

const cache = new Map<NameCategory, Map<string, string>>()

function loadCategory(category: NameCategory): Map<string, string> {
  const cached = cache.get(category)
  if (cached) return cached

  const map = new Map<string, string>()
  const filePath = join(getDataDir(), FILES[category])
  if (existsSync(filePath)) {
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf-8')) as Array<{ id?: string; name?: string }>
      for (const entry of data) {
        if (entry?.id && entry?.name) map.set(entry.id, entry.name)
      }
    } catch {
      // leave the map empty; resolveEntryName returns null and callers fall back
    }
  }
  cache.set(category, map)
  return map
}

export function resolveEntryName(category: NameCategory, entryId: string): string | null {
  return loadCategory(category).get(entryId) ?? null
}

/** Test hook — clear the per-category caches so a test can re-seed the data dir. */
export function _resetNameCacheForTests(): void {
  cache.clear()
}
