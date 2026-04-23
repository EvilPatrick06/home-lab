import { describe, expect, it } from 'vitest'
import { calculateEncounterDifficulty, getMonsterXP, getPartyBudget } from './encounter-cr-calculator'

describe('getMonsterXP', () => {
  it('returns XP for integer CRs', () => {
    expect(getMonsterXP('0')).toBe(10)
    expect(getMonsterXP('1')).toBe(200)
    expect(getMonsterXP('10')).toBe(5900)
    expect(getMonsterXP('20')).toBe(25000)
    expect(getMonsterXP('30')).toBe(155000)
  })

  it('returns XP for fractional CRs', () => {
    expect(getMonsterXP('1/8')).toBe(25)
    expect(getMonsterXP('1/4')).toBe(50)
    expect(getMonsterXP('1/2')).toBe(100)
  })

  it('returns 0 for unknown CRs', () => {
    expect(getMonsterXP('99')).toBe(0)
    expect(getMonsterXP('')).toBe(0)
    expect(getMonsterXP('invalid')).toBe(0)
  })
})

describe('getPartyBudget', () => {
  it('returns budget for a single level-1 character', () => {
    const budget = getPartyBudget([1])
    expect(budget).toEqual({ low: 50, moderate: 75, high: 100 })
  })

  it('sums budgets for a party of 4 level-5 characters', () => {
    const budget = getPartyBudget([5, 5, 5, 5])
    expect(budget).toEqual({ low: 2000, moderate: 3000, high: 4400 })
  })

  it('handles mixed-level parties', () => {
    const budget = getPartyBudget([3, 5])
    expect(budget.low).toBe(150 + 500)
    expect(budget.moderate).toBe(225 + 750)
    expect(budget.high).toBe(400 + 1100)
  })

  it('clamps levels below 1 to 1', () => {
    const budget = getPartyBudget([0, -1])
    expect(budget).toEqual({ low: 100, moderate: 150, high: 200 })
  })

  it('clamps levels above 20 to 20', () => {
    const budget = getPartyBudget([25])
    expect(budget).toEqual({ low: 6400, moderate: 13500, high: 22000 })
  })

  it('returns zeroes for an empty party', () => {
    expect(getPartyBudget([])).toEqual({ low: 0, moderate: 0, high: 0 })
  })
})

describe('calculateEncounterDifficulty', () => {
  const party4Lvl1 = [1, 1, 1, 1]
  // Budget: low=200, moderate=300, high=400

  it('returns None when no monsters are present', () => {
    const result = calculateEncounterDifficulty(party4Lvl1, [])
    expect(result.difficulty).toBe('None')
    expect(result.totalXP).toBe(0)
    expect(result.adjustedXP).toBe(0)
  })

  it('rates a single CR 0 monster as Low for level-1 party', () => {
    const result = calculateEncounterDifficulty(party4Lvl1, ['0'])
    expect(result.difficulty).toBe('Low')
    expect(result.totalXP).toBe(10)
    expect(result.adjustedXP).toBe(10) // 1 monster, x1 multiplier
    expect(result.multiplier).toBe(1)
  })

  it('rates a single CR 1 monster as Moderate for level-1 party', () => {
    const result = calculateEncounterDifficulty(party4Lvl1, ['1'])
    expect(result.difficulty).toBe('Moderate')
    expect(result.totalXP).toBe(200)
    expect(result.adjustedXP).toBe(200)
  })

  it('applies x1.5 multiplier for 2-6 monsters', () => {
    const result = calculateEncounterDifficulty(party4Lvl1, ['0', '0'])
    expect(result.multiplier).toBe(1.5)
    expect(result.totalXP).toBe(20)
    expect(result.adjustedXP).toBe(30)
  })

  it('applies x2 multiplier for 7-10 monsters', () => {
    const crs = Array(8).fill('0') as string[]
    const result = calculateEncounterDifficulty(party4Lvl1, crs)
    expect(result.multiplier).toBe(2)
    expect(result.totalXP).toBe(80)
    expect(result.adjustedXP).toBe(160)
  })

  it('applies x2.5 multiplier for 11-14 monsters', () => {
    const crs = Array(12).fill('0') as string[]
    const result = calculateEncounterDifficulty(party4Lvl1, crs)
    expect(result.multiplier).toBe(2.5)
  })

  it('applies x3 multiplier for 15+ monsters', () => {
    const crs = Array(15).fill('0') as string[]
    const result = calculateEncounterDifficulty(party4Lvl1, crs)
    expect(result.multiplier).toBe(3)
  })

  it('rates Over Budget when adjusted XP exceeds high threshold', () => {
    // Party of 4 level 1: high=400, 1 CR 5 = 1800 XP, adjusted 1800
    const result = calculateEncounterDifficulty(party4Lvl1, ['5'])
    expect(result.difficulty).toBe('Over Budget')
    expect(result.adjustedXP).toBe(1800)
  })

  it('handles high-level party vs high-CR monster', () => {
    const party = [20, 20, 20, 20]
    // Budget: low=25600, moderate=54000, high=88000
    // CR 30 = 155000 XP, x1 = 155000 → Over Budget
    const result = calculateEncounterDifficulty(party, ['30'])
    expect(result.difficulty).toBe('Over Budget')
    expect(result.totalXP).toBe(155000)
  })

  it('returns budget based on actual party levels', () => {
    const result = calculateEncounterDifficulty([10, 10], ['1'])
    expect(result.budget).toEqual({ low: 3200, moderate: 4600, high: 6200 })
    expect(result.difficulty).toBe('Low')
  })
})
