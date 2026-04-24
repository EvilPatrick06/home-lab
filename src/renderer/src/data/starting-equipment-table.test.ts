import { beforeAll, describe, expect, it, vi } from 'vitest'

// Mock the async data-provider before importing the module
vi.mock('../services/data-provider', () => ({
  load5eStartingEquipment: vi.fn(() =>
    Promise.resolve([
      { minLevel: 2, maxLevel: 4, baseGold: 200, diceCount: 1, diceMultiplier: 25, magicItems: { common: 1 } },
      {
        minLevel: 5,
        maxLevel: 10,
        baseGold: 500,
        diceCount: 1,
        diceMultiplier: 25,
        magicItems: { common: 1, uncommon: 1 }
      },
      {
        minLevel: 11,
        maxLevel: 16,
        baseGold: 5000,
        diceCount: 1,
        diceMultiplier: 250,
        magicItems: { common: 2, uncommon: 1, rare: 1 }
      },
      {
        minLevel: 17,
        maxLevel: 20,
        baseGold: 20000,
        diceCount: 1,
        diceMultiplier: 250,
        magicItems: { uncommon: 2, rare: 1, 'very rare': 1 }
      }
    ])
  )
}))

import { getHigherLevelEquipment, getStartingGoldBonus, rollStartingGold } from './starting-equipment-table'

describe('starting-equipment-table', () => {
  // Allow the fire-and-forget promise in the module to settle
  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  describe('getHigherLevelEquipment', () => {
    it('returns null for level 1 (standard starting equipment)', () => {
      expect(getHigherLevelEquipment(1)).toBeNull()
    })

    it('returns null for level 0 or negative', () => {
      expect(getHigherLevelEquipment(0)).toBeNull()
      expect(getHigherLevelEquipment(-1)).toBeNull()
    })

    it('returns equipment for level 2 (DMG higher-level starting equipment)', () => {
      const eq = getHigherLevelEquipment(2)
      expect(eq).not.toBeNull()
      expect(eq!.baseGold).toBe(200)
      expect(eq!.diceCount).toBe(1)
      expect(eq!.diceMultiplier).toBe(25)
    })

    it('returns correct tier for level 5-10', () => {
      const eq = getHigherLevelEquipment(5)
      expect(eq).not.toBeNull()
      expect(eq!.baseGold).toBe(500)
    })

    it('returns correct tier for level 11-16', () => {
      const eq = getHigherLevelEquipment(11)
      expect(eq).not.toBeNull()
      expect(eq!.baseGold).toBe(5000)
      expect(eq!.diceMultiplier).toBe(250)
    })

    it('returns correct tier for level 17-20', () => {
      const eq = getHigherLevelEquipment(17)
      expect(eq).not.toBeNull()
      expect(eq!.baseGold).toBe(20000)
    })

    it('includes magic items in the equipment', () => {
      const eq = getHigherLevelEquipment(11)
      expect(eq).not.toBeNull()
      expect(eq!.magicItems).toHaveProperty('common')
      expect(eq!.magicItems).toHaveProperty('rare')
    })
  })

  describe('getStartingGoldBonus', () => {
    it('returns zeroed bonus for level 1', () => {
      const bonus = getStartingGoldBonus(1)
      expect(bonus).toEqual({ base: 0, diceCount: 0, diceMultiplier: 0 })
    })

    it('returns correct bonus for higher levels', () => {
      const bonus = getStartingGoldBonus(5)
      expect(bonus.base).toBe(500)
      expect(bonus.diceCount).toBe(1)
      expect(bonus.diceMultiplier).toBe(25)
    })

    it('returns an object with base, diceCount, diceMultiplier', () => {
      const bonus = getStartingGoldBonus(3)
      expect(bonus).toHaveProperty('base')
      expect(bonus).toHaveProperty('diceCount')
      expect(bonus).toHaveProperty('diceMultiplier')
      expect(typeof bonus.base).toBe('number')
      expect(typeof bonus.diceCount).toBe('number')
      expect(typeof bonus.diceMultiplier).toBe('number')
    })
  })

  describe('rollStartingGold', () => {
    it('returns base (0) for level 1 with no dice', () => {
      const gold = rollStartingGold(1)
      expect(gold).toBe(0)
    })

    it('returns a number for higher levels', () => {
      const gold = rollStartingGold(5)
      expect(typeof gold).toBe('number')
    })

    it('returns value >= base gold for the tier', () => {
      for (let i = 0; i < 10; i++) {
        const gold = rollStartingGold(5)
        // base is 500, roll is 1d10 * 25, so minimum is 500 + 1*25 = 525
        expect(gold).toBeGreaterThanOrEqual(525)
        // max is 500 + 10*25 = 750
        expect(gold).toBeLessThanOrEqual(750)
      }
    })

    it('returns a non-negative value', () => {
      for (let i = 0; i < 10; i++) {
        expect(rollStartingGold(1)).toBeGreaterThanOrEqual(0)
      }
    })
  })
})
