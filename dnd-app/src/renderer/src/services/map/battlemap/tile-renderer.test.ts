import { describe, expect, it } from 'vitest'
import { BATTLEMAP_THEMES, BattlemapSpecSchema } from '../../../../../shared/battlemap-spec'
import { compileSpec } from './compile-spec'
import { hashString, mulberry32, renderBattlemap, THEME_PALETTES } from './tile-renderer'

function spec(over: Record<string, unknown> = {}): import('../../../../../shared/battlemap-spec').BattlemapSpec {
  return BattlemapSpecSchema.parse({
    name: 'Render Test',
    theme: 'dungeon',
    width: 12,
    height: 12,
    ambientLight: 'dim',
    rooms: [{ id: 'r1', x: 2, y: 2, w: 5, h: 5 }],
    lights: [{ x: 4, y: 4, kind: 'torch' }],
    spawns: { party: { x: 3, y: 3 } },
    ...over
  })
}

/** A recording 2D-context stub + canvas (node env has no real canvas). */
function recordingCanvas(): { canvas: HTMLCanvasElement; ops: string[] } {
  const ops: string[] = []
  const grad = { addColorStop: () => {} }
  const ctx = {
    set fillStyle(v: string) {
      ops.push(`fillStyle=${v}`)
    },
    set strokeStyle(v: string) {
      ops.push(`strokeStyle=${v}`)
    },
    set lineWidth(v: number) {
      ops.push(`lineWidth=${v}`)
    },
    fillRect: (a: number, b: number, c: number, d: number) => ops.push(`fillRect(${a},${b},${c},${d})`),
    beginPath: () => ops.push('beginPath'),
    moveTo: (a: number, b: number) => ops.push(`moveTo(${a},${b})`),
    lineTo: (a: number, b: number) => ops.push(`lineTo(${a},${b})`),
    stroke: () => ops.push('stroke'),
    arc: () => ops.push('arc'),
    fill: () => ops.push('fill'),
    createRadialGradient: () => grad
  }
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toDataURL: () => 'data:image/png;base64,STUB'
  } as unknown as HTMLCanvasElement
  return { canvas, ops }
}

describe('tile-renderer (PHASE-34 34D)', () => {
  it('mulberry32 is deterministic for a given seed', () => {
    const a = mulberry32(123)
    const b = mulberry32(123)
    expect(a()).toBe(b())
    expect(a()).toBe(b())
  })

  it('renders deterministically — same spec ⇒ identical op list', () => {
    const s = spec()
    const compiled = compileSpec(s, 40)
    const c1 = recordingCanvas()
    const c2 = recordingCanvas()
    const url1 = renderBattlemap(s, compiled, 40, () => c1.canvas)
    const url2 = renderBattlemap(s, compiled, 40, () => c2.canvas)
    expect(url1).toBe('data:image/png;base64,STUB')
    expect(url2).toBe(url1)
    expect(c1.ops).toEqual(c2.ops)
  })

  it('paints at least one fillRect per floor cell', () => {
    const s = spec()
    const compiled = compileSpec(s, 40)
    const c = recordingCanvas()
    renderBattlemap(s, compiled, 40, () => c.canvas)
    const fillRects = c.ops.filter((o) => o.startsWith('fillRect')).length
    expect(fillRects).toBeGreaterThanOrEqual(compiled.floorMask.size)
  })

  it('returns null (no throw) when the 2D context is unavailable', () => {
    const noCtx = { width: 0, height: 0, getContext: () => null } as unknown as HTMLCanvasElement
    const s = spec()
    expect(renderBattlemap(s, compileSpec(s, 40), 40, () => noCtx)).toBeNull()
  })

  it('THEME_PALETTES is exhaustive over BATTLEMAP_THEMES', () => {
    expect(Object.keys(THEME_PALETTES).sort()).toEqual([...BATTLEMAP_THEMES].sort())
  })

  it('hashString is stable + numeric', () => {
    expect(hashString('abc')).toBe(hashString('abc'))
    expect(typeof hashString('abc')).toBe('number')
  })
})
