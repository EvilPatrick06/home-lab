import { describe, expect, it } from 'vitest'
import { is5eCharacter } from './character'
import type { Character5e } from './character-5e'

function makeMinimal5eCharacter(overrides?: Partial<Character5e>): Character5e {
  return {
    gameSystem: 'dnd5e',
    id: 'char-1',
    name: 'Test Hero',
    level: 1,
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    },
    hitDice: [{ dieType: 8, current: 1, maximum: 1 }],
    ...overrides
  } as Character5e
}

describe('is5eCharacter — Phase 17a defensive runtime validation', () => {
  it('returns true for a well-formed 5e character', () => {
    expect(is5eCharacter(makeMinimal5eCharacter())).toBe(true)
  })

  it('rejects null or undefined values without throwing', () => {
    expect(is5eCharacter(null as never)).toBe(false)
    expect(is5eCharacter(undefined as never)).toBe(false)
  })

  it('rejects shapes whose gameSystem is not "dnd5e"', () => {
    expect(is5eCharacter({ ...makeMinimal5eCharacter(), gameSystem: 'pathfinder' as never })).toBe(false)
  })

  it('rejects shapes that pass the gameSystem check but are missing abilityScores', () => {
    const bad = { ...makeMinimal5eCharacter(), abilityScores: undefined as unknown as Character5e['abilityScores'] }
    expect(is5eCharacter(bad)).toBe(false)
  })

  it('rejects shapes whose hitDice is not an array (e.g., undefined or wrong shape)', () => {
    const bad = { ...makeMinimal5eCharacter(), hitDice: undefined as unknown as Character5e['hitDice'] }
    expect(is5eCharacter(bad)).toBe(false)
  })

  it('rejects shapes whose hitDice is an object (not an array)', () => {
    const bad = { ...makeMinimal5eCharacter(), hitDice: { current: 1 } as unknown as Character5e['hitDice'] }
    expect(is5eCharacter(bad)).toBe(false)
  })
})
