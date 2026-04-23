import { describe, expect, it } from 'vitest'
import type { MonsterStatBlock } from '../../types/monster'
import { monsterToTokenData } from './monster-to-token'

function makeMonster(overrides: Partial<MonsterStatBlock> = {}): MonsterStatBlock {
  return {
    id: 'goblin',
    name: 'Goblin',
    size: 'Small',
    type: 'Humanoid',
    subtype: 'Goblinoid',
    alignment: 'Neutral Evil',
    ac: 15,
    acType: 'Leather Armor',
    hp: 7,
    hitDice: '2d6',
    speed: { walk: 30 },
    abilityScores: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    senses: { passivePerception: 9 },
    languages: ['Common', 'Goblin'],
    cr: '1/4',
    xp: 50,
    proficiencyBonus: 2,
    actions: [{ name: 'Scimitar', description: 'Melee attack.' }],
    tokenSize: { x: 1, y: 1 },
    ...overrides
  }
}

describe('monsterToTokenData', () => {
  it('converts a basic monster to token data', () => {
    const token = monsterToTokenData(makeMonster())
    expect(token.label).toBe('Goblin')
    expect(token.entityType).toBe('enemy')
    expect(token.currentHP).toBe(7)
    expect(token.maxHP).toBe(7)
    expect(token.ac).toBe(15)
    expect(token.walkSpeed).toBe(30)
    expect(token.sizeX).toBe(1)
    expect(token.sizeY).toBe(1)
    expect(token.visibleToPlayers).toBe(false)
    expect(token.conditions).toEqual([])
    expect(token.monsterStatBlockId).toBe('goblin')
    expect(token.specialSenses).toBeUndefined()
  })

  it('handles Large creature size (2x2)', () => {
    const token = monsterToTokenData(makeMonster({ size: 'Large', tokenSize: { x: 2, y: 2 } }))
    expect(token.sizeX).toBe(2)
    expect(token.sizeY).toBe(2)
  })

  it('handles Gargantuan creature size (4x4)', () => {
    const token = monsterToTokenData(makeMonster({ size: 'Gargantuan', tokenSize: { x: 4, y: 4 } }))
    expect(token.sizeX).toBe(4)
    expect(token.sizeY).toBe(4)
  })

  it('maps special senses', () => {
    const token = monsterToTokenData(
      makeMonster({
        senses: { blindsight: 30, darkvision: 60, truesight: 120, passivePerception: 14 }
      })
    )
    expect(token.darkvision).toBe(true)
    expect(token.darkvisionRange).toBe(60)
    expect(token.specialSenses).toEqual([
      { type: 'blindsight', range: 30 },
      { type: 'truesight', range: 120 }
    ])
  })

  it('maps tremorsense', () => {
    const token = monsterToTokenData(
      makeMonster({
        senses: { tremorsense: 60, passivePerception: 10 }
      })
    )
    expect(token.specialSenses).toEqual([{ type: 'tremorsense', range: 60 }])
  })

  it('maps resistances and immunities', () => {
    const token = monsterToTokenData(
      makeMonster({
        resistances: ['fire', 'cold'],
        vulnerabilities: ['radiant'],
        damageImmunities: ['poison']
      })
    )
    expect(token.resistances).toEqual(['fire', 'cold'])
    expect(token.vulnerabilities).toEqual(['radiant'])
    expect(token.immunities).toEqual(['poison'])
  })

  it('maps special speeds', () => {
    const token = monsterToTokenData(
      makeMonster({
        speed: { walk: 30, fly: 60, swim: 40, climb: 20 }
      })
    )
    expect(token.walkSpeed).toBe(30)
    expect(token.flySpeed).toBe(60)
    expect(token.swimSpeed).toBe(40)
    expect(token.climbSpeed).toBe(20)
  })

  it('maps initiative modifier', () => {
    const token = monsterToTokenData(
      makeMonster({
        initiative: { modifier: 4, score: 14 }
      })
    )
    expect(token.initiativeModifier).toBe(4)
  })

  it('generates a unique entityId', () => {
    const t1 = monsterToTokenData(makeMonster())
    const t2 = monsterToTokenData(makeMonster())
    expect(t1.entityId).toBeTruthy()
    expect(t2.entityId).toBeTruthy()
    expect(t1.entityId).not.toBe(t2.entityId)
  })
})
