import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

const MAX_LOG_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_LOG_FILES = 3

function getLogDir(): string {
  const dir = join(app.getPath('userData'), 'logs')
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
