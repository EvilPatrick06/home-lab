/**
 * Encounter CR Calculator — 2024 DMG encounter budget tables.
 *
 * Provides XP budget lookups per party level, monster XP by CR,
 * group multipliers, and an overall difficulty rating for an encounter.
 */

// ---- XP Budget by Party Level & Difficulty ----------------------------------

const XP_BUDGET: Record<number, { low: number; moderate: number; high: number }> = {
  1: { low: 50, moderate: 75, high: 100 },
  2: { low: 100, moderate: 150, high: 200 },
  3: { low: 150, moderate: 225, high: 400 },
  4: { low: 250, moderate: 375, high: 500 },
  5: { low: 500, moderate: 750, high: 1100 },
  6: { low: 600, moderate: 1000, high: 1400 },
  7: { low: 750, moderate: 1300, high: 1700 },
  8: { low: 1000, moderate: 1700, high: 2100 },
  9: { low: 1300, moderate: 2000, high: 2600 },
  10: { low: 1600, moderate: 2300, high: 3100 },
  11: { low: 1900, moderate: 2900, high: 4100 },
  12: { low: 2200, moderate: 3700, high: 4700 },
  13: { low: 2600, moderate: 4200, high: 5400 },
  14: { low: 2900, moderate: 4900, high: 6200 },
  15: { low: 3300, moderate: 5400, high: 7800 },
  16: { low: 3800, moderate: 6100, high: 9800 },
  17: { low: 4500, moderate: 7200, high: 11500 },
  18: { low: 5000, moderate: 8700, high: 13500 },
  19: { low: 5500, moderate: 10700, high: 16000 },
  20: { low: 6400, moderate: 13500, high: 22000 }
}

// ---- Monster XP by CR ------------------------------------------------------

const CR_XP: Record<string, number> = {
  '0': 10,
  '1/8': 25,
  '1/4': 50,
  '1/2': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000
}

// ---- Group Multiplier -------------------------------------------------------

/**
 * Monster group multiplier per 2024 DMG.
 * More monsters make an encounter harder than raw XP suggests.
 */
function getGroupMultiplier(monsterCount: number): number {
  if (monsterCount <= 1) return 1
  if (monsterCount <= 6) return 1.5
  if (monsterCount <= 10) return 2
  if (monsterCount <= 14) return 2.5
  return 3
}

// ---- Public API -------------------------------------------------------------

export type EncounterDifficulty = 'None' | 'Low' | 'Moderate' | 'High' | 'Over Budget'

export interface EncounterBudget {
  low: number
  moderate: number
  high: number
}

export interface EncounterResult {
  difficulty: EncounterDifficulty
  totalXP: number
  adjustedXP: number
  budget: EncounterBudget
  multiplier: number
  monsterCount: number
}

/**
 * Get the XP value for a monster of the given CR.
 * Returns 0 for unrecognised CRs.
 */
export function getMonsterXP(cr: string): number {
  return CR_XP[cr] ?? 0
}

/**
 * Compute the total XP budget for a party given each member's level.
 * Each party member contributes their per-level budget to the total.
 */
export function getPartyBudget(partyLevels: number[]): EncounterBudget {
  let low = 0
  let moderate = 0
  let high = 0

  for (const level of partyLevels) {
    const clamped = Math.max(1, Math.min(20, level))
    const entry = XP_BUDGET[clamped]
    if (entry) {
      low += entry.low
      moderate += entry.moderate
      high += entry.high
    }
  }

  return { low, moderate, high }
}

/**
 * Calculate the difficulty of an encounter given the party levels and the
 * CRs of all monsters in the encounter.
 *
 * Returns the difficulty label, raw total XP, adjusted XP (with group
 * multiplier), the party budget thresholds, the multiplier, and monster count.
 */
export function calculateEncounterDifficulty(partyLevels: number[], monsterCRs: string[]): EncounterResult {
  const budget = getPartyBudget(partyLevels)
  const totalXP = monsterCRs.reduce((sum, cr) => sum + getMonsterXP(cr), 0)
  const multiplier = getGroupMultiplier(monsterCRs.length)
  const adjustedXP = Math.round(totalXP * multiplier)

  let difficulty: EncounterDifficulty = 'None'
  if (totalXP > 0) {
    if (adjustedXP < budget.low) difficulty = 'Low'
    else if (adjustedXP < budget.moderate) difficulty = 'Moderate'
    else if (adjustedXP < budget.high) difficulty = 'High'
    else difficulty = 'Over Budget'
  }

  return {
    difficulty,
    totalXP,
    adjustedXP,
    budget,
    multiplier,
    monsterCount: monsterCRs.length
  }
}
