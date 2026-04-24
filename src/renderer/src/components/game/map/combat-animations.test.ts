import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock pixi.js
vi.mock('pixi.js', () => {
  const MockContainer = vi.fn(function () {
    const children: unknown[] = []
    return {
      children,
      addChild: vi.fn((c) => children.push(c)),
      removeChild: vi.fn((c) => {
        const i = children.indexOf(c)
        if (i !== -1) children.splice(i, 1)
      }),
      destroy: vi.fn()
    }
  })

  const MockGraphics = vi.fn(function () {
    return {
      clear: vi.fn().mockReturnThis(),
      circle: vi.fn().mockReturnThis(),
      fill: vi.fn().mockReturnThis(),
      stroke: vi.fn().mockReturnThis(),
      moveTo: vi.fn().mockReturnThis(),
      lineTo: vi.fn().mockReturnThis(),
      setStrokeStyle: vi.fn().mockReturnThis(),
      destroy: vi.fn()
    }
  })

  const MockText = vi.fn(function (opts: { text?: string } = {}) {
    return {
      text: opts.text ?? '',
      anchor: { set: vi.fn() },
      x: 0,
      y: 0,
      alpha: 1,
      scale: { set: vi.fn() },
      style: {},
      destroy: vi.fn()
    }
  })

  return {
    Container: MockContainer,
    Graphics: MockGraphics,
    Text: MockText
  }
})

import type { CombatAnimationEvent, CombatAnimationType } from './combat-animations'
import {
  createCombatAnimationLayer,
  drawTokenStatusRing,
  onCombatAnimation,
  triggerCombatAnimation
} from './combat-animations'

describe('onCombatAnimation / triggerCombatAnimation', () => {
  afterEach(() => {
    // Clean up global listener
    onCombatAnimation(() => {})()
  })

  it('registers a callback and calls it when animation is triggered', () => {
    const cb = vi.fn()
    onCombatAnimation(cb)

    const event: CombatAnimationEvent = { type: 'slash', fromX: 0, fromY: 0, toX: 100, toY: 100 }
    triggerCombatAnimation(event)

    expect(cb).toHaveBeenCalledOnce()
    expect(cb).toHaveBeenCalledWith(event)
  })

  it('does not call the callback after unsubscribe', () => {
    const cb = vi.fn()
    const unsub = onCombatAnimation(cb)
    unsub()

    triggerCombatAnimation({ type: 'heal', fromX: 0, fromY: 0, toX: 50, toY: 50 })
    expect(cb).not.toHaveBeenCalled()
  })

  it('replaces the previous callback when called twice', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()

    onCombatAnimation(cb1)
    onCombatAnimation(cb2)

    triggerCombatAnimation({ type: 'kill', fromX: 0, fromY: 0, toX: 0, toY: 0 })

    expect(cb1).not.toHaveBeenCalled()
    expect(cb2).toHaveBeenCalledOnce()
  })

  it('does not throw when triggerCombatAnimation is called with no listener', () => {
    // ensure no listener is registered
    const unsub = onCombatAnimation(() => {})
    unsub()

    expect(() => triggerCombatAnimation({ type: 'projectile', fromX: 0, fromY: 0, toX: 10, toY: 10 })).not.toThrow()
  })
})

describe('CombatAnimationEvent type', () => {
  it('supports all animation types', () => {
    const types: CombatAnimationType[] = ['slash', 'projectile', 'spell-burst', 'kill', 'heal', 'floating-text']
    for (const type of types) {
      const event: CombatAnimationEvent = { type, fromX: 0, fromY: 0, toX: 10, toY: 10 }
      expect(event.type).toBe(type)
    }
  })

  it('allows optional color field', () => {
    const event: CombatAnimationEvent = { type: 'slash', fromX: 0, fromY: 0, toX: 0, toY: 0, color: 0xff0000 }
    expect(event.color).toBe(0xff0000)
  })

  it('allows optional text and textColor for floating-text', () => {
    const event: CombatAnimationEvent = {
      type: 'floating-text',
      fromX: 0,
      fromY: 0,
      toX: 50,
      toY: 50,
      text: '-10',
      textColor: 0xef4444
    }
    expect(event.text).toBe('-10')
    expect(event.textColor).toBe(0xef4444)
  })
})

describe('drawTokenStatusRing', () => {
  let gfx: {
    clear: ReturnType<typeof vi.fn>
    circle: ReturnType<typeof vi.fn>
    setStrokeStyle: ReturnType<typeof vi.fn>
    stroke: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    gfx = {
      clear: vi.fn().mockReturnThis(),
      circle: vi.fn().mockReturnThis(),
      setStrokeStyle: vi.fn().mockReturnThis(),
      stroke: vi.fn().mockReturnThis()
    }
  })

  it('draws a gray ring when hpPercent is 0 (dead)', () => {
    drawTokenStatusRing(gfx as never, 50, 50, 40, 0)
    const styleCall = gfx.setStrokeStyle.mock.calls[0][0] as { color: number }
    expect(styleCall.color).toBe(0x888888)
  })

  it('draws a red ring when hpPercent <= 0.25 (critical)', () => {
    drawTokenStatusRing(gfx as never, 50, 50, 40, 0.1)
    const styleCall = gfx.setStrokeStyle.mock.calls[0][0] as { color: number }
    expect(styleCall.color).toBe(0xff2222)
  })

  it('draws a yellow ring when hpPercent <= 0.5 (bloodied)', () => {
    drawTokenStatusRing(gfx as never, 50, 50, 40, 0.4)
    const styleCall = gfx.setStrokeStyle.mock.calls[0][0] as { color: number }
    expect(styleCall.color).toBe(0xffcc00)
  })

  it('draws a green ring when healthy (hpPercent > 0.5)', () => {
    drawTokenStatusRing(gfx as never, 50, 50, 40, 1.0)
    const styleCall = gfx.setStrokeStyle.mock.calls[0][0] as { color: number }
    expect(styleCall.color).toBe(0x22cc44)
  })

  it('calls circle and stroke once', () => {
    drawTokenStatusRing(gfx as never, 100, 100, 40, 0.75)
    expect(gfx.circle).toHaveBeenCalledOnce()
    expect(gfx.stroke).toHaveBeenCalledOnce()
  })

  it('ring radius is slightly larger than the token', () => {
    const size = 40
    drawTokenStatusRing(gfx as never, 0, 0, size, 1.0)
    const [, , radius] = gfx.circle.mock.calls[0] as [number, number, number]
    expect(radius).toBeGreaterThan(size / 2)
  })
})

describe('createCombatAnimationLayer', () => {
  it('returns a container and destroy function', () => {
    const mockTicker = { add: vi.fn(), remove: vi.fn(), deltaMS: 16 }
    const mockApp = { ticker: mockTicker } as never

    const { container, destroy } = createCombatAnimationLayer(mockApp)
    expect(container).toBeDefined()
    expect(typeof destroy).toBe('function')
  })

  it('subscribes to the animation ticker', () => {
    const mockTicker = { add: vi.fn(), remove: vi.fn(), deltaMS: 16 }
    const mockApp = { ticker: mockTicker } as never

    createCombatAnimationLayer(mockApp)
    expect(mockTicker.add).toHaveBeenCalledOnce()
  })

  it('unsubscribes and cleans up on destroy', () => {
    const mockTicker = { add: vi.fn(), remove: vi.fn(), deltaMS: 16 }
    const mockApp = { ticker: mockTicker } as never

    const { destroy } = createCombatAnimationLayer(mockApp)
    destroy()
    expect(mockTicker.remove).toHaveBeenCalledOnce()
  })
})
