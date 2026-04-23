import { describe, expect, it, vi } from 'vitest'
import type { GridSettings, WallSegment } from '../../../types/map'
import {
  drawWallPreview,
  drawWalls,
  findNearbyWallEndpoint,
  hitTestDoorHandle,
  snapToGridIntersection
} from './wall-layer'

// ─── Default grid ─────────────────────────────────────────────

const DEFAULT_GRID: GridSettings = {
  enabled: true,
  cellSize: 70,
  offsetX: 0,
  offsetY: 0,
  color: '#ffffff',
  opacity: 1,
  type: 'square'
}

// ─── Graphics mock factory ─────────────────────────────────────

function makeGraphics() {
  return {
    clear: vi.fn(),
    setStrokeStyle: vi.fn().mockReturnThis(),
    moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    fill: vi.fn().mockReturnThis(),
    circle: vi.fn().mockReturnThis(),
    rect: vi.fn().mockReturnThis()
  }
}

// ─── Wall factories ───────────────────────────────────────────

function makeSolidWall(overrides: Partial<WallSegment> = {}): WallSegment {
  return {
    id: 'wall-1',
    x1: 0,
    y1: 0,
    x2: 1,
    y2: 0,
    type: 'solid',
    isOpen: false,
    ...overrides
  }
}

// ─── drawWalls ─────────────────────────────────────────────────

describe('drawWalls', () => {
  it('clears graphics at the start', () => {
    const gfx = makeGraphics()
    drawWalls(gfx as never, [], DEFAULT_GRID, true)
    expect(gfx.clear).toHaveBeenCalled()
  })

  it('does not draw anything when isHost is false', () => {
    const gfx = makeGraphics()
    drawWalls(gfx as never, [makeSolidWall()], DEFAULT_GRID, false)
    expect(gfx.moveTo).not.toHaveBeenCalled()
  })

  it('draws a line for each wall segment', () => {
    const gfx = makeGraphics()
    drawWalls(
      gfx as never,
      [makeSolidWall(), makeSolidWall({ id: 'wall-2', x1: 1, y1: 0, x2: 2, y2: 0 })],
      DEFAULT_GRID,
      true
    )
    expect(gfx.moveTo).toHaveBeenCalledTimes(2)
    expect(gfx.lineTo).toHaveBeenCalledTimes(2)
  })

  it('converts grid coordinates to pixel coordinates using cellSize + offset', () => {
    const gfx = makeGraphics()
    const grid: GridSettings = { ...DEFAULT_GRID, cellSize: 50, offsetX: 10, offsetY: 20 }
    drawWalls(gfx as never, [makeSolidWall({ x1: 1, y1: 1, x2: 2, y2: 1 })], grid, true)
    // x1 = 1 * 50 + 10 = 60, y1 = 1 * 50 + 20 = 70
    expect(gfx.moveTo).toHaveBeenCalledWith(60, 70)
    // x2 = 2 * 50 + 10 = 110, y2 = 1 * 50 + 20 = 70
    expect(gfx.lineTo).toHaveBeenCalledWith(110, 70)
  })

  it('draws a door handle rect at midpoint for door walls', () => {
    const gfx = makeGraphics()
    drawWalls(gfx as never, [makeSolidWall({ type: 'door' })], DEFAULT_GRID, true)
    expect(gfx.rect).toHaveBeenCalled()
  })

  it('does not draw a door handle for solid walls', () => {
    const gfx = makeGraphics()
    drawWalls(gfx as never, [makeSolidWall({ type: 'solid' })], DEFAULT_GRID, true)
    expect(gfx.rect).not.toHaveBeenCalled()
  })

  it('draws dashes for window walls using moveTo/lineTo pairs', () => {
    const gfx = makeGraphics()
    // Longer window wall so we get multiple dashes
    drawWalls(gfx as never, [makeSolidWall({ type: 'window', x1: 0, y1: 0, x2: 5, y2: 0 })], DEFAULT_GRID, true)
    // At least one extra moveTo/lineTo beyond the first wall line draw (the dash pattern)
    expect(gfx.moveTo.mock.calls.length).toBeGreaterThan(1)
  })

  it('draws endpoint circles for each wall', () => {
    const gfx = makeGraphics()
    drawWalls(gfx as never, [makeSolidWall()], DEFAULT_GRID, true)
    // Two endpoint circles per wall
    expect(gfx.circle).toHaveBeenCalledTimes(2)
  })
})

// ─── drawWallPreview ──────────────────────────────────────────

describe('drawWallPreview', () => {
  it('clears graphics at the start', () => {
    const gfx = makeGraphics()
    drawWallPreview(gfx as never, null, null, DEFAULT_GRID, 'solid')
    expect(gfx.clear).toHaveBeenCalled()
  })

  it('does nothing when startPoint or currentPoint is null', () => {
    const gfx = makeGraphics()
    drawWallPreview(gfx as never, { x: 0, y: 0 }, null, DEFAULT_GRID, 'solid')
    expect(gfx.moveTo).not.toHaveBeenCalled()

    const gfx2 = makeGraphics()
    drawWallPreview(gfx2 as never, null, { x: 1, y: 1 }, DEFAULT_GRID, 'solid')
    expect(gfx2.moveTo).not.toHaveBeenCalled()
  })

  it('draws the preview line between start and current points', () => {
    const gfx = makeGraphics()
    drawWallPreview(gfx as never, { x: 0, y: 0 }, { x: 2, y: 0 }, DEFAULT_GRID, 'solid')
    expect(gfx.moveTo).toHaveBeenCalledWith(0, 0)
    expect(gfx.lineTo).toHaveBeenCalledWith(140, 0)
  })

  it('draws snap indicator circles at endpoints', () => {
    const gfx = makeGraphics()
    drawWallPreview(gfx as never, { x: 0, y: 0 }, { x: 1, y: 0 }, DEFAULT_GRID, 'solid')
    expect(gfx.circle).toHaveBeenCalledTimes(2)
  })
})

// ─── hitTestDoorHandle ────────────────────────────────────────

describe('hitTestDoorHandle', () => {
  it('returns null when no walls', () => {
    expect(hitTestDoorHandle(35, 0, [], DEFAULT_GRID)).toBeNull()
  })

  it('returns null for non-door walls', () => {
    const result = hitTestDoorHandle(35, 0, [makeSolidWall({ type: 'solid' })], DEFAULT_GRID)
    expect(result).toBeNull()
  })

  it('returns the wall when click is near door handle midpoint', () => {
    const doorWall: WallSegment = { id: 'door-1', x1: 0, y1: 0, x2: 2, y2: 0, type: 'door', isOpen: false }
    // midX = (0+2)/2 * 70 = 70, midY = 0
    const result = hitTestDoorHandle(70, 0, [doorWall], DEFAULT_GRID)
    expect(result).toEqual(doorWall)
  })

  it('returns null when click is far from door handle', () => {
    const doorWall: WallSegment = { id: 'door-1', x1: 0, y1: 0, x2: 2, y2: 0, type: 'door', isOpen: false }
    const result = hitTestDoorHandle(500, 500, [doorWall], DEFAULT_GRID)
    expect(result).toBeNull()
  })

  it('returns the first matching wall when multiple doors overlap', () => {
    const door1: WallSegment = { id: 'door-1', x1: 0, y1: 0, x2: 2, y2: 0, type: 'door', isOpen: false }
    const door2: WallSegment = { id: 'door-2', x1: 0, y1: 0, x2: 2, y2: 0, type: 'door', isOpen: true }
    const result = hitTestDoorHandle(70, 0, [door1, door2], DEFAULT_GRID)
    expect(result?.id).toBe('door-1')
  })
})

// ─── snapToGridIntersection ───────────────────────────────────

describe('snapToGridIntersection', () => {
  it('returns grid 0,0 for pixel 0,0 with no offset', () => {
    const result = snapToGridIntersection(0, 0, DEFAULT_GRID)
    expect(result).toEqual({ x: 0, y: 0 })
  })

  it('snaps to nearest grid intersection', () => {
    // 70px cellSize, pixel 38 = 38/70 ≈ 0.54 → rounds to 1
    const result = snapToGridIntersection(38, 38, DEFAULT_GRID)
    expect(result).toEqual({ x: 1, y: 1 })
  })

  it('accounts for grid offset', () => {
    const grid: GridSettings = { ...DEFAULT_GRID, offsetX: 35, offsetY: 35 }
    // pixel 35 → relX = 0 → 0/70 = 0 → rounds to 0
    const result = snapToGridIntersection(35, 35, grid)
    expect(result).toEqual({ x: 0, y: 0 })
  })

  it('returns correct coordinates for pixel at exact cell boundary', () => {
    // 70 * 3 = 210px = 3 cells
    const result = snapToGridIntersection(210, 140, DEFAULT_GRID)
    expect(result).toEqual({ x: 3, y: 2 })
  })
})

// ─── findNearbyWallEndpoint ───────────────────────────────────

describe('findNearbyWallEndpoint', () => {
  const walls: WallSegment[] = [
    { id: 'w1', x1: 0, y1: 0, x2: 2, y2: 0, type: 'solid', isOpen: false },
    { id: 'w2', x1: 2, y1: 0, x2: 4, y2: 0, type: 'solid', isOpen: false }
  ]

  it('returns null when no walls are provided', () => {
    expect(findNearbyWallEndpoint(1, 1, [])).toBeNull()
  })

  it('returns null when no endpoint is within snap threshold', () => {
    expect(findNearbyWallEndpoint(10, 10, walls)).toBeNull()
  })

  it('returns the matching x1,y1 endpoint when within threshold', () => {
    const result = findNearbyWallEndpoint(0.1, 0.1, walls)
    expect(result).toEqual({ x: 0, y: 0 })
  })

  it('returns the matching x2,y2 endpoint when within threshold', () => {
    const result = findNearbyWallEndpoint(2.1, 0.1, walls)
    expect(result).toEqual({ x: 2, y: 0 })
  })

  it('respects a custom snap threshold', () => {
    // Point 1 unit away — outside default 0.5 threshold, inside custom 1.5 threshold
    const result = findNearbyWallEndpoint(1, 0, walls, 1.5)
    expect(result).not.toBeNull()
  })

  it('returns null when outside custom snap threshold', () => {
    const result = findNearbyWallEndpoint(3, 3, walls, 0.5)
    expect(result).toBeNull()
  })
})
