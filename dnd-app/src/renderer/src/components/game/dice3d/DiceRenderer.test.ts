import { describe, expect, it, vi } from 'vitest'

vi.mock('react', () => ({
  default: { createElement: vi.fn(), memo: vi.fn((c) => c), forwardRef: vi.fn((c) => c), lazy: vi.fn() },
  useState: vi.fn(() => [null, vi.fn()]),
  useEffect: vi.fn(),
  useCallback: vi.fn((fn) => fn),
  useMemo: vi.fn((fn) => fn()),
  useRef: vi.fn(() => ({ current: null })),
  memo: vi.fn((c) => c),
  forwardRef: vi.fn((c) => c),
  createContext: vi.fn(() => ({ Provider: vi.fn() }))
}))

vi.mock('three', () => ({
  Scene: vi.fn(),
  PerspectiveCamera: vi.fn(() => ({ position: { set: vi.fn() }, lookAt: vi.fn() })),
  WebGLRenderer: vi.fn(() => ({
    setSize: vi.fn(),
    setPixelRatio: vi.fn(),
    setClearColor: vi.fn(),
    dispose: vi.fn(),
    render: vi.fn(),
    domElement: { remove: vi.fn() },
    shadowMap: { enabled: false, type: null }
  })),
  AmbientLight: vi.fn(),
  DirectionalLight: vi.fn(() => ({
    position: { set: vi.fn() },
    castShadow: false,
    shadow: {
      mapSize: { width: 0, height: 0 },
      camera: { near: 0, far: 0, left: 0, right: 0, top: 0, bottom: 0 }
    }
  })),
  PointLight: vi.fn(() => ({ position: { set: vi.fn() } })),
  PlaneGeometry: vi.fn(),
  ShadowMaterial: vi.fn(),
  Mesh: vi.fn(() => ({ rotation: { x: 0 }, receiveShadow: false })),
  PCFSoftShadowMap: 2
}))

vi.mock('./dice-meshes', () => ({
  CRIT_COLOR: '#00ff00',
  createDie: vi.fn(),
  DEFAULT_DICE_COLORS: { bodyColor: '#1a1a2e', numberColor: '#e0e0e0' },
  FUMBLE_COLOR: '#ff0000',
  readDieResult: vi.fn(),
  tintDie: vi.fn()
}))

vi.mock('./dice-physics', () => ({
  addDieToWorld: vi.fn(),
  createPhysicsWorld: vi.fn(),
  destroyPhysicsWorld: vi.fn(),
  runSimulation: vi.fn(() => ({ stop: vi.fn() }))
}))

describe('DiceRenderer', () => {
  it('can be imported', async () => {
    const mod = await import('./DiceRenderer')
    expect(mod).toBeDefined()
  })

  it('exports a default function', async () => {
    const mod = await import('./DiceRenderer')
    expect(typeof mod.default).toBe('function')
  })
})
