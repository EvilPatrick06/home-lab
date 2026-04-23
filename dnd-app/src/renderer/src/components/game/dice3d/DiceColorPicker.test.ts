import { describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({
  default: { createElement: vi.fn(), memo: vi.fn((c) => c), forwardRef: vi.fn((c) => c), lazy: vi.fn() },
  useState: vi.fn(() => [false, vi.fn()]),
  useEffect: vi.fn(),
  useCallback: vi.fn((fn) => fn),
  useMemo: vi.fn((fn) => fn()),
  useRef: vi.fn(() => ({ current: null })),
  memo: vi.fn((c) => c),
  forwardRef: vi.fn((c) => c),
  createContext: vi.fn(() => ({ Provider: vi.fn() }))
}))

vi.mock('.', () => ({
  DEFAULT_DICE_COLORS: { bodyColor: '#1a1a2e', numberColor: '#e0e0e0' },
  DICE_COLOR_PRESETS: []
}))

describe('DiceColorPicker', () => {
  it('can be imported', async () => {
    const mod = await import('./DiceColorPicker')
    expect(mod).toBeDefined()
  })

  it('exports a default function', async () => {
    const mod = await import('./DiceColorPicker')
    expect(typeof mod.default).toBe('function')
  })
})
