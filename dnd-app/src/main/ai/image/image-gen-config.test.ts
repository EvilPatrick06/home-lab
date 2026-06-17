import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { TMP } = vi.hoisted(() => ({ TMP: `${process.env.TMPDIR || '/tmp'}/vitest-aiimg-cfg` }))
vi.mock('electron', () => ({ app: { getPath: () => TMP } }))

import {
  __resetImageGenConfigCache,
  configureImageGen,
  getImageGenConfig,
  getImageGenConfigPath
} from './image-gen-config'

beforeAll(() => mkdirSync(TMP, { recursive: true }))

beforeEach(() => {
  __resetImageGenConfigCache()
  try {
    rmSync(getImageGenConfigPath())
  } catch {
    // no file yet
  }
})
afterAll(() => rmSync(TMP, { recursive: true, force: true }))

describe('image-gen-config (PHASE-33 33A)', () => {
  it('returns defaults (enabled:false) when no file exists', () => {
    const cfg = getImageGenConfig()
    expect(cfg.enabled).toBe(false)
    expect(cfg.provider).toBe('sd-webui')
    expect(cfg.fallbackProvider).toBe('none')
    expect(cfg.sdWebuiUrl).toBe('http://127.0.0.1:7860')
  })

  it('round-trips configure → get', async () => {
    await configureImageGen({
      enabled: true,
      provider: 'openai',
      fallbackProvider: 'sd-webui',
      sdWebuiUrl: 'http://127.0.0.1:7860',
      sdSteps: 40,
      sdSampler: 'DPM++ 2M',
      sdCfgScale: 6,
      openaiModel: 'gpt-image-1',
      openaiQuality: 'high',
      geminiModel: 'gemini-2.5-flash-image',
      size: '1024x1536'
    })
    __resetImageGenConfigCache() // force a disk re-read
    const cfg = getImageGenConfig()
    expect(cfg.enabled).toBe(true)
    expect(cfg.provider).toBe('openai')
    expect(cfg.openaiQuality).toBe('high')
    expect(cfg.size).toBe('1024x1536')
  })

  it('falls back to defaults on corrupt JSON (never throws)', () => {
    writeFileSync(getImageGenConfigPath(), '{ not valid json')
    __resetImageGenConfigCache()
    expect(() => getImageGenConfig()).not.toThrow()
    expect(getImageGenConfig().enabled).toBe(false)
  })
})
