import { describe, expect, it, vi } from 'vitest'
import { parseDiceFormula, rollDice, rollFormula } from './dice-engine'

// Mock crypto-random so tests are deterministic
vi.mock('../../utils/crypto-random', () => ({
  cryptoRollDie: vi.fn((sides: number) => {
    // Default: return midpoint of die
    return Math.ceil(sides / 2)
  })
}))

import { cryptoRollDie } from '../../utils/crypto-random'

const mockCryptoRollDie = vi.mocked(cryptoRollDie)

describe('parseDiceFormula', () => {
  it('parses standard formulas like "2d6+3"', () => {
    const result = parseDiceFormula('2d6+3')
    expect(result).toEqual({ count: 2, sides: 6, modifier: 3 })
  })

  it('parses "1d20" with implicit count 1 and modifier 0', () => {
    const result = parseDiceFormula('1d20')
    expect(result).toEqual({ count: 1, sides: 20, modifier: 0 })
  })

  it('parses "d20" with implicit count 1', () => {
    const result = parseDiceFormula('d20')
    expect(result).toEqual({ count: 1, sides: 20, modifier: 0 })
  })

  it('parses negative modifiers like "1d20-2"', () => {
    const result = parseDiceFormula('1d20-2')
    expect(result).toEqual({ count: 1, sides: 20, modifier: -2 })
  })

  it('parses high dice counts like "8d6"', () => {
    const result = parseDiceFormula('8d6')
    expect(result).toEqual({ count: 8, sides: 6, modifier: 0 })
  })

  it('handles whitespace around formula', () => {
    const result = parseDiceFormula('  2d8+1  ')
    expect(result).toEqual({ count: 2, sides: 8, modifier: 1 })
  })

  it('returns null for invalid formulas', () => {
    expect(parseDiceFormula('')).toBeNull()
    expect(parseDiceFormula('abc')).toBeNull()
    expect(parseDiceFormula('2d')).toBeNull()
    expect(parseDiceFormula('d')).toBeNull()
    expect(parseDiceFormula('20')).toBeNull()
  })

  it('returns null for formulas with multiple operators like "2d6+3+1"', () => {
    expect(parseDiceFormula('2d6+3+1')).toBeNull()
  })

  it('parses d100 for percentile dice', () => {
    const result = parseDiceFormula('1d100')
    expect(result).toEqual({ count: 1, sides: 100, modifier: 0 })
  })

  it('parses d4 (common for cantrip damage)', () => {
    const result = parseDiceFormula('1d4')
    expect(result).toEqual({ count: 1, sides: 4, modifier: 0 })
  })

  it('parses d12 (barbarian hit die)', () => {
    const result = parseDiceFormula('1d12')
    expect(result).toEqual({ count: 1, sides: 12, modifier: 0 })
  })
})

describe('rollDice', () => {
  it('returns the correct number of results', () => {
    const results = rollDice(4, 6)
    expect(results).toHaveLength(4)
  })

  it('returns a single result for count=1', () => {
    const results = rollDice(1, 20)
    expect(results).toHaveLength(1)
  })

  it('returns empty array for count=0', () => {
    const results = rollDice(0, 6)
    expect(results).toHaveLength(0)
  })

  it('calls cryptoRollDie for each die roll', () => {
    mockCryptoRollDie.mockClear()
    rollDice(3, 8)
    expect(mockCryptoRollDie).toHaveBeenCalledTimes(3)
  })

  it('handles d3 by rolling a d6 and halving (rounding up)', () => {
    // d3 special case: roll d6, Math.ceil(result / 2)
    mockCryptoRollDie.mockClear()
    mockCryptoRollDie.mockReturnValueOnce(1) // d6=1 → ceil(1/2)=1
    const results = rollDice(1, 3)
    expect(results[0]).toBe(1)
    // Verify it rolled a d6 internally
    expect(mockCryptoRollDie).toHaveBeenCalledWith(6)
  })

  it('d3 with d6 result of 5 gives 3', () => {
    mockCryptoRollDie.mockClear()
    mockCryptoRollDie.mockReturnValueOnce(5) // d6=5 → ceil(5/2)=3
    const results = rollDice(1, 3)
    expect(results[0]).toBe(3)
  })

  it('d3 with d6 result of 4 gives 2', () => {
    mockCryptoRollDie.mockClear()
    mockCryptoRollDie.mockReturnValueOnce(4) // d6=4 → ceil(4/2)=2
    const results = rollDice(1, 3)
    expect(results[0]).toBe(2)
  })

  it('non-d3 dice call cryptoRollDie directly with the sides value', () => {
    mockCryptoRollDie.mockClear()
    rollDice(1, 20)
    expect(mockCryptoRollDie).toHaveBeenCalledWith(20)
  })
})

describe('rollFormula', () => {
  it('rolls a valid formula and returns total including modifier', () => {
    // With mock returning ceil(sides/2), rolling 2d6 gives 3+3=6, plus +3 = 9
    mockCryptoRollDie.mockClear()
    mockCryptoRollDie.mockReturnValueOnce(3).mockReturnValueOnce(3)
    const result = rollFormula('2d6+3')
    expect(result).not.toBeNull()
    expect(result!.formula).toBe('2d6+3')
    expect(result!.rolls).toEqual([3, 3])
    expect(result!.total).toBe(9) // 3+3+3
  })

  it('returns null for an invalid formula', () => {
    expect(rollFormula('invalid')).toBeNull()
  })

  it('returns the rolls array with each individual die result', () => {
    mockCryptoRollDie.mockClear()
    mockCryptoRollDie.mockReturnValueOnce(4).mockReturnValueOnce(2).mockReturnValueOnce(6)
    const result = rollFormula('3d8')
    expect(result).not.toBeNull()
    expect(result!.rolls).toEqual([4, 2, 6])
    expect(result!.total).toBe(12)
  })

  it('applies negative modifier correctly', () => {
    mockCryptoRollDie.mockClear()
    mockCryptoRollDie.mockReturnValueOnce(10)
    const result = rollFormula('1d20-5')
    expect(result).not.toBeNull()
    expect(result!.total).toBe(5) // 10 + (-5) = 5
  })

  it('handles modifier of 0 correctly', () => {
    mockCryptoRollDie.mockClear()
    mockCryptoRollDie.mockReturnValueOnce(15)
    const result = rollFormula('1d20')
    expect(result).not.toBeNull()
    expect(result!.total).toBe(15) // 15 + 0
  })

  it('preserves the original formula string in the result', () => {
    mockCryptoRollDie.mockClear()
    mockCryptoRollDie.mockReturnValueOnce(1)
    const result = rollFormula('d20')
    expect(result!.formula).toBe('d20')
  })

  // D&D rule: 4d6 drop lowest for ability score generation
  it('can roll 4d6 (used for stat generation)', () => {
    mockCryptoRollDie.mockClear()
    mockCryptoRollDie.mockReturnValueOnce(3).mockReturnValueOnce(5).mockReturnValueOnce(4).mockReturnValueOnce(2)
    const result = rollFormula('4d6')
    expect(result).not.toBeNull()
    expect(result!.rolls).toHaveLength(4)
    expect(result!.total).toBe(14) // 3+5+4+2
  })

  // D&D rule: Fireball = 8d6
  it('can roll 8d6 for Fireball damage', () => {
    mockCryptoRollDie.mockClear()
    for (let i = 0; i < 8; i++) {
      mockCryptoRollDie.mockReturnValueOnce(4)
    }
    const result = rollFormula('8d6')
    expect(result).not.toBeNull()
    expect(result!.rolls).toHaveLength(8)
    expect(result!.total).toBe(32) // 8 * 4
  })
})
