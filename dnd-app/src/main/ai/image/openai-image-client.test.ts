import { describe, expect, it, vi } from 'vitest'

// Keep the test pure — buildOpenAiImageParams needs no SDK or ai-service.
vi.mock('openai', () => ({ default: class {} }))
vi.mock('../ai-service', () => ({ getConfig: () => ({}) }))

import { AiImageConfigSchema } from '../../../shared/ipc-schemas'
import { buildOpenAiImageParams } from './openai-image-client'

const cfg = (o: Record<string, unknown> = {}) => AiImageConfigSchema.parse(o)

describe('openai-image-client buildOpenAiImageParams (PHASE-33 33B)', () => {
  it('gpt-image-* gets NO response_format and maps size/quality', () => {
    const p = buildOpenAiImageParams(cfg({ openaiModel: 'gpt-image-1', openaiQuality: 'high' }), 'a prompt', 1024, 1536)
    expect(p.model).toBe('gpt-image-1')
    expect(p.prompt).toBe('a prompt')
    expect(p.size).toBe('1024x1536')
    expect(p.quality).toBe('high')
    expect(p.response_format).toBeUndefined()
  })

  it('dall-e-* requests b64_json explicitly', () => {
    const p = buildOpenAiImageParams(cfg({ openaiModel: 'dall-e-3' }), 'a', 1024, 1024)
    expect(p.response_format).toBe('b64_json')
    expect(p.size).toBe('1024x1024')
  })
})
