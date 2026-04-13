/**
 * LightingOverlay — Renders a darkness mask with visibility cutouts.
 *
 * For players: shows only what their token can see (based on walls + light sources).
 * For DM: shows a semi-transparent preview of the lighting state.
 *
 * Uses the raycast-visibility engine to compute visibility polygons,
 * then draws them as PixiJS Graphics (mask approach).
 */

import type { Graphics } from 'pixi.js'
import {
  computeLitAreas,
  computeVisibility,
  type LightSource,
  type Point,
  type Segment,
  wallsToSegments
} from '../../../services/map/raycast-visibility'
import type { DarknessZone, GameMap, MapToken } from '../../../types/map'

// ─── Types ────────────────────────────────────────────────────

export interface LightingConfig {
  ambientLight: 'bright' | 'dim' | 'darkness'
  darkvisionRange?: number // in grid cells (e.g., 12 for 60ft at 5ft/cell)
  /** Per-token darkvision ranges in grid cells (for multi-viewer party vision) */
  tokenDarkvisionRanges?: Map<string, number>
}

// ─── Draw lighting overlay ────────────────────────────────────

/**
 * Draws the lighting overlay on the given Graphics object.
 *
 * @param gfx          PixiJS Graphics to draw on
 * @param map          The current game map
 * @param viewerTokens Player tokens for shared party vision (empty for DM view)
 * @param lightSources Active light sources on the map
 * @param config       Ambient light and darkvision config
 * @param isHost       Whether the viewer is DM
 */
export function drawLightingOverlay(
  gfx: Graphics,
  map: GameMap,
  viewerTokens: MapToken[],
  lightSources: LightSource[],
  config: LightingConfig,
  isHost: boolean
): void {
  gfx.clear()

  const walls = map.wallSegments ?? []
  const darknessZones = map.darknessZones ?? []
  if (walls.length === 0 && config.ambientLight === 'bright' && darknessZones.length === 0) return

  const cellSize = map.grid.cellSize
  // map.width and map.height are already in pixels, not grid cells
  const pixelWidth = map.width
  const pixelHeight = map.height

  // Convert wall segments to raycast segments
  const segments = wallsToSegments(walls, cellSize)

  // DM preview: very light overlay showing where darkness would be
  if (isHost) {
    drawDMPreview(
      gfx,
      segments,
      lightSources,
      config,
      pixelWidth,
      pixelHeight,
      cellSize,
      map.grid.offsetX,
      map.grid.offsetY,
      darknessZones
    )
    return
  }

  // Player view: full darkness mask with visibility cutouts
  if (viewerTokens.length === 0) return

  drawPlayerView(
    gfx,
    segments,
    viewerTokens,
    lightSources,
    config,
    pixelWidth,
    pixelHeight,
    cellSize,
    map.grid.offsetX,
    map.grid.offsetY,
    darknessZones
  )
}

// ─── DM preview ───────────────────────────────────────────────

function drawDMPreview(
  gfx: Graphics,
  _segments: Segment[],
  lightSources: LightSource[],
  config: LightingConfig,
  width: number,
  height: number,
  cellSize: number,
  offsetX: number,
  offsetY: number,
  darknessZones: DarknessZone[] = []
): void {
  // Light dim overlay over everything
  const baseAlpha = config.ambientLight === 'darkness' ? 0.15 : config.ambientLight === 'dim' ? 0.08 : 0
  if (baseAlpha === 0 && lightSources.length === 0 && darknessZones.length === 0) return

  gfx.rect(offsetX, offsetY, width, height)
  gfx.fill({ color: 0x000000, alpha: baseAlpha })

  // Draw light source radii as subtle circles
  for (const source of lightSources) {
    const sx = source.x * cellSize + offsetX
    const sy = source.y * cellSize + offsetY
    const brightR = source.brightRadius * cellSize
    const dimR = (source.brightRadius + source.dimRadius) * cellSize

    // Dim radius ring
    gfx.setStrokeStyle({ width: 1, color: 0xf5c542, alpha: 0.15 })
    gfx.circle(sx, sy, dimR)
    gfx.stroke()

    // Bright radius ring
    gfx.setStrokeStyle({ width: 1, color: 0xf5c542, alpha: 0.25 })
    gfx.circle(sx, sy, brightR)
    gfx.stroke()

    // Center dot
    gfx.circle(sx, sy, 3)
    gfx.fill({ color: 0xf5c542, alpha: 0.5 })
  }

  // Draw darkness zone indicators for DM
  for (const zone of darknessZones) {
    const zx = zone.x * cellSize + offsetX
    const zy = zone.y * cellSize + offsetY
    const zr = zone.radius * cellSize

    // Color based on magic level
    const zoneColor =
      zone.magicLevel === 'deeper-darkness'
        ? 0x7c3aed
        : // purple
          zone.magicLevel === 'darkness'
          ? 0x1e1b4b
          : // dark indigo
            0x374151 // gray for nonmagical

    // Fill with semi-transparent darkness
    gfx.circle(zx, zy, zr)
    gfx.fill({ color: zoneColor, alpha: 0.2 })

    // Ring outline
    gfx.setStrokeStyle({ width: 2, color: zoneColor, alpha: 0.5 })
    gfx.circle(zx, zy, zr)
    gfx.stroke()

    // Center dot
    gfx.circle(zx, zy, 4)
    gfx.fill({ color: zoneColor, alpha: 0.6 })
  }
}

// ─── Player view ──────────────────────────────────────────────

function drawPlayerView(
  gfx: Graphics,
  segments: Segment[],
  viewerTokens: MapToken[],
  lightSources: LightSource[],
  config: LightingConfig,
  width: number,
  height: number,
  cellSize: number,
  offsetX: number,
  offsetY: number,
  darknessZones: DarknessZone[] = []
): void {
  // Determine darkness alpha based on ambient light
  const darknessAlpha = config.ambientLight === 'darkness' ? 0.85 : config.ambientLight === 'dim' ? 0.5 : 0.2

  // Filter out light sources suppressed by darkness zones
  const activeLights = filterLightsByDarkness(lightSources, darknessZones, cellSize)

  // Draw full darkness covering the entire map
  gfx.rect(offsetX, offsetY, width, height)
  gfx.fill({ color: 0x000000, alpha: darknessAlpha })

  // Cut out visibility polygon for each player token (shared party vision)
  for (const token of viewerTokens) {
    // Check if this token is inside a darkness zone (and lacks blindsight/tremorsense)
    if (isTokenInDarknessZone(token, darknessZones, cellSize)) continue

    const origin: Point = {
      x: (token.gridX + token.sizeX / 2) * cellSize,
      y: (token.gridY + token.sizeY / 2) * cellSize
    }
    const visibility = computeVisibility(origin, segments, { width, height })

    if (visibility.points.length >= 3) {
      gfx.beginPath()
      const first = visibility.points[0]
      gfx.moveTo(first.x + offsetX, first.y + offsetY)
      for (let i = 1; i < visibility.points.length; i++) {
        gfx.lineTo(visibility.points[i].x + offsetX, visibility.points[i].y + offsetY)
      }
      gfx.closePath()
      gfx.cut()
    }
  }

  // Darkvision cutouts for each token with darkvision
  // Note: darkvision does NOT penetrate magical darkness
  for (const token of viewerTokens) {
    if (isTokenInDarknessZone(token, darknessZones, cellSize)) continue

    const dvRange = config.tokenDarkvisionRanges?.get(token.id) ?? (config.darkvisionRange || 0)
    if (dvRange > 0) {
      const origin: Point = {
        x: (token.gridX + token.sizeX / 2) * cellSize,
        y: (token.gridY + token.sizeY / 2) * cellSize
      }
      const dvRadius = dvRange * cellSize
      gfx.circle(origin.x + offsetX, origin.y + offsetY, dvRadius)
      gfx.cut()
    }
  }

  // Compute lit areas from active (non-suppressed) light sources
  const litAreas = computeLitAreas(activeLights, segments, { width, height }, cellSize)

  // For each light source, cut out bright areas and dim areas
  for (const area of litAreas) {
    // Bright light area: fully visible
    if (area.brightPoly.points.length >= 3) {
      gfx.beginPath()
      const bp = area.brightPoly.points[0]
      gfx.moveTo(bp.x + offsetX, bp.y + offsetY)
      for (let i = 1; i < area.brightPoly.points.length; i++) {
        gfx.lineTo(area.brightPoly.points[i].x + offsetX, area.brightPoly.points[i].y + offsetY)
      }
      gfx.closePath()
      gfx.cut()
    }

    // Dim light area: partially visible (lighter overlay)
    if (area.dimPoly.points.length >= 3) {
      gfx.beginPath()
      const dp = area.dimPoly.points[0]
      gfx.moveTo(dp.x + offsetX, dp.y + offsetY)
      for (let i = 1; i < area.dimPoly.points.length; i++) {
        gfx.lineTo(area.dimPoly.points[i].x + offsetX, area.dimPoly.points[i].y + offsetY)
      }
      gfx.closePath()
      // Dim area still has some darkness
      gfx.fill({ color: 0x000000, alpha: 0.15 })
    }
  }

  // Re-darken areas within darkness zones (override any light cutouts above)
  // This must come AFTER light cutouts to ensure darkness zones take priority
  for (const zone of darknessZones) {
    const zx = zone.x * cellSize + offsetX
    const zy = zone.y * cellSize + offsetY
    const zr = zone.radius * cellSize

    gfx.circle(zx, zy, zr)
    gfx.fill({ color: 0x000000, alpha: 0.9 })
  }
}

// ─── Darkness zone helpers ────────────────────────────────────

/**
 * Check if a token is inside any darkness zone that would blind it.
 * Tokens with blindsight or tremorsense can still see in darkness.
 */
function isTokenInDarknessZone(token: MapToken, darknessZones: DarknessZone[], cellSize: number): boolean {
  if (darknessZones.length === 0) return false

  // Tokens with blindsight or tremorsense are not blinded by darkness
  if (token.specialSenses?.some((s) => s.type === 'blindsight' || s.type === 'tremorsense')) {
    return false
  }

  const tokenCenterX = (token.gridX + token.sizeX / 2) * cellSize
  const tokenCenterY = (token.gridY + token.sizeY / 2) * cellSize

  for (const zone of darknessZones) {
    const zx = zone.x * cellSize
    const zy = zone.y * cellSize
    const zr = zone.radius * cellSize
    const dx = tokenCenterX - zx
    const dy = tokenCenterY - zy
    if (dx * dx + dy * dy <= zr * zr) {
      // Token is inside darkness zone
      // nonmagical darkness: darkvision can still see
      if (zone.magicLevel === 'nonmagical' || !zone.magicLevel) {
        if (token.darkvision || (token.darkvisionRange && token.darkvisionRange > 0)) {
          return false // darkvision penetrates nonmagical darkness
        }
      }
      // magical darkness / deeper-darkness: darkvision cannot penetrate
      return true
    }
  }
  return false
}

/**
 * Filter light sources, removing those whose origin falls inside a darkness
 * zone that would suppress them.
 *
 * - nonmagical: suppresses nonmagical light only (all our light sources are treated as nonmagical by default)
 * - darkness: suppresses all nonmagical light
 * - deeper-darkness: suppresses ALL light including magical
 */
function filterLightsByDarkness(
  lightSources: LightSource[],
  darknessZones: DarknessZone[],
  cellSize: number
): LightSource[] {
  if (darknessZones.length === 0) return lightSources

  return lightSources.filter((source) => {
    const sx = source.x * cellSize
    const sy = source.y * cellSize

    for (const zone of darknessZones) {
      const zx = zone.x * cellSize
      const zy = zone.y * cellSize
      const zr = zone.radius * cellSize
      const dx = sx - zx
      const dy = sy - zy
      if (dx * dx + dy * dy <= zr * zr) {
        // Light source is within darkness zone
        const level = zone.magicLevel ?? 'nonmagical'
        // deeper-darkness suppresses ALL light
        if (level === 'deeper-darkness') return false
        // darkness and nonmagical suppress nonmagical light
        // (we treat all standard light sources as nonmagical)
        return false
      }
    }
    return true
  })
}
