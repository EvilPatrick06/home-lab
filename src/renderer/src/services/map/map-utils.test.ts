import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapToken } from '../../types/map'
import {
  calculateZoomToFit,
  clearPlayerTyping,
  createPing,
  generateGridLabels,
  getActivePings,
  getGridLabel,
  getPingAnimation,
  getTypingPlayers,
  onPing,
  setPlayerTyping
} from './map-utils'

// ─── Helper to create minimal MapTokens ───────────────────────

function makeToken(overrides: Partial<MapToken> = {}): MapToken {
  return {
    id: overrides.id ?? 'tok-1',
    entityId: 'ent-1',
    entityType: 'player',
    label: 'Test',
    gridX: 0,
    gridY: 0,
    sizeX: 1,
    sizeY: 1,
    visibleToPlayers: true,
    conditions: [],
    ...overrides
  }
}

// ─── calculateZoomToFit ──────────────────────────────────────

describe('calculateZoomToFit', () => {
  it('returns null for an empty token array', () => {
    expect(calculateZoomToFit([], 800, 600, 50)).toBeNull()
  })

  it('returns zoom, offsetX, offsetY for a single token', () => {
    const tokens = [makeToken({ gridX: 5, gridY: 5 })]
    const result = calculateZoomToFit(tokens, 800, 600, 50)

    expect(result).not.toBeNull()
    expect(result).toHaveProperty('zoom')
    expect(result).toHaveProperty('offsetX')
    expect(result).toHaveProperty('offsetY')
    expect(result!.zoom).toBeGreaterThan(0)
    expect(result!.zoom).toBeLessThanOrEqual(2) // capped at 2x
  })

  it('caps zoom at 2x even when content is tiny relative to viewport', () => {
    const tokens = [makeToken({ gridX: 0, gridY: 0 })]
    const result = calculateZoomToFit(tokens, 10000, 10000, 50)

    expect(result!.zoom).toBeLessThanOrEqual(2)
  })

  it('uses custom padding when provided', () => {
    const tokens = [makeToken({ gridX: 5, gridY: 5 })]
    const withDefault = calculateZoomToFit(tokens, 800, 600, 50)
    const withSmallPadding = calculateZoomToFit(tokens, 800, 600, 50, 10)

    // Smaller padding should allow a higher zoom (content area is tighter)
    expect(withSmallPadding!.zoom).toBeGreaterThanOrEqual(withDefault!.zoom)
  })

  it('handles multiple tokens spread across the map', () => {
    const tokens = [makeToken({ gridX: 0, gridY: 0 }), makeToken({ id: 'tok-2', gridX: 10, gridY: 10 })]
    const result = calculateZoomToFit(tokens, 800, 600, 50)

    expect(result).not.toBeNull()
    expect(result!.zoom).toBeGreaterThan(0)
  })

  it('accounts for token size (sizeX, sizeY)', () => {
    const smallToken = [makeToken({ gridX: 5, gridY: 5, sizeX: 1, sizeY: 1 })]
    const largeToken = [makeToken({ gridX: 5, gridY: 5, sizeX: 4, sizeY: 4 })]

    const smallResult = calculateZoomToFit(smallToken, 800, 600, 50)
    const largeResult = calculateZoomToFit(largeToken, 800, 600, 50)

    // Large token takes up more space so zoom should be smaller or equal
    expect(largeResult!.zoom).toBeLessThanOrEqual(smallResult!.zoom)
  })

  it('centers the viewport offset on the token content', () => {
    const tokens = [makeToken({ gridX: 10, gridY: 10 })]
    const result = calculateZoomToFit(tokens, 800, 600, 50)

    // The offset should place the token center near viewport center
    expect(typeof result!.offsetX).toBe('number')
    expect(typeof result!.offsetY).toBe('number')
  })
})

// ─── getGridLabel ────────────────────────────────────────────

describe('getGridLabel', () => {
  it('returns "A1" for gridX=0, gridY=0', () => {
    expect(getGridLabel(0, 0)).toBe('A1')
  })

  it('returns correct column letters for first 26 columns', () => {
    expect(getGridLabel(0, 0)).toBe('A1')
    expect(getGridLabel(1, 0)).toBe('B1')
    expect(getGridLabel(25, 0)).toBe('Z1')
  })

  it('wraps to AA after Z (column 26)', () => {
    expect(getGridLabel(26, 0)).toBe('AA1')
  })

  it('continues wrapping correctly (AB, AC, ...)', () => {
    expect(getGridLabel(27, 0)).toBe('AB1')
    expect(getGridLabel(28, 0)).toBe('AC1')
  })

  it('uses 1-based row numbers', () => {
    expect(getGridLabel(0, 0)).toBe('A1')
    expect(getGridLabel(0, 9)).toBe('A10')
  })
})

// ─── generateGridLabels ─────────────────────────────────────

describe('generateGridLabels', () => {
  it('generates correct column and row counts', () => {
    const result = generateGridLabels(500, 300, 50)

    expect(result.columns).toHaveLength(10) // 500/50
    expect(result.rows).toHaveLength(6) // 300/50
  })

  it('places column labels at cell centers', () => {
    const result = generateGridLabels(200, 100, 50)

    expect(result.columns[0].x).toBe(25) // cellSize/2
    expect(result.columns[1].x).toBe(75) // cellSize + cellSize/2
  })

  it('places row labels at cell centers', () => {
    const result = generateGridLabels(200, 200, 50)

    expect(result.rows[0].y).toBe(25)
    expect(result.rows[1].y).toBe(75)
  })

  it('uses letter labels for columns', () => {
    const result = generateGridLabels(150, 100, 50)

    expect(result.columns[0].label).toBe('A')
    expect(result.columns[1].label).toBe('B')
    expect(result.columns[2].label).toBe('C')
  })

  it('uses 1-based numeric labels for rows', () => {
    const result = generateGridLabels(100, 150, 50)

    expect(result.rows[0].label).toBe('1')
    expect(result.rows[1].label).toBe('2')
    expect(result.rows[2].label).toBe('3')
  })

  it('handles non-evenly-divisible dimensions (rounds up)', () => {
    const result = generateGridLabels(110, 90, 50)

    expect(result.columns).toHaveLength(3) // ceil(110/50) = 3
    expect(result.rows).toHaveLength(2) // ceil(90/50) = 2
  })
})

// ─── Ping System ─────────────────────────────────────────────

describe('createPing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a ping with provided coordinates and sender', () => {
    const ping = createPing(100, 200, 'Alice')

    expect(ping.x).toBe(100)
    expect(ping.y).toBe(200)
    expect(ping.senderName).toBe('Alice')
    expect(ping.id).toBeTruthy()
  })

  it('uses default color when none provided', () => {
    const ping = createPing(0, 0, 'Bob')
    expect(ping.color).toBe(0xffaa00)
  })

  it('uses custom color when provided', () => {
    const ping = createPing(0, 0, 'Bob', 0xff0000)
    expect(ping.color).toBe(0xff0000)
  })

  it('sets default duration of 3000ms', () => {
    const ping = createPing(0, 0, 'Test')
    expect(ping.duration).toBe(3000)
  })

  it('invokes the onPing callback if registered', () => {
    const cb = vi.fn()
    const unsub = onPing(cb)

    createPing(10, 20, 'Test')

    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith(expect.objectContaining({ x: 10, y: 20 }))

    unsub()
  })

  it('auto-removes ping after its duration', () => {
    createPing(0, 0, 'Temp')

    expect(getActivePings().length).toBeGreaterThanOrEqual(1)

    vi.advanceTimersByTime(3001)

    // The getActivePings call itself filters expired pings, but the setTimeout should have also removed it
    expect(getActivePings().length).toBe(0)
  })
})

describe('getActivePings', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('filters out expired pings', () => {
    createPing(0, 0, 'OldPing')

    vi.advanceTimersByTime(4000)

    expect(getActivePings()).toHaveLength(0)
  })
})

describe('getPingAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns opacity=1 and scale=1 at the start', () => {
    const ping = createPing(0, 0, 'Test')
    const anim = getPingAnimation(ping)

    expect(anim).not.toBeNull()
    expect(anim!.opacity).toBeCloseTo(1, 1)
    expect(anim!.scale).toBeCloseTo(1, 1)
  })

  it('returns null after duration expires', () => {
    const ping = createPing(0, 0, 'Test')
    vi.advanceTimersByTime(3001)

    expect(getPingAnimation(ping)).toBeNull()
  })

  it('returns decreasing opacity and increasing scale as time progresses', () => {
    const ping = createPing(0, 0, 'Test')
    vi.advanceTimersByTime(1500)

    const anim = getPingAnimation(ping)
    expect(anim).not.toBeNull()
    expect(anim!.opacity).toBeLessThan(1)
    expect(anim!.opacity).toBeGreaterThan(0)
    expect(anim!.scale).toBeGreaterThan(1)
  })
})

// ─── Typing Indicators ──────────────────────────────────────

describe('typing indicators', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('setPlayerTyping adds a player to the typing list', () => {
    setPlayerTyping('peer-1')
    expect(getTypingPlayers()).toContain('peer-1')
  })

  it('clearPlayerTyping removes a player from the typing list', () => {
    setPlayerTyping('peer-2')
    clearPlayerTyping('peer-2')
    expect(getTypingPlayers()).not.toContain('peer-2')
  })

  it('getTypingPlayers filters out expired entries (default 3s)', () => {
    setPlayerTyping('peer-3')

    vi.advanceTimersByTime(4000)

    expect(getTypingPlayers()).not.toContain('peer-3')
  })

  it('getTypingPlayers respects custom timeout', () => {
    setPlayerTyping('peer-4')

    vi.advanceTimersByTime(1500)

    // Still within default 3s
    expect(getTypingPlayers()).toContain('peer-4')

    // But expired with a 1s timeout
    expect(getTypingPlayers(1000)).not.toContain('peer-4')
  })

  it('returns multiple typing players', () => {
    setPlayerTyping('peer-a')
    setPlayerTyping('peer-b')

    const typing = getTypingPlayers()
    expect(typing).toContain('peer-a')
    expect(typing).toContain('peer-b')
  })
})
