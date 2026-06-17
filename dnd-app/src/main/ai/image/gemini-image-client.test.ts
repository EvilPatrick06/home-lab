import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../ai-service', () => ({ getConfig: () => ({ geminiApiKey: 'KEY' }) }))

import { AiImageConfigSchema } from '../../../shared/ipc-schemas'
import { geminiImageAdapter } from './gemini-image-client'

const cfg = (o: Record<string, unknown> = {}) => AiImageConfigSchema.parse(o)
afterEach(() => vi.unstubAllGlobals())

describe('gemini-image-client (PHASE-33 33B)', () => {
  it('requests TEXT+IMAGE modalities and extracts inlineData', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: { body: string }) => ({
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'IMG64' } }] } }]
      })
    }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await geminiImageAdapter.generate({ prompt: 'a knight', width: 1024, height: 1024 }, cfg())
    expect(r).toMatchObject({ success: true, base64: 'IMG64', provider: 'gemini', mimeType: 'image/png' })
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.generationConfig.responseModalities).toEqual(['TEXT', 'IMAGE'])
    expect(body.contents[0].parts[0].text).toBe('a knight')
  })

  it('text-only response → failure surfacing the blockReason', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          candidates: [{ content: { parts: [{ text: 'I cannot' }] } }],
          promptFeedback: { blockReason: 'SAFETY' }
        })
      }))
    )
    const r = await geminiImageAdapter.generate({ prompt: 'x', width: 1024, height: 1024 }, cfg())
    expect(r.success).toBe(false)
    if (!r.success) expect(r.error).toContain('SAFETY')
  })

  it('non-OK HTTP → failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 429, statusText: 'Too Many Requests' }))
    )
    const r = await geminiImageAdapter.generate({ prompt: 'x', width: 1024, height: 1024 }, cfg())
    expect(r.success).toBe(false)
  })
})
