import { describe, expect, it } from 'vitest'
import { addCurrency, computeSellPrice, deductWithConversion, parseCost, totalInCopper } from './currency'

// ─── parseCost ──────────────────────────────────────────────

describe('parseCost', () => {
  it('parses "100gp" correctly', () => {
    const result = parseCost('100gp')
    expect(result).toEqual({ amount: 100, currency: 'gp' })
  })

  it('parses "50 sp" with a space', () => {
    const result = parseCost('50 sp')
    expect(result).toEqual({ amount: 50, currency: 'sp' })
  })

  it('parses "1,500gp" with comma separator', () => {
    const result = parseCost('1,500gp')
    expect(result).toEqual({ amount: 1500, currency: 'gp' })
  })

  it('parses "25pp" (platinum)', () => {
    const result = parseCost('25pp')
    expect(result).toEqual({ amount: 25, currency: 'pp' })
  })

  it('parses "10cp" (copper)', () => {
    const result = parseCost('10cp')
    expect(result).toEqual({ amount: 10, currency: 'cp' })
  })

  it('is case-insensitive for denomination', () => {
    const result = parseCost('50GP')
    expect(result).toEqual({ amount: 50, currency: 'gp' })
  })

  it('parses decimal amounts like "2.5gp"', () => {
    const result = parseCost('2.5gp')
    expect(result).toEqual({ amount: 2.5, currency: 'gp' })
  })

  it('returns null for empty string', () => {
    expect(parseCost('')).toBeNull()
  })

  it('returns null for invalid format', () => {
    expect(parseCost('lots of gold')).toBeNull()
  })

  it('returns null for missing denomination', () => {
    expect(parseCost('100')).toBeNull()
  })

  it('returns null for "ep" (electrum not supported)', () => {
    expect(parseCost('50ep')).toBeNull()
  })
})

// ─── totalInCopper ──────────────────────────────────────────

describe('totalInCopper', () => {
  it('converts pp to 1000 copper each', () => {
    expect(totalInCopper({ pp: 1, gp: 0, sp: 0, cp: 0 })).toBe(1000)
  })

  it('converts gp to 100 copper each', () => {
    expect(totalInCopper({ pp: 0, gp: 1, sp: 0, cp: 0 })).toBe(100)
  })

  it('converts sp to 10 copper each', () => {
    expect(totalInCopper({ pp: 0, gp: 0, sp: 1, cp: 0 })).toBe(10)
  })

  it('passes cp through as-is', () => {
    expect(totalInCopper({ pp: 0, gp: 0, sp: 0, cp: 5 })).toBe(5)
  })

  it('sums all denominations', () => {
    expect(totalInCopper({ pp: 1, gp: 2, sp: 3, cp: 4 })).toBe(1000 + 200 + 30 + 4)
  })

  it('returns 0 for empty purse', () => {
    expect(totalInCopper({ pp: 0, gp: 0, sp: 0, cp: 0 })).toBe(0)
  })
})

// ─── deductWithConversion ───────────────────────────────────

describe('deductWithConversion', () => {
  it('deducts exact amount when enough coins of that type exist', () => {
    const purse = { pp: 0, gp: 100, sp: 0, cp: 0 }
    const result = deductWithConversion(purse, { amount: 50, currency: 'gp' })

    expect(result).not.toBeNull()
    expect(result!.gp).toBe(50)
  })

  it('returns null when total funds are insufficient', () => {
    const purse = { pp: 0, gp: 5, sp: 0, cp: 0 }
    const result = deductWithConversion(purse, { amount: 100, currency: 'gp' })

    expect(result).toBeNull()
  })

  it('converts from higher denomination when exact denomination is insufficient', () => {
    const purse = { pp: 1, gp: 0, sp: 0, cp: 0 } // 1 pp = 1000 cp = 10 gp worth
    const result = deductWithConversion(purse, { amount: 5, currency: 'gp' })

    expect(result).not.toBeNull()
    // Should have broken pp into change
    expect(result!.pp).toBe(0)
    // The remaining value should equal original - cost
    const remainingCopper = totalInCopper(result!)
    const originalCopper = totalInCopper(purse)
    expect(remainingCopper).toBe(originalCopper - 500) // 5 gp = 500 cp
  })

  it('deducts from multiple denominations when needed', () => {
    const purse = { pp: 0, gp: 3, sp: 5, cp: 0 }
    const result = deductWithConversion(purse, { amount: 5, currency: 'gp' })

    // Total: 350 cp. Cost: 500 cp. Insufficient → null
    expect(result).toBeNull()
  })

  it('handles deducting copper from a mixed purse', () => {
    const purse = { pp: 0, gp: 1, sp: 0, cp: 50 }
    const result = deductWithConversion(purse, { amount: 50, currency: 'cp' })

    expect(result).not.toBeNull()
    expect(result!.cp).toBe(0)
    expect(result!.gp).toBe(1)
  })

  it('handles 0-cost deduction', () => {
    const purse = { pp: 0, gp: 10, sp: 0, cp: 0 }
    const result = deductWithConversion(purse, { amount: 0, currency: 'gp' })

    expect(result).not.toBeNull()
    expect(result!.gp).toBe(10)
  })
})

// ─── addCurrency ────────────────────────────────────────────

describe('addCurrency', () => {
  it('adds gold to existing gold', () => {
    const purse = { pp: 0, gp: 10, sp: 0, cp: 0 }
    const result = addCurrency(purse, { amount: 5, currency: 'gp' })

    expect(result.gp).toBe(15)
    expect(result.pp).toBe(0)
    expect(result.sp).toBe(0)
    expect(result.cp).toBe(0)
  })

  it('adds silver to an empty purse', () => {
    const purse = { pp: 0, gp: 0, sp: 0, cp: 0 }
    const result = addCurrency(purse, { amount: 25, currency: 'sp' })

    expect(result.sp).toBe(25)
  })

  it('does not modify the original object', () => {
    const purse = { pp: 0, gp: 10, sp: 0, cp: 0 }
    addCurrency(purse, { amount: 5, currency: 'gp' })

    expect(purse.gp).toBe(10) // unchanged
  })

  it('adds platinum correctly', () => {
    const purse = { pp: 2, gp: 0, sp: 0, cp: 0 }
    const result = addCurrency(purse, { amount: 3, currency: 'pp' })
    expect(result.pp).toBe(5)
  })

  it('handles adding 0 amount', () => {
    const purse = { pp: 1, gp: 2, sp: 3, cp: 4 }
    const result = addCurrency(purse, { amount: 0, currency: 'gp' })
    expect(result).toEqual(purse)
  })
})

// ─── computeSellPrice ───────────────────────────────────────

describe('computeSellPrice', () => {
  it('returns half price in the highest denomination that divides evenly', () => {
    const result = computeSellPrice('100gp')
    // Half = 50 gp = 5000 cp. 5000 / 1000 (pp) = 5 → returns 5 pp
    expect(result).toEqual({ amount: 5, currency: 'pp' })
  })

  it('sells a 10gp item for 5gp (half price)', () => {
    const result = computeSellPrice('10gp')
    // Half = 5 gp = 500 cp. 500/1000 < 1, 500/100 = 5 → 5gp
    expect(result).toEqual({ amount: 5, currency: 'gp' })
  })

  it('sells a 1gp item for 5sp', () => {
    const result = computeSellPrice('1gp')
    // Half = 0.5 gp = 50 cp. 50/1000 < 1, 50/100 < 1, 50/10 = 5 → 5sp
    expect(result).toEqual({ amount: 5, currency: 'sp' })
  })

  it('sells a 1sp item for 5cp', () => {
    const result = computeSellPrice('1sp')
    // Half = 5 cp.
    expect(result).toEqual({ amount: 5, currency: 'cp' })
  })

  it('returns null for 0-cost item', () => {
    expect(computeSellPrice('0gp')).toBeNull()
  })

  it('returns null for invalid cost string', () => {
    expect(computeSellPrice('free')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(computeSellPrice('')).toBeNull()
  })

  it('handles odd copper amounts (returns in cp)', () => {
    const result = computeSellPrice('1cp')
    // Half = 0.5 cp, floor = 0 → null
    expect(result).toBeNull()
  })

  it('handles a 2cp item (half = 1cp)', () => {
    const result = computeSellPrice('2cp')
    expect(result).toEqual({ amount: 1, currency: 'cp' })
  })

  it('handles large amounts like "10,000gp"', () => {
    const result = computeSellPrice('10,000gp')
    // Half = 5000 gp = 500,000 cp. 500000/1000 = 500 → 500pp
    expect(result).toEqual({ amount: 500, currency: 'pp' })
  })
})
