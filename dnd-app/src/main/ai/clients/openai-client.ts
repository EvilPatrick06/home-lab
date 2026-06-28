import OpenAI from 'openai'
import type { ChatMessage, StreamCallbacks } from '../types'
import {
  CLOUD_INACTIVITY_TIMEOUT_MS,
  classifyProviderError,
  createStreamInactivityGuard,
  type LLMProvider,
  type StreamInactivityGuard,
  withRequestTimeout
} from './llm-provider'

let apiKey: string | undefined

export function setOpenAIApiKey(key: string | undefined): void {
  apiKey = key
}

function getClient(): OpenAI {
  if (!apiKey) throw new Error('OpenAI API key not configured')
  return new OpenAI({ apiKey })
}

/** o1-mini / o1-preview reject BOTH `system` and `developer` roles (400). Every other
 *  chat model accepts `system` (reasoning models treat it as `developer` server-side). */
function rejectsSystemRole(model: string): boolean {
  return /^(o1-mini|o1-preview)/i.test(model)
}

/** Build the messages array, folding the system prompt into the first user message
 *  for models that reject the system role. */
function buildMessages(
  systemPrompt: string,
  messages: ChatMessage[],
  model: string
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const mapped = messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))
  if (rejectsSystemRole(model)) {
    if (mapped.length === 0) return [{ role: 'user', content: systemPrompt }]
    const [first, ...rest] = mapped
    return [{ role: 'user', content: `${systemPrompt}\n\n${first.content}` }, ...rest]
  }
  return [{ role: 'system', content: systemPrompt }, ...mapped]
}

export const openaiProvider: LLMProvider = {
  type: 'openai',

  async streamChat(
    systemPrompt: string,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    model: string,
    abortSignal?: AbortSignal,
    maxTokens?: number
  ): Promise<void> {
    let streamGuard: StreamInactivityGuard | undefined
    try {
      const client = getClient()
      const apiMessages = buildMessages(systemPrompt, messages, model)

      // PHASE-03 — inactivity guard instead of a 90s whole-stream wall-clock kill.
      const guard = createStreamInactivityGuard({ signal: abortSignal })
      streamGuard = guard
      const stream = await client.chat.completions.create(
        {
          model,
          messages: apiMessages,
          stream: true,
          // max_completion_tokens replaced the deprecated max_tokens API-wide;
          // o-series reasoning models reject the old param outright.
          max_completion_tokens: maxTokens ?? 4096
        },
        { signal: guard.signal }
      )

      let fullText = ''

      for await (const chunk of stream) {
        guard.bump()
        if (abortSignal?.aborted) return
        const content = chunk.choices[0]?.delta?.content
        if (content) {
          fullText += content
          callbacks.onText(content)
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
            `OpenAI stream timed out (no output for ${Math.round(CLOUD_INACTIVITY_TIMEOUT_MS / 1000)}s). The provider may be unresponsive — try again.`
          )
        )
        return
      }
      callbacks.onError(classifyProviderError('openai', error))
    }
  },

  async chatOnce(systemPrompt: string, messages: ChatMessage[], model: string, maxTokens?: number): Promise<string> {
    const client = getClient()
    const apiMessages = buildMessages(systemPrompt, messages, model)

    try {
      const response = await client.chat.completions.create(
        {
          model,
          messages: apiMessages,
          max_completion_tokens: maxTokens ?? 4096
        },
        { signal: withRequestTimeout() }
      )

      return response.choices[0]?.message?.content ?? ''
    } catch (error) {
      throw classifyProviderError('openai', error)
    }
  },

  async isAvailable(): Promise<boolean> {
    if (!apiKey) return false
    try {
      const client = getClient()
      await client.models.list()
      return true
    } catch {
      return false
    }
  },

  async listModels(): Promise<string[]> {
    if (!apiKey) return []
    try {
      // Live model list (filtered to chat-capable GPT/o-series) instead of a
      // hardcoded snapshot that drifts as models ship/retire.
      const page = await getClient().models.list()
      return page.data
        .map((m) => m.id)
        .filter((id) => /^(gpt-|o\d|chatgpt)/i.test(id))
        .sort()
    } catch {
      return []
    }
  }
}
