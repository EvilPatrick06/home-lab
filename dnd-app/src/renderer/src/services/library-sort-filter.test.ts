import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '../types/library'
import { getSortOptions, sortItems } from './library-sort-filter'

describe('library-sort-filter', () => {
  it('returns sort options for spells', () => {
    const opts = getSortOptions('spells')
    expect(opts.some((o) => o.field === 'level')).toBe(true)
  })

  it('sorts items by name ascending', () => {
    const items: LibraryItem[] = [
      { id: 'a', name: 'Zar', data: {} } as LibraryItem,
      { id: 'b', name: 'Alpha', data: {} } as LibraryItem
    ]
    const out = sortItems(items, 'name', 'asc')
    expect(out[0]?.name).toBe('Alpha')
    expect(out[1]?.name).toBe('Zar')
  })
})
