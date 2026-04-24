import { describe, expect, it } from 'vitest'
import {
  getClassResources,
  getFeatResources,
  getFighterResources,
  getMonkResources,
  getPaladinResources,
  getRangerResources,
  getRogueResources,
  getSorcererResources
} from './class-resources'

describe('class-resources', () => {
  describe('getFighterResources', () => {
    it('returns Second Wind at level 1', () => {
      const resources = getFighterResources(1)
      const secondWind = resources.find((r) => r.id === 'second-wind')
      expect(secondWind).toBeDefined()
      expect(secondWind!.name).toBe('Second Wind')
      expect(secondWind!.max).toBe(2)
      expect(secondWind!.current).toBe(secondWind!.max)
    })

    it('Second Wind scales at level 4 to 3 uses', () => {
      const resources = getFighterResources(4)
      const secondWind = resources.find((r) => r.id === 'second-wind')
      expect(secondWind!.max).toBe(3)
    })

    it('Second Wind scales at level 10 to 4 uses', () => {
      const resources = getFighterResources(10)
      const secondWind = resources.find((r) => r.id === 'second-wind')
      expect(secondWind!.max).toBe(4)
    })

    it('Action Surge appears at level 2', () => {
      const resources = getFighterResources(2)
      const actionSurge = resources.find((r) => r.id === 'action-surge')
      expect(actionSurge).toBeDefined()
      expect(actionSurge!.max).toBe(1)
      expect(actionSurge!.shortRestRestore).toBe('all')
    })

    it('Action Surge not available at level 1', () => {
      const resources = getFighterResources(1)
      const actionSurge = resources.find((r) => r.id === 'action-surge')
      expect(actionSurge).toBeUndefined()
    })

    it('Action Surge scales to 2 at level 17', () => {
      const resources = getFighterResources(17)
      const actionSurge = resources.find((r) => r.id === 'action-surge')
      expect(actionSurge!.max).toBe(2)
    })

    it('Indomitable appears at level 9', () => {
      const resources = getFighterResources(9)
      const indom = resources.find((r) => r.id === 'indomitable')
      expect(indom).toBeDefined()
      expect(indom!.max).toBe(1)
    })

    it('Indomitable not available before level 9', () => {
      const resources = getFighterResources(8)
      const indom = resources.find((r) => r.id === 'indomitable')
      expect(indom).toBeUndefined()
    })

    it('Indomitable scales to 3 at level 17', () => {
      const resources = getFighterResources(17)
      const indom = resources.find((r) => r.id === 'indomitable')
      expect(indom!.max).toBe(3)
    })
  })

  describe('getRogueResources', () => {
    it('returns empty before level 20', () => {
      expect(getRogueResources(19)).toEqual([])
    })

    it('returns Stroke of Luck at level 20', () => {
      const resources = getRogueResources(20)
      const strokeOfLuck = resources.find((r) => r.id === 'stroke-of-luck')
      expect(strokeOfLuck).toBeDefined()
      expect(strokeOfLuck!.max).toBe(1)
      expect(strokeOfLuck!.shortRestRestore).toBe('all')
    })
  })

  describe('getSorcererResources', () => {
    it('returns Innate Sorcery at level 1', () => {
      const resources = getSorcererResources(1)
      const innate = resources.find((r) => r.id === 'innate-sorcery')
      expect(innate).toBeDefined()
      expect(innate!.max).toBe(2)
    })

    it('Sorcery Points appear at level 2 and equal class level', () => {
      const resources = getSorcererResources(5)
      const sp = resources.find((r) => r.id === 'sorcery-points')
      expect(sp).toBeDefined()
      expect(sp!.max).toBe(5)
      expect(sp!.name).toBe('Sorcery Points')
    })

    it('Sorcery Points scale with level', () => {
      for (const level of [2, 5, 10, 15, 20]) {
        const resources = getSorcererResources(level)
        const sp = resources.find((r) => r.id === 'sorcery-points')
        expect(sp!.max).toBe(level)
      }
    })

    it('no Sorcery Points at level 1', () => {
      const resources = getSorcererResources(1)
      const sp = resources.find((r) => r.id === 'sorcery-points')
      expect(sp).toBeUndefined()
    })
  })

  describe('getMonkResources', () => {
    it('returns Focus Points at level 2 equal to class level', () => {
      const resources = getMonkResources(2)
      const fp = resources.find((r) => r.id === 'focus-points')
      expect(fp).toBeDefined()
      expect(fp!.max).toBe(2)
      expect(fp!.name).toBe('Focus Points')
      expect(fp!.shortRestRestore).toBe('all')
    })

    it('Focus Points scale with level', () => {
      const resources = getMonkResources(10)
      const fp = resources.find((r) => r.id === 'focus-points')
      expect(fp!.max).toBe(10)
    })

    it('no Focus Points at level 1', () => {
      const resources = getMonkResources(1)
      expect(resources).toEqual([])
    })
  })

  describe('getPaladinResources', () => {
    it('returns Lay On Hands at level 1 with classLevel*5 HP pool', () => {
      const resources = getPaladinResources(1)
      const loh = resources.find((r) => r.id === 'lay-on-hands')
      expect(loh).toBeDefined()
      expect(loh!.max).toBe(5) // level 1 * 5
      expect(loh!.name).toBe('Lay On Hands')
    })

    it('Lay On Hands scales to level*5', () => {
      const resources = getPaladinResources(10)
      const loh = resources.find((r) => r.id === 'lay-on-hands')
      expect(loh!.max).toBe(50) // level 10 * 5
    })

    it('Channel Divinity appears at level 3', () => {
      const resources = getPaladinResources(3)
      const cd = resources.find((r) => r.id === 'channel-divinity')
      expect(cd).toBeDefined()
      expect(cd!.max).toBe(2)
    })

    it('Channel Divinity scales to 3 at level 11', () => {
      const resources = getPaladinResources(11)
      const cd = resources.find((r) => r.id === 'channel-divinity')
      expect(cd!.max).toBe(3)
    })

    it('no Channel Divinity before level 3', () => {
      const resources = getPaladinResources(2)
      const cd = resources.find((r) => r.id === 'channel-divinity')
      expect(cd).toBeUndefined()
    })
  })

  describe('getRangerResources', () => {
    it('returns Favored Enemy at level 1 with 2 uses', () => {
      const resources = getRangerResources(1)
      const fe = resources.find((r) => r.id === 'favored-enemy')
      expect(fe).toBeDefined()
      expect(fe!.max).toBe(2)
    })

    it('Favored Enemy scales with level tiers', () => {
      expect(getRangerResources(5).find((r) => r.id === 'favored-enemy')!.max).toBe(3)
      expect(getRangerResources(9).find((r) => r.id === 'favored-enemy')!.max).toBe(4)
      expect(getRangerResources(13).find((r) => r.id === 'favored-enemy')!.max).toBe(5)
      expect(getRangerResources(17).find((r) => r.id === 'favored-enemy')!.max).toBe(6)
    })

    it('Tireless appears at level 10 and uses wisdomMod', () => {
      const resources = getRangerResources(10, 3)
      const tireless = resources.find((r) => r.id === 'tireless')
      expect(tireless).toBeDefined()
      expect(tireless!.max).toBe(3) // wisdomMod = 3
    })

    it('Tireless minimum is 1 even with negative wisdom mod', () => {
      const resources = getRangerResources(10, -1)
      const tireless = resources.find((r) => r.id === 'tireless')
      expect(tireless!.max).toBe(1) // Math.max(1, -1)
    })

    it("Nature's Veil appears at level 14", () => {
      const resources = getRangerResources(14, 4)
      const nv = resources.find((r) => r.id === 'natures-veil')
      expect(nv).toBeDefined()
      expect(nv!.max).toBe(4) // wisdomMod = 4
    })
  })

  describe('getClassResources (generic)', () => {
    it('returns empty array for unknown class', () => {
      expect(getClassResources('artificer', 5)).toEqual([])
    })

    it('works for fighter via generic API', () => {
      const resources = getClassResources('fighter', 5)
      expect(resources.length).toBeGreaterThan(0)
      const secondWind = resources.find((r) => r.id === 'second-wind')
      expect(secondWind).toBeDefined()
    })

    it('all resources have current equal to max (fresh state)', () => {
      const resources = getClassResources('fighter', 10)
      for (const r of resources) {
        expect(r.current).toBe(r.max)
      }
    })

    it('all resources have non-negative max values', () => {
      const classes = ['fighter', 'rogue', 'sorcerer', 'monk', 'paladin', 'ranger']
      for (const cls of classes) {
        const resources = getClassResources(cls, 20)
        for (const r of resources) {
          expect(r.max).toBeGreaterThanOrEqual(0)
        }
      }
    })
  })

  describe('getFeatResources', () => {
    it('returns Lucky resource when character has Lucky feat', () => {
      const resources = getFeatResources([{ id: 'lucky' }], 3)
      expect(resources.length).toBe(1)
      expect(resources[0].id).toBe('lucky')
      expect(resources[0].name).toBe('Lucky (Luck Points)')
      expect(resources[0].max).toBe(3) // profBonus passed directly
    })

    it('returns empty array when character has no matching feats', () => {
      const resources = getFeatResources([{ id: 'great-weapon-master' }], 3)
      expect(resources).toEqual([])
    })

    it('returns empty array for empty feats list', () => {
      const resources = getFeatResources([], 2)
      expect(resources).toEqual([])
    })

    it('Lucky uses proficiency bonus for max', () => {
      expect(getFeatResources([{ id: 'lucky' }], 2).find((r) => r.id === 'lucky')!.max).toBe(2)
      expect(getFeatResources([{ id: 'lucky' }], 6).find((r) => r.id === 'lucky')!.max).toBe(6)
    })
  })
})
