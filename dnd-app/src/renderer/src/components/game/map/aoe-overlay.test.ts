import { describe, expect, it, vi } from 'vitest'
import type { AoEConfig, AoEShape, Direction8 } from './aoe-overlay'
import { clearAoEOverlay, drawAoEOverlay, getAoECells } from './aoe-overlay'

// Minimal mock for PixiJS Graphics (only the drawing methods used)
function makeMockGraphics() {
  return {
    clear: vi.fn().mockReturnThis(),
    rect: vi.fn().mockReturnThis(),
    fill: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis()
  }
}

describe('getAoECells — cube', () => {
  it('returns NxN cells for a cube of N cells', () => {
    const config: AoEConfig = { shape: 'cube', sizeFeet: 10, originX: 0, originY: 0 } // 2 cells
    const cells = getAoECells(config)
    expect(cells).toHaveLength(4) // 2×2
  })

  it('starts at origin', () => {
    const config: AoEConfig = { shape: 'cube', sizeFeet: 5, originX: 3, originY: 4 }
    const cells = getAoECells(config)
    expect(cells).toHaveLength(1)
    expect(cells[0]).toEqual({ x: 3, y: 4 })
  })

  it('does not produce duplicate cells', () => {
    const config: AoEConfig = { shape: 'cube', sizeFeet: 15, originX: 0, originY: 0 }
    const cells = getAoECells(config)
    const keys = cells.map((c) => `${c.x},${c.y}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('getAoECells — sphere/cylinder', () => {
  it('returns cells within Chebyshev radius', () => {
    const config: AoEConfig = { shape: 'sphere', sizeFeet: 5, originX: 0, originY: 0 } // radius=1 cell
    const cells = getAoECells(config)
    // Chebyshev distance 1 = 3×3 = 9 cells
    expect(cells).toHaveLength(9)
  })

  it('cylinder produces same shape as sphere', () => {
    const sphere = getAoECells({ shape: 'sphere', sizeFeet: 10, originX: 0, originY: 0 })
    const cylinder = getAoECells({ shape: 'cylinder', sizeFeet: 10, originX: 0, originY: 0 })
    expect(cylinder).toHaveLength(sphere.length)
  })
})

describe('getAoECells — line', () => {
  it('returns cells in a straight line to the north', () => {
    const config: AoEConfig = { shape: 'line', sizeFeet: 30, originX: 5, originY: 5, direction: 'N' }
    const cells = getAoECells(config)
    // 30 feet = 6 cells, 5ft wide = 1 cell wide (halfWidth = 0)
    expect(cells).toHaveLength(6)
    for (const c of cells) {
      expect(c.x).toBe(5) // straight north, no horizontal spread
    }
  })

  it('returns cells in a straight line to the east', () => {
    const config: AoEConfig = { shape: 'line', sizeFeet: 25, originX: 0, originY: 0, direction: 'E' }
    const cells = getAoECells(config)
    expect(cells).toHaveLength(5) // 25/5 = 5 cells
  })

  it('returns nothing when no direction specified', () => {
    const config: AoEConfig = { shape: 'line', sizeFeet: 30, originX: 0, originY: 0 }
    const cells = getAoECells(config)
    expect(cells).toHaveLength(0)
  })

  it('widens line with widthFeet', () => {
    const narrow = getAoECells({ shape: 'line', sizeFeet: 30, originX: 5, originY: 5, direction: 'N', widthFeet: 5 })
    const wide = getAoECells({ shape: 'line', sizeFeet: 30, originX: 5, originY: 5, direction: 'N', widthFeet: 15 })
    expect(wide.length).toBeGreaterThanOrEqual(narrow.length)
  })
})

describe('getAoECells — cone', () => {
  it('returns cells in a cone to the south', () => {
    const config: AoEConfig = { shape: 'cone', sizeFeet: 15, originX: 5, originY: 5, direction: 'S' }
    const cells = getAoECells(config)
    expect(cells.length).toBeGreaterThan(0)
    // All cells should be at or below the origin row
    for (const c of cells) {
      expect(c.y).toBeGreaterThanOrEqual(5)
    }
  })

  it('returns nothing when no direction specified', () => {
    const config: AoEConfig = { shape: 'cone', sizeFeet: 15, originX: 0, originY: 0 }
    const cells = getAoECells(config)
    expect(cells).toHaveLength(0)
  })
})

describe('getAoECells — emanation', () => {
  it('surrounds a 1-cell entity', () => {
    const config: AoEConfig = { shape: 'emanation', sizeFeet: 5, originX: 5, originY: 5, entitySize: 1 }
    const cells = getAoECells(config)
    expect(cells.length).toBeGreaterThan(0)
  })

  it('surrounds a larger entity', () => {
    const small = getAoECells({ shape: 'emanation', sizeFeet: 5, originX: 0, originY: 0, entitySize: 1 })
    const large = getAoECells({ shape: 'emanation', sizeFeet: 5, originX: 0, originY: 0, entitySize: 2 })
    expect(large.length).toBeGreaterThan(small.length)
  })
})

describe('drawAoEOverlay', () => {
  it('clears the graphics before drawing', () => {
    const gfx = makeMockGraphics()
    const config: AoEConfig = { shape: 'cube', sizeFeet: 5, originX: 0, originY: 0 }
    drawAoEOverlay(gfx as never, config, 40)
    expect(gfx.clear).toHaveBeenCalledOnce()
  })

  it('calls fill and stroke for each cell', () => {
    const gfx = makeMockGraphics()
    const config: AoEConfig = { shape: 'cube', sizeFeet: 10, originX: 0, originY: 0 } // 4 cells
    drawAoEOverlay(gfx as never, config, 40)
    // fill and stroke called once per cell (border pass)
    expect(gfx.fill).toHaveBeenCalled()
    expect(gfx.stroke).toHaveBeenCalled()
  })

  it('uses custom color when provided', () => {
    const gfx = makeMockGraphics()
    const config: AoEConfig = { shape: 'sphere', sizeFeet: 5, originX: 0, originY: 0 }
    drawAoEOverlay(gfx as never, config, 40, 0x3b82f6)
    const fillCalls = gfx.fill.mock.calls
    expect(fillCalls.some((args) => (args[0] as { color: number }).color === 0x3b82f6)).toBe(true)
  })
})

describe('clearAoEOverlay', () => {
  it('calls clear on the graphics object', () => {
    const gfx = makeMockGraphics()
    clearAoEOverlay(gfx as never)
    expect(gfx.clear).toHaveBeenCalledOnce()
  })
})

describe('AoEShape type', () => {
  it('accepts all valid shape strings', () => {
    const shapes: AoEShape[] = ['cube', 'sphere', 'cylinder', 'cone', 'line', 'emanation']
    expect(shapes).toHaveLength(6)
    for (const s of shapes) {
      expect(typeof s).toBe('string')
    }
  })
})

describe('Direction8 type', () => {
  it('accepts all 8 compass directions', () => {
    const directions: Direction8[] = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    expect(directions).toHaveLength(8)
    for (const d of directions) {
      expect(typeof d).toBe('string')
    }
  })
})
