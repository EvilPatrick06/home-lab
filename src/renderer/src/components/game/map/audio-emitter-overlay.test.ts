import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock pixi.js
vi.mock('pixi.js', () => {
  const MockContainer = vi.fn(function () {
    const children: unknown[] = []
    return {
      label: '',
      children,
      addChild: vi.fn((child) => children.push(child)),
      removeChild: vi.fn((child) => {
        const idx = children.indexOf(child)
        if (idx !== -1) children.splice(idx, 1)
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
      destroy: vi.fn()
    }
  })

  const MockText = vi.fn(function (opts: { text?: string } = {}) {
    return {
      text: opts.text ?? '',
      anchor: { set: vi.fn() },
      x: 0,
      y: 0,
      destroy: vi.fn()
    }
  })

  const MockTextStyle = vi.fn(function () {
    return {}
  })

  return {
    Container: MockContainer,
    Graphics: MockGraphics,
    Text: MockText,
    TextStyle: MockTextStyle
  }
})

import type { AudioEmitter } from './audio-emitter-overlay'
import { AudioEmitterLayer } from './audio-emitter-overlay'

function makeEmitter(overrides: Partial<AudioEmitter> = {}): AudioEmitter {
  return {
    id: 'emitter-1',
    x: 2,
    y: 3,
    soundId: 'ambient-forest',
    displayName: 'Forest',
    radius: 5,
    volume: 0.8,
    spatial: true,
    playing: false,
    ...overrides
  }
}

describe('AudioEmitterLayer', () => {
  let layer: AudioEmitterLayer

  beforeEach(() => {
    layer = new AudioEmitterLayer()
  })

  it('getContainer returns the PixiJS container', () => {
    const container = layer.getContainer()
    expect(container).toBeDefined()
    expect(container.label).toBe('audioEmitters')
  })

  it('setCellSize updates the internal cell size', () => {
    expect(() => layer.setCellSize(60)).not.toThrow()
  })

  it('updateEmitters adds new emitters', () => {
    const emitter = makeEmitter()
    layer.updateEmitters([emitter])
    const container = layer.getContainer()
    expect(container.addChild).toHaveBeenCalled()
  })

  it('updateEmitters removes emitters no longer in the list', () => {
    const emitter = makeEmitter()
    layer.updateEmitters([emitter])
    const container = layer.getContainer()
    const addCallsBefore = vi.mocked(container.addChild).mock.calls.length

    layer.updateEmitters([]) // remove all
    expect(container.removeChild).toHaveBeenCalled()
    // Verify children were added before removal
    expect(addCallsBefore).toBeGreaterThan(0)
  })

  it('updateEmitters updates existing emitters without re-adding them', () => {
    const emitter = makeEmitter()
    layer.updateEmitters([emitter])
    const container = layer.getContainer()
    const callCount = vi.mocked(container.addChild).mock.calls.length

    // Update same emitter
    layer.updateEmitters([{ ...emitter, playing: true }])
    // addChild should not have been called again for the same id
    expect(vi.mocked(container.addChild).mock.calls.length).toBe(callCount)
  })

  it('destroy cleans up all emitters and container', () => {
    const emitter = makeEmitter()
    layer.updateEmitters([emitter])
    layer.destroy()
    const container = layer.getContainer()
    expect(container.destroy).toHaveBeenCalled()
  })
})

describe('AudioEmitterLayer.calculateSpatialVolume', () => {
  const emitter = makeEmitter({ x: 5, y: 5, radius: 4, volume: 1.0, spatial: true })

  it('returns full volume for a non-spatial emitter', () => {
    const nonSpatial = { ...emitter, spatial: false }
    const vol = AudioEmitterLayer.calculateSpatialVolume(nonSpatial, 0, 0, 40)
    expect(vol).toBe(nonSpatial.volume)
  })

  it('returns 0 when token is at or beyond radius', () => {
    // Token at (5 + 4 + 1, 5) = (10, 5) — beyond radius 4
    const vol = AudioEmitterLayer.calculateSpatialVolume(emitter, 10, 5, 40)
    expect(vol).toBe(0)
  })

  it('returns max volume when token is at emitter position', () => {
    const vol = AudioEmitterLayer.calculateSpatialVolume(emitter, emitter.x, emitter.y, 40)
    expect(vol).toBeCloseTo(1.0, 1)
  })

  it('returns partial volume for intermediate distance', () => {
    // Token at (5, 5+2) — distance 2, radius 4 → factor = 0.5
    const vol = AudioEmitterLayer.calculateSpatialVolume(emitter, 5, 7, 40)
    expect(vol).toBeGreaterThan(0)
    expect(vol).toBeLessThan(1)
  })

  it('volume decreases with distance', () => {
    const close = AudioEmitterLayer.calculateSpatialVolume(emitter, emitter.x + 1, emitter.y, 40)
    const far = AudioEmitterLayer.calculateSpatialVolume(emitter, emitter.x + 3, emitter.y, 40)
    expect(close).toBeGreaterThan(far)
  })
})

describe('AudioEmitter interface', () => {
  it('satisfies the full shape', () => {
    const e: AudioEmitter = {
      id: 'e1',
      x: 0,
      y: 0,
      soundId: 'rain',
      displayName: 'Rain',
      radius: 3,
      volume: 0.5,
      spatial: false,
      playing: true
    }
    expect(e.id).toBe('e1')
    expect(e.spatial).toBe(false)
    expect(e.playing).toBe(true)
  })
})
