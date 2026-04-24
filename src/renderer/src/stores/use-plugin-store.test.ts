import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', {
  api: {
    storage: {},
    game: {},
    plugins: {
      scan: vi.fn().mockResolvedValue({ success: true, data: [] }),
      enable: vi.fn().mockResolvedValue({ success: true }),
      disable: vi.fn().mockResolvedValue({ success: true }),
      loadContent: vi.fn().mockResolvedValue({ success: true, data: {} })
    }
  }
})

import { usePluginStore } from './use-plugin-store'

describe('usePluginStore', () => {
  it('can be imported', async () => {
    const mod = await import('./use-plugin-store')
    expect(mod).toBeDefined()
  })

  it('exports the store hook', () => {
    expect(typeof usePluginStore).toBe('function')
  })

  it('has expected initial state shape', () => {
    const state = usePluginStore.getState()
    expect(state).toHaveProperty('plugins')
    expect(state).toHaveProperty('initialized')
  })

  it('has expected initial state values', () => {
    const state = usePluginStore.getState()
    expect(state.plugins).toEqual([])
    expect(state.initialized).toBe(false)
  })

  it('has expected actions', () => {
    const state = usePluginStore.getState()
    expect(typeof state.initPlugins).toBe('function')
    expect(typeof state.enablePlugin).toBe('function')
    expect(typeof state.disablePlugin).toBe('function')
    expect(typeof state.refreshPluginList).toBe('function')
  })
})
