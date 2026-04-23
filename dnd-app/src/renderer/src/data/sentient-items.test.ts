import { beforeAll, describe, expect, it, vi } from 'vitest'

// Mock data-provider with DMG 2024 sentient item tables
vi.mock('../services/data-provider', () => ({
  load5eSentientItems: vi.fn(() =>
    Promise.resolve({
      alignmentTable: [
        { min: 1, max: 15, alignment: 'Chaotic Good' },
        { min: 16, max: 35, alignment: 'Lawful Good' },
        { min: 36, max: 50, alignment: 'Neutral Good' },
        { min: 51, max: 65, alignment: 'Chaotic Neutral' },
        { min: 66, max: 75, alignment: 'Lawful Neutral' },
        { min: 76, max: 80, alignment: 'True Neutral' },
        { min: 81, max: 90, alignment: 'Lawful Evil' },
        { min: 91, max: 96, alignment: 'Neutral Evil' },
        { min: 97, max: 100, alignment: 'Chaotic Evil' }
      ],
      communicationTable: [
        { min: 1, max: 6, method: 'empathy', description: 'The item communicates by transmitting emotions.' },
        {
          min: 7,
          max: 9,
          method: 'speech',
          description: 'The item can speak, read, and understand one or more languages.'
        },
        { min: 10, max: 10, method: 'telepathy', description: 'The item can communicate telepathically.' }
      ],
      sensesTable: [
        { roll: 1, senses: 'Hearing and normal vision out to 30 feet' },
        { roll: 2, senses: 'Hearing and normal vision out to 60 feet' },
        { roll: 3, senses: 'Hearing and normal vision out to 120 feet' },
        { roll: 4, senses: 'Hearing and darkvision out to 120 feet' }
      ],
      specialPurposes: [
        {
          roll: 1,
          name: 'Aligned',
          description: 'The item seeks to defeat entities of a diametrically opposed alignment.'
        },
        { roll: 2, name: 'Bane', description: 'The item seeks to defeat a specific creature type.' },
        {
          roll: 3,
          name: 'Protector',
          description: 'The item seeks to defend a particular species or kind of creature.'
        },
        { roll: 4, name: 'Crusader', description: 'The item seeks to defeat servants of a particular deity.' },
        { roll: 5, name: 'Templar', description: 'The item seeks to defend the servants of a particular deity.' },
        {
          roll: 6,
          name: 'Destroyer',
          description: 'The item craves destruction and goads its user to fight arbitrarily.'
        },
        {
          roll: 7,
          name: 'Glory Seeker',
          description: 'The item seeks renown as the greatest magic item in the world.'
        },
        { roll: 8, name: 'Lore Seeker', description: 'The item craves knowledge or is determined to solve a mystery.' },
        {
          roll: 9,
          name: 'Destiny Seeker',
          description: 'The item is convinced it has a special role to play in future events.'
        },
        {
          roll: 10,
          name: 'Creator Seeker',
          description: 'The item seeks its creator and wants to understand its purpose.'
        }
      ],
      conflictDemands: [
        { name: 'Generosity', description: 'The item demands that its wielder donate to the poor.' },
        { name: 'Gluttony', description: 'The item demands food and drink at every opportunity.' },
        { name: 'Aggression', description: 'The item demands blood; it urges the wielder to attack enemies on sight.' }
      ]
    })
  )
}))

import { CONFLICT_DEMANDS, generateSentientItem, SPECIAL_PURPOSES } from './sentient-items'

describe('sentient-items', () => {
  // Allow the fire-and-forget promise in the module to settle
  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  describe('SPECIAL_PURPOSES', () => {
    it('exports SPECIAL_PURPOSES as an array', () => {
      expect(Array.isArray(SPECIAL_PURPOSES)).toBe(true)
    })

    it('has entries after async load', () => {
      expect(SPECIAL_PURPOSES.length).toBeGreaterThan(0)
    })

    it('each purpose has roll, name, and description', () => {
      for (const purpose of SPECIAL_PURPOSES) {
        expect(typeof purpose.roll).toBe('number')
        expect(typeof purpose.name).toBe('string')
        expect(purpose.name.length).toBeGreaterThan(0)
        expect(typeof purpose.description).toBe('string')
        expect(purpose.description.length).toBeGreaterThan(0)
      }
    })

    it('contains DMG special purpose types', () => {
      const names = SPECIAL_PURPOSES.map((p) => p.name)
      expect(names).toContain('Aligned')
      expect(names).toContain('Bane')
      expect(names).toContain('Protector')
    })
  })

  describe('CONFLICT_DEMANDS', () => {
    it('exports CONFLICT_DEMANDS as an array', () => {
      expect(Array.isArray(CONFLICT_DEMANDS)).toBe(true)
    })

    it('has entries after async load', () => {
      expect(CONFLICT_DEMANDS.length).toBeGreaterThan(0)
    })

    it('each demand has name and description', () => {
      for (const demand of CONFLICT_DEMANDS) {
        expect(typeof demand.name).toBe('string')
        expect(demand.name.length).toBeGreaterThan(0)
        expect(typeof demand.description).toBe('string')
        expect(demand.description.length).toBeGreaterThan(0)
      }
    })
  })

  describe('generateSentientItem', () => {
    it('returns a SentientItemProperties object', () => {
      const item = generateSentientItem()
      expect(item).toHaveProperty('alignment')
      expect(item).toHaveProperty('communication')
      expect(item).toHaveProperty('senses')
      expect(item).toHaveProperty('mentalScores')
      expect(item).toHaveProperty('specialPurpose')
    })

    it('alignment is a non-empty string', () => {
      const item = generateSentientItem()
      expect(typeof item.alignment).toBe('string')
      expect(item.alignment.length).toBeGreaterThan(0)
    })

    it('communication has method and description', () => {
      const item = generateSentientItem()
      expect(typeof item.communication.method).toBe('string')
      expect(['empathy', 'speech', 'telepathy']).toContain(item.communication.method)
    })

    it('senses is a string', () => {
      const item = generateSentientItem()
      expect(typeof item.senses).toBe('string')
    })

    it('mentalScores contains intelligence, wisdom, charisma', () => {
      const item = generateSentientItem()
      expect(typeof item.mentalScores.intelligence).toBe('number')
      expect(typeof item.mentalScores.wisdom).toBe('number')
      expect(typeof item.mentalScores.charisma).toBe('number')
    })

    it('mental scores are within 4d6-drop-lowest range (3-18)', () => {
      // Run multiple times to increase confidence
      for (let i = 0; i < 20; i++) {
        const item = generateSentientItem()
        for (const score of [item.mentalScores.intelligence, item.mentalScores.wisdom, item.mentalScores.charisma]) {
          expect(score).toBeGreaterThanOrEqual(3)
          expect(score).toBeLessThanOrEqual(18)
        }
      }
    })

    it('specialPurpose has name and description', () => {
      const item = generateSentientItem()
      expect(typeof item.specialPurpose.name).toBe('string')
      expect(typeof item.specialPurpose.description).toBe('string')
    })

    it('generates different items on repeated calls (randomness)', () => {
      const items = Array.from({ length: 20 }, () => generateSentientItem())
      // At least some variation expected across 20 random items
      const alignments = new Set(items.map((i) => i.alignment))
      const scores = new Set(items.map((i) => i.mentalScores.intelligence))
      // With random generation, we expect at least some variety
      expect(alignments.size + scores.size).toBeGreaterThan(2)
    })
  })
})
