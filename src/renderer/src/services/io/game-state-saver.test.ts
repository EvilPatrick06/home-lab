import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock game store
vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      initiative: null,
      round: 1,
      conditions: [],
      turnStates: {},
      isPaused: false,
      underwaterCombat: false,
      ambientLight: 'bright',
      travelPace: null,
      marchingOrder: [],
      allies: [],
      enemies: [],
      places: [],
      inGameTime: null,
      restTracking: {},
      activeLightSources: [],
      handouts: [],
      combatTimer: null,
      maps: [{ id: 'map-1', name: 'Cave' }],
      activeMapId: 'map-1'
    }))
  }
}))

// Mock campaign store
vi.mock('../../stores/use-campaign-store', () => ({
  useCampaignStore: {
    getState: vi.fn(() => ({
      saveCampaign: vi.fn()
    }))
  }
}))

import type { Campaign } from '../../types/campaign'

describe('game-state-saver', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('buildSavableCampaign', () => {
    it('merges game state onto campaign object', async () => {
      const { buildSavableCampaign } = await import('./game-state-saver')
      const campaign = {
        id: 'camp-1',
        name: 'Test Campaign',
        maps: [],
        updatedAt: '2024-01-01T00:00:00.000Z'
      } as unknown as Campaign

      const result = buildSavableCampaign(campaign)

      expect(result.id).toBe('camp-1')
      expect(result.name).toBe('Test Campaign')
      expect(result.maps).toEqual([{ id: 'map-1', name: 'Cave' }])
      expect(result.activeMapId).toBe('map-1')
      expect(result.savedGameState).toBeDefined()
      expect(result.savedGameState?.round).toBe(1)
      expect(result.savedGameState?.conditions).toEqual([])
      expect(result.updatedAt).not.toBe('2024-01-01T00:00:00.000Z')
    })

    it('preserves original campaign properties not touched by game state', async () => {
      const { buildSavableCampaign } = await import('./game-state-saver')
      const campaign = {
        id: 'camp-2',
        name: 'Original Name',
        description: 'A test description',
        maps: [],
        updatedAt: '2024-01-01'
      } as unknown as Campaign

      const result = buildSavableCampaign(campaign)
      expect(result.description).toBe('A test description')
    })

    it('includes savedGameState fields from game store', async () => {
      const { useGameStore } = await import('../../stores/use-game-store')
      vi.mocked(useGameStore.getState).mockReturnValue({
        initiative: { entries: [], currentIndex: 0 },
        round: 5,
        conditions: [{ id: 'c1', condition: 'Poisoned' }],
        turnStates: { e1: { movement: 30 } },
        isPaused: true,
        underwaterCombat: true,
        ambientLight: 'dim',
        travelPace: 'slow',
        marchingOrder: ['a', 'b'],
        allies: [{ id: 'a1', name: 'Ally' }],
        enemies: [{ id: 'e1', name: 'Enemy' }],
        places: [{ id: 'p1', name: 'Tavern' }],
        inGameTime: { totalSeconds: 3600 },
        restTracking: { lastLongRest: 0 },
        activeLightSources: [{ id: 'ls1' }],
        handouts: [],
        combatTimer: { seconds: 30 },
        maps: [],
        activeMapId: null
      } as never)

      const { buildSavableCampaign } = await import('./game-state-saver')
      const campaign = { id: 'c1', maps: [] } as unknown as Campaign
      const result = buildSavableCampaign(campaign)

      expect(result.savedGameState?.round).toBe(5)
      expect(result.savedGameState?.isPaused).toBe(true)
      expect(result.savedGameState?.underwaterCombat).toBe(true)
      expect(result.savedGameState?.ambientLight).toBe('dim')
      expect(result.savedGameState?.travelPace).toBe('slow')
    })
  })

  describe('saveGameState', () => {
    it('builds savable campaign and persists via campaign store', async () => {
      const { useCampaignStore } = await import('../../stores/use-campaign-store')
      const saveCampaign = vi.fn()
      vi.mocked(useCampaignStore.getState).mockReturnValue({ saveCampaign } as never)

      const { saveGameState } = await import('./game-state-saver')
      const campaign = { id: 'c1', name: 'Test', maps: [] } as unknown as Campaign

      await saveGameState(campaign)
      expect(saveCampaign).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }))
    })
  })
})
