import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __setSoundCacheDeps, cacheGetSound, prewarmSoundCache } from './sound-cache'

/**
 * sound-cache.ts fetches Pi-hosted MP3s and writes them to a disk cache. Tests
 * use a real temp cache dir (to exercise the atomic write + on-disk read path)
 * and a fake fetch that streams bytes from an in-memory table.
 */

let cacheRoot: string

function byteResponse(body: string, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    body: ok ? (Readable.toWeb(Readable.from([Buffer.from(body)])) as unknown) : null
  } as unknown as Response
}

function manifestResponse(files: Record<string, { size: number }>, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 503,
    json: async () => ({ version: '1', files })
  } as unknown as Response
}

function setup(opts: { files?: Record<string, string>; manifest?: Record<string, { size: number }> | null }) {
  const fetchFn = vi.fn(async (url: string | URL, _init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/api/sounds/manifest')) {
      if (opts.manifest === null) return manifestResponse({}, false)
      return manifestResponse(opts.manifest ?? {})
    }
    const m = u.match(/\/api\/sounds\/file\?path=(.+)$/)
    if (m) {
      const rel = decodeURIComponent(m[1])
      const body = opts.files?.[rel]
      if (body === undefined) return byteResponse('', false)
      return byteResponse(body)
    }
    return byteResponse('', false)
  })
  __setSoundCacheDeps({
    fetchFn: fetchFn as unknown as typeof fetch,
    getBaseUrl: () => 'http://pi.test',
    getHeaders: () => ({ 'CF-Access-Client-Id': 'x' }),
    cacheDir: () => cacheRoot
  })
  return { fetchFn }
}

beforeEach(() => {
  cacheRoot = mkdtempSync(join(tmpdir(), 'sound-cache-test-'))
})

afterEach(() => {
  rmSync(cacheRoot, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('cacheGetSound', () => {
  it('downloads a clip and returns the on-disk path with the right bytes', async () => {
    setup({ files: { 'dice/d20-1.mp3': 'D20BYTES' } })
    const path = await cacheGetSound('dice/d20-1.mp3')
    expect(path).toBe(join(cacheRoot, 'dice', 'd20-1.mp3'))
    expect(readFileSync(path as string, 'utf8')).toBe('D20BYTES')
  })

  it('returns the cached path WITHOUT re-fetching when already present', async () => {
    const { fetchFn } = setup({ files: { 'dice/d20-1.mp3': 'D20BYTES' } })
    await cacheGetSound('dice/d20-1.mp3')
    const path = await cacheGetSound('dice/d20-1.mp3')
    expect(path).toBe(join(cacheRoot, 'dice', 'd20-1.mp3'))
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('sends access headers on the fetch', async () => {
    const { fetchFn } = setup({ files: { 'dice/d20-1.mp3': 'X' } })
    await cacheGetSound('dice/d20-1.mp3')
    const init = fetchFn.mock.calls[0]?.[1] as RequestInit | undefined
    expect(init?.headers).toMatchObject({ 'CF-Access-Client-Id': 'x' })
  })

  it('returns null when the Pi 404s (no leftover .part file)', async () => {
    setup({ files: {} })
    const path = await cacheGetSound('missing/clip.mp3')
    expect(path).toBeNull()
    // No partial artifact left behind.
    expect(() => readFileSync(join(cacheRoot, 'missing', 'clip.mp3'))).toThrow()
  })

  it('rejects path traversal (returns null, no fetch)', async () => {
    const { fetchFn } = setup({ files: { 'x.mp3': 'X' } })
    expect(await cacheGetSound('../../etc/passwd')).toBeNull()
    expect(await cacheGetSound('/abs/clip.mp3')).toBeNull()
    expect(await cacheGetSound('a/../../b.mp3')).toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('treats a zero-byte cached file as missing and re-downloads', async () => {
    const { fetchFn } = setup({ files: { 'dice/d20-1.mp3': 'GOOD' } })
    // Pre-seed an empty file at the cache path.
    await mkdir(join(cacheRoot, 'dice'), { recursive: true })
    writeFileSync(join(cacheRoot, 'dice', 'd20-1.mp3'), '')
    const path = await cacheGetSound('dice/d20-1.mp3')
    expect(readFileSync(path as string, 'utf8')).toBe('GOOD')
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})

describe('prewarmSoundCache', () => {
  it('downloads every manifest clip into the cache', async () => {
    setup({
      manifest: { 'a.mp3': { size: 1 }, 'b/c.mp3': { size: 1 } },
      files: { 'a.mp3': 'AAA', 'b/c.mp3': 'CCC' }
    })
    await prewarmSoundCache()
    expect(readFileSync(join(cacheRoot, 'a.mp3'), 'utf8')).toBe('AAA')
    expect(readFileSync(join(cacheRoot, 'b', 'c.mp3'), 'utf8')).toBe('CCC')
  })

  it('is a no-op when the manifest is unreachable', async () => {
    const { fetchFn } = setup({ manifest: null })
    await prewarmSoundCache()
    // Only the manifest fetch happened (no per-file fetches).
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('swallows per-file failures and still caches the good ones', async () => {
    setup({
      manifest: { 'good.mp3': { size: 1 }, 'bad.mp3': { size: 1 } },
      files: { 'good.mp3': 'OK' } // bad.mp3 → 404
    })
    await prewarmSoundCache()
    expect(readFileSync(join(cacheRoot, 'good.mp3'), 'utf8')).toBe('OK')
    expect(() => readFileSync(join(cacheRoot, 'bad.mp3'))).toThrow()
  })
})
