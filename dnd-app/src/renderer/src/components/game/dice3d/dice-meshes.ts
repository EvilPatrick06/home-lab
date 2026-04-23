import diceColorsJson from '@data/ui/dice-colors.json'
import * as THREE from 'three'
import { load5eDiceColors } from '../../../services/data-provider'
import {
  computeFaceNormalsFromGeo as genComputeFaceNormals,
  createD4 as genD4,
  createD6 as genD6,
  createD8 as genD8,
  createD10 as genD10,
  createD12 as genD12,
  createD20 as genD20
} from './dice-generators'
import type { SimulationCallbacks } from './dice-physics'

type _SimulationCallbacks = SimulationCallbacks

import { _createSolidMaterial, createFaceMaterials, createWireMaterial } from './dice-textures'

// ─── Constants ────────────────────────────────────────────────

const DIE_SCALE = 1.0

// ─── Types ────────────────────────────────────────────────────

export interface DiceColors {
  bodyColor: string // hex e.g. '#1a1a2e'
  numberColor: string // hex e.g. '#f5c542'
}

export const DEFAULT_DICE_COLORS: DiceColors = diceColorsJson.default

/** Load dice color definitions from the data store (includes plugin additions). */
export async function loadDiceColorData(): Promise<unknown> {
  return load5eDiceColors()
}

export const DICE_COLOR_PRESETS = diceColorsJson.presets as readonly {
  label: string
  bodyColor: string
  numberColor: string
}[]

export interface DieDefinition {
  sides: number
  mesh: THREE.Mesh
  faceNormals: THREE.Vector3[] // one per face value (index 0 → face "1")
  wireframe?: THREE.LineSegments
}

export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100'

// ─── Internal Mesh Helpers ────────────────────────────────────

/**
 * Assigns per-face material groups on a non-indexed geometry where each face
 * is made up of `vertsPerFace` consecutive vertices.
 */
function assignFaceGroups(geo: THREE.BufferGeometry, faceCount: number, vertsPerFace = 3): void {
  for (let i = 0; i < faceCount; i++) {
    geo.addGroup(i * vertsPerFace, vertsPerFace, i)
  }
}

/**
 * Builds a flat UV array for `faceCount` triangular faces where each triangle
 * uses the standard equilateral-triangle UV layout (top, bottom-left, bottom-right).
 * Returns a Float32Array ready to be set as the 'uv' attribute.
 */
function buildTriangleFaceUVs(faceCount: number): Float32Array {
  const uvs = new Float32Array(faceCount * 6)
  for (let f = 0; f < faceCount; f++) {
    const base = f * 6
    uvs[base] = 0.5
    uvs[base + 1] = 1.0 // top
    uvs[base + 2] = 0.0
    uvs[base + 3] = 0.0 // bottom-left
    uvs[base + 4] = 1.0
    uvs[base + 5] = 0.0 // bottom-right
  }
  return uvs
}

/**
 * Creates a wireframe LineSegments overlay for a given geometry.
 */
function buildWireframe(geo: THREE.BufferGeometry): THREE.LineSegments {
  return new THREE.LineSegments(new THREE.EdgesGeometry(geo), createWireMaterial())
}

/**
 * Converts a geometry to non-indexed form, assigns face groups (one group per
 * `faceCount` triangular faces), sets triangle UVs, creates materials and mesh,
 * and builds a wireframe — all in one call for simple triangular-face dice.
 */
function buildTriangularFaceDie(
  geo: THREE.BufferGeometry,
  faceCount: number,
  faceLabels: string[],
  sides: number,
  colors: DiceColors,
  isHidden: boolean,
  solidOnly: boolean = false
): DieDefinition {
  const nonIndexedGeo = geo.toNonIndexed()
  assignFaceGroups(nonIndexedGeo, faceCount)
  nonIndexedGeo.setAttribute('uv', new THREE.Float32BufferAttribute(buildTriangleFaceUVs(faceCount), 2))

  const materials = solidOnly
    ? faceLabels.map(() => _createSolidMaterial(colors))
    : createFaceMaterials(faceLabels, colors, isHidden)
  const mesh = new THREE.Mesh(nonIndexedGeo, materials)
  mesh.castShadow = true

  const faceNormals = computeFaceNormalsFromGeo(nonIndexedGeo, faceCount)
  const wireframe = buildWireframe(nonIndexedGeo)

  return { sides, mesh, faceNormals, wireframe }
}

// ─── D4 (Tetrahedron) ────────────────────────────────────────
// D4 corner-number: each face shows the number at the TOP vertex

function _createD4(colors: DiceColors, isHidden: boolean): DieDefinition {
  const radius = 0.8 * DIE_SCALE
  const geo = new THREE.TetrahedronGeometry(radius)
  geo.computeVertexNormals()
  // D4: result = face pointing DOWN (resting face) — value on top vertex
  return buildTriangularFaceDie(geo, 4, ['1', '2', '3', '4'], 4, colors, isHidden)
}

// ─── D6 (Cube) ───────────────────────────────────────────────

function _createD6(colors: DiceColors, isHidden: boolean): DieDefinition {
  const size = 0.7 * DIE_SCALE
  const geo = new THREE.BoxGeometry(size, size, size)

  // BoxGeometry has 6 groups (one per face) by default
  // Face order: +x, -x, +y, -y, +z, -z — standard die opposite faces sum to 7
  const faceMap = [4, 3, 5, 2, 1, 6] // +x=4, -x=3, +y=5, -y=2, +z=1, -z=6
  const faceLabels = faceMap.map(String)

  const materials = createFaceMaterials(faceLabels, colors, isHidden)
  const mesh = new THREE.Mesh(geo, materials)
  mesh.castShadow = true

  // Face normals for reading results
  const faceNormals = [
    new THREE.Vector3(0, 0, 1), // 1 (front, +z)
    new THREE.Vector3(0, -1, 0), // 2 (bottom, -y)
    new THREE.Vector3(-1, 0, 0), // 3 (left, -x)
    new THREE.Vector3(1, 0, 0), // 4 (right, +x)
    new THREE.Vector3(0, 1, 0), // 5 (top, +y)
    new THREE.Vector3(0, 0, -1) // 6 (back, -z)
  ]

  return { sides: 6, mesh, faceNormals, wireframe: buildWireframe(geo) }
}

// ─── D8 (Octahedron) ─────────────────────────────────────────

function _createD8(colors: DiceColors, isHidden: boolean): DieDefinition {
  const radius = 0.75 * DIE_SCALE
  const geo = new THREE.OctahedronGeometry(radius)
  return buildTriangularFaceDie(geo, 8, ['1', '2', '3', '4', '5', '6', '7', '8'], 8, colors, isHidden)
}

// ─── D10 (Pentagonal Trapezohedron) ──────────────────────────

function _createD10(colors: DiceColors, isHidden: boolean, isPercentile: boolean = false): DieDefinition {
  const radius = 0.7 * DIE_SCALE
  const vertices: number[] = []
  const indices: number[] = []

  // Geometry: top apex, upper ring (5), lower ring (5), bottom apex
  const topY = radius * 0.9
  const botY = -radius * 0.9
  const upperY = radius * 0.3
  const lowerY = -radius * 0.3
  const ringR = radius * 0.85

  // Vertex 0: top apex
  vertices.push(0, topY, 0)
  // Vertices 1-5: upper ring
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2
    vertices.push(Math.cos(angle) * ringR, upperY, Math.sin(angle) * ringR)
  }
  // Vertices 6-10: lower ring (offset by 36°)
  for (let i = 0; i < 5; i++) {
    const angle = ((i + 0.5) / 5) * Math.PI * 2
    vertices.push(Math.cos(angle) * ringR, lowerY, Math.sin(angle) * ringR)
  }
  // Vertex 11: bottom apex
  vertices.push(0, botY, 0)

  // 10 kite faces, each split into 2 triangles
  // Upper 5 kites
  for (let i = 0; i < 5; i++) {
    const u0 = 1 + i
    const u1 = 1 + ((i + 1) % 5)
    const l0 = 6 + i
    indices.push(0, u0, l0)
    indices.push(0, l0, u1)
  }
  // Lower 5 kites
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

  // Convert to non-indexed for per-face materials
  const nonIndexedGeo = baseGeo.toNonIndexed()
  // 10 faces × 2 triangles = 20 triangles × 3 verts = 60 vertices
  for (let i = 0; i < 10; i++) {
    nonIndexedGeo.addGroup(i * 6, 6, i)
  }

  // UVs for each kite (2 triangles per face)
  const uvs = new Float32Array(60 * 2)
  for (let f = 0; f < 10; f++) {
    const base = f * 12
    // Triangle 1
    uvs[base] = 0.5
    uvs[base + 1] = 1.0
    uvs[base + 2] = 0.0
    uvs[base + 3] = 0.5
    uvs[base + 4] = 0.5
    uvs[base + 5] = 0.0
    // Triangle 2
    uvs[base + 6] = 0.5
    uvs[base + 7] = 1.0
    uvs[base + 8] = 0.5
    uvs[base + 9] = 0.0
    uvs[base + 10] = 1.0
    uvs[base + 11] = 0.5
  }
  nonIndexedGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))

  // D10 labels: 0-9 for units, 00-90 for percentile (tens)
  const faceLabels = isPercentile
    ? ['00', '10', '20', '30', '40', '50', '60', '70', '80', '90']
    : ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

  const materials = createFaceMaterials(faceLabels, colors, isHidden)
  const mesh = new THREE.Mesh(nonIndexedGeo, materials)
  mesh.castShadow = true

  const faceNormals = computeFaceNormalsFromGeo(nonIndexedGeo, 10)

  return { sides: 10, mesh, faceNormals, wireframe: buildWireframe(nonIndexedGeo) }
}

// ─── D12 (Dodecahedron) ──────────────────────────────────────

function _createD12(colors: DiceColors, isHidden: boolean): DieDefinition {
  const radius = 0.75 * DIE_SCALE
  const geo = new THREE.DodecahedronGeometry(radius)

  const nonIndexedGeo = geo.toNonIndexed()
  // Dodecahedron: 12 pentagonal faces → each tessellated to 3 triangles = 36 triangles
  const totalVerts = nonIndexedGeo.getAttribute('position').count
  const trisPerFace = totalVerts / (12 * 3) > 1 ? 3 : 1
  const vertsPerFace = trisPerFace * 3

  assignFaceGroups(nonIndexedGeo, 12, vertsPerFace)

  // UVs — same triangle UV pattern tiled across all sub-triangles per face
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
  const materials = createFaceMaterials(faceLabels, colors, isHidden)
  const mesh = new THREE.Mesh(nonIndexedGeo, materials)
  mesh.castShadow = true

  const faceNormals = computeFaceNormalsFromGeo(nonIndexedGeo, 12)

  return { sides: 12, mesh, faceNormals, wireframe: buildWireframe(nonIndexedGeo) }
}

// ─── D20 (Icosahedron) ───────────────────────────────────────

function _createD20(colors: DiceColors, isHidden: boolean): DieDefinition {
  const radius = 0.8 * DIE_SCALE
  const geo = new THREE.IcosahedronGeometry(radius)
  return buildTriangularFaceDie(
    geo,
    20,
    Array.from({ length: 20 }, (_, i) => String(i + 1)),
    20,
    colors,
    isHidden
  )
}

// ─── Face normal extraction ──────────────────────────────────

/** Delegates to dice-generators for face normal computation. */
function computeFaceNormalsFromGeo(geo: THREE.BufferGeometry, faceCount: number): THREE.Vector3[] {
  return genComputeFaceNormals(geo, faceCount)
}

// ─── Die creation API ────────────────────────────────────────

export interface CreateDieOptions {
  colors?: DiceColors
  isHidden?: boolean
  /** When true, use a solid-color material instead of textured face labels (reduced-motion fast path). */
  solidOnly?: boolean
}

export function createDie(type: DieType, options: CreateDieOptions = {}): DieDefinition {
  const colors = options.colors || DEFAULT_DICE_COLORS
  const isHidden = options.isHidden || false
  const solidOnly = options.solidOnly || false

  // Delegate to dice-generators for geometry creation
  switch (type) {
    case 'd4':
      return genD4(colors, isHidden, solidOnly)
    case 'd6':
      return genD6(colors, isHidden, solidOnly)
    case 'd8':
      return genD8(colors, isHidden, solidOnly)
    case 'd10':
      return genD10(colors, isHidden, false, solidOnly)
    case 'd12':
      return genD12(colors, isHidden, solidOnly)
    case 'd20':
      return genD20(colors, isHidden, solidOnly)
    case 'd100':
      return genD10(colors, isHidden, true, solidOnly)
  }
}

// ─── Read face result from orientation ────────────────────────

/**
 * Given a die definition and its current quaternion, determine which face
 * value is pointing UP (highest dot product with world UP vector).
 * For d4, we read the bottom face instead.
 */
export function readDieResult(def: DieDefinition, quaternion: THREE.Quaternion): number {
  const up = new THREE.Vector3(0, 1, 0)

  // For D4, the result is printed at the TOP of the resting face
  // The resting face is the one pointing DOWN
  const isD4 = def.sides === 4

  let bestValue = 1
  let bestDot = isD4 ? Infinity : -Infinity

  for (let i = 0; i < def.faceNormals.length; i++) {
    const normal = def.faceNormals[i].clone().applyQuaternion(quaternion)
    const dot = normal.dot(up)

    if (isD4) {
      if (dot < bestDot) {
        bestDot = dot
        bestValue = i + 1
      }
    } else {
      if (dot > bestDot) {
        bestDot = dot
        bestValue = i + 1
      }
    }
  }

  return bestValue
}

// ─── Color helpers ────────────────────────────────────────────

/** Tint a die with crit/fumble highlight */
export function tintDie(def: DieDefinition, color: number): void {
  const materials = Array.isArray(def.mesh.material) ? def.mesh.material : [def.mesh.material]

  for (const mat of materials) {
    if (mat instanceof THREE.MeshStandardMaterial) {
      mat.emissive.setHex(color)
      mat.emissiveIntensity = 0.4
    }
  }
}

/** Highlight color for nat 20 / crit */
export const CRIT_COLOR = 0x22c55e // green-500
export const FUMBLE_COLOR = 0xef4444 // red-500
