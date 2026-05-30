import { resolveBmoBaseUrl } from '../../network/registry-client'

/**
 * Phase 36 — remote (Pi-hosted) 5e library loader.
 *
 * When the `piLibraryEnabled` setting is on, `data-provider.loadJson` tries this
 * first: it fetches the Pi's `/api/library/manifest` (once per session), maps the
 * requested `./data/5e/...` path to the served rel-path, and returns the file —
 * served from a `localStorage` cache keyed by the file's content hash, or fetched
 * from `/api/library/file` and cached. ANY miss/error/disabled returns `null`, so
 * the caller falls back to the bundled (canonical) file. This is a best-effort
 * cache/CDN layer, never a source of truth.
 *
 * Deps (fetch / localStorage / base-URL / enabled-flag) are injectable for tests.
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
  isEnabled: () => Promise<boolean>
}

function defaultIsEnabled(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.api?.loadSettings) return Promise.resolve(false)
  return window.api
    .loadSettings()
    .then((s) => s?.piLibraryEnabled === true)
    .catch(() => false)
}

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
  resolveBaseUrl: resolveBmoBaseUrl,
  isEnabled: defaultIsEnabled
}

// Per-session caches. `manifestCache === undefined` means "not yet fetched";
// `null` means "fetched but unavailable" (don't retry this session).
let manifestCache: LibraryManifest | null | undefined
let enabledCache: boolean | undefined
let baseCache: string | undefined

/** Test-only — inject fake deps. */
export function __setRemoteLibraryDeps(partial: Partial<RemoteDeps>): void {
  Object.assign(deps, partial)
}

/** Test-only — clear the per-session caches. */
export function __resetRemoteLibrary(): void {
  manifestCache = undefined
  enabledCache = undefined
  baseCache = undefined
}

/** `./data/5e/spells/spells.json` → `spells/spells.json`; non-5e paths → null. */
export function mapDataPathToRel(path: string): string | null {
  const m = path.replace(/^\.\//, '').match(/^data\/5e\/(.+\.json)$/)
  return m ? m[1] : null
}

async function getManifest(base: string): Promise<LibraryManifest | null> {
  if (manifestCache !== undefined) return manifestCache
  try {
    const resp = await deps.fetchFn(`${base}/api/library/manifest`)
    manifestCache = resp.ok ? ((await resp.json()) as LibraryManifest) : null
  } catch {
    manifestCache = null
  }
  return manifestCache
}

/**
 * Return the Pi-hosted JSON for `path`, or `null` if the Pi library is disabled /
 * the path isn't a served 5e file / anything fails (→ caller uses bundled data).
 */
export async function loadRemoteLibrary<T>(path: string): Promise<T | null> {
  if (enabledCache === undefined) enabledCache = await deps.isEnabled()
  if (!enabledCache) return null

  const rel = mapDataPathToRel(path)
  if (!rel) return null

  try {
    if (baseCache === undefined) baseCache = await deps.resolveBaseUrl()
  } catch {
    return null
  }
  const base = baseCache

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
    const resp = await deps.fetchFn(`${base}/api/library/file?path=${encodeURIComponent(rel)}`)
    if (!resp.ok) return null
    const text = await resp.text()
    const data = JSON.parse(text) as T
    deps.setItem(cacheKey, text)
    return data
  } catch {
    return null
  }
}
