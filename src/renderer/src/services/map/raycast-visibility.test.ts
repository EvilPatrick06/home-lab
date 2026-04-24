import { describe, expect, it } from 'vitest'
import type { WallSegment } from '../../types/map'
import type { Point, Segment } from './raycast-visibility'
import {
  computeLitAreas,
  computeVisibility,
  isMovementBlocked,
  isPointVisible,
  wallsToSegments
} from './raycast-visibility'

// ─── computeVisibility ──────────────────────────────────────

describe('computeVisibility', () => {
  const bounds = { width: 100, height: 100 }

  it('returns full bounds polygon when there are no walls', () => {
    const result = computeVisibility({ x: 50, y: 50 }, [], bounds)

    expect(result.origin).toEqual({ x: 50, y: 50 })
    expect(result.points).toHaveLength(4)
    expect(result.points).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 }
    ])
  })

  it('returns a polygon with points when walls are present', () => {
    const walls: Segment[] = [{ a: { x: 30, y: 0 }, b: { x: 30, y: 50 }, type: 'solid' }]
    const result = computeVisibility({ x: 10, y: 25 }, walls, bounds)

    expect(result.origin).toEqual({ x: 10, y: 25 })
    expect(result.points.length).toBeGreaterThan(0)
  })

  it('filters out open doors (they do not block visibility)', () => {
    const walls: Segment[] = [{ a: { x: 50, y: 0 }, b: { x: 50, y: 100 }, type: 'door', isOpen: true }]
    const result = computeVisibility({ x: 25, y: 50 }, walls, bounds)

    // With door open, point on other side should be visible
    const rightSideVisible = isPointVisible({ x: 75, y: 50 }, result)
    expect(rightSideVisible).toBe(true)
  })

  it('windows do not block visibility', () => {
    const walls: Segment[] = [{ a: { x: 50, y: 0 }, b: { x: 50, y: 100 }, type: 'window' }]
    const result = computeVisibility({ x: 25, y: 50 }, walls, bounds)

    const otherSideVisible = isPointVisible({ x: 75, y: 50 }, result)
    expect(otherSideVisible).toBe(true)
  })

  it('solid walls block visibility', () => {
    // Thick wall that blocks line of sight
    const walls: Segment[] = [{ a: { x: 50, y: 0 }, b: { x: 50, y: 100 }, type: 'solid' }]
    const result = computeVisibility({ x: 10, y: 50 }, walls, bounds)

    // A point far behind the wall should not be visible
    const behindWall = isPointVisible({ x: 90, y: 50 }, result)
    expect(behindWall).toBe(false)
  })

  it('preserves the origin in the result', () => {
    const origin = { x: 42, y: 73 }
    const result = computeVisibility(origin, [], bounds)

    expect(result.origin).toEqual(origin)
  })
})

// ─── wallsToSegments ────────────────────────────────────────

describe('wallsToSegments', () => {
  it('converts WallSegment grid coordinates to pixel coordinates', () => {
    const wallSegments: WallSegment[] = [{ id: 'w1', x1: 2, y1: 3, x2: 5, y2: 3, type: 'solid' }]
    const cellSize = 50
    const result = wallsToSegments(wallSegments, cellSize)

    expect(result).toHaveLength(1)
    expect(result[0].a).toEqual({ x: 100, y: 150 })
    expect(result[0].b).toEqual({ x: 250, y: 150 })
    expect(result[0].type).toBe('solid')
  })

  it('preserves the type and isOpen properties', () => {
    const wallSegments: WallSegment[] = [{ id: 'w2', x1: 0, y1: 0, x2: 1, y2: 0, type: 'door', isOpen: true }]
    const result = wallsToSegments(wallSegments, 40)

    expect(result[0].type).toBe('door')
    expect(result[0].isOpen).toBe(true)
  })

  it('returns empty array for empty input', () => {
    expect(wallsToSegments([], 50)).toEqual([])
  })

  it('converts multiple wall segments', () => {
    const wallSegments: WallSegment[] = [
      { id: 'w1', x1: 0, y1: 0, x2: 1, y2: 0, type: 'solid' },
      { id: 'w2', x1: 1, y1: 0, x2: 1, y2: 1, type: 'window' },
      { id: 'w3', x1: 0, y1: 1, x2: 0, y2: 0, type: 'door', isOpen: false }
    ]
    const result = wallsToSegments(wallSegments, 10)

    expect(result).toHaveLength(3)
    expect(result[2].type).toBe('door')
    expect(result[2].isOpen).toBe(false)
  })
})

// ─── isPointVisible ─────────────────────────────────────────

describe('isPointVisible', () => {
  it('returns false for a polygon with fewer than 3 points', () => {
    const poly = {
      origin: { x: 0, y: 0 },
      points: [
        { x: 1, y: 0 },
        { x: 0, y: 1 }
      ]
    }
    expect(isPointVisible({ x: 0.5, y: 0.5 }, poly)).toBe(false)
  })

  it('returns true for a point inside a simple square polygon', () => {
    const poly = {
      origin: { x: 50, y: 50 },
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ]
    }
    expect(isPointVisible({ x: 50, y: 50 }, poly)).toBe(true)
  })

  it('returns false for a point outside the polygon', () => {
    const poly = {
      origin: { x: 50, y: 50 },
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 }
      ]
    }
    expect(isPointVisible({ x: 150, y: 150 }, poly)).toBe(false)
  })

  it('returns true for a point inside a triangle polygon', () => {
    const poly = {
      origin: { x: 50, y: 25 },
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 50, y: 100 }
      ]
    }
    // Point at the centroid should be inside
    expect(isPointVisible({ x: 50, y: 30 }, poly)).toBe(true)
  })
})

// ─── isMovementBlocked ──────────────────────────────────────

describe('isMovementBlocked', () => {
  it('returns false when there are no walls', () => {
    expect(isMovementBlocked({ x: 0, y: 0 }, { x: 100, y: 100 }, [])).toBe(false)
  })

  it('returns true when a solid wall crosses the movement path', () => {
    const walls: Segment[] = [{ a: { x: 50, y: 0 }, b: { x: 50, y: 100 }, type: 'solid' }]
    expect(isMovementBlocked({ x: 10, y: 50 }, { x: 90, y: 50 }, walls)).toBe(true)
  })

  it('returns false when an open door is in the path', () => {
    const walls: Segment[] = [{ a: { x: 50, y: 0 }, b: { x: 50, y: 100 }, type: 'door', isOpen: true }]
    expect(isMovementBlocked({ x: 10, y: 50 }, { x: 90, y: 50 }, walls)).toBe(false)
  })

  it('returns true when a closed door is in the path', () => {
    const walls: Segment[] = [{ a: { x: 50, y: 0 }, b: { x: 50, y: 100 }, type: 'door', isOpen: false }]
    expect(isMovementBlocked({ x: 10, y: 50 }, { x: 90, y: 50 }, walls)).toBe(true)
  })

  it('returns true when a window is in the path (blocks movement)', () => {
    const walls: Segment[] = [{ a: { x: 50, y: 0 }, b: { x: 50, y: 100 }, type: 'window' }]
    expect(isMovementBlocked({ x: 10, y: 50 }, { x: 90, y: 50 }, walls)).toBe(true)
  })

  it('returns false when the wall is not crossing the path', () => {
    const walls: Segment[] = [{ a: { x: 200, y: 200 }, b: { x: 200, y: 300 }, type: 'solid' }]
    expect(isMovementBlocked({ x: 10, y: 50 }, { x: 90, y: 50 }, walls)).toBe(false)
  })
})

// ─── Point type ─────────────────────────────────────────────

describe('Point type', () => {
  it('Point objects with x/y are accepted by computeVisibility origin and results', () => {
    const origin: Point = { x: 20, y: 30 }
    const result = computeVisibility(origin, [], { width: 100, height: 100 })
    const topLeft: Point = result.points[0]
    expect(topLeft).toHaveProperty('x')
    expect(topLeft).toHaveProperty('y')
    expect(result.origin).toEqual(origin satisfies Point)
  })

  it('isPointVisible accepts Point arguments for both point and polygon vertices', () => {
    const center: Point = { x: 50, y: 50 }
    const topRight: Point = { x: 100, y: 0 }
    const bottomRight: Point = { x: 100, y: 100 }
    const bottomLeft: Point = { x: 0, y: 100 }
    const poly = {
      origin: center,
      points: [{ x: 0, y: 0 } satisfies Point, topRight, bottomRight, bottomLeft]
    }
    const probe: Point = { x: 50, y: 50 }
    expect(isPointVisible(probe, poly)).toBe(true)
  })

  it('isMovementBlocked accepts Point for from/to arguments', () => {
    const from: Point = { x: 0, y: 50 }
    const to: Point = { x: 100, y: 50 }
    expect(isMovementBlocked(from, to, [])).toBe(false)
  })
})

// ─── computeLitAreas ────────────────────────────────────────

describe('computeLitAreas', () => {
  const bounds = { width: 200, height: 200 }
  const cellSize = 10

  it('returns an array matching the number of light sources', () => {
    const sources = [
      { x: 5, y: 5, brightRadius: 4, dimRadius: 2 },
      { x: 15, y: 15, brightRadius: 6, dimRadius: 3 }
    ]
    const result = computeLitAreas(sources, [], bounds, cellSize)

    expect(result).toHaveLength(2)
  })

  it('each lit area has source, brightPoly, and dimPoly', () => {
    const sources = [{ x: 10, y: 10, brightRadius: 4, dimRadius: 2 }]
    const result = computeLitAreas(sources, [], bounds, cellSize)

    expect(result[0].source).toBe(sources[0])
    expect(result[0].brightPoly).toHaveProperty('points')
    expect(result[0].brightPoly).toHaveProperty('origin')
    expect(result[0].dimPoly).toHaveProperty('points')
  })

  it('dimPoly covers a larger area than brightPoly', () => {
    const sources = [{ x: 10, y: 10, brightRadius: 3, dimRadius: 3 }]
    const result = computeLitAreas(sources, [], bounds, cellSize)

    // dimPoly includes brightRadius + dimRadius, so it should have points at or beyond bright points
    const brightMaxDist = Math.max(
      ...result[0].brightPoly.points.map((p) => {
        const dx = p.x - result[0].brightPoly.origin.x
        const dy = p.y - result[0].brightPoly.origin.y
        return Math.sqrt(dx * dx + dy * dy)
      })
    )
    const dimMaxDist = Math.max(
      ...result[0].dimPoly.points.map((p) => {
        const dx = p.x - result[0].dimPoly.origin.x
        const dy = p.y - result[0].dimPoly.origin.y
        return Math.sqrt(dx * dx + dy * dy)
      })
    )

    expect(dimMaxDist).toBeGreaterThanOrEqual(brightMaxDist)
  })

  it('returns empty array for no light sources', () => {
    expect(computeLitAreas([], [], bounds, cellSize)).toEqual([])
  })
})
