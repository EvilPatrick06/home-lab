/**
 * Single source of truth for 2024 DMG encounter XP budgets.
 *
 * Per character level, by difficulty (low / moderate / high). The renderer's
 * encounter-cr-calculator (used by the encounter builder UI) AND the main-process
 * AI context-builder both import this, so the AI balances encounters against the
 * exact same thresholds the UI shows at game time. (Previously the two diverged —
 * e.g. level 6 moderate was 1000 in the UI but 900 in the AI context.)
 */

export interface XpBudgetTier {
  low: number
  moderate: number
  high: number
}

/** 2024 Dungeon Master's Guide, "Combat Encounters" XP budget per character. */
export const XP_BUDGET_BY_LEVEL: Record<number, XpBudgetTier> = {
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

/** Look up the per-character XP budget for a level, clamped to the 1–20 table. */
export function getLevelBudget(level: number): XpBudgetTier {
  const clamped = Math.max(1, Math.min(20, Math.round(level)))
  return XP_BUDGET_BY_LEVEL[clamped] ?? XP_BUDGET_BY_LEVEL[1]
}
