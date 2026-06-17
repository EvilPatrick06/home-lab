import { app, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { z } from 'zod'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import {
  AiChatRequestSchema,
  AiConfigSchema,
  BmoNarrateRequestSchema,
  ConversationDataSchema,
  NarrationEnabledSchema,
  type ValidatedAiChatRequest,
  type ValidatedAiConfig,
  VoiceCastGetSchema,
  VoiceCastResetSchema,
  VoiceCastSetSchema
} from '../../shared/ipc-schemas'
import { isValidUUID } from '../../shared/utils/uuid'
import { validateStatChanges } from '../ai/ai-schemas'
import type { AiConnectionStatus, StreamResult } from '../ai/ai-service'
import * as aiService from '../ai/ai-service'
import {
  type GameStateSnapshot,
  isTriggerObserverEnabled,
  processStateUpdate,
  setTriggerObserverEnabled
} from '../ai/ai-trigger-observer'
import { analyzeMapState, type MapStateForVisionAnalysis } from '../ai/ai-vision'
import { setClaudeApiKey } from '../ai/claude-client'
import { buildContext, getLastTokenBreakdown } from '../ai/context-builder'
import type { DmAction } from '../ai/dm-actions'
import { setGeminiApiKey } from '../ai/gemini-client'
import type { AiProviderType } from '../ai/llm-provider'
import { type CombatState, getMemoryManager, type WorldState } from '../ai/memory-manager'
import {
  CURATED_MODELS,
  type CuratedModel,
  checkOllamaUpdate,
  deleteModel,
  detectOllama,
  downloadOllama,
  ensureOllamaUsesDedicatedGpu,
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
import { setOpenAIApiKey } from '../ai/openai-client'
import { getProvider } from '../ai/provider-registry'
import { getActiveContextWindow, getEffectiveBudgets } from '../ai/token-budget'
import type {
  AiChatRequest,
  AiConfig,
  AiIndexProgress,
  AiStreamChunk,
  AiStreamDone,
  AiStreamError,
  MutationResult,
  StatChange
} from '../ai/types'
import {
  cancelNarration,
  getDmStatus,
  getVoiceCast,
  resetVoiceCast,
  sendNarration,
  setBargeInEnabled,
  setNarrationEnabled,
  setVoiceCast,
  startDiscordDm,
  stopDiscordDm
} from '../bmo-bridge'
import { logToFile } from '../log'
import { deleteConversation, loadConversation, saveConversation } from '../storage/ai-conversation-storage'
import { handle, withArgsSchema } from './_safe'

// Ensure imported types are used for type-safety
type _ValidatedAiChatRequest = ValidatedAiChatRequest
type _ValidatedAiConfig = ValidatedAiConfig
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

/**
 * Phase 17b (NET-2/NET-3) — `win.webContents.send` throws "Object has been destroyed" if the
 * window closed mid-stream (optional chaining on `win?.` does NOT catch a destroyed-but-present
 * window). Guard `isDestroyed()` before touching `webContents`.
 */
function sendToWindow(win: BrowserWindow | null | undefined, channel: string, payload: unknown): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload)
}

/**
 * Phase 17a (NET-1) — campaign ids flow straight into `path.join(userData, 'campaigns', id, …)`
 * for several handlers, one of which (`AI_CLEAR_MEMORY`) does `fs.rm({ recursive, force })`.
 * An id of `../../..` would be a directory-deletion vector. Campaign ids are always UUIDs, so
 * reject anything that isn't, AND assert the resolved path stays under the campaigns root
 * (defense-in-depth). Throws on hostile input — handlers surface it as an error envelope.
 */
const CAMPAIGN_ID_RE = /^[a-f0-9-]{36}$/i
function sanitizeCampaignId(id: unknown): string {
  if (typeof id !== 'string' || !CAMPAIGN_ID_RE.test(id)) {
    throw new Error('Invalid campaignId')
  }
  const base = path.join(app.getPath('userData'), 'campaigns')
  const resolved = path.resolve(base, id)
  if (resolved !== path.join(base, id) || !resolved.startsWith(base + path.sep)) {
    throw new Error('Invalid campaignId')
  }
  return id
}

export function registerAiHandlers(): void {
  // ── Configuration ──

  handle(IPC_CHANNELS.AI_CONFIGURE, async (_event, config: AiConfig) => {
    const parsed = AiConfigSchema.safeParse(config)
    if (!parsed.success) {
      return { success: false, error: `Invalid config: ${parsed.error.issues[0]?.message}` }
    }
    // Phase 17f (TYP-3) — use the Zod-narrowed value, not the raw input.
    // Phase 17d (NET-10) — configure is now async (non-blocking atomic write).
    await aiService.configure(parsed.data)
    // When the local provider is selected, make sure Ollama is on the dedicated GPU
    // (restart it off the integrated/Vulkan device once if needed) before the AI runs.
    if (parsed.data.provider === 'ollama') {
      await ensureOllamaUsesDedicatedGpu().catch(() => {})
    }
    return { success: true }
  })

  handle(IPC_CHANNELS.AI_GET_CONFIG, async () => {
    return aiService.getConfig()
  })

  handle(IPC_CHANNELS.AI_CHECK_PROVIDERS, async () => {
    return await aiService.checkProviders()
  })

  // ── Cloud Provider Models ──

  handle(IPC_CHANNELS.AI_LIST_CLOUD_MODELS, async (_event, providerType: string, apiKey?: string) => {
    const cloudTypes: AiProviderType[] = ['claude', 'openai', 'gemini']
    if (!cloudTypes.includes(providerType as AiProviderType)) return []

    // Apply the key the user is currently entering (may be unsaved) so the live
    // list reflects their account. validateApiKey/configure do the same; a save
    // re-applies the persisted key. With no key, listModels returns [] — there's
    // no hardcoded fallback snapshot, so the picker stays empty until a valid key
    // is supplied (the renderer re-runs this when the key field changes).
    if (apiKey) {
      if (providerType === 'claude') setClaudeApiKey(apiKey)
      else if (providerType === 'openai') setOpenAIApiKey(apiKey)
      else if (providerType === 'gemini') setGeminiApiKey(apiKey)
    }

    const ids = await getProvider(providerType as AiProviderType).listModels()
    return ids.map((id) => ({ id, name: id }))
  })

  handle(IPC_CHANNELS.AI_VALIDATE_API_KEY, async (_event, providerType: string, apiKey: string) => {
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

  handle(IPC_CHANNELS.AI_BUILD_INDEX, async (event) => {
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
        sendToWindow(win, IPC_CHANNELS.AI_INDEX_PROGRESS, { percent, stage })
      })
      return { success: true, chunkCount: result.chunkCount }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  handle(IPC_CHANNELS.AI_LOAD_INDEX, async () => {
    return aiService.loadIndex()
  })

  handle(IPC_CHANNELS.AI_GET_CHUNK_COUNT, async () => {
    return aiService.getChunkCount()
  })

  // ── Streaming Chat ──

  handle(IPC_CHANNELS.AI_CHAT_STREAM, async (event, request: AiChatRequest) => {
    const parsed = AiChatRequestSchema.safeParse(request)
    if (!parsed.success) {
      return { success: false, error: `Invalid request: ${parsed.error.issues[0]?.message}` }
    }
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'No window found' }

    const streamId = aiService.startChat(
      // Phase 17f (TYP-3/NET-19) — forward the Zod-narrowed request, not the raw input.
      parsed.data,
      // onChunk
      (text) => {
        sendToWindow(win, IPC_CHANNELS.AI_STREAM_CHUNK, { streamId, text })
      },
      // onDone
      (fullText, displayText, statChanges, dmActions, ruleCitations) => {
        sendToWindow(win, IPC_CHANNELS.AI_STREAM_DONE, {
          streamId,
          fullText,
          displayText,
          statChanges,
          dmActions,
          ruleCitations,
          // PHASE-14 14C — surface the truncation/estimate the manager already computed for this
          // campaign's final getMessagesForApi assembly (read-only getters; restreams re-set them).
          contextTruncated: aiService.wasContextTruncated(parsed.data.campaignId),
          tokenEstimate: aiService.getLastTokenEstimate(parsed.data.campaignId)
        })
      },
      // onError
      (error) => {
        sendToWindow(win, IPC_CHANNELS.AI_STREAM_ERROR, { streamId, error })
      }
    )

    return { success: true, streamId }
  })

  handle(IPC_CHANNELS.AI_CANCEL_STREAM, async (_event, streamId: string) => {
    aiService.cancelChat(streamId)
    return { success: true }
  })

  handle(IPC_CHANNELS.AI_WEB_SEARCH_APPROVE, async (_event, streamId: string, approved: boolean) => {
    if (typeof streamId !== 'string') {
      return { success: false, error: 'Invalid streamId' }
    }
    if (typeof approved !== 'boolean') {
      return { success: false, error: 'Invalid approval value' }
    }
    return aiService.approveWebSearch(streamId, approved)
  })

  // ── Stat Mutations ──

  handle(IPC_CHANNELS.AI_APPLY_MUTATIONS, async (_event, characterId: string, changes: StatChange[]) => {
    // PHASE-02 02C — validate the IPC boundary (any renderer frame can reach
    // ipcMain). Reject a non-UUID id and zod-validate every change so a malformed
    // payload (NaN/Infinity/wrong type) can't poison character numerics on disk.
    if (typeof characterId !== 'string' || !isValidUUID(characterId)) {
      return { applied: [], rejected: [] } satisfies MutationResult
    }
    const input = Array.isArray(changes) ? changes : []
    if (input.length > 100) {
      // Cheap DoS hygiene — a legitimate batch is never this large.
      return { applied: [], rejected: [] } satisfies MutationResult
    }
    const { valid, issues } = validateStatChanges(input)
    const schemaRejects: MutationResult['rejected'] = issues.map((iss) => ({
      // boundary: schema-invalid raw input echoed back for the DM alert; never applied.
      change: iss.input as StatChange,
      reason: `schema: ${iss.errors.join('; ')}`
    }))

    // Log human-readable descriptions of each VALID mutation
    for (const change of valid) {
      const desc = aiService.describeChange(change)
      const isNeg = aiService.isNegativeChange(change)
      if (isNeg) {
        logToFile('warn', `[AI Mutation] ${characterId}: ${desc} (negative)`)
      } else {
        logToFile('info', `[AI Mutation] ${characterId}: ${desc}`)
      }
    }
    const result = await aiService.applyMutations(characterId, valid as StatChange[])
    return { applied: result.applied, rejected: [...result.rejected, ...schemaRejects] } satisfies MutationResult
  })

  handle(IPC_CHANNELS.AI_LONG_REST, async (_event, characterId: string) => {
    logToFile('info', `[AI Mutation] ${characterId}: long rest`)
    return await aiService.applyLongRestMutations(characterId)
  })

  handle(IPC_CHANNELS.AI_SHORT_REST, async (_event, characterId: string) => {
    logToFile('info', `[AI Mutation] ${characterId}: short rest`)
    return await aiService.applyShortRestMutations(characterId)
  })

  // ── Scene Preparation ──

  handle(IPC_CHANNELS.AI_PREPARE_SCENE, async (_event, campaignId: string, characterIds: string[]) => {
    // PHASE-13 13A — prepareScene ends in a conversation auto-save under campaigns/<id>/;
    // reject a path-traversal id before any filesystem reach (the _safe wrapper surfaces the throw).
    sanitizeCampaignId(campaignId)
    const streamId = aiService.prepareScene(campaignId, characterIds)
    return { success: true, streamId }
  })

  handle(IPC_CHANNELS.AI_GET_SCENE_STATUS, async (_event, campaignId: string) => {
    sanitizeCampaignId(campaignId) // PHASE-13 13A — uniform campaignId validation (defense-in-depth)
    return aiService.getSceneStatus(campaignId)
  })

  handle(IPC_CHANNELS.AI_CANCEL_SCENE, async (_event, campaignId: string) => {
    try {
      // cancelScenePrep can write the conversation file — validate the id like the
      // conversation/memory handlers do.
      return aiService.cancelScenePrep(sanitizeCampaignId(campaignId))
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // PHASE-14 14A — connection-status invoke (the "consumer introduced" the Phase 17d removal
  // comment anticipated). Seeds the renderer badge; transitions arrive via AI_CONNECTION_STATUS_CHANGED.
  handle(
    IPC_CHANNELS.AI_CONNECTION_STATUS,
    async (): Promise<{ status: AiConnectionStatus; consecutiveFailures: number }> => ({
      status: aiService.getConnectionStatus(),
      consecutiveFailures: aiService.getConsecutiveFailures()
    })
  )

  handle(IPC_CHANNELS.AI_TOKEN_BUDGET, async (_event, campaignId?: string) => {
    return getLastTokenBreakdown(typeof campaignId === 'string' ? campaignId : undefined)
  })

  // PHASE-14 14E — composed context snapshot for the DM Context Inspector: per-section tokens of
  // the last LIVE build (null if none yet), truthful truncation flag + last token estimate, the
  // active context window + conversation budget, and the last assistant turn's chunk-id provenance.
  handle(IPC_CHANNELS.AI_GET_CONTEXT_INSPECTOR, async (_event, campaignId: string) => {
    sanitizeCampaignId(campaignId) // path-traversal guard from day one (PHASE-14 dep note vs PHASE-13)
    return {
      breakdown: getLastTokenBreakdown(campaignId),
      contextTruncated: aiService.wasContextTruncated(campaignId),
      lastTokenEstimate: aiService.getLastTokenEstimate(campaignId),
      contextWindow: getActiveContextWindow(),
      conversationBudget: getEffectiveBudgets().conversationHistory,
      chunkIds: aiService.getLastAssistantContextChunkIds(campaignId)
    }
  })

  // PHASE-10 10C — the chat token meter's max. `conversationBudget` is the slice of the
  // window the conversation actually competes for (getEffectiveBudgets().conversationHistory);
  // `contextWindow` is the active window. NOTE: before the first Ollama stream of a session
  // the window is the cloud default, so this is the raw/unscaled budget — it tightens to the
  // scaled value after the first stream sets the window. That is honest "best current knowledge".
  handle(IPC_CHANNELS.AI_GET_TOKEN_METER, async () => {
    return {
      conversationBudget: getEffectiveBudgets().conversationHistory,
      contextWindow: getActiveContextWindow()
    }
  })

  handle(IPC_CHANNELS.AI_TOKEN_BUDGET_PREVIEW, async (_event, campaignId: string, characterIds: string[]) => {
    // Build context without sending a message — return THIS build's breakdown without recording
    // it, so a preview can't clobber a live stream's per-campaign breakdown. (07A / F4)
    try {
      sanitizeCampaignId(campaignId) // PHASE-13 13A — buildContext reads memory files under campaigns/<id>/
      const built = await buildContext('preview query for token budget', characterIds, campaignId)
      return built.breakdown
    } catch {
      return null
    }
  })

  handle(IPC_CHANNELS.AI_GENERATE_END_OF_SESSION_RECAP, async (_event, campaignId: string) => {
    try {
      sanitizeCampaignId(campaignId) // PHASE-13 13A — generateSessionSummary reads/writes the conversation file
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

  handle(IPC_CHANNELS.AI_SAVE_CONVERSATION, async (_event, campaignId: string) => {
    sanitizeCampaignId(campaignId)
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

  handle(IPC_CHANNELS.AI_RESTORE_CONVERSATION, async (_event, campaignId: string, data: Record<string, unknown>) => {
    sanitizeCampaignId(campaignId)
    // Validate at the IPC boundary — a crafted .dndbackup must not write arbitrary JSON. (07E)
    const parsed = ConversationDataSchema.safeParse(data)
    if (!parsed.success) {
      return { success: false, error: `Invalid conversation data: ${parsed.error.issues[0]?.message}` }
    }
    // A stream completing after this write would auto-save the stale in-memory manager over the
    // imported file (ai-service stream-completion auto-save) — cancel any in-flight stream first.
    aiService.cancelStreamsForCampaign(campaignId)
    const result = await saveConversation(campaignId, parsed.data)
    if (!result.success) return { success: false, error: result.error }
    // Write-through: refresh the cached manager so memory and disk agree immediately. (07E / F1)
    aiService.getConversationManager(campaignId).restore(parsed.data)
    return { success: true }
  })

  handle(IPC_CHANNELS.AI_LOAD_CONVERSATION, async (_event, campaignId: string) => {
    sanitizeCampaignId(campaignId)
    const result = await loadConversation(campaignId)
    if (result.success && result.data) {
      // Don't clobber an in-flight stream's in-memory conversation with disk state (the stream
      // holds the live pending user/assistant turn). Still return the disk data either way. (07D)
      if (aiService.hasActiveStreamForCampaign(campaignId)) {
        logToFile(
          'warn',
          `[AI] AI_LOAD_CONVERSATION: stream in flight for ${campaignId}; returning disk data without in-memory restore`
        )
      } else {
        aiService.getConversationManager(campaignId).restore(result.data)
      }
      return { success: true, data: result.data }
    }
    return { success: false, error: result.error }
  })

  // Read-only load for export: disk only — never instantiates or restores a ConversationManager
  // (CQS — a query must not mutate state). (07D)
  handle(IPC_CHANNELS.AI_PEEK_CONVERSATION, async (_event, campaignId: string) => {
    sanitizeCampaignId(campaignId)
    return await loadConversation(campaignId)
  })

  handle(IPC_CHANNELS.AI_DELETE_CONVERSATION, async (_event, campaignId: string) => {
    sanitizeCampaignId(campaignId)
    const result = await deleteConversation(campaignId)
    if (!result.success) return { success: false, error: result.error }
    return { success: true }
  })

  // ── Memory Files ──

  handle(IPC_CHANNELS.AI_LIST_MEMORY_FILES, async (_event, campaignId: string) => {
    sanitizeCampaignId(campaignId)
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

  handle(IPC_CHANNELS.AI_READ_MEMORY_FILE, async (_event, campaignId: string, fileName: string) => {
    sanitizeCampaignId(campaignId)
    // Prevent directory traversal
    const normalized = path.normalize(fileName)
    if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
      throw new Error('Invalid file name')
    }
    const filePath = path.join(app.getPath('userData'), 'campaigns', campaignId, 'ai-context', normalized)
    return await fs.readFile(filePath, 'utf-8')
  })

  handle(IPC_CHANNELS.AI_CLEAR_MEMORY, async (_event, campaignId: string) => {
    sanitizeCampaignId(campaignId)
    const memoryDir = path.join(app.getPath('userData'), 'campaigns', campaignId, 'ai-context')
    try {
      await fs.rm(memoryDir, { recursive: true, force: true })
    } catch {
      // Directory may not exist — that's fine
    }
  })

  // ── Live State Sync ──

  handle(IPC_CHANNELS.AI_SYNC_WORLD_STATE, async (_event, campaignId: string, state: Record<string, unknown>) => {
    try {
      sanitizeCampaignId(campaignId) // PHASE-13 13A — reject path-traversal ids before the filesystem path.join
      const memMgr = getMemoryManager(campaignId)
      await memMgr.updateWorldState(state as Partial<WorldState>)
      return { success: true }
    } catch (error) {
      logToFile('error', `[AI Memory] Failed to sync world state: ${(error as Error).message}`)
      return { success: false, error: (error as Error).message }
    }
  })

  handle(IPC_CHANNELS.AI_SYNC_COMBAT_STATE, async (_event, campaignId: string, state: Record<string, unknown>) => {
    try {
      sanitizeCampaignId(campaignId) // PHASE-13 13A — reject path-traversal ids before the filesystem path.join
      const memMgr = getMemoryManager(campaignId)
      // IPC boundary: renderer payload is type-erased Record; assert the domain shape.
      await memMgr.updateCombatState(state as unknown as CombatState)
      return { success: true }
    } catch (error) {
      logToFile('error', `[AI Memory] Failed to sync combat state: ${(error as Error).message}`)
      return { success: false, error: (error as Error).message }
    }
  })

  // ── NPC Relationship Tracking ──

  handle(
    IPC_CHANNELS.AI_LOG_NPC_INTERACTION,
    async (_event, campaignId: string, npcName: string, summary: string, attitudeAfter: string) => {
      const validAttitudes = ['friendly', 'neutral', 'hostile'] as const
      if (!validAttitudes.includes(attitudeAfter as (typeof validAttitudes)[number])) {
        return { success: false, error: `Invalid attitude: ${attitudeAfter}` }
      }
      sanitizeCampaignId(campaignId) // PHASE-13 13A — reject path-traversal ids before the filesystem path.join
      const memMgr = getMemoryManager(campaignId)
      await memMgr.logNpcInteraction(npcName, summary, attitudeAfter as 'friendly' | 'neutral' | 'hostile')
      return { success: true }
    }
  )

  handle(
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
      sanitizeCampaignId(campaignId) // PHASE-13 13A — reject path-traversal ids before the filesystem path.join
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

  handle(
    IPC_CHANNELS.AI_SET_NPC_FIELDS,
    async (
      _event,
      campaignId: string,
      npcName: string,
      fields: { faction?: string; location?: string; secretMotivation?: string }
    ) => {
      sanitizeCampaignId(campaignId) // PHASE-13 13A — reject path-traversal ids before the filesystem path.join
      const memMgr = getMemoryManager(campaignId)
      await memMgr.updateNpcFields(npcName, fields)
      return { success: true }
    }
  )

  handle(
    IPC_CHANNELS.AI_UPDATE_QUEST_LOG,
    async (
      _event,
      campaignId: string,
      operation: 'add' | 'update' | 'complete' | 'remove',
      name: string,
      description?: string
    ) => {
      const validOps = ['add', 'update', 'complete', 'remove'] as const
      if (!validOps.includes(operation)) return { success: false, error: `Invalid quest operation: ${operation}` }
      sanitizeCampaignId(campaignId) // PHASE-13 13A — reject path-traversal ids before the filesystem path.join
      const memMgr = getMemoryManager(campaignId)
      await memMgr.updateQuestLog(operation, name, description)
      return { success: true }
    }
  )

  handle(
    IPC_CHANNELS.AI_ADJUST_FACTION_STANDING,
    async (_event, campaignId: string, factionName: string, delta: number) => {
      sanitizeCampaignId(campaignId) // PHASE-13 13A — reject path-traversal ids before the filesystem path.join
      const memMgr = getMemoryManager(campaignId)
      await memMgr.adjustFactionReputation(factionName, delta)
      return { success: true }
    }
  )

  // ── Ollama Management ──

  handle(IPC_CHANNELS.AI_DETECT_OLLAMA, async () => {
    return await detectOllama()
  })

  handle(IPC_CHANNELS.AI_GET_VRAM, async () => {
    return await getSystemVram()
  })

  handle(IPC_CHANNELS.AI_DOWNLOAD_OLLAMA, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    try {
      const path = await downloadOllama((percent) => {
        sendToWindow(win, IPC_CHANNELS.AI_OLLAMA_PROGRESS, { type: 'download', percent })
      })
      return { success: true, path }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  handle(IPC_CHANNELS.AI_INSTALL_OLLAMA, async (_event, installerPath: string) => {
    try {
      await installOllama(installerPath)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  handle(IPC_CHANNELS.AI_START_OLLAMA, async () => {
    try {
      await startOllama()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  handle(IPC_CHANNELS.AI_PULL_MODEL, async (event, model: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    try {
      await pullModel(model, (percent) => {
        sendToWindow(win, IPC_CHANNELS.AI_OLLAMA_PROGRESS, { type: 'pull', percent })
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  handle(IPC_CHANNELS.AI_GET_CURATED_MODELS, async () => {
    return CURATED_MODELS
  })

  handle(IPC_CHANNELS.AI_LIST_INSTALLED_MODELS, async () => {
    return await listInstalledModels()
  })

  handle(IPC_CHANNELS.AI_LIST_INSTALLED_MODELS_DETAILED, async () => {
    return await listInstalledModelsDetailed()
  })

  handle(IPC_CHANNELS.AI_OLLAMA_CHECK_UPDATE, async () => {
    try {
      return { success: true, data: await checkOllamaUpdate() }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  handle(IPC_CHANNELS.AI_OLLAMA_UPDATE, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    try {
      await updateOllama((percent) => {
        sendToWindow(win, IPC_CHANNELS.AI_OLLAMA_PROGRESS, {
          type: 'ollama-update',
          percent
        })
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  handle(IPC_CHANNELS.AI_DELETE_MODEL, async (_event, model: string) => {
    try {
      await deleteModel(model)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ── AI Vision / Map Analysis (text-only — PHASE-11 11H) ──

  handle(IPC_CHANNELS.AI_ANALYZE_MAP, async (_event, gameState: Record<string, unknown>) => {
    try {
      return await analyzeMapState(gameState as MapStateForVisionAnalysis)
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // ── AI Proactive Triggers ──

  handle(IPC_CHANNELS.AI_TRIGGER_STATE_UPDATE, async (_event, state: Record<string, unknown>) => {
    try {
      // IPC boundary: renderer payload is type-erased Record; assert the domain shape.
      const results = processStateUpdate(state as unknown as GameStateSnapshot)
      return { success: true, fired: results }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // PHASE-13 13D — the DM-facing kill switch for all proactive trigger processing.
  handle(
    IPC_CHANNELS.AI_TRIGGER_SET_ENABLED,
    withArgsSchema(IPC_CHANNELS.AI_TRIGGER_SET_ENABLED, z.tuple([z.boolean()]), (_event, enabled) => {
      setTriggerObserverEnabled(enabled)
      return { enabled: isTriggerObserverEnabled() }
    })
  )

  handle(IPC_CHANNELS.AI_TRIGGER_GET_ENABLED, async () => {
    return { enabled: isTriggerObserverEnabled() }
  })

  // ── BMO Pi Bridge ──

  handle(IPC_CHANNELS.BMO_START_DM, async (_e, campaignId: string) => {
    return startDiscordDm(campaignId)
  })

  handle(IPC_CHANNELS.BMO_STOP_DM, async () => {
    return stopDiscordDm()
  })

  // PHASE-21 21B: single payload object, zod-validated at the boundary.
  handle(IPC_CHANNELS.BMO_NARRATE, async (_e, payload: unknown) => {
    const parsed = BmoNarrateRequestSchema.safeParse(payload)
    if (!parsed.success) return { ok: false, error: 'invalid narrate payload' }
    const { text, ...opts } = parsed.data
    return sendNarration(text, opts)
  })

  handle(IPC_CHANNELS.BMO_NARRATE_CANCEL, async () => {
    return cancelNarration()
  })

  handle(IPC_CHANNELS.BMO_STATUS, async () => {
    return getDmStatus()
  })

  // PHASE-20 20F: renderer pushes the Speak-narration toggle value here so the
  // single main-process narration gate matches the UI (default OFF).
  handle(IPC_CHANNELS.BMO_SET_NARRATION_ENABLED, async (_e, enabled: unknown) => {
    setNarrationEnabled(NarrationEnabledSchema.parse(enabled))
    return { success: true }
  })

  // PHASE-21 21B: renderer pushes the barge-in toggle (default OFF).
  handle(IPC_CHANNELS.BMO_SET_BARGE_IN_ENABLED, async (_e, enabled: unknown) => {
    setBargeInEnabled(NarrationEnabledSchema.parse(enabled))
    return { success: true }
  })

  // PHASE-21 21C: per-NPC voice-cast management (zod-validated at the boundary).
  handle(IPC_CHANNELS.BMO_VOICE_CAST_GET, async (_e, payload: unknown) => {
    const parsed = VoiceCastGetSchema.safeParse(payload)
    if (!parsed.success) return { ok: false, error: 'invalid voice-cast get payload' }
    return getVoiceCast(parsed.data.campaignId)
  })

  handle(IPC_CHANNELS.BMO_VOICE_CAST_SET, async (_e, payload: unknown) => {
    const parsed = VoiceCastSetSchema.safeParse(payload)
    if (!parsed.success) return { ok: false, error: 'invalid voice-cast set payload' }
    return setVoiceCast(parsed.data)
  })

  handle(IPC_CHANNELS.BMO_VOICE_CAST_RESET, async (_e, payload: unknown) => {
    const parsed = VoiceCastResetSchema.safeParse(payload)
    if (!parsed.success) return { ok: false, error: 'invalid voice-cast reset payload' }
    return resetVoiceCast(parsed.data.campaignId, parsed.data.speaker)
  })
}
