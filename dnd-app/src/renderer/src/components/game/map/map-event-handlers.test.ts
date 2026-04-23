// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../stores/use-game-store', () => ({
  useGameStore: {
    getState: vi.fn(() => ({
      pendingPlacement: null,
      setPendingPlacement: vi.fn(),
      commitPlacement: vi.fn(),
      ambientLight: 'bright',
      activeLightSources: []
    }))
  }
}))

vi.mock('../../../services/combat/combat-rules', () => ({
  canMoveToPosition: vi.fn(() => ({ allowed: true }))
}))

vi.mock('./measurement-tool', () => ({
  drawMeasurement: vi.fn()
}))

vi.mock('./wall-layer', () => ({
  findNearbyWallEndpoint: vi.fn(() => null)
}))

vi.mock('pixi.js', () => ({
  Graphics: vi.fn(() => ({
    clear: vi.fn().mockReturnThis(),
    circle: vi.fn().mockReturnThis(),
    fill: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    alpha: 1
  }))
}))

import type { DragState, MapEventRefs } from './map-event-handlers'
import { createWheelHandler, handleTokenRightClick } from './map-event-handlers'

function makeRef<T>(current: T): React.MutableRefObject<T> {
  return { current }
}

describe('createWheelHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns a function that attaches wheel listener to an element', () => {
    const zoomRef = makeRef(1.0)
    const panRef = makeRef({ x: 0, y: 0 })
    const applyTransform = vi.fn()

    const attachFn = createWheelHandler({ zoom: zoomRef, pan: panRef }, applyTransform)
    expect(typeof attachFn).toBe('function')

    const el = document.createElement('div')
    vi.spyOn(el, 'addEventListener')
    const cleanup = attachFn(el)
    expect(el.addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: false })
    expect(typeof cleanup).toBe('function')
  })

  it('zoom increases on scroll up (deltaY < 0)', () => {
    const zoomRef = makeRef(1.0)
    const panRef = makeRef({ x: 0, y: 0 })
    const applyTransform = vi.fn()

    const attachFn = createWheelHandler({ zoom: zoomRef, pan: panRef }, applyTransform)
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 600 } as DOMRect)

    const handlers: { wheel?: (e: WheelEvent) => void } = {}
    el.addEventListener = vi.fn((event, handler) => {
      if (event === 'wheel') handlers.wheel = handler as (e: WheelEvent) => void
    })

    attachFn(el)

    const event = new WheelEvent('wheel', { deltaY: -100, clientX: 400, clientY: 300 })
    handlers.wheel!(event)

    expect(zoomRef.current).toBeGreaterThan(1.0)
    expect(applyTransform).toHaveBeenCalled()
  })

  it('zoom decreases on scroll down (deltaY > 0)', () => {
    const zoomRef = makeRef(1.0)
    const panRef = makeRef({ x: 0, y: 0 })
    const applyTransform = vi.fn()

    const attachFn = createWheelHandler({ zoom: zoomRef, pan: panRef }, applyTransform)
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 600 } as DOMRect)

    const handlers: { wheel?: (e: WheelEvent) => void } = {}
    el.addEventListener = vi.fn((event, handler) => {
      if (event === 'wheel') handlers.wheel = handler as (e: WheelEvent) => void
    })

    attachFn(el)
    const event = new WheelEvent('wheel', { deltaY: 100, clientX: 400, clientY: 300 })
    handlers.wheel!(event)

    expect(zoomRef.current).toBeLessThan(1.0)
  })

  it('zoom clamps to minimum 0.25', () => {
    const zoomRef = makeRef(0.26)
    const panRef = makeRef({ x: 0, y: 0 })
    const applyTransform = vi.fn()

    const attachFn = createWheelHandler({ zoom: zoomRef, pan: panRef }, applyTransform)
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 600 } as DOMRect)

    const handlers: { wheel?: (e: WheelEvent) => void } = {}
    el.addEventListener = vi.fn((event, handler) => {
      if (event === 'wheel') handlers.wheel = handler as (e: WheelEvent) => void
    })

    attachFn(el)
    // Trigger many scroll-down events
    for (let i = 0; i < 20; i++) {
      handlers.wheel!(new WheelEvent('wheel', { deltaY: 1000, clientX: 0, clientY: 0 }))
    }

    expect(zoomRef.current).toBeGreaterThanOrEqual(0.25)
  })

  it('zoom clamps to maximum 4', () => {
    const zoomRef = makeRef(3.9)
    const panRef = makeRef({ x: 0, y: 0 })
    const applyTransform = vi.fn()

    const attachFn = createWheelHandler({ zoom: zoomRef, pan: panRef }, applyTransform)
    const el = document.createElement('div')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 800, height: 600 } as DOMRect)

    const handlers: { wheel?: (e: WheelEvent) => void } = {}
    el.addEventListener = vi.fn((event, handler) => {
      if (event === 'wheel') handlers.wheel = handler as (e: WheelEvent) => void
    })

    attachFn(el)
    for (let i = 0; i < 20; i++) {
      handlers.wheel!(new WheelEvent('wheel', { deltaY: -1000, clientX: 0, clientY: 0 }))
    }

    expect(zoomRef.current).toBeLessThanOrEqual(4)
  })

  it('cleanup function removes the wheel listener', () => {
    const zoomRef = makeRef(1.0)
    const panRef = makeRef({ x: 0, y: 0 })
    const applyTransform = vi.fn()

    const attachFn = createWheelHandler({ zoom: zoomRef, pan: panRef }, applyTransform)
    const el = document.createElement('div')
    vi.spyOn(el, 'removeEventListener')

    const cleanup = attachFn(el)
    cleanup()
    expect(el.removeEventListener).toHaveBeenCalledWith('wheel', expect.any(Function))
  })
})

describe('handleTokenRightClick', () => {
  it('calls onTokenContextMenu with correct screen coordinates', () => {
    const onTokenContextMenu = vi.fn()
    const token = { id: 'tok-1' } as never
    const canvas = document.createElement('canvas')
    const container = document.createElement('div')
    container.appendChild(canvas)

    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 200,
      width: 800,
      height: 600
    } as DOMRect)

    handleTokenRightClick(
      { stopPropagation: vi.fn(), global: { x: 50, y: 75 } },
      token,
      'map-1',
      container,
      onTokenContextMenu
    )

    expect(onTokenContextMenu).toHaveBeenCalledWith(150, 275, token, 'map-1')
  })

  it('does not call onTokenContextMenu if not provided', () => {
    const token = { id: 'tok-1' } as never
    expect(() => {
      handleTokenRightClick({ stopPropagation: vi.fn(), global: { x: 0, y: 0 } }, token, 'map-1', null)
    }).not.toThrow()
  })

  it('does not call onTokenContextMenu if canvas is missing', () => {
    const onTokenContextMenu = vi.fn()
    const container = document.createElement('div')
    // No canvas child
    handleTokenRightClick(
      { stopPropagation: vi.fn(), global: { x: 0, y: 0 } },
      {} as never,
      'map-1',
      container,
      onTokenContextMenu
    )
    expect(onTokenContextMenu).not.toHaveBeenCalled()
  })
})

describe('DragState interface', () => {
  it('satisfies shape with all required fields', () => {
    const drag: DragState = {
      tokenId: 'tok-abc',
      startGridX: 3,
      startGridY: 4,
      offsetX: 0.5,
      offsetY: 0.5
    }
    expect(drag.tokenId).toBe('tok-abc')
    expect(drag.startGridX).toBe(3)
    expect(drag.startGridY).toBe(4)
  })
})

describe('MapEventRefs interface', () => {
  it('satisfies shape with all required ref fields', () => {
    const refs: MapEventRefs = {
      zoom: makeRef(1.0),
      pan: makeRef({ x: 0, y: 0 }),
      isPanning: makeRef(false),
      panStart: makeRef({ x: 0, y: 0 }),
      spaceHeld: makeRef(false),
      drag: makeRef(null),
      isFogPainting: makeRef(false),
      lastFogCell: makeRef(null),
      measureStart: makeRef(null),
      wallStart: makeRef(null),
      ghost: makeRef(null),
      world: makeRef(null),
      tokenContainer: makeRef(null),
      measureGraphics: makeRef(null),
      wallGraphics: makeRef(null)
    }
    expect(refs.zoom.current).toBe(1.0)
    expect(refs.pan.current.x).toBe(0)
    expect(refs.isPanning.current).toBe(false)
    expect(refs.drag.current).toBeNull()
  })
})
