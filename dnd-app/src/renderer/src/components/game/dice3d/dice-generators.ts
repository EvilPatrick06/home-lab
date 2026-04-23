import * as THREE from 'three'
import { _createSolidMaterial, createFaceMaterials, createWireMaterial } from './dice-textures'
import type { DiceColors, DieDefinition } from './dice-types'

const DIE_SCALE = 1.0

/** Create face materials — solid color for reduced-motion, textured otherwise. */
function makeMaterials(
  faceLabels: string[],
  colors: DiceColors,
  isHidden: boolean,
  solidOnly: boolean
): THREE.MeshStandardMaterial[] {
  if (solidOnly) return faceLabels.map(() => _createSolidMaterial(colors))
  return createFaceMaterials(faceLabels, colors, isHidden)
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

  const nonIndexedGeo = geo.toNonIndexed()
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

  const materials = makeMaterials(faceLabels, colors, isHidden, solidOnly)
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

  const nonIndexedGeo = geo.toNonIndexed()
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
  const materials = makeMaterials(faceLabels, colors, isHidden, solidOnly)
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

  const nonIndexedGeo = baseGeo.toNonIndexed()
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

  const nonIndexedGeo = geo.toNonIndexed()
  const totalVerts = nonIndexedGeo.getAttribute('position').count
  const trisPerFace = totalVerts / (12 * 3) > 1 ? 3 : 1
  const vertsPerFace = trisPerFace * 3

  for (let i = 0; i < 12; i++) {
    nonIndexedGeo.addGroup(i * vertsPerFace, vertsPerFace, i)
  }

  const uvCount = totalVerts
  const uvs = new Float32Array(uvCount * 2)
  for (let f = 0; f < 12; f++) {
    for (let t = 0; t < trisPerFace; t++) {
      const base = (f * vertsPerFace + t * 3) * 2
      uvs[base] = 0.5
      uvs[base + 1] = 1.0
      uvs[base + 2] = 0.0
      uvs[base + 3] = 0.0
      uvs[base + 4] = 1.0
      uvs[base + 5] = 0.0
    }
  }
  nonIndexedGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))

  const faceLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
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

  const nonIndexedGeo = geo.toNonIndexed()
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
  const materials = makeMaterials(faceLabels, colors, isHidden, solidOnly)
  const mesh = new THREE.Mesh(nonIndexedGeo, materials)
  mesh.castShadow = true

  const faceNormals = computeFaceNormalsFromGeo(nonIndexedGeo, 20)

  const wireGeo = new THREE.EdgesGeometry(nonIndexedGeo)
  const wireframe = new THREE.LineSegments(wireGeo, createWireMaterial())

  return { sides: 20, mesh, faceNormals, wireframe }
}
