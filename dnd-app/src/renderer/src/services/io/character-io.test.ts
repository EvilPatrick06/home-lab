import { describe, expect, it } from 'vitest'
import type { Character5e } from '../../types/character-5e'
import { deserializeCharacter, serializeCharacter } from './character-io'

const minimalCharacter: Character5e = {
  id: 'char-1',
  gameSystem: 'dnd5e',
  name: 'Test Hero',
  campaignId: null,
  playerId: 'player-1',
  species: 'Human',
  classes: [],
  level: 1,
  background: 'Folk Hero',
  alignment: 'Neutral Good',
  xp: 0,
  levelingMode: 'xp',
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  hitPoints: { current: 10, maximum: 10, temporary: 0 },
  hitDice: [],
  armorClass: 10,
  initiative: 0,
  speed: 30,
  speeds: { swim: 0, fly: 0, climb: 0, burrow: 0 },
  senses: [],
  resistances: [],
  immunities: [],
  vulnerabilities: [],
  details: { age: '', height: '', weight: '', eyes: '', skin: '', hair: '' },
  proficiencies: { armor: [], weapons: [], tools: [], languages: [], savingThrows: [] },
  skills: [],
  equipment: [],
  treasure: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
  features: [],
  knownSpells: [],
  preparedSpellIds: [],
  spellSlotLevels: {},
  classFeatures: [],
  weapons: [],
  armor: [],
  feats: [],
  buildChoices: {
    speciesId: 'human',
    backgroundId: 'folk-hero',
    classId: 'fighter',
    abilityScoreMethod: 'standard',
    abilityScoreAssignments: {},
    selectedSkills: []
  },
  status: 'active',
  campaignHistory: [],
  backstory: '',
  notes: '',
  pets: [],
  deathSaves: { successes: 0, failures: 0 },
  attunement: [],
  languageDescriptions: {},
  conditions: [],
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z'
}

describe('character-io', () => {
  describe('serializeCharacter', () => {
    it('round-trip: serialize then deserialize returns same data', () => {
      const serialized = serializeCharacter(minimalCharacter)
      const deserialized = deserializeCharacter(serialized)
      expect(deserialized).toEqual(minimalCharacter)
    })
  })

  describe('deserializeCharacter', () => {
    it('rejects missing id', () => {
      const json = JSON.stringify({ gameSystem: 'dnd5e', name: 'Test' })
      expect(() => deserializeCharacter(json)).toThrow('missing or invalid "id" field')
    })

    it('rejects wrong gameSystem', () => {
      const json = JSON.stringify({ id: 'x', gameSystem: 'pathfinder', name: 'Test' })
      expect(() => deserializeCharacter(json)).toThrow('missing or invalid "gameSystem" field')
    })

    it('rejects non-object (e.g., array)', () => {
      const json = JSON.stringify(42)
      expect(() => deserializeCharacter(json)).toThrow('not a valid JSON object')
    })

    it('rejects missing name', () => {
      const json = JSON.stringify({ id: 'x', gameSystem: 'dnd5e' })
      expect(() => deserializeCharacter(json)).toThrow('missing or invalid "name" field')
    })
  })
})
