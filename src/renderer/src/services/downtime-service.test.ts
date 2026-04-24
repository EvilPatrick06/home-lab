import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Campaign, DowntimeProgressEntry } from '../types/campaign'
import {
  addDowntimeProgress,
  advanceDowntime,
  advanceTrackedDowntime,
  calculateDowntimeCost,
  type DowntimeActivity,
  type DowntimeProgress,
  getActiveDowntimeForCharacter,
  removeDowntimeProgress,
  rollComplication,
  startDowntime,
  updateDowntimeProgress
} from './downtime-service'

// Mock data-provider
vi.mock('./data-provider', () => ({
  load5eDowntime: vi.fn(() => Promise.resolve([])),
  loadJson: vi.fn(() => Promise.resolve({}))
}))

beforeEach(() => {
  vi.clearAllMocks()
})

function makeActivity(overrides?: Partial<DowntimeActivity>): DowntimeActivity {
  return {
    id: 'training',
    name: 'Training',
    description: 'Train a new skill',
    daysRequired: 10,
    goldCostPerDay: 25,
    requirements: [],
    outcome: 'Gain proficiency',
    reference: 'PHB Ch.8',
    ...overrides
  }
}

function makeProgress(overrides?: Partial<DowntimeProgress>): DowntimeProgress {
  return {
    activityId: 'training',
    characterId: 'char-1',
    characterName: 'Aragorn',
    daysSpent: 0,
    daysRequired: 10,
    goldSpent: 0,
    goldRequired: 250,
    startedAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  }
}

function makeCampaign(overrides?: Partial<Campaign>): Campaign {
  return {
    id: 'camp-1',
    name: 'Test Campaign',
    description: 'A test',
    system: '5e' as never,
    type: 'custom',
    dmId: 'dm-1',
    inviteCode: 'ABC123',
    turnMode: 'free',
    maps: [],
    npcs: [],
    players: [],
    customRules: [],
    settings: {
      maxPlayers: 6,
      lobbyMessage: '',
      levelRange: { min: 1, max: 20 },
      allowCharCreationInLobby: true
    },
    journal: { entries: [] } as never,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  } as Campaign
}

function makeDowntimeEntry(overrides?: Partial<DowntimeProgressEntry>): DowntimeProgressEntry {
  return {
    id: 'dt-1',
    activityId: 'training',
    activityName: 'Training',
    characterId: 'char-1',
    characterName: 'Aragorn',
    daysSpent: 0,
    daysRequired: 10,
    goldSpent: 0,
    goldRequired: 250,
    startedAt: '2024-01-01T00:00:00.000Z',
    status: 'in-progress',
    ...overrides
  }
}

describe('downtime-service', () => {
  describe('calculateDowntimeCost', () => {
    it('calculates standard per-day cost', () => {
      const activity = makeActivity({ goldCostPerDay: 25 })
      const result = calculateDowntimeCost(activity, 5)
      expect(result.days).toBe(5)
      expect(result.goldCost).toBe(125)
    })

    it('uses rarity table when rarity option is provided', () => {
      const activity = makeActivity({
        rarityTable: [
          { rarity: 'common', days: 5, goldCost: 50, minLevel: 1 },
          { rarity: 'rare', days: 20, goldCost: 2000, minLevel: 5 }
        ]
      })
      const result = calculateDowntimeCost(activity, 10, { rarity: 'rare' })
      expect(result.days).toBe(20)
      expect(result.goldCost).toBe(2000)
    })

    it('uses spell level table when spellLevel option is provided', () => {
      const activity = makeActivity({
        spellLevelTable: [
          { level: 1, days: 1, goldCost: 25 },
          { level: 3, days: 5, goldCost: 250 }
        ]
      })
      const result = calculateDowntimeCost(activity, 10, { spellLevel: 3 })
      expect(result.days).toBe(5)
      expect(result.goldCost).toBe(250)
    })

    it('uses potion table when potionType option is provided', () => {
      const activity = makeActivity({
        potionTable: [
          { type: 'healing', days: 1, goldCost: 25, heals: '2d4+2' },
          { type: 'greater-healing', days: 3, goldCost: 100, heals: '4d4+4' }
        ]
      })
      const result = calculateDowntimeCost(activity, 10, { potionType: 'healing' })
      expect(result.days).toBe(1)
      expect(result.goldCost).toBe(25)
    })

    it('falls back to standard cost when no matching rarity found', () => {
      const activity = makeActivity({
        goldCostPerDay: 10,
        rarityTable: [{ rarity: 'common', days: 5, goldCost: 50, minLevel: 1 }]
      })
      const result = calculateDowntimeCost(activity, 3, { rarity: 'legendary' })
      expect(result.days).toBe(3)
      expect(result.goldCost).toBe(30)
    })
  })

  describe('startDowntime', () => {
    it('creates a progress tracker with zero spent values', () => {
      const activity = makeActivity()
      const progress = startDowntime(activity, 'char-1', 'Aragorn', 10, 250, 'Some details')
      expect(progress.activityId).toBe('training')
      expect(progress.characterId).toBe('char-1')
      expect(progress.characterName).toBe('Aragorn')
      expect(progress.daysSpent).toBe(0)
      expect(progress.goldSpent).toBe(0)
      expect(progress.daysRequired).toBe(10)
      expect(progress.goldRequired).toBe(250)
      expect(progress.details).toBe('Some details')
      expect(progress.startedAt).toBeTruthy()
    })

    it('creates progress without optional details', () => {
      const activity = makeActivity()
      const progress = startDowntime(activity, 'char-1', 'Aragorn', 5, 100)
      expect(progress.details).toBeUndefined()
    })
  })

  describe('advanceDowntime', () => {
    it('advances days and gold proportionally', () => {
      const progress = makeProgress({ daysRequired: 10, goldRequired: 100 })
      const result = advanceDowntime(progress, 3)
      expect(result.progress.daysSpent).toBe(3)
      expect(result.progress.goldSpent).toBe(30)
      expect(result.complete).toBe(false)
      expect(result.goldPerDay).toBe(10)
    })

    it('marks complete when days reach requirement', () => {
      const progress = makeProgress({ daysSpent: 8, daysRequired: 10, goldSpent: 200, goldRequired: 250 })
      const result = advanceDowntime(progress, 5)
      expect(result.progress.daysSpent).toBe(10)
      expect(result.complete).toBe(true)
    })

    it('caps days and gold at requirements', () => {
      const progress = makeProgress({ daysRequired: 5, goldRequired: 50 })
      const result = advanceDowntime(progress, 100)
      expect(result.progress.daysSpent).toBe(5)
      expect(result.progress.goldSpent).toBe(50)
    })

    it('handles zero gold cost', () => {
      const progress = makeProgress({ goldRequired: 0 })
      const result = advanceDowntime(progress, 3)
      expect(result.goldPerDay).toBe(0)
      expect(result.progress.goldSpent).toBe(0)
    })
  })

  describe('rollComplication', () => {
    it('returns a result from the complication table', () => {
      const tables = {
        tables: {
          carousing: [
            { min: 1, max: 5, result: 'Nothing happens' },
            { min: 6, max: 10, result: 'You made a friend' }
          ]
        }
      }
      // Roll many times to cover both entries
      const results = new Set<string>()
      for (let i = 0; i < 100; i++) {
        const entry = rollComplication(tables, 'carousing')
        if (entry) results.add(entry.result)
      }
      expect(results.size).toBeGreaterThanOrEqual(1)
    })

    it('returns null for non-existent table', () => {
      const tables = { tables: {} }
      expect(rollComplication(tables, 'nonexistent')).toBeNull()
    })

    it('returns null for empty table', () => {
      const tables = { tables: { empty: [] } }
      expect(rollComplication(tables, 'empty')).toBeNull()
    })
  })

  describe('campaign progress helpers', () => {
    describe('addDowntimeProgress', () => {
      it('adds an entry to the campaign downtimeProgress array', () => {
        const campaign = makeCampaign({ downtimeProgress: [] })
        const entry = makeDowntimeEntry()
        const updated = addDowntimeProgress(campaign, entry)
        expect(updated.downtimeProgress).toHaveLength(1)
        expect(updated.downtimeProgress![0].id).toBe('dt-1')
        expect(updated.updatedAt).not.toBe(campaign.updatedAt)
      })

      it('handles campaign with undefined downtimeProgress', () => {
        const campaign = makeCampaign({ downtimeProgress: undefined })
        const entry = makeDowntimeEntry()
        const updated = addDowntimeProgress(campaign, entry)
        expect(updated.downtimeProgress).toHaveLength(1)
      })
    })

    describe('updateDowntimeProgress', () => {
      it('updates an existing entry by id', () => {
        const campaign = makeCampaign({
          downtimeProgress: [makeDowntimeEntry({ id: 'dt-1', daysSpent: 3 })]
        })
        const updated = updateDowntimeProgress(campaign, 'dt-1', { daysSpent: 7 })
        expect(updated.downtimeProgress![0].daysSpent).toBe(7)
      })

      it('does not modify entries with different ids', () => {
        const campaign = makeCampaign({
          downtimeProgress: [
            makeDowntimeEntry({ id: 'dt-1', daysSpent: 3 }),
            makeDowntimeEntry({ id: 'dt-2', daysSpent: 5 })
          ]
        })
        const updated = updateDowntimeProgress(campaign, 'dt-1', { daysSpent: 10 })
        expect(updated.downtimeProgress![0].daysSpent).toBe(10)
        expect(updated.downtimeProgress![1].daysSpent).toBe(5)
      })
    })

    describe('removeDowntimeProgress', () => {
      it('removes an entry by id', () => {
        const campaign = makeCampaign({
          downtimeProgress: [makeDowntimeEntry({ id: 'dt-1' }), makeDowntimeEntry({ id: 'dt-2' })]
        })
        const updated = removeDowntimeProgress(campaign, 'dt-1')
        expect(updated.downtimeProgress).toHaveLength(1)
        expect(updated.downtimeProgress![0].id).toBe('dt-2')
      })
    })

    describe('getActiveDowntimeForCharacter', () => {
      it('returns only in-progress entries for the given character', () => {
        const campaign = makeCampaign({
          downtimeProgress: [
            makeDowntimeEntry({ id: 'dt-1', characterId: 'char-1', status: 'in-progress' }),
            makeDowntimeEntry({ id: 'dt-2', characterId: 'char-1', status: 'completed' }),
            makeDowntimeEntry({ id: 'dt-3', characterId: 'char-2', status: 'in-progress' })
          ]
        })
        const active = getActiveDowntimeForCharacter(campaign, 'char-1')
        expect(active).toHaveLength(1)
        expect(active[0].id).toBe('dt-1')
      })

      it('returns empty array when no active entries exist', () => {
        const campaign = makeCampaign({ downtimeProgress: [] })
        expect(getActiveDowntimeForCharacter(campaign, 'char-1')).toEqual([])
      })
    })

    describe('advanceTrackedDowntime', () => {
      it('advances an entry and returns updated campaign', () => {
        const campaign = makeCampaign({
          downtimeProgress: [
            makeDowntimeEntry({ id: 'dt-1', daysSpent: 0, daysRequired: 10, goldSpent: 0, goldRequired: 100 })
          ]
        })
        const result = advanceTrackedDowntime(campaign, 'dt-1', 5)
        expect(result.complete).toBe(false)
        expect(result.campaign.downtimeProgress![0].daysSpent).toBe(5)
      })

      it('marks entry as completed when days reach requirement', () => {
        const campaign = makeCampaign({
          downtimeProgress: [
            makeDowntimeEntry({ id: 'dt-1', daysSpent: 8, daysRequired: 10, goldSpent: 80, goldRequired: 100 })
          ]
        })
        const result = advanceTrackedDowntime(campaign, 'dt-1', 5)
        expect(result.complete).toBe(true)
        expect(result.campaign.downtimeProgress![0].status).toBe('completed')
      })

      it('returns unchanged campaign when entry not found', () => {
        const campaign = makeCampaign({ downtimeProgress: [] })
        const result = advanceTrackedDowntime(campaign, 'nonexistent', 5)
        expect(result.complete).toBe(false)
        expect(result.campaign).toBe(campaign)
      })
    })
  })
})
