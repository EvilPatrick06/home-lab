import { describe, expect, it } from 'vitest'
import type { AttackOptions, AttackResult } from './attack-types'

describe('AttackResult type', () => {
  it('can construct a valid AttackResult object with all required fields', () => {
    const result: AttackResult = {
      attackerName: 'Legolas',
      targetName: 'Orc',
      weaponName: 'Longbow',
      attackRoll: 17,
      attackTotal: 24,
      targetAC: 15,
      coverType: 'none',
      coverACBonus: 0,
      isHit: true,
      isCrit: false,
      isFumble: false,
      rollMode: 'normal',
      advantageSources: [],
      disadvantageSources: [],
      damageRolls: [6],
      damageTotal: 10,
      damageType: 'piercing',
      damageResolution: null,
      masteryEffect: null,
      extraDamage: [],
      rangeCategory: 'normal',
      exhaustionPenalty: 0
    }
    expect(result.attackerName).toBe('Legolas')
    expect(result.targetName).toBe('Orc')
    expect(result.weaponName).toBe('Longbow')
    expect(result.isHit).toBe(true)
    expect(result.rangeCategory).toBe('normal')
  })

  it('supports all roll mode values', () => {
    const modes: AttackResult['rollMode'][] = ['advantage', 'disadvantage', 'normal']
    for (const mode of modes) {
      const result: Partial<AttackResult> = { rollMode: mode }
      expect(result.rollMode).toBe(mode)
    }
  })

  it('supports all range category values', () => {
    const categories: AttackResult['rangeCategory'][] = ['melee', 'normal', 'long', 'out-of-range']
    for (const cat of categories) {
      const result: Partial<AttackResult> = { rangeCategory: cat }
      expect(result.rangeCategory).toBe(cat)
    }
  })

  it('supports all cover type values', () => {
    const covers: AttackResult['coverType'][] = ['none', 'half', 'three-quarters', 'total']
    for (const cover of covers) {
      const result: Partial<AttackResult> = { coverType: cover }
      expect(result.coverType).toBe(cover)
    }
  })

  it('supports extra damage array with multiple entries', () => {
    const result: Partial<AttackResult> = {
      extraDamage: [
        { dice: '1d6', rolls: [4], total: 4, damageType: 'fire' },
        { dice: '2d8', rolls: [5, 7], total: 12, damageType: 'radiant' }
      ]
    }
    expect(result.extraDamage).toHaveLength(2)
    expect(result.extraDamage![0].damageType).toBe('fire')
    expect(result.extraDamage![1].total).toBe(12)
  })

  it('supports critical hit result', () => {
    const result: Partial<AttackResult> = {
      attackRoll: 20,
      attackTotal: 27,
      isCrit: true,
      isFumble: false,
      isHit: true
    }
    expect(result.isCrit).toBe(true)
    expect(result.isFumble).toBe(false)
    expect(result.isHit).toBe(true)
  })

  it('supports fumble result', () => {
    const result: Partial<AttackResult> = {
      attackRoll: 1,
      attackTotal: 8,
      isCrit: false,
      isFumble: true,
      isHit: false
    }
    expect(result.isFumble).toBe(true)
    expect(result.isHit).toBe(false)
  })

  it('supports negative exhaustion penalty', () => {
    const result: Partial<AttackResult> = { exhaustionPenalty: -6 }
    expect(result.exhaustionPenalty).toBe(-6)
  })

  it('supports damage resolution summary', () => {
    const result: Partial<AttackResult> = {
      damageResolution: {
        totalRawDamage: 14,
        totalFinalDamage: 7,
        heavyArmorMasterReduction: 0,
        results: [
          {
            finalDamage: 7,
            rawDamage: 14,
            damageType: 'fire',
            modification: 'resistant',
            reason: 'Resistant to fire'
          }
        ]
      }
    }
    expect(result.damageResolution!.totalFinalDamage).toBe(7)
    expect(result.damageResolution!.results[0].modification).toBe('resistant')
  })

  it('supports mastery effect result', () => {
    const result: Partial<AttackResult> = {
      masteryEffect: {
        mastery: 'Topple',
        description: 'Target must save or be knocked Prone',
        requiresSave: { dc: 15, ability: 'constitution' },
        appliedCondition: 'Prone'
      }
    }
    expect(result.masteryEffect!.mastery).toBe('Topple')
    expect(result.masteryEffect!.requiresSave!.dc).toBe(15)
  })
})

describe('AttackOptions type', () => {
  it('can construct with no options', () => {
    const options: AttackOptions = {}
    expect(options.forceAdvantage).toBeUndefined()
    expect(options.forceDisadvantage).toBeUndefined()
  })

  it('supports forceAdvantage', () => {
    const options: AttackOptions = { forceAdvantage: true }
    expect(options.forceAdvantage).toBe(true)
  })

  it('supports forceDisadvantage', () => {
    const options: AttackOptions = { forceDisadvantage: true }
    expect(options.forceDisadvantage).toBe(true)
  })

  it('supports both flags simultaneously (they cancel per PHB rule)', () => {
    const options: AttackOptions = { forceAdvantage: true, forceDisadvantage: true }
    expect(options.forceAdvantage).toBe(true)
    expect(options.forceDisadvantage).toBe(true)
  })
})
