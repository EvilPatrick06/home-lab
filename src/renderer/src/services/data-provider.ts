import { useDataStore } from '../stores/use-data-store'
import { getSystem } from '../systems/registry'
import type { BuildSlotCategory, DetailField, SelectableOption } from '../types/character-common'
import type {
  AbilityScoreConfigFile,
  AdventureSeedsFile,
  AmbientTracksFile,
  BackgroundData,
  BastionFacilitiesData,
  BuiltInMapEntry,
  ChaseTablesFile,
  ClassData,
  ClassFeaturesFile,
  ClassResourcesFile,
  CraftingToolEntry,
  CreatureTypesFile,
  CurrencyConfigEntry,
  DiceColorsFile,
  DiceTypeDef,
  DiseaseData,
  DmTabDef,
  EncounterBudgetsFile,
  EncounterPreset,
  EquipmentFile,
  FeatData,
  InvocationData,
  KeyboardShortcutDef,
  LanguageD12Entry,
  LightingTravelFile,
  MagicItemData,
  MetamagicData,
  ModerationFile,
  MonsterAction,
  MonsterSpeed,
  MonsterSpellcasting,
  MonsterStatBlock as MonsterStatBlockData,
  MonsterTrait,
  NotificationTemplatesFile,
  NpcNamesFile,
  PresetIcon,
  RandomTablesFile,
  RarityOptionEntry,
  SessionZeroConfigFile,
  SoundEventsFile,
  SpeciesData,
  SpeciesResourcesFile,
  SpeciesSpellsFile,
  SpellData,
  SubclassData,
  ThemesFile,
  TreasureTablesFile,
  TrinketsFile
} from '../types/data'
import type { MountData, MountsFile } from '../types/data/equipment-data-types'

type _MountData = MountData
type _MountsFile = MountsFile

import type {
  Curse,
  EnvironmentalEffect,
  Hazard,
  Poison,
  SiegeEquipment,
  SupernaturalGift,
  Trap
} from '../types/dm-toolbox'
import type { GameSystem } from '../types/game-system'
import { GAME_SYSTEMS } from '../types/game-system'
import type { MonsterStatBlock } from '../types/monster'
import type { MountedCombatState, MountStatBlock, VehicleStatBlock } from '../types/mount'

type _MountedCombatState = MountedCombatState
type _MountStatBlock = MountStatBlock
type _VehicleStatBlock = VehicleStatBlock

import { logger } from '../utils/logger'
import { DATA_PATHS } from './data-paths'
export { DATA_PATHS }

// Re-export world/data types for consumers that access them through data-provider
export type {
  BastionFacilitiesData,
  MonsterAction,
  MonsterSpeed,
  MonsterSpellcasting,
  MonsterStatBlockData,
  MonsterTrait,
  TrinketsFile,
  ThemesFile
}

const jsonCache = new Map<string, unknown>()

/** Resolve a data path key, checking plugin overrides before falling back to DATA_PATHS. */
function resolvePath(key: string): string {
  return resolveDataPath('dnd5e' as GameSystem, key) ?? (DATA_PATHS as Record<string, string>)[key]
}

export async function loadJson<T>(path: string): Promise<T> {
  const cached = jsonCache.get(path)
  if (cached !== undefined) return cached as T
  const data = (await window.api.game.loadJson(path)) as T
  jsonCache.set(path, data)
  return data
}

/** Invalidate all cached data (force re-fetch on next access). */
export function clearDataCache(): void {
  jsonCache.clear()
  useDataStore.getState().clearAll()
}

/**
 * Resolve a data path key for a given game system.
 * For 'dnd5e', returns the built-in DATA_PATHS value.
 * For plugin-provided systems, checks the system plugin's getDataPaths() override first.
 */
export function resolveDataPath(system: GameSystem, pathKey: string): string | undefined {
  if (system !== 'dnd5e') {
    try {
      const plugin = getSystem(system)
      if (plugin.getDataPaths) {
        const overrides = plugin.getDataPaths()
        if (overrides[pathKey]) return overrides[pathKey]
      }
    } catch {
      // System not registered — fall through
    }
  }
  return (DATA_PATHS as Record<string, string>)[pathKey]
}

// === 5e Transformers ===

/** Normalize source to a display string (handles string, object {book}, or undefined) */
function normalizeSource(source: unknown): string {
  if (typeof source === 'string') return source
  if (source && typeof source === 'object' && 'book' in source) return (source as { book: string }).book
  return 'SRD'
}

export function formatPrerequisites(prereqs: FeatData['prerequisites']): string[] {
  const parts: string[] = []
  if (prereqs.level) parts.push(`Level ${prereqs.level}`)
  if (prereqs.abilityScores) {
    for (const req of prereqs.abilityScores) {
      parts.push(`${req.abilities.join(' or ')} ${req.minimum}+`)
    }
  }
  return parts
}

function speciesToOption(species: SpeciesData): SelectableOption {
  const size = species.size
  const sizeStr =
    typeof size === 'string' ? size : size.type === 'choice' ? (size.options ?? []).join(' or ') : (size.value ?? '')

  const speed = typeof species.speed === 'number' ? species.speed : parseInt(String(species.speed), 10) || 30

  const details: DetailField[] = [
    { label: 'Speed', value: `${speed} ft.` },
    { label: 'Size', value: sizeStr },
    { label: 'Creature Type', value: species.creatureType }
  ]

  if (species.darkvision) {
    details.push({ label: 'Darkvision', value: `${species.darkvision} ft.` })
  }

  for (const trait of species.traits) {
    details.push({ label: trait.name, value: typeof trait.description === 'string' ? trait.description : '' })
  }

  return {
    id: species.id,
    name: species.name,
    rarity: 'common',
    description: `${species.creatureType} - Speed: ${speed} ft.`,
    traits: species.traits.map((t) => t.name),
    source: normalizeSource(species.source),
    detailFields: details
  }
}

function classToOption(cls: ClassData): SelectableOption {
  const ct = cls.coreTraits
  const details: DetailField[] = [
    { label: 'Hit Point Die', value: ct.hitPointDie },
    { label: 'Primary Ability', value: ct.primaryAbility.join(', ') },
    { label: 'Saving Throws', value: ct.savingThrowProficiencies.join(', ') },
    { label: 'Armor Training', value: ct.armorTraining.join(', ') || 'None' },
    {
      label: 'Weapon Proficiencies',
      value:
        ct.weaponProficiencies
          .map((w) => w.category ?? '')
          .filter(Boolean)
          .join(', ') || 'None'
    },
    {
      label: 'Skills',
      value: `Choose ${ct.skillProficiencies.count} from: ${Array.isArray(ct.skillProficiencies.from) ? ct.skillProficiencies.from.join(', ') : ct.skillProficiencies.from}`
    }
  ]

  if (ct.startingEquipment.length > 0) {
    details.push({
      label: 'Starting Equipment',
      value: ct.startingEquipment.map((e) => `${e.label}: ${e.items.join(', ')} (${e.gp} gp)`).join(' | ')
    })
  }

  return {
    id: cls.id ?? cls.name.toLowerCase(),
    name: cls.name,
    rarity: 'common',
    description: `${ct.hitPointDie} | Primary: ${ct.primaryAbility.join(', ')}`,
    traits: [],
    source: 'SRD',
    detailFields: details
  }
}

function backgroundToOption(bg: BackgroundData): SelectableOption {
  const toolProf =
    typeof bg.toolProficiency === 'string'
      ? bg.toolProficiency
      : ((bg.toolProficiency as { type?: string })?.type ?? 'None')
  const details: DetailField[] = [
    {
      label: 'Skill Proficiencies',
      value: Array.isArray(bg.skillProficiencies)
        ? bg.skillProficiencies.join(', ')
        : String(bg.skillProficiencies ?? '')
    },
    { label: 'Tool Proficiency', value: toolProf || 'None' },
    { label: 'Feat', value: bg.feat },
    {
      label: 'Ability Scores',
      value: Array.isArray(bg.abilityScores) ? bg.abilityScores.join(', ') : String(bg.abilityScores ?? '')
    }
  ]

  const equipment = Array.isArray(bg.equipment) ? bg.equipment : []
  if (equipment.length > 0) {
    const eqValue =
      typeof equipment[0] === 'string'
        ? (equipment as unknown as string[]).join(', ')
        : equipment.map((e) => `Option ${e.option}: ${e.items.join(', ')}`).join(' | ')
    details.push({ label: 'Equipment', value: eqValue })
  }

  return {
    id: bg.id,
    name: bg.name,
    rarity: 'common',
    description: bg.description || `Skills: ${bg.skillProficiencies.join(', ')}`,
    traits: [],
    source: normalizeSource(bg.source),
    detailFields: details
  }
}

// === Feat/Subclass Transformers ===

function feat5eToOption(feat: FeatData): SelectableOption {
  const details: DetailField[] = [
    { label: 'Category', value: feat.category },
    { label: 'Level', value: `${feat.prerequisites.level ?? 'None'}` }
  ]
  const prereqParts: string[] = []
  if (feat.prerequisites.level) prereqParts.push(`Level ${feat.prerequisites.level}`)
  if (feat.prerequisites.abilityScores) {
    for (const req of feat.prerequisites.abilityScores) {
      prereqParts.push(`${req.abilities.join(' or ')} ${req.minimum}+`)
    }
  }
  if (prereqParts.length > 0) {
    details.push({ label: 'Prerequisites', value: prereqParts.join(', ') })
  }
  if (feat.abilityScoreIncrease) {
    const asi = feat.abilityScoreIncrease
    const value = asi.options.map((o) => `+${o.amount} ${o.abilities.join(' or ')}`).join('; ')
    details.push({ label: 'Ability Score Increase', value })
  }
  if (feat.repeatable) {
    details.push({ label: 'Repeatable', value: feat.repeatable.restriction ?? 'Yes' })
  }
  const description = feat.benefits.map((b) => b.description).join(' ')
  return {
    id: feat.id,
    name: feat.name,
    rarity: 'common',
    description,
    traits: [feat.category],
    source: normalizeSource(feat.source),
    detailFields: details
  }
}

function subclassToOption(sc: SubclassData): SelectableOption {
  const details: DetailField[] = [
    { label: 'Class', value: sc.className ?? '' },
    { label: 'Level', value: `${sc.level ?? ''}` }
  ]
  for (const feat of sc.features) {
    details.push({ label: feat.name, value: feat.description })
  }
  return {
    id: sc.id ?? sc.name.toLowerCase().replace(/\s+/g, '-'),
    name: sc.name,
    rarity: 'common',
    description: sc.description,
    traits: [],
    source: 'SRD',
    detailFields: details
  }
}

// === Main Loader ===

export async function getOptionsForSlot(
  system: GameSystem,
  category: BuildSlotCategory,
  context?: { slotId?: string; selectedClassId?: string }
): Promise<SelectableOption[]> {
  const systemConfig = GAME_SYSTEMS[system]
  if (!systemConfig) return []

  if (system === 'dnd5e') {
    switch (category) {
      case 'ancestry': {
        const speciesList = await load5eSpecies()
        return speciesList.map(speciesToOption)
      }
      case 'heritage': {
        if (context?.selectedClassId) {
          // selectedClassId is repurposed to pass speciesId for heritage options
          return getHeritageOptions5e(context.selectedClassId)
        }
        return []
      }
      case 'class': {
        try {
          const classes = await load5eClasses()
          const valid = classes.filter((cls) => {
            if (!cls?.coreTraits) {
              logger.warn('[DataProvider] Class entry missing coreTraits:', JSON.stringify(cls).slice(0, 200))
              return false
            }
            return true
          })
          return valid.map(classToOption)
        } catch (error) {
          logger.error('[DataProvider] Failed to load classes:', error)
          return []
        }
      }
      case 'background': {
        const bgs = await load5eBackgrounds()
        return bgs.map(backgroundToOption)
      }
      case 'class-feat': {
        // Subclass selection for 5e
        try {
          const subclasses = await load5eSubclasses()
          const filtered = context?.selectedClassId
            ? subclasses.filter((sc) => sc.className?.toLowerCase() === context.selectedClassId)
            : subclasses
          return filtered.map(subclassToOption)
        } catch (error) {
          logger.error('[DataProvider] Failed to load subclasses:', error)
          return []
        }
      }
      case 'epic-boon': {
        const feats = await load5eFeats('Epic Boon')
        return feats.map(feat5eToOption)
      }
      case 'fighting-style': {
        let feats = await load5eFeats('Fighting Style')
        // Filter class-restricted fighting styles based on prerequisites
        if (context?.selectedClassId) {
          feats = feats.filter((f) => {
            const prereqs = formatPrerequisites(f.prerequisites)
            return prereqs.length === 0 || prereqs.some((p) => p.toLowerCase().includes(context.selectedClassId!))
          })
        }
        const options = feats.map(feat5eToOption)
        // Add Druidic Warrior for Rangers (alternative to Fighting Style feat)
        if (context?.selectedClassId === 'ranger') {
          options.push({
            id: 'druidic-warrior',
            name: 'Druidic Warrior',
            rarity: 'common' as const,
            description:
              'You learn two Druid cantrips of your choice (Guidance and Starry Wisp are recommended). The chosen cantrips count as Ranger spells for you, and Wisdom is your spellcasting ability for them. Whenever you gain a Ranger level, you can replace one of these cantrips with another Druid cantrip.',
            traits: [],
            source: 'PHB 2024',
            detailFields: []
          })
        }
        return options
      }
      case 'primal-order': {
        return [
          {
            id: 'magician',
            name: 'Magician',
            rarity: 'common',
            description:
              'You know one extra cantrip from the Primal spell list. In addition, your mystical connection to nature gives you a bonus to your Intelligence (Arcana or Nature) checks equal to your Wisdom modifier (minimum bonus of +1).',
            traits: [],
            source: 'SRD',
            detailFields: [
              { label: 'Bonus Cantrip', value: '+1 Primal cantrip' },
              { label: 'Skill Bonus', value: 'Arcana/Nature checks + WIS modifier (min +1)' }
            ]
          },
          {
            id: 'warden',
            name: 'Warden',
            rarity: 'common',
            description:
              'Trained for battle, you gain proficiency with Martial weapons and training with Medium armor.',
            traits: [],
            source: 'SRD',
            detailFields: [
              { label: 'Armor', value: 'Medium armor proficiency' },
              { label: 'Weapons', value: 'Martial weapons proficiency' }
            ]
          }
        ]
      }
      case 'divine-order': {
        return [
          {
            id: 'protector',
            name: 'Protector',
            rarity: 'common',
            description: 'Trained for battle, you gain proficiency with Martial weapons and training with Heavy armor.',
            traits: [],
            source: 'SRD',
            detailFields: [
              { label: 'Armor', value: 'Heavy armor proficiency' },
              { label: 'Weapons', value: 'Martial weapons proficiency' }
            ]
          },
          {
            id: 'thaumaturge',
            name: 'Thaumaturge',
            rarity: 'common',
            description:
              'You know one extra cantrip from the Divine spell list. In addition, your mystical connection to the divine gives you a bonus to Intelligence (Religion) checks equal to your Wisdom modifier (minimum bonus of +1).',
            traits: [],
            source: 'SRD',
            detailFields: [
              { label: 'Bonus Cantrip', value: '+1 Divine cantrip' },
              { label: 'Skill Bonus', value: 'Religion checks + WIS modifier (min +1)' }
            ]
          }
        ]
      }
      default:
        return []
    }
  }

  return []
}

// All named loaders go through the centralized DataStore for caching + homebrew merge
const ds = () => useDataStore.getState()

// Generic index-based loader: loads index.json, then fetches each individual file
interface IndexEntry {
  id: string
  path: string
  [key: string]: unknown
}

async function loadFromIndex<T extends { id?: string }>(indexPath: string): Promise<T[]> {
  const index = await loadJson<IndexEntry[]>(indexPath)
  const results = await Promise.all(
    index
      .filter((entry) => entry.path)
      .map(async (entry) => {
        try {
          const item = await loadJson<T>(`./data/5e/${entry.path}`)
          if (!item.id) (item as Record<string, unknown>).id = entry.id
          return item
        } catch {
          logger.warn(`[DataProvider] Failed to load: ${entry.path}`)
          return null
        }
      })
  )
  return results.filter((r): r is NonNullable<typeof r> => r !== null) as T[]
}

export async function load5eSpecies(): Promise<SpeciesData[]> {
  return ds().get('species', () => loadFromIndex<SpeciesData>(resolvePath('speciesIndex')))
}

export async function load5eClasses(): Promise<ClassData[]> {
  return ds().get('classes', () => loadFromIndex<ClassData>(resolvePath('classIndex')))
}

export async function load5eBackgrounds(): Promise<BackgroundData[]> {
  return ds().get('backgrounds', () => loadFromIndex<BackgroundData>(resolvePath('backgroundIndex')))
}

export async function load5eSubclasses(): Promise<SubclassData[]> {
  return ds().get('subclasses', () => loadJson<SubclassData[]>(resolvePath('subclasses')))
}

export async function load5eFeats(category?: string): Promise<FeatData[]> {
  const feats = await ds().get('feats', () => loadFromIndex<FeatData>(resolvePath('featIndex')))
  if (category) return feats.filter((f) => f.category === category)
  return feats
}

export async function load5eSpells(): Promise<SpellData[]> {
  return ds().get('spells', () => loadJson<SpellData[]>(resolvePath('spells')))
}

export async function load5eClassFeatures(): Promise<ClassFeaturesFile> {
  return ds().get('classFeatures', () => loadJson<ClassFeaturesFile>(resolvePath('classFeatures')))
}

export async function load5eEquipment(): Promise<EquipmentFile> {
  return ds().get('equipment', () => loadJson<EquipmentFile>(resolvePath('equipment')))
}

export async function load5eTools(): Promise<Record<string, unknown>[]> {
  return ds().get('tools', async () => {
    const index = await loadJson<IndexEntry[]>(resolvePath('toolsIndex'))
    const results = await Promise.all(
      index
        .filter((entry) => entry.path)
        .map(async (entry) => {
          try {
            const item = await loadJson<Record<string, unknown>>(`./data/5e/${entry.path}`)
            if (!item.id) item.id = entry.id
            return item
          } catch {
            return null
          }
        })
    )
    return results.filter((r): r is NonNullable<typeof r> => r !== null)
  })
}

export async function load5eCrafting(): Promise<CraftingToolEntry[]> {
  return ds().get('crafting', () => loadJson<CraftingToolEntry[]>(resolvePath('crafting')))
}

export async function load5eDiseases(): Promise<DiseaseData[]> {
  return ds().get('diseases', () => loadJson<DiseaseData[]>(resolvePath('diseases')))
}

export async function load5eEncounterBudgets(): Promise<EncounterBudgetsFile> {
  return ds().get('encounterBudgets', () => loadJson<EncounterBudgetsFile>(resolvePath('encounterBudgets')))
}

export async function load5eTreasureTables(): Promise<TreasureTablesFile> {
  return ds().get('treasureTables', () => loadJson<TreasureTablesFile>(resolvePath('treasureTables')))
}

export async function load5eRandomTables(): Promise<RandomTablesFile> {
  return ds().get('randomTables', () => loadJson<RandomTablesFile>(resolvePath('randomTables')))
}

export async function load5eChaseTables(): Promise<ChaseTablesFile> {
  return ds().get('chaseTables', () => loadJson<ChaseTablesFile>(resolvePath('chaseTables')))
}

export async function load5eEncounterPresets(): Promise<EncounterPreset[]> {
  return ds().get('encounterPresets', () => loadJson<EncounterPreset[]>(resolvePath('encounterPresets')))
}

export async function load5eNpcNames(): Promise<NpcNamesFile> {
  return ds().get('npcNames', () => loadJson<NpcNamesFile>(resolvePath('npcNames')))
}

export async function load5eInvocations(): Promise<InvocationData[]> {
  return ds().get('invocations', () => loadJson<InvocationData[]>(resolvePath('invocations')))
}

export async function load5eMetamagic(): Promise<MetamagicData[]> {
  return ds().get('metamagic', () => loadJson<MetamagicData[]>(resolvePath('metamagic')))
}

export async function load5eBastionFacilities(): Promise<import('../types/bastion').BastionFacilitiesData> {
  return ds().get('bastionFacilities', () =>
    loadJson<import('../types/bastion').BastionFacilitiesData>(resolvePath('bastionFacilities'))
  )
}

export async function load5eMagicItems(rarity?: string): Promise<MagicItemData[]> {
  const items = await ds().get('magicItems', () => loadJson<MagicItemData[]>(resolvePath('magicItems')))
  if (rarity) return items.filter((item) => item.rarity === rarity)
  return items
}

export async function getHeritageOptions5e(speciesId: string): Promise<SelectableOption[]> {
  const speciesList = await load5eSpecies()
  const species = speciesList.find((s) => s.id === speciesId)
  if (!species) return []

  // Find traits with lineage choices (e.g., Elven Lineage)
  const lineageTrait = species.traits.find((t) => t.lineageChoices)
  if (!lineageTrait?.lineageChoices) return []

  return lineageTrait.lineageChoices.options.map((option) => {
    const details: DetailField[] = [{ label: 'Species', value: species.name }]
    if (option.description) {
      details.push({ label: 'Description', value: option.description })
    }
    if (option.darkvisionOverride) {
      details.push({ label: 'Darkvision', value: `${option.darkvisionOverride} ft.` })
    }
    if (option.speedOverride) {
      details.push({ label: 'Speed', value: `${option.speedOverride} ft.` })
    }
    if (option.cantrips?.length) {
      details.push({ label: 'Cantrips', value: option.cantrips.join(', ') })
    }
    return {
      id: option.name.toLowerCase().replace(/\s+/g, '-'),
      name: option.name,
      rarity: 'common' as const,
      description: option.description ?? '',
      traits: [],
      source: normalizeSource(species.source),
      detailFields: details
    }
  })
}

// === Monster Data ===

export async function load5eMonsters(): Promise<MonsterStatBlock[]> {
  return ds().get('monsters', () => loadJson<MonsterStatBlock[]>(resolvePath('monsters')))
}

export async function load5eMonsterById(id: string): Promise<MonsterStatBlock | undefined> {
  const all = await loadAllStatBlocks()
  return all.find((m) => m.id === id)
}

export function searchMonsters(monsters: MonsterStatBlock[], query: string): MonsterStatBlock[] {
  const q = query.toLowerCase().trim()
  if (!q) return monsters
  return monsters.filter(
    (m) =>
      m.name.toLowerCase().includes(q) ||
      m.type.toLowerCase().includes(q) ||
      m.group?.toLowerCase().includes(q) ||
      m.subtype?.toLowerCase().includes(q) ||
      m.tags?.some((t) => t.toLowerCase().includes(q))
  )
}

// === NPC & Creature Data ===

export async function load5eNpcs(): Promise<MonsterStatBlock[]> {
  return ds().get('npcs', () => loadJson<MonsterStatBlock[]>(resolvePath('npcs')))
}

export async function load5eCreatures(): Promise<MonsterStatBlock[]> {
  return ds().get('creatures', () => loadJson<MonsterStatBlock[]>(resolvePath('creatures')))
}

export async function loadAllStatBlocks(): Promise<MonsterStatBlock[]> {
  const [monsters, npcs, creatures] = await Promise.all([load5eMonsters(), load5eNpcs(), load5eCreatures()])
  return [...monsters, ...npcs, ...creatures]
}

export async function loadStatBlockById(id: string): Promise<MonsterStatBlock | undefined> {
  const all = await loadAllStatBlocks()
  return all.find((m) => m.id === id)
}

// === DM Toolbox Data ===

export async function load5eTraps(): Promise<Trap[]> {
  return ds().get('traps', () => loadJson<Trap[]>(resolvePath('traps')))
}

export async function load5eHazards(): Promise<Hazard[]> {
  return ds().get('hazards', () => loadJson<Hazard[]>(resolvePath('hazards')))
}

export async function load5ePoisons(): Promise<Poison[]> {
  return ds().get('poisons', () => loadJson<Poison[]>(resolvePath('poisons')))
}

export async function load5eEnvironmentalEffects(): Promise<EnvironmentalEffect[]> {
  return ds().get('environmentalEffects', () => loadJson<EnvironmentalEffect[]>(resolvePath('environmentalEffects')))
}

export async function load5eCurses(): Promise<Curse[]> {
  return ds().get('curses', () => loadJson<Curse[]>(resolvePath('curses')))
}

export async function load5eSupernaturalGifts(): Promise<SupernaturalGift[]> {
  return ds().get('supernaturalGifts', () => loadJson<SupernaturalGift[]>(resolvePath('supernaturalGifts')))
}

export async function load5eSiegeEquipment(): Promise<SiegeEquipment[]> {
  return ds().get('siegeEquipment', () => loadJson<SiegeEquipment[]>(resolvePath('siegeEquipment')))
}

export async function load5eSettlements(): Promise<import('../types/dm-toolbox').Settlement[]> {
  return ds().get('settlements', async () => {
    const file = await loadJson<{ sizes: import('../types/dm-toolbox').Settlement[] }>(resolvePath('settlements'))
    return file.sizes
  })
}

export async function load5eMounts(): Promise<import('../types/mount').MountStatBlock[]> {
  return ds().get('mounts', async () => {
    const file = await loadJson<{ mounts: import('../types/mount').MountStatBlock[] }>(resolvePath('mounts'))
    return file.mounts
  })
}

export async function load5eVehicles(): Promise<import('../types/mount').VehicleStatBlock[]> {
  return ds().get('vehicles', async () => {
    const file = await loadJson<{ vehicles: import('../types/mount').VehicleStatBlock[] }>(resolvePath('mounts'))
    return file.vehicles
  })
}

// === Extracted Data Loaders ===

export interface ConditionEntry {
  id: string
  name: string
  type: 'condition' | 'buff'
  description: string
  source: string
  system: string
  hasValue: boolean
  maxValue: number | null
}

export async function load5eConditions(): Promise<ConditionEntry[]> {
  return ds().get('conditions', () => loadJson<ConditionEntry[]>(resolvePath('conditions')))
}

export interface LanguageEntry {
  id: string
  name: string
  type: string
  script: string | null
  typicalSpeakers: string
  description: string
  source: string
}

export async function load5eLanguages(): Promise<LanguageEntry[]> {
  return ds().get('languages', () => loadJson<LanguageEntry[]>(resolvePath('languages')))
}

export interface WeaponMasteryEntry {
  id: string
  name: string
  description: string
  source: string
}

export async function load5eWeaponMastery(): Promise<WeaponMasteryEntry[]> {
  return ds().get('weaponMastery', () => loadJson<WeaponMasteryEntry[]>(resolvePath('weaponMastery')))
}

export interface SkillEntry {
  id: string
  name: string
  ability: string
  description: string
  exampleDCs: { easy: number; moderate: number; hard: number }
  uses?: string
  source: string
}

export async function load5eSkills(): Promise<SkillEntry[]> {
  return ds().get('skills', () => loadJson<SkillEntry[]>(resolvePath('skills')))
}

export interface VariantItemEntry {
  label: string
  variants: string[]
}

export async function load5eVariantItems(): Promise<Record<string, VariantItemEntry>> {
  return ds().get('variantItems', () => loadJson<Record<string, VariantItemEntry>>(resolvePath('variantItems')))
}

export interface LightSourceEntry {
  label: string
  durationSeconds: number | null
  brightRadius: number
  dimRadius: number
}

export async function load5eLightSources(): Promise<Record<string, LightSourceEntry>> {
  return ds().get('lightSources', () => loadJson<Record<string, LightSourceEntry>>(resolvePath('lightSources')))
}

export async function load5eNpcAppearance(): Promise<Record<string, string[]>> {
  return ds().get('npcAppearance', () => loadJson<Record<string, string[]>>(resolvePath('npcAppearance')))
}

export async function load5eNpcMannerisms(): Promise<Record<string, string[]>> {
  return ds().get('npcMannerisms', () => loadJson<Record<string, string[]>>(resolvePath('npcMannerisms')))
}

export async function load5eAlignmentDescriptions(): Promise<Record<string, string>> {
  return ds().get('alignmentDescriptions', () => loadJson<Record<string, string>>(resolvePath('alignmentDescriptions')))
}

export async function load5eWearableItems(): Promise<string[]> {
  return ds().get('wearableItems', () => loadJson<string[]>(resolvePath('wearableItems')))
}

export async function load5ePersonalityTables(): Promise<{
  ability: Record<string, { high: string[]; low: string[] }>
  alignment: Record<string, string[]>
}> {
  return ds().get('personalityTables', () =>
    loadJson<{ ability: Record<string, { high: string[]; low: string[] }>; alignment: Record<string, string[]> }>(
      resolvePath('personalityTables')
    )
  )
}

export async function load5eXpThresholds(): Promise<number[]> {
  return ds().get('xpThresholds', () => loadJson<number[]>(resolvePath('xpThresholds')))
}

export async function load5eStartingEquipment(): Promise<
  Array<{
    minLevel: number
    maxLevel: number
    baseGold: number
    diceCount: number
    diceMultiplier: number
    magicItems: Record<string, number>
  }>
> {
  return ds().get('startingEquipment', () =>
    loadJson<
      Array<{
        minLevel: number
        maxLevel: number
        baseGold: number
        diceCount: number
        diceMultiplier: number
        magicItems: Record<string, number>
      }>
    >(resolvePath('startingEquipment'))
  )
}

export async function load5eBastionEvents(): Promise<Record<string, unknown>> {
  return ds().get('bastionEvents', () => loadJson<Record<string, unknown>>(resolvePath('bastionEvents')))
}

export async function load5eSentientItems(): Promise<Record<string, unknown>> {
  return ds().get('sentientItems', () => loadJson<Record<string, unknown>>(resolvePath('sentientItems')))
}

export async function load5eWeatherGeneration(): Promise<Record<string, unknown>> {
  return ds().get('weatherGeneration', () => loadJson<Record<string, unknown>>(resolvePath('weatherGeneration')))
}

export async function load5eCalendarPresets(): Promise<Record<string, unknown>> {
  return ds().get('calendarPresets', () => loadJson<Record<string, unknown>>(resolvePath('calendarPresets')))
}

export async function load5eEffectDefinitions(): Promise<Record<string, unknown>> {
  return ds().get('effectDefinitions', () => loadJson<Record<string, unknown>>(resolvePath('effectDefinitions')))
}

export async function load5eSpellSlots(): Promise<Record<string, unknown>> {
  return ds().get('spellSlots', () => loadJson<Record<string, unknown>>(resolvePath('spellSlots')))
}

export async function load5eFightingStyles(): Promise<Record<string, unknown>[]> {
  return ds().get('fightingStyles', () => loadJson<Record<string, unknown>[]>(resolvePath('fightingStyles')))
}

export async function load5eDowntime(): Promise<Record<string, unknown>[]> {
  return ds().get('downtime', () => loadJson<Record<string, unknown>[]>(resolvePath('downtime')))
}

export async function load5eTrinkets(): Promise<Record<string, unknown>[]> {
  return ds().get('trinkets', () => loadJson<Record<string, unknown>[]>(resolvePath('trinkets')))
}

export async function load5eSounds(): Promise<Record<string, unknown>[]> {
  const events = await load5eSoundEvents()
  return events.soundFileMappings as unknown as Record<string, unknown>[]
}

export async function load5eSoundEvents(): Promise<SoundEventsFile> {
  return ds().get('soundEvents', () => loadJson<SoundEventsFile>(resolvePath('soundEvents')))
}

export async function load5eSpeciesSpells(): Promise<SpeciesSpellsFile> {
  return ds().get('speciesSpells', () => loadJson<SpeciesSpellsFile>(resolvePath('speciesSpells')))
}

export async function load5eClassResources(): Promise<ClassResourcesFile> {
  return ds().get('classResources', () => loadJson<ClassResourcesFile>(resolvePath('classResources')))
}

export async function load5eSpeciesResources(): Promise<SpeciesResourcesFile> {
  return ds().get('speciesResources', () => loadJson<SpeciesResourcesFile>(resolvePath('speciesResources')))
}

export async function load5eAbilityScoreConfig(): Promise<AbilityScoreConfigFile> {
  return ds().get('abilityScoreConfig', () => loadJson<AbilityScoreConfigFile>(resolvePath('abilityScoreConfig')))
}

export async function load5ePresetIcons(): Promise<PresetIcon[]> {
  return ds().get('presetIcons', () => loadJson<PresetIcon[]>(resolvePath('presetIcons')))
}

export async function load5eKeyboardShortcuts(): Promise<KeyboardShortcutDef[]> {
  return ds().get('keyboardShortcuts', () => loadJson<KeyboardShortcutDef[]>(resolvePath('keyboardShortcuts')))
}

export async function load5eThemes(): Promise<Record<string, Record<string, string>>> {
  return ds().get('themes', () => loadJson<Record<string, Record<string, string>>>(resolvePath('themes')))
}

export async function load5eDiceColors(): Promise<DiceColorsFile> {
  return ds().get('diceColors', () => loadJson<DiceColorsFile>(resolvePath('diceColors')))
}

export async function load5eDmTabs(): Promise<DmTabDef[]> {
  return ds().get('dmTabs', () => loadJson<DmTabDef[]>(resolvePath('dmTabs')))
}

export async function load5eNotificationTemplates(): Promise<NotificationTemplatesFile> {
  return ds().get('notificationTemplates', () =>
    loadJson<NotificationTemplatesFile>(resolvePath('notificationTemplates'))
  )
}

export async function load5eBuiltInMaps(): Promise<BuiltInMapEntry[]> {
  return ds().get('builtInMaps', () => loadJson<BuiltInMapEntry[]>(resolvePath('builtInMaps')))
}

export async function load5eSessionZeroConfig(): Promise<SessionZeroConfigFile> {
  return ds().get('sessionZeroConfig', () => loadJson<SessionZeroConfigFile>(resolvePath('sessionZeroConfig')))
}

export async function load5eDiceTypes(): Promise<DiceTypeDef[]> {
  return ds().get('diceTypes', () => loadJson<DiceTypeDef[]>(resolvePath('diceTypes')))
}

export async function load5eLightingTravel(): Promise<LightingTravelFile> {
  return ds().get('lightingTravel', () => loadJson<LightingTravelFile>(resolvePath('lightingTravel')))
}

export async function load5eCurrencyConfig(): Promise<CurrencyConfigEntry[]> {
  return ds().get('currencyConfig', () => loadJson<CurrencyConfigEntry[]>(resolvePath('currencyConfig')))
}

export async function load5eModeration(): Promise<ModerationFile> {
  return ds().get('moderation', () => loadJson<ModerationFile>(resolvePath('moderation')))
}

// --- Round 2 loaders ---

export async function load5eAdventureSeeds(): Promise<AdventureSeedsFile> {
  return ds().get('adventureSeeds', () => loadJson<AdventureSeedsFile>(resolvePath('adventureSeeds')))
}

export async function load5eCreatureTypes(): Promise<CreatureTypesFile> {
  return ds().get('creatureTypes', () => loadJson<CreatureTypesFile>(resolvePath('creatureTypes')))
}

export async function load5eAmbientTracks(): Promise<AmbientTracksFile> {
  return ds().get('ambientTracks', () => loadJson<AmbientTracksFile>(resolvePath('ambientTracks')))
}

export async function load5eLanguageD12Table(): Promise<LanguageD12Entry[]> {
  return ds().get('languageD12Table', () => loadJson<LanguageD12Entry[]>(resolvePath('languageD12Table')))
}

export async function load5eRarityOptions(): Promise<RarityOptionEntry[]> {
  return ds().get('rarityOptions', () => loadJson<RarityOptionEntry[]>(resolvePath('rarityOptions')))
}

// --- Round 3 loaders (companions, deities, planes) ---

const COMPANION_FILES = [
  './data/5e/character/companions/mounts/riding-horse-mount.json',
  './data/5e/character/companions/mounts/warhorse-mount.json',
  './data/5e/character/companions/mounts/pony-mount.json',
  './data/5e/character/companions/pets/owl-companion.json',
  './data/5e/character/companions/pets/hawk-companion.json',
  './data/5e/character/companions/pets/cat-companion.json',
  './data/5e/character/companions/hirelings/hireling-skilled.json',
  './data/5e/character/companions/hirelings/hireling-unskilled.json',
  './data/5e/character/companions/hirelings/hireling-mercenary.json'
]

export async function load5eCompanions(): Promise<Record<string, unknown>[]> {
  return ds().get('companions', async () => {
    const results = await Promise.all(
      COMPANION_FILES.map(async (path) => {
        try {
          return await loadJson<Record<string, unknown>>(path)
        } catch {
          logger.warn(`[DataProvider] Failed to load companion: ${path}`)
          return null
        }
      })
    )
    return results.filter((r): r is Record<string, unknown> => r !== null)
  })
}

const DEITY_FILES = [
  './data/5e/world/deities/forgotten-realms/kelemvor.json',
  './data/5e/world/deities/forgotten-realms/lathander.json',
  './data/5e/world/deities/forgotten-realms/mystra.json',
  './data/5e/world/deities/forgotten-realms/selune.json',
  './data/5e/world/deities/forgotten-realms/sune.json',
  './data/5e/world/deities/forgotten-realms/tempus.json',
  './data/5e/world/deities/forgotten-realms/torm.json',
  './data/5e/world/deities/forgotten-realms/tyr.json',
  './data/5e/world/deities/pantheons/celtic.json',
  './data/5e/world/deities/pantheons/egyptian.json',
  './data/5e/world/deities/pantheons/greek.json',
  './data/5e/world/deities/pantheons/norse.json'
]

export async function load5eDeities(): Promise<Record<string, unknown>[]> {
  return ds().get('deities', async () => {
    const results = await Promise.all(
      DEITY_FILES.map(async (path) => {
        try {
          return await loadJson<Record<string, unknown>>(path)
        } catch {
          logger.warn(`[DataProvider] Failed to load deity: ${path}`)
          return null
        }
      })
    )
    return results.filter((r): r is Record<string, unknown> => r !== null)
  })
}

const PLANE_FILES = [
  './data/5e/world/planes/material/material-plane.json',
  './data/5e/world/planes/inner/elemental-plane-of-air.json',
  './data/5e/world/planes/inner/elemental-plane-of-earth.json',
  './data/5e/world/planes/inner/elemental-plane-of-fire.json',
  './data/5e/world/planes/inner/elemental-plane-of-water.json',
  './data/5e/world/planes/transitive/astral-plane.json',
  './data/5e/world/planes/transitive/ethereal-plane.json',
  './data/5e/world/planes/transitive/feywild.json',
  './data/5e/world/planes/transitive/shadowfell.json',
  './data/5e/world/planes/outer/abyss.json',
  './data/5e/world/planes/outer/acheron.json',
  './data/5e/world/planes/outer/arborea.json',
  './data/5e/world/planes/outer/arcadia.json',
  './data/5e/world/planes/outer/beastlands.json',
  './data/5e/world/planes/outer/bytopia.json',
  './data/5e/world/planes/outer/carceri.json',
  './data/5e/world/planes/outer/elysium.json',
  './data/5e/world/planes/outer/gehenna.json',
  './data/5e/world/planes/outer/hades.json',
  './data/5e/world/planes/outer/limbo.json',
  './data/5e/world/planes/outer/mechanus.json',
  './data/5e/world/planes/outer/mount-celestia.json',
  './data/5e/world/planes/outer/nine-hells.json',
  './data/5e/world/planes/outer/outlands.json',
  './data/5e/world/planes/outer/pandemonium.json',
  './data/5e/world/planes/outer/ysgard.json',
  './data/5e/world/planes/other/demiplanes.json',
  './data/5e/world/planes/other/far-realm.json',
  './data/5e/world/planes/other/material-realms.json',
  './data/5e/world/planes/other/negative-plane.json',
  './data/5e/world/planes/other/para-elemental-planes.json',
  './data/5e/world/planes/other/planar-adventure-situations.json',
  './data/5e/world/planes/other/planar-adventuring.json',
  './data/5e/world/planes/other/planar-portals.json',
  './data/5e/world/planes/other/positive-plane.json',
  './data/5e/world/planes/other/sigil-city-of-doors.json',
  './data/5e/world/planes/other/spells.json',
  './data/5e/world/planes/other/the-blood-war.json',
  './data/5e/world/planes/other/the-great-wheel.json',
  './data/5e/world/planes/other/the-planes.json',
  './data/5e/world/planes/other/tour-of-the-multiverse.json',
  './data/5e/world/planes/other/traveling-the-outer-planes.json'
]

export async function load5ePlanes(): Promise<Record<string, unknown>[]> {
  return ds().get('planes', async () => {
    const results = await Promise.all(
      PLANE_FILES.map(async (path) => {
        try {
          return await loadJson<Record<string, unknown>>(path)
        } catch {
          logger.warn(`[DataProvider] Failed to load plane: ${path}`)
          return null
        }
      })
    )
    return results.filter((r): r is Record<string, unknown> => r !== null)
  })
}

/**
 * Preload all supplementary data files in the background.
 * Called during app initialization to warm caches.
 */
export async function preloadAllData(): Promise<void> {
  // Import and call module-level cache-warming loaders so they are seen as used
  const { loadClassResourceData } = await import('../data/class-resources')
  const { loadModerationData } = await import('../data/moderation')
  const { loadSpeciesResourceData } = await import('../data/species-resources')

  await Promise.allSettled([
    load5eSoundEvents(),
    load5eSpeciesSpells(),
    load5eClassResources(),
    load5eSpeciesResources(),
    load5eAbilityScoreConfig(),
    load5ePresetIcons(),
    load5eKeyboardShortcuts(),
    load5eThemes(),
    load5eDiceColors(),
    load5eDmTabs(),
    load5eNotificationTemplates(),
    load5eBuiltInMaps(),
    load5eSessionZeroConfig(),
    load5eDiceTypes(),
    load5eLightingTravel(),
    load5eCurrencyConfig(),
    load5eModeration(),
    load5eAdventureSeeds(),
    load5eCreatureTypes(),
    load5eAmbientTracks(),
    load5eLanguageD12Table(),
    load5eRarityOptions(),
    // Module-level cache loaders (includes homebrew/plugin data)
    loadClassResourceData(),
    loadModerationData(),
    loadSpeciesResourceData()
  ])
}
