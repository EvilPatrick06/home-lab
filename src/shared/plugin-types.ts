// ============================================================================
// Plugin System Types
// Shared between main, preload, and renderer processes.
// ============================================================================

/** Data categories matching the DataCategory type in use-data-store.ts */
export type ContentCategory =
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

// --- Manifest types ---

export interface ContentPackManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  type: 'content-pack'
  gameSystem: string
  data: Partial<Record<ContentCategory, string | string[]>>
}

export type PluginPermission =
  | 'commands'
  | 'ui-extensions'
  | 'game-events'
  | 'combat-hooks'
  | 'dm-actions'
  | 'sounds'
  | 'storage'

export interface CodePluginManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  type: 'plugin'
  gameSystem: string
  entry: string
  permissions: PluginPermission[]
  data?: Partial<Record<ContentCategory, string | string[]>>
}

export interface GameSystemManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  type: 'game-system'
  entry: string
  permissions: PluginPermission[]
  data?: Partial<Record<ContentCategory, string | string[]>>
}

export type PluginManifest = ContentPackManifest | CodePluginManifest | GameSystemManifest

// --- Runtime status ---

export interface PluginStatus {
  id: string
  manifest: PluginManifest
  enabled: boolean
  loaded: boolean
  error?: string
}

// --- Config ---

export interface PluginConfigEntry {
  id: string
  enabled: boolean
}

export interface PluginConfig {
  plugins: PluginConfigEntry[]
}
