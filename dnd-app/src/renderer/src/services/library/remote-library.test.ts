import { afterEach, describe, expect, it, vi } from 'vitest'
import { __resetRemoteLibrary, __setRemoteLibraryDeps, loadRemoteLibrary, mapDataPathToRel } from './remote-library'

function jsonResponse(body: unknown, ok = true): Response {
  const text = JSON.stringify(body)
  return {
    ok,
    json: async () => JSON.parse(text),
    text: async () => text
  } as unknown as Response
}

function setup(opts: {
  enabled?: boolean
  manifest?: unknown
  files?: Record<string, unknown>
  store?: Map<string, string>
}) {
  const store = opts.store ?? new Map<string, string>()
  const fetchFn = vi.fn(async (url: string | URL) => {
    const u = String(url)
    if (u.endsWith('/api/library/manifest')) {
      if (opts.manifest === undefined) return jsonResponse({}, false)
      return jsonResponse(opts.manifest)
    }
    const m = u.match(/path=([^&]+)$/)
    const rel = m ? decodeURIComponent(m[1]) : ''
    if (opts.files && rel in opts.files) return jsonResponse(opts.files[rel])
    return jsonResponse({ error: 'not found' }, false)
  })
  __setRemoteLibraryDeps({
    fetchFn: fetchFn as unknown as typeof fetch,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v)
    },
    resolveBaseUrl: async () => 'https://pi.test',
    isEnabled: async () => opts.enabled ?? true
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
  it('returns null when disabled (and never fetches)', async () => {
    const { fetchFn } = setup({ enabled: false, manifest: { version: '1', files: {} } })
    expect(await loadRemoteLibrary('./data/5e/spells/spells.json')).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns null for an unmapped path', async () => {
    setup({ enabled: true, manifest: { version: '1', files: {} } })
    expect(await loadRemoteLibrary('./data/other/x.json')).toBeNull()
  })

  it('returns null when the file is not in the manifest', async () => {
    setup({ enabled: true, manifest: { version: '1', files: {} } })
    expect(await loadRemoteLibrary('./data/5e/spells/spells.json')).toBeNull()
  })

  it('fetches + returns + caches a manifest-listed file', async () => {
    const { fetchFn, store } = setup({
      enabled: true,
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
      enabled: true,
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
      enabled: true,
      manifest: { version: '2', files: { 'spells/spells.json': { sha256: 'NEW', size: 9 } } },
      files: { 'spells/spells.json': [{ id: 'fresh' }] },
      store
    })
    const data = await loadRemoteLibrary<Array<{ id: string }>>('./data/5e/spells/spells.json')
    expect(data?.[0].id).toBe('fresh')
  })

  it('returns null on a manifest fetch failure (→ caller falls back)', async () => {
    setup({ enabled: true /* manifest undefined → 503 */ })
    expect(await loadRemoteLibrary('./data/5e/spells/spells.json')).toBeNull()
  })
})
