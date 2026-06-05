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
 * Hard per-request timeout for every provider (Ollama + cloud). Deliberately set
 * BELOW the renderer's STREAM_SAFETY_TIMEOUT_MS (120s, app-constants.ts) so a real
 * provider failure (connection refused, 404 model-not-found, a model that never
 * yields a token) is classified and delivered to the UI via onStreamError BEFORE
 * the renderer gives up — instead of the renderer winning the race and masking the
 * cause with a generic "AI response timed out". INVARIANT: this < STREAM_SAFETY_TIMEOUT_MS.
 */
export const PROVIDER_REQUEST_TIMEOUT_MS = 90_000

/**
 * Ollama needs a SEPARATE, two-phase timeout because a local model on a CPU laptop
 * can spend minutes in prompt-evaluation (prefill) of a large system prompt BEFORE it
 * emits the first token — a single hard 90s cap kills that mid-prefill, so the user
 * saw "AI is typing" for ~5 min (3 retries × 90s) then "timed out" with zero output.
 *
 * - PREFILL: time-to-first-token budget (generous — covers cold model load + prefill).
 * - INACTIVITY: once tokens are flowing, abort only if the stream goes silent this long
 *   (catches a genuinely hung connection without killing a slow-but-alive generation).
 *
 * The renderer's STREAM_SAFETY_TIMEOUT_MS must stay ABOVE OLLAMA_PREFILL_TIMEOUT_MS so a
 * valid slow prefill isn't masked by the generic UI timeout.
 */
export const OLLAMA_PREFILL_TIMEOUT_MS = 300_000
export const OLLAMA_INACTIVITY_TIMEOUT_MS = 90_000

/**
 * Phase 17d (NET-8) — combine the caller's abort signal (if any) with a hard request timeout so
 * cloud calls can't hang forever.
 */
export function withRequestTimeout(signal?: AbortSignal, ms = PROVIDER_REQUEST_TIMEOUT_MS): AbortSignal {
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
