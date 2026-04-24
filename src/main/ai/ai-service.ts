import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { sendNarrationToDiscord } from '../discord-integration'
import { logToFile } from '../log'
import { saveConversation } from '../storage/ai-conversation-storage'
import { parseRuleCitations, stripRuleCitations } from './ai-response-parser'
import type { PendingWebSearchApproval, StreamHandlerDeps } from './ai-stream-handler'
import { buildChunkIndex, loadChunkIndex } from './chunk-builder'
import { buildContext, setSearchEngine } from './context-builder'
import { ConversationManager } from './conversation-manager'
import { parseDmActions, stripDmActions } from './dm-actions'
import {
  FILE_READ_MAX_DEPTH,
  type FileReadRequest,
  formatFileContent,
  hasFileReadTag,
  parseFileRead,
  readRequestedFile,
  stripFileRead
} from './file-reader'
import type { AiProviderType } from './llm-provider'
import { getMemoryManager } from './memory-manager'
import { isOllamaRunning, listOllamaModels, setOllamaUrl } from './ollama-client'
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
  isNegativeChange,
  parseStatChanges,
  stripStatChanges
} from './stat-mutations'
import { cleanNarrativeText, hasViolations } from './tone-validator'
import type {
  AiChatRequest,
  AiConfig,
  AiIndexProgress,
  AiStreamChunk,
  AiStreamDone,
  AiStreamError,
  DmActionData,
  ProviderStatus,
  RuleCitation,
  StatChange
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
const STREAM_TTL_MS = 10 * 60 * 1000 // 10 minutes base TTL
const STREAM_MAX_TTL_MS = 30 * 60 * 1000 // 30 minutes max TTL (hard ceiling)
const HEARTBEAT_WINDOW_MS = 5 * 60 * 1000 // Extend TTL when activity within last 5 minutes

function removeStream(streamId: string): void {
  activeStreams.delete(streamId)
  activeStreamTimestamps.delete(streamId)
  activeStreamLastHeartbeat.delete(streamId)
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

// Periodically clean up stale streams
setInterval(() => {
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
const WEB_SEARCH_APPROVAL_TIMEOUT_MS = 30_000
const WEB_SEARCH_DENIED_MESSAGE =
  '[WEB SEARCH DENIED]\nThe requested web search was not approved. Continue responding using existing campaign and rulebook context only.\n[/WEB SEARCH DENIED]'

// Scene preparation status per campaign
const scenePrepStatus = new Map<string, { status: 'preparing' | 'ready' | 'error'; streamId: string | null }>()

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

function getRetryDelay(attempt: number): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, ... capped at 30s
  return Math.min(1000 * 2 ** attempt, MAX_RETRY_DELAY_MS)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function streamWithRetry(
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
      return
    } catch (error) {
      consecutiveFailures++
      const msg = error instanceof Error ? error.message : String(error)

      // Don't retry on abort
      if (abortController.signal.aborted) return

      if (attempt < maxRetries) {
        const delay = getRetryDelay(attempt)
        await sleep(delay)
      } else {
        onError(msg)
      }
    }
  }
}

// Current config
let currentConfig: {
  provider: AiProviderType
  model: string
  ollamaUrl: string
  claudeApiKey?: string
  openaiApiKey?: string
  geminiApiKey?: string
} = {
  provider: 'ollama',
  model: 'llama3.1',
  ollamaUrl: OLLAMA_BASE_URL
}

let searchEngine: SearchEngine | null = null
let streamCounter = 0

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

export function configure(config: AiConfig): void {
  currentConfig = {
    provider: config.provider ?? 'ollama',
    model: config.model || config.ollamaModel || 'llama3.1',
    ollamaUrl: config.ollamaUrl || OLLAMA_BASE_URL,
    claudeApiKey: config.claudeApiKey,
    openaiApiKey: config.openaiApiKey,
    geminiApiKey: config.geminiApiKey
  }

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
  writeFileSync(
    configPath,
    JSON.stringify({
      provider: currentConfig.provider,
      model: currentConfig.model,
      ollamaUrl: currentConfig.ollamaUrl,
      claudeApiKey: currentConfig.claudeApiKey,
      openaiApiKey: currentConfig.openaiApiKey,
      geminiApiKey: currentConfig.geminiApiKey
    })
  )
}

export function getConfig(): AiConfig {
  const configPath = getConfigPath()
  if (existsSync(configPath)) {
    try {
      const saved = JSON.parse(readFileSync(configPath, 'utf-8'))
      currentConfig = {
        provider: saved.provider ?? 'ollama',
        model: saved.model || saved.ollamaModel || 'llama3.1',
        ollamaUrl: saved.ollamaUrl || OLLAMA_BASE_URL,
        claudeApiKey: saved.claudeApiKey,
        openaiApiKey: saved.openaiApiKey,
        geminiApiKey: saved.geminiApiKey
      }
    } catch {
      // Use defaults
    }
  }

  return {
    provider: currentConfig.provider,
    model: currentConfig.model,
    ollamaUrl: currentConfig.ollamaUrl,
    claudeApiKey: currentConfig.claudeApiKey,
    openaiApiKey: currentConfig.openaiApiKey,
    geminiApiKey: currentConfig.geminiApiKey
  }
}

/** Initialize from saved config and auto-load chunk index. */
export function initFromSavedConfig(): void {
  const config = getConfig()
  setOllamaUrl(currentConfig.ollamaUrl)
  configureProviders(config)

  loadIndex()
}

// ── Provider Status ──

export async function checkProviders(): Promise<ProviderStatus> {
  const ollamaOk = await isOllamaRunning()
  const ollamaModels = ollamaOk ? await listOllamaModels() : []
  const cloudStatus = await checkAllProviders()

  return {
    ollama: ollamaOk,
    ollamaModels,
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
  return { chunkCount: index.chunks.length }
}

export function loadIndex(): boolean {
  const index = loadChunkIndex()
  if (!index) return false

  searchEngine = new SearchEngine()
  searchEngine.load(index)
  setSearchEngine(searchEngine)
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
  const now = Date.now()
  activeStreamTimestamps.set(streamId, now)
  activeStreamLastHeartbeat.set(streamId, now)

  const conv = getConversation(request.campaignId)
  conv.setActiveCharacterIds(request.characterIds)

  // Add user message
  const userContent = request.senderName ? `[${request.senderName}]: ${request.message}` : request.message
  conv.addMessage('user', userContent)

  // Run async
  ;(async () => {
    try {
      const context = await buildContext(
        request.message,
        request.characterIds,
        request.campaignId,
        request.activeCreatures,
        request.gameState
      )
      const providerContext = `\n\n[PROVIDER CONTEXT]\n${getProviderContextBlurb(getActiveProviderType())}\n[/PROVIDER CONTEXT]`
      const { systemPrompt, messages } = await conv.getMessagesForApi(context + providerContext)

      // Stream response
      let fullText = ''

      const callbacks = {
        onText: (text: string) => {
          fullText += text
          // Update heartbeat on each chunk to extend TTL for active streams
          updateStreamHeartbeat(streamId)
          onChunk(text)
        },
        onDone: (text: string) => {
          clearPendingWebSearchApproval(streamId, false)
          fullText = text
          removeStream(streamId)

          // Handle file read recursion
          handleStreamCompletion(fullText, request, conv, streamId, abortController, onChunk, onDone, onError, 0)
        },
        onError: (error: Error) => {
          clearPendingWebSearchApproval(streamId, false)
          removeStream(streamId)
          onError(error.message)
        }
      }

      const provider = getActiveProvider()
      await streamWithRetry(
        (signal) => provider.streamChat(systemPrompt, messages, callbacks, currentConfig.model, signal),
        abortController,
        (errMsg) => {
          removeStream(streamId)
          onError(errMsg)
        }
      )
    } catch (error) {
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
  fileReadDepth: number,
  deps: StreamHandlerDeps = getStreamDeps()
): Promise<void> {
  const restreamConversation = async (): Promise<void> => {
    deps.activeStreams.set(streamId, abortController)
    activeStreamTimestamps.set(streamId, Date.now())
    let nextFullText = ''
    const { systemPrompt: sp, messages: msgs } = await conv.getMessagesForApi('')

    const nextCallbacks = {
      onText: (text: string) => {
        nextFullText += text
        onChunk(text)
      },
      onDone: (text: string) => {
        nextFullText = text
        removeStream(streamId)
        handleStreamCompletion(
          nextFullText,
          request,
          conv,
          streamId,
          abortController,
          onChunk,
          onDone,
          onError,
          fileReadDepth + 1,
          deps
        )
      },
      onError: (error: Error) => {
        clearPendingWebSearchApproval(streamId, false)
        removeStream(streamId)
        onError(error.message)
      }
    }

    await deps.streamWithRetry(
      (signal) => deps.streamChat(sp, msgs, nextCallbacks, deps.model, signal),
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
      const fileContent = formatFileContent(result)

      // Strip the FILE_READ tag from display text
      const strippedText = stripFileRead(fullText)

      // Inject file content as a synthetic user message and continue conversation
      conv.addMessage('assistant', strippedText)
      conv.addMessage('user', fileContent)

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

      const strippedText = stripWebSearch(fullText)
      conv.addMessage('assistant', strippedText)

      if (!approved) {
        sendWebSearchStatus(streamId, searchReq.query, 'rejected')
        conv.addMessage('user', WEB_SEARCH_DENIED_MESSAGE)
        await restreamConversation()
        return
      }

      sendWebSearchStatus(streamId, searchReq.query, 'searching')
      const results: WebSearchResult[] = await performWebSearch(searchReq.query)
      if (abortController.signal.aborted) return
      const searchContent = formatSearchResults(searchReq.query, results)
      conv.addMessage('user', searchContent)

      await restreamConversation()
      return
    }
  }

  // No special tags — finalize response
  try {
    let cleaned = fullText
    if (hasViolations(cleaned)) {
      cleaned = cleanNarrativeText(cleaned)
    }

    const statChanges = parseStatChanges(cleaned)
    const dmActions = parseDmActions(cleaned)
    const ruleCitations = parseRuleCitations(cleaned)
    const displayText = stripRuleCitations(stripDmActions(stripStatChanges(cleaned)))

    conv.addMessage('assistant', displayText)

    saveConversation(request.campaignId, conv.serialize()).catch((err) =>
      logToFile('ERROR', '[AI] Failed to auto-save conversation:', String(err))
    )

    try {
      const memMgr = getMemoryManager(request.campaignId)
      const sessionId = new Date().toISOString().slice(0, 10)
      const logEntry = `[${request.senderName ?? 'Player'}]: ${request.message}\n[AI DM]: ${displayText.slice(0, 500)}`
      memMgr.appendSessionLog(sessionId, logEntry).catch(() => {})
    } catch {
      // Non-fatal
    }

    // Send to Discord if enabled (fire and forget - don't block on this)
    sendNarrationToDiscord(displayText, request.campaignId).catch((err) => {
      logToFile('ERROR', '[AI] Failed to send Discord notification:', String(err))
    })

    onDone(cleaned, displayText, statChanges, dmActions, ruleCitations)
  } catch (err) {
    logToFile('ERROR', '[AI] Error parsing AI response, delivering raw text:', String(err))
    conv.addMessage('assistant', fullText)
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
  return await provider.chatOnce(systemPrompt, messages, currentConfig.model)
}

// ── Scene Preparation ──

export function prepareScene(campaignId: string, characterIds: string[]): string | null {
  // Don't re-prepare if already done or in progress
  const existing = scenePrepStatus.get(campaignId)
  if (existing && (existing.status === 'preparing' || existing.status === 'ready')) return existing.streamId

  // Also skip if conversation already has messages (returning game)
  const conv = getConversation(campaignId)
  if (conv.getMessageCount() > 0) {
    scenePrepStatus.set(campaignId, { status: 'ready', streamId: null })
    return null
  }

  // Use existing startChat with scene prompt
  const request: AiChatRequest = {
    campaignId,
    message: 'The adventure begins. Set the scene for the party. Describe the opening location and atmosphere.',
    characterIds
  }

  const streamId = startChat(
    request,
    () => {}, // onChunk — no renderer listener during lobby prep
    (_fullText, _displayText, _statChanges, _dmActions, _ruleCitations) => {
      scenePrepStatus.set(campaignId, { status: 'ready', streamId: null })
    },
    (_error) => {
      scenePrepStatus.set(campaignId, { status: 'error', streamId: null })
    }
  )

  scenePrepStatus.set(campaignId, { status: 'preparing', streamId })
  return streamId
}

export function getSceneStatus(campaignId: string): {
  status: 'idle' | 'preparing' | 'ready' | 'error'
  streamId: string | null
} {
  return scenePrepStatus.get(campaignId) ?? { status: 'idle', streamId: null }
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

// Re-export mutation functions
export { applyMutations, applyLongRestMutations, applyShortRestMutations, describeChange, isNegativeChange }
