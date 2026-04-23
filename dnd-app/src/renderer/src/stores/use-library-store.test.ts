import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('window', {
  api: {
    storage: {},
    game: {},
    loadAllHomebrew: vi.fn().mockResolvedValue([]),
    saveHomebrew: vi.fn().mockResolvedValue({ success: true }),
    deleteHomebrew: vi.fn().mockResolvedValue({ success: true })
  }
})

import { useLibraryStore } from './use-library-store'

describe('useLibraryStore', () => {
  it('can be imported', async () => {
    const mod = await import('./use-library-store')
    expect(mod).toBeDefined()
  })

  it('exports the store hook', () => {
    expect(typeof useLibraryStore).toBe('function')
  })

  it('has expected initial state shape', () => {
    const state = useLibraryStore.getState()
    expect(state).toHaveProperty('selectedCategory')
    expect(state).toHaveProperty('searchQuery')
    expect(state).toHaveProperty('items')
    expect(state).toHaveProperty('homebrewEntries')
    expect(state).toHaveProperty('loading')
    expect(state).toHaveProperty('homebrewLoaded')
  })

  it('has expected initial state values', () => {
    const state = useLibraryStore.getState()
    expect(state.selectedCategory).toBeNull()
    expect(state.searchQuery).toBe('')
    expect(state.items).toEqual([])
    expect(state.homebrewEntries).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.homebrewLoaded).toBe(false)
  })

  it('has expected actions', () => {
    const state = useLibraryStore.getState()
    expect(typeof state.setCategory).toBe('function')
    expect(typeof state.setSearchQuery).toBe('function')
    expect(typeof state.setItems).toBe('function')
    expect(typeof state.setLoading).toBe('function')
    expect(typeof state.loadHomebrew).toBe('function')
    expect(typeof state.saveHomebrewEntry).toBe('function')
    expect(typeof state.deleteHomebrewEntry).toBe('function')
  })
})
