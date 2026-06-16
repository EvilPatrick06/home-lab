import { create } from 'zustand'
import { getActiveCampaignId } from '../services/active-campaign-ref'
import {
  categoryToHomebrewKey,
  type DataCategory,
  mergeHomebrew,
  mergePluginData
} from '../services/library/content-merge'
import { logger } from '../utils/logger'

/**
 * Imperative loader cache for `data-provider` (Phase 15h — renamed from `use-data-store`).
 *
 * This is the cache behind every `load5e*()` imperative loader: TTL + concurrent-waiter
 * coalescing, plus the homebrew/plugin MERGE that folds `userData/homebrew/*` and installed
 * plugin content into each category's results. It holds the ~20 non-library config/UI
 * categories (themes, dice colors, keyboard shortcuts, xp thresholds, etc.) that have no
 * `LibraryCategory` home, as well as caching content categories for the imperative façade.
 *
 * It is NOT the React-facing source of truth — that is `useLibraryStore` (the truth store),
 * which content side-writes into via `library-service.ingestIntoLibraryStore` (15a). React
 * components read content through the library hooks; `data-provider` + main-process code use
 * these loaders. The two are kept in sync by the dual `clearAll` (15a Step 9).
 *
 * PHASE-13 13K: the homebrew/plugin merge is now a standalone library module
 * (`services/library/content-merge.ts`) — importable without this zustand store. The
 * remaining (NOT this phase) step is migrating each `load5e*` content read onto the
 * truth store per-consumer so content reads stop depending on this cache at all.
 */

interface CacheEntry {
  data: unknown
  timestamp: number
  loading: boolean
}

const CACHE_TTL_MS = 30 * 60 * 1000

// Module-level waiter map so concurrent callers for the same category are settled
// without polling, and rejected when the primary loader fails.
const waiters = new Map<DataCategory, Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }>>()

interface ConfigStoreState {
  cache: Map<DataCategory, CacheEntry>
  homebrewByCategory: Map<string, Record<string, unknown>[]>
  homebrewLoaded: boolean
  pluginDataByCategory: Map<string, Record<string, unknown>[]>
  pluginsLoaded: boolean

  loadHomebrew: () => Promise<void>
  loadPluginContent: () => Promise<void>
  get: <T>(category: DataCategory, loader: () => Promise<T>) => Promise<T>
  refresh: (category: DataCategory) => void
  clearAll: () => void
}

export const useConfigStore = create<ConfigStoreState>((set, get) => ({
  cache: new Map(),
  homebrewByCategory: new Map(),
  homebrewLoaded: false,
  pluginDataByCategory: new Map(),
  pluginsLoaded: false,

  loadHomebrew: async () => {
    if (get().homebrewLoaded) return
    try {
      const result = await window.api.loadAllHomebrew()
      if (Array.isArray(result)) {
        const byCategory = new Map<string, Record<string, unknown>[]>()
        for (const entry of result) {
          const cat = (entry.type as string) || 'unknown'
          const existing = byCategory.get(cat) || []
          existing.push(entry)
          byCategory.set(cat, existing)
        }
        set({ homebrewByCategory: byCategory, homebrewLoaded: true })
      }
    } catch (err) {
      // Log but do NOT set homebrewLoaded=true so the next call can retry
      logger.error('[DataStore] Failed to load homebrew; will retry on next access', err)
    }
  },

  loadPluginContent: async () => {
    if (get().pluginsLoaded) return
    try {
      const scanResult = await window.api.plugins.scan()
      if (!scanResult.success || !scanResult.data) {
        set({ pluginsLoaded: true })
        return
      }

      const enabledPlugins = scanResult.data.filter((p) => p.enabled && !p.error)
      const byCategory = new Map<string, Record<string, unknown>[]>()

      for (const plugin of enabledPlugins) {
        const contentResult = await window.api.plugins.loadContent(plugin.id, plugin.manifest)
        if (contentResult.success && contentResult.data) {
          for (const [category, items] of Object.entries(contentResult.data)) {
            if (!Array.isArray(items)) {
              logger.warn(
                `[DataStore] Plugin "${plugin.id}" returned non-array data for category "${category}", skipping`
              )
              continue
            }
            const existing = byCategory.get(category) || []
            existing.push(...(items as Record<string, unknown>[]))
            byCategory.set(category, existing)
          }
        }
      }

      set({ pluginDataByCategory: byCategory, pluginsLoaded: true })
    } catch {
      set({ pluginsLoaded: true })
    }
  },

  get: async <T>(category: DataCategory, loader: () => Promise<T>): Promise<T> => {
    const state = get()
    const cached = state.cache.get(category)

    if (cached && !cached.loading && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data as T
    }

    if (cached?.loading) {
      return new Promise<T>((resolve, reject) => {
        const list = waiters.get(category) ?? []
        list.push({ resolve: resolve as (v: unknown) => void, reject })
        waiters.set(category, list)
      })
    }

    const newCache = new Map(state.cache)
    newCache.set(category, { data: null, timestamp: Date.now(), loading: true })
    set({ cache: newCache })

    try {
      const data = await loader()

      if (!state.homebrewLoaded) {
        await state.loadHomebrew()
      }

      if (!get().pluginsLoaded) {
        await get().loadPluginContent()
      }

      let merged = mergeHomebrew(category, data, get().homebrewByCategory, getActiveCampaignId())
      merged = mergePluginData(category, merged, get().pluginDataByCategory)

      const finalCache = new Map(get().cache)
      finalCache.set(category, { data: merged, timestamp: Date.now(), loading: false })
      set({ cache: finalCache })

      // Settle any concurrent callers that were waiting for this load
      const pending = waiters.get(category)
      if (pending) {
        waiters.delete(category)
        for (const w of pending) w.resolve(merged)
      }

      return merged as T
    } catch (err) {
      const errCache = new Map(get().cache)
      errCache.delete(category)
      set({ cache: errCache })

      // Reject any concurrent callers that were waiting for this load
      const pending = waiters.get(category)
      if (pending) {
        waiters.delete(category)
        for (const w of pending) w.reject(err)
      }

      throw err
    }
  },

  refresh: (category: DataCategory) => {
    const newCache = new Map(get().cache)
    newCache.delete(category)
    set({ cache: newCache })
  },

  clearAll: () => {
    set({
      cache: new Map(),
      homebrewByCategory: new Map(),
      homebrewLoaded: false,
      pluginDataByCategory: new Map(),
      pluginsLoaded: false
    })
  }
}))
