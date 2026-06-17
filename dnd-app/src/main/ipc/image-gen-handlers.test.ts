import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/ipc-channels'

const mocked = vi.hoisted(() => ({
  ipcHandleMock: vi.fn(),
  config: { enabled: true, provider: 'openai', size: '1024x1024' } as Record<string, unknown>,
  generateImageMock: vi.fn(),
  saveImageMock: vi.fn(async () => ({ success: true })),
  configureMock: vi.fn(async () => {})
}))

vi.mock('electron', () => ({ ipcMain: { handle: mocked.ipcHandleMock } }))
vi.mock('../ai/image/image-gen-config', () => ({
  getImageGenConfig: () => mocked.config,
  configureImageGen: mocked.configureMock
}))
vi.mock('../ai/image/image-provider', () => ({ generateImage: mocked.generateImageMock }))
vi.mock('../ai/image/sd-webui-client', () => ({
  sdWebuiAdapter: { isAvailable: vi.fn(async () => true) },
  getProgress: vi.fn(async () => null)
}))
vi.mock('../storage/image-library-storage', () => ({ saveImage: mocked.saveImageMock }))
vi.mock('../upload-validation', () => ({ validateUploadExtension: vi.fn(() => null) }))
vi.mock('../ai/ai-service', () => ({ getConfig: () => ({ openaiApiKey: 'k', geminiApiKey: undefined }) }))
vi.mock('../log', () => ({ logToFile: vi.fn() }))

import { registerImageGenHandlers } from './image-gen-handlers'

const fakeEvent = { sender: { isDestroyed: () => false, send: vi.fn() } }
const findHandler = (channel: string): ((...a: unknown[]) => Promise<unknown>) => {
  registerImageGenHandlers()
  const reg = mocked.ipcHandleMock.mock.calls.find(([c]) => c === channel)
  expect(reg).toBeTruthy()
  return reg?.[1] as (...a: unknown[]) => Promise<unknown>
}

beforeEach(() => {
  mocked.ipcHandleMock.mockClear()
  mocked.generateImageMock.mockReset()
  mocked.saveImageMock.mockClear()
  mocked.config = { enabled: true, provider: 'openai', size: '1024x1024' }
})

const REQ = { subjectType: 'npc-portrait', description: 'a grizzled dwarf' }

describe('image-gen-handlers (PHASE-33 33D)', () => {
  it('generate short-circuits with disabled:true when the feature is off (no provider call)', async () => {
    mocked.config = { enabled: false, provider: 'openai', size: '1024x1024' }
    const h = findHandler(IPC_CHANNELS.AI_IMAGE_GENERATE)
    const res = (await h(fakeEvent, REQ)) as { success: boolean; disabled?: boolean }
    expect(res).toMatchObject({ success: false, disabled: true })
    expect(mocked.generateImageMock).not.toHaveBeenCalled()
  })

  it('happy path returns a data URL + saves to the library with an aiimg- id', async () => {
    mocked.generateImageMock.mockResolvedValue({
      success: true,
      base64: 'QUJD',
      mimeType: 'image/png',
      provider: 'openai',
      model: 'gpt-image-1',
      usedFallback: false
    })
    const h = findHandler(IPC_CHANNELS.AI_IMAGE_GENERATE)
    const res = (await h(fakeEvent, REQ)) as { success: boolean; dataUrl?: string; imageId?: string }
    expect(res.success).toBe(true)
    expect(res.dataUrl).toBe('data:image/png;base64,QUJD')
    expect(res.imageId?.startsWith('aiimg-')).toBe(true)
    expect(mocked.saveImageMock).toHaveBeenCalledTimes(1)
    expect((mocked.saveImageMock.mock.calls[0] as unknown[])[3]).toBe('.png')
  })

  it('rejects a concurrent generate (single-flight)', async () => {
    let release!: () => void
    mocked.generateImageMock.mockImplementation(
      () =>
        new Promise((r) => {
          release = () =>
            r({
              success: true,
              base64: 'QUJD',
              mimeType: 'image/png',
              provider: 'openai',
              model: 'm',
              usedFallback: false
            })
        })
    )
    const h = findHandler(IPC_CHANNELS.AI_IMAGE_GENERATE)
    const first = h(fakeEvent, REQ)
    const second = (await h(fakeEvent, REQ)) as { success: boolean; error?: string }
    expect(second.success).toBe(false)
    expect(second.error).toMatch(/already in progress/i)
    release()
    await first
  })

  it('configure rejects an invalid payload (bad URL) via the envelope', async () => {
    const h = findHandler(IPC_CHANNELS.AI_IMAGE_CONFIGURE)
    const res = (await h(fakeEvent, { enabled: true, sdWebuiUrl: 'not-a-url' })) as { success: boolean }
    expect(res.success).toBe(false)
    expect(mocked.configureMock).not.toHaveBeenCalled()
  })

  it('check-providers reports per-provider availability', async () => {
    const h = findHandler(IPC_CHANNELS.AI_IMAGE_CHECK_PROVIDERS)
    const res = (await h(fakeEvent)) as { sdWebui: boolean; openai: boolean; gemini: boolean }
    expect(res).toEqual({ sdWebui: true, openai: true, gemini: false })
  })
})
