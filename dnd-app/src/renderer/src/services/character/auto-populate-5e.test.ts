import { describe, expect, it, vi } from 'vitest'

// Mock the species-spells JSON import
vi.mock('../../../public/data/5e/character/species-spells.json', () => ({
  default: {
    light: {
      name: 'Light',
      level: 0,
      description: 'Touch an object to make it shed bright light.',
      castingTime: '1 Action',
      range: 'Touch',
      duration: '1 Hour',
      components: 'V, M',
      school: 'Evocation'
    },
    thaumaturgy: {
      name: 'Thaumaturgy',
      level: 0,
      description: 'You manifest a minor wonder.',
      castingTime: '1 Action',
      range: '30 feet',
      duration: 'Up to 1 Minute',
      components: 'V',
      school: 'Transmutation'
    },
    'hellish-rebuke': {
      name: 'Hellish Rebuke',
      level: 1,
      description: '2d10 fire damage on reaction.',
      castingTime: '1 Reaction',
      range: '60 feet',
      duration: 'Instantaneous',
      components: 'V, S',
      school: 'Evocation'
    },
    darkness: {
      name: 'Darkness',
      level: 2,
      description: 'Magical darkness fills a sphere.',
      castingTime: '1 Action',
      range: '60 feet',
      duration: 'Concentration, up to 10 Minutes',
      components: 'V, M',
      school: 'Evocation'
    }
  }
}))

import {
  getSpeciesSpellProgression,
  getSpellsFromTraits,
  populateSkills5e,
  SKILL_ABILITY_MAP_5E
} from './auto-populate-5e'

describe('SKILL_ABILITY_MAP_5E', () => {
  it('contains all 18 standard 5e skills', () => {
    const skillNames = Object.keys(SKILL_ABILITY_MAP_5E)
    expect(skillNames).toHaveLength(18)
  })

  it('maps Athletics to strength', () => {
    expect(SKILL_ABILITY_MAP_5E.Athletics).toBe('strength')
  })

  it('maps Acrobatics to dexterity', () => {
    expect(SKILL_ABILITY_MAP_5E.Acrobatics).toBe('dexterity')
  })

  it('maps Arcana to intelligence', () => {
    expect(SKILL_ABILITY_MAP_5E.Arcana).toBe('intelligence')
  })

  it('maps Perception to wisdom', () => {
    expect(SKILL_ABILITY_MAP_5E.Perception).toBe('wisdom')
  })

  it('maps Deception to charisma', () => {
    expect(SKILL_ABILITY_MAP_5E.Deception).toBe('charisma')
  })

  it('maps Stealth to dexterity', () => {
    expect(SKILL_ABILITY_MAP_5E.Stealth).toBe('dexterity')
  })

  it('maps Sleight of Hand to dexterity', () => {
    expect(SKILL_ABILITY_MAP_5E['Sleight of Hand']).toBe('dexterity')
  })

  it('maps Animal Handling to wisdom', () => {
    expect(SKILL_ABILITY_MAP_5E['Animal Handling']).toBe('wisdom')
  })
})

describe('populateSkills5e', () => {
  it('returns all 18 skills', () => {
    const skills = populateSkills5e([])
    expect(skills).toHaveLength(18)
  })

  it('marks selected skills as proficient', () => {
    const skills = populateSkills5e(['Athletics', 'Perception'])
    const athletics = skills.find((s) => s.name === 'Athletics')
    const perception = skills.find((s) => s.name === 'Perception')
    expect(athletics!.proficient).toBe(true)
    expect(perception!.proficient).toBe(true)
  })

  it('marks non-selected skills as not proficient', () => {
    const skills = populateSkills5e(['Athletics'])
    const stealth = skills.find((s) => s.name === 'Stealth')
    expect(stealth!.proficient).toBe(false)
  })

  it('sets expertise to false for all skills by default', () => {
    const skills = populateSkills5e(['Athletics', 'Stealth'])
    for (const skill of skills) {
      expect(skill.expertise).toBe(false)
    }
  })

  it('includes the correct ability for each skill', () => {
    const skills = populateSkills5e([])
    const athletics = skills.find((s) => s.name === 'Athletics')
    expect(athletics!.ability).toBe('strength')
    const arcana = skills.find((s) => s.name === 'Arcana')
    expect(arcana!.ability).toBe('intelligence')
  })

  it('handles empty selection array', () => {
    const skills = populateSkills5e([])
    const allNotProficient = skills.every((s) => !s.proficient)
    expect(allNotProficient).toBe(true)
  })

  // D&D rule: Rogue gets 4 skill proficiencies at level 1
  it('handles typical Rogue skill selection (4 skills)', () => {
    const rogueSkills = ['Acrobatics', 'Deception', 'Stealth', 'Perception']
    const skills = populateSkills5e(rogueSkills)
    const proficientCount = skills.filter((s) => s.proficient).length
    expect(proficientCount).toBe(4)
  })
})

describe('getSpellsFromTraits', () => {
  it('returns empty array when no traits have spellGranted', () => {
    const traits = [{ name: 'Darkvision', description: 'You can see in the dark.' }]
    const result = getSpellsFromTraits(traits, 'Human')
    expect(result).toEqual([])
  })

  it('resolves a known spell from spellGranted string', () => {
    const traits = [{ name: 'Celestial Legacy', description: 'You know the Light cantrip.', spellGranted: 'light' }]
    const result = getSpellsFromTraits(traits, 'Aasimar')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Light')
    expect(result[0].level).toBe(0) // cantrip
    expect(result[0].id).toBe('species-light-Aasimar')
  })

  it('creates a placeholder for an unknown spell', () => {
    const traits = [{ name: 'Custom Trait', description: 'You know Custom Blast.', spellGranted: 'custom-blast' }]
    const result = getSpellsFromTraits(traits, 'Custom')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Custom-blast')
    expect(result[0].level).toBe(0)
    expect(result[0].castingTime).toBe('Varies')
  })

  it('handles spell list pick (object form) for species cantrip choice', () => {
    const traits = [
      {
        name: 'High Elf Cantrip',
        description: 'Choose one wizard cantrip.',
        spellGranted: { list: 'wizard', count: 1 }
      }
    ]
    const result = getSpellsFromTraits(traits, 'HighElf')
    expect(result).toHaveLength(1)
    expect(result[0].name).toContain('Wizard')
    expect(result[0].id).toBe('species-cantrip-HighElf')
    expect(result[0].classes).toContain('Wizard')
  })

  it('handles multiple spell-granting traits', () => {
    const traits = [
      { name: 'Trait 1', description: 'Light cantrip.', spellGranted: 'light' },
      { name: 'Trait 2', description: 'Thaumaturgy cantrip.', spellGranted: 'thaumaturgy' }
    ]
    const result = getSpellsFromTraits(traits, 'Tiefling')
    expect(result).toHaveLength(2)
  })
})

describe('getSpeciesSpellProgression', () => {
  const tieflingProgression = [
    { spellId: 'hellish-rebuke', grantedAtLevel: 3, innateUses: 1 },
    { spellId: 'darkness', grantedAtLevel: 5, innateUses: 1 }
  ]

  it('returns no spells at level 1 for Tiefling', () => {
    const result = getSpeciesSpellProgression(tieflingProgression, 1, 'Tiefling')
    expect(result).toHaveLength(0)
  })

  it('returns Hellish Rebuke at level 3 for Tiefling', () => {
    const result = getSpeciesSpellProgression(tieflingProgression, 3, 'Tiefling')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('Hellish Rebuke')
    expect(result[0].id).toBe('species-hellish-rebuke-Tiefling')
    expect(result[0].source).toBe('species')
  })

  it('returns both spells at level 5 for Tiefling', () => {
    const result = getSpeciesSpellProgression(tieflingProgression, 5, 'Tiefling')
    expect(result).toHaveLength(2)
    expect(result.map((s) => s.name)).toContain('Hellish Rebuke')
    expect(result.map((s) => s.name)).toContain('Darkness')
  })

  it('returns both spells at level 20 (still eligible)', () => {
    const result = getSpeciesSpellProgression(tieflingProgression, 20, 'Tiefling')
    expect(result).toHaveLength(2)
  })

  it('sets innateUses with max and remaining for 1/long-rest spells', () => {
    const result = getSpeciesSpellProgression(tieflingProgression, 5, 'Tiefling')
    const hellishRebuke = result.find((s) => s.name === 'Hellish Rebuke')
    expect(hellishRebuke!.innateUses).toEqual({ max: 1, remaining: 1 })
  })

  it('handles proficiency-bonus uses (innateUses: -1)', () => {
    const progression = [{ spellId: 'light', grantedAtLevel: 1, innateUses: -1 }]
    const result = getSpeciesSpellProgression(progression, 1, 'Custom')
    expect(result).toHaveLength(1)
    expect(result[0].innateUses).toEqual({ max: -1, remaining: -1 })
  })

  it('returns empty array for empty progression', () => {
    const result = getSpeciesSpellProgression([], 5, 'Human')
    expect(result).toEqual([])
  })

  it('skips unknown spells not in SPECIES_SPELL_DATA', () => {
    const progression = [{ spellId: 'nonexistent-spell', grantedAtLevel: 1, innateUses: 1 }]
    const result = getSpeciesSpellProgression(progression, 5, 'Custom')
    expect(result).toHaveLength(0)
  })
})
