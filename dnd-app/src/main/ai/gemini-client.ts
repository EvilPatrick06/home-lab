import { GoogleGenerativeAI } from '@google/generative-ai'
import {
  CLOUD_INACTIVITY_TIMEOUT_MS,
  classifyProviderError,
  createStreamInactivityGuard,
  type LLMProvider,
  PROVIDER_REQUEST_TIMEOUT_MS,
  type StreamInactivityGuard
} from './llm-provider'
import type { ChatMessage, StreamCallbacks } from './types'

let apiKey: string | undefined

export function setGeminiApiKey(key: string | undefined): void {
  apiKey = key
}

function getClient(): GoogleGenerativeAI {
  if (!apiKey) throw new Error('Gemini API key not configured')
  return new GoogleGenerativeAI(apiKey)
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
      const client = getClient()
      // PHASE-03 — NO model-level `timeout` for streaming (it would wall-clock-kill
      // a long narration). @google/generative-ai@0.24.1 accepts a per-request
      // SingleRequestOptions.signal, wired into the fetch's AbortController; pass the
      // inactivity-guard signal so only inter-token silence (or caller abort) aborts.
      const genModel = client.getGenerativeModel({ model, systemInstruction: systemPrompt })

      const history = messages.slice(0, -1).map((m) => ({
        role: toGeminiRole(m.role),
        parts: [{ text: m.content }]
      }))

      const lastMessage = messages[messages.length - 1]
      if (!lastMessage) {
        callbacks.onError(new Error('No messages provided'))
        return
      }

      const guard = createStreamInactivityGuard({ signal: abortSignal })
      streamGuard = guard
      const chat = genModel.startChat({ history })
      const result = await chat.sendMessageStream(lastMessage.content, { signal: guard.signal })

      let fullText = ''

      for await (const chunk of result.stream) {
        guard.bump()
        if (abortSignal?.aborted) return
        const text = chunk.text()
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
    const client = getClient()
    // Non-streaming: keep one overall request ceiling (PROVIDER_REQUEST_TIMEOUT_MS)
    // since there's no token stream to watch.
    const genModel = client.getGenerativeModel(
      { model, systemInstruction: systemPrompt },
      { timeout: PROVIDER_REQUEST_TIMEOUT_MS }
    )

    const history = messages.slice(0, -1).map((m) => ({
      role: toGeminiRole(m.role),
      parts: [{ text: m.content }]
    }))

    const lastMessage = messages[messages.length - 1]
    if (!lastMessage) return ''

    try {
      const chat = genModel.startChat({ history })
      const result = await chat.sendMessage(lastMessage.content)
      return result.response.text()
    } catch (error) {
      throw classifyProviderError('gemini', error)
    }
  },

  async isAvailable(): Promise<boolean> {
    if (!apiKey) return false
    try {
      // Validate the key against the live models endpoint — no hardcoded probe
      // model (the SDK has no list method, so use the REST endpoint directly).
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
