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
    vi.fn(() => ({})),
    {
      getState: vi.fn(() => ({
        openShop: vi.fn(),
        setShopInventory: vi.fn(),
        closeShop: vi.fn(),
        startTimer: vi.fn(),
        stopTimer: vi.fn(),
        setInGameTime: vi.fn(),
        maps: [],
        activeMapId: null
      }))
    }
  )
}))

vi.mock('../stores/use-ai-dm-store', () => ({
  useAiDmStore: Object.assign(
    vi.fn(() => ({
      paused: false,
      sendMessage: vi.fn()
    })),
    {
      getState: vi.fn(() => ({ paused: false })),
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

vi.mock('../network/client-manager', () => ({
  onMessage: vi.fn(() => vi.fn())
}))

vi.mock('../network/host-manager', () => ({
  onMessage: vi.fn(() => vi.fn())
}))

vi.mock('../components/game/dice3d', () => ({
  trigger3dDice: vi.fn()
}))

vi.mock('../services/sound-manager', () => ({
  play: vi.fn(),
  playAmbient: vi.fn(),
  stopAmbient: vi.fn(),
  setAmbientVolume: vi.fn()
}))

describe('useGameNetwork', () => {
  it('can be imported', async () => {
    const mod = await import('./use-game-network')
    expect(mod).toBeDefined()
  })

  it('exports useGameNetwork as a named function', async () => {
    const mod = await import('./use-game-network')
    expect(typeof mod.useGameNetwork).toBe('function')
  })
})
