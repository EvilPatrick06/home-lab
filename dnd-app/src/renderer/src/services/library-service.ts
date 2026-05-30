import Fuse from 'fuse.js'
import type { HomebrewEntry, LibraryCategory, LibraryItem } from '../types/library'
import {
  load5eAdventureSeeds,
  load5eBackgrounds,
  load5eBuiltInMaps,
  load5eCalendarPresets,
  load5eChaseTables,
  load5eClasses,
  load5eClassFeatures,
  load5eCompanions,
  load5eConditions,
  load5eCrafting,
  load5eCreatures,
  load5eCurses,
  load5eDeities,
  load5eDiseases,
  load5eDowntime,
  load5eEncounterPresets,
  load5eEnvironmentalEffects,
  load5eEquipment,
  load5eFeats,
  load5eFightingStyles,
  load5eHazards,
  load5eInvocations,
  load5eLanguages,
  load5eLightSources,
  load5eMagicItems,
  load5eMetamagic,
  load5eMonsters,
  load5eMounts,
  load5eNpcNames,
  load5eNpcs,
  load5ePlanes,
  load5ePoisons,
  load5eRandomTables,
  load5eSentientItems,
  load5eSettlements,
  load5eSiegeEquipment,
  load5eSkills,
  load5eSpecies,
  load5eSpells,
  load5eSubclasses,
  load5eSupernaturalGifts,
  load5eTools,
  load5eTraps,
  load5eTreasureTables,
  load5eTrinkets,
  load5eVehicles,
  load5eWeaponMastery,
  loadJson
} from './data-provider'
import { homebrewToLibraryItems, toLibraryItems } from './library/library-item-builders'
import { SOUND_INVENTORY } from './library/sound-inventory'
import { ACTIONS_DATA, COVER_DATA, DAMAGE_TYPES, DC_DATA } from './library/static-category-data'

// Re-export the public surface that moved into the `library/` sibling modules so
// every existing `./library-service` import path keeps resolving unchanged.
export { SOUND_INVENTORY } from './library/sound-inventory'
export { summarizeItem } from './library/summarize-item'

export async function loadCategoryItems(category: LibraryCategory, homebrew: HomebrewEntry[]): Promise<LibraryItem[]> {
  const hbItems = homebrewToLibraryItems(homebrew, category)

  switch (category) {
    case 'characters': {
      const raw = await window.api.loadCharacters()
      if (!Array.isArray(raw)) return hbItems
      return [
        ...raw.map((c) => ({
          id: (c.id as string) ?? '',
          name: (c.name as string) ?? 'Unknown',
          category: 'characters' as const,
          source: 'official' as const,
          summary: `Level ${c.level ?? '?'} ${c.className ?? c.class ?? '?'}`,
          data: c
        })),
        ...hbItems
      ]
    }
    case 'campaigns': {
      const raw = await window.api.loadCampaigns()
      if (!Array.isArray(raw)) return hbItems
      return raw.map((c) => ({
        id: (c.id as string) ?? '',
        name: (c.name as string) ?? 'Unknown',
        category: 'campaigns' as const,
        source: 'official' as const,
        summary: `${c.system ?? '5e'} - ${c.description ?? 'No description'}`.slice(0, 80),
        data: c
      }))
    }
    case 'bastions': {
      const raw = await window.api.loadBastions()
      if (!Array.isArray(raw)) return hbItems
      return raw.map((b) => ({
        id: (b.id as string) ?? '',
        name: (b.name as string) ?? 'Unknown',
        category: 'bastions' as const,
        source: 'official' as const,
        summary: `Level ${b.level ?? '?'}`,
        data: b
      }))
    }
    case 'monsters': {
      const data = await load5eMonsters()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'creatures': {
      const data = await load5eCreatures()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'npcs': {
      const data = await load5eNpcs()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'spells': {
      const data = await load5eSpells()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'invocations': {
      const data = await load5eInvocations()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'metamagic': {
      const data = await load5eMetamagic()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'classes': {
      const data = await load5eClasses()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'subclasses': {
      const data = await load5eSubclasses()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'species': {
      const data = await load5eSpecies()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'backgrounds': {
      const data = await load5eBackgrounds()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'feats': {
      const data = await load5eFeats()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'supernatural-gifts': {
      const data = await load5eSupernaturalGifts()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'weapons': {
      const eq = await load5eEquipment()
      return [...toLibraryItems(eq.weapons, category), ...hbItems]
    }
    case 'armor': {
      const eq = await load5eEquipment()
      return [...toLibraryItems(eq.armor, category), ...hbItems]
    }
    case 'gear': {
      const eq = await load5eEquipment()
      return [...toLibraryItems(eq.gear, category), ...hbItems]
    }
    case 'tools': {
      const data = await load5eTools()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'magic-items': {
      const data = await load5eMagicItems()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'vehicles': {
      const data = await load5eVehicles()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'mounts': {
      const data = await load5eMounts()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'siege-equipment': {
      const data = await load5eSiegeEquipment()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'trinkets': {
      const data = await load5eTrinkets()
      // Trinkets are string arrays — convert to named objects.
      // boundary cast: loader is typed Record[] but the data is actually string[] at runtime.
      const trinketItems = (data as unknown as string[]).map((t, i) => ({
        id: `trinket-${i}`,
        // boundary cast: defensive object-shaped fallback for non-string entries
        name: typeof t === 'string' ? t : ((t as unknown as Record<string, unknown>).name ?? 'Unknown')
      }))
      return [...toLibraryItems(trinketItems, category), ...hbItems]
    }
    case 'settlements': {
      const data = await load5eSettlements()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'traps': {
      const data = await load5eTraps()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'hazards': {
      const data = await load5eHazards()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'poisons': {
      const data = await load5ePoisons()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'diseases': {
      const data = await load5eDiseases()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'curses': {
      const data = await load5eCurses()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'environmental-effects': {
      const data = await load5eEnvironmentalEffects()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'crafting': {
      const data = await load5eCrafting()
      // CraftingToolEntry is {tool, items[]} — flatten items
      const craftingItems: Record<string, unknown>[] = []
      for (const group of data) {
        for (const recipe of group.items) {
          craftingItems.push({ ...recipe, toolType: group.tool })
        }
      }
      return [...toLibraryItems(craftingItems, category), ...hbItems]
    }
    case 'downtime': {
      const data = await load5eDowntime()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'encounter-presets': {
      const data = await load5eEncounterPresets()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'treasure-tables': {
      const data = await load5eTreasureTables()
      // boundary cast: fixed-key TreasureTablesFile → indexable Record for dynamic entry iteration
      const tables = data as unknown as Record<string, unknown>
      return toLibraryItems(
        Object.entries(tables).map(([key, val]) => ({
          id: key,
          name: key,
          ...(val as Record<string, unknown>)
        })),
        category
      )
    }
    case 'random-tables': {
      const data = await load5eRandomTables()
      // boundary cast: fixed-key RandomTablesFile → indexable Record for dynamic entry iteration
      const tables = data as unknown as Record<string, unknown>
      return toLibraryItems(
        Object.entries(tables).map(([key, val]) => ({
          id: key,
          name: key,
          ...(val as Record<string, unknown>)
        })),
        category
      )
    }
    case 'chase-tables': {
      const data = await load5eChaseTables()
      // boundary cast: fixed-key ChaseTablesFile → indexable Record for dynamic entry iteration
      const tables = data as unknown as Record<string, unknown>
      return toLibraryItems(
        Object.entries(tables).map(([key, val]) => ({
          id: key,
          name: key,
          ...(val as Record<string, unknown>)
        })),
        category
      )
    }
    case 'sounds': {
      // Full sound inventory — all MP3 files grouped by subcategory
      return SOUND_INVENTORY.map((s) => ({
        id: s.id,
        name: s.name,
        category: 'sounds' as const,
        source: 'official' as const,
        summary: s.subcategory.replace(/\//g, ' › ').replace(/^./, (c) => c.toUpperCase()),
        data: { id: s.id, name: s.name, subcategory: s.subcategory, path: s.path }
      }))
    }
    case 'actions': {
      return toLibraryItems(ACTIONS_DATA, category)
    }
    case 'cover': {
      return toLibraryItems(COVER_DATA, category)
    }
    case 'dcs': {
      return toLibraryItems(DC_DATA, category)
    }
    case 'damage-types': {
      const items = DAMAGE_TYPES.map((d) => ({
        name: d.charAt(0).toUpperCase() + d.slice(1),
        description: `${d.charAt(0).toUpperCase() + d.slice(1)} damage`
      }))
      return toLibraryItems(items, category)
    }
    case 'conditions': {
      const data = await load5eConditions()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'weapon-mastery': {
      const data = await load5eWeaponMastery()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'languages': {
      const data = await load5eLanguages()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'skills': {
      const data = await load5eSkills()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'fighting-styles': {
      const data = await load5eFightingStyles()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'class-features': {
      const cfData = await load5eClassFeatures()
      const items: Record<string, unknown>[] = []
      for (const [className, classData] of Object.entries(cfData)) {
        for (const feat of classData.features) {
          items.push({
            id: `${className}-${feat.name}-${feat.level}`,
            name: feat.name,
            level: feat.level,
            description: feat.description,
            class: className
          })
        }
      }
      return [...toLibraryItems(items, category), ...hbItems]
    }
    case 'companions': {
      const data = await load5eCompanions()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'adventure-seeds': {
      const data = await load5eAdventureSeeds()
      const items: Record<string, unknown>[] = []
      for (const [range, seeds] of Object.entries(data as Record<string, unknown>)) {
        if (!Array.isArray(seeds)) continue
        for (const [i, seed] of seeds.entries()) {
          items.push({
            id: `adventure-seed-${range}-${i}`,
            name:
              typeof seed === 'string'
                ? seed.slice(0, 80)
                : ((seed as Record<string, unknown>).name ?? `Seed ${i + 1}`),
            levelRange: range,
            description: typeof seed === 'string' ? seed : ((seed as Record<string, unknown>).description ?? '')
          })
        }
      }
      return [...toLibraryItems(items, category), ...hbItems]
    }
    case 'calendars': {
      const data = await load5eCalendarPresets()
      const presets = data.presets as Record<string, unknown> | undefined
      if (!presets) return hbItems
      const items = Object.entries(presets).map(([key, val]) => ({
        id: key,
        name:
          (val as Record<string, unknown>).name ??
          key.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        ...(val as Record<string, unknown>)
      }))
      return [...toLibraryItems(items, category), ...hbItems]
    }
    case 'deities': {
      const data = await load5eDeities()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'planes': {
      const data = await load5ePlanes()
      return [...toLibraryItems(data, category), ...hbItems]
    }
    case 'npc-names': {
      const data = await load5eNpcNames()
      const nameData = data as Record<string, unknown>
      const items = Object.entries(nameData).map(([species, names]) => {
        const nameObj = names as Record<string, string[]>
        return {
          id: `npc-names-${species}`,
          name: species.replace(/^./, (c: string) => c.toUpperCase()),
          male: nameObj.male,
          female: nameObj.female,
          neutral: nameObj.neutral,
          family: nameObj.family
        }
      })
      return toLibraryItems(items, category)
    }
    case 'light-sources': {
      const data = await load5eLightSources()
      const items = Object.entries(data).map(([key, val]) => ({
        id: key,
        name:
          // boundary cast: concrete LightSourceEntry → indexless Record for spread/dynamic field reads
          (val as unknown as Record<string, unknown>).label ??
          key.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        ...(val as unknown as Record<string, unknown>)
      }))
      return [...toLibraryItems(items, category), ...hbItems]
    }
    case 'sentient-items': {
      const data = await load5eSentientItems()
      const items = Object.entries(data).map(([key, val]) => ({
        id: key,
        name: key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (c: string) => c.toUpperCase())
          .trim(),
        entries: Array.isArray(val) ? val : [],
        ...(typeof val === 'object' && !Array.isArray(val) ? (val as Record<string, unknown>) : {})
      }))
      return toLibraryItems(items, category)
    }
    case 'maps': {
      const items: LibraryItem[] = []
      // Load preset built-in maps
      try {
        const presetMaps = await load5eBuiltInMaps()
        for (const m of presetMaps) {
          items.push({
            id: m.id ?? '',
            name: m.name ?? 'Unknown Map',
            category: 'maps',
            source: 'official',
            summary: m.preview ?? 'Preset Map',
            // boundary cast: concrete BuiltInMapEntry → indexless Record for LibraryItem.data
            data: m as unknown as Record<string, unknown>
          })
        }
      } catch {
        // Built-in maps unavailable
      }
      // Load user library maps
      try {
        const result = await window.api.mapLibrary.list()
        if (result?.success && Array.isArray(result.data)) {
          // boundary cast: IPC map-list payload → Record for dynamic field reads (gridWidth/gridHeight)
          for (const m of result.data as unknown as Record<string, unknown>[]) {
            items.push({
              id: (m.id as string) ?? '',
              name: (m.name as string) ?? 'Unknown Map',
              category: 'maps',
              source: 'official',
              summary: `Map${m.gridWidth ? ` - ${m.gridWidth}x${m.gridHeight}` : ''}`,
              data: m
            })
          }
        }
      } catch {
        // Map library unavailable
      }
      return [...items, ...hbItems]
    }
    case 'shop-templates': {
      try {
        const result = await window.api.shopTemplates.list()
        if (!result?.success || !Array.isArray(result.data)) return hbItems
        return result.data.map((s: Record<string, unknown>) => ({
          id: (s.id as string) ?? '',
          name: (s.name as string) ?? 'Unknown Shop',
          category: 'shop-templates' as const,
          source: 'official' as const,
          summary: `${((s.inventory as unknown[]) ?? []).length} items${s.markup && s.markup !== 1 ? ` - ${(s.markup as number) * 100}% markup` : ''}`,
          data: s
        }))
      } catch {
        return hbItems
      }
    }
    case 'portraits': {
      try {
        const result = await window.api.imageLibrary.list()
        if (!result?.success || !Array.isArray(result.data)) return hbItems
        return result.data.map((img: Record<string, unknown>) => ({
          id: (img.id as string) ?? '',
          name: (img.name as string) ?? 'Unknown Image',
          category: 'portraits' as const,
          source: 'official' as const,
          summary: 'Portrait / Icon',
          data: img
        }))
      } catch {
        return hbItems
      }
    }
    case 'rules': {
      const ruleFiles = [
        'ability-checks',
        'combat',
        'conditions',
        'movement',
        'spellcasting',
        'resting',
        'death-saves',
        'actions-in-combat'
      ]
      const allRules: Record<string, unknown>[] = []
      for (const file of ruleFiles) {
        try {
          // Route through loadJson so the Phase 36 Pi remote-library/cache path
          // is used (./data/5e/... maps to the Pi); falls back to the bundled
          // file on miss/disable. (Was a raw fetch that bypassed the cache.)
          const data = await loadJson<unknown>(`./data/5e/rules/${file}.json`)
          if (Array.isArray(data)) allRules.push(...(data as Record<string, unknown>[]))
        } catch {
          /* skip missing files */
        }
      }
      return toLibraryItems(allRules, category)
    }
    default:
      return hbItems
  }
}

export async function searchAllCategories(query: string, homebrew: HomebrewEntry[]): Promise<LibraryItem[]> {
  if (!query.trim()) return []

  const allCategories: LibraryCategory[] = [
    'characters',
    'campaigns',
    'bastions',
    'monsters',
    'creatures',
    'npcs',
    'companions',
    'spells',
    'invocations',
    'metamagic',
    'classes',
    'subclasses',
    'species',
    'backgrounds',
    'feats',
    'supernatural-gifts',
    'class-features',
    'fighting-styles',
    'weapons',
    'armor',
    'gear',
    'tools',
    'magic-items',
    'vehicles',
    'mounts',
    'siege-equipment',
    'trinkets',
    'light-sources',
    'sentient-items',
    'traps',
    'hazards',
    'poisons',
    'diseases',
    'curses',
    'environmental-effects',
    'settlements',
    'crafting',
    'downtime',
    'encounter-presets',
    'treasure-tables',
    'random-tables',
    'chase-tables',
    'conditions',
    'actions',
    'cover',
    'dcs',
    'damage-types',
    'weapon-mastery',
    'languages',
    'skills',
    'adventure-seeds',
    'calendars',
    'deities',
    'planes',
    'npc-names',
    'sounds',
    'maps',
    'shop-templates',
    'portraits',
    'rules'
  ]

  const results = await Promise.allSettled(allCategories.map((cat) => loadCategoryItems(cat, homebrew)))

  const allItems: LibraryItem[] = []
  for (const r of results) {
    if (r.status === 'fulfilled') {
      allItems.push(...r.value)
    }
  }

  const fuse = new Fuse(allItems, {
    keys: ['name', 'summary', 'data.tags'],
    threshold: 0.3,
    distance: 100,
    ignoreLocation: true
  })

  return fuse
    .search(query)
    .map((result) => result.item)
    .slice(0, 100)
}
