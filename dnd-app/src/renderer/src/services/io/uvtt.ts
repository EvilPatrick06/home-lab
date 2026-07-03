// ---------------------------------------------------------------------------
// Universal VTT (.uvtt / .dd2vtt / .df2vtt) import / export
// ---------------------------------------------------------------------------
// The Universal VTT JSON format is the ecosystem-standard battlemap interchange
// consumed by Foundry, Roll20, etc. and produced by Dungeondraft / Dungeon
// Alchemist. It is an image plus grid resolution, line-of-sight polylines
// (walls), portals (doors), and lights. PHASE-34's BattlemapSpec was
// deliberately designed "UVTT-adjacent"; this module is the pure converter
// between UVTT and the app's internal wall/door/light/grid model
// (`WallSegment`, `LightSource`, `GridSettings`) so a DM can round-trip maps
// built in external tools.
//
// This is the CONVERTER layer only — parse/serialize + coordinate mapping. The
// UI wiring (a "Import map file…" action in DMMapEditor that applies the result
// to the live map state) is a separate integration step.

import type { GridSettings, WallSegment } from '../../types/map'
import type { LightSource } from '../map/raycast-visibility'

// ── UVTT wire format ────────────────────────────────────────────────────────

export interface UvttPoint {
  x: number
  y: number
}

export interface UvttResolution {
  map_origin: UvttPoint
  map_size: UvttPoint
  pixels_per_grid: number
}

export interface UvttPortal {
  position: UvttPoint
  bounds: UvttPoint[]
  rotation: number
  closed: boolean
  freestanding: boolean
}

export interface UvttLight {
  position: UvttPoint
  /** Range in grid units. */
  range: number
  intensity: number
  /** ARGB or RGB hex (Dungeondraft emits 8-digit ARGB like "ffff9900"). */
  color: string
  shadows: boolean
}

export interface UvttMap {
  format: number
  resolution: UvttResolution
  /** Wall polylines, in grid units. */
  line_of_sight: UvttPoint[][]
  /** Optional secondary object LOS layer (Dungeondraft). */
  objects_line_of_sight?: UvttPoint[][]
  portals: UvttPortal[]
  lights: UvttLight[]
  /** Base64-encoded background image (no data-url prefix). */
  image?: string
}

/** The app-internal shape a parsed UVTT map maps onto. */
export interface ParsedUvttMap {
  grid: GridSettings
  /** Pixel width/height of the background image (grid units × pixels_per_grid). */
  width: number
  height: number
  walls: WallSegment[]
  lights: LightSource[]
  /** A ready-to-use `data:` URL for the background image, or undefined. */
  imageDataUrl?: string
}

const UVTT_DEFAULT_PPG = 70

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-uvtt-${idCounter}`
}

/** Normalize a UVTT ARGB/RGB hex string to a `#rrggbb` CSS color. */
export function normalizeUvttColor(color: string | undefined): string | undefined {
  if (!color) return undefined
  const hex = color.replace(/^#/, '')
  if (hex.length === 8) return `#${hex.slice(2)}` // ARGB → drop alpha
  if (hex.length === 6) return `#${hex}`
  return undefined
}

/** Convert `#rrggbb` back to an 8-digit ARGB hex (opaque) for UVTT export. */
function toUvttColor(color: string | undefined): string {
  const hex = (color ?? '#ffffff').replace(/^#/, '')
  const rgb = hex.length === 6 ? hex : 'ffffff'
  return `ff${rgb}`
}

/**
 * Parse a UVTT map object into the internal model. Coordinates are converted
 * from UVTT grid units into the app's grid-cell space (walls/lights are stored
 * in grid coordinates). `cellSize` is taken from `pixels_per_grid`.
 */
export function parseUvtt(map: UvttMap): ParsedUvttMap {
  const ppg = map.resolution?.pixels_per_grid || UVTT_DEFAULT_PPG
  const cols = map.resolution?.map_size?.x ?? 0
  const rows = map.resolution?.map_size?.y ?? 0

  const grid: GridSettings = {
    enabled: true,
    cellSize: ppg,
    offsetX: 0,
    offsetY: 0,
    color: '#000000',
    opacity: 0.2,
    type: 'square'
  }

  // Walls: each line_of_sight polyline of N points → N-1 solid segments.
  const walls: WallSegment[] = []
  const polylines = [...(map.line_of_sight ?? []), ...(map.objects_line_of_sight ?? [])]
  for (const line of polylines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i]
      const b = line[i + 1]
      walls.push({
        id: nextId('wall'),
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        type: 'solid'
      })
    }
  }

  // Portals → door wall segments. A portal's `bounds` are its two endpoints.
  for (const portal of map.portals ?? []) {
    const b = portal.bounds
    if (!b || b.length < 2) continue
    walls.push({
      id: nextId('door'),
      x1: b[0].x,
      y1: b[0].y,
      x2: b[b.length - 1].x,
      y2: b[b.length - 1].y,
      type: 'door',
      isOpen: !portal.closed
    })
  }

  // Lights → LightSource (radii in grid cells). UVTT `range` is the outer (dim)
  // reach; there is no separate bright radius, so bright = half the range
  // (a reasonable default matching torch-like falloff).
  const lights: LightSource[] = (map.lights ?? []).map((l) => ({
    x: l.position.x,
    y: l.position.y,
    brightRadius: l.range / 2,
    dimRadius: l.range / 2,
    color: normalizeUvttColor(l.color)
  }))

  const imageDataUrl = map.image ? `data:image/png;base64,${map.image}` : undefined

  return {
    grid,
    width: cols * ppg,
    height: rows * ppg,
    walls,
    lights,
    imageDataUrl
  }
}

/** Parse a raw `.uvtt`/`.dd2vtt`/`.df2vtt` JSON string. Throws on invalid JSON. */
export function parseUvttString(json: string): ParsedUvttMap {
  const obj = JSON.parse(json) as UvttMap
  if (!obj || typeof obj !== 'object' || !obj.resolution) {
    throw new Error('Not a valid Universal VTT file (missing resolution).')
  }
  return parseUvtt(obj)
}

export interface UvttExportInput {
  grid: GridSettings
  width: number
  height: number
  walls: WallSegment[]
  lights: LightSource[]
  /** Base64 image WITHOUT the data-url prefix. */
  imageBase64?: string
}

/**
 * Serialize the internal map model back out to a UVTT object. Solid/window/
 * one-way/transparent walls become line_of_sight segments; door walls become
 * portals; lights become UVTT lights. Segments are emitted individually (each a
 * 2-point polyline) — lossless if not maximally compact.
 */
export function toUvtt(input: UvttExportInput): UvttMap {
  const ppg = input.grid.cellSize || UVTT_DEFAULT_PPG
  const cols = Math.round(input.width / ppg)
  const rows = Math.round(input.height / ppg)

  const doorWalls = input.walls.filter((w) => w.type === 'door')
  const losWalls = input.walls.filter((w) => w.type !== 'door')

  const line_of_sight: UvttPoint[][] = losWalls.map((w) => [
    { x: w.x1, y: w.y1 },
    { x: w.x2, y: w.y2 }
  ])

  const portals: UvttPortal[] = doorWalls.map((w) => ({
    position: { x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 },
    bounds: [
      { x: w.x1, y: w.y1 },
      { x: w.x2, y: w.y2 }
    ],
    rotation: Math.atan2(w.y2 - w.y1, w.x2 - w.x1),
    closed: !w.isOpen,
    freestanding: false
  }))

  const lights: UvttLight[] = input.lights.map((l) => ({
    position: { x: l.x, y: l.y },
    range: l.brightRadius + l.dimRadius,
    intensity: 1,
    color: toUvttColor(l.color),
    shadows: true
  }))

  return {
    format: 1,
    resolution: {
      map_origin: { x: 0, y: 0 },
      map_size: { x: cols, y: rows },
      pixels_per_grid: ppg
    },
    line_of_sight,
    portals,
    lights,
    ...(input.imageBase64 ? { image: input.imageBase64 } : {})
  }
}

/** Serialize to a pretty JSON string suitable for a `.uvtt` download. */
export function toUvttString(input: UvttExportInput): string {
  return JSON.stringify(toUvtt(input), null, 2)
}
