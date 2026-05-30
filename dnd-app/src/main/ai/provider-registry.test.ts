import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiProviderType, LLMProvider } from './llm-provider'
import type { AiConfig } from './types'

// Phase 28i — registry unit tests. The four concrete provider clients are mocked
// so the registry stays a pure resolution/configuration unit: no SDK construction,
// no network. Each provider mock is a minimal LLMProvider whose `isAvailable` is a
// spy we can flip per test. The `set*ApiKey` setters are spies we assert against.
// Module-level singleton state (the `activeType` let) is reset between tests via
// vi.resetModules + a fresh dynamic import.

function makeProvider(type: AiProviderType, available: boolean): LLMProvider {
  return {
    type,
    isAvailable: vi.fn(async () => available),
    streamChat: vi.fn(async () => {}),
    chatOnce: vi.fn(async () => ''),
    listModels: vi.fn(async () => [])
  }
}

const setClaudeApiKey = vi.fn()
const setOpenAIApiKey = vi.fn()
const setGeminiApiKey = vi.fn()

// Each mocked provider defaults to available (true). Tests that exercise the
// unavailable / rejected branches flip a single provider's isAvailable spy via
// mockResolvedValueOnce / mockRejectedValueOnce rather than re-mocking.
vi.mock('./ollama-client', () => ({ ollamaProvider: makeProvider('ollama', true) }))
vi.mock('./claude-client', () => ({ claudeProvider: makeProvider('claude', true), setClaudeApiKey }))
vi.mock('./openai-client', () => ({ openaiProvider: makeProvider('openai', true), setOpenAIApiKey }))
vi.mock('./gemini-client', () => ({ geminiProvider: makeProvider('gemini', true), setGeminiApiKey }))

type Registry = typeof import('./provider-registry')

async function freshRegistry(): Promise<Registry> {
  vi.resetModules()
  return import('./provider-registry')
}

describe('provider-registry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getProvider', () => {
    it('resolves each known provider type to a provider whose .type matches', async () => {
      const reg = await freshRegistry()
      const types: AiProviderType[] = ['ollama', 'claude', 'openai', 'gemini']
      for (const t of types) {
        expect(reg.getProvider(t).type).toBe(t)
      }
    })

    it('falls back to the ollama provider for an unknown type', async () => {
      const reg = await freshRegistry()
      const unknown = reg.getProvider('does-not-exist' as unknown as AiProviderType)
      expect(unknown.type).toBe('ollama')
    })
  })

  describe('active provider (default + selection)', () => {
    it('defaults to ollama before any configuration', async () => {
      const reg = await freshRegistry()
      expect(reg.getActiveProviderType()).toBe('ollama')
      expect(reg.getActiveProvider().type).toBe('ollama')
    })

    it('switches the active provider via configureProviders', async () => {
      const reg = await freshRegistry()
      reg.configureProviders({ provider: 'claude', model: 'claude-opus-4-7', ollamaUrl: '' } as AiConfig)
      expect(reg.getActiveProviderType()).toBe('claude')
      expect(reg.getActiveProvider().type).toBe('claude')
    })

    it('falls back to ollama when config.provider is missing', async () => {
      const reg = await freshRegistry()
      // First flip away from the default, then configure with an absent provider.
      reg.configureProviders({ provider: 'gemini', model: 'g', ollamaUrl: '' } as AiConfig)
      expect(reg.getActiveProviderType()).toBe('gemini')

      reg.configureProviders({ model: 'g', ollamaUrl: '' } as unknown as AiConfig)
      expect(reg.getActiveProviderType()).toBe('ollama')
    })

    it('resets active type between fresh module loads (no leaked singleton)', async () => {
      const reg1 = await freshRegistry()
      reg1.configureProviders({ provider: 'openai', model: 'gpt-4o', ollamaUrl: '' } as AiConfig)
      expect(reg1.getActiveProviderType()).toBe('openai')

      const reg2 = await freshRegistry()
      expect(reg2.getActiveProviderType()).toBe('ollama')
    })
  })

  describe('configureProviders — API key propagation', () => {
    it('passes each cloud key to the matching setter', async () => {
      const reg = await freshRegistry()
      reg.configureProviders({
        provider: 'claude',
        model: 'claude-opus-4-7',
        ollamaUrl: 'http://localhost:11434',
        claudeApiKey: 'ck',
        openaiApiKey: 'ok',
        geminiApiKey: 'gk'
      })
      expect(setClaudeApiKey).toHaveBeenCalledWith('ck')
      expect(setOpenAIApiKey).toHaveBeenCalledWith('ok')
      expect(setGeminiApiKey).toHaveBeenCalledWith('gk')
    })

    it('forwards undefined keys (clearing) when not supplied', async () => {
      const reg = await freshRegistry()
      reg.configureProviders({ provider: 'ollama', model: 'llama3', ollamaUrl: '' })
      expect(setClaudeApiKey).toHaveBeenCalledWith(undefined)
      expect(setOpenAIApiKey).toHaveBeenCalledWith(undefined)
      expect(setGeminiApiKey).toHaveBeenCalledWith(undefined)
    })
  })

  describe('checkAllProviders', () => {
    it('returns the availability of every provider', async () => {
      const reg = await freshRegistry()
      const result = await reg.checkAllProviders()
      expect(result).toEqual({ ollama: true, claude: true, openai: true, gemini: true })
    })

    it('reports false for a provider whose isAvailable resolves false', async () => {
      const reg = await freshRegistry()
      const openai = reg.getProvider('openai')
      vi.mocked(openai.isAvailable).mockResolvedValueOnce(false)
      const result = await reg.checkAllProviders()
      expect(result.openai).toBe(false)
      expect(result.ollama).toBe(true)
    })

    it('treats a rejected isAvailable as unavailable (catch → false)', async () => {
      const reg = await freshRegistry()
      const claude = reg.getProvider('claude')
      vi.mocked(claude.isAvailable).mockRejectedValueOnce(new Error('network down'))
      const result = await reg.checkAllProviders()
      expect(result.claude).toBe(false)
      // Other providers unaffected by one rejection.
      expect(result.gemini).toBe(true)
    })
  })

  describe('getProviderContextBlurb', () => {
    it('returns a provider-specific blurb mentioning the right backend', async () => {
      const reg = await freshRegistry()
      expect(reg.getProviderContextBlurb('ollama')).toMatch(/local Ollama/i)
      expect(reg.getProviderContextBlurb('claude')).toMatch(/Anthropic Claude/i)
      expect(reg.getProviderContextBlurb('openai')).toMatch(/OpenAI/i)
      expect(reg.getProviderContextBlurb('gemini')).toMatch(/Google Gemini/i)
    })

    it('mentions the [WEB_SEARCH] action in every blurb', async () => {
      const reg = await freshRegistry()
      const types: AiProviderType[] = ['ollama', 'claude', 'openai', 'gemini']
      for (const t of types) {
        expect(reg.getProviderContextBlurb(t)).toContain('[WEB_SEARCH]')
      }
    })
  })
})
