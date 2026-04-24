import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Character5e } from '../../types/character-5e'
import type { WeaponEntry } from '../../types/character-common'
import type { MapToken } from '../../types/map'
import { rollMultiple, rollSingle } from '../dice/dice-service'
import { resolveAttack } from './attack-resolver'

// ─── Mock dependencies ───────────────────────────────────────

vi.mock('../dice/dice-service', () => ({
  rollSingle: vi.fn(() => 15),
  rollMultiple: vi.fn((count: number, _sides: number) => Array(count).fill(4))
}))

vi.mock('../../components/game/dice3d', () => ({
  trigger3dDice: vi.fn()
}))

vi.mock('../../stores/useGameStore', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      maps: [
        {
          id: 'map-1',
          wallSegments: [],
          tokens: [],
          grid: { cellSize: 64 }
        }
      ],
      activeMapId: 'map-1',
      conditions: [],
      turnStates: {},
      underwaterCombat: false,
      flankingEnabled: false,
      round: 1
    }))
  }
}))

vi.mock('../../stores/useLobbyStore', () => ({
  useLobbyStore: {
    getState: vi.fn(() => ({
      players: [],
      addChatMessage: vi.fn()
    }))
  }
}))

vi.mock('../../stores/useNetworkStore', () => ({
  useNetworkStore: {
    getState: vi.fn(() => ({
      localPeerId: 'local',
      sendMessage: vi.fn(),
      role: 'host'
    }))
  }
}))

vi.mock('../../stores/useCharacterStore', () => ({
  useCharacterStore: {
    getState: vi.fn(() => ({
      characters: [],
      saveCharacter: vi.fn()
    }))
  }
}))

// ─── Test Data ───────────────────────────────────────────────

function makeWeapon(overrides: Partial<WeaponEntry> = {}): WeaponEntry {
  return {
    id: 'longsword',
    name: 'Longsword',
    damage: '1d8',
    damageType: 'slashing',
    attackBonus: 0,
    properties: [],
    proficient: true,
    ...overrides
  }
}

function makeCharacter(overrides: Partial<Character5e> = {}): Character5e {
  return {
    id: 'char-1',
    gameSystem: 'dnd5e',
    campaignId: null,
    playerId: 'player-1',
    name: 'Test Fighter',
    species: 'Human',
    classes: [{ className: 'Fighter', classLevel: 5, subclass: null }],
    level: 5,
    background: 'Soldier',
    alignment: 'Neutral',
    xp: 0,
    levelingMode: 'milestone',
    abilityScores: {
      strength: 16,
      dexterity: 14,
      constitution: 14,
      intelligence: 10,
      wisdom: 12,
      charisma: 8
    },
    hitPoints: { current: 44, max: 44, temporary: 0 },
    hitDice: [{ current: 5, maximum: 5, dieType: 10 }],
    armorClass: 18,
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
    treasure: { cp: 0, sp: 0, gp: 0, pp: 0 },
    features: [],
    knownSpells: [],
    preparedSpellIds: [],
    spellSlotLevels: {},
    classFeatures: [],
    weapons: [makeWeapon()],
    armor: [],
    feats: [],
    buildChoices: {} as Character5e['buildChoices'],
    status: 'active',
    campaignHistory: [],
    backstory: '',
    notes: '',
    conditions: [],
    languageDescriptions: {},
    attunement: [],
    ...overrides
  } as Character5e
}

function makeToken(overrides: Partial<MapToken> = {}): MapToken {
  return {
    id: 'token-1',
    entityId: 'char-1',
    entityType: 'player',
    label: 'Test Fighter',
    gridX: 5,
    gridY: 5,
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    conditions: [],
    ...overrides
  } as MapToken
}

// ─── Tests ───────────────────────────────────────────────────

describe('resolveAttack — critical hits & special damage', () => {
  const mockedRollSingle = vi.mocked(rollSingle)
  const mockedRollMultiple = vi.mocked(rollMultiple)

  beforeEach(() => {
    vi.clearAllMocks()
    mockedRollSingle.mockReturnValue(15)
    mockedRollMultiple.mockImplementation((count: number) => Array(count).fill(4))
  })

  it('critical hit doubles damage dice', () => {
    mockedRollSingle.mockReturnValue(20)
    mockedRollMultiple.mockImplementation((count: number) => Array(count).fill(4))

    const char = makeCharacter()
    const weapon = makeWeapon({ damage: '1d8' })
    const attacker = makeToken()
    const target = makeToken({
      id: 'token-2',
      entityId: 'goblin-1',
      entityType: 'enemy',
      label: 'Goblin',
      gridX: 6,
      gridY: 5,
      ac: 30,
      resistances: [],
      immunities: [],
      vulnerabilities: []
    })

    const result = resolveAttack(char, weapon, attacker, target)

    expect(result.isCrit).toBe(true)
    expect(result.isHit).toBe(true) // Nat 20 always hits
    // 2d8 (doubled) = [4, 4] + STR mod(3) + effect bonus(0) = 11
    expect(result.damageRolls.length).toBe(2) // Doubled dice count
  })

  it('natural 1 always misses', () => {
    mockedRollSingle.mockReturnValue(1)
    const char = makeCharacter()
    const weapon = makeWeapon()
    const attacker = makeToken()
    const target = makeToken({
      id: 'token-2',
      entityId: 'goblin-1',
      entityType: 'enemy',
      label: 'Goblin',
      gridX: 6,
      gridY: 5,
      ac: 1,
      resistances: [],
      immunities: [],
      vulnerabilities: []
    })

    const result = resolveAttack(char, weapon, attacker, target)
    expect(result.isFumble).toBe(true)
    expect(result.isHit).toBe(false)
  })

  it('immunity zeroes damage', () => {
    const char = makeCharacter()
    const weapon = makeWeapon({ damageType: 'fire' })
    const attacker = makeToken()
    const target = makeToken({
      id: 'token-2',
      entityId: 'goblin-1',
      entityType: 'enemy',
      label: 'Fire Elemental',
      gridX: 6,
      gridY: 5,
      ac: 10,
      resistances: [],
      immunities: ['fire'],
      vulnerabilities: []
    })

    const result = resolveAttack(char, weapon, attacker, target)
    expect(result.isHit).toBe(true)
    expect(result.damageResolution?.totalFinalDamage).toBe(0)
  })

  it('resistance halves damage', () => {
    const char = makeCharacter()
    const weapon = makeWeapon({ damageType: 'fire', damage: '2d6' })
    const attacker = makeToken()
    const target = makeToken({
      id: 'token-2',
      entityId: 'goblin-1',
      entityType: 'enemy',
      label: 'Red Dragon',
      gridX: 6,
      gridY: 5,
      ac: 10,
      resistances: ['fire'],
      immunities: [],
      vulnerabilities: []
    })

    mockedRollMultiple.mockReturnValue([4, 4]) // 8 damage + 3 STR = 11

    const result = resolveAttack(char, weapon, attacker, target)
    expect(result.isHit).toBe(true)
    // Raw damage: 8 + 3 = 11, halved = 5
    expect(result.damageResolution?.totalFinalDamage).toBe(5)
  })

  it('Graze mastery deals damage on miss', () => {
    mockedRollSingle.mockReturnValue(2) // Will miss
    const char = makeCharacter({
      weaponMasteryChoices: ['Graze']
    })
    const weapon = makeWeapon({ mastery: 'Graze' })
    const attacker = makeToken()
    const target = makeToken({
      id: 'token-2',
      entityId: 'goblin-1',
      entityType: 'enemy',
      label: 'Goblin',
      gridX: 6,
      gridY: 5,
      ac: 25,
      resistances: [],
      immunities: [],
      vulnerabilities: []
    })

    const result = resolveAttack(char, weapon, attacker, target)
    expect(result.isHit).toBe(false)
    expect(result.masteryEffect?.mastery).toBe('Graze')
    expect(result.masteryEffect?.grazeDamage).toBe(3) // STR mod +3
    expect(result.damageTotal).toBe(3)
  })

  it('Topple mastery triggers CON save on hit', () => {
    const char = makeCharacter({
      weaponMasteryChoices: ['Topple']
    })
    const weapon = makeWeapon({ mastery: 'Topple' })
    const attacker = makeToken()
    const target = makeToken({
      id: 'token-2',
      entityId: 'goblin-1',
      entityType: 'enemy',
      label: 'Goblin',
      gridX: 6,
      gridY: 5,
      ac: 10,
      resistances: [],
      immunities: [],
      vulnerabilities: []
    })

    const result = resolveAttack(char, weapon, attacker, target)
    expect(result.isHit).toBe(true)
    expect(result.masteryEffect?.mastery).toBe('Topple')
    expect(result.masteryEffect?.requiresSave?.ability).toBe('constitution')
    // DC = 8 + STR mod(3) + prof(3) = 14
    expect(result.masteryEffect?.requiresSave?.dc).toBe(14)
  })
})
