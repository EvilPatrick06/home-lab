import classResourcesJson from '@data/5e/game/mechanics/class-resources.json'
import { load5eClassResources } from '../services/data-provider'
import type { ClassResource } from '../types/character-common'
import type { ResourceDefinition, ResourceScaling } from '../types/data'

// --- Generic resource interpreter ---

function resolveMax(scaling: ResourceScaling, level: number, wisdomMod: number): number {
  if (scaling.max !== undefined) return scaling.max
  switch (scaling.maxFormula) {
    case 'profBonus':
      return Math.ceil(level / 4) + 1
    case 'classLevel':
      return level
    case 'classLevel*5':
      return level * 5
    case 'wisdomMod':
      return Math.max(1, wisdomMod)
    default:
      return 1
  }
}

function resolveResources(definitions: ResourceDefinition[], level: number, wisdomMod: number = 0): ClassResource[] {
  const resources: ClassResource[] = []
  for (const def of definitions) {
    // Find the applicable scaling tier for this level
    const tier = def.scaling.find((s) => level >= s.minLevel && (s.maxLevel === undefined || level <= s.maxLevel))
    if (!tier) continue

    const max = resolveMax(tier, level, wisdomMod)
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

const data = classResourcesJson as {
  classes: Record<string, { resources: ResourceDefinition[] }>
  feats: Record<string, ResourceDefinition>
}

// --- Public API (signatures preserved) ---

export function getFighterResources(fighterLevel: number): ClassResource[] {
  return resolveResources(data.classes.fighter?.resources ?? [], fighterLevel)
}

export function getRogueResources(rogueLevel: number): ClassResource[] {
  return resolveResources(data.classes.rogue?.resources ?? [], rogueLevel)
}

export function getSorcererResources(sorcererLevel: number): ClassResource[] {
  return resolveResources(data.classes.sorcerer?.resources ?? [], sorcererLevel)
}

export function getMonkResources(monkLevel: number): ClassResource[] {
  return resolveResources(data.classes.monk?.resources ?? [], monkLevel)
}

export function getPaladinResources(paladinLevel: number): ClassResource[] {
  return resolveResources(data.classes.paladin?.resources ?? [], paladinLevel)
}

export function getRangerResources(rangerLevel: number, wisdomModifier: number = 0): ClassResource[] {
  return resolveResources(data.classes.ranger?.resources ?? [], rangerLevel, wisdomModifier)
}

export function getClassResources(classId: string, classLevel: number, wisdomModifier: number = 0): ClassResource[] {
  const classData = data.classes[classId]
  if (!classData) return []
  return resolveResources(classData.resources, classLevel, wisdomModifier)
}

/** Load class resources from the data store (includes homebrew classes). */
export async function loadClassResourceData(): Promise<unknown> {
  return load5eClassResources()
}

/** Get resources from feats (e.g., Lucky). */
export function getFeatResources(feats: Array<{ id: string }>, profBonus: number): ClassResource[] {
  const resources: ClassResource[] = []
  for (const [featId, def] of Object.entries(data.feats)) {
    if (feats.some((f) => f.id === featId)) {
      const tier = def.scaling.find((s) => 1 >= s.minLevel && (s.maxLevel === undefined || 1 <= s.maxLevel))
      if (tier) {
        const max = resolveMax(tier, 1, 0)
        // For profBonus formula, use the actual profBonus passed in
        const finalMax = tier.maxFormula === 'profBonus' ? profBonus : max
        resources.push({
          id: def.id,
          name: def.name,
          current: finalMax,
          max: finalMax,
          shortRestRestore: def.shortRestRestore
        })
      }
    }
  }
  return resources
}
