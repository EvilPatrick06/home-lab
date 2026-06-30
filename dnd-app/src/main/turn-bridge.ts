/**
 * Main-process ephemeral-TURN credential client (PHASE-53B).
 *
 * Fetches a short-lived coturn credential from the Pi relay's
 * `GET /api/turn-credentials` (minted via the host-only shared secret, see
 * `bmo/pi/routes/turn_api.py`) from the MAIN process, so the renderer never
 * opens a direct http(s) connection to the Pi — mirroring `registry-bridge.ts`.
 *
 * Off-LAN the request carries the Cloudflare Access service-token headers
 * (`getBmoAccessHeaders`) so the tunnel-fronted endpoint is reachable; on-LAN
 * the headers are ignored. A short AbortController ceiling means an unreachable
 * Pi fails fast and the caller stays STUN-only (the PHASE-53A relay fallback
 * still covers a dead-ended join).
 */

import { getBmoAccessHeadersIfTrusted, getBmoBaseUrl } from './bmo-config'

export interface TurnCredentials {
  username: string
  credential: string
  ttl: number
  urls: string[]
  realm?: string
}

const TURN_TIMEOUT_MS = 5_000

function baseUrl(override?: string): string {
  const raw = (override ?? '').trim()
  if (raw) return raw.replace(/\/+$/, '')
  return getBmoBaseUrl()
}

export async function fetchTurnCredentials(baseOverride?: string): Promise<TurnCredentials | null> {
  const base = baseUrl(baseOverride)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS)
  try {
    const resp = await fetch(`${base}/api/turn-credentials`, {
      headers: getBmoAccessHeadersIfTrusted(),
      signal: controller.signal
    })
    if (!resp.ok) return null
    const data = (await resp.json()) as Partial<TurnCredentials>
    if (!data.username || !data.credential) return null
    return {
      username: data.username,
      credential: data.credential,
      ttl: typeof data.ttl === 'number' ? data.ttl : 3600,
      urls: Array.isArray(data.urls) ? data.urls : [],
      realm: data.realm
    }
  } catch {
    // Unreachable Pi / timeout / bad JSON — caller stays STUN-only.
    return null
  } finally {
    clearTimeout(timer)
  }
}
