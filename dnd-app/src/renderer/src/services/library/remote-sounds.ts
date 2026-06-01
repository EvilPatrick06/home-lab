import { resolveBmoBaseUrl } from '../../network/registry-client'

/**
 * Phase 47 / large-asset offload — Pi-hosted bundled-sound loader (the "CDN"
 * code path, audio side).
 *
 * The app ships ~130 MP3s under `public/sounds/`. They balloon the installer.
 * This module is the seam that lets those bundled clips load from the Pi's
 * library API when the Pi is reachable, with the BUNDLED file as the automatic
 * fallback — mirroring `remote-library.ts` for JSON. No user setting gates it.
 *
 * Why a manifest + a SYNCHRONOUS resolver (not an async per-file fetch like
 * `loadRemoteLibrary`): sounds are created with `new Audio(path)` at synchronous
 * call sites (`sound-manager.init`, `sound-playback.playAmbient`). Making those
 * async would ripple through pool construction and playback. Instead:
 *
 *   1. {@link prewarmRemoteSounds} fetches the Pi sounds-manifest ONCE per
 *      session (time-boxed, best-effort) and caches the set of served rel-paths
 *      plus the resolved base URL. Call it off the hot path (e.g. from
 *      `sound-manager.reinit`).
 *   2. {@link resolveSoundUrl} is synchronous: given a bundled `./sounds/...`
 *      path it returns the Pi URL IFF the manifest is warm AND lists that file,
 *      else it returns the bundled path unchanged. So the first session (cold
 *      manifest) and every offline session use bundled files; once the manifest
 *      warms, subsequent `new Audio()` calls prefer the Pi copy.
 *
 * Pi-side contract (NOT yet implemented in BMO — `routes/library_api.py` serves
 * only `.json`). When BMO grows a sounds endpoint it MUST expose:
 *   - `GET /api/sounds/manifest` → `{ version, files: { "<rel>": { size } } }`
 *     where `<rel>` is the path WITHOUT the leading `./sounds/`
 *     (e.g. `dice/d20-1.mp3`, `ambient/tavern.mp3`).
 *   - `GET /api/sounds/file?path=<rel>` → the raw audio bytes
 *     (`Content-Type: audio/mpeg`, `Access-Control-Allow-Origin: *`).
 * Until that lands, the manifest fetch 404s → empty set → every sound stays
 * bundled, so nothing breaks online or offline.
 *
 * Deps (fetch / base-URL) are injectable for tests.
 */

interface SoundsManifest {
  version: string
  files: Record<string, { size: number }>
}

interface RemoteSoundDeps {
  fetchFn: typeof fetch
  resolveBaseUrl: (override?: string) => Promise<string>
}

// Time-box the manifest fetch so an unreachable / hung Pi resolves to "bundled
// only" quickly instead of stalling the prewarm.
const REMOTE_TIMEOUT_MS = 3_000

const deps: RemoteSoundDeps = {
  fetchFn: (input, init) => fetch(input, init),
  resolveBaseUrl: resolveBmoBaseUrl
}

// Per-session state. `warmed` flips true after the first prewarm attempt
// (success or failure) so `resolveSoundUrl` knows whether the empty set means
// "not fetched yet" vs "fetched, nothing served". `servedRels` is the set of
// rel-paths the Pi serves; `baseUrl` is the resolved Pi origin.
let warmed = false
let inFlight: Promise<void> | null = null
let servedRels: Set<string> = new Set()
let baseUrl: string | null = null

/** Test-only — inject fake deps. */
export function __setRemoteSoundDeps(partial: Partial<RemoteSoundDeps>): void {
  Object.assign(deps, partial)
}

/** Test-only — clear the per-session caches. */
export function __resetRemoteSounds(): void {
  warmed = false
  inFlight = null
  servedRels = new Set()
  baseUrl = null
}

/** `./sounds/dice/d20-1.mp3` → `dice/d20-1.mp3`; non-`./sounds/` paths → null. */
export function mapSoundPathToRel(path: string): string | null {
  const m = path.replace(/^\.\//, '').match(/^sounds\/(.+\.mp3)$/)
  return m ? m[1] : null
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REMOTE_TIMEOUT_MS)
  try {
    return await deps.fetchFn(url, { signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch the Pi sounds-manifest once per session and cache which clips it serves.
 * Best-effort and idempotent: concurrent calls share one in-flight request, and
 * any error (unreachable Pi, no endpoint, timeout) just leaves the served set
 * empty so {@link resolveSoundUrl} keeps returning bundled paths. Safe to call
 * eagerly off the hot path.
 */
export function prewarmRemoteSounds(): Promise<void> {
  if (warmed) return Promise.resolve()
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const base = await deps.resolveBaseUrl()
      const resp = await fetchWithTimeout(`${base}/api/sounds/manifest`)
      if (resp.ok) {
        const manifest = (await resp.json()) as SoundsManifest
        servedRels = new Set(Object.keys(manifest?.files ?? {}))
        baseUrl = base
      }
    } catch {
      // Unreachable / no endpoint / timeout — bundled-only this session.
    } finally {
      warmed = true
      inFlight = null
    }
  })()
  return inFlight
}

/**
 * Resolve a bundled `./sounds/...` path to the URL an `Audio` element should
 * load. Returns the Pi-hosted URL when the manifest is warm AND lists the clip,
 * otherwise the bundled path unchanged. Synchronous so it drops into existing
 * `new Audio(resolveSoundUrl(path))` call sites without making them async.
 */
export function resolveSoundUrl(bundledPath: string): string {
  if (!warmed || baseUrl === null) return bundledPath
  const rel = mapSoundPathToRel(bundledPath)
  if (rel === null || !servedRels.has(rel)) return bundledPath
  return `${baseUrl}/api/sounds/file?path=${encodeURIComponent(rel)}`
}
