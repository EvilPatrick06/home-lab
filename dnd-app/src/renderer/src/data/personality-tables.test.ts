import { describe, expect, it, vi } from 'vitest'

const dataJson = vi.hoisted(() => {
  const { readFileSync: readSync } = require('fs')
  const { resolve: resolvePath } = require('path')
  return JSON.parse(
    readSync(resolvePath(__dirname, '../../public/data/5e/dm/npcs/generation-tables/personality-tables.json'), 'utf-8')
  )
})

vi.mock('../services/data-provider', () => ({
  load5ePersonalityTables: vi.fn(() => Promise.resolve(dataJson))
}))

import { ABILITY_PERSONALITY, ALIGNMENT_PERSONALITY, rollPersonalityTraits } from './personality-tables'

describe('ABILITY_PERSONALITY and ALIGNMENT_PERSONALITY — initial exports', () => {
  it('ABILITY_PERSONALITY is an object', () => {
    expect(typeof ABILITY_PERSONALITY).toBe('object')
  })

  it('ALIGNMENT_PERSONALITY is an object', () => {
    expect(typeof ALIGNMENT_PERSONALITY).toBe('object')
  })
})

describe('Personality Tables JSON — PHB table accuracy', () => {
  it('ability tables cover all 6 ability scores', () => {
    const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']
    for (const ability of abilities) {
      expect(dataJson.ability[ability], `Missing ability: ${ability}`).toBeDefined()
      expect(Array.isArray(dataJson.ability[ability].high)).toBe(true)
      expect(Array.isArray(dataJson.ability[ability].low)).toBe(true)
    }
  })

  it('each ability has exactly 4 high traits and 4 low traits (d4 table)', () => {
    for (const [ability, table] of Object.entries(dataJson.ability)) {
      const t = table as { high: string[]; low: string[] }
      expect(t.high, `${ability} high should have 4 entries`).toHaveLength(4)
      expect(t.low, `${ability} low should have 4 entries`).toHaveLength(4)
    }
  })

  it('all ability traits are non-empty strings', () => {
    for (const [ability, table] of Object.entries(dataJson.ability)) {
      const t = table as { high: string[]; low: string[] }
      for (const trait of [...t.high, ...t.low]) {
        expect(typeof trait).toBe('string')
        expect(trait.length, `${ability} trait should not be empty`).toBeGreaterThan(0)
      }
    }
  })

  it('alignment tables cover all 5 alignment components', () => {
    const components = ['Chaotic', 'Good', 'Evil', 'Lawful', 'Neutral']
    for (const comp of components) {
      expect(dataJson.alignment[comp], `Missing alignment component: ${comp}`).toBeDefined()
      expect(Array.isArray(dataJson.alignment[comp])).toBe(true)
    }
  })

  it('each alignment component has exactly 4 personality traits (d4 table)', () => {
    for (const [comp, traits] of Object.entries(dataJson.alignment)) {
      expect(traits, `${comp} should have 4 traits`).toHaveLength(4)
    }
  })

  it('Good traits include compassionate/helpful values', () => {
    const good = dataJson.alignment.Good as string[]
    expect(good).toContain('Compassionate')
    expect(good).toContain('Kind')
  })

  it('Evil traits include negative values', () => {
    const evil = dataJson.alignment.Evil as string[]
    expect(evil).toContain('Dishonest')
    expect(evil).toContain('Cruel')
  })

  it('Lawful traits include order-related values', () => {
    const lawful = dataJson.alignment.Lawful as string[]
    expect(lawful).toContain('Loyal')
    expect(lawful).toContain('Methodical')
  })

  it('Chaotic traits include freedom-related values', () => {
    const chaotic = dataJson.alignment.Chaotic as string[]
    expect(chaotic).toContain('Rebellious')
    expect(chaotic).toContain('Impulsive')
  })

  it('high Strength traits reflect physical power', () => {
    const str = dataJson.ability.strength.high as string[]
    expect(str).toContain('Muscular')
    expect(str).toContain('Protective')
  })

  it('low Constitution traits reflect frailty', () => {
    const con = dataJson.ability.constitution.low as string[]
    expect(con).toContain('Frail')
  })
})

describe('rollPersonalityTraits', () => {
  it('returns an array of strings', () => {
    const traits = rollPersonalityTraits(
      { strength: 14, dexterity: 10, constitution: 8, intelligence: 12, wisdom: 10, charisma: 16 },
      {},
      'Chaotic Good'
    )
    expect(Array.isArray(traits)).toBe(true)
    for (const t of traits) {
      expect(typeof t).toBe('string')
    }
  })

  it('generates traits for high abilities (>= 12) and low abilities (<= 9)', () => {
    const traits = rollPersonalityTraits(
      { strength: 18, dexterity: 6, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      {},
      ''
    )
    // Should have at least 2 traits: one from high STR, one from low DEX
    expect(traits.length).toBeGreaterThanOrEqual(2)
  })

  it('skips average abilities (10-11)', () => {
    const traits = rollPersonalityTraits(
      { strength: 10, dexterity: 11, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      {},
      ''
    )
    // With all averages and no alignment, should return empty
    expect(traits.length).toBe(0)
  })

  it('includes alignment traits for "Chaotic Good"', () => {
    // With all-average scores, only alignment traits should appear
    const traits = rollPersonalityTraits(
      { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      {},
      'Chaotic Good'
    )
    // Should have 2 traits (one Chaotic + one Good)
    expect(traits.length).toBe(2)
  })

  it('handles pure "Neutral" alignment (single table roll)', () => {
    const traits = rollPersonalityTraits(
      { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      {},
      'Neutral'
    )
    expect(traits.length).toBe(1)
    const neutralTraits = dataJson.alignment.Neutral as string[]
    expect(neutralTraits).toContain(traits[0])
  })

  it('accounts for background bonuses in ability threshold', () => {
    // STR is 11 (average) but +2 bonus makes it 13 (high)
    const traits = rollPersonalityTraits(
      { strength: 11, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
      { strength: 2 },
      ''
    )
    expect(traits.length).toBe(1)
  })
})
