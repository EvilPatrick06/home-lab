import { isAbsolute, relative, resolve } from 'node:path'
import { app } from 'electron'

/**
 * Renderer-supplied path allowlist (PHASE-13 13B — extracted verbatim from index.ts
 * as a leaf module so storage-handlers can enforce it without an import cycle).
 *
 * The main process must never trust a raw renderer path. A path is allowed only if
 * it lives under the app's userData subtree OR was just returned by a file dialog
 * (TTL'd). Used by fs:read/write and BOOK_IMPORT.
 */

// Paths returned by file dialogs; values are timestamps for TTL expiry.
const dialogAllowedPaths = new Map<string, number>()
const DIALOG_PATH_TTL = 300_000 // 5 minutes

export function addDialogPath(p: string): void {
  dialogAllowedPaths.set(resolve(p), Date.now())
}

/** Consume a dialog path after a one-shot write so it can't be reused. */
export function consumeDialogPath(p: string): void {
  dialogAllowedPaths.delete(resolve(p))
}

function isDialogPathValid(p: string): boolean {
  const resolved = resolve(p)
  const timestamp = dialogAllowedPaths.get(resolved)
  if (timestamp === undefined) return false
  if (Date.now() - timestamp >= DIALOG_PATH_TTL) {
    dialogAllowedPaths.delete(resolved)
    return false
  }
  return true
}

export function isPathAllowed(targetPath: string): boolean {
  const resolved = resolve(targetPath)
  const userData = resolve(app.getPath('userData'))

  // Allow anything under the app's userData directory
  // Use path.relative() to prevent traversal attacks (e.g., "userData/../../../etc/passwd")
  const rel = relative(userData, resolved)
  if (rel && !rel.startsWith('..') && !isAbsolute(rel)) {
    return true
  }

  // Allow paths the user explicitly selected via a file dialog (with TTL check)
  if (isDialogPathValid(resolved)) {
    return true
  }

  return false
}
