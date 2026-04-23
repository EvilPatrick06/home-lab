import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies before imports
vi.mock('../../components/game/dice3d', () => ({
  trigger3dDice: vi.fn()
}))

vi.mock('../../stores/use-lobby-store', () => ({
  useLobbyStore: {
    getState: vi.fn(() => ({
      players: [{ peerId: 'local-peer', displayName: 'TestPlayer' }],
      addChatMessage: vi.fn()
    }))
  }
}))

vi.mock('../../stores/use-network-store', () => ({
  useNetworkStore: {
    getState: vi.fn(() => ({
      localPeerId: 'local-peer',
      sendMessage: vi.fn()
    }))
  }
}))

vi.mock('../../utils/crypto-random', () => ({
  cryptoRandom: vi.fn(() => 0.5)
}))

import { trigger3dDice } from '../../components/game/dice3d'
import { cryptoRandom } from '../../utils/crypto-random'
import {
  getLastRoll,
  parseFormula,
  roll,
  rollD20,
  rollDamage,
  rollMultiple,
  rollQuiet,
  rollSingle,
  setLastRoll
} from './dice-service'

const mockCryptoRandom = vi.mocked(cryptoRandom)
const mockTrigger3dDice = vi.mocked(trigger3dDice)

beforeEach(() => {
  vi.clearAllMocks()
  setLastRoll(null)
})

describe('parseFormula', () => {
  it('parses standard "2d6+3" formula', () => {
    expect(parseFormula('2d6+3')).toEqual({ count: 2, sides: 6, modifier: 3 })
  })

  it('parses "d20" with implicit count of 1', () => {
    expect(parseFormula('d20')).toEqual({ count: 1, sides: 20, modifier: 0 })
  })

  it('parses negative modifiers', () => {
    expect(parseFormula('1d20-2')).toEqual({ count: 1, sides: 20, modifier: -2 })
  })

  it('returns null for invalid formulas', () => {
    expect(parseFormula('invalid')).toBeNull()
    expect(parseFormula('')).toBeNull()
    expect(parseFormula('abc')).toBeNull()
  })

  it('rejects count > 100 for safety', () => {
    expect(parseFormula('101d6')).toBeNull()
  })

  it('rejects sides > 1000 for safety', () => {
    expect(parseFormula('1d1001')).toBeNull()
  })

  it('rejects count < 1', () => {
    expect(parseFormula('0d6')).toBeNull()
  })

  it('rejects sides < 1', () => {
    expect(parseFormula('1d0')).toBeNull()
  })

  it('accepts boundary values (100d1000)', () => {
    expect(parseFormula('100d1000')).toEqual({ count: 100, sides: 1000, modifier: 0 })
  })
})

describe('rollSingle', () => {
  it('returns a value between 1 and sides inclusive', () => {
    // cryptoRandom returns 0.5 → floor(0.5 * 20) + 1 = 11
    mockCryptoRandom.mockReturnValue(0.5)
    expect(rollSingle(20)).toBe(11)
  })

  it('returns 1 when cryptoRandom returns 0', () => {
    mockCryptoRandom.mockReturnValue(0)
    expect(rollSingle(20)).toBe(1)
  })

  it('returns max when cryptoRandom returns 0.999...', () => {
    mockCryptoRandom.mockReturnValue(0.999)
    expect(rollSingle(20)).toBe(20)
  })

  it('works for d6', () => {
    mockCryptoRandom.mockReturnValue(0.5)
    expect(rollSingle(6)).toBe(4) // floor(0.5*6)+1 = 4
  })
})

describe('rollMultiple', () => {
  it('returns the correct number of results', () => {
    const results = rollMultiple(5, 6)
    expect(results).toHaveLength(5)
  })

  it('returns empty array for count=0', () => {
    expect(rollMultiple(0, 6)).toEqual([])
  })

  it('calls cryptoRandom for each die', () => {
    mockCryptoRandom.mockClear()
    rollMultiple(3, 8)
    expect(mockCryptoRandom).toHaveBeenCalledTimes(3)
  })
})

describe('roll', () => {
  it('returns correct total for a simple formula', () => {
    // cryptoRandom=0.5 → each d6 = floor(0.5*6)+1 = 4
    mockCryptoRandom.mockReturnValue(0.5)
    const result = roll('2d6+3')
    expect(result.total).toBe(11) // 4+4+3
    expect(result.rolls).toEqual([4, 4])
  })

  it('returns zero total for an invalid formula', () => {
    const result = roll('invalid')
    expect(result.total).toBe(0)
    expect(result.rolls).toEqual([0])
    expect(result.natural20).toBe(false)
    expect(result.natural1).toBe(false)
  })

  it('detects natural 20', () => {
    // cryptoRandom = 0.95 → floor(0.95*20)+1 = 20
    mockCryptoRandom.mockReturnValue(0.95)
    const result = roll('1d20')
    expect(result.rolls[0]).toBe(20)
    expect(result.natural20).toBe(true)
    expect(result.natural1).toBe(false)
  })

  it('detects natural 1', () => {
    // cryptoRandom = 0.0 → floor(0*20)+1 = 1
    mockCryptoRandom.mockReturnValue(0.0)
    const result = roll('1d20')
    expect(result.rolls[0]).toBe(1)
    expect(result.natural1).toBe(true)
    expect(result.natural20).toBe(false)
  })

  it('does not flag natural20 for non-d20 rolls', () => {
    mockCryptoRandom.mockReturnValue(0.999)
    const result = roll('1d6')
    expect(result.natural20).toBe(false)
  })

  it('does not flag natural20 for multi-die d20 rolls', () => {
    mockCryptoRandom.mockReturnValue(0.95)
    const result = roll('2d20')
    expect(result.natural20).toBe(false)
  })

  it('triggers 3D dice animation by default', () => {
    mockCryptoRandom.mockReturnValue(0.5)
    roll('1d20')
    expect(mockTrigger3dDice).toHaveBeenCalledTimes(1)
  })

  it('does not trigger 3D dice when secret=true', () => {
    mockCryptoRandom.mockReturnValue(0.5)
    roll('1d20', { secret: true })
    expect(mockTrigger3dDice).not.toHaveBeenCalled()
  })

  it('tracks last roll for /reroll unless secret', () => {
    mockCryptoRandom.mockReturnValue(0.5)
    roll('1d20+5')
    const last = getLastRoll()
    expect(last).not.toBeNull()
    expect(last!.formula).toBe('1d20+5')
  })

  it('does not track last roll when secret', () => {
    setLastRoll(null)
    mockCryptoRandom.mockReturnValue(0.5)
    roll('1d20', { secret: true })
    expect(getLastRoll()).toBeNull()
  })

  describe('advantage and disadvantage', () => {
    it('picks the higher roll with advantage on 1d20', () => {
      mockCryptoRandom
        .mockReturnValueOnce(0.2) // roll1: floor(0.2*20)+1 = 5
        .mockReturnValueOnce(0.7) // roll2: floor(0.7*20)+1 = 15
      const result = roll('1d20+3', { advantage: true })
      expect(result.rolls[0]).toBe(15) // max(5, 15)
      expect(result.total).toBe(18) // 15 + 3
      expect(result.formula).toContain('Adv')
    })

    it('picks the lower roll with disadvantage on 1d20', () => {
      mockCryptoRandom
        .mockReturnValueOnce(0.2) // roll1: 5
        .mockReturnValueOnce(0.7) // roll2: 15
      const result = roll('1d20+3', { disadvantage: true })
      expect(result.rolls[0]).toBe(5) // min(5, 15)
      expect(result.total).toBe(8) // 5 + 3
      expect(result.formula).toContain('Dis')
    })

    it('does not apply advantage/disadvantage to non-d20 rolls', () => {
      mockCryptoRandom.mockReturnValue(0.5)
      const result = roll('2d6+3', { advantage: true })
      // Should roll normally, not apply advantage logic
      expect(result.rolls).toHaveLength(2)
    })

    it('does not apply advantage to multi-die d20 rolls (2d20)', () => {
      mockCryptoRandom.mockReturnValue(0.5)
      const result = roll('2d20', { advantage: true })
      // 2d20 is not 1d20, so advantage does not apply
      expect(result.rolls).toHaveLength(2)
    })
  })
})

describe('rollQuiet', () => {
  it('does not trigger 3D dice or broadcast', () => {
    mockCryptoRandom.mockReturnValue(0.5)
    const result = rollQuiet('2d6')
    expect(result.total).toBeGreaterThan(0)
    expect(mockTrigger3dDice).not.toHaveBeenCalled()
  })

  it('does not track as last roll', () => {
    setLastRoll(null)
    mockCryptoRandom.mockReturnValue(0.5)
    rollQuiet('1d20')
    expect(getLastRoll()).toBeNull()
  })
})

describe('rollD20', () => {
  it('rolls a 1d20 with positive modifier', () => {
    mockCryptoRandom.mockReturnValue(0.5) // → 11
    const result = rollD20(5)
    expect(result.total).toBe(16) // 11 + 5
  })

  it('rolls a 1d20 with negative modifier', () => {
    mockCryptoRandom.mockReturnValue(0.5)
    const result = rollD20(-2)
    expect(result.total).toBe(9) // 11 - 2
  })

  it('rolls a 1d20 with zero modifier', () => {
    mockCryptoRandom.mockReturnValue(0.5)
    const result = rollD20()
    expect(result.total).toBe(11)
  })

  it('passes options through (e.g. advantage)', () => {
    mockCryptoRandom
      .mockReturnValueOnce(0.1) // roll1: 3
      .mockReturnValueOnce(0.9) // roll2: 19
    const result = rollD20(0, { advantage: true })
    expect(result.rolls[0]).toBe(19)
  })
})

describe('rollDamage', () => {
  it('rolls damage with positive modifier', () => {
    mockCryptoRandom.mockReturnValue(0.5) // each d8 → 5
    const result = rollDamage(2, 8, 3)
    expect(result.total).toBe(13) // 5+5+3
  })

  it('rolls damage with no modifier', () => {
    mockCryptoRandom.mockReturnValue(0.5)
    const result = rollDamage(1, 6)
    expect(result.total).toBe(4) // floor(0.5*6)+1 = 4
  })

  it('rolls damage with negative modifier', () => {
    mockCryptoRandom.mockReturnValue(0.5)
    const result = rollDamage(1, 8, -2)
    expect(result.total).toBe(3) // 5 - 2
  })

  // D&D rule: Greatsword is 2d6, Greataxe is 1d12
  it('handles Greatsword damage (2d6+STR)', () => {
    mockCryptoRandom.mockReturnValue(0.5) // each d6 → 4
    const result = rollDamage(2, 6, 4) // +4 STR mod
    expect(result.total).toBe(12) // 4+4+4
  })
})

describe('getLastRoll / setLastRoll', () => {
  it('returns null initially', () => {
    expect(getLastRoll()).toBeNull()
  })

  it('tracks the last roll after a non-secret roll', () => {
    mockCryptoRandom.mockReturnValue(0.5)
    roll('1d20+3')
    const last = getLastRoll()
    expect(last).not.toBeNull()
    expect(last!.rollerName).toBe('TestPlayer')
  })

  it('can be manually set and cleared', () => {
    setLastRoll({ formula: '1d6', rolls: [3], total: 3, rollerName: 'DM' })
    expect(getLastRoll()!.total).toBe(3)
    setLastRoll(null)
    expect(getLastRoll()).toBeNull()
  })
})
