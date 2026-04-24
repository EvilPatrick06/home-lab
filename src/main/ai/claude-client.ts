import Anthropic from '@anthropic-ai/sdk'
import { classifyProviderError, type LLMProvider } from './llm-provider'
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

export const claudeProvider: LLMProvider = {
  type: 'claude',

  async streamChat(
    systemPrompt: string,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    model: string,
    abortSignal?: AbortSignal
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
          max_tokens: 4096,
          system: systemPrompt,
          messages: apiMessages
        },
        { signal: abortSignal }
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

      callbacks.onDone(fullText)
    } catch (error) {
      if (abortSignal?.aborted) return
      callbacks.onError(classifyProviderError('claude', error))
    }
  },

  async chatOnce(systemPrompt: string, messages: ChatMessage[], model: string): Promise<string> {
    const client = getClient()
    const apiMessages = messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))

    try {
      const response = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: apiMessages
      })

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
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }]
      })
      return true
    } catch {
      return false
    }
  },

  async listModels(): Promise<string[]> {
    return ['claude-sonnet-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022']
  }
}
