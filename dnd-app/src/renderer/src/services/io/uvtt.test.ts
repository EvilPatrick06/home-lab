import { describe, expect, it } from 'vitest'
import { normalizeUvttColor, parseUvtt, parseUvttString, toUvtt, toUvttString, type UvttMap } from './uvtt'

const sample: UvttMap = {
  format: 1,
  resolution: {
    map_origin: { x: 0, y: 0 },
    map_size: { x: 30, y: 20 },
    pixels_per_grid: 70
  },
  line_of_sight: [
    [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 }
    ]
  ],
  portals: [
    {
      position: { x: 2.5, y: 0 },
      bounds: [
        { x: 2, y: 0 },
        { x: 3, y: 0 }
      ],
      rotation: 0,
      closed: true,
      freestanding: false
    }
  ],
  lights: [
    {
      position: { x: 10, y: 10 },
      range: 6,
      intensity: 1,
      color: 'ffff9900',
      shadows: true
    }
  ],
  image: 'aGVsbG8='
}

describe('normalizeUvttColor', () => {
  it('drops the alpha channel from ARGB', () => {
    expect(normalizeUvttColor('ffff9900')).toBe('#ff9900')
  })
  it('passes through 6-digit hex', () => {
    expect(normalizeUvttColor('#123456')).toBe('#123456')
  })
  it('returns undefined for unusable input', () => {
    expect(normalizeUvttColor('')).toBeUndefined()
    expect(normalizeUvttColor(undefined)).toBeUndefined()
  })
})

describe('parseUvtt', () => {
  it('maps resolution to grid + dimensions', () => {
    const p = parseUvtt(sample)
    expect(p.grid.cellSize).toBe(70)
    expect(p.width).toBe(30 * 70)
    expect(p.height).toBe(20 * 70)
  })

  it('converts a 3-point polyline into 2 wall segments', () => {
    const p = parseUvtt(sample)
    const solids = p.walls.filter((w) => w.type === 'solid')
    expect(solids).toHaveLength(2)
    expect(solids[0]).toMatchObject({ x1: 0, y1: 0, x2: 5, y2: 0, type: 'solid' })
    expect(solids[1]).toMatchObject({ x1: 5, y1: 0, x2: 5, y2: 5 })
  })

  it('converts portals into door walls (closed → not open)', () => {
    const p = parseUvtt(sample)
    const doors = p.walls.filter((w) => w.type === 'door')
    expect(doors).toHaveLength(1)
    expect(doors[0]).toMatchObject({ x1: 2, y1: 0, x2: 3, y2: 0, isOpen: false })
  })

  it('converts lights with color and radii', () => {
    const p = parseUvtt(sample)
    expect(p.lights).toHaveLength(1)
    expect(p.lights[0]).toMatchObject({ x: 10, y: 10, brightRadius: 3, dimRadius: 3, color: '#ff9900' })
  })

  it('builds a data-url from the embedded image', () => {
    const p = parseUvtt(sample)
    expect(p.imageDataUrl).toBe('data:image/png;base64,aGVsbG8=')
  })
})

describe('parseUvttString', () => {
  it('throws on a non-UVTT object', () => {
    expect(() => parseUvttString('{"foo":1}')).toThrow(/Universal VTT/)
  })
})

describe('toUvtt / round-trip', () => {
  it('serializes walls back to line_of_sight and doors to portals', () => {
    const parsed = parseUvtt(sample)
    const out = toUvtt({
      grid: parsed.grid,
      width: parsed.width,
      height: parsed.height,
      walls: parsed.walls,
      lights: parsed.lights,
      imageBase64: 'aGVsbG8='
    })
    expect(out.resolution.map_size).toEqual({ x: 30, y: 20 })
    expect(out.line_of_sight).toHaveLength(2)
    expect(out.portals).toHaveLength(1)
    expect(out.portals[0].closed).toBe(true)
    expect(out.lights[0].color).toBe('ffff9900')
    expect(out.image).toBe('aGVsbG8=')
  })

  it('produces valid JSON via toUvttString', () => {
    const parsed = parseUvtt(sample)
    const json = toUvttString({
      grid: parsed.grid,
      width: parsed.width,
      height: parsed.height,
      walls: parsed.walls,
      lights: parsed.lights
    })
    const reparsed = parseUvttString(json)
    expect(reparsed.walls.filter((w) => w.type === 'door')).toHaveLength(1)
    expect(reparsed.lights).toHaveLength(1)
  })
})
