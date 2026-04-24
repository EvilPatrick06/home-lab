import { describe, expect, it, vi } from 'vitest'
import { createTurnState, initialState } from './types'

vi.stubGlobal('window', { api: { storage: {}, game: {} } })

function createTestStore(overrides: Record<string, unknown> = {}) {
  let state: Record<string, unknown> = {
    ...initialState,
    ...overrides
  }

  const setState = (
    updater: Record<string, unknown> | ((current: Record<string, unknown>) => Record<string, unknown>)
  ) => {
    const next = typeof updater === 'function' ? updater(state) : updater
    state = { ...state, ...next }
  }

  const getState = () => state

  return import('./map-token-slice').then(({ createMapTokenSlice }) => {
    state = {
      ...state,
      ...createMapTokenSlice(setState as never, getState as never, undefined as never)
    }

    return { getState }
  })
}

describe('map-token-slice', () => {
  it('can be imported', async () => {
    const mod = await import('./map-token-slice')
    expect(mod).toBeDefined()
  })

  it('exports createMapTokenSlice as a function', async () => {
    const mod = await import('./map-token-slice')
    expect(typeof mod.createMapTokenSlice).toBe('function')
  })

  it('moves the rider token with the mount token', async () => {
    const store = await createTestStore({
      activeMapId: 'map-1',
      maps: [
        {
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
          fogOfWar: { enabled: false, revealedCells: [] },
          terrain: [],
          createdAt: '2026-03-09T00:00:00.000Z'
        }
      ]
    })

    store.getState().moveToken('map-1', 'mount-token', 7, 8)

    const movedMap = store.getState().maps[0]
    expect(movedMap.tokens.find((token) => token.id === 'mount-token')).toMatchObject({ gridX: 7, gridY: 8 })
    expect(movedMap.tokens.find((token) => token.id === 'rider-token')).toMatchObject({ gridX: 7, gridY: 8 })
  })

  it('moves the rider token when mount coordinates are updated directly', async () => {
    const store = await createTestStore({
      activeMapId: 'map-1',
      maps: [
        {
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
          fogOfWar: { enabled: false, revealedCells: [] },
          terrain: [],
          createdAt: '2026-03-09T00:00:00.000Z'
        }
      ]
    })

    store.getState().updateToken('map-1', 'mount-token', { gridX: 4, gridY: 6, label: 'Warhorse' })

    const movedMap = store.getState().maps[0]
    expect(movedMap.tokens.find((token) => token.id === 'mount-token')).toMatchObject({
      label: 'Warhorse',
      gridX: 4,
      gridY: 6
    })
    expect(movedMap.tokens.find((token) => token.id === 'rider-token')).toMatchObject({ gridX: 4, gridY: 6 })
  })

  it('clears the rider turn state when riderId is explicitly removed', async () => {
    const store = await createTestStore({
      activeMapId: 'map-1',
      maps: [
        {
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
          fogOfWar: { enabled: false, revealedCells: [] },
          terrain: [],
          createdAt: '2026-03-09T00:00:00.000Z'
        }
      ],
      turnStates: {
        'knight-1': {
          ...createTurnState('knight-1', 30),
          mountedOn: 'mount-token',
          mountType: 'controlled'
        }
      }
    })

    store.getState().updateToken('map-1', 'mount-token', { riderId: undefined })

    expect(store.getState().turnStates['knight-1']).toMatchObject({
      mountedOn: undefined,
      mountType: undefined
    })
  })
})
