import { describe, expect, it } from 'vitest'
import type { AbilityScoreSet } from '../../types/character-common'
import {
  applyAbilityBonuses,
  applyHomebrewEffect,
  collectHomebrewFeatEffects,
  emptyAccumulator,
  type HomebrewFeatEffect
} from './homebrew-effects'

describe('homebrew-effects (Phase 25b)', () => {
  it('folds each effect type into the accumulator', () => {
    const acc = emptyAccumulator()
    const effects: HomebrewFeatEffect[] = [
      { type: 'ability_bonus', target: 'strength', value: 1 },
      { type: 'ability_bonus', target: 'strength', value: 2 },
      { type: 'skill_proficiency', target: 'Stealth' },
      { type: 'damage_resistance', target: 'fire' },
      { type: 'speed_bonus', value: 10 },
      { type: 'ac_bonus', value: 1 },
      { type: 'custom', description: 'flavor' }
    ]
    for (const e of effects) applyHomebrewEffect(e, acc)
    expect(acc.abilityBonuses.strength).toBe(3)
    expect(acc.skillProficiencies).toEqual(['Stealth'])
    expect(acc.damageResistances).toEqual(['fire'])
    expect(acc.speedBonus).toBe(10)
    expect(acc.acBonus).toBe(1)
    expect(acc.notes).toEqual(['flavor'])
  })

  it('only collects homebrew-sourced feats with an effects array', () => {
    const acc = collectHomebrewFeatEffects([
      { source: 'homebrew', effects: [{ type: 'ability_bonus', target: 'dexterity', value: 2 }] },
      { source: 'official', effects: [{ type: 'ability_bonus', target: 'dexterity', value: 5 }] },
      { source: 'homebrew' } // no effects
    ])
    expect(acc.abilityBonuses.dexterity).toBe(2)
  })

  it('applies ability bonuses with a cap of 30', () => {
    const scores: AbilityScoreSet = {
      strength: 29,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    }
    const next = applyAbilityBonuses(scores, { strength: 5 })
    expect(next.strength).toBe(30)
    expect(scores.strength).toBe(29) // original untouched
  })
})
