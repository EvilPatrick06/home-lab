/**
 * Ray-cast visibility engine.
 *
 * Given an origin point and a set of wall segments, computes the 2D
 * visibility polygon using the "cast rays to segment endpoints" approach.
 * The output is a convex-ish polygon (sorted fan of triangle vertices)
 * that represents the visible area from the origin.
 */

import type { WallSegment } from '../../types/map'

// ─── Types ────────────────────────────────────────────────────

export interface Point {
  x: number
  y: number
}

export interface Segment {
  a: Point
  b: Point
  type: WallSegment['type']
  isOpen?: boolean
}

export interface VisibilityPolygon {
  /** Vertices of the visibility polygon in clockwise order */
  points: Point[]
  /** The origin point of the visibility calculation */
  origin: Point
}

export interface LightSource {
  x: number
  y: number
  /** Radius in grid cells */
  brightRadius: number
  /** Dim light extends this far beyond bright */
  dimRadius: number
  color?: string
}

// ─── Constants ────────────────────────────────────────────────

const EPSILON = 0.0001
const RAY_OFFSET = 0.001 // small angle offset to peek around corners

// ─── Core ray-cast algorithm ──────────────────────────────────

/**
 * Compute visibility polygon from origin given wall segments.
 * Uses the standard 2D visibility algorithm:
 * 1. Collect all unique endpoints from wall segments
 * 2. For each endpoint, cast 3 rays (one at the angle, two slightly offset)
 * 3. Find the closest wall intersection for each ray
 * 4. Sort intersections by angle and form a polygon
 */
export function computeVisibility(
  origin: Point,
  walls: Segment[],
  bounds: { width: number; height: number }
): VisibilityPolygon {
  if (walls.length === 0) {
    // No walls: full visibility within bounds
    return {
      origin,
      points: [
        { x: 0, y: 0 },
        { x: bounds.width, y: 0 },
        { x: bounds.width, y: bounds.height },
        { x: 0, y: bounds.height }
      ]
    }
  }

  // Add boundary walls
  const allSegments: Segment[] = [
    ...walls.filter((w) => w.type !== 'window' && !(w.type === 'door' && w.isOpen)),
    // Boundary segments
    { a: { x: 0, y: 0 }, b: { x: bounds.width, y: 0 }, type: 'solid' },
    { a: { x: bounds.width, y: 0 }, b: { x: bounds.width, y: bounds.height }, type: 'solid' },
    { a: { x: bounds.width, y: bounds.height }, b: { x: 0, y: bounds.height }, type: 'solid' },
    { a: { x: 0, y: bounds.height }, b: { x: 0, y: 0 }, type: 'solid' }
  ]

  // Collect unique endpoints
  const uniqueAngles: number[] = []
  const seen = new Set<string>()

  for (const seg of allSegments) {
    for (const pt of [seg.a, seg.b]) {
      const key = `${pt.x.toFixed(4)},${pt.y.toFixed(4)}`
      if (seen.has(key)) continue
      seen.add(key)

      const angle = Math.atan2(pt.y - origin.y, pt.x - origin.x)
      // Cast 3 rays per endpoint to peek around corners
      uniqueAngles.push(angle - RAY_OFFSET, angle, angle + RAY_OFFSET)
    }
  }

  // Cast rays and find intersections
  const intersections: Array<{ point: Point; angle: number }> = []

  for (const angle of uniqueAngles) {
    const dx = Math.cos(angle)
    const dy = Math.sin(angle)

    let closestDist = Infinity
    let closestPoint: Point | null = null

    for (const seg of allSegments) {
      const intersection = raySegmentIntersection(origin, dx, dy, seg.a, seg.b)
      if (intersection && intersection.dist < closestDist) {
        closestDist = intersection.dist
        closestPoint = intersection.point
      }
    }

    if (closestPoint) {
      intersections.push({ point: closestPoint, angle })
    }
  }

  // Sort by angle
  intersections.sort((a, b) => a.angle - b.angle)

  // Remove duplicates (points very close together)
  const points: Point[] = []
  for (const ix of intersections) {
    if (points.length === 0) {
      points.push(ix.point)
      continue
    }
    const last = points[points.length - 1]
    const dx = ix.point.x - last.x
    const dy = ix.point.y - last.y
    if (dx * dx + dy * dy > EPSILON * EPSILON) {
      points.push(ix.point)
    }
  }

  return { origin, points }
}

// ─── Ray-segment intersection ─────────────────────────────────

function raySegmentIntersection(
  origin: Point,
  dx: number,
  dy: number,
  a: Point,
  b: Point
): { point: Point; dist: number } | null {
  // Ray: origin + t * (dx, dy)
  // Segment: a + s * (b - a)
  const segDx = b.x - a.x
  const segDy = b.y - a.y

  const denom = dx * segDy - dy * segDx
  if (Math.abs(denom) < EPSILON) return null

  const t = ((a.x - origin.x) * segDy - (a.y - origin.y) * segDx) / denom
  const s = ((a.x - origin.x) * dy - (a.y - origin.y) * dx) / denom

  if (t < 0 || s < 0 || s > 1) return null

  return {
    point: {
      x: origin.x + t * dx,
      y: origin.y + t * dy
    },
    dist: t
  }
}

// ─── Convert WallSegments to Segments ─────────────────────────

export function wallsToSegments(walls: WallSegment[], cellSize: number): Segment[] {
  return walls.map((w) => ({
    a: { x: w.x1 * cellSize, y: w.y1 * cellSize },
    b: { x: w.x2 * cellSize, y: w.y2 * cellSize },
    type: w.type,
    isOpen: w.isOpen
  }))
}

// ─── Compute lit areas from light sources ─────────────────────

export interface LitArea {
  source: LightSource
  brightPoly: VisibilityPolygon
  dimPoly: VisibilityPolygon
}

export function computeLitAreas(
  sources: LightSource[],
  walls: Segment[],
  bounds: { width: number; height: number },
  cellSize: number
): LitArea[] {
  return sources.map((source) => {
    const origin: Point = { x: source.x * cellSize, y: source.y * cellSize }

    // Compute full visibility from the light source
    const fullVisibility = computeVisibility(origin, walls, bounds)

    // Clip the visibility polygon to the bright/dim radii
    const brightPoly = clipToRadius(fullVisibility, source.brightRadius * cellSize)
    const dimPoly = clipToRadius(fullVisibility, (source.brightRadius + source.dimRadius) * cellSize)

    return { source, brightPoly, dimPoly }
  })
}

// ─── Clip visibility polygon to a circular radius ─────────────

export function clipToRadius(poly: VisibilityPolygon, radius: number): VisibilityPolygon {
  if (radius <= 0) return { origin: poly.origin, points: [] }

  const clipped: Point[] = []
  const r2 = radius * radius

  for (const pt of poly.points) {
    const dx = pt.x - poly.origin.x
    const dy = pt.y - poly.origin.y
    const dist2 = dx * dx + dy * dy

    if (dist2 <= r2) {
      clipped.push(pt)
    } else {
      // Clamp to radius
      const scale = radius / Math.sqrt(dist2)
      clipped.push({
        x: poly.origin.x + dx * scale,
        y: poly.origin.y + dy * scale
      })
    }
  }

  return { origin: poly.origin, points: clipped }
}

// ─── Check if a point is inside a visibility polygon ──────────

export function isPointVisible(point: Point, poly: VisibilityPolygon): boolean {
  const { points } = poly
  if (points.length < 3) return false

  // Point-in-polygon test (ray casting method)
  let inside = false
  const n = points.length

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const pi = points[i]
    const pj = points[j]

    if (pi.y > point.y !== pj.y > point.y && point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x) {
      inside = !inside
    }
  }

  return inside
}

// ─── Check if movement is blocked by walls ────────────────────

export function isMovementBlocked(from: Point, to: Point, walls: Segment[]): boolean {
  const dx = to.x - from.x
  const dy = to.y - from.y

  for (const seg of walls) {
    // Doors that are open don't block movement
    if (seg.type === 'door' && seg.isOpen) continue
    // Windows block movement
    // Solid walls block movement
    const intersection = raySegmentIntersection(from, dx, dy, seg.a, seg.b)
    if (intersection && intersection.dist > EPSILON && intersection.dist < 1 - EPSILON) {
      return true
    }
  }

  return false
}
