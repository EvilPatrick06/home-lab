// Phase 28d — the type-only members in the `Character5e` transitive closure
// (AbilityScoreSet, AbilityName, MagicItemRarity5e, CampaignHistoryEntry,
// SpellEntry, WeaponEntry, ArmorEntry, Currency, ClassFeatureEntry,
// ActiveCondition, ClassResource) moved to `src/shared/types/character-common.ts`
// so the Electron main process can reach them. They are re-exported here so all
// existing renderer imports keep resolving unchanged. Runtime values (constants,
// helper functions) and renderer-only types stay in this file.
export type {
  AbilityName,
  AbilityScoreSet,
  ActiveCondition,
  ArmorEntry,
  CampaignHistoryEntry,
  ClassFeatureEntry,
  ClassResource,
  Currency,
  MagicItemRarity5e,
  SpellEntry,
  WeaponEntry
} from '../../../shared/types/character-common'

import type { AbilityName } from '../../../shared/types/character-common'

export const ABILITY_NAMES: AbilityName[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma'
]

export type Rarity = 'common' | 'uncommon' | 'rare' | 'unique'

export type BuildSlotCategory =
  | 'ancestry'
  | 'heritage'
  | 'background'
  | 'class'
  | 'ancestry-feat'
  | 'class-feat'
  | 'skill-feat'
  | 'general-feat'
  | 'ability-boost'
  | 'class-feature'
  | 'skill-choice'
  | 'ability-scores'
  | 'epic-boon'
  | 'fighting-style'
  | 'primal-order'
  | 'divine-order'
  | 'expertise'

export interface BuildSlot {
  id: string
  label: string
  category: BuildSlotCategory
  level: number
  selectedId: string | null
  selectedName: string | null
  selectedDescription?: string | null
  selectedDetailFields?: DetailField[] | null
  required: boolean
  isAutoGranted?: boolean
}

export const STANDARD_LANGUAGES_5E = [
  'Common',
  'Common Sign Language',
  'Draconic',
  'Dwarvish',
  'Elvish',
  'Giant',
  'Gnomish',
  'Goblin',
  'Halfling',
  'Orc'
]

export const RARE_LANGUAGES_5E = [
  'Abyssal',
  'Celestial',
  'Deep Speech',
  'Druidic',
  'Infernal',
  'Primordial',
  'Sylvan',
  "Thieves' Cant",
  'Undercommon'
]

export const PRIMORDIAL_DIALECTS = ['Aquan', 'Auran', 'Ignan', 'Terran'] as const

export const ALL_LANGUAGES_5E = [...STANDARD_LANGUAGES_5E, ...RARE_LANGUAGES_5E]

export interface SelectableOption {
  id: string
  // boundary-allow: legacy entry-shape interface still live across the character sheet (~136 refs); EntryRef/v4-schema removal is deferred to the dormant v3.0.0 flip (15h)
  name: string
  rarity: Rarity
  description: string
  traits: string[]
  level?: number
  prerequisites?: string[]
  source: string
  detailFields: DetailField[]
}

export interface DetailField {
  label: string
  value: string
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2)
}

export function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`
}

/**
 * PHB 2024: A creature is Bloodied while it has half its Hit Points or fewer remaining.
 * Bloodied has no mechanical effect on its own but may trigger other game effects.
 */
export function isBloodied(currentHP: number, maxHP: number): boolean {
  return currentHP > 0 && currentHP <= Math.floor(maxHP / 2)
}

// Phase 28d — the entry-shape types (SpellEntry/WeaponEntry/ArmorEntry/
// ClassFeatureEntry), Currency, ActiveCondition, and ClassResource moved to
// `src/shared/types/character-common.ts` (re-exported at the top of this file).
// The 15h note about these being the LIVE character-sheet shapes gated on the
// dormant v3.0.0 schema flip now lives alongside the definitions there.
