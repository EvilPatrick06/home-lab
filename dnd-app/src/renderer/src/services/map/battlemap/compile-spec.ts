/**
 * PHASE-34 34C — pure, DOM-free compiler: a repaired BattlemapSpec → GameMap-shaped geometry
 * (floor mask, merged wall segments, doors, terrain, light fixtures, pins). No randomness, no DOM.
 */

import type { BattlemapSpec } from '../../../../../shared/battlemap-spec'
import type { MapPin, MapToken, TerrainCell, WallSegment } from '../../../types/map'

export interface LightFixture {
  token: MapToken
  sourceKey: string
}

export interface CompiledBattlemap {
  wallSegments: WallSegment[]
  terrain: TerrainCell[]
  lightFixtures: LightFixture[]
  pins: MapPin[]
  floorMask: Set<string>
  widthPx: number
  heightPx: number
  ambientLight: BattlemapSpec['ambientLight']
  partySpawn: { x: number; y: number }
  enemySpawns: Array<{ x: number; y: number; label?: string }>
  warnings: string[]
}

const key = (x: number, y: number): string => `${x},${y}`

/** Union of room rects + L-shaped corridor carvings. */
export function buildFloorMask(spec: BattlemapSpec): Set<string> {
  const mask = new Set<string>()
  for (const r of spec.rooms) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) mask.add(key(x, y))
  }
  const center = (id: string): { x: number; y: number } | null => {
    const r = spec.rooms.find((rm) => rm.id === id)
    return r ? { x: Math.floor(r.x + r.w / 2), y: Math.floor(r.y + r.h / 2) } : null
  }
  for (const c of spec.corridors) {
    const a = center(c.from)
    const b = center(c.to)
    if (!a || !b) continue
    const widen = (c.width ?? 1) >= 2 ? 1 : 0
    // Horizontal leg at a.y, then vertical leg at b.x.
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) {
      for (let dy = 0; dy <= widen; dy++) mask.add(key(x, a.y + dy))
    }
    for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) {
      for (let dx = 0; dx <= widen; dx++) mask.add(key(b.x + dx, y))
    }
  }
  return mask
}

type RawSeg = { x1: number; y1: number; x2: number; y2: number }

/** Every floor-cell edge bordering a non-floor cell, merged into maximal collinear segments. */
export function traceWalls(mask: Set<string>): RawSeg[] {
  const isFloor = (x: number, y: number): boolean => mask.has(key(x, y))
  const hEdges = new Set<string>() // horizontal unit edge (x,y)->(x+1,y), keyed "x,y"
  const vEdges = new Set<string>() // vertical unit edge (x,y)->(x,y+1)
  for (const cell of mask) {
    const [cx, cy] = cell.split(',').map(Number)
    if (!isFloor(cx, cy - 1)) hEdges.add(key(cx, cy)) // top
    if (!isFloor(cx, cy + 1)) hEdges.add(key(cx, cy + 1)) // bottom
    if (!isFloor(cx - 1, cy)) vEdges.add(key(cx, cy)) // left
    if (!isFloor(cx + 1, cy)) vEdges.add(key(cx + 1, cy)) // right
  }

  const segs: RawSeg[] = []
  // Merge horizontal runs: group by y, contiguous x.
  const hByY = new Map<number, number[]>()
  for (const e of hEdges) {
    const [x, y] = e.split(',').map(Number)
    if (!hByY.has(y)) hByY.set(y, [])
    hByY.get(y)?.push(x)
  }
  for (const [y, xs] of hByY) {
    xs.sort((a, b) => a - b)
    let start = xs[0]
    let prev = xs[0]
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] === prev + 1) {
        prev = xs[i]
      } else {
        segs.push({ x1: start, y1: y, x2: prev + 1, y2: y })
        if (i < xs.length) {
          start = xs[i]
          prev = xs[i]
        }
      }
    }
  }
  // Merge vertical runs: group by x, contiguous y.
  const vByX = new Map<number, number[]>()
  for (const e of vEdges) {
    const [x, y] = e.split(',').map(Number)
    if (!vByX.has(x)) vByX.set(x, [])
    vByX.get(x)?.push(y)
  }
  for (const [x, ys] of vByX) {
    ys.sort((a, b) => a - b)
    let start = ys[0]
    let prev = ys[0]
    for (let i = 1; i <= ys.length; i++) {
      if (i < ys.length && ys[i] === prev + 1) {
        prev = ys[i]
      } else {
        segs.push({ x1: x, y1: start, x2: x, y2: prev + 1 })
        if (i < ys.length) {
          start = ys[i]
          prev = ys[i]
        }
      }
    }
  }
  return segs
}

const HAZARD_DMG: Record<string, number> = { fire: 3, acid: 7, pit: 3, spikes: 3 }
const LIGHT_KEY: Record<string, string> = {
  torch: 'torch',
  lantern: 'lantern-hooded',
  candle: 'candle',
  lamp: 'lamp',
  magical: 'continual-flame'
}

export function compileSpec(spec: BattlemapSpec, cellSize = 40): CompiledBattlemap {
  const warnings: string[] = []
  const mask = buildFloorMask(spec)
  const rawWalls = traceWalls(mask)

  // Doors: split the containing wall segment; locked/secret also drop a DM-only pin.
  const doorPins: MapPin[] = []
  const wallSegments: WallSegment[] = []
  // Build a quick lookup of which raw segment a door belongs to + split it.
  const splitDoors = new Map<number, BattlemapSpec['doors']>()
  rawWalls.forEach((_w, idx) => splitDoors.set(idx, []))
  for (const door of spec.doors) {
    // Find a horizontal seg on the door cell's top/bottom edge, or a vertical seg on its left/right edge.
    let found = -1
    for (let i = 0; i < rawWalls.length; i++) {
      const w = rawWalls[i]
      if (w.y1 === w.y2) {
        // horizontal: door cell (door.x, door.y) borders this if y == door.y or door.y+1 and x in [x1,x2)
        if ((w.y1 === door.y || w.y1 === door.y + 1) && door.x >= w.x1 && door.x < w.x2) {
          found = i
          break
        }
      } else if (w.x1 === door.x || w.x1 === door.x + 1) {
        if (door.y >= w.y1 && door.y < w.y2) {
          found = i
          break
        }
      }
    }
    if (found === -1) {
      warnings.push(`Door at ${door.x},${door.y} had no nearby wall`)
      continue
    }
    splitDoors.get(found)?.push(door)
    if (door.type === 'locked' || door.type === 'secret') {
      doorPins.push({
        id: crypto.randomUUID(),
        gridX: door.x,
        gridY: door.y,
        icon: 'danger',
        color: '#ef4444',
        label: door.type === 'locked' ? 'Locked door' : 'Secret door',
        visibleToPlayers: false
      })
    }
  }

  rawWalls.forEach((w, idx) => {
    const doors = splitDoors.get(idx) ?? []
    if (doors.length === 0) {
      wallSegments.push({ id: crypto.randomUUID(), ...w, type: 'solid' })
      return
    }
    const horizontal = w.y1 === w.y2
    // Sort doors along the segment axis; split into solid/gap runs.
    const positions = doors.map((d) => (horizontal ? d.x : d.y)).sort((a, b) => a - b)
    const start = horizontal ? w.x1 : w.y1
    const end = horizontal ? w.x2 : w.y2
    let cursor = start
    const push = (a: number, b: number, type: WallSegment['type'], isOpen?: boolean): void => {
      if (b <= a) return
      const seg: WallSegment = horizontal
        ? { id: crypto.randomUUID(), x1: a, y1: w.y1, x2: b, y2: w.y1, type }
        : { id: crypto.randomUUID(), x1: w.x1, y1: a, x2: w.x1, y2: b, type }
      if (isOpen !== undefined) seg.isOpen = isOpen
      wallSegments.push(seg)
    }
    for (const pos of positions) {
      const door = doors.find((d) => (horizontal ? d.x : d.y) === pos)
      if (!door) continue
      push(cursor, pos, 'solid') // wall before the door cell
      if (door.type === 'secret') {
        push(pos, pos + 1, 'solid') // secret: no visible gap
      } else if (door.type === 'window') {
        push(pos, pos + 1, 'window')
      } else {
        push(pos, pos + 1, 'door', door.type === 'open')
      }
      cursor = pos + 1
    }
    push(cursor, end, 'solid') // remainder
  })

  // Terrain.
  const terrain: TerrainCell[] = spec.terrain.map((t) => {
    if (t.type === 'water') return { x: t.x, y: t.y, type: 'water', movementCost: 2 }
    if (t.type === 'hazard')
      return {
        x: t.x,
        y: t.y,
        type: 'hazard',
        movementCost: 1,
        hazardType: t.hazardType,
        hazardDamage: t.hazardType ? HAZARD_DMG[t.hazardType] : 3
      }
    return { x: t.x, y: t.y, type: 'difficult', movementCost: 2 }
  })

  // Light fixtures (tiny visible NPC tokens carrying the light).
  const lightFixtures: LightFixture[] = spec.lights.map((l, i) => ({
    sourceKey: LIGHT_KEY[l.kind] ?? 'torch',
    token: {
      id: crypto.randomUUID(),
      entityId: crypto.randomUUID(),
      entityType: 'npc',
      label: `${l.kind.charAt(0).toUpperCase()}${l.kind.slice(1)} ${i + 1}`,
      gridX: l.x,
      gridY: l.y,
      sizeX: 1,
      sizeY: 1,
      visibleToPlayers: true,
      nameVisible: false,
      conditions: []
    }
  }))

  // Spawn repair against the TRUE floor mask (rooms + carved corridors).
  const lightCells = new Set(lightFixtures.map((f) => key(f.token.gridX, f.token.gridY)))
  const relocate = (x: number, y: number): { x: number; y: number } => {
    if (mask.has(key(x, y)) && !lightCells.has(key(x, y))) return { x, y }
    let best = { x, y }
    let bestDist = Number.POSITIVE_INFINITY
    for (const cell of mask) {
      if (lightCells.has(cell)) continue
      const [cx, cy] = cell.split(',').map(Number)
      const d = (cx - x) ** 2 + (cy - y) ** 2
      if (d < bestDist) {
        bestDist = d
        best = { x: cx, y: cy }
      }
    }
    return best
  }
  const partySpawn = relocate(spec.spawns.party.x, spec.spawns.party.y)
  const enemySpawns = spec.spawns.enemies.map((e) => ({ ...relocate(e.x, e.y), label: e.label }))

  const pins: MapPin[] = [
    {
      id: crypto.randomUUID(),
      gridX: partySpawn.x,
      gridY: partySpawn.y,
      icon: 'note',
      color: '#22c55e',
      label: 'Party Start',
      visibleToPlayers: true
    },
    ...enemySpawns.map((e, i) => ({
      id: crypto.randomUUID(),
      gridX: e.x,
      gridY: e.y,
      icon: 'danger' as const,
      color: '#ef4444',
      label: e.label ?? `Enemy spawn ${i + 1}`,
      visibleToPlayers: false
    })),
    ...doorPins
  ]

  return {
    wallSegments,
    terrain,
    lightFixtures,
    pins,
    floorMask: mask,
    widthPx: spec.width * cellSize,
    heightPx: spec.height * cellSize,
    ambientLight: spec.ambientLight,
    partySpawn,
    enemySpawns,
    warnings
  }
}
