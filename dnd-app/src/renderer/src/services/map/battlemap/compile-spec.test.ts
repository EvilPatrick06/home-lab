import { describe, expect, it } from 'vitest'
import { BattlemapSpecSchema } from '../../../../../shared/battlemap-spec'
import { buildFloorMask, compileSpec, traceWalls } from './compile-spec'

function spec(over: Record<string, unknown> = {}): import('../../../../../shared/battlemap-spec').BattlemapSpec {
  return BattlemapSpecSchema.parse({
    name: 'M',
    theme: 'dungeon',
    width: 20,
    height: 20,
    ambientLight: 'dim',
    rooms: [{ id: 'r1', x: 2, y: 2, w: 4, h: 4 }],
    spawns: { party: { x: 3, y: 3 } },
    ...over
  })
}

describe('compile-spec (PHASE-34 34C)', () => {
  it('a single room traces to exactly 4 merged wall segments', () => {
    const mask = buildFloorMask(spec())
    expect(traceWalls(mask)).toHaveLength(4)
  })

  it('two rooms + a corridor connect in the floor mask', () => {
    const s = spec({
      rooms: [
        { id: 'r1', x: 2, y: 2, w: 3, h: 3 },
        { id: 'r2', x: 12, y: 2, w: 3, h: 3 }
      ],
      corridors: [{ from: 'r1', to: 'r2' }]
    })
    const mask = buildFloorMask(s)
    // A cell between the two rooms along the corridor is floor.
    expect(mask.has('8,3')).toBe(true)
  })

  it('a door splits its host wall into solid/door/solid and yields a door-type segment', () => {
    const s = spec({ rooms: [{ id: 'r1', x: 2, y: 2, w: 6, h: 6 }], doors: [{ x: 4, y: 2, type: 'door' }] })
    const compiled = compileSpec(s)
    expect(compiled.wallSegments.filter((w) => w.type === 'door')).toHaveLength(1)
    expect(compiled.wallSegments.length).toBe(6) // top wall split 1→3, plus 3 other edges
  })

  it('a secret door leaves the wall solid and drops a DM-only pin', () => {
    const s = spec({ rooms: [{ id: 'r1', x: 2, y: 2, w: 6, h: 6 }], doors: [{ x: 4, y: 2, type: 'secret' }] })
    const compiled = compileSpec(s)
    expect(compiled.wallSegments.every((w) => w.type === 'solid')).toBe(true)
    expect(compiled.pins.some((p) => p.label === 'Secret door' && p.visibleToPlayers === false)).toBe(true)
  })

  it('relocates an out-of-floor spawn onto a floor cell', () => {
    const s = spec({ rooms: [{ id: 'r1', x: 10, y: 10, w: 4, h: 4 }], spawns: { party: { x: 0, y: 0 } } })
    const compiled = compileSpec(s)
    expect(compiled.floorMask.has(`${compiled.partySpawn.x},${compiled.partySpawn.y}`)).toBe(true)
  })

  it('maps light kinds to LIGHT_SOURCES keys (magical → continual-flame)', () => {
    const s = spec({ lights: [{ x: 3, y: 3, kind: 'magical' }] })
    const compiled = compileSpec(s)
    expect(compiled.lightFixtures[0].sourceKey).toBe('continual-flame')
    expect(compiled.lightFixtures[0].token.visibleToPlayers).toBe(true)
  })

  it('enemy spawn pins are DM-only; party pin is visible', () => {
    const s = spec({ spawns: { party: { x: 3, y: 3 }, enemies: [{ x: 4, y: 4, label: 'Goblin' }] } })
    const { pins } = compileSpec(s)
    expect(pins.find((p) => p.label === 'Party Start')?.visibleToPlayers).toBe(true)
    expect(pins.find((p) => p.label === 'Goblin')?.visibleToPlayers).toBe(false)
  })
})
