/**
 * Resolved BMO Pi base URL (HTTP/HTTPS) for main-process fetches, cloud sync, and CSP.
 * Precedence: non-empty `bmoPiBaseUrl` in app settings (after load/save) →
 * mDNS-discovered Pi URL (via _bmo._tcp browse in lan-discovery.ts) →
 * `process.env.BMO_PI_URL` → `BMO_PI_URL_DEFAULT`.
 */

export const BMO_PI_URL_DEFAULT = 'http://bmo.local:5000'

let userOverrideUrl: string | null = null
let discoveredBmoUrl: string | null = null

function recompute(): string {
  if (userOverrideUrl) return userOverrideUrl
  if (discoveredBmoUrl) return discoveredBmoUrl
  return process.env.BMO_PI_URL || BMO_PI_URL_DEFAULT
}

let resolvedBmoBaseUrl: string = recompute()

export function getBmoBaseUrl(): string {
  return resolvedBmoBaseUrl
}

function normalizeUserBaseUrl(t: string): string | null {
  const s = t.trim()
  if (!s) return null
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return s.replace(/\/$/, '')
  } catch {
    return null
  }
}

/**
 * Call after `loadSettings()` at startup and whenever settings are saved.
 * Empty or invalid user URL falls back to env then default.
 */
export function applyBmoBaseUrlFromSettings(settings: { bmoPiBaseUrl?: string } | null | undefined): void {
  const raw = settings?.bmoPiBaseUrl
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const n = normalizeUserBaseUrl(String(raw))
    if (n) {
      userOverrideUrl = n
      resolvedBmoBaseUrl = recompute()
      return
    }
  }
  userOverrideUrl = null
  resolvedBmoBaseUrl = recompute()
}

/**
 * Called by lan-discovery.ts when an `_bmo._tcp` service is discovered or
 * disappears. The user-explicit setting still wins; this only contributes
 * when no override is set, so Windows users without Bonjour Print Services
 * can still reach the Pi without typing a URL into Settings.
 */
export function setDiscoveredBmoUrl(url: string | null): void {
  if (url) {
    const n = normalizeUserBaseUrl(url)
    discoveredBmoUrl = n ?? null
  } else {
    discoveredBmoUrl = null
  }
  resolvedBmoBaseUrl = recompute()
}

export function getDiscoveredBmoUrl(): string | null {
  return discoveredBmoUrl
}
