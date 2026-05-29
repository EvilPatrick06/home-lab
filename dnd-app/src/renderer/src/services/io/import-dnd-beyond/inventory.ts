/**
 * Inventory extraction for the D&D Beyond import.
 * Splits the DDB inventory list into equipment, weapons, and armor entries.
 */

import type { EquipmentItem } from '../../../types/character-5e'
import type { ArmorEntry, WeaponEntry } from '../../../types/character-common'

export function extractInventory(data: Record<string, unknown>): {
  equipment: EquipmentItem[]
  weapons: WeaponEntry[]
  armor: ArmorEntry[]
} {
  const equipment: EquipmentItem[] = []
  const weapons: WeaponEntry[] = []
  const armor: ArmorEntry[] = []

  if (!Array.isArray(data.inventory)) return { equipment, weapons, armor }

  for (const item of data.inventory) {
    const def = item.definition
    if (!def) continue

    const name = def.name ?? 'Unknown Item'
    const quantity = item.quantity ?? 1
    const weight = def.weight ?? undefined
    const description = def.description ?? def.snippet ?? ''
    const equipped = item.equipped ?? false
    const filterType = def.filterType ?? ''
    const cost = def.cost ? `${def.cost} gp` : undefined

    if (filterType === 'Weapon' || def.type === 'Weapon') {
      const damage = (def.damage?.diceString ?? def.fixedDamage) ? `${def.fixedDamage}` : '1d4'
      const damageType = def.damageType?.toLowerCase() ?? 'bludgeoning'
      const properties = Array.isArray(def.properties) ? def.properties.map((p: { name?: string }) => p.name ?? '') : []
      const range = def.range ? `${def.range}/${def.longRange ?? def.range * 3}` : undefined

      weapons.push({
        id: crypto.randomUUID(),
        name,
        damage,
        damageType,
        attackBonus: 0,
        properties,
        description: description.replace(/<[^>]*>/g, ''),
        range,
        proficient: true,
        cost,
        weight
      })
    } else if (filterType === 'Armor' || def.armorClass) {
      const armorType = def.type?.toLowerCase().includes('shield')
        ? ('shield' as const)
        : def.armorTypeId
          ? ('armor' as const)
          : ('clothing' as const)

      armor.push({
        id: crypto.randomUUID(),
        name,
        acBonus: def.armorClass ?? 0,
        equipped,
        type: armorType,
        description: description.replace(/<[^>]*>/g, ''),
        stealthDisadvantage: def.stealthCheck === 1 ? true : undefined,
        strength: typeof def.strengthRequirement === 'number' ? def.strengthRequirement : undefined,
        cost,
        weight
      })
    } else {
      equipment.push({
        name,
        quantity,
        weight,
        description: description.replace(/<[^>]*>/g, '').slice(0, 300),
        equipped,
        cost,
        type: filterType || undefined
      })
    }
  }

  return { equipment, weapons, armor }
}
