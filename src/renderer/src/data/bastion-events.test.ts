import { describe, expect, it, vi } from 'vitest'

const dataJson = vi.hoisted(() => {
  const { readFileSync: readSync } = require('fs')
  const { resolve: resolvePath } = require('path')
  return JSON.parse(readSync(resolvePath(__dirname, '../../public/data/5e/bastions/bastion-events.json'), 'utf-8'))
})

vi.mock('../services/data-provider', () => ({
  load5eBastionEvents: vi.fn(() => Promise.resolve(dataJson))
}))

import { resolveAttackEvent, rollBastionEvent, rollD, rollD100, rollND } from './bastion-events'

describe('Dice Helpers', () => {
  it('rollD returns a number between 1 and n inclusive', () => {
    for (let i = 0; i < 100; i++) {
      const result = rollD(6)
      expect(result).toBeGreaterThanOrEqual(1)
      expect(result).toBeLessThanOrEqual(6)
    }
  })

  it('rollD(1) always returns 1', () => {
    for (let i = 0; i < 20; i++) {
      expect(rollD(1)).toBe(1)
    }
  })

  it('rollND returns an array of the correct length', () => {
    const results = rollND(4, 6)
    expect(results).toHaveLength(4)
    for (const r of results) {
      expect(r).toBeGreaterThanOrEqual(1)
      expect(r).toBeLessThanOrEqual(6)
    }
  })

  it('rollND(0, 6) returns an empty array', () => {
    expect(rollND(0, 6)).toEqual([])
  })

  it('rollD100 returns a number between 1 and 100', () => {
    for (let i = 0; i < 100; i++) {
      const result = rollD100()
      expect(result).toBeGreaterThanOrEqual(1)
      expect(result).toBeLessThanOrEqual(100)
    }
  })
})

describe('Bastion Events JSON — 2024 PHB accuracy', () => {
  it('allIsWellFlavors has 8 entries with roll 1-8', () => {
    expect(dataJson.allIsWellFlavors).toHaveLength(8)
    for (let i = 0; i < 8; i++) {
      expect(dataJson.allIsWellFlavors[i].roll).toBe(i + 1)
      expect(typeof dataJson.allIsWellFlavors[i].flavor).toBe('string')
    }
  })

  it('guestTable has 4 entries with roll 1-4', () => {
    expect(dataJson.guestTable).toHaveLength(4)
    const guestTypes = dataJson.guestTable.map((g: { guestType: string }) => g.guestType)
    expect(guestTypes).toContain('Renowned Individual')
    expect(guestTypes).toContain('Sanctuary Seeker')
    expect(guestTypes).toContain('Mercenary')
    expect(guestTypes).toContain('Friendly Monster')
  })

  it('eventsTable covers the full d100 range (1-100)', () => {
    const table = dataJson.eventsTable as { min: number; max: number; eventType: string }[]
    expect(table.length).toBeGreaterThan(0)

    // First entry starts at 1
    expect(table[0].min).toBe(1)

    // Last entry ends at 100
    expect(table[table.length - 1].max).toBe(100)

    // No gaps between entries
    for (let i = 1; i < table.length; i++) {
      expect(table[i].min).toBe(table[i - 1].max + 1)
    }
  })

  it('eventsTable includes all expected event types', () => {
    const types = (dataJson.eventsTable as { eventType: string }[]).map((e) => e.eventType)
    expect(types).toContain('all-is-well')
    expect(types).toContain('attack')
    expect(types).toContain('criminal-hireling')
    expect(types).toContain('extraordinary-opportunity')
    expect(types).toContain('friendly-visitors')
    expect(types).toContain('guest')
    expect(types).toContain('lost-hirelings')
    expect(types).toContain('magical-discovery')
    expect(types).toContain('refugees')
    expect(types).toContain('request-for-aid')
    expect(types).toContain('treasure')
  })

  it('All Is Well covers 50% of the d100 table (1-50)', () => {
    const allIsWell = dataJson.eventsTable.find((e: { eventType: string }) => e.eventType === 'all-is-well')
    expect(allIsWell.min).toBe(1)
    expect(allIsWell.max).toBe(50)
  })

  it('treasureTable covers the full d100 range', () => {
    const table = dataJson.treasureTable as { min: number; max: number }[]
    expect(table[0].min).toBe(1)
    expect(table[table.length - 1].max).toBe(100)
    for (let i = 1; i < table.length; i++) {
      expect(table[i].min).toBe(table[i - 1].max + 1)
    }
  })

  it('gamingHallWinnings covers the full d100 range', () => {
    const table = dataJson.gamingHallWinnings as { min: number; max: number }[]
    expect(table[0].min).toBe(1)
    expect(table[table.length - 1].max).toBe(100)
  })

  it('menagerieCreatures all have required fields', () => {
    for (const creature of dataJson.menagerieCreatures) {
      expect(typeof creature.name).toBe('string')
      expect(typeof creature.creatureType).toBe('string')
      expect(['tiny', 'small', 'medium', 'large', 'huge']).toContain(creature.size)
      expect(typeof creature.cost).toBe('number')
      expect(creature.cost).toBeGreaterThan(0)
      expect(typeof creature.cr).toBe('string')
    }
  })

  it('creatureCostsByCr has entries with ascending costs', () => {
    const costs = dataJson.creatureCostsByCr as { cr: string; cost: number }[]
    expect(costs.length).toBeGreaterThan(0)
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i].cost).toBeGreaterThanOrEqual(costs[i - 1].cost)
    }
  })

  it('expertTrainers has 5 trainer types', () => {
    const trainers = dataJson.expertTrainers as { type: string }[]
    expect(trainers).toHaveLength(5)
    const types = trainers.map((t) => t.type)
    expect(types).toContain('battle')
    expect(types).toContain('skills')
    expect(types).toContain('tools')
    expect(types).toContain('unarmed-combat')
    expect(types).toContain('weapon')
  })

  it('pubSpecials all have name, description, and effect', () => {
    expect(dataJson.pubSpecials.length).toBeGreaterThan(0)
    for (const special of dataJson.pubSpecials) {
      expect(typeof special.name).toBe('string')
      expect(typeof special.description).toBe('string')
      expect(typeof special.effect).toBe('string')
    }
  })

  it('sampleGuilds all have guildType and description', () => {
    expect(dataJson.sampleGuilds.length).toBeGreaterThan(0)
    for (const guild of dataJson.sampleGuilds) {
      expect(typeof guild.guildType).toBe('string')
      expect(typeof guild.description).toBe('string')
    }
  })

  it('forgeConstructs all have required fields with valid values', () => {
    const constructs = dataJson.forgeConstructs as {
      name: string
      cr: string
      costGP: number
      timeDays: number
      description: string
    }[]
    expect(constructs.length).toBeGreaterThan(0)
    for (const c of constructs) {
      expect(typeof c.name).toBe('string')
      expect(typeof c.cr).toBe('string')
      expect(c.costGP).toBeGreaterThan(0)
      expect(c.timeDays).toBeGreaterThan(0)
      expect(typeof c.description).toBe('string')
    }
  })
})

describe('rollBastionEvent', () => {
  it('returns a BastionEventResult with required fields', () => {
    const result = rollBastionEvent()
    expect(typeof result.eventType).toBe('string')
    expect(typeof result.description).toBe('string')
    expect(result.description.length).toBeGreaterThan(0)
    expect(typeof result.roll).toBe('number')
    expect(result.roll).toBeGreaterThanOrEqual(1)
    expect(result.roll).toBeLessThanOrEqual(100)
    expect(typeof result.subRolls).toBe('object')
  })
})

describe('resolveAttackEvent', () => {
  it('returns facilityShutdown true when defenderCount is 0', () => {
    const result = resolveAttackEvent(0, false, false)
    expect(result.facilityShutdown).toBe(true)
    expect(result.description).toContain('no defenders')
  })

  it('uses 4 dice when hasWalls is true (reduced from 6)', () => {
    const result = resolveAttackEvent(10, false, true)
    expect(result.attackDice).toHaveLength(4)
  })

  it('uses 6 dice when hasWalls is false', () => {
    const result = resolveAttackEvent(10, false, false)
    expect(result.attackDice).toHaveLength(6)
  })

  it('defenders lost does not exceed defender count', () => {
    const result = resolveAttackEvent(1, false, false)
    expect(result.defendersLost).toBeLessThanOrEqual(1)
  })

  it('uses d8s instead of d6s when hasArmory is true', () => {
    // Run many times to statistically verify d8 range
    let sawAbove6 = false
    for (let i = 0; i < 200; i++) {
      const result = resolveAttackEvent(10, true, false)
      for (const die of result.attackDice) {
        if (die > 6) sawAbove6 = true
      }
    }
    expect(sawAbove6).toBe(true)
  })
})
