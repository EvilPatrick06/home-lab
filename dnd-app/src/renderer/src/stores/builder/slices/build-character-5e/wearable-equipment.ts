/**
 * Builder wearable-equipment resolution — D&D 5e 2024
 *
 * Pure computation extracted from build-character-5e. Walks the assembled
 * equipment list, promoting recognised wearable items to clothing ArmorEntry
 * records, then returns the remaining (non-weapon, non-armor, non-wearable)
 * equipment with gear descriptions attached. No store get/set closure.
 */
import { isWearableItem } from '../../../../data/wearable-items'
import type { ArmorEntry } from '../../../../types/character-common'

export interface GearDataItem {
  name: string
  description?: string
  cost?: string
  price?: string
}

/** Minimal equipment-line shape consumed here (extra fields preserved on output). */
export interface EquipmentLine {
  name: string
  quantity: number
  source: string
}

export interface BuildWearableEquipmentResult {
  wearableArmor: ArmorEntry[]
  wearableMatchedNames: Set<string>
  filteredEquipment: Array<EquipmentLine & { description?: string }>
}

export function buildWearableEquipment5e(
  allEquipment: EquipmentLine[],
  weaponMatchedNames: Set<string>,
  armorMatchedNames: Set<string>,
  gearData: GearDataItem[]
): BuildWearableEquipmentResult {
  const wearableArmor: ArmorEntry[] = []
  const wearableMatchedNames = new Set<string>()
  for (const item of allEquipment) {
    if (weaponMatchedNames.has(item.name)) continue
    if (armorMatchedNames.has(item.name)) continue
    if (isWearableItem(item.name)) {
      wearableMatchedNames.add(item.name)
      const gearMatch = gearData.find((g) => g.name.toLowerCase() === item.name.toLowerCase())
      wearableArmor.push({
        id: crypto.randomUUID(),
        name: item.name,
        acBonus: 0,
        equipped: false,
        type: 'clothing',
        description: gearMatch?.description
      })
    }
  }

  const excludedNames = new Set([...weaponMatchedNames, ...armorMatchedNames, ...wearableMatchedNames])
  const filteredEquipment = allEquipment
    .filter((item) => !excludedNames.has(item.name))
    .map((item) => {
      const gearMatch = gearData.find((g) => g.name.toLowerCase() === item.name.toLowerCase())
      return { ...item, description: gearMatch?.description }
    })

  return { wearableArmor, wearableMatchedNames, filteredEquipment }
}
