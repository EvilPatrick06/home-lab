import { describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({
  useState: vi.fn(() => [null, vi.fn()]),
  useEffect: vi.fn(),
  useCallback: vi.fn((fn) => fn),
  useMemo: vi.fn((fn) => fn()),
  useRef: vi.fn(() => ({ current: null })),
  useSyncExternalStore: vi.fn(() => [])
}))

describe('useToast', () => {
  it('can be imported', async () => {
    const mod = await import('./use-toast')
    expect(mod).toBeDefined()
  })

  it('exports useToast as a named function', async () => {
    const mod = await import('./use-toast')
    expect(typeof mod.useToast).toBe('function')
  })

  it('exports addToast as a named function', async () => {
    const mod = await import('./use-toast')
    expect(typeof mod.addToast).toBe('function')
  })

  it('exports dismissToast as a named function', async () => {
    const mod = await import('./use-toast')
    expect(typeof mod.dismissToast).toBe('function')
  })
})
