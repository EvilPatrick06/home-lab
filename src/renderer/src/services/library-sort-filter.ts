import type { LibraryCategory, LibraryItem } from '../types/library'

export type SortField = 'name' | 'cr' | 'level' | 'rarity' | 'cost' | 'weight' | 'type' | 'school' | 'difficulty' | 'dc'
export type SortDirection = 'asc' | 'desc'

export interface SortOption {
  field: SortField
  label: string
}

export interface FilterConfig {
  field: string
  label: string
  values: string[]
}

export interface LibrarySortFilterState {
  sortField: SortField
  sortDirection: SortDirection
  activeFilters: Record<string, string[]>
}

const RARITY_ORDER: Record<string, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  'very rare': 4,
  legendary: 5,
  artifact: 6
}

function parseCR(cr: unknown): number {
  if (typeof cr === 'number') return cr
  if (typeof cr !== 'string') return 0
  if (cr.includes('/')) {
    const [n, d] = cr.split('/')
    return Number(n) / Number(d)
  }
  return Number(cr) || 0
}

function parseCost(cost: unknown): number {
  if (typeof cost === 'number') return cost
  if (typeof cost !== 'string') return 0
  const match = cost.match(/^([\d,]+)\s*(cp|sp|ep|gp|pp)$/i)
  if (!match) return 0
  const value = Number(match[1].replace(/,/g, ''))
  const multipliers: Record<string, number> = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 }
  return value * (multipliers[match[2].toLowerCase()] ?? 1)
}

export function getSortOptions(category: LibraryCategory | 'global' | null): SortOption[] {
  if (!category || category === 'global') {
    return [
      { field: 'name', label: 'Name' },
      { field: 'type', label: 'Category' },
      { field: 'level', label: 'Level' },
      { field: 'cr', label: 'CR' }
    ]
  }

  switch (category) {
    case 'monsters':
    case 'creatures':
    case 'npcs':
    case 'companions':
      return [
        { field: 'name', label: 'Name' },
        { field: 'cr', label: 'Challenge Rating' }
      ]
    case 'spells':
      return [
        { field: 'name', label: 'Name' },
        { field: 'level', label: 'Spell Level' },
        { field: 'school', label: 'School' }
      ]
    case 'invocations':
      return [
        { field: 'name', label: 'Name' },
        { field: 'level', label: 'Level Req.' }
      ]
    case 'metamagic':
      return [
        { field: 'name', label: 'Name' },
        { field: 'cost', label: 'Sorcery Points' }
      ]
    case 'weapons':
      return [
        { field: 'name', label: 'Name' },
        { field: 'cost', label: 'Cost' },
        { field: 'weight', label: 'Weight' }
      ]
    case 'armor':
      return [
        { field: 'name', label: 'Name' },
        { field: 'cost', label: 'Cost' },
        { field: 'weight', label: 'Weight' }
      ]
    case 'magic-items':
      return [
        { field: 'name', label: 'Name' },
        { field: 'rarity', label: 'Rarity' },
        { field: 'type', label: 'Type' }
      ]
    case 'feats':
      return [
        { field: 'name', label: 'Name' },
        { field: 'level', label: 'Level' }
      ]
    case 'classes':
    case 'subclasses':
      return [
        { field: 'name', label: 'Name' },
        { field: 'type', label: 'Type' }
      ]
    case 'class-features':
      return [
        { field: 'name', label: 'Name' },
        { field: 'level', label: 'Level' },
        { field: 'type', label: 'Class' }
      ]
    case 'species':
    case 'backgrounds':
      return [
        { field: 'name', label: 'Name' },
        { field: 'type', label: 'Type' }
      ]
    case 'supernatural-gifts':
      return [
        { field: 'name', label: 'Name' },
        { field: 'type', label: 'Type' }
      ]
    case 'fighting-styles':
      return [
        { field: 'name', label: 'Name' },
        { field: 'type', label: 'Class' }
      ]
    case 'gear':
    case 'tools':
      return [
        { field: 'name', label: 'Name' },
        { field: 'cost', label: 'Cost' },
        { field: 'weight', label: 'Weight' }
      ]
    case 'vehicles':
    case 'mounts':
      return [
        { field: 'name', label: 'Name' },
        { field: 'cost', label: 'Cost' },
        { field: 'type', label: 'Size' }
      ]
    case 'siege-equipment':
      return [
        { field: 'name', label: 'Name' },
        { field: 'type', label: 'Size' }
      ]
    case 'conditions':
      return [
        { field: 'name', label: 'Name' },
        { field: 'type', label: 'Type' }
      ]
    case 'languages':
      return [
        { field: 'name', label: 'Name' },
        { field: 'type', label: 'Type' }
      ]
    case 'skills':
      return [
        { field: 'name', label: 'Name' },
        { field: 'type', label: 'Ability' }
      ]
    case 'traps':
      return [
        { field: 'name', label: 'Name' },
        { field: 'level', label: 'Level' }
      ]
    case 'hazards':
      return [
        { field: 'name', label: 'Name' },
        { field: 'level', label: 'Level' },
        { field: 'dc', label: 'Save DC' }
      ]
    case 'poisons':
      return [
        { field: 'name', label: 'Name' },
        { field: 'type', label: 'Type' },
        { field: 'rarity', label: 'Rarity' },
        { field: 'dc', label: 'Save DC' },
        { field: 'cost', label: 'Cost' }
      ]
    case 'diseases':
      return [
        { field: 'name', label: 'Name' },
        { field: 'type', label: 'Type' },
        { field: 'dc', label: 'Save DC' }
      ]
    case 'curses':
      return [
        { field: 'name', label: 'Name' },
        { field: 'type', label: 'Type' },
        { field: 'dc', label: 'Save DC' }
      ]
    case 'environmental-effects':
      return [
        { field: 'name', label: 'Name' },
        { field: 'type', label: 'Category' },
        { field: 'dc', label: 'Save DC' }
      ]
    case 'adventure-seeds':
      return [
        { field: 'name', label: 'Name' },
        { field: 'level', label: 'Level Range' }
      ]
    case 'encounter-presets':
      return [
        { field: 'name', label: 'Name' },
        { field: 'difficulty', label: 'Difficulty' },
        { field: 'level', label: 'Party Level' }
      ]
    case 'downtime':
      return [
        { field: 'name', label: 'Name' },
        { field: 'cost', label: 'Gold/Day' }
      ]
    case 'crafting':
      return [
        { field: 'name', label: 'Name' },
        { field: 'type', label: 'Tool' }
      ]
    case 'deities':
      return [
        { field: 'name', label: 'Name' },
        { field: 'type', label: 'Pantheon' }
      ]
    case 'planes':
      return [
        { field: 'name', label: 'Name' },
        { field: 'type', label: 'Category' }
      ]
    default:
      return [{ field: 'name', label: 'Name' }]
  }
}

export function getFilterConfigs(category: LibraryCategory | 'global' | null, items: LibraryItem[]): FilterConfig[] {
  const configs: FilterConfig[] = []

  // Source filter for all categories
  const sources = [...new Set(items.map((i) => i.source))].sort()
  if (sources.length > 1) {
    configs.push({ field: 'source', label: 'Source', values: sources })
  }

  // Helper to extract unique sorted string values from a data field
  const uniqueStrings = (field: string): string[] =>
    [...new Set(items.map((i) => (i.data[field] as string) ?? '').filter(Boolean))].sort()

  // Helper to extract unique sorted numeric values (as strings) from a data field
  const uniqueNumbers = (field: string): string[] =>
    [...new Set(items.map((i) => String(i.data[field] ?? '')).filter(Boolean))].sort((a, b) => Number(a) - Number(b))

  if (!category || category === 'global') {
    // Global filters
    const categories = [...new Set(items.map((i) => i.category))].sort()
    if (categories.length > 1) configs.push({ field: 'category', label: 'Category', values: categories })

    const rarities = [...new Set(items.map((i) => (i.data.rarity as string) ?? '').filter(Boolean))].sort(
      (a, b) => (RARITY_ORDER[a.toLowerCase()] ?? 0) - (RARITY_ORDER[b.toLowerCase()] ?? 0)
    )
    if (rarities.length > 1) configs.push({ field: 'rarity', label: 'Rarity', values: rarities })

    const levels = uniqueNumbers('level')
    if (levels.length > 1) configs.push({ field: 'level', label: 'Level', values: levels })

    const schools = uniqueStrings('school')
    if (schools.length > 1) configs.push({ field: 'school', label: 'School', values: schools })

    const types = uniqueStrings('type')
    if (types.length > 1) configs.push({ field: 'type', label: 'Type', values: types })

    const crs = uniqueStrings('cr')
    if (crs.length > 1) configs.push({ field: 'cr', label: 'CR', values: crs })

    return configs
  }

  switch (category) {
    case 'monsters':
    case 'creatures':
    case 'npcs':
    case 'companions': {
      const types = uniqueStrings('type')
      if (types.length > 1) configs.push({ field: 'type', label: 'Type', values: types })
      const sizes = uniqueStrings('size')
      if (sizes.length > 1) configs.push({ field: 'size', label: 'Size', values: sizes })
      break
    }
    case 'spells': {
      const schools = uniqueStrings('school')
      if (schools.length > 1) configs.push({ field: 'school', label: 'School', values: schools })
      const levels = uniqueNumbers('level')
      if (levels.length > 1) configs.push({ field: 'level', label: 'Level', values: levels })
      break
    }
    case 'invocations': {
      const levels = uniqueNumbers('levelRequirement')
      if (levels.length > 1) configs.push({ field: 'levelRequirement', label: 'Level Req.', values: levels })
      break
    }
    case 'weapons': {
      const cats = uniqueStrings('category')
      if (cats.length > 1) configs.push({ field: 'category', label: 'Category', values: cats })
      const dmgTypes = uniqueStrings('damageType')
      if (dmgTypes.length > 1) configs.push({ field: 'damageType', label: 'Damage Type', values: dmgTypes })
      break
    }
    case 'armor': {
      const cats = uniqueStrings('category')
      if (cats.length > 1) configs.push({ field: 'category', label: 'Category', values: cats })
      break
    }
    case 'magic-items': {
      const rarities = [...new Set(items.map((i) => (i.data.rarity as string) ?? '').filter(Boolean))].sort(
        (a, b) => (RARITY_ORDER[a.toLowerCase()] ?? 0) - (RARITY_ORDER[b.toLowerCase()] ?? 0)
      )
      if (rarities.length > 1) configs.push({ field: 'rarity', label: 'Rarity', values: rarities })
      const types = uniqueStrings('type')
      if (types.length > 1) configs.push({ field: 'type', label: 'Type', values: types })
      const attunement = [...new Set(items.map((i) => (i.data.attunement ? 'Yes' : 'No')))].sort()
      if (attunement.length > 1) configs.push({ field: 'attunement', label: 'Attunement', values: attunement })
      break
    }
    case 'feats': {
      const cats = uniqueStrings('category')
      if (cats.length > 1) configs.push({ field: 'category', label: 'Category', values: cats })
      const levels = uniqueNumbers('level')
      if (levels.length > 1) configs.push({ field: 'level', label: 'Level', values: levels })
      break
    }
    case 'classes':
    case 'subclasses': {
      const types = uniqueStrings('type')
      if (types.length > 1) configs.push({ field: 'type', label: 'Type', values: types })
      break
    }
    case 'class-features': {
      const classes = uniqueStrings('type')
      if (classes.length > 1) configs.push({ field: 'type', label: 'Class', values: classes })
      const levels = uniqueNumbers('level')
      if (levels.length > 1) configs.push({ field: 'level', label: 'Level', values: levels })
      break
    }
    case 'species': {
      const types = uniqueStrings('type')
      if (types.length > 1) configs.push({ field: 'type', label: 'Type', values: types })
      break
    }
    case 'backgrounds': {
      const types = uniqueStrings('type')
      if (types.length > 1) configs.push({ field: 'type', label: 'Type', values: types })
      break
    }
    case 'supernatural-gifts': {
      const types = uniqueStrings('type')
      if (types.length > 1) configs.push({ field: 'type', label: 'Type', values: types })
      break
    }
    case 'fighting-styles': {
      const classes = uniqueStrings('classRestriction')
      if (classes.length > 1) configs.push({ field: 'classRestriction', label: 'Class', values: classes })
      break
    }
    case 'gear':
    case 'tools': {
      const cats = uniqueStrings('category')
      if (cats.length > 1) configs.push({ field: 'category', label: 'Category', values: cats })
      break
    }
    case 'vehicles':
    case 'mounts': {
      const sizes = uniqueStrings('size')
      if (sizes.length > 1) configs.push({ field: 'size', label: 'Size', values: sizes })
      break
    }
    case 'siege-equipment': {
      const sizes = uniqueStrings('size')
      if (sizes.length > 1) configs.push({ field: 'size', label: 'Size', values: sizes })
      break
    }
    case 'conditions': {
      const types = uniqueStrings('type')
      if (types.length > 1) configs.push({ field: 'type', label: 'Type', values: types })
      break
    }
    case 'languages': {
      const types = uniqueStrings('type')
      if (types.length > 1) configs.push({ field: 'type', label: 'Type', values: types })
      const scripts = uniqueStrings('script')
      if (scripts.length > 1) configs.push({ field: 'script', label: 'Script', values: scripts })
      break
    }
    case 'skills': {
      const abilities = uniqueStrings('ability')
      if (abilities.length > 1) configs.push({ field: 'ability', label: 'Ability', values: abilities })
      break
    }
    case 'traps': {
      const levels = uniqueNumbers('level')
      if (levels.length > 1) configs.push({ field: 'level', label: 'Level', values: levels })
      break
    }
    case 'hazards': {
      const types = uniqueStrings('type')
      if (types.length > 1) configs.push({ field: 'type', label: 'Type', values: types })
      const levels = uniqueNumbers('level')
      if (levels.length > 1) configs.push({ field: 'level', label: 'Level', values: levels })
      break
    }
    case 'poisons': {
      const types = uniqueStrings('type')
      if (types.length > 1) configs.push({ field: 'type', label: 'Type', values: types })
      const rarities = [...new Set(items.map((i) => (i.data.rarity as string) ?? '').filter(Boolean))].sort(
        (a, b) => (RARITY_ORDER[a.toLowerCase()] ?? 0) - (RARITY_ORDER[b.toLowerCase()] ?? 0)
      )
      if (rarities.length > 1) configs.push({ field: 'rarity', label: 'Rarity', values: rarities })
      break
    }
    case 'diseases': {
      const types = uniqueStrings('type')
      if (types.length > 1) configs.push({ field: 'type', label: 'Type', values: types })
      const vectors = uniqueStrings('vector')
      if (vectors.length > 1) configs.push({ field: 'vector', label: 'Vector', values: vectors })
      break
    }
    case 'curses': {
      const types = uniqueStrings('type')
      if (types.length > 1) configs.push({ field: 'type', label: 'Type', values: types })
      break
    }
    case 'environmental-effects': {
      const cats = uniqueStrings('category')
      if (cats.length > 1) configs.push({ field: 'category', label: 'Category', values: cats })
      break
    }
    case 'encounter-presets': {
      const diffs = uniqueStrings('difficulty')
      if (diffs.length > 1) configs.push({ field: 'difficulty', label: 'Difficulty', values: diffs })
      const envs = uniqueStrings('environment')
      if (envs.length > 1) configs.push({ field: 'environment', label: 'Environment', values: envs })
      const levels = uniqueStrings('partyLevelRange')
      if (levels.length > 1) configs.push({ field: 'partyLevelRange', label: 'Party Level', values: levels })
      break
    }
    case 'deities': {
      const pantheons = uniqueStrings('type')
      if (pantheons.length > 1) configs.push({ field: 'type', label: 'Pantheon', values: pantheons })
      break
    }
    case 'planes': {
      const cats = uniqueStrings('type')
      if (cats.length > 1) configs.push({ field: 'type', label: 'Category', values: cats })
      break
    }
    case 'adventure-seeds': {
      const levels = uniqueStrings('levelRange')
      if (levels.length > 1) configs.push({ field: 'levelRange', label: 'Level Range', values: levels })
      break
    }
    case 'crafting': {
      const tools = uniqueStrings('tool')
      if (tools.length > 1) configs.push({ field: 'tool', label: 'Tool', values: tools })
      break
    }
    case 'sounds': {
      const subcats = uniqueStrings('subcategory')
      if (subcats.length > 1) configs.push({ field: 'subcategory', label: 'Subcategory', values: subcats })
      break
    }
  }

  return configs
}

const DIFFICULTY_ORDER: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  deadly: 4
}

function resolveLevel(data: Record<string, unknown>): number {
  const raw = data.level ?? data.levelRequirement
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    // Handle ranges like "1-4" by taking the lower bound
    const match = raw.match(/^(\d+)/)
    return match ? Number(match[1]) : 0
  }
  // partyLevelRange for encounter-presets (e.g. "1-4")
  const range = data.partyLevelRange
  if (typeof range === 'string') {
    const match = range.match(/^(\d+)/)
    return match ? Number(match[1]) : 0
  }
  // levelRange for adventure-seeds
  const lr = data.levelRange
  if (typeof lr === 'string') {
    const match = lr.match(/^(\d+)/)
    return match ? Number(match[1]) : 0
  }
  return 0
}

function resolveType(data: Record<string, unknown>): string {
  return String(data.type ?? data.category ?? data.ability ?? data.classRestriction ?? data.tool ?? '')
}

function resolveCost(data: Record<string, unknown>): number {
  return parseCost(data.cost ?? data.sorceryPointCost ?? data.goldCostPerDay ?? 0)
}

export function sortItems(items: LibraryItem[], field: SortField, direction: SortDirection): LibraryItem[] {
  const sorted = [...items].sort((a, b) => {
    let cmp = 0
    switch (field) {
      case 'name':
        cmp = a.name.localeCompare(b.name)
        break
      case 'cr':
        cmp = parseCR(a.data.cr) - parseCR(b.data.cr)
        break
      case 'level':
        cmp = resolveLevel(a.data) - resolveLevel(b.data)
        break
      case 'rarity':
        cmp =
          (RARITY_ORDER[String(a.data.rarity ?? '').toLowerCase()] ?? 0) -
          (RARITY_ORDER[String(b.data.rarity ?? '').toLowerCase()] ?? 0)
        break
      case 'cost':
        cmp = resolveCost(a.data) - resolveCost(b.data)
        break
      case 'weight':
        cmp = (Number(a.data.weight) || 0) - (Number(b.data.weight) || 0)
        break
      case 'type':
        cmp = resolveType(a.data).localeCompare(resolveType(b.data))
        break
      case 'school':
        cmp = String(a.data.school ?? '').localeCompare(String(b.data.school ?? ''))
        break
      case 'difficulty':
        cmp =
          (DIFFICULTY_ORDER[String(a.data.difficulty ?? '').toLowerCase()] ?? 0) -
          (DIFFICULTY_ORDER[String(b.data.difficulty ?? '').toLowerCase()] ?? 0)
        break
      case 'dc':
        cmp = (Number(a.data.saveDC) || 0) - (Number(b.data.saveDC) || 0)
        break
    }
    return direction === 'desc' ? -cmp : cmp
  })
  return sorted
}

export function filterItems(items: LibraryItem[], filters: Record<string, string[]>): LibraryItem[] {
  const activeFilters = Object.entries(filters).filter(([, vals]) => vals.length > 0)
  if (activeFilters.length === 0) return items

  return items.filter((item) => {
    for (const [field, values] of activeFilters) {
      if (field === 'source') {
        if (!values.includes(item.source)) return false
      } else if (field === 'category') {
        if (!values.includes(item.category)) return false
      } else if (field === 'attunement') {
        const hasAttunement = item.data.attunement ? 'Yes' : 'No'
        if (!values.includes(hasAttunement)) return false
      } else {
        const itemVal = String(item.data[field] ?? '')
        if (!values.includes(itemVal)) return false
      }
    }
    return true
  })
}

/** Compute total item counts per category (cached) */
const categoryCountsCache = new Map<string, number>()
let countsLoaded = false

export async function loadCategoryCounts(
  loader: (cat: LibraryCategory, hb: []) => Promise<LibraryItem[]>,
  categories: LibraryCategory[]
): Promise<Record<string, number>> {
  if (countsLoaded) return Object.fromEntries(categoryCountsCache)

  const results = await Promise.allSettled(categories.map((cat) => loader(cat, [])))
  for (let i = 0; i < categories.length; i++) {
    const r = results[i]
    if (r.status === 'fulfilled') {
      categoryCountsCache.set(categories[i], r.value.length)
    }
  }
  countsLoaded = true
  return Object.fromEntries(categoryCountsCache)
}
