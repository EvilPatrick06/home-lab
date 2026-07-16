/**
 * AI DM File Reading — parses [FILE_READ] tags from AI responses,
 * reads requested files with safety constraints, and formats content
 * for injection back into the conversation.
 */

import { lstat, readFile, realpath, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { app } from 'electron'
import { logSecurityEvent } from '../security-log'

const FILE_READ_RE = /\[FILE_READ\]\s*([\s\S]*?)\s*\[\/FILE_READ\]/

const MAX_FILE_SIZE = 512 * 1024 // 512 KB
const MAX_DEPTH = 3

export interface FileReadRequest {
  path: string
}

export interface FileReadResult {
  success: boolean
  path: string
  content?: string
  error?: string
}

/** Check if the AI response contains a [FILE_READ] tag. */
export function hasFileReadTag(response: string): boolean {
  return FILE_READ_RE.test(response)
}

/** Parse the [FILE_READ] tag to extract the file path. */
export function parseFileRead(response: string): FileReadRequest | null {
  const match = response.match(FILE_READ_RE)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[1])
    if (parsed && typeof parsed.path === 'string') {
      return { path: parsed.path }
    }
  } catch {
    // Try plain text path (no JSON wrapper) — skip if it looks like malformed JSON
    const trimmed = match[1].trim()
    if (trimmed && !trimmed.includes('\n') && !trimmed.startsWith('{')) {
      return { path: trimmed }
    }
  }
  return null
}

/** Remove the [FILE_READ] tag from response text for display. */
export function stripFileRead(response: string): string {
  return response.replace(/\s*\[FILE_READ\][\s\S]*?\[\/FILE_READ\]\s*/g, '').trim()
}

// Phase 20e — AI file reads are restricted to these userData subdirectories
// (game data only), not the whole userData tree. This keeps secrets like
// ai-config.json / discord-integration.json out of reach of a prompt-injected
// [FILE_READ].
const AI_READ_ALLOWED_DIRS = ['campaigns', 'ai-conversations', 'characters', 'ai-context']

/** Check whether a resolved path falls within one of the AI-readable game-data subdirs. */
function isAiReadAllowed(resolvedPath: string): boolean {
  const userData = resolve(app.getPath('userData'))
  const rel = relative(userData, resolvedPath)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return false
  const top = rel.split(sep)[0]
  return AI_READ_ALLOWED_DIRS.includes(top)
}

/** Read a file from disk with safety constraints. */
export async function readRequestedFile(filePath: string): Promise<FileReadResult> {
  const resolved = resolve(filePath)

  if (!isAiReadAllowed(resolved)) {
    logSecurityEvent('ai.file_read.denied', { path: resolved })
    return {
      success: false,
      path: resolved,
      error: 'Access denied: AI reads restricted to game data'
    }
  }

  try {
    // The isAiReadAllowed check above is purely LEXICAL. Without following the
    // link, a symlink planted inside an allowed dir (e.g. via a poisoned
    // cloud-restore archive) would let a prompt-injected [FILE_READ] read its
    // out-of-tree target — cleartext cloud API keys in ai-config.json, the
    // Discord token, arbitrary host files — and exfiltrate them to the AI
    // provider. lstat catches a leaf symlink; realpath + re-check catches a
    // symlinked ancestor directory. (SECURITY-LOG 2026-07-15.)
    const linkInfo = await lstat(resolved)
    if (linkInfo.isSymbolicLink()) {
      logSecurityEvent('ai.file_read.denied', { path: resolved, reason: 'symlink' })
      return { success: false, path: resolved, error: 'Access denied: symlinks are not permitted' }
    }
    const realResolved = await realpath(resolved)
    if (realResolved !== resolved && !isAiReadAllowed(realResolved)) {
      logSecurityEvent('ai.file_read.denied', { path: resolved, reason: 'symlink-escape' })
      return { success: false, path: resolved, error: 'Access denied: AI reads restricted to game data' }
    }

    const info = await stat(realResolved)

    if (!info.isFile()) {
      return { success: false, path: resolved, error: 'Path is not a file' }
    }

    if (info.size > MAX_FILE_SIZE) {
      return {
        success: false,
        path: resolved,
        error: `File too large: ${Math.round(info.size / 1024)} KB (max ${MAX_FILE_SIZE / 1024} KB)`
      }
    }

    const buffer = await readFile(realResolved)

    // Binary detection: check for null bytes in the first 8KB
    const checkLength = Math.min(buffer.length, 8192)
    for (let i = 0; i < checkLength; i++) {
      if (buffer[i] === 0) {
        return { success: false, path: resolved, error: 'File appears to be binary, not text' }
      }
    }

    const content = buffer.toString('utf-8')
    return { success: true, path: resolved, content }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return { success: false, path: resolved, error: 'File not found' }
    }
    if (code === 'EACCES' || code === 'EPERM') {
      return { success: false, path: resolved, error: 'Permission denied' }
    }
    return {
      success: false,
      path: resolved,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

/** Format file content for injection into the conversation. */
export function formatFileContent(result: FileReadResult): string {
  if (!result.success) {
    return `[FILE ERROR: ${result.path}]\n${result.error}\n[/FILE ERROR]`
  }
  return `[FILE CONTENT: ${result.path}]\n${result.content}\n[/FILE CONTENT]`
}

/** Maximum recursion depth for file reads. */
export { MAX_DEPTH as FILE_READ_MAX_DEPTH }
