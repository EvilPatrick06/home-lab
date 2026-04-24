import { describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({
  useState: vi.fn(() => [null, vi.fn()]),
  useEffect: vi.fn(),
  useCallback: vi.fn((fn) => fn),
  useMemo: vi.fn((fn) => fn()),
  useRef: vi.fn(() => ({ current: null }))
}))

vi.mock('react-router', () => ({
  useNavigate: vi.fn(() => vi.fn())
}))

vi.mock('../stores/use-game-store', () => ({
  useGameStore: Object.assign(
    vi.fn(() => ({
      restTracking: null,
      inGameTime: null,
      initiative: null,
      advanceTimeSeconds: vi.fn(),
      setRestTracking: vi.fn(),
      addLogEntry: vi.fn(),
      checkExpiredSources: vi.fn(() => []),
      revealFog: vi.fn(),
      hideFog: vi.fn(),
      setDashing: vi.fn(),
      setDisengaging: vi.fn(),
      setDodging: vi.fn(),
      setHidden: vi.fn(),
      useAction: vi.fn(),
      addToken: vi.fn(),
      updateToken: vi.fn(),
      addToInitiative: vi.fn(),
      initTurnState: vi.fn(),
      reset: vi.fn()
    })),
    {
      getState: vi.fn(() => ({}))
    }
  )
}))

vi.mock('../stores/use-character-store', () => ({
  useCharacterStore: Object.assign(
    vi.fn(() => ({})),
    {
      getState: vi.fn(() => ({ characters: [], saveCharacter: vi.fn() }))
    }
  )
}))

vi.mock('../stores/use-ai-dm-store', () => ({
  useAiDmStore: Object.assign(
    vi.fn(() => ({})),
    {
      getState: vi.fn(() => ({ reset: vi.fn() }))
    }
  )
}))

vi.mock('../stores/use-network-store', () => ({
  useNetworkStore: Object.assign(
    vi.fn(() => ({})),
    {
      getState: vi.fn(() => ({ disconnect: vi.fn() }))
    }
  )
}))

vi.mock('../stores/use-lobby-store', () => ({
  useLobbyStore: Object.assign(
    vi.fn(() => ({})),
    {
      getState: vi.fn(() => ({ remoteCharacters: {}, reset: vi.fn() }))
    }
  )
}))

vi.mock('../services/data-provider', () => ({
  load5eMonsterById: vi.fn()
}))

vi.mock('../services/io/game-auto-save', () => ({
  flushAutoSave: vi.fn()
}))

vi.mock('../services/io/game-state-saver', () => ({
  saveGameState: vi.fn()
}))

vi.mock('../services/character/companion-service', () => ({
  createCompanionToken: vi.fn()
}))

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

vi.mock('../types/character', () => ({
  is5eCharacter: vi.fn(() => false)
}))

describe('useGameHandlers', () => {
  it('can be imported', async () => {
    const mod = await import('./use-game-handlers')
    expect(mod).toBeDefined()
  })

  it('exports useGameHandlers as a named function', async () => {
    const mod = await import('./use-game-handlers')
    expect(typeof mod.useGameHandlers).toBe('function')
  })
})
