/**
 * AI DM File Reading — parses [FILE_READ] tags from AI responses,
 * reads requested files with safety constraints, and formats content
 * for injection back into the conversation.
 */

import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { app } from 'electron'

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

/** Check whether a resolved path falls within the app's userData directory. */
function isPathWithinUserData(resolvedPath: string): boolean {
  const userData = resolve(app.getPath('userData'))
  const rel = relative(userData, resolvedPath)
  return !!rel && !rel.startsWith('..') && !isAbsolute(rel)
}

/** Read a file from disk with safety constraints. */
export async function readRequestedFile(filePath: string): Promise<FileReadResult> {
  const resolved = resolve(filePath)

  if (!isPathWithinUserData(resolved)) {
    return {
      success: false,
      path: resolved,
      error: 'Access denied: file reads are restricted to app data directories'
    }
  }

  try {
    const info = await stat(resolved)

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

    const buffer = await readFile(resolved)

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
