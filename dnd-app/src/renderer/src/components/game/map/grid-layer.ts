import { type Container, type Graphics, Text } from 'pixi.js'
import { generateGridLabels } from '../../../services/map/map-utils'
import type { GridSettings } from '../../../types/map'

/**
 * Draws grid lines onto a PixiJS Graphics object.
 * Supports square grids and hex grids (flat-top and pointy-top).
 */
export function drawGrid(graphics: Graphics, settings: GridSettings, mapWidth: number, mapHeight: number): void {
  graphics.clear()

  if (!settings.enabled || settings.type === 'gridless') return

  const { cellSize, offsetX, offsetY, color, opacity, type } = settings

  if (type === 'hex' || type === 'hex-flat') {
    drawHexGrid(graphics, cellSize, offsetX, offsetY, color, opacity, mapWidth, mapHeight, 'flat')
    return
  }

  if (type === 'hex-pointy') {
    drawHexGrid(graphics, cellSize, offsetX, offsetY, color, opacity, mapWidth, mapHeight, 'pointy')
    return
  }

  // Square grid
  const parsedColor = parseColor(color)

  // Vertical lines
  const startX = offsetX % cellSize
  for (let x = startX; x <= mapWidth; x += cellSize) {
    graphics.moveTo(x, 0)
    graphics.lineTo(x, mapHeight)
  }

  // Horizontal lines
  const startY = offsetY % cellSize
  for (let y = startY; y <= mapHeight; y += cellSize) {
    graphics.moveTo(0, y)
    graphics.lineTo(mapWidth, y)
  }

  graphics.stroke({ width: 1, color: parsedColor, alpha: opacity })
}

/**
 * Draw a hex grid in either flat-top or pointy-top orientation.
 */
function drawHexGrid(
  graphics: Graphics,
  cellSize: number,
  offsetX: number,
  offsetY: number,
  color: string,
  opacity: number,
  mapWidth: number,
  mapHeight: number,
  orientation: 'flat' | 'pointy'
): void {
  const parsedColor = parseColor(color)

  if (orientation === 'flat') {
    // Flat-top: pointy sides left/right
    const hexWidth = cellSize * 2
    const hexHeight = Math.sqrt(3) * cellSize
    const horizSpacing = hexWidth * 0.75
    const vertSpacing = hexHeight

    const cols = Math.ceil(mapWidth / horizSpacing) + 1
    const rows = Math.ceil(mapHeight / vertSpacing) + 1

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const cx = offsetX + col * horizSpacing
        const cy = offsetY + row * vertSpacing + (col % 2 === 1 ? vertSpacing / 2 : 0)

        if (cx - cellSize > mapWidth || cy - hexHeight / 2 > mapHeight) continue

        drawHexOutline(graphics, cx, cy, cellSize, 'flat')
      }
    }
  } else {
    // Pointy-top: flat sides left/right
    const hexWidth = Math.sqrt(3) * cellSize
    const hexHeight = cellSize * 2
    const horizSpacing = hexWidth
    const vertSpacing = hexHeight * 0.75

    const cols = Math.ceil(mapWidth / horizSpacing) + 1
    const rows = Math.ceil(mapHeight / vertSpacing) + 1

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cx = offsetX + col * horizSpacing + (row % 2 === 1 ? horizSpacing / 2 : 0)
        const cy = offsetY + row * vertSpacing

        if (cx - hexWidth / 2 > mapWidth || cy - cellSize > mapHeight) continue

        drawHexOutline(graphics, cx, cy, cellSize, 'pointy')
      }
    }
  }

  graphics.stroke({ width: 1, color: parsedColor, alpha: opacity })
}

function drawHexOutline(
  graphics: Graphics,
  cx: number,
  cy: number,
  size: number,
  orientation: 'flat' | 'pointy'
): void {
  // Flat-top: first vertex at 0° (right), Pointy-top: first vertex at 30°
  const angleOffset = orientation === 'flat' ? 0 : Math.PI / 6
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i + angleOffset
    const x = cx + size * Math.cos(angle)
    const y = cy + size * Math.sin(angle)
    if (i === 0) {
      graphics.moveTo(x, y)
    } else {
      graphics.lineTo(x, y)
    }
  }
  graphics.closePath()
}

// ─── Hex center calculation (for token snapping) ─────────────

/**
 * Get the pixel center of a hex cell given grid coordinates.
 * Used for snapping tokens to hex centers.
 */
export function getHexCenter(
  col: number,
  row: number,
  cellSize: number,
  offsetX: number,
  offsetY: number,
  orientation: 'flat' | 'pointy'
): { x: number; y: number } {
  if (orientation === 'flat') {
    const hexWidth = cellSize * 2
    const hexHeight = Math.sqrt(3) * cellSize
    const horizSpacing = hexWidth * 0.75
    const vertSpacing = hexHeight
    return {
      x: offsetX + col * horizSpacing,
      y: offsetY + row * vertSpacing + (col % 2 === 1 ? vertSpacing / 2 : 0)
    }
  }
  // Pointy-top
  const hexWidth = Math.sqrt(3) * cellSize
  const hexHeight = cellSize * 2
  const horizSpacing = hexWidth
  const vertSpacing = hexHeight * 0.75
  return {
    x: offsetX + col * horizSpacing + (row % 2 === 1 ? horizSpacing / 2 : 0),
    y: offsetY + row * vertSpacing
  }
}

/**
 * Convert pixel coordinates to the nearest hex grid cell (col, row).
 */
export function pixelToHex(
  pixelX: number,
  pixelY: number,
  cellSize: number,
  offsetX: number,
  offsetY: number,
  orientation: 'flat' | 'pointy'
): { col: number; row: number } {
  const x = pixelX - offsetX
  const y = pixelY - offsetY

  if (orientation === 'flat') {
    const hexWidth = cellSize * 2
    const hexHeight = Math.sqrt(3) * cellSize
    const horizSpacing = hexWidth * 0.75
    const vertSpacing = hexHeight

    // Approximate column
    const col = Math.round(x / horizSpacing)
    const rowOffset = col % 2 === 1 ? vertSpacing / 2 : 0
    const row = Math.round((y - rowOffset) / vertSpacing)
    return { col, row }
  }

  // Pointy-top
  const hexWidth = Math.sqrt(3) * cellSize
  const hexHeight = cellSize * 2
  const horizSpacing = hexWidth
  const vertSpacing = hexHeight * 0.75

  const row = Math.round(y / vertSpacing)
  const colOffset = row % 2 === 1 ? horizSpacing / 2 : 0
  const col = Math.round((x - colOffset) / horizSpacing)
  return { col, row }
}

function parseColor(color: string): number {
  if (color.startsWith('#')) {
    return parseInt(color.slice(1), 16)
  }
  // Default to white
  return 0xffffff
}

// ─── Grid Coordinate Labels ─────────────────────────────────

/**
 * Render grid coordinate labels (A, B, C... along top; 1, 2, 3... along left).
 * Only renders labels for square grids when zoom > 0.5.
 * Uses a Container to hold Text objects so they can be cleared/rebuilt.
 */
export function drawGridLabels(
  container: Container,
  settings: GridSettings,
  mapWidth: number,
  mapHeight: number,
  zoom: number
): void {
  // Clear previous labels
  while (container.children.length > 0) {
    const child = container.children[0]
    container.removeChild(child)
    child.destroy()
  }

  // Only show labels when zoomed in enough and grid is enabled
  if (!settings.enabled || zoom < 0.5 || settings.type === 'gridless') return

  const { cellSize } = settings
  const fontSize = Math.max(8, Math.min(14, cellSize * 0.3))
  const labelColor = 0xaaaaaa

  if (settings.type === 'square') {
    const labels = generateGridLabels(mapWidth, mapHeight, cellSize)

    // Column labels along top edge
    for (const col of labels.columns) {
      const text = new Text({
        text: col.label,
        style: {
          fontSize,
          fill: labelColor,
          fontFamily: 'monospace'
        }
      })
      text.anchor.set(0.5, 0)
      text.x = col.x
      text.y = 2
      text.alpha = 0.6
      container.addChild(text)
    }

    // Row labels along left edge
    for (const row of labels.rows) {
      const text = new Text({
        text: row.label,
        style: {
          fontSize,
          fill: labelColor,
          fontFamily: 'monospace'
        }
      })
      text.anchor.set(0, 0.5)
      text.x = 2
      text.y = row.y
      text.alpha = 0.6
      container.addChild(text)
    }
  } else {
    // Hex labels (flat or pointy)
    const orientation = settings.type === 'hex-pointy' ? 'pointy' : 'flat'
    const hexWidth = orientation === 'flat' ? cellSize * 2 : Math.sqrt(3) * cellSize
    const hexHeight = orientation === 'flat' ? Math.sqrt(3) * cellSize : cellSize * 2
    const horizSpacing = orientation === 'flat' ? hexWidth * 0.75 : hexWidth
    const vertSpacing = orientation === 'flat' ? hexHeight : hexHeight * 0.75

    const cols = Math.ceil((mapWidth - settings.offsetX) / horizSpacing) + 1
    const rows = Math.ceil((mapHeight - settings.offsetY) / vertSpacing) + 1

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const center = getHexCenter(col, row, cellSize, settings.offsetX, settings.offsetY, orientation)
        if (center.x - hexWidth / 2 > mapWidth || center.y - hexHeight / 2 > mapHeight) continue

        const text = new Text({
          text: `${col},${row}`,
          style: {
            fontSize: fontSize * 0.7,
            fill: labelColor,
            fontFamily: 'monospace'
          }
        })
        text.anchor.set(0.5, 0.5)
        text.x = center.x
        text.y = center.y
        text.alpha = 0.4
        container.addChild(text)
      }
    }
  }
}
