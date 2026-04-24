import { describe, expect, it, vi } from 'vitest'
import type { MapToken, SceneRegion } from '../../types/map'
import {
  detectRegionEvents,
  executeRegionAction,
  getRegionsAtPoint,
  pointInRegionShape,
  processTokenRegionTriggers,
  type RegionActionContext
} from './region-detection'

// ─── Helpers ───────────────────────────────────────────────────

function makeToken(overrides: Partial<MapToken> = {}): MapToken {
  return {
    id: 'tok-1',
    entityId: 'ent-1',
    entityType: 'player',
    label: 'TestHero',
    gridX: 0,
    gridY: 0,
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    conditions: [],
    ...overrides
  }
}

function makeRegion(overrides: Partial<SceneRegion> = {}): SceneRegion {
  return {
    id: 'region-1',
    name: 'Trap Zone',
    shape: { type: 'rectangle', x: 3, y: 3, width: 4, height: 4 },
    trigger: 'enter',
    action: { type: 'alert-dm', message: 'Trap triggered!' },
    enabled: true,
    visibleToPlayers: false,
    oneShot: false,
    ...overrides
  }
}

function makeCtx(overrides: Partial<RegionActionContext> = {}): RegionActionContext {
  return {
    token: makeToken(),
    mapId: 'map-1',
    addChatMessage: vi.fn(),
    moveToken: vi.fn(),
    updateToken: vi.fn(),
    addCondition: vi.fn(),
    updateRegion: vi.fn(),
    round: 1,
    ...overrides
  }
}

// ─── pointInRegionShape ────────────────────────────────────────

describe('pointInRegionShape', () => {
  describe('rectangle', () => {
    const rect = { type: 'rectangle' as const, x: 2, y: 2, width: 4, height: 3 }

    it('returns true for a point inside the rectangle', () => {
      expect(pointInRegionShape(3, 3, rect)).toBe(true)
    })

    it('returns true for a point at the top-left corner', () => {
      expect(pointInRegionShape(2, 2, rect)).toBe(true)
    })

    it('returns false for a point outside', () => {
      expect(pointInRegionShape(1, 1, rect)).toBe(false)
      expect(pointInRegionShape(7, 7, rect)).toBe(false)
    })

    it('returns false for a point at the bottom-right edge (exclusive)', () => {
      expect(pointInRegionShape(6, 5, rect)).toBe(false)
    })
  })

  describe('circle', () => {
    const circle = { type: 'circle' as const, centerX: 5, centerY: 5, radius: 3 }

    it('returns true for center point', () => {
      expect(pointInRegionShape(5, 5, circle)).toBe(true)
    })

    it('returns true for point within radius', () => {
      expect(pointInRegionShape(4, 4, circle)).toBe(true)
    })

    it('returns false for point outside radius', () => {
      expect(pointInRegionShape(0, 0, circle)).toBe(false)
    })
  })

  describe('polygon (triangle)', () => {
    const tri = {
      type: 'polygon' as const,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 }
      ]
    }

    it('returns true for a point inside the triangle', () => {
      expect(pointInRegionShape(4, 3, tri)).toBe(true)
    })

    it('returns false for a point outside the triangle', () => {
      expect(pointInRegionShape(0, 9, tri)).toBe(false)
    })

    it('returns false for degenerate polygon with < 3 points', () => {
      const degen = {
        type: 'polygon' as const,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 }
        ]
      }
      expect(pointInRegionShape(0, 0, degen)).toBe(false)
    })
  })
})

// ─── getRegionsAtPoint ─────────────────────────────────────────

describe('getRegionsAtPoint', () => {
  it('returns enabled regions containing the point', () => {
    const regions = [
      makeRegion({ id: 'r1', shape: { type: 'rectangle', x: 0, y: 0, width: 5, height: 5 } }),
      makeRegion({ id: 'r2', shape: { type: 'rectangle', x: 10, y: 10, width: 5, height: 5 } })
    ]
    const result = getRegionsAtPoint(regions, 2, 2)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('r1')
  })

  it('excludes disabled regions', () => {
    const regions = [
      makeRegion({ id: 'r1', enabled: false, shape: { type: 'rectangle', x: 0, y: 0, width: 10, height: 10 } })
    ]
    expect(getRegionsAtPoint(regions, 2, 2)).toHaveLength(0)
  })

  it('filters by floor when specified', () => {
    const regions = [
      makeRegion({ id: 'r1', floor: 0, shape: { type: 'rectangle', x: 0, y: 0, width: 10, height: 10 } }),
      makeRegion({ id: 'r2', floor: 1, shape: { type: 'rectangle', x: 0, y: 0, width: 10, height: 10 } })
    ]
    const result = getRegionsAtPoint(regions, 2, 2, 0)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('r1')
  })
})

// ─── detectRegionEvents ────────────────────────────────────────

describe('detectRegionEvents', () => {
  it('detects enter event when token moves into region', () => {
    const token = makeToken({ gridX: 0, gridY: 0 })
    const region = makeRegion({
      trigger: 'enter',
      shape: { type: 'rectangle', x: 3, y: 3, width: 4, height: 4 }
    })

    const events = detectRegionEvents(token, 0, 0, 4, 4, [region])
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('enter')
    expect(events[0].region.id).toBe('region-1')
  })

  it('detects leave event when token moves out of region', () => {
    const token = makeToken({ gridX: 4, gridY: 4 })
    const region = makeRegion({
      trigger: 'leave',
      shape: { type: 'rectangle', x: 3, y: 3, width: 4, height: 4 }
    })

    const events = detectRegionEvents(token, 4, 4, 0, 0, [region])
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('leave')
  })

  it('returns no events when token stays outside', () => {
    const token = makeToken()
    const region = makeRegion({
      shape: { type: 'rectangle', x: 10, y: 10, width: 4, height: 4 }
    })
    expect(detectRegionEvents(token, 0, 0, 1, 1, [region])).toHaveLength(0)
  })

  it('returns no events when token stays inside', () => {
    const token = makeToken()
    const region = makeRegion({
      trigger: 'enter',
      shape: { type: 'rectangle', x: 0, y: 0, width: 10, height: 10 }
    })
    expect(detectRegionEvents(token, 3, 3, 4, 4, [region])).toHaveLength(0)
  })

  it('returns no events when position unchanged', () => {
    const token = makeToken()
    const region = makeRegion()
    expect(detectRegionEvents(token, 5, 5, 5, 5, [region])).toHaveLength(0)
  })

  it('ignores disabled regions', () => {
    const token = makeToken()
    const region = makeRegion({
      enabled: false,
      shape: { type: 'rectangle', x: 3, y: 3, width: 4, height: 4 }
    })
    expect(detectRegionEvents(token, 0, 0, 4, 4, [region])).toHaveLength(0)
  })

  it('does not fire enter event for leave-only trigger', () => {
    const token = makeToken()
    const region = makeRegion({
      trigger: 'leave',
      shape: { type: 'rectangle', x: 3, y: 3, width: 4, height: 4 }
    })
    expect(detectRegionEvents(token, 0, 0, 4, 4, [region])).toHaveLength(0)
  })
})

// ─── executeRegionAction ───────────────────────────────────────

describe('executeRegionAction', () => {
  it('alert-dm: sends a chat message', () => {
    const region = makeRegion({ action: { type: 'alert-dm', message: 'Watch out!' } })
    const ctx = makeCtx()

    executeRegionAction(region, region.action, ctx)

    expect(ctx.addChatMessage).toHaveBeenCalledTimes(1)
    const msg = (ctx.addChatMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(msg.content).toContain('Watch out!')
    expect(msg.content).toContain('TestHero')
  })

  it('teleport: moves token to target coordinates', () => {
    const region = makeRegion({
      action: { type: 'teleport', targetMapId: 'map-1', targetGridX: 15, targetGridY: 20 }
    })
    const ctx = makeCtx()

    executeRegionAction(region, region.action, ctx)

    expect(ctx.moveToken).toHaveBeenCalledWith('map-1', 'tok-1', 15, 20)
    expect(ctx.addChatMessage).toHaveBeenCalledTimes(1)
  })

  it('apply-condition: adds condition to token and entity', () => {
    const region = makeRegion({
      action: { type: 'apply-condition', condition: 'Prone' }
    })
    const ctx = makeCtx()

    executeRegionAction(region, region.action, ctx)

    expect(ctx.updateToken).toHaveBeenCalledWith('map-1', 'tok-1', { conditions: ['Prone'] })
    expect(ctx.addCondition).toHaveBeenCalledTimes(1)
    const condCall = (ctx.addCondition as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(condCall.condition).toBe('Prone')
    expect(condCall.source).toContain('Trap Zone')
  })

  it('apply-condition: does not duplicate existing condition on token', () => {
    const region = makeRegion({
      action: { type: 'apply-condition', condition: 'Prone' }
    })
    const token = makeToken({ conditions: ['Prone'] })
    const ctx = makeCtx({ token })

    executeRegionAction(region, region.action, ctx)

    expect(ctx.updateToken).not.toHaveBeenCalled()
    expect(ctx.addCondition).toHaveBeenCalledTimes(1)
  })

  it('one-shot region disables after firing', () => {
    const region = makeRegion({ oneShot: true })
    const ctx = makeCtx()

    executeRegionAction(region, region.action, ctx)

    expect(ctx.updateRegion).toHaveBeenCalledWith('map-1', 'region-1', { enabled: false })
  })

  it('non-one-shot region stays enabled', () => {
    const region = makeRegion({ oneShot: false })
    const ctx = makeCtx()

    executeRegionAction(region, region.action, ctx)

    expect(ctx.updateRegion).not.toHaveBeenCalled()
  })
})

// ─── processTokenRegionTriggers (integration) ──────────────────

describe('processTokenRegionTriggers', () => {
  it('detects enter and executes action in one call', () => {
    const token = makeToken()
    const region = makeRegion({
      trigger: 'enter',
      action: { type: 'apply-condition', condition: 'Prone' },
      shape: { type: 'rectangle', x: 3, y: 3, width: 4, height: 4 }
    })
    const ctx = makeCtx({ token })

    const events = processTokenRegionTriggers(token, 0, 0, 4, 4, [region], ctx)

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('enter')
    expect(ctx.updateToken).toHaveBeenCalledWith('map-1', 'tok-1', { conditions: ['Prone'] })
    expect(ctx.addCondition).toHaveBeenCalledTimes(1)
    expect(ctx.addChatMessage).toHaveBeenCalledTimes(1)
  })

  it('handles multiple regions simultaneously', () => {
    const token = makeToken()
    const regions = [
      makeRegion({
        id: 'r1',
        name: 'Trap A',
        trigger: 'enter',
        action: { type: 'alert-dm', message: 'Trap A!' },
        shape: { type: 'rectangle', x: 3, y: 3, width: 4, height: 4 }
      }),
      makeRegion({
        id: 'r2',
        name: 'Trap B',
        trigger: 'enter',
        action: { type: 'apply-condition', condition: 'Poisoned' },
        shape: { type: 'rectangle', x: 2, y: 2, width: 6, height: 6 }
      })
    ]
    const ctx = makeCtx({ token })

    const events = processTokenRegionTriggers(token, 0, 0, 4, 4, regions, ctx)
    expect(events).toHaveLength(2)
    expect(ctx.addChatMessage).toHaveBeenCalledTimes(2)
  })

  it('success criterion: trap region applies Prone and notifies', () => {
    const token = makeToken({ id: 'hero-1', entityId: 'hero-entity', label: 'Brave Paladin' })
    const trapRegion = makeRegion({
      id: 'trap-1',
      name: 'Pit Trap',
      trigger: 'enter',
      action: { type: 'apply-condition', condition: 'Prone' },
      shape: { type: 'rectangle', x: 5, y: 5, width: 2, height: 2 },
      oneShot: true
    })
    const ctx = makeCtx({ token })

    const events = processTokenRegionTriggers(token, 4, 4, 5, 5, [trapRegion], ctx)

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('enter')

    expect(ctx.updateToken).toHaveBeenCalledWith('map-1', 'hero-1', { conditions: ['Prone'] })

    const conditionCall = (ctx.addCondition as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(conditionCall.condition).toBe('Prone')
    expect(conditionCall.entityId).toBe('hero-entity')
    expect(conditionCall.source).toContain('Pit Trap')

    const chatMsg = (ctx.addChatMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(chatMsg.content).toContain('Brave Paladin')
    expect(chatMsg.content).toContain('Prone')

    expect(ctx.updateRegion).toHaveBeenCalledWith('map-1', 'trap-1', { enabled: false })
  })
})
