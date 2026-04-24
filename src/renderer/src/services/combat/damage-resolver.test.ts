import { describe, expect, it } from 'vitest'
import type { DamageApplication } from './damage-resolver'
import { matchesConditionalResistance, resolveDamage } from './damage-resolver'

describe('matchesConditionalResistance', () => {
  it('matches simple damage type (exact)', () => {
    expect(matchesConditionalResistance('fire', 'fire', false, false)).toBe(true)
  })

  it('matches case-insensitively', () => {
    expect(matchesConditionalResistance('Fire', 'fire', false, false)).toBe(true)
    expect(matchesConditionalResistance('COLD', 'cold', false, false)).toBe(true)
  })

  it('does not match different damage types', () => {
    expect(matchesConditionalResistance('fire', 'cold', false, false)).toBe(false)
  })

  it('matches compound BPS for nonmagical attacks', () => {
    const entry = 'bludgeoning, piercing, slashing from nonmagical attacks'
    expect(matchesConditionalResistance(entry, 'slashing', false, false)).toBe(true)
    expect(matchesConditionalResistance(entry, 'piercing', false, false)).toBe(true)
    expect(matchesConditionalResistance(entry, 'bludgeoning', false, false)).toBe(true)
  })

  it('does not match compound BPS when attack is magical', () => {
    const entry = 'bludgeoning, piercing, slashing from nonmagical attacks'
    expect(matchesConditionalResistance(entry, 'slashing', true, false)).toBe(false)
  })

  it('does not match compound BPS for non-physical damage types', () => {
    const entry = 'bludgeoning, piercing, slashing from nonmagical attacks'
    expect(matchesConditionalResistance(entry, 'fire', false, false)).toBe(false)
  })

  it('silvered bypass: does not match when silvered and entry mentions silvered', () => {
    const entry = 'bludgeoning, piercing, slashing from nonmagical attacks not made with silvered weapons'
    expect(matchesConditionalResistance(entry, 'slashing', false, true)).toBe(false)
  })

  it('silvered entry still matches when not silvered and not magical', () => {
    const entry = 'bludgeoning, piercing, slashing from nonmagical attacks not made with silvered weapons'
    expect(matchesConditionalResistance(entry, 'slashing', false, false)).toBe(true)
  })

  it('alternate phrasing "nonmagical bludgeoning, piercing, and slashing"', () => {
    const entry = 'nonmagical bludgeoning, piercing, and slashing'
    expect(matchesConditionalResistance(entry, 'piercing', false, false)).toBe(true)
    expect(matchesConditionalResistance(entry, 'piercing', true, false)).toBe(false)
  })
})

describe('resolveDamage', () => {
  const _noDef = { hasHeavyArmorMaster: false, targetIsWearingHeavyArmor: false }

  function makeDamage(raw: number, type: string, magical = false, silvered = false): DamageApplication {
    return { rawDamage: raw, damageType: type, isMagical: magical, isFromSilveredWeapon: silvered }
  }

  it('passes through damage with no resistances/immunities/vulnerabilities', () => {
    const result = resolveDamage([makeDamage(10, 'fire')], [], [], [], false, false)
    expect(result.totalFinalDamage).toBe(10)
    expect(result.results[0].modification).toBe('normal')
  })

  it('applies immunity (damage → 0)', () => {
    const result = resolveDamage([makeDamage(20, 'fire')], [], ['fire'], [], false, false)
    expect(result.totalFinalDamage).toBe(0)
    expect(result.results[0].modification).toBe('immune')
  })

  it('applies resistance (damage halved, rounded down)', () => {
    const result = resolveDamage([makeDamage(15, 'fire')], ['fire'], [], [], false, false)
    expect(result.totalFinalDamage).toBe(7) // floor(15/2)
    expect(result.results[0].modification).toBe('resistant')
  })

  it('applies vulnerability (damage doubled)', () => {
    const result = resolveDamage([makeDamage(10, 'fire')], [], [], ['fire'], false, false)
    expect(result.totalFinalDamage).toBe(20)
    expect(result.results[0].modification).toBe('vulnerable')
  })

  it('vulnerability + resistance both apply per PHB 2024 order (resistance then vulnerability)', () => {
    // Even raw: 10 → halved to 5 → doubled to 10 (net same)
    const result = resolveDamage([makeDamage(10, 'fire')], ['fire'], [], ['fire'], false, false)
    expect(result.totalFinalDamage).toBe(10)
    expect(result.results[0].modification).toBe('normal')
  })

  it('vulnerability + resistance with odd damage loses 1 due to rounding', () => {
    // Odd raw: 15 → halved to 7 (floor) → doubled to 14
    const result = resolveDamage([makeDamage(15, 'fire')], ['fire'], [], ['fire'], false, false)
    expect(result.totalFinalDamage).toBe(14)
    expect(result.results[0].modification).toBe('normal')
  })

  it('immunity takes priority over vulnerability', () => {
    const result = resolveDamage([makeDamage(10, 'fire')], [], ['fire'], ['fire'], false, false)
    expect(result.totalFinalDamage).toBe(0)
    expect(result.results[0].modification).toBe('immune')
  })

  it('handles multiple damage types', () => {
    const damages = [makeDamage(10, 'fire'), makeDamage(8, 'cold')]
    const result = resolveDamage(damages, ['fire'], [], [], false, false)
    expect(result.totalFinalDamage).toBe(5 + 8) // fire halved, cold normal
    expect(result.totalRawDamage).toBe(18)
  })

  it('applies Heavy Armor Master reduction equal to proficiency bonus (PHB 2024)', () => {
    // PB +2 (level 1-4)
    const result2 = resolveDamage([makeDamage(10, 'slashing')], [], [], [], true, true, false, 2)
    expect(result2.totalFinalDamage).toBe(8) // 10 - 2
    expect(result2.heavyArmorMasterReduction).toBe(2)
    // PB +3 (level 5-8)
    const result3 = resolveDamage([makeDamage(10, 'slashing')], [], [], [], true, true, false, 3)
    expect(result3.totalFinalDamage).toBe(7) // 10 - 3
    expect(result3.heavyArmorMasterReduction).toBe(3)
    // PB +6 (level 17-20)
    const result6 = resolveDamage([makeDamage(10, 'slashing')], [], [], [], true, true, false, 6)
    expect(result6.totalFinalDamage).toBe(4) // 10 - 6
    expect(result6.heavyArmorMasterReduction).toBe(6)
  })

  it('does not apply Heavy Armor Master to magical BPS', () => {
    const result = resolveDamage([makeDamage(10, 'slashing', true)], [], [], [], true, true)
    expect(result.totalFinalDamage).toBe(10)
    expect(result.heavyArmorMasterReduction).toBe(0)
  })

  it('does not apply Heavy Armor Master without heavy armor', () => {
    const result = resolveDamage([makeDamage(10, 'slashing')], [], [], [], true, false)
    expect(result.totalFinalDamage).toBe(10)
  })

  it('does not apply Heavy Armor Master to non-physical damage', () => {
    const result = resolveDamage([makeDamage(10, 'fire')], [], [], [], true, true)
    expect(result.totalFinalDamage).toBe(10)
  })

  it('Heavy Armor Master cannot reduce below 0', () => {
    const result = resolveDamage([makeDamage(2, 'slashing')], [], [], [], true, true, false, 4)
    expect(result.totalFinalDamage).toBe(0) // min(2, 4) = 2 reduction
    expect(result.heavyArmorMasterReduction).toBe(2)
  })

  it('Heavy Armor Master adjustment applies before resistance per PHB 2024', () => {
    // PHB 2024: adjustments first, then resistance, then vulnerability
    // 10 slashing → HAM -3 = 7 → resistance halves = floor(7/2) = 3
    const result = resolveDamage(
      [makeDamage(10, 'slashing')],
      ['bludgeoning, piercing, slashing from nonmagical attacks'],
      [],
      [],
      true,
      true,
      false,
      3
    )
    expect(result.totalFinalDamage).toBe(3)
  })

  // Underwater combat
  it('halves fire damage when underwater', () => {
    const result = resolveDamage([makeDamage(10, 'fire')], [], [], [], false, false, true)
    expect(result.totalFinalDamage).toBe(5) // 10/2
    expect(result.results[0].reason).toContain('Underwater')
  })

  it('does not halve non-fire damage underwater', () => {
    const result = resolveDamage([makeDamage(10, 'cold')], [], [], [], false, false, true)
    expect(result.totalFinalDamage).toBe(10)
  })

  it('fire immune still takes 0 underwater', () => {
    const result = resolveDamage([makeDamage(20, 'fire')], [], ['fire'], [], false, false, true)
    expect(result.totalFinalDamage).toBe(0)
  })

  it('PHB 2024 example: adjustment then resistance then vulnerability', () => {
    // PHB 2024 Ch1 example: 28 fire, creature has Resistance to all damage and
    // Vulnerability to Fire, within an aura that reduces damage by 5.
    // We simulate the -5 aura as rawDamage=23 (28-5 pre-applied).
    // 23 → halved for resistance = 11 → doubled for vulnerability = 22
    const result = resolveDamage([makeDamage(23, 'fire')], ['fire'], [], ['fire'], false, false)
    expect(result.totalFinalDamage).toBe(22)
  })

  it('fire resistance + underwater do not stack (PHB 2024 No Stacking rule)', () => {
    // PHB 2024: "Anything underwater has Resistance to Fire damage."
    // Multiple instances of Resistance to the same type count as one.
    // 20 fire → halved once = 10
    const result = resolveDamage([makeDamage(20, 'fire')], ['fire'], [], [], false, false, true)
    expect(result.totalFinalDamage).toBe(10)
  })
})
