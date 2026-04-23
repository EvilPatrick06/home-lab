import speciesResourcesJson from '@data/5e/game/mechanics/species-resources.json'
import { load5eSpeciesResources } from '../services/data-provider'
import type { ClassResource } from '../types/character-common'
import type { ResourceDefinition, ResourceScaling } from '../types/data'

// --- Generic resource interpreter (same as class-resources) ---

function resolveMax(scaling: ResourceScaling, level: number): number {
  if (scaling.max !== undefined) return scaling.max
  switch (scaling.maxFormula) {
    case 'profBonus':
      return Math.ceil(level / 4) + 1
    case 'classLevel':
      return level
    case 'classLevel*5':
      return level * 5
    default:
      return 1
  }
}

function resolveResources(definitions: ResourceDefinition[], level: number): ClassResource[] {
  const resources: ClassResource[] = []
  for (const def of definitions) {
    const tier = def.scaling.find((s) => level >= s.minLevel && (s.maxLevel === undefined || level <= s.maxLevel))
    if (!tier) continue

    const max = resolveMax(tier, level)
    resources.push({
      id: def.id,
      name: def.name,
      current: max,
      max,
      shortRestRestore: def.shortRestRestore
    })
  }
  return resources
}

// --- Typed JSON data ---

const data = speciesResourcesJson as {
  species: Record<
    string,
    {
      resources: ResourceDefinition[]
      heritages?: Record<string, ResourceDefinition[]>
    }
  >
}

// --- Public API (signature preserved) ---

/**
 * Returns species resources for a given species and heritage at a given level.
 * Uses ClassResource type for compatibility with existing resource UI.
 */
export function getSpeciesResources(
  speciesId: string,
  subspeciesId: string | undefined,
  level: number
): ClassResource[] {
  const speciesData = data.species[speciesId]
  if (!speciesData) return []

  const resources = resolveResources(speciesData.resources, level)

  // Add heritage-specific resources
  if (subspeciesId && speciesData.heritages) {
    const heritageResources = speciesData.heritages[subspeciesId]
    if (heritageResources) {
      resources.push(...resolveResources(heritageResources, level))
    }
  }

  return resources
}

/** Load species resources from the data store (includes homebrew species). */
export async function loadSpeciesResourceData(): Promise<unknown> {
  return load5eSpeciesResources()
}
