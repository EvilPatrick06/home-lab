import { describe, expect, it } from 'vitest'
import type { DiceRollResult, ParsedDice } from './dice-utils'
import { parseDiceFormula, rollDice } from './dice-utils'

describe('parseDiceFormula', () => {
  it('parses a simple formula like "d20"', () => {
    const result = parseDiceFormula('d20')
    expect(result).toEqual({ count: 1, sides: 20, modifier: 0 })
  })

  it('parses "1d6"', () => {
    const result = parseDiceFormula('1d6')
    expect(result).toEqual({ count: 1, sides: 6, modifier: 0 })
  })

  it('parses "2d8+3"', () => {
    const result = parseDiceFormula('2d8+3')
    expect(result).toEqual({ count: 2, sides: 8, modifier: 3 })
  })

  it('parses "3d10-2"', () => {
    const result = parseDiceFormula('3d10-2')
    expect(result).toEqual({ count: 3, sides: 10, modifier: -2 })
  })

  it('parses "4d4+0" (explicit zero modifier)', () => {
    const result = parseDiceFormula('4d4+0')
    expect(result).toEqual({ count: 4, sides: 4, modifier: 0 })
  })

  it('trims whitespace', () => {
    const result = parseDiceFormula('  2d6+1  ')
    expect(result).toEqual({ count: 2, sides: 6, modifier: 1 })
  })

  it('returns null for invalid formula', () => {
    expect(parseDiceFormula('hello')).toBeNull()
    expect(parseDiceFormula('')).toBeNull()
    expect(parseDiceFormula('d')).toBeNull()
    expect(parseDiceFormula('2d')).toBeNull()
    expect(parseDiceFormula('abc123')).toBeNull()
  })

  it('returns null for count > 100', () => {
    expect(parseDiceFormula('101d6')).toBeNull()
  })

  it('returns null for count < 1 (zero dice)', () => {
    expect(parseDiceFormula('0d6')).toBeNull()
  })

  it('returns null for sides > 1000', () => {
    expect(parseDiceFormula('1d1001')).toBeNull()
  })

  it('returns null for sides < 1', () => {
    expect(parseDiceFormula('1d0')).toBeNull()
  })

  it('allows boundary values: count=100, sides=1000', () => {
    const result = parseDiceFormula('100d1000')
    expect(result).toEqual({ count: 100, sides: 1000, modifier: 0 })
  })

  it('allows boundary values: count=1, sides=1', () => {
    const result = parseDiceFormula('1d1')
    expect(result).toEqual({ count: 1, sides: 1, modifier: 0 })
  })

  it('rejects formulas with extra characters', () => {
    expect(parseDiceFormula('2d6+3extra')).toBeNull()
    expect(parseDiceFormula('prefix2d6')).toBeNull()
  })
})

describe('ParsedDice — type contract', () => {
  it('parseDiceFormula result satisfies the ParsedDice shape', () => {
    const result: ParsedDice | null = parseDiceFormula('3d8+2')
    expect(result).not.toBeNull()
    const parsed = result as ParsedDice
    expect(typeof parsed.count).toBe('number')
    expect(typeof parsed.sides).toBe('number')
    expect(typeof parsed.modifier).toBe('number')
    expect(parsed.count).toBe(3)
    expect(parsed.sides).toBe(8)
    expect(parsed.modifier).toBe(2)
  })

  it('ParsedDice fields are all numbers with no extra properties needed', () => {
    const manual: ParsedDice = { count: 2, sides: 6, modifier: 0 }
    expect(Object.keys(manual)).toEqual(['count', 'sides', 'modifier'])
  })
})

describe('DiceRollResult — type contract', () => {
  it('rollDice result satisfies the DiceRollResult shape', () => {
    const result: DiceRollResult | null = rollDice('2d6+3')
    expect(result).not.toBeNull()
    const roll = result as DiceRollResult
    expect(typeof roll.formula).toBe('string')
    expect(typeof roll.total).toBe('number')
    expect(Array.isArray(roll.rolls)).toBe(true)
    expect(roll.formula).toBe('2d6+3')
    expect(roll.rolls).toHaveLength(2)
  })

  it('DiceRollResult rolls array contains only numbers', () => {
    const result: DiceRollResult | null = rollDice('4d6')
    expect(result).not.toBeNull()
    for (const roll of (result as DiceRollResult).rolls) {
      expect(typeof roll).toBe('number')
    }
  })
})

describe('rollDice', () => {
  it('returns a DiceRollResult for a valid formula', () => {
    const result = rollDice('2d6')
    expect(result).not.toBeNull()
    expect(result!.formula).toBe('2d6')
    expect(result!.rolls).toHaveLength(2)
    expect(typeof result!.total).toBe('number')
  })

  it('returns null for an invalid formula', () => {
    expect(rollDice('not a dice')).toBeNull()
    expect(rollDice('')).toBeNull()
  })

  it('rolls produce values within valid range for 1d6', () => {
    for (let i = 0; i < 50; i++) {
      const result = rollDice('1d6')!
      expect(result.rolls).toHaveLength(1)
      expect(result.rolls[0]).toBeGreaterThanOrEqual(1)
      expect(result.rolls[0]).toBeLessThanOrEqual(6)
      expect(result.total).toBe(result.rolls[0])
    }
  })

  it('applies positive modifier correctly', () => {
    const result = rollDice('1d1+5')!
    // 1d1 always rolls 1, plus modifier 5 = 6
    expect(result.total).toBe(6)
    expect(result.rolls).toEqual([1])
  })

  it('applies negative modifier correctly', () => {
    const result = rollDice('1d1-3')!
    // 1d1 always rolls 1, minus 3 = -2
    expect(result.total).toBe(-2)
    expect(result.rolls).toEqual([1])
  })

  it('total equals sum of rolls plus modifier', () => {
    for (let i = 0; i < 50; i++) {
      const result = rollDice('3d8+2')!
      const sumOfRolls = result.rolls.reduce((a, b) => a + b, 0)
      expect(result.total).toBe(sumOfRolls + 2)
    }
  })

  it('total for multiple dice is within expected bounds', () => {
    for (let i = 0; i < 50; i++) {
      const result = rollDice('4d6')!
      expect(result.total).toBeGreaterThanOrEqual(4) // 4 * 1
      expect(result.total).toBeLessThanOrEqual(24) // 4 * 6
    }
  })

  it('preserves the original formula string', () => {
    const result = rollDice('3d10-2')!
    expect(result.formula).toBe('3d10-2')
  })
})
