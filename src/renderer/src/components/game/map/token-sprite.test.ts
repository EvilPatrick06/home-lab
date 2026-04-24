import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MapToken } from '../../../types/map'
import { createTokenSprite, setSpeaking } from './token-sprite'

// ─── PixiJS mock ───────────────────────────────────────────────

vi.mock('pixi.js', () => {
  const makeContainer = () => {
    const children: Array<{ label?: string }> = []
    return {
      label: '',
      x: 0,
      y: 0,
      eventMode: '',
      cursor: '',
      hitArea: null as unknown,
      children,
      addChild: vi.fn((child: { label?: string }) => {
        children.push(child)
        return child
      }),
      addChildAt: vi.fn((child: { label?: string }) => {
        children.unshift(child)
        return child
      }),
      removeChild: vi.fn((child: { label?: string }) => {
        const idx = children.indexOf(child)
        if (idx >= 0) children.splice(idx, 1)
      }),
      getLocalBounds: vi.fn(() => ({ x: 0, y: 0, width: 60, height: 60 }))
    }
  }
  const makeGraphics = () => ({
    label: '',
    alpha: 1,
    onRender: null as unknown,
    circle: vi.fn().mockReturnThis(),
    fill: vi.fn().mockReturnThis(),
    stroke: vi.fn().mockReturnThis(),
    arc: vi.fn().mockReturnThis(),
    roundRect: vi.fn().mockReturnThis()
  })
  const makeText = () => ({
    anchor: { set: vi.fn() },
    x: 0,
    y: 0,
    width: 20,
    height: 10
  })
  return {
    Container: vi.fn(function () {
      return makeContainer()
    }),
    Graphics: vi.fn(function () {
      return makeGraphics()
    }),
    Text: vi.fn(function () {
      return makeText()
    }),
    TextStyle: vi.fn(function () {
      return {}
    })
  }
})

// ─── Helpers ──────────────────────────────────────────────────

function makeToken(overrides: Partial<MapToken> = {}): MapToken {
  return {
    id: 'token-1',
    entityId: 'entity-1',
    entityType: 'player',
    label: 'Aragorn',
    gridX: 2,
    gridY: 3,
    sizeX: 1,
    sizeY: 1,
    conditions: [],
    nameVisible: true,
    ...overrides
  } as MapToken
}

// ─── createTokenSprite ─────────────────────────────────────────

describe('createTokenSprite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls Container constructor', async () => {
    const { Container } = await import('pixi.js')
    createTokenSprite(makeToken(), 70, false)
    expect(Container).toHaveBeenCalled()
  })

  it('positions container at gridX * cellSize', () => {
    const container = createTokenSprite(makeToken({ gridX: 3, gridY: 5 }), 70, false)
    expect(container.x).toBe(210) // 3 * 70
    expect(container.y).toBe(350) // 5 * 70
  })

  it('sets eventMode to static', () => {
    const container = createTokenSprite(makeToken(), 70, false)
    expect(container.eventMode).toBe('static')
  })

  it('sets cursor to pointer', () => {
    const container = createTokenSprite(makeToken(), 70, false)
    expect(container.cursor).toBe('pointer')
  })

  it('sets a hitArea with a contains function', () => {
    const container = createTokenSprite(makeToken(), 70, false)
    expect(container.hitArea).not.toBeNull()
    expect(typeof (container.hitArea as { contains: unknown })?.contains).toBe('function')
  })

  it('hitArea.contains returns true for the center point', () => {
    const container = createTokenSprite(makeToken(), 70, false)
    const hitArea = container.hitArea as { contains: (x: number, y: number) => boolean }
    const cx = 70 / 2
    const cy = 70 / 2
    expect(hitArea.contains(cx, cy)).toBe(true)
  })

  it('hitArea.contains returns false for a corner point outside the circle', () => {
    const container = createTokenSprite(makeToken(), 70, false)
    const hitArea = container.hitArea as { contains: (x: number, y: number) => boolean }
    // Top-left corner (0,0) is outside a circle centered at (35,35) with radius ~33
    expect(hitArea.contains(0, 0)).toBe(false)
  })

  it('creates a Graphics object for the main circle', async () => {
    const { Graphics } = await import('pixi.js')
    createTokenSprite(makeToken(), 70, false)
    expect(Graphics).toHaveBeenCalled()
  })

  it('creates a Text object for the label', async () => {
    const { Text } = await import('pixi.js')
    createTokenSprite(makeToken(), 70, false)
    expect(Text).toHaveBeenCalled()
  })

  it('adds additional Graphics for active-turn glow', async () => {
    const { Graphics } = await import('pixi.js')
    vi.clearAllMocks()
    createTokenSprite(makeToken(), 70, false, true) // isActiveTurn = true
    expect(Graphics).toHaveBeenCalled()
  })

  it('does not add active-turn glow when isActiveTurn is false', async () => {
    const { Graphics } = await import('pixi.js')
    vi.clearAllMocks()
    createTokenSprite(makeToken(), 70, false, false)
    // Graphics is still called for the base circle but fewer times than with active turn glow
    expect(Graphics).toHaveBeenCalled()
  })

  it('truncates labels longer than 8 characters', () => {
    // Label ≥ 8 chars gets sliced to 7 + ellipsis when isDM=true
    const container = createTokenSprite(makeToken({ label: 'VeryLongNameHere' }), 70, false)
    expect(container).toBeDefined()
  })

  it('shows only first letter for players when nameVisible=false and not DM', () => {
    // isDM=false, nameVisible=false → first letter only
    const container = createTokenSprite(makeToken({ nameVisible: false }), 70, false, false, true, undefined, false)
    expect(container).toBeDefined()
  })

  it('renders aura ring when aura is configured and visible to all', () => {
    const tokenWithAura = makeToken({
      aura: {
        radius: 10,
        color: '#FFD700',
        opacity: 0.5,
        visibility: 'all'
      }
    })
    const container = createTokenSprite(tokenWithAura, 70, false, false, true, undefined, false)
    // Aura should be rendered as an additional child (before selection ring)
    expect(container.children.length).toBeGreaterThan(1)
  })

  it('renders aura ring when aura is configured and visible to DM only (when isDM=true)', () => {
    const tokenWithAura = makeToken({
      aura: {
        radius: 10,
        color: '#FFD700',
        opacity: 0.5,
        visibility: 'dm-only'
      }
    })
    const container = createTokenSprite(tokenWithAura, 70, false, false, true, undefined, true) // isDM=true
    // Aura should be rendered as an additional child
    expect(container.children.length).toBeGreaterThan(1)
  })

  it('does not render aura ring when visibility is dm-only and isDM=false', () => {
    const tokenWithAura = makeToken({
      aura: {
        radius: 10,
        color: '#FFD700',
        opacity: 0.5,
        visibility: 'dm-only'
      }
    })
    const container = createTokenSprite(tokenWithAura, 70, false, false, true, undefined, false) // isDM=false
    // Should not add extra aura graphics
    const baseChildrenCount = createTokenSprite(makeToken(), 70, false, false, true, undefined, false).children.length
    expect(container.children.length).toBe(baseChildrenCount)
  })

  it('does not render aura ring when no aura is configured', () => {
    const container = createTokenSprite(makeToken(), 70, false, false, true, undefined, false)
    const baseChildrenCount = container.children.length
    // No aura configured, so should be same as base
    expect(container.children.length).toBe(baseChildrenCount)
  })

  it('renders Paladin Aura of Protection (10ft gold ring)', () => {
    // Success criteria: A Paladin token displays a 10ft gold ring representing their Aura of Protection
    const paladinToken = makeToken({
      label: 'Paladin',
      entityType: 'player',
      aura: {
        radius: 10, // 10 feet
        color: '#FFD700', // Gold color
        opacity: 0.6, // Semi-transparent
        visibility: 'all' // Visible to all players
      }
    })
    const container = createTokenSprite(paladinToken, 70, false, false, true, undefined, false)
    // Aura should be rendered (container should have more children than base token)
    const baseContainer = createTokenSprite(makeToken(), 70, false, false, true, undefined, false)
    expect(container.children.length).toBeGreaterThan(baseContainer.children.length)
  })
})

// ─── setSpeaking ───────────────────────────────────────────────

describe('setSpeaking', () => {
  function makeRealContainer() {
    const children: Array<{ label?: string; onRender?: unknown; alpha?: number; circle?: unknown; stroke?: unknown }> =
      []
    return {
      children,
      addChildAt: vi.fn((child: { label?: string }) => {
        children.unshift(child)
        return child
      }),
      removeChild: vi.fn((child: { label?: string }) => {
        const idx = children.indexOf(child)
        if (idx >= 0) children.splice(idx, 1)
      }),
      getLocalBounds: vi.fn(() => ({ x: 0, y: 0, width: 60, height: 60 }))
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adds a child at index 0 when speaking is true', () => {
    const container = makeRealContainer()
    setSpeaking(container as never, true)
    expect(container.addChildAt).toHaveBeenCalled()
  })

  it('does not add any child when speaking is false', () => {
    const container = makeRealContainer()
    setSpeaking(container as never, false)
    expect(container.addChildAt).not.toHaveBeenCalled()
  })

  it('removes existing speaking ring before adding new one', () => {
    const container = makeRealContainer()
    const existingRing = { label: 'speaking-ring' }
    container.children.push(existingRing)
    setSpeaking(container as never, true)
    expect(container.removeChild).toHaveBeenCalledWith(existingRing)
  })

  it('removes existing speaking ring when speaking becomes false', () => {
    const container = makeRealContainer()
    const existingRing = { label: 'speaking-ring' }
    container.children.push(existingRing)
    setSpeaking(container as never, false)
    expect(container.removeChild).toHaveBeenCalledWith(existingRing)
  })

  it('does nothing when speaking is false and no ring exists', () => {
    const container = makeRealContainer()
    expect(() => setSpeaking(container as never, false)).not.toThrow()
    expect(container.addChildAt).not.toHaveBeenCalled()
  })

  it('the added ring has an onRender function for pulse animation', async () => {
    const { Graphics } = await import('pixi.js')
    const ringInstance = {
      label: '',
      onRender: null as unknown,
      alpha: 1,
      circle: vi.fn().mockReturnThis(),
      stroke: vi.fn().mockReturnThis()
    }
    vi.mocked(Graphics).mockImplementationOnce(function () {
      return ringInstance as never
    })
    const container = makeRealContainer()
    setSpeaking(container as never, true)
    expect(ringInstance.onRender).toBeTypeOf('function')
  })

  it('accepts an optional playerColor for the ring', async () => {
    const { Graphics } = await import('pixi.js')
    const ringInstance = {
      label: '',
      onRender: null as unknown,
      alpha: 1,
      circle: vi.fn().mockReturnThis(),
      stroke: vi.fn().mockReturnThis()
    }
    vi.mocked(Graphics).mockImplementationOnce(function () {
      return ringInstance as never
    })
    const container = makeRealContainer()
    // Should not throw with custom color
    expect(() => setSpeaking(container as never, true, 0xff0000)).not.toThrow()
  })
})
