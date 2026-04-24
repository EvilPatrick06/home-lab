import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock three.js before importing dice-generators
vi.mock('three', () => {
  const makeMockBufferAttribute = (array: number[], itemSize: number) => ({
    count: array.length / itemSize,
    getX: vi.fn((i: number) => array[i * itemSize] ?? 0),
    getY: vi.fn((i: number) => array[i * itemSize + 1] ?? 0),
    getZ: vi.fn((i: number) => array[i * itemSize + 2] ?? 0)
  })

  const makeGeo = () => {
    const attributes: Record<string, ReturnType<typeof makeMockBufferAttribute>> = {}
    return {
      computeVertexNormals: vi.fn(),
      getAttribute: vi.fn((name: string) => attributes[name]),
      setAttribute: vi.fn((name: string, attr: ReturnType<typeof makeMockBufferAttribute>) => {
        attributes[name] = attr
      }),
      setIndex: vi.fn(),
      getIndex: vi.fn(() => null),
      addGroup: vi.fn(),
      toNonIndexed: vi.fn(function (this: ReturnType<typeof makeGeo>) {
        return makeNonIndexedGeo()
      })
    }
  }

  const makeNonIndexedGeo = () => {
    const pos = makeMockBufferAttribute([0, 1, 0, -1, -1, 0, 1, -1, 0], 3)
    const geo: ReturnType<typeof makeGeo> & { getAttribute: ReturnType<typeof vi.fn> } = {
      computeVertexNormals: vi.fn(),
      getAttribute: vi.fn((name: string) => (name === 'position' ? pos : pos)),
      setAttribute: vi.fn(),
      setIndex: vi.fn(),
      getIndex: vi.fn(() => null),
      addGroup: vi.fn(),
      toNonIndexed: vi.fn(() => makeNonIndexedGeo())
    }
    return geo
  }

  const makeMesh = () => ({ castShadow: false, material: [] })
  const makeLineSegments = () => ({})

  return {
    TetrahedronGeometry: vi.fn(function () {
      return makeGeo()
    }),
    OctahedronGeometry: vi.fn(function () {
      return makeGeo()
    }),
    IcosahedronGeometry: vi.fn(function () {
      return makeGeo()
    }),
    DodecahedronGeometry: vi.fn(function () {
      return makeGeo()
    }),
    BoxGeometry: vi.fn(function () {
      return makeGeo()
    }),
    BufferGeometry: vi.fn(function () {
      return makeGeo()
    }),
    EdgesGeometry: vi.fn(function () {
      return makeGeo()
    }),
    Float32BufferAttribute: vi.fn(function (array: number[], itemSize: number) {
      return makeMockBufferAttribute(array, itemSize)
    }),
    Vector3: vi.fn(function (x = 0, y = 0, z = 0) {
      return {
        x,
        y,
        z,
        fromBufferAttribute: vi.fn().mockReturnThis(),
        subVectors: vi.fn().mockReturnThis(),
        crossVectors: vi.fn().mockReturnThis(),
        add: vi.fn().mockReturnThis(),
        normalize: vi.fn().mockReturnThis(),
        clone: vi.fn().mockReturnThis(),
        applyQuaternion: vi.fn().mockReturnThis(),
        dot: vi.fn(() => 0.5)
      }
    }),
    Mesh: vi.fn(function () {
      return makeMesh()
    }),
    LineSegments: vi.fn(function () {
      return makeLineSegments()
    }),
    MeshStandardMaterial: vi.fn(function () {
      return { emissive: { setHex: vi.fn() }, emissiveIntensity: 0 }
    })
  }
})

vi.mock('./dice-textures', () => ({
  createFaceMaterials: vi.fn(() => []),
  createWireMaterial: vi.fn(() => ({}))
}))

import {
  computeFaceNormalsFromGeo,
  createD4,
  createD6,
  createD8,
  createD10,
  createD12,
  createD20
} from './dice-generators'

const DEFAULT_COLORS = { bodyColor: '#1a1a2e', numberColor: '#f5c542' }

describe('computeFaceNormalsFromGeo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an array of Vector3 objects with length equal to faceCount', () => {
    const mockGeo = {
      getAttribute: vi.fn(() => ({
        count: 12, // 4 faces × 3 verts
        getX: vi.fn(() => 0),
        getY: vi.fn(() => 0),
        getZ: vi.fn(() => 0)
      }))
    } as unknown as import('three').BufferGeometry

    const normals = computeFaceNormalsFromGeo(mockGeo, 4)
    expect(normals).toHaveLength(4)
  })
})

describe('createD4', () => {
  it('returns a DieDefinition with sides=4', () => {
    const def = createD4(DEFAULT_COLORS, false)
    expect(def.sides).toBe(4)
  })

  it('has a mesh and faceNormals array', () => {
    const def = createD4(DEFAULT_COLORS, false)
    expect(def.mesh).toBeDefined()
    expect(Array.isArray(def.faceNormals)).toBe(true)
  })

  it('includes a wireframe', () => {
    const def = createD4(DEFAULT_COLORS, false)
    expect(def.wireframe).toBeDefined()
  })
})

describe('createD6', () => {
  it('returns a DieDefinition with sides=6', () => {
    const def = createD6(DEFAULT_COLORS, false)
    expect(def.sides).toBe(6)
  })

  it('has exactly 6 face normals', () => {
    const def = createD6(DEFAULT_COLORS, false)
    expect(def.faceNormals).toHaveLength(6)
  })
})

describe('createD8', () => {
  it('returns a DieDefinition with sides=8', () => {
    const def = createD8(DEFAULT_COLORS, false)
    expect(def.sides).toBe(8)
  })
})

describe('createD10', () => {
  it('returns a DieDefinition with sides=10 for normal d10', () => {
    const def = createD10(DEFAULT_COLORS, false, false)
    expect(def.sides).toBe(10)
  })

  it('returns sides=10 for percentile mode as well', () => {
    const def = createD10(DEFAULT_COLORS, false, true)
    expect(def.sides).toBe(10)
  })
})

describe('createD12', () => {
  it('returns a DieDefinition with sides=12', () => {
    const def = createD12(DEFAULT_COLORS, false)
    expect(def.sides).toBe(12)
  })
})

describe('createD20', () => {
  it('returns a DieDefinition with sides=20', () => {
    const def = createD20(DEFAULT_COLORS, false)
    expect(def.sides).toBe(20)
  })

  it('casts shadow on the mesh', () => {
    const def = createD20(DEFAULT_COLORS, false)
    expect(def.mesh.castShadow).toBe(true)
  })
})
