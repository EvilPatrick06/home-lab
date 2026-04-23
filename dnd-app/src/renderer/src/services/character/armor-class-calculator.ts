import type { ArmorClassOptions } from './stat-calculator-5e'

/**
 * Armor Class Calculator — PHB 2024 Chapter 1 AC rules.
 *
 * Handles all AC formulas: armor, unarmored defense (Barbarian/Monk),
 * Draconic Resilience (Sorcerer), shields, and effect bonuses.
 */

export function calculateArmorClass5e(options: ArmorClassOptions): number {
  const {
    dexMod,
    armor,
    classNames = [],
    conMod = 0,
    wisMod = 0,
    draconicSorcererLevel = 0,
    acBonusFromEffects = 0
  } = options

  const equippedArmor = armor.find((a) => a.type === 'armor' && a.equipped)
  const equippedShield = armor.find((a) => a.type === 'shield' && a.equipped)

  let baseAC: number

  if (equippedArmor) {
    const cat = equippedArmor.category?.toLowerCase()
    if (cat === 'heavy') {
      baseAC = 10 + equippedArmor.acBonus
    } else if (cat === 'medium') {
      const dexBonus = Math.min(dexMod, equippedArmor.dexCap ?? 2)
      baseAC = 10 + equippedArmor.acBonus + dexBonus
    } else {
      baseAC = 10 + equippedArmor.acBonus + dexMod
    }
  } else {
    // No armor equipped — check unarmored defense options, take highest
    baseAC = 10 + dexMod

    const classNamesLower = classNames.map((c) => c.toLowerCase())

    if (classNamesLower.includes('barbarian')) {
      baseAC = Math.max(baseAC, 10 + dexMod + conMod)
    }
    if (classNamesLower.includes('monk')) {
      baseAC = Math.max(baseAC, 10 + dexMod + wisMod)
    }
    if (draconicSorcererLevel >= 3) {
      baseAC = Math.max(baseAC, 13 + dexMod)
    }
  }

  if (equippedShield) {
    baseAC += equippedShield.acBonus
  }

  baseAC += acBonusFromEffects

  return baseAC
}
