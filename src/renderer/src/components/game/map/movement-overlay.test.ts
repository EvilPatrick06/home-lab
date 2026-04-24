import { describe, expect, it, vi } from 'vitest'
import { clearMovementOverlay, drawMovementOverlay, drawTerrainOverlay } from './movement-overlay'

// ─── Mock dependencies ─────────────────────────────────────────

vi.mock('../../../services/combat/combat-rules', () => ({
  getReachableCells: vi.fn(() => [
    { x: 1, y: 0, cost: 30 },
    { x: 2, y: 0, cost: 60 }
  ])
}))

vi.mock('../../../services/map/pathfinder', () => ({
  getReachableCellsWithWalls: vi.fn(() => [
    { x: 1, y: 0, cost: 30 },
    { x: 0, y: 1, cost: 60 }
  ])
}))

// ─── Graphics mock factory ─────────────────────────────────────

function makeGraphics() {
  return {
    clear: vi.fn(),
    rect: vi.fn().mockReturnThis(),
    fill: vi.fn().mockReturnThis(),
    moveTo: vi.fn().mockReturnThis(),
    lineTo: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis()
  }
}

// ─── drawMovementOverlay ───────────────────────────────────────

describe('drawMovementOverlay', () => {
  it('clears the graphics on every call', () => {
    const gfx = makeGraphics()
    drawMovementOverlay(gfx as never, 0, 0, 30, 30, 70, [], 10, 10)
    expect(gfx.clear).toHaveBeenCalled()
  })

  it('returns early without drawing when movementRemaining <= 0', () => {
    const gfx = makeGraphics()
    drawMovementOverlay(gfx as never, 0, 0, 0, 30, 70, [], 10, 10)
    expect(gfx.rect).not.toHaveBeenCalled()
  })

  it('draws reachable cells when movement is available', () => {
    const gfx = makeGraphics()
    drawMovementOverlay(gfx as never, 0, 0, 30, 30, 70, [], 10, 10)
    expect(gfx.rect).toHaveBeenCalled()
    expect(gfx.fill).toHaveBeenCalled()
  })

  it('uses wall-aware pathfinder when walls are provided', async () => {
    const { getReachableCellsWithWalls } = await import('../../../services/map/pathfinder')
    const gfx = makeGraphics()
    const walls = [{ id: 'w1', x1: 1, y1: 0, x2: 1, y2: 1, type: 'solid' as const, isOpen: false }]
    drawMovementOverlay(gfx as never, 0, 0, 30, 30, 70, [], 10, 10, walls)
    expect(getReachableCellsWithWalls).toHaveBeenCalled()
  })

  it('uses simple BFS pathfinder when no walls provided', async () => {
    const { getReachableCells } = await import('../../../services/combat/combat-rules')
    const gfx = makeGraphics()
    drawMovementOverlay(gfx as never, 0, 0, 30, 30, 70, [], 10, 10)
    expect(getReachableCells).toHaveBeenCalled()
  })

  it('uses simple BFS when walls array is empty', async () => {
    const { getReachableCells } = await import('../../../services/combat/combat-rules')
    const gfx = makeGraphics()
    drawMovementOverlay(gfx as never, 0, 0, 30, 30, 70, [], 10, 10, [])
    expect(getReachableCells).toHaveBeenCalled()
  })

  it('sizes each cell rect using cellSize', () => {
    const gfx = makeGraphics()
    drawMovementOverlay(gfx as never, 0, 0, 30, 30, 70, [], 10, 10)
    const [, , w, h] = gfx.rect.mock.calls[0]
    expect(w).toBe(70)
    expect(h).toBe(70)
  })
})

// ─── drawTerrainOverlay ────────────────────────────────────────

describe('drawTerrainOverlay', () => {
  it('clears the graphics on every call', () => {
    const gfx = makeGraphics()
    drawTerrainOverlay(gfx as never, [], 70)
    expect(gfx.clear).toHaveBeenCalled()
  })

  it('draws a rect for each terrain cell', () => {
    const gfx = makeGraphics()
    const terrain = [
      { x: 1, y: 2, type: 'difficult' as const, movementCost: 2 },
      { x: 3, y: 4, type: 'water' as const, movementCost: 2 }
    ]
    drawTerrainOverlay(gfx as never, terrain, 70)
    expect(gfx.rect).toHaveBeenCalledTimes(2)
  })

  it('draws crosshatch lines for difficult terrain', () => {
    const gfx = makeGraphics()
    drawTerrainOverlay(gfx as never, [{ x: 0, y: 0, type: 'difficult', movementCost: 2 }], 70)
    expect(gfx.moveTo).toHaveBeenCalled()
    expect(gfx.lineTo).toHaveBeenCalled()
  })

  it('draws vertical lines for climbing terrain', () => {
    const gfx = makeGraphics()
    drawTerrainOverlay(gfx as never, [{ x: 0, y: 0, type: 'climbing', movementCost: 2 }], 70)
    expect(gfx.moveTo).toHaveBeenCalled()
    expect(gfx.lineTo).toHaveBeenCalled()
  })

  it('does not draw pattern lines for water terrain', () => {
    const gfx = makeGraphics()
    drawTerrainOverlay(gfx as never, [{ x: 0, y: 0, type: 'water', movementCost: 2 }], 70)
    expect(gfx.moveTo).not.toHaveBeenCalled()
  })

  it('floors fractional cell coordinates before drawing', () => {
    const gfx = makeGraphics()
    drawTerrainOverlay(gfx as never, [{ x: 1.7, y: 2.9, type: 'hazard', movementCost: 1 }], 70)
    const [x, y] = gfx.rect.mock.calls[0]
    expect(x).toBe(70) // Math.floor(1.7) * 70
    expect(y).toBe(140) // Math.floor(2.9) * 70
  })
})

// ─── clearMovementOverlay ──────────────────────────────────────

describe('clearMovementOverlay', () => {
  it('calls clear on the graphics object', () => {
    const gfx = makeGraphics()
    clearMovementOverlay(gfx as never)
    expect(gfx.clear).toHaveBeenCalledOnce()
  })
})
