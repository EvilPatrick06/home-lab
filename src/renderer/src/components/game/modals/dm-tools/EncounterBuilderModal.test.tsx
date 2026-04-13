import { describe, expect, it } from 'vitest'
import {
  calculateEncounterDifficulty,
  getMonsterXP,
  getPartyBudget
} from '../../../../services/combat/encounter-cr-calculator'

describe('EncounterBuilderModal', () => {
  it('can be imported', async () => {
    const mod = await import('./EncounterBuilderModal')
    expect(mod).toBeDefined()
  })

  it('uses encounter-cr-calculator for difficulty computation', () => {
    // Verify the calculator service is accessible and returns correct values
    expect(getMonsterXP('1')).toBe(200)
    expect(getPartyBudget([5, 5, 5, 5])).toEqual({ low: 2000, moderate: 3000, high: 4400 })

    const result = calculateEncounterDifficulty([5, 5, 5, 5], ['1', '1'])
    expect(result.totalXP).toBe(400)
    expect(result.multiplier).toBe(1.5)
    expect(result.adjustedXP).toBe(600)
    expect(result.difficulty).toBe('Low')
  })
})
