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

vi.mock('./DiceRenderer', () => ({
  default: vi.fn()
}))

vi.mock('./dice-meshes', () => ({
  DEFAULT_DICE_COLORS: { bodyColor: '#1a1a2e', numberColor: '#e0e0e0' }
}))

describe('DiceOverlay', () => {
  it('can be imported', async () => {
    const mod = await import('./DiceOverlay')
    expect(mod).toBeDefined()
  })

  it('exports a default function', async () => {
    const mod = await import('./DiceOverlay')
    expect(typeof mod.default).toBe('function')
  })

  it('exports trigger3dDice function', async () => {
    const mod = await import('./DiceOverlay')
    expect(typeof mod.trigger3dDice).toBe('function')
  })

  it('exports onDiceTrayUpdate function', async () => {
    const mod = await import('./DiceOverlay')
    expect(typeof mod.onDiceTrayUpdate).toBe('function')
  })
})
