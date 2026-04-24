import type { AiProviderType } from './llm-provider'

// ── AI DM Types (Main Process) ──

export interface AiConfig {
  provider: AiProviderType
  model: string
  ollamaUrl: string
  claudeApiKey?: string
  openaiApiKey?: string
  geminiApiKey?: string
  /** @deprecated Use `model` instead. Kept for backward-compatible config loading. */
  ollamaModel?: string
}

export interface ActiveCreatureInfo {
  label: string
  currentHP: number
  maxHP: number
  ac: number
  conditions: string[]
  monsterStatBlockId?: string
}

export interface AiChatRequest {
  campaignId: string
  message: string
  characterIds: string[]
  senderName?: string
  activeCreatures?: ActiveCreatureInfo[]
  gameState?: string
}

export interface AiStreamChunk {
  streamId: string
  text: string
}

export interface RuleCitation {
  source: string // 'PHB', 'DMG', 'MM'
  rule: string // Rule name
  text: string // Citation text
}

export interface AiStreamDone {
  streamId: string
  fullText: string
  statChanges: StatChange[]
  dmActions: DmActionData[]
  ruleCitations: RuleCitation[]
}

/** Serializable DM action data passed through IPC (mirrors DmAction from dm-actions.ts) */
export interface DmActionData {
  action: string
  [key: string]: unknown
}

export interface AiStreamError {
  streamId: string
  error: string
}

export interface AiIndexProgress {
  percent: number
  stage: string
}

export interface ProviderStatus {
  ollama: boolean
  ollamaModels: string[]
  claude: boolean
  openai: boolean
  gemini: boolean
}

export interface MutationResult {
  applied: StatChange[]
  rejected: Array<{ change: StatChange; reason: string }>
}

// ── NPC Personality & World State ──

export interface NPCRelationship {
  targetNpcId: string
  targetName: string
  relationship: string // e.g., "employer", "rival", "spouse", "ally"
  disposition: 'friendly' | 'neutral' | 'hostile'
}

export interface NPCConversationLog {
  timestamp: string
  summary: string // 1-2 sentence summary of interaction
  attitudeAfter: 'friendly' | 'neutral' | 'hostile'
}

export interface NPCPersonality {
  npcId: string
  name: string
  personality: string
  voiceNotes?: string
  lastInteractionSummary?: string
  relationships?: NPCRelationship[]
  conversationLog?: NPCConversationLog[]
  faction?: string // e.g., "Thieves Guild", "City Guard"
  location?: string // Current known location
  secretMotivation?: string // DM-only hidden motivation
}

export interface WorldStateSummary {
  currentLocation: string
  timeOfDay: string
  weather?: string
  activeQuests: string[]
  recentEvents: string[]
  lastUpdated: string
}

// ── Chunk index types ──

export interface ChunkIndex {
  version: number
  createdAt: string
  sources: ChunkSource[]
  chunks: Chunk[]
}

export interface ChunkSource {
  file: string
  book: BookSource
  totalChunks: number
}

export type BookSource = 'PHB' | 'DMG' | 'MM'

export interface Chunk {
  id: string
  source: BookSource
  headingPath: string[]
  heading: string
  content: string
  tokenEstimate: number
  keywords: string[]
}

export interface ScoredChunk extends Chunk {
  score: number
}

// ── Conversation types ──

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  contextChunkIds?: string[]
}

export interface ConversationSummary {
  content: string
  coversUpTo: number
}

export interface ConversationData {
  messages: ConversationMessage[]
  summaries: ConversationSummary[]
  activeCharacterIds: string[]
}

// ── Chat message types ──

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamCallbacks {
  onText: (text: string) => void
  onDone: (fullText: string) => void
  onError: (error: Error) => void
}

// ── Stat Change types ──

export type StatChange =
  | { type: 'damage'; characterName?: string; value: number; damageType?: string; reason: string }
  | { type: 'heal'; characterName?: string; value: number; reason: string }
  | { type: 'temp_hp'; characterName?: string; value: number; reason: string }
  | { type: 'add_condition'; characterName?: string; name: string; reason: string }
  | { type: 'remove_condition'; characterName?: string; name: string; reason: string }
  | { type: 'death_save'; characterName?: string; success: boolean; reason: string }
  | { type: 'reset_death_saves'; characterName?: string; reason: string }
  | { type: 'expend_spell_slot'; characterName?: string; level: number; reason: string }
  | { type: 'restore_spell_slot'; characterName?: string; level: number; count?: number; reason: string }
  | { type: 'add_item'; characterName?: string; name: string; quantity?: number; description?: string; reason: string }
  | { type: 'remove_item'; characterName?: string; name: string; quantity?: number; reason: string }
  | {
      type: 'gold'
      characterName?: string
      value: number
      denomination?: 'cp' | 'sp' | 'gp' | 'pp' | 'ep'
      reason: string
    }
  | { type: 'xp'; characterName?: string; value: number; reason: string }
  | { type: 'use_class_resource'; characterName?: string; name: string; amount?: number; reason: string }
  | { type: 'restore_class_resource'; characterName?: string; name: string; amount?: number; reason: string }
  | { type: 'heroic_inspiration'; characterName?: string; grant: boolean; reason: string }
  | { type: 'hit_dice'; characterName?: string; value: number; reason: string }
  | { type: 'npc_attitude'; name: string; attitude: 'friendly' | 'indifferent' | 'hostile'; reason: string }
  | {
      type: 'set_ability_score'
      characterName?: string
      ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
      value: number
      reason: string
    }
  | { type: 'grant_feature'; characterName?: string; name: string; description?: string; reason: string }
  | { type: 'revoke_feature'; characterName?: string; name: string; reason: string }
  | { type: 'creature_damage'; targetLabel: string; value: number; damageType?: string; reason: string }
  | { type: 'creature_heal'; targetLabel: string; value: number; reason: string }
  | { type: 'creature_add_condition'; targetLabel: string; name: string; reason: string }
  | { type: 'creature_remove_condition'; targetLabel: string; name: string; reason: string }
  | { type: 'creature_kill'; targetLabel: string; reason: string }
