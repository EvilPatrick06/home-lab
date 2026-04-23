import { describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({
  useState: vi.fn((initial) => [initial, vi.fn()]),
  useEffect: vi.fn(),
  useCallback: vi.fn((fn) => fn),
  useMemo: vi.fn((fn) => fn()),
  useRef: vi.fn(() => ({ current: null }))
}))

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }
}))

describe('useEquipmentData', () => {
  it('can be imported', async () => {
    const mod = await import('./use-equipment-data')
    expect(mod).toBeDefined()
  })

  it('exports useEquipmentData as a named function', async () => {
    const mod = await import('./use-equipment-data')
    expect(typeof mod.useEquipmentData).toBe('function')
  })

  it('returns the initial value when called', async () => {
    const mod = await import('./use-equipment-data')
    const result = mod.useEquipmentData(() => Promise.resolve(['sword']), [])
    expect(result).toEqual([])
  })
})
