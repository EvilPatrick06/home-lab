import type { EncounterDifficulty } from './shared-enums'

// === encounter-presets.json ===

export interface EncounterPreset {
  id: string
  name: string
  description: string
  environment: string
  difficulty: EncounterDifficulty
  partyLevelRange: string
  monsters: Array<{ id: string; count: number }>
  tactics: string
  treasureHint: string
}

// === encounter-budgets.json ===

export interface EncounterBudgetEntry {
  level: number
  low: number
  moderate: number
  high: number
}

export interface EncounterBudgetsFile {
  perCharacterBudget: EncounterBudgetEntry[]
  notes: string
}

// === treasure-tables.json (DMG 2024 format) ===

export interface TreasureIndividualEntry {
  crRange: string
  amount: string
  unit: string
  average: number
}

export interface TreasureHoardEntry {
  crRange: string
  coins: string
  coinsUnit: string
  coinsAverage: number
  magicItems: string
}

export interface TreasureMagicItemRarity {
  d100Min: number
  d100Max: number
  rarity: string
}

export interface TreasureTablesFile {
  individual: TreasureIndividualEntry[]
  hoard: TreasureHoardEntry[]
  magicItemRarities: TreasureMagicItemRarity[]
  gems: Record<string, string[]>
  art: Record<string, string[]>
}

// === chase-tables.json ===

export interface ChaseComplication {
  roll: number
  complication: string
}

export interface ChaseTablesFile {
  urban: ChaseComplication[]
  wilderness: ChaseComplication[]
}

// === npc-names.json ===

export interface NpcNameEntry {
  male: string[]
  female: string[]
  neutral: string[]
  family?: string[]
  clan?: string[]
}

export type NpcNamesFile = Record<string, NpcNameEntry>

// === random-tables.json ===

export interface WeatherEntry {
  d20Min: number
  d20Max: number
  condition: string
}

export interface RandomTablesFile {
  npcTraits: {
    personality: string[]
    ideals: string[]
    bonds: string[]
    flaws: string[]
    appearance: string[]
    mannerism: string[]
  }
  weather: WeatherEntry[]
  tavernNames: string[]
  shopNames: string[]
  plotHooks: string[]
}

// === Creature Types (creature-types.json) ===

export interface CreatureTypesFile {
  sizes: string[]
  types: string[]
}
