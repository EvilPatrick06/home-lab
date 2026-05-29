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
  messages: string[]
}

/**
 * Import homebrew from a `.dndhomebrew` file. Each entry is validated
 * (structural minimum) before being persisted; schema warnings don't block
 * but hard errors (missing id/name/type) skip that entry.
 */
export async function importHomebrew(): Promise<HomebrewImportSummary | null> {
  const result = await importEntities<HomebrewEntry>('homebrew')
  if (!result) return null

  const summary: HomebrewImportSummary = { imported: 0, errors: 0, messages: [] }
  for (const item of result.items) {
    const validation = validateHomebrew(item)
    if (!validation.valid) {
      summary.errors++
      summary.messages.push(`${(item as { name?: string }).name ?? 'unnamed'}: ${validation.errors.join(', ')}`)
      continue
    }
    try {
      await window.api.saveHomebrew(item as unknown as Record<string, unknown>)
      summary.imported++
    } catch (err) {
      summary.errors++
      logger.warn('[homebrew-io] save failed during import:', err)
      summary.messages.push(`${item.name}: save failed`)
    }
  }
  return summary
}
