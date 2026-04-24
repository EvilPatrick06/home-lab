// ============================================================================
// World/hazard data types: traps, hazards, poisons, curses, diseases,
// environmental effects, supernatural gifts, downtime, adventure seeds
// ============================================================================

import type { AbilityAbbreviation } from './shared-enums'

// === traps.json ===

export interface TrapData {
  id: string
  name: string
  level: 'low' | 'mid' | 'high'
  trigger: string
  duration: string
  detection: string
  disarm: string
  effect: string
  damage: string
  saveDC: number
  saveAbility: AbilityAbbreviation
  description: string
}

// === hazards.json ===

export interface HazardData {
  id: string
  name: string
  level: 'low' | 'mid' | 'high'
  type: 'biological' | 'environmental' | 'magical'
  effect: string
  damage: string
  saveDC: number
  saveAbility: AbilityAbbreviation
  avoidance: string
  description: string
}

// === poisons.json ===

export interface PoisonData {
  id: string
  name: string
  type: 'ingested' | 'inhaled' | 'contact' | 'injury'
  rarity: string
  cost: string
  saveDC: number
  effect: string
  duration: string
  description: string
}

// === curses.json ===

export interface CurseData {
  id: string
  name: string
  type: 'personal' | 'item' | 'location'
  effect: string
  removal: string
  description: string
}

// === diseases.json ===

export interface DiseaseData {
  id: string
  name: string
  type: string
  vector: string
  saveDC: number
  saveAbility: AbilityAbbreviation
  incubation: string
  symptoms: string
  effect: string
  mechanicalEffect: string
  cure: string
  description: string
}

// === environmental-effects.json ===

export interface EnvironmentalEffectData {
  id: string
  name: string
  category: 'weather' | 'terrain' | 'magical'
  effect: string
  mechanicalEffect: string
  saveDC?: number
  saveAbility?: AbilityAbbreviation
  description: string
}

// === supernatural-gifts.json ===

export interface SupernaturalGiftData {
  id: string
  name: string
  type: 'blessing' | 'charm' | 'boon'
  effect: string
  description: string
  duration?: string
}

// === downtime.json ===

export interface DowntimeActivity {
  id: string
  name: string
  description: string
  daysRequired: number
  goldCostPerDay: number
  requirements: string[]
  outcome: string
  reference: string
}

// === Adventure Seeds (adventure-seeds.json) ===

export type AdventureSeedsFile = Record<string, string[]>

// === Session Zero Config (session-zero-config.json) ===

export interface SessionZeroConfigFile {
  toneOptions: Array<{ value: string; label: string; description: string }>
  deathOptions: Array<{ value: string; label: string; description: string }>
  commonLimits: string[]
  ruleCategories: Array<{ value: string; label: string }>
  categoryColors: Record<string, string>
}
