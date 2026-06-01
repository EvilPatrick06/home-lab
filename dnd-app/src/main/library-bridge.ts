/**
 * Main-process Pi 5e-library fetcher.
 *
 * The renderer's `remote-library.ts` used to fetch the Pi's
 * `/api/library/manifest` + `/api/library/file` directly. Those fetches now run
 * HERE, so the renderer never opens a direct http(s) connection to the Pi for
 * library data. The renderer still owns the localStorage content-hash cache and
 * the bundled-data fallback; this module just returns the raw bytes (manifest
 * JSON, file text) over IPC.
 *
 * Fetches are time-boxed (REMOTE_TIMEOUT_MS) so an unreachable/hung Pi falls
 * back to bundled data quickly. Off-LAN requests carry the Cloudflare Access
 * service-token headers so the tunnel-fronted endpoint is reachable.
 */

import { getBmoAccessHeaders, getBmoBaseUrl } from './bmo-config'

// Time-box remote fetches so an unreachable / hung Pi falls back to bundled
// data quickly instead of stalling the first library load.
const REMOTE_TIMEOUT_MS = 3_000

export interface LibraryManifest {
  version: string
  files: Record<string, { sha256: string; size: number }>
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS)
  try {
    return await fetch(url, { headers: { ...getBmoAccessHeaders() }, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/** Fetch the Pi library manifest, or `null` if unreachable / non-2xx / invalid. */
export async function fetchLibraryManifest(): Promise<LibraryManifest | null> {
  try {
    const resp = await fetchWithTimeout(`${getBmoBaseUrl()}/api/library/manifest`)
    if (!resp.ok) return null
    return (await resp.json()) as LibraryManifest
  } catch {
    return null
  }
}

/**
 * Fetch a single served library file (by its manifest rel-path), returning the
 * raw JSON text, or `null` if unreachable / non-2xx. The renderer parses +
 * caches the text by content hash.
 */
export async function fetchLibraryFile(rel: string): Promise<string | null> {
  try {
    const resp = await fetchWithTimeout(`${getBmoBaseUrl()}/api/library/file?path=${encodeURIComponent(rel)}`)
    if (!resp.ok) return null
    return await resp.text()
  } catch {
    return null
  }
}
