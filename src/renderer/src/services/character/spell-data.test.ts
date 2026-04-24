/**
 * Tests for spell-data.ts — multiclass spell slots, slot progression, caster classification
 */
import { describe, expect, it } from 'vitest'
import {
  computeSpellcastingInfo,
  FULL_CASTERS_5E,
  getCantripsKnown,
  getMulticlassSpellSlots,
  getPreparedSpellMax,
  getSlotProgression,
  getWarlockPactSlots,
  HALF_CASTERS_5E,
  isMulticlassSpellcaster,
  isThirdCaster,
  isWarlockPactMagic
} from './spell-data'

describe('getSlotProgression', () => {
  it('returns full caster slots for wizard', () => {
    const slots = getSlotProgression('wizard', 5)
    expect(slots).toEqual({ 1: 4, 2: 3, 3: 2 })
  })

  it('returns half caster slots for paladin (half level rounded up)', () => {
    // Paladin level 5 → effective caster level 3 → slots: {1:4, 2:2}
    const slots = getSlotProgression('paladin', 5)
    expect(slots).toEqual({ 1: 4, 2: 2 })
  })

  it('returns Pact Magic slots for warlock', () => {
    const slots = getSlotProgression('warlock', 5)
    expect(slots).toEqual({ 3: 2 })
  })

  it('returns empty for non-caster fighter', () => {
    const slots = getSlotProgression('fighter', 10)
    expect(slots).toEqual({})
  })

  it('level 1 full caster has 2 first-level slots', () => {
    expect(getSlotProgression('cleric', 1)).toEqual({ 1: 2 })
  })

  it('level 20 full caster has 9th-level slots', () => {
    const slots = getSlotProgression('sorcerer', 20)
    expect(slots[9]).toBe(1)
    expect(slots[1]).toBe(4)
  })
})

describe('isWarlockPactMagic', () => {
  it('returns true for warlock', () => {
    expect(isWarlockPactMagic('warlock')).toBe(true)
  })
  it('returns false for wizard', () => {
    expect(isWarlockPactMagic('wizard')).toBe(false)
  })
})

describe('isThirdCaster', () => {
  it('Eldritch Knight is a third caster', () => {
    expect(isThirdCaster('fighter', 'eldritch-knight')).toBe(true)
  })
  it('Arcane Trickster is a third caster', () => {
    expect(isThirdCaster('rogue', 'arcane-trickster')).toBe(true)
  })
  it('Champion fighter is not a third caster', () => {
    expect(isThirdCaster('fighter', 'champion')).toBe(false)
  })
  it('regular rogue is not a third caster', () => {
    expect(isThirdCaster('rogue', undefined)).toBe(false)
  })
})

describe('getMulticlassSpellSlots', () => {
  it('Wizard 5 / Cleric 5 = combined level 10 full caster', () => {
    const classes = [
      { classId: 'wizard', level: 5 },
      { classId: 'cleric', level: 5 }
    ]
    const slots = getMulticlassSpellSlots(classes)
    // Combined level 10 = full caster slots at level 10
    expect(slots[5]).toBe(2)
    expect(slots[1]).toBe(4)
  })

  it('Wizard 5 / Paladin 6 = combined 5 + 3 = level 8', () => {
    const classes = [
      { classId: 'wizard', level: 5 },
      { classId: 'paladin', level: 6 }
    ]
    const slots = getMulticlassSpellSlots(classes)
    // 5 (wizard full) + ceil(6/2)=3 (paladin half) = 8
    expect(slots).toEqual({ 1: 4, 2: 3, 3: 3, 4: 2 })
  })

  it('Warlock levels are excluded from combined total', () => {
    const classes = [
      { classId: 'wizard', level: 5 },
      { classId: 'warlock', level: 5 }
    ]
    const slots = getMulticlassSpellSlots(classes)
    // Only wizard 5 counts — warlock excluded
    expect(slots).toEqual({ 1: 4, 2: 3, 3: 2 })
  })

  it('Fighter 9 (Eldritch Knight) / Wizard 3 = 3 + 3 = level 6', () => {
    const classes = [
      { classId: 'fighter', subclassId: 'eldritch-knight', level: 9 },
      { classId: 'wizard', level: 3 }
    ]
    const slots = getMulticlassSpellSlots(classes)
    // floor(9/3)=3 (EK third) + 3 (wizard full) = 6
    expect(slots).toEqual({ 1: 4, 2: 3, 3: 3 })
  })

  it('non-caster multiclass returns empty', () => {
    const classes = [
      { classId: 'fighter', level: 10 },
      { classId: 'rogue', level: 5 }
    ]
    const slots = getMulticlassSpellSlots(classes)
    expect(slots).toEqual({})
  })
})

describe('isMulticlassSpellcaster', () => {
  it('two full casters = true', () => {
    expect(
      isMulticlassSpellcaster([
        { classId: 'wizard', level: 5 },
        { classId: 'cleric', level: 3 }
      ])
    ).toBe(true)
  })

  it('full caster + half caster = true', () => {
    expect(
      isMulticlassSpellcaster([
        { classId: 'druid', level: 5 },
        { classId: 'ranger', level: 3 }
      ])
    ).toBe(true)
  })

  it('single caster = false', () => {
    expect(isMulticlassSpellcaster([{ classId: 'wizard', level: 10 }])).toBe(false)
  })

  it('warlock + wizard = false (warlock excluded)', () => {
    expect(
      isMulticlassSpellcaster([
        { classId: 'warlock', level: 5 },
        { classId: 'wizard', level: 5 }
      ])
    ).toBe(false)
  })

  it('warlock + wizard + cleric = true', () => {
    expect(
      isMulticlassSpellcaster([
        { classId: 'warlock', level: 3 },
        { classId: 'wizard', level: 5 },
        { classId: 'cleric', level: 2 }
      ])
    ).toBe(true)
  })
})

describe('getWarlockPactSlots', () => {
  it('returns pact slots for warlock', () => {
    const slots = getWarlockPactSlots([
      { classId: 'warlock', level: 5 },
      { classId: 'wizard', level: 5 }
    ])
    expect(slots).toEqual({ 3: 2 })
  })

  it('returns empty if no warlock', () => {
    const slots = getWarlockPactSlots([{ classId: 'wizard', level: 10 }])
    expect(slots).toEqual({})
  })
})

describe('getCantripsKnown', () => {
  it('wizard level 1 = 3 cantrips', () => {
    expect(getCantripsKnown('wizard', 1)).toBe(3)
  })
  it('wizard level 4 = 4 cantrips', () => {
    expect(getCantripsKnown('wizard', 4)).toBe(4)
  })
  it('fighter = 0 cantrips', () => {
    expect(getCantripsKnown('fighter', 10)).toBe(0)
  })
})

describe('getPreparedSpellMax', () => {
  it('wizard level 1 = 4 prepared', () => {
    expect(getPreparedSpellMax('wizard', 1)).toBe(4)
  })
  it('paladin level 5 = 6 prepared', () => {
    expect(getPreparedSpellMax('paladin', 5)).toBe(6)
  })
  it('fighter returns null', () => {
    expect(getPreparedSpellMax('fighter', 10)).toBeNull()
  })
})

describe('computeSpellcastingInfo', () => {
  const baseScores = { strength: 10, dexterity: 10, constitution: 10, intelligence: 16, wisdom: 14, charisma: 12 }

  it('returns spellcasting info for wizard', () => {
    const info = computeSpellcastingInfo([{ classId: 'wizard', level: 5 }], baseScores, 5, 'wizard')
    expect(info).toBeDefined()
    expect(info?.ability).toBe('intelligence')
    // Prof bonus at level 5 = 3, INT mod = +3 → DC = 8 + 3 + 3 = 14
    expect(info?.spellSaveDC).toBe(14)
    expect(info?.spellAttackBonus).toBe(6)
  })

  it('returns undefined for fighter', () => {
    const info = computeSpellcastingInfo([{ classId: 'fighter', level: 5 }], baseScores, 5, 'fighter')
    expect(info).toBeUndefined()
  })
})

describe('caster classification', () => {
  it('full casters include expected classes', () => {
    expect(FULL_CASTERS_5E).toContain('bard')
    expect(FULL_CASTERS_5E).toContain('cleric')
    expect(FULL_CASTERS_5E).toContain('druid')
    expect(FULL_CASTERS_5E).toContain('sorcerer')
    expect(FULL_CASTERS_5E).toContain('wizard')
  })

  it('half casters include paladin and ranger', () => {
    expect(HALF_CASTERS_5E).toContain('paladin')
    expect(HALF_CASTERS_5E).toContain('ranger')
  })
})
