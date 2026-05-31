/**
 * Resolved BMO Pi base URL (HTTP/HTTPS) for main-process fetches, cloud sync, and CSP.
 * Precedence: non-empty `bmoPiBaseUrl` in app settings (after load/save) →
 * mDNS-discovered Pi URL (via _bmo._tcp browse in lan-discovery.ts) →
 * `process.env.BMO_PI_URL` → `BMO_PI_URL_DEFAULT`.
 *
 * The default points at the public Cloudflare Tunnel hostname so off-LAN
 * players can hit `/api/games*` (game-discovery registry) without any
 * local network setup. The tunnel is owned by the Pi at home; LAN users
 * still get LAN-direct routing via mDNS, which beats the tunnel because
 * it skips the Cloudflare edge hop. The default only kicks in when mDNS
 * times out and no settings override is set.
 */

export const BMO_PI_URL_DEFAULT = 'https://bmo.mybmoai.work'

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

// ── BMO sync-receiver shared secret (Phase 28a.4) ────────────────
// Precedence: process.env.BMO_API_KEY → user-set settings value → undefined.
// When undefined, the sync receiver logs a one-time warning and accepts
// unauthenticated requests; the bind already restricts reach to loopback
// (or whatever BMO_SYNC_BIND is set to).

let userBmoApiKey: string | null = null

export function getBmoApiKey(): string | undefined {
  const fromEnv = process.env.BMO_API_KEY
  if (fromEnv && fromEnv.trim() !== '') return fromEnv
  if (userBmoApiKey && userBmoApiKey.trim() !== '') return userBmoApiKey
  return undefined
}

export function applyBmoApiKeyFromSettings(settings: { bmoApiKey?: string } | null | undefined): void {
  const raw = settings?.bmoApiKey
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    userBmoApiKey = String(raw)
  } else {
    userBmoApiKey = null
  }
}

// ── Cloudflare Access service token (off-LAN Pi auth) ────────────────
// The BMO Pi is fronted by a Cloudflare Access app; off-LAN requests to the
// tunnel get 302-redirected to a login unless they carry a service token.
// The token is baked into the MAIN bundle at build time (electron.vite.config
// `main.define` ← CI/build secrets), so installed apps reach Pi/cloud features
// off-LAN with NO per-user setup, while the endpoints stay private from the
// public internet (only holders of the token get through). Read defensively:
// the defines are unassigned in dev/test, so a bare reference would throw.
export function getBmoAccessHeaders(): Record<string, string> {
  const id = typeof __CF_ACCESS_CLIENT_ID__ !== 'undefined' ? __CF_ACCESS_CLIENT_ID__ : ''
  const secret = typeof __CF_ACCESS_CLIENT_SECRET__ !== 'undefined' ? __CF_ACCESS_CLIENT_SECRET__ : ''
  if (!id || !secret) return {}
  return { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret }
}
