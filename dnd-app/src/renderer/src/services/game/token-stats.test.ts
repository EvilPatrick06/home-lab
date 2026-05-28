import { describe, expect, it } from 'vitest'
import type { MapToken } from '../../types/map'
import type { MonsterStatBlock } from '../../types/monster'
import { resolveTokenStats } from './token-stats'

function makeToken(overrides: Partial<MapToken> = {}): MapToken {
  return {
    id: 't1',
    entityId: 'e1',
    entityType: 'enemy',
    label: 'Goblin',
    gridX: 0,
    gridY: 0,
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    conditions: [],
    ...overrides
  }
}

function makeMonster(overrides: Partial<MonsterStatBlock> = {}): MonsterStatBlock {
  return {
    id: 'goblin',
    name: 'Goblin',
    size: 'Small',
    type: 'humanoid',
    alignment: 'neutral evil',
    ac: 15,
    hp: 7,
    speed: { walk: 30 },
    abilityScores: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
    senses: { darkvision: 60, passivePerception: 9 },
    languages: [],
    cr: '1/4',
    xp: 50,
    proficiencyBonus: 2,
    traits: [],
    actions: [],
    ...overrides
  } as MonsterStatBlock
}

describe('resolveTokenStats', () => {
  it('resolves base stats live from the library monster when the token has no inline overrides', () => {
    const stats = resolveTokenStats(makeToken({ monsterStatBlockId: 'goblin' }), makeMonster())
    expect(stats.libraryBacked).toBe(true)
    expect(stats.maxHP).toBe(7)
    expect(stats.ac).toBe(15)
    expect(stats.walkSpeed).toBe(30)
    expect(stats.cr).toBe('1/4')
    expect(stats.darkvision).toBe(true)
    expect(stats.darkvisionRange).toBe(60)
  })

  it('a library rebalance propagates (different monster, no inline override)', () => {
    const token = makeToken({ monsterStatBlockId: 'goblin' })
    expect(resolveTokenStats(token, makeMonster({ hp: 7, ac: 15 })).maxHP).toBe(7)
    // DM rebalances the source monster in the library:
    const rebalanced = resolveTokenStats(token, makeMonster({ hp: 99, ac: 20 }))
    expect(rebalanced.maxHP).toBe(99)
    expect(rebalanced.ac).toBe(20)
  })

  it('inline token fields override the library value (per-instance customization)', () => {
    const stats = resolveTokenStats(makeToken({ monsterStatBlockId: 'goblin', maxHP: 50, ac: 18 }), makeMonster())
    expect(stats.maxHP).toBe(50)
    expect(stats.ac).toBe(18)
    // unoverridden fields still come from the library
    expect(stats.walkSpeed).toBe(30)
  })

  it('falls back to inline fields for tokens with no library backing (player/custom/summon)', () => {
    const stats = resolveTokenStats(makeToken({ maxHP: 24, ac: 16, walkSpeed: 25 }), undefined)
    expect(stats.libraryBacked).toBe(false)
    expect(stats.maxHP).toBe(24)
    expect(stats.ac).toBe(16)
    expect(stats.walkSpeed).toBe(25)
    expect(stats.cr).toBeUndefined()
  })
})
