/**
 * Resolved BMO Pi base URL (HTTP/HTTPS) for main-process fetches, cloud sync, and CSP.
 * Precedence: non-empty `bmoPiBaseUrl` in app settings (after load/save) →
 * `process.env.BMO_PI_URL` → `BMO_PI_URL_DEFAULT`.
 */

export const BMO_PI_URL_DEFAULT = 'http://bmo.local:5000'

let resolvedBmoBaseUrl: string = process.env.BMO_PI_URL || BMO_PI_URL_DEFAULT

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
      resolvedBmoBaseUrl = n
      return
    }
  }
  resolvedBmoBaseUrl = process.env.BMO_PI_URL || BMO_PI_URL_DEFAULT
}
