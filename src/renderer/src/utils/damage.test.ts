import { describe, expect, it } from 'vitest'
import { applyDamageToCharacter, applyDamageTypeModifiers } from './damage'

// ─── applyDamageTypeModifiers ───────────────────────────────

describe('applyDamageTypeModifiers', () => {
  it('returns raw damage unchanged when no damage type is given', () => {
    const result = applyDamageTypeModifiers(10, undefined, [], [], [])
    expect(result.effectiveDamage).toBe(10)
    expect(result.description).toBeNull()
  })

  it('returns raw damage when no resistances/vulnerabilities/immunities match', () => {
    const result = applyDamageTypeModifiers(10, 'fire', [], [], [])
    expect(result.effectiveDamage).toBe(10)
    expect(result.description).toBeNull()
  })

  it('immunity reduces damage to 0', () => {
    const result = applyDamageTypeModifiers(20, 'fire', [], [], ['fire'])
    expect(result.effectiveDamage).toBe(0)
    expect(result.description).toBe('Immune to fire')
  })

  it('resistance halves damage (rounded down)', () => {
    const result = applyDamageTypeModifiers(15, 'cold', ['cold'], [], [])
    expect(result.effectiveDamage).toBe(7) // floor(15/2)
    expect(result.description).toContain('Resistant')
  })

  it('vulnerability doubles damage', () => {
    const result = applyDamageTypeModifiers(10, 'fire', [], ['fire'], [])
    expect(result.effectiveDamage).toBe(20)
    expect(result.description).toContain('Vulnerable')
  })

  it('applies resistance before vulnerability per PHB order', () => {
    // PHB: resistance halves first, then vulnerability doubles
    const result = applyDamageTypeModifiers(10, 'fire', ['fire'], ['fire'], [])
    // floor(10/2) = 5, then 5*2 = 10
    expect(result.effectiveDamage).toBe(10)
    expect(result.description).toContain('Resistant')
    expect(result.description).toContain('Vulnerable')
  })

  it('immunity takes priority over resistance and vulnerability', () => {
    const result = applyDamageTypeModifiers(20, 'fire', ['fire'], ['fire'], ['fire'])
    expect(result.effectiveDamage).toBe(0)
    expect(result.description).toBe('Immune to fire')
  })

  it('is case-insensitive for damage type matching', () => {
    const result = applyDamageTypeModifiers(10, 'Fire', ['fire'], [], [])
    expect(result.effectiveDamage).toBe(5)
  })

  it('does not match different damage types', () => {
    const result = applyDamageTypeModifiers(10, 'fire', ['cold'], ['lightning'], ['poison'])
    expect(result.effectiveDamage).toBe(10)
    expect(result.description).toBeNull()
  })

  it('handles odd damage with resistance (rounds down)', () => {
    const result = applyDamageTypeModifiers(7, 'cold', ['cold'], [], [])
    expect(result.effectiveDamage).toBe(3) // floor(7/2) = 3
  })

  it('handles 0 damage', () => {
    const result = applyDamageTypeModifiers(0, 'fire', ['fire'], [], [])
    expect(result.effectiveDamage).toBe(0)
  })

  it('handles 1 damage with resistance', () => {
    const result = applyDamageTypeModifiers(1, 'fire', ['fire'], [], [])
    expect(result.effectiveDamage).toBe(0) // floor(1/2) = 0
  })
})

// ─── applyDamageToCharacter ─────────────────────────────────

describe('applyDamageToCharacter', () => {
  it('deducts damage from HP when no temp HP and no modifiers', () => {
    const result = applyDamageToCharacter(20, 20, 0, 5)
    expect(result.hpLost).toBe(5)
    expect(result.tempHpLost).toBe(0)
    expect(result.reducedToZero).toBe(false)
    expect(result.instantDeath).toBe(false)
  })

  it('absorbs damage with temp HP first', () => {
    const result = applyDamageToCharacter(20, 20, 10, 15)
    expect(result.tempHpLost).toBe(10)
    expect(result.hpLost).toBe(5)
  })

  it('only absorbs what temp HP can cover', () => {
    const result = applyDamageToCharacter(20, 20, 3, 10)
    expect(result.tempHpLost).toBe(3)
    expect(result.hpLost).toBe(7)
  })

  it('does not reduce HP below 0', () => {
    const result = applyDamageToCharacter(5, 20, 0, 100)
    expect(result.hpLost).toBe(5)
    expect(result.reducedToZero).toBe(true)
  })

  it('sets reducedToZero when HP drops to exactly 0', () => {
    const result = applyDamageToCharacter(10, 20, 0, 10)
    expect(result.hpLost).toBe(10)
    expect(result.reducedToZero).toBe(true)
  })

  it('tracks remainingDamage after HP reaches 0', () => {
    const result = applyDamageToCharacter(10, 20, 0, 30)
    expect(result.hpLost).toBe(10)
    expect(result.remainingDamage).toBe(20)
  })

  it('triggers instantDeath when remaining damage >= maxHP', () => {
    // Current HP: 10, Max HP: 20, Damage: 30
    // HP lost: 10, remaining: 20 >= maxHP(20) → instant death
    const result = applyDamageToCharacter(10, 20, 0, 30)
    expect(result.instantDeath).toBe(true)
  })

  it('does not trigger instantDeath when remaining < maxHP', () => {
    const result = applyDamageToCharacter(10, 20, 0, 25)
    // remaining = 15, maxHP = 20 → not instant death
    expect(result.instantDeath).toBe(false)
  })

  it('applies resistance to reduce effective damage', () => {
    const result = applyDamageToCharacter(20, 20, 0, 10, 'fire', ['fire'])
    expect(result.effectiveDamage).toBe(5) // halved
    expect(result.hpLost).toBe(5)
  })

  it('applies vulnerability to increase effective damage', () => {
    const result = applyDamageToCharacter(20, 20, 0, 10, 'fire', [], ['fire'])
    expect(result.effectiveDamage).toBe(20) // doubled
    expect(result.hpLost).toBe(20)
    expect(result.reducedToZero).toBe(true)
  })

  it('applies immunity to block all damage', () => {
    const result = applyDamageToCharacter(20, 20, 5, 50, 'poison', [], [], ['poison'])
    expect(result.effectiveDamage).toBe(0)
    expect(result.hpLost).toBe(0)
    expect(result.tempHpLost).toBe(0)
    expect(result.reducedToZero).toBe(false)
  })

  it('handles massive damage through temp HP correctly', () => {
    // Current HP: 5, Max HP: 10, Temp HP: 5, Damage: 25
    // Effective damage: 25
    // tempHpLost: 5, remaining: 20
    // hpLost: 5, remaining: 15
    // 15 >= 10 (maxHP) → instant death
    const result = applyDamageToCharacter(5, 10, 5, 25)
    expect(result.tempHpLost).toBe(5)
    expect(result.hpLost).toBe(5)
    expect(result.remainingDamage).toBe(15)
    expect(result.instantDeath).toBe(true)
  })

  it('includes modifierDescription when damage type has modifiers', () => {
    const result = applyDamageToCharacter(20, 20, 0, 10, 'fire', ['fire'])
    expect(result.modifierDescription).not.toBeNull()
    expect(result.modifierDescription).toContain('Resistant')
  })

  it('modifierDescription is null when no type modifiers apply', () => {
    const result = applyDamageToCharacter(20, 20, 0, 10)
    expect(result.modifierDescription).toBeNull()
  })

  it('handles 0 damage correctly', () => {
    const result = applyDamageToCharacter(20, 20, 5, 0)
    expect(result.hpLost).toBe(0)
    expect(result.tempHpLost).toBe(0)
    expect(result.effectiveDamage).toBe(0)
    expect(result.reducedToZero).toBe(false)
  })
})
