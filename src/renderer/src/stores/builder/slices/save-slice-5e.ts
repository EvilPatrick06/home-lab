import { load5eEquipment } from '../../../services/data-provider'
import { logger } from '../../../utils/logger'

// Re-export extracted functions so existing imports continue to work
export { buildCharacter5e } from './build-character-5e'
export { loadCharacterForEdit5e } from './load-character-5e'

interface EquipmentArmorData {
  name: string
  category: string
  baseAC: number
  dexBonus: boolean
  dexBonusMax: number | null
  stealthDisadvantage: boolean
  strengthRequirement?: number
  description?: string
}

export async function buildArmorFromEquipment5e(
  equipment: Array<{ name: string; quantity: number }>
): Promise<{ armor: import('../../../types/character-common').ArmorEntry[]; matchedNames: Set<string> }> {
  try {
    const eqData = await load5eEquipment()
    const armorData = eqData.armor ?? []
    const result: import('../../../types/character-common').ArmorEntry[] = []
    const matchedNames = new Set<string>()

    for (const item of equipment) {
      const nameLC = item.name.toLowerCase()
      const match = armorData.find((a) => nameLC.includes(a.name.toLowerCase()))
      if (match) {
        matchedNames.add(item.name)
        result.push({
          id: crypto.randomUUID(),
          name: match.name,
          acBonus: match.category === 'Shield' ? match.baseAC : match.baseAC - 10,
          equipped: result.filter((r) => r.type === (match.category === 'Shield' ? 'shield' : 'armor')).length === 0,
          type: match.category === 'Shield' ? 'shield' : 'armor',
          description: match.description,
          category: match.category.toLowerCase().replace(' armor', ''),
          dexCap: match.dexBonusMax,
          stealthDisadvantage: match.stealthDisadvantage,
          strength: (match as EquipmentArmorData).strengthRequirement
        })
      }
    }
    return { armor: result, matchedNames }
  } catch (error) {
    logger.error('[SaveSlice5e] Failed to build armor from equipment:', error)
    return { armor: [], matchedNames: new Set() }
  }
}

export async function buildWeaponsFromEquipment5e(
  equipment: Array<{ name: string; quantity: number }>
): Promise<{ weapons: import('../../../types/character-common').WeaponEntry[]; matchedNames: Set<string> }> {
  try {
    const eqData = await load5eEquipment()
    const weaponData = eqData.weapons ?? []
    const result: import('../../../types/character-common').WeaponEntry[] = []
    const matchedNames = new Set<string>()

    for (const item of equipment) {
      const nameLC = item.name.toLowerCase()
      const match = weaponData.find((w) => nameLC.includes(w.name.toLowerCase()))
      if (match) {
        matchedNames.add(item.name)
        result.push({
          id: crypto.randomUUID(),
          name: match.name,
          damage: match.damage,
          damageType: match.damageType,
          attackBonus: 0,
          properties: match.properties ?? [],
          description: match.description,
          proficient: true
        })
      }
    }
    return { weapons: result, matchedNames }
  } catch (error) {
    logger.error('[SaveSlice5e] Failed to build weapons from equipment:', error)
    return { weapons: [], matchedNames: new Set() }
  }
}
