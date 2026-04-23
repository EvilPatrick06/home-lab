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
      subscribe: vi.fn(() => vi.fn()),
      getState: vi.fn(() => ({}))
    }
  )
}))

vi.mock('../stores/use-builder-store', () => ({
  useBuilderStore: Object.assign(
    vi.fn(() => ({})),
    {
      getState: vi.fn(() => ({
        phase: 'idle',
        characterName: '',
        gameSystem: null,
        abilityScores: {}
      }))
    }
  )
}))

vi.mock('../services/io/game-state-saver', () => ({
  saveGameState: vi.fn()
}))

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

vi.mock('./use-toast', () => ({
  addToast: vi.fn()
}))

describe('useAutoSaveGame', () => {
  it('can be imported', async () => {
    const mod = await import('./use-auto-save')
    expect(mod).toBeDefined()
  })

  it('exports useAutoSaveGame as a named function', async () => {
    const mod = await import('./use-auto-save')
    expect(typeof mod.useAutoSaveGame).toBe('function')
  })
})

describe('useAutoSaveBuilderDraft', () => {
  it('exports useAutoSaveBuilderDraft as a named function', async () => {
    const mod = await import('./use-auto-save')
    expect(typeof mod.useAutoSaveBuilderDraft).toBe('function')
  })
})

describe('saveBuilderDraft', () => {
  it('exports saveBuilderDraft as a named function', async () => {
    const mod = await import('./use-auto-save')
    expect(typeof mod.saveBuilderDraft).toBe('function')
  })
})

describe('loadBuilderDraft', () => {
  it('exports loadBuilderDraft as a named function', async () => {
    const mod = await import('./use-auto-save')
    expect(typeof mod.loadBuilderDraft).toBe('function')
  })
})

describe('clearBuilderDraft', () => {
  it('exports clearBuilderDraft as a named function', async () => {
    const mod = await import('./use-auto-save')
    expect(typeof mod.clearBuilderDraft).toBe('function')
  })
})
