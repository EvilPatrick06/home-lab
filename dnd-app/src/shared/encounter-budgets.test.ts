import { describe, expect, it } from 'vitest'
import { getLevelBudget, XP_BUDGET_BY_LEVEL } from './encounter-budgets'

describe('encounter-budgets (shared XP budget source of truth)', () => {
  it('covers levels 1–20', () => {
    for (let lvl = 1; lvl <= 20; lvl++) {
      expect(XP_BUDGET_BY_LEVEL[lvl]).toBeDefined()
    }
  })

  it('uses the official 2024 DMG value for level 6 moderate (1000, not the old 900)', () => {
    expect(XP_BUDGET_BY_LEVEL[6].moderate).toBe(1000)
  })

  it('budgets increase monotonically low < moderate < high', () => {
    for (let lvl = 1; lvl <= 20; lvl++) {
      const t = XP_BUDGET_BY_LEVEL[lvl]
      expect(t.low).toBeLessThan(t.moderate)
      expect(t.moderate).toBeLessThan(t.high)
    }
  })

  describe('getLevelBudget', () => {
    it('returns the exact tier for an in-range level', () => {
      expect(getLevelBudget(6)).toEqual({ low: 600, moderate: 1000, high: 1400 })
    })

    it('clamps below 1 to level 1', () => {
      expect(getLevelBudget(0)).toEqual(XP_BUDGET_BY_LEVEL[1])
      expect(getLevelBudget(-5)).toEqual(XP_BUDGET_BY_LEVEL[1])
    })

    it('clamps above 20 to level 20', () => {
      expect(getLevelBudget(99)).toEqual(XP_BUDGET_BY_LEVEL[20])
    })

    it('rounds fractional levels', () => {
      expect(getLevelBudget(6.4)).toEqual(XP_BUDGET_BY_LEVEL[6])
      expect(getLevelBudget(6.6)).toEqual(XP_BUDGET_BY_LEVEL[7])
    })
  })
})
