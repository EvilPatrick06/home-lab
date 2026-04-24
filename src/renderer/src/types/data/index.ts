// ============================================================================
// Barrel re-export for all 5e data types
// ============================================================================

export type { BastionFacilitiesData } from '../bastion'
// Re-exports from sibling type files
export type { MonsterAction, MonsterSpeed, MonsterSpellcasting, MonsterStatBlock, MonsterTrait } from '../monster'
// Domain-specific type files
export * from './character-data-types'
export * from './creature-data-types'
export * from './equipment-data-types'
// Shared enums / literal unions
export * from './shared-enums'
export * from './spell-data-types'
export * from './world-data-types'

// === Types unique to this barrel (not in individual domain files) ===

// === Sound entries (sound-events.json) ===

export interface SoundEntry {
  id: string
  event: string
  path: string
  volume: number
  category: 'dice' | 'combat' | 'character' | 'ui' | 'ambient' | 'spell' | 'condition'
}

export interface SoundEventsFile {
  soundFileMappings: SoundEntry[]
  soundEvents: string[]
  ambientSounds: string[]
  categories: Record<string, string[]>
  weaponSubcategories: Record<string, string[]>
  creatureSubcategories: Record<string, string[]>
  stripPrefixes: string[]
  essentialEvents: string[]
}

// === trinkets.json ===
export type TrinketsFile = string[]

// === Keyboard Shortcuts (keyboard-shortcuts.json) ===

export interface KeyboardShortcutDef {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  action: string
  description: string
  category: string
}

// === Themes (themes.json) ===

export type ThemesFile = Record<string, Record<string, string>>

// === Dice Colors (dice-colors.json) ===

export interface DiceColorsFile {
  default: { bodyColor: string; numberColor: string }
  presets: Array<{ label: string; bodyColor: string; numberColor: string }>
}

// === DM Tabs (dm-tabs.json) ===

export interface DmTabDef {
  id: string
  label: string
  icon: string
}

// === Notification Templates (notification-templates.json) ===

export type NotificationTemplatesFile = Record<string, { title: string; body: string }>

// === Built-in Maps (built-in-maps.json) ===

export interface BuiltInMapEntry {
  id: string
  name: string
  preview: string
  imagePath: string
}

// === Dice Types (dice-types.json) ===

export interface DiceTypeDef {
  sides: number
  label: string
}

// === Lighting & Travel (lighting-travel.json) ===

export interface LightingTravelFile {
  lightingLevels: Array<{ level: string; tip: string }>
  travelPaces: Array<string | null>
}

// === Moderation (moderation.json) ===

export interface ModerationFile {
  blockedWords: string[]
}

// === Ambient Tracks (ambient-tracks.json) ===

export interface AmbientTrackEntry {
  id: string
  label: string
  icon: string
}

export interface QuickSfxEntry {
  event: string
  label: string
}

export interface AmbientTracksFile {
  ambientTracks: AmbientTrackEntry[]
  quickSfx: QuickSfxEntry[]
}

// === Language D12 Table (language-d12-table.json) ===

export interface LanguageD12Entry {
  min: number
  max: number
  language: string
}

// === Rarity Options (rarity-options.json) ===

export interface RarityOptionEntry {
  value: string
  label: string
  color: string
}
