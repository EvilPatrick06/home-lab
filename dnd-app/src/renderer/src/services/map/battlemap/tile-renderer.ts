/**
 * PHASE-34 34D — deterministic procedural artwork for a compiled battlemap, returned as a PNG data URL
 * that drops into GameMap.imagePath. Canvas is INJECTED (createCanvas factory) so the pure math is
 * testable in the node vitest env; returns null (no throw) when a 2D context is unavailable.
 */

import type { BattlemapSpec, BattlemapTheme } from '../../../../../shared/battlemap-spec'
import type { CompiledBattlemap } from './compile-spec'

/** Seeded PRNG (mulberry32) so re-rendering the same spec is pixel-identical. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

interface Palette {
  background: string
  floorBase: string
  floorJitter: number
  wallColor: string
  wallShadow: string
  accents: string
}

export const THEME_PALETTES = {
  dungeon: {
    background: '#0b0e13',
    floorBase: '#3f4350',
    floorJitter: 0.06,
    wallColor: '#1b1e26',
    wallShadow: '#000000',
    accents: '#2c303b'
  },
  cave: {
    background: '#0d0a08',
    floorBase: '#4a3b2e',
    floorJitter: 0.08,
    wallColor: '#241a12',
    wallShadow: '#000000',
    accents: '#5c4633'
  },
  crypt: {
    background: '#0a0c0a',
    floorBase: '#3a3f3a',
    floorJitter: 0.05,
    wallColor: '#171a17',
    wallShadow: '#000000',
    accents: '#2a302a'
  },
  sewer: {
    background: '#08110d',
    floorBase: '#2f3b34',
    floorJitter: 0.07,
    wallColor: '#121a15',
    wallShadow: '#000000',
    accents: '#3c4a40'
  },
  tavern: {
    background: '#140d07',
    floorBase: '#6b4a2a',
    floorJitter: 0.05,
    wallColor: '#3a2814',
    wallShadow: '#1c1208',
    accents: '#7d5a36'
  },
  forest: {
    background: '#0a1208',
    floorBase: '#3b5a2e',
    floorJitter: 0.1,
    wallColor: '#1f3317',
    wallShadow: '#0a1407',
    accents: '#4d6b39'
  },
  urban: {
    background: '#0e0f12',
    floorBase: '#52545c',
    floorJitter: 0.05,
    wallColor: '#26282e',
    wallShadow: '#000000',
    accents: '#3a3d45'
  },
  ship: {
    background: '#0b0d12',
    floorBase: '#5a4630',
    floorJitter: 0.06,
    wallColor: '#2e2316',
    wallShadow: '#120d07',
    accents: '#6e5638'
  }
} satisfies Record<BattlemapTheme, Palette>

const ROOM_FLOOR_COLOR: Record<string, string> = {
  stone: '#42454f',
  wood: '#6b4a2a',
  dirt: '#4a3b2e',
  grass: '#3b5a2e',
  sand: '#8a7a52',
  water: '#1e3a5f'
}

/** Lighten/darken a #rrggbb hex by a signed fraction. */
function jitterColor(hex: string, frac: number): string {
  const n = Number.parseInt(hex.slice(1), 16)
  const adj = (c: number): number => Math.max(0, Math.min(255, Math.round(c * (1 + frac))))
  const r = adj((n >> 16) & 0xff)
  const g = adj((n >> 8) & 0xff)
  const b = adj(n & 0xff)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

export function renderBattlemap(
  spec: BattlemapSpec,
  compiled: CompiledBattlemap,
  cellSize: number,
  createCanvas: () => HTMLCanvasElement
): string | null {
  const canvas = createCanvas()
  canvas.width = Math.min(compiled.widthPx, 2400)
  canvas.height = Math.min(compiled.heightPx, 2400)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const pal = THEME_PALETTES[spec.theme]
  const rng = mulberry32(hashString(spec.name) ^ spec.width ^ (spec.height << 8))

  // Per-cell room-floor override (room.floor) lookup.
  const roomFloor = new Map<string, string>()
  for (const r of spec.rooms) {
    if (!r.floor) continue
    const c = ROOM_FLOOR_COLOR[r.floor]
    if (!c) continue
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) roomFloor.set(`${x},${y}`, c)
  }

  // Background.
  ctx.fillStyle = pal.background
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Floor cells (jittered) + sparse accents.
  for (const cell of compiled.floorMask) {
    const [cx, cy] = cell.split(',').map(Number)
    const base = roomFloor.get(cell) ?? pal.floorBase
    ctx.fillStyle = jitterColor(base, (rng() - 0.5) * 2 * pal.floorJitter)
    ctx.fillRect(cx * cellSize, cy * cellSize, cellSize, cellSize)
    if (rng() < 0.05) {
      ctx.fillStyle = pal.accents
      const sz = cellSize * 0.18
      ctx.fillRect(cx * cellSize + rng() * (cellSize - sz), cy * cellSize + rng() * (cellSize - sz), sz, sz)
    }
  }

  // Terrain overlays.
  for (const t of compiled.terrain) {
    const px = t.x * cellSize
    const py = t.y * cellSize
    if (t.type === 'water') {
      ctx.fillStyle = 'rgba(40,110,180,0.45)'
      ctx.fillRect(px, py, cellSize, cellSize)
    } else if (t.type === 'hazard') {
      ctx.fillStyle = 'rgba(200,60,40,0.35)'
      ctx.fillRect(px, py, cellSize, cellSize)
    } else {
      // difficult: diagonal hatch
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.beginPath()
      ctx.moveTo(px, py + cellSize)
      ctx.lineTo(px + cellSize, py)
      ctx.stroke()
    }
  }

  // Lights: warm radial glow (cosmetic; engine LoS lighting still applies).
  for (const f of compiled.lightFixtures) {
    const cx = (f.token.gridX + 0.5) * cellSize
    const cy = (f.token.gridY + 0.5) * cellSize
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cellSize * 1.5)
    grad.addColorStop(0, 'rgba(255,200,120,0.28)')
    grad.addColorStop(1, 'rgba(255,200,120,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(cx, cy, cellSize * 1.5, 0, Math.PI * 2)
    ctx.fill()
  }

  // Walls.
  ctx.lineWidth = cellSize * 0.18
  for (const w of compiled.wallSegments) {
    if (w.type === 'door') {
      // door: draw jamb stubs, leave the middle open
      ctx.strokeStyle = pal.accents
      ctx.beginPath()
      ctx.moveTo(w.x1 * cellSize, w.y1 * cellSize)
      ctx.lineTo(w.x2 * cellSize, w.y2 * cellSize)
      ctx.stroke()
      continue
    }
    ctx.strokeStyle = w.type === 'window' ? 'rgba(150,200,255,0.7)' : pal.wallColor
    ctx.beginPath()
    ctx.moveTo(w.x1 * cellSize, w.y1 * cellSize)
    ctx.lineTo(w.x2 * cellSize, w.y2 * cellSize)
    ctx.stroke()
  }

  return canvas.toDataURL('image/png')
}
