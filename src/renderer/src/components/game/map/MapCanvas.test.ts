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
  lazy: vi.fn(() => vi.fn()),
  Suspense: vi.fn(),
  createContext: vi.fn(() => ({ Provider: vi.fn() }))
}))

vi.mock('pixi.js/unsafe-eval', () => ({}))

vi.mock('pixi.js', () => ({
  Application: vi.fn(),
  Assets: { load: vi.fn() },
  Container: vi.fn(),
  Graphics: vi.fn(),
  Sprite: vi.fn()
}))

vi.mock('../../../data/light-sources', () => ({
  LIGHT_SOURCES: {}
}))

vi.mock('../../../services/map/map-utils', () => ({
  calculateZoomToFit: vi.fn(),
  getGridLabel: vi.fn()
}))

vi.mock('../../../services/map/vision-computation', () => ({
  buildVisionSet: vi.fn(),
  getLightingAtPoint: vi.fn(),
  isTokenInVisionSet: vi.fn()
}))

vi.mock('../../../stores/use-game-store', () => ({
  useGameStore: Object.assign(
    vi.fn(() => null),
    { getState: vi.fn(() => ({ ambientLight: 'bright', activeLightSources: [] })) }
  )
}))

vi.mock('../../../utils/logger', () => ({
  logger: { debug: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('./aoe-overlay', () => ({}))
vi.mock('./audio-emitter-overlay', () => ({ AudioEmitterLayer: vi.fn() }))
vi.mock('./combat-animations', () => ({
  createCombatAnimationLayer: vi.fn(() => ({ container: {}, destroy: vi.fn() }))
}))
vi.mock('./fog-overlay', () => ({ destroyFogAnimation: vi.fn() }))
vi.mock('./map-event-handlers', () => ({
  createWheelHandler: vi.fn(() => vi.fn(() => vi.fn())),
  setupKeyboardPan: vi.fn(() => vi.fn()),
  setupMouseHandlers: vi.fn(() => vi.fn())
}))
vi.mock('./map-overlay-effects', () => ({ useMapOverlayEffects: vi.fn() }))
vi.mock('./map-pixi-setup', () => ({
  checkWebGLSupport: vi.fn(),
  createMapLayers: vi.fn(() => ({
    world: {},
    gridGraphics: {},
    terrainOverlay: {},
    regionGraphics: {},
    moveOverlay: {},
    aoeOverlay: {},
    tokenContainer: {},
    fogGraphics: {},
    lightingGraphics: {},
    wallGraphics: {},
    measureGraphics: {},
    weatherOverlay: {}
  })),
  initPixiApp: vi.fn(),
  waitForContainerDimensions: vi.fn()
}))
vi.mock('./measurement-tool', () => ({ clearMeasurement: vi.fn() }))
vi.mock('./token-sprite', () => ({ createTokenSprite: vi.fn() }))
vi.mock('./weather-overlay', () => ({}))
vi.mock('./FloorSelector', () => ({ default: vi.fn() }))

describe('MapCanvas', () => {
  it('can be imported', async () => {
    const mod = await import('./MapCanvas')
    expect(mod).toBeDefined()
  })

  it('exports a default function', async () => {
    const mod = await import('./MapCanvas')
    expect(typeof mod.default).toBe('function')
  })

  it('re-exports map-utils functions', async () => {
    const mod = await import('./MapCanvas')
    expect(mod.calculateZoomToFit).toBeDefined()
    expect(mod.getGridLabel).toBeDefined()
  })
})
