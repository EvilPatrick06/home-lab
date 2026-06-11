import { type LLMProvider, OLLAMA_INACTIVITY_TIMEOUT_MS, OLLAMA_PREFILL_TIMEOUT_MS } from './llm-provider'
import { OLLAMA_BASE_URL } from './ollama-constants'
import { OLLAMA_KEEP_ALIVE, resolveNumCtx } from './ollama-context'
import type { ChatMessage, StreamCallbacks } from './types'

let ollamaBaseUrl = OLLAMA_BASE_URL

/** Set the Ollama base URL (e.g. for remote GPU servers). */
export function setOllamaUrl(url: string): void {
  ollamaBaseUrl = url.replace(/\/+$/, '') // strip trailing slashes
}

/** Get the current Ollama base URL. */
export function getOllamaUrl(): string {
  return ollamaBaseUrl
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
  if (status === 404) {
    return new Error(`Model "${model}" is not installed on Ollama. Install it with: ollama pull ${model}`)
  }
  return new Error(`Ollama API error ${status}: ${body}`)
}

/** Check if Ollama is running (2s timeout). */
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${ollamaBaseUrl}/api/tags`, {
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

/** Streaming chat via Ollama's native `/api/chat` endpoint (NDJSON). */
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

    const numCtx = await resolveNumCtx(model, ollamaBaseUrl)
    const res = await fetch(`${ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: apiMessages,
        stream: true,
        keep_alive: OLLAMA_KEEP_ALIVE,
        options: { num_ctx: numCtx }
      }),
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
        const trimmed = line.trim()
        if (!trimmed) continue
        let parsed: OllamaChatResponse
        try {
          parsed = JSON.parse(trimmed) as OllamaChatResponse
        } catch {
          // A genuinely malformed NDJSON line — skip it rather than abort the stream.
          continue
        }
        if (parsed.error) {
          streamErr = new Error(parsed.error)
          break
        }
        const content = parsed.message?.content // may be '' on keep-alive/heartbeat lines
        if (content) {
          fullText += content
          callbacks.onText(content)
        }
        if (parsed.done) {
          lastStats = {
            model,
            promptEvalCount: parsed.prompt_eval_count ?? 0,
            evalCount: parsed.eval_count ?? 0,
            at: new Date().toISOString()
          }
        }
      }
      if (streamErr) break
    }

    // A trailing complete line with no terminating newline (rare for /api/chat,
    // which newline-terminates the done object, but handle it for safety).
    const tail = lineBuffer.trim()
    if (!streamErr && tail) {
      try {
        const parsed = JSON.parse(tail) as OllamaChatResponse
        if (parsed.error) streamErr = new Error(parsed.error)
        else {
          const content = parsed.message?.content
          if (content) {
            fullText += content
            callbacks.onText(content)
          }
          if (parsed.done) {
            lastStats = {
              model,
              promptEvalCount: parsed.prompt_eval_count ?? 0,
              evalCount: parsed.eval_count ?? 0,
              at: new Date().toISOString()
            }
          }
        }
      } catch {
        // Truly malformed trailing content — drop it (matches prior stability stance).
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
          `Ollama stopped responding (no output for ${Math.round(OLLAMA_INACTIVITY_TIMEOUT_MS / 1000)}s mid-generation). The model may have stalled — check Ollama, or try a smaller model.`
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

  const numCtx = await resolveNumCtx(model, ollamaBaseUrl)
  const res = await fetch(`${ollamaBaseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: apiMessages,
      stream: false,
      keep_alive: OLLAMA_KEEP_ALIVE,
      options: { num_ctx: numCtx }
    }),
    // Non-streaming (summaries) — a large prompt on CPU can prefill for minutes, so use
    // the same generous prefill budget rather than the 90s cap.
    signal: AbortSignal.timeout(OLLAMA_PREFILL_TIMEOUT_MS)
  })

  if (!res.ok) {
    const body = await res.text()
    throw ollamaHttpError(res.status, body, model)
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

/** LLMProvider implementation wrapping the module-level Ollama functions. */
export const ollamaProvider: LLMProvider = {
  type: 'ollama',
  streamChat: ollamaStreamChat,
  chatOnce: ollamaChatOnce,
  isAvailable: isOllamaRunning,
  listModels: listOllamaModels
}
