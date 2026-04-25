import { app, BrowserWindow, ipcMain } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import {
  AiChatRequestSchema,
  AiConfigSchema,
  type ValidatedAiChatRequest,
  type ValidatedAiConfig
} from '../../shared/ipc-schemas'
import type { AiConnectionStatus, StreamResult } from '../ai/ai-service'
import * as aiService from '../ai/ai-service'
import { buildContext, getLastTokenBreakdown, getSearchEngine } from '../ai/context-builder'
import type { DmAction } from '../ai/dm-actions'
import { analyzeMapState, captureMapScreenshot, type MapStateForVisionAnalysis } from '../ai/ai-vision'
import { processStateUpdate, type GameStateSnapshot } from '../ai/ai-trigger-observer'
import { setClaudeApiKey } from '../ai/claude-client'
import { setGeminiApiKey } from '../ai/gemini-client'
import { getDmStatus, sendNarration, startDiscordDm, stopDiscordDm } from '../bmo-bridge'
import { setOpenAIApiKey } from '../ai/openai-client'
import { type AiProviderType, CLOUD_MODELS } from '../ai/llm-provider'
import { type CombatState, getMemoryManager, type WorldState } from '../ai/memory-manager'
import {
  CURATED_MODELS,
  type CuratedModel,
  checkOllamaUpdate,
  deleteModel,
  detectOllama,
  downloadOllama,
  getSystemVram,
  type InstalledModelInfo,
  installOllama,
  listInstalledModels,
  listInstalledModelsDetailed,
  type OllamaStatus,
  type OllamaVersionInfo,
  type PerformanceTier,
  pullModel,
  startOllama,
  updateOllama,
  type VramInfo
} from '../ai/ollama-manager'
import { getProvider } from '../ai/provider-registry'
import type {
  AiChatRequest,
  AiConfig,
  AiIndexProgress,
  AiStreamChunk,
  AiStreamDone,
  AiStreamError,
  ConversationData,
  StatChange
} from '../ai/types'
import { logToFile } from '../log'
import { deleteConversation, loadConversation, saveConversation } from '../storage/ai-conversation-storage'

// Ensure imported types are used for type-safety
type _ValidatedAiChatRequest = ValidatedAiChatRequest
type _ValidatedAiConfig = ValidatedAiConfig
type _AiConnectionStatus = AiConnectionStatus
type _StreamResult = StreamResult
type _DmAction = DmAction
type _CuratedModel = CuratedModel
type _InstalledModelInfo = InstalledModelInfo
type _OllamaStatus = OllamaStatus
type _OllamaVersionInfo = OllamaVersionInfo
type _PerformanceTier = PerformanceTier
type _VramInfo = VramInfo
type _AiStreamChunk = AiStreamChunk
type _AiStreamDone = AiStreamDone
type _AiStreamError = AiStreamError
type _AiIndexProgress = AiIndexProgress

export function registerAiHandlers(): void {
  // ── Configuration ──

  ipcMain.handle(IPC_CHANNELS.AI_CONFIGURE, async (_event, config: AiConfig) => {
    const parsed = AiConfigSchema.safeParse(config)
    if (!parsed.success) {
      return { success: false, error: `Invalid config: ${parsed.error.issues[0]?.message}` }
    }
    aiService.configure(config)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.AI_GET_CONFIG, async () => {
    return aiService.getConfig()
  })

  ipcMain.handle(IPC_CHANNELS.AI_CHECK_PROVIDERS, async () => {
    return await aiService.checkProviders()
  })

  // ── Cloud Provider Models ──

  ipcMain.handle(IPC_CHANNELS.AI_LIST_CLOUD_MODELS, async (_event, providerType: string) => {
    if (providerType === 'ollama' || !(providerType in CLOUD_MODELS)) {
      return []
    }
    return CLOUD_MODELS[providerType as keyof typeof CLOUD_MODELS]
  })

  ipcMain.handle(IPC_CHANNELS.AI_VALIDATE_API_KEY, async (_event, providerType: string, apiKey: string) => {
    if (providerType === 'ollama') return { valid: true }

    const validTypes: AiProviderType[] = ['claude', 'openai', 'gemini']
    if (!validTypes.includes(providerType as AiProviderType)) {
      return { valid: false, error: `Unknown provider: ${providerType}` }
    }

    try {
      const provider = getProvider(providerType as AiProviderType)

      if (providerType === 'claude') setClaudeApiKey(apiKey)
      else if (providerType === 'openai') setOpenAIApiKey(apiKey)
      else if (providerType === 'gemini') setGeminiApiKey(apiKey)

      const available = await provider.isAvailable()
      return { valid: available, error: available ? undefined : 'API key validation failed' }
    } catch (error) {
      return { valid: false, error: (error as Error).message }
    }
  })

  // ── Index Building ──

  ipcMain.handle(IPC_CHANNELS.AI_BUILD_INDEX, async (event) => {
    if (app.isPackaged) {
      return {
        success: false,
        error:
          'Rebuilding the rulebook index is disabled in packaged builds. The bundled index is loaded automatically.'
      }
    }

    const win = BrowserWindow.fromWebContents(event.sender)
    try {
      const result = aiService.buildIndex((percent, stage) => {
        win?.webContents.send(IPC_CHANNELS.AI_INDEX_PROGRESS, { percent, stage })
      })
      return { success: true, chunkCount: result.chunkCount }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_LOAD_INDEX, async () => {
    return aiService.loadIndex()
  })

  ipcMain.handle(IPC_CHANNELS.AI_GET_CHUNK_COUNT, async () => {
    return aiService.getChunkCount()
  })

  // ── Streaming Chat ──

  ipcMain.handle(IPC_CHANNELS.AI_CHAT_STREAM, async (event, request: AiChatRequest) => {
    const parsed = AiChatRequestSchema.safeParse(request)
    if (!parsed.success) {
      return { success: false, error: `Invalid request: ${parsed.error.issues[0]?.message}` }
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'No window found' }

    const streamId = aiService.startChat(
      request,
      // onChunk
      (text) => {
        win.webContents.send(IPC_CHANNELS.AI_STREAM_CHUNK, { streamId, text })
      },
      // onDone
      (fullText, displayText, statChanges, dmActions, ruleCitations) => {
        win.webContents.send(IPC_CHANNELS.AI_STREAM_DONE, {
          streamId,
          fullText,
          displayText,
          statChanges,
          dmActions,
          ruleCitations
        })
      },
      // onError
      (error) => {
        win.webContents.send(IPC_CHANNELS.AI_STREAM_ERROR, { streamId, error })
      }
    )

    return { success: true, streamId }
  })

  ipcMain.handle(IPC_CHANNELS.AI_CANCEL_STREAM, async (_event, streamId: string) => {
    aiService.cancelChat(streamId)
    return { success: true }
  })

  ipcMain.handle(IPC_CHANNELS.AI_WEB_SEARCH_APPROVE, async (_event, streamId: string, approved: boolean) => {
    if (typeof streamId !== 'string') {
      return { success: false, error: 'Invalid streamId' }
    }
    if (typeof approved !== 'boolean') {
      return { success: false, error: 'Invalid approval value' }
    }
    return aiService.approveWebSearch(streamId, approved)
  })

  // ── Stat Mutations ──

  ipcMain.handle(IPC_CHANNELS.AI_APPLY_MUTATIONS, async (_event, characterId: string, changes: StatChange[]) => {
    // Log human-readable descriptions of each mutation
    for (const change of changes) {
      const desc = aiService.describeChange(change)
      const isNeg = aiService.isNegativeChange(change)
      if (isNeg) {
        logToFile('warn', `[AI Mutation] ${characterId}: ${desc} (negative)`)
      } else {
        logToFile('info', `[AI Mutation] ${characterId}: ${desc}`)
      }
    }
    return await aiService.applyMutations(characterId, changes)
  })

  ipcMain.handle(IPC_CHANNELS.AI_LONG_REST, async (_event, characterId: string) => {
    logToFile('info', `[AI Mutation] ${characterId}: long rest`)
    return await aiService.applyLongRestMutations(characterId)
  })

  ipcMain.handle(IPC_CHANNELS.AI_SHORT_REST, async (_event, characterId: string) => {
    logToFile('info', `[AI Mutation] ${characterId}: short rest`)
    return await aiService.applyShortRestMutations(characterId)
  })

  // ── Scene Preparation ──

  ipcMain.handle(IPC_CHANNELS.AI_PREPARE_SCENE, async (_event, campaignId: string, characterIds: string[]) => {
    const streamId = aiService.prepareScene(campaignId, characterIds)
    return { success: true, streamId }
  })

  ipcMain.handle(IPC_CHANNELS.AI_GET_SCENE_STATUS, async (_event, campaignId: string) => {
    return aiService.getSceneStatus(campaignId)
  })

  ipcMain.handle(IPC_CHANNELS.AI_CONNECTION_STATUS, async () => {
    return {
      status: aiService.getConnectionStatus(),
      consecutiveFailures: aiService.getConsecutiveFailures(),
      webSearchAvailable: getSearchEngine() !== null
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_TOKEN_BUDGET, async () => {
    return getLastTokenBreakdown()
  })

  ipcMain.handle(IPC_CHANNELS.AI_TOKEN_BUDGET_PREVIEW, async (_event, campaignId: string, characterIds: string[]) => {
    // Build context without sending a message — just to populate the token breakdown
    try {
      await buildContext('preview query for token budget', characterIds, campaignId)
      return getLastTokenBreakdown()
    } catch {
      return null
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_GENERATE_END_OF_SESSION_RECAP, async (_event, campaignId: string) => {
    try {
      const summary = await aiService.generateSessionSummary(campaignId)
      if (summary) {
        return { success: true, data: summary }
      }
      return { success: false, error: 'Failed to generate recap or conversation history was empty.' }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error generating recap' }
    }
  })

  // ── Conversation Persistence ──

  ipcMain.handle(IPC_CHANNELS.AI_SAVE_CONVERSATION, async (_event, campaignId: string) => {
    const conv = aiService.getConversationManager(campaignId)
    const data = conv.serialize()
    const saveResult = await saveConversation(campaignId, data)
    if (!saveResult.success) {
      return { success: false, error: saveResult.error, summary: null }
    }
    // Generate a session summary alongside the save
    const summary = await aiService.generateSessionSummary(campaignId).catch(() => null)
    return { success: true, summary }
  })

  ipcMain.handle(
    IPC_CHANNELS.AI_RESTORE_CONVERSATION,
    async (_event, campaignId: string, data: Record<string, unknown>) => {
      const result = await saveConversation(campaignId, data as ConversationData)
      if (!result.success) return { success: false, error: result.error }
      return { success: true }
    }
  )

  ipcMain.handle(IPC_CHANNELS.AI_LOAD_CONVERSATION, async (_event, campaignId: string) => {
    const result = await loadConversation(campaignId)
    if (result.success && result.data) {
      const conv = aiService.getConversationManager(campaignId)
      conv.restore(result.data)
      return { success: true, data: result.data }
    }
    return { success: false, error: result.error }
  })

  ipcMain.handle(IPC_CHANNELS.AI_DELETE_CONVERSATION, async (_event, campaignId: string) => {
    const result = await deleteConversation(campaignId)
    if (!result.success) return { success: false, error: result.error }
    return { success: true }
  })

  // ── Memory Files ──

  ipcMain.handle(IPC_CHANNELS.AI_LIST_MEMORY_FILES, async (_event, campaignId: string) => {
    const memoryDir = path.join(app.getPath('userData'), 'campaigns', campaignId, 'ai-context')
    const results: Array<{ name: string; size: number }> = []

    async function walk(dir: string, prefix: string): Promise<void> {
      let entries: { name: string; isDirectory(): boolean }[]
      try {
        const raw = await fs.readdir(dir, { withFileTypes: true })
        entries = raw.map((e) => ({ name: String(e.name), isDirectory: () => e.isDirectory() }))
      } catch {
        return
      }
      for (const entry of entries) {
        const name = String(entry.name)
        const relative = prefix ? `${prefix}/${name}` : name
        const fullPath = path.join(dir, name)
        if (entry.isDirectory()) {
          await walk(fullPath, relative)
        } else {
          try {
            const stat = await fs.stat(fullPath)
            results.push({ name: relative, size: stat.size })
          } catch {
            // Skip unreadable files
          }
        }
      }
    }

    await walk(memoryDir, '')
    return results
  })

  ipcMain.handle(IPC_CHANNELS.AI_READ_MEMORY_FILE, async (_event, campaignId: string, fileName: string) => {
    // Prevent directory traversal
    const normalized = path.normalize(fileName)
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw new Error('Invalid file name')
    }
    const filePath = path.join(app.getPath('userData'), 'campaigns', campaignId, 'ai-context', normalized)
    return await fs.readFile(filePath, 'utf-8')
  })

  ipcMain.handle(IPC_CHANNELS.AI_CLEAR_MEMORY, async (_event, campaignId: string) => {
    const memoryDir = path.join(app.getPath('userData'), 'campaigns', campaignId, 'ai-context')
    try {
      await fs.rm(memoryDir, { recursive: true, force: true })
    } catch {
      // Directory may not exist — that's fine
    }
  })

  // ── Live State Sync ──

  ipcMain.handle(
    IPC_CHANNELS.AI_SYNC_WORLD_STATE,
    async (_event, campaignId: string, state: Record<string, unknown>) => {
      try {
        const memMgr = getMemoryManager(campaignId)
        await memMgr.updateWorldState(state as Partial<WorldState>)
        return { success: true }
      } catch (error) {
        logToFile('error', `[AI Memory] Failed to sync world state: ${(error as Error).message}`)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_SYNC_COMBAT_STATE,
    async (_event, campaignId: string, state: Record<string, unknown>) => {
      try {
        const memMgr = getMemoryManager(campaignId)
        await memMgr.updateCombatState(state as CombatState)
        return { success: true }
      } catch (error) {
        logToFile('error', `[AI Memory] Failed to sync combat state: ${(error as Error).message}`)
        return { success: false, error: (error as Error).message }
      }
    }
  )

  // ── NPC Relationship Tracking ──

  ipcMain.handle(
    IPC_CHANNELS.AI_LOG_NPC_INTERACTION,
    async (_event, campaignId: string, npcName: string, summary: string, attitudeAfter: string) => {
      const validAttitudes = ['friendly', 'neutral', 'hostile'] as const
      if (!validAttitudes.includes(attitudeAfter as (typeof validAttitudes)[number])) {
        return { success: false, error: `Invalid attitude: ${attitudeAfter}` }
      }
      const memMgr = getMemoryManager(campaignId)
      await memMgr.logNpcInteraction(npcName, summary, attitudeAfter as 'friendly' | 'neutral' | 'hostile')
      return { success: true }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.AI_SET_NPC_RELATIONSHIP,
    async (
      _event,
      campaignId: string,
      npcName: string,
      targetNpcName: string,
      relationship: string,
      disposition: string
    ) => {
      const validDispositions = ['friendly', 'neutral', 'hostile'] as const
      if (!validDispositions.includes(disposition as (typeof validDispositions)[number])) {
        return { success: false, error: `Invalid disposition: ${disposition}` }
      }
      const memMgr = getMemoryManager(campaignId)
      await memMgr.addNpcRelationship(
        npcName,
        targetNpcName,
        relationship,
        disposition as 'friendly' | 'neutral' | 'hostile'
      )
      return { success: true }
    }
  )

  // ── Ollama Management ──

  ipcMain.handle(IPC_CHANNELS.AI_DETECT_OLLAMA, async () => {
    return await detectOllama()
  })

  ipcMain.handle(IPC_CHANNELS.AI_GET_VRAM, async () => {
    return await getSystemVram()
  })

  ipcMain.handle(IPC_CHANNELS.AI_DOWNLOAD_OLLAMA, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    try {
      const path = await downloadOllama((percent) => {
        win?.webContents.send(IPC_CHANNELS.AI_OLLAMA_PROGRESS, { type: 'download', percent })
      })
      return { success: true, path }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_INSTALL_OLLAMA, async (_event, installerPath: string) => {
    try {
      await installOllama(installerPath)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_START_OLLAMA, async () => {
    try {
      await startOllama()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_PULL_MODEL, async (event, model: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    try {
      await pullModel(model, (percent) => {
        win?.webContents.send(IPC_CHANNELS.AI_OLLAMA_PROGRESS, { type: 'pull', percent })
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_GET_CURATED_MODELS, async () => {
    return CURATED_MODELS
  })

  ipcMain.handle(IPC_CHANNELS.AI_LIST_INSTALLED_MODELS, async () => {
    return await listInstalledModels()
  })

  ipcMain.handle(IPC_CHANNELS.AI_LIST_INSTALLED_MODELS_DETAILED, async () => {
    return await listInstalledModelsDetailed()
  })

  ipcMain.handle(IPC_CHANNELS.AI_OLLAMA_CHECK_UPDATE, async () => {
    try {
      return { success: true, data: await checkOllamaUpdate() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_OLLAMA_UPDATE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    try {
      await updateOllama((percent) => {
        win?.webContents.send(IPC_CHANNELS.AI_OLLAMA_PROGRESS, {
          type: 'ollama-update',
          percent
        })
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_DELETE_MODEL, async (_event, model: string) => {
    try {
      await deleteModel(model)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ── AI Vision / Map Analysis ──

  ipcMain.handle(IPC_CHANNELS.AI_CAPTURE_MAP, async () => {
    try {
      const buffer = await captureMapScreenshot()
      if (!buffer) return { success: false, error: 'No window available' }
      return { success: true, data: buffer.toString('base64') }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(IPC_CHANNELS.AI_ANALYZE_MAP, async (_event, gameState: Record<string, unknown>) => {
    try {
      return await analyzeMapState(gameState as MapStateForVisionAnalysis)
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ── AI Proactive Triggers ──

  ipcMain.handle(IPC_CHANNELS.AI_TRIGGER_STATE_UPDATE, async (_event, state: Record<string, unknown>) => {
    try {
      const results = processStateUpdate(state as GameStateSnapshot)
      return { success: true, fired: results }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ── BMO Pi Bridge ──

  ipcMain.handle(IPC_CHANNELS.BMO_START_DM, async (_e, campaignId: string) => {
    return startDiscordDm(campaignId)
  })

  ipcMain.handle(IPC_CHANNELS.BMO_STOP_DM, async () => {
    return stopDiscordDm()
  })

  ipcMain.handle(IPC_CHANNELS.BMO_NARRATE, async (_e, text: string, npc?: string, emotion?: string) => {
    return sendNarration(text, npc, emotion)
  })

  ipcMain.handle(IPC_CHANNELS.BMO_STATUS, async () => {
    return getDmStatus()
  })
}
