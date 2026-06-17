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

  // PHASE-23 23B: optional constrained-decoding call (non-streaming, `format`=JSON
  // schema). Optional so cloud providers compile untouched; implemented for Ollama
  // only (F9). Returns the raw model content (caller parses).
  structuredOnce?(
    systemPrompt: string,
    messages: ChatMessage[],
    model: string,
    jsonSchema: Record<string, unknown>
  ): Promise<string>
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
 * Whole-request ceiling for NON-streaming cloud calls (`chatOnce` background
 * summaries) and provider availability probes only. Streaming no longer uses this
 * — it uses `createStreamInactivityGuard` below, so a long narration is never
 * killed on total duration (PHASE-03). Kept below the renderer's
 * STREAM_SAFETY_TIMEOUT_MS (330s, an inactivity timer re-armed per token/heartbeat
 * in use-ai-dm-store `rearmSafetyTimeout`) so a dead provider is classified and
 * surfaced before the renderer's backstop. INVARIANT: this < STREAM_SAFETY_TIMEOUT_MS.
 */
export const PROVIDER_REQUEST_TIMEOUT_MS = 90_000

/**
 * Cloud STREAMING timeouts. Cloud providers prefill server-side in seconds, so the
 * time-to-first-token IS bounded (a connect/hang failure is classified before the
 * renderer's 330s backstop). Once tokens flow, only inter-token SILENCE aborts the
 * stream; total stream duration is UNBOUNDED (long narrations were previously killed
 * at 90s wall-clock). INVARIANT: both < STREAM_SAFETY_TIMEOUT_MS (330s).
 */
export const CLOUD_FIRST_TOKEN_TIMEOUT_MS = 90_000
export const CLOUD_INACTIVITY_TIMEOUT_MS = 90_000

/** Reusable first-token + inter-token inactivity guard for cloud streaming —
 *  mirrors the proven Ollama pattern (ollama-client armInactivity). */
export interface StreamInactivityGuard {
  /** Combined caller-abort + guard signal — pass to the SDK request. */
  signal: AbortSignal
  /** Re-arm the inactivity window; call on every token/SSE event. */
  bump: () => void
  /** Stop the timer; call on done and in every catch/finally. */
  clear: () => void
  /** True iff the GUARD aborted (vs the caller's signal). */
  timedOut: () => boolean
}

export function createStreamInactivityGuard(options?: {
  firstTokenMs?: number
  inactivityMs?: number
  signal?: AbortSignal
}): StreamInactivityGuard {
  const controller = new AbortController()
  const firstTokenMs = options?.firstTokenMs ?? CLOUD_FIRST_TOKEN_TIMEOUT_MS
  const inactivityMs = options?.inactivityMs ?? CLOUD_INACTIVITY_TIMEOUT_MS
  let timer: ReturnType<typeof setTimeout> | undefined
  let didTimeOut = false
  const arm = (ms: number): void => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      didTimeOut = true
      controller.abort()
    }, ms)
  }
  arm(firstTokenMs)
  return {
    signal: options?.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal,
    bump: () => arm(inactivityMs),
    clear: () => clearTimeout(timer),
    timedOut: () => didTimeOut
  }
}

/**
 * Ollama timeouts. A local model on a CPU laptop can spend minutes in prompt-evaluation
 * (prefill) of a large system prompt BEFORE it emits the first token — killing that
 * mid-prefill was the original "AI is typing for 5 min then timed out, no output" bug.
 *
 * - INACTIVITY: the STREAMING path does NOT time out prefill at all (it runs until the
 *   first token, bounded only by the caller's abort + the stale-stream sweep + the user's
 *   Cancel). Once tokens are flowing, this inter-token guard aborts only if the stream
 *   goes silent — catching a genuinely stalled generation without killing slow prefill.
 * - PREFILL: used ONLY by the non-streaming path (ollamaChatOnce — background summaries),
 *   which has no token stream to watch, so it still needs one generous overall ceiling.
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
