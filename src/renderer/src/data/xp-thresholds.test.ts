import { describe, expect, it } from 'vitest'
import { getBonusFeatCount, shouldLevelUp, xpThresholdForLevel, xpThresholdForNextLevel } from './xp-thresholds'

describe('xpThresholdForLevel', () => {
  it('returns 0 for level 1', () => {
    expect(xpThresholdForLevel(1)).toBe(0)
  })

  it('returns 300 for level 2', () => {
    expect(xpThresholdForLevel(2)).toBe(300)
  })

  it('returns 355000 for level 20', () => {
    expect(xpThresholdForLevel(20)).toBe(355000)
  })

  it('clamps to level 20 for levels above 20', () => {
    expect(xpThresholdForLevel(25)).toBe(355000)
  })

  it('returns 0 for level 0', () => {
    expect(xpThresholdForLevel(0)).toBe(0)
  })
})

describe('xpThresholdForNextLevel', () => {
  it('returns 300 for level 1 (next is level 2)', () => {
    expect(xpThresholdForNextLevel(1)).toBe(300)
  })

  it('returns Infinity for level 20 (max level)', () => {
    expect(xpThresholdForNextLevel(20)).toBe(Infinity)
  })

  it('returns 900 for level 2 (next is level 3)', () => {
    expect(xpThresholdForNextLevel(2)).toBe(900)
  })
})

describe('shouldLevelUp', () => {
  it('returns true when XP meets threshold', () => {
    expect(shouldLevelUp(1, 300)).toBe(true)
  })

  it('returns true when XP exceeds threshold', () => {
    expect(shouldLevelUp(1, 500)).toBe(true)
  })

  it('returns false when XP is below threshold', () => {
    expect(shouldLevelUp(1, 299)).toBe(false)
  })

  it('returns false at max level', () => {
    expect(shouldLevelUp(20, 999999)).toBe(false)
  })
})

describe('getBonusFeatCount', () => {
  it('returns 0 for XP at or below 355000', () => {
    expect(getBonusFeatCount(355000)).toBe(0)
    expect(getBonusFeatCount(0)).toBe(0)
  })

  it('returns 1 for 385000 XP (30k above 355k)', () => {
    expect(getBonusFeatCount(385000)).toBe(1)
  })

  it('returns 2 for 415000 XP (60k above 355k)', () => {
    expect(getBonusFeatCount(415000)).toBe(2)
  })

  it('does not round up partial increments', () => {
    expect(getBonusFeatCount(384999)).toBe(0)
  })
})
