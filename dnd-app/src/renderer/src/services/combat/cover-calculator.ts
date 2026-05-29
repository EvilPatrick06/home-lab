/**
 * Cover calculator for D&D 5e 2024.
 *
 * PHB 2024 p.17: To determine cover, pick any corner of the attacker's space
 * and draw imaginary lines to each corner of the target's space.
 * - Half Cover: target is behind an obstacle that blocks at least half the lines (+2 AC, +2 DEX saves)
 * - Three-Quarters Cover: at least three-quarters blocked (+5 AC, +5 DEX saves)
 * - Total Cover: all lines blocked (untargetable)
 *
 * Walls (solid, closed doors) block lines. Windows and open doors do not.
 * Other creatures between attacker and target provide half cover.
 */

import type { MapToken, WallSegment } from '../../types/map'
import type { CoverType } from './combat-rules'

interface Point {
  x: number
  y: number
}

interface Segment {
  a: Point
  b: Point
}

/**
 * Check if a line segment from p1 to p2 intersects with segment (a, b).
 * Uses parametric form: returns true if segments cross.
 */
function segmentsIntersect(p1: Point, p2: Point, a: Point, b: Point): boolean {
  const d1x = p2.x - p1.x
  const d1y = p2.y - p1.y
  const d2x = b.x - a.x
  const d2y = b.y - a.y

  const denom = d1x * d2y - d1y * d2x
  if (Math.abs(denom) < 1e-10) return false // parallel

  const t = ((a.x - p1.x) * d2y - (a.y - p1.y) * d2x) / denom
  const u = ((a.x - p1.x) * d1y - (a.y - p1.y) * d1x) / denom

  // Both parameters must be in (0, 1) — exclusive to avoid counting endpoint touches
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999
}

/**
 * Get the four corners of a token's space in pixel coordinates.
 */
function getTokenCorners(token: MapToken, cellSize: number): Point[] {
  const x = token.gridX * cellSize
  const y = token.gridY * cellSize
  const w = token.sizeX * cellSize
  const h = token.sizeY * cellSize
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h }
  ]
}

/**
 * Convert wall segments to blocking line segments.
 * Only solid walls and closed doors block cover lines.
 * Windows and open doors do not block.
 */
function getBlockingSegments(walls: WallSegment[], cellSize: number): Segment[] {
  const segments: Segment[] = []
  for (const w of walls) {
    // Open doors and windows don't block
    if (w.isOpen) continue
    if (w.type === 'window') continue

    segments.push({
      a: { x: w.x1 * cellSize, y: w.y1 * cellSize },
      b: { x: w.x2 * cellSize, y: w.y2 * cellSize }
    })
  }
  return segments
}

/**
 * Calculate cover between an attacker and target token.
 *
 * Draws lines from the best corner of the attacker's space to all four
 * corners of the target's space. Counts how many lines are blocked by walls.
 *
 * Returns the cover type: 'none', 'half', 'three-quarters', or 'total'.
 */
export function calculateCover(
  attacker: MapToken,
  target: MapToken,
  walls: WallSegment[],
  cellSize: number,
  otherTokens?: MapToken[]
): CoverType {
  const blockingWalls = getBlockingSegments(walls, cellSize)
  const targetCorners = getTokenCorners(target, cellSize)
  const attackerCorners = getTokenCorners(attacker, cellSize)

  // Phase 17c (LOG-11) — only living enemy creatures grant cover. PHB 2024 caps
  // creature-provided cover at HALF and a creature stops blocking once it drops.
  // Allies are excluded (PHB optional rule: you can choose to ignore your own
  // side). NOTE: Tiny creatures should also be excluded, but MapToken carries no
  // size category to test — see ISSUES-LOG-DNDAPP (LOG-11 Tiny follow-up).
  const creatureSegments: Segment[] = []
  if (otherTokens) {
    for (const tok of otherTokens) {
      if (tok.id === attacker.id || tok.id === target.id) continue
      if (tok.currentHP !== undefined && tok.currentHP <= 0) continue // downed → no cover
      if (tok.entityType === attacker.entityType) continue // ally → ignored
      const corners = getTokenCorners(tok, cellSize)
      // Use the four edges of the token as blocking segments
      for (let i = 0; i < corners.length; i++) {
        creatureSegments.push({
          a: corners[i],
          b: corners[(i + 1) % corners.length]
        })
      }
    }
  }

  // Try each attacker corner and use the one with the LEAST wall blockage (best
  // for attacker). Track wall and creature blockage separately so creatures can
  // be clamped to half cover while walls still reach three-quarters / total.
  let bestWallBlocked = 4 // worst case
  let creatureBlockedAtBest = 0
  for (const ac of attackerCorners) {
    let wallBlocked = 0
    let creatureBlocked = 0
    for (const tc of targetCorners) {
      if (blockingWalls.some((seg) => segmentsIntersect(ac, tc, seg.a, seg.b))) {
        wallBlocked++
      } else if (creatureSegments.some((seg) => segmentsIntersect(ac, tc, seg.a, seg.b))) {
        creatureBlocked++
      }
    }
    if (wallBlocked < bestWallBlocked || (wallBlocked === bestWallBlocked && creatureBlocked < creatureBlockedAtBest)) {
      bestWallBlocked = wallBlocked
      creatureBlockedAtBest = creatureBlocked
    }
  }

  // Cover from walls (can escalate all the way to total).
  let wallCover: CoverType = 'none'
  if (bestWallBlocked === 0) wallCover = 'none'
  else if (bestWallBlocked <= 1) wallCover = 'half'
  else if (bestWallBlocked <= 3) wallCover = 'three-quarters'
  else wallCover = 'total'

  // Creatures grant at most half cover, no matter how many segments block.
  const creatureCover: CoverType = creatureBlockedAtBest > 0 ? 'half' : 'none'

  // Target benefits from the greater of the two.
  const rank: Record<CoverType, number> = { none: 0, half: 1, 'three-quarters': 2, total: 3 }
  return rank[creatureCover] > rank[wallCover] ? creatureCover : wallCover
}

/**
 * Quick check if there's a clear line of sight between two points (no walls blocking).
 */
export function hasLineOfSight(from: Point, to: Point, walls: WallSegment[], cellSize: number): boolean {
  const blocking = getBlockingSegments(walls, cellSize)
  return !blocking.some((seg) => segmentsIntersect(from, to, seg.a, seg.b))
}
