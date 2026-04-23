import { claudeProvider, setClaudeApiKey } from './claude-client'
import { geminiProvider, setGeminiApiKey } from './gemini-client'
import type { AiProviderType, LLMProvider } from './llm-provider'
import { ollamaProvider } from './ollama-client'
import { openaiProvider, setOpenAIApiKey } from './openai-client'
import type { AiConfig } from './types'

const providers = new Map<AiProviderType, LLMProvider>([
  ['ollama', ollamaProvider],
  ['claude', claudeProvider],
  ['openai', openaiProvider],
  ['gemini', geminiProvider]
])

let activeType: AiProviderType = 'ollama'

export function getActiveProvider(): LLMProvider {
  return providers.get(activeType) ?? ollamaProvider
}

export function getActiveProviderType(): AiProviderType {
  return activeType
}

export function getProvider(type: AiProviderType): LLMProvider {
  return providers.get(type) ?? ollamaProvider
}

/**
 * Configure the registry from an AiConfig.
 * Sets API keys on each provider and switches the active provider.
 */
export function configureProviders(config: AiConfig): void {
  activeType = config.provider ?? 'ollama'

  setClaudeApiKey(config.claudeApiKey)
  setOpenAIApiKey(config.openaiApiKey)
  setGeminiApiKey(config.geminiApiKey)
}

/** Check availability of all providers that have credentials configured. */
export async function checkAllProviders(): Promise<{
  ollama: boolean
  claude: boolean
  openai: boolean
  gemini: boolean
}> {
  const [ollama, claude, openai, gemini] = await Promise.all([
    ollamaProvider.isAvailable().catch(() => false),
    claudeProvider.isAvailable().catch(() => false),
    openaiProvider.isAvailable().catch(() => false),
    geminiProvider.isAvailable().catch(() => false)
  ])
  return { ollama, claude, openai, gemini }
}

/** Get the provider-specific context blurb injected into the system prompt. */
export function getProviderContextBlurb(type: AiProviderType): string {
  switch (type) {
    case 'ollama':
      return 'You are running via a local Ollama instance. You have no internet access unless you use the [WEB_SEARCH] action.'
    case 'claude':
      return 'You are running via Anthropic Claude. Your knowledge has a training cutoff. For current or specific information, use the [WEB_SEARCH] action.'
    case 'openai':
      return 'You are running via OpenAI. Your knowledge has a training cutoff. For current or specific information, use the [WEB_SEARCH] action.'
    case 'gemini':
      return 'You are running via Google Gemini. Your knowledge has a training cutoff. For current or specific information, use the [WEB_SEARCH] action.'
  }
}
