import type { AiProviderType } from './llm-provider'

// ── AI DM Types (Main Process) ──

export interface AiConfig {
  provider: AiProviderType
  model: string
  ollamaUrl: string
  claudeApiKey?: string
  openaiApiKey?: string
  geminiApiKey?: string
  /** Ollama context window override in tokens; unset = auto (curated/default
   *  clamped to the model's reported maximum). Ignored by cloud providers. */
  contextLength?: number
  /** Opt-in Ollama KV-cache quantization (`q8_0` halves, `q4_0` quarters KV
   *  memory); unset = off. Only applied to servers this app spawns. */
  ollamaKvCacheType?: 'q8_0' | 'q4_0'
  /** PHASE-23: two-call structured mechanics extraction. `off` (default/absent),
   *  `fallback` (only when tag parse fails), `always`. Ollama-only. */
  structuredExtraction?: StructuredExtractionMode
  /** PHASE-24 24C: opt-in semantic rules search. Absent/false = lexical-only (today's behavior). */
  ragEmbeddingsEnabled?: boolean
  /** PHASE-24 24C: Ollama embedding model id; default nomic-embed-text. */
  ragEmbeddingModel?: string
  /** PHASE-24 24D: let the AI DM search this campaign's lore/journal/handouts. Absent = off. */
  ragCampaignDocsEnabled?: boolean
  /** @deprecated Use `model` instead. Kept for backward-compatible config loading. */
  ollamaModel?: string
}

export type StructuredExtractionMode = 'off' | 'fallback' | 'always'

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
  actingCharacterId?: string
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
  // True only when Ollama is up AND at least one model is installed — i.e. it can
  // actually answer. Lets the UI show an honest "ready" instead of green-on-a-server
  // -with-no-models (which then silently fails on the first request).
  ollamaHasUsableModel: boolean
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

/** Party standing with a faction/organization (positive = liked, negative = disliked). */
export interface FactionReputation {
  factionName: string
  partyStanding: number
  lastModified: string
}

// ── Chunk index types ──

export interface ChunkIndex {
  /** 1 = positional ids (legacy, migrated at load); 2 = content-stable hash ids (PHASE-24 24A). */
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
/** PHASE-24 24D: chunks come from the rulebooks OR the campaign's own documents. */
export type ChunkSourceTag = BookSource | 'CAMPAIGN'

export interface Chunk {
  /** PHASE-24 24A — content-stable: `<source-lowercase>-<sha256(source\0headingPath\0content)
   *  first 16 hex>`; identical chunks get a `-2`/`-3` suffix. Survives index rebuilds. */
  id: string
  source: ChunkSourceTag
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
  /** Layered-memory tier (PHASE-26). Untiered legacy entries are treated as 'scene'. */
  tier?: 'scene' | 'session' | 'campaign'
  /** Human label for the scene (map name, '/scene end' argument, …). */
  label?: string
  createdAt?: string
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
  | { type: 'add_condition'; characterName?: string; name: string; duration?: number | 'permanent'; reason: string }
  | { type: 'remove_condition'; characterName?: string; name: string; reason: string }
  | { type: 'death_save'; characterName?: string; success: boolean; reason: string }
  | { type: 'reset_death_saves'; characterName?: string; reason: string }
  | { type: 'expend_spell_slot'; characterName?: string; level: number; pool?: 'regular' | 'pact'; reason: string }
  | {
      type: 'restore_spell_slot'
      characterName?: string
      level: number
      count?: number
      pool?: 'regular' | 'pact'
      reason: string
    }
  // PHASE-02 02E — INTERNAL only: the AI cannot emit this (not in StatChangeSchema/prompt;
  // zod filters it on the parse path), the renderer never sends it. It exists so the
  // long-rest temp-HP clear flows through validate→apply→applied[]→save like any change.
  | { type: 'clear_temp_hp'; characterName?: string; reason: string }
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
  | { type: 'creature_set_resistance'; targetLabel: string; damageTypes: string[]; replace?: boolean; reason: string }
  | {
      type: 'creature_set_vulnerability'
      targetLabel: string
      damageTypes: string[]
      replace?: boolean
      reason: string
    }
  | { type: 'creature_set_immunity'; targetLabel: string; damageTypes: string[]; replace?: boolean; reason: string }
  | { type: 'creature_expend_spell_slot'; targetLabel: string; level: number; count?: number; reason: string }
  | { type: 'creature_restore_spell_slot'; targetLabel: string; level: number; count?: number; reason: string }
  | { type: 'reduce_exhaustion'; characterName?: string; reason: string }
  | { type: 'add_exhaustion'; characterName?: string; levels: number; reason: string }
  | { type: 'set_equipped'; characterName?: string; name: string; equipped: boolean; reason: string }
  | {
      type: 'set_proficiency'
      characterName?: string
      category: 'weapon' | 'armor' | 'tool' | 'language'
      name: string
      proficient: boolean
      reason: string
    }
  | {
      type: 'set_skill_proficiency'
      characterName?: string
      skill: string
      proficient: boolean
      expertise?: boolean
      reason: string
    }
  | {
      type: 'set_save_proficiency'
      characterName?: string
      ability: 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'
      proficient: boolean
      reason: string
    }
