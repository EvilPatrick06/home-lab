import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./broadcast-utils', () => ({ postDmMessage: vi.fn() }))
vi.mock('./name-resolver', () => ({ resolveCharacterIdByName: vi.fn(() => 'char-1') }))

// The campaign store is mocked to hold a single in-memory campaign.
let campaign: { id: string; downtimeProgress?: unknown[] } | null = null
const saveCampaign = vi.fn((c: typeof campaign) => {
  campaign = c
  return Promise.resolve()
})
vi.mock('../../stores/use-campaign-store', () => ({
  useCampaignStore: {
    getState: () => ({ getActiveCampaign: () => campaign, saveCampaign })
  }
}))

vi.stubGlobal('crypto', { randomUUID: () => 'dt-uuid-1234' })

import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

const gs = {} as GameStoreSnapshot
const map = undefined as ActiveMap
const stores = {} as StoreAccessors

describe('downtime-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    campaign = { id: 'camp-1', downtimeProgress: [] }
  })

  describe('executeStartDowntime', () => {
    it('adds a new in-progress downtime entry and saves', async () => {
      const { executeStartDowntime } = await import('./downtime-actions')
      const action: DmAction = {
        action: 'start_downtime',
        characterName: 'Aria',
        activityId: 'crafting',
        activityName: 'Crafting a Longsword',
        daysRequired: 7,
        goldRequired: 15
      }
      expect(executeStartDowntime(action, gs, map, stores)).toBe(true)
      expect(saveCampaign).toHaveBeenCalledTimes(1)
      const saved = saveCampaign.mock.calls[0][0]
      expect(saved?.downtimeProgress).toHaveLength(1)
      expect(saved?.downtimeProgress?.[0]).toMatchObject({
        activityName: 'Crafting a Longsword',
        characterName: 'Aria',
        characterId: 'char-1',
        daysSpent: 0,
        daysRequired: 7,
        goldRequired: 15,
        status: 'in-progress'
      })
    })

    it('throws without an active campaign', async () => {
      const { executeStartDowntime } = await import('./downtime-actions')
      campaign = null
      expect(() =>
        executeStartDowntime(
          { action: 'start_downtime', characterName: 'Aria', activityId: 'x', activityName: 'X', daysRequired: 1 },
          gs,
          map,
          stores
        )
      ).toThrow('No active campaign')
    })
  })

  describe('executeAdvanceDowntime', () => {
    beforeEach(() => {
      campaign = {
        id: 'camp-1',
        downtimeProgress: [
          {
            id: 'e1',
            activityId: 'crafting',
            activityName: 'Crafting a Longsword',
            characterId: 'char-1',
            characterName: 'Aria',
            daysSpent: 3,
            daysRequired: 7,
            goldSpent: 0,
            goldRequired: 0,
            startedAt: '2026-01-01',
            status: 'in-progress'
          }
        ]
      }
    })

    it('advances the matching entry and persists progress', async () => {
      const { executeAdvanceDowntime } = await import('./downtime-actions')
      executeAdvanceDowntime({ action: 'advance_downtime', characterName: 'Aria', days: 2 }, gs, map, stores)
      const saved = saveCampaign.mock.calls[0][0] as { downtimeProgress: Array<{ daysSpent: number; status: string }> }
      expect(saved.downtimeProgress[0].daysSpent).toBe(5)
      expect(saved.downtimeProgress[0].status).toBe('in-progress')
    })

    it('marks the entry completed when it reaches its day requirement', async () => {
      const { executeAdvanceDowntime } = await import('./downtime-actions')
      executeAdvanceDowntime({ action: 'advance_downtime', characterName: 'Aria', days: 10 }, gs, map, stores)
      const saved = saveCampaign.mock.calls[0][0] as { downtimeProgress: Array<{ daysSpent: number; status: string }> }
      expect(saved.downtimeProgress[0].daysSpent).toBe(7)
      expect(saved.downtimeProgress[0].status).toBe('completed')
    })

    it('throws when the character has no matching in-progress activity', async () => {
      const { executeAdvanceDowntime } = await import('./downtime-actions')
      expect(() =>
        executeAdvanceDowntime({ action: 'advance_downtime', characterName: 'Nobody', days: 1 }, gs, map, stores)
      ).toThrow('No in-progress downtime')
    })
  })
})
