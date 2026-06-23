import * as THREE from 'three'
import { _createSolidMaterial, createFaceMaterials, createWireMaterial } from './dice-textures'
import type { DiceColors, DieDefinition } from './dice-types'

const DIE_SCALE = 1.0

/** Create face materials — solid color for reduced-motion, textured otherwise. */
function makeMaterials(
  faceLabels: string[],
  colors: DiceColors,
  isHidden: boolean,
  solidOnly: boolean,
  // PHASE-13 13M — texture placement opts forwarded per face (triangular faces use centerV 1/3).
  opts?: { centerV?: number; fontScale?: number }
): THREE.MeshStandardMaterial[] {
  if (solidOnly) return faceLabels.map(() => _createSolidMaterial(colors))
  return createFaceMaterials(faceLabels, colors, isHidden, opts)
}

/**
 * PHASE-13 13M — per-face planar UVs for flat-faced polyhedra (the d12). Projects each
 * face's vertices onto an in-plane orthonormal basis and box-normalizes into [0.1, 0.9],
 * so each pentagon samples the texture ONCE with the number centred — replacing the tiled
 * triangle UVs that drew the texture three times per pentagon. Standard per-face mapping for
 * flat-faced polyhedra (three.js BufferGeometry UV attribute semantics).
 */
export function buildPlanarFaceUVs(geo: THREE.BufferGeometry, faceCount: number, vertsPerFace: number): Float32Array {
  const pos = geo.getAttribute('position')
  const uvs = new Float32Array(faceCount * vertsPerFace * 2)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const u = new THREE.Vector3()
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  const tmp = new THREE.Vector3()

  for (let f = 0; f < faceCount; f++) {
    const start = f * vertsPerFace
    a.fromBufferAttribute(pos, start)
    b.fromBufferAttribute(pos, start + 1)
    c.fromBufferAttribute(pos, start + 2)
    u.subVectors(b, a).normalize() // first in-plane axis
    tmp.subVectors(c, a)
    n.crossVectors(u, tmp).normalize() // face normal
    v.crossVectors(n, u).normalize() // second in-plane axis (orthonormal to u)

    const coords: Array<[number, number]> = []
    let minU = Number.POSITIVE_INFINITY
    let maxU = Number.NEGATIVE_INFINITY
    let minV = Number.POSITIVE_INFINITY
    let maxV = Number.NEGATIVE_INFINITY
    for (let i = 0; i < vertsPerFace; i++) {
      tmp.fromBufferAttribute(pos, start + i).sub(a)
      const pu = tmp.dot(u)
      const pv = tmp.dot(v)
      coords.push([pu, pv])
      if (pu < minU) minU = pu
      if (pu > maxU) maxU = pu
      if (pv < minV) minV = pv
      if (pv > maxV) maxV = pv
    }
    const spanU = maxU - minU || 1
    const spanV = maxV - minV || 1
    for (let i = 0; i < vertsPerFace; i++) {
      const [pu, pv] = coords[i]
      const o = (start + i) * 2
      uvs[o] = 0.1 + 0.8 * ((pu - minU) / spanU)
      uvs[o + 1] = 0.1 + 0.8 * ((pv - minV) / spanV)
    }
  }
  return uvs
}

export function computeFaceNormalsFromGeo(geo: THREE.BufferGeometry, faceCount: number): THREE.Vector3[] {
  const pos = geo.getAttribute('position')
  const normals: THREE.Vector3[] = []
  const totalVerts = pos.count
  const vertsPerFace = Math.floor(totalVerts / faceCount)

  for (let f = 0; f < faceCount; f++) {
    const normal = new THREE.Vector3()
    const tris = Math.floor(vertsPerFace / 3)

    for (let t = 0; t < tris; t++) {
      const base = f * vertsPerFace + t * 3
      if (base + 2 >= totalVerts) break
      const a = new THREE.Vector3().fromBufferAttribute(pos, base)
      const b = new THREE.Vector3().fromBufferAttribute(pos, base + 1)
      const c = new THREE.Vector3().fromBufferAttribute(pos, base + 2)
      const e1 = new THREE.Vector3().subVectors(b, a)
      const e2 = new THREE.Vector3().subVectors(c, a)
      normal.add(new THREE.Vector3().crossVectors(e1, e2))
    }

    normals.push(normal.normalize())
  }

  return normals
}

export function createD4(colors: DiceColors, isHidden: boolean, solidOnly: boolean = false): DieDefinition {
  const radius = 0.8 * DIE_SCALE
  const geo = new THREE.TetrahedronGeometry(radius)
  geo.computeVertexNormals()

  const faceLabels = ['1', '2', '3', '4']

  // Already-non-indexed polyhedra would warn on toNonIndexed(); convert only when indexed.
  const nonIndexedGeo = geo.index ? geo.toNonIndexed() : geo
  for (let i = 0; i < 4; i++) {
    nonIndexedGeo.addGroup(i * 3, 3, i)
  }

  const uvs = new Float32Array(12 * 2)
  for (let f = 0; f < 4; f++) {
    const base = f * 6
    uvs[base] = 0.5
    uvs[base + 1] = 1.0
    uvs[base + 2] = 0.0
    uvs[base + 3] = 0.0
    uvs[base + 4] = 1.0
    uvs[base + 5] = 0.0
  }
  nonIndexedGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))

  // PHASE-13 13M — triangular faces: centroid v=1/3, draw the number there so it sits centred.
  const materials = makeMaterials(faceLabels, colors, isHidden, solidOnly, { centerV: 1 / 3 })
  const mesh = new THREE.Mesh(nonIndexedGeo, materials)
  mesh.castShadow = true

  const faceNormals = computeFaceNormalsFromGeo(nonIndexedGeo, 4)

  const wireGeo = new THREE.EdgesGeometry(nonIndexedGeo)
  const wireframe = new THREE.LineSegments(wireGeo, createWireMaterial())

  return { sides: 4, mesh, faceNormals, wireframe }
}

export function createD6(colors: DiceColors, isHidden: boolean, solidOnly: boolean = false): DieDefinition {
  const size = 0.7 * DIE_SCALE
  const geo = new THREE.BoxGeometry(size, size, size)

  const faceMap = [4, 3, 5, 2, 1, 6]
  const faceLabels = faceMap.map(String)

  const materials = makeMaterials(faceLabels, colors, isHidden, solidOnly)
  const mesh = new THREE.Mesh(geo, materials)
  mesh.castShadow = true

  const faceNormals = [
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, -1)
  ]

  const wireGeo = new THREE.EdgesGeometry(geo)
  const wireframe = new THREE.LineSegments(wireGeo, createWireMaterial())

  return { sides: 6, mesh, faceNormals, wireframe }
}

export function createD8(colors: DiceColors, isHidden: boolean, solidOnly: boolean = false): DieDefinition {
  const radius = 0.75 * DIE_SCALE
  const geo = new THREE.OctahedronGeometry(radius)

  // Already-non-indexed polyhedra would warn on toNonIndexed(); convert only when indexed.
  const nonIndexedGeo = geo.index ? geo.toNonIndexed() : geo
  for (let i = 0; i < 8; i++) {
    nonIndexedGeo.addGroup(i * 3, 3, i)
  }

  const uvs = new Float32Array(24 * 2)
  for (let f = 0; f < 8; f++) {
    const base = f * 6
    uvs[base] = 0.5
    uvs[base + 1] = 1.0
    uvs[base + 2] = 0.0
    uvs[base + 3] = 0.0
    uvs[base + 4] = 1.0
    uvs[base + 5] = 0.0
  }
  nonIndexedGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))

  const faceLabels = ['1', '2', '3', '4', '5', '6', '7', '8']
  // PHASE-13 13M — triangular faces: centroid v=1/3, draw the number there so it sits centred.
  const materials = makeMaterials(faceLabels, colors, isHidden, solidOnly, { centerV: 1 / 3 })
  const mesh = new THREE.Mesh(nonIndexedGeo, materials)
  mesh.castShadow = true

  const faceNormals = computeFaceNormalsFromGeo(nonIndexedGeo, 8)

  const wireGeo = new THREE.EdgesGeometry(nonIndexedGeo)
  const wireframe = new THREE.LineSegments(wireGeo, createWireMaterial())

  return { sides: 8, mesh, faceNormals, wireframe }
}

export function createD10(
  colors: DiceColors,
  isHidden: boolean,
  isPercentile: boolean = false,
  solidOnly: boolean = false
): DieDefinition {
  const radius = 0.7 * DIE_SCALE
  const vertices: number[] = []
  const indices: number[] = []

  const topY = radius * 0.9
  const botY = -radius * 0.9
  const upperY = radius * 0.3
  const lowerY = -radius * 0.3
  const ringR = radius * 0.85

  vertices.push(0, topY, 0)
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2
    vertices.push(Math.cos(angle) * ringR, upperY, Math.sin(angle) * ringR)
  }
  for (let i = 0; i < 5; i++) {
    const angle = ((i + 0.5) / 5) * Math.PI * 2
    vertices.push(Math.cos(angle) * ringR, lowerY, Math.sin(angle) * ringR)
  }
  vertices.push(0, botY, 0)

  for (let i = 0; i < 5; i++) {
    const u0 = 1 + i
    const u1 = 1 + ((i + 1) % 5)
    const l0 = 6 + i
    indices.push(0, u0, l0)
    indices.push(0, l0, u1)
  }
  for (let i = 0; i < 5; i++) {
    const l0 = 6 + i
    const l1 = 6 + ((i + 1) % 5)
    const u1 = 1 + ((i + 1) % 5)
    indices.push(11, l0, l1)
    indices.push(11, l1, u1)
  }

  const baseGeo = new THREE.BufferGeometry()
  baseGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  baseGeo.setIndex(indices)
  baseGeo.computeVertexNormals()

  const nonIndexedGeo = baseGeo.index ? baseGeo.toNonIndexed() : baseGeo
  for (let i = 0; i < 10; i++) {
    nonIndexedGeo.addGroup(i * 6, 6, i)
  }

  const uvs = new Float32Array(60 * 2)
  for (let f = 0; f < 10; f++) {
    const base = f * 12
    uvs[base] = 0.5
    uvs[base + 1] = 1.0
    uvs[base + 2] = 0.0
    uvs[base + 3] = 0.5
    uvs[base + 4] = 0.5
    uvs[base + 5] = 0.0
    uvs[base + 6] = 0.5
    uvs[base + 7] = 1.0
    uvs[base + 8] = 0.5
    uvs[base + 9] = 0.0
    uvs[base + 10] = 1.0
    uvs[base + 11] = 0.5
  }
  nonIndexedGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))

  const faceLabels = isPercentile
    ? ['00', '10', '20', '30', '40', '50', '60', '70', '80', '90']
    : ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

  const materials = makeMaterials(faceLabels, colors, isHidden, solidOnly)
  const mesh = new THREE.Mesh(nonIndexedGeo, materials)
  mesh.castShadow = true

  const faceNormals = computeFaceNormalsFromGeo(nonIndexedGeo, 10)

  const wireGeo = new THREE.EdgesGeometry(nonIndexedGeo)
  const wireframe = new THREE.LineSegments(wireGeo, createWireMaterial())

  return { sides: 10, mesh, faceNormals, wireframe }
}

export function createD12(colors: DiceColors, isHidden: boolean, solidOnly: boolean = false): DieDefinition {
  const radius = 0.75 * DIE_SCALE
  const geo = new THREE.DodecahedronGeometry(radius)

  // Already-non-indexed polyhedra would warn on toNonIndexed(); convert only when indexed.
  const nonIndexedGeo = geo.index ? geo.toNonIndexed() : geo
  const totalVerts = nonIndexedGeo.getAttribute('position').count
  const trisPerFace = totalVerts / (12 * 3) > 1 ? 3 : 1
  const vertsPerFace = trisPerFace * 3

  for (let i = 0; i < 12; i++) {
    nonIndexedGeo.addGroup(i * vertsPerFace, vertsPerFace, i)
  }

  // PHASE-13 13M — planar per-face UVs so each pentagon samples the texture ONCE with the
  // number centred, replacing the tiled triangle UVs that drew it three times per face.
  const uvs = buildPlanarFaceUVs(nonIndexedGeo, 12, vertsPerFace)
  nonIndexedGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))

  const faceLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
  // d12 keeps centre placement — planar UVs box-normalize the number to the pentagon centroid.
  const materials = makeMaterials(faceLabels, colors, isHidden, solidOnly)
  const mesh = new THREE.Mesh(nonIndexedGeo, materials)
  mesh.castShadow = true

  const faceNormals = computeFaceNormalsFromGeo(nonIndexedGeo, 12)

  const wireGeo = new THREE.EdgesGeometry(nonIndexedGeo)
  const wireframe = new THREE.LineSegments(wireGeo, createWireMaterial())

  return { sides: 12, mesh, faceNormals, wireframe }
}

export function createD20(colors: DiceColors, isHidden: boolean, solidOnly: boolean = false): DieDefinition {
  const radius = 0.8 * DIE_SCALE
  const geo = new THREE.IcosahedronGeometry(radius)

  // Already-non-indexed polyhedra would warn on toNonIndexed(); convert only when indexed.
  const nonIndexedGeo = geo.index ? geo.toNonIndexed() : geo
  for (let i = 0; i < 20; i++) {
    nonIndexedGeo.addGroup(i * 3, 3, i)
  }

  const uvs = new Float32Array(60 * 2)
  for (let f = 0; f < 20; f++) {
    const base = f * 6
    uvs[base] = 0.5
    uvs[base + 1] = 1.0
    uvs[base + 2] = 0.0
    uvs[base + 3] = 0.0
    uvs[base + 4] = 1.0
    uvs[base + 5] = 0.0
  }
  nonIndexedGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))

  const faceLabels = Array.from({ length: 20 }, (_, i) => String(i + 1))
  // PHASE-13 13M — triangular faces: centroid v=1/3; createDieTexture shrinks 2-digit labels
  // (0.26·size) so they stay inside the smaller inscribed circle.
  const materials = makeMaterials(faceLabels, colors, isHidden, solidOnly, { centerV: 1 / 3 })
  const mesh = new THREE.Mesh(nonIndexedGeo, materials)
  mesh.castShadow = true

  const faceNormals = computeFaceNormalsFromGeo(nonIndexedGeo, 20)

  const wireGeo = new THREE.EdgesGeometry(nonIndexedGeo)
  const wireframe = new THREE.LineSegments(wireGeo, createWireMaterial())

  return { sides: 20, mesh, faceNormals, wireframe }
}
