import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '../../types/library'
import { buildContentIndex, isContentIndexBuilt, lookupContent } from './content-index'

function makeItem(name: string, category: string, id?: string): LibraryItem {
  return {
    id: id ?? name.toLowerCase().replace(/\s+/g, '-'),
    name,
    category: category as LibraryItem['category'],
    source: 'official',
    summary: '',
    data: {}
  }
}

describe('content-index', () => {
  it('builds index and looks up content by name', () => {
    buildContentIndex([
      makeItem('Fireball', 'spells'),
      makeItem('Goblin', 'monsters'),
      makeItem('Longsword', 'weapons')
    ])

    expect(isContentIndexBuilt()).toBe(true)

    const ref = lookupContent('Fireball')
    expect(ref).toEqual({ category: 'spells', id: 'fireball', name: 'Fireball' })
  })

  it('is case-insensitive', () => {
    buildContentIndex([makeItem('Magic Missile', 'spells')])

    expect(lookupContent('magic missile')).not.toBeNull()
    expect(lookupContent('MAGIC MISSILE')).not.toBeNull()
    expect(lookupContent('Magic Missile')).not.toBeNull()
  })

  it('returns null for unknown names', () => {
    buildContentIndex([makeItem('Fireball', 'spells')])
    expect(lookupContent('Nonexistent Thing')).toBeNull()
  })

  it('overwrites previous index on rebuild', () => {
    buildContentIndex([makeItem('Fireball', 'spells')])
    expect(lookupContent('Fireball')).not.toBeNull()

    buildContentIndex([makeItem('Goblin', 'monsters')])
    expect(lookupContent('Fireball')).toBeNull()
    expect(lookupContent('Goblin')).not.toBeNull()
  })
})
