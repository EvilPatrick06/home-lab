import { describe, expect, it, vi } from 'vitest'
import type { ResolvedEffects } from '../../../../services/combat/effect-resolver-5e'
import type { MapToken } from '../../../../types/map'
import { computeConditionEffects, getAttackMod, getDamageMod, getWeaponContext } from './attack-computations'
import type { AttackWeapon } from './attack-utils'

// ─── Mocks ────────────────────────────────────────────────────

vi.mock('../../../../services/combat/attack-condition-effects', () => ({
  getAttackConditionEffects: vi.fn(() => ({
    rollMode: 'normal',
    advantageSources: [],
    disadvantageSources: [],
    autoCrit: false,
    autoMiss: false,
    notes: []
  }))
}))

vi.mock('../../../../services/combat/combat-rules', () => ({
  isAdjacent: vi.fn(() => false),
  isInMeleeRange: vi.fn(() => true)
}))

vi.mock('../../../../services/combat/flanking', () => ({
  checkFlanking: vi.fn(() => null)
}))

vi.mock('../../../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      flankingEnabled: false,
      underwaterCombat: false
    }))
  }
}))

// ─── Helpers ──────────────────────────────────────────────────

function makeWeapon(overrides: Partial<AttackWeapon> = {}): AttackWeapon {
  return {
    id: 'longsword',
    name: 'Longsword',
    damage: '1d8',
    damageType: 'slashing',
    proficient: true,
    properties: [],
    attackBonus: 0,
    ...overrides
  }
}

function makeToken(overrides: Partial<MapToken> = {}): MapToken {
  return {
    id: 'tok-1',
    entityId: 'ent-1',
    entityType: 'player',
    label: 'Fighter',
    gridX: 0,
    gridY: 0,
    sizeX: 1,
    sizeY: 1,
    conditions: [],
    nameVisible: true,
    ...overrides
  } as MapToken
}

function makeResolved(attackBonusFn = () => 0, damageBonusFn = () => 0, extraDiceFn = () => []): ResolvedEffects {
  return {
    attackBonus: attackBonusFn,
    damageBonus: damageBonusFn,
    getExtraDamageDice: extraDiceFn
  } as unknown as ResolvedEffects
}

// ─── getWeaponContext ─────────────────────────────────────────

describe('getWeaponContext', () => {
  it('returns undefined when weapon is null', () => {
    expect(getWeaponContext(null)).toBeUndefined()
  })

  it('marks melee weapons correctly', () => {
    const ctx = getWeaponContext({ properties: [], damageType: 'slashing' })
    expect(ctx?.isMelee).toBe(true)
    expect(ctx?.isRanged).toBe(false)
  })

  it('marks ranged weapons correctly', () => {
    const ctx = getWeaponContext({ range: '80/320', properties: [], damageType: 'piercing' })
    expect(ctx?.isMelee).toBe(false)
    expect(ctx?.isRanged).toBe(true)
  })

  it('detects Heavy property', () => {
    const ctx = getWeaponContext({ properties: ['Heavy'], damageType: 'slashing' })
    expect(ctx?.isHeavy).toBe(true)
  })

  it('detects Thrown property', () => {
    const ctx = getWeaponContext({ properties: ['Thrown'], damageType: 'piercing' })
    expect(ctx?.isThrown).toBe(true)
  })

  it('detects crossbow in properties (case-insensitive)', () => {
    const ctx = getWeaponContext({ properties: ['Light Crossbow'], damageType: 'piercing' })
    expect(ctx?.isCrossbow).toBe(true)
  })

  it('isSpell is always false', () => {
    const ctx = getWeaponContext({ properties: [], damageType: 'fire' })
    expect(ctx?.isSpell).toBe(false)
  })

  it('includes damageType from the weapon', () => {
    const ctx = getWeaponContext({ properties: [], damageType: 'bludgeoning' })
    expect(ctx?.damageType).toBe('bludgeoning')
  })
})

// ─── getAttackMod ─────────────────────────────────────────────

describe('getAttackMod', () => {
  const baseOpts = {
    strMod: 3,
    dexMod: 1,
    profBonus: 3,
    hasArcheryFS: false,
    resolved: makeResolved()
  }

  it('returns 0 when no weapon is selected', () => {
    expect(getAttackMod({ ...baseOpts, selectedWeapon: null, isUnarmed: false, isImprovised: false })).toBe(0)
  })

  it('returns STR + profBonus for unarmed strikes', () => {
    expect(getAttackMod({ ...baseOpts, selectedWeapon: makeWeapon(), isUnarmed: true, isImprovised: false })).toBe(6) // 3 + 3
  })

  it('returns ability mod only (no proficiency) for improvised melee', () => {
    const melee = makeWeapon({ range: undefined })
    expect(getAttackMod({ ...baseOpts, selectedWeapon: melee, isUnarmed: false, isImprovised: true })).toBe(3) // strMod only
  })

  it('returns DEX mod for improvised ranged weapon', () => {
    const ranged = makeWeapon({ range: '20/60' })
    expect(getAttackMod({ ...baseOpts, selectedWeapon: ranged, isUnarmed: false, isImprovised: true })).toBe(1) // dexMod
  })

  it('uses STR mod for melee weapons without Finesse', () => {
    const melee = makeWeapon({ properties: [] })
    expect(getAttackMod({ ...baseOpts, selectedWeapon: melee, isUnarmed: false, isImprovised: false })).toBe(6) // 3 + 3
  })

  it('uses DEX mod for ranged weapons', () => {
    const ranged = makeWeapon({ range: '80/320' })
    expect(getAttackMod({ ...baseOpts, selectedWeapon: ranged, isUnarmed: false, isImprovised: false })).toBe(4) // 1 + 3
  })

  it('uses best of STR/DEX for Finesse weapons', () => {
    const finesse = makeWeapon({ properties: ['Finesse'] })
    expect(getAttackMod({ ...baseOpts, selectedWeapon: finesse, isUnarmed: false, isImprovised: false })).toBe(6) // max(3,1) + 3
  })

  it('adds Archery FS bonus (+2) for ranged weapons', () => {
    const ranged = makeWeapon({ range: '80/320' })
    expect(
      getAttackMod({ ...baseOpts, selectedWeapon: ranged, isUnarmed: false, isImprovised: false, hasArcheryFS: true })
    ).toBe(6) // 1 + 3 + 2
  })

  it('does NOT add Archery FS for melee weapons', () => {
    const melee = makeWeapon({ properties: [] })
    expect(
      getAttackMod({ ...baseOpts, selectedWeapon: melee, isUnarmed: false, isImprovised: false, hasArcheryFS: true })
    ).toBe(6) // 3 + 3, no +2
  })

  it('skips proficiency when weapon.proficient is false', () => {
    const notProf = makeWeapon({ proficient: false })
    expect(getAttackMod({ ...baseOpts, selectedWeapon: notProf, isUnarmed: false, isImprovised: false })).toBe(3) // strMod only
  })

  it('adds effect resolver attack bonus', () => {
    const resolved = makeResolved(() => 2)
    const melee = makeWeapon()
    expect(getAttackMod({ ...baseOpts, resolved, selectedWeapon: melee, isUnarmed: false, isImprovised: false })).toBe(
      8
    ) // 3 + 3 + 2
  })
})

// ─── getDamageMod ─────────────────────────────────────────────

describe('getDamageMod', () => {
  const baseOpts = {
    strMod: 3,
    dexMod: 1,
    profBonus: 3,
    hasDuelingFS: false,
    hasThrownWeaponFS: false,
    hasGWM: false,
    isOffhandAttack: false,
    resolved: makeResolved()
  }

  it('returns 0 when no weapon is selected', () => {
    expect(getDamageMod({ ...baseOpts, selectedWeapon: null, isUnarmed: false, isImprovised: false })).toBe(0)
  })

  it('returns 1 + STR mod for unarmed strikes', () => {
    expect(getDamageMod({ ...baseOpts, selectedWeapon: makeWeapon(), isUnarmed: true, isImprovised: false })).toBe(4) // 1 + 3
  })

  it('returns STR mod for improvised melee', () => {
    expect(getDamageMod({ ...baseOpts, selectedWeapon: makeWeapon(), isUnarmed: false, isImprovised: true })).toBe(3)
  })

  it('returns DEX mod for improvised ranged', () => {
    const ranged = makeWeapon({ range: '20/60' })
    expect(getDamageMod({ ...baseOpts, selectedWeapon: ranged, isUnarmed: false, isImprovised: true })).toBe(1)
  })

  it('uses STR mod for standard melee', () => {
    expect(getDamageMod({ ...baseOpts, selectedWeapon: makeWeapon(), isUnarmed: false, isImprovised: false })).toBe(3)
  })

  it('adds Dueling FS bonus (+2) for melee one-handed weapon', () => {
    const oneHanded = makeWeapon({ properties: [] })
    expect(
      getDamageMod({
        ...baseOpts,
        selectedWeapon: oneHanded,
        isUnarmed: false,
        isImprovised: false,
        hasDuelingFS: true
      })
    ).toBe(5) // 3 + 2
  })

  it('does NOT add Dueling FS for two-handed weapons', () => {
    const twoHand = makeWeapon({ properties: ['Two-Handed'] })
    expect(
      getDamageMod({ ...baseOpts, selectedWeapon: twoHand, isUnarmed: false, isImprovised: false, hasDuelingFS: true })
    ).toBe(3)
  })

  it('adds GWM bonus (+profBonus) for Heavy weapons', () => {
    const heavy = makeWeapon({ properties: ['Heavy'] })
    expect(
      getDamageMod({ ...baseOpts, selectedWeapon: heavy, isUnarmed: false, isImprovised: false, hasGWM: true })
    ).toBe(6) // 3 + 3
  })

  it('does NOT add GWM for non-Heavy weapons', () => {
    const light = makeWeapon({ properties: [] })
    expect(
      getDamageMod({ ...baseOpts, selectedWeapon: light, isUnarmed: false, isImprovised: false, hasGWM: true })
    ).toBe(3)
  })

  it('offhand attack: only adds negative ability modifier', () => {
    // With negative strMod: baseMod = -2 → offhand returns -2
    const opts = {
      ...baseOpts,
      strMod: -2,
      selectedWeapon: makeWeapon(),
      isUnarmed: false,
      isImprovised: false,
      isOffhandAttack: true
    }
    expect(getDamageMod(opts)).toBe(-2)
  })

  it('offhand attack with positive modifier: returns 0 (no bonus)', () => {
    const opts = {
      ...baseOpts,
      selectedWeapon: makeWeapon(),
      isUnarmed: false,
      isImprovised: false,
      isOffhandAttack: true
    }
    expect(getDamageMod(opts)).toBe(0)
  })
})

// ─── computeConditionEffects ──────────────────────────────────

describe('computeConditionEffects', () => {
  it('returns null when selectedWeapon is null', () => {
    const result = computeConditionEffects({
      selectedWeapon: null,
      selectedTarget: makeToken(),
      attackerToken: makeToken(),
      gameConditions: [],
      turnStates: {},
      tokens: []
    })
    expect(result).toBeNull()
  })

  it('returns null when selectedTarget is null', () => {
    const result = computeConditionEffects({
      selectedWeapon: makeWeapon(),
      selectedTarget: null,
      attackerToken: makeToken(),
      gameConditions: [],
      turnStates: {},
      tokens: []
    })
    expect(result).toBeNull()
  })

  it('returns null when attackerToken is null', () => {
    const result = computeConditionEffects({
      selectedWeapon: makeWeapon(),
      selectedTarget: makeToken(),
      attackerToken: null,
      gameConditions: [],
      turnStates: {},
      tokens: []
    })
    expect(result).toBeNull()
  })

  it('calls getAttackConditionEffects and returns the result', async () => {
    const { getAttackConditionEffects } = await import('../../../../services/combat/attack-condition-effects')
    const result = computeConditionEffects({
      selectedWeapon: makeWeapon(),
      selectedTarget: makeToken({ entityId: 'target-1' }),
      attackerToken: makeToken({ entityId: 'attacker-1' }),
      gameConditions: [],
      turnStates: {},
      tokens: []
    })
    expect(getAttackConditionEffects).toHaveBeenCalled()
    expect(result).not.toBeNull()
  })
})
