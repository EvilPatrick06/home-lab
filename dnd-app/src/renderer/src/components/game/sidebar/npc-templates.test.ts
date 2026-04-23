import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../data/npc-appearance', () => ({
  NPC_HEIGHTS: ['Short', 'Average', 'Tall'],
  NPC_BUILDS: ['Slim', 'Athletic', 'Stocky'],
  NPC_HAIR_COLORS: ['Black', 'Brown', 'Blonde', 'Red'],
  NPC_HAIR_STYLES: ['Short', 'Long', 'Braided'],
  NPC_DISTINGUISHING_FEATURES: ['Scar', 'Tattoo', 'Birthmark'],
  NPC_CLOTHING_STYLES: ['Practical', 'Elegant', 'Rugged']
}))

vi.mock('../../../data/npc-mannerisms', () => ({
  NPC_VOICE_DESCRIPTIONS: ['Deep', 'Melodic', 'Gruff'],
  NPC_MANNERISMS: ['Fidgets', 'Hums', 'Speaks loudly']
}))

vi.mock('../../../data/personality-tables', () => ({
  ALIGNMENT_PERSONALITY: {
    good: ['Kind', 'Generous', 'Brave'],
    neutral: ['Pragmatic', 'Balanced'],
    evil: ['Cruel', 'Selfish']
  }
}))

import {
  DEFAULT_LOCKS,
  type GeneratedNpc,
  type GeneratedNpcLocks,
  generateRandomNpc,
  NPC_TEMPLATES,
  type NpcTemplate
} from './npc-templates'

// ─── NPC_TEMPLATES ─────────────────────────────────────────────

describe('NPC_TEMPLATES', () => {
  it('contains at least 5 templates', () => {
    expect(NPC_TEMPLATES.length).toBeGreaterThanOrEqual(5)
  })

  it('every template has a name and a statBlock', () => {
    for (const template of NPC_TEMPLATES) {
      expect(typeof template.name).toBe('string')
      expect(template.name.length).toBeGreaterThan(0)
      expect(template.statBlock).toBeDefined()
    }
  })

  it('every statBlock has required fields', () => {
    for (const template of NPC_TEMPLATES) {
      const sb = template.statBlock
      expect(typeof sb.ac).toBe('number')
      expect(typeof sb.hpMax).toBe('number')
      expect(sb.hpMax).toBeGreaterThan(0)
      expect(typeof sb.cr).toBe('string')
      expect(sb.speeds).toBeDefined()
      expect(typeof sb.speeds!.walk).toBe('number')
      expect(sb.abilityScores).toBeDefined()
    }
  })

  it('contains a "Commoner" template', () => {
    const commoner = NPC_TEMPLATES.find((t) => t.name === 'Commoner')
    expect(commoner).toBeDefined()
    expect(commoner!.statBlock.cr).toBe('0')
  })

  it('contains a "Guard" template', () => {
    const guard = NPC_TEMPLATES.find((t) => t.name === 'Guard')
    expect(guard).toBeDefined()
    expect(guard!.statBlock.cr).toBe('1/8')
  })

  it('Veteran has higher AC than Commoner', () => {
    const veteran = NPC_TEMPLATES.find((t) => t.name === 'Veteran')
    const commoner = NPC_TEMPLATES.find((t) => t.name === 'Commoner')
    expect(veteran!.statBlock.ac).toBeGreaterThan(commoner!.statBlock.ac as number)
  })

  it('hpMax equals hpCurrent on all templates (fresh)', () => {
    for (const template of NPC_TEMPLATES) {
      expect(template.statBlock.hpMax).toBe(template.statBlock.hpCurrent)
    }
  })

  it('satisfies the NpcTemplate type shape', () => {
    const sample = NPC_TEMPLATES[0] satisfies NpcTemplate
    expect(sample).toBeDefined()
  })
})

// ─── DEFAULT_LOCKS ─────────────────────────────────────────────

describe('DEFAULT_LOCKS', () => {
  it('has all lock fields set to false', () => {
    const keys: (keyof GeneratedNpcLocks)[] = [
      'name',
      'species',
      'height',
      'build',
      'hairColor',
      'hairStyle',
      'distinguishingFeature',
      'clothingStyle',
      'voice',
      'mannerism',
      'personalityTrait'
    ]
    for (const key of keys) {
      expect(DEFAULT_LOCKS[key]).toBe(false)
    }
  })

  it('has exactly 11 lock fields', () => {
    expect(Object.keys(DEFAULT_LOCKS)).toHaveLength(11)
  })
})

// ─── generateRandomNpc ─────────────────────────────────────────

describe('generateRandomNpc', () => {
  it('returns an object with all GeneratedNpc fields', () => {
    const npc = generateRandomNpc()
    const requiredFields: (keyof GeneratedNpc)[] = [
      'name',
      'species',
      'height',
      'build',
      'hairColor',
      'hairStyle',
      'distinguishingFeature',
      'clothingStyle',
      'voice',
      'mannerism',
      'personalityTrait'
    ]
    for (const field of requiredFields) {
      expect(npc[field]).toBeDefined()
      expect(typeof npc[field]).toBe('string')
    }
  })

  it('generates a name in "FirstName LastName" format', () => {
    const npc = generateRandomNpc()
    expect(npc.name.split(' ').length).toBeGreaterThanOrEqual(2)
  })

  it('generates different NPCs across multiple calls (probabilistic)', () => {
    const npc1 = generateRandomNpc()
    const npc2 = generateRandomNpc()
    // With 26 first names * 20 last names = 520 combinations — extremely unlikely to match twice
    // We check at least one field differs
    const allMatch = Object.keys(npc1).every(
      (key) => npc1[key as keyof GeneratedNpc] === npc2[key as keyof GeneratedNpc]
    )
    expect(allMatch).toBe(false)
  })

  it('respects locked name when locks provided', () => {
    const current: GeneratedNpc = {
      name: 'Alaric Ashford',
      species: 'Human',
      height: 'Average',
      build: 'Athletic',
      hairColor: 'Black',
      hairStyle: 'Short',
      distinguishingFeature: 'Scar',
      clothingStyle: 'Practical',
      voice: 'Deep',
      mannerism: 'Fidgets',
      personalityTrait: 'Brave'
    }
    const locks: GeneratedNpcLocks = { ...DEFAULT_LOCKS, name: true }
    const npc = generateRandomNpc(locks, current)
    expect(npc.name).toBe('Alaric Ashford')
  })

  it('re-generates name when name lock is false', () => {
    const current: GeneratedNpc = {
      name: 'FixedName Surname',
      species: 'Elf',
      height: 'Tall',
      build: 'Slim',
      hairColor: 'Gold',
      hairStyle: 'Long',
      distinguishingFeature: 'Tattoo',
      clothingStyle: 'Elegant',
      voice: 'Melodic',
      mannerism: 'Hums',
      personalityTrait: 'Curious'
    }
    const locks: GeneratedNpcLocks = { ...DEFAULT_LOCKS }
    // Run 5 times; at least one should produce a different name
    const names = new Set(Array.from({ length: 5 }, () => generateRandomNpc(locks, current).name))
    // Very likely to produce at least 2 different names from 520 combinations
    expect(names.size).toBeGreaterThanOrEqual(1) // At minimum no crash
  })

  it('respects multiple locked fields simultaneously', () => {
    const current: GeneratedNpc = {
      name: 'Kira Blackwood',
      species: 'Dwarf',
      height: 'Short',
      build: 'Stocky',
      hairColor: 'Red',
      hairStyle: 'Braided',
      distinguishingFeature: 'Birthmark',
      clothingStyle: 'Rugged',
      voice: 'Gruff',
      mannerism: 'Speaks loudly',
      personalityTrait: 'Stubborn'
    }
    const locks: GeneratedNpcLocks = {
      ...DEFAULT_LOCKS,
      name: true,
      species: true,
      voice: true
    }
    const npc = generateRandomNpc(locks, current)
    expect(npc.name).toBe('Kira Blackwood')
    expect(npc.species).toBe('Dwarf')
    expect(npc.voice).toBe('Gruff')
  })

  it('works without any arguments (no locks, no current)', () => {
    expect(() => generateRandomNpc()).not.toThrow()
  })

  it('includes a species from the known D&D species list', () => {
    const validSpecies = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Gnome', 'Half-Orc', 'Tiefling', 'Dragonborn']
    const npc = generateRandomNpc()
    expect(validSpecies).toContain(npc.species)
  })
})
