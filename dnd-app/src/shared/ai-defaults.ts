/** Single source of truth for provider-default model IDs (renderer wizard,
 *  main config defaults). Update HERE when a default should move forward.
 *
 *  Note: bare 'llama3.1' was NOT installable (the curated set has
 *  'llama3.1:8b'/'llama3.1:70b'), so wizards that saved it produced a model
 *  that 404'd on use — that is why the Ollama default is the lightweight
 *  'llama3.2:3b'. Keep these in sync with main/ai/ollama-manager.ts's curated
 *  model ids. */
export const DEFAULT_PROVIDER_MODELS = {
  ollama: 'llama3.2:3b',
  claude: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  gemini: 'gemini-2.0-flash'
} as const

export const DEFAULT_AI_MODEL: string = DEFAULT_PROVIDER_MODELS.ollama
