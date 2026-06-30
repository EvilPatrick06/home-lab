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

/**
 * Whether the currently-resolved base URL is trusted to receive credentials
 * (BMO_API_KEY Bearer, Cloudflare-Access service token) and user data (campaign
 * backup archives). Trusted only when the user explicitly typed the URL
 * (userOverrideUrl) OR it is an https endpoint (the Cloudflare-fronted tunnel /
 * an explicit https Pi). An AUTO-DISCOVERED http LAN host (mDNS advert or LAN
 * sweep) is NOT secret-trusted: it passed only a liveness/identity probe, which
 * cannot prove it is the real Pi, so it must never be sent secrets or backups.
 * See SECURITY-LOG "dnd-app adopts ANY LAN host answering /health".
 */
export function isBmoBaseSecretTrusted(): boolean {
  if (userOverrideUrl) return true
  try {
    return new URL(resolvedBmoBaseUrl).protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Base URL for CREDENTIALED / data-bearing requests (rclone backup & restore).
 * Never returns an auto-discovered http LAN host: when the resolved base is not
 * secret-trusted, fall back to an explicit https env URL if set, else the https
 * tunnel default. Public, unauthenticated requests (game-registry listing,
 * sound files) may keep using getBmoBaseUrl().
 */
export function getBmoSecretBaseUrl(): string {
  if (isBmoBaseSecretTrusted()) return resolvedBmoBaseUrl
  const envUrl = process.env.BMO_PI_URL
  if (envUrl) {
    try {
      if (new URL(envUrl).protocol === 'https:') return envUrl
    } catch {
      // malformed env URL — ignore and use the tunnel default
    }
  }
  return BMO_PI_URL_DEFAULT
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

/**
 * CF-Access service-token headers, but ONLY when the resolved base URL is
 * secret-trusted (isBmoBaseSecretTrusted()). Use this for any credentialed fetch
 * made against getBmoBaseUrl(): an auto-discovered http LAN host (which passed
 * only a /health identity probe, not proof it is the real Pi) must never receive
 * the Cloudflare-Access service token. Returns {} for a non-secret-trusted base.
 * Mirrors the gated pattern already used in sound-cache.ts. See SECURITY-LOG
 * "CF-Access service token + user account JWT still leak to an auto-discovered
 * http LAN BMO host".
 */
export function getBmoAccessHeadersIfTrusted(): Record<string, string> {
  if (!isBmoBaseSecretTrusted()) return {}
  return getBmoAccessHeaders()
}
