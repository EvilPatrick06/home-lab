import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock Three.js canvas texture and materials
vi.mock('three', () => ({
  CanvasTexture: vi.fn(function () {
    return { colorSpace: '' }
  }),
  SRGBColorSpace: 'srgb',
  MeshStandardMaterial: vi.fn(function (opts: Record<string, unknown> = {}) {
    return { ...opts, type: 'MeshStandardMaterial' }
  }),
  LineBasicMaterial: vi.fn(function (opts: Record<string, unknown> = {}) {
    return { ...opts, type: 'LineBasicMaterial' }
  }),
  Color: vi.fn(function (hex: string) {
    return { hex }
  })
}))

// Mock the browser canvas API (jsdom provides this, but ensure 2D context is available)
const mockCtx = {
  fillStyle: '',
  fillRect: vi.fn(),
  font: '',
  textAlign: '',
  textBaseline: '',
  fillText: vi.fn(),
  measureText: vi.fn(() => ({ width: 20 })),
  strokeStyle: '',
  lineWidth: 0,
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  createRadialGradient: vi.fn(() => ({
    addColorStop: vi.fn()
  }))
}

const mockCanvas = {
  width: 0,
  height: 0,
  getContext: vi.fn(() => mockCtx)
}

vi.stubGlobal('document', {
  createElement: vi.fn(() => mockCanvas)
})

import { createDieTexture, createFaceMaterials, createHiddenTexture, createWireMaterial } from './dice-textures'
import type { DiceColors } from './dice-types'

const COLORS: DiceColors = { bodyColor: '#1a1a2e', numberColor: '#f5c542' }

describe('createDieTexture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCtx.measureText.mockReturnValue({ width: 20 })
  })

  it('creates a canvas texture', async () => {
    const { CanvasTexture } = await import('three')
    const texture = createDieTexture('6', '#000000', '#ffffff')
    expect(CanvasTexture).toHaveBeenCalledOnce()
    expect(texture).toBeDefined()
  })

  it('sets canvas dimensions to default size 256', () => {
    createDieTexture('1', '#000000', '#ffffff')
    expect(mockCanvas.width).toBe(256)
    expect(mockCanvas.height).toBe(256)
  })

  it('accepts custom size', () => {
    createDieTexture('1', '#000000', '#ffffff', 128)
    expect(mockCanvas.width).toBe(128)
    expect(mockCanvas.height).toBe(128)
  })

  it('fills background with the provided color', () => {
    createDieTexture('5', '#123456', '#ffffff')
    expect(mockCtx.fillStyle).toBe('#ffffff') // last assignment is textColor, but bg was set before text
    expect(mockCtx.fillRect).toHaveBeenCalled()
  })

  it('draws text via fillText', () => {
    createDieTexture('20', '#000000', '#ffffff')
    expect(mockCtx.fillText).toHaveBeenCalledWith('20', expect.any(Number), expect.any(Number))
  })

  it('draws underline for 6', () => {
    createDieTexture('6', '#000000', '#ffffff')
    expect(mockCtx.stroke).toHaveBeenCalled()
  })

  it('draws underline for 9', () => {
    createDieTexture('9', '#000000', '#ffffff')
    expect(mockCtx.stroke).toHaveBeenCalled()
  })

  it('does not draw underline for other digits', () => {
    vi.clearAllMocks()
    mockCtx.measureText.mockReturnValue({ width: 20 })
    createDieTexture('7', '#000000', '#ffffff')
    expect(mockCtx.stroke).not.toHaveBeenCalled()
  })

  it('sets SRGB color space on the texture', async () => {
    const { SRGBColorSpace } = await import('three')
    const texture = createDieTexture('1', '#000', '#fff')
    expect(texture.colorSpace).toBe(SRGBColorSpace)
  })
})

describe('createDieTexture placement opts (PHASE-13 13M)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCtx.measureText.mockReturnValue({ width: 20 })
  })

  it('defaults the glyph to vertical center (centerV 0.5 → y = size/2)', () => {
    createDieTexture('1', '#000', '#fff', 256)
    const y = mockCtx.fillText.mock.calls[0][2]
    expect(y).toBeCloseTo(128, 5) // 256 * (1 - 0.5)
  })

  it('honors centerV by drawing the glyph toward the face centroid (above center)', () => {
    createDieTexture('1', '#000', '#fff', 256, { centerV: 1 / 3 })
    const y = mockCtx.fillText.mock.calls[0][2]
    expect(y).toBeCloseTo(256 * (1 - 1 / 3), 5) // ≈ 170.67, lower on the canvas = toward the base
  })

  it('honors fontScale in the font string', () => {
    createDieTexture('1', '#000', '#fff', 256, { fontScale: 0.5 })
    expect(mockCtx.font).toContain('128px') // 256 * 0.5
  })

  it('shrinks 2-digit triangular labels below 1-digit ones (smaller inscribed circle)', () => {
    const px = (s: string) => Number(s.match(/(\d+(?:\.\d+)?)px/)?.[1])
    createDieTexture('20', '#000', '#fff', 256, { centerV: 1 / 3 })
    const twoDigit = px(mockCtx.font)
    createDieTexture('5', '#000', '#fff', 256, { centerV: 1 / 3 })
    const oneDigit = px(mockCtx.font)
    expect(twoDigit).toBeLessThan(oneDigit)
  })

  it('anchors the 6/9 underline below the centerV-shifted glyph', () => {
    createDieTexture('6', '#000', '#fff', 256, { centerV: 1 / 3 })
    const centerY = 256 * (1 - 1 / 3)
    const underY = mockCtx.moveTo.mock.calls[0][1]
    expect(underY).toBeGreaterThan(centerY)
  })
})

describe('createHiddenTexture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a texture with a question mark', () => {
    createHiddenTexture('#000000')
    expect(mockCtx.fillText).toHaveBeenCalledWith('?', expect.any(Number), expect.any(Number))
  })

  it('uses a radial gradient for the glow effect', () => {
    createHiddenTexture('#000000')
    expect(mockCtx.createRadialGradient).toHaveBeenCalled()
  })

  it('accepts custom size', () => {
    createHiddenTexture('#1a1a2e', 128)
    expect(mockCanvas.width).toBe(128)
  })
})

describe('createFaceMaterials', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns one material per face label', () => {
    const labels = ['1', '2', '3', '4', '5', '6']
    const mats = createFaceMaterials(labels, COLORS, false)
    expect(mats).toHaveLength(6)
  })

  it('creates hidden textures when isHidden=true', () => {
    const labels = ['1', '2']
    createFaceMaterials(labels, COLORS, true)
    // Each material uses a hidden texture (question mark drawn twice)
    expect(mockCtx.fillText).toHaveBeenCalledWith('?', expect.any(Number), expect.any(Number))
  })

  it('creates normal textures when isHidden=false', () => {
    vi.clearAllMocks()
    const labels = ['3']
    createFaceMaterials(labels, COLORS, false)
    expect(mockCtx.fillText).toHaveBeenCalledWith('3', expect.any(Number), expect.any(Number))
  })

  it('uses MeshStandardMaterial for each face', async () => {
    const { MeshStandardMaterial } = await import('three')
    vi.clearAllMocks()
    const labels = ['1', '2', '3']
    createFaceMaterials(labels, COLORS, false)
    expect(MeshStandardMaterial).toHaveBeenCalledTimes(3)
  })
})

describe('createWireMaterial', () => {
  it('returns a LineBasicMaterial', async () => {
    const { LineBasicMaterial } = await import('three')
    const mat = createWireMaterial()
    expect(mat).toBeDefined()
    expect(LineBasicMaterial).toHaveBeenCalled()
  })

  it('uses the expected dark wire color', () => {
    const mat = createWireMaterial()
    expect((mat as unknown as { color: number }).color).toBe(0x3a3a5e)
  })
})
