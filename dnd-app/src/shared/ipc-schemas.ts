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
