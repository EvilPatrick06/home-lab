import type { Encounter } from './encounter'
import type { EntityCondition, Handout, InGameTimeState, InitiativeState, SidebarEntry, TurnState } from './game-state'
import type { GameSystem } from './game-system'
import type { GameMap } from './map'
import type { MonsterStatBlock } from './monster'

export type CampaignType = 'preset' | 'custom'
export type TurnMode = 'initiative' | 'free'

export type CalendarPresetId = 'gregorian' | 'harptos' | 'simple-day-counter' | 'custom'

export interface CalendarMonth {
  name: string
  days: number
}

export interface CalendarConfig {
  preset: CalendarPresetId
  months: CalendarMonth[]
  daysPerYear: number
  yearLabel: string
  startingYear: number
  hoursPerDay: number
  /** DM preference for when AI/system shares exact numeric time */
  exactTimeDefault: 'always' | 'contextual' | 'never'
  /** Starting in-game time as total seconds (from campaign creation wizard) */
  startingTime?: number
}

export interface LoreEntry {
  id: string
  title: string
  content: string
  category: 'world' | 'faction' | 'location' | 'item' | 'other'
  isVisibleToPlayers: boolean
  createdAt: string
}

export type AiProviderType = 'ollama' | 'claude' | 'openai' | 'gemini'

export interface AiDmConfig {
  enabled: boolean
  provider?: AiProviderType
  model?: string
  ollamaUrl?: string
  claudeApiKey?: string
  openaiApiKey?: string
  geminiApiKey?: string
  discordBridge?: boolean
  /** @deprecated Use `model` instead */
  ollamaModel?: string
}

export interface CampaignMetrics {
  sessionsPlayed: number
  totalPlaytimeSeconds: number
  encountersCompleted: number
  totalDamageDealt: number
  totalHealingDone: number
  lastSessionDate: string | null
}

export interface TimelineMilestone {
  id: string
  title: string
  description?: string
  date: string
  category: 'story' | 'combat' | 'discovery' | 'achievement' | 'custom'
  createdAt: string
}

export interface Campaign {
  id: string
  name: string
  description: string
  system: GameSystem
  type: CampaignType
  presetId?: string
  dmId: string
  inviteCode: string
  turnMode: TurnMode
  maps: GameMap[]
  activeMapId?: string
  npcs: NPC[]
  lore?: LoreEntry[]
  encounters?: Encounter[]
  adventures?: AdventureEntry[]
  sessionZero?: SessionZeroConfig
  players: CampaignPlayer[]
  customRules: CustomRule[]
  settings: CampaignSettings
  journal: SessionJournal
  calendar?: CalendarConfig
  customAudio?: Array<{
    id: string
    fileName: string
    displayName: string
    category: 'ambient' | 'effect' | 'music'
  }>
  discordInviteUrl?: string
  metrics?: CampaignMetrics
  milestones?: TimelineMilestone[]
  downtimeProgress?: DowntimeProgressEntry[]
  aiDm?: AiDmConfig
  customRollTables?: Array<{
    id: string
    name: string
    diceFormula: string
    entries: Array<{
      min: number
      max: number
      text: string
    }>
  }>
  savedGameState?: SavedGameState
  createdAt: string
  updatedAt: string
}

export interface OptionalRules {
  flanking: boolean
  groupInitiative: boolean
}

export const DEFAULT_OPTIONAL_RULES: OptionalRules = {
  flanking: false,
  groupInitiative: false
}

export interface CampaignSettings {
  maxPlayers: number
  lobbyMessage: string
  levelRange: { min: number; max: number }
  allowCharCreationInLobby: boolean
  optionalRules?: OptionalRules
}

export interface CampaignPlayer {
  userId: string
  displayName: string
  characterId: string | null
  joinedAt: string
  isActive: boolean
  isReady: boolean
}

export interface CustomRule {
  id: string
  name: string
  description: string
  category: 'combat' | 'exploration' | 'social' | 'rest' | 'other'
}

export interface NPC {
  id: string
  name: string
  description: string
  portraitPath?: string
  location?: string
  isVisible: boolean
  stats?: Record<string, unknown>
  statBlockId?: string
  customStats?: Partial<MonsterStatBlock>
  role?: 'ally' | 'enemy' | 'neutral' | 'patron' | 'shopkeeper'
  personality?: string
  motivation?: string
  notes: string
  revealedFields?: {
    description?: boolean
    role?: boolean
    personality?: boolean
    motivation?: boolean
  }
}

export interface SessionZeroConfig {
  contentLimits: string[]
  tone: string
  pvpAllowed: boolean
  characterDeathExpectation: string
  playSchedule: string
  additionalNotes: string
}

export interface AdventureEntry {
  id: string
  title: string
  levelTier: string
  premise: string
  hook: string
  villain: string
  setting: string
  playerStakes: string
  encounters: string
  climax: string
  resolution: string
  createdAt: string
}

export interface SessionJournal {
  entries: JournalEntry[]
}

export interface JournalEntry {
  id: string
  sessionNumber: number
  date: string
  title: string
  content: string
  isPrivate: boolean
  authorId: string
  createdAt: string
}

export interface CombatTimerConfig {
  enabled: boolean
  seconds: number
  action: 'auto-skip' | 'warning'
}

export interface SavedGameState {
  initiative: InitiativeState | null
  round: number
  conditions: EntityCondition[]
  turnStates: Record<string, TurnState>
  isPaused: boolean
  underwaterCombat: boolean
  ambientLight: 'bright' | 'dim' | 'darkness'
  travelPace: 'fast' | 'normal' | 'slow' | null
  marchingOrder: string[]
  allies: SidebarEntry[]
  enemies: SidebarEntry[]
  places: SidebarEntry[]
  inGameTime: InGameTimeState | null
  restTracking: {
    lastLongRestSeconds: number | null
    lastShortRestSeconds: number | null
  } | null
  activeLightSources: ActiveLightSource[]
  handouts: Handout[]
  combatTimer?: CombatTimerConfig
}

export interface ActiveLightSource {
  id: string
  entityId: string
  entityName: string
  sourceName: string
  durationSeconds: number
  startedAtSeconds: number
}

export interface DowntimeProgressEntry {
  id: string
  activityId: string
  activityName: string
  characterId: string
  characterName: string
  daysSpent: number
  daysRequired: number
  goldSpent: number
  goldRequired: number
  startedAt: string
  details?: string
  trainingTarget?: string
  craftingRecipeId?: string
  status: 'in-progress' | 'completed' | 'abandoned'
}

export type { GameMap } from './map'
