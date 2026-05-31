import { resolveBmoBaseUrl } from '../../network/registry-client'

/**
 * Phase 36 / R-lib — remote (Pi-hosted) 5e library loader.
 *
 * The Pi library is the DEFAULT source — there is no user setting. On every 5e
 * data load, `data-provider.loadJson` tries this first: it fetches the Pi's
 * `/api/library/manifest` (once per session), maps the requested `./data/5e/...`
 * path to the served rel-path, and returns the file — served from a
 * `localStorage` cache keyed by the file's content hash, or fetched from
 * `/api/library/file` and cached. ANY miss / error / unreachable-Pi returns
 * `null`, so the caller AUTOMATICALLY falls back to the bundled (canonical)
 * file. Fetches are time-boxed (REMOTE_TIMEOUT_MS) so an unreachable Pi falls
 * back fast; the manifest result is cached per session (`null` = "don't retry"),
 * so the one-time cost is paid only on the first load. This is a best-effort
 * cache/CDN layer, never a source of truth.
 *
 * Deps (fetch / localStorage / base-URL) are injectable for tests.
 */

interface LibraryManifest {
  version: string
  files: Record<string, { sha256: string; size: number }>
}

interface RemoteDeps {
  fetchFn: typeof fetch
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  resolveBaseUrl: (override?: string) => Promise<string>
}

// Time-box remote fetches so an unreachable / hung Pi falls back to bundled data
// quickly instead of stalling the first library load.
const REMOTE_TIMEOUT_MS = 3_000

const deps: RemoteDeps = {
  fetchFn: (input, init) => fetch(input, init),
  getItem: (key) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* quota / unavailable — caching is best-effort */
    }
  },
  resolveBaseUrl: resolveBmoBaseUrl
}

// Per-session caches. `manifestCache === undefined` means "not yet fetched";
// `null` means "fetched but unavailable" (don't retry this session).
let manifestCache: LibraryManifest | null | undefined
let baseCache: string | undefined

/** Test-only — inject fake deps. */
export function __setRemoteLibraryDeps(partial: Partial<RemoteDeps>): void {
  Object.assign(deps, partial)
}

/** Test-only — clear the per-session caches. */
export function __resetRemoteLibrary(): void {
  manifestCache = undefined
  baseCache = undefined
}

/** `./data/5e/spells/spells.json` → `spells/spells.json`; non-5e paths → null. */
export function mapDataPathToRel(path: string): string | null {
  const m = path.replace(/^\.\//, '').match(/^data\/5e\/(.+\.json)$/)
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

async function getManifest(base: string): Promise<LibraryManifest | null> {
  if (manifestCache !== undefined) return manifestCache
  try {
    const resp = await fetchWithTimeout(`${base}/api/library/manifest`)
    manifestCache = resp.ok ? ((await resp.json()) as LibraryManifest) : null
  } catch {
    manifestCache = null
  }
  return manifestCache
}

/**
 * Return the Pi-hosted JSON for `path`, or `null` if the path isn't a served 5e
 * file / the Pi is unreachable / anything fails (→ caller uses bundled data).
 */
export async function loadRemoteLibrary<T>(path: string): Promise<T | null> {
  const rel = mapDataPathToRel(path)
  if (!rel) return null

  try {
    if (baseCache === undefined) baseCache = await deps.resolveBaseUrl()
  } catch {
    return null
  }
  const base = baseCache

  // The Pi library API is served only on the LAN (http) target — the off-LAN
  // https tunnel default doesn't expose it (returns 403 / is CORS-blocked), so
  // attempting it there is pointless. Mirror the signaling probe: only hit an
  // http base; otherwise fall straight back to bundled data. (Also keeps the
  // test suite off the network, since the default base resolves to the tunnel.)
  try {
    if (new URL(base).protocol !== 'http:') return null
  } catch {
    return null
  }

  const manifest = await getManifest(base)
  const entry = manifest?.files?.[rel]
  if (!entry) return null

  const cacheKey = `dndapp:lib:${rel}:${entry.sha256}`
  const cached = deps.getItem(cacheKey)
  if (cached != null) {
    try {
      return JSON.parse(cached) as T
    } catch {
      /* corrupt cache entry — refetch below */
    }
  }

  try {
    const resp = await fetchWithTimeout(`${base}/api/library/file?path=${encodeURIComponent(rel)}`)
    if (!resp.ok) return null
    const text = await resp.text()
    const data = JSON.parse(text) as T
    deps.setItem(cacheKey, text)
    return data
  } catch {
    return null
  }
}
