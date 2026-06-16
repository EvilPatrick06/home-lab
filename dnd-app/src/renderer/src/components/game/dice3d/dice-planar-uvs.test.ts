// PHASE-13 13M — validates buildPlanarFaceUVs with REAL three.js geometry/maths.
// The sibling dice-generators.test.ts / dice-meshes.test.ts mock `three` (no-op Vector3),
// so the actual per-face planar projection can only be exercised against real geometry here.
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { buildPlanarFaceUVs } from './dice-generators'

describe('buildPlanarFaceUVs (PHASE-13 13M planar d12 UVs)', () => {
  // Real dodecahedron: 12 pentagons × 3 sub-triangles × 3 verts = 108 vertices, faces contiguous.
  const geo = new THREE.DodecahedronGeometry(0.75).toNonIndexed()
  const totalVerts = geo.getAttribute('position').count
  const vertsPerFace = totalVerts / 12
  const uvs = buildPlanarFaceUVs(geo, 12, vertsPerFace)

  it('a dodecahedron yields 12 contiguous 9-vertex faces', () => {
    expect(totalVerts).toBe(108)
    expect(vertsPerFace).toBe(9)
  })

  it('produces two UV components per vertex', () => {
    expect(uvs.length).toBe(totalVerts * 2)
  })

  it('keeps every UV within [0,1]', () => {
    for (const x of uvs) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(1)
    }
  })

  it('is NOT the old tiled (0.5,1,0,0,1,0) triangle pattern', () => {
    const firstTriangle = Array.from(uvs.slice(0, 6))
    expect(firstTriangle).not.toEqual([0.5, 1, 0, 0, 1, 0])
  })

  it("gives a face's 3 sub-triangles distinct UV triples (one projection, not tiled)", () => {
    // Face 0 = verts 0..8 → sub-triangles [0,1,2],[3,4,5],[6,7,8].
    const tri = (t: number): string => Array.from(uvs.slice(t * 6, t * 6 + 6)).join(',')
    expect(tri(0)).not.toBe(tri(1))
    expect(tri(1)).not.toBe(tri(2))
    expect(tri(0)).not.toBe(tri(2))
  })

  it('box-normalizes each face to [0.1,0.9] in both axes (number centred, not edge-aligned)', () => {
    let minU = Number.POSITIVE_INFINITY
    let maxU = Number.NEGATIVE_INFINITY
    let minV = Number.POSITIVE_INFINITY
    let maxV = Number.NEGATIVE_INFINITY
    for (let i = 0; i < 9; i++) {
      const u = uvs[i * 2]
      const v = uvs[i * 2 + 1]
      minU = Math.min(minU, u)
      maxU = Math.max(maxU, u)
      minV = Math.min(minV, v)
      maxV = Math.max(maxV, v)
    }
    expect(minU).toBeCloseTo(0.1, 5)
    expect(maxU).toBeCloseTo(0.9, 5)
    expect(minV).toBeCloseTo(0.1, 5)
    expect(maxV).toBeCloseTo(0.9, 5)
  })
})
