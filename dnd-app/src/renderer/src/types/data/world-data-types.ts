// ============================================================================
// World/hazard data types: traps, hazards, poisons, curses, diseases,
// environmental effects, supernatural gifts, downtime, adventure seeds
// ============================================================================

import type { AbilityAbbreviation } from './shared-enums'

// === traps.json ===

// === hazards.json ===

// === poisons.json ===

// === curses.json ===

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

// === supernatural-gifts.json ===

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
