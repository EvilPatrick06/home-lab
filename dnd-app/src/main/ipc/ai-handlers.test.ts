import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '../../shared/ipc-channels'

const mocked = vi.hoisted(() => ({
  ipcHandleMock: vi.fn(),
  approveWebSearchMock: vi.fn(() => ({ success: true })),
  restoreMock: vi.fn(),
  getConversationManagerMock: vi.fn(() => ({ serialize: () => ({}), restore: mocked.restoreMock })),
  hasActiveStreamMock: vi.fn(() => false),
  cancelStreamsMock: vi.fn(() => 0),
  getMemoryManagerMock: vi.fn(() => ({
    getWorldState: vi.fn(async () => null), // PHASE-26: world-sync boundary hook reads prev scene
    updateWorldState: vi.fn(async () => {}),
    updateQuestLog: vi.fn(async () => {})
  }))
}))

vi.mock('../ai/memory-manager', () => ({
  getMemoryManager: mocked.getMemoryManagerMock
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    // Absolute POSIX path so sanitizeCampaignId's path.resolve check is stable on Linux CI
    // (a 'C:/tmp' value is treated as RELATIVE here and prepends cwd, breaking the equality check).
    getPath: vi.fn(() => '/tmp')
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

vi.mock('../../shared/ipc-schemas', async () => {
  // Keep the REAL ConversationDataSchema (07E validates restore payloads with it); only stub
  // the two chat/config schemas the other tests force to always-success.
  const actual = await vi.importActual<typeof import('../../shared/ipc-schemas')>('../../shared/ipc-schemas')
  return {
    ...actual,
    AiChatRequestSchema: { safeParse: vi.fn(() => ({ success: true })) },
    AiConfigSchema: { safeParse: vi.fn(() => ({ success: true })) }
  }
})

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
  cancelScenePrep: vi.fn(() => ({ success: true })),
  hasActiveStreamForCampaign: mocked.hasActiveStreamMock,
  cancelStreamsForCampaign: mocked.cancelStreamsMock,
  getConnectionStatus: vi.fn(() => 'connected'),
  getConsecutiveFailures: vi.fn(() => 0),
  wasContextTruncated: vi.fn(() => false),
  getLastTokenEstimate: vi.fn(() => 0),
  getLastAssistantContextChunkIds: vi.fn(() => []),
  getConversationManager: mocked.getConversationManagerMock
}))

vi.mock('../ai/context-builder', () => ({
  buildContext: vi.fn(async () => ''),
  getLastTokenBreakdown: vi.fn(() => null)
}))

vi.mock('../ai/ollama-manager', () => ({
  OLLAMA_BASE_URL: 'http://localhost:11434',
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

import { loadConversation, saveConversation } from '../storage/ai-conversation-storage'
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

// 06A — scene-prep cancel channel.
describe('registerAiHandlers AI_CANCEL_SCENE channel', () => {
  beforeEach(() => mocked.ipcHandleMock.mockClear())

  const findHandler = (): ((_e: unknown, id: unknown) => Promise<unknown>) => {
    registerAiHandlers()
    const reg = mocked.ipcHandleMock.mock.calls.find(([channel]) => channel === IPC_CHANNELS.AI_CANCEL_SCENE)
    expect(reg).toBeTruthy()
    return reg?.[1] as (_e: unknown, id: unknown) => Promise<unknown>
  }

  it('registers and delegates with a valid (UUID-shaped) campaign id', async () => {
    const handler = findHandler()
    const result = await handler({}, '11111111-1111-1111-1111-111111111111')
    expect(result).toEqual({ success: true })
  })

  it('returns an error envelope for a non-UUID id', async () => {
    const handler = findHandler()
    await expect(handler({}, 'not-a-uuid')).resolves.toEqual({ success: false, error: 'Invalid campaignId' })
  })
})

// 07D — read-only peek + AI_LOAD active-stream guard.
describe('registerAiHandlers conversation peek/load (07D)', () => {
  const UUID = '11111111-1111-1111-1111-111111111111'
  const findHandler = (channel: string): ((_e: unknown, id: unknown) => Promise<unknown>) => {
    registerAiHandlers()
    const reg = mocked.ipcHandleMock.mock.calls.find(([c]) => c === channel)
    expect(reg).toBeTruthy()
    return reg?.[1] as (_e: unknown, id: unknown) => Promise<unknown>
  }

  beforeEach(() => {
    mocked.ipcHandleMock.mockClear()
    mocked.restoreMock.mockClear()
    mocked.getConversationManagerMock.mockClear()
    mocked.hasActiveStreamMock.mockClear().mockReturnValue(false)
    vi.mocked(loadConversation).mockResolvedValue({
      success: true,
      data: { messages: [], summaries: [], activeCharacterIds: [] }
    } as never)
  })

  it('AI_PEEK returns disk data and never instantiates a ConversationManager', async () => {
    const handler = findHandler(IPC_CHANNELS.AI_PEEK_CONVERSATION)
    const res = (await handler({}, UUID)) as { success: boolean }
    expect(res.success).toBe(true)
    expect(mocked.getConversationManagerMock).not.toHaveBeenCalled()
  })

  it('AI_LOAD skips the in-memory restore while a stream is active', async () => {
    mocked.hasActiveStreamMock.mockReturnValue(true)
    const handler = findHandler(IPC_CHANNELS.AI_LOAD_CONVERSATION)
    const res = (await handler({}, UUID)) as { success: boolean }
    expect(res.success).toBe(true)
    expect(mocked.restoreMock).not.toHaveBeenCalled()
  })

  it('AI_LOAD restores when no stream is active', async () => {
    mocked.hasActiveStreamMock.mockReturnValue(false)
    const handler = findHandler(IPC_CHANNELS.AI_LOAD_CONVERSATION)
    await handler({}, UUID)
    expect(mocked.restoreMock).toHaveBeenCalled()
  })
})

// 07E — restore: validate, cancel in-flight stream, write through to disk + memory.
describe('registerAiHandlers AI_RESTORE_CONVERSATION (07E)', () => {
  const UUID = '11111111-1111-1111-1111-111111111111'
  const findHandler = (): ((_e: unknown, id: unknown, data: unknown) => Promise<unknown>) => {
    registerAiHandlers()
    const reg = mocked.ipcHandleMock.mock.calls.find(([c]) => c === IPC_CHANNELS.AI_RESTORE_CONVERSATION)
    expect(reg).toBeTruthy()
    return reg?.[1] as (_e: unknown, id: unknown, data: unknown) => Promise<unknown>
  }

  beforeEach(() => {
    mocked.ipcHandleMock.mockClear()
    mocked.restoreMock.mockClear()
    mocked.cancelStreamsMock.mockClear()
    vi.mocked(saveConversation)
      .mockClear()
      .mockResolvedValue({ success: true } as never)
  })

  it('rejects a malformed payload and does not write disk', async () => {
    const handler = findHandler()
    const res = (await handler({}, UUID, { messages: 'nope' })) as { success: boolean }
    expect(res.success).toBe(false)
    expect(saveConversation).not.toHaveBeenCalled()
    expect(mocked.restoreMock).not.toHaveBeenCalled()
  })

  it('valid payload: cancels in-flight streams, saves, and write-through restores', async () => {
    const handler = findHandler()
    const data = { messages: [{ role: 'user', content: 'hi', timestamp: '' }], summaries: [], activeCharacterIds: [] }
    const res = (await handler({}, UUID, data)) as { success: boolean }
    expect(res.success).toBe(true)
    expect(mocked.cancelStreamsMock).toHaveBeenCalledWith(UUID)
    expect(saveConversation).toHaveBeenCalled()
    expect(mocked.restoreMock).toHaveBeenCalled()
  })

  it('accepts a legacy payload missing summaries/activeCharacterIds (defaulted empty)', async () => {
    const handler = findHandler()
    const res = (await handler({}, UUID, { messages: [] })) as { success: boolean }
    expect(res.success).toBe(true)
    const savedArg = vi.mocked(saveConversation).mock.calls[0]?.[1] as {
      summaries: unknown[]
      activeCharacterIds: unknown[]
    }
    expect(savedArg.summaries).toEqual([])
    expect(savedArg.activeCharacterIds).toEqual([])
  })
})

describe('registerAiHandlers AI_GET_TOKEN_METER channel (PHASE-10 10C)', () => {
  beforeEach(() => mocked.ipcHandleMock.mockClear())

  it('returns the conversation budget and active context window as numbers', async () => {
    registerAiHandlers()
    const registration = mocked.ipcHandleMock.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.AI_GET_TOKEN_METER
    )
    expect(registration).toBeDefined()
    const handler = registration?.[1] as (
      _event: unknown
    ) => Promise<{ conversationBudget: number; contextWindow: number }>
    const res = await handler({})
    expect(typeof res.conversationBudget).toBe('number')
    expect(res.conversationBudget).toBeGreaterThan(0)
    expect(typeof res.contextWindow).toBe('number')
    expect(res.contextWindow).toBeGreaterThan(0)
  })
})

describe('registerAiHandlers AI_STREAM_DONE truncation fields (PHASE-14 14C)', () => {
  beforeEach(() => mocked.ipcHandleMock.mockClear())

  it('appends contextTruncated/tokenEstimate sourced per-campaign', async () => {
    const aiService = await import('../ai/ai-service')
    const schemas = await import('../../shared/ipc-schemas')
    const { BrowserWindow } = await import('electron')

    vi.mocked(schemas.AiChatRequestSchema.safeParse).mockReturnValueOnce({
      success: true,
      data: { campaignId: 'camp-xyz' }
    } as never)
    vi.mocked(aiService.wasContextTruncated).mockReturnValue(true)
    vi.mocked(aiService.getLastTokenEstimate).mockReturnValue(4242)
    const send = vi.fn()
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({
      isDestroyed: () => false,
      webContents: { send }
    } as never)
    // Capture onDone and fire it AFTER startChat returns — the real stream runs later, so the
    // handler's `const streamId = startChat(...)` is assigned before onDone references it (firing
    // synchronously inside startChat would hit the streamId TDZ).
    let capturedOnDone: ((a: string, b: string, c: unknown[], d: unknown[], e: unknown[]) => void) | undefined
    vi.mocked(aiService.startChat).mockImplementationOnce(((_data: unknown, _onChunk: unknown, onDone: unknown) => {
      capturedOnDone = onDone as typeof capturedOnDone
      return 'stream-x'
    }) as never)

    registerAiHandlers()
    const reg = mocked.ipcHandleMock.mock.calls.find(([c]) => c === IPC_CHANNELS.AI_CHAT_STREAM)
    const handler = reg?.[1] as (e: unknown, input: unknown) => Promise<unknown>
    await handler({ sender: {} }, { campaignId: 'camp-xyz', message: 'hi' })
    capturedOnDone?.('full', 'display', [], [], [])

    const doneCall = send.mock.calls.find(([c]) => c === IPC_CHANNELS.AI_STREAM_DONE)
    expect(doneCall).toBeTruthy()
    expect(doneCall?.[1]).toMatchObject({ contextTruncated: true, tokenEstimate: 4242 })
    expect(aiService.wasContextTruncated).toHaveBeenCalledWith('camp-xyz')
    expect(aiService.getLastTokenEstimate).toHaveBeenCalledWith('camp-xyz')
  })
})

describe('registerAiHandlers AI_GET_CONTEXT_INSPECTOR channel (PHASE-14 14E)', () => {
  const UUID = '11111111-1111-1111-1111-111111111111'
  const findHandler = (): ((e: unknown, id: unknown) => Promise<unknown>) => {
    registerAiHandlers()
    const reg = mocked.ipcHandleMock.mock.calls.find(([c]) => c === IPC_CHANNELS.AI_GET_CONTEXT_INSPECTOR)
    expect(reg).toBeTruthy()
    return reg?.[1] as (e: unknown, id: unknown) => Promise<unknown>
  }
  beforeEach(() => mocked.ipcHandleMock.mockClear())

  it('composes the snapshot from the per-campaign sources', async () => {
    const aiService = await import('../ai/ai-service')
    vi.mocked(aiService.getLastAssistantContextChunkIds).mockReturnValue(['phb-1'])
    vi.mocked(aiService.wasContextTruncated).mockReturnValue(false)
    vi.mocked(aiService.getLastTokenEstimate).mockReturnValue(0)
    const handler = findHandler()
    const res = (await handler({}, UUID)) as {
      breakdown: unknown
      contextTruncated: boolean
      lastTokenEstimate: number
      contextWindow: number
      conversationBudget: number
      chunkIds: string[]
    }
    expect(res).toMatchObject({ breakdown: null, contextTruncated: false, lastTokenEstimate: 0, chunkIds: ['phb-1'] })
    expect(typeof res.contextWindow).toBe('number')
    expect(typeof res.conversationBudget).toBe('number')
    expect(aiService.getLastAssistantContextChunkIds).toHaveBeenCalledWith(UUID)
  })

  it('rejects a path-traversal campaignId', async () => {
    const handler = findHandler()
    const res = (await handler({}, '../../evil')) as { success?: boolean }
    expect(res.success).toBe(false)
  })
})

describe('registerAiHandlers AI_CONNECTION_STATUS channel (PHASE-14 14A)', () => {
  beforeEach(() => mocked.ipcHandleMock.mockClear())

  it('returns the derived status + consecutiveFailures from ai-service', async () => {
    const aiService = await import('../ai/ai-service')
    vi.mocked(aiService.getConnectionStatus).mockReturnValue('disconnected')
    vi.mocked(aiService.getConsecutiveFailures).mockReturnValue(4)
    registerAiHandlers()
    const reg = mocked.ipcHandleMock.mock.calls.find(([c]) => c === IPC_CHANNELS.AI_CONNECTION_STATUS)
    expect(reg).toBeDefined()
    const handler = reg?.[1] as () => Promise<{ status: string; consecutiveFailures: number }>
    const res = await handler()
    expect(res).toEqual({ status: 'disconnected', consecutiveFailures: 4 })
  })
})

describe('registerAiHandlers campaignId path-traversal guard (PHASE-13 13A)', () => {
  const UUID = '11111111-1111-1111-1111-111111111111'
  const EVIL = '../../evil'
  const findHandler = (channel: string): ((_e: unknown, ...args: unknown[]) => Promise<unknown>) => {
    registerAiHandlers()
    const reg = mocked.ipcHandleMock.mock.calls.find(([c]) => c === channel)
    expect(reg).toBeTruthy()
    return reg?.[1] as (_e: unknown, ...args: unknown[]) => Promise<unknown>
  }
  beforeEach(() => {
    mocked.ipcHandleMock.mockClear()
    mocked.getMemoryManagerMock.mockClear()
  })

  it('AI_SYNC_WORLD_STATE rejects a traversal id and never reaches getMemoryManager', async () => {
    const handler = findHandler(IPC_CHANNELS.AI_SYNC_WORLD_STATE)
    const res = (await handler({}, EVIL, {})) as { success: boolean }
    expect(res.success).toBe(false)
    expect(mocked.getMemoryManagerMock).not.toHaveBeenCalled()
  })

  it('AI_SYNC_WORLD_STATE passes a valid UUID through to getMemoryManager', async () => {
    const handler = findHandler(IPC_CHANNELS.AI_SYNC_WORLD_STATE)
    const res = (await handler({}, UUID, {})) as { success: boolean }
    expect(res.success).toBe(true)
    expect(mocked.getMemoryManagerMock).toHaveBeenCalledWith(UUID)
  })

  it('AI_UPDATE_QUEST_LOG rejects a traversal id', async () => {
    const handler = findHandler(IPC_CHANNELS.AI_UPDATE_QUEST_LOG)
    const res = (await handler({}, EVIL, 'add', 'Quest')) as { success: boolean }
    expect(res.success).toBe(false)
    expect(mocked.getMemoryManagerMock).not.toHaveBeenCalled()
  })

  it('AI_PREPARE_SCENE surfaces an error envelope and never calls prepareScene', async () => {
    const handler = findHandler(IPC_CHANNELS.AI_PREPARE_SCENE)
    const aiService = await import('../ai/ai-service')
    vi.mocked(aiService.prepareScene).mockClear()
    const res = (await handler({}, EVIL, [])) as { success: boolean }
    expect(res.success).toBe(false)
    expect(aiService.prepareScene).not.toHaveBeenCalled()
  })
})

describe('registerAiHandlers trigger observer kill switch (PHASE-13 13D)', () => {
  const findHandler = (channel: string): ((_e: unknown, ...args: unknown[]) => Promise<unknown>) => {
    registerAiHandlers()
    const reg = mocked.ipcHandleMock.mock.calls.find(([c]) => c === channel)
    expect(reg).toBeTruthy()
    return reg?.[1] as (_e: unknown, ...args: unknown[]) => Promise<unknown>
  }
  beforeEach(() => mocked.ipcHandleMock.mockClear())

  it('SET flips what GET returns', async () => {
    const set = findHandler(IPC_CHANNELS.AI_TRIGGER_SET_ENABLED)
    const get = findHandler(IPC_CHANNELS.AI_TRIGGER_GET_ENABLED)
    await set({}, false)
    expect(await get({})).toEqual({ enabled: false })
    await set({}, true)
    expect(await get({})).toEqual({ enabled: true })
  })

  it('SET rejects a non-boolean arg via the tuple schema', async () => {
    const set = findHandler(IPC_CHANNELS.AI_TRIGGER_SET_ENABLED)
    const res = (await set({}, 'nope')) as { success: boolean }
    expect(res.success).toBe(false)
  })
})
