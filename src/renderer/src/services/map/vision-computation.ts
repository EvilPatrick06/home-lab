/**
 * Vision computation engine — pure functions for computing party vision,
 * token visibility, and lighting conditions.
 *
 * Reuses raycast-visibility for line-of-sight calculations.
 */

import { LIGHT_SOURCES } from '../../data/light-sources'
import type { ActiveLightSource } from '../../types/campaign'
import type { GameMap, MapToken } from '../../types/map'
import { DARKVISION_SPECIES } from '../../types/map'
import {
  clipToRadius,
  computeVisibility,
  isPointVisible,
  type LightSource,
  type LitArea,
  type Point,
  type Segment,
  type VisibilityPolygon,
  wallsToSegments
} from './raycast-visibility'

type _LitArea = LitArea

// ─── Types ────────────────────────────────────────────────────

export interface PartyVisionResult {
  /** One visibility polygon per player token */
  partyPolygons: VisibilityPolygon[]
  /** Grid cells currently visible to the party */
  visibleCells: Array<{ x: number; y: number }>
}

// ─── Party vision computation ─────────────────────────────────

/**
 * Compute the union vision of all player tokens on a map.
 * Returns visibility polygons and the set of visible grid cells.
 *
 * Each token's vision uses only the walls on that token's floor,
 * preventing tokens on Floor 1 from seeing through walls on Floor 2.
 *
 * When `lightSources` are provided, any light source visible to a party
 * member extends the party's visible area by the light's bright + dim radius.
 */
export function computePartyVision(
  map: GameMap,
  playerTokens: MapToken[],
  lightSources?: LightSource[]
): PartyVisionResult {
  if (playerTokens.length === 0) {
    return { partyPolygons: [], visibleCells: [] }
  }

  const cellSize = map.grid.cellSize
  const pixelWidth = map.width * cellSize
  const pixelHeight = map.height * cellSize
  const allWalls = map.wallSegments ?? []
  const bounds = { width: pixelWidth, height: pixelHeight }

  // Cache wall segments by floor to avoid redundant filtering
  const segmentsByFloor = new Map<number, Segment[]>()
  const getFloorSegments = (floor: number): Segment[] => {
    let segs = segmentsByFloor.get(floor)
    if (!segs) {
      const floorWalls = allWalls.filter((w) => (w.floor ?? 0) === floor)
      segs = wallsToSegments(floorWalls, cellSize)
      segmentsByFloor.set(floor, segs)
    }
    return segs
  }

  // Compute visibility polygon for each player token using that token's floor walls
  const partyPolygons: VisibilityPolygon[] = []
  for (const token of playerTokens) {
    const tokenFloor = token.floor ?? 0
    const segments = getFloorSegments(tokenFloor)

    const origin: Point = {
      x: (token.gridX + token.sizeX / 2) * cellSize,
      y: (token.gridY + token.sizeY / 2) * cellSize
    }
    let poly = computeVisibility(origin, segments, bounds)

    // Apply darkvision radius clipping for fog-of-war purposes.
    const dvRangeFt = token.darkvisionRange ?? (token.darkvision ? 60 : 0)
    if (dvRangeFt > 0) {
      poly = clipToRadius(poly, (dvRangeFt / 5) * cellSize)
    }

    partyPolygons.push(poly)
  }

  // Convert polygons to grid cells
  const gridCols = Math.ceil(pixelWidth / cellSize)
  const gridRows = Math.ceil(pixelHeight / cellSize)
  const visibleCells: Array<{ x: number; y: number }> = []
  const visibleSet = new Set<string>()

  for (let col = 0; col < gridCols; col++) {
    for (let row = 0; row < gridRows; row++) {
      // Test cell center
      const cellCenter: Point = {
        x: (col + 0.5) * cellSize,
        y: (row + 0.5) * cellSize
      }

      let visible = false
      for (const poly of partyPolygons) {
        if (isPointVisible(cellCenter, poly)) {
          visible = true
          break
        }
      }

      if (visible) {
        visibleCells.push({ x: col, y: row })
        visibleSet.add(`${col},${row}`)
      }
    }
  }

  // Extend visibility with light sources visible to the party
  if (lightSources && lightSources.length > 0) {
    for (const source of lightSources) {
      const sourcePixel: Point = {
        x: source.x * cellSize,
        y: source.y * cellSize
      }

      // Check if any party member can see this light source
      let sourceVisible = false
      for (const poly of partyPolygons) {
        if (isPointVisible(sourcePixel, poly)) {
          sourceVisible = true
          break
        }
      }

      if (!sourceVisible) continue

      // Add all cells within the light's bright + dim radius
      const totalRadiusCells = source.brightRadius + source.dimRadius
      const minCol = Math.max(0, Math.floor(source.x - totalRadiusCells))
      const maxCol = Math.min(gridCols - 1, Math.ceil(source.x + totalRadiusCells))
      const minRow = Math.max(0, Math.floor(source.y - totalRadiusCells))
      const maxRow = Math.min(gridRows - 1, Math.ceil(source.y + totalRadiusCells))

      for (let col = minCol; col <= maxCol; col++) {
        for (let row = minRow; row <= maxRow; row++) {
          const key = `${col},${row}`
          if (visibleSet.has(key)) continue

          const dx = col + 0.5 - source.x
          const dy = row + 0.5 - source.y
          const dist = Math.sqrt(dx * dx + dy * dy)

          if (dist <= totalRadiusCells) {
            visibleCells.push({ x: col, y: row })
            visibleSet.add(key)
          }
        }
      }
    }
  }

  return { partyPolygons, visibleCells }
}

// ─── Token visibility check ──────────────────────────────────

/**
 * Check whether a token is visible to the party based on their vision polygons.
 */
export function isTokenVisibleToParty(token: MapToken, partyPolygons: VisibilityPolygon[], cellSize: number): boolean {
  const tokenCenter: Point = {
    x: (token.gridX + token.sizeX / 2) * cellSize,
    y: (token.gridY + token.sizeY / 2) * cellSize
  }

  for (const poly of partyPolygons) {
    if (isPointVisible(tokenCenter, poly)) {
      return true
    }
  }
  return false
}

// ─── Lighting at a point ─────────────────────────────────────

/**
 * Determine the lighting condition at a given point based on light sources
 * and ambient light level.
 */
export function getLightingAtPoint(
  point: Point,
  lightSources: LightSource[],
  ambientLight: 'bright' | 'dim' | 'darkness',
  cellSize: number
): 'bright' | 'dim' | 'darkness' {
  // Check if any light source illuminates this point
  for (const source of lightSources) {
    const sx = source.x * cellSize
    const sy = source.y * cellSize
    const dx = point.x - sx
    const dy = point.y - sy

    const dist = Math.sqrt(dx * dx + dy * dy)
    const brightDist = source.brightRadius * cellSize
    const dimDist = (source.brightRadius + source.dimRadius) * cellSize

    if (dist <= brightDist) return 'bright'
    if (dist <= dimDist) {
      // At least dim — but continue checking other sources
      if (ambientLight === 'bright') return 'bright'
      return 'dim'
    }
  }

  return ambientLight
}

// ─── Build vision cell set for fast lookup ────────────────────

/**
 * Build a Set of cell keys from an array of cells for O(1) lookup.
 */
export function buildVisionSet(cells: Array<{ x: number; y: number }>): Set<string> {
  const set = new Set<string>()
  for (const cell of cells) {
    set.add(`${cell.x},${cell.y}`)
  }
  return set
}

/**
 * Check if any cell occupied by a token is in the vision set.
 */
export function isTokenInVisionSet(token: MapToken, visionSet: Set<string>): boolean {
  for (let dx = 0; dx < token.sizeX; dx++) {
    for (let dy = 0; dy < token.sizeY; dy++) {
      if (visionSet.has(`${token.gridX + dx},${token.gridY + dy}`)) {
        return true
      }
    }
  }
  return false
}

/**
 * Recompute party vision and return the visible cells.
 * Convenience wrapper that filters player tokens and calls computePartyVision.
 */
export function recomputeVision(
  map: GameMap,
  overrideTokens?: MapToken[],
  lightSources?: LightSource[]
): PartyVisionResult {
  const tokens = overrideTokens ?? map.tokens
  const playerTokens = tokens.filter((t) => t.entityType === 'player')
  return computePartyVision(map, playerTokens, lightSources)
}

/**
 * Check if a token's associated species has darkvision (used for dim-light visibility).
 */
export function hasDarkvision(speciesId: string | undefined): boolean {
  if (!speciesId) return false
  return DARKVISION_SPECIES.includes(speciesId.toLowerCase())
}

// ─── Light source helpers ────────────────────────────────────

/**
 * Convert active light sources into the LightSource geometry type used by
 * the vision computation engine. Positions are centered on the token.
 * Sources whose token is not present on the map are silently dropped.
 */
export function buildMapLightSources(activeSources: ActiveLightSource[], tokens: MapToken[]): LightSource[] {
  return activeSources
    .map((ls) => {
      const token = tokens.find((t) => t.id === ls.entityId)
      if (!token) return null
      const def = LIGHT_SOURCES[ls.sourceName]
      return {
        x: token.gridX + token.sizeX / 2,
        y: token.gridY + token.sizeY / 2,
        brightRadius: def ? Math.ceil(def.brightRadius / 5) : 4,
        dimRadius: def ? Math.ceil(def.dimRadius / 5) : 4
      }
    })
    .filter((ls): ls is LightSource => ls !== null)
}

// ─── Debounced vision recomputation ──────────────────────────

let _visionDebounceTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Debounced wrapper around recomputeVision. Only the most recent invocation
 * within `delay` ms will execute, preventing performance spikes during rapid
 * token movement or drag operations.
 */
export function debouncedRecomputeVision(
  map: GameMap,
  callback: (result: PartyVisionResult) => void,
  overrideTokens?: MapToken[],
  lightSources?: LightSource[],
  delay = 32
): void {
  if (_visionDebounceTimer !== null) clearTimeout(_visionDebounceTimer)
  _visionDebounceTimer = setTimeout(() => {
    const result = recomputeVision(map, overrideTokens, lightSources)
    callback(result)
    _visionDebounceTimer = null
  }, delay)
}

/** Flush any pending debounced vision update immediately (useful for tests). */
export function flushDebouncedVision(): void {
  if (_visionDebounceTimer !== null) {
    clearTimeout(_visionDebounceTimer)
    _visionDebounceTimer = null
  }
}

// Re-export needed types
export type { LightSource, Point, Segment, VisibilityPolygon }
