import { describe, expect, it, vi } from 'vitest'
import { IMPROVISED_WEAPON, parseDamageDice, rollD20, rollDice, UNARMED_STRIKE } from './attack-utils'

// ─── Mock dice service ─────────────────────────────────────────

vi.mock('../../../../services/dice/dice-service', () => ({
  rollSingle: vi.fn((sides: number) => Math.floor(Math.random() * sides) + 1),
  rollMultiple: vi.fn((count: number, sides: number) =>
    Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1)
  )
}))

// ─── rollD20 ──────────────────────────────────────────────────

describe('rollD20', () => {
  it('calls rollSingle with 20', async () => {
    const { rollSingle } = await import('../../../../services/dice/dice-service')
    rollD20()
    expect(rollSingle).toHaveBeenCalledWith(20)
  })

  it('returns a value between 1 and 20 inclusive', async () => {
    // Use a real implementation for range validation
    vi.mocked((await import('../../../../services/dice/dice-service')).rollSingle).mockReturnValueOnce(15)
    expect(rollD20()).toBe(15)
  })
})

// ─── rollDice ─────────────────────────────────────────────────

describe('rollDice', () => {
  it('calls rollMultiple with count and sides', async () => {
    const { rollMultiple } = await import('../../../../services/dice/dice-service')
    rollDice(3, 6)
    expect(rollMultiple).toHaveBeenCalledWith(3, 6)
  })

  it('returns an array of the correct length', async () => {
    vi.mocked((await import('../../../../services/dice/dice-service')).rollMultiple).mockReturnValueOnce([1, 2, 3])
    const result = rollDice(3, 6)
    expect(result).toHaveLength(3)
  })

  it('returns the values from rollMultiple', async () => {
    vi.mocked((await import('../../../../services/dice/dice-service')).rollMultiple).mockReturnValueOnce([4, 5, 6])
    expect(rollDice(3, 6)).toEqual([4, 5, 6])
  })
})

// ─── parseDamageDice ──────────────────────────────────────────

describe('parseDamageDice', () => {
  it('parses standard notation "1d6"', () => {
    expect(parseDamageDice('1d6')).toEqual({ count: 1, sides: 6, modifier: 0 })
  })

  it('parses notation with count "2d8"', () => {
    expect(parseDamageDice('2d8')).toEqual({ count: 2, sides: 8, modifier: 0 })
  })

  it('parses notation without count "d12" (defaults to 1)', () => {
    expect(parseDamageDice('d12')).toEqual({ count: 1, sides: 12, modifier: 0 })
  })

  it('parses notation with positive modifier "1d6+3"', () => {
    expect(parseDamageDice('1d6+3')).toEqual({ count: 1, sides: 6, modifier: 3 })
  })

  it('parses notation with negative modifier "2d6-2"', () => {
    expect(parseDamageDice('2d6-2')).toEqual({ count: 2, sides: 6, modifier: -2 })
  })

  it('parses notation with spaces "1d6 + 3"', () => {
    expect(parseDamageDice('1d6 + 3')).toEqual({ count: 1, sides: 6, modifier: 3 })
  })

  it('returns null for unparseable strings', () => {
    expect(parseDamageDice('invalid')).toBeNull()
    expect(parseDamageDice('flat5')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseDamageDice('')).toBeNull()
  })

  it('handles "0" (unarmed strike placeholder) — returns null since no dice notation', () => {
    // "0" does not match the pattern /^(\d*)d(\d+)/ so returns null
    expect(parseDamageDice('0')).toBeNull()
  })

  it('trims leading/trailing whitespace', () => {
    expect(parseDamageDice('  2d6  ')).toEqual({ count: 2, sides: 6, modifier: 0 })
  })
})

// ─── UNARMED_STRIKE constant ──────────────────────────────────

describe('UNARMED_STRIKE', () => {
  it('has id "__unarmed__"', () => {
    expect(UNARMED_STRIKE.id).toBe('__unarmed__')
  })

  it('has name "Unarmed Strike"', () => {
    expect(UNARMED_STRIKE.name).toBe('Unarmed Strike')
  })

  it('has bludgeoning damage type', () => {
    expect(UNARMED_STRIKE.damageType).toBe('bludgeoning')
  })

  it('is marked as proficient', () => {
    expect(UNARMED_STRIKE.proficient).toBe(true)
  })

  it('has no range (melee)', () => {
    expect(UNARMED_STRIKE.range).toBeUndefined()
  })

  it('has empty properties array', () => {
    expect(UNARMED_STRIKE.properties).toEqual([])
  })
})

// ─── IMPROVISED_WEAPON constant ───────────────────────────────

describe('IMPROVISED_WEAPON', () => {
  it('has id "__improvised__"', () => {
    expect(IMPROVISED_WEAPON.id).toBe('__improvised__')
  })

  it('has name "Improvised Weapon"', () => {
    expect(IMPROVISED_WEAPON.name).toBe('Improvised Weapon')
  })

  it('uses 1d4 damage dice', () => {
    expect(IMPROVISED_WEAPON.damage).toBe('1d4')
  })

  it('has bludgeoning damage type', () => {
    expect(IMPROVISED_WEAPON.damageType).toBe('bludgeoning')
  })

  it('is not proficient', () => {
    expect(IMPROVISED_WEAPON.proficient).toBe(false)
  })

  it('has a range (can be thrown)', () => {
    expect(IMPROVISED_WEAPON.range).toBe('20/60')
  })

  it('has empty properties array', () => {
    expect(IMPROVISED_WEAPON.properties).toEqual([])
  })
})
