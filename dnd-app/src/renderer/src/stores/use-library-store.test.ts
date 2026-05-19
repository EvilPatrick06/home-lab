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

describe('useLibraryStore (truth-store API)', () => {
  it('exposes entries/sourceOf/cacheMeta/loaded buckets', () => {
    const state = useLibraryStore.getState()
    expect(state.entries).toBeTypeOf('object')
    expect(state.sourceOf).toBeTypeOf('object')
    expect(state.cacheMeta).toBeTypeOf('object')
    expect(state.loaded).toBeTypeOf('object')
  })

  it('exposes the planned read + load + homebrew/plugin methods', () => {
    const state = useLibraryStore.getState()
    expect(typeof state.getEntry).toBe('function')
    expect(typeof state.getEntries).toBe('function')
    expect(typeof state.loadCategory).toBe('function')
    expect(typeof state.refresh).toBe('function')
    expect(typeof state.clearAll).toBe('function')
    expect(typeof state.upsertHomebrew).toBe('function')
    expect(typeof state.deleteHomebrew).toBe('function')
    expect(typeof state.loadPluginContent).toBe('function')
  })

  it('getEntry returns null when entries are empty', () => {
    useLibraryStore.getState().clearAll()
    expect(useLibraryStore.getState().getEntry('spells', 'fireball')).toBeNull()
  })

  it('getEntries returns [] when entries are empty', () => {
    useLibraryStore.getState().clearAll()
    expect(useLibraryStore.getState().getEntries('spells')).toEqual([])
  })

  it('loadCategory populates entries + sourceOf + cacheMeta + loaded', async () => {
    useLibraryStore.getState().clearAll()
    const loader = () => [
      { id: 'fireball', name: 'Fireball', level: 3 },
      { id: 'magic-missile', name: 'Magic Missile', level: 1 }
    ]
    const out = await useLibraryStore.getState().loadCategory('spells', loader)
    expect(out.length).toBe(2)
    const state = useLibraryStore.getState()
    expect(state.getEntry('spells', 'fireball')?.name).toBe('Fireball')
    expect(state.sourceOf['spells:fireball']).toBe('official')
    expect(state.cacheMeta.spells?.loading).toBe(false)
    expect(state.loaded.spells).toBe(true)
  })

  it('loadCategory dedupes concurrent calls via waiters (coalescing)', async () => {
    useLibraryStore.getState().clearAll()
    let invocations = 0
    const loader = async (): Promise<{ id: string; name: string }[]> => {
      invocations++
      await new Promise((r) => setTimeout(r, 10))
      return [{ id: 'a', name: 'A' }]
    }
    const [first, second] = await Promise.all([
      useLibraryStore.getState().loadCategory('feats', loader),
      useLibraryStore.getState().loadCategory('feats', loader)
    ])
    expect(invocations).toBe(1)
    expect(first.length).toBe(1)
    expect(second.length).toBe(1)
  })

  it('upsertHomebrew validates + writes to entries + tags sourceOf as homebrew', () => {
    useLibraryStore.getState().clearAll()
    const ok = useLibraryStore.getState().upsertHomebrew('feats', {
      id: 'my-feat',
      name: 'My Feat'
    })
    expect(ok).toBe(true)
    const state = useLibraryStore.getState()
    expect(state.getEntry('feats', 'my-feat')?.name).toBe('My Feat')
    expect(state.sourceOf['feats:my-feat']).toBe('homebrew')
  })

  it('upsertHomebrew rejects entries missing id', () => {
    useLibraryStore.getState().clearAll()
    const ok = useLibraryStore
      .getState()
      .upsertHomebrew('feats', { name: 'No ID' } as unknown as { id: string; name: string })
    expect(ok).toBe(false)
  })

  it('deleteHomebrew removes entry + clears sourceOf', () => {
    useLibraryStore.getState().clearAll()
    useLibraryStore.getState().upsertHomebrew('feats', { id: 'gone', name: 'Gone' })
    useLibraryStore.getState().deleteHomebrew('feats', 'gone')
    const state = useLibraryStore.getState()
    expect(state.getEntry('feats', 'gone')).toBeNull()
    expect(state.sourceOf['feats:gone']).toBeUndefined()
  })

  it('loadPluginContent namespaces ids with plugin:<pluginId>:<id> + tags source', () => {
    useLibraryStore.getState().clearAll()
    useLibraryStore
      .getState()
      .loadPluginContent('spells', [{ id: 'frost-spear', name: 'Frost Spear', level: 2 }], 'arctic-pack')
    const state = useLibraryStore.getState()
    expect(state.getEntry('spells', 'plugin:arctic-pack:frost-spear')?.name).toBe('Frost Spear')
    expect(state.sourceOf['spells:plugin:arctic-pack:frost-spear']).toBe('plugin')
  })

  it('refresh invalidates a single category', async () => {
    useLibraryStore.getState().clearAll()
    await useLibraryStore.getState().loadCategory('spells', () => [{ id: 'a', name: 'A' }])
    useLibraryStore.getState().refresh('spells')
    expect(useLibraryStore.getState().loaded.spells).toBeUndefined()
    expect(useLibraryStore.getState().cacheMeta.spells).toBeUndefined()
  })

  it('clearAll empties all truth-store buckets', async () => {
    await useLibraryStore.getState().loadCategory('spells', () => [{ id: 'a', name: 'A' }])
    useLibraryStore.getState().clearAll()
    const state = useLibraryStore.getState()
    expect(state.entries).toEqual({})
    expect(state.sourceOf).toEqual({})
    expect(state.cacheMeta).toEqual({})
    expect(state.loaded).toEqual({})
  })
})
