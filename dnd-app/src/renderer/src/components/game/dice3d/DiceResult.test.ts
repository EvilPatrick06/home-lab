import { describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({
  default: { createElement: vi.fn(), memo: vi.fn((c) => c), forwardRef: vi.fn((c) => c), lazy: vi.fn() },
  useState: vi.fn(() => [null, vi.fn()]),
  useEffect: vi.fn(),
  useCallback: vi.fn((fn) => fn),
  useMemo: vi.fn((fn) => fn()),
  useRef: vi.fn(() => ({ current: null })),
  memo: vi.fn((c) => c),
  forwardRef: vi.fn((c) => c),
  createContext: vi.fn(() => ({ Provider: vi.fn() }))
}))

describe('DiceResult', () => {
  it('can be imported', async () => {
    const mod = await import('./DiceResult')
    expect(mod).toBeDefined()
  })

  it('exports a default function', async () => {
    const mod = await import('./DiceResult')
    expect(typeof mod.default).toBe('function')
  })
})
