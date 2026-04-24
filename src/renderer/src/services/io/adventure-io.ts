import type { AdventureEntry, NPC } from '../../types/campaign'
import type { Encounter } from '../../types/encounter'
import { exportEntities, importEntities } from './entity-io'

export interface AdventureExportData {
  version: 1
  adventure: AdventureEntry
  encounters?: Encounter[]
  npcs?: NPC[]
}

export interface AdventureImportResult {
  adventure: AdventureEntry
  encounters: Encounter[]
  npcs: NPC[]
}

/**
 * Export an adventure and its associated data to a .dndadv file.
 */
export async function exportAdventure(
  adventure: AdventureEntry,
  encounters: Encounter[],
  npcs: NPC[]
): Promise<boolean> {
  const data: AdventureExportData = {
    version: 1,
    adventure,
    encounters,
    npcs
  }
  return exportEntities('adventure', [data])
}

/**
 * Import an adventure from a .dndadv file.
 */
export async function importAdventure(): Promise<AdventureImportResult | null> {
  const result = await importEntities<AdventureExportData>('adventure')
  if (!result || result.items.length === 0) return null

  const data = result.items[0]
  return validateAdventureImport(data)
}

/**
 * Validate imported adventure data and return normalized result.
 */
export function validateAdventureImport(data: AdventureExportData): AdventureImportResult | null {
  if (!data.adventure || !data.adventure.id || !data.adventure.title) {
    return null
  }

  return {
    adventure: {
      ...data.adventure,
      id: crypto.randomUUID(), // Generate new ID to avoid collisions
      createdAt: new Date().toISOString()
    },
    encounters: (data.encounters ?? []).map((e) => ({ ...e, id: crypto.randomUUID() })),
    npcs: (data.npcs ?? []).map((n) => ({ ...n, id: crypto.randomUUID() }))
  }
}
