import { describe, expect, it } from 'vitest'
import type { Character } from '../types/character'
import { getBuilderCreatePath, getBuilderEditPath, getCharacterSheetPath, getLevelUpPath } from './character-routes'

// Minimal character stub — only fields used by the route functions
function makeCharacter(id: string): Character {
  return {
    id,
    gameSystem: 'dnd5e',
    campaignId: null,
    playerId: 'player-1',
    name: 'Test Hero',
    species: 'Human',
    classes: [{ name: 'Fighter', level: 1 } as any],
    level: 1,
    background: 'Soldier',
    alignment: 'Neutral',
    xp: 0,
    levelingMode: 'milestone',
    abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    hitPoints: { current: 10, max: 10, temp: 0 } as any,
    hitDice: [],
    armorClass: 10,
    initiative: 0,
    speed: 30,
    speeds: { swim: 0, fly: 0, climb: 0, burrow: 0 },
    senses: [],
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    details: {} as any,
    proficiencies: {} as any,
    skills: [],
    equipment: [],
    treasure: { cp: 0, sp: 0, gp: 0, pp: 0 },
    features: [],
    knownSpells: [],
    preparedSpellIds: [],
    spellSlotLevels: {},
    classFeatures: [],
    weapons: [],
    armor: [],
    feats: [],
    buildChoices: {} as any,
    status: 'active',
    campaignHistory: [],
    backstory: '',
    notes: '',
    pets: [],
    deathSaves: { successes: 0, failures: 0 },
    attunement: [],
    languageDescriptions: {},
    conditions: [],
    createdAt: '',
    updatedAt: ''
  } as unknown as Character
}

describe('getCharacterSheetPath', () => {
  it('returns the 5e character sheet route', () => {
    const char = makeCharacter('abc-123')
    expect(getCharacterSheetPath(char)).toBe('/characters/5e/abc-123')
  })

  it('includes the full character id in the path', () => {
    const char = makeCharacter('my-long-uuid-value')
    expect(getCharacterSheetPath(char)).toBe('/characters/5e/my-long-uuid-value')
  })
})

describe('getBuilderCreatePath', () => {
  it('returns the static create route', () => {
    expect(getBuilderCreatePath()).toBe('/characters/5e/create')
  })
})

describe('getBuilderEditPath', () => {
  it('returns the edit route with the character id', () => {
    const char = makeCharacter('edit-id-99')
    expect(getBuilderEditPath(char)).toBe('/characters/5e/edit/edit-id-99')
  })
})

describe('getLevelUpPath', () => {
  it('returns the level-up route with the character id', () => {
    const char = makeCharacter('lvlup-42')
    expect(getLevelUpPath(char)).toBe('/characters/5e/lvlup-42/levelup')
  })
})

describe('route format conventions', () => {
  it('all routes start with /characters/5e/', () => {
    const char = makeCharacter('test')
    expect(getCharacterSheetPath(char)).toMatch(/^\/characters\/5e\//)
    expect(getBuilderCreatePath()).toMatch(/^\/characters\/5e\//)
    expect(getBuilderEditPath(char)).toMatch(/^\/characters\/5e\//)
    expect(getLevelUpPath(char)).toMatch(/^\/characters\/5e\//)
  })
})
