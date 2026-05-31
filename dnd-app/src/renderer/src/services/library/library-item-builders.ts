import { useLibraryStore } from '../../stores/use-library-store'
import type { HomebrewEntry, LibraryCategory, LibraryEntry, LibraryItem } from '../../types/library'
import { logger } from '../../utils/logger'
import { summarizeItem } from './summarize-item'

/**
 * Adapt a typed content array (Monster[], Spell[], Equipment subset, …) into the
 * loosely-typed LibraryItem shape used by the Library UI.
 *
 * Accepts `readonly unknown[]` so callers can pass any typed array without the
 * `as unknown as Record<string, unknown>[]` boilerplate that piled up across the
 * `loadCategoryItems` switch (was 46 sites). Each entry is defensively narrowed
 * to a record before field access; non-object entries become an empty record.
 */
export function toLibraryItems(
  items: readonly unknown[],
  category: LibraryCategory,
  source: 'official' | 'homebrew' = 'official'
): LibraryItem[] {
  const built = items.map((raw) => {
    const item = (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    return {
      id: (item.id as string) || (item.name as string) || category,
      name: (item.name as string) ?? 'Unknown',
      category,
      source,
      summary: summarizeItem(item, category),
      data: item
    }
  })
  // Phase 15a Step 8 — side-write each entry into the truth store so consumers
  // built on `useLibraryEntry` / `useLibraryEntries` / `useHydratedRef` can see
  // the same data without going through the LibraryItem wrapper. Homebrew goes
  // through `upsertHomebrew` separately, so only the 'official' path ingests.
  if (source === 'official') {
    ingestIntoLibraryStore(category, built)
  }
  return built
}

function ingestIntoLibraryStore(category: LibraryCategory, built: readonly LibraryItem[]): void {
  if (built.length === 0) return
  const entries = built
    .map((b) => {
      const data = b.data as Record<string, unknown>
      const id = (data.id as string) || b.id
      const name = (data.name as string) || b.name
      if (!id || !name) return null
      return { ...data, id, name } as LibraryEntry
    })
    .filter((e): e is LibraryEntry => e !== null)
  if (entries.length === 0) return
  useLibraryStore
    .getState()
    .loadCategory(category, () => entries)
    .catch((err) => logger.warn(`[LibraryService] truth-store ingest failed for ${category}:`, err))
}

export function homebrewToLibraryItems(entries: HomebrewEntry[], category: LibraryCategory): LibraryItem[] {
  return entries
    .filter((e) => e.type === category)
    .map((e) => ({
      id: e.id,
      name: e.name,
      category,
      source: 'homebrew' as const,
      summary: summarizeItem(e.data, category),
      data: { ...e.data, _homebrewId: e.id, _basedOn: e.basedOn, _createdAt: e.createdAt }
    }))
}
