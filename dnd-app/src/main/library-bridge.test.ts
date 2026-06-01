import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchLibraryFile, fetchLibraryManifest } from './library-bridge'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('library-bridge', () => {
  it('fetchLibraryManifest returns the parsed manifest on 2xx', async () => {
    const manifest = { version: '1', files: { 'spells/spells.json': { sha256: 'abc', size: 9 } } }
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => manifest } as Response)
    expect(await fetchLibraryManifest()).toEqual(manifest)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/library/manifest')
  })

  it('fetchLibraryManifest returns null on a non-2xx', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 } as Response)
    expect(await fetchLibraryManifest()).toBeNull()
  })

  it('fetchLibraryManifest returns null when fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('unreachable'))
    expect(await fetchLibraryManifest()).toBeNull()
  })

  it('fetchLibraryFile returns the raw text on 2xx', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => '[{"id":"fireball"}]' } as Response)
    const text = await fetchLibraryFile('spells/spells.json')
    expect(text).toContain('fireball')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/library/file?path=spells%2Fspells.json')
  })

  it('fetchLibraryFile returns null on a non-2xx', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 } as Response)
    expect(await fetchLibraryFile('missing.json')).toBeNull()
  })
})
