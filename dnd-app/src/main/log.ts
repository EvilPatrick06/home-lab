import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app } from 'electron'

const MAX_LOG_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_LOG_FILES = 3

function getLogDir(): string {
  let base = app.getPath('userData')
  // Guard against a Windows-style userData path leaking onto a non-Windows run
  // (e.g. a test/env override of `C:\\tmp`): posix `join` keeps `C:\\tmp` verbatim
  // and `mkdirSync` would create a literal `C:` directory under cwd. Fall back to
  // the OS temp dir when the path is not a valid absolute path for this platform.
  if (process.platform !== 'win32' && (/^[A-Za-z]:[\\/]/.test(base) || base.includes('\\') || !base.startsWith('/'))) {
    base = join(tmpdir(), 'dnd-app')
  }
  const dir = join(base, 'logs')
  mkdirSync(dir, { recursive: true })
  return dir
}

function rotateLogIfNeeded(logPath: string): void {
  try {
    const stats = statSync(logPath)
    if (stats.size >= MAX_LOG_SIZE) {
      for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
        try {
          renameSync(`${logPath}.${i}`, `${logPath}.${i + 1}`)
        } catch {
          /* ok */
        }
      }
      try {
        renameSync(logPath, `${logPath}.1`)
      } catch {
        /* ok */
      }
    }
  } catch {
    /* file doesn't exist yet */
  }
}

export function logToFile(level: string, message: string, stack?: string): void {
  try {
    const logPath = join(getLogDir(), 'app.log')
    rotateLogIfNeeded(logPath)
    const ts = new Date().toISOString()
    appendFileSync(logPath, `[${ts}] [${level}] ${message}${stack ? `\n${stack}` : ''}\n`, 'utf-8')
  } catch {
    /* logging must never crash the app */
  }
}
