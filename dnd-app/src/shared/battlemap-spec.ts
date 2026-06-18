/**
 * PHASE-34 34A — battlemap spec: the single source of truth for the LLM-facing map shape, shared by
 * the main-process generator and the renderer compiler. Flat + enum-heavy for small-model reliability.
 * `repairBattlemapSpec` makes imperfect LLM output compile deterministically.
 */

import { z } from 'zod'

export const BATTLEMAP_THEMES = ['dungeon', 'cave', 'crypt', 'sewer', 'tavern', 'forest', 'urban', 'ship'] as const
export type BattlemapTheme = (typeof BATTLEMAP_THEMES)[number]

// → LIGHT_SOURCES keys (F6): torch, lantern-hooded, candle, lamp, continual-flame.
export const BATTLEMAP_LIGHT_KINDS = ['torch', 'lantern', 'candle', 'lamp', 'magical'] as const

export const BattlemapSpecSchema = z.object({
  name: z.string().min(1).max(60),
  theme: z.enum(BATTLEMAP_THEMES),
  width: z.number().int().min(10).max(60), // grid cells
  height: z.number().int().min(10).max(60),
  ambientLight: z.enum(['bright', 'dim', 'darkness']),
  rooms: z
    .array(
      z.object({
        id: z.string().min(1).max(20),
        x: z.number().int(),
        y: z.number().int(),
        w: z.number().int(),
        h: z.number().int(),
        label: z.string().max(60).optional(),
        floor: z.enum(['stone', 'wood', 'dirt', 'grass', 'sand', 'water']).optional()
      })
    )
    .min(1)
    .max(20),
  corridors: z
    .array(z.object({ from: z.string(), to: z.string(), width: z.number().int().min(1).max(2).optional() }))
    .max(30)
    .default([]),
  doors: z
    .array(
      z.object({
        x: z.number().int(),
        y: z.number().int(),
        type: z.enum(['door', 'open', 'locked', 'secret', 'window'])
      })
    )
    .max(20)
    .default([]),
  lights: z
    .array(z.object({ x: z.number().int(), y: z.number().int(), kind: z.enum(BATTLEMAP_LIGHT_KINDS) }))
    .max(20)
    .default([]),
  terrain: z
    .array(
      z.object({
        x: z.number().int(),
        y: z.number().int(),
        type: z.enum(['difficult', 'water', 'hazard']),
        hazardType: z.enum(['fire', 'acid', 'pit', 'spikes']).optional()
      })
    )
    .max(80)
    .default([]),
  spawns: z.object({
    party: z.object({ x: z.number().int(), y: z.number().int() }),
    enemies: z
      .array(z.object({ x: z.number().int(), y: z.number().int(), label: z.string().max(40).optional() }))
      .max(12)
      .default([])
  })
})
export type BattlemapSpec = z.infer<typeof BattlemapSpecSchema>

export class BattlemapSpecError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'BattlemapSpecError'
  }
}

/** Recursively force additionalProperties:false on every object node (strict structured-output decoders). */
function lockObjects(node: unknown): void {
  if (!node || typeof node !== 'object') return
  const obj = node as Record<string, unknown>
  if (obj.type === 'object' || obj.properties) {
    obj.additionalProperties = false
    if (obj.properties) for (const v of Object.values(obj.properties)) lockObjects(v)
  }
  if (obj.items) lockObjects(obj.items)
}

export function battlemapSpecJsonSchema(): Record<string, unknown> {
  // zod v4 native JSON Schema emitter.
  const schema = z.toJSONSchema(BattlemapSpecSchema) as Record<string, unknown>
  lockObjects(schema)
  return schema
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.round(v)))

/** True when (x,y) is inside any room rect (coarse floor membership for the pre-pass). */
function inAnyRoom(rooms: BattlemapSpec['rooms'], x: number, y: number): boolean {
  return rooms.some((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)
}

function nearestFloor(
  rooms: BattlemapSpec['rooms'],
  x: number,
  y: number,
  w: number,
  h: number
): { x: number; y: number } {
  if (inAnyRoom(rooms, x, y)) return { x, y }
  let best = { x: clamp(x, 0, w - 1), y: clamp(y, 0, h - 1) }
  let bestDist = Number.POSITIVE_INFINITY
  for (const r of rooms) {
    for (let ry = r.y; ry < r.y + r.h; ry++) {
      for (let rx = r.x; rx < r.x + r.w; rx++) {
        const d = (rx - x) ** 2 + (ry - y) ** 2
        if (d < bestDist) {
          bestDist = d
          best = { x: rx, y: ry }
        }
      }
    }
  }
  return best
}

/**
 * Deterministic clamp/repair so imperfect LLM output still compiles. Coarse floor = union of room
 * rects; the compiler (34C) re-repairs against the true floor mask (rooms + carved corridors).
 */
export function repairBattlemapSpec(spec: BattlemapSpec): { spec: BattlemapSpec; warnings: string[] } {
  const warnings: string[] = []
  const W = spec.width
  const H = spec.height

  // Rooms: clamp into bounds, drop sub-2 rects.
  const rooms = spec.rooms
    .map((r) => {
      const x = clamp(r.x, 0, W - 1)
      const y = clamp(r.y, 0, H - 1)
      const ww = clamp(r.w, 1, W - x)
      const hh = clamp(r.h, 1, H - y)
      return { ...r, x, y, w: ww, h: hh }
    })
    .filter((r) => {
      if (r.w < 2 || r.h < 2) {
        warnings.push(`Dropped tiny room "${r.id}"`)
        return false
      }
      return true
    })
  if (rooms.length === 0) throw new BattlemapSpecError('No rooms survived repair (all out of bounds or too small)')

  const roomIds = new Set(rooms.map((r) => r.id))

  // Corridors: drop unknown refs + dedupe pairs.
  const seenCorr = new Set<string>()
  const corridors = spec.corridors.filter((c) => {
    if (!roomIds.has(c.from) || !roomIds.has(c.to) || c.from === c.to) {
      warnings.push(`Dropped corridor ${c.from}→${c.to}`)
      return false
    }
    const key = [c.from, c.to].sort().join('|')
    if (seenCorr.has(key)) return false
    seenCorr.add(key)
    return true
  })

  const inBounds = <T extends { x: number; y: number }>(arr: T[]): T[] =>
    arr.map((e) => ({ ...e, x: clamp(e.x, 0, W - 1), y: clamp(e.y, 0, H - 1) }))
  const dedupeCell = <T extends { x: number; y: number }>(arr: T[]): T[] => {
    const seen = new Set<string>()
    return arr.filter((e) => {
      const k = `${e.x},${e.y}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }

  const doors = inBounds(spec.doors).slice(0, 20)
  const lights = dedupeCell(inBounds(spec.lights)).slice(0, 20)
  const terrain = dedupeCell(inBounds(spec.terrain)).slice(0, 80)

  // Spawns: move onto the nearest floor cell when outside every room.
  const party = nearestFloor(rooms, spec.spawns.party.x, spec.spawns.party.y, W, H)
  const enemies = spec.spawns.enemies.slice(0, 12).map((e) => {
    const p = nearestFloor(rooms, e.x, e.y, W, H)
    return { ...e, x: p.x, y: p.y }
  })

  return {
    spec: { ...spec, rooms, corridors, doors, lights, terrain, spawns: { party, enemies } },
    warnings
  }
}
