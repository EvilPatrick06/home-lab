import { create } from 'zustand'
import { logger } from '../utils/logger'

type DataCategory =
  | 'species'
  | 'speciesTraits'
  | 'classes'
  | 'backgrounds'
  | 'subclasses'
  | 'feats'
  | 'spells'
  | 'classFeatures'
  | 'equipment'
  | 'crafting'
  | 'diseases'
  | 'encounterBudgets'
  | 'treasureTables'
  | 'randomTables'
  | 'chaseTables'
  | 'encounterPresets'
  | 'npcNames'
  | 'invocations'
  | 'metamagic'
  | 'bastionFacilities'
  | 'magicItems'
  | 'monsters'
  | 'npcs'
  | 'creatures'
  | 'traps'
  | 'hazards'
  | 'poisons'
  | 'environmentalEffects'
  | 'curses'
  | 'supernaturalGifts'
  | 'siegeEquipment'
  | 'settlements'
  | 'mounts'
  | 'vehicles'
  | 'downtime'
  | 'conditions'
  | 'weaponMastery'
  | 'languages'
  | 'skills'
  | 'fightingStyles'
  | 'variantItems'
  | 'lightSources'
  | 'npcAppearance'
  | 'npcMannerisms'
  | 'alignmentDescriptions'
  | 'wearableItems'
  | 'personalityTables'
  | 'xpThresholds'
  | 'startingEquipment'
  | 'bastionEvents'
  | 'sentientItems'
  | 'weatherGeneration'
  | 'calendarPresets'
  | 'effectDefinitions'
  | 'spellSlots'
  | 'trinkets'
  | 'soundEvents'
  | 'speciesSpells'
  | 'classResources'
  | 'speciesResources'
  | 'abilityScoreConfig'
  | 'presetIcons'
  | 'keyboardShortcuts'
  | 'themes'
  | 'diceColors'
  | 'dmTabs'
  | 'notificationTemplates'
  | 'builtInMaps'
  | 'sessionZeroConfig'
  | 'diceTypes'
  | 'lightingTravel'
  | 'currencyConfig'
  | 'moderation'
  | 'adventureSeeds'
  | 'creatureTypes'
  | 'ambientTracks'
  | 'languageD12Table'
  | 'rarityOptions'
  | 'tools'

interface CacheEntry {
  data: unknown
  timestamp: number
  loading: boolean
}

const CACHE_TTL_MS = 30 * 60 * 1000

// Module-level waiter map so concurrent callers for the same category are settled
// without polling, and rejected when the primary loader fails.
const waiters = new Map<DataCategory, Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }>>()

interface DataStoreState {
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

export const useDataStore = create<DataStoreState>((set, get) => ({
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

      let merged = mergeHomebrew(category, data, get().homebrewByCategory)
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

function mergeHomebrew<T>(
  category: DataCategory,
  baseData: T,
  homebrewByCategory: Map<string, Record<string, unknown>[]>
): T {
  const catKey = categoryToHomebrewKey(category)
  const homebrewEntries = homebrewByCategory.get(catKey)
  if (!homebrewEntries || homebrewEntries.length === 0) return baseData

  if (!Array.isArray(baseData)) return baseData

  const result = [...baseData]

  for (const entry of homebrewEntries) {
    // Homebrew entries wrap actual data under .data — unwrap if present
    const raw =
      entry.data && typeof entry.data === 'object' && !Array.isArray(entry.data)
        ? { ...(entry.data as Record<string, unknown>), id: entry.id ?? (entry.data as Record<string, unknown>).id }
        : entry
    const entryWithSource = { ...raw, source: 'homebrew' }
    result.push(entryWithSource as (typeof result)[number])
  }

  return result as unknown as T
}

function mergePluginData<T>(
  category: DataCategory,
  baseData: T,
  pluginDataByCategory: Map<string, Record<string, unknown>[]>
): T {
  const pluginEntries = pluginDataByCategory.get(category)
  if (!pluginEntries || pluginEntries.length === 0) return baseData

  if (!Array.isArray(baseData)) return baseData

  const result = [...baseData]
  for (const entry of pluginEntries) {
    result.push(entry as (typeof result)[number])
  }
  return result as unknown as T
}

function categoryToHomebrewKey(category: DataCategory): string {
  const map: Record<DataCategory, string> = {
    species: 'species',
    speciesTraits: 'species-traits',
    classes: 'classes',
    backgrounds: 'backgrounds',
    subclasses: 'subclasses',
    feats: 'feats',
    spells: 'spells',
    classFeatures: 'class-features',
    equipment: 'equipment',
    crafting: 'crafting',
    diseases: 'diseases',
    encounterBudgets: 'encounter-budgets',
    treasureTables: 'treasure-tables',
    randomTables: 'random-tables',
    chaseTables: 'chase-tables',
    encounterPresets: 'encounter-presets',
    npcNames: 'npc-names',
    invocations: 'invocations',
    metamagic: 'metamagic',
    bastionFacilities: 'bastion-facilities',
    magicItems: 'magic-items',
    monsters: 'monsters',
    npcs: 'npcs',
    creatures: 'creatures',
    traps: 'traps',
    hazards: 'hazards',
    poisons: 'poisons',
    environmentalEffects: 'environmental-effects',
    curses: 'curses',
    supernaturalGifts: 'supernatural-gifts',
    siegeEquipment: 'siege-equipment',
    settlements: 'settlements',
    mounts: 'mounts',
    vehicles: 'vehicles',
    downtime: 'downtime',
    conditions: 'conditions',
    weaponMastery: 'weapon-mastery',
    languages: 'languages',
    skills: 'skills',
    fightingStyles: 'fighting-styles',
    variantItems: 'variant-items',
    lightSources: 'light-sources',
    npcAppearance: 'npc-appearance',
    npcMannerisms: 'npc-mannerisms',
    alignmentDescriptions: 'alignment-descriptions',
    wearableItems: 'wearable-items',
    personalityTables: 'personality-tables',
    xpThresholds: 'xp-thresholds',
    startingEquipment: 'starting-equipment',
    bastionEvents: 'bastion-events',
    sentientItems: 'sentient-items',
    weatherGeneration: 'weather-generation',
    calendarPresets: 'calendar-presets',
    effectDefinitions: 'effect-definitions',
    spellSlots: 'spell-slots',
    trinkets: 'trinkets',
    soundEvents: 'sound-events',
    speciesSpells: 'species-spells',
    classResources: 'class-resources',
    speciesResources: 'species-resources',
    abilityScoreConfig: 'ability-score-config',
    presetIcons: 'preset-icons',
    keyboardShortcuts: 'keyboard-shortcuts',
    themes: 'themes',
    diceColors: 'dice-colors',
    dmTabs: 'dm-tabs',
    notificationTemplates: 'notification-templates',
    builtInMaps: 'built-in-maps',
    sessionZeroConfig: 'session-zero-config',
    diceTypes: 'dice-types',
    lightingTravel: 'lighting-travel',
    currencyConfig: 'currency-config',
    moderation: 'moderation',
    adventureSeeds: 'adventure-seeds',
    creatureTypes: 'creature-types',
    ambientTracks: 'ambient-tracks',
    languageD12Table: 'language-d12-table',
    rarityOptions: 'rarity-options',
    tools: 'tools'
  }
  return map[category]
}
