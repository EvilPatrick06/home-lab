import * as CANNON from 'cannon-es'
import * as THREE from 'three'

// ─── Constants ────────────────────────────────────────────────

const GRAVITY = -40
const FLOOR_Y = 0
const WALL_DISTANCE = 4
const WALL_HEIGHT = 3
const DIE_MASS = 1
const RESTITUTION = 0.3
const FRICTION = 0.6
const LINEAR_DAMPING = 0.3
const ANGULAR_DAMPING = 0.3
const SETTLE_THRESHOLD = 0.05
const SETTLE_FRAMES = 15
const MAX_SETTLE_TIME = 4000

// ─── Types ────────────────────────────────────────────────────

export interface DieBody {
  id: string
  body: CANNON.Body
  type: string
  targetResult: number
}

export interface PhysicsWorld {
  world: CANNON.World
  dieBodies: DieBody[]
  floorBody: CANNON.Body
  walls: CANNON.Body[]
}

export interface SimulationCallbacks {
  onStep: (bodies: Array<{ id: string; position: CANNON.Vec3; quaternion: CANNON.Quaternion }>) => void
  onSettled: () => void
}

// ─── ConvexPolyhedron from Three.js geometry ─────────────────

function geometryToConvexPolyhedron(geometry: THREE.BufferGeometry): CANNON.ConvexPolyhedron {
  const pos = geometry.getAttribute('position')

  // Collect unique vertices (deduplicate by rounding)
  const vertMap = new Map<string, number>()
  const vertices: CANNON.Vec3[] = []
  const vertexIndexMap: number[] = [] // maps original vert index → deduplicated index

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    // Round to avoid floating point duplicates
    const key = `${Math.round(x * 1000)},${Math.round(y * 1000)},${Math.round(z * 1000)}`

    if (vertMap.has(key)) {
      vertexIndexMap.push(vertMap.get(key)!)
    } else {
      const idx = vertices.length
      vertMap.set(key, idx)
      vertices.push(new CANNON.Vec3(x, y, z))
      vertexIndexMap.push(idx)
    }
  }

  // Build faces from geometry groups or sequential triangles
  const faces: number[][] = []
  const index = geometry.getIndex()

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      const a = vertexIndexMap[index.getX(i)]
      const b = vertexIndexMap[index.getX(i + 1)]
      const c = vertexIndexMap[index.getX(i + 2)]
      faces.push([a, b, c])
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      const a = vertexIndexMap[i]
      const b = vertexIndexMap[i + 1]
      const c = vertexIndexMap[i + 2]
      faces.push([a, b, c])
    }
  }

  return new CANNON.ConvexPolyhedron({ vertices, faces })
}

// ─── Predefined polyhedron shapes ────────────────────────────

function createTetrahedronShape(radius: number): CANNON.ConvexPolyhedron {
  const geo = new THREE.TetrahedronGeometry(radius)
  return geometryToConvexPolyhedron(geo)
}

function createOctahedronShape(radius: number): CANNON.ConvexPolyhedron {
  const geo = new THREE.OctahedronGeometry(radius)
  return geometryToConvexPolyhedron(geo)
}

function createD10Shape(radius: number): CANNON.ConvexPolyhedron {
  // Match the D10 visual geometry from DiceMeshes
  const vertices: CANNON.Vec3[] = []
  const topY = radius * 0.9
  const botY = -radius * 0.9
  const upperY = radius * 0.3
  const lowerY = -radius * 0.3
  const ringR = radius * 0.85

  vertices.push(new CANNON.Vec3(0, topY, 0))
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2
    vertices.push(new CANNON.Vec3(Math.cos(angle) * ringR, upperY, Math.sin(angle) * ringR))
  }
  for (let i = 0; i < 5; i++) {
    const angle = ((i + 0.5) / 5) * Math.PI * 2
    vertices.push(new CANNON.Vec3(Math.cos(angle) * ringR, lowerY, Math.sin(angle) * ringR))
  }
  vertices.push(new CANNON.Vec3(0, botY, 0))

  const faces: number[][] = []
  // Upper kite faces (each as 2 triangles)
  for (let i = 0; i < 5; i++) {
    const u0 = 1 + i
    const u1 = 1 + ((i + 1) % 5)
    const l0 = 6 + i
    faces.push([0, u0, l0])
    faces.push([0, l0, u1])
  }
  // Lower kite faces
  for (let i = 0; i < 5; i++) {
    const l0 = 6 + i
    const l1 = 6 + ((i + 1) % 5)
    const u1 = 1 + ((i + 1) % 5)
    faces.push([11, l0, l1])
    faces.push([11, l1, u1])
  }

  return new CANNON.ConvexPolyhedron({ vertices, faces })
}

function createDodecahedronShape(radius: number): CANNON.ConvexPolyhedron {
  const geo = new THREE.DodecahedronGeometry(radius)
  return geometryToConvexPolyhedron(geo)
}

function createIcosahedronShape(radius: number): CANNON.ConvexPolyhedron {
  const geo = new THREE.IcosahedronGeometry(radius)
  return geometryToConvexPolyhedron(geo)
}

// ─── Shape factories for each die type ────────────────────────

function createDieShape(type: string): CANNON.Shape {
  switch (type) {
    case 'd4':
      return createTetrahedronShape(0.8)
    case 'd6':
      return new CANNON.Box(new CANNON.Vec3(0.35, 0.35, 0.35))
    case 'd8':
      return createOctahedronShape(0.75)
    case 'd10':
    case 'd100':
      return createD10Shape(0.7)
    case 'd12':
      return createDodecahedronShape(0.75)
    case 'd20':
      return createIcosahedronShape(0.8)
    default:
      return new CANNON.Sphere(0.4)
  }
}

// ─── Create physics world ─────────────────────────────────────

export function createPhysicsWorld(): PhysicsWorld {
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, GRAVITY, 0)
  })
  world.broadphase = new CANNON.NaiveBroadphase()

  const dieMaterial = new CANNON.Material('die')
  const floorMaterial = new CANNON.Material('floor')

  world.addContactMaterial(
    new CANNON.ContactMaterial(dieMaterial, floorMaterial, {
      friction: FRICTION,
      restitution: RESTITUTION
    })
  )
  world.addContactMaterial(
    new CANNON.ContactMaterial(dieMaterial, dieMaterial, {
      friction: FRICTION,
      restitution: RESTITUTION * 0.5
    })
  )

  // Floor
  const floorBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Plane(),
    material: floorMaterial,
    position: new CANNON.Vec3(0, FLOOR_Y, 0)
  })
  floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
  world.addBody(floorBody)

  // Walls
  const walls: CANNON.Body[] = []
  const wallPositions = [
    { pos: new CANNON.Vec3(WALL_DISTANCE, WALL_HEIGHT / 2, 0), rot: [0, 0, Math.PI / 2] as const },
    { pos: new CANNON.Vec3(-WALL_DISTANCE, WALL_HEIGHT / 2, 0), rot: [0, 0, -Math.PI / 2] as const },
    { pos: new CANNON.Vec3(0, WALL_HEIGHT / 2, WALL_DISTANCE), rot: [Math.PI / 2, 0, 0] as const },
    { pos: new CANNON.Vec3(0, WALL_HEIGHT / 2, -WALL_DISTANCE), rot: [-Math.PI / 2, 0, 0] as const }
  ]
  for (const w of wallPositions) {
    const wallBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: floorMaterial,
      position: w.pos
    })
    wallBody.quaternion.setFromEuler(w.rot[0], w.rot[1], w.rot[2])
    world.addBody(wallBody)
    walls.push(wallBody)
  }

  return { world, dieBodies: [], floorBody, walls }
}

// ─── Add a die to the world ───────────────────────────────────

export function addDieToWorld(
  pw: PhysicsWorld,
  id: string,
  type: string,
  targetResult: number,
  index: number,
  totalDice: number
): DieBody {
  const shape = createDieShape(type)

  const spread = Math.min(totalDice, 6)
  const angle = (index / spread) * Math.PI * 2
  const radius = 1.0 + (totalDice > 3 ? 0.5 : 0)
  const startX = Math.cos(angle) * radius + (Math.random() - 0.5) * 0.3
  const startZ = Math.sin(angle) * radius + (Math.random() - 0.5) * 0.3
  const startY = 5 + Math.random() * 2

  const body = new CANNON.Body({
    mass: DIE_MASS,
    shape,
    position: new CANNON.Vec3(startX, startY, startZ),
    linearDamping: LINEAR_DAMPING,
    angularDamping: ANGULAR_DAMPING,
    material: new CANNON.Material('die')
  })

  // Random initial rotation
  body.quaternion.setFromEuler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2)

  // Random initial velocity
  body.velocity.set((Math.random() - 0.5) * 8, -2 + Math.random() * 3, (Math.random() - 0.5) * 8)

  // Randomized angular velocity for natural tumbling
  const angSpeed = 15 + Math.random() * 15
  body.angularVelocity.set(
    (Math.random() - 0.5) * angSpeed,
    (Math.random() - 0.5) * angSpeed,
    (Math.random() - 0.5) * angSpeed
  )

  pw.world.addBody(body)

  const dieBody: DieBody = { id, body, type, targetResult }
  pw.dieBodies.push(dieBody)

  return dieBody
}

// ─── Run simulation ───────────────────────────────────────────

export function runSimulation(pw: PhysicsWorld, callbacks: SimulationCallbacks): { stop: () => void } {
  const timeStep = 1 / 60
  let settleCounter = 0
  let elapsed = 0
  let stopped = false
  let animFrame = 0

  function step(): void {
    if (stopped) return

    pw.world.step(timeStep)
    elapsed += timeStep * 1000

    callbacks.onStep(
      pw.dieBodies.map((d) => ({
        id: d.id,
        position: d.body.position.clone(),
        quaternion: d.body.quaternion.clone()
      }))
    )

    const allSettled = pw.dieBodies.every((d) => {
      const linSpeed = d.body.velocity.length()
      const angSpeed = d.body.angularVelocity.length()
      return linSpeed < SETTLE_THRESHOLD && angSpeed < SETTLE_THRESHOLD
    })

    if (allSettled) {
      settleCounter++
    } else {
      settleCounter = 0
    }

    if (settleCounter >= SETTLE_FRAMES || elapsed >= MAX_SETTLE_TIME) {
      for (const d of pw.dieBodies) {
        d.body.velocity.setZero()
        d.body.angularVelocity.setZero()
        d.body.type = CANNON.BODY_TYPES.STATIC
      }
      callbacks.onSettled()
      stopped = true
      return
    }

    animFrame = requestAnimationFrame(step)
  }

  animFrame = requestAnimationFrame(step)

  return {
    stop: () => {
      stopped = true
      cancelAnimationFrame(animFrame)
    }
  }
}

// ─── Cleanup ──────────────────────────────────────────────────

export function destroyPhysicsWorld(pw: PhysicsWorld): void {
  for (const d of pw.dieBodies) {
    pw.world.removeBody(d.body)
  }
  pw.world.removeBody(pw.floorBody)
  for (const w of pw.walls) {
    pw.world.removeBody(w)
  }
  pw.dieBodies = []
}
