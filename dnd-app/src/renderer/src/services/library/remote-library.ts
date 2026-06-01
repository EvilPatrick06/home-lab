/**
 * Phase 36 / R-lib — remote (Pi-hosted) 5e library loader (main-process proxy).
 *
 * The Pi library is the DEFAULT source — there is no user setting. On every 5e
 * data load, `data-provider.loadJson` tries this first: it gets the Pi's library
 * manifest (once per session), maps the requested `./data/5e/...` path to the
 * served rel-path, and returns the file — served from a `localStorage` cache
 * keyed by the file's content hash, or fetched fresh and cached. ANY miss /
 * error / unreachable-Pi returns `null`, so the caller AUTOMATICALLY falls back
 * to the bundled (canonical) file.
 *
 * The actual Pi HTTP fetches (`/api/library/manifest` + `/api/library/file`) now
 * run in the MAIN process (src/main/library-bridge.ts) and reach this module via
 * `window.api.library.*` over IPC — the renderer never opens a direct http(s)
 * connection to the Pi for library data. The renderer still owns the per-session
 * manifest cache, the content-hash localStorage cache, and the bundled-data
 * fallback. The main-process fetches are time-boxed so an unreachable Pi falls
 * back fast; the manifest result is cached per session (`null` = "don't retry").
 *
 * Deps (manifest fetch / file fetch / localStorage) are injectable for tests.
 */

interface LibraryManifest {
  version: string
  files: Record<string, { sha256: string; size: number }>
}

interface RemoteDeps {
  /** Fetch the Pi library manifest via the main process (or `null` if unreachable). */
  fetchManifest: () => Promise<LibraryManifest | null>
  /** Fetch a served library file's raw JSON text via the main process (or `null`). */
  fetchFile: (rel: string) => Promise<string | null>
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

const deps: RemoteDeps = {
  fetchManifest: async () => {
    if (typeof window === 'undefined' || !window.api?.library) return null
    return window.api.library.manifest()
  },
  fetchFile: async (rel: string) => {
    if (typeof window === 'undefined' || !window.api?.library) return null
    return window.api.library.file(rel)
  },
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
  }
}

// Per-session cache. `manifestCache === undefined` means "not yet fetched";
// `null` means "fetched but unavailable" (don't retry this session).
let manifestCache: LibraryManifest | null | undefined

/** Test-only — inject fake deps. */
export function __setRemoteLibraryDeps(partial: Partial<RemoteDeps>): void {
  Object.assign(deps, partial)
}

/** Test-only — clear the per-session caches. */
export function __resetRemoteLibrary(): void {
  manifestCache = undefined
}

/** `./data/5e/spells/spells.json` → `spells/spells.json`; non-5e paths → null. */
export function mapDataPathToRel(path: string): string | null {
  const m = path.replace(/^\.\//, '').match(/^data\/5e\/(.+\.json)$/)
  return m ? m[1] : null
}

async function getManifest(): Promise<LibraryManifest | null> {
  if (manifestCache !== undefined) return manifestCache
  try {
    manifestCache = await deps.fetchManifest()
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

  // The main process resolves the Pi base URL itself and reaches BOTH the on-LAN
  // http Pi and the off-LAN https tunnel (with Cloudflare-Access headers). When
  // the manifest is unreachable / blocked, this returns null → bundled fallback.
  const manifest = await getManifest()
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
    const text = await deps.fetchFile(rel)
    if (text == null) return null
    const data = JSON.parse(text) as T
    deps.setItem(cacheKey, text)
    return data
  } catch {
    return null
  }
}
