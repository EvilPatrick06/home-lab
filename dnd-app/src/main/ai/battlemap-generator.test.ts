import { beforeEach, describe, expect, it, vi } from 'vitest'

const { providerInfo, ollamaStructuredOnce, chatOncePrimary } = vi.hoisted(() => ({
  providerInfo: { provider: 'ollama' as string, model: 'llama3.1' },
  ollamaStructuredOnce: vi.fn(),
  chatOncePrimary: vi.fn()
}))
vi.mock('./ai-service', () => ({ getPrimaryProviderInfo: () => providerInfo, chatOncePrimary }))
vi.mock('./clients/ollama-client', () => ({ ollamaStructuredOnce }))

import { buildBattlemapSystemPrompt, generateBattlemapSpec } from './battlemap-generator'

const VALID = JSON.stringify({
  name: 'Crypt',
  theme: 'crypt',
  width: 20,
  height: 20,
  ambientLight: 'dim',
  rooms: [{ id: 'r1', x: 2, y: 2, w: 6, h: 6 }],
  spawns: { party: { x: 4, y: 4 } }
})

beforeEach(() => {
  vi.clearAllMocks()
  providerInfo.provider = 'ollama'
})

describe('battlemap-generator (PHASE-34 34B)', () => {
  it('buildBattlemapSystemPrompt embeds the schema text + the no-fences instruction', () => {
    const p = buildBattlemapSystemPrompt('{"SCHEMA":true}')
    expect(p).toContain('{"SCHEMA":true}')
    expect(p).toMatch(/ONLY the JSON object/i)
  })

  it('routes to the Ollama structured helper when provider is ollama', async () => {
    ollamaStructuredOnce.mockResolvedValue(VALID)
    const res = await generateBattlemapSpec({ campaignId: 'c1', prompt: 'a crypt' })
    expect(res.success).toBe(true)
    expect(ollamaStructuredOnce).toHaveBeenCalledTimes(1)
    expect(chatOncePrimary).not.toHaveBeenCalled()
  })

  it('uses chatOncePrimary for cloud providers and accepts fenced JSON', async () => {
    providerInfo.provider = 'openai'
    chatOncePrimary.mockResolvedValue(`\`\`\`json\n${VALID}\n\`\`\``)
    const res = await generateBattlemapSpec({ campaignId: 'c1', prompt: 'a crypt' })
    expect(res.success).toBe(true)
    expect(chatOncePrimary).toHaveBeenCalledTimes(1)
  })

  it('retries exactly once on invalid output, then succeeds', async () => {
    ollamaStructuredOnce.mockResolvedValueOnce('not json at all').mockResolvedValueOnce(VALID)
    const res = await generateBattlemapSpec({ campaignId: 'c1', prompt: 'a crypt' })
    expect(res.success).toBe(true)
    expect(ollamaStructuredOnce).toHaveBeenCalledTimes(2)
  })

  it('surfaces an error after the retry also fails', async () => {
    ollamaStructuredOnce.mockResolvedValue('still not json')
    const res = await generateBattlemapSpec({ campaignId: 'c1', prompt: 'a crypt' })
    expect(res.success).toBe(false)
    expect(ollamaStructuredOnce).toHaveBeenCalledTimes(2)
  })

  it('applies requested theme/dimension overrides', async () => {
    ollamaStructuredOnce.mockResolvedValue(VALID)
    const res = await generateBattlemapSpec({
      campaignId: 'c1',
      prompt: 'a crypt',
      theme: 'cave',
      widthCells: 40,
      heightCells: 30
    })
    expect(res.success).toBe(true)
    if (res.success) {
      expect(res.spec.theme).toBe('cave')
      expect(res.spec.width).toBe(40)
      expect(res.spec.height).toBe(30)
    }
  })
})
