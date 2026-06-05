// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock pixi.js before importing the module
vi.mock('pixi.js', () => {
  function makeStage() {
    const children: unknown[] = []
    return { children, addChild: vi.fn((c: unknown) => children.push(c)) }
  }

  const MockContainer = vi.fn(function (this: Record<string, unknown>) {
    this.label = ''
    this.children = []
    this.addChild = vi.fn()
  })

  const MockGraphics = vi.fn(function (this: Record<string, unknown>) {
    this.label = ''
  })

  const MockApplication = vi.fn(function (this: Record<string, unknown>) {
    this.stage = makeStage()
    this.init = vi.fn().mockResolvedValue(undefined)
    this.ticker = { deltaMS: 16, add: vi.fn(), remove: vi.fn() }
  })

  return {
    Application: MockApplication,
    Container: MockContainer,
    Graphics: MockGraphics
  }
})

vi.mock('./weather-overlay', () => ({
  WeatherOverlayLayer: vi.fn(function (this: Record<string, unknown>) {
    this.getContainer = vi.fn(() => ({ label: '' }))
    this.setWeather = vi.fn()
  })
}))

vi.mock('../../../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}))

import type { MapLayers } from './map-pixi-setup'
import { checkWebGLSupport, createMapLayers, initPixiApp, LAYER_Z, waitForContainerDimensions } from './map-pixi-setup'

describe('LAYER_Z (render layer order)', () => {
  it('puts the MAP at the very bottom of the content (above background, below every add-on)', () => {
    const addons = [
      LAYER_Z.grid,
      LAYER_Z.gridLabels,
      LAYER_Z.terrain,
      LAYER_Z.regions,
      LAYER_Z.drawings,
      LAYER_Z.movement,
      LAYER_Z.aoe,
      LAYER_Z.tokens,
      LAYER_Z.occlusion,
      LAYER_Z.pins,
      LAYER_Z.selectionBox,
      LAYER_Z.pings,
      LAYER_Z.fog,
      LAYER_Z.lighting,
      LAYER_Z.walls,
      LAYER_Z.measure,
      LAYER_Z.combat,
      LAYER_Z.audioEmitter
    ]
    for (const z of addons) expect(LAYER_Z.map).toBeLessThan(z)
  })

  it('keeps the core tiers strictly ordered: map < grid < tokens < fog < walls', () => {
    expect(LAYER_Z.map).toBeLessThan(LAYER_Z.grid)
    expect(LAYER_Z.grid).toBeLessThan(LAYER_Z.tokens)
    expect(LAYER_Z.tokens).toBeLessThan(LAYER_Z.fog)
    expect(LAYER_Z.fog).toBeLessThan(LAYER_Z.walls)
  })
})

describe('checkWebGLSupport', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when WebGL is available', () => {
    const mockGl = {
      getExtension: vi.fn(() => ({ loseContext: vi.fn() }))
    }
    const mockCanvas = {
      getContext: vi.fn((type: string) => (type === 'webgl2' ? mockGl : null))
    }
    vi.spyOn(document, 'createElement').mockReturnValueOnce(mockCanvas as unknown as HTMLCanvasElement)

    const result = checkWebGLSupport()
    expect(result).toBeNull()
  })

  it('returns an error message when WebGL is not available', () => {
    const mockCanvas = {
      getContext: vi.fn(() => null)
    }
    vi.spyOn(document, 'createElement').mockReturnValueOnce(mockCanvas as unknown as HTMLCanvasElement)

    const result = checkWebGLSupport()
    expect(result).not.toBeNull()
    expect(typeof result).toBe('string')
    expect(result).toContain('WebGL')
  })

  it('returns an error message when canvas creation throws', () => {
    vi.spyOn(document, 'createElement').mockImplementationOnce(() => {
      throw new Error('canvas not supported')
    })

    const result = checkWebGLSupport()
    expect(result).not.toBeNull()
    expect(result).toContain('WebGL check failed')
  })
})

describe('waitForContainerDimensions', () => {
  it('resolves true when container has non-zero dimensions', async () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { get: () => 800, configurable: true })
    Object.defineProperty(container, 'clientHeight', { get: () => 600, configurable: true })

    const result = await waitForContainerDimensions(container, () => false)
    expect(result).toBe(true)
  })

  it('resolves false when cancelled', async () => {
    const container = document.createElement('div')
    // Container stays at 0×0
    Object.defineProperty(container, 'clientWidth', { get: () => 0, configurable: true })
    Object.defineProperty(container, 'clientHeight', { get: () => 0, configurable: true })

    let callCount = 0
    const result = await waitForContainerDimensions(container, () => {
      callCount++
      return callCount >= 1 // cancel after first check
    })
    expect(result).toBe(false)
  })

  it('resolves false after max attempts with zero dimensions', async () => {
    const container = document.createElement('div')
    Object.defineProperty(container, 'clientWidth', { get: () => 0, configurable: true })
    Object.defineProperty(container, 'clientHeight', { get: () => 0, configurable: true })

    // Mock requestAnimationFrame to call immediately
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      fn(0)
      return 0
    })

    const result = await waitForContainerDimensions(container, () => false)
    expect(result).toBe(false)
  })
})

describe('initPixiApp', () => {
  it('calls app.init with the container and correct settings', async () => {
    const { Application } = await import('pixi.js')
    const app = new (
      Application as unknown as new () => { init: ReturnType<typeof vi.fn>; stage: unknown; ticker: unknown }
    )()
    const container = document.createElement('div')

    await initPixiApp(app as never, container)

    expect(app.init).toHaveBeenCalledOnce()
    const opts = app.init.mock.calls[0][0] as Record<string, unknown>
    expect(opts.resizeTo).toBe(container)
    expect(opts.antialias).toBe(true)
    expect(opts.preference).toBe('webgl')
  })
})

describe('createMapLayers', () => {
  it('returns an object with all expected layer keys', async () => {
    const { Application } = vi.mocked(await import('pixi.js'))
    const app = new (
      Application as unknown as new () => { stage: ReturnType<typeof vi.mocked>; ticker: unknown; init: unknown }
    )()

    const layers = createMapLayers(app as never)

    const expectedKeys: Array<keyof MapLayers> = [
      'world',
      'gridGraphics',
      'terrainOverlay',
      'moveOverlay',
      'aoeOverlay',
      'tokenContainer',
      'pinsContainer',
      'fogGraphics',
      'lightingGraphics',
      'wallGraphics',
      'measureGraphics',
      'weatherOverlay'
    ]

    for (const key of expectedKeys) {
      expect(layers).toHaveProperty(key)
    }
  })

  it('sets labels on all Graphics layers', async () => {
    const { Application } = vi.mocked(await import('pixi.js'))
    const app = new (
      Application as unknown as new () => { stage: ReturnType<typeof vi.mocked>; ticker: unknown; init: unknown }
    )()

    const layers = createMapLayers(app as never)

    expect((layers.gridGraphics as unknown as { label: string }).label).toBe('grid')
    expect((layers.fogGraphics as unknown as { label: string }).label).toBe('fog')
    expect((layers.wallGraphics as unknown as { label: string }).label).toBe('walls')
    expect((layers.lightingGraphics as unknown as { label: string }).label).toBe('lighting')
    expect((layers.measureGraphics as unknown as { label: string }).label).toBe('measure')
    // Phase 16b — the pins layer exists and is labelled.
    expect((layers.pinsContainer as unknown as { label: string }).label).toBe('pins')
  })

  it('world container is added to the stage', async () => {
    const { Application } = vi.mocked(await import('pixi.js'))
    const app = new (
      Application as unknown as new () => { stage: ReturnType<typeof vi.mocked>; ticker: unknown; init: unknown }
    )()

    createMapLayers(app as never)

    expect((app.stage as unknown as { addChild: ReturnType<typeof vi.fn> }).addChild).toHaveBeenCalled()
    const stageAddChild = (app.stage as unknown as { addChild: ReturnType<typeof vi.fn> }).addChild
    const firstCall = stageAddChild.mock.calls[0][0] as { label: string }
    expect(firstCall.label).toBe('world')
  })
})
