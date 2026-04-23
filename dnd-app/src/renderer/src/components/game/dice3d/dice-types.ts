import type * as THREE from 'three'

// ─── Shared dice types (extracted to break circular dependency) ───

export interface DiceColors {
  bodyColor: string // hex e.g. '#1a1a2e'
  numberColor: string // hex e.g. '#f5c542'
}

export interface DieDefinition {
  sides: number
  mesh: THREE.Mesh
  faceNormals: THREE.Vector3[] // one per face value (index 0 -> face "1")
  wireframe?: THREE.LineSegments
}

export type DieType = 'd4' | 'd6' | 'd8' | 'd10' | 'd12' | 'd20' | 'd100'

export interface CreateDieOptions {
  colors?: DiceColors
  isHidden?: boolean
}
