import {
  getEffectiveArmor,
  getEffectiveMagicItems,
  getEffectiveWeapons
} from '../services/character/effective-character-5e'
import type { Character5e } from '../types/character-5e'

export interface CarryingCapacity {
  carry: number
  dragLiftPush: number
}

export type EncumbranceStatus = 'normal' | 'encumbered' | 'over-limit'

/**
 * Calculate carrying capacity by STR score and creature size.
 * Small/Medium: STR x 15, Drag = STR x 30
 * Tiny: x0.5, Large: x2, Huge: x4, Gargantuan: x8
 */
export function getCarryingCapacity(strScore: number, size: string = 'Medium'): CarryingCapacity {
  let multiplier = 1
  switch (size.toLowerCase()) {
    case 'tiny':
      multiplier = 0.5
      break
    case 'small':
    case 'medium':
      multiplier = 1
      break
    case 'large':
      multiplier = 2
      break
    case 'huge':
      multiplier = 4
      break
    case 'gargantuan':
      multiplier = 8
      break
  }

  return {
    carry: Math.floor(strScore * 15 * multiplier),
    dragLiftPush: Math.floor(strScore * 30 * multiplier)
  }
}

/**
 * Calculate total carried weight for a 5e character.
 * Sums weapons, armor, equipment, and magic items.
 */
export function calculateTotalWeight(character: Character5e): number {
  let total = 0

  // Weapons
  for (const w of getEffectiveWeapons(character)) {
    total += w.weight ?? 0
  }

  // Armor
  for (const a of getEffectiveArmor(character)) {
    total += a.weight ?? 0
  }

  // Equipment (gear items) — Phase 23m: weight is per-unit, so multiply by quantity
  // (a stack of 20 daggers weighed 1 lb total before this). Container `contents[]`
  // recursion is deferred: EquipmentItem has no contents field to recurse into
  // (logged to ISSUES-LOG-DNDAPP).
  for (const item of character.equipment ?? []) {
    total += (item.weight ?? 0) * (item.quantity ?? 1)
  }

  // Magic items
  for (const mi of getEffectiveMagicItems(character)) {
    total += mi.weight ?? 0
  }

  // Currency weight: 50 coins = 1 lb
  const currency = character.treasure ?? { cp: 0, sp: 0, gp: 0, pp: 0 }
  const totalCoins =
    (currency.cp ?? 0) + (currency.sp ?? 0) + (currency.ep ?? 0) + (currency.gp ?? 0) + (currency.pp ?? 0)
  total += totalCoins / 50

  return Math.round(total * 100) / 100
}

/**
 * Determine encumbrance status.
 */
export function getEncumbranceStatus(currentWeight: number, capacity: CarryingCapacity): EncumbranceStatus {
  if (currentWeight > capacity.dragLiftPush) return 'over-limit'
  if (currentWeight > capacity.carry) return 'encumbered'
  return 'normal'
}
