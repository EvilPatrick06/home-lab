import { resolveBmoBaseUrl } from '../../network/registry-client'
import { resolveAssetUrl } from '../../utils/asset-url'

/**
 * Sound URL resolver (renderer side).
 *
 * The ~130 bundled MP3s under `public/sounds/` ship with the app (the
 * `!out/renderer/sounds/**` package exclusion that dropped them was removed —
 * it broke this resolver's own bundled-path fallback, so every clip 404'd
 * (`net::ERR_FILE_NOT_FOUND`) whenever the Pi was cold/unreachable). The
 * Pi-hosted copies remain a bandwidth optimization: the MAIN process can
 * pre-download them into a disk cache (`src/main/sound-cache.ts`, IPC
 * `sound-cache:get` / `sound-cache:prewarm`) so a warmed clip plays from the
 * local cache (or streams from the Pi) instead of the bundled file. Because the
 * bundled file is always present, a clip never 404s.
 *
 * {@link resolveSoundUrl} resolves in this order:
 *   1. CACHED on disk → `file://<userData>/sound-cache/<rel>` (Pi offload, warm).
 *   2. else served-but-not-yet-cached → the live Pi HTTP URL
 *      `<base>/api/sounds/file?path=<rel>` so `new Audio()` can stream it
 *      directly (governed by CSP `media-src`, which permits `http:`/`file:`,
 *      not `connect-src`).
 *   3. else → the bundled `./sounds/<rel>` path (always shipped in the package).
 *   4. non-`./sounds/` paths (custom user tracks, absolute paths) pass through
 *      unchanged.
 *
 * Why a SYNCHRONOUS resolver (not an async per-file fetch): sounds are created
 * with `new Audio(path)` at synchronous call sites (`sound-manager.init`,
 * `sound-playback.playAmbient`). Making those async would ripple through pool
 * construction and playback. Instead:
 *
 *   1. {@link prewarmRemoteSounds} (off the hot path, e.g. `sound-manager.reinit`)
 *      asks main to download the whole manifest into the disk cache
 *      (`window.api.sounds.prewarm()`), fetches the manifest to learn which clips
 *      the Pi serves, and resolves each served clip's cached on-disk path via
 *      `window.api.sounds.cacheGet(rel)` into a warm map + records the resolved
 *      Pi base URL.
 *   2. {@link resolveSoundUrl} is synchronous: it reads that warm map. A cached
 *      clip → `file://` URL; a served-but-not-yet-cached clip → the Pi HTTP URL;
 *      otherwise the path is returned unchanged.
 *
 * Pi-side contract (served by BMO `routes/library_api.py`):
 *   - `GET /api/sounds/manifest` → `{ version, files: { "<rel>": { size } } }`
 *     (`<rel>` WITHOUT the leading `./sounds/`, e.g. `dice/d20-1.mp3`).
 *   - `GET /api/sounds/file?path=<rel>` → the raw audio bytes.
 *
 * Offline / no-Pi / cold cache: clips play from the bundled files (precedence
 * step 3). The Pi cache only avoids re-loading the bundled copy when warm.
 *
 * Deps (fetch / base-URL / IPC bridge) are injectable for tests.
 */

interface SoundsManifest {
  version: string
  files: Record<string, { size: number }>
}

interface SoundsBridge {
  cacheGet: (rel: string) => Promise<string | null>
  prewarm: () => Promise<{ ok: boolean }>
}

interface RemoteSoundDeps {
  fetchFn: typeof fetch
  resolveBaseUrl: (override?: string) => Promise<string>
  /** The main-process IPC bridge. Null when unavailable (web/test default). */
  getBridge: () => SoundsBridge | null
}

// Time-box the manifest fetch so an unreachable / hung Pi resolves quickly.
const REMOTE_TIMEOUT_MS = 3_000

function defaultBridge(): SoundsBridge | null {
  const api = (globalThis as { window?: { api?: { sounds?: SoundsBridge } } }).window?.api
  return api?.sounds ?? null
}

const deps: RemoteSoundDeps = {
  fetchFn: (input, init) => fetch(input, init),
  resolveBaseUrl: resolveBmoBaseUrl,
  getBridge: defaultBridge
}

// Per-session state. `warmed` flips true after the first prewarm attempt
// (success or failure). `servedRels` is the set of rel-paths the Pi serves;
// `cachedPaths` maps a served rel → its absolute on-disk cache path (once main
// has it cached); `baseUrl` is the resolved Pi origin for the live HTTP fallback.
let warmed = false
let inFlight: Promise<void> | null = null
let servedRels: Set<string> = new Set()
let cachedPaths: Map<string, string> = new Map()
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
  cachedPaths = new Map()
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

/** Convert an absolute on-disk path to a `file://` URL `new Audio()` can load. */
function toFileUrl(absPath: string): string {
  // Normalize Windows backslashes + drive letters; encode each segment.
  const normalized = absPath.replace(/\\/g, '/')
  const withSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
  const encoded = withSlash
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/')
  return `file://${encoded}`
}

/**
 * Warm the resolver once per session: kick off the main-process background
 * prewarm (downloads the whole manifest into the disk cache), then fetch the Pi
 * sounds-manifest and resolve each served clip's cached on-disk path into the
 * warm map. Best-effort and idempotent: concurrent calls share one in-flight
 * promise; any error (unreachable Pi, no endpoint, timeout, no IPC bridge) just
 * leaves the maps empty so {@link resolveSoundUrl} falls back to the live Pi URL
 * (or the path unchanged). Safe to call eagerly off the hot path.
 */
export function prewarmRemoteSounds(): Promise<void> {
  if (warmed) return Promise.resolve()
  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const bridge = deps.getBridge()
      // Tell main to download everything into the disk cache in the background.
      void bridge?.prewarm()

      const base = await deps.resolveBaseUrl()
      const resp = await fetchWithTimeout(`${base}/api/sounds/manifest`)
      if (resp.ok) {
        const manifest = (await resp.json()) as SoundsManifest
        servedRels = new Set(Object.keys(manifest?.files ?? {}))
        baseUrl = base
        // Resolve cached on-disk paths for served clips (best-effort, parallel).
        if (bridge) {
          await Promise.all(
            [...servedRels].map(async (rel) => {
              try {
                const abs = await bridge.cacheGet(rel)
                if (abs) cachedPaths.set(rel, abs)
              } catch {
                // leave uncached → live Pi URL fallback
              }
            })
          )
        }
      }
    } catch {
      // Unreachable / no endpoint / timeout — empty maps → live URL / pass-through.
    } finally {
      warmed = true
      inFlight = null
    }
  })()
  return inFlight
}

/**
 * Resolve a bundled `./sounds/...` path to the URL an `Audio` element should
 * load. Synchronous so it drops into existing `new Audio(resolveSoundUrl(path))`
 * call sites. Precedence: cached on-disk `file://` URL → live Pi HTTP URL (when
 * the manifest is warm and lists the clip) → the bundled `./sounds/...` path
 * (which ships in the package, so it always resolves).
 */
export function resolveSoundUrl(bundledPath: string): string {
  const rel = mapSoundPathToRel(bundledPath)
  if (rel === null) return bundledPath
  const cached = cachedPaths.get(rel)
  if (cached) return toFileUrl(cached)
  // No cached copy yet. If the manifest is warm and serves this clip, stream it
  // live from the Pi (saves loading the bundled copy).
  if (warmed && baseUrl !== null && servedRels.has(rel)) {
    return `${baseUrl}/api/sounds/file?path=${encodeURIComponent(rel)}`
  }
  // Cold manifest / not served — fall back to the bundled file. It ships in the
  // package (the `!out/renderer/sounds/**` exclusion was removed). WEB-AP-1:
  // route it through resolveAssetUrl so the `./sounds/<rel>` path resolves
  // against the Vite base on the web build too (no-op on desktop).
  return resolveAssetUrl(bundledPath)
}
