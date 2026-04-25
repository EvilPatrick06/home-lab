import { useCallback, useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { CreateDieOptions, DiceColors, DieDefinition, DieType } from './dice-meshes'
import { CRIT_COLOR, createDie, DEFAULT_DICE_COLORS, FUMBLE_COLOR, readDieResult, tintDie } from './dice-meshes'
import {
  addDieToWorld,
  createPhysicsWorld,
  destroyPhysicsWorld,
  type PhysicsWorld,
  runSimulation
} from './dice-physics'

/** Free GPU memory for meshes removed from the scene (geometries, materials, textures). */
function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
      o.geometry?.dispose()
      const m = o.material
      if (Array.isArray(m)) {
        for (const mat of m) disposeOneMaterial(mat)
      } else if (m) {
        disposeOneMaterial(m)
      }
    }
  })
}

function disposeOneMaterial(m: THREE.Material): void {
  const any = m as THREE.MeshStandardMaterial & { map?: THREE.Texture | null }
  any.map?.dispose()
  m.dispose()
}

// ─── Types ────────────────────────────────────────────────────

export interface DiceRollRequest {
  dice: Array<{ type: DieType; count: number }>
  results: number[] // predetermined results (from actual roll)
  formula: string
  onComplete?: () => void
  isHidden?: boolean
  colors?: DiceColors
}

interface DiceRendererProps {
  rollRequest: DiceRollRequest | null
  width: number
  height: number
  onAnimationComplete: (results?: { formula: string; rolls: number[]; total: number }) => void
}

// ─── Component ────────────────────────────────────────────────

export default function DiceRenderer({
  rollRequest,
  width,
  height,
  onAnimationComplete
}: DiceRendererProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const animFrameRef = useRef(0)
  const physicsRef = useRef<PhysicsWorld | null>(null)
  const simRef = useRef<{ stop: () => void } | null>(null)
  const diceDefsRef = useRef<Map<string, DieDefinition>>(new Map())
  const floorRef = useRef<THREE.Mesh | null>(null)
  const settledRef = useRef(false)

  // ── Setup Three.js scene (once) ──────────────────────────

  useEffect(() => {
    if (!containerRef.current) return

    const scene = new THREE.Scene()
    sceneRef.current = scene

    const aspect = width > 0 && height > 0 ? width / height : 16 / 9
    const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100)
    camera.position.set(0, 8, 6)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.setClearColor(0x000000, 0)
    rendererRef.current = renderer

    containerRef.current.appendChild(renderer.domElement)

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5)
    scene.add(ambientLight)

    const dirLight = new THREE.DirectionalLight(0xfff4e0, 1.2)
    dirLight.position.set(3, 10, 5)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.width = 1024
    dirLight.shadow.mapSize.height = 1024
    dirLight.shadow.camera.near = 0.5
    dirLight.shadow.camera.far = 25
    dirLight.shadow.camera.left = -6
    dirLight.shadow.camera.right = 6
    dirLight.shadow.camera.top = 6
    dirLight.shadow.camera.bottom = -6
    scene.add(dirLight)

    const rimLight = new THREE.PointLight(0xf5c542, 0.6, 20)
    rimLight.position.set(-4, 5, -3)
    scene.add(rimLight)

    // Invisible floor for shadows
    const floorGeo = new THREE.PlaneGeometry(12, 12)
    const floorMat = new THREE.ShadowMaterial({ opacity: 0.3 })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    scene.add(floor)
    floorRef.current = floor

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      simRef.current?.stop()
      if (physicsRef.current) destroyPhysicsWorld(physicsRef.current)
      physicsRef.current = null
      diceDefsRef.current.forEach((def) => {
        disposeObject3D(def.mesh)
        if (def.wireframe) disposeObject3D(def.wireframe)
      })
      diceDefsRef.current.clear()
      const f = floorRef.current
      if (f) {
        f.geometry?.dispose()
        if (f.material) disposeOneMaterial(f.material as THREE.Material)
        floorRef.current = null
      }
      renderer.dispose()
      renderer.domElement.remove()
      scene.clear()
    }
  }, [height, width])

  // ── Resize handler ──

  useEffect(() => {
    if (!rendererRef.current || !cameraRef.current || width === 0 || height === 0) return
    rendererRef.current.setSize(width, height)
    cameraRef.current.aspect = width / height
    cameraRef.current.updateProjectionMatrix()
  }, [width, height])

  // ── Roll animation ────────────────────────────────────────

  const clearDice = useCallback(() => {
    const scene = sceneRef.current
    if (!scene) return

    diceDefsRef.current.forEach((def) => {
      disposeObject3D(def.mesh)
      scene.remove(def.mesh)
      if (def.wireframe) {
        disposeObject3D(def.wireframe)
        scene.remove(def.wireframe)
      }
    })
    diceDefsRef.current.clear()

    if (physicsRef.current) {
      destroyPhysicsWorld(physicsRef.current)
      physicsRef.current = null
    }
    simRef.current?.stop()
    simRef.current = null
  }, [])

  useEffect(() => {
    if (!rollRequest || !sceneRef.current) return

    clearDice()
    settledRef.current = false

    const scene = sceneRef.current
    const pw = createPhysicsWorld()
    physicsRef.current = pw

    // Expand dice array into individual die entries
    interface DieEntry {
      type: DieType
      result: number
      id: string
    }
    const dieEntries: DieEntry[] = []
    let resultIndex = 0
    for (const diceGroup of rollRequest.dice) {
      for (let i = 0; i < diceGroup.count; i++) {
        const result = rollRequest.results[resultIndex] ?? 1
        const id = `die-${resultIndex}`
        dieEntries.push({ type: diceGroup.type, result, id })
        resultIndex++
      }
    }

    // Create die options
    const dieOptions: CreateDieOptions = {
      colors: rollRequest.colors || DEFAULT_DICE_COLORS,
      isHidden: rollRequest.isHidden || false
    }

    // Create meshes and physics bodies
    for (let i = 0; i < dieEntries.length; i++) {
      const entry = dieEntries[i]
      const def = createDie(entry.type, dieOptions)

      if (def.wireframe) {
        def.mesh.add(def.wireframe)
      }

      scene.add(def.mesh)
      diceDefsRef.current.set(entry.id, def)

      addDieToWorld(pw, entry.id, entry.type, entry.result, i, dieEntries.length)
    }

    // Run physics simulation
    const sim = runSimulation(pw, {
      onStep: (bodies) => {
        for (const b of bodies) {
          const def = diceDefsRef.current.get(b.id)
          if (!def) continue

          def.mesh.position.set(b.position.x, b.position.y, b.position.z)
          def.mesh.quaternion.set(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w)
        }
      },
      onSettled: () => {
        settledRef.current = true

        // Read face results and apply highlights
        const readResults: number[] = []
        for (const entry of dieEntries) {
          const def = diceDefsRef.current.get(entry.id)
          if (!def) {
            readResults.push(entry.result)
            continue
          }

          const faceResult = readDieResult(def, def.mesh.quaternion)
          readResults.push(faceResult)

          // Tint nat 20 green, nat 1 red (only for non-hidden rolls)
          if (!rollRequest.isHidden && entry.type === 'd20') {
            if (faceResult === 20 || entry.result === 20) {
              tintDie(def, CRIT_COLOR)
            } else if (faceResult === 1 || entry.result === 1) {
              tintDie(def, FUMBLE_COLOR)
            }
          }
        }

        // Keep dice visible for a moment, then signal completion
        setTimeout(() => {
          const resultData = {
            formula: rollRequest.formula,
            rolls: rollRequest.results,
            total: rollRequest.results.reduce((a, b) => a + b, 0)
          }
          onAnimationComplete(resultData)
          rollRequest.onComplete?.()
        }, 1500)
      }
    })
    simRef.current = sim

    // Render loop
    const renderLoop = (): void => {
      if (!rendererRef.current || !cameraRef.current || !sceneRef.current) return
      rendererRef.current.render(sceneRef.current, cameraRef.current)
      animFrameRef.current = requestAnimationFrame(renderLoop)
    }
    animFrameRef.current = requestAnimationFrame(renderLoop)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      sim.stop()
    }
  }, [rollRequest, clearDice, onAnimationComplete])

  return <div ref={containerRef} style={{ width, height, pointerEvents: 'none' }} />
}
