import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GameMap } from '../types/map'

const mocked = vi.hoisted(() => ({
  gameStore: {
    initiative: null,
    turnStates: {},
    conditions: [],
    weatherOverride: null,
    moveToken: vi.fn(),
    useMovement: vi.fn(),
    updateToken: vi.fn(),
    removeToken: vi.fn(),
    removeFromInitiative: vi.fn(),
    setPartyVisionCells: vi.fn(),
    addExploredCells: vi.fn()
  },
  activeLightSources: [] as Array<{ entityId: string; sourceName: string }>,
  buildMapLightSources: vi.fn(() => []),
  debouncedRecomputeVision: vi.fn(),
  recomputeVision: vi.fn(() => ({ visibleCells: [] }))
}))

vi.mock('react', () => ({
  useState: vi.fn(() => [null, vi.fn()]),
  useEffect: vi.fn(),
  useCallback: vi.fn((fn) => fn),
  useMemo: vi.fn((fn) => fn()),
  useRef: vi.fn(() => ({ current: null }))
}))

vi.mock('../stores/use-game-store', () => ({
  useGameStore: Object.assign(
    vi.fn(() => mocked.gameStore),
    {
      getState: vi.fn(() => ({ activeLightSources: mocked.activeLightSources }))
    }
  )
}))

vi.mock('../services/combat/combat-rules', () => ({
  isMoveBlockedByFear: vi.fn(() => false),
  proneStandUpCost: vi.fn(() => 15),
  triggersOpportunityAttack: vi.fn(() => false)
}))

vi.mock('../services/combat/reaction-tracker', () => ({
  checkOpportunityAttack: vi.fn(() => [])
}))

vi.mock('../services/map/vision-computation', () => ({
  recomputeVision: mocked.recomputeVision,
  buildMapLightSources: mocked.buildMapLightSources,
  debouncedRecomputeVision: mocked.debouncedRecomputeVision
}))

vi.mock('../services/weather-mechanics', () => ({
  getWeatherEffects: vi.fn(() => ({ speedModifier: 1 }))
}))

describe('useTokenMovement', () => {
  beforeEach(() => {
    mocked.gameStore.initiative = null
    mocked.gameStore.turnStates = {}
    mocked.gameStore.conditions = []
    mocked.gameStore.weatherOverride = null
    mocked.gameStore.moveToken.mockReset()
    mocked.gameStore.useMovement.mockReset()
    mocked.gameStore.updateToken.mockReset()
    mocked.gameStore.removeToken.mockReset()
    mocked.gameStore.removeFromInitiative.mockReset()
    mocked.gameStore.setPartyVisionCells.mockReset()
    mocked.gameStore.addExploredCells.mockReset()
    mocked.activeLightSources.length = 0
    mocked.buildMapLightSources.mockReset()
    mocked.buildMapLightSources.mockReturnValue([])
    mocked.debouncedRecomputeVision.mockReset()
    mocked.recomputeVision.mockReset()
    mocked.recomputeVision.mockReturnValue({ visibleCells: [] })
  })

  it('can be imported', async () => {
    const mod = await import('./use-token-movement')
    expect(mod).toBeDefined()
  })

  it('exports useTokenMovement as a named function', async () => {
    const mod = await import('./use-token-movement')
    expect(typeof mod.useTokenMovement).toBe('function')
  })

  it('returns handleTokenMoveWithOA and handleConcentrationLost functions', async () => {
    const mod = await import('./use-token-movement')
    const result = mod.useTokenMovement({
      activeMap: null,
      teleportMove: false,
      addChatMessage: vi.fn(),
      setOaPrompt: vi.fn(),
      setConcCheckPrompt: vi.fn()
    })
    expect(typeof result.handleTokenMoveWithOA).toBe('function')
    expect(typeof result.handleConcentrationLost).toBe('function')
  })

  it('passes mounted rider positions into dynamic fog recompute', async () => {
    const mod = await import('./use-token-movement')
    const activeMap: GameMap = {
      id: 'map-1',
      name: 'Road',
      campaignId: 'camp-1',
      imagePath: 'road.png',
      width: 1000,
      height: 1000,
      grid: { enabled: true, cellSize: 50, offsetX: 0, offsetY: 0, color: '#fff', opacity: 1, type: 'square' },
      tokens: [
        {
          id: 'mount-token',
          entityId: 'horse-1',
          entityType: 'npc',
          label: 'Horse',
          gridX: 2,
          gridY: 3,
          sizeX: 2,
          sizeY: 2,
          visibleToPlayers: true,
          conditions: [],
          riderId: 'knight-1'
        },
        {
          id: 'rider-token',
          entityId: 'knight-1',
          entityType: 'player',
          label: 'Knight',
          gridX: 2,
          gridY: 3,
          sizeX: 1,
          sizeY: 1,
          visibleToPlayers: true,
          conditions: []
        }
      ],
      fogOfWar: { enabled: true, revealedCells: [], dynamicFogEnabled: true },
      terrain: [],
      createdAt: '2026-03-09T00:00:00.000Z'
    }

    const result = mod.useTokenMovement({
      activeMap,
      teleportMove: false,
      addChatMessage: vi.fn(),
      setOaPrompt: vi.fn(),
      setConcCheckPrompt: vi.fn()
    })

    result.handleTokenMoveWithOA('mount-token', 5, 6)

    expect(mocked.gameStore.moveToken).toHaveBeenCalledWith('map-1', 'mount-token', 5, 6)
    const patchedTokens = mocked.debouncedRecomputeVision.mock.calls[0]?.[2] as GameMap['tokens']
    expect(patchedTokens.find((token) => token.id === 'mount-token')).toMatchObject({ gridX: 5, gridY: 6 })
    expect(patchedTokens.find((token) => token.id === 'rider-token')).toMatchObject({ gridX: 5, gridY: 6 })
  })
})
