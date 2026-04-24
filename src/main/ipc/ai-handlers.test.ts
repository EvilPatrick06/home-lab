import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/ipc-channels'

const mocked = vi.hoisted(() => ({
  ipcHandleMock: vi.fn(),
  approveWebSearchMock: vi.fn(() => ({ success: true }))
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: vi.fn(() => 'C:/tmp')
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({
      webContents: { send: vi.fn() }
    })),
    getAllWindows: vi.fn(() => [])
  },
  ipcMain: {
    handle: mocked.ipcHandleMock
  }
}))

vi.mock('../../shared/ipc-schemas', () => ({
  AiChatRequestSchema: { safeParse: vi.fn(() => ({ success: true })) },
  AiConfigSchema: { safeParse: vi.fn(() => ({ success: true })) }
}))

vi.mock('../ai/ai-service', () => ({
  configure: vi.fn(),
  getConfig: vi.fn(() => ({ ollamaModel: 'llama3.1', ollamaUrl: 'http://localhost:11434' })),
  checkProviders: vi.fn(async () => ({ ollama: true, ollamaModels: ['llama3.1'] })),
  buildIndex: vi.fn(() => ({ chunkCount: 1 })),
  loadIndex: vi.fn(() => true),
  getChunkCount: vi.fn(() => 1),
  startChat: vi.fn(() => 'stream-1'),
  cancelChat: vi.fn(),
  approveWebSearch: mocked.approveWebSearchMock,
  applyMutations: vi.fn(async () => ({ applied: [], rejected: [] })),
  prepareScene: vi.fn(() => null),
  getSceneStatus: vi.fn(() => ({ status: 'idle', streamId: null })),
  getConnectionStatus: vi.fn(() => 'connected'),
  getConsecutiveFailures: vi.fn(() => 0),
  getConversationManager: vi.fn(() => ({ serialize: () => ({}), restore: vi.fn() }))
}))

vi.mock('../ai/context-builder', () => ({
  buildContext: vi.fn(async () => ''),
  getLastTokenBreakdown: vi.fn(() => null)
}))

vi.mock('../ai/ollama-manager', () => ({
  CURATED_MODELS: [],
  checkOllamaUpdate: vi.fn(async () => ({ installed: '0.0.0', updateAvailable: false })),
  deleteModel: vi.fn(async () => {}),
  detectOllama: vi.fn(async () => ({ installed: false })),
  downloadOllama: vi.fn(async () => 'installer.exe'),
  getSystemVram: vi.fn(async () => ({ totalMB: 0, recommendedModel: null })),
  installOllama: vi.fn(async () => {}),
  listInstalledModels: vi.fn(async () => []),
  listInstalledModelsDetailed: vi.fn(async () => []),
  pullModel: vi.fn(async () => {}),
  startOllama: vi.fn(async () => {}),
  updateOllama: vi.fn(async () => {})
}))

vi.mock('../storage/ai-conversation-storage', () => ({
  saveConversation: vi.fn(async () => {}),
  loadConversation: vi.fn(async () => null),
  deleteConversation: vi.fn(async () => {})
}))

import { registerAiHandlers } from './ai-handlers'

describe('registerAiHandlers web search approval channel', () => {
  beforeEach(() => {
    mocked.ipcHandleMock.mockClear()
    mocked.approveWebSearchMock.mockClear()
  })

  it('registers AI_WEB_SEARCH_APPROVE and delegates to ai-service', async () => {
    registerAiHandlers()

    const registration = mocked.ipcHandleMock.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.AI_WEB_SEARCH_APPROVE
    )
    expect(registration).toBeTruthy()

    const handler = registration?.[1] as (_event: unknown, streamId: string, approved: boolean) => Promise<unknown>
    const result = await handler({}, 'stream-123', true)

    expect(mocked.approveWebSearchMock).toHaveBeenCalledWith('stream-123', true)
    expect(result).toEqual({ success: true })
  })

  it('returns validation errors for bad payloads', async () => {
    registerAiHandlers()
    const registration = mocked.ipcHandleMock.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.AI_WEB_SEARCH_APPROVE
    )
    const handler = registration?.[1] as (_event: unknown, streamId: unknown, approved: unknown) => Promise<unknown>

    await expect(handler({}, 123, true)).resolves.toEqual({ success: false, error: 'Invalid streamId' })
    await expect(handler({}, 'stream-123', 'yes')).resolves.toEqual({ success: false, error: 'Invalid approval value' })
  })
})
