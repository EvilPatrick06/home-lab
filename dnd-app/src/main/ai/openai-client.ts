import OpenAI from 'openai'
import { classifyProviderError, type LLMProvider } from './llm-provider'
import type { ChatMessage, StreamCallbacks } from './types'

let apiKey: string | undefined

export function setOpenAIApiKey(key: string | undefined): void {
  apiKey = key
}

export function getOpenAIApiKey(): string | undefined {
  return apiKey
}

function getClient(): OpenAI {
  if (!apiKey) throw new Error('OpenAI API key not configured')
  return new OpenAI({ apiKey })
}

export const openaiProvider: LLMProvider = {
  type: 'openai',

  async streamChat(
    systemPrompt: string,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    model: string,
    abortSignal?: AbortSignal
  ): Promise<void> {
    try {
      const client = getClient()
      const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: 'system', content: systemPrompt },
        ...messages.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content
        }))
      ]

      const stream = await client.chat.completions.create(
        {
          model,
          messages: apiMessages,
          stream: true,
          max_tokens: 4096
        },
        { signal: abortSignal }
      )

      let fullText = ''

      for await (const chunk of stream) {
        if (abortSignal?.aborted) return
        const content = chunk.choices[0]?.delta?.content
        if (content) {
          fullText += content
          callbacks.onText(content)
        }
      }

      callbacks.onDone(fullText)
    } catch (error) {
      if (abortSignal?.aborted) return
      callbacks.onError(classifyProviderError('openai', error))
    }
  },

  async chatOnce(systemPrompt: string, messages: ChatMessage[], model: string): Promise<string> {
    const client = getClient()
    const apiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
    ]

    try {
      const response = await client.chat.completions.create({
        model,
        messages: apiMessages,
        max_tokens: 4096
      })

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
    return ['gpt-4o', 'gpt-4o-mini', 'o3-mini']
  }
}
