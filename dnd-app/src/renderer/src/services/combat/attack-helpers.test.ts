import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the game store before importing the module under test
const mockUpdateToken = vi.fn()
vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      maps: [
        {
          id: 'map-1',
          tokens: [
            {
              id: 'tok-1',
              entityId: 'e-1',
              entityType: 'player',
              gridX: 0,
              gridY: 0,
              sizeX: 1,
              sizeY: 1,
              currentHP: 20,
              maxHP: 20
            }
          ]
        }
      ],
      activeMapId: 'map-1',
      updateToken: mockUpdateToken
    }))
  }
}))

// Mock dice service
vi.mock('../dice/dice-service', () => ({
  roll: vi.fn((formula: string) => ({
    formula,
    rolls: [8],
    total: 12,
    natural20: false,
    natural1: false
  })),
  rollQuiet: vi.fn((formula: string) => ({
    formula,
    rolls: [4],
    total: 4,
    natural20: false,
    natural1: false
  }))
}))

import { useGameStore } from '../../stores/use-game-store'
import type { ConditionEffectResult } from './attack-condition-effects'
import { applyDamageToToken, buildAttackSummary, doubleDiceInFormula, rollDamage } from './attack-helpers'

describe('doubleDiceInFormula', () => {
  it('doubles 1d8 to 2d8', () => {
    expect(doubleDiceInFormula('1d8')).toBe('2d8')
  })

  it('doubles 2d6 to 4d6', () => {
    expect(doubleDiceInFormula('2d6')).toBe('4d6')
  })

  it('doubles 1d8+3 to 2d8+3 (preserves modifier)', () => {
    expect(doubleDiceInFormula('1d8+3')).toBe('2d8+3')
  })

  it('doubles 2d6+4 to 4d6+4', () => {
    expect(doubleDiceInFormula('2d6+4')).toBe('4d6+4')
  })

  it('doubles 1d12 to 2d12', () => {
    expect(doubleDiceInFormula('1d12')).toBe('2d12')
  })

  it('doubles 3d8+5 to 6d8+5', () => {
    expect(doubleDiceInFormula('3d8+5')).toBe('6d8+5')
  })

  it('handles formula with implicit 1 (d6 → 2d6)', () => {
    // regex: (\d*)d(\d+) where count is empty string → n defaults to 1
    expect(doubleDiceInFormula('d6')).toBe('2d6')
  })

  it('doubles 1d4 to 2d4 (smallest die)', () => {
    expect(doubleDiceInFormula('1d4')).toBe('2d4')
  })

  it('doubles 1d20 to 2d20', () => {
    expect(doubleDiceInFormula('1d20')).toBe('2d20')
  })

  it('only doubles the first dice group (per regex behavior)', () => {
    // The regex replaces only the first match
    const result = doubleDiceInFormula('1d8+1d6')
    expect(result).toBe('2d8+1d6')
  })
})

describe('rollDamage', () => {
  it('returns a DiceRollResult with formula and total', () => {
    const result = rollDamage('1d8+3', false, [], false)
    expect(result).toHaveProperty('formula')
    expect(result).toHaveProperty('total')
    expect(result).toHaveProperty('rolls')
  })

  it('calls doubleDiceInFormula logic for critical hits', () => {
    // When isCritical is true, the formula should be doubled
    const result = rollDamage('1d8+3', true, [], false)
    // The mock roll returns formula it was called with; we check it got doubled
    expect(result.formula).toBe('2d8+3')
  })

  it('includes extra dice damage in total', () => {
    const result = rollDamage('1d8+3', false, [{ formula: '1d6', damageType: 'fire' }], false)
    // Base: total=12 + extra: total=4 = 16
    expect(result.total).toBe(16)
  })

  it('doubles extra dice on critical hit', () => {
    const result = rollDamage('1d8+3', true, [{ formula: '1d6', damageType: 'fire' }], false)
    // Critical: base roll total=12 + doubled extra (rollQuiet of "2d6")=4 → 16
    expect(result.total).toBe(16)
  })

  it('handles empty extra dice array', () => {
    const result = rollDamage('2d6+4', false, [], false)
    expect(result.total).toBe(12) // Mock returns 12 for base roll
  })

  it('handles multiple extra dice sources', () => {
    const result = rollDamage(
      '1d8+3',
      false,
      [
        { formula: '1d6', damageType: 'fire' },
        { formula: '2d8', damageType: 'radiant' }
      ],
      false
    )
    // Base: 12 + extra1: 4 + extra2: 4 = 20
    expect(result.total).toBe(20)
  })
})

describe('applyDamageToToken', () => {
  beforeEach(() => {
    mockUpdateToken.mockClear()
  })

  it('does nothing when damage is 0', () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      maps: [{ id: 'map-1', tokens: [] }],
      activeMapId: 'map-1',
      updateToken: mockUpdateToken
    } as any)

    const token = { id: 'tok-1', currentHP: 20 } as any
    applyDamageToToken(token, 0)
    expect(mockUpdateToken).not.toHaveBeenCalled()
  })

  it('does nothing when damage is negative', () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      maps: [{ id: 'map-1', tokens: [] }],
      activeMapId: 'map-1',
      updateToken: mockUpdateToken
    } as any)

    const token = { id: 'tok-1', currentHP: 20 } as any
    applyDamageToToken(token, -5)
    expect(mockUpdateToken).not.toHaveBeenCalled()
  })

  it('reduces HP by damage amount', () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      maps: [{ id: 'map-1', tokens: [] }],
      activeMapId: 'map-1',
      updateToken: mockUpdateToken
    } as any)

    const token = { id: 'tok-1', currentHP: 20 } as any
    applyDamageToToken(token, 7)
    expect(mockUpdateToken).toHaveBeenCalledWith('map-1', 'tok-1', { currentHP: 13 })
  })

  it('clamps HP to 0 minimum (no negative HP)', () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      maps: [{ id: 'map-1', tokens: [] }],
      activeMapId: 'map-1',
      updateToken: mockUpdateToken
    } as any)

    const token = { id: 'tok-1', currentHP: 5 } as any
    applyDamageToToken(token, 20)
    expect(mockUpdateToken).toHaveBeenCalledWith('map-1', 'tok-1', { currentHP: 0 })
  })

  it('handles undefined currentHP (treats as 0)', () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      maps: [{ id: 'map-1', tokens: [] }],
      activeMapId: 'map-1',
      updateToken: mockUpdateToken
    } as any)

    const token = { id: 'tok-1' } as any
    applyDamageToToken(token, 5)
    expect(mockUpdateToken).toHaveBeenCalledWith('map-1', 'tok-1', { currentHP: 0 })
  })

  it('does nothing if no active map found', () => {
    vi.mocked(useGameStore.getState).mockReturnValue({
      maps: [],
      activeMapId: 'nonexistent',
      updateToken: mockUpdateToken
    } as any)

    const token = { id: 'tok-1', currentHP: 10 } as any
    applyDamageToToken(token, 5)
    expect(mockUpdateToken).not.toHaveBeenCalled()
  })
})

describe('buildAttackSummary', () => {
  const mockDiceResult = {
    formula: '1d20+5',
    rolls: [14],
    total: 19,
    natural20: false,
    natural1: false
  }

  const normalConditions: ConditionEffectResult = {
    advantageSources: [],
    disadvantageSources: [],
    rollMode: 'normal',
    autoCrit: false,
    attackerCannotAct: false,
    exhaustionPenalty: 0
  }

  it('returns a string', () => {
    const summary = buildAttackSummary(
      'Fighter',
      'Goblin',
      'Longsword',
      mockDiceResult,
      15,
      true,
      false,
      false,
      null,
      0,
      'none',
      normalConditions,
      null
    )
    expect(typeof summary).toBe('string')
  })

  it('includes CRITICAL HIT for crits', () => {
    const summary = buildAttackSummary(
      'Fighter',
      'Goblin',
      'Longsword',
      mockDiceResult,
      15,
      true,
      true,
      false,
      null,
      0,
      'none',
      normalConditions,
      null
    )
    expect(summary).toContain('CRITICAL HIT')
  })

  it('includes Critical Miss for fumbles', () => {
    const summary = buildAttackSummary(
      'Fighter',
      'Goblin',
      'Longsword',
      { ...mockDiceResult, total: 6 },
      15,
      false,
      false,
      true,
      null,
      0,
      'none',
      normalConditions,
      null
    )
    expect(summary).toContain('Critical Miss')
  })

  it('includes "hits" text for normal hits', () => {
    const summary = buildAttackSummary(
      'Fighter',
      'Goblin',
      'Longsword',
      mockDiceResult,
      15,
      true,
      false,
      false,
      null,
      0,
      'none',
      normalConditions,
      null
    )
    expect(summary).toContain('hits')
    expect(summary).toContain('19 vs AC 15')
  })

  it('includes "misses" text for misses', () => {
    const summary = buildAttackSummary(
      'Fighter',
      'Goblin',
      'Longsword',
      mockDiceResult,
      22,
      false,
      false,
      false,
      null,
      0,
      'none',
      normalConditions,
      null
    )
    expect(summary).toContain('misses')
    expect(summary).toContain('19 vs AC 22')
  })

  it('includes cover tag when cover is not none', () => {
    const summary = buildAttackSummary(
      'Fighter',
      'Goblin',
      'Longsword',
      mockDiceResult,
      17,
      true,
      false,
      false,
      null,
      0,
      'half',
      normalConditions,
      null
    )
    expect(summary).toContain('half cover')
  })

  it('includes roll mode tag for advantage/disadvantage', () => {
    const advConditions: ConditionEffectResult = {
      ...normalConditions,
      rollMode: 'advantage'
    }
    const summary = buildAttackSummary(
      'Fighter',
      'Goblin',
      'Longsword',
      mockDiceResult,
      15,
      true,
      false,
      false,
      null,
      0,
      'none',
      advConditions,
      null
    )
    expect(summary).toContain('advantage')
  })

  it('includes damage details on hit', () => {
    const dmg = {
      totalRawDamage: 10,
      totalFinalDamage: 10,
      heavyArmorMasterReduction: 0,
      results: [{ finalDamage: 10, rawDamage: 10, damageType: 'slashing', modification: 'normal' as const }]
    }
    const summary = buildAttackSummary(
      'Fighter',
      'Goblin',
      'Longsword',
      mockDiceResult,
      15,
      true,
      false,
      false,
      dmg,
      0,
      'none',
      normalConditions,
      null
    )
    expect(summary).toContain('Damage:')
    expect(summary).toContain('10 slashing')
  })

  it('shows resistance modification in damage details', () => {
    const dmg = {
      totalRawDamage: 10,
      totalFinalDamage: 5,
      heavyArmorMasterReduction: 0,
      results: [{ finalDamage: 5, rawDamage: 10, damageType: 'fire', modification: 'resistant' as const }]
    }
    const summary = buildAttackSummary(
      'Wizard',
      'Fire Elemental',
      'Firebolt',
      mockDiceResult,
      13,
      true,
      false,
      false,
      dmg,
      0,
      'none',
      normalConditions,
      null
    )
    expect(summary).toContain('resistant')
  })

  it('shows graze damage on miss', () => {
    const summary = buildAttackSummary(
      'Fighter',
      'Goblin',
      'Greatsword',
      mockDiceResult,
      22,
      false,
      false,
      false,
      null,
      4,
      'none',
      normalConditions,
      null
    )
    expect(summary).toContain('Graze: 4 damage')
  })

  it('does not show graze when damage is 0', () => {
    const summary = buildAttackSummary(
      'Fighter',
      'Goblin',
      'Greatsword',
      mockDiceResult,
      22,
      false,
      false,
      false,
      null,
      0,
      'none',
      normalConditions,
      null
    )
    expect(summary).not.toContain('Graze')
  })

  it('shows mastery effect on hit (non-Graze)', () => {
    const mastery = {
      mastery: 'Topple',
      description: 'Target must save or be knocked Prone'
    }
    const summary = buildAttackSummary(
      'Fighter',
      'Goblin',
      'Warhammer',
      mockDiceResult,
      15,
      true,
      false,
      false,
      null,
      0,
      'none',
      normalConditions,
      mastery
    )
    expect(summary).toContain('Topple')
  })

  it('does not show Graze mastery label on hit (Graze only fires on miss)', () => {
    const mastery = {
      mastery: 'Graze',
      description: 'Deal ability modifier damage on miss',
      grazeDamage: 3
    }
    const summary = buildAttackSummary(
      'Fighter',
      'Goblin',
      'Greatsword',
      mockDiceResult,
      15,
      true,
      false,
      false,
      null,
      0,
      'none',
      normalConditions,
      mastery
    )
    expect(summary).not.toContain('[Graze')
  })
})
