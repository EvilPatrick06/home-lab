// Public type definitions for the "extracted data" loaders in `data-provider.ts`
// (conditions, languages, weapon mastery, skills, variant items, light sources).
// These are re-exported from `data-provider.ts` so consumers continue to import
// them from `./data-provider` unchanged.

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

export interface LanguageEntry {
  id: string
  name: string
  type: string
  script: string | null
  typicalSpeakers: string
  description: string
  source: string
}

export interface WeaponMasteryEntry {
  id: string
  name: string
  description: string
  source: string
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

export interface VariantItemEntry {
  label: string
  variants: string[]
}

export interface LightSourceEntry {
  label: string
  durationSeconds: number | null
  brightRadius: number
  dimRadius: number
}
