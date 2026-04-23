import { addToast } from '../hooks/use-toast'
import { load5eStartingEquipment } from '../services/data-provider'
import type { MagicItemRarity5e } from '../types/character-common'
import { logger } from '../utils/logger'

export interface HigherLevelEquipment {
  baseGold: number
  diceCount: number
  diceMultiplier: number
  magicItems: Partial<Record<MagicItemRarity5e, number>>
}

interface RawEntry {
  minLevel: number
  maxLevel: number
  baseGold: number
  diceCount: number
  diceMultiplier: number
  magicItems: Record<string, number>
}

const HIGHER_LEVEL_TABLE: Array<{ minLevel: number; maxLevel: number; equipment: HigherLevelEquipment }> = []

load5eStartingEquipment()
  .then((data) => {
    HIGHER_LEVEL_TABLE.length = 0
    for (const entry of data as RawEntry[]) {
      HIGHER_LEVEL_TABLE.push({
        minLevel: entry.minLevel,
        maxLevel: entry.maxLevel,
        equipment: {
          baseGold: entry.baseGold,
          diceCount: entry.diceCount,
          diceMultiplier: entry.diceMultiplier,
          magicItems: entry.magicItems as Partial<Record<MagicItemRarity5e, number>>
        }
      })
    }
  })
  .catch((err) => {
    logger.error('Failed to load starting equipment', err)
    addToast('Failed to load starting equipment', 'error')
  })

/**
 * Get the higher-level starting equipment for a given character level.
 * Returns null for level 1 (no bonus equipment).
 */
export function getHigherLevelEquipment(level: number): HigherLevelEquipment | null {
  if (level < 2) return null
  const entry = HIGHER_LEVEL_TABLE.find((e) => level >= e.minLevel && level <= e.maxLevel)
  return entry?.equipment ?? null
}

/**
 * Get starting gold bonus info for a given level.
 * Returns { base, diceCount, diceMultiplier } for display and rolling.
 */
export function getStartingGoldBonus(level: number): { base: number; diceCount: number; diceMultiplier: number } {
  const eq = getHigherLevelEquipment(level)
  if (!eq) return { base: 0, diceCount: 0, diceMultiplier: 0 }
  return { base: eq.baseGold, diceCount: eq.diceCount, diceMultiplier: eq.diceMultiplier }
}

/**
 * Roll the random gold component (1d10 * multiplier).
 */
export function rollStartingGold(level: number): number {
  const bonus = getStartingGoldBonus(level)
  if (bonus.diceCount === 0) return bonus.base
  const roll = Math.floor(Math.random() * 10) + 1 // 1d10
  return bonus.base + roll * bonus.diceMultiplier
}
