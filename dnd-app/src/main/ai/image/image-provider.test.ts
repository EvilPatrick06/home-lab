import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiImageConfigSchema } from '../../../shared/ipc-schemas'

const { sdGen, openaiGen, geminiGen } = vi.hoisted(() => ({ sdGen: vi.fn(), openaiGen: vi.fn(), geminiGen: vi.fn() }))
vi.mock('./sd-webui-client', () => ({
  sdWebuiAdapter: { type: 'sd-webui', isAvailable: async () => true, generate: sdGen }
}))
vi.mock('./openai-image-client', () => ({
  openaiImageAdapter: { type: 'openai', isAvailable: async () => true, generate: openaiGen }
}))
vi.mock('./gemini-image-client', () => ({
  geminiImageAdapter: { type: 'gemini', isAvailable: async () => true, generate: geminiGen }
}))

import { generateImage } from './image-provider'

const cfg = (o: Record<string, unknown> = {}) => AiImageConfigSchema.parse(o)
const OK = { success: true, base64: 'X', mimeType: 'image/png' as const, provider: 'sd-webui' as const, model: 'm' }
const FAIL = { success: false as const, error: 'boom' }
const req = { prompt: 'p', width: 1024, height: 1024 }

beforeEach(() => vi.clearAllMocks())

describe('generateImage orchestrator (PHASE-33 33B)', () => {
  it('primary success → usedFallback false, fallback never called', async () => {
    sdGen.mockResolvedValue(OK)
    const r = await generateImage(req, cfg({ provider: 'sd-webui', fallbackProvider: 'openai' }))
    expect(r).toMatchObject({ success: true, usedFallback: false })
    expect(sdGen).toHaveBeenCalledTimes(1)
    expect(openaiGen).not.toHaveBeenCalled()
  })

  it('primary fail + fallback none → no fallback attempt', async () => {
    sdGen.mockResolvedValue(FAIL)
    const r = await generateImage(req, cfg({ provider: 'sd-webui', fallbackProvider: 'none' }))
    expect(r).toMatchObject({ success: false, usedFallback: false })
    expect(openaiGen).not.toHaveBeenCalled()
    expect(geminiGen).not.toHaveBeenCalled()
  })

  it('primary fail + distinct fallback → fallback fires once, usedFallback true', async () => {
    sdGen.mockResolvedValue(FAIL)
    openaiGen.mockResolvedValue({ ...OK, provider: 'openai' })
    const r = await generateImage(req, cfg({ provider: 'sd-webui', fallbackProvider: 'openai' }))
    expect(r).toMatchObject({ success: true, usedFallback: true })
    expect(sdGen).toHaveBeenCalledTimes(1)
    expect(openaiGen).toHaveBeenCalledTimes(1)
  })

  it('never retries the SAME adapter (fallback == primary)', async () => {
    sdGen.mockResolvedValue(FAIL)
    const r = await generateImage(req, cfg({ provider: 'sd-webui', fallbackProvider: 'sd-webui' }))
    expect(r).toMatchObject({ success: false, usedFallback: false })
    expect(sdGen).toHaveBeenCalledTimes(1)
  })

  it('a thrown adapter error becomes a failure outcome (and can fall back)', async () => {
    sdGen.mockRejectedValue(new Error('network'))
    geminiGen.mockResolvedValue({ ...OK, provider: 'gemini' })
    const r = await generateImage(req, cfg({ provider: 'sd-webui', fallbackProvider: 'gemini' }))
    expect(r).toMatchObject({ success: true, usedFallback: true, provider: 'gemini' })
  })
})
