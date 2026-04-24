import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('cannon-es', () => {
  const MockVec3 = vi.fn(function (x = 0, y = 0, z = 0) {
    return {
      x,
      y,
      z,
      clone: vi.fn().mockReturnThis(),
      setZero: vi.fn(),
      set: vi.fn()
    }
  })

  const MockBody = vi.fn(function (opts: Record<string, unknown> = {}) {
    return {
      position: new MockVec3(0, 5, 0),
      quaternion: {
        setFromEuler: vi.fn(),
        clone: vi.fn().mockReturnThis()
      },
      velocity: new MockVec3(0, 0, 0),
      angularVelocity: new MockVec3(0, 0, 0),
      type: opts.type ?? 1,
      mass: opts.mass ?? 1,
      addShape: vi.fn(),
      sleep: vi.fn()
    }
  })

  const MockWorld = vi.fn(function () {
    return {
      gravity: new MockVec3(0, -40, 0),
      broadphase: null,
      addBody: vi.fn(),
      removeBody: vi.fn(),
      addContactMaterial: vi.fn(),
      step: vi.fn()
    }
  })

  return {
    World: MockWorld,
    Body: MockBody,
    Vec3: MockVec3,
    Plane: vi.fn(function () {
      return {}
    }),
    Box: vi.fn(function () {
      return {}
    }),
    Sphere: vi.fn(function () {
      return {}
    }),
    NaiveBroadphase: vi.fn(function () {
      return {}
    }),
    Material: vi.fn(function (name: string) {
      return { name }
    }),
    ContactMaterial: vi.fn(function (a: unknown, b: unknown, opts: unknown) {
      return { a, b, opts }
    }),
    ConvexPolyhedron: vi.fn(function (opts: unknown) {
      return opts
    }),
    BODY_TYPES: { STATIC: 2, DYNAMIC: 1, KINEMATIC: 4 }
  }
})

vi.mock('three', () => {
  const makeGeo = (vertexCount = 12) => {
    const arr: number[] = []
    for (let i = 0; i < vertexCount * 3; i++) arr.push(Math.random())
    return {
      getAttribute: vi.fn(() => ({
        count: vertexCount,
        getX: (i: number) => arr[i * 3],
        getY: (i: number) => arr[i * 3 + 1],
        getZ: (i: number) => arr[i * 3 + 2]
      })),
      getIndex: vi.fn(() => null)
    }
  }

  return {
    TetrahedronGeometry: vi.fn(function () {
      return makeGeo(12)
    }),
    OctahedronGeometry: vi.fn(function () {
      return makeGeo(24)
    }),
    DodecahedronGeometry: vi.fn(function () {
      return makeGeo(108)
    }),
    IcosahedronGeometry: vi.fn(function () {
      return makeGeo(60)
    }),
    BufferGeometry: vi.fn(function () {
      return makeGeo()
    })
  }
})

import type { DieBody, PhysicsWorld } from './dice-physics'
import { addDieToWorld, createPhysicsWorld, destroyPhysicsWorld } from './dice-physics'

describe('createPhysicsWorld', () => {
  it('returns an object with world, dieBodies, floorBody, walls', () => {
    const pw = createPhysicsWorld()
    expect(pw).toHaveProperty('world')
    expect(pw).toHaveProperty('dieBodies')
    expect(pw).toHaveProperty('floorBody')
    expect(pw).toHaveProperty('walls')
  })

  it('starts with an empty dieBodies array', () => {
    const pw = createPhysicsWorld()
    expect(pw.dieBodies).toHaveLength(0)
  })

  it('creates exactly 4 walls', () => {
    const pw = createPhysicsWorld()
    expect(pw.walls).toHaveLength(4)
  })

  it('adds floor and walls to world', () => {
    const pw = createPhysicsWorld()
    // world.addBody is called: floor + 4 walls = at least 5 times
    expect(pw.world.addBody).toHaveBeenCalled()
  })
})

describe('addDieToWorld', () => {
  let pw: PhysicsWorld

  beforeEach(() => {
    pw = createPhysicsWorld()
  })

  const dieTypes = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100']

  for (const type of dieTypes) {
    it(`adds a ${type} to dieBodies`, () => {
      addDieToWorld(pw, `die-${type}`, type, 1, 0, 1)
      expect(pw.dieBodies).toHaveLength(1)
      expect(pw.dieBodies[0].type).toBe(type)
    })
  }

  it('returns a DieBody with correct id and targetResult', () => {
    const body = addDieToWorld(pw, 'test-id', 'd20', 15, 0, 1)
    expect(body.id).toBe('test-id')
    expect(body.targetResult).toBe(15)
  })

  it('uses a fallback sphere for unknown die types', () => {
    // Should not throw for unknown types
    expect(() => addDieToWorld(pw, 'id', 'unknown', 1, 0, 1)).not.toThrow()
  })

  it('adds to the physics world body list', () => {
    const callsBefore = vi.mocked(pw.world.addBody).mock.calls.length
    addDieToWorld(pw, 'id', 'd6', 3, 0, 1)
    const callsAfter = vi.mocked(pw.world.addBody).mock.calls.length
    expect(callsAfter).toBeGreaterThan(callsBefore)
  })

  it('accumulates multiple dice', () => {
    addDieToWorld(pw, 'die1', 'd6', 1, 0, 3)
    addDieToWorld(pw, 'die2', 'd6', 2, 1, 3)
    addDieToWorld(pw, 'die3', 'd6', 3, 2, 3)
    expect(pw.dieBodies).toHaveLength(3)
  })
})

describe('destroyPhysicsWorld', () => {
  it('removes all die bodies from the world', () => {
    const pw = createPhysicsWorld()
    addDieToWorld(pw, 'die1', 'd6', 1, 0, 2)
    addDieToWorld(pw, 'die2', 'd8', 2, 1, 2)

    destroyPhysicsWorld(pw)

    expect(pw.world.removeBody).toHaveBeenCalled()
    expect(pw.dieBodies).toHaveLength(0)
  })

  it('removes the floor body', () => {
    const pw = createPhysicsWorld()
    destroyPhysicsWorld(pw)
    expect(pw.world.removeBody).toHaveBeenCalledWith(pw.floorBody)
  })

  it('removes all walls', () => {
    const pw = createPhysicsWorld()
    const wallCount = pw.walls.length
    destroyPhysicsWorld(pw)
    const removeCalls = vi.mocked(pw.world.removeBody).mock.calls.length
    // At least wallCount removals for walls (plus floor plus any dice)
    expect(removeCalls).toBeGreaterThanOrEqual(wallCount)
  })
})

describe('DieBody interface', () => {
  it('has id, body, type, targetResult', () => {
    const pw = createPhysicsWorld()
    const die = addDieToWorld(pw, 'abc', 'd20', 17, 0, 1)
    const dieBody: DieBody = die
    expect(dieBody.id).toBe('abc')
    expect(dieBody.type).toBe('d20')
    expect(dieBody.targetResult).toBe(17)
    expect(dieBody.body).toBeDefined()
  })
})
