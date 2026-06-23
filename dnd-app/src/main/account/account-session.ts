/**
 * Persisted account session for the Electron desktop app.
 *
 * The bearer token is stored encrypted (OS keystore via safe-secret-storage,
 * same as the Discord bot token) in `userData/account-session.json`, SEPARATE
 * from settings.json so it never rides along with the (cloud-synced) settings.
 * The cached user profile is kept alongside for offline display.
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { AccountUser } from '../../shared/account-types'
import { logToFile } from '../log'
import { decryptOptional, encryptOptional } from '../storage/safe-secret-storage'

interface StoredSession {
  token: string
  user: AccountUser | null
}

function filePath(): string {
  return join(app.getPath('userData'), 'account-session.json')
}

// `undefined` = not yet loaded from disk; `null` = loaded, no session.
let cache: StoredSession | null | undefined

function load(): StoredSession | null {
  if (cache !== undefined) return cache
  try {
    if (!existsSync(filePath())) {
      cache = null
      return null
    }
    const raw = JSON.parse(readFileSync(filePath(), 'utf-8')) as { token?: string; user?: AccountUser | null }
    const token = decryptOptional(raw.token)
    cache = token ? { token, user: raw.user ?? null } : null
  } catch (err) {
    logToFile('ERROR', 'account-session read failed:', String(err))
    cache = null
  }
  return cache
}

export function getToken(): string | null {
  return load()?.token ?? null
}

export function getUser(): AccountUser | null {
  return load()?.user ?? null
}

export function setSession(token: string, user: AccountUser | null): void {
  cache = { token, user }
  try {
    writeFileSync(filePath(), JSON.stringify({ token: encryptOptional(token), user }), { mode: 0o600 })
  } catch (err) {
    logToFile('ERROR', 'account-session write failed:', String(err))
  }
}

export function clearSession(): void {
  cache = null
  try {
    if (existsSync(filePath())) rmSync(filePath())
  } catch (err) {
    logToFile('ERROR', 'account-session clear failed:', String(err))
  }
}
