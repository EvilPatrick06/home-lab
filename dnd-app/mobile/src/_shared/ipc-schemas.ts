import { z } from 'zod'
import { BATTLEMAP_THEMES } from './battlemap-spec'

// PHASE-43 (CodeQL SSRF hardening): user-configurable endpoint URLs must be http(s).
// This is a scheme guard at the config boundary — it blocks file:/gopher:/data: etc.
// from a poisoned or typo'd Settings value while still allowing ANY http(s) host
// (the configurable-endpoint feature — remote Ollama/SD servers — is preserved).
const isHttpUrl = (u: string): boolean => /^https?:\/\//i.test(u)
const HTTP_URL_MSG = 'must be an http(s) URL'

const AiProviderTypeSchema = z.enum(['ollama', 'claude', 'openai', 'gemini'])

export const AiConfigSchema = z.object({
  provider: AiProviderTypeSchema.default('ollama'),
  model: z.string(),
  ollamaUrl: z.string().refine(isHttpUrl, HTTP_URL_MSG).default('http://localhost:11434'),
  claudeApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
  contextLength: z.number().int().min(2048).max(131072).optional(),
  ollamaKvCacheType: z.enum(['q8_0', 'q4_0']).optional(),
  // PHASE-23: structured mechanics extraction mode (Ollama-only; absent ≡ off).
  structuredExtraction: z.enum(['off', 'fallback', 'always']).optional(),
  // PHASE-24: hybrid rules retrieval + campaign-doc search.
  ragEmbeddingsEnabled: z.boolean().optional(),
  ragEmbeddingModel: z.string().min(1).max(100).optional(),
  ragCampaignDocsEnabled: z.boolean().optional(),
  // PHASE-29 29A: per-task model routing (zod strips unknown keys, so this MUST be declared).
  routing: z
    .object({
      enabled: z.boolean().default(false),
      smallModel: z.string().default(''),
      overrides: z.record(z.string(), z.string()).optional()
    })
    .optional(),
  // PHASE-29 29E: local-endpoint flavor for the Ollama provider (absent = 'ollama').
  localEndpointFlavor: z.enum(['ollama', 'llamacpp']).optional(),
  ollamaModel: z.string().optional()
})

// PHASE-34 — battlemap generation request (LLM → BattlemapSpec).
export const BattlemapGenerationRequestSchema = z.object({
  campaignId: z.string().min(1),
  prompt: z.string().min(1).max(2000),
  theme: z.enum(BATTLEMAP_THEMES).optional(),
  widthCells: z.number().int().min(10).max(60).optional(),
  heightCells: z.number().int().min(10).max(60).optional()
})
export type BattlemapGenerationRequest = z.infer<typeof BattlemapGenerationRequestSchema>

// PHASE-33 — AI image generation. No API-key fields: cloud calls reuse the keys ai-service.ts
// already persists/encrypts; the SD endpoint is keyless on a LAN.
export const AiImageProviderTypeSchema = z.enum(['sd-webui', 'openai', 'gemini'])
export type AiImageProviderType = z.infer<typeof AiImageProviderTypeSchema>
export const AiImageSizeSchema = z.enum(['1024x1024', '1024x1536', '1536x1024'])
export const AiImageConfigSchema = z.object({
  enabled: z.boolean().default(false),
  provider: AiImageProviderTypeSchema.default('sd-webui'),
  fallbackProvider: AiImageProviderTypeSchema.or(z.literal('none')).default('none'),
  sdWebuiUrl: z.string().url().refine(isHttpUrl, HTTP_URL_MSG).default('http://127.0.0.1:7860'),
  sdModel: z.string().max(200).optional(), // override_settings.sd_model_checkpoint
  sdSteps: z.number().int().min(1).max(150).default(28),
  sdSampler: z.string().max(60).default('Euler a'),
  sdCfgScale: z.number().min(1).max(30).default(7),
  openaiModel: z.string().max(80).default('gpt-image-1'),
  openaiQuality: z.enum(['low', 'medium', 'high', 'auto']).default('low'),
  geminiModel: z.string().max(80).default('gemini-2.5-flash-image'),
  size: AiImageSizeSchema.default('1024x1024')
})
export type ValidatedAiImageConfig = z.infer<typeof AiImageConfigSchema>

export const AiImageSubjectSchema = z.enum(['npc-portrait', 'scene', 'item', 'creature', 'custom'])
export const AiImageGenerateRequestSchema = z.object({
  subjectType: AiImageSubjectSchema,
  description: z.string().min(1).max(4000),
  stylePreset: z.enum(['painterly', 'ink-sketch', 'photorealistic', 'isometric']).optional(),
  negativePrompt: z.string().max(2000).optional(),
  size: AiImageSizeSchema.optional()
})
export type ValidatedAiImageGenerateRequest = z.infer<typeof AiImageGenerateRequestSchema>

// PHASE-25 25B — entity-record IPC boundary schemas (separate from the DM-action zod).
// `source` is intentionally ['ai','dm'] only: renderers may write as the AI (record_entity
// executor) or the DM (panel edit), but NEVER 'extraction'. The 'extraction' source is
// internal-only (entity-extraction.ts calls EntityStore.upsertEntity directly, off-IPC), so
// a renderer cannot forge an extraction-source write — an explicit one fails safeParse here.
export const EntityUpsertPayloadSchema = z.object({
  kind: z.enum(['npc', 'location', 'item', 'faction']),
  name: z.string().min(1).max(120),
  summary: z.string().max(400).optional(),
  details: z.string().max(1200).optional(),
  aliases: z.array(z.string().max(60)).max(6).optional(),
  keywords: z.array(z.string().max(40)).max(8).optional(),
  injection: z.enum(['auto', 'always', 'never']).optional(),
  source: z.enum(['ai', 'dm']).default('ai')
})
export type EntityUpsertPayload = z.infer<typeof EntityUpsertPayloadSchema>

export const EntityStoreConfigPatchSchema = z.object({
  enabled: z.boolean().optional(),
  autoExtract: z.boolean().optional(),
  loreMode: z.enum(['all', 'triggered']).optional()
})
export type EntityStoreConfigPatch = z.infer<typeof EntityStoreConfigPatchSchema>

export const ActiveCreatureSchema = z.object({
  label: z.string(),
  currentHP: z.number(),
  maxHP: z.number(),
  ac: z.number(),
  conditions: z.array(z.string()),
  monsterStatBlockId: z.string().optional()
})

export const AiChatRequestSchema = z.object({
  campaignId: z.string(),
  message: z.string(),
  characterIds: z.array(z.string()),
  // PHASE-11 11F — the acting character (sender's own) gets a full sheet; others get
  // an abbreviated one-liner. Was being stripped here (zod drops unknown keys).
  actingCharacterId: z.string().optional(),
  senderName: z.string().optional(),
  activeCreatures: z.array(ActiveCreatureSchema).optional(),
  gameState: z.string().optional()
})

export type ValidatedAiConfig = z.infer<typeof AiConfigSchema>
export type ValidatedAiChatRequest = z.infer<typeof AiChatRequestSchema>

// ── Conversation import payload (PHASE-07 07E) ─────────────────────
// Validated at the AI_RESTORE_CONVERSATION boundary so a crafted .dndbackup can't write
// arbitrary JSON into ai-conversations/<id>.json. Lenient defaults: older backups may omit
// fields; '' timestamp is falsy so the renderer's `m.timestamp ? … : Date.now()` fallback applies.
export const ConversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  timestamp: z.string().default(''),
  contextChunkIds: z.array(z.string()).optional()
})
export const ConversationDataSchema = z.object({
  messages: z.array(ConversationMessageSchema).default([]),
  // PHASE-26: summaries carry optional layered-memory fields; zod strips unknown keys, so
  // they MUST be declared here or restore would silently drop tier/label/createdAt.
  summaries: z
    .array(
      z.object({
        content: z.string(),
        coversUpTo: z.number(),
        tier: z.enum(['scene', 'session', 'campaign']).optional(),
        label: z.string().optional(),
        createdAt: z.string().optional()
      })
    )
    .default([]),
  activeCharacterIds: z.array(z.string()).default([])
})
export type ValidatedConversationData = z.infer<typeof ConversationDataSchema>

// PHASE-26 26D — optional scene label for AI_END_SCENE (trimmed, bounded).
export const SceneLabelSchema = z.string().trim().min(1).max(120)

// PHASE-27 27D — world-state delta wire schema (IPC boundary; discriminated on `op`, bounded).
export const WorldDeltaSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('discover_location'),
    name: z.string().min(1).max(120),
    type: z.string().max(40).optional(),
    description: z.string().max(500).optional(),
    connectsTo: z.string().max(120).optional(),
    exitLabel: z.string().max(60).optional()
  }),
  z.object({ op: z.literal('move_party'), locationName: z.string().min(1).max(120) }),
  z.object({
    op: z.literal('link_locations'),
    fromName: z.string().min(1).max(120),
    toName: z.string().min(1).max(120),
    label: z.string().max(60).optional()
  }),
  z.object({
    op: z.literal('set_npc_opinion'),
    npcName: z.string().min(1).max(120),
    characterName: z.string().min(1).max(120),
    delta: z.number().int().min(-100).max(100).optional(),
    score: z.number().int().min(-100).max(100).optional(),
    summary: z.string().max(300).optional()
  }),
  z.object({
    op: z.literal('record_fact'),
    text: z.string().min(1).max(300),
    tags: z.array(z.string().max(40)).max(6).optional()
  })
])
export type WorldDelta = z.infer<typeof WorldDeltaSchema>

// PHASE-28 28B — structured quest objective + chapter advancement wire schemas (bounded).
export const QuestObjectiveUpdateSchema = z.object({
  questName: z.string().min(1).max(160),
  operation: z.enum(['add', 'complete', 'fail', 'reopen']),
  objective: z.string().min(1).max(300),
  evidence: z.string().max(300).optional()
})
export type QuestObjectiveUpdate = z.infer<typeof QuestObjectiveUpdateSchema>

export const AdvanceChapterSchema = z.object({
  title: z.string().max(160).optional(),
  goal: z.string().max(300).optional(),
  reason: z.string().max(300).optional()
})
export type AdvanceChapter = z.infer<typeof AdvanceChapterSchema>

// PHASE-37 37D — seed a pack's starter quests into the quest log (one validated, sanitized IPC).
export const SeedQuestsRequestSchema = z.object({
  campaignId: z.string().min(1),
  quests: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(2000).default(''),
        objectives: z.array(z.string().min(1).max(500)).max(8).default([]),
        chapterQuest: z.boolean().default(false)
      })
    )
    .min(1)
    .max(25)
})
export type SeedQuestsRequest = z.infer<typeof SeedQuestsRequestSchema>

// PHASE-28 28D — dice-oracle wire schemas (bounded).
export const OracleFateCheckSchema = z.object({
  question: z.string().min(1).max(300),
  likelihood: z.enum(['impossible', 'very-unlikely', 'unlikely', 'even', 'likely', 'very-likely', 'sure-thing'])
})
export type OracleFateCheckRequest = z.infer<typeof OracleFateCheckSchema>

// Set the chaos factor (absolute `value` wins over relative `delta`); engine clamps to 1..9.
export const OracleSetChaosSchema = z
  .object({
    value: z.number().int().optional(),
    delta: z.number().int().optional()
  })
  .refine((d) => d.value !== undefined || d.delta !== undefined, { message: 'value or delta required' })
export type OracleSetChaosRequest = z.infer<typeof OracleSetChaosSchema>

// PHASE-31 31B/31C — recap + campaign Q&A wire schemas.
export const SessionStartRecapRequestSchema = z.object({
  campaignId: z.string().uuid(),
  force: z.boolean().optional()
})
export type SessionStartRecapRequest = z.infer<typeof SessionStartRecapRequestSchema>

export const CampaignQaAskSchema = z.object({
  campaignId: z.string().uuid(),
  question: z.string().trim().min(1).max(2000)
})
export type CampaignQaAsk = z.infer<typeof CampaignQaAskSchema>

// ── Security Audit (20g) ───────────────────────────────────────────
// Payload the renderer sends to record a security event in the main-process
// audit log. `event` is a short dotted name (e.g. "host.kick"); `details` is
// arbitrary context (main caps it at 4 KB). Bounded so a hostile renderer
// can't bloat the log via this channel.
export const SecurityEventSchema = z.object({
  event: z.string().min(1).max(120),
  details: z.record(z.string(), z.unknown()).optional()
})

export type ValidatedSecurityEvent = z.infer<typeof SecurityEventSchema>

// ── LAN Discovery (Phase 29g) ──────────────────────────────────────
// Payload exchanged with the main process when publishing a hosted
// game over mDNS and when the renderer is notified that a new peer
// has been seen. Schema mirrors the Pi-registry listing fields so the
// renderer can feed both streams into the same GameCard component.

export const LanPublishSchema = z.object({
  invite_code: z.string().min(4).max(16),
  name: z.string().min(1).max(80),
  host_display_name: z.string().min(1).max(80),
  host_client_id: z.string().min(1).max(64),
  current_players: z.number().int().nonnegative(),
  max_players: z.number().int().min(1).max(20),
  current_spectators: z.number().int().nonnegative(),
  max_spectators: z.number().int().nonnegative().max(20),
  game_system: z.string().min(1).max(32),
  is_private: z.boolean(),
  peer_id: z.string().min(1).max(128),
  port: z.number().int().min(1).max(65535).default(9999)
})

export const LanGameFoundSchema = LanPublishSchema.extend({
  source: z.literal('lan'),
  host: z.string().optional(),
  addresses: z.array(z.string()).optional()
})

const LanGameRemovedSchema = z.object({
  source: z.literal('lan'),
  peer_id: z.string(),
  invite_code: z.string().optional()
})

export type ValidatedLanPublish = z.infer<typeof LanPublishSchema>
export type ValidatedLanGameFound = z.infer<typeof LanGameFoundSchema>
export type ValidatedLanGameRemoved = z.infer<typeof LanGameRemovedSchema>

// ── BMO Sync receiver (Phase 28a.3) ────────────────────────────────
// Payloads accepted by the main-process sync HTTP server (Pi Discord
// bot → VTT). Discriminated on `type` so each branch validates only
// the fields it actually consumes.

const SyncEventBaseFields = {
  timestamp: z.number().int().nonnegative(),
  // Optional idempotency key — BMO stamps a uuid per event and retries the POST
  // on failure with the SAME id; the bridge dedups on it so a retried roll/message
  // isn't applied twice. Optional for back-compat with pre-retry BMO builds.
  eventId: z.string().max(64).optional()
}

const DiscordMessagePayloadSchema = z
  .object({
    text: z.string().min(0).max(4000),
    author: z.string().max(120).optional(),
    channelId: z.string().max(64).optional(),
    system: z.boolean().optional()
  })
  .loose()

const DiscordRollPayloadSchema = z
  .object({
    formula: z.string().min(1).max(120),
    total: z.number(),
    rolls: z.array(z.number()).optional(),
    rollerName: z.string().max(120).optional(),
    reason: z.string().max(200).optional()
  })
  .loose()

const PlayerJoinLeavePayloadSchema = z
  .object({
    playerId: z.string().max(64).optional(),
    playerName: z.string().max(120).optional(),
    discordId: z.string().max(64).optional()
  })
  .loose()

const StateRequestPayloadSchema = z.object({}).loose()

const InitiativeSyncEntrySchema = z.object({
  entityName: z.string().min(1).max(120),
  entityType: z.string().min(1).max(64),
  isActive: z.boolean()
})

export const InitiativeSyncSchema = z.object({
  entries: z.array(InitiativeSyncEntrySchema).max(64),
  currentIndex: z.number().int().nonnegative(),
  round: z.number().int().nonnegative()
})

export const SyncEventSchema = z.discriminatedUnion('type', [
  z.object({
    ...SyncEventBaseFields,
    type: z.literal('discord_message'),
    payload: DiscordMessagePayloadSchema
  }),
  z.object({
    ...SyncEventBaseFields,
    type: z.literal('discord_roll'),
    payload: DiscordRollPayloadSchema
  }),
  z.object({
    ...SyncEventBaseFields,
    type: z.literal('initiative_sync'),
    payload: InitiativeSyncSchema
  }),
  z.object({
    ...SyncEventBaseFields,
    type: z.literal('player_join'),
    payload: PlayerJoinLeavePayloadSchema
  }),
  z.object({
    ...SyncEventBaseFields,
    type: z.literal('player_leave'),
    payload: PlayerJoinLeavePayloadSchema
  }),
  z.object({
    ...SyncEventBaseFields,
    type: z.literal('state_request'),
    payload: StateRequestPayloadSchema
  }),
  // PHASE-22 22D (F4): main-internal "BMO unreachable" event (never from the Pi);
  // in the union so the renderer's ValidatedSyncEvent type stays complete.
  z.object({
    ...SyncEventBaseFields,
    type: z.literal('bmo_unreachable'),
    payload: z.object({}).loose()
  })
])

export type ValidatedSyncEvent = z.infer<typeof SyncEventSchema>
export type ValidatedInitiativeSync = z.infer<typeof InitiativeSyncSchema>

// ── PHASE-20 20F: Discord narration control ────────────────────────
// main→renderer narrate-failure status (validated before send).
export const BmoNarrationStatusSchema = z.object({
  ok: z.boolean(),
  result: z.string().optional(),
  error: z.string().optional(),
  statusCode: z.number().optional()
})
export type BmoNarrationStatus = z.infer<typeof BmoNarrationStatusSchema>

// renderer→main narration-enabled toggle (also reused for the bargeIn toggle).
export const NarrationEnabledSchema = z.boolean()

// ── PHASE-21 21B: narrate payload (zod at the BMO_NARRATE boundary) ─
// First schema for a BMO_* channel — bounds a renderer→main narrate so a hostile
// renderer can't push an unbounded body through to the Pi.
export const BmoNarrateRequestSchema = z.object({
  text: z.string().min(1).max(8000),
  npc: z.string().max(40).optional(),
  emotion: z.string().max(24).optional(),
  speaker: z.string().max(40).optional(),
  interrupt: z.boolean().optional()
})
export type BmoNarrateRequest = z.infer<typeof BmoNarrateRequestSchema>

// ── PHASE-21 21C: voice-cast management (zod at the BMO_VOICE_CAST_* boundary) ─
export const VoiceCastGetSchema = z.object({ campaignId: z.string().min(1).max(64) })
export const VoiceCastSetSchema = z.object({
  campaignId: z.string().min(1).max(64),
  speaker: z.string().min(1).max(40),
  voiceId: z.string().max(64).optional(),
  speed: z.number().min(0.5).max(1.5).optional(),
  pitch: z.number().int().min(-10).max(8).optional()
})
export const VoiceCastResetSchema = z.object({
  campaignId: z.string().min(1).max(64),
  speaker: z.string().min(1).max(40)
})
export type ValidatedVoiceCastSet = z.infer<typeof VoiceCastSetSchema>

// ── PHASE-36 36D: play-by-post (zod at the BMO_PBP_* boundary) ──
export const PbpParticipantSchema = z.object({
  name: z.string().min(1).max(64),
  character: z.string().max(64).optional()
})
export const PbpStartSchema = z.object({
  campaignId: z.string().min(1),
  scene: z.string().min(1).max(200),
  participants: z.array(PbpParticipantSchema).min(1).max(12),
  channelId: z.string().optional(),
  reminderHours: z.number().min(1).max(168).optional(),
  autoSkip: z.boolean().optional()
})
export const PbpAdvanceSchema = z.object({
  campaignId: z.string().min(1),
  expectedTurnIndex: z.number().int().nonnegative().optional(),
  excerpt: z.string().max(500).optional()
})
export const PbpSceneSchema = z.object({
  campaignId: z.string().min(1),
  scene: z.string().min(1).max(200),
  participants: z.array(PbpParticipantSchema).min(1).max(12).optional()
})
export const PbpCampaignSchema = z.object({ campaignId: z.string().min(1) })
