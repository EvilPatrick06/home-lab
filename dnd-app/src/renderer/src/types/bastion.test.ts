import { describe, expect, it } from 'vitest'
import { createDefaultBastion, getBpPerTurn, migrateBastion, SPECIAL_FACILITY_COSTS } from './bastion'

describe('getBpPerTurn', () => {
  it('returns 0 for levels below 5', () => {
    expect(getBpPerTurn(1)).toBe(0)
    expect(getBpPerTurn(4)).toBe(0)
  })

  it('returns 2 for levels 5-8', () => {
    expect(getBpPerTurn(5)).toBe(2)
    expect(getBpPerTurn(8)).toBe(2)
  })

  it('returns 4 for levels 9-12', () => {
    expect(getBpPerTurn(9)).toBe(4)
    expect(getBpPerTurn(12)).toBe(4)
  })

  it('returns 6 for levels 13-16', () => {
    expect(getBpPerTurn(13)).toBe(6)
    expect(getBpPerTurn(16)).toBe(6)
  })

  it('returns 8 for levels 17+', () => {
    expect(getBpPerTurn(17)).toBe(8)
    expect(getBpPerTurn(20)).toBe(8)
  })
})

describe('SPECIAL_FACILITY_COSTS', () => {
  it('has bp values at all levels', () => {
    expect(SPECIAL_FACILITY_COSTS[5].bp).toBe(2)
    expect(SPECIAL_FACILITY_COSTS[9].bp).toBe(4)
    expect(SPECIAL_FACILITY_COSTS[13].bp).toBe(6)
    expect(SPECIAL_FACILITY_COSTS[17].bp).toBe(8)
  })

  it('retains gp and days fields', () => {
    for (const level of [5, 9, 13, 17]) {
      expect(SPECIAL_FACILITY_COSTS[level]).toHaveProperty('gp')
      expect(SPECIAL_FACILITY_COSTS[level]).toHaveProperty('days')
    }
  })
})

describe('createDefaultBastion', () => {
  it('includes bastionPoints, factionRenown, and activeCharms', () => {
    const bastion = createDefaultBastion('owner1', 'Test Castle')
    expect(bastion.bastionPoints).toBe(0)
    expect(bastion.factionRenown).toEqual({})
    expect(bastion.activeCharms).toEqual([])
  })
})

describe('migrateBastion', () => {
  it('adds bastionPoints, factionRenown, activeCharms to new-format bastion missing them', () => {
    const raw = {
      id: 'b1',
      name: 'Castle',
      ownerId: 'o1',
      campaignId: null,
      basicFacilities: [],
      specialFacilities: [],
      defenders: [],
      turns: [],
      defensiveWalls: null,
      construction: [],
      treasury: 100,
      inGameTime: { currentDay: 1, lastBastionTurnDay: 0, turnFrequencyDays: 7 },
      notes: '',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    }
    const migrated = migrateBastion(raw as Record<string, unknown>)
    expect(migrated.bastionPoints).toBe(0)
    expect(migrated.factionRenown).toEqual({})
    expect(migrated.activeCharms).toEqual([])
  })

  it('preserves existing bastionPoints on new-format bastion', () => {
    const raw = {
      id: 'b1',
      name: 'Castle',
      ownerId: 'o1',
      campaignId: null,
      basicFacilities: [],
      specialFacilities: [],
      defenders: [],
      turns: [],
      defensiveWalls: null,
      construction: [],
      treasury: 100,
      bastionPoints: 42,
      factionRenown: { harpers: 3 },
      activeCharms: [{ name: 'Test', description: 'x', facilityId: 'f1', grantedOnDay: 1, durationDays: 30 }],
      inGameTime: { currentDay: 1, lastBastionTurnDay: 0, turnFrequencyDays: 7 },
      notes: '',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    }
    const migrated = migrateBastion(raw as Record<string, unknown>)
    expect(migrated.bastionPoints).toBe(42)
    expect(migrated.factionRenown).toEqual({ harpers: 3 })
    expect(migrated.activeCharms).toHaveLength(1)
  })

  it('adds new fields to old-format bastion', () => {
    const raw = {
      id: 'old1',
      name: 'Old Keep',
      ownerId: 'o1',
      campaignId: null,
      level: 5,
      rooms: [],
      hirelings: [],
      events: [],
      gold: 50,
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01'
    }
    const migrated = migrateBastion(raw as Record<string, unknown>)
    expect(migrated.bastionPoints).toBe(0)
    expect(migrated.factionRenown).toEqual({})
    expect(migrated.activeCharms).toEqual([])
  })
})
