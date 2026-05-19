import { beforeEach, describe, expect, it } from 'vitest'
import { useLibraryUiStore } from './use-library-ui-store'

beforeEach(() => {
  useLibraryUiStore.setState({
    selectedCategory: null,
    searchQuery: '',
    recentlyViewed: [],
    favorites: new Set()
  })
})

describe('useLibraryUiStore', () => {
  it('exports the store hook', () => {
    expect(typeof useLibraryUiStore).toBe('function')
  })

  it('has expected initial UI state shape', () => {
    const state = useLibraryUiStore.getState()
    expect(state).toHaveProperty('selectedCategory')
    expect(state).toHaveProperty('searchQuery')
    expect(state).toHaveProperty('recentlyViewed')
    expect(state).toHaveProperty('favorites')
  })

  it('setCategory updates the selected category', () => {
    useLibraryUiStore.getState().setCategory('spells')
    expect(useLibraryUiStore.getState().selectedCategory).toBe('spells')
  })

  it('setSearchQuery updates the query', () => {
    useLibraryUiStore.getState().setSearchQuery('fire')
    expect(useLibraryUiStore.getState().searchQuery).toBe('fire')
  })

  it('toggleFavorite adds then removes an id', () => {
    const { toggleFavorite, isFavorite } = useLibraryUiStore.getState()
    expect(isFavorite('fireball')).toBe(false)
    toggleFavorite('fireball')
    expect(useLibraryUiStore.getState().isFavorite('fireball')).toBe(true)
    useLibraryUiStore.getState().toggleFavorite('fireball')
    expect(useLibraryUiStore.getState().isFavorite('fireball')).toBe(false)
  })

  it('addToRecentlyViewed prepends and caps at 20', () => {
    const { addToRecentlyViewed } = useLibraryUiStore.getState()
    for (let i = 0; i < 25; i++) {
      addToRecentlyViewed({
        id: `item-${i}`,
        name: `Item ${i}`,
        category: 'spells',
        source: 'official',
        summary: '',
        data: {}
      })
    }
    const recent = useLibraryUiStore.getState().recentlyViewed
    expect(recent.length).toBe(20)
    expect(recent[0].id).toBe('item-24')
  })

  it('addToRecentlyViewed dedupes by id (moves to front)', () => {
    const { addToRecentlyViewed } = useLibraryUiStore.getState()
    const a = { id: 'a', name: 'A', category: 'spells' as const, source: 'official' as const, summary: '', data: {} }
    const b = { id: 'b', name: 'B', category: 'spells' as const, source: 'official' as const, summary: '', data: {} }
    addToRecentlyViewed(a)
    addToRecentlyViewed(b)
    addToRecentlyViewed(a)
    const recent = useLibraryUiStore.getState().recentlyViewed
    expect(recent.length).toBe(2)
    expect(recent[0].id).toBe('a')
    expect(recent[1].id).toBe('b')
  })

  it('clearRecentlyViewed empties the list', () => {
    const { addToRecentlyViewed, clearRecentlyViewed } = useLibraryUiStore.getState()
    addToRecentlyViewed({
      id: 'x',
      name: 'X',
      category: 'spells',
      source: 'official',
      summary: '',
      data: {}
    })
    expect(useLibraryUiStore.getState().recentlyViewed.length).toBe(1)
    clearRecentlyViewed()
    expect(useLibraryUiStore.getState().recentlyViewed).toEqual([])
  })
})
