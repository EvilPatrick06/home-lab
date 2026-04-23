import { describe, expect, it } from 'vitest'
import { getSpeciesResources } from './species-resources'

describe('species-resources', () => {
  describe('getSpeciesResources', () => {
    it('returns an array', () => {
      const resources = getSpeciesResources('aasimar', undefined, 1)
      expect(Array.isArray(resources)).toBe(true)
    })

    it('returns empty array for unknown species', () => {
      expect(getSpeciesResources('kobold', undefined, 5)).toEqual([])
      expect(getSpeciesResources('nonexistent', undefined, 1)).toEqual([])
    })

    // --- Aasimar ---
    it('Aasimar: Healing Hands available at level 1', () => {
      const resources = getSpeciesResources('aasimar', undefined, 1)
      const hh = resources.find((r) => r.id === 'species-healing-hands')
      expect(hh).toBeDefined()
      expect(hh!.name).toBe('Healing Hands')
      expect(hh!.max).toBe(1)
    })

    it('Aasimar: Celestial Revelation appears at level 3', () => {
      const resources = getSpeciesResources('aasimar', undefined, 3)
      const cr = resources.find((r) => r.id === 'species-celestial-revelation')
      expect(cr).toBeDefined()
      expect(cr!.name).toBe('Celestial Revelation')
      expect(cr!.max).toBe(1)
    })

    it('Aasimar: Celestial Revelation not available before level 3', () => {
      const resources = getSpeciesResources('aasimar', undefined, 2)
      const cr = resources.find((r) => r.id === 'species-celestial-revelation')
      expect(cr).toBeUndefined()
    })

    // --- Dragonborn ---
    it('Dragonborn: Breath Weapon uses proficiency bonus (scales with level)', () => {
      const resources1 = getSpeciesResources('dragonborn', undefined, 1)
      const bw1 = resources1.find((r) => r.id === 'species-breath-weapon')
      expect(bw1).toBeDefined()
      expect(bw1!.name).toBe('Breath Weapon')
      // Level 1: prof bonus = ceil(1/4)+1 = 2
      expect(bw1!.max).toBe(2)

      const resources5 = getSpeciesResources('dragonborn', undefined, 5)
      const bw5 = resources5.find((r) => r.id === 'species-breath-weapon')
      // Level 5: prof bonus = ceil(5/4)+1 = 3
      expect(bw5!.max).toBe(3)
    })

    it('Dragonborn: Draconic Flight appears at level 5', () => {
      const resources = getSpeciesResources('dragonborn', undefined, 5)
      const df = resources.find((r) => r.id === 'species-draconic-flight')
      expect(df).toBeDefined()
      expect(df!.max).toBe(1)
    })

    it('Dragonborn: no Draconic Flight before level 5', () => {
      const resources = getSpeciesResources('dragonborn', undefined, 4)
      const df = resources.find((r) => r.id === 'species-draconic-flight')
      expect(df).toBeUndefined()
    })

    // --- Dwarf ---
    it('Dwarf: Stonecunning uses proficiency bonus', () => {
      const resources = getSpeciesResources('dwarf', undefined, 1)
      const sc = resources.find((r) => r.id === 'species-stonecunning')
      expect(sc).toBeDefined()
      expect(sc!.name).toBe('Stonecunning')
      // Level 1: prof bonus = 2
      expect(sc!.max).toBe(2)
    })

    // --- Goliath ---
    it('Goliath: Large Form appears at level 5', () => {
      const resources = getSpeciesResources('goliath', undefined, 5)
      const lf = resources.find((r) => r.id === 'species-large-form')
      expect(lf).toBeDefined()
      expect(lf!.max).toBe(1)
    })

    it('Goliath heritage: Stone Goliath gets Stones Endurance', () => {
      const resources = getSpeciesResources('goliath', 'stone-goliath', 1)
      const se = resources.find((r) => r.id === 'species-stones-endurance')
      expect(se).toBeDefined()
      expect(se!.name).toBe("Stone's Endurance")
      // Level 1: prof bonus = 2
      expect(se!.max).toBe(2)
    })

    it('Goliath heritage: Cloud Goliath gets Clouds Jaunt', () => {
      const resources = getSpeciesResources('goliath', 'cloud-goliath', 1)
      const cj = resources.find((r) => r.id === 'species-clouds-jaunt')
      expect(cj).toBeDefined()
      expect(cj!.name).toBe("Cloud's Jaunt")
    })

    it('Goliath: no heritage resources without subspeciesId', () => {
      const resources = getSpeciesResources('goliath', undefined, 1)
      const heritageIds = [
        'species-clouds-jaunt',
        'species-fires-burn',
        'species-frosts-chill',
        'species-hills-tumble',
        'species-stones-endurance',
        'species-storms-thunder'
      ]
      for (const id of heritageIds) {
        expect(resources.find((r) => r.id === id)).toBeUndefined()
      }
    })

    it('Goliath heritage resources scale with proficiency bonus', () => {
      const res1 = getSpeciesResources('goliath', 'fire-goliath', 1)
      const fb1 = res1.find((r) => r.id === 'species-fires-burn')
      expect(fb1!.max).toBe(2) // Level 1: prof = 2

      const res9 = getSpeciesResources('goliath', 'fire-goliath', 9)
      const fb9 = res9.find((r) => r.id === 'species-fires-burn')
      expect(fb9!.max).toBe(4) // Level 9: prof = ceil(9/4)+1 = 4
    })

    // --- Orc ---
    it('Orc: Adrenaline Rush uses proficiency bonus and restores on short rest', () => {
      const resources = getSpeciesResources('orc', undefined, 1)
      const ar = resources.find((r) => r.id === 'species-adrenaline-rush')
      expect(ar).toBeDefined()
      expect(ar!.name).toBe('Adrenaline Rush')
      expect(ar!.shortRestRestore).toBe('all')
      expect(ar!.max).toBe(2) // Level 1: prof = 2
    })

    it('Orc: Relentless Endurance has 1 use', () => {
      const resources = getSpeciesResources('orc', undefined, 1)
      const re = resources.find((r) => r.id === 'species-relentless-endurance')
      expect(re).toBeDefined()
      expect(re!.name).toBe('Relentless Endurance')
      expect(re!.max).toBe(1)
    })

    // --- General structure ---
    it('all resources have current equal to max (fresh state)', () => {
      const species = ['aasimar', 'dragonborn', 'dwarf', 'goliath', 'orc']
      for (const s of species) {
        const resources = getSpeciesResources(s, undefined, 5)
        for (const r of resources) {
          expect(r.current, `${s} resource ${r.name}: current should equal max`).toBe(r.max)
        }
      }
    })

    it('all resources have non-negative max values', () => {
      const species = ['aasimar', 'dragonborn', 'dwarf', 'goliath', 'orc']
      for (const s of species) {
        const resources = getSpeciesResources(s, undefined, 20)
        for (const r of resources) {
          expect(r.max).toBeGreaterThanOrEqual(0)
        }
      }
    })

    it('all resources have id, name, current, max, and shortRestRestore', () => {
      const resources = getSpeciesResources('dragonborn', undefined, 5)
      for (const r of resources) {
        expect(typeof r.id).toBe('string')
        expect(typeof r.name).toBe('string')
        expect(typeof r.current).toBe('number')
        expect(typeof r.max).toBe('number')
        expect(r.shortRestRestore === 0 || r.shortRestRestore === 'all' || typeof r.shortRestRestore === 'number').toBe(
          true
        )
      }
    })
  })
})
