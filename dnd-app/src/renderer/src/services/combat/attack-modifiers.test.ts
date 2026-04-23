import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Character5e } from '../../types/character-5e'
import type { WeaponEntry } from '../../types/character-common'
import type { MapToken } from '../../types/map'
import { rollMultiple, rollSingle } from '../dice/dice-service'
import { findWeapon, formatAttackResult, resolveAttack } from './attack-resolver'

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

describe('findWeapon', () => {
  const weapons: WeaponEntry[] = [
    makeWeapon({ id: 'longsword', name: 'Longsword' }),
    makeWeapon({ id: 'shortbow', name: 'Shortbow', range: '80/320' }),
    makeWeapon({ id: 'rapier', name: 'Rapier', properties: ['Finesse'] })
  ]

  it('finds exact match', () => {
    expect(findWeapon(weapons, 'longsword')?.name).toBe('Longsword')
  })

  it('finds starts-with match', () => {
    expect(findWeapon(weapons, 'long')?.name).toBe('Longsword')
  })

  it('finds contains match', () => {
    expect(findWeapon(weapons, 'bow')?.name).toBe('Shortbow')
  })

  it('returns undefined for no match', () => {
    expect(findWeapon(weapons, 'warhammer')).toBeUndefined()
  })
})

describe('resolveAttack — modifiers', () => {
  const mockedRollSingle = vi.mocked(rollSingle)
  const mockedRollMultiple = vi.mocked(rollMultiple)

  beforeEach(() => {
    vi.clearAllMocks()
    mockedRollSingle.mockReturnValue(15)
    mockedRollMultiple.mockImplementation((count: number) => Array(count).fill(4))
  })

  it('resolves a basic melee hit', () => {
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
      ac: 13,
      resistances: [],
      immunities: [],
      vulnerabilities: []
    })

    const result = resolveAttack(char, weapon, attacker, target)

    // Attack roll 15 + STR(3) + prof(3) = 21 vs AC 13
    expect(result.isHit).toBe(true)
    expect(result.attackRoll).toBe(15)
    expect(result.attackTotal).toBe(21) // 15 + 3 (STR) + 3 (prof)
    expect(result.damageTotal).toBeGreaterThan(0)
  })

  it('resolves a miss', () => {
    mockedRollSingle.mockReturnValue(2)
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
      ac: 25,
      resistances: [],
      immunities: [],
      vulnerabilities: []
    })

    const result = resolveAttack(char, weapon, attacker, target)
    expect(result.isHit).toBe(false)
    expect(result.damageRolls).toEqual([])
  })

  it('Finesse weapon picks higher modifier', () => {
    // DEX(14) → +2, STR(16) → +3, should pick STR since it's higher
    const char = makeCharacter()
    const weapon = makeWeapon({ properties: ['Finesse'] })
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
    // Should use STR mod (+3) since it's higher than DEX (+2)
    // 15 + 3 + 3 = 21
    expect(result.attackTotal).toBe(21)

    // Now test with higher DEX
    const dexChar = makeCharacter({
      abilityScores: {
        strength: 10,
        dexterity: 18,
        constitution: 14,
        intelligence: 10,
        wisdom: 12,
        charisma: 8
      }
    })
    const result2 = resolveAttack(dexChar, weapon, attacker, target)
    // Should use DEX mod (+4) since it's higher than STR (+0)
    // 15 + 4 + 3 = 22
    expect(result2.attackTotal).toBe(22)
  })

  it('long range imposes disadvantage', () => {
    mockedRollSingle.mockReturnValueOnce(15).mockReturnValueOnce(10) // dis: take lower

    const char = makeCharacter()
    const weapon = makeWeapon({
      name: 'Shortbow',
      range: '80/320',
      properties: [],
      damage: '1d6',
      damageType: 'piercing'
    })
    const attacker = makeToken({ gridX: 0, gridY: 0 })
    const target = makeToken({
      id: 'token-2',
      entityId: 'goblin-1',
      entityType: 'enemy',
      label: 'Goblin',
      gridX: 20,
      gridY: 0, // 20 cells = 100ft → long range for shortbow
      ac: 13,
      resistances: [],
      immunities: [],
      vulnerabilities: []
    })

    const result = resolveAttack(char, weapon, attacker, target)
    expect(result.rangeCategory).toBe('long')
    expect(result.disadvantageSources).toContain('Long range (disadvantage)')
  })
})

describe('formatAttackResult', () => {
  it('formats a hit result', () => {
    const result = {
      attackerName: 'Fighter',
      targetName: 'Goblin',
      weaponName: 'Longsword',
      attackRoll: 15,
      attackTotal: 21,
      targetAC: 13,
      coverType: 'none' as const,
      coverACBonus: 0,
      isHit: true,
      isCrit: false,
      isFumble: false,
      rollMode: 'normal' as const,
      advantageSources: [],
      disadvantageSources: [],
      damageRolls: [6],
      damageTotal: 9,
      damageType: 'slashing',
      damageResolution: {
        totalRawDamage: 9,
        totalFinalDamage: 9,
        results: [{ finalDamage: 9, rawDamage: 9, damageType: 'slashing', modification: 'normal' as const }],
        heavyArmorMasterReduction: 0
      },
      masteryEffect: null,
      extraDamage: [],
      rangeCategory: 'melee' as const,
      exhaustionPenalty: 0
    }

    const formatted = formatAttackResult(result)
    expect(formatted).toContain('Fighter')
    expect(formatted).toContain('Goblin')
    expect(formatted).toContain('Longsword')
    expect(formatted).toContain('HIT')
    expect(formatted).toContain('9')
  })
})
