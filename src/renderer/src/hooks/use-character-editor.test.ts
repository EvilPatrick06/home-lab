import { describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({
  useState: vi.fn(() => [null, vi.fn()]),
  useEffect: vi.fn(),
  useCallback: vi.fn((fn) => fn),
  useMemo: vi.fn((fn) => fn()),
  useRef: vi.fn(() => ({ current: null }))
}))

vi.mock('../stores/use-character-store', () => ({
  useCharacterStore: Object.assign(
    vi.fn(() => ({})),
    {
      getState: vi.fn(() => ({ characters: [], saveCharacter: vi.fn() }))
    }
  )
}))

vi.mock('../stores/use-network-store', () => ({
  useNetworkStore: Object.assign(
    vi.fn(() => ({})),
    {
      getState: vi.fn(() => ({ role: 'none', sendMessage: vi.fn() }))
    }
  )
}))

vi.mock('../stores/use-lobby-store', () => ({
  useLobbyStore: Object.assign(
    vi.fn(() => ({})),
    {
      getState: vi.fn(() => ({ setRemoteCharacter: vi.fn() }))
    }
  )
}))

describe('useCharacterEditor', () => {
  it('can be imported', async () => {
    const mod = await import('./use-character-editor')
    expect(mod).toBeDefined()
  })

  it('exports useCharacterEditor as a named function', async () => {
    const mod = await import('./use-character-editor')
    expect(typeof mod.useCharacterEditor).toBe('function')
  })

  it('returns an object with getLatest, broadcastIfDM, and saveAndBroadcast', async () => {
    const mod = await import('./use-character-editor')
    const result = mod.useCharacterEditor('test-id')
    expect(typeof result.getLatest).toBe('function')
    expect(typeof result.broadcastIfDM).toBe('function')
    expect(typeof result.saveAndBroadcast).toBe('function')
  })
})
