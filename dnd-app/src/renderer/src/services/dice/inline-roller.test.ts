import { beforeEach, describe, expect, it, vi } from 'vitest'
// Phase 28e.3 — rolls use cryptoRandom (CSPRNG) now, so mock that instead of Math.random.
import { cryptoRandom } from '../../utils/crypto-random'
import type { InlineRollResult } from './inline-roller'
import { formatInlineRoll, rollInline } from './inline-roller'

vi.mock('../../utils/crypto-random', () => ({ cryptoRandom: vi.fn(() => 0.5) }))
const mockCryptoRandom = vi.mocked(cryptoRandom)

describe('rollInline', () => {
  beforeEach(() => {
    mockCryptoRandom.mockReset()
    mockCryptoRandom.mockReturnValue(0.5)
  })

  it('returns a result with correct label and modifier', () => {
    const result = rollInline('Athletics', 5)
    expect(result.label).toBe('Athletics')
    expect(result.modifier).toBe(5)
    expect(result.total).toBe(result.roll + 5)
  })

  it('roll is between 1 and 20', () => {
    for (let i = 0; i < 50; i++) {
      const result = rollInline('Test', 0)
      expect(result.roll).toBeGreaterThanOrEqual(1)
      expect(result.roll).toBeLessThanOrEqual(20)
    }
  })

  it('formats formula correctly for positive modifier', () => {
    const result = rollInline('Test', 3)
    expect(result.formula).toBe('1d20+3')
  })

  it('formats formula correctly for negative modifier', () => {
    const result = rollInline('Test', -2)
    expect(result.formula).toBe('1d20-2')
  })

  it('detects natural 20 as crit', () => {
    mockCryptoRandom.mockReturnValue(0.999) // → 20
    const result = rollInline('Test', 0)
    expect(result.roll).toBe(20)
    expect(result.isCrit).toBe(true)
    expect(result.isFumble).toBe(false)
    vi.restoreAllMocks()
  })

  it('detects natural 1 as fumble', () => {
    mockCryptoRandom.mockReturnValue(0.0) // → 1
    const result = rollInline('Test', 0)
    expect(result.roll).toBe(1)
    expect(result.isFumble).toBe(true)
    expect(result.isCrit).toBe(false)
    vi.restoreAllMocks()
  })

  it('advantage picks higher of two rolls', () => {
    // Mock: first roll=5 (0.2*20+1=5), second roll=15 (0.7*20+1=15)
    mockCryptoRandom.mockReturnValueOnce(0.2).mockReturnValueOnce(0.7) // roll1=5, roll2=15
    const result = rollInline('Test', 0, 'advantage')
    expect(result.roll).toBe(15) // max(5, 15)
    expect(result.rolls).toEqual([5, 15])
    expect(result.advantage).toBe('advantage')
    vi.restoreAllMocks()
  })

  it('disadvantage picks lower of two rolls', () => {
    mockCryptoRandom.mockReturnValueOnce(0.7).mockReturnValueOnce(0.2) // roll1=15, roll2=5
    const result = rollInline('Test', 0, 'disadvantage')
    expect(result.roll).toBe(5) // min(15, 5)
    expect(result.rolls).toEqual([15, 5])
    expect(result.advantage).toBe('disadvantage')
    vi.restoreAllMocks()
  })
})

describe('formatInlineRoll', () => {
  it('formats a normal roll', () => {
    const result: InlineRollResult = {
      label: 'Athletics',
      formula: '1d20+5',
      roll: 12,
      modifier: 5,
      total: 17,
      isCrit: false,
      isFumble: false
    }
    expect(formatInlineRoll(result)).toBe('**Athletics**: 12 + 5 = **17**')
  })

  it('formats a crit roll', () => {
    const result: InlineRollResult = {
      label: 'Attack',
      formula: '1d20+3',
      roll: 20,
      modifier: 3,
      total: 23,
      isCrit: true,
      isFumble: false
    }
    expect(formatInlineRoll(result)).toContain('NAT 20!')
  })

  it('formats a fumble roll', () => {
    const result: InlineRollResult = {
      label: 'Attack',
      formula: '1d20+3',
      roll: 1,
      modifier: 3,
      total: 4,
      isCrit: false,
      isFumble: true
    }
    expect(formatInlineRoll(result)).toContain('NAT 1!')
  })

  it('formats advantage roll with both dice shown', () => {
    const result: InlineRollResult = {
      label: 'Stealth',
      formula: '1d20+4',
      roll: 18,
      modifier: 4,
      total: 22,
      isCrit: false,
      isFumble: false,
      advantage: 'advantage',
      rolls: [10, 18]
    }
    const formatted = formatInlineRoll(result)
    expect(formatted).toContain('[10, 18]')
  })
})
