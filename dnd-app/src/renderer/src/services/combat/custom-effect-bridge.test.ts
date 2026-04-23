import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { CustomEffect } from '../../types/effects'
import { getCustomEffectBonuses, getEffectiveAC } from './custom-effect-bridge'

// ── Mock game store ───────────────────────────────────────────────

let mockCustomEffects: CustomEffect[] = []

vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      customEffects: mockCustomEffects
    }))
  }
}))

// ── Helpers ───────────────────────────────────────────────────────

function makeEffect(
  targetEntityId: string,
  effects: CustomEffect['effects'],
  name = 'Test Effect'
): CustomEffect {
  return {
    id: `eff-${Math.random().toString(36).slice(2, 8)}`,
    name,
    targetEntityId,
    targetEntityName: 'Test Entity',
    effects,
    appliedBy: 'DM'
  }
}

// ── Tests ─────────────────────────────────────────────────────────

describe('getCustomEffectBonuses', () => {
  beforeEach(() => {
    mockCustomEffects = []
  })

  // ── Base case ──

  it('returns zeroed bonuses and empty arrays when no effects exist', () => {
    const result = getCustomEffectBonuses('e-1')
    expect(result.acBonus).toBe(0)
    expect(result.attackBonus).toBe(0)
    expect(result.damageBonus).toBe(0)
    expect(result.spellDcBonus).toBe(0)
    expect(result.savingThrowBonus).toBe(0)
    expect(result.resistances).toEqual([])
    expect(result.immunities).toEqual([])
    expect(result.vulnerabilities).toEqual([])
  })

  // ── Numeric bonuses ──

  it('sums ac_bonus effects', () => {
    mockCustomEffects = [
      makeEffect('e-1', [{ type: 'ac_bonus', value: 2 }]),
      makeEffect('e-1', [{ type: 'ac_bonus', value: 1 }])
    ]
    expect(getCustomEffectBonuses('e-1').acBonus).toBe(3)
  })

  it('sums attack_bonus effects', () => {
    mockCustomEffects = [makeEffect('e-1', [{ type: 'attack_bonus', value: 3 }])]
    expect(getCustomEffectBonuses('e-1').attackBonus).toBe(3)
  })

  it('sums damage_bonus effects', () => {
    mockCustomEffects = [
      makeEffect('e-1', [{ type: 'damage_bonus', value: 2 }]),
      makeEffect('e-1', [{ type: 'damage_bonus', value: 4 }])
    ]
    expect(getCustomEffectBonuses('e-1').damageBonus).toBe(6)
  })

  it('sums spell_dc_bonus effects', () => {
    mockCustomEffects = [makeEffect('e-1', [{ type: 'spell_dc_bonus', value: 1 }])]
    expect(getCustomEffectBonuses('e-1').spellDcBonus).toBe(1)
  })

  it('sums saving_throw_bonus effects', () => {
    mockCustomEffects = [makeEffect('e-1', [{ type: 'saving_throw_bonus', value: 2 }])]
    expect(getCustomEffectBonuses('e-1').savingThrowBonus).toBe(2)
  })

  // ── String-based effects ──

  it('collects resistance string values', () => {
    mockCustomEffects = [
      makeEffect('e-1', [
        { type: 'resistance', stringValue: 'fire' },
        { type: 'resistance', stringValue: 'cold' }
      ])
    ]
    const result = getCustomEffectBonuses('e-1')
    expect(result.resistances).toEqual(['fire', 'cold'])
  })

  it('collects immunity string values', () => {
    mockCustomEffects = [makeEffect('e-1', [{ type: 'immunity', stringValue: 'poison' }])]
    expect(getCustomEffectBonuses('e-1').immunities).toEqual(['poison'])
  })

  it('collects vulnerability string values', () => {
    mockCustomEffects = [makeEffect('e-1', [{ type: 'vulnerability', stringValue: 'radiant' }])]
    expect(getCustomEffectBonuses('e-1').vulnerabilities).toEqual(['radiant'])
  })

  it('skips resistance/immunity/vulnerability with no stringValue', () => {
    mockCustomEffects = [
      makeEffect('e-1', [
        { type: 'resistance' },
        { type: 'immunity' },
        { type: 'vulnerability' }
      ])
    ]
    const result = getCustomEffectBonuses('e-1')
    expect(result.resistances).toEqual([])
    expect(result.immunities).toEqual([])
    expect(result.vulnerabilities).toEqual([])
  })

  // ── Entity filtering ──

  it('only includes effects for the requested entity', () => {
    mockCustomEffects = [
      makeEffect('e-1', [{ type: 'ac_bonus', value: 2 }]),
      makeEffect('e-2', [{ type: 'ac_bonus', value: 5 }])
    ]
    expect(getCustomEffectBonuses('e-1').acBonus).toBe(2)
    expect(getCustomEffectBonuses('e-2').acBonus).toBe(5)
  })

  it('returns zeroed values for entity with no effects', () => {
    mockCustomEffects = [makeEffect('e-2', [{ type: 'ac_bonus', value: 5 }])]
    expect(getCustomEffectBonuses('e-1').acBonus).toBe(0)
  })

  // ── Condition filtering ──

  it('includes effects with condition "always"', () => {
    mockCustomEffects = [makeEffect('e-1', [{ type: 'ac_bonus', value: 2, condition: 'always' }])]
    expect(getCustomEffectBonuses('e-1').acBonus).toBe(2)
  })

  it('includes effects with no condition (undefined)', () => {
    mockCustomEffects = [makeEffect('e-1', [{ type: 'ac_bonus', value: 3 }])]
    expect(getCustomEffectBonuses('e-1').acBonus).toBe(3)
  })

  it('skips effects with non-always condition', () => {
    mockCustomEffects = [
      makeEffect('e-1', [
        { type: 'ac_bonus', value: 2, condition: 'equipped' },
        { type: 'ac_bonus', value: 1, condition: 'attuned' },
        { type: 'ac_bonus', value: 4, condition: 'in_combat' }
      ])
    ]
    expect(getCustomEffectBonuses('e-1').acBonus).toBe(0)
  })

  it('mixes always and conditional effects correctly', () => {
    mockCustomEffects = [
      makeEffect('e-1', [
        { type: 'attack_bonus', value: 2, condition: 'always' },
        { type: 'attack_bonus', value: 3, condition: 'equipped' },
        { type: 'attack_bonus', value: 1 }
      ])
    ]
    expect(getCustomEffectBonuses('e-1').attackBonus).toBe(3) // 2 + 1, skip equipped
  })

  // ── Null/undefined value handling ──

  it('treats undefined value as 0 for numeric effects', () => {
    mockCustomEffects = [makeEffect('e-1', [{ type: 'ac_bonus' }])]
    expect(getCustomEffectBonuses('e-1').acBonus).toBe(0)
  })

  it('handles negative bonus values', () => {
    mockCustomEffects = [makeEffect('e-1', [{ type: 'ac_bonus', value: -3 }])]
    expect(getCustomEffectBonuses('e-1').acBonus).toBe(-3)
  })

  // ── Multiple effects in one CustomEffect ──

  it('applies multiple mechanical effects from a single custom effect', () => {
    mockCustomEffects = [
      makeEffect('e-1', [
        { type: 'ac_bonus', value: 2 },
        { type: 'attack_bonus', value: 1 },
        { type: 'resistance', stringValue: 'fire' }
      ])
    ]
    const result = getCustomEffectBonuses('e-1')
    expect(result.acBonus).toBe(2)
    expect(result.attackBonus).toBe(1)
    expect(result.resistances).toEqual(['fire'])
  })

  // ── Unrecognized effect types ──

  it('ignores unrecognized effect types gracefully', () => {
    mockCustomEffects = [
      makeEffect('e-1', [
        { type: 'speed_bonus' as any, value: 10 },
        { type: 'ac_bonus', value: 1 }
      ])
    ]
    // speed_bonus is not handled by the bridge switch — should not throw
    const result = getCustomEffectBonuses('e-1')
    expect(result.acBonus).toBe(1)
  })

  // ── Multiple custom effects stacking ──

  it('aggregates across multiple custom effects on same entity', () => {
    mockCustomEffects = [
      makeEffect('e-1', [{ type: 'ac_bonus', value: 1 }], 'Shield of Faith'),
      makeEffect('e-1', [{ type: 'ac_bonus', value: 2 }], 'Haste'),
      makeEffect('e-1', [{ type: 'resistance', stringValue: 'fire' }], 'Protection from Energy'),
      makeEffect('e-1', [{ type: 'resistance', stringValue: 'cold' }], 'Absorb Elements')
    ]
    const result = getCustomEffectBonuses('e-1')
    expect(result.acBonus).toBe(3)
    expect(result.resistances).toEqual(['fire', 'cold'])
  })
})

describe('getEffectiveAC', () => {
  beforeEach(() => {
    mockCustomEffects = []
  })

  it('returns base AC when no effects exist', () => {
    expect(getEffectiveAC('e-1', 15)).toBe(15)
  })

  it('adds AC bonus from custom effects', () => {
    mockCustomEffects = [makeEffect('e-1', [{ type: 'ac_bonus', value: 2 }])]
    expect(getEffectiveAC('e-1', 15)).toBe(17)
  })

  it('subtracts negative AC bonus', () => {
    mockCustomEffects = [makeEffect('e-1', [{ type: 'ac_bonus', value: -3 }])]
    expect(getEffectiveAC('e-1', 15)).toBe(12)
  })

  it('stacks multiple AC bonuses', () => {
    mockCustomEffects = [
      makeEffect('e-1', [{ type: 'ac_bonus', value: 2 }]),
      makeEffect('e-1', [{ type: 'ac_bonus', value: 1 }])
    ]
    expect(getEffectiveAC('e-1', 10)).toBe(13)
  })

  it('ignores effects on other entities', () => {
    mockCustomEffects = [makeEffect('e-2', [{ type: 'ac_bonus', value: 5 }])]
    expect(getEffectiveAC('e-1', 15)).toBe(15)
  })

  it('handles base AC of 0', () => {
    mockCustomEffects = [makeEffect('e-1', [{ type: 'ac_bonus', value: 2 }])]
    expect(getEffectiveAC('e-1', 0)).toBe(2)
  })

  it('only applies ac_bonus, not other bonus types', () => {
    mockCustomEffects = [
      makeEffect('e-1', [
        { type: 'ac_bonus', value: 1 },
        { type: 'attack_bonus', value: 5 },
        { type: 'damage_bonus', value: 10 }
      ])
    ]
    expect(getEffectiveAC('e-1', 15)).toBe(16)
  })
})
