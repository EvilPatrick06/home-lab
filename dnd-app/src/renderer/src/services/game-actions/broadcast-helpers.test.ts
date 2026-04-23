import { beforeEach, describe, expect, it, vi } from 'vitest'

import { broadcastConditionSync, broadcastInitiativeSync, broadcastTokenSync } from './broadcast-helpers'
import type { StoreAccessors } from './types'

function makeStores(overrides?: {
  gameState?: Record<string, unknown>
  networkState?: Record<string, unknown>
}): StoreAccessors {
  const sendMessage = vi.fn()
  const defaultGameState = {
    initiative: null,
    maps: [],
    conditions: [],
    ...overrides?.gameState
  }
  const defaultNetworkState = {
    sendMessage,
    ...overrides?.networkState
  }
  return {
    getGameStore: () => ({ getState: () => defaultGameState }) as any,
    getLobbyStore: () => ({ getState: vi.fn() }) as any,
    getNetworkStore: () => ({ getState: () => defaultNetworkState }) as any
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('broadcastInitiativeSync', () => {
  it('does nothing when no initiative is running', () => {
    const stores = makeStores()
    broadcastInitiativeSync(stores)
    const sendMessage = stores.getNetworkStore().getState().sendMessage
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('sends dm:initiative-update with order and current index', () => {
    const stores = makeStores({
      gameState: {
        initiative: {
          round: 1,
          currentIndex: 0,
          entries: [
            { id: 'i1', entityName: 'Fighter', total: 18 },
            { id: 'i2', entityName: 'Goblin', total: 12 }
          ]
        }
      }
    })
    broadcastInitiativeSync(stores)
    const sendMessage = stores.getNetworkStore().getState().sendMessage
    expect(sendMessage).toHaveBeenCalledWith('dm:initiative-update', {
      order: [
        { id: 'i1', name: 'Fighter', initiative: 18 },
        { id: 'i2', name: 'Goblin', initiative: 12 }
      ],
      currentTurnIndex: 0
    })
  })
})

describe('broadcastTokenSync', () => {
  it('does nothing when map not found', () => {
    const stores = makeStores({ gameState: { maps: [] } })
    broadcastTokenSync('missing-map', stores)
    const sendMessage = stores.getNetworkStore().getState().sendMessage
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('sends dm:token-move for each token on the map', () => {
    const stores = makeStores({
      gameState: {
        maps: [
          {
            id: 'map-1',
            tokens: [
              { id: 't1', gridX: 5, gridY: 3 },
              { id: 't2', gridX: 10, gridY: 7 }
            ]
          }
        ]
      }
    })
    broadcastTokenSync('map-1', stores)
    const sendMessage = stores.getNetworkStore().getState().sendMessage
    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(sendMessage).toHaveBeenCalledWith('dm:token-move', { tokenId: 't1', gridX: 5, gridY: 3 })
    expect(sendMessage).toHaveBeenCalledWith('dm:token-move', { tokenId: 't2', gridX: 10, gridY: 7 })
  })
})

describe('broadcastConditionSync', () => {
  it('does nothing when no conditions', () => {
    const stores = makeStores({ gameState: { conditions: [] } })
    broadcastConditionSync(stores)
    const sendMessage = stores.getNetworkStore().getState().sendMessage
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('sends dm:condition-update for each condition', () => {
    const stores = makeStores({
      gameState: {
        conditions: [
          { entityId: 'e1', condition: 'poisoned' },
          { entityId: 'e2', condition: 'stunned' }
        ]
      }
    })
    broadcastConditionSync(stores)
    const sendMessage = stores.getNetworkStore().getState().sendMessage
    expect(sendMessage).toHaveBeenCalledTimes(2)
    expect(sendMessage).toHaveBeenCalledWith('dm:condition-update', {
      targetId: 'e1',
      condition: 'poisoned',
      active: true
    })
    expect(sendMessage).toHaveBeenCalledWith('dm:condition-update', {
      targetId: 'e2',
      condition: 'stunned',
      active: true
    })
  })
})
