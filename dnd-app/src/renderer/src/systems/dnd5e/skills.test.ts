import { describe, expect, it } from 'vitest'
import { SKILL_ABILITY_MAP_5E, SKILL_DEFINITIONS_5E, SKILL_NAMES_5E } from './skills'

const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']

describe('5e skills (PHASE-38 38A)', () => {
  it('has the canonical 18 skills with unique names', () => {
    expect(SKILL_DEFINITIONS_5E).toHaveLength(18)
    expect(new Set(SKILL_NAMES_5E).size).toBe(18)
  })

  it('every skill maps to one of the six abilities', () => {
    for (const s of SKILL_DEFINITIONS_5E) expect(ABILITIES).toContain(s.ability)
  })

  it('SKILL_NAMES_5E is derived from the definitions in order', () => {
    expect(SKILL_NAMES_5E).toEqual(SKILL_DEFINITIONS_5E.map((s) => s.name))
  })

  it('SKILL_ABILITY_MAP_5E maps every name to its ability', () => {
    expect(Object.keys(SKILL_ABILITY_MAP_5E).sort()).toEqual([...SKILL_NAMES_5E].sort())
    for (const s of SKILL_DEFINITIONS_5E) expect(SKILL_ABILITY_MAP_5E[s.name]).toBe(s.ability)
  })
})
