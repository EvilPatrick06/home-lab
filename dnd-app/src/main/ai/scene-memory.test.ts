import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

// Real temp dir + mocked electron userData → exercises the real atomic write/read.
const TMP = vi.hoisted(() => {
  const os = require('node:os')
  const p = require('node:path')
  const crypto = require('node:crypto')
  return p.join(os.tmpdir(), `scene-mem-test-${crypto.randomUUID()}`)
})

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => TMP) } }))

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { clearSceneMemoryCache, getSceneMemorySettings, setSceneMemoryEnabled } from './scene-memory'

const fileFor = (id: string) => path.join(TMP, 'campaigns', id, 'ai-context', 'scene-memory.json')

beforeEach(() => clearSceneMemoryCache())
afterAll(async () => {
  await fs.rm(TMP, { recursive: true, force: true })
})

describe('scene-memory (PHASE-26 26B)', () => {
  it('defaults to { enabled: false } when no file exists', async () => {
    expect(await getSceneMemorySettings('no-such-campaign')).toEqual({ enabled: false })
  })

  it('set → (cache-cleared) get round-trips through disk', async () => {
    await setSceneMemoryEnabled('c-roundtrip', true)
    clearSceneMemoryCache('c-roundtrip') // force a real re-read
    expect(await getSceneMemorySettings('c-roundtrip')).toEqual({ enabled: true })
  })

  it('falls back to disabled on a corrupt file', async () => {
    const f = fileFor('c-corrupt')
    await fs.mkdir(path.dirname(f), { recursive: true })
    await fs.writeFile(f, 'not json{{{', 'utf-8')
    clearSceneMemoryCache('c-corrupt')
    expect(await getSceneMemorySettings('c-corrupt')).toEqual({ enabled: false })
  })

  it('serves a cached value without re-reading disk (cache hit)', async () => {
    await setSceneMemoryEnabled('c-cache', true)
    // Overwrite the file behind the cache's back; the cached value should still win.
    await fs.writeFile(fileFor('c-cache'), JSON.stringify({ enabled: false }), 'utf-8')
    expect(await getSceneMemorySettings('c-cache')).toEqual({ enabled: true })
    clearSceneMemoryCache('c-cache')
    expect(await getSceneMemorySettings('c-cache')).toEqual({ enabled: false }) // now reflects disk
  })
})
