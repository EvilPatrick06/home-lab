import type { ChatMessage, StreamCallbacks } from './types'

export type AiProviderType = 'ollama' | 'claude' | 'openai' | 'gemini'

const AI_PROVIDER_LABELS: Record<AiProviderType, string> = {
  ollama: 'Ollama (Local)',
  claude: 'Claude (Anthropic)',
  openai: 'OpenAI',
  gemini: 'Gemini (Google)'
}

/**
 * Phase 28b.4 — model-aware max-tokens default. Opus gets a larger budget for
 * long narration; Sonnet/Haiku default lower. A caller-supplied value wins.
 */
export function defaultMaxTokensForModel(model: string): number {
  if (model.includes('opus')) return 16384
  return 8192
}

export interface LLMProvider {
  readonly type: AiProviderType

  streamChat(
    systemPrompt: string,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    model: string,
    abortSignal?: AbortSignal,
    maxTokens?: number
  ): Promise<void>

  chatOnce(systemPrompt: string, messages: ChatMessage[], model: string, maxTokens?: number): Promise<string>

  isAvailable(): Promise<boolean>

  listModels(): Promise<string[]>
}

// ── Standardized LLM Errors ──

class LLMAuthError extends Error {
  readonly provider: AiProviderType

  constructor(provider: AiProviderType, message?: string) {
    super(message ?? `Authentication failed for ${AI_PROVIDER_LABELS[provider]}. Check your API key.`)
    this.name = 'LLMAuthError'
    this.provider = provider
  }
}

class LLMRateLimitError extends Error {
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

class LLMProviderError extends Error {
  readonly provider: AiProviderType
  readonly code: string | undefined

  constructor(provider: AiProviderType, message: string, code?: string) {
    super(`${AI_PROVIDER_LABELS[provider]}: ${message}`)
    this.name = 'LLMProviderError'
    this.provider = provider
    this.code = code
  }
}

/**
 * Phase 17d (NET-8) — combine the caller's abort signal (if any) with a hard request timeout so
 * cloud calls can't hang forever. Mirrors the Ollama client's 120s default.
 */
export function withRequestTimeout(signal?: AbortSignal, ms = 120_000): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
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
