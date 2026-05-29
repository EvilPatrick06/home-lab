import type { HomebrewEntry } from '../../types/library'
import { logger } from '../../utils/logger'
import { validateHomebrew } from '../homebrew-validation'
import { exportEntities, importEntities } from './entity-io'

/**
 * Phase 25a — first-class export/import of homebrew bundles as `.dndhomebrew`
 * files (JSON envelopes via the shared entity-io layer).
 */

/** Export the provided homebrew entries to a `.dndhomebrew` file. */
export async function exportHomebrew(items: HomebrewEntry[]): Promise<boolean> {
  return exportEntities('homebrew', items)
}

/** Export every homebrew entry currently on disk. */
export async function exportAllHomebrew(): Promise<boolean> {
  const all = (await window.api.loadAllHomebrew()) as unknown as HomebrewEntry[]
  if (!all || all.length === 0) return false
  return exportEntities('homebrew', all)
}

export interface HomebrewImportSummary {
  imported: number
  errors: number
  skipped: number
  messages: string[]
}

/** How the user chose to resolve an id collision during import (Phase 25a Step 3). */
export type HomebrewCollisionChoice = 'replace' | 'copy' | 'skip'

/**
 * Called once per colliding entry (an imported id that already exists on disk
 * with a *different* name). The UI shows a "Replace / Import as copy / Skip"
 * prompt and resolves to the choice. When omitted, imports default to `'copy'`
 * — the historical non-destructive behaviour.
 */
export type ResolveHomebrewCollision = (
  incoming: HomebrewEntry,
  existing: HomebrewEntry
) => Promise<HomebrewCollisionChoice>

/**
 * Import homebrew from a `.dndhomebrew` file. Each entry is validated
 * (structural minimum) before being persisted; schema warnings don't block
 * but hard errors (missing id/name/type) skip that entry. Id collisions with a
 * different name are resolved via `resolveCollision` (default: import as a copy).
 */
export async function importHomebrew(
  resolveCollision?: ResolveHomebrewCollision
): Promise<HomebrewImportSummary | null> {
  const result = await importEntities<HomebrewEntry>('homebrew')
  if (!result) return null

  // Build an id → entry map of what's already on disk so we can detect collisions.
  const existingById = new Map<string, HomebrewEntry>()
  try {
    const all = (await window.api.loadAllHomebrew()) as unknown as HomebrewEntry[]
    for (const e of all ?? []) if (e?.id) existingById.set(e.id, e)
  } catch (err) {
    logger.warn('[homebrew-io] could not preload existing homebrew for collision check:', err)
  }

  const summary: HomebrewImportSummary = { imported: 0, errors: 0, skipped: 0, messages: [] }
  for (const item of result.items) {
    const validation = validateHomebrew(item)
    if (!validation.valid) {
      summary.errors++
      summary.messages.push(`${(item as { name?: string }).name ?? 'unnamed'}: ${validation.errors.join(', ')}`)
      continue
    }

    let conflictMode: 'auto' | 'copy' | 'replace' = 'auto'
    const existing = item.id ? existingById.get(item.id) : undefined
    if (existing && existing.name !== item.name) {
      // True collision: same id, different content. Ask (default to copy).
      const choice = resolveCollision ? await resolveCollision(item, existing) : 'copy'
      if (choice === 'skip') {
        summary.skipped++
        summary.messages.push(`${item.name}: skipped (id collides with "${existing.name}")`)
        continue
      }
      conflictMode = choice // 'replace' | 'copy'
    }

    try {
      await window.api.saveHomebrew({
        ...(item as unknown as Record<string, unknown>),
        __conflictMode: conflictMode
      })
      summary.imported++
      // Reflect the write in the map so later items in the same batch see it.
      if (conflictMode === 'replace' && item.id) existingById.set(item.id, item)
    } catch (err) {
      summary.errors++
      logger.warn('[homebrew-io] save failed during import:', err)
      summary.messages.push(`${item.name}: save failed`)
    }
  }
  return summary
}
