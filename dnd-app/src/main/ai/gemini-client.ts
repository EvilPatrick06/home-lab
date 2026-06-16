import { GoogleGenAI } from '@google/genai'
import {
  CLOUD_INACTIVITY_TIMEOUT_MS,
  classifyProviderError,
  createStreamInactivityGuard,
  type LLMProvider,
  PROVIDER_REQUEST_TIMEOUT_MS,
  type StreamInactivityGuard,
  withRequestTimeout
} from './llm-provider'
import type { ChatMessage, StreamCallbacks } from './types'

let apiKey: string | undefined

export function setGeminiApiKey(key: string | undefined): void {
  apiKey = key
}

function getClient(): GoogleGenAI {
  if (!apiKey) throw new Error('Gemini API key not configured')
  return new GoogleGenAI({ apiKey })
}

function toGeminiRole(role: 'user' | 'assistant'): 'user' | 'model' {
  return role === 'assistant' ? 'model' : 'user'
}

export const geminiProvider: LLMProvider = {
  type: 'gemini',

  async streamChat(
    systemPrompt: string,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    model: string,
    abortSignal?: AbortSignal
  ): Promise<void> {
    let streamGuard: StreamInactivityGuard | undefined
    try {
      const ai = getClient()

      const history = messages.slice(0, -1).map((m) => ({
        role: toGeminiRole(m.role),
        parts: [{ text: m.content }]
      }))

      const lastMessage = messages[messages.length - 1]
      if (!lastMessage) {
        callbacks.onError(new Error('No messages provided'))
        return
      }

      // PHASE-03 / PHASE-13 13P — NO wall-clock timeout on the streaming path (it would
      // kill a long narration). @google/genai accepts a per-request `abortSignal`; pass the
      // inactivity-guard signal so only inter-token silence (or caller abort) aborts.
      // (The new SDK's abortSignal cancels client-side only — the service still completes
      // and may bill the request — same behavior as the old SDK, no contract change.)
      const guard = createStreamInactivityGuard({ signal: abortSignal })
      streamGuard = guard
      const chat = ai.chats.create({ model, history, config: { systemInstruction: systemPrompt } })
      const stream = await chat.sendMessageStream({
        message: lastMessage.content,
        config: { abortSignal: guard.signal }
      })

      let fullText = ''

      for await (const chunk of stream) {
        guard.bump()
        if (abortSignal?.aborted) return
        const text = chunk.text // `.text` is a PROPERTY in @google/genai, not a method
        if (text) {
          fullText += text
          callbacks.onText(text)
        }
      }

      guard.clear()
      callbacks.onDone(fullText)
    } catch (error) {
      streamGuard?.clear()
      if (abortSignal?.aborted) return
      if (streamGuard?.timedOut()) {
        callbacks.onError(
          new Error(
            `Gemini stream timed out (no output for ${Math.round(CLOUD_INACTIVITY_TIMEOUT_MS / 1000)}s). The provider may be unresponsive — try again.`
          )
        )
        return
      }
      callbacks.onError(classifyProviderError('gemini', error))
    }
  },

  async chatOnce(systemPrompt: string, messages: ChatMessage[], model: string): Promise<string> {
    const ai = getClient()

    const contents = messages.map((m) => ({
      role: toGeminiRole(m.role),
      parts: [{ text: m.content }]
    }))

    if (contents.length === 0) return ''

    try {
      // Non-streaming: one overall request ceiling (PROVIDER_REQUEST_TIMEOUT_MS) since there's
      // no token stream to watch — reuses the shared `withRequestTimeout` signal idiom.
      const response = await ai.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: systemPrompt,
          abortSignal: withRequestTimeout(undefined, PROVIDER_REQUEST_TIMEOUT_MS)
        }
      })
      return response.text ?? ''
    } catch (error) {
      throw classifyProviderError('gemini', error)
    }
  },

  async isAvailable(): Promise<boolean> {
    if (!apiKey) return false
    try {
      // Validate the key against the live models endpoint — no hardcoded probe
      // model (we use the REST endpoint directly, carrying no SDK dependency).
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
      return res.ok
    } catch {
      return false
    }
  },

  async listModels(): Promise<string[]> {
    if (!apiKey) return []
    try {
      // Real, current generateContent-capable models from the API — never a
      // hardcoded snapshot list.
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
      if (!res.ok) return []
      const data = (await res.json()) as {
        models?: Array<{ name: string; supportedGenerationMethods?: string[] }>
      }
      return (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => m.name.replace(/^models\//, ''))
    } catch {
      return []
    }
  }
}
