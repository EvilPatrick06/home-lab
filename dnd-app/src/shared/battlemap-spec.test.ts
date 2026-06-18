import { describe, expect, it } from 'vitest'
import { BattlemapSpecError, BattlemapSpecSchema, battlemapSpecJsonSchema, repairBattlemapSpec } from './battlemap-spec'

function spec(over: Record<string, unknown> = {}): import('./battlemap-spec').BattlemapSpec {
  return BattlemapSpecSchema.parse({
    name: 'Test Crypt',
    theme: 'crypt',
    width: 30,
    height: 30,
    ambientLight: 'dim',
    rooms: [{ id: 'r1', x: 2, y: 2, w: 6, h: 6 }],
    spawns: { party: { x: 4, y: 4 } },
    ...over
  })
}

describe('battlemap-spec (PHASE-34 34A)', () => {
  it('a valid spec round-trips with defaults applied', () => {
    const s = spec()
    expect(s.corridors).toEqual([])
    expect(s.doors).toEqual([])
    expect(s.spawns.enemies).toEqual([])
    const { warnings } = repairBattlemapSpec(s)
    expect(warnings).toEqual([])
  })

  it('clamps an out-of-bounds room into the grid', () => {
    const { spec: r } = repairBattlemapSpec(spec({ rooms: [{ id: 'r1', x: 28, y: 28, w: 20, h: 20 }] }))
    expect(r.rooms[0].x).toBeLessThanOrEqual(29)
    expect(r.rooms[0].x + r.rooms[0].w).toBeLessThanOrEqual(30)
  })

  it('drops a corridor referencing an unknown room (with a warning)', () => {
    const { spec: r, warnings } = repairBattlemapSpec(
      spec({ rooms: [{ id: 'r1', x: 2, y: 2, w: 6, h: 6 }], corridors: [{ from: 'r1', to: 'ghost' }] })
    )
    expect(r.corridors).toEqual([])
    expect(warnings.some((w) => w.includes('ghost'))).toBe(true)
  })

  it('throws BattlemapSpecError when every room is too small', () => {
    expect(() => repairBattlemapSpec(spec({ rooms: [{ id: 'r1', x: 0, y: 0, w: 1, h: 1 }] }))).toThrow(
      BattlemapSpecError
    )
  })

  it('relocates a party spawn that lands outside all rooms onto a floor cell', () => {
    const { spec: r } = repairBattlemapSpec(
      spec({ rooms: [{ id: 'r1', x: 10, y: 10, w: 5, h: 5 }], spawns: { party: { x: 0, y: 0 } } })
    )
    expect(r.spawns.party.x).toBeGreaterThanOrEqual(10)
    expect(r.spawns.party.y).toBeGreaterThanOrEqual(10)
  })

  it('dedupes same-cell lights', () => {
    const { spec: r } = repairBattlemapSpec(
      spec({
        lights: [
          { x: 3, y: 3, kind: 'torch' },
          { x: 3, y: 3, kind: 'lantern' }
        ]
      })
    )
    expect(r.lights).toHaveLength(1)
  })

  it('JSON schema has additionalProperties:false on the root and on rooms.items', () => {
    const js = battlemapSpecJsonSchema()
    expect(js.additionalProperties).toBe(false)
    const rooms = (js.properties as Record<string, { items?: { additionalProperties?: boolean } }>).rooms
    expect(rooms.items?.additionalProperties).toBe(false)
  })
})
