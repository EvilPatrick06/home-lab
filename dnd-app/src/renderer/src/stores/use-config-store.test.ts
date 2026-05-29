import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', {
  api: {
    storage: {},
    game: {},
    loadAllHomebrew: vi.fn().mockResolvedValue([]),
    plugins: {
      scan: vi.fn().mockResolvedValue({ success: true, data: [] }),
      loadContent: vi.fn().mockResolvedValue({ success: true, data: {} })
    }
  }
})

import { useConfigStore } from './use-config-store'

describe('useConfigStore', () => {
  it('can be imported', async () => {
    const mod = await import('./use-config-store')
    expect(mod).toBeDefined()
  })

  it('exports the store hook', () => {
    expect(typeof useConfigStore).toBe('function')
  })

  it('has expected initial state shape', () => {
    const state = useConfigStore.getState()
    expect(state).toHaveProperty('cache')
    expect(state).toHaveProperty('homebrewByCategory')
    expect(state).toHaveProperty('homebrewLoaded')
    expect(state).toHaveProperty('pluginDataByCategory')
    expect(state).toHaveProperty('pluginsLoaded')
  })

  it('has expected initial state values', () => {
    const state = useConfigStore.getState()
    expect(state.cache).toBeInstanceOf(Map)
    expect(state.cache.size).toBe(0)
    expect(state.homebrewByCategory).toBeInstanceOf(Map)
    expect(state.homebrewByCategory.size).toBe(0)
    expect(state.homebrewLoaded).toBe(false)
    expect(state.pluginDataByCategory).toBeInstanceOf(Map)
    expect(state.pluginDataByCategory.size).toBe(0)
    expect(state.pluginsLoaded).toBe(false)
  })

  it('has expected actions', () => {
    const state = useConfigStore.getState()
    expect(typeof state.loadHomebrew).toBe('function')
    expect(typeof state.loadPluginContent).toBe('function')
    expect(typeof state.get).toBe('function')
    expect(typeof state.refresh).toBe('function')
    expect(typeof state.clearAll).toBe('function')
  })
})
