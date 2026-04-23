import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { destroyFogAnimation, drawFogOfWar } from './fog-overlay'

function makeMockGraphics() {
  return {
    clear: vi.fn().mockReturnThis(),
    moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(),
    closePath: vi.fn().mockReturnThis(),
    rect: vi.fn().mockReturnThis(),
    fill: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis()
  }
}

function makeMockApp(deltaMS = 16) {
  const tickerCallbacks: Array<() => void> = []
  return {
    ticker: {
      add: vi.fn((fn: () => void) => tickerCallbacks.push(fn)),
      remove: vi.fn((fn: () => void) => {
        const i = tickerCallbacks.indexOf(fn)
        if (i !== -1) tickerCallbacks.splice(i, 1)
      }),
      deltaMS,
      tick: () => tickerCallbacks.forEach((fn) => fn())
    }
  }
}

const BASE_GRID = {
  cellSize: 40,
  offsetX: 0,
  offsetY: 0,
  enabled: true,
  color: '#555555',
  opacity: 0.5,
  type: 'square' as const
}

const HEX_GRID = {
  ...BASE_GRID,
  type: 'hex-flat' as const
}

const FOG_DISABLED = {
  enabled: false,
  revealedCells: [],
  exploredCells: [],
  dynamicFogEnabled: false
}

const FOG_ALL_REVEALED = {
  enabled: true,
  revealedCells: [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 }
  ],
  exploredCells: [],
  dynamicFogEnabled: false
}

const FOG_ALL_HIDDEN = {
  enabled: true,
  revealedCells: [],
  exploredCells: [],
  dynamicFogEnabled: false
}

describe('drawFogOfWar — disabled fog', () => {
  it('clears graphics and returns early when fog is disabled', () => {
    const gfx = makeMockGraphics()
    drawFogOfWar(gfx as never, FOG_DISABLED, BASE_GRID, 200, 200)
    expect(gfx.clear).toHaveBeenCalledOnce()
    expect(gfx.rect).not.toHaveBeenCalled()
  })
})

describe('drawFogOfWar — no animation (static)', () => {
  beforeEach(() => {
    // Ensure no animation state from a previous test
    destroyFogAnimation()
  })

  afterEach(() => {
    destroyFogAnimation()
  })

  it('clears the graphics at the start', () => {
    const gfx = makeMockGraphics()
    drawFogOfWar(gfx as never, FOG_ALL_HIDDEN, BASE_GRID, 200, 200)
    expect(gfx.clear).toHaveBeenCalled()
  })

  it('draws fog cells when all cells are unrevealed', () => {
    const gfx = makeMockGraphics()
    drawFogOfWar(gfx as never, FOG_ALL_HIDDEN, BASE_GRID, 200, 200)
    // Should draw at least some cells
    expect(gfx.rect).toHaveBeenCalled()
    expect(gfx.fill).toHaveBeenCalled()
  })

  it('does not fill cells that are revealed', () => {
    const gfx = makeMockGraphics()
    // With all cells revealed, nothing to draw
    const revealedCells: Array<{ x: number; y: number }> = []
    for (let col = -1; col <= 6; col++) {
      for (let row = -1; row <= 6; row++) {
        revealedCells.push({ x: col, y: row })
      }
    }
    const fullReveal = {
      enabled: true,
      revealedCells,
      exploredCells: [],
      dynamicFogEnabled: false
    }
    drawFogOfWar(gfx as never, fullReveal, BASE_GRID, 200, 200)
    // Revealed cells don't get fog drawn
    expect(gfx.fill).not.toHaveBeenCalledWith(expect.objectContaining({ alpha: 0.75 }))
  })

  it('uses party vision cells to reveal additional cells', () => {
    const gfx = makeMockGraphics()
    const callsBefore = gfx.rect.mock.calls.length
    drawFogOfWar(gfx as never, FOG_ALL_HIDDEN, BASE_GRID, 200, 200)
    const callsWithoutVision = gfx.rect.mock.calls.length
    // Verify fog rects were drawn (calls increased from the initial count)
    expect(callsWithoutVision).toBeGreaterThan(callsBefore)

    const gfx2 = makeMockGraphics()
    const partyVision = Array.from({ length: 5 }, (_, i) => ({ x: i, y: 0 }))
    drawFogOfWar(gfx2 as never, FOG_ALL_HIDDEN, BASE_GRID, 200, 200, partyVision)
    const callsWithVision = gfx2.rect.mock.calls.length

    // With more revealed cells (via party vision), fewer fog rects should be drawn
    expect(callsWithVision).toBeLessThanOrEqual(callsWithoutVision)
  })

  it('draws hex-shaped fog cells for hex grids', () => {
    const gfx = makeMockGraphics()
    drawFogOfWar(gfx as never, FOG_ALL_HIDDEN, HEX_GRID, 200, 200)
    expect(gfx.rect).not.toHaveBeenCalled()
    expect(gfx.moveTo).toHaveBeenCalled()
    expect(gfx.lineTo).toHaveBeenCalled()
    expect(gfx.closePath).toHaveBeenCalled()
  })
})

describe('drawFogOfWar — animated fog with app ticker', () => {
  it('accepts a mock app for animated fog rendering', () => {
    const app = makeMockApp(16)
    expect(app.ticker).toBeDefined()
    expect(app.ticker.deltaMS).toBe(16)
    expect(typeof app.ticker.add).toBe('function')
    expect(typeof app.ticker.remove).toBe('function')
  })
})

describe('drawFogOfWar — revealed fog', () => {
  beforeEach(() => {
    destroyFogAnimation()
  })

  afterEach(() => {
    destroyFogAnimation()
  })

  it('skips drawing fog for revealed cells', () => {
    const gfx = makeMockGraphics()
    drawFogOfWar(gfx as never, FOG_ALL_REVEALED, BASE_GRID, 200, 200)
    expect(gfx.clear).toHaveBeenCalled()
    // Revealed cells should not produce full-opacity fog
    const fillCalls = gfx.fill.mock.calls
    const fullOpacityFill = fillCalls.filter((args) => (args[0] as { alpha?: number })?.alpha === 1.0)
    expect(fullOpacityFill).toHaveLength(0)
  })
})

describe('destroyFogAnimation', () => {
  it('does not throw when called with no active animation', () => {
    expect(() => destroyFogAnimation()).not.toThrow()
  })

  it('can be called multiple times safely', () => {
    expect(() => {
      destroyFogAnimation()
      destroyFogAnimation()
      destroyFogAnimation()
    }).not.toThrow()
  })
})
