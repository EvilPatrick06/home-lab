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
  lazy: vi.fn(() => vi.fn()),
  Suspense: vi.fn(),
  createContext: vi.fn(() => ({ Provider: vi.fn() }))
}))

vi.mock('../../../../public/data/5e/game/mechanics/dice-types.json', () => ({
  default: [
    { sides: 4, label: 'd4' },
    { sides: 6, label: 'd6' },
    { sides: 8, label: 'd8' },
    { sides: 10, label: 'd10' },
    { sides: 12, label: 'd12' },
    { sides: 20, label: 'd20' },
    { sides: 100, label: 'd100' }
  ]
}))

vi.mock('../../../services/dice/dice-engine', () => ({
  parseDiceFormula: vi.fn(),
  rollDice: vi.fn(() => [10])
}))

vi.mock('../../../services/sound-manager', () => ({
  play: vi.fn(),
  playDiceSound: vi.fn()
}))

vi.mock('./DiceResult', () => ({ default: vi.fn() }))
vi.mock('./DiceHistory', () => ({ default: vi.fn() }))

describe('DiceRoller', () => {
  it('can be imported', async () => {
    const mod = await import('./DiceRoller')
    expect(mod).toBeDefined()
  })

  it('exports a default function', async () => {
    const mod = await import('./DiceRoller')
    expect(typeof mod.default).toBe('function')
  })
})
