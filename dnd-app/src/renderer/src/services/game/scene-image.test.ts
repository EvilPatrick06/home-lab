// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareSceneImage } from './scene-image'

// Controllable canvas + Image stubs (happy-dom has no real 2D raster).
let toDataURLQueue: string[] = []
let lastCanvasW = 0
let lastCanvasH = 0

beforeEach(() => {
  toDataURLQueue = []
  vi.stubGlobal(
    'Image',
    class {
      width = 4000
      height = 3000
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_v: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(function (this: HTMLCanvasElement) {
    lastCanvasW = this.width
    lastCanvasH = this.height
    return toDataURLQueue.shift() ?? 'data:image/jpeg;base64,SMALL'
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('prepareSceneImage (PHASE-35 35E)', () => {
  it('downscales a 4000×3000 source to the 2560×1440 cap (preserving aspect)', async () => {
    toDataURLQueue = ['data:image/jpeg;base64,SMALL']
    const out = await prepareSceneImage('data:image/png;base64,SRC')
    expect(out).toBe('data:image/jpeg;base64,SMALL')
    // scale = min(1, 2560/4000, 1440/3000) = 0.48 → 1920×1440
    expect(lastCanvasW).toBe(1920)
    expect(lastCanvasH).toBe(1440)
  })

  it('re-encodes again when the first JPEG exceeds 4 MB', async () => {
    const huge = `data:image/jpeg;base64,${'a'.repeat(4 * 1024 * 1024 + 10)}`
    toDataURLQueue = [huge, 'data:image/jpeg;base64,SMALLER']
    const out = await prepareSceneImage('data:image/png;base64,SRC')
    expect(out).toBe('data:image/jpeg;base64,SMALLER')
  })

  it('rejects when the image fails to load', async () => {
    vi.stubGlobal(
      'Image',
      class {
        onload: (() => void) | null = null
        onerror: (() => void) | null = null
        set src(_v: string) {
          queueMicrotask(() => this.onerror?.())
        }
      }
    )
    await expect(prepareSceneImage('bad')).rejects.toThrow()
  })
})
