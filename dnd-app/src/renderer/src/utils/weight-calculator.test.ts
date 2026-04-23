import { describe, expect, it } from 'vitest'
import type { Character5e } from '../types/character-5e'
import { calculateTotalWeight, getCarryingCapacity, getEncumbranceStatus } from './weight-calculator'

// ─── getCarryingCapacity ────────────────────────────────────

describe('getCarryingCapacity', () => {
  it('returns STR x 15 carry and STR x 30 drag for Medium creatures', () => {
    const result = getCarryingCapacity(10, 'Medium')
    expect(result.carry).toBe(150)
    expect(result.dragLiftPush).toBe(300)
  })

  it('defaults to Medium if size is not provided', () => {
    const result = getCarryingCapacity(10)
    expect(result.carry).toBe(150)
    expect(result.dragLiftPush).toBe(300)
  })

  it('returns same values for Small and Medium', () => {
    const small = getCarryingCapacity(14, 'Small')
    const medium = getCarryingCapacity(14, 'Medium')
    expect(small).toEqual(medium)
  })

  it('halves capacity for Tiny creatures', () => {
    const result = getCarryingCapacity(10, 'Tiny')
    expect(result.carry).toBe(75) // 10 * 15 * 0.5
    expect(result.dragLiftPush).toBe(150) // 10 * 30 * 0.5
  })

  it('doubles capacity for Large creatures', () => {
    const result = getCarryingCapacity(10, 'Large')
    expect(result.carry).toBe(300) // 10 * 15 * 2
    expect(result.dragLiftPush).toBe(600)
  })

  it('quadruples capacity for Huge creatures', () => {
    const result = getCarryingCapacity(10, 'Huge')
    expect(result.carry).toBe(600) // 10 * 15 * 4
    expect(result.dragLiftPush).toBe(1200)
  })

  it('octuples capacity for Gargantuan creatures', () => {
    const result = getCarryingCapacity(10, 'Gargantuan')
    expect(result.carry).toBe(1200) // 10 * 15 * 8
    expect(result.dragLiftPush).toBe(2400)
  })

  it('is case-insensitive for size', () => {
    const upper = getCarryingCapacity(12, 'LARGE')
    const lower = getCarryingCapacity(12, 'large')
    const mixed = getCarryingCapacity(12, 'Large')
    expect(upper).toEqual(lower)
    expect(lower).toEqual(mixed)
  })

  it('returns 0 carry and 0 drag for STR 0', () => {
    const result = getCarryingCapacity(0, 'Medium')
    expect(result.carry).toBe(0)
    expect(result.dragLiftPush).toBe(0)
  })

  it('handles high STR scores (e.g., a Storm Giant with STR 29)', () => {
    const result = getCarryingCapacity(29, 'Huge')
    expect(result.carry).toBe(29 * 15 * 4)
    expect(result.dragLiftPush).toBe(29 * 30 * 4)
  })

  it('uses multiplier of 1 for unknown size strings', () => {
    // Falls through the switch with default multiplier = 1
    const result = getCarryingCapacity(10, 'Unknown')
    expect(result.carry).toBe(150)
    expect(result.dragLiftPush).toBe(300)
  })
})

// ─── calculateTotalWeight ───────────────────────────────────

describe('calculateTotalWeight', () => {
  function makeCharacter(overrides: Partial<Character5e> = {}): Character5e {
    return {
      id: 'test',
      gameSystem: 'dnd5e',
      campaignId: null,
      playerId: 'p1',
      name: 'Test',
      species: 'Human',
      classes: [],
      level: 1,
      background: '',
      alignment: '',
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
      ...overrides
    } as Character5e
  }

  it('returns 0 for a character with no items and no coins', () => {
    expect(calculateTotalWeight(makeCharacter())).toBe(0)
  })

  it('sums weapon weights', () => {
    const char = makeCharacter({
      weapons: [
        {
          id: 'w1',
          name: 'Longsword',
          damage: '1d8',
          damageType: 'slashing',
          attackBonus: 5,
          properties: [],
          weight: 3
        },
        { id: 'w2', name: 'Dagger', damage: '1d4', damageType: 'piercing', attackBonus: 5, properties: [], weight: 1 }
      ]
    })
    expect(calculateTotalWeight(char)).toBe(4)
  })

  it('sums armor weights', () => {
    const char = makeCharacter({
      armor: [{ id: 'a1', name: 'Chain Mail', acBonus: 16, equipped: true, type: 'armor', weight: 55 }]
    })
    expect(calculateTotalWeight(char)).toBe(55)
  })

  it('sums equipment weights', () => {
    const char = makeCharacter({
      equipment: [
        { name: 'Rope', quantity: 1, weight: 10 },
        { name: 'Torch', quantity: 5, weight: 1 }
      ]
    })
    expect(calculateTotalWeight(char)).toBe(11)
  })

  it('sums magic item weights', () => {
    const char = makeCharacter({
      magicItems: [
        { id: 'm1', name: 'Wand', rarity: 'uncommon', type: 'wand', attunement: false, description: '', weight: 1 }
      ]
    })
    expect(calculateTotalWeight(char)).toBe(1)
  })

  it('calculates coin weight at 50 coins per pound', () => {
    const char = makeCharacter({
      treasure: { cp: 0, sp: 0, gp: 100, pp: 0 }
    })
    expect(calculateTotalWeight(char)).toBe(2) // 100/50 = 2
  })

  it('sums all currency types including ep', () => {
    const char = makeCharacter({
      treasure: { cp: 50, sp: 50, gp: 50, pp: 50, ep: 50 }
    })
    // Total coins = 250, weight = 250/50 = 5
    expect(calculateTotalWeight(char)).toBe(5)
  })

  it('combines all weight sources together', () => {
    const char = makeCharacter({
      weapons: [
        { id: 'w', name: 'Sword', damage: '1d8', damageType: 'slashing', attackBonus: 0, properties: [], weight: 3 }
      ],
      armor: [{ id: 'a', name: 'Shield', acBonus: 2, equipped: true, type: 'shield', weight: 6 }],
      equipment: [{ name: 'Pack', quantity: 1, weight: 5 }],
      treasure: { cp: 0, sp: 0, gp: 50, pp: 0 }
    })
    // 3 + 6 + 5 + (50/50) = 15
    expect(calculateTotalWeight(char)).toBe(15)
  })

  it('handles items with undefined weight gracefully', () => {
    const char = makeCharacter({
      weapons: [{ id: 'w1', name: 'Mystery', damage: '1d6', damageType: 'force', attackBonus: 0, properties: [] }]
    })
    expect(calculateTotalWeight(char)).toBe(0)
  })

  it('rounds to two decimal places', () => {
    const char = makeCharacter({
      treasure: { cp: 1, sp: 0, gp: 0, pp: 0 }
    })
    // 1/50 = 0.02
    expect(calculateTotalWeight(char)).toBe(0.02)
  })
})

// ─── getEncumbranceStatus ───────────────────────────────────

describe('getEncumbranceStatus', () => {
  const capacity = { carry: 150, dragLiftPush: 300 }

  it('returns "normal" when weight is under carry capacity', () => {
    expect(getEncumbranceStatus(100, capacity)).toBe('normal')
  })

  it('returns "normal" when weight exactly equals carry capacity', () => {
    expect(getEncumbranceStatus(150, capacity)).toBe('normal')
  })

  it('returns "encumbered" when weight exceeds carry but not drag', () => {
    expect(getEncumbranceStatus(200, capacity)).toBe('encumbered')
  })

  it('returns "encumbered" when weight exactly equals drag capacity', () => {
    expect(getEncumbranceStatus(300, capacity)).toBe('encumbered')
  })

  it('returns "over-limit" when weight exceeds drag capacity', () => {
    expect(getEncumbranceStatus(301, capacity)).toBe('over-limit')
  })

  it('returns "normal" for 0 weight', () => {
    expect(getEncumbranceStatus(0, capacity)).toBe('normal')
  })
})
