import { describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({
  useState: vi.fn(() => [null, vi.fn()]),
  useEffect: vi.fn(),
  useCallback: vi.fn((fn) => fn),
  useMemo: vi.fn((fn) => fn()),
  useRef: vi.fn(() => ({ current: null }))
}))

vi.mock('../stores/use-game-store', () => ({
  useGameStore: Object.assign(
    vi.fn(() => ({
      allies: [],
      addSidebarEntry: vi.fn()
    })),
    {
      getState: vi.fn(() => ({
        allies: [],
        addSidebarEntry: vi.fn(),
        updateToken: vi.fn(),
        maps: [],
        activeMapId: null
      }))
    }
  )
}))

vi.mock('../stores/use-ai-dm-store', () => ({
  useAiDmStore: Object.assign(
    vi.fn(() => ({
      messages: [],
      isTyping: false,
      paused: false,
      setupListeners: vi.fn(() => vi.fn()),
      initFromCampaign: vi.fn(),
      sendMessage: vi.fn()
    })),
    {
      getState: vi.fn(() => ({ messages: [], sceneStatus: null, setScene: vi.fn() })),
      setState: vi.fn()
    }
  )
}))

vi.mock('../stores/use-lobby-store', () => ({
  useLobbyStore: Object.assign(
    vi.fn(() => ({})),
    {
      getState: vi.fn(() => ({ players: [], chatMessages: [] }))
    }
  )
}))

vi.mock('../network/game-sync', () => ({
  startGameSync: vi.fn(),
  stopGameSync: vi.fn()
}))

vi.mock('../services/io/game-auto-save', () => ({
  loadPersistedGameState: vi.fn(),
  startAutoSave: vi.fn(),
  stopAutoSave: vi.fn()
}))

vi.mock('../services/sound-manager', () => ({
  init: vi.fn()
}))

describe('useGameEffects', () => {
  it('can be imported', async () => {
    const mod = await import('./use-game-effects')
    expect(mod).toBeDefined()
  })

  it('exports useGameEffects as a named function', async () => {
    const mod = await import('./use-game-effects')
    expect(typeof mod.useGameEffects).toBe('function')
  })
})
