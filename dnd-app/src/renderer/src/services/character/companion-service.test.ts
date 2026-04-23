import { describe, expect, it } from 'vitest'
import type { Companion5e } from '../../types/companion'
import type { MonsterStatBlock } from '../../types/monster'
import { createCompanionToken, getFamiliarForms, getSteedForms, getWildShapeEligibleBeasts } from './companion-service'

// Helper to create a minimal MonsterStatBlock
function makeMonster(overrides: Partial<MonsterStatBlock> = {}): MonsterStatBlock {
  return {
    id: 'test-beast',
    name: 'Test Beast',
    size: 'Medium',
    type: 'Beast',
    alignment: 'Unaligned',
    ac: 12,
    hp: 11,
    hitDice: '2d8+2',
    speed: { walk: 30 },
    abilityScores: { str: 14, dex: 14, con: 12, int: 2, wis: 10, cha: 6 },
    senses: { passivePerception: 10 },
    languages: [],
    cr: '0',
    xp: 10,
    proficiencyBonus: 2,
    actions: [],
    tokenSize: { x: 1, y: 1 },
    ...overrides
  } as MonsterStatBlock
}

function makeCompanion(overrides: Partial<Companion5e> = {}): Companion5e {
  return {
    id: 'companion-1',
    type: 'familiar',
    name: 'Owl Familiar',
    monsterStatBlockId: 'owl',
    currentHP: 5,
    maxHP: 5,
    ownerId: 'char-1',
    dismissed: false,
    sourceSpell: 'find-familiar',
    createdAt: '2024-01-01',
    ...overrides
  }
}

describe('getWildShapeEligibleBeasts', () => {
  const beasts: MonsterStatBlock[] = [
    makeMonster({ id: 'cat', name: 'Cat', cr: '0', type: 'Beast' }),
    makeMonster({ id: 'wolf', name: 'Wolf', cr: '1/4', type: 'Beast' }),
    makeMonster({ id: 'brown-bear', name: 'Brown Bear', cr: '1', type: 'Beast', size: 'Large' }),
    makeMonster({
      id: 'giant-eagle',
      name: 'Giant Eagle',
      cr: '1',
      type: 'Beast',
      size: 'Large',
      speed: { walk: 10, fly: 80 }
    }),
    makeMonster({
      id: 'reef-shark',
      name: 'Reef Shark',
      cr: '1/2',
      type: 'Beast',
      speed: { walk: 0, swim: 40 }
    }),
    makeMonster({ id: 'goblin', name: 'Goblin', cr: '1/4', type: 'Humanoid' })
  ]

  // D&D Wild Shape tiers:
  // Level 2: CR 0.25, no fly, no swim
  // Level 4: CR 0.5, no fly, swim OK
  // Level 8: CR 1, fly OK, swim OK

  it('returns CR 0 beasts for druid level 1 (maxCR defaults to 0, no fly/swim)', () => {
    // At level 1, no wild shape tier matches so maxCR stays at 0.
    // CR 0 beasts without fly/swim still pass the filter.
    const result = getWildShapeEligibleBeasts(1, beasts)
    const names = result.map((m) => m.name)
    expect(names).toEqual(['Cat'])
  })

  it('at level 2, only beasts CR <= 1/4, no fly, no swim-only', () => {
    const result = getWildShapeEligibleBeasts(2, beasts)
    const names = result.map((m) => m.name)
    expect(names).toContain('Cat')
    expect(names).toContain('Wolf')
    expect(names).not.toContain('Brown Bear') // CR 1
    expect(names).not.toContain('Giant Eagle') // fly
    expect(names).not.toContain('Reef Shark') // swim-only
  })

  it('at level 4, allows CR <= 1/2 and swimming forms', () => {
    const result = getWildShapeEligibleBeasts(4, beasts)
    const names = result.map((m) => m.name)
    expect(names).toContain('Cat')
    expect(names).toContain('Wolf')
    expect(names).toContain('Reef Shark') // swim OK at L4
    expect(names).not.toContain('Brown Bear') // CR 1 > 0.5
    expect(names).not.toContain('Giant Eagle') // fly still not OK
  })

  it('at level 8, allows CR <= 1 including flying and swimming', () => {
    const result = getWildShapeEligibleBeasts(8, beasts)
    const names = result.map((m) => m.name)
    expect(names).toContain('Cat')
    expect(names).toContain('Wolf')
    expect(names).toContain('Brown Bear')
    expect(names).toContain('Giant Eagle')
    expect(names).toContain('Reef Shark')
  })

  it('filters out non-Beast creatures', () => {
    const result = getWildShapeEligibleBeasts(8, beasts)
    const names = result.map((m) => m.name)
    expect(names).not.toContain('Goblin') // Humanoid, not Beast
  })

  it('sorts by CR descending, then name ascending', () => {
    const result = getWildShapeEligibleBeasts(8, beasts)
    // CR 1: Brown Bear, Giant Eagle; CR 0.5: Reef Shark; CR 0.25: Wolf; CR 0: Cat
    expect(result[0].cr).toBe('1')
    expect(result[result.length - 1].cr).toBe('0')
  })

  it('returns empty for an empty monster list', () => {
    expect(getWildShapeEligibleBeasts(8, [])).toEqual([])
  })
})

describe('getFamiliarForms', () => {
  const monsters: MonsterStatBlock[] = [
    makeMonster({ id: 'cat', name: 'Cat' }),
    makeMonster({ id: 'owl', name: 'Owl' }),
    makeMonster({ id: 'rat', name: 'Rat' }),
    makeMonster({ id: 'imp', name: 'Imp' }),
    makeMonster({ id: 'pseudodragon', name: 'Pseudodragon' }),
    makeMonster({ id: 'goblin', name: 'Goblin' })
  ]

  it('returns standard familiar forms without Chain Pact', () => {
    const result = getFamiliarForms(monsters, false)
    const names = result.map((m) => m.name)
    expect(names).toContain('Cat')
    expect(names).toContain('Owl')
    expect(names).toContain('Rat')
    expect(names).not.toContain('Imp') // Chain Pact only
    expect(names).not.toContain('Pseudodragon') // Chain Pact only
    expect(names).not.toContain('Goblin') // not a familiar form
  })

  it('includes Chain Pact forms when hasChainPact is true', () => {
    const result = getFamiliarForms(monsters, true)
    const names = result.map((m) => m.name)
    expect(names).toContain('Cat')
    expect(names).toContain('Imp')
    expect(names).toContain('Pseudodragon')
  })

  it('sorts familiar forms alphabetically by name', () => {
    const result = getFamiliarForms(monsters, true)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].name.localeCompare(result[i - 1].name)).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns empty for empty monster list', () => {
    expect(getFamiliarForms([], false)).toEqual([])
  })
})

describe('getSteedForms', () => {
  const monsters: MonsterStatBlock[] = [
    makeMonster({ id: 'warhorse', name: 'Warhorse', size: 'Large' }),
    makeMonster({ id: 'pony', name: 'Pony', size: 'Medium' }),
    makeMonster({ id: 'camel', name: 'Camel', size: 'Large' }),
    makeMonster({ id: 'goblin', name: 'Goblin' })
  ]

  it('returns only steed forms', () => {
    const result = getSteedForms(monsters)
    const names = result.map((m) => m.name)
    expect(names).toContain('Warhorse')
    expect(names).toContain('Pony')
    expect(names).toContain('Camel')
    expect(names).not.toContain('Goblin')
  })

  it('sorts alphabetically by name', () => {
    const result = getSteedForms(monsters)
    for (let i = 1; i < result.length; i++) {
      expect(result[i].name.localeCompare(result[i - 1].name)).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns empty for empty monster list', () => {
    expect(getSteedForms([])).toEqual([])
  })
})

describe('createCompanionToken', () => {
  const statBlock = makeMonster({
    id: 'owl',
    name: 'Owl',
    size: 'Tiny',
    ac: 11,
    speed: { walk: 5, fly: 60 },
    abilityScores: { str: 3, dex: 13, con: 8, int: 2, wis: 12, cha: 7 },
    senses: {
      darkvision: 120,
      passivePerception: 13
    },
    resistances: [],
    vulnerabilities: [],
    damageImmunities: []
  })

  const companion = makeCompanion({
    id: 'familiar-owl',
    name: 'Hedwig',
    currentHP: 5,
    maxHP: 5,
    ownerId: 'char-wizard-1',
    sourceSpell: 'find-familiar'
  })

  it('creates a token with correct entity info', () => {
    const token = createCompanionToken(companion, statBlock, 5, 10)
    expect(token.entityId).toBe('familiar-owl')
    expect(token.entityType).toBe('npc')
    expect(token.label).toBe('Hedwig')
  })

  it('places token at specified grid coordinates', () => {
    const token = createCompanionToken(companion, statBlock, 5, 10)
    expect(token.gridX).toBe(5)
    expect(token.gridY).toBe(10)
  })

  it('sets HP from companion data', () => {
    const token = createCompanionToken(companion, statBlock, 0, 0)
    expect(token.currentHP).toBe(5)
    expect(token.maxHP).toBe(5)
  })

  it('sets AC from stat block', () => {
    const token = createCompanionToken(companion, statBlock, 0, 0)
    expect(token.ac).toBe(11)
  })

  it('sets size dimensions from stat block size (Tiny = 1x1)', () => {
    const token = createCompanionToken(companion, statBlock, 0, 0)
    expect(token.sizeX).toBe(1)
    expect(token.sizeY).toBe(1)
  })

  it('sets Large companion to 2x2 token size', () => {
    const largeStatBlock = makeMonster({ size: 'Large' })
    const token = createCompanionToken(companion, largeStatBlock, 0, 0)
    expect(token.sizeX).toBe(2)
    expect(token.sizeY).toBe(2)
  })

  it('calculates initiative modifier from DEX score', () => {
    // DEX 13 → modifier = floor((13-10)/2) = 1
    const token = createCompanionToken(companion, statBlock, 0, 0)
    expect(token.initiativeModifier).toBe(1)
  })

  it('sets speed values from stat block', () => {
    const token = createCompanionToken(companion, statBlock, 0, 0)
    expect(token.walkSpeed).toBe(5)
    expect(token.flySpeed).toBe(60)
  })

  it('detects darkvision from senses', () => {
    const token = createCompanionToken(companion, statBlock, 0, 0)
    expect(token.darkvision).toBe(true)
    expect(token.darkvisionRange).toBe(120)
  })

  it('sets ownerEntityId from companion ownerId', () => {
    const token = createCompanionToken(companion, statBlock, 0, 0)
    expect(token.ownerEntityId).toBe('char-wizard-1')
  })

  it('sets companionType from companion type', () => {
    const token = createCompanionToken(companion, statBlock, 0, 0)
    expect(token.companionType).toBe('familiar')
  })

  it('sets sourceSpell from companion', () => {
    const token = createCompanionToken(companion, statBlock, 0, 0)
    expect(token.sourceSpell).toBe('find-familiar')
  })

  it('sets visibleToPlayers to true', () => {
    const token = createCompanionToken(companion, statBlock, 0, 0)
    expect(token.visibleToPlayers).toBe(true)
  })

  it('initializes conditions as empty array', () => {
    const token = createCompanionToken(companion, statBlock, 0, 0)
    expect(token.conditions).toEqual([])
  })

  it('handles stat block with blindsight special sense', () => {
    const blindStatBlock = makeMonster({
      senses: { blindsight: 30, passivePerception: 12 }
    })
    const token = createCompanionToken(companion, blindStatBlock, 0, 0)
    expect(token.specialSenses).toEqual([{ type: 'blindsight', range: 30 }])
  })

  it('handles stat block with no special senses', () => {
    const basicStatBlock = makeMonster({
      senses: { passivePerception: 10 }
    })
    const token = createCompanionToken(companion, basicStatBlock, 0, 0)
    expect(token.specialSenses).toEqual([])
  })

  it('handles stat block without ability scores (initiative defaults to 0)', () => {
    const noAbilityStatBlock = makeMonster({ abilityScores: undefined as any })
    const token = createCompanionToken(companion, noAbilityStatBlock, 0, 0)
    expect(token.initiativeModifier).toBe(0)
  })
})
