import Anthropic from '@anthropic-ai/sdk'
import {
  CLOUD_INACTIVITY_TIMEOUT_MS,
  classifyProviderError,
  createStreamInactivityGuard,
  defaultMaxTokensForModel,
  type LLMProvider,
  type StreamInactivityGuard,
  withRequestTimeout
} from './llm-provider'
import type { ChatMessage, StreamCallbacks } from './types'

let apiKey: string | undefined

export function setClaudeApiKey(key: string | undefined): void {
  apiKey = key
}

function getClient(): Anthropic {
  if (!apiKey) throw new Error('Claude API key not configured')
  return new Anthropic({ apiKey })
}

/**
 * Phase 28b.3 — build the `system` param as cacheable content blocks. The stable
 * prefix (system + character/campaign context) is marked `cache_control:
 * ephemeral` so repeated turns in a session read it from Anthropic's prompt
 * cache instead of re-billing the full prefix each turn.
 */
function buildSystemBlocks(systemPrompt: string): Anthropic.TextBlockParam[] {
  return [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
}

export const claudeProvider: LLMProvider = {
  type: 'claude',

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
      const apiMessages = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))

      // PHASE-03 — first-token + inter-token inactivity guard (replaces the 90s
      // whole-stream wall-clock kill that truncated long narrations). streamEvent
      // fires for every SSE event so the guard re-arms during non-text deltas too.
      const guard = createStreamInactivityGuard({ signal: abortSignal })
      streamGuard = guard
      const stream = client.messages.stream(
        {
          model,
          max_tokens: maxTokens ?? defaultMaxTokensForModel(model),
          system: buildSystemBlocks(systemPrompt),
          messages: apiMessages
        },
        { signal: guard.signal }
      )
      stream.on('streamEvent', () => guard.bump())

      let fullText = ''

      stream.on('text', (text) => {
        fullText += text
        callbacks.onText(text)
      })

      const finalMessage = await stream.finalMessage()
      guard.clear()
      fullText = finalMessage.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')

      // Phase 28b.3 — surface prompt-cache usage in dev logs.
      const usage = finalMessage.usage as
        | { cache_creation_input_tokens?: number; cache_read_input_tokens?: number }
        | undefined
      if (usage && (usage.cache_creation_input_tokens || usage.cache_read_input_tokens)) {
        console.debug(
          `[claude] cache: created=${usage.cache_creation_input_tokens ?? 0} read=${usage.cache_read_input_tokens ?? 0}`
        )
      }

      callbacks.onDone(fullText)
    } catch (error) {
      streamGuard?.clear()
      if (abortSignal?.aborted) return
      if (streamGuard?.timedOut()) {
        callbacks.onError(
          new Error(
            `Claude stream timed out (no output for ${Math.round(CLOUD_INACTIVITY_TIMEOUT_MS / 1000)}s). The provider may be unresponsive — try again.`
          )
        )
        return
      }
      callbacks.onError(classifyProviderError('claude', error))
    }
  },

  async chatOnce(systemPrompt: string, messages: ChatMessage[], model: string, maxTokens?: number): Promise<string> {
    const client = getClient()
    const apiMessages = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))

    try {
      const response = await client.messages.create(
        {
          model,
          max_tokens: maxTokens ?? defaultMaxTokensForModel(model),
          system: buildSystemBlocks(systemPrompt),
          messages: apiMessages
        },
        { signal: withRequestTimeout() }
      )

      return response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
    } catch (error) {
      throw classifyProviderError('claude', error)
    }
  },

  async isAvailable(): Promise<boolean> {
    if (!apiKey) return false
    try {
      // Validate the key against the live models endpoint — no hardcoded probe
      // model (a retired snapshot used to report the whole provider unavailable).
      await getClient().models.list()
      return true
    } catch {
      return false
    }
  },

  async listModels(): Promise<string[]> {
    if (!apiKey) return []
    try {
      // Real, current models from the API — never a hardcoded snapshot list that
      // drifts as models are added/retired.
      const page = await getClient().models.list()
      return page.data.map((m) => m.id)
    } catch {
      return []
    }
  }
}
