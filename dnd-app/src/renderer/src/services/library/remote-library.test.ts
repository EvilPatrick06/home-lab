import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetRemoteLibrary, __setRemoteLibraryDeps, loadRemoteLibrary, mapDataPathToRel } from './remote-library'

interface LibraryManifest {
  version: string
  files: Record<string, { sha256: string; size: number }>
}

// The Pi HTTP fetches now run in the main process; the renderer reaches them via
// injectable `fetchManifest` / `fetchFile` deps (IPC-backed in production). The
// `fetchFn` mock counts manifest + file calls so the cache assertions still hold.
function setup(opts: { manifest?: unknown; files?: Record<string, unknown>; store?: Map<string, string> }) {
  const store = opts.store ?? new Map<string, string>()
  const fetchFn = vi.fn(async (kind: 'manifest' | 'file', rel?: string): Promise<string | LibraryManifest | null> => {
    if (kind === 'manifest') {
      if (opts.manifest === undefined) return null // 503 / unreachable
      return opts.manifest as LibraryManifest
    }
    if (opts.files && rel != null && rel in opts.files) return JSON.stringify(opts.files[rel])
    return null // not found
  })
  __setRemoteLibraryDeps({
    fetchManifest: () => fetchFn('manifest') as Promise<LibraryManifest | null>,
    fetchFile: (rel: string) => fetchFn('file', rel) as Promise<string | null>,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v)
    }
  })
  return { fetchFn, store }
}

afterEach(() => {
  __resetRemoteLibrary()
})

describe('mapDataPathToRel', () => {
  it('maps a ./data/5e/ path to the served rel-path', () => {
    expect(mapDataPathToRel('./data/5e/spells/spells.json')).toBe('spells/spells.json')
    expect(mapDataPathToRel('data/5e/dm/npcs/monsters.json')).toBe('dm/npcs/monsters.json')
  })
  it('returns null for non-5e paths', () => {
    expect(mapDataPathToRel('./data/other/x.json')).toBeNull()
    expect(mapDataPathToRel('whatever.json')).toBeNull()
  })
})

describe('loadRemoteLibrary', () => {
  it('returns null for an unmapped path (no fetch)', async () => {
    setup({ manifest: { version: '1', files: {} } })
    expect(await loadRemoteLibrary('./data/other/x.json')).toBeNull()
  })

  it('returns null when the file is not in the manifest', async () => {
    setup({ manifest: { version: '1', files: {} } })
    expect(await loadRemoteLibrary('./data/5e/spells/spells.json')).toBeNull()
  })

  it('fetches + returns + caches a manifest-listed file', async () => {
    const { fetchFn, store } = setup({
      manifest: { version: '1', files: { 'spells/spells.json': { sha256: 'abc', size: 9 } } },
      files: { 'spells/spells.json': [{ id: 'fireball' }] }
    })
    const data = await loadRemoteLibrary<Array<{ id: string }>>('./data/5e/spells/spells.json')
    expect(data?.[0].id).toBe('fireball')
    expect(store.get('dndapp:lib:spells/spells.json:abc')).toContain('fireball')
    expect(fetchFn).toHaveBeenCalledTimes(2) // manifest + file
  })

  it('serves from the hash-keyed cache without refetching the file', async () => {
    const store = new Map<string, string>([['dndapp:lib:spells/spells.json:abc', JSON.stringify([{ id: 'cached' }])]])
    const { fetchFn } = setup({
      manifest: { version: '1', files: { 'spells/spells.json': { sha256: 'abc', size: 9 } } },
      store
    })
    const data = await loadRemoteLibrary<Array<{ id: string }>>('./data/5e/spells/spells.json')
    expect(data?.[0].id).toBe('cached')
    // only the manifest was fetched; the file came from cache
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('refetches when the content hash changed (stale cache key)', async () => {
    const store = new Map<string, string>([['dndapp:lib:spells/spells.json:OLD', JSON.stringify([{ id: 'stale' }])]])
    setup({
      manifest: { version: '2', files: { 'spells/spells.json': { sha256: 'NEW', size: 9 } } },
      files: { 'spells/spells.json': [{ id: 'fresh' }] },
      store
    })
    const data = await loadRemoteLibrary<Array<{ id: string }>>('./data/5e/spells/spells.json')
    expect(data?.[0].id).toBe('fresh')
  })

  it('returns null on a manifest fetch failure (→ caller falls back)', async () => {
    setup({
      /* manifest undefined → 503 */
    })
    expect(await loadRemoteLibrary('./data/5e/spells/spells.json')).toBeNull()
  })
})
