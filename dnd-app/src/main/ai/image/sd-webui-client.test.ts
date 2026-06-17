import { afterEach, describe, expect, it, vi } from 'vitest'
import { AiImageConfigSchema } from '../../../shared/ipc-schemas'
import { buildTxt2ImgBody, getProgress, sdWebuiAdapter } from './sd-webui-client'

const cfg = (o: Record<string, unknown> = {}) => AiImageConfigSchema.parse(o)
afterEach(() => vi.unstubAllGlobals())

describe('sd-webui-client (PHASE-33 33B)', () => {
  it('buildTxt2ImgBody maps fields; override_settings only when sdModel is set', () => {
    const base = buildTxt2ImgBody({ prompt: 'a', negativePrompt: 'b', width: 512, height: 768 }, cfg())
    expect(base.prompt).toBe('a')
    expect(base.negative_prompt).toBe('b')
    expect(base.width).toBe(512)
    expect(base.height).toBe(768)
    expect(base.steps).toBe(28)
    expect(base.sampler_name).toBe('Euler a')
    expect(base.override_settings).toBeUndefined()
    const withModel = buildTxt2ImgBody({ prompt: 'a', width: 512, height: 512 }, cfg({ sdModel: 'dreamshaper' }))
    expect(withModel.override_settings).toEqual({ sd_model_checkpoint: 'dreamshaper' })
    expect(withModel.override_settings_restore_afterwards).toBe(true)
  })

  it('generate extracts base64 from images[0]', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ images: ['BASE64DATA'] }) }))
    )
    const r = await sdWebuiAdapter.generate({ prompt: 'x', width: 512, height: 512 }, cfg())
    expect(r).toMatchObject({ success: true, base64: 'BASE64DATA', provider: 'sd-webui', mimeType: 'image/png' })
  })

  it('non-OK HTTP → failure outcome', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, statusText: 'Server Error' }))
    )
    const r = await sdWebuiAdapter.generate({ prompt: 'x', width: 512, height: 512 }, cfg())
    expect(r.success).toBe(false)
  })

  it('empty images → failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ images: [] }) }))
    )
    const r = await sdWebuiAdapter.generate({ prompt: 'x', width: 512, height: 512 }, cfg())
    expect(r.success).toBe(false)
  })

  it('isAvailable: true on ok, false on throw', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true }))
    )
    expect(await sdWebuiAdapter.isAvailable(cfg())).toBe(true)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED')
      })
    )
    expect(await sdWebuiAdapter.isAvailable(cfg())).toBe(false)
  })

  it('getProgress parses progress + returns null on failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ progress: 0.5, eta_relative: 2 }) }))
    )
    expect(await getProgress('http://x')).toEqual({ progress: 0.5, etaRelative: 2 })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false }))
    )
    expect(await getProgress('http://x')).toBeNull()
  })
})
