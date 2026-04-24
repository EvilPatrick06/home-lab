import { describe, expect, it } from 'vitest'
import {
  calculateEncumbrance,
  calculateLifestyleCost,
  getToolSkillAdvantage,
  sumEquipmentWeight
} from './stat-calculator-5e'

describe('encumbrance', () => {
  describe('calculateEncumbrance (standard rules)', () => {
    it('should be unencumbered when under capacity', () => {
      const result = calculateEncumbrance(10, 100)
      expect(result.status).toBe('unencumbered')
      expect(result.carryCapacity).toBe(150) // 10 * 15
      expect(result.pushDragLift).toBe(300) // 10 * 30
    })

    it('should be over-limit when over capacity', () => {
      const result = calculateEncumbrance(10, 200)
      expect(result.status).toBe('over-limit')
    })

    it('should calculate correctly for high STR', () => {
      const result = calculateEncumbrance(20, 200)
      expect(result.status).toBe('unencumbered')
      expect(result.carryCapacity).toBe(300)
    })
  })

  describe('calculateEncumbrance (variant rules)', () => {
    it('should be unencumbered below STR * 5', () => {
      const result = calculateEncumbrance(10, 40, true)
      expect(result.status).toBe('unencumbered')
    })

    it('should be encumbered between STR * 5 and STR * 10', () => {
      const result = calculateEncumbrance(10, 60, true)
      expect(result.status).toBe('encumbered')
      expect(result.speedPenalty).toContain('-10')
    })

    it('should be heavily encumbered between STR * 10 and STR * 15', () => {
      const result = calculateEncumbrance(10, 120, true)
      expect(result.status).toBe('heavily-encumbered')
      expect(result.speedPenalty).toContain('-20')
    })

    it('should be over-limit above STR * 15', () => {
      const result = calculateEncumbrance(10, 200, true)
      expect(result.status).toBe('over-limit')
    })

    it('should apply size multiplier for Large creatures', () => {
      const result = calculateEncumbrance(10, 250, false, 2) // Large = x2
      expect(result.carryCapacity).toBe(300) // 10 * 2 * 15
      expect(result.status).toBe('unencumbered')
    })
  })

  describe('sumEquipmentWeight', () => {
    it('should sum weapon weights', () => {
      const total = sumEquipmentWeight(
        [
          { weight: 3, quantity: 2 },
          { weight: 6, quantity: 1 }
        ],
        [],
        []
      )
      expect(total).toBe(12) // 3*2 + 6*1
    })

    it('should include armor weight', () => {
      const total = sumEquipmentWeight(
        [],
        [
          { weight: 65, equipped: true },
          { weight: 13, equipped: false }
        ],
        []
      )
      expect(total).toBe(78)
    })

    it('should include gear weight', () => {
      const total = sumEquipmentWeight([], [], [{ weight: 2, quantity: 5 }])
      expect(total).toBe(10)
    })

    it('should count coins at 50 per pound', () => {
      const total = sumEquipmentWeight([], [], [], { gp: 100 })
      expect(total).toBe(2) // 100 / 50
    })

    it('should handle missing weights', () => {
      const total = sumEquipmentWeight([{ quantity: 2 }], [{ equipped: true }], [{ quantity: 5 }])
      expect(total).toBe(0)
    })
  })

  describe('calculateLifestyleCost', () => {
    it('should return 0 for wretched lifestyle', () => {
      expect(calculateLifestyleCost('wretched', 10)).toBe(0)
    })

    it('should calculate modest lifestyle cost', () => {
      expect(calculateLifestyleCost('modest', 7)).toBe(7) // 1 gp/day * 7 days
    })

    it('should calculate comfortable lifestyle cost', () => {
      expect(calculateLifestyleCost('comfortable', 30)).toBe(60) // 2 gp/day * 30 days
    })

    it('should calculate aristocratic lifestyle cost', () => {
      expect(calculateLifestyleCost('aristocratic', 1)).toBe(10)
    })
  })

  describe('getToolSkillAdvantage', () => {
    it('should find matching tool-skill interaction', () => {
      const result = getToolSkillAdvantage(["Thieves' Tools"], 'Investigation')
      expect(result).not.toBeNull()
      expect(result!.tool).toBe("Thieves' Tools")
    })

    it('should return null for no matching proficiency', () => {
      const result = getToolSkillAdvantage(["Painter's Supplies"], 'Athletics')
      expect(result).toBeNull()
    })

    it('should match case-insensitively', () => {
      const result = getToolSkillAdvantage(['herbalism kit'], 'medicine')
      expect(result).not.toBeNull()
    })

    it('should return null for empty proficiencies', () => {
      const result = getToolSkillAdvantage([], 'Investigation')
      expect(result).toBeNull()
    })
  })
})
