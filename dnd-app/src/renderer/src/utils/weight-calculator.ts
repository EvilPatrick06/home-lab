import {
  getEffectiveArmor,
  getEffectiveMagicItems,
  getEffectiveWeapons
} from '../services/character/effective-character-5e'
import type { Character5e, EquipmentItem } from '../types/character-5e'

export interface CarryingCapacity {
  carry: number
  dragLiftPush: number
}

/**
 * Weight of an equipment item including nested container `contents` (PHASE-13 13I).
 * `contents` is plain JSON so genuine cycles can't persist, but imported data is
 * untrusted — a depth-8 cap is the abuse/cycle guard.
 */
function equipmentItemWeight(item: EquipmentItem, depth = 0): number {
  if (depth >= 8) return 0
  let w = (item.weight ?? 0) * (item.quantity ?? 1)
  if (item.contents) {
    for (const c of item.contents) w += equipmentItemWeight(c, depth + 1)
  }
  return w
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

  // Equipment (gear items) — Phase 23m: weight is per-unit, so multiply by quantity.
  // PHASE-13 13I: a container's `contents[]` weight recurses into the total (depth-capped).
  for (const item of character.equipment ?? []) {
    total += equipmentItemWeight(item)
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
