import { type Container, Graphics, Text, TextStyle } from 'pixi.js'
import type { MapPin, MapPinIcon } from '../../../types/map'

/**
 * Phase 16b — render map pins into the `pinsContainer` layer (above tokens, below fog).
 *
 * Each pin draws a colored teardrop marker with a single-glyph icon and (above ~0.5 zoom) its
 * label below. Labels are hidden when zoomed out to avoid clutter on dense maps; icons stay.
 * The caller is responsible for filtering by `visibleToPlayers` (non-DM viewers) and `floor`
 * before passing the list in.
 */

const ICON_GLYPH: Record<MapPinIcon, string> = {
  note: '📝',
  quest: '!',
  shop: '$',
  danger: '⚠',
  npc: '☻',
  custom: '★'
}

/**
 * Clear and redraw all pins. `zoom` gates label visibility (hidden below 0.5 to reduce clutter).
 * When `onPinClick` is provided each marker becomes interactive (pointer cursor + click → open
 * linked content). The pin's text label renders beneath the marker (above ~0.5 zoom).
 */
export function renderPins(
  container: Container,
  pins: MapPin[],
  cellSize: number,
  zoom: number,
  onPinClick?: (pin: MapPin) => void
): void {
  container.removeChildren().forEach((c) => c.destroy({ children: true }))

  const showLabels = zoom >= 0.5
  const r = cellSize * 0.3

  for (const pin of pins) {
    const cx = pin.gridX * cellSize + cellSize / 2
    const cy = pin.gridY * cellSize + cellSize / 2

    const marker = new Graphics()
    // Teardrop: a circle with a downward point at the cell center.
    marker.circle(cx, cy - r, r).fill({ color: pin.color, alpha: 0.9 })
    marker.poly([cx - r * 0.5, cy - r * 0.5, cx + r * 0.5, cy - r * 0.5, cx, cy]).fill({ color: pin.color, alpha: 0.9 })
    marker.circle(cx, cy - r, r).stroke({ color: 0x000000, width: 1, alpha: 0.5 })
    if (onPinClick) {
      marker.eventMode = 'static'
      marker.cursor = 'pointer'
      marker.on('pointertap', () => onPinClick(pin))
    }
    container.addChild(marker)

    const glyph = new Text({
      text: ICON_GLYPH[pin.icon] ?? ICON_GLYPH.custom,
      style: new TextStyle({ fontSize: r * 0.9, fill: 0xffffff, align: 'center' })
    })
    glyph.anchor.set(0.5)
    glyph.x = cx
    glyph.y = cy - r
    container.addChild(glyph)

    if (showLabels && pin.label) {
      const label = new Text({
        text: pin.label,
        style: new TextStyle({ fontSize: Math.max(10, cellSize * 0.22), fill: 0xffffff, align: 'center' })
      })
      label.anchor.set(0.5, 0)
      label.x = cx
      label.y = cy + 2
      const bg = new Graphics()
      bg.roundRect(cx - label.width / 2 - 3, cy, label.width + 6, label.height + 2, 3).fill({
        color: 0x000000,
        alpha: 0.6
      })
      container.addChild(bg)
      container.addChild(label)
    }
  }
}
