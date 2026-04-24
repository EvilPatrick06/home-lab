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
