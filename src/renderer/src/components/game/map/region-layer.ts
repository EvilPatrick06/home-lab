import type { Graphics } from 'pixi.js'
import type { GridSettings, RegionShape, SceneRegion } from '../../../types/map'

const DEFAULT_REGION_COLORS: Record<string, number> = {
  'alert-dm': 0xfbbf24,
  teleport: 0x818cf8,
  'apply-condition': 0xf87171
}

const DM_FILL_ALPHA = 0.2
const DM_STROKE_ALPHA = 0.6
const PLAYER_FILL_ALPHA = 0.1
const PLAYER_STROKE_ALPHA = 0.3
const STROKE_WIDTH = 2

function parseColor(color: string | undefined, fallback: number): number {
  if (!color) return fallback
  const hex = color.replace('#', '')
  const parsed = Number.parseInt(hex, 16)
  return Number.isNaN(parsed) ? fallback : parsed
}

function drawRegionShape(gfx: Graphics, shape: RegionShape, cellSize: number): void {
  switch (shape.type) {
    case 'circle': {
      const cx = shape.centerX * cellSize + cellSize / 2
      const cy = shape.centerY * cellSize + cellSize / 2
      const r = shape.radius * cellSize
      gfx.circle(cx, cy, r)
      break
    }
    case 'rectangle': {
      const rx = shape.x * cellSize
      const ry = shape.y * cellSize
      const rw = shape.width * cellSize
      const rh = shape.height * cellSize
      gfx.rect(rx, ry, rw, rh)
      break
    }
    case 'polygon': {
      if (shape.points.length < 3) return
      const first = shape.points[0]
      gfx.moveTo(first.x * cellSize, first.y * cellSize)
      for (let i = 1; i < shape.points.length; i++) {
        gfx.lineTo(shape.points[i].x * cellSize, shape.points[i].y * cellSize)
      }
      gfx.closePath()
      break
    }
  }
}

export function drawRegions(
  gfx: Graphics,
  regions: SceneRegion[],
  grid: GridSettings,
  isHost: boolean,
  currentFloor: number
): void {
  gfx.clear()

  const fillAlpha = isHost ? DM_FILL_ALPHA : PLAYER_FILL_ALPHA
  const strokeAlpha = isHost ? DM_STROKE_ALPHA : PLAYER_STROKE_ALPHA

  for (const region of regions) {
    if (!region.enabled && !isHost) continue
    if (!isHost && !region.visibleToPlayers) continue
    if (region.floor !== undefined && region.floor !== currentFloor) continue

    const baseColor = parseColor(region.color, DEFAULT_REGION_COLORS[region.action.type] ?? 0x94a3b8)
    const alpha = region.enabled ? fillAlpha : fillAlpha * 0.4

    gfx.beginPath()
    drawRegionShape(gfx, region.shape, grid.cellSize)
    gfx.fill({ color: baseColor, alpha })
    gfx.stroke({ color: baseColor, alpha: region.enabled ? strokeAlpha : strokeAlpha * 0.4, width: STROKE_WIDTH })

    if (isHost && !region.enabled) {
      drawDisabledOverlay(gfx, region.shape, grid.cellSize)
    }
  }
}

function drawDisabledOverlay(gfx: Graphics, shape: RegionShape, cellSize: number): void {
  const bounds = getShapeBounds(shape, cellSize)
  const spacing = 12

  gfx.setStrokeStyle({ width: 1, color: 0x6b7280, alpha: 0.3 })
  for (let x = bounds.x; x < bounds.x + bounds.w; x += spacing) {
    gfx.moveTo(x, bounds.y)
    gfx.lineTo(x + bounds.h, bounds.y + bounds.h)
    gfx.stroke()
  }
}

function getShapeBounds(shape: RegionShape, cellSize: number): { x: number; y: number; w: number; h: number } {
  switch (shape.type) {
    case 'circle':
      return {
        x: (shape.centerX - shape.radius) * cellSize,
        y: (shape.centerY - shape.radius) * cellSize,
        w: shape.radius * 2 * cellSize,
        h: shape.radius * 2 * cellSize
      }
    case 'rectangle':
      return {
        x: shape.x * cellSize,
        y: shape.y * cellSize,
        w: shape.width * cellSize,
        h: shape.height * cellSize
      }
    case 'polygon': {
      if (shape.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const p of shape.points) {
        if (p.x < minX) minX = p.x
        if (p.y < minY) minY = p.y
        if (p.x > maxX) maxX = p.x
        if (p.y > maxY) maxY = p.y
      }
      return {
        x: minX * cellSize,
        y: minY * cellSize,
        w: (maxX - minX) * cellSize,
        h: (maxY - minY) * cellSize
      }
    }
  }
}

export function clearRegionLayer(gfx: Graphics): void {
  gfx.clear()
}
