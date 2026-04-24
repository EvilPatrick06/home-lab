import { describe, expect, it } from 'vitest'
import type { CreateDieOptions, DiceColors, DieDefinition, DieType } from './dice-types'

describe('DiceColors interface', () => {
  it('accepts valid hex body and number colors', () => {
    const colors: DiceColors = {
      bodyColor: '#1a1a2e',
      numberColor: '#f5c542'
    }
    expect(colors.bodyColor).toBe('#1a1a2e')
    expect(colors.numberColor).toBe('#f5c542')
  })

  it('allows any hex string format', () => {
    const colors: DiceColors = {
      bodyColor: '#ffffff',
      numberColor: '#000000'
    }
    expect(colors.bodyColor).toBe('#ffffff')
    expect(colors.numberColor).toBe('#000000')
  })
})

describe('DieDefinition interface', () => {
  it('satisfies the minimum required shape', () => {
    const mockMesh = {} as import('three').Mesh
    const def: DieDefinition = {
      sides: 20,
      mesh: mockMesh,
      faceNormals: []
    }
    expect(def.sides).toBe(20)
    expect(def.mesh).toBe(mockMesh)
    expect(def.faceNormals).toEqual([])
  })

  it('accepts optional wireframe', () => {
    const mockMesh = {} as import('three').Mesh
    const mockWireframe = {} as import('three').LineSegments
    const def: DieDefinition = {
      sides: 6,
      mesh: mockMesh,
      faceNormals: [],
      wireframe: mockWireframe
    }
    expect(def.wireframe).toBe(mockWireframe)
  })

  it('wireframe is optional (undefined by default)', () => {
    const mockMesh = {} as import('three').Mesh
    const def: DieDefinition = {
      sides: 4,
      mesh: mockMesh,
      faceNormals: []
    }
    expect(def.wireframe).toBeUndefined()
  })
})

describe('DieType union', () => {
  it('accepts all valid die types', () => {
    const types: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']
    expect(types).toHaveLength(7)
    for (const t of types) {
      expect(typeof t).toBe('string')
      expect(t).toMatch(/^d\d+$/)
    }
  })

  it('includes d100 for percentile dice', () => {
    const t: DieType = 'd100'
    expect(t).toBe('d100')
  })
})

describe('CreateDieOptions interface', () => {
  it('accepts empty options object', () => {
    const opts: CreateDieOptions = {}
    expect(opts.colors).toBeUndefined()
    expect(opts.isHidden).toBeUndefined()
  })

  it('accepts colors and isHidden', () => {
    const opts: CreateDieOptions = {
      colors: { bodyColor: '#333', numberColor: '#fff' },
      isHidden: true
    }
    expect(opts.colors?.bodyColor).toBe('#333')
    expect(opts.isHidden).toBe(true)
  })
})
