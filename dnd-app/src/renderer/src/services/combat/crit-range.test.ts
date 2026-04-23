import { describe, expect, it } from 'vitest'
import type { Character5e } from '../../types/character-5e'
import { getCritThreshold } from './crit-range'

function makeChar(overrides: {
  classes?: { name: string; level: number }[]
  classId?: string
  subclassId?: string
  multiclassEntries?: { classId: string; subclassId?: string; levelTaken: number }[]
}): Character5e {
  return {
    classes: overrides.classes ?? [],
    buildChoices: {
      classId: overrides.classId ?? 'fighter',
      subclassId: overrides.subclassId,
      multiclassEntries: overrides.multiclassEntries
    }
  } as unknown as Character5e
}

describe('getCritThreshold', () => {
  it('returns 20 for a non-fighter character', () => {
    const char = makeChar({ classes: [{ name: 'Wizard', level: 10 }], classId: 'wizard' })
    expect(getCritThreshold(char)).toBe(20)
  })

  it('returns 20 for a fighter who is not a Champion', () => {
    const char = makeChar({
      classes: [{ name: 'Fighter', level: 10 }],
      classId: 'fighter',
      subclassId: 'battle-master'
    })
    expect(getCritThreshold(char)).toBe(20)
  })

  it('returns 20 for a Champion Fighter below level 3', () => {
    const char = makeChar({
      classes: [{ name: 'Fighter', level: 2 }],
      classId: 'fighter',
      subclassId: 'champion'
    })
    expect(getCritThreshold(char)).toBe(20)
  })

  it('returns 19 for a Champion Fighter at level 3 (Improved Critical)', () => {
    const char = makeChar({
      classes: [{ name: 'Fighter', level: 3 }],
      classId: 'fighter',
      subclassId: 'champion'
    })
    expect(getCritThreshold(char)).toBe(19)
  })

  it('returns 19 for a Champion Fighter at level 14', () => {
    const char = makeChar({
      classes: [{ name: 'Fighter', level: 14 }],
      classId: 'fighter',
      subclassId: 'champion'
    })
    expect(getCritThreshold(char)).toBe(19)
  })

  it('returns 18 for a Champion Fighter at level 15 (Superior Critical)', () => {
    const char = makeChar({
      classes: [{ name: 'Fighter', level: 15 }],
      classId: 'fighter',
      subclassId: 'champion'
    })
    expect(getCritThreshold(char)).toBe(18)
  })

  it('returns 19 for a multiclass Champion Fighter at level 5', () => {
    const char = makeChar({
      classes: [
        { name: 'Rogue', level: 3 },
        { name: 'Fighter', level: 5 }
      ],
      classId: 'rogue',
      subclassId: 'thief',
      multiclassEntries: [{ classId: 'fighter', subclassId: 'champion', levelTaken: 4 }]
    })
    expect(getCritThreshold(char)).toBe(19)
  })

  it('returns 20 for a multiclass Fighter without Champion subclass', () => {
    const char = makeChar({
      classes: [
        { name: 'Paladin', level: 5 },
        { name: 'Fighter', level: 3 }
      ],
      classId: 'paladin',
      subclassId: 'devotion',
      multiclassEntries: [{ classId: 'fighter', subclassId: 'battle-master', levelTaken: 6 }]
    })
    expect(getCritThreshold(char)).toBe(20)
  })
})
