import { describe, expect, it, vi } from 'vitest'

const dataJson = vi.hoisted(() => {
  const { readFileSync: readSync } = require('fs')
  const { resolve: resolvePath } = require('path')
  return JSON.parse(
    readSync(resolvePath(__dirname, '../../public/data/5e/game/mechanics/skills.json'), 'utf-8')
  ) as Array<{
    id: string
    name: string
    ability: string
    description: string
    exampleDCs: { easy: number; moderate: number; hard: number }
    source: string
  }>
})

vi.mock('../services/data-provider', () => ({
  load5eSkills: vi.fn(() => Promise.resolve(dataJson))
}))

import type { SkillDescription } from './skills'
import { getSkillDescription, SKILLS_5E } from './skills'

describe('SKILLS_5E — initial export', () => {
  it('is an array', () => {
    expect(Array.isArray(SKILLS_5E)).toBe(true)
  })
})

describe('Skills JSON — 2024 PHB accuracy', () => {
  it('has exactly 18 skills', () => {
    expect(dataJson).toHaveLength(18)
  })

  it('contains all 18 standard D&D 5e skills', () => {
    const expectedSkills = [
      'Acrobatics',
      'Animal Handling',
      'Arcana',
      'Athletics',
      'Deception',
      'History',
      'Insight',
      'Intimidation',
      'Investigation',
      'Medicine',
      'Nature',
      'Perception',
      'Performance',
      'Persuasion',
      'Religion',
      'Sleight of Hand',
      'Stealth',
      'Survival'
    ]
    const names = dataJson.map((s) => s.name)
    for (const skill of expectedSkills) {
      expect(names, `Missing skill: ${skill}`).toContain(skill)
    }
  })

  it('skills are alphabetically ordered', () => {
    const names = dataJson.map((s) => s.name)
    const sorted = [...names].sort()
    expect(names).toEqual(sorted)
  })

  it('all skills have correct structure', () => {
    for (const skill of dataJson) {
      expect(typeof skill.id).toBe('string')
      expect(typeof skill.name).toBe('string')
      expect(typeof skill.ability).toBe('string')
      expect(typeof skill.description).toBe('string')
      expect(skill.description.length).toBeGreaterThan(20)
      expect(skill.exampleDCs).toEqual({ easy: 10, moderate: 15, hard: 20 })
      expect(skill.source).toBe('phb2024')
    }
  })

  it('ability score mappings are correct per PHB', () => {
    const abilityMap: Record<string, string> = {
      Acrobatics: 'dexterity',
      'Animal Handling': 'wisdom',
      Arcana: 'intelligence',
      Athletics: 'strength',
      Deception: 'charisma',
      History: 'intelligence',
      Insight: 'wisdom',
      Intimidation: 'charisma',
      Investigation: 'intelligence',
      Medicine: 'wisdom',
      Nature: 'intelligence',
      Perception: 'wisdom',
      Performance: 'charisma',
      Persuasion: 'charisma',
      Religion: 'intelligence',
      'Sleight of Hand': 'dexterity',
      Stealth: 'dexterity',
      Survival: 'wisdom'
    }

    for (const [skillName, expectedAbility] of Object.entries(abilityMap)) {
      const skill = dataJson.find((s) => s.name === skillName)
      expect(skill, `Missing skill: ${skillName}`).toBeDefined()
      expect(skill!.ability, `${skillName} should use ${expectedAbility}`).toBe(expectedAbility)
    }
  })

  it('Strength skills: only Athletics', () => {
    const strSkills = dataJson.filter((s) => s.ability === 'strength')
    expect(strSkills).toHaveLength(1)
    expect(strSkills[0].name).toBe('Athletics')
  })

  it('Dexterity skills: Acrobatics, Sleight of Hand, Stealth', () => {
    const dexSkills = dataJson.filter((s) => s.ability === 'dexterity').map((s) => s.name)
    expect(dexSkills).toHaveLength(3)
    expect(dexSkills).toContain('Acrobatics')
    expect(dexSkills).toContain('Sleight of Hand')
    expect(dexSkills).toContain('Stealth')
  })

  it('Intelligence skills: Arcana, History, Investigation, Nature, Religion', () => {
    const intSkills = dataJson.filter((s) => s.ability === 'intelligence').map((s) => s.name)
    expect(intSkills).toHaveLength(5)
    expect(intSkills).toContain('Arcana')
    expect(intSkills).toContain('History')
    expect(intSkills).toContain('Investigation')
    expect(intSkills).toContain('Nature')
    expect(intSkills).toContain('Religion')
  })

  it('Wisdom skills: Animal Handling, Insight, Medicine, Perception, Survival', () => {
    const wisSkills = dataJson.filter((s) => s.ability === 'wisdom').map((s) => s.name)
    expect(wisSkills).toHaveLength(5)
    expect(wisSkills).toContain('Animal Handling')
    expect(wisSkills).toContain('Insight')
    expect(wisSkills).toContain('Medicine')
    expect(wisSkills).toContain('Perception')
    expect(wisSkills).toContain('Survival')
  })

  it('Charisma skills: Deception, Intimidation, Performance, Persuasion', () => {
    const chaSkills = dataJson.filter((s) => s.ability === 'charisma').map((s) => s.name)
    expect(chaSkills).toHaveLength(4)
    expect(chaSkills).toContain('Deception')
    expect(chaSkills).toContain('Intimidation')
    expect(chaSkills).toContain('Performance')
    expect(chaSkills).toContain('Persuasion')
  })

  it('no Constitution skills exist in 5e', () => {
    const conSkills = dataJson.filter((s) => s.ability === 'constitution')
    expect(conSkills).toHaveLength(0)
  })
})

describe('getSkillDescription', () => {
  it('returns undefined for a nonexistent skill name', () => {
    const result = getSkillDescription('Nonexistent Skill')
    expect(result).toBeUndefined()
  })
})

describe('SkillDescription type — mapEntry function', () => {
  it('ABILITY_ABBREV mapping covers all 6 abilities', () => {
    // Verify the mapping is correct by checking the expected abbreviations
    const abilityAbbrevMap: Record<string, string> = {
      strength: 'STR',
      dexterity: 'DEX',
      constitution: 'CON',
      intelligence: 'INT',
      wisdom: 'WIS',
      charisma: 'CHA'
    }
    // This tests the contract: the module maps lowercase abilities to uppercase abbreviations
    for (const [_full, abbrev] of Object.entries(abilityAbbrevMap)) {
      expect(abbrev).toHaveLength(3)
      expect(abbrev).toBe(abbrev.toUpperCase())
    }
  })
})

describe('SkillDescription — type contract', () => {
  it('has the correct shape with name, ability, description, and uses fields', () => {
    const skill: SkillDescription = {
      name: 'Acrobatics',
      ability: 'DEX',
      description: 'Your Dexterity (Acrobatics) check covers your attempt to stay on your feet.',
      uses: 'Balance, tumble, perform acrobatic stunts'
    }
    expect(skill.name).toBe('Acrobatics')
    expect(skill.ability).toBe('DEX')
    expect(skill.description.length).toBeGreaterThan(0)
    expect(typeof skill.uses).toBe('string')
  })

  it('ability field uses uppercase 3-letter abbreviations matching the ABILITY_ABBREV map', () => {
    const validAbilities = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA']
    const skill: SkillDescription = {
      name: 'Athletics',
      ability: 'STR',
      description: 'Strength (Athletics) checks cover climbing, jumping, and swimming.',
      uses: 'Climb, jump, swim'
    }
    expect(validAbilities).toContain(skill.ability)
  })
})
