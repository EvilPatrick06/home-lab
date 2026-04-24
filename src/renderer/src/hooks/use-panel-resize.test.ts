import { describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({
  useState: vi.fn((initial) => [initial, vi.fn()]),
  useEffect: vi.fn(),
  useCallback: vi.fn((fn) => fn),
  useMemo: vi.fn((fn) => fn()),
  useRef: vi.fn((initial) => ({ current: initial }))
}))

describe('usePanelResize', () => {
  it('can be imported', async () => {
    const mod = await import('./use-panel-resize')
    expect(mod).toBeDefined()
  })

  it('exports usePanelResize as a named function', async () => {
    const mod = await import('./use-panel-resize')
    expect(typeof mod.usePanelResize).toBe('function')
  })

  it('returns an object with expected properties', async () => {
    const mod = await import('./use-panel-resize')
    const result = mod.usePanelResize()
    expect(result).toHaveProperty('bottomBarHeight')
    expect(result).toHaveProperty('bottomCollapsed')
    expect(result).toHaveProperty('setBottomCollapsed')
    expect(result).toHaveProperty('sidebarWidth')
    expect(result).toHaveProperty('sidebarCollapsed')
    expect(result).toHaveProperty('setSidebarCollapsed')
    expect(typeof result.handleBottomResize).toBe('function')
    expect(typeof result.handleBottomDoubleClick).toBe('function')
    expect(typeof result.handleSidebarResize).toBe('function')
    expect(typeof result.handleSidebarDoubleClick).toBe('function')
  })
})
