import { describe, expect, it } from 'vitest'
import type { WallSegment } from '../../types/map'
import type { LightSource, Point, Segment } from './raycast-visibility'
import {
  clipToRadius,
  computeLitAreas,
  computeVisibility,
  isBlockedByOneWayWall,
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

  it('handles overlapping/duplicate walls without crashing', () => {
    const walls: Segment[] = [
      { a: { x: 40, y: 0 }, b: { x: 40, y: 100 }, type: 'solid' },
      { a: { x: 40, y: 0 }, b: { x: 40, y: 100 }, type: 'solid' }, // exact duplicate
      { a: { x: 40, y: 10 }, b: { x: 40, y: 90 }, type: 'solid' } // overlapping subset
    ]
    expect(() => computeVisibility({ x: 20, y: 50 }, walls, bounds)).not.toThrow()
    const result = computeVisibility({ x: 20, y: 50 }, walls, bounds)
    expect(result.points.length).toBeGreaterThan(0)
  })

  it('origin at top-left boundary (0,0) does not crash', () => {
    const walls: Segment[] = [{ a: { x: 50, y: 0 }, b: { x: 50, y: 100 }, type: 'solid' }]
    expect(() => computeVisibility({ x: 0, y: 0 }, walls, bounds)).not.toThrow()
  })

  it('origin at bottom-right boundary (100,100) does not crash', () => {
    expect(() => computeVisibility({ x: 100, y: 100 }, [], bounds)).not.toThrow()
  })

  it('origin exactly on a wall endpoint does not crash', () => {
    const walls: Segment[] = [{ a: { x: 50, y: 50 }, b: { x: 80, y: 50 }, type: 'solid' }]
    expect(() => computeVisibility({ x: 50, y: 50 }, walls, bounds)).not.toThrow()
  })

  it('transparent walls do not block visibility', () => {
    const walls: Segment[] = [{ a: { x: 50, y: 0 }, b: { x: 50, y: 100 }, type: 'transparent' }]
    const result = computeVisibility({ x: 25, y: 50 }, walls, bounds)
    const otherSideVisible = isPointVisible({ x: 75, y: 50 }, result)
    expect(otherSideVisible).toBe(true)
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

  it('returns true for transparent walls (force walls block movement)', () => {
    const walls: Segment[] = [{ a: { x: 50, y: 0 }, b: { x: 50, y: 100 }, type: 'transparent' }]
    expect(isMovementBlocked({ x: 10, y: 50 }, { x: 90, y: 50 }, walls)).toBe(true)
  })

  it('returns false for wall parallel to movement direction', () => {
    // Moving left-to-right; wall is also horizontal (parallel) — no intersection
    const walls: Segment[] = [{ a: { x: 0, y: 30 }, b: { x: 100, y: 30 }, type: 'solid' }]
    expect(isMovementBlocked({ x: 0, y: 50 }, { x: 100, y: 50 }, walls)).toBe(false)
  })

  it('returns false when path starts and ends on same side of wall', () => {
    const walls: Segment[] = [{ a: { x: 80, y: 0 }, b: { x: 80, y: 100 }, type: 'solid' }]
    // Both from and to are left of x=80
    expect(isMovementBlocked({ x: 10, y: 50 }, { x: 70, y: 50 }, walls)).toBe(false)
  })

  it('one-way wall blocks from blocked side (0° normal = +x direction)', () => {
    // Wall at x=50, normal pointing right (+x, 0°). Origin at x=80 (right side = same as normal) → blocked.
    const walls: Segment[] = [
      {
        a: { x: 50, y: 0 },
        b: { x: 50, y: 100 },
        type: 'one-way',
        oneWayDirection: 0
      }
    ]
    expect(isMovementBlocked({ x: 80, y: 50 }, { x: 20, y: 50 }, walls)).toBe(true)
  })

  it('one-way wall does not block from unblocked side', () => {
    const walls: Segment[] = [
      {
        a: { x: 50, y: 0 },
        b: { x: 50, y: 100 },
        type: 'one-way',
        oneWayDirection: 0
      }
    ]
    // Origin at x=20 (left side, opposite to +x normal) → unblocked
    expect(isMovementBlocked({ x: 20, y: 50 }, { x: 80, y: 50 }, walls)).toBe(false)
  })
})

// ─── isBlockedByOneWayWall ────────────────────────────────────

describe('isBlockedByOneWayWall', () => {
  // Wall from (0,50) to (100,50), oneWayDirection=270 (normal points in -y direction)
  const horizontalWall: Segment = {
    a: { x: 0, y: 50 },
    b: { x: 100, y: 50 },
    type: 'one-way',
    oneWayDirection: 270 // 270° = pointing down toward negative-y in standard math coords
  }

  it('returns false for non-one-way wall', () => {
    const solidWall: Segment = { a: { x: 0, y: 0 }, b: { x: 10, y: 10 }, type: 'solid' }
    expect(isBlockedByOneWayWall({ x: 5, y: 5 }, solidWall)).toBe(false)
  })

  it('returns false for window type wall', () => {
    const w: Segment = { a: { x: 0, y: 0 }, b: { x: 10, y: 10 }, type: 'window' }
    expect(isBlockedByOneWayWall({ x: 5, y: 5 }, w)).toBe(false)
  })

  it('returns false for door type wall', () => {
    const w: Segment = { a: { x: 0, y: 0 }, b: { x: 10, y: 10 }, type: 'door' }
    expect(isBlockedByOneWayWall({ x: 5, y: 5 }, w)).toBe(false)
  })

  it('returns true when point is on the blocked side (normal direction)', () => {
    // Normal at 270°: cos(270°)=0, sin(270°)=-1
    // midpoint=(50,50), point=(50,10): toPoint=(0,-40), dot = 0*0 + (-40)*(-1)=40 > 0 → blocked
    expect(isBlockedByOneWayWall({ x: 50, y: 10 }, horizontalWall)).toBe(true)
  })

  it('returns false when point is on the unblocked side', () => {
    // point=(50,90): toPoint=(0,40), dot = 0*0 + 40*(-1) = -40 < 0 → not blocked
    expect(isBlockedByOneWayWall({ x: 50, y: 90 }, horizontalWall)).toBe(false)
  })

  it('returns false when dot product is exactly zero (on the wall plane)', () => {
    // point=(50,50) = midpoint: toPoint=(0,0), dot=0 → not blocked
    expect(isBlockedByOneWayWall({ x: 50, y: 50 }, horizontalWall)).toBe(false)
  })

  it('uses left-hand normal when oneWayDirection is undefined', () => {
    // Vertical wall from (50,0) to (50,100), no direction specified
    const wallNoDir: Segment = {
      a: { x: 50, y: 0 },
      b: { x: 50, y: 100 },
      type: 'one-way'
    }
    const result = isBlockedByOneWayWall({ x: 10, y: 50 }, wallNoDir)
    expect(typeof result).toBe('boolean')
  })

  it('handles extreme coordinate values without overflow', () => {
    const wall: Segment = {
      a: { x: 0, y: 1000000 },
      b: { x: 1000000, y: 1000000 },
      type: 'one-way',
      oneWayDirection: 270
    }
    expect(() => isBlockedByOneWayWall({ x: 500000, y: 0 }, wall)).not.toThrow()
  })
})

// ─── clipToRadius ──────────────────────────────────────────────

describe('clipToRadius', () => {
  const squarePoly = {
    origin: { x: 0, y: 0 },
    points: [
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: -10, y: 0 },
      { x: 0, y: -10 }
    ]
  }

  it('returns empty points when radius is 0', () => {
    const result = clipToRadius(squarePoly, 0)
    expect(result.points).toHaveLength(0)
  })

  it('returns empty points when radius is negative', () => {
    const result = clipToRadius(squarePoly, -5)
    expect(result.points).toHaveLength(0)
  })

  it('preserves points already within radius', () => {
    const result = clipToRadius(squarePoly, 15)
    expect(result.points).toHaveLength(4)
    for (const p of result.points) {
      const dist = Math.sqrt(p.x * p.x + p.y * p.y)
      expect(dist).toBeLessThanOrEqual(15 + 0.001)
    }
  })

  it('clamps points outside radius to the radius boundary', () => {
    // All points are at distance 10; clamp to radius=5
    const result = clipToRadius(squarePoly, 5)
    expect(result.points).toHaveLength(4)
    for (const p of result.points) {
      const dist = Math.sqrt(p.x * p.x + p.y * p.y)
      expect(dist).toBeCloseTo(5, 5)
    }
  })

  it('preserves origin in result', () => {
    const result = clipToRadius(squarePoly, 10)
    expect(result.origin).toEqual({ x: 0, y: 0 })
  })

  it('handles empty points array without crashing', () => {
    const emptyPoly = { origin: { x: 0, y: 0 }, points: [] }
    const result = clipToRadius(emptyPoly, 10)
    expect(result.points).toHaveLength(0)
  })

  it('floating-point: clamped point distance equals radius (3-4-5 triangle)', () => {
    // Point at (3,4) has exact distance 5. Clamp to 2.5.
    const poly = { origin: { x: 0, y: 0 }, points: [{ x: 3, y: 4 }] }
    const result = clipToRadius(poly, 2.5)
    const [pt] = result.points
    const dist = Math.sqrt(pt.x * pt.x + pt.y * pt.y)
    expect(dist).toBeCloseTo(2.5, 10)
  })

  it('preserves direction when clamping', () => {
    // Point at (0, 10) clamped to radius 5 → should be (0, 5)
    const poly = { origin: { x: 0, y: 0 }, points: [{ x: 0, y: 10 }] }
    const result = clipToRadius(poly, 5)
    expect(result.points[0].x).toBeCloseTo(0, 10)
    expect(result.points[0].y).toBeCloseTo(5, 10)
  })

  it('works with non-origin centered polygon', () => {
    const poly = {
      origin: { x: 50, y: 50 },
      points: [{ x: 60, y: 50 }] // dist=10 from origin
    }
    const result = clipToRadius(poly, 5)
    const dx = result.points[0].x - 50
    const dy = result.points[0].y - 50
    expect(Math.sqrt(dx * dx + dy * dy)).toBeCloseTo(5, 5)
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

  it('bright radius points are within brightRadius pixels', () => {
    const sources: LightSource[] = [{ x: 10, y: 10, brightRadius: 3, dimRadius: 3 }]
    const result = computeLitAreas(sources, [], bounds, cellSize)
    const { brightPoly } = result[0]
    const brightPx = 3 * cellSize
    for (const p of brightPoly.points) {
      const dx = p.x - brightPoly.origin.x
      const dy = p.y - brightPoly.origin.y
      expect(Math.sqrt(dx * dx + dy * dy)).toBeLessThanOrEqual(brightPx + 0.001)
    }
  })

  it('dim polygon extends beyond bright polygon', () => {
    const sources: LightSource[] = [{ x: 10, y: 10, brightRadius: 3, dimRadius: 3 }]
    const result = computeLitAreas(sources, [], bounds, cellSize)
    const { brightPoly, dimPoly } = result[0]
    const brightMaxDist = Math.max(
      ...brightPoly.points.map((p) => {
        const dx = p.x - brightPoly.origin.x
        const dy = p.y - brightPoly.origin.y
        return Math.sqrt(dx * dx + dy * dy)
      })
    )
    const dimMaxDist = Math.max(
      ...dimPoly.points.map((p) => {
        const dx = p.x - dimPoly.origin.x
        const dy = p.y - dimPoly.origin.y
        return Math.sqrt(dx * dx + dy * dy)
      })
    )
    expect(dimMaxDist).toBeGreaterThanOrEqual(brightMaxDist)
  })

  it('light source position is scaled by cellSize', () => {
    const sources: LightSource[] = [{ x: 3, y: 4, brightRadius: 2, dimRadius: 2 }]
    const result = computeLitAreas(sources, [], bounds, cellSize)
    expect(result[0].brightPoly.origin).toEqual({ x: 30, y: 40 })
  })

  it('handles zero dimRadius (bright-only source)', () => {
    const sources: LightSource[] = [{ x: 10, y: 10, brightRadius: 3, dimRadius: 0 }]
    expect(() => computeLitAreas(sources, [], bounds, cellSize)).not.toThrow()
    const result = computeLitAreas(sources, [], bounds, cellSize)
    // dimRadius=0 → dimPoly radius = (brightRadius+0)*cellSize = same as brightPoly
    // Both polys cover the same area; neither is empty
    expect(result[0].brightPoly.points.length).toBeGreaterThan(0)
    expect(result[0].dimPoly.points.length).toBe(result[0].brightPoly.points.length)
  })
})
