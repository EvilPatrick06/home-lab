import type { LLMProvider } from './llm-provider'
import { OLLAMA_BASE_URL } from './ollama-manager'
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

interface OllamaChatResponse {
  choices?: Array<{
    delta?: { content?: string }
    message?: { content?: string }
  }>
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

/** List installed Ollama models. */
export async function listOllamaModels(): Promise<string[]> {
  try {
    const res = await fetch(`${ollamaBaseUrl}/api/tags`)
    if (!res.ok) return []
    const data = (await res.json()) as { models?: Array<{ name: string }> }
    return (data.models || []).map((m) => m.name)
  } catch {
    return []
  }
}

/** Streaming chat via Ollama's OpenAI-compatible endpoint. */
export async function ollamaStreamChat(
  systemPrompt: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  model: string = 'llama3.1',
  abortSignal?: AbortSignal
): Promise<void> {
  const apiMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as string, content: m.content }))
  ]

  try {
    const timeoutSignal = AbortSignal.timeout(120_000)
    const combinedSignal = abortSignal ? AbortSignal.any([abortSignal, timeoutSignal]) : timeoutSignal

    const res = await fetch(`${ollamaBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: apiMessages, stream: true }),
      signal: combinedSignal
    })

    if (!res.ok) {
      const body = await res.text()
      callbacks.onError(new Error(`Ollama API error ${res.status}: ${body}`))
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
    let jsonBuffer = ''
    const MAX_JSON_BUFFER_SIZE = 64 * 1024 // 64KB limit for partial JSON buffering

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      lineBuffer += decoder.decode(value, { stream: true })
      const lines = lineBuffer.split('\n')
      lineBuffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const payload = trimmed.slice(6)
        if (payload === '[DONE]') continue

        // Try to parse the payload - may be complete or partial JSON
        let parsed: OllamaChatResponse | undefined

        // First: try direct parse of this chunk
        try {
          parsed = JSON.parse(payload) as OllamaChatResponse
          jsonBuffer = '' // Clear buffer on successful parse
        } catch {
          // Direct parse failed - will try combining with buffer below
        }

        // Second: if direct parse failed, try combining with buffered partial JSON
        if (!parsed && jsonBuffer) {
          try {
            const combined = jsonBuffer + payload
            parsed = JSON.parse(combined) as OllamaChatResponse
            jsonBuffer = '' // Clear buffer on successful combined parse
          } catch {
            // Combined parse also failed - will buffer below
          }
        }

        // Third: buffer this chunk if it looks like partial JSON and we have no successful parse
        if (!parsed) {
          // Check if payload looks like the start/middle of a JSON object
          const looksLikePartialJson =
            payload.includes('{') ||
            payload.includes('}') ||
            payload.includes('"') ||
            payload.includes(':') ||
            payload.includes('[')

          if (looksLikePartialJson && jsonBuffer.length + payload.length <= MAX_JSON_BUFFER_SIZE) {
            jsonBuffer += payload
            continue // Skip to next line - don't process yet
          }
          // Payload doesn't look like JSON or buffer would overflow - truly malformed, skip
        }

        // Process successfully parsed chunk
        if (parsed) {
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            fullText += content
            callbacks.onText(content)
          }
        }
      }
    }

    // Process any remaining buffered partial JSON at stream end
    if (jsonBuffer) {
      try {
        const parsed = JSON.parse(jsonBuffer) as OllamaChatResponse
        const content = parsed.choices?.[0]?.delta?.content
        if (content) {
          fullText += content
          callbacks.onText(content)
        }
      } catch {
        // Final buffered content is truly malformed - log but don't throw
        // This prevents data loss from edge cases while maintaining stability
      }
    }

    callbacks.onDone(fullText)
  } catch (error) {
    if (abortSignal?.aborted) return
    if (error instanceof Error && error.name === 'TimeoutError') {
      callbacks.onError(new Error('Ollama request timed out (120s). Is the model loaded?'))
      return
    }
    callbacks.onError(error instanceof Error ? error : new Error(String(error)))
  }
}

/** Non-streaming chat via Ollama. */
export async function ollamaChatOnce(
  systemPrompt: string,
  messages: ChatMessage[],
  model: string = 'llama3.1'
): Promise<string> {
  const apiMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...messages.map((m) => ({ role: m.role as string, content: m.content }))
  ]

  const res = await fetch(`${ollamaBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: apiMessages, stream: false }),
    signal: AbortSignal.timeout(120_000)
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Ollama API error ${res.status}: ${body}`)
  }

  const data = (await res.json()) as OllamaChatResponse
  return data.choices?.[0]?.message?.content || ''
}

/** LLMProvider implementation wrapping the module-level Ollama functions. */
export const ollamaProvider: LLMProvider = {
  type: 'ollama',
  streamChat: ollamaStreamChat,
  chatOnce: ollamaChatOnce,
  isAvailable: isOllamaRunning,
  listModels: listOllamaModels
}
