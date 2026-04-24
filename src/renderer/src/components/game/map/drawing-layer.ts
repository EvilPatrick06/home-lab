/**
 * DrawingLayer — PixiJS rendering of map drawings/annotations.
 * Renders freehand paths, lines, rectangles, circles, and text labels.
 */

import { type Graphics, Text } from 'pixi.js'
import type { DrawingData } from '../../../types/map'

function parseColor(color: string): number {
  if (color.startsWith('#')) {
    return parseInt(color.slice(1), 16)
  }
  return 0xffffff
}

/**
 * Render all drawings onto a PixiJS Graphics object.
 * Text drawings are added as Text children of the container.
 */
export function drawDrawings(graphics: Graphics, drawings: DrawingData[], isHost: boolean): void {
  graphics.clear()

  // Remove old text children
  while (graphics.children.length > 0) {
    const child = graphics.children[0]
    graphics.removeChild(child)
    child.destroy()
  }

  for (const drawing of drawings) {
    // Skip hidden drawings for non-DM
    if (!isHost && drawing.visibleToPlayers === false) continue

    const color = parseColor(drawing.color)
    const { strokeWidth, points } = drawing

    switch (drawing.type) {
      case 'draw-free': {
        if (points.length < 2) break
        graphics.setStrokeStyle({ width: strokeWidth, color, alpha: 0.8 })
        graphics.moveTo(points[0].x, points[0].y)
        for (let i = 1; i < points.length; i++) {
          graphics.lineTo(points[i].x, points[i].y)
        }
        graphics.stroke()
        break
      }

      case 'draw-line': {
        if (points.length < 2) break
        graphics.setStrokeStyle({ width: strokeWidth, color, alpha: 0.8 })
        graphics.moveTo(points[0].x, points[0].y)
        graphics.lineTo(points[1].x, points[1].y)
        graphics.stroke()
        break
      }

      case 'draw-rect': {
        if (points.length < 2) break
        const x = Math.min(points[0].x, points[1].x)
        const y = Math.min(points[0].y, points[1].y)
        const w = Math.abs(points[1].x - points[0].x)
        const h = Math.abs(points[1].y - points[0].y)
        graphics.setStrokeStyle({ width: strokeWidth, color, alpha: 0.8 })
        graphics.rect(x, y, w, h)
        graphics.stroke()
        break
      }

      case 'draw-circle': {
        if (points.length < 2) break
        const dx = points[1].x - points[0].x
        const dy = points[1].y - points[0].y
        const radius = Math.sqrt(dx * dx + dy * dy)
        graphics.setStrokeStyle({ width: strokeWidth, color, alpha: 0.8 })
        graphics.circle(points[0].x, points[0].y, radius)
        graphics.stroke()
        break
      }

      case 'draw-text': {
        if (points.length < 1 || !drawing.text) break
        const text = new Text({
          text: drawing.text,
          style: {
            fontSize: Math.max(strokeWidth * 4, 12),
            fill: color,
            fontFamily: 'sans-serif'
          }
        })
        text.x = points[0].x
        text.y = points[0].y
        text.alpha = 0.9
        graphics.addChild(text)
        break
      }
    }
  }
}

/**
 * Clear all drawings from the graphics object.
 */
export function clearDrawingLayer(graphics: Graphics): void {
  graphics.clear()
  while (graphics.children.length > 0) {
    const child = graphics.children[0]
    graphics.removeChild(child)
    child.destroy()
  }
}
