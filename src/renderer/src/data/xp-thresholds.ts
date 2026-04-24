import { load5eXpThresholds } from '../services/data-provider'
import { logger } from '../utils/logger'

// 5e XP thresholds: XP required to reach each level (index = level)
const XP_THRESHOLDS_5E: number[] = [
  0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000,
  265000, 305000, 355000
]

// Overwrite with JSON data when available
load5eXpThresholds()
  .then((data) => {
    XP_THRESHOLDS_5E.length = 0
    XP_THRESHOLDS_5E.push(...data)
  })
  .catch((e) => logger.warn('Failed to load XP thresholds data', e))

export function xpThresholdForLevel(level: number): number {
  return XP_THRESHOLDS_5E[Math.min(level, 20)] ?? 0
}

export function xpThresholdForNextLevel(currentLevel: number): number {
  if (currentLevel >= 20) return Infinity
  return xpThresholdForLevel(currentLevel + 1)
}

export function shouldLevelUp(currentLevel: number, xp: number): boolean {
  if (currentLevel >= 20) return false
  return xp >= xpThresholdForNextLevel(currentLevel)
}

// PHB 2024 p.43: After level 20, gain 1 feat per 30,000 XP above 355,000
export function getBonusFeatCount(xp: number): number {
  if (xp <= 355000) return 0
  return Math.floor((xp - 355000) / 30000)
}
