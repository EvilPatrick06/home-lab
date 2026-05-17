import { describe, expect, it } from 'vitest'
import type { Character5e } from '../../types/character-5e'
import { buildTokenStubFromCharacter } from './character-token'

function makeCharacter(overrides: Partial<Character5e> = {}): Character5e {
  const base: Character5e = {
    id: 'char-1',
    gameSystem: 'dnd5e',
    campaignId: null,
    playerId: 'player-1',
    name: 'Aragorn',
    species: 'human',
    classes: [],
    level: 1,
    background: 'noble',
    alignment: 'lawful good',
    xp: 0,
    levelingMode: 'milestone',
    abilityScores: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    },
    hitPoints: { current: 22, maximum: 30, temporary: 0 },
    hitDice: [],
    armorClass: 16,
    initiative: 2,
    speed: 30,
    speeds: { swim: 0, fly: 0, climb: 0, burrow: 0 },
    senses: [],
    resistances: [],
    immunities: [],
    vulnerabilities: [],
    details: {} as Character5e['details'],
    proficiencies: {} as Character5e['proficiencies'],
    skills: [],
    equipment: [],
    treasure: { cp: 0, sp: 0, gp: 0, ep: 0, pp: 0 },
    features: [],
    knownSpells: [],
    preparedSpellIds: [],
    spellSlotLevels: {},
    classFeatures: [],
    weapons: [],
    armor: [],
    feats: [],
    buildChoices: {} as Character5e['buildChoices'],
    status: 'active',
    campaignHistory: [],
    backstory: '',
    notes: '',
    pets: [],
    deathSaves: { successes: 0, failures: 0 },
    attunement: [],
    languageDescriptions: {},
    conditions: [],
    createdAt: '2026-05-16',
    updatedAt: '2026-05-16'
  }
  return { ...base, ...overrides }
}

describe('buildTokenStubFromCharacter', () => {
  it('maps HP / AC / speed to MapToken fields', () => {
    const stub = buildTokenStubFromCharacter(makeCharacter())
    expect(stub.entityId).toBe('char-1')
    expect(stub.entityType).toBe('player')
    expect(stub.currentHP).toBe(22)
    expect(stub.maxHP).toBe(30)
    expect(stub.ac).toBe(16)
    expect(stub.walkSpeed).toBe(30)
    expect(stub.initiativeModifier).toBe(2)
  })

  it('uses a 3-letter uppercase label derived from name', () => {
    expect(buildTokenStubFromCharacter(makeCharacter({ name: 'Aragorn' })).label).toBe('ARA')
    expect(buildTokenStubFromCharacter(makeCharacter({ name: 'Bo' })).label).toBe('BO')
    expect(buildTokenStubFromCharacter(makeCharacter({ name: '' })).label).toBe('P1')
  })

  it('infers darkvision from species when senses array is empty', () => {
    const stub = buildTokenStubFromCharacter(makeCharacter({ species: 'elf' }))
    expect(stub.darkvision).toBe(true)
    expect(stub.darkvisionRange).toBe(60)
  })

  it('parses darkvision range from senses array', () => {
    const stub = buildTokenStubFromCharacter(makeCharacter({ senses: ['darkvision 60 ft.'] }))
    expect(stub.darkvision).toBe(true)
    expect(stub.darkvisionRange).toBe(60)
  })

  it('uses 120ft range for Superior Darkvision feature', () => {
    const stub = buildTokenStubFromCharacter(
      makeCharacter({
        species: 'elf',
        features: [{ name: 'Superior Darkvision', source: 'species', description: '' }]
      })
    )
    expect(stub.darkvisionRange).toBe(120)
  })

  it('omits movement speeds when zero', () => {
    const stub = buildTokenStubFromCharacter(makeCharacter({ speeds: { swim: 30, fly: 0, climb: 0, burrow: 0 } }))
    expect(stub.swimSpeed).toBe(30)
    expect(stub.flySpeed).toBeUndefined()
    expect(stub.climbSpeed).toBeUndefined()
  })

  it('copies resistances/immunities/vulnerabilities when populated', () => {
    const stub = buildTokenStubFromCharacter(
      makeCharacter({ resistances: ['fire'], immunities: ['poison'], vulnerabilities: [] })
    )
    expect(stub.resistances).toEqual(['fire'])
    expect(stub.immunities).toEqual(['poison'])
    expect(stub.vulnerabilities).toBeUndefined()
  })
})
