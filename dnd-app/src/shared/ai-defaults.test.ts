import { describe, expect, it } from 'vitest'
import { DEFAULT_AI_MODEL, DEFAULT_PROVIDER_MODELS } from './ai-defaults'

describe('ai-defaults', () => {
  it('has exactly the four provider keys', () => {
    expect(Object.keys(DEFAULT_PROVIDER_MODELS).sort()).toEqual(['claude', 'gemini', 'ollama', 'openai'])
  })

  it('every default is a non-empty string', () => {
    for (const [provider, model] of Object.entries(DEFAULT_PROVIDER_MODELS)) {
      expect(typeof model, provider).toBe('string')
      expect(model.length, provider).toBeGreaterThan(0)
    }
  })

  it('DEFAULT_AI_MODEL is the ollama default', () => {
    expect(DEFAULT_AI_MODEL).toBe(DEFAULT_PROVIDER_MODELS.ollama)
  })
})
