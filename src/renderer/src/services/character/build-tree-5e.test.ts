import { describe, expect, it } from 'vitest'
import { generate5eBuildSlots, generate5eLevelUpSlots, getExpertiseGrants } from './build-tree-5e'

describe('generate5eBuildSlots', () => {
  it('1. Foundation slots present at level 1', () => {
    const slots = generate5eBuildSlots(1)
    const foundationIds = ['class', 'background', 'ancestry', 'ability-scores', 'skill-choices']
    for (const id of foundationIds) {
      const slot = slots.find((s) => s.id === id)
      expect(slot).toBeDefined()
      expect(slot?.level).toBe(0)
      expect(slot?.category).toBeDefined()
      expect(slot?.label).toBeDefined()
      expect(slot?.required).toBe(true)
    }
    expect(slots.filter((s) => s.level === 0)).toHaveLength(5)
  })

  it('2. Subclass slot appears at level 3', () => {
    const slots = generate5eBuildSlots(5, 'wizard')
    const subclass = slots.find((s) => s.id === 'level3-subclass')
    expect(subclass).toBeDefined()
    expect(subclass?.level).toBe(3)
    expect(subclass?.category).toBe('class-feat')
    expect(subclass?.label).toBe('Subclass')
  })

  it('3. ASI slots at correct levels for a base class', () => {
    const slots = generate5eBuildSlots(17, 'wizard')
    const asiSlots = slots.filter((s) => s.category === 'ability-boost')
    const asiLevels = asiSlots.map((s) => s.level).sort((a, b) => a - b)
    expect(asiLevels).toEqual([4, 8, 12, 16])
  })

  it('4. Fighter gets extra ASI at levels 6 and 14', () => {
    const slots = generate5eBuildSlots(17, 'fighter')
    const asiSlots = slots.filter((s) => s.category === 'ability-boost')
    const asiLevels = asiSlots.map((s) => s.level).sort((a, b) => a - b)
    expect(asiLevels).toEqual([4, 6, 8, 12, 14, 16])
  })

  it('5. Rogue gets extra ASI at level 10', () => {
    const slots = generate5eBuildSlots(17, 'rogue')
    const asiSlots = slots.filter((s) => s.category === 'ability-boost')
    const asiLevels = asiSlots.map((s) => s.level).sort((a, b) => a - b)
    expect(asiLevels).toEqual([4, 8, 10, 12, 16])
  })

  it('6. Epic Boon at level 19', () => {
    const slots = generate5eBuildSlots(19, 'wizard')
    const epicBoon = slots.find((s) => s.id === 'level19-epic-boon')
    expect(epicBoon).toBeDefined()
    expect(epicBoon?.level).toBe(19)
    expect(epicBoon?.category).toBe('epic-boon')
    expect(epicBoon?.label).toBe('Epic Boon')
  })

  it('7. Fighting Style at correct level for Fighter vs Paladin', () => {
    const fighterSlots = generate5eBuildSlots(5, 'fighter')
    const paladinSlots = generate5eBuildSlots(5, 'paladin')

    const fighterFs = fighterSlots.find((s) => s.category === 'fighting-style')
    const paladinFs = paladinSlots.find((s) => s.category === 'fighting-style')

    expect(fighterFs).toBeDefined()
    expect(fighterFs?.level).toBe(1)
    expect(fighterFs?.id).toBe('level1-fighting-style')

    expect(paladinFs).toBeDefined()
    expect(paladinFs?.level).toBe(2)
    expect(paladinFs?.id).toBe('level2-fighting-style')
  })
})

describe('generate5eLevelUpSlots', () => {
  it('8. Level-up slots returns only new slots (delta)', () => {
    const levelUpSlots = generate5eLevelUpSlots(5, 10, 'wizard')
    const fullSlots = generate5eBuildSlots(10, 'wizard')
    const currentSlots = generate5eBuildSlots(5, 'wizard')
    const currentSlotIds = new Set(currentSlots.map((s) => s.id))

    // Level-up slots should only include slots at levels 6–10 not in current
    expect(levelUpSlots.every((s) => s.level > 5)).toBe(true)
    expect(levelUpSlots.every((s) => s.level <= 10)).toBe(true)
    expect(levelUpSlots.every((s) => !currentSlotIds.has(s.id))).toBe(true)

    // Count should match the delta
    const expectedNewSlots = fullSlots.filter((s) => s.level > 5 && !currentSlotIds.has(s.id))
    expect(levelUpSlots).toHaveLength(expectedNewSlots.length)
  })
})

describe('getExpertiseGrants', () => {
  it('9. Expertise grants for Rogue', () => {
    const grants = getExpertiseGrants('rogue')
    expect(grants).toHaveLength(2)
    expect(grants[0]).toEqual({
      classLevel: 1,
      count: 2,
      includeThievesTools: true
    })
    expect(grants[1]).toEqual({
      classLevel: 6,
      count: 2,
      includeThievesTools: true
    })
  })
})
