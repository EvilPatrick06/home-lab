import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../services/map/raycast-visibility', () => ({
  computeVisibility: vi.fn(() => ({ points: [] })),
  computeLitAreas: vi.fn(() => []),
  wallsToSegments: vi.fn(() => [])
}))

import type { LightingConfig } from './lighting-overlay'
import { drawLightingOverlay } from './lighting-overlay'

function makeMockGraphics() {
  return {
    clear: vi.fn().mockReturnThis(),
    rect: vi.fn().mockReturnThis(),
    fill: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    circle: vi.fn().mockReturnThis(),
    setStrokeStyle: vi.fn().mockReturnThis(),
    beginPath: vi.fn().mockReturnThis(),
    moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(),
    closePath: vi.fn().mockReturnThis(),
    cut: vi.fn().mockReturnThis()
  }
}

const BASE_MAP = {
  id: 'map-1',
  name: 'Test Map',
  width: 200,
  height: 200,
  imagePath: null,
  grid: { cellSize: 40, offsetX: 0, offsetY: 0, enabled: true, color: '#555', opacity: 0.5, type: 'square' as const },
  fogOfWar: { enabled: false, revealedCells: [], exploredCells: [], dynamicFogEnabled: false },
  wallSegments: [],
  tokens: [],
  terrain: []
}

const BRIGHT_CONFIG: LightingConfig = { ambientLight: 'bright' }
const DIM_CONFIG: LightingConfig = { ambientLight: 'dim' }
const DARK_CONFIG: LightingConfig = { ambientLight: 'darkness' }

describe('drawLightingOverlay — bright ambient, no walls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns early and only calls clear when fully bright with no walls', () => {
    const gfx = makeMockGraphics()
    drawLightingOverlay(gfx as never, BASE_MAP as never, [], [], BRIGHT_CONFIG, false)
    expect(gfx.clear).toHaveBeenCalledOnce()
    // Nothing else drawn for full bright with no walls
    expect(gfx.rect).not.toHaveBeenCalled()
  })
})

describe('drawLightingOverlay — DM preview', () => {
  it('clears graphics', () => {
    const gfx = makeMockGraphics()
    drawLightingOverlay(gfx as never, BASE_MAP as never, [], [], DIM_CONFIG, true)
    expect(gfx.clear).toHaveBeenCalled()
  })

  it('draws a rect overlay for dim ambient DM preview', () => {
    const gfx = makeMockGraphics()
    drawLightingOverlay(gfx as never, BASE_MAP as never, [], [], DIM_CONFIG, true)
    expect(gfx.rect).toHaveBeenCalled()
    expect(gfx.fill).toHaveBeenCalled()
  })

  it('draws a rect overlay for darkness DM preview', () => {
    const gfx = makeMockGraphics()
    drawLightingOverlay(gfx as never, BASE_MAP as never, [], [], DARK_CONFIG, true)
    expect(gfx.rect).toHaveBeenCalled()
    const fillArgs = gfx.fill.mock.calls[0][0] as { alpha: number }
    expect(fillArgs.alpha).toBeGreaterThan(0)
  })

  it('draws light source rings when light sources present (DM preview)', () => {
    const gfx = makeMockGraphics()
    const lightSources = [{ x: 5, y: 5, brightRadius: 4, dimRadius: 4 }]
    drawLightingOverlay(gfx as never, BASE_MAP as never, [], lightSources, DIM_CONFIG, true)
    expect(gfx.circle).toHaveBeenCalled()
  })

  it('does not draw rect when bright and no light sources (DM preview)', () => {
    const gfx = makeMockGraphics()
    drawLightingOverlay(gfx as never, BASE_MAP as never, [], [], BRIGHT_CONFIG, true)
    expect(gfx.rect).not.toHaveBeenCalled()
  })
})

describe('drawLightingOverlay — player view', () => {
  it('returns early without drawing when no viewer tokens', () => {
    const gfx = makeMockGraphics()
    drawLightingOverlay(gfx as never, BASE_MAP as never, [], [], DARK_CONFIG, false)
    expect(gfx.clear).toHaveBeenCalled()
    expect(gfx.rect).not.toHaveBeenCalled()
  })

  it('draws darkness overlay for player view with tokens', () => {
    const gfx = makeMockGraphics()
    const token = {
      id: 't1',
      gridX: 3,
      gridY: 3,
      sizeX: 1,
      sizeY: 1,
      entityType: 'player',
      darkvision: false,
      darkvisionRange: 0
    }
    drawLightingOverlay(gfx as never, BASE_MAP as never, [token] as never, [], DARK_CONFIG, false)
    expect(gfx.rect).toHaveBeenCalled()
    const fillArgs = gfx.fill.mock.calls[0][0] as { alpha: number }
    expect(fillArgs.alpha).toBe(0.85) // darkness alpha
  })

  it('uses lower alpha for dim ambient in player view', () => {
    const gfx = makeMockGraphics()
    const token = { id: 't1', gridX: 1, gridY: 1, sizeX: 1, sizeY: 1, entityType: 'player' }
    drawLightingOverlay(gfx as never, BASE_MAP as never, [token] as never, [], DIM_CONFIG, false)
    const fillArgs = gfx.fill.mock.calls[0][0] as { alpha: number }
    expect(fillArgs.alpha).toBe(0.5)
  })

  it('uses lowest alpha for bright ambient in player view', () => {
    const gfx = makeMockGraphics()
    const wallMap = { ...BASE_MAP, wallSegments: [{ x1: 0, y1: 0, x2: 1, y2: 0, passable: false }] }
    const token = { id: 't1', gridX: 1, gridY: 1, sizeX: 1, sizeY: 1, entityType: 'player' }
    drawLightingOverlay(gfx as never, wallMap as never, [token] as never, [], BRIGHT_CONFIG, false)
    const fillArgs = gfx.fill.mock.calls[0][0] as { alpha: number }
    expect(fillArgs.alpha).toBe(0.2)
  })
})

describe('LightingConfig type', () => {
  it('accepts bright, dim, darkness as ambientLight', () => {
    const configs: LightingConfig[] = [
      { ambientLight: 'bright' },
      { ambientLight: 'dim' },
      { ambientLight: 'darkness' }
    ]
    for (const c of configs) {
      expect(['bright', 'dim', 'darkness']).toContain(c.ambientLight)
    }
  })

  it('supports optional darkvisionRange', () => {
    const config: LightingConfig = { ambientLight: 'dim', darkvisionRange: 12 }
    expect(config.darkvisionRange).toBe(12)
  })

  it('supports optional tokenDarkvisionRanges map', () => {
    const ranges = new Map([
      ['token-1', 12],
      ['token-2', 6]
    ])
    const config: LightingConfig = { ambientLight: 'darkness', tokenDarkvisionRanges: ranges }
    expect(config.tokenDarkvisionRanges?.get('token-1')).toBe(12)
  })
})
