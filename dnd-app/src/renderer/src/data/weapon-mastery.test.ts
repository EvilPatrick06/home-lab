import { beforeAll, describe, expect, it, vi } from 'vitest'

// Mock data-provider with the 2024 PHB weapon mastery properties
vi.mock('../services/data-provider', () => ({
  load5eWeaponMastery: vi.fn(() =>
    Promise.resolve([
      { name: 'Cleave', description: 'On hit, deal damage to an adjacent creature equal to ability modifier.' },
      { name: 'Graze', description: 'On miss, deal damage equal to ability modifier.' },
      { name: 'Nick', description: 'Make the extra attack from Light property as part of the Attack action.' },
      { name: 'Push', description: 'On hit, push the target 10 feet away.' },
      { name: 'Sap', description: 'On hit, target has Disadvantage on its next attack roll.' },
      { name: 'Slow', description: "On hit, target's Speed is reduced by 10 feet until start of your next turn." },
      { name: 'Topple', description: 'On hit, target must succeed on a CON save or be knocked Prone.' },
      { name: 'Vex', description: 'On hit, you have Advantage on your next attack roll against that creature.' }
    ])
  )
}))

import { getMasteryDescription, WEAPON_MASTERY_PROPERTIES } from './weapon-mastery'

describe('weapon-mastery', () => {
  // Allow the fire-and-forget promise in the module to settle
  beforeAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10))
  })

  describe('WEAPON_MASTERY_PROPERTIES', () => {
    it('exports WEAPON_MASTERY_PROPERTIES as a record', () => {
      expect(WEAPON_MASTERY_PROPERTIES).toBeDefined()
      expect(typeof WEAPON_MASTERY_PROPERTIES).toBe('object')
    })

    it('each mastery has a name and description', () => {
      for (const [key, mastery] of Object.entries(WEAPON_MASTERY_PROPERTIES)) {
        expect(typeof mastery.name).toBe('string')
        expect(mastery.name).toBe(key)
        expect(typeof mastery.description).toBe('string')
        expect(mastery.description.length).toBeGreaterThan(0)
      }
    })

    it('contains all 8 PHB 2024 weapon mastery properties', () => {
      const expected = ['Cleave', 'Graze', 'Nick', 'Push', 'Sap', 'Slow', 'Topple', 'Vex']
      for (const name of expected) {
        expect(WEAPON_MASTERY_PROPERTIES[name], `Missing mastery: ${name}`).toBeDefined()
      }
    })
  })

  describe('getMasteryDescription', () => {
    it('returns description for a known mastery', () => {
      const desc = getMasteryDescription('Cleave')
      expect(typeof desc).toBe('string')
      expect(desc.length).toBeGreaterThan(0)
    })

    it('returns empty string for an unknown mastery', () => {
      expect(getMasteryDescription('Nonexistent')).toBe('')
      expect(getMasteryDescription('')).toBe('')
    })

    it('Graze deals damage on a miss (key 2024 mechanic)', () => {
      const desc = getMasteryDescription('Graze')
      expect(desc.toLowerCase()).toContain('miss')
    })

    it('Push pushes the target away (2024 PHB)', () => {
      const desc = getMasteryDescription('Push')
      expect(desc.toLowerCase()).toContain('push')
    })

    it('Vex grants Advantage on next attack (2024 PHB)', () => {
      const desc = getMasteryDescription('Vex')
      expect(desc.toLowerCase()).toContain('advantage')
    })
  })
})
