import { z } from 'zod'

export const AiProviderTypeSchema = z.enum(['ollama', 'claude', 'openai', 'gemini'])

export const AiConfigSchema = z.object({
  provider: AiProviderTypeSchema.default('ollama'),
  model: z.string(),
  ollamaUrl: z.string().default('http://localhost:11434'),
  claudeApiKey: z.string().optional(),
  openaiApiKey: z.string().optional(),
  geminiApiKey: z.string().optional(),
  ollamaModel: z.string().optional()
})

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
  senderName: z.string().optional(),
  activeCreatures: z.array(ActiveCreatureSchema).optional(),
  gameState: z.string().optional()
})

export type ValidatedAiConfig = z.infer<typeof AiConfigSchema>
export type ValidatedAiChatRequest = z.infer<typeof AiChatRequestSchema>

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

export const LanGameRemovedSchema = z.object({
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
  })
])

export type ValidatedSyncEvent = z.infer<typeof SyncEventSchema>
export type ValidatedInitiativeSync = z.infer<typeof InitiativeSyncSchema>
