import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GridSettings } from '../../../types/map'
import { drawGrid } from './grid-layer'

function makeMockGraphics() {
  return {
    clear: vi.fn().mockReturnThis(),
    moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    closePath: vi.fn().mockReturnThis()
  }
}

const squareGrid: GridSettings = {
  enabled: true,
  cellSize: 40,
  offsetX: 0,
  offsetY: 0,
  color: '#555555',
  opacity: 0.5,
  type: 'square'
}

describe('drawGrid — disabled grid', () => {
  it('clears and returns early without drawing when disabled', () => {
    const gfx = makeMockGraphics()
    drawGrid(gfx as never, { ...squareGrid, enabled: false }, 200, 200)
    expect(gfx.clear).toHaveBeenCalledOnce()
    expect(gfx.moveTo).not.toHaveBeenCalled()
    expect(gfx.stroke).not.toHaveBeenCalled()
  })
})

describe('drawGrid — square grid', () => {
  let gfx: ReturnType<typeof makeMockGraphics>

  beforeEach(() => {
    gfx = makeMockGraphics()
  })

  it('clears before drawing', () => {
    drawGrid(gfx as never, squareGrid, 200, 200)
    expect(gfx.clear).toHaveBeenCalledOnce()
  })

  it('draws vertical lines', () => {
    drawGrid(gfx as never, squareGrid, 200, 200)
    // For a 200px wide map with 40px cells (no offset): 5 vertical lines (x=0,40,80,120,160,200)
    const vLines = gfx.moveTo.mock.calls.filter(([, y]) => y === 0)
    expect(vLines.length).toBeGreaterThan(0)
  })

  it('draws horizontal lines', () => {
    drawGrid(gfx as never, squareGrid, 200, 200)
    const hLines = gfx.moveTo.mock.calls.filter(([x]) => x === 0)
    expect(hLines.length).toBeGreaterThan(0)
  })

  it('calls stroke once after drawing all lines', () => {
    drawGrid(gfx as never, squareGrid, 200, 200)
    expect(gfx.stroke).toHaveBeenCalledOnce()
  })

  it('passes color and opacity to stroke', () => {
    const colorGrid: GridSettings = { ...squareGrid, color: '#ff0000', opacity: 0.8 }
    drawGrid(gfx as never, colorGrid, 200, 200)
    const strokeArgs = gfx.stroke.mock.calls[0][0] as { color: number; alpha: number }
    expect(strokeArgs.color).toBe(0xff0000)
    expect(strokeArgs.alpha).toBe(0.8)
  })

  it('handles hex color string without # prefix by defaulting to white', () => {
    const noHashGrid: GridSettings = { ...squareGrid, color: 'invalid-color' }
    drawGrid(gfx as never, noHashGrid, 200, 200)
    const strokeArgs = gfx.stroke.mock.calls[0][0] as { color: number }
    expect(strokeArgs.color).toBe(0xffffff)
  })

  it('respects non-zero offsetX for vertical line starting position', () => {
    const offsetGrid: GridSettings = { ...squareGrid, offsetX: 10 }
    drawGrid(gfx as never, offsetGrid, 200, 200)
    // First vertical line should start at 10 % 40 = 10
    const firstVLine = gfx.moveTo.mock.calls.find(([, y]) => y === 0)
    expect(firstVLine).toBeDefined()
    expect(firstVLine![0]).toBe(10)
  })

  it('respects non-zero offsetY for horizontal line starting position', () => {
    const offsetGrid: GridSettings = { ...squareGrid, offsetY: 20 }
    drawGrid(gfx as never, offsetGrid, 200, 200)
    // Horizontal lines use moveTo(0, y) — filter out vertical lines which have moveTo(x, 0)
    // The first horizontal line should start at y = offsetY % cellSize = 20
    const hLineCalls = gfx.moveTo.mock.calls.filter(([x, y]: number[]) => x === 0 && y > 0)
    expect(hLineCalls.length).toBeGreaterThan(0)
    expect(hLineCalls[0][1]).toBe(20)
  })

  it('draws more lines for smaller cell sizes', () => {
    const smallCell: GridSettings = { ...squareGrid, cellSize: 20 }
    const bigCell: GridSettings = { ...squareGrid, cellSize: 80 }

    const gfxSmall = makeMockGraphics()
    const gfxBig = makeMockGraphics()
    drawGrid(gfxSmall as never, smallCell, 400, 400)
    drawGrid(gfxBig as never, bigCell, 400, 400)

    expect(gfxSmall.moveTo.mock.calls.length).toBeGreaterThan(gfxBig.moveTo.mock.calls.length)
  })
})

describe('drawGrid — hex grid', () => {
  it('delegates to hex drawing path and calls stroke', () => {
    const gfx = makeMockGraphics()
    const hexGrid: GridSettings = { ...squareGrid, type: 'hex' }
    drawGrid(gfx as never, hexGrid, 200, 200)
    expect(gfx.clear).toHaveBeenCalled()
    expect(gfx.stroke).toHaveBeenCalled()
  })

  it('draws hex outlines via closePath', () => {
    const gfx = makeMockGraphics()
    const hexGrid: GridSettings = { ...squareGrid, type: 'hex' }
    drawGrid(gfx as never, hexGrid, 200, 200)
    expect(gfx.closePath).toHaveBeenCalled()
  })
})
