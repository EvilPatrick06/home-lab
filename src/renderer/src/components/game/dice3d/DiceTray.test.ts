import { describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({
  default: { createElement: vi.fn(), memo: vi.fn((c) => c), forwardRef: vi.fn((c) => c), lazy: vi.fn() },
  useState: vi.fn(() => [[], vi.fn()]),
  useEffect: vi.fn(),
  useCallback: vi.fn((fn) => fn),
  useMemo: vi.fn((fn) => fn()),
  useRef: vi.fn(() => ({ current: null })),
  memo: vi.fn((c) => c),
  forwardRef: vi.fn((c) => c),
  createContext: vi.fn(() => ({ Provider: vi.fn() }))
}))

vi.mock('./DiceOverlay', () => ({
  onDiceTrayUpdate: vi.fn(() => vi.fn())
}))

describe('DiceTray', () => {
  it('can be imported', async () => {
    const mod = await import('./DiceTray')
    expect(mod).toBeDefined()
  })

  it('exports a default function', async () => {
    const mod = await import('./DiceTray')
    expect(typeof mod.default).toBe('function')
  })
})
