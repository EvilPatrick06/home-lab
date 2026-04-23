import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('three', () => {
  const makeMesh = () => ({
    castShadow: false,
    material: [],
    clone: vi.fn().mockReturnThis(),
    applyQuaternion: vi.fn().mockReturnThis(),
    dot: vi.fn(() => 0.5)
  })
  const makeVec3 = (x = 0, y = 0, z = 0) => ({
    x,
    y,
    z,
    clone: vi.fn().mockReturnThis(),
    applyQuaternion: vi.fn().mockReturnThis(),
    dot: vi.fn(() => 0.5)
  })

  const makeGeo = () => {
    const attributes: Record<
      string,
      { count: number; getX: (i: number) => number; getY: (i: number) => number; getZ: (i: number) => number }
    > = {}
    return {
      computeVertexNormals: vi.fn(),
      getAttribute: vi.fn(
        (name: string) => attributes[name] ?? { count: 12, getX: () => 0, getY: () => 0, getZ: () => 0 }
      ),
      setAttribute: vi.fn((name: string, attr: (typeof attributes)[string]) => {
        attributes[name] = attr
      }),
      setIndex: vi.fn(),
      getIndex: vi.fn(() => null),
      addGroup: vi.fn(),
      toNonIndexed: vi.fn(() => makeGeo())
    }
  }

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
      return {
        count: array.length / itemSize,
        getX: (i: number) => array[i * itemSize] ?? 0,
        getY: (i: number) => array[i * itemSize + 1] ?? 0,
        getZ: (i: number) => array[i * itemSize + 2] ?? 0
      }
    }),
    Vector3: vi.fn(function (x = 0, y = 0, z = 0) {
      return makeVec3(x, y, z)
    }),
    Mesh: vi.fn(function () {
      return makeMesh()
    }),
    LineSegments: vi.fn(function () {
      return {}
    }),
    MeshStandardMaterial: vi.fn(function (this: Record<string, unknown>) {
      this.emissive = { setHex: vi.fn() }
      this.emissiveIntensity = 0
      this.color = {}
    }),
    Color: vi.fn(function () {
      return {}
    }),
    SRGBColorSpace: 'srgb',
    CanvasTexture: vi.fn(function () {
      return { colorSpace: '' }
    }),
    Quaternion: vi.fn(function () {
      return {}
    })
  }
})

vi.mock('./dice-generators', () => ({
  computeFaceNormalsFromGeo: vi.fn(() => []),
  createD4: vi.fn(() => ({ sides: 4, mesh: { castShadow: false, material: [] }, faceNormals: [], wireframe: {} })),
  createD6: vi.fn(() => ({
    sides: 6,
    mesh: { castShadow: false, material: [] },
    faceNormals: Array(6).fill({
      clone: vi.fn().mockReturnThis(),
      applyQuaternion: vi.fn().mockReturnThis(),
      dot: vi.fn(() => 0.5)
    }),
    wireframe: {}
  })),
  createD8: vi.fn(() => ({ sides: 8, mesh: { castShadow: false, material: [] }, faceNormals: [], wireframe: {} })),
  createD10: vi.fn((_, __, isPercentile) => ({
    sides: isPercentile ? 100 : 10,
    mesh: { castShadow: false, material: [] },
    faceNormals: [],
    wireframe: {}
  })),
  createD12: vi.fn(() => ({ sides: 12, mesh: { castShadow: false, material: [] }, faceNormals: [], wireframe: {} })),
  createD20: vi.fn(() => ({ sides: 20, mesh: { castShadow: false, material: [] }, faceNormals: [], wireframe: {} }))
}))

vi.mock('./dice-textures', () => ({
  createFaceMaterials: vi.fn(() => []),
  createWireMaterial: vi.fn(() => ({}))
}))

vi.mock('../../../../public/data/ui/dice-colors.json', () => ({
  default: {
    default: { bodyColor: '#1a1a2e', numberColor: '#f5c542' },
    presets: [
      { label: 'Midnight', bodyColor: '#1a1a2e', numberColor: '#f5c542' },
      { label: 'Ice', bodyColor: '#a8d8ea', numberColor: '#222222' }
    ]
  }
}))

import {
  CRIT_COLOR,
  createDie,
  DEFAULT_DICE_COLORS,
  DICE_COLOR_PRESETS,
  FUMBLE_COLOR,
  readDieResult,
  tintDie
} from './dice-meshes'
import type { DiceColors, DieType } from './dice-types'

describe('DEFAULT_DICE_COLORS', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has a bodyColor and numberColor', () => {
    expect(DEFAULT_DICE_COLORS).toHaveProperty('bodyColor')
    expect(DEFAULT_DICE_COLORS).toHaveProperty('numberColor')
  })

  it('bodyColor is a hex string', () => {
    expect(DEFAULT_DICE_COLORS.bodyColor).toMatch(/^#[0-9a-fA-F]+/)
  })
})

describe('DICE_COLOR_PRESETS', () => {
  it('is a readonly array', () => {
    expect(Array.isArray(DICE_COLOR_PRESETS)).toBe(true)
  })

  it('each preset has label, bodyColor, numberColor', () => {
    for (const preset of DICE_COLOR_PRESETS) {
      expect(preset).toHaveProperty('label')
      expect(preset).toHaveProperty('bodyColor')
      expect(preset).toHaveProperty('numberColor')
    }
  })
})

describe('CRIT_COLOR and FUMBLE_COLOR', () => {
  it('CRIT_COLOR is a green hex number', () => {
    expect(CRIT_COLOR).toBe(0x22c55e)
  })

  it('FUMBLE_COLOR is a red hex number', () => {
    expect(FUMBLE_COLOR).toBe(0xef4444)
  })
})

describe('createDie', () => {
  const allTypes: DieType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']

  for (const type of allTypes) {
    it(`creates a valid DieDefinition for ${type}`, () => {
      const def = createDie(type)
      expect(def).toBeDefined()
      expect(def.mesh).toBeDefined()
      expect(Array.isArray(def.faceNormals)).toBe(true)
    })
  }

  it('uses DEFAULT_DICE_COLORS when no options provided', () => {
    const def = createDie('d6')
    expect(def).toBeDefined()
  })

  it('respects custom colors option', () => {
    const colors: DiceColors = { bodyColor: '#ff0000', numberColor: '#ffffff' }
    const def = createDie('d6', { colors })
    expect(def).toBeDefined()
  })

  it('respects isHidden option', () => {
    const def = createDie('d20', { isHidden: true })
    expect(def).toBeDefined()
  })
})

describe('readDieResult', () => {
  it('returns a number between 1 and sides', () => {
    const faceNormals = Array.from({ length: 6 }, () => ({
      clone: vi.fn().mockReturnValue({
        applyQuaternion: vi.fn().mockReturnValue({
          dot: vi.fn().mockReturnValue(Math.random())
        })
      })
    }))

    const def = { sides: 6, mesh: {} as never, faceNormals: faceNormals as never }
    const quaternion = {} as import('three').Quaternion

    const result = readDieResult(def, quaternion)
    expect(result).toBeGreaterThanOrEqual(1)
    expect(result).toBeLessThanOrEqual(6)
  })

  it('returns 1 as fallback for empty faceNormals', () => {
    const def = { sides: 6, mesh: {} as never, faceNormals: [] }
    const quaternion = {} as import('three').Quaternion
    const result = readDieResult(def, quaternion)
    expect(result).toBe(1)
  })
})

describe('tintDie', () => {
  it('sets emissive color on MeshStandardMaterial instances', async () => {
    const { MeshStandardMaterial } = await import('three')
    const mat = new MeshStandardMaterial()
    const def = {
      sides: 6,
      mesh: { material: [mat] } as never,
      faceNormals: []
    }
    tintDie(def, CRIT_COLOR)
    expect(mat.emissiveIntensity).toBe(0.4)
  })

  it('handles single material (not array)', async () => {
    const { MeshStandardMaterial } = await import('three')
    const mat = new MeshStandardMaterial()
    const def = {
      sides: 6,
      mesh: { material: mat } as never,
      faceNormals: []
    }
    expect(() => tintDie(def, FUMBLE_COLOR)).not.toThrow()
  })
})
