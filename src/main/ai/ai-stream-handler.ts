import { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc-channels'
import { type FinalizedResponse, finalizeAiResponse } from './ai-response-parser'

type _FinalizedResponse = FinalizedResponse

import type { ConversationManager } from './conversation-manager'
import {
  FILE_READ_MAX_DEPTH,
  formatFileContent,
  hasFileReadTag,
  parseFileRead,
  readRequestedFile,
  stripFileRead
} from './file-reader'
import type { AiChatRequest, ChatMessage, DmActionData, RuleCitation, StatChange, StreamCallbacks } from './types'
import { formatSearchResults, hasWebSearchTag, parseWebSearch, performWebSearch, stripWebSearch } from './web-search'

// ── Web Search Approval ──

export interface PendingWebSearchApproval {
  resolve: (approved: boolean) => void
  timeout: ReturnType<typeof setTimeout>
  onAbort: () => void
  signal: AbortSignal
}

const pendingWebSearchApprovals = new Map<string, PendingWebSearchApproval>()
const WEB_SEARCH_APPROVAL_TIMEOUT_MS = 30_000
const WEB_SEARCH_DENIED_MESSAGE =
  '[WEB SEARCH DENIED]\nThe requested web search was not approved. Continue responding using existing campaign and rulebook context only.\n[/WEB SEARCH DENIED]'

export function clearPendingWebSearchApproval(streamId: string, approved = false): boolean {
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

// ── Stream Completion Handler ──

export interface StreamHandlerDeps {
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

/**
 * Handle AI stream completion — checks for [FILE_READ] and [WEB_SEARCH] tags,
 * processes them recursively, then finalizes the response.
 */
export async function handleStreamCompletion(
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
  deps: StreamHandlerDeps
): Promise<void> {
  const restreamConversation = async (): Promise<void> => {
    deps.activeStreams.set(streamId, abortController)
    let nextFullText = ''
    const { systemPrompt: sp, messages: msgs } = await conv.getMessagesForApi('')

    const nextCallbacks = {
      onText: (text: string) => {
        nextFullText += text
        onChunk(text)
      },
      onDone: (text: string) => {
        nextFullText = text
        deps.activeStreams.delete(streamId)
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
        deps.activeStreams.delete(streamId)
        onError(error.message)
      }
    }

    await deps.streamWithRetry(
      (signal) => deps.streamChat(sp, msgs, nextCallbacks, deps.model, signal),
      abortController,
      (errMsg) => {
        clearPendingWebSearchApproval(streamId, false)
        deps.activeStreams.delete(streamId)
        onError(errMsg)
      }
    )
  }

  // Check for file read tag
  if (hasFileReadTag(fullText) && fileReadDepth < FILE_READ_MAX_DEPTH) {
    const fileReq = parseFileRead(fullText)
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
    const searchReq = parseWebSearch(fullText)
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
      const results = await performWebSearch(searchReq.query)
      if (abortController.signal.aborted) return
      const searchContent = formatSearchResults(searchReq.query, results)
      conv.addMessage('user', searchContent)

      await restreamConversation()
      return
    }
  }

  // No special tags — finalize response
  const result = finalizeAiResponse(fullText, request, conv)
  onDone(result.fullText, result.displayText, result.statChanges, result.dmActions, result.ruleCitations)
}
