import { describe, expect, it } from 'vitest'
import { detectRangeTable, pickRangeRow } from './table-roll'

// Mirrors src/renderer/public/data/5e/encounters/random-tables.json "weather".
const weather = [
  { d20Min: 1, d20Max: 14, condition: 'Normal for the season' },
  { d20Min: 15, d20Max: 17, condition: '1d4 colder/hotter' },
  { d20Min: 18, d20Max: 18, condition: '1d4x5 colder/hotter' },
  { d20Min: 19, d20Max: 20, condition: 'Precipitation / strong wind' }
]

describe('detectRangeTable', () => {
  it('detects a d20 range table from min/max keys', () => {
    expect(detectRangeTable(weather)).toEqual({ die: 20, minKey: 'd20Min', maxKey: 'd20Max' })
  })
  it('returns null for a plain string array', () => {
    expect(detectRangeTable(['a', 'b', 'c'])).toBeNull()
  })
  it('returns null for an empty array', () => {
    expect(detectRangeTable([])).toBeNull()
  })
})

describe('pickRangeRow', () => {
  const shape = detectRangeTable(weather)!
  it('maps every die face 1..20 to exactly one row', () => {
    for (let r = 1; r <= 20; r++) {
      expect(pickRangeRow(weather, shape, r)).toBeDefined()
    }
  })
  it('weights by range, not by count: 14/20 faces hit the first row', () => {
    let first = 0
    for (let r = 1; r <= 20; r++) {
      if (pickRangeRow(weather, shape, r)?.condition === 'Normal for the season') first++
    }
    expect(first).toBe(14) // would be 5 (1 of 4 rows) under buggy 1dN-by-count
  })
})
