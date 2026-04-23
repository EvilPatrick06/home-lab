/**
 * AoE Targeting Service — D&D 5e 2024
 *
 * Computes which tokens fall inside area-of-effect shapes
 * (sphere, cone, line, cube, cylinder) for damage application.
 *
 * PHB 2024 p.232-233: Areas of Effect
 */

import type { MapToken } from '../../types/map'

// ─── Types ────────────────────────────────────────────────────

export type AoEShape = 'sphere' | 'cone' | 'line' | 'cube' | 'cylinder'

export interface AoEDefinition {
  shape: AoEShape
  /** Origin point (grid coordinates) */
  originX: number
  originY: number
  /** Radius for sphere/cylinder, length for cone/line, side length for cube (in feet) */
  size: number
  /** Direction angle in degrees (0 = right, 90 = down) — for cone and line */
  direction?: number
  /** Width in feet — for line shape (default 5) */
  width?: number
}

export interface AoETargetResult {
  /** Tokens inside the AoE */
  targets: MapToken[]
  /** Grid cells covered by the AoE */
  affectedCells: Array<{ x: number; y: number }>
}

// ─── Constants ────────────────────────────────────────────────

const CELL_SIZE_FT = 5 // Each grid cell is 5 feet

// ─── Main Function ────────────────────────────────────────────

/**
 * Determine which tokens are inside an area of effect.
 *
 * @param aoe - The AoE shape definition
 * @param tokens - All tokens on the map
 * @param excludeTokenId - Token to exclude (e.g., the caster)
 * @returns Affected tokens and grid cells
 */
export function getTokensInAoE(aoe: AoEDefinition, tokens: MapToken[], excludeTokenId?: string): AoETargetResult {
  const affectedCells = getAffectedCells(aoe)
  const cellSet = new Set(affectedCells.map((c) => `${c.x},${c.y}`))

  const targets = tokens.filter((token) => {
    if (token.id === excludeTokenId) return false

    // Check if any cell occupied by the token overlaps with AoE cells
    for (let dx = 0; dx < token.sizeX; dx++) {
      for (let dy = 0; dy < token.sizeY; dy++) {
        if (cellSet.has(`${token.gridX + dx},${token.gridY + dy}`)) {
          return true
        }
      }
    }
    return false
  })

  return { targets, affectedCells }
}

/**
 * Get all grid cells affected by an AoE shape.
 */
export function getAffectedCells(aoe: AoEDefinition): Array<{ x: number; y: number }> {
  switch (aoe.shape) {
    case 'sphere':
    case 'cylinder':
      return getSphereCells(aoe.originX, aoe.originY, aoe.size)
    case 'cone':
      return getConeCells(aoe.originX, aoe.originY, aoe.size, aoe.direction ?? 0)
    case 'line':
      return getLineCells(aoe.originX, aoe.originY, aoe.size, aoe.direction ?? 0, aoe.width ?? 5)
    case 'cube':
      return getCubeCells(aoe.originX, aoe.originY, aoe.size, aoe.direction ?? 0)
    default:
      return []
  }
}

// ─── Shape Implementations ────────────────────────────────────

/**
 * Sphere/Cylinder: all cells within radius of origin.
 * PHB 2024: A sphere's origin is a point, and the sphere extends outward.
 * We use Chebyshev distance (D&D standard diagonal = 5ft) for grid intersection.
 */
function getSphereCells(originX: number, originY: number, radiusFt: number): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = []
  const radiusCells = Math.floor(radiusFt / CELL_SIZE_FT)

  for (let dx = -radiusCells; dx <= radiusCells; dx++) {
    for (let dy = -radiusCells; dy <= radiusCells; dy++) {
      // Use Euclidean distance from center of origin cell to center of target cell
      const distFt = Math.sqrt(dx * dx + dy * dy) * CELL_SIZE_FT
      if (distFt <= radiusFt) {
        cells.push({ x: originX + dx, y: originY + dy })
      }
    }
  }

  return cells
}

/**
 * Cone: emanates from origin in a direction, widening.
 * PHB 2024: A cone's width at any point equals the distance from its origin.
 * We check each cell against the cone's angular bounds and distance.
 */
function getConeCells(
  originX: number,
  originY: number,
  lengthFt: number,
  directionDeg: number
): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = []
  const lengthCells = Math.ceil(lengthFt / CELL_SIZE_FT)
  const dirRad = (directionDeg * Math.PI) / 180
  // Cone half-angle: PHB says width = distance, so the half-angle is atan(0.5) ≈ 26.57°
  // Actually, for a 5e cone, the width at a given distance equals the distance from the origin,
  // which gives a 53.13° total spread. Half angle = 26.57°.
  const halfAngle = Math.atan(0.5) // ~26.57°

  for (let dx = -lengthCells; dx <= lengthCells; dx++) {
    for (let dy = -lengthCells; dy <= lengthCells; dy++) {
      if (dx === 0 && dy === 0) continue

      const distFt = Math.sqrt(dx * dx + dy * dy) * CELL_SIZE_FT
      if (distFt > lengthFt || distFt < CELL_SIZE_FT * 0.5) continue

      // Angle from origin to this cell
      const cellAngle = Math.atan2(dy, dx)
      let angleDiff = Math.abs(cellAngle - dirRad)
      // Normalize to [0, π]
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff

      if (angleDiff <= halfAngle) {
        cells.push({ x: originX + dx, y: originY + dy })
      }
    }
  }

  return cells
}

/**
 * Line: extends from origin in a direction with a width.
 * PHB 2024: A line extends from its origin in a straight path up to its length.
 */
function getLineCells(
  originX: number,
  originY: number,
  lengthFt: number,
  directionDeg: number,
  widthFt: number
): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = []
  const lengthCells = Math.ceil(lengthFt / CELL_SIZE_FT)
  const halfWidthFt = widthFt / 2
  const dirRad = (directionDeg * Math.PI) / 180
  const cosDir = Math.cos(dirRad)
  const sinDir = Math.sin(dirRad)

  for (let dx = -lengthCells; dx <= lengthCells; dx++) {
    for (let dy = -lengthCells; dy <= lengthCells; dy++) {
      // Project cell center onto line direction
      const projAlong = dx * cosDir + dy * sinDir
      const projPerp = Math.abs(-dx * sinDir + dy * cosDir)

      const alongFt = projAlong * CELL_SIZE_FT
      const perpFt = projPerp * CELL_SIZE_FT

      if (alongFt >= 0 && alongFt <= lengthFt && perpFt <= halfWidthFt) {
        cells.push({ x: originX + dx, y: originY + dy })
      }
    }
  }

  return cells
}

/**
 * Cube: axis-aligned or direction-aligned square area.
 * PHB 2024: A cube's origin is anywhere on a face. The cube extends
 * in the direction chosen from that face.
 */
function getCubeCells(
  originX: number,
  originY: number,
  sideLengthFt: number,
  directionDeg: number
): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = []
  const sideCells = Math.ceil(sideLengthFt / CELL_SIZE_FT)
  const halfSide = Math.floor(sideCells / 2)
  const dirRad = (directionDeg * Math.PI) / 180
  const cosDir = Math.cos(dirRad)
  const sinDir = Math.sin(dirRad)

  for (let along = 0; along < sideCells; along++) {
    for (let perp = -halfSide; perp <= halfSide; perp++) {
      const dx = Math.round(along * cosDir - perp * sinDir)
      const dy = Math.round(along * sinDir + perp * cosDir)
      cells.push({ x: originX + dx, y: originY + dy })
    }
  }

  return cells
}

/**
 * Count the number of tokens affected by an AoE (for UI preview).
 */
export function countTargetsInAoE(aoe: AoEDefinition, tokens: MapToken[], excludeTokenId?: string): number {
  return getTokensInAoE(aoe, tokens, excludeTokenId).targets.length
}
