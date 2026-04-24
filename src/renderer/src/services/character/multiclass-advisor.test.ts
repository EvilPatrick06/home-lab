import { describe, expect, it } from 'vitest'
import {
  getEligibleClasses,
  getMulticlassAdvice,
  getMulticlassGains,
  getMulticlassWarnings
} from './multiclass-advisor'

describe('multiclass-advisor', () => {
  const highStats: Record<string, number> = {
    strength: 16,
    dexterity: 14,
    constitution: 14,
    intelligence: 12,
    wisdom: 14,
    charisma: 16
  }

  const lowStats: Record<string, number> = {
    strength: 8,
    dexterity: 10,
    constitution: 12,
    intelligence: 10,
    wisdom: 10,
    charisma: 10
  }

  describe('getEligibleClasses', () => {
    it('returns all classes except current for high stats', () => {
      const result = getEligibleClasses(highStats, ['Fighter'])
      const eligible = result.filter((r) => r.eligible)
      expect(eligible.length).toBeGreaterThan(5)
      expect(result.find((r) => r.className === 'Fighter')).toBeUndefined()
    })

    it('returns few eligible for low stats', () => {
      const result = getEligibleClasses(lowStats, ['Fighter'])
      const eligible = result.filter((r) => r.eligible)
      expect(eligible.length).toBe(0)
    })

    it('Fighter requires STR 13 OR DEX 13', () => {
      const dexOnly = { ...lowStats, dexterity: 14 }
      const result = getEligibleClasses(dexOnly, ['Wizard'])
      const fighter = result.find((r) => r.className === 'Fighter')
      expect(fighter?.eligible).toBe(true)
    })

    it('Paladin requires both STR 13 AND CHA 13', () => {
      const strOnly = { ...lowStats, strength: 14 }
      const result = getEligibleClasses(strOnly, ['Fighter'])
      const paladin = result.find((r) => r.className === 'Paladin')
      expect(paladin?.eligible).toBe(false)
    })

    it('shows requirement details', () => {
      const result = getEligibleClasses(highStats, [])
      const barbarian = result.find((r) => r.className === 'Barbarian')
      expect(barbarian?.requirements[0]).toEqual({
        ability: 'strength',
        minimum: 13,
        current: 16,
        met: true
      })
    })
  })

  describe('getMulticlassGains', () => {
    it('returns gains for valid class', () => {
      const gains = getMulticlassGains('Fighter')
      expect(gains).not.toBeNull()
      expect(gains!.proficiencies).toContain('Martial weapons')
    })

    it('returns null for unknown class', () => {
      expect(getMulticlassGains('Artificer')).toBeNull()
    })
  })

  describe('getMulticlassWarnings', () => {
    it('returns warnings for classes with known issues', () => {
      const warnings = getMulticlassWarnings(['Barbarian', 'Monk'])
      expect(warnings).toHaveLength(2)
    })

    it('returns empty for classes without warnings', () => {
      const warnings = getMulticlassWarnings(['Wizard'])
      expect(warnings).toHaveLength(0)
    })
  })

  describe('getMulticlassAdvice', () => {
    it('returns full advice', () => {
      const advice = getMulticlassAdvice(highStats, ['Fighter'])
      expect(advice.eligible.length).toBeGreaterThan(0)
      expect(advice.gains.length).toBeGreaterThan(0)
    })
  })
})
