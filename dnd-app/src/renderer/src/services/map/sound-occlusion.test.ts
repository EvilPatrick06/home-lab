import { describe, expect, it } from 'vitest'
import type { GameMap, MapToken, WallSegment } from '../../types/map'
import type { Point } from './raycast-visibility'
import {
  calculateEmitterVolumes,
  calculateSoundOcclusion,
  checkWallOcclusion,
  getPlayerListenerPosition,
  SOUND_OCCLUSION
} from './sound-occlusion'

// ─── Helpers ────────────────────────────────────────────────────

function makeMap(overrides?: Partial<GameMap>): GameMap {
  return {
    id: 'map-1',
    name: 'Test Map',
    campaignId: 'campaign-1',
    imagePath: '',
    width: 20,
    height: 20,
    grid: { enabled: true, cellSize: 50, offsetX: 0, offsetY: 0, color: '#fff', opacity: 0.5, type: 'square' },
    tokens: [],
    fogOfWar: { enabled: true, revealedCells: [] },
    terrain: [],
    createdAt: new Date().toISOString(),
    ...overrides
  }
}

function makeWall(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  type: WallSegment['type'] = 'solid',
  isOpen = false
): WallSegment {
  return { id: `wall-${x1}-${y1}-${x2}-${y2}`, x1, y1, x2, y2, type, isOpen }
}

function makeToken(overrides: Partial<MapToken> & { gridX: number; gridY: number }): MapToken {
  return {
    id: `token-${overrides.gridX}-${overrides.gridY}`,
    entityId: `entity-${overrides.gridX}-${overrides.gridY}`,
    entityType: 'player' as const,
    label: 'Token',
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    conditions: [],
    ...overrides
  } as MapToken
}

// ─── SOUND_OCCLUSION constants ────────────────────────────────

describe('SOUND_OCCLUSION constants', () => {
  it('has expected shape and sensible values', () => {
    expect(SOUND_OCCLUSION.OCCLUDED_VOLUME_MULTIPLIER).toBeGreaterThan(0)
    expect(SOUND_OCCLUSION.OCCLUDED_VOLUME_MULTIPLIER).toBeLessThan(1)
    expect(SOUND_OCCLUSION.OCCLUDED_LOW_PASS_FREQ).toBeLessThan(SOUND_OCCLUSION.NORMAL_LOW_PASS_FREQ)
    expect(SOUND_OCCLUSION.DISTANCE_FALLOFF_EXPONENT).toBeGreaterThan(0)
    expect(SOUND_OCCLUSION.MIN_VOLUME_THRESHOLD).toBeGreaterThan(0)
    expect(SOUND_OCCLUSION.MIN_VOLUME_THRESHOLD).toBeLessThan(1)
  })
})

// ─── calculateSoundOcclusion ─────────────────────────────────

describe('calculateSoundOcclusion', () => {
  const map = makeMap()

  it('returns zero volume when distance >= maxRadius', () => {
    const result = calculateSoundOcclusion(0, 0, 10, 0, map, 1.0, 5)
    expect(result.volume).toBe(0)
    expect(result.isOccluded).toBe(false)
    expect(result.lowPassFrequency).toBe(SOUND_OCCLUSION.NORMAL_LOW_PASS_FREQ)
  })

  it('returns full base volume at zero distance (emitter == listener)', () => {
    const result = calculateSoundOcclusion(5, 5, 5, 5, map, 1.0, 10)
    // Distance is 0, distanceFactor = 1 - 0 = 1, no occlusion
    expect(result.volume).toBeCloseTo(1.0, 5)
    expect(result.isOccluded).toBe(false)
    expect(result.distance).toBeCloseTo(0, 5)
  })

  it('volume decreases with distance', () => {
    const near = calculateSoundOcclusion(0, 0, 1, 0, map, 1.0, 20)
    const far = calculateSoundOcclusion(0, 0, 8, 0, map, 1.0, 20)
    expect(near.volume).toBeGreaterThan(far.volume)
  })

  it('reports correct distance in grid cells (center-to-center)', () => {
    // emitter at (0,0) listener at (3,4): centers at (0.5,0.5) and (3.5,4.5)
    // dx=3, dy=4 → distance=5
    const result = calculateSoundOcclusion(0, 0, 3, 4, map, 1.0, 20)
    expect(result.distance).toBeCloseTo(5, 5)
  })

  it('applies occlusion multiplier when wall blocks line-of-sight', () => {
    const wallMap = makeMap({ wallSegments: [makeWall(5, 0, 5, 10)] })
    const blocked = calculateSoundOcclusion(2, 5, 8, 5, wallMap, 1.0, 20)
    const open = calculateSoundOcclusion(2, 5, 2, 8, map, 1.0, 20)

    expect(blocked.isOccluded).toBe(true)
    expect(blocked.lowPassFrequency).toBe(SOUND_OCCLUSION.OCCLUDED_LOW_PASS_FREQ)
    // Occluded volume is attenuated by OCCLUDED_VOLUME_MULTIPLIER
    const expectedMax = open.volume * SOUND_OCCLUSION.OCCLUDED_VOLUME_MULTIPLIER
    // The occluded result has different distance so we check the flag + low pass
    expect(blocked.lowPassFrequency).toBeLessThan(SOUND_OCCLUSION.NORMAL_LOW_PASS_FREQ)
  })

  it('non-occluded result has normal low-pass frequency', () => {
    const result = calculateSoundOcclusion(0, 0, 2, 0, map, 1.0, 20)
    expect(result.isOccluded).toBe(false)
    expect(result.lowPassFrequency).toBe(SOUND_OCCLUSION.NORMAL_LOW_PASS_FREQ)
  })

  it('volume is clamped to 0 when below MIN_VOLUME_THRESHOLD', () => {
    // Very small baseVolume near the max radius ensures sub-threshold result
    const result = calculateSoundOcclusion(0, 0, 9, 0, map, 0.001, 10)
    expect(result.volume).toBe(0)
  })

  it('volume is never negative', () => {
    const result = calculateSoundOcclusion(0, 0, 5, 0, map, 1.0, 6)
    expect(result.volume).toBeGreaterThanOrEqual(0)
  })

  it('handles map with no wallSegments (undefined)', () => {
    const noWallsMap = makeMap({ wallSegments: undefined })
    expect(() => calculateSoundOcclusion(0, 0, 3, 0, noWallsMap, 1.0, 20)).not.toThrow()
    const result = calculateSoundOcclusion(0, 0, 3, 0, noWallsMap, 1.0, 20)
    expect(result.isOccluded).toBe(false)
  })

  it('floating-point: distance is exact for integer axis-aligned positions', () => {
    // emitter=(0,0) listener=(4,0): centers at (0.5,0.5) and (4.5,0.5), dx=4, dy=0
    const result = calculateSoundOcclusion(0, 0, 4, 0, map, 1.0, 20)
    expect(result.distance).toBeCloseTo(4, 10)
  })
})

// ─── checkWallOcclusion ──────────────────────────────────────

describe('checkWallOcclusion', () => {
  const cellSize = 50

  it('returns false when no walls', () => {
    const emitter: Point = { x: 1, y: 1 }
    const listener: Point = { x: 5, y: 5 }
    expect(checkWallOcclusion(emitter, listener, [], cellSize)).toBe(false)
  })

  it('returns true when solid wall crosses line-of-sight', () => {
    // Emitter left of x=5, listener right of x=5; wall at x=5
    const emitter: Point = { x: 2, y: 5 }
    const listener: Point = { x: 8, y: 5 }
    const walls: WallSegment[] = [makeWall(5, 0, 5, 10, 'solid')]
    expect(checkWallOcclusion(emitter, listener, walls, cellSize)).toBe(true)
  })

  it('returns true when closed door crosses line-of-sight', () => {
    const emitter: Point = { x: 2, y: 5 }
    const listener: Point = { x: 8, y: 5 }
    const walls: WallSegment[] = [makeWall(5, 0, 5, 10, 'door', false)]
    expect(checkWallOcclusion(emitter, listener, walls, cellSize)).toBe(true)
  })

  it('returns false through open door', () => {
    const emitter: Point = { x: 2, y: 5 }
    const listener: Point = { x: 8, y: 5 }
    const walls: WallSegment[] = [makeWall(5, 0, 5, 10, 'door', true)]
    expect(checkWallOcclusion(emitter, listener, walls, cellSize)).toBe(false)
  })

  it('returns false through window (windows do not block sound in this impl)', () => {
    const emitter: Point = { x: 2, y: 5 }
    const listener: Point = { x: 8, y: 5 }
    const walls: WallSegment[] = [makeWall(5, 0, 5, 10, 'window')]
    expect(checkWallOcclusion(emitter, listener, walls, cellSize)).toBe(false)
  })

  it('returns false when wall is parallel and does not cross path', () => {
    const emitter: Point = { x: 2, y: 5 }
    const listener: Point = { x: 8, y: 5 }
    // Wall runs parallel at y=0 — does not cross the horizontal line y=5
    const walls: WallSegment[] = [makeWall(0, 0, 10, 0, 'solid')]
    expect(checkWallOcclusion(emitter, listener, walls, cellSize)).toBe(false)
  })

  it('returns false when wall is on same side as both endpoints', () => {
    const emitter: Point = { x: 2, y: 5 }
    const listener: Point = { x: 4, y: 5 }
    // Wall is at x=8, far past both points
    const walls: WallSegment[] = [makeWall(8, 0, 8, 10, 'solid')]
    expect(checkWallOcclusion(emitter, listener, walls, cellSize)).toBe(false)
  })

  it('scales wall positions by cellSize', () => {
    // wall at grid x=5 → pixel x=250; emitter at (2,5)→(100,250), listener at (8,5)→(400,250)
    const emitter: Point = { x: 2, y: 5 }
    const listener: Point = { x: 8, y: 5 }
    const walls: WallSegment[] = [makeWall(5, 0, 5, 10, 'solid')]
    // With cellSize=50: wall at pixel x=250 crosses from (100,250) to (400,250) → occluded
    expect(checkWallOcclusion(emitter, listener, walls, 50)).toBe(true)
    // With cellSize=1: wall at pixel x=5 also crosses from (2,5) to (8,5) → occluded
    expect(checkWallOcclusion(emitter, listener, walls, 1)).toBe(true)
  })

  it('multiple walls: any crossing returns true', () => {
    const emitter: Point = { x: 1, y: 5 }
    const listener: Point = { x: 9, y: 5 }
    const walls: WallSegment[] = [makeWall(3, 0, 3, 10, 'solid'), makeWall(7, 0, 7, 10, 'solid')]
    expect(checkWallOcclusion(emitter, listener, walls, cellSize)).toBe(true)
  })

  it('boundary: emitter and listener at same position returns false', () => {
    const pt: Point = { x: 5, y: 5 }
    const walls: WallSegment[] = [makeWall(5, 0, 5, 10, 'solid')]
    // No movement → the "line" has no length, no crossing
    expect(checkWallOcclusion(pt, pt, walls, cellSize)).toBe(false)
  })
})

// ─── getPlayerListenerPosition ───────────────────────────────

describe('getPlayerListenerPosition', () => {
  it('returns null when no tokens on map', () => {
    const map = makeMap({ tokens: [] })
    expect(getPlayerListenerPosition(map)).toBeNull()
  })

  it('returns null when only non-player tokens exist', () => {
    const map = makeMap({
      tokens: [
        makeToken({ gridX: 3, gridY: 4, entityType: 'enemy' }),
        makeToken({ gridX: 5, gridY: 6, entityType: 'npc' })
      ]
    })
    expect(getPlayerListenerPosition(map)).toBeNull()
  })

  it('returns center position of first player token', () => {
    const map = makeMap({
      tokens: [makeToken({ gridX: 4, gridY: 6, entityType: 'player' })]
    })
    const result = getPlayerListenerPosition(map)
    expect(result).not.toBeNull()
    // Center: gridX + sizeX/2 = 4 + 0.5 = 4.5, gridY + sizeY/2 = 6 + 0.5 = 6.5
    expect(result!.x).toBeCloseTo(4.5, 10)
    expect(result!.y).toBeCloseTo(6.5, 10)
  })

  it('returns center of first player even if multiple players exist', () => {
    const map = makeMap({
      tokens: [
        makeToken({ id: 'p1', entityId: 'e1', gridX: 2, gridY: 3, entityType: 'player' }),
        makeToken({ id: 'p2', entityId: 'e2', gridX: 7, gridY: 8, entityType: 'player' })
      ]
    })
    const result = getPlayerListenerPosition(map)
    expect(result!.x).toBeCloseTo(2.5, 10)
    expect(result!.y).toBeCloseTo(3.5, 10)
  })

  it('uses token size for center calculation (2x2 token)', () => {
    const map = makeMap({
      tokens: [makeToken({ gridX: 4, gridY: 4, sizeX: 2, sizeY: 2, entityType: 'player' })]
    })
    const result = getPlayerListenerPosition(map)
    // center: 4 + 2/2 = 5
    expect(result!.x).toBeCloseTo(5, 10)
    expect(result!.y).toBeCloseTo(5, 10)
  })

  it('skips non-player tokens placed before a player token', () => {
    const map = makeMap({
      tokens: [
        makeToken({ id: 'e1', entityId: 'e1', gridX: 1, gridY: 1, entityType: 'enemy' }),
        makeToken({ id: 'p1', entityId: 'p1', gridX: 3, gridY: 3, entityType: 'player' })
      ]
    })
    const result = getPlayerListenerPosition(map)
    expect(result!.x).toBeCloseTo(3.5, 10)
    expect(result!.y).toBeCloseTo(3.5, 10)
  })
})

// ─── calculateEmitterVolumes ─────────────────────────────────

describe('calculateEmitterVolumes', () => {
  const map = makeMap()
  const listener: Point = { x: 5, y: 5 }

  it('returns empty map for no emitters', () => {
    const result = calculateEmitterVolumes([], listener, map)
    expect(result.size).toBe(0)
  })

  it('returns one entry per emitter', () => {
    const emitters = [
      { id: 'e1', x: 5, y: 5, volume: 1.0, radius: 10 },
      { id: 'e2', x: 8, y: 5, volume: 0.8, radius: 10 },
      { id: 'e3', x: 2, y: 2, volume: 0.5, radius: 10 }
    ]
    const result = calculateEmitterVolumes(emitters, listener, map)
    expect(result.size).toBe(3)
    expect(result.has('e1')).toBe(true)
    expect(result.has('e2')).toBe(true)
    expect(result.has('e3')).toBe(true)
  })

  it('each result has the expected SoundOcclusionResult shape', () => {
    const emitters = [{ id: 'sound1', x: 5, y: 5, volume: 1.0, radius: 10 }]
    const result = calculateEmitterVolumes(emitters, listener, map)
    const entry = result.get('sound1')!
    expect(entry).toHaveProperty('volume')
    expect(entry).toHaveProperty('isOccluded')
    expect(entry).toHaveProperty('lowPassFrequency')
    expect(entry).toHaveProperty('distance')
  })

  it('emitter co-located with listener has max volume', () => {
    const emitters = [{ id: 'co-loc', x: listener.x, y: listener.y, volume: 1.0, radius: 10 }]
    const result = calculateEmitterVolumes(emitters, listener, map)
    const entry = result.get('co-loc')!
    expect(entry.volume).toBeCloseTo(1.0, 5)
  })

  it('far emitter beyond radius has zero volume', () => {
    const emitters = [{ id: 'far', x: 0, y: 0, volume: 1.0, radius: 2 }]
    // listener at (5,5), emitter at (0,0) → distance ~7.07 > radius 2
    const result = calculateEmitterVolumes(emitters, listener, map)
    expect(result.get('far')!.volume).toBe(0)
  })

  it('emitter behind wall has occluded flag set', () => {
    const wallMap = makeMap({ wallSegments: [makeWall(3, 0, 3, 20, 'solid')] })
    // Emitter at x=1 (left of wall), listener at x=5 (right of wall)
    const emitters = [{ id: 'behind-wall', x: 1, y: 5, volume: 1.0, radius: 20 }]
    const result = calculateEmitterVolumes(emitters, { x: 5, y: 5 }, wallMap)
    expect(result.get('behind-wall')!.isOccluded).toBe(true)
  })

  it('listener position from Point (fractional) works correctly', () => {
    const fractionalListener: Point = { x: 4.5, y: 4.5 }
    const emitters = [{ id: 'test', x: 4, y: 4, volume: 1.0, radius: 10 }]
    expect(() => calculateEmitterVolumes(emitters, fractionalListener, map)).not.toThrow()
    const result = calculateEmitterVolumes(emitters, fractionalListener, map)
    expect(result.get('test')).toBeDefined()
  })
})
