/**
 * Tests for feat-prerequisites.ts — feat prerequisite validation
 */
import { describe, expect, it } from 'vitest'
import type { Character5e } from '../types/character-5e'
import { meetsFeatPrerequisites } from './feat-prerequisites'

function makeCharacter(overrides: Partial<Character5e> = {}): Character5e {
  return {
    id: 'test-char',
    name: 'Test',
    gameSystem: 'dnd5e',
    level: 5,
    species: 'Human',
    classes: [{ name: 'Fighter', level: 5, hitDie: 10, subclass: undefined }],
    abilityScores: {
      strength: 16,
      dexterity: 14,
      constitution: 12,
      intelligence: 10,
      wisdom: 10,
      charisma: 8
    },
    proficiencies: {
      armor: ['Light armor', 'Medium armor', 'Heavy armor', 'Shields'],
      weapons: ['Simple weapons', 'Martial weapons'],
      tools: [],
      languages: ['Common'],
      skills: []
    },
    feats: [],
    hp: { current: 44, max: 44, temp: 0 },
    hitDice: [{ current: 5, maximum: 5, dieType: 10 }],
    spellSlots: {},
    spells: [],
    equipment: [],
    senses: [],
    resistances: [],
    deathSaves: { successes: 0, failures: 0 },
    conditions: [],
    currency: { cp: 0, sp: 0, ep: 0, gp: 100, pp: 0 },
    background: 'soldier',
    skills: {},
    ...overrides
  } as Character5e
}

describe('meetsFeatPrerequisites', () => {
  it('passes with no prerequisites', () => {
    const char = makeCharacter()
    expect(meetsFeatPrerequisites(char, {})).toBe(true)
  })

  it('checks single ability score requirement', () => {
    const char = makeCharacter({
      abilityScores: { strength: 16, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 10, charisma: 8 }
    })
    expect(meetsFeatPrerequisites(char, { abilityScores: [{ abilities: ['Strength'], minimum: 13 }] })).toBe(true)
  })

  it('fails single ability score when too low', () => {
    const char = makeCharacter({
      abilityScores: { strength: 10, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 10, charisma: 8 }
    })
    expect(meetsFeatPrerequisites(char, { abilityScores: [{ abilities: ['Strength'], minimum: 13 }] })).toBe(false)
  })

  it('checks dual ability "Strength or Dexterity 13+"', () => {
    // STR 10 but DEX 14 — should pass
    const char = makeCharacter({
      abilityScores: { strength: 10, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 10, charisma: 8 }
    })
    expect(
      meetsFeatPrerequisites(char, { abilityScores: [{ abilities: ['Strength', 'Dexterity'], minimum: 13 }] })
    ).toBe(true)
  })

  it('fails dual ability when both too low', () => {
    const char = makeCharacter({
      abilityScores: { strength: 10, dexterity: 10, constitution: 12, intelligence: 10, wisdom: 10, charisma: 8 }
    })
    expect(
      meetsFeatPrerequisites(char, { abilityScores: [{ abilities: ['Strength', 'Dexterity'], minimum: 13 }] })
    ).toBe(false)
  })

  it('passes level prerequisite when character level is sufficient', () => {
    const char = makeCharacter({ level: 5 })
    expect(meetsFeatPrerequisites(char, { level: 4 })).toBe(true)
  })

  it('fails level prerequisite when character level is too low', () => {
    const char = makeCharacter({ level: 3 })
    expect(meetsFeatPrerequisites(char, { level: 4 })).toBe(false)
  })

  it('checks multiple prerequisites (level + ability score)', () => {
    const char = makeCharacter({
      level: 8,
      abilityScores: { strength: 16, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 10, charisma: 8 }
    })
    expect(meetsFeatPrerequisites(char, { level: 4, abilityScores: [{ abilities: ['Strength'], minimum: 13 }] })).toBe(
      true
    )
  })

  it('fails if any prerequisite fails', () => {
    const char = makeCharacter({
      level: 8,
      abilityScores: { strength: 10, dexterity: 14, constitution: 12, intelligence: 10, wisdom: 10, charisma: 8 }
    })
    expect(meetsFeatPrerequisites(char, { level: 4, abilityScores: [{ abilities: ['Strength'], minimum: 13 }] })).toBe(
      false
    )
  })

  it('passes with null level', () => {
    const char = makeCharacter()
    expect(meetsFeatPrerequisites(char, { level: null })).toBe(true)
  })

  it('passes with empty abilityScores array', () => {
    const char = makeCharacter()
    expect(meetsFeatPrerequisites(char, { abilityScores: [] })).toBe(true)
  })
})
