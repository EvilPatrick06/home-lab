import { type LLMProvider, OLLAMA_INACTIVITY_TIMEOUT_MS, OLLAMA_PREFILL_TIMEOUT_MS } from './llm-provider'
import { OLLAMA_BASE_URL } from '../ollama-constants'
import { OLLAMA_KEEP_ALIVE, resolveNumCtx } from '../context/ollama-context'
import type { ChatMessage, StreamCallbacks } from '../types'

let ollamaBaseUrl = OLLAMA_BASE_URL

/** Set the Ollama base URL (e.g. for remote GPU servers). */
export function setOllamaUrl(url: string): void {
  ollamaBaseUrl = url.replace(/\/+$/, '') // strip trailing slashes
}

/** Get the current Ollama base URL. */
export function getOllamaUrl(): string {
  return ollamaBaseUrl
}

// PHASE-29 29E — local-endpoint flavor. 'ollama' (default) speaks Ollama's native `/api/chat` +
// `/api/tags`; 'llamacpp' targets a llama.cpp `llama-server` over its OpenAI-compatible endpoints
// (`/v1/chat/completions`, `/v1/models`, `/health`) without Ollama-only fields. Module-level state
// (like ollamaBaseUrl) so the probe/chat helpers branch without signature changes.
let localEndpointFlavor: 'ollama' | 'llamacpp' = 'ollama'
export function setLocalEndpointFlavor(flavor: 'ollama' | 'llamacpp'): void {
  localEndpointFlavor = flavor === 'llamacpp' ? 'llamacpp' : 'ollama'
}
/** Native `/api/chat` response object (one per NDJSON line when streaming, or the
 *  whole body when not). `message.thinking` carries thinking-model reasoning on
 *  newer servers — intentionally ignored so it never leaks into narration. */
interface OllamaChatResponse {
  message?: { role?: string; content?: string; thinking?: string }
  done?: boolean
  done_reason?: string
  prompt_eval_count?: number
  eval_count?: number
  error?: string
}

/** llama-server OpenAI-compatible non-streaming response shape (`/v1/chat/completions`). */
interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  error?: { message?: string } | string
}

/** Token counts from the last completed Ollama call's final chunk. Observability
 *  only (PHASE-14 consumes it); never fed into budget math. */
export interface OllamaLastStats {
  model: string
  promptEvalCount: number
  evalCount: number
  at: string
}
let lastStats: OllamaLastStats | null = null
export function getLastOllamaStats(): OllamaLastStats | null {
  return lastStats
}

/** Turn an Ollama HTTP error into an actionable message. A 404 means the model
 * isn't pulled — tell the user exactly how to fix it instead of a raw status. */
function ollamaHttpError(status: number, body: string, model: string): Error {
  if (localEndpointFlavor === 'llamacpp') {
    if (status === 404) {
      return new Error(
        `llama-server returned 404 for model "${model}". Check that llama-server is running at ${ollamaBaseUrl} and serving a model.`
      )
    }
    return new Error(`llama-server API error ${status}: ${body}`)
  }
  if (status === 404) {
    return new Error(`Model "${model}" is not installed on Ollama. Install it with: ollama pull ${model}`)
  }
  return new Error(`Ollama API error ${status}: ${body}`)
}

/** Check if the local endpoint is running (2s timeout). llama-server exposes `/health`
 *  (`{"status":"ok"}` when ready, 503 while loading); Ollama exposes `/api/tags`. */
export async function isOllamaRunning(): Promise<boolean> {
  const path = localEndpointFlavor === 'llamacpp' ? '/health' : '/api/tags'
  try {
    const res = await fetch(`${ollamaBaseUrl}${path}`, {
      signal: AbortSignal.timeout(2000)
    })
    return res.ok
  } catch {
    return false
  }
}

/** Bound the model-list fetch (matches listInstalledModelsDetailed's 5s). */
const OLLAMA_LIST_TIMEOUT_MS = 5000

/** List installed models — THROWS on network failure/timeout/non-OK status so
 *  callers can distinguish "unreachable host" from "no models installed". 5s bound. */
export async function fetchOllamaModels(): Promise<string[]> {
  if (localEndpointFlavor === 'llamacpp') {
    // llama-server OpenAI listing: { data: [{ id }] } where id = model path or --alias value.
    const res = await fetch(`${ollamaBaseUrl}/v1/models`, { signal: AbortSignal.timeout(OLLAMA_LIST_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`llama-server /v1/models returned HTTP ${res.status}`)
    const data = (await res.json()) as { data?: Array<{ id: string }> }
    return (data.data || []).map((m) => m.id)
  }
  const res = await fetch(`${ollamaBaseUrl}/api/tags`, { signal: AbortSignal.timeout(OLLAMA_LIST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`Ollama /api/tags returned HTTP ${res.status}`)
  const data = (await res.json()) as { models?: Array<{ name: string }> }
  return (data.models || []).map((m) => m.name)
}

/** Lenient list — [] on any failure (UI list paths). Bounded via fetchOllamaModels. */
export async function listOllamaModels(): Promise<string[]> {
  try {
    return await fetchOllamaModels()
  } catch {
    return []
  }
}

/** Parse one stream line into a normalized delta, branching on flavor. Ollama streams NDJSON
 *  (one full JSON object per line); llama-server streams OpenAI SSE (`data: {...}` / `data: [DONE]`).
 *  Returns null for a line that carries nothing (blank, non-data SSE prefix, malformed). */
function parseStreamLine(
  line: string
): { content?: string; done?: boolean; error?: string; promptEval?: number; evalCount?: number } | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  if (localEndpointFlavor === 'llamacpp') {
    if (!trimmed.startsWith('data:')) return null
    const payload = trimmed.slice(5).trim()
    if (payload === '[DONE]') return { done: true }
    try {
      const obj = JSON.parse(payload) as {
        choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>
        usage?: { prompt_tokens?: number; completion_tokens?: number }
        error?: { message?: string } | string
      }
      if (obj.error) return { error: typeof obj.error === 'string' ? obj.error : (obj.error.message ?? 'stream error') }
      const choice = obj.choices?.[0]
      return {
        content: choice?.delta?.content || undefined,
        done: choice?.finish_reason ? true : undefined,
        promptEval: obj.usage?.prompt_tokens,
        evalCount: obj.usage?.completion_tokens
      }
    } catch {
      return null
    }
  }
  try {
    const parsed = JSON.parse(trimmed) as OllamaChatResponse
    if (parsed.error) return { error: parsed.error }
    return {
      content: parsed.message?.content || undefined,
      done: parsed.done || undefined,
      promptEval: parsed.prompt_eval_count,
      evalCount: parsed.eval_count
    }
  } catch {
    return null
  }
}

/** Streaming chat: Ollama native `/api/chat` (NDJSON) or llama-server `/v1/chat/completions` (SSE). */
export async function ollamaStreamChat(
  systemPrompt: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  model: string,
  abortSignal?: AbortSignal
): Promise<void> {
  const apiMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as string, content: m.content }))
  ]

  // NO hard time limit on prompt prefill (a local model on CPU can take minutes to read
  // a large prompt before the first token, and killing it mid-prefill was the whole bug).
  // Instead: leave prefill UNBOUNDED here (the caller's abort signal + the stale-stream
  // sweep are the absolute backstop, and the renderer watches via a heartbeat/tracker and
  // lets the user cancel). Once tokens are FLOWING, arm an inter-token inactivity guard so
  // a genuinely stalled/hung generation is still detected. `timedOut` distinguishes our
  // abort from a user cancel so the catch reports the right thing.
  const timeoutController = new AbortController()
  let timedOut = false
  let inactivityTimer: ReturnType<typeof setTimeout> | undefined
  const armInactivity = (): void => {
    clearTimeout(inactivityTimer)
    inactivityTimer = setTimeout(() => {
      timedOut = true
      timeoutController.abort()
    }, OLLAMA_INACTIVITY_TIMEOUT_MS)
  }

  try {
    const combinedSignal = abortSignal
      ? AbortSignal.any([abortSignal, timeoutController.signal])
      : timeoutController.signal

    // llama-server: OpenAI endpoint, no Ollama-only fields (no keep_alive/options/num_ctx probe).
    const isLlamacpp = localEndpointFlavor === 'llamacpp'
    const url = isLlamacpp ? `${ollamaBaseUrl}/v1/chat/completions` : `${ollamaBaseUrl}/api/chat`
    const body = isLlamacpp
      ? { model, messages: apiMessages, stream: true }
      : {
          model,
          messages: apiMessages,
          stream: true,
          keep_alive: OLLAMA_KEEP_ALIVE,
          options: { num_ctx: await resolveNumCtx(model, ollamaBaseUrl) }
        }
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: combinedSignal
    })

    if (!res.ok) {
      const body = await res.text()
      callbacks.onError(ollamaHttpError(res.status, body, model))
      return
    }

    if (!res.body) {
      callbacks.onError(new Error('No response body from Ollama'))
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let fullText = ''
    let lineBuffer = ''
    let streamErr: Error | undefined

    // Native /api/chat streams NDJSON: one complete JSON object per line. The
    // lineBuffer accumulates across network chunks so a line split mid-object is
    // only parsed once `\n` arrives.
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      // Tokens are flowing — (re)arm the inter-token inactivity guard. Until the first
      // read, prefill runs with no deadline.
      armInactivity()

      lineBuffer += decoder.decode(value, { stream: true })
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() || ''

      for (const line of lines) {
        const parsed = parseStreamLine(line)
        if (!parsed) continue
        if (parsed.error) {
          streamErr = new Error(parsed.error)
          break
        }
        if (parsed.content) {
          fullText += parsed.content
          callbacks.onText(parsed.content)
        }
        if (parsed.done) {
          lastStats = {
            model,
            promptEvalCount: parsed.promptEval ?? 0,
            evalCount: parsed.evalCount ?? 0,
            at: new Date().toISOString()
          }
        }
      }
      if (streamErr) break
    }

    // A trailing complete line with no terminating newline (rare, but handle it for safety).
    const tail = lineBuffer.trim()
    if (!streamErr && tail) {
      const parsed = parseStreamLine(tail)
      if (parsed?.error) streamErr = new Error(parsed.error)
      else if (parsed) {
        if (parsed.content) {
          fullText += parsed.content
          callbacks.onText(parsed.content)
        }
        if (parsed.done) {
          lastStats = {
            model,
            promptEvalCount: parsed.promptEval ?? 0,
            evalCount: parsed.evalCount ?? 0,
            at: new Date().toISOString()
          }
        }
      }
    }

    clearTimeout(inactivityTimer)
    if (streamErr) {
      callbacks.onError(streamErr)
      return
    }
    callbacks.onDone(fullText)
  } catch (error) {
    clearTimeout(inactivityTimer)
    // User-initiated cancel — swallow (the caller already tore down the stream).
    if (abortSignal?.aborted) return
    // The inter-token inactivity guard fired (generation stalled), or fetch's own
    // TimeoutError. Prefill itself is never timed out here.
    if (timedOut || (error instanceof Error && error.name === 'TimeoutError')) {
      callbacks.onError(
        new Error(
          `${localEndpointFlavor === 'llamacpp' ? 'llama-server' : 'Ollama'} stopped responding (no output for ${Math.round(OLLAMA_INACTIVITY_TIMEOUT_MS / 1000)}s mid-generation). The model may have stalled — check the server, or try a smaller model.`
        )
      )
      return
    }
    callbacks.onError(error instanceof Error ? error : new Error(String(error)))
  }
}

/** Non-streaming chat via Ollama. */
export async function ollamaChatOnce(systemPrompt: string, messages: ChatMessage[], model: string): Promise<string> {
  const apiMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as string, content: m.content }))
  ]

  const isLlamacpp = localEndpointFlavor === 'llamacpp'
  const url = isLlamacpp ? `${ollamaBaseUrl}/v1/chat/completions` : `${ollamaBaseUrl}/api/chat`
  const body = isLlamacpp
    ? { model, messages: apiMessages, stream: false }
    : {
        model,
        messages: apiMessages,
        stream: false,
        keep_alive: OLLAMA_KEEP_ALIVE,
        options: { num_ctx: await resolveNumCtx(model, ollamaBaseUrl) }
      }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // Non-streaming (summaries) — a large prompt on CPU can prefill for minutes, so use
    // the same generous prefill budget rather than the 90s cap.
    signal: AbortSignal.timeout(OLLAMA_PREFILL_TIMEOUT_MS)
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw ollamaHttpError(res.status, errBody, model)
  }

  if (isLlamacpp) {
    const data = (await res.json()) as OpenAIChatResponse
    if (data.error)
      throw new Error(typeof data.error === 'string' ? data.error : (data.error.message ?? 'llama-server error'))
    lastStats = {
      model,
      promptEvalCount: data.usage?.prompt_tokens ?? 0,
      evalCount: data.usage?.completion_tokens ?? 0,
      at: new Date().toISOString()
    }
    return data.choices?.[0]?.message?.content || ''
  }
  const data = (await res.json()) as OllamaChatResponse
  if (data.error) throw new Error(data.error)
  lastStats = {
    model,
    promptEvalCount: data.prompt_eval_count ?? 0,
    evalCount: data.eval_count ?? 0,
    at: new Date().toISOString()
  }
  return data.message?.content || ''
}

/**
 * PHASE-23 23B: constrained-decoding call. Ollama uses `/api/chat` + `format`=JSON schema;
 * llama-server (PHASE-29 29E) uses `/v1/chat/completions` + OpenAI `response_format`=json_schema.
 * ALWAYS `stream: false` (F5 upstream bugs); never passes `think`.
 */
export async function ollamaStructuredOnce(
  systemPrompt: string,
  messages: ChatMessage[],
  model: string,
  jsonSchema: Record<string, unknown>
): Promise<string> {
  const apiMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as string, content: m.content }))
  ]

  const isLlamacpp = localEndpointFlavor === 'llamacpp'
  const url = isLlamacpp ? `${ollamaBaseUrl}/v1/chat/completions` : `${ollamaBaseUrl}/api/chat`
  const body = isLlamacpp
    ? {
        model,
        messages: apiMessages,
        stream: false,
        temperature: 0,
        response_format: { type: 'json_schema', json_schema: { name: 'response', schema: jsonSchema, strict: true } }
      }
    : {
        model,
        messages: apiMessages,
        stream: false,
        format: jsonSchema,
        keep_alive: OLLAMA_KEEP_ALIVE,
        options: { num_ctx: await resolveNumCtx(model, ollamaBaseUrl), temperature: 0 }
      }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(OLLAMA_PREFILL_TIMEOUT_MS)
  })

  if (!res.ok) {
    const errBody = await res.text()
    throw ollamaHttpError(res.status, errBody, model)
  }

  if (isLlamacpp) {
    const data = (await res.json()) as OpenAIChatResponse
    if (data.error)
      throw new Error(typeof data.error === 'string' ? data.error : (data.error.message ?? 'llama-server error'))
    return data.choices?.[0]?.message?.content || ''
  }
  const data = (await res.json()) as OllamaChatResponse
  if (data.error) throw new Error(data.error)
  return data.message?.content || ''
}

/** LLMProvider implementation wrapping the module-level Ollama functions. */
export const ollamaProvider: LLMProvider = {
  type: 'ollama',
  streamChat: ollamaStreamChat,
  chatOnce: ollamaChatOnce,
  isAvailable: isOllamaRunning,
  listModels: listOllamaModels,
  structuredOnce: ollamaStructuredOnce
}
