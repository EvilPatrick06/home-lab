import type { ChatMessage, StreamCallbacks } from './types'

export type AiProviderType = 'ollama' | 'claude' | 'openai' | 'gemini'

export const AI_PROVIDER_LABELS: Record<AiProviderType, string> = {
  ollama: 'Ollama (Local)',
  claude: 'Claude (Anthropic)',
  openai: 'OpenAI',
  gemini: 'Gemini (Google)'
}

export interface CloudModelInfo {
  id: string
  name: string
  desc: string
}

export const CLOUD_MODELS: Record<Exclude<AiProviderType, 'ollama'>, CloudModelInfo[]> = {
  claude: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', desc: 'Best balance of speed and intelligence' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', desc: 'Fast, intelligent, great for D&D' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', desc: 'Fastest, good for quick responses' }
  ],
  openai: [
    { id: 'gpt-4o', name: 'GPT-4o', desc: 'Most capable OpenAI model' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', desc: 'Fast and affordable' },
    { id: 'o3-mini', name: 'o3-mini', desc: 'Reasoning model, slower but thorough' }
  ],
  gemini: [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', desc: 'Fast multimodal model' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', desc: 'Most capable Gemini model' },
    { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', desc: 'Fast and efficient' }
  ]
}

export interface LLMProvider {
  readonly type: AiProviderType

  streamChat(
    systemPrompt: string,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    model: string,
    abortSignal?: AbortSignal
  ): Promise<void>

  chatOnce(systemPrompt: string, messages: ChatMessage[], model: string): Promise<string>

  isAvailable(): Promise<boolean>

  listModels(): Promise<string[]>
}

// ── Standardized LLM Errors ──

export class LLMAuthError extends Error {
  readonly provider: AiProviderType

  constructor(provider: AiProviderType, message?: string) {
    super(message ?? `Authentication failed for ${AI_PROVIDER_LABELS[provider]}. Check your API key.`)
    this.name = 'LLMAuthError'
    this.provider = provider
  }
}

export class LLMRateLimitError extends Error {
  readonly provider: AiProviderType
  readonly retryAfterMs: number | undefined

  constructor(provider: AiProviderType, retryAfterMs?: number) {
    const retryMsg = retryAfterMs ? ` Retry after ${Math.ceil(retryAfterMs / 1000)}s.` : ''
    super(`Rate limit exceeded for ${AI_PROVIDER_LABELS[provider]}.${retryMsg}`)
    this.name = 'LLMRateLimitError'
    this.provider = provider
    this.retryAfterMs = retryAfterMs
  }
}

export class LLMProviderError extends Error {
  readonly provider: AiProviderType
  readonly code: string | undefined

  constructor(provider: AiProviderType, message: string, code?: string) {
    super(`${AI_PROVIDER_LABELS[provider]}: ${message}`)
    this.name = 'LLMProviderError'
    this.provider = provider
    this.code = code
  }
}

/** Classify a raw API error into a standardized LLM error. */
export function classifyProviderError(provider: AiProviderType, error: unknown): Error {
  if (error instanceof LLMAuthError || error instanceof LLMRateLimitError || error instanceof LLMProviderError) {
    return error
  }

  const msg = error instanceof Error ? error.message : String(error)
  const status = (error as { status?: number })?.status

  if (status === 401 || status === 403 || /unauthorized|forbidden|invalid.*key|auth/i.test(msg)) {
    return new LLMAuthError(provider)
  }

  if (status === 429 || /rate.?limit|too many requests|quota/i.test(msg)) {
    const retryHeader = (error as { headers?: { get?: (k: string) => string | null } })?.headers?.get?.('retry-after')
    const retryMs = retryHeader ? Number.parseInt(retryHeader, 10) * 1000 : undefined
    return new LLMRateLimitError(provider, Number.isNaN(retryMs) ? undefined : retryMs)
  }

  return new LLMProviderError(provider, msg)
}
