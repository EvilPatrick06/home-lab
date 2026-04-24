import type { GameSystem } from './game-system'
import type { GameMap } from './map'

export interface InGameTimeState {
  /** Total elapsed seconds since campaign epoch */
  totalSeconds: number
}

export interface GameState {
  campaignId: string
  system: GameSystem
  activeMapId: string | null
  maps: GameMap[]
  turnMode: 'initiative' | 'free'
  initiative: InitiativeState | null
  round: number
  conditions: EntityCondition[]
  isPaused: boolean
  turnStates: Record<string, TurnState>
  /** Underwater combat toggle — affects ranged/melee attacks and grants fire resistance */
  underwaterCombat: boolean
  /** DMG optional flanking rule — adjacent allies on opposite sides grant advantage */
  flankingEnabled: boolean
  /** DMG optional group initiative — identical monster types share one roll */
  groupInitiativeEnabled: boolean
  /** Ambient lighting level for the current encounter */
  ambientLight: 'bright' | 'dim' | 'darkness'
  /** DMG 2024 p.18 optional alternating diagonal rule (5/10/5/10) */
  diagonalRule: 'standard' | 'alternate'
  /** Travel pace with mechanical effects */
  travelPace: 'fast' | 'normal' | 'slow' | null
  /** Marching order (entity IDs from front to rear) */
  marchingOrder: string[]
  /** HP bar visibility on map tokens: 'all' = everyone, 'dm-only' = host only, 'none' = hidden */
  hpBarsVisibility: 'all' | 'dm-only' | 'none'
  /** Currently selected token IDs for multi-selection */
  selectedTokenIds: string[]
}

export interface TurnState {
  entityId: string
  movementRemaining: number
  movementMax: number
  actionUsed: boolean
  bonusActionUsed: boolean
  reactionUsed: boolean
  freeInteractionUsed: boolean
  isDashing: boolean
  isDisengaging: boolean
  isDodging: boolean
  isHidden: boolean
  concentratingSpell?: string
  /** Token ID of the mount this entity is riding (Phase 4 - mounted combat) */
  mountedOn?: string
  /** Whether the mount is controlled or independent (Phase 4 - mounted combat) */
  mountType?: 'controlled' | 'independent'
  /** Multi-attack tracking for Attack action and bonus attacks */
  attackTracker?: { attacksUsed: number; maxAttacks: number; bonusAttacksUsed: number; maxBonusAttacks: number }
}

export interface InitiativeState {
  entries: InitiativeEntry[]
  currentIndex: number
  round: number
}

export interface InitiativeEntry {
  id: string
  entityId: string
  entityName: string
  entityType: 'player' | 'npc' | 'enemy'
  roll: number
  modifier: number
  total: number
  iconPreset?: string
  portraitUrl?: string
  isActive: boolean
  legendaryResistances?: { max: number; remaining: number }
  legendaryActions?: { used: number; maximum: number }
  rechargeAbilities?: RechargeAbility[]
  inLair?: boolean
  lairActions?: Array<{ name: string; description: string }>
  delayedUntil?: number
  surprised?: boolean
  isDelaying?: boolean
  readyAction?: { trigger: string; action: string }
}

export interface RechargeAbility {
  name: string
  rechargeOn: number
  available: boolean
}

export interface CombatLogEntry {
  id: string
  timestamp: number
  round: number
  type: 'damage' | 'heal' | 'condition' | 'save' | 'attack' | 'death' | 'other'
  sourceEntityId?: string
  sourceEntityName?: string
  targetEntityId?: string
  targetEntityName?: string
  value?: number
  damageType?: string
  description: string
}

export interface GroupRollRequest {
  id: string
  type: 'ability' | 'save' | 'skill'
  ability?: string
  skill?: string
  dc: number
  scope: 'all' | 'selected'
  isSecret: boolean
  targetEntityIds?: string[]
}

export interface GroupRollResult {
  entityId: string
  entityName: string
  roll: number
  modifier: number
  total: number
  success: boolean
}

export interface EntityCondition {
  id: string
  entityId: string
  entityName: string
  condition: string
  value?: number // For valued conditions like Exhaustion 1-6
  duration: number | 'permanent'
  source: string
  /** Entity ID of the source of this condition (e.g., caster for Charmed/Frightened, grappler for Grappled) */
  sourceEntityId?: string
  appliedRound: number
}

export interface SidebarEntryStatBlock {
  // Identity
  size?: 'Tiny' | 'Small' | 'Medium' | 'Large' | 'Huge' | 'Gargantuan'
  creatureType?: string
  alignment?: string
  cr?: string
  xp?: number

  // Core Stats
  abilityScores?: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
  ac?: number
  acSource?: string
  hpMax?: number
  hpCurrent?: number
  hpTemp?: number
  speeds?: { walk?: number; fly?: number; swim?: number; climb?: number; burrow?: number }

  // Proficiencies
  savingThrows?: string[]
  skills?: Array<{ name: string; modifier: number; proficiency: 'proficient' | 'expertise' }>

  // Defenses
  resistances?: string[]
  immunities?: string[]
  vulnerabilities?: string[]
  conditionImmunities?: string[]

  // Senses
  senses?: string[] // e.g. ["darkvision 60 ft.", "blindsight 30 ft."]
  passivePerception?: number

  // Actions (rich text content as plain strings)
  traits?: Array<{ name: string; description: string }>
  actions?: Array<{ name: string; description: string }>
  bonusActions?: Array<{ name: string; description: string }>
  reactions?: Array<{ name: string; description: string }>
  legendaryActions?: Array<{ name: string; description: string; cost?: number }>
  lairActions?: Array<{ name: string; description: string }>

  // Spellcasting
  spellcasting?: {
    ability: string
    dc: number
    attackBonus: number
    slots?: Record<string, number> // e.g. { "1": 4, "2": 3 }
    spells?: string[]
  }

  // Linked monster from creatures.json
  linkedMonsterId?: string
}

export type PlaceType =
  | 'world'
  | 'continent'
  | 'kingdom'
  | 'province'
  | 'city'
  | 'district'
  | 'building'
  | 'room'
  | 'dungeon'
  | 'landmark'

export interface SidebarEntry {
  id: string
  name: string
  description?: string
  notes?: string // DM-only notes
  statBlock?: SidebarEntryStatBlock
  attitude?: 'friendly' | 'indifferent' | 'hostile'
  visibleToPlayers: boolean
  isAutoPopulated: boolean // true = from connected player/token/lore, false = DM-added
  sourceId?: string // peerId, tokenId, or loreEntryId it was generated from
  parentId?: string // ID of parent place for tree nesting
  placeType?: PlaceType // Type of place for hierarchical display
  sortOrder?: number // For custom ordering within a parent
  linkedMapId?: string // ID of a GameMap to navigate to
  linkedCharacterIds?: string[] // Character/NPC IDs associated with this place
  monsterStatBlockId?: string // ID linking to a MonsterStatBlock in the creature DB
  imageFileName?: string // Filename for place illustration in userData
}

export type SidebarCategory = 'allies' | 'enemies' | 'places'

/** Sidebar panel includes NPCs (from campaign) plus the store-managed categories */
export type SidebarPanel = 'npcs' | SidebarCategory

export interface HandoutPage {
  id: string
  contentType: 'image' | 'text'
  content: string
  label?: string
  dmOnly?: boolean
}

export interface Handout {
  id: string
  title: string
  contentType: 'image' | 'text'
  content: string // base64 for images, plain text for text
  visibility: 'all' | 'dm-only'
  createdAt: number
  pages?: HandoutPage[]
}

export interface SharedJournalEntry {
  id: string
  title: string
  content: string
  authorPeerId: string
  authorName: string
  visibility: 'public' | 'private'
  createdAt: number
  updatedAt: number
}

export interface HiddenDiceResult {
  id: string
  formula: string
  rolls: number[]
  total: number
  timestamp: number
}

export interface DiceRollRecord {
  id: string
  timestamp: number
  rollerName: string
  formula: string
  rolls: number[]
  total: number
  reason?: string
  isCritical: boolean
  isFumble: boolean
}
