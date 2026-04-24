import { describe, expect, it } from 'vitest'
import {
  calculate5eStats,
  calculateArmorClass5e,
  calculateEncumbrance,
  calculateHPBonusFromTraits,
  calculateLifestyleCost,
  getWildShapeMax,
  sumEquipmentWeight
} from './stat-calculator-5e'

describe('calculateHPBonusFromTraits', () => {
  it('returns 0 with no matching traits', () => {
    expect(calculateHPBonusFromTraits(5, null, null)).toBe(0)
  })

  it('adds +1 HP per level for dwarves', () => {
    expect(calculateHPBonusFromTraits(5, 'dwarf', null)).toBe(5)
    expect(calculateHPBonusFromTraits(10, 'dwarf', null)).toBe(10)
  })

  it('adds +2 HP per level for Tough feat', () => {
    expect(calculateHPBonusFromTraits(5, null, [{ id: 'tough' }])).toBe(10)
  })

  it('adds +40 HP for Boon of Fortitude', () => {
    expect(calculateHPBonusFromTraits(1, null, [{ id: 'boon-of-fortitude' }])).toBe(40)
  })

  it('stacks dwarf + tough', () => {
    expect(calculateHPBonusFromTraits(5, 'dwarf', [{ id: 'tough' }])).toBe(15)
  })

  it('adds draconic resilience at level 3+', () => {
    expect(calculateHPBonusFromTraits(1, null, null, 3)).toBe(3)
    expect(calculateHPBonusFromTraits(1, null, null, 5)).toBe(5)
  })

  it('does not add draconic resilience below level 3', () => {
    expect(calculateHPBonusFromTraits(1, null, null, 2)).toBe(0)
    expect(calculateHPBonusFromTraits(1, null, null, 0)).toBe(0)
  })
})

describe('getWildShapeMax', () => {
  it('returns 0 for druid levels below 2', () => {
    expect(getWildShapeMax(0)).toBe(0)
    expect(getWildShapeMax(1)).toBe(0)
  })

  it('returns 2 for druid levels 2-5', () => {
    expect(getWildShapeMax(2)).toBe(2)
    expect(getWildShapeMax(5)).toBe(2)
  })

  it('returns 3 for druid levels 6-16', () => {
    expect(getWildShapeMax(6)).toBe(3)
    expect(getWildShapeMax(16)).toBe(3)
  })

  it('returns 4 for druid levels 17-20', () => {
    expect(getWildShapeMax(17)).toBe(4)
    expect(getWildShapeMax(20)).toBe(4)
  })
})

describe('calculate5eStats', () => {
  const baseScores = {
    strength: 10,
    dexterity: 14,
    constitution: 12,
    intelligence: 8,
    wisdom: 13,
    charisma: 15
  }

  it('computes proficiency bonus from level', () => {
    expect(calculate5eStats(baseScores, null, { hitDie: 8, savingThrows: [] }, 1).proficiencyBonus).toBe(2)
    expect(calculate5eStats(baseScores, null, { hitDie: 8, savingThrows: [] }, 5).proficiencyBonus).toBe(3)
    expect(calculate5eStats(baseScores, null, { hitDie: 8, savingThrows: [] }, 9).proficiencyBonus).toBe(4)
    expect(calculate5eStats(baseScores, null, { hitDie: 8, savingThrows: [] }, 13).proficiencyBonus).toBe(5)
    expect(calculate5eStats(baseScores, null, { hitDie: 8, savingThrows: [] }, 17).proficiencyBonus).toBe(6)
  })

  it('computes HP at level 1 as hitDie + CON mod', () => {
    const result = calculate5eStats({ ...baseScores, constitution: 14 }, null, { hitDie: 10, savingThrows: [] }, 1)
    expect(result.maxHP).toBe(12)
  })

  it('computes HP at multi-level with level 1 max die and average for subsequent levels', () => {
    const result = calculate5eStats({ ...baseScores, constitution: 14 }, null, { hitDie: 10, savingThrows: [] }, 5)
    expect(result.maxHP).toBe(44)
  })

  it('enforces minimum 1 HP per level with low CON', () => {
    const lowCon = { strength: 10, dexterity: 10, constitution: 6, intelligence: 10, wisdom: 10, charisma: 10 }
    const result = calculate5eStats(lowCon, null, { hitDie: 8, savingThrows: [] }, 3)
    expect(result.maxHP).toBeGreaterThanOrEqual(3)
  })

  it('adds dwarf species HP bonus to maxHP', () => {
    const noDwarf = calculate5eStats(baseScores, null, { hitDie: 8, savingThrows: [] }, 5, undefined, null)
    const dwarf = calculate5eStats(baseScores, null, { hitDie: 8, savingThrows: [] }, 5, undefined, 'dwarf')
    expect(dwarf.maxHP - noDwarf.maxHP).toBe(5)
  })

  it('adds Tough feat HP bonus to maxHP', () => {
    const noTough = calculate5eStats(baseScores, null, { hitDie: 8, savingThrows: [] }, 5, undefined, null, null)
    const tough = calculate5eStats(baseScores, null, { hitDie: 8, savingThrows: [] }, 5, undefined, null, [
      { id: 'tough' }
    ])
    expect(tough.maxHP - noTough.maxHP).toBe(10)
  })

  it('computes ability modifiers for 10, 16, 8, 20', () => {
    const scores = { strength: 10, dexterity: 16, constitution: 8, intelligence: 20, wisdom: 10, charisma: 10 }
    const result = calculate5eStats(scores, null, { hitDie: 8, savingThrows: [] }, 1)
    expect(result.abilityModifiers.strength).toBe(0)
    expect(result.abilityModifiers.dexterity).toBe(3)
    expect(result.abilityModifiers.constitution).toBe(-1)
    expect(result.abilityModifiers.intelligence).toBe(5)
  })

  it('computes ability modifiers correctly', () => {
    const result = calculate5eStats(baseScores, null, { hitDie: 8, savingThrows: [] }, 1)
    expect(result.abilityModifiers.strength).toBe(0)
    expect(result.abilityModifiers.dexterity).toBe(2)
    expect(result.abilityModifiers.constitution).toBe(1)
    expect(result.abilityModifiers.intelligence).toBe(-1)
    expect(result.abilityModifiers.wisdom).toBe(1)
    expect(result.abilityModifiers.charisma).toBe(2)
  })

  it('computes initiative from DEX modifier', () => {
    const result = calculate5eStats(baseScores, null, { hitDie: 8, savingThrows: [] }, 1)
    expect(result.initiative).toBe(2)
  })

  it('applies background ability bonuses', () => {
    const result = calculate5eStats(baseScores, null, { hitDie: 8, savingThrows: [] }, 1, { strength: 2, dexterity: 1 })
    expect(result.abilityScores.strength).toBe(12)
    expect(result.abilityScores.dexterity).toBe(15)
  })

  it('computes saving throws with proficiency', () => {
    const result = calculate5eStats(baseScores, null, { hitDie: 8, savingThrows: ['dexterity', 'intelligence'] }, 1)
    expect(result.savingThrows.dexterity).toBe(4)
    expect(result.savingThrows.intelligence).toBe(1)
    expect(result.savingThrows.strength).toBe(0)
  })
})

describe('calculateArmorClass5e — PHB 2024', () => {
  it('unarmored: 10 + DEX mod', () => {
    expect(calculateArmorClass5e({ dexMod: 2, armor: [] })).toBe(12)
    expect(calculateArmorClass5e({ dexMod: -1, armor: [] })).toBe(9)
    expect(calculateArmorClass5e({ dexMod: 0, armor: [] })).toBe(10)
  })

  it('light armor: base + DEX mod (no cap)', () => {
    const leather = { acBonus: 1, equipped: true, type: 'armor' as const, category: 'light' }
    expect(calculateArmorClass5e({ dexMod: 3, armor: [leather] })).toBe(14)
    expect(calculateArmorClass5e({ dexMod: 5, armor: [leather] })).toBe(16)
  })

  it('medium armor: base + DEX mod (max +2)', () => {
    const chainShirt = { acBonus: 3, equipped: true, type: 'armor' as const, category: 'medium', dexCap: 2 }
    expect(calculateArmorClass5e({ dexMod: 1, armor: [chainShirt] })).toBe(14)
    expect(calculateArmorClass5e({ dexMod: 3, armor: [chainShirt] })).toBe(15)
    expect(calculateArmorClass5e({ dexMod: 5, armor: [chainShirt] })).toBe(15)
  })

  it('heavy armor: base AC, no DEX', () => {
    const plate = { acBonus: 8, equipped: true, type: 'armor' as const, category: 'heavy' }
    expect(calculateArmorClass5e({ dexMod: 5, armor: [plate] })).toBe(18)
    expect(calculateArmorClass5e({ dexMod: -2, armor: [plate] })).toBe(18)
  })

  it('shield adds its bonus', () => {
    const shield = { acBonus: 2, equipped: true, type: 'shield' as const }
    expect(calculateArmorClass5e({ dexMod: 2, armor: [shield] })).toBe(14)

    const plate = { acBonus: 8, equipped: true, type: 'armor' as const, category: 'heavy' }
    expect(calculateArmorClass5e({ dexMod: 2, armor: [plate, shield] })).toBe(20)
  })

  it('ignores unequipped armor', () => {
    const plate = { acBonus: 8, equipped: false, type: 'armor' as const, category: 'heavy' }
    expect(calculateArmorClass5e({ dexMod: 2, armor: [plate] })).toBe(12)
  })

  it('Barbarian unarmored defense: 10 + DEX + CON', () => {
    expect(
      calculateArmorClass5e({
        dexMod: 2,
        armor: [],
        classNames: ['Barbarian'],
        conMod: 3
      })
    ).toBe(15)
  })

  it('Monk unarmored defense: 10 + DEX + WIS', () => {
    expect(
      calculateArmorClass5e({
        dexMod: 3,
        armor: [],
        classNames: ['Monk'],
        wisMod: 2
      })
    ).toBe(15)
  })

  it('Draconic Resilience: 13 + DEX (Sorcerer level 3+)', () => {
    expect(
      calculateArmorClass5e({
        dexMod: 2,
        armor: [],
        draconicSorcererLevel: 3
      })
    ).toBe(15)
  })

  it('unarmored defense uses highest available formula', () => {
    expect(
      calculateArmorClass5e({
        dexMod: 3,
        armor: [],
        classNames: ['Barbarian'],
        conMod: 1
      })
    ).toBe(14)
  })

  it('wearing armor overrides unarmored defense', () => {
    const chainShirt = { acBonus: 3, equipped: true, type: 'armor' as const, category: 'medium', dexCap: 2 }
    expect(
      calculateArmorClass5e({
        dexMod: 3,
        armor: [chainShirt],
        classNames: ['Barbarian'],
        conMod: 5
      })
    ).toBe(15)
  })

  it('adds AC bonus from effects', () => {
    expect(
      calculateArmorClass5e({
        dexMod: 2,
        armor: [],
        acBonusFromEffects: 3
      })
    ).toBe(15)
  })
})

describe('calculateEncumbrance', () => {
  it('standard rules: unencumbered under capacity', () => {
    const result = calculateEncumbrance(10, 100)
    expect(result.status).toBe('unencumbered')
    expect(result.carryCapacity).toBe(150)
    expect(result.speedPenalty).toBe('')
  })

  it('standard rules: over-limit when over capacity', () => {
    const result = calculateEncumbrance(10, 200)
    expect(result.status).toBe('over-limit')
    expect(result.speedPenalty).toContain('Speed 0')
  })

  it('variant rules: unencumbered below STR × 5', () => {
    const result = calculateEncumbrance(10, 40, true)
    expect(result.status).toBe('unencumbered')
  })

  it('variant rules: encumbered between STR × 5 and STR × 10', () => {
    const result = calculateEncumbrance(10, 60, true)
    expect(result.status).toBe('encumbered')
    expect(result.speedPenalty).toContain('-10')
  })

  it('variant rules: heavily encumbered between STR × 10 and STR × 15', () => {
    const result = calculateEncumbrance(10, 120, true)
    expect(result.status).toBe('heavily-encumbered')
    expect(result.speedPenalty).toContain('-20')
  })
})

describe('sumEquipmentWeight', () => {
  it('sums mixed weapons, armor, gear, and currency', () => {
    const total = sumEquipmentWeight(
      [{ weight: 3, quantity: 2 }, { weight: 6 }],
      [{ weight: 14, equipped: true }],
      [{ weight: 2, quantity: 5 }],
      { gp: 50, sp: 100 }
    )
    expect(total).toBe(12 + 14 + 10 + 3)
  })
})

describe('calculateLifestyleCost', () => {
  it('returns cost in gp for lifestyle and days', () => {
    expect(calculateLifestyleCost('modest', 7)).toBe(7)
    expect(calculateLifestyleCost('comfortable', 30)).toBe(60)
    expect(calculateLifestyleCost('aristocratic', 5)).toBe(50)
  })
})
