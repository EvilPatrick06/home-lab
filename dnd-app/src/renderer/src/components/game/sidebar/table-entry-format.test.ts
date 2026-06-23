import { describe, expect, it } from 'vitest'
import { formatTableEntry } from './table-entry-format'

describe('formatTableEntry (PHASE-47 F3)', () => {
  it('reads the display field from a Weather-shaped object entry (no [object Object])', () => {
    const entry = { d20Min: 1, d20Max: 14, condition: 'Normal for the season' }
    expect(formatTableEntry(entry, 'unknown')).toBe('Normal for the season')
  })

  it('passes a plain string entry through unchanged', () => {
    expect(formatTableEntry('Great at solving puzzles', 'unknown')).toBe('Great at solving puzzles')
  })

  it('falls back when an object has only range keys', () => {
    expect(formatTableEntry({ d20Min: 1, d20Max: 4 }, 'unknown')).toBe('unknown')
  })

  it('falls back on null/undefined', () => {
    expect(formatTableEntry(null, 'fb')).toBe('fb')
    expect(formatTableEntry(undefined, 'fb')).toBe('fb')
  })

  it('stringifies a numeric entry', () => {
    expect(formatTableEntry(7, 'unknown')).toBe('7')
  })
})
