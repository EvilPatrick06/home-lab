import { create } from 'zustand'
import { safeValidateEntry } from '../services/library/schemas/registry'
import type { HomebrewEntry, LibraryCategory, LibraryEntry, LibraryItem } from '../types/library'
import { logger } from '../utils/logger'

export type EntrySource = 'official' | 'homebrew' | 'plugin'

interface CacheMeta {
  loadedAt: number
  loading: boolean
}

type EntryLoader = () => Promise<LibraryEntry[]> | LibraryEntry[]

const CACHE_TTL_MS = 30 * 60 * 1000

const waiters = new Map<
  LibraryCategory,
  Array<{ resolve: (v: LibraryEntry[]) => void; reject: (e: unknown) => void }>
>()

interface LibraryState {
  entries: Partial<Record<LibraryCategory, Record<string, LibraryEntry>>>
  sourceOf: Record<string, EntrySource>
  cacheMeta: Partial<Record<LibraryCategory, CacheMeta>>
  loaded: Partial<Record<LibraryCategory, boolean>>

  items: LibraryItem[]
  homebrewEntries: HomebrewEntry[]
  loading: boolean
  homebrewLoaded: boolean

  getEntry: <C extends LibraryCategory>(category: C, id: string) => LibraryEntry<C> | null
  getEntries: <C extends LibraryCategory>(
    category: C,
    filter?: (entry: LibraryEntry<C>) => boolean
  ) => LibraryEntry<C>[]
  loadCategory: <C extends LibraryCategory>(category: C, loader: EntryLoader) => Promise<LibraryEntry<C>[]>
  refresh: (category: LibraryCategory) => void
  clearAll: () => void

  upsertHomebrew: <C extends LibraryCategory>(category: C, entry: LibraryEntry<C>) => boolean
  deleteHomebrew: (category: LibraryCategory, id: string) => void
  loadPluginContent: (category: LibraryCategory, entries: LibraryEntry[], pluginId: string) => void

  setItems: (items: LibraryItem[]) => void
  setLoading: (loading: boolean) => void
  loadHomebrew: () => Promise<void>
  saveHomebrewEntry: (entry: HomebrewEntry) => Promise<boolean>
  deleteHomebrewEntry: (category: string, id: string) => Promise<boolean>
}

function indexEntries(rawEntries: LibraryEntry[], category: LibraryCategory): Record<string, LibraryEntry> {
  const indexed: Record<string, LibraryEntry> = {}
  for (const entry of rawEntries) {
    if (!entry || typeof entry !== 'object') continue
    const id = (entry as Record<string, unknown>).id
    if (typeof id !== 'string' || id.length === 0) continue
    const result = safeValidateEntry(category, entry)
    if (result.success) {
      indexed[id] = result.data as LibraryEntry
    } else {
      logger.warn(`[LibraryStore] invalid entry in ${category}: ${id}`, result.error.issues)
    }
  }
  return indexed
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  entries: {},
  sourceOf: {},
  cacheMeta: {},
  loaded: {},

  items: [],
  homebrewEntries: [],
  loading: false,
  homebrewLoaded: false,

  getEntry: <C extends LibraryCategory>(category: C, id: string): LibraryEntry<C> | null => {
    const bucket = get().entries[category]
    if (!bucket) return null
    const entry = bucket[id]
    return entry ? (entry as LibraryEntry<C>) : null
  },

  getEntries: <C extends LibraryCategory>(
    category: C,
    filter?: (entry: LibraryEntry<C>) => boolean
  ): LibraryEntry<C>[] => {
    const bucket = get().entries[category]
    if (!bucket) return []
    const all = Object.values(bucket) as LibraryEntry<C>[]
    return filter ? all.filter(filter) : all
  },

  loadCategory: async <C extends LibraryCategory>(category: C, loader: EntryLoader): Promise<LibraryEntry<C>[]> => {
    const state = get()
    const meta = state.cacheMeta[category]

    if (meta && !meta.loading && Date.now() - meta.loadedAt < CACHE_TTL_MS) {
      return Object.values(state.entries[category] ?? {}) as LibraryEntry<C>[]
    }

    if (meta?.loading) {
      return new Promise<LibraryEntry<C>[]>((resolve, reject) => {
        const list = waiters.get(category) ?? []
        list.push({ resolve: resolve as (v: LibraryEntry[]) => void, reject })
        waiters.set(category, list)
      })
    }

    set((s) => ({
      cacheMeta: { ...s.cacheMeta, [category]: { loadedAt: Date.now(), loading: true } }
    }))

    try {
      const raw = await loader()
      const indexed = indexEntries(raw, category)
      const sourceUpdates: Record<string, EntrySource> = {}
      for (const id of Object.keys(indexed)) {
        sourceUpdates[`${category}:${id}`] = 'official'
      }

      set((s) => ({
        entries: { ...s.entries, [category]: { ...(s.entries[category] ?? {}), ...indexed } },
        sourceOf: { ...s.sourceOf, ...sourceUpdates },
        cacheMeta: { ...s.cacheMeta, [category]: { loadedAt: Date.now(), loading: false } },
        loaded: { ...s.loaded, [category]: true }
      }))

      const final = Object.values(get().entries[category] ?? {}) as LibraryEntry<C>[]
      const pending = waiters.get(category)
      if (pending) {
        waiters.delete(category)
        for (const w of pending) w.resolve(final)
      }
      return final
    } catch (err) {
      set((s) => {
        const nextMeta = { ...s.cacheMeta }
        delete nextMeta[category]
        return { cacheMeta: nextMeta }
      })
      const pending = waiters.get(category)
      if (pending) {
        waiters.delete(category)
        for (const w of pending) w.reject(err)
      }
      throw err
    }
  },

  refresh: (category) => {
    set((s) => {
      const nextMeta = { ...s.cacheMeta }
      delete nextMeta[category]
      const nextLoaded = { ...s.loaded }
      delete nextLoaded[category]
      return { cacheMeta: nextMeta, loaded: nextLoaded }
    })
  },

  clearAll: () => {
    set({ entries: {}, sourceOf: {}, cacheMeta: {}, loaded: {} })
  },

  upsertHomebrew: <C extends LibraryCategory>(category: C, entry: LibraryEntry<C>): boolean => {
    const result = safeValidateEntry(category, entry)
    if (!result.success) {
      logger.warn(`[LibraryStore] upsertHomebrew rejected for ${category}:`, result.error.issues)
      return false
    }
    const id = (result.data as { id: string }).id
    const uid = `${category}:${id}`
    set((s) => ({
      entries: {
        ...s.entries,
        [category]: { ...(s.entries[category] ?? {}), [id]: result.data as LibraryEntry }
      },
      sourceOf: { ...s.sourceOf, [uid]: 'homebrew' }
    }))
    return true
  },

  deleteHomebrew: (category, id) => {
    set((s) => {
      const bucket = { ...(s.entries[category] ?? {}) }
      delete bucket[id]
      const nextSource = { ...s.sourceOf }
      delete nextSource[`${category}:${id}`]
      return { entries: { ...s.entries, [category]: bucket }, sourceOf: nextSource }
    })
  },

  loadPluginContent: (category, rawEntries, pluginId) => {
    const indexed = indexEntries(rawEntries, category)
    const namespaced: Record<string, LibraryEntry> = {}
    const sourceUpdates: Record<string, EntrySource> = {}
    for (const [id, entry] of Object.entries(indexed)) {
      const namespacedId = `plugin:${pluginId}:${id}`
      namespaced[namespacedId] = { ...entry, id: namespacedId, pluginId } as LibraryEntry
      sourceUpdates[`${category}:${namespacedId}`] = 'plugin'
    }
    set((s) => ({
      entries: { ...s.entries, [category]: { ...(s.entries[category] ?? {}), ...namespaced } },
      sourceOf: { ...s.sourceOf, ...sourceUpdates }
    }))
  },

  setItems: (items) => set({ items }),
  setLoading: (loading) => set({ loading }),

  loadHomebrew: async () => {
    if (get().homebrewLoaded) return
    const raw = await window.api.loadAllHomebrew()
    if (Array.isArray(raw)) {
      set({ homebrewEntries: raw as unknown as HomebrewEntry[], homebrewLoaded: true })
    }
  },

  saveHomebrewEntry: async (entry) => {
    try {
      const result = await window.api.saveHomebrew(entry as unknown as Record<string, unknown>)
      if (result.success) {
        const { homebrewEntries } = get()
        const idx = homebrewEntries.findIndex((e) => e.id === entry.id)
        if (idx >= 0) {
          const updated = [...homebrewEntries]
          updated[idx] = entry
          set({ homebrewEntries: updated })
        } else {
          set({ homebrewEntries: [...homebrewEntries, entry] })
        }
        return true
      }
      return false
    } catch (err) {
      logger.error('Failed to save homebrew entry:', err)
      return false
    }
  },

  deleteHomebrewEntry: async (category, id) => {
    try {
      const success = await window.api.deleteHomebrew(category, id)
      if (success) {
        set({ homebrewEntries: get().homebrewEntries.filter((e) => e.id !== id) })
        return true
      }
      return false
    } catch (err) {
      logger.error('Failed to delete homebrew entry:', err)
      return false
    }
  }
}))
