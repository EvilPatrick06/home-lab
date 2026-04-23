import { describe, expect, it, vi } from 'vitest'

// Mock all imported modules that use pixi.js, stores, or browser APIs
vi.mock('../../../stores/use-game-store', () => ({
  useGameStore: vi.fn(() => null)
}))

vi.mock('../../../services/map/vision-computation', () => ({
  recomputeVision: vi.fn(() => ({ visibleCells: [] }))
}))

vi.mock('../../../data/light-sources', () => ({
  LIGHT_SOURCES: {}
}))

vi.mock('./aoe-overlay', () => ({
  clearAoEOverlay: vi.fn(),
  drawAoEOverlay: vi.fn()
}))

vi.mock('./fog-overlay', () => ({
  destroyFogAnimation: vi.fn(),
  drawFogOfWar: vi.fn(),
  initFogAnimation: vi.fn()
}))

vi.mock('./grid-layer', () => ({
  drawGrid: vi.fn()
}))

vi.mock('./lighting-overlay', () => ({
  drawLightingOverlay: vi.fn()
}))

vi.mock('./movement-overlay', () => ({
  clearMovementOverlay: vi.fn(),
  drawMovementOverlay: vi.fn(),
  drawTerrainOverlay: vi.fn()
}))

vi.mock('./wall-layer', () => ({
  drawWalls: vi.fn()
}))

vi.mock('./weather-overlay', () => ({
  presetToWeatherType: vi.fn(() => null),
  WeatherOverlayLayer: vi.fn(() => ({ setWeather: vi.fn(), getContainer: vi.fn(() => ({ label: '' })) }))
}))

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return { ...actual, useEffect: vi.fn() }
})

import type { OverlayRefs } from './map-overlay-effects'

describe('OverlayRefs interface', () => {
  it('has the correct shape with all required refs', () => {
    const mockRef = <T>(val: T): React.RefObject<T> => ({ current: val })
    const mockMutRef = <T>(val: T): React.MutableRefObject<T> => ({ current: val })

    const refs: OverlayRefs = {
      containerRef: mockRef(null),
      appRef: mockRef(null),
      gridGraphicsRef: mockRef(null),
      fogGraphicsRef: mockRef(null),
      wallGraphicsRef: mockRef(null),
      lightingGraphicsRef: mockRef(null),
      terrainOverlayRef: mockRef(null),
      aoeOverlayRef: mockRef(null),
      moveOverlayRef: mockRef(null),
      weatherOverlayRef: mockRef(null),
      bgSpriteRef: mockRef(null),
      zoomRef: mockMutRef(1),
      panRef: mockMutRef({ x: 0, y: 0 })
    }

    expect(refs.containerRef.current).toBeNull()
    expect(refs.zoomRef.current).toBe(1)
    expect(refs.panRef.current).toEqual({ x: 0, y: 0 })
  })
})

describe('map-overlay-effects — module exports', () => {
  it('exports useMapOverlayEffects as a function', async () => {
    const mod = await import('./map-overlay-effects')
    expect(typeof mod.useMapOverlayEffects).toBe('function')
  })
})
