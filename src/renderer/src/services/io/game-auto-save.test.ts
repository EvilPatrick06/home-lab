import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the game store
const subscribeFn = vi.fn(() => vi.fn()) // returns unsubscribe
vi.mock('../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      maps: [],
      activeMapId: null,
      initiative: null,
      round: 1,
      conditions: [],
      turnMode: 'individual',
      isPaused: false,
      turnStates: {},
      underwaterCombat: false,
      flankingEnabled: false,
      groupInitiativeEnabled: false,
      diagonalRule: '5-10-5',
      ambientLight: 'bright',
      travelPace: null,
      marchingOrder: [],
      allies: [],
      enemies: [],
      places: [],
      inGameTime: null,
      restTracking: {},
      activeLightSources: [],
      sessionLog: [],
      currentSessionId: null,
      currentSessionLabel: null,
      weatherOverride: null,
      moonOverride: null,
      savedWeatherPresets: [],
      handouts: [],
      combatTimer: null,
      shopInventory: [],
      shopName: '',
      shopMarkup: 1,
      loadGameState: vi.fn()
    })),
    subscribe: subscribeFn
  }
}))

// Mock logger
vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn()
  }
}))

// Mock window.api
vi.stubGlobal('window', {
  api: {
    saveGameState: vi.fn(() => Promise.resolve()),
    loadGameState: vi.fn(() => Promise.resolve(null))
  }
})

describe('game-auto-save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('exports expected public API', async () => {
    const mod = await import('./game-auto-save')
    expect(typeof mod.startAutoSave).toBe('function')
    expect(typeof mod.stopAutoSave).toBe('function')
    expect(typeof mod.flushAutoSave).toBe('function')
    expect(typeof mod.loadPersistedGameState).toBe('function')
  })

  describe('startAutoSave', () => {
    it('subscribes to game store changes', async () => {
      const { startAutoSave, stopAutoSave } = await import('./game-auto-save')
      startAutoSave('camp-1')
      expect(subscribeFn).toHaveBeenCalled()
      stopAutoSave()
    })

    it('stops previous auto-save before starting new one', async () => {
      const unsubscribe = vi.fn()
      subscribeFn.mockReturnValue(unsubscribe)

      const { startAutoSave, stopAutoSave } = await import('./game-auto-save')
      startAutoSave('camp-1')
      startAutoSave('camp-2')
      // First subscription should be unsubscribed
      expect(unsubscribe).toHaveBeenCalled()
      stopAutoSave()
    })
  })

  describe('stopAutoSave', () => {
    it('unsubscribes and clears state', async () => {
      const unsubscribe = vi.fn()
      subscribeFn.mockReturnValue(unsubscribe)

      const { startAutoSave, stopAutoSave } = await import('./game-auto-save')
      startAutoSave('camp-1')
      stopAutoSave()
      expect(unsubscribe).toHaveBeenCalled()
    })

    it('does nothing if not running', async () => {
      const { stopAutoSave } = await import('./game-auto-save')
      // Should not throw
      expect(() => stopAutoSave()).not.toThrow()
    })
  })

  describe('flushAutoSave', () => {
    it('saves game state immediately via window.api', async () => {
      const { flushAutoSave } = await import('./game-auto-save')
      await flushAutoSave('camp-1')
      expect(window.api.saveGameState).toHaveBeenCalledWith('camp-1', expect.any(Object))
    })

    it('handles save errors gracefully', async () => {
      vi.mocked(window.api.saveGameState).mockRejectedValueOnce(new Error('disk full'))
      const { flushAutoSave } = await import('./game-auto-save')
      // Should not throw
      await expect(flushAutoSave('camp-1')).resolves.not.toThrow()
    })
  })

  describe('loadPersistedGameState', () => {
    it('returns true and applies state when data exists', async () => {
      const mockData = { round: 5, maps: [] }
      vi.mocked(window.api.loadGameState).mockResolvedValueOnce(mockData)

      const { loadPersistedGameState } = await import('./game-auto-save')
      const result = await loadPersistedGameState('camp-1')
      expect(result).toBe(true)
      expect(window.api.loadGameState).toHaveBeenCalledWith('camp-1')
    })

    it('returns false when no data exists', async () => {
      vi.mocked(window.api.loadGameState).mockResolvedValueOnce(null)

      const { loadPersistedGameState } = await import('./game-auto-save')
      const result = await loadPersistedGameState('camp-1')
      expect(result).toBe(false)
    })

    it('returns false and logs error on failure', async () => {
      vi.mocked(window.api.loadGameState).mockRejectedValueOnce(new Error('read error'))

      const { loadPersistedGameState } = await import('./game-auto-save')
      const result = await loadPersistedGameState('camp-1')
      expect(result).toBe(false)
    })
  })
})
