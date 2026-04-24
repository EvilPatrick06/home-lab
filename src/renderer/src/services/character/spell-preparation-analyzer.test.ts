import { describe, expect, it } from 'vitest'
import {
  analyzePreparation,
  analyzeSpellDiversity,
  getConcentrationConflicts,
  getRitualSpells
} from './spell-preparation-analyzer'

describe('spell-preparation-analyzer', () => {
  const mockSpells = [
    { name: 'Shield', school: 'Abjuration', level: 1, concentration: false, ritual: false },
    { name: 'Magic Missile', school: 'Evocation', level: 1, concentration: false, ritual: false },
    { name: 'Bless', school: 'Enchantment', level: 1, concentration: true, ritual: false },
    { name: 'Hold Person', school: 'Enchantment', level: 2, concentration: true, ritual: false },
    { name: 'Fireball', school: 'Evocation', level: 3, concentration: false, ritual: false }
  ]

  describe('analyzeSpellDiversity', () => {
    it('returns empty array for no spells', () => {
      expect(analyzeSpellDiversity([])).toEqual([])
    })

    it('counts schools correctly', () => {
      const result = analyzeSpellDiversity(mockSpells)
      const evocation = result.find((r) => r.school === 'Evocation')
      expect(evocation?.count).toBe(2)
      expect(evocation?.percentage).toBe(40)
    })

    it('sorts by count descending', () => {
      const result = analyzeSpellDiversity(mockSpells)
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].count).toBeGreaterThanOrEqual(result[i].count)
      }
    })
  })

  describe('getConcentrationConflicts', () => {
    it('finds concentration spells', () => {
      const { spells } = getConcentrationConflicts(mockSpells)
      expect(spells).toHaveLength(2)
      expect(spells.map((s) => s.spellName)).toContain('Bless')
      expect(spells.map((s) => s.spellName)).toContain('Hold Person')
    })

    it('warns when concentration ratio exceeds 40%', () => {
      const heavyConc = [
        { name: 'A', level: 1, concentration: true },
        { name: 'B', level: 1, concentration: true },
        { name: 'C', level: 1, concentration: true },
        { name: 'D', level: 1, concentration: false },
        { name: 'E', level: 1, concentration: false }
      ]
      const { isWarning } = getConcentrationConflicts(heavyConc)
      expect(isWarning).toBe(true)
    })

    it('does not warn for reasonable ratio', () => {
      const { isWarning } = getConcentrationConflicts(mockSpells)
      expect(isWarning).toBe(false)
    })
  })

  describe('getRitualSpells', () => {
    it('suggests unprepared ritual spells', () => {
      const known = [
        { name: 'Detect Magic', level: 1, ritual: true },
        { name: 'Shield', level: 1, ritual: false }
      ]
      const result = getRitualSpells(mockSpells, known)
      expect(result).toHaveLength(1)
      expect(result[0].spellName).toBe('Detect Magic')
    })

    it('does not suggest already prepared rituals', () => {
      const prepared = [{ name: 'Detect Magic', school: 'Divination', level: 1, ritual: true }]
      const known = [{ name: 'Detect Magic', level: 1, ritual: true }]
      const result = getRitualSpells(prepared, known)
      expect(result).toHaveLength(0)
    })
  })

  describe('analyzePreparation', () => {
    it('returns full analysis', () => {
      const known = [{ name: 'Detect Magic', level: 1, ritual: true }]
      const result = analyzePreparation(mockSpells, known)
      expect(result.totalPrepared).toBe(5)
      expect(result.diversity.length).toBeGreaterThan(0)
      expect(result.concentrationSpells).toHaveLength(2)
      expect(result.ritualSuggestions).toHaveLength(1)
      expect(result.missingSchools).toContain('Conjuration')
      expect(result.missingSchools).toContain('Divination')
    })
  })
})
