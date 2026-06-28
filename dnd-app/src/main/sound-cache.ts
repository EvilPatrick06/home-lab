/**
 * Thin-installer sound cache (main process).
 *
 * The app NO LONGER bundles the ~130 MP3s under `public/sounds/` — dropping them
 * shrinks the installer by ~12 MB. Instead, sounds are fetched from the Pi on
 * demand (`GET /api/sounds/file?path=<rel>`) and written to a disk cache under
 * `userData/sound-cache/<rel>`. After the first online use a clip is served from
 * disk, so it works offline thereafter. The bundled file is GONE, so the only
 * live (uncached) fallback is the Pi HTTP URL — see `remote-sounds.ts`.
 *
 * Pi-side contract (served by BMO `routes/library_api.py`):
 *   - `GET /api/sounds/manifest` → `{ version, files: { "<rel>": { size } } }`
 *     where `<rel>` is the path WITHOUT a leading `./sounds/`
 *     (e.g. `dice/d20-1.mp3`, `ambient/tavern.mp3`).
 *   - `GET /api/sounds/file?path=<rel>` → the raw audio bytes.
 *
 * Two operations are exposed (over IPC):
 *   - {@link cacheGetSound}(rel) → an absolute on-disk path for the clip, fetching
 *     + caching it first if absent; null on any failure (offline, no endpoint).
 *   - {@link prewarmSoundCache}() → download every manifest clip in the background
 *     with bounded concurrency, so resolution stays warm without per-clip waits.
 *
 * Deps (fetch / base-URL / access headers / cache dir) are injectable for tests.
 */

import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, rename, stat, unlink } from 'node:fs/promises'
import { dirname, isAbsolute, join, normalize, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { app } from 'electron'
import { getBmoAccessHeaders, getBmoBaseUrl, isBmoBaseSecretTrusted } from './bmo-config'
import { logToFile } from './log'

interface SoundsManifest {
  version: string
  files: Record<string, { size: number }>
}

interface SoundCacheDeps {
  fetchFn: typeof fetch
  getBaseUrl: () => string
  getHeaders: () => Record<string, string>
  /** Absolute root for the on-disk cache. Lazily defaults to userData/sound-cache. */
  cacheDir: () => string
}

// Per-file download must fail fast so a hung/unreachable Pi doesn't stall the
// caller (a `new Audio()` site is waiting on the resolved path).
const FILE_TIMEOUT_MS = 15_000
// Manifest fetch (drives prewarm) — short ceiling; an unreachable Pi resolves to
// "nothing to prewarm" quickly.
const MANIFEST_TIMEOUT_MS = 5_000
// Bounded parallelism for the background prewarm so we don't open 130 sockets at
// once against the Pi / saturate the tunnel.
const PREWARM_CONCURRENCY = 4

const deps: SoundCacheDeps = {
  fetchFn: (input, init) => fetch(input, init),
  getBaseUrl: getBmoBaseUrl,
  // Only attach the Cloudflare-Access service token when the base is the https
  // tunnel (secret-trusted); never leak it to an auto-discovered http LAN host.
  getHeaders: () => (isBmoBaseSecretTrusted() ? getBmoAccessHeaders() : {}),
  cacheDir: () => join(app.getPath('userData'), 'sound-cache')
}

/** Test-only — inject fake deps. */
export function __setSoundCacheDeps(partial: Partial<SoundCacheDeps>): void {
  Object.assign(deps, partial)
}

// A single in-flight prewarm shared across callers (idempotent within a run).
let prewarmInFlight: Promise<void> | null = null

/**
 * Validate + resolve a manifest rel-path to an absolute path under the cache
 * root. Rejects absolute paths, `..` traversal, and anything that escapes the
 * cache dir. Returns null on a malformed rel.
 */
function resolveCachePath(rel: string): string | null {
  if (typeof rel !== 'string' || rel.length === 0) return null
  // Reject leading `./sounds/` — callers pass the bare rel (`dice/d20-1.mp3`).
  if (isAbsolute(rel) || rel.includes('\0')) return null
  const normalized = normalize(rel)
  if (normalized.startsWith('..') || normalized.includes(`..${sep}`) || isAbsolute(normalized)) {
    return null
  }
  const root = deps.cacheDir()
  const full = join(root, normalized)
  // Final containment check (defense-in-depth against odd normalize results).
  if (full !== root && !full.startsWith(root + sep)) return null
  return full
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isFile() && s.size > 0
  } catch {
    return false
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await deps.fetchFn(url, { signal: controller.signal, headers: deps.getHeaders() })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Download `rel` from the Pi and write it atomically into the cache. Writes to a
 * `.<random>.part` sibling then renames so a half-written file is never observed
 * as cached. Throws on any failure (caller maps to null).
 */
async function downloadToCache(rel: string, dest: string): Promise<void> {
  const base = deps.getBaseUrl()
  const url = `${base}/api/sounds/file?path=${encodeURIComponent(rel)}`
  const resp = await fetchWithTimeout(url, FILE_TIMEOUT_MS)
  if (!resp.ok || !resp.body) {
    throw new Error(`sound fetch ${rel} → ${resp.status}`)
  }
  await mkdir(dirname(dest), { recursive: true })
  const tmp = `${dest}.${randomUUID()}.part`
  try {
    // resp.body is a web ReadableStream; Readable.fromWeb bridges it to Node fs.
    await pipeline(Readable.fromWeb(resp.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(tmp))
    await rename(tmp, dest)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw err
  }
}

/**
 * Return an absolute on-disk path for a cached clip, fetching + caching it first
 * if absent. `rel` is the bare manifest rel-path (`dice/d20-1.mp3`). Returns null
 * on a malformed rel or any download failure (offline, no endpoint, timeout) so
 * the renderer can fall back to the live Pi URL.
 */
export async function cacheGetSound(rel: string): Promise<string | null> {
  const dest = resolveCachePath(rel)
  if (dest === null) {
    logToFile('warn', `[sound-cache] rejected rel path: ${rel}`)
    return null
  }
  if (await fileExists(dest)) return dest
  try {
    await downloadToCache(rel, dest)
    return dest
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logToFile('warn', `[sound-cache] download failed for ${rel}: ${msg}`)
    return null
  }
}

/** Fetch the Pi sounds-manifest. Returns the rel-path list, or [] on failure. */
async function fetchManifestRels(): Promise<string[]> {
  try {
    const base = deps.getBaseUrl()
    const resp = await fetchWithTimeout(`${base}/api/sounds/manifest`, MANIFEST_TIMEOUT_MS)
    if (!resp.ok) return []
    const manifest = (await resp.json()) as SoundsManifest
    return Object.keys(manifest?.files ?? {})
  } catch {
    return []
  }
}

/**
 * Download every manifest clip not yet cached, with bounded concurrency. Runs in
 * the background and is best-effort: per-file failures are swallowed (already
 * logged by {@link cacheGetSound}). Idempotent within a run — concurrent calls
 * share the in-flight promise. Once it resolves the caches are warm enough that
 * subsequent `cacheGetSound` calls return cached paths without a network wait.
 */
export function prewarmSoundCache(): Promise<void> {
  if (prewarmInFlight) return prewarmInFlight
  const run = (async () => {
    const rels = await fetchManifestRels()
    if (rels.length === 0) return
    let cursor = 0
    const next = async (): Promise<void> => {
      while (cursor < rels.length) {
        const rel = rels[cursor++]
        // cacheGetSound never throws; a failed clip just stays uncached.
        await cacheGetSound(rel)
      }
    }
    const workers: Promise<void>[] = []
    for (let i = 0; i < Math.min(PREWARM_CONCURRENCY, rels.length); i++) {
      workers.push(next())
    }
    await Promise.all(workers)
  })()
  // Allow a fresh prewarm on the next call once this run settles.
  prewarmInFlight = run.finally(() => {
    prewarmInFlight = null
  })
  return prewarmInFlight
}
