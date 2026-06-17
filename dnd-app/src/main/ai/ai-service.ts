import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { DEFAULT_AI_MODEL } from '../../shared/ai-defaults'
import { SCENE_PREP_PROMPT, WEB_SEARCH_APPROVAL_TIMEOUT_MS } from '../../shared/constants'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { BmoNarrationStatusSchema } from '../../shared/ipc-schemas'
import { cancelNarration, isBargeInEnabled, isNarrationEnabled, sendNarration } from '../bmo-bridge'
import { sendNarrationToDiscord } from '../discord-integration'
import { logToFile } from '../log'
import { logSecurityEvent } from '../security-log'
import { saveConversation } from '../storage/ai-conversation-storage'
import { atomicWriteFile } from '../storage/atomic-write'
import { decryptOptional, encryptOptional } from '../storage/safe-secret-storage'
import {
  parseRuleCitations,
  parseRulings,
  parseVoiceTags,
  stripRuleCitations,
  stripRulings,
  stripVoiceTags
} from './ai-response-parser'
import { loadCampaignById } from './campaign-context'

// PHASE-20 20F: broadcast a narrate-failure status to every renderer window so
// the DM tab can surface it (the renderer dedups). Validated before send.
function broadcastNarrationStatus(res: {
  ok?: boolean
  result?: unknown
  error?: unknown
  statusCode?: unknown
}): void {
  const payload = BmoNarrationStatusSchema.safeParse({
    ok: res.ok === true,
    result: typeof res.result === 'string' ? res.result : undefined,
    error: typeof res.error === 'string' ? res.error : undefined,
    statusCode: typeof res.statusCode === 'number' ? res.statusCode : undefined
  })
  if (!payload.success) return
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.BMO_NARRATION_STATUS, payload.data)
  }
}

// PHASE-08 08D — these were the only live consumers of the now-deleted dead stream-handler
// module, which carried a duplicate of the stream-completion pipeline. Defined locally.
interface PendingWebSearchApproval {
  resolve: (approved: boolean) => void
  timeout: ReturnType<typeof setTimeout>
  onAbort: () => void
  signal: AbortSignal
}
interface StreamHandlerDeps {
  activeStreams: Map<string, AbortController>
  model: string
  streamChat: (
    systemPrompt: string,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    model: string,
    abortSignal?: AbortSignal
  ) => Promise<void>
  streamWithRetry: (
    streamFn: (signal: AbortSignal) => Promise<void>,
    abortController: AbortController,
    onError: (error: string) => void
  ) => Promise<void>
}

import { buildChunkIndex, loadChunkIndex } from './chunk-builder'
import {
  buildContext,
  clearTokenBreakdown,
  recordTokenBreakdown,
  setRetrievalOptsProvider,
  setSearchEngine
} from './context-builder'
import { ConversationManager } from './conversation-manager'
import { hasOrphanDmActionsTag, parseDmActionsDetailed, stripDmActions } from './dm-actions'
import { DEFAULT_EMBEDDING_MODEL } from './embedding-client'
import { clearEmbeddingIndex, ensureEmbeddingIndex, getEmbedIndexStatus } from './embedding-index'
import {
  FILE_READ_MAX_DEPTH,
  type FileReadRequest,
  formatFileContent,
  hasFileReadTag,
  parseFileRead,
  readRequestedFile,
  stripFileRead
} from './file-reader'
import { buildGameStateSnapshot, dedupeStatChanges, validateAgainstGameState } from './game-state-validation'
import type { AiProviderType, LLMProvider } from './llm-provider'
import { getMemoryManager, npcMemoryFromAttitude } from './memory-manager'
import { fetchOllamaModels, getOllamaUrl, isOllamaRunning, listOllamaModels, setOllamaUrl } from './ollama-client'
import { resolveNumCtx, setConfiguredContextLength, setOllamaKvCacheType } from './ollama-context'
import { OLLAMA_BASE_URL } from './ollama-manager'
import {
  checkAllProviders,
  configureProviders,
  getActiveProvider,
  getActiveProviderType,
  getProviderContextBlurb
} from './provider-registry'
import { SearchEngine } from './search-engine'
import {
  applyLongRestMutations,
  applyMutations,
  applyShortRestMutations,
  describeChange,
  hasOrphanStatChangesTag,
  isNegativeChange,
  parseStatChangesDetailed,
  stripStatChanges
} from './stat-mutations'
import { runStructuredExtraction } from './structured-extraction'
import { CLOUD_CONTEXT_WINDOW, setActiveContextWindow } from './token-budget'
import { cleanNarrativeText, hasViolations } from './tone-validator'
import type {
  AiChatRequest,
  AiConfig,
  AiIndexProgress,
  AiStreamChunk,
  AiStreamDone,
  AiStreamError,
  ChatMessage,
  ChunkIndex,
  DmActionData,
  ProviderStatus,
  RuleCitation,
  StatChange,
  StreamCallbacks,
  StructuredExtractionMode
} from './types'
import {
  formatSearchResults,
  hasWebSearchTag,
  parseWebSearch,
  performWebSearch,
  stripWebSearch,
  type WebSearchRequest,
  type WebSearchResult
} from './web-search'

// Ensure stream/progress types are used for type-safety
type _AiStreamChunk = AiStreamChunk
type _AiStreamDone = AiStreamDone
type _AiStreamError = AiStreamError
type _AiIndexProgress = AiIndexProgress

// Per-campaign conversation managers
const conversations = new Map<string, ConversationManager>()

// Active stream abort controllers with activity tracking for TTL cleanup
const activeStreams = new Map<string, AbortController>()
const activeStreamTimestamps = new Map<string, number>()
const activeStreamLastHeartbeat = new Map<string, number>()
// streamId → campaignId, so the persistence layer can ask "is a stream running for campaign X"
// (the maps above are streamId-keyed only). (PHASE-07 07D)
const activeStreamCampaigns = new Map<string, string>()
const STREAM_TTL_MS = 10 * 60 * 1000 // 10 minutes base TTL
const STREAM_MAX_TTL_MS = 30 * 60 * 1000 // 30 minutes max TTL (hard ceiling)
const HEARTBEAT_WINDOW_MS = 5 * 60 * 1000 // Extend TTL when activity within last 5 minutes

function removeStream(streamId: string): void {
  activeStreams.delete(streamId)
  activeStreamTimestamps.delete(streamId)
  activeStreamLastHeartbeat.delete(streamId)
  activeStreamCampaigns.delete(streamId)
}

/** Number of currently registered streams (test/observability hook — PHASE-05 05E). */
export function getActiveStreamCount(): number {
  return activeStreams.size
}

/** True if any active stream belongs to the given campaign. (PHASE-07 07D) */
export function hasActiveStreamForCampaign(campaignId: string): boolean {
  for (const cid of activeStreamCampaigns.values()) if (cid === campaignId) return true
  return false
}

/** Abort every active stream for a campaign. Returns how many were cancelled. (PHASE-07 07D) */
export function cancelStreamsForCampaign(campaignId: string): number {
  let n = 0
  for (const [streamId, cid] of activeStreamCampaigns) {
    if (cid === campaignId) {
      cancelChat(streamId)
      n++
    }
  }
  return n
}

/** Update the heartbeat for an active stream to extend its TTL */
function updateStreamHeartbeat(streamId: string): void {
  if (activeStreamLastHeartbeat.has(streamId)) {
    activeStreamLastHeartbeat.set(streamId, Date.now())
  }
}

/** Calculate effective TTL for a stream based on creation time and activity */
function getEffectiveTTL(streamId: string): number {
  const createdAt = activeStreamTimestamps.get(streamId) || Date.now()
  const lastHeartbeat = activeStreamLastHeartbeat.get(streamId) || createdAt
  const totalAge = Date.now() - createdAt

  // If there's been recent activity, extend TTL
  const timeSinceLastActivity = Date.now() - lastHeartbeat
  if (timeSinceLastActivity < HEARTBEAT_WINDOW_MS) {
    // Extend TTL by HEARTBEAT_WINDOW_MS, but don't exceed max
    const extendedTTL = Math.min(totalAge + HEARTBEAT_WINDOW_MS + STREAM_TTL_MS, STREAM_MAX_TTL_MS)
    return extendedTTL
  }

  return STREAM_TTL_MS
}

// Periodically clean up stale streams.
// Phase 22b — this interval is module-scoped and survives renderer reloads;
// hold the handle and clear it on Electron `will-quit` (via disposeAiService,
// called from the main quit path) so it isn't orphaned.
const staleStreamSweep = setInterval(() => {
  const now = Date.now()
  for (const [streamId, timestamp] of activeStreamTimestamps) {
    const effectiveTTL = getEffectiveTTL(streamId)
    if (now - timestamp > effectiveTTL) {
      const controller = activeStreams.get(streamId)
      if (controller) controller.abort()
      removeStream(streamId)
    }
  }
}, 60_000)

const pendingWebSearchApprovals = new Map<string, PendingWebSearchApproval>()
const WEB_SEARCH_DENIED_MESSAGE =
  '[WEB SEARCH DENIED]\nThe requested web search was not approved. Continue responding using existing campaign and rulebook context only.\n[/WEB SEARCH DENIED]'

// Scene preparation status per campaign. `error` carries the failure reason so the
// lobby can show it (S-2) instead of a bare "Scene prep failed".
const scenePrepStatus = new Map<
  string,
  { status: 'preparing' | 'ready' | 'error'; streamId: string | null; error?: string }
>()

// ── AI Retry & Connection Status ──

let consecutiveFailures = 0
const MAX_RETRY_DELAY_MS = 30_000

export type AiConnectionStatus = 'connected' | 'degraded' | 'disconnected'

export function getConnectionStatus(): AiConnectionStatus {
  if (consecutiveFailures === 0) return 'connected'
  if (consecutiveFailures < 3) return 'degraded'
  return 'disconnected'
}

export function getConsecutiveFailures(): number {
  return consecutiveFailures
}

// PHASE-14 14A — push the derived connection status to the renderer on transition only,
// so the badge needs no polling and steady state generates no traffic.
let lastEmittedConnectionStatus: AiConnectionStatus = 'connected'

/** Broadcast AI_CONNECTION_STATUS_CHANGED when the derived status transitions. */
function notifyConnectionStatusChanged(): void {
  const status = getConnectionStatus()
  if (status === lastEmittedConnectionStatus) return
  lastEmittedConnectionStatus = status
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.AI_CONNECTION_STATUS_CHANGED, {
        status,
        consecutiveFailures: getConsecutiveFailures()
      })
    }
  } catch {
    // Non-fatal: status push is best-effort observability (e.g. windows gone during shutdown).
  }
}

function getRetryDelay(attempt: number): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, ... capped at 30s
  return Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function streamWithRetry(
  streamFn: (signal: AbortSignal) => Promise<void>,
  abortController: AbortController,
  onError: (error: string) => void
): Promise<void> {
  const maxRetries = 2 // Total 3 attempts (1 initial + 2 retries)
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (abortController.signal.aborted) return
    try {
      await streamFn(abortController.signal)
      consecutiveFailures = 0 // Success resets counter
      notifyConnectionStatusChanged()
      return
    } catch (error) {
      consecutiveFailures++
      notifyConnectionStatusChanged()
      const msg = error instanceof Error ? error.message : String(error)

      // Don't retry on abort
      if (abortController.signal.aborted) return

      // Don't retry a timeout: each attempt re-runs the model's prompt prefill from
      // scratch, so retrying a prefill/inactivity timeout just multiplies the wait
      // (3 × the window) without any chance of succeeding. Fail fast instead.
      if (/tim(e|ed)\s*out/i.test(msg)) {
        onError(msg)
        return
      }

      if (attempt < maxRetries) {
        const delay = getRetryDelay(attempt)
        await sleep(delay)
      } else {
        onError(msg)
      }
    }
  }
}

/**
 * Adapt a provider's callback-style streamChat into a promise that REJECTS on
 * failure so `streamWithRetry` can actually retry it. Providers swallow their
 * errors into `callbacks.onError` and then resolve — which made the retry loop
 * dead code (every attempt "succeeded"). Here:
 *   - a failure BEFORE any text was emitted → reject (retryable; nothing was
 *     shown to the user yet, so a clean re-stream won't duplicate output);
 *   - a failure AFTER text has streamed → surface via the terminal onError and
 *     resolve (retrying mid-stream would double already-emitted text);
 *   - an abort (provider returns without firing any callback) → resolve, so the
 *     `signal.aborted` guard in streamWithRetry stops the loop without a retry.
 * onText/onDone are forwarded to the real callbacks unchanged.
 */
export function streamChatRetryable(
  streamChat: LLMProvider['streamChat'],
  systemPrompt: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  model: string
): (signal: AbortSignal) => Promise<void> {
  return (signal: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      let hadText = false
      const wrapped: StreamCallbacks = {
        onText: (text) => {
          hadText = true
          callbacks.onText(text)
        },
        onDone: (text) => {
          callbacks.onDone(text)
          resolve()
        },
        onError: (error) => {
          if (hadText) {
            callbacks.onError(error)
            resolve()
          } else {
            reject(error)
          }
        }
      }
      // `.then(resolve)` covers the abort path (provider returns without firing a
      // callback); `.catch(reject)` covers a thrown rejection. Both are no-ops if
      // onDone/onError already settled the promise.
      streamChat(systemPrompt, messages, wrapped, model, signal).then(resolve, reject)
    })
}

// The single curated default model (recommended local model) used ONLY when no
// model is configured yet. Sourced from the shared ai-defaults module (PHASE-10
// 10A) so renderer + main agree; re-exported here to keep ai-vision.ts's
// `require('./ai-service').DEFAULT_AI_MODEL` and other importers stable.
export { DEFAULT_AI_MODEL }

// Current config
let currentConfig: {
  provider: AiProviderType
  model: string
  ollamaUrl: string
  claudeApiKey?: string
  openaiApiKey?: string
  geminiApiKey?: string
  contextLength?: number
  ollamaKvCacheType?: 'q8_0' | 'q4_0'
  structuredExtraction?: StructuredExtractionMode
  ragEmbeddingsEnabled?: boolean
  ragEmbeddingModel?: string
  ragCampaignDocsEnabled?: boolean
} = {
  provider: 'ollama',
  model: DEFAULT_AI_MODEL,
  ollamaUrl: OLLAMA_BASE_URL
}

/** PHASE-24: retrieval options consumed by context-builder (hybrid + campaign-docs). */
export function getRetrievalOpts(): {
  embeddingsEnabled: boolean
  model: string
  baseUrl: string
  campaignDocsEnabled: boolean
} {
  return {
    embeddingsEnabled: currentConfig.provider === 'ollama' && currentConfig.ragEmbeddingsEnabled === true,
    model: currentConfig.ragEmbeddingModel || DEFAULT_EMBEDDING_MODEL,
    baseUrl: getOllamaUrl(),
    campaignDocsEnabled: currentConfig.ragCampaignDocsEnabled === true
  }
}

/** PHASE-23: current structured-extraction mode (absent ≡ off). Read at use time. */
export function getStructuredExtractionMode(): StructuredExtractionMode {
  return currentConfig.structuredExtraction ?? 'off'
}

let searchEngine: SearchEngine | null = null
let loadedChunkIndex: ChunkIndex | null = null // PHASE-24 24C: kept for embedding builds
let streamCounter = 0

// PHASE-24 24C: progress sender for the embed-index build (wired by ai-handlers).
let embedProgressSender: ((percent: number) => void) | null = null
export function setEmbedProgressSender(fn: ((percent: number) => void) | null): void {
  embedProgressSender = fn
}

/** PHASE-24 24C: kick off (or refresh) the rule-embedding vector store when enabled.
 *  Fire-and-forget; ensureEmbeddingIndex never throws. */
export function maybeStartEmbeddingBuild(): void {
  const opts = getRetrievalOpts()
  if (!opts.embeddingsEnabled || !loadedChunkIndex) return
  const status = getEmbedIndexStatus()
  if (status.status === 'ready' && status.model && status.model !== opts.model) {
    clearEmbeddingIndex() // model changed → rebuild from scratch
  }
  void ensureEmbeddingIndex(loadedChunkIndex, opts.model, opts.baseUrl, (p) => embedProgressSender?.(p))
}

/** PHASE-24 24C: force a rebuild (UI "Rebuild" button). */
export async function rebuildEmbeddingIndex(): Promise<{ success: boolean; error?: string }> {
  const opts = getRetrievalOpts()
  if (!opts.embeddingsEnabled) return { success: false, error: 'Semantic search is disabled' }
  if (!loadedChunkIndex) return { success: false, error: 'Rulebook index not loaded' }
  clearEmbeddingIndex()
  await ensureEmbeddingIndex(loadedChunkIndex, opts.model, opts.baseUrl, (p) => embedProgressSender?.(p))
  return { success: true }
}

export { getEmbedIndexStatus }

/** Build stream handler dependencies for the current config. */
function getStreamDeps(): StreamHandlerDeps {
  const provider = getActiveProvider()
  return {
    activeStreams,
    model: currentConfig.model,
    streamChat: provider.streamChat.bind(provider),
    streamWithRetry
  }
}

function getConfigPath(): string {
  return join(app.getPath('userData'), 'ai-config.json')
}

// ── Config Management ──

/**
 * Phase 20a — reject obviously-malformed cloud API keys before they're saved
 * to disk. Empty/undefined keys are allowed (the user may be clearing one or
 * using Ollama). Throws with a UI-displayable message on a bad format.
 */
export function validateApiKeyFormat(provider: 'claude' | 'openai' | 'gemini', key: string | undefined): void {
  if (!key) return
  switch (provider) {
    case 'claude':
      if (!key.startsWith('sk-ant-')) throw new Error('Invalid Claude API key (expected it to start with "sk-ant-").')
      break
    case 'openai':
      if (!key.startsWith('sk-')) throw new Error('Invalid OpenAI API key (expected it to start with "sk-").')
      break
    case 'gemini':
      if (key.length < 20) throw new Error('Invalid Gemini API key (too short).')
      break
  }
}

export async function configure(config: AiConfig): Promise<void> {
  // Phase 20a — validate key formats up front so a typo'd key is rejected with a
  // clear error (surfaced to the AI settings UI via the IPC error envelope)
  // instead of being silently saved and failing later on first request.
  // Phase 20g — log a malformed-key rejection before rethrowing.
  try {
    validateApiKeyFormat('claude', config.claudeApiKey)
    validateApiKeyFormat('openai', config.openaiApiKey)
    validateApiKeyFormat('gemini', config.geminiApiKey)
  } catch (err) {
    logSecurityEvent('ai.api_key.invalid_format', { error: err instanceof Error ? err.message : String(err) })
    throw err
  }

  currentConfig = {
    provider: config.provider ?? 'ollama',
    // No hardcoded model fallback — an unset model stays empty and is resolved at
    // stream time against the live installed list (resolveOllamaModel), so we never
    // silently pin a model the user hasn't pulled.
    model: config.model || config.ollamaModel || '',
    ollamaUrl: config.ollamaUrl || OLLAMA_BASE_URL,
    claudeApiKey: config.claudeApiKey,
    openaiApiKey: config.openaiApiKey,
    geminiApiKey: config.geminiApiKey,
    contextLength: config.contextLength,
    ollamaKvCacheType: config.ollamaKvCacheType,
    structuredExtraction: config.structuredExtraction,
    ragEmbeddingsEnabled: config.ragEmbeddingsEnabled,
    ragEmbeddingModel: config.ragEmbeddingModel,
    ragCampaignDocsEnabled: config.ragCampaignDocsEnabled
  }

  setConfiguredContextLength(currentConfig.contextLength)
  setOllamaKvCacheType(currentConfig.ollamaKvCacheType)
  setOllamaUrl(currentConfig.ollamaUrl)
  configureProviders({
    provider: currentConfig.provider,
    model: currentConfig.model,
    ollamaUrl: currentConfig.ollamaUrl,
    claudeApiKey: currentConfig.claudeApiKey,
    openaiApiKey: currentConfig.openaiApiKey,
    geminiApiKey: currentConfig.geminiApiKey
  })

  const configPath = getConfigPath()
  // Phase 17d (NET-10) — async atomic write so configure no longer blocks the main process.
  await atomicWriteFile(
    configPath,
    JSON.stringify({
      provider: currentConfig.provider,
      model: currentConfig.model,
      ollamaUrl: currentConfig.ollamaUrl,
      claudeApiKey: encryptOptional(currentConfig.claudeApiKey),
      openaiApiKey: encryptOptional(currentConfig.openaiApiKey),
      geminiApiKey: encryptOptional(currentConfig.geminiApiKey),
      contextLength: currentConfig.contextLength,
      ollamaKvCacheType: currentConfig.ollamaKvCacheType,
      structuredExtraction: currentConfig.structuredExtraction,
      ragEmbeddingsEnabled: currentConfig.ragEmbeddingsEnabled,
      ragEmbeddingModel: currentConfig.ragEmbeddingModel,
      ragCampaignDocsEnabled: currentConfig.ragCampaignDocsEnabled
    })
  )

  maybeStartEmbeddingBuild() // PHASE-24 24C: (re)build the vector store on config change
}

/** Load `ai-config.json` from disk into the module-level `currentConfig`. The SINGLE
 *  load point — called once at startup by `initFromSavedConfig`. `ai-config.json` has
 *  exactly one writer (`configure`'s atomic write), so after this initial load the
 *  in-memory `currentConfig` is authoritative. (03F/03G) */
export function loadConfigFromDisk(): void {
  const configPath = getConfigPath()
  if (!existsSync(configPath)) return
  try {
    const saved = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>
    currentConfig = {
      provider: ((saved.provider as string) ?? 'ollama') as AiProviderType,
      model: (saved.model as string) || (saved.ollamaModel as string) || '',
      ollamaUrl: (saved.ollamaUrl as string) || OLLAMA_BASE_URL,
      claudeApiKey: decryptOptional(saved.claudeApiKey as string | undefined),
      openaiApiKey: decryptOptional(saved.openaiApiKey as string | undefined),
      geminiApiKey: decryptOptional(saved.geminiApiKey as string | undefined),
      contextLength: saved.contextLength as number | undefined,
      ollamaKvCacheType: saved.ollamaKvCacheType as 'q8_0' | 'q4_0' | undefined,
      structuredExtraction: saved.structuredExtraction as StructuredExtractionMode | undefined,
      ragEmbeddingsEnabled: saved.ragEmbeddingsEnabled as boolean | undefined,
      ragEmbeddingModel: saved.ragEmbeddingModel as string | undefined,
      ragCampaignDocsEnabled: saved.ragCampaignDocsEnabled as boolean | undefined
    }
  } catch {
    // Malformed config — keep current in-memory defaults.
  }
}

/** Return a snapshot of the in-memory config — NO disk I/O. `loadConfigFromDisk` (startup)
 *  is the only loader; reading disk here would clobber `resolveOllamaModel`'s in-memory model
 *  auto-switch (`currentConfig.model = picked`) with the stale on-disk value on every ChatPanel
 *  mount / AI-settings open / map analysis. (03G fix) */
export function getConfig(): AiConfig {
  return {
    provider: currentConfig.provider,
    model: currentConfig.model,
    ollamaUrl: currentConfig.ollamaUrl,
    claudeApiKey: currentConfig.claudeApiKey,
    openaiApiKey: currentConfig.openaiApiKey,
    geminiApiKey: currentConfig.geminiApiKey,
    contextLength: currentConfig.contextLength,
    ollamaKvCacheType: currentConfig.ollamaKvCacheType,
    structuredExtraction: currentConfig.structuredExtraction,
    ragEmbeddingsEnabled: currentConfig.ragEmbeddingsEnabled,
    ragEmbeddingModel: currentConfig.ragEmbeddingModel,
    ragCampaignDocsEnabled: currentConfig.ragCampaignDocsEnabled
  }
}

/** Initialize from saved config and auto-load chunk index. */
export function initFromSavedConfig(): void {
  setRetrievalOptsProvider(getRetrievalOpts) // PHASE-24: context-builder reads live retrieval opts
  loadConfigFromDisk()
  const config = getConfig()
  setConfiguredContextLength(currentConfig.contextLength)
  setOllamaKvCacheType(currentConfig.ollamaKvCacheType)
  setOllamaUrl(currentConfig.ollamaUrl)
  configureProviders(config)

  loadIndex()
  maybeStartEmbeddingBuild() // PHASE-24 24C: build the vector store if semantic search is on
}

// ── Provider Status ──

export async function checkProviders(): Promise<ProviderStatus> {
  const ollamaOk = await isOllamaRunning()
  const ollamaModels = ollamaOk ? await listOllamaModels() : []
  const cloudStatus = await checkAllProviders()

  return {
    ollama: ollamaOk,
    ollamaModels,
    ollamaHasUsableModel: ollamaOk && ollamaModels.length > 0,
    claude: cloudStatus.claude,
    openai: cloudStatus.openai,
    gemini: cloudStatus.gemini
  }
}

// ── Index Management ──

export function buildIndex(onProgress?: (percent: number, stage: string) => void): { chunkCount: number } {
  if (app.isPackaged) {
    throw new Error(
      'Rebuilding the rulebook index is disabled in packaged builds. The bundled chunk index is used instead.'
    )
  }
  const index = buildChunkIndex(onProgress)
  searchEngine = new SearchEngine()
  searchEngine.load(index)
  setSearchEngine(searchEngine)
  loadedChunkIndex = index
  return { chunkCount: index.chunks.length }
}

export function loadIndex(): boolean {
  const index = loadChunkIndex()
  if (!index) return false

  searchEngine = new SearchEngine()
  searchEngine.load(index)
  setSearchEngine(searchEngine)
  loadedChunkIndex = index
  return true
}

export function getChunkCount(): number {
  return searchEngine?.getChunkCount() ?? 0
}

// ── Conversation Management ──

function getConversation(campaignId: string): ConversationManager {
  let conv = conversations.get(campaignId)
  if (!conv) {
    conv = new ConversationManager()
    conv.setSummarizeCallback(async (text) => {
      return await chatOnce(
        'You are a conversation summarizer. Summarize the following D&D conversation concisely, preserving key facts, decisions, NPC names, locations, and combat outcomes. Keep it under 200 words.',
        text
      )
    })
    conversations.set(campaignId, conv)
  }
  return conv
}

export function getConversationManager(campaignId: string): ConversationManager {
  return getConversation(campaignId)
}

/**
 * Phase 22d — drop a campaign's in-memory ConversationManager (the `conversations`
 * Map grew monotonically). Called from the campaign-delete cascade. Re-creating a
 * campaign with the same id yields a fresh manager via getConversation().
 */
export function removeConversation(campaignId: string): void {
  conversations.delete(campaignId)
  scenePrepStatus.delete(campaignId)
  clearTokenBreakdown(campaignId)
}

/**
 * Phase 22b — release module-scoped resources on app quit (the stale-stream
 * sweep interval). Wire from the main-process quit path.
 */
export function disposeAiService(): void {
  clearInterval(staleStreamSweep)
}

// ── Chat ──

export interface StreamResult {
  streamId: string
  promise: Promise<{
    fullText: string
    displayText: string
    statChanges: StatChange[]
    dmActions: DmActionData[]
    ruleCitations: RuleCitation[]
  }>
}

function clearPendingWebSearchApproval(streamId: string, approved = false): boolean {
  const pending = pendingWebSearchApprovals.get(streamId)
  if (!pending) return false

  pendingWebSearchApprovals.delete(streamId)
  clearTimeout(pending.timeout)
  pending.signal.removeEventListener('abort', pending.onAbort)
  pending.resolve(approved)
  return true
}

function waitForWebSearchApproval(streamId: string, abortSignal: AbortSignal): Promise<boolean> {
  // Defensive cleanup if a stale pending request exists for this stream.
  clearPendingWebSearchApproval(streamId, false)

  return new Promise((resolve) => {
    const onAbort = () => {
      clearPendingWebSearchApproval(streamId, false)
    }
    const timeout = setTimeout(() => {
      clearPendingWebSearchApproval(streamId, false)
    }, WEB_SEARCH_APPROVAL_TIMEOUT_MS)

    pendingWebSearchApprovals.set(streamId, {
      resolve,
      timeout,
      onAbort,
      signal: abortSignal
    })
    abortSignal.addEventListener('abort', onAbort, { once: true })
  })
}

export function approveWebSearch(streamId: string, approved: boolean): { success: boolean; error?: string } {
  const found = clearPendingWebSearchApproval(streamId, approved)
  if (!found) {
    return { success: false, error: 'No pending web search request for this stream.' }
  }
  return { success: true }
}

function sendWebSearchStatus(
  streamId: string,
  query: string,
  status: 'pending_approval' | 'searching' | 'rejected'
): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  win.webContents.send(IPC_CHANNELS.AI_STREAM_WEB_SEARCH, {
    streamId,
    query,
    status
  })
}

/** Informational stream status — purely advisory, never clears the renderer's
 * typing state or safety timeout. 'loading_model' = first-token watchdog;
 * 'model_switched' = the configured Ollama model wasn't installed so we fell back
 * to an installed one (carries from/to so the UI can tell the player which + why). */
function sendStreamStatus(
  streamId: string,
  status: 'loading_model' | 'model_switched',
  extra?: { from?: string; to?: string }
): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return
  win.webContents.send(IPC_CHANNELS.AI_STREAM_STATUS, { streamId, status, ...extra })
}

// Time before the first token after which we tell the UI the model is likely
// cold-loading (rather than leaving the user staring at silent "typing…").
const FIRST_TOKEN_NOTICE_MS = 12_000

/**
 * Preflight the Ollama model so a wrong/empty/missing model fails FAST with an
 * actionable message instead of a confusing silent timeout, and so solo play
 * "just works" against whatever model the user actually pulled (honoring the
 * "don't hardcode models" directive — the hardcoded id is only a pull hint now).
 * No-op for cloud providers (they validate the model server-side on the request).
 */
export async function resolveOllamaModel(configured: string, streamId?: string): Promise<string> {
  if (getActiveProviderType() !== 'ollama') return configured
  // PHASE-03 — use the strict fetch so an unreachable host fails fast with the
  // RIGHT error instead of masquerading as "no models installed" (and never hangs
  // for minutes: fetchOllamaModels is 5s-bounded).
  let installed: string[]
  try {
    installed = await fetchOllamaModels()
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Cannot reach Ollama at ${getOllamaUrl()} (${detail}). Check that Ollama is running and the server URL in AI Settings is correct.`
    )
  }
  if (installed.length === 0) {
    throw new Error(
      `No Ollama models installed at ${getOllamaUrl()}. Install one, e.g.: ollama pull ${DEFAULT_AI_MODEL}`
    )
  }
  if (configured && installed.includes(configured)) return configured
  const picked = installed[0]
  logToFile('warn', `[AI] configured Ollama model "${configured || '<none>'}" not installed; using "${picked}"`)
  currentConfig.model = picked
  // Tell the player WHICH model we switched to and WHY (configured one missing, or
  // none set) — a one-time notice, since currentConfig.model is now the installed
  // one so the next message won't re-switch.
  if (streamId) sendStreamStatus(streamId, 'model_switched', { from: configured, to: picked })
  return picked
}

export function startChat(
  request: AiChatRequest,
  onChunk: (text: string) => void,
  onDone: (
    fullText: string,
    displayText: string,
    statChanges: StatChange[],
    dmActions: DmActionData[],
    ruleCitations: RuleCitation[]
  ) => void,
  onError: (error: string) => void
): string {
  const streamId = `stream-${++streamCounter}`
  const abortController = new AbortController()
  activeStreams.set(streamId, abortController)
  activeStreamCampaigns.set(streamId, request.campaignId)
  const now = Date.now()
  activeStreamTimestamps.set(streamId, now)
  activeStreamLastHeartbeat.set(streamId, now)

  // PHASE-21 21B (F7): barge-in — the player just acted, so cut any stale DM
  // narration immediately (before generation even finishes). Opt-in + narration
  // on; inert otherwise, so default behavior is unchanged from PHASE-20.
  if (isNarrationEnabled() && isBargeInEnabled()) {
    cancelNarration().catch(() => {})
  }

  const conv = getConversation(request.campaignId)
  conv.setActiveCharacterIds(request.characterIds)

  // Add user message
  const userContent = request.senderName ? `[${request.senderName}]: ${request.message}` : request.message
  conv.addMessage('user', userContent)

  // Run async
  ;(async () => {
    // First-token watchdog: if no token arrives within FIRST_TOKEN_NOTICE_MS, tell
    // the UI the model is likely cold-loading instead of leaving it silent. Armed
    // here and cleared on first token / completion / error (and in the catch).
    let gotFirstToken = false
    // Heartbeat: a cold/large model can spend minutes in prefill before the first
    // token, so re-emit 'loading_model' every FIRST_TOKEN_NOTICE_MS (not once) — this
    // keeps the user informed AND keeps the renderer's safety timer from firing on a
    // valid-but-slow prefill (the renderer re-arms its backstop on each status).
    const firstTokenTimer = setInterval(() => {
      if (!gotFirstToken) sendStreamStatus(streamId, 'loading_model')
    }, FIRST_TOKEN_NOTICE_MS)
    try {
      // Resolve the model against what Ollama actually has BEFORE building context
      // so a missing/empty model errors in ~ms instead of hanging the request.
      const model = await resolveOllamaModel(currentConfig.model, streamId)

      // Set the budget window BEFORE buildContext/getMessagesForApi run so section
      // budgets (and the truncation flag) scale to the real Ollama num_ctx — cloud
      // providers get the large window so budgets stay unscaled (PHASE-01 01C).
      if (getActiveProviderType() === 'ollama') {
        setActiveContextWindow(await resolveNumCtx(model, getOllamaUrl()))
      } else {
        setActiveContextWindow(CLOUD_CONTEXT_WINDOW)
      }

      const built = await buildContext(
        request.message,
        request.characterIds,
        request.campaignId,
        request.activeCreatures,
        request.gameState,
        request.actingCharacterId
      )
      // Record this LIVE build's breakdown per campaign (previews record nothing). (07A)
      recordTokenBreakdown(request.campaignId, built.breakdown)
      // Provenance: the rulebook chunks that informed this turn, attached to the reply at
      // finalize (07C). undefined when nothing was retrieved.
      const contextChunkIds = built.chunkIds.length > 0 ? built.chunkIds : undefined
      // PHASE-01 01D — the provider blurb is STATIC (changes only when the provider
      // changes), so it leads the context block to extend the cache-stable prefix;
      // it used to trail the every-message-volatile game-state snapshot and was thus
      // re-prefilled every turn.
      const providerContext = `[PROVIDER CONTEXT]\n${getProviderContextBlurb(getActiveProviderType())}\n[/PROVIDER CONTEXT]\n\n`
      // Capture the assembled context block so FILE_READ/WEB_SEARCH continuations replay the
      // SAME game-state/character/rules context instead of rebuilding it empty (which also
      // silently downgraded combat continuations to 'general' mode). (PHASE-06 06D / F-5)
      const contextBlock = providerContext + built.text
      const { systemPrompt, messages } = await conv.getMessagesForApi(contextBlock, built.breakdown.truncated ?? false)

      // Stream response
      let fullText = ''

      const callbacks = {
        onText: (text: string) => {
          if (!gotFirstToken) {
            gotFirstToken = true
            clearInterval(firstTokenTimer)
          }
          fullText += text
          // Update heartbeat on each chunk to extend TTL for active streams
          updateStreamHeartbeat(streamId)
          onChunk(text)
        },
        onDone: (text: string) => {
          clearPendingWebSearchApproval(streamId, false)
          fullText = text
          // Keep the stream REGISTERED through any FILE_READ/WEB_SEARCH recursion so
          // cancelChat still works mid-recursion (it previously removed the stream
          // here, leaving Cancel a no-op during the read/approval window). Terminal
          // paths (finalize + onError) remove it. `.catch` surfaces a rejection
          // instead of leaving the renderer's spinner hanging until the TTL sweep.
          void handleStreamCompletion(
            fullText,
            request,
            conv,
            streamId,
            abortController,
            onChunk,
            onDone,
            onError,
            contextBlock,
            0,
            contextChunkIds
          ).catch((e) => {
            removeStream(streamId)
            onError(e instanceof Error ? e.message : String(e))
          })
        },
        onError: (error: Error) => {
          clearPendingWebSearchApproval(streamId, false)
          removeStream(streamId)
          onError(error.message)
        }
      }

      const provider = getActiveProvider()
      await streamWithRetry(
        streamChatRetryable(provider.streamChat.bind(provider), systemPrompt, messages, callbacks, model),
        abortController,
        (errMsg) => {
          clearPendingWebSearchApproval(streamId, false)
          removeStream(streamId)
          onError(errMsg)
        }
      )
      clearInterval(firstTokenTimer)
    } catch (error) {
      clearInterval(firstTokenTimer)
      clearPendingWebSearchApproval(streamId, false)
      removeStream(streamId)
      onError(error instanceof Error ? error.message : String(error))
    }
  })()

  return streamId
}

/**
 * Handle AI stream completion — checks for [FILE_READ] and [WEB_SEARCH] tags,
 * processes them recursively, then finalizes the response.
 */
async function handleStreamCompletion(
  fullText: string,
  request: AiChatRequest,
  conv: ConversationManager,
  streamId: string,
  abortController: AbortController,
  onChunk: (text: string) => void,
  onDone: (
    fullText: string,
    displayText: string,
    statChanges: StatChange[],
    dmActions: DmActionData[],
    ruleCitations: RuleCitation[]
  ) => void,
  onError: (error: string) => void,
  contextBlock: string,
  fileReadDepth: number,
  contextChunkIds?: string[],
  deps: StreamHandlerDeps = getStreamDeps()
): Promise<void> {
  const restreamConversation = async (): Promise<void> => {
    // The stream may have been cancelled (cancelChat aborted + removed it). Never re-register
    // an aborted controller into activeStreams — that orphan would sit until the TTL sweep
    // (~10-11 min) finds it. (PHASE-05 05E / F5)
    if (abortController.signal.aborted) return
    deps.activeStreams.set(streamId, abortController)
    activeStreamTimestamps.set(streamId, Date.now())
    // Refresh the heartbeat too, so a legit long file-read→restream chain isn't
    // force-aborted by the TTL sweep while it's actively streaming.
    activeStreamLastHeartbeat.set(streamId, Date.now())
    let nextFullText = ''
    // Replay the ORIGINAL turn's context block (game state / character data / retrieved rules)
    // so the continuation isn't blind and keeps its combat-mode gate. (06D / F-5)
    const { systemPrompt: sp, messages: msgs } = await conv.getMessagesForApi(contextBlock)

    const nextCallbacks = {
      onText: (text: string) => {
        nextFullText += text
        onChunk(text)
      },
      onDone: (text: string) => {
        nextFullText = text
        // Stay registered through the next recursion level (cancellable); terminal
        // paths remove it. `.catch` so a deeper rejection surfaces, not hangs.
        void handleStreamCompletion(
          nextFullText,
          request,
          conv,
          streamId,
          abortController,
          onChunk,
          onDone,
          onError,
          contextBlock,
          fileReadDepth + 1,
          contextChunkIds,
          deps
        ).catch((e) => {
          removeStream(streamId)
          onError(e instanceof Error ? e.message : String(e))
        })
      },
      onError: (error: Error) => {
        clearPendingWebSearchApproval(streamId, false)
        removeStream(streamId)
        onError(error.message)
      }
    }

    await deps.streamWithRetry(
      streamChatRetryable(deps.streamChat, sp, msgs, nextCallbacks, deps.model),
      abortController,
      (errMsg) => {
        clearPendingWebSearchApproval(streamId, false)
        removeStream(streamId)
        onError(errMsg)
      }
    )
  }

  // Check for file read tag
  if (hasFileReadTag(fullText) && fileReadDepth < FILE_READ_MAX_DEPTH) {
    const fileReq: FileReadRequest | null = parseFileRead(fullText)
    if (fileReq) {
      // Notify renderer of file read status
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        win.webContents.send(IPC_CHANNELS.AI_STREAM_FILE_READ, {
          streamId,
          path: fileReq.path,
          status: 'reading'
        })
      }

      const result = await readRequestedFile(fileReq.path)
      // A cancel can land while the disk read is in flight; if so, append NOTHING to the
      // conversation (post-cancel writes pollute the next turn's payload) and do not restream.
      // (PHASE-05 05E / F5)
      if (abortController.signal.aborted) return
      const fileContent = formatFileContent(result)

      // Strip the FILE_READ tag from display text
      const strippedText = stripFileRead(fullText)

      // Inject file content as a synthetic user message and continue conversation
      conv.addMessage('assistant', strippedText)
      conv.addMessage('user', fileContent)

      // PHASE-14 14D — terminal event so the "Reading file…" indicator reverts the moment the
      // read finishes, instead of persisting through the whole post-read restream. (Store
      // clearing on cancel/done/etc. stays PHASE-04's; this is an emit, not store clearing.)
      if (win) {
        win.webContents.send(IPC_CHANNELS.AI_STREAM_FILE_READ, {
          streamId,
          path: fileReq.path,
          status: 'done'
        })
      }

      await restreamConversation()
      return
    }
  }

  // Check for web search tag
  if (hasWebSearchTag(fullText) && fileReadDepth < FILE_READ_MAX_DEPTH) {
    const searchReq: WebSearchRequest | null = parseWebSearch(fullText)
    if (searchReq) {
      sendWebSearchStatus(streamId, searchReq.query, 'pending_approval')
      const approved = await waitForWebSearchApproval(streamId, abortController.signal)
      if (abortController.signal.aborted) return

      // Strip the WEB_SEARCH tag now, but only COMMIT the assistant turn on a path that
      // actually continues — appending it before the search runs left a dangling assistant
      // message in history if the stream was cancelled mid-search. (PHASE-05 05E / F5)
      const strippedText = stripWebSearch(fullText)

      if (!approved) {
        sendWebSearchStatus(streamId, searchReq.query, 'rejected')
        conv.addMessage('assistant', strippedText)
        conv.addMessage('user', WEB_SEARCH_DENIED_MESSAGE)
        await restreamConversation()
        return
      }

      sendWebSearchStatus(streamId, searchReq.query, 'searching')
      const results: WebSearchResult[] = await performWebSearch(searchReq.query)
      if (abortController.signal.aborted) return
      const searchContent = formatSearchResults(searchReq.query, results)
      conv.addMessage('assistant', strippedText)
      conv.addMessage('user', searchContent)

      await restreamConversation()
      return
    }
  }

  // No special tags — finalize response. Terminal path: remove the stream here
  // (it stayed registered through any recursion above so Cancel kept working).
  removeStream(streamId)
  try {
    let cleaned = fullText
    if (hasViolations(cleaned)) {
      cleaned = cleanNarrativeText(cleaned)
    }

    // PHASE-23 23E: detailed parse so `fallback` mode can detect a tag-parse failure.
    const statResult = parseStatChangesDetailed(cleaned)
    const dmResult = parseDmActionsDetailed(cleaned)
    let statChanges = statResult.changes
    const dmActions = dmResult.actions
    const ruleCitations = parseRuleCitations(cleaned)
    // Voice tags drive DM-BMO's per-character tone/pitch but must never reach the
    // chat text — extract before stripping, strip before display.
    const { npc, emotion, speaker } = parseVoiceTags(cleaned)
    const rulings = parseRulings(cleaned)
    const displayText = stripVoiceTags(stripRulings(stripRuleCitations(stripDmActions(stripStatChanges(cleaned)))))

    // PHASE-23 23E: opt-in two-call structured extraction. Default (off) = zero new
    // awaits, byte-identical legacy behavior. Wrapped so any failure degrades to the
    // tag-parse results and NEVER reaches the outer catch (which discards them).
    const extractionMode = getStructuredExtractionMode()
    if (extractionMode !== 'off') {
      try {
        const tagFailed =
          !!statResult.rawJsonError ||
          (statResult.issues.length > 0 && statResult.changes.length === 0) ||
          hasOrphanStatChangesTag(cleaned) ||
          hasOrphanDmActionsTag(cleaned)
        if (extractionMode === 'always' || tagFailed) {
          const snapshot = await buildGameStateSnapshot(request)
          const extracted = await runStructuredExtraction(
            getActiveProvider(),
            currentConfig.model, // resolveOllamaModel already updated this in-memory
            displayText,
            snapshot,
            (msg) => logToFile('INFO', msg)
          )
          if (extracted) {
            // Merge tag + extracted (deduped), then validate the whole set against
            // actual game state — constrained decoding guarantees shape, not truth.
            const merged = [...statChanges, ...dedupeStatChanges(statChanges, extracted.changes)]
            const { valid, rejected } = validateAgainstGameState(merged, snapshot)
            for (const r of rejected) logToFile('INFO', `[AI Extraction] rejected: ${r.reason}`)
            statChanges = valid
          }
        }
      } catch (err) {
        logToFile('WARN', `[AI Extraction] wiring error (using tag results): ${String(err)}`)
      }
    }

    // Attach retrieval provenance (the rulebook chunks that grounded this reply). (07C)
    conv.addMessage('assistant', displayText, contextChunkIds)

    saveConversation(request.campaignId, conv.serialize()).catch((err) =>
      logToFile('ERROR', '[AI] Failed to auto-save conversation:', String(err))
    )

    try {
      const memMgr = getMemoryManager(request.campaignId)
      const sessionId = new Date().toISOString().slice(0, 10)
      const logEntry = `[${request.senderName ?? 'Player'}]: ${request.message}\n[AI DM]: ${displayText.slice(0, 500)}`
      memMgr.appendSessionLog(sessionId, logEntry).catch(() => {})
      // Persist NPC attitude shifts to world-state memory so an NPC the AI just
      // characterized is remembered next session. These were parsed into
      // statChanges but never saved — silent world-state loss until now.
      for (const change of statChanges) {
        if (change.type === 'npc_attitude') {
          memMgr.upsertNPC(npcMemoryFromAttitude(change.name, change.attitude, change.reason)).catch(() => {})
        }
      }
      // Persist house-rulings the AI recorded this turn → future [DM RULINGS] context.
      for (const r of rulings) {
        memMgr
          .addRuling({ question: r.question, ruling: r.ruling, citation: r.citation, overriddenByDM: false })
          .catch(() => {})
      }
    } catch {
      // Non-fatal
    }

    // Two independent, default-OFF Discord senders for each finalized reply:
    //  - VOICE narration through DM-BMO (PHASE-20 20F): toggle-gated; tone/pitch
    //    from the parsed NPC archetype + emotion. Fire-and-forget; a dropped result
    //    is broadcast to the DM tab (deduped there).
    //  - TEXT push to Discord (PHASE-22 22F): gated by the Discord integration's own
    //    `config.enabled`; sendNarrationToDiscord no-ops unless that is on.
    if (isNarrationEnabled()) {
      // PHASE-21 21B (F7): with barge-in ON, a new scene's narration interrupts
      // stale audio still playing on the Pi. With it OFF (default) interrupt is
      // omitted and behavior is byte-identical to PHASE-20.
      sendNarration(displayText, { npc, emotion, speaker, interrupt: isBargeInEnabled() })
        .then((res) => {
          const dropped = !res.ok || (res.result && res.result !== 'queued' && res.result !== 'duplicate')
          if (dropped) broadcastNarrationStatus(res)
        })
        .catch((err) => {
          logToFile('WARN', '[AI] Failed to send narration to DM-BMO voice:', String(err))
          broadcastNarrationStatus({ ok: false, error: String(err) })
        })
    }

    // PHASE-22 22F: push the narration TEXT to Discord (webhook / bot-DM). Separate,
    // user-enabled integration — sendNarrationToDiscord returns early unless enabled.
    void (async () => {
      const campaign = await loadCampaignById(request.campaignId)
      const name = typeof campaign?.name === 'string' ? campaign.name : undefined
      await sendNarrationToDiscord(displayText, name)
    })().catch((err) => logToFile('WARN', '[AI] Discord text push failed:', String(err)))

    onDone(cleaned, displayText, statChanges, dmActions, ruleCitations)
  } catch (err) {
    logToFile('ERROR', '[AI] Error parsing AI response, delivering raw text:', String(err))
    conv.addMessage('assistant', fullText, contextChunkIds)
    onDone(fullText, fullText, [], [], [])
  }
}

export function cancelChat(streamId: string): void {
  clearPendingWebSearchApproval(streamId, false)
  const controller = activeStreams.get(streamId)
  if (controller) {
    controller.abort()
    removeStream(streamId)
  }
}

/** Non-streaming chat for summarization and world state extraction. */
async function chatOnce(systemPrompt: string, userMessage: string): Promise<string> {
  const provider = getActiveProvider()
  const messages = [{ role: 'user' as const, content: userMessage }]
  // Resolve the model first (no streamId → no renderer notice; no-ops for cloud). Without
  // this, summaries 404 against Ollama on a missing/stale configured model until the first
  // interactive stream auto-switches. (03G)
  const model = await resolveOllamaModel(currentConfig.model)
  return await provider.chatOnce(systemPrompt, messages, model)
}

// ── Scene Preparation ──

export function prepareScene(campaignId: string, characterIds: string[]): string | null {
  // Don't re-prepare if already done or in progress
  const existing = scenePrepStatus.get(campaignId)
  if (existing && (existing.status === 'preparing' || existing.status === 'ready')) return existing.streamId

  const conv = getConversation(campaignId)
  // S-2 retry — a failed prep leaves a dangling user prompt (the stream errored
  // before any assistant reply); remove ONLY that prompt so a retry re-narrates.
  // A populated conversation (user entered the game and chatted after the
  // failure) is left intact and short-circuits to 'ready' below. (PHASE-06 06C)
  if (existing?.status === 'error') {
    conv.removeTrailingUserMessage(SCENE_PREP_PROMPT)
  }

  // Also skip if conversation already has messages (returning game)
  if (conv.getMessageCount() > 0) {
    scenePrepStatus.set(campaignId, { status: 'ready', streamId: null })
    return null
  }

  // Use existing startChat with scene prompt
  const request: AiChatRequest = {
    campaignId,
    message: SCENE_PREP_PROMPT,
    characterIds
  }

  const streamId = startChat(
    request,
    () => {}, // onChunk — no renderer listener during lobby prep
    (_fullText, _displayText, _statChanges, _dmActions, _ruleCitations) => {
      scenePrepStatus.set(campaignId, { status: 'ready', streamId: null })
    },
    (error) => {
      // S-2 — keep the reason so the lobby can show it + offer a retry.
      scenePrepStatus.set(campaignId, { status: 'error', streamId: null, error })
    }
  )

  scenePrepStatus.set(campaignId, { status: 'preparing', streamId })
  return streamId
}

export function getSceneStatus(campaignId: string): {
  status: 'idle' | 'preparing' | 'ready' | 'error'
  streamId: string | null
  error?: string
} {
  return scenePrepStatus.get(campaignId) ?? { status: 'idle', streamId: null }
}

/**
 * Cancel an in-flight scene preparation (or discard a finished one that the
 * user cancelled before entering the game). Aborts the stream, drops the
 * status entry so the next Play regenerates, and removes the prep exchange
 * from the conversation — real history is never touched. Idempotent.
 */
export function cancelScenePrep(campaignId: string): { success: true } {
  const entry = scenePrepStatus.get(campaignId)
  if (entry?.streamId) cancelChat(entry.streamId)
  scenePrepStatus.delete(campaignId)
  // Use conversations.get (NOT getConversation) so cancelling a campaign with no
  // manager doesn't instantiate one.
  const conv = conversations.get(campaignId)
  if (conv) {
    // In-flight cancel: drop the dangling user prompt. Cancel-after-complete:
    // drop the whole [prompt, scene] exchange so the next Play regenerates
    // (the user typically cancelled to change model/provider).
    const trimmed = conv.removeTrailingUserMessage(SCENE_PREP_PROMPT)
    const cleared = conv.clearScenePrepExchange(SCENE_PREP_PROMPT)
    if (trimmed || cleared) {
      // Keep disk consistent — a completed prep already auto-saved.
      saveConversation(campaignId, conv.serialize()).catch((err) =>
        logToFile('warn', '[AI] Failed to save conversation after scene cancel:', String(err))
      )
    }
  }
  return { success: true }
}

// ── Session Summary ──

/**
 * Generate an end-of-session summary for a campaign.
 * Uses the conversation manager's summarize callback.
 */
export async function generateSessionSummary(campaignId: string): Promise<string | null> {
  const conv = getConversation(campaignId)
  const summary = await conv.generateSessionSummary()

  // Also save to memory manager
  if (summary) {
    try {
      const memMgr = getMemoryManager(campaignId)
      const sessionId = new Date().toISOString().slice(0, 10)
      await memMgr.appendSessionLog(sessionId, `\n--- SESSION SUMMARY ---\n${summary}\n`)
    } catch {
      // Non-fatal
    }
  }

  return summary
}

/**
 * Check if the AI context was truncated in the last call.
 * Returns true if the DM should be alerted that context was compressed.
 */
export function wasContextTruncated(campaignId: string): boolean {
  const conv = conversations.get(campaignId)
  return conv?.contextWasTruncated ?? false
}

/**
 * Get estimated token usage for the last AI call.
 */
export function getLastTokenEstimate(campaignId: string): number {
  const conv = conversations.get(campaignId)
  return conv?.lastTokenEstimate ?? 0
}

/**
 * PHASE-14 14E — chunk ids attached to the most recent assistant message (RAG provenance for
 * the context inspector; read-only). Uses `conversations.get` (NOT getConversation) so a read
 * never instantiates a manager (PHASE-07 CQS rule).
 */
export function getLastAssistantContextChunkIds(campaignId: string): string[] {
  const conv = conversations.get(campaignId)
  if (!conv) return []
  const msgs = conv.getMessages()
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant') return msgs[i].contextChunkIds ?? []
  }
  return []
}

// Re-export mutation functions
export { applyLongRestMutations, applyMutations, applyShortRestMutations, describeChange, isNegativeChange }
