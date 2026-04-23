import { GoogleGenerativeAI } from '@google/generative-ai'
import { classifyProviderError, type LLMProvider } from './llm-provider'
import type { ChatMessage, StreamCallbacks } from './types'

let apiKey: string | undefined

export function setGeminiApiKey(key: string | undefined): void {
  apiKey = key
}

export function getGeminiApiKey(): string | undefined {
  return apiKey
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
    try {
      const client = getClient()
      const genModel = client.getGenerativeModel({
        model,
        systemInstruction: systemPrompt
      })

      const history = messages.slice(0, -1).map((m) => ({
        role: toGeminiRole(m.role),
        parts: [{ text: m.content }]
      }))

      const lastMessage = messages[messages.length - 1]
      if (!lastMessage) {
        callbacks.onError(new Error('No messages provided'))
        return
      }

      const chat = genModel.startChat({ history })
      const result = await chat.sendMessageStream(lastMessage.content)

      let fullText = ''

      for await (const chunk of result.stream) {
        if (abortSignal?.aborted) return
        const text = chunk.text()
        if (text) {
          fullText += text
          callbacks.onText(text)
        }
      }

      callbacks.onDone(fullText)
    } catch (error) {
      if (abortSignal?.aborted) return
      callbacks.onError(classifyProviderError('gemini', error))
    }
  },

  async chatOnce(systemPrompt: string, messages: ChatMessage[], model: string): Promise<string> {
    const client = getClient()
    const genModel = client.getGenerativeModel({
      model,
      systemInstruction: systemPrompt
    })

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
      const client = getClient()
      const model = client.getGenerativeModel({ model: 'gemini-1.5-flash' })
      await model.generateContent('hi')
      return true
    } catch {
      return false
    }
  },

  async listModels(): Promise<string[]> {
    return ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash']
  }
}
