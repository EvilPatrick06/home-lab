import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  __resetRemoteSounds,
  __setRemoteSoundDeps,
  mapSoundPathToRel,
  prewarmRemoteSounds,
  resolveSoundUrl
} from './remote-sounds'

function jsonResponse(body: unknown, ok = true): Response {
  const text = JSON.stringify(body)
  return {
    ok,
    json: async () => JSON.parse(text),
    text: async () => text
  } as unknown as Response
}

function setup(opts: { manifest?: unknown; cache?: Record<string, string | null> }) {
  const fetchFn = vi.fn(async (url: string | URL) => {
    const u = String(url)
    if (u.endsWith('/api/sounds/manifest')) {
      if (opts.manifest === undefined) return jsonResponse({}, false)
      return jsonResponse(opts.manifest)
    }
    return jsonResponse({ error: 'not found' }, false)
  })
  const cacheGet = vi.fn(async (rel: string) => opts.cache?.[rel] ?? null)
  const prewarm = vi.fn(async () => ({ ok: true }))
  __setRemoteSoundDeps({
    fetchFn: fetchFn as unknown as typeof fetch,
    resolveBaseUrl: async () => 'http://pi.test',
    getBridge: () => ({ cacheGet, prewarm })
  })
  return { fetchFn, cacheGet, prewarm }
}

afterEach(() => {
  __resetRemoteSounds()
})

describe('mapSoundPathToRel', () => {
  it('maps a ./sounds/ path to the served rel-path', () => {
    expect(mapSoundPathToRel('./sounds/dice/d20-1.mp3')).toBe('dice/d20-1.mp3')
    expect(mapSoundPathToRel('sounds/ambient/tavern.mp3')).toBe('ambient/tavern.mp3')
  })
  it('returns null for non-sound / non-mp3 paths', () => {
    expect(mapSoundPathToRel('/abs/custom.mp3')).toBeNull()
    expect(mapSoundPathToRel('./sounds/dice/d20.ogg')).toBeNull()
    expect(mapSoundPathToRel('file:///home/user/track.mp3')).toBeNull()
  })
})

describe('resolveSoundUrl (cold manifest)', () => {
  it('returns the bundled path unchanged before prewarm', () => {
    setup({ manifest: { version: '1', files: { 'ambient/tavern.mp3': { size: 9 } } } })
    expect(resolveSoundUrl('./sounds/ambient/tavern.mp3')).toBe('./sounds/ambient/tavern.mp3')
  })
})

describe('prewarmRemoteSounds + resolveSoundUrl', () => {
  it('prefers the cached file:// URL for a clip main has cached', async () => {
    setup({
      manifest: { version: '1', files: { 'ambient/tavern.mp3': { size: 9 } } },
      cache: { 'ambient/tavern.mp3': '/data/sound-cache/ambient/tavern.mp3' }
    })
    await prewarmRemoteSounds()
    expect(resolveSoundUrl('./sounds/ambient/tavern.mp3')).toBe('file:///data/sound-cache/ambient/tavern.mp3')
  })

  it('falls back to the live Pi URL when served but not yet cached', async () => {
    setup({
      manifest: { version: '1', files: { 'ambient/tavern.mp3': { size: 9 } } },
      cache: { 'ambient/tavern.mp3': null }
    })
    await prewarmRemoteSounds()
    expect(resolveSoundUrl('./sounds/ambient/tavern.mp3')).toBe(
      'http://pi.test/api/sounds/file?path=ambient%2Ftavern.mp3'
    )
  })

  it('returns the path unchanged for clips NOT in the manifest', async () => {
    setup({ manifest: { version: '1', files: { 'ambient/tavern.mp3': { size: 9 } } } })
    await prewarmRemoteSounds()
    expect(resolveSoundUrl('./sounds/dice/d20-1.mp3')).toBe('./sounds/dice/d20-1.mp3')
  })

  it('passes through a custom (absolute) override path unchanged', async () => {
    setup({
      manifest: { version: '1', files: { 'ambient/tavern.mp3': { size: 9 } } },
      cache: { 'ambient/tavern.mp3': '/data/sound-cache/ambient/tavern.mp3' }
    })
    await prewarmRemoteSounds()
    expect(resolveSoundUrl('/home/dm/my-track.mp3')).toBe('/home/dm/my-track.mp3')
  })

  it('falls back to the path unchanged when the manifest fetch fails (unreachable Pi)', async () => {
    setup({
      /* manifest undefined → 503 */
    })
    await prewarmRemoteSounds()
    expect(resolveSoundUrl('./sounds/ambient/tavern.mp3')).toBe('./sounds/ambient/tavern.mp3')
  })

  it('kicks off the main-process background prewarm', async () => {
    const { prewarm } = setup({ manifest: { version: '1', files: {} } })
    await prewarmRemoteSounds()
    expect(prewarm).toHaveBeenCalledTimes(1)
  })

  it('only fetches the manifest once per session (idempotent prewarm)', async () => {
    const { fetchFn } = setup({ manifest: { version: '1', files: {} } })
    await prewarmRemoteSounds()
    await prewarmRemoteSounds()
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('shares one in-flight request across concurrent prewarms', async () => {
    const { fetchFn } = setup({ manifest: { version: '1', files: {} } })
    await Promise.all([prewarmRemoteSounds(), prewarmRemoteSounds()])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
