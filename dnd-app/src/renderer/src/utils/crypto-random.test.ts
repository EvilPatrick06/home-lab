import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cryptoRandom, cryptoRollDie } from './crypto-random'

// Provide a minimal crypto.getRandomValues polyfill for the node test env
beforeEach(() => {
  // Reset any mocks between tests
  vi.restoreAllMocks()
})

describe('cryptoRandom', () => {
  it('returns a number', () => {
    const result = cryptoRandom()
    expect(typeof result).toBe('number')
  })

  it('returns a value in [0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const val = cryptoRandom()
      expect(val).toBeGreaterThanOrEqual(0)
      expect(val).toBeLessThan(1)
    }
  })

  it('returns different values on successive calls (statistical)', () => {
    const values = new Set<number>()
    for (let i = 0; i < 50; i++) {
      values.add(cryptoRandom())
    }
    // With 50 crypto-random floats, we should have many unique values
    expect(values.size).toBeGreaterThan(10)
  })
})

describe('cryptoRollDie', () => {
  it('returns an integer', () => {
    const result = cryptoRollDie(6)
    expect(Number.isInteger(result)).toBe(true)
  })

  it('returns a value in [1, sides] for a d6', () => {
    for (let i = 0; i < 200; i++) {
      const roll = cryptoRollDie(6)
      expect(roll).toBeGreaterThanOrEqual(1)
      expect(roll).toBeLessThanOrEqual(6)
    }
  })

  it('returns a value in [1, sides] for a d20', () => {
    for (let i = 0; i < 200; i++) {
      const roll = cryptoRollDie(20)
      expect(roll).toBeGreaterThanOrEqual(1)
      expect(roll).toBeLessThanOrEqual(20)
    }
  })

  it('always returns 1 for a d1', () => {
    for (let i = 0; i < 20; i++) {
      expect(cryptoRollDie(1)).toBe(1)
    }
  })

  it('returns a value in [1, 100] for a d100', () => {
    for (let i = 0; i < 200; i++) {
      const roll = cryptoRollDie(100)
      expect(roll).toBeGreaterThanOrEqual(1)
      expect(roll).toBeLessThanOrEqual(100)
    }
  })

  it('produces a reasonable distribution for d6 over many rolls', () => {
    const counts = [0, 0, 0, 0, 0, 0]
    const rolls = 6000
    for (let i = 0; i < rolls; i++) {
      const roll = cryptoRollDie(6)
      counts[roll - 1]++
    }
    // Each face should appear roughly 1000 times; allow wide margin
    for (const count of counts) {
      expect(count).toBeGreaterThan(600)
      expect(count).toBeLessThan(1400)
    }
  })
})
