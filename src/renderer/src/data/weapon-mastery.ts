import { load5eWeaponMastery, type WeaponMasteryEntry } from '../services/data-provider'
import { logger } from '../utils/logger'

type _WeaponMasteryEntry = WeaponMasteryEntry

export interface MasteryProperty {
  name: string
  description: string
}

export const WEAPON_MASTERY_PROPERTIES: Record<string, MasteryProperty> = {}

load5eWeaponMastery()
  .then((entries) => {
    for (const entry of entries) {
      WEAPON_MASTERY_PROPERTIES[entry.name] = { name: entry.name, description: entry.description }
    }
  })
  .catch((e) => logger.warn('Failed to load weapon mastery data', e))

export function getMasteryDescription(mastery: string): string {
  return WEAPON_MASTERY_PROPERTIES[mastery]?.description ?? ''
}
