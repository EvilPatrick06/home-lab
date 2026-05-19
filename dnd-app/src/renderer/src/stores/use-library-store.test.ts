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

describe('useLibraryStore (data)', () => {
  it('can be imported', async () => {
    const mod = await import('./use-library-store')
    expect(mod).toBeDefined()
  })

  it('exports the store hook', () => {
    expect(typeof useLibraryStore).toBe('function')
  })

  it('has expected initial state shape (data-only after Phase 15a Step 6 spinout)', () => {
    const state = useLibraryStore.getState()
    expect(state).toHaveProperty('items')
    expect(state).toHaveProperty('homebrewEntries')
    expect(state).toHaveProperty('loading')
    expect(state).toHaveProperty('homebrewLoaded')
  })

  it('UI state has been moved to useLibraryUiStore', () => {
    const state = useLibraryStore.getState() as unknown as Record<string, unknown>
    expect(state.selectedCategory).toBeUndefined()
    expect(state.searchQuery).toBeUndefined()
    expect(state.recentlyViewed).toBeUndefined()
    expect(state.favorites).toBeUndefined()
    expect(state.setCategory).toBeUndefined()
    expect(state.setSearchQuery).toBeUndefined()
    expect(state.toggleFavorite).toBeUndefined()
  })

  it('has expected initial values', () => {
    const state = useLibraryStore.getState()
    expect(state.items).toEqual([])
    expect(state.homebrewEntries).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.homebrewLoaded).toBe(false)
  })

  it('has expected data actions', () => {
    const state = useLibraryStore.getState()
    expect(typeof state.setItems).toBe('function')
    expect(typeof state.setLoading).toBe('function')
    expect(typeof state.loadHomebrew).toBe('function')
    expect(typeof state.saveHomebrewEntry).toBe('function')
    expect(typeof state.deleteHomebrewEntry).toBe('function')
  })
})
