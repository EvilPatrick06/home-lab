import { describe, expect, it } from 'vitest'
import { SearchEngine } from './search-engine'
import type { ChunkIndex } from './types'

function makeIndex(chunks: Array<{ id: string; heading: string; content: string }>): ChunkIndex {
  return {
    version: 1,
    createdAt: '2024-01-01',
    sources: [],
    chunks: chunks.map((c) => ({
      id: c.id,
      source: 'PHB' as const,
      headingPath: [c.heading],
      heading: c.heading,
      content: c.content,
      tokenEstimate: Math.ceil(c.content.length / 4),
      keywords: c.content.toLowerCase().split(/\s+/).slice(0, 10)
    }))
  }
}

describe('SearchEngine', () => {
  it('starts with zero chunks', () => {
    const engine = new SearchEngine()
    expect(engine.getChunkCount()).toBe(0)
  })

  it('loads chunks from index', () => {
    const engine = new SearchEngine()
    const index = makeIndex([
      { id: 'c1', heading: 'Fireball', content: 'A bright streak flashes creating fire damage.' },
      { id: 'c2', heading: 'Shield', content: 'An invisible barrier of magical force protects you.' }
    ])
    engine.load(index)
    expect(engine.getChunkCount()).toBe(2)
  })

  it('returns empty results for empty index', () => {
    const engine = new SearchEngine()
    engine.load({ version: 1, createdAt: '', sources: [], chunks: [] })
    expect(engine.search('fireball')).toEqual([])
  })

  it('returns relevant results for matching query', () => {
    const engine = new SearchEngine()
    engine.load(
      makeIndex([
        { id: 'c1', heading: 'Fireball', content: 'A bright streak of fire damage in a 20-foot radius.' },
        { id: 'c2', heading: 'Shield', content: 'An invisible barrier of magical force protects you.' },
        { id: 'c3', heading: 'Ice Storm', content: 'A rain of rock-hard ice pounds to the ground in a wide area.' }
      ])
    )

    const results = engine.search('fireball fire damage')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('c1')
    expect(results[0].score).toBeGreaterThan(0)
  })

  it('boosts heading matches', () => {
    const engine = new SearchEngine()
    engine.load(
      makeIndex([
        { id: 'c1', heading: 'Armor', content: 'Armor protects its wearer from attacks.' },
        { id: 'c2', heading: 'Weapons', content: 'Armor can be found in many places in a dungeon.' },
        { id: 'c3', heading: 'Magic', content: 'Spells and magical effects fill the world.' },
        { id: 'c4', heading: 'Combat', content: 'Melee and ranged combat rules for encounters.' }
      ])
    )

    const results = engine.search('armor')
    expect(results.length).toBeGreaterThan(0)
    // The chunk with "Armor" in the heading should score higher
    expect(results[0].id).toBe('c1')
  })

  it('respects topK parameter', () => {
    const engine = new SearchEngine()
    const chunks = Array.from({ length: 20 }, (_, i) => ({
      id: `c${i}`,
      heading: `Spell ${i}`,
      content: `This spell deals magic damage and creates an arcane effect numbered ${i}.`
    }))
    engine.load(makeIndex(chunks))

    const results = engine.search('spell magic damage', 3)
    expect(results.length).toBeLessThanOrEqual(3)
  })

  it('filters out zero-score results', () => {
    const engine = new SearchEngine()
    engine.load(
      makeIndex([
        { id: 'c1', heading: 'Fireball', content: 'Fire damage in a 20-foot radius sphere.' },
        { id: 'c2', heading: 'Shield', content: 'Invisible barrier of magical force.' }
      ])
    )

    // Search for something that won't match either chunk
    const results = engine.search('xyznonexistentterm123')
    expect(results.length).toBe(0)
  })

  it('returns results sorted by score descending', () => {
    const engine = new SearchEngine()
    engine.load(
      makeIndex([
        { id: 'c1', heading: 'Warrior', content: 'A warrior fights in melee combat.' },
        {
          id: 'c2',
          heading: 'Combat',
          content: 'Combat is a central part of the game. Melee combat, ranged combat, and spell combat.'
        },
        { id: 'c3', heading: 'Magic', content: 'Magic is powerful and mysterious.' }
      ])
    )

    const results = engine.search('combat melee')
    if (results.length >= 2) {
      expect(results[0].score).toBeGreaterThanOrEqual(results[1].score)
    }
  })

  it('handles compound query terms', () => {
    const engine = new SearchEngine()
    engine.load(
      makeIndex([
        {
          id: 'c1',
          heading: 'Death Saving Throws',
          content: 'When you start your turn with 0 hit points, you must make a death saving throw.'
        },
        { id: 'c2', heading: 'Attacks', content: 'Basic attack rules for combat.' },
        { id: 'c3', heading: 'Spells', content: 'Casting spells requires spell slots and concentration.' },
        { id: 'c4', heading: 'Equipment', content: 'Adventuring gear includes rope, torches, and rations.' }
      ])
    )

    const results = engine.search('death saving throw')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].id).toBe('c1')
  })
})
