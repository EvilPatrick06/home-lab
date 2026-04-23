import type { MapToken } from '../../types/map'

// ─── Zoom to Fit ─────────────────────────────────────────────

/**
 * Calculate the zoom level and offset to fit all tokens in view.
 * Returns null if no tokens exist.
 */
export function calculateZoomToFit(
  tokens: MapToken[],
  viewportWidth: number,
  viewportHeight: number,
  cellSize: number,
  padding?: number // extra padding in pixels (default 100)
): { zoom: number; offsetX: number; offsetY: number } | null {
  if (tokens.length === 0) return null

  const padding_ = padding ?? 100

  // Find bounding box of all tokens (in pixel coordinates)
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity
  for (const t of tokens) {
    const px = t.gridX * cellSize
    const py = t.gridY * cellSize
    const pw = (t.sizeX ?? 1) * cellSize
    const ph = (t.sizeY ?? 1) * cellSize
    if (px < minX) minX = px
    if (py < minY) minY = py
    if (px + pw > maxX) maxX = px + pw
    if (py + ph > maxY) maxY = py + ph
  }

  const contentWidth = maxX - minX + padding_ * 2
  const contentHeight = maxY - minY + padding_ * 2

  const zoomX = viewportWidth / contentWidth
  const zoomY = viewportHeight / contentHeight
  const zoom = Math.min(zoomX, zoomY, 2) // cap at 2x

  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2

  return {
    zoom,
    offsetX: viewportWidth / 2 - centerX * zoom,
    offsetY: viewportHeight / 2 - centerY * zoom
  }
}

// ─── Grid Coordinate Labels ──────────────────────────────────

/**
 * Generate grid coordinate labels (A1, B2, etc.) for a map.
 * Columns use letters (A-Z, then AA, AB...), rows use numbers (1, 2, 3...).
 */
export function getGridLabel(gridX: number, gridY: number): string {
  return `${columnLabel(gridX)}${gridY + 1}`
}

function columnLabel(col: number): string {
  let label = ''
  let c = col
  while (c >= 0) {
    label = String.fromCharCode(65 + (c % 26)) + label
    c = Math.floor(c / 26) - 1
  }
  return label
}

/**
 * Generate all column/row labels for a map.
 */
export function generateGridLabels(
  mapWidth: number,
  mapHeight: number,
  cellSize: number
): { columns: Array<{ label: string; x: number }>; rows: Array<{ label: string; y: number }> } {
  const cols = Math.ceil(mapWidth / cellSize)
  const rows = Math.ceil(mapHeight / cellSize)

  return {
    columns: Array.from({ length: cols }, (_, i) => ({
      label: columnLabel(i),
      x: i * cellSize + cellSize / 2
    })),
    rows: Array.from({ length: rows }, (_, i) => ({
      label: String(i + 1),
      y: i * cellSize + cellSize / 2
    }))
  }
}

// ─── Map Ping System ─────────────────────────────────────────

export interface MapPing {
  id: string
  x: number // pixel coords on map
  y: number
  color: number // hex color
  senderName: string
  createdAt: number
  duration: number // ms, default 3000
}

let pingCallback: ((ping: MapPing) => void) | null = null
let activePings: MapPing[] = []

export function onPing(cb: (ping: MapPing) => void): () => void {
  pingCallback = cb
  return () => {
    pingCallback = null
  }
}

export function createPing(x: number, y: number, senderName: string, color?: number): MapPing {
  const ping: MapPing = {
    id: crypto.randomUUID(),
    x,
    y,
    color: color ?? 0xffaa00,
    senderName,
    createdAt: Date.now(),
    duration: 3000
  }
  activePings.push(ping)
  if (pingCallback) pingCallback(ping)

  // Auto-remove after duration
  setTimeout(() => {
    activePings = activePings.filter((p) => p.id !== ping.id)
  }, ping.duration)

  return ping
}

export function getActivePings(): MapPing[] {
  const now = Date.now()
  activePings = activePings.filter((p) => now - p.createdAt < p.duration)
  return activePings
}

/**
 * Calculate ping animation progress (0-1) for rendering.
 * Returns opacity and scale for the ping ring animation.
 */
export function getPingAnimation(ping: MapPing): { opacity: number; scale: number } | null {
  const elapsed = Date.now() - ping.createdAt
  if (elapsed >= ping.duration) return null

  const progress = elapsed / ping.duration
  // Pulsing ring that expands and fades
  const scale = 1 + progress * 2 // grows from 1x to 3x
  const opacity = 1 - progress // fades from 1 to 0

  return { opacity, scale }
}

// ─── Typing Indicators ──────────────────────────────────────

const typingPlayers = new Map<string, number>() // peerId -> timestamp

export function setPlayerTyping(peerId: string): void {
  typingPlayers.set(peerId, Date.now())
}

export function clearPlayerTyping(peerId: string): void {
  typingPlayers.delete(peerId)
}

export function getTypingPlayers(timeoutMs?: number): string[] {
  const now = Date.now()
  const timeout = timeoutMs ?? 3000
  const result: string[] = []
  for (const [peerId, ts] of typingPlayers) {
    if (now - ts < timeout) {
      result.push(peerId)
    } else {
      typingPlayers.delete(peerId)
    }
  }
  return result
}
