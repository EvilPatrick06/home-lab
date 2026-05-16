import { logger } from './logger'

const CLIENT_ID_KEY = 'dndapp:client-id'

let cachedClientId: string | null = null

/**
 * Return a stable per-installation identifier for this VTT client.
 *
 * Generated on first call via `crypto.randomUUID()` and persisted to
 * localStorage. Survives reloads, used as the canonical identity for ban
 * lists, registry filtering, and reconnect-resync. Clearing browser data
 * (or reinstalling) resets it — that's an accepted bypass for a TTRPG
 * friend-group VTT (no real auth surface).
 */
export function getOrCreateClientId(): string {
  if (cachedClientId) return cachedClientId

  try {
    const existing = localStorage.getItem(CLIENT_ID_KEY)
    if (existing && existing.length > 0) {
      cachedClientId = existing
      return existing
    }
  } catch (e) {
    logger.warn('[client-id] localStorage read failed:', e)
  }

  const fresh = crypto.randomUUID()
  try {
    localStorage.setItem(CLIENT_ID_KEY, fresh)
  } catch (e) {
    logger.warn('[client-id] localStorage write failed:', e)
  }
  cachedClientId = fresh
  return fresh
}

/**
 * Test-only — clears the in-memory cache so a fresh `getOrCreateClientId`
 * call re-reads localStorage.
 */
export function resetClientIdCache(): void {
  cachedClientId = null
}
