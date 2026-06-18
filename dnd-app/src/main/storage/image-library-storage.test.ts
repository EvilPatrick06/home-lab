import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

// PHASE-35 — readImageData round-trip against a real tmp userData dir. The module caches its image
// dir on first use, so we pin ONE tmp dir for the whole file (set before any storage call runs).
let mockUserData = ''
vi.mock('electron', () => ({ app: { getPath: () => mockUserData } }))

import { readImageData, saveImage } from './image-library-storage'

beforeAll(() => {
  mockUserData = mkdtempSync(join(tmpdir(), 'imglib-'))
})
afterAll(() => rmSync(mockUserData, { recursive: true, force: true }))

describe('readImageData (PHASE-35 35E)', () => {
  it('returns a parseable data URL with the right mime after save', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])
    const saved = await saveImage('scene-img-1', 'Crypt', bytes, '.png')
    expect(saved.success).toBe(true)

    const res = await readImageData('scene-img-1')
    expect(res.success).toBe(true)
    expect(res.data?.name).toBe('Crypt')
    expect(res.data?.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    // Round-trips back to the original bytes.
    const b64 = res.data?.dataUrl.split(',')[1] ?? ''
    expect(Buffer.from(b64, 'base64')).toEqual(bytes)
  })

  it('maps .jpg to image/jpeg', async () => {
    await saveImage('scene-img-2', 'Tavern', Buffer.from([1, 2, 3]), '.jpg')
    const res = await readImageData('scene-img-2')
    expect(res.data?.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true)
  })

  it('rejects an invalid id', async () => {
    const res = await readImageData('../etc/passwd')
    expect(res.success).toBe(false)
  })

  it('errors when the image is missing', async () => {
    const res = await readImageData('does-not-exist')
    expect(res.success).toBe(false)
  })
})
