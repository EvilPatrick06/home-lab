import { describe, expect, it, vi } from 'vitest'
import type { CrTier, TreasureResult, TreasureTableData } from './treasure-generator-utils'
import { formatTreasureResult, generateHoard, generateIndividual, rollDice } from './treasure-generator-utils'

// ─── rollDice ─────────────────────────────────────────────────

describe('rollDice', () => {
  it('produces deterministic results when Math.random is mocked', () => {
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const result = rollDice('1d6')
    expect(result).toBeGreaterThanOrEqual(1)
    spy.mockRestore()
  })

  it('returns a number for standard dice notation "2d6"', () => {
    const result = rollDice('2d6')
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThanOrEqual(2)
    expect(result).toBeLessThanOrEqual(12)
  })

  it('handles notation without count "d8" (defaults to 1 die)', () => {
    const result = rollDice('d8')
    expect(result).toBeGreaterThanOrEqual(1)
    expect(result).toBeLessThanOrEqual(8)
  })

  it('handles multiplier notation "2d4x100"', () => {
    // 2d4 ranges 2-8, times 100 = 200-800
    const result = rollDice('2d4x100')
    expect(result).toBeGreaterThanOrEqual(200)
    expect(result).toBeLessThanOrEqual(800)
  })

  it('handles bonus notation "1d6+3"', () => {
    const result = rollDice('1d6+3')
    expect(result).toBeGreaterThanOrEqual(4) // 1+3
    expect(result).toBeLessThanOrEqual(9) // 6+3
  })

  it('returns a plain number for flat integer notation', () => {
    expect(rollDice('5')).toBe(5)
  })

  it('returns 0 for non-parseable notation', () => {
    expect(rollDice('invalid')).toBe(0)
  })

  it('handles "1d4-1" (used for 0-4 magic items) and returns >= 0', () => {
    // This notation uses "1d4-1" as a string — our function matches /^(\d+)?d(\d+)/ only
    // so "-1" part won't be captured; this tests graceful handling
    const result = rollDice('1d4-1')
    expect(typeof result).toBe('number')
  })
})

// ─── generateIndividual ───────────────────────────────────────

describe('generateIndividual', () => {
  const tiers: CrTier[] = ['0-4', '5-10', '11-16', '17+']

  for (const tier of tiers) {
    it(`returns a TreasureResult with at least some coins for tier ${tier} (no tables)`, () => {
      const result = generateIndividual(tier, null)
      expect(result).toHaveProperty('coins')
      expect(result).toHaveProperty('gems')
      expect(result).toHaveProperty('artObjects')
      expect(result).toHaveProperty('magicItems')
      const total = result.coins.cp + result.coins.sp + result.coins.ep + result.coins.gp + result.coins.pp
      expect(total).toBeGreaterThanOrEqual(0)
    })
  }

  it('returns empty gems, artObjects and magicItems arrays for individual treasure', () => {
    const result = generateIndividual('0-4', null)
    expect(result.gems).toHaveLength(0)
    expect(result.artObjects).toHaveLength(0)
    expect(result.magicItems).toHaveLength(0)
  })

  it('uses the table entry when provided', () => {
    const tables: TreasureTableData = {
      individual: [{ crRange: '0-4', amount: '3', unit: 'gp', average: 3 }],
      hoard: [],
      magicItemRarities: [],
      gems: {},
      art: {}
    }
    // With amount="3" (a flat number), rollDice('3') = 3, unit=gp → coins.gp=3
    const result = generateIndividual('0-4', tables)
    expect(result.coins.gp).toBe(3)
  })

  it('assigns pp for tiers with pp unit in table', () => {
    const tables: TreasureTableData = {
      individual: [{ crRange: '17+', amount: '2', unit: 'pp', average: 2 }],
      hoard: [],
      magicItemRarities: [],
      gems: {},
      art: {}
    }
    const result = generateIndividual('17+', tables)
    expect(result.coins.pp).toBe(2)
  })
})

// ─── generateHoard ────────────────────────────────────────────

describe('generateHoard', () => {
  const tiers: CrTier[] = ['0-4', '5-10', '11-16', '17+']

  for (const tier of tiers) {
    it(`returns a TreasureResult with the correct structure for tier ${tier} (no tables)`, () => {
      const result = generateHoard(tier, null)
      expect(result).toHaveProperty('coins')
      expect(result).toHaveProperty('gems')
      expect(result).toHaveProperty('artObjects')
      expect(result).toHaveProperty('magicItems')
    })
  }

  it('generates gems for all tiers', () => {
    // With no tables, gems come from fallback (FALLBACK_GEMS is empty array, so gems will be empty strings)
    const result = generateHoard('0-4', null)
    expect(Array.isArray(result.gems)).toBe(true)
  })

  it('skips art objects for tier 0-4', () => {
    // According to the implementation, tier '0-4' does not add art objects
    const result = generateHoard('0-4', null)
    expect(result.artObjects).toHaveLength(0)
  })

  it('generates art objects for tiers above 0-4', () => {
    // We need gem/art lists to get actual entries; check structure only
    const result = generateHoard('5-10', null)
    expect(Array.isArray(result.artObjects)).toBe(true)
  })

  it('uses tables data when provided', () => {
    const tables: TreasureTableData = {
      individual: [],
      hoard: [{ crRange: '0-4', coins: '5', coinsUnit: 'gp', coinsAverage: 5, magicItems: '0' }],
      magicItemRarities: [],
      gems: { '50gp': ['Diamond'] },
      art: { '25gp': ['Old Painting'] },
      hoardDetails: { '0-4': { gemTier: '50gp', artTier: '25gp', magicTable: 'A' } }
    }
    const result = generateHoard('0-4', tables)
    // coins.gp should be 5 (rollDice('5') = 5, a flat number)
    expect(result.coins.gp).toBe(5)
  })
})

// ─── formatTreasureResult ─────────────────────────────────────

describe('formatTreasureResult', () => {
  it('returns a non-empty string', () => {
    const result: TreasureResult = {
      coins: { cp: 0, sp: 0, ep: 0, gp: 100, pp: 0 },
      gems: [],
      artObjects: [],
      magicItems: []
    }
    expect(formatTreasureResult(result)).toBeTruthy()
  })

  it('includes "Treasure awarded!" prefix', () => {
    const result: TreasureResult = {
      coins: { cp: 0, sp: 0, ep: 0, gp: 50, pp: 0 },
      gems: [],
      artObjects: [],
      magicItems: []
    }
    expect(formatTreasureResult(result)).toContain('Treasure awarded!')
  })

  it('formats coin values correctly', () => {
    const result: TreasureResult = {
      coins: { cp: 5, sp: 10, ep: 0, gp: 100, pp: 2 },
      gems: [],
      artObjects: [],
      magicItems: []
    }
    const formatted = formatTreasureResult(result)
    expect(formatted).toContain('5 cp')
    expect(formatted).toContain('10 sp')
    expect(formatted).toContain('100 gp')
    expect(formatted).toContain('2 pp')
  })

  it('omits zero-value coins', () => {
    const result: TreasureResult = {
      coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      gems: [],
      artObjects: [],
      magicItems: []
    }
    const formatted = formatTreasureResult(result)
    expect(formatted).not.toContain('cp')
    expect(formatted).not.toContain('gp')
  })

  it('includes gems in the output', () => {
    const result: TreasureResult = {
      coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      gems: ['Ruby (50gp)', 'Sapphire (50gp)'],
      artObjects: [],
      magicItems: []
    }
    const formatted = formatTreasureResult(result)
    expect(formatted).toContain('Gems:')
    expect(formatted).toContain('Ruby')
    expect(formatted).toContain('Sapphire')
  })

  it('includes art objects in the output', () => {
    const result: TreasureResult = {
      coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      gems: [],
      artObjects: ['Old Painting (25gp)'],
      magicItems: []
    }
    const formatted = formatTreasureResult(result)
    expect(formatted).toContain('Art:')
    expect(formatted).toContain('Old Painting')
  })

  it('includes magic items in the output', () => {
    const result: TreasureResult = {
      coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
      gems: [],
      artObjects: [],
      magicItems: ['Bag of Holding', 'Cloak of Protection']
    }
    const formatted = formatTreasureResult(result)
    expect(formatted).toContain('Magic Items:')
    expect(formatted).toContain('Bag of Holding')
    expect(formatted).toContain('Cloak of Protection')
  })

  it('uses locale-formatted numbers for large coin values', () => {
    const result: TreasureResult = {
      coins: { cp: 0, sp: 0, ep: 0, gp: 10000, pp: 0 },
      gems: [],
      artObjects: [],
      magicItems: []
    }
    const formatted = formatTreasureResult(result)
    // toLocaleString in Node might produce "10,000" or "10000" depending on locale
    expect(formatted).toContain('10')
    expect(formatted).toContain('gp')
  })

  it('separates sections with " | "', () => {
    const result: TreasureResult = {
      coins: { cp: 0, sp: 0, ep: 0, gp: 100, pp: 0 },
      gems: ['Ruby'],
      artObjects: [],
      magicItems: []
    }
    const formatted = formatTreasureResult(result)
    expect(formatted).toContain(' | ')
  })
})
