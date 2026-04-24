/**
 * WallLayer — PixiJS rendering of wall segments on the map canvas.
 * Draws wall lines, doors (with toggle handle), and windows.
 * Also handles the wall placement preview when the wall tool is active.
 */

import type { Graphics } from 'pixi.js'
import type { GridSettings, WallSegment } from '../../../types/map'

// ─── Colors ───────────────────────────────────────────────────

const WALL_COLOR_SOLID = 0x4f9cf7 // blue
const WALL_COLOR_DOOR = 0xf5a623 // amber
const WALL_COLOR_DOOR_OPEN = 0x22c55e // green
const WALL_COLOR_WINDOW = 0xc084fc // purple
const WALL_COLOR_PREVIEW = 0xffffff
const WALL_THICKNESS = 3
const DOOR_HANDLE_SIZE = 6

// ─── Draw all walls on a Graphics object ──────────────────────

export function drawWalls(gfx: Graphics, walls: WallSegment[], grid: GridSettings, isHost: boolean): void {
  gfx.clear()

  // Only show walls to DM
  if (!isHost) return

  for (const wall of walls) {
    const x1 = wall.x1 * grid.cellSize + grid.offsetX
    const y1 = wall.y1 * grid.cellSize + grid.offsetY
    const x2 = wall.x2 * grid.cellSize + grid.offsetX
    const y2 = wall.y2 * grid.cellSize + grid.offsetY

    let color: number
    const alpha = 0.8

    switch (wall.type) {
      case 'door':
        color = wall.isOpen ? WALL_COLOR_DOOR_OPEN : WALL_COLOR_DOOR
        break
      case 'window':
        color = WALL_COLOR_WINDOW
        break
      default:
        color = WALL_COLOR_SOLID
    }

    // Draw the wall line
    gfx.setStrokeStyle({ width: WALL_THICKNESS, color, alpha })
    gfx.moveTo(x1, y1)
    gfx.lineTo(x2, y2)
    gfx.stroke()

    // Draw door handle (small square at midpoint)
    if (wall.type === 'door') {
      const midX = (x1 + x2) / 2
      const midY = (y1 + y2) / 2
      gfx.setStrokeStyle({ width: 1, color, alpha: 1 })
      gfx.fill({ color, alpha: wall.isOpen ? 0.3 : 0.8 })
      gfx.rect(midX - DOOR_HANDLE_SIZE / 2, midY - DOOR_HANDLE_SIZE / 2, DOOR_HANDLE_SIZE, DOOR_HANDLE_SIZE)
      gfx.fill()
      gfx.stroke()
    }

    // Draw dashes for windows
    if (wall.type === 'window') {
      const dx = x2 - x1
      const dy = y2 - y1
      const len = Math.sqrt(dx * dx + dy * dy)
      const dashLen = 6
      const gapLen = 4
      const nx = dx / len
      const ny = dy / len

      let dist = 0
      let drawing = true
      gfx.setStrokeStyle({ width: 2, color: WALL_COLOR_WINDOW, alpha: 0.5 })

      while (dist < len) {
        const segLen = drawing ? dashLen : gapLen
        const end = Math.min(dist + segLen, len)

        if (drawing) {
          gfx.moveTo(x1 + nx * dist, y1 + ny * dist)
          gfx.lineTo(x1 + nx * end, y1 + ny * end)
          gfx.stroke()
        }

        dist = end
        drawing = !drawing
      }
    }

    // Draw endpoint circles
    gfx.circle(x1, y1, 3)
    gfx.fill({ color, alpha: 0.6 })
    gfx.circle(x2, y2, 3)
    gfx.fill({ color, alpha: 0.6 })
  }
}

// ─── Draw wall placement preview ──────────────────────────────

export function drawWallPreview(
  gfx: Graphics,
  startPoint: { x: number; y: number } | null,
  currentPoint: { x: number; y: number } | null,
  grid: GridSettings,
  wallType: WallSegment['type']
): void {
  gfx.clear()
  if (!startPoint || !currentPoint) return

  const x1 = startPoint.x * grid.cellSize + grid.offsetX
  const y1 = startPoint.y * grid.cellSize + grid.offsetY
  const x2 = currentPoint.x * grid.cellSize + grid.offsetX
  const y2 = currentPoint.y * grid.cellSize + grid.offsetY

  // Draw preview line
  const color = wallType === 'door' ? WALL_COLOR_DOOR : wallType === 'window' ? WALL_COLOR_WINDOW : WALL_COLOR_SOLID
  gfx.setStrokeStyle({ width: WALL_THICKNESS, color: WALL_COLOR_PREVIEW, alpha: 0.5 })
  gfx.moveTo(x1, y1)
  gfx.lineTo(x2, y2)
  gfx.stroke()

  // Dotted color overlay
  gfx.setStrokeStyle({ width: 2, color, alpha: 0.8 })
  gfx.moveTo(x1, y1)
  gfx.lineTo(x2, y2)
  gfx.stroke()

  // Snap indicators at endpoints
  gfx.circle(x1, y1, 4)
  gfx.fill({ color: WALL_COLOR_PREVIEW, alpha: 0.8 })
  gfx.circle(x2, y2, 4)
  gfx.fill({ color: WALL_COLOR_PREVIEW, alpha: 0.8 })
}

// ─── Hit test: is a click near a wall's door handle? ──────────

export function hitTestDoorHandle(
  clickX: number,
  clickY: number,
  walls: WallSegment[],
  grid: GridSettings
): WallSegment | null {
  const threshold = DOOR_HANDLE_SIZE * 2

  for (const wall of walls) {
    if (wall.type !== 'door') continue

    const midX = ((wall.x1 + wall.x2) / 2) * grid.cellSize + grid.offsetX
    const midY = ((wall.y1 + wall.y2) / 2) * grid.cellSize + grid.offsetY

    const dx = clickX - midX
    const dy = clickY - midY
    if (dx * dx + dy * dy < threshold * threshold) {
      return wall
    }
  }

  return null
}

// ─── Snap a pixel position to the nearest grid intersection ───

export function snapToGridIntersection(pixelX: number, pixelY: number, grid: GridSettings): { x: number; y: number } {
  const relX = pixelX - grid.offsetX
  const relY = pixelY - grid.offsetY
  return {
    x: Math.round(relX / grid.cellSize),
    y: Math.round(relY / grid.cellSize)
  }
}

// ─── Wall auto-close detection ────────────────────────────────

/**
 * Check if a grid point is within snap distance of any existing wall endpoint.
 * Returns the matching endpoint if found, null otherwise.
 * Used for auto-closing wall polygons: if the user places a wall endpoint
 * near the start of their first wall in a sequence, snap to it and close.
 */
export function findNearbyWallEndpoint(
  gridX: number,
  gridY: number,
  walls: WallSegment[],
  snapThreshold: number = 0.5
): { x: number; y: number } | null {
  for (const wall of walls) {
    const dx1 = Math.abs(wall.x1 - gridX)
    const dy1 = Math.abs(wall.y1 - gridY)
    if (dx1 <= snapThreshold && dy1 <= snapThreshold) {
      return { x: wall.x1, y: wall.y1 }
    }
    const dx2 = Math.abs(wall.x2 - gridX)
    const dy2 = Math.abs(wall.y2 - gridY)
    if (dx2 <= snapThreshold && dy2 <= snapThreshold) {
      return { x: wall.x2, y: wall.y2 }
    }
  }
  return null
}
