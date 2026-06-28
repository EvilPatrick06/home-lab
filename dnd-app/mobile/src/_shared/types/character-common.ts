// Phase 28d — canonical home for the character-common types in the `Character5e`
// transitive type closure. These are type-only (no runtime), so they are safe to
// share across the main/renderer process boundary. The full `character-common.ts`
// in `src/renderer/src/types/` re-exports these and keeps its own runtime
// (constants like ABILITY_NAMES, helpers like abilityModifier/isBloodied) plus
// renderer-only types (Rarity, BuildSlot, SelectableOption, DetailField, …).

export interface AbilityScoreSet {
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number
}

export type AbilityName = keyof AbilityScoreSet

export type MagicItemRarity5e = 'common' | 'uncommon' | 'rare' | 'very-rare' | 'legendary' | 'artifact'

export interface CampaignHistoryEntry {
  campaignId: string
  campaignName: string
  joinedAt: string
  leftAt?: string
  role: 'player' | 'dm'
}

// === Character-sheet entry shapes ===
// NOTE (15h): SpellEntry/WeaponEntry/ArmorEntry/ClassFeatureEntry are the LIVE
// character-sheet shapes (~136 references). The EntryRef/v4-schema migration that
// would replace them — plus the MigrationReportModal + orphan-detection UX — is
// gated on the dormant v3.0.0 schema flip (CURRENT_SCHEMA_VERSION still 3). Do not
// "finish removing" these until that flip lands, or the sheet breaks.

export interface SpellEntry {
  id: string
  // boundary-allow: legacy entry-shape interface still live across the character sheet (~136 refs); EntryRef/v4-schema removal is deferred to the dormant v3.0.0 flip (15h)
  name: string
  level: number
  description: string
  castingTime: string
  range: string
  duration: string
  components: string
  school?: string
  concentration?: boolean
  ritual?: boolean
  traditions?: string[]
  traits?: string[]
  heightened?: Record<string, string>
  higherLevels?: string
  classes?: string[]
  prepared?: boolean
  source?: 'species' | 'class' | 'feat' | 'item'
  innateUses?: { max: number; remaining: number }
}

export interface WeaponEntry {
  id: string
  name: string
  damage: string
  damageType: string
  attackBonus: number
  properties: string[]
  description?: string
  hands?: string
  group?: string
  bulk?: string
  range?: string
  proficient?: boolean
  mastery?: string
  cost?: string
  weight?: number
}

export interface ArmorEntry {
  id: string
  name: string
  acBonus: number
  equipped: boolean
  type: 'armor' | 'shield' | 'clothing'
  description?: string
  category?: string
  dexCap?: number | null
  stealthDisadvantage?: boolean
  checkPenalty?: number
  speedPenalty?: number
  strength?: number
  bulk?: number
  hardness?: number
  shieldHP?: number
  shieldBT?: number
  currentShieldHP?: number
  cost?: string
  weight?: number
}

export interface Currency {
  cp: number
  sp: number
  gp: number
  pp: number
  ep?: number
}

export interface ClassFeatureEntry {
  // boundary-allow: legacy entry-shape interface still live across the character sheet (~136 refs); EntryRef/v4-schema removal is deferred to the dormant v3.0.0 flip (15h)
  level: number
  name: string
  source: string
  description: string
}

export interface ActiveCondition {
  name: string
  type: 'condition' | 'buff'
  isCustom: boolean
  value?: number
  /** Remaining duration in rounds, or 'permanent' (until removed). Omitted = untracked. */
  duration?: number | 'permanent'
}

export interface ClassResource {
  id: string
  name: string
  current: number
  max: number
  shortRestRestore: number | 'all'
}
