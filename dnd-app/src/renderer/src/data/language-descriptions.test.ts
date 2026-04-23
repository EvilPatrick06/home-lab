import { describe, expect, it, vi } from 'vitest'

const dataJson = vi.hoisted(() => {
  const { readFileSync: readSync } = require('fs')
  const { resolve: resolvePath } = require('path')
  return JSON.parse(
    readSync(resolvePath(__dirname, '../../public/data/5e/game/mechanics/languages.json'), 'utf-8')
  ) as Array<{ id: string; name: string; type: string; script: string | null; description: string; source: string }>
})

vi.mock('../services/data-provider', () => ({
  load5eLanguages: vi.fn(() => Promise.resolve(dataJson))
}))

import { LANGUAGE_DESCRIPTIONS } from './language-descriptions'

describe('LANGUAGE_DESCRIPTIONS', () => {
  it('is an object', () => {
    expect(typeof LANGUAGE_DESCRIPTIONS).toBe('object')
  })
})

describe('Languages JSON — 2024 PHB accuracy', () => {
  const findLang = (name: string) => dataJson.find((l) => l.name === name)

  it('has all 10 standard languages from 2024 PHB', () => {
    const standardLanguages = [
      'Common',
      'Common Sign Language',
      'Draconic',
      'Dwarvish',
      'Elvish',
      'Giant',
      'Gnomish',
      'Goblin',
      'Halfling',
      'Orc'
    ]
    for (const name of standardLanguages) {
      const lang = findLang(name)
      expect(lang, `Missing standard language: ${name}`).toBeDefined()
      expect(lang!.type).toBe('standard')
    }
  })

  it('has all 7 rare languages from 2024 PHB', () => {
    const rareLanguages = ['Abyssal', 'Celestial', 'Deep Speech', 'Infernal', 'Primordial', 'Sylvan', 'Undercommon']
    for (const name of rareLanguages) {
      const lang = findLang(name)
      expect(lang, `Missing rare language: ${name}`).toBeDefined()
      expect(lang!.type).toBe('rare')
    }
  })

  it('has Primordial dialects: Aquan, Auran, Ignan, Terran', () => {
    const dialects = ['Aquan', 'Auran', 'Ignan', 'Terran']
    for (const name of dialects) {
      const lang = findLang(name)
      expect(lang, `Missing dialect: ${name}`).toBeDefined()
      expect(lang!.type).toBe('dialect')
    }
  })

  it("has secret languages: Druidic and Thieves' Cant", () => {
    const druidic = findLang('Druidic')
    const thievesCant = findLang("Thieves' Cant")
    expect(druidic).toBeDefined()
    expect(druidic!.type).toBe('secret')
    expect(thievesCant).toBeDefined()
    expect(thievesCant!.type).toBe('secret')
  })

  it('Common Sign Language has no script', () => {
    const csl = findLang('Common Sign Language')
    expect(csl!.script).toBeNull()
  })

  it('Deep Speech has no script', () => {
    const ds = findLang('Deep Speech')
    expect(ds!.script).toBeNull()
  })

  it('Giant uses Dwarvish script (per 2024 PHB)', () => {
    const giant = findLang('Giant')
    expect(giant!.script).toBe('Dwarvish')
  })

  it('Sylvan uses Elvish script', () => {
    const sylvan = findLang('Sylvan')
    expect(sylvan!.script).toBe('Elvish')
  })

  it('Abyssal uses Infernal script', () => {
    const abyssal = findLang('Abyssal')
    expect(abyssal!.script).toBe('Infernal')
  })

  it('all languages have id, name, type, and description', () => {
    for (const lang of dataJson) {
      expect(typeof lang.id).toBe('string')
      expect(typeof lang.name).toBe('string')
      expect(typeof lang.type).toBe('string')
      expect(typeof lang.description).toBe('string')
      expect(lang.description.length).toBeGreaterThan(0)
    }
  })

  it('all languages have source phb2024', () => {
    for (const lang of dataJson) {
      expect(lang.source).toBe('phb2024')
    }
  })

  it('total language count is 23 (10 standard + 7 rare + 4 dialects + 2 secret)', () => {
    expect(dataJson).toHaveLength(23)
  })
})
