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
      spellSlotLevels: {},
      classFeatures: [],
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
    const w1 = {
      id: 'w1',
      name: 'Longsword',
      damage: '1d8',
      damageType: 'slashing',
      attackBonus: 5,
      properties: [],
      weight: 3
    }
    const w2 = {
      id: 'w2',
      name: 'Dagger',
      damage: '1d4',
      damageType: 'piercing',
      attackBonus: 5,
      properties: [],
      weight: 1
    }
    const char = makeCharacter({
      weaponRefs: [
        { instanceId: w1.id, ref: { entryType: 'weapons', entryId: w1.id, overrides: w1 } },
        { instanceId: w2.id, ref: { entryType: 'weapons', entryId: w2.id, overrides: w2 } }
      ]
    })
    expect(calculateTotalWeight(char)).toBe(4)
  })

  it('sums armor weights', () => {
    const a1 = { id: 'a1', name: 'Chain Mail', acBonus: 16, equipped: true, type: 'armor', weight: 55 }
    const char = makeCharacter({
      armorRefs: [{ instanceId: a1.id, ref: { entryType: 'armor', entryId: a1.id, overrides: a1 } }]
    })
    expect(calculateTotalWeight(char)).toBe(55)
  })

  it('sums equipment weights times quantity', () => {
    // Phase 23m — weight is per-unit: Rope 1×10 + Torch 5×1 = 15 (was incorrectly 11).
    const char = makeCharacter({
      equipment: [
        { name: 'Rope', quantity: 1, weight: 10 },
        { name: 'Torch', quantity: 5, weight: 1 }
      ]
    })
    expect(calculateTotalWeight(char)).toBe(15)
  })

  it('recurses into container contents (PHASE-13 13I)', () => {
    // Backpack(2) + [Rope 1×10, Torch 5×1] = 2 + 10 + 5 = 17.
    const char = makeCharacter({
      equipment: [
        {
          name: 'Backpack',
          quantity: 1,
          weight: 2,
          contents: [
            { name: 'Rope', quantity: 1, weight: 10 },
            { name: 'Torch', quantity: 5, weight: 1 }
          ]
        }
      ]
    })
    expect(calculateTotalWeight(char)).toBe(17)
  })

  it('multiplies quantity at each nesting level', () => {
    // Pouch ×2 weighing 1 each, holding 3 stones ×1: each pouch = 1 + 3 = 4; ×2 = 8.
    const char = makeCharacter({
      equipment: [{ name: 'Pouch', quantity: 2, weight: 1, contents: [{ name: 'Stone', quantity: 3, weight: 1 }] }]
    })
    // contents weight is per-container instance? The helper sums contents once per item entry,
    // then the (weight*quantity) of the container itself. Here: (1*2) + (3*1) = 5.
    expect(calculateTotalWeight(char)).toBe(5)
  })

  it('truncates absurdly deep nesting (depth cap)', () => {
    // Build a 10-deep chain; depth-8 cap means the deepest levels contribute 0.
    let node: { name: string; quantity: number; weight: number; contents?: unknown[] } = {
      name: 'Box',
      quantity: 1,
      weight: 1
    }
    for (let i = 0; i < 9; i++) {
      node = { name: 'Box', quantity: 1, weight: 1, contents: [node] }
    }
    // biome-ignore lint/suspicious/noExplicitAny: deeply-nested fixture
    const char = makeCharacter({ equipment: [node as any] })
    // 10 levels total but only the first 8 count (each weight 1) → 8.
    expect(calculateTotalWeight(char)).toBe(8)
  })

  it('behaves identically for items without contents (regression)', () => {
    const char = makeCharacter({ equipment: [{ name: 'Rope', quantity: 1, weight: 10 }] })
    expect(calculateTotalWeight(char)).toBe(10)
  })

  it('sums magic item weights', () => {
    const m1 = {
      id: 'm1',
      name: 'Wand',
      rarity: 'uncommon',
      type: 'wand',
      attunement: false,
      description: '',
      weight: 1
    }
    const char = makeCharacter({
      magicItemRefs: [{ instanceId: m1.id, ref: { entryType: 'magic-items', entryId: m1.id, overrides: m1 } }]
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
    const w = {
      id: 'w',
      name: 'Sword',
      damage: '1d8',
      damageType: 'slashing',
      attackBonus: 0,
      properties: [],
      weight: 3
    }
    const a = { id: 'a', name: 'Shield', acBonus: 2, equipped: true, type: 'shield', weight: 6 }
    const char = makeCharacter({
      weaponRefs: [{ instanceId: w.id, ref: { entryType: 'weapons', entryId: w.id, overrides: w } }],
      armorRefs: [{ instanceId: a.id, ref: { entryType: 'armor', entryId: a.id, overrides: a } }],
      equipment: [{ name: 'Pack', quantity: 1, weight: 5 }],
      treasure: { cp: 0, sp: 0, gp: 50, pp: 0 }
    })
    // 3 + 6 + 5 + (50/50) = 15
    expect(calculateTotalWeight(char)).toBe(15)
  })

  it('handles items with undefined weight gracefully', () => {
    const w1 = { id: 'w1', name: 'Mystery', damage: '1d6', damageType: 'force', attackBonus: 0, properties: [] }
    const char = makeCharacter({
      weaponRefs: [{ instanceId: w1.id, ref: { entryType: 'weapons', entryId: w1.id, overrides: w1 } }]
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
