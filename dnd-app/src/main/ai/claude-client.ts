import Anthropic from '@anthropic-ai/sdk'
import { classifyProviderError, defaultMaxTokensForModel, type LLMProvider, withRequestTimeout } from './llm-provider'
import type { ChatMessage, StreamCallbacks } from './types'

let apiKey: string | undefined

export function setClaudeApiKey(key: string | undefined): void {
  apiKey = key
}

export function getClaudeApiKey(): string | undefined {
  return apiKey
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
    try {
      const client = getClient()
      const apiMessages = messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))

      const stream = client.messages.stream(
        {
          model,
          max_tokens: maxTokens ?? defaultMaxTokensForModel(model),
          system: buildSystemBlocks(systemPrompt),
          messages: apiMessages
        },
        { signal: withRequestTimeout(abortSignal) }
      )

      let fullText = ''

      stream.on('text', (text) => {
        fullText += text
        callbacks.onText(text)
      })

      const finalMessage = await stream.finalMessage()
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
      if (abortSignal?.aborted) return
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
      const client = getClient()
      await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      })
      return true
    } catch {
      return false
    }
  },

  async listModels(): Promise<string[]> {
    return [
      'claude-opus-4-7',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
      'claude-sonnet-4-20250514',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022'
    ]
  }
}
