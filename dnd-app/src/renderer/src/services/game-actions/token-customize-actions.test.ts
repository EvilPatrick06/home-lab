import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./broadcast-helpers', () => ({ broadcastTokenSync: vi.fn() }))
vi.mock('./name-resolver', () => ({
  resolveTokenByLabel: vi.fn((tokens: Array<{ label: string }>, label: string) =>
    tokens.find((t) => t.label.toLowerCase() === label.toLowerCase())
  )
}))

import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

const stores = {} as StoreAccessors
function makeGameStore() {
  return { updateToken: vi.fn() } as unknown as GameStoreSnapshot
}
function makeMap() {
  return { id: 'map-1', name: 'Test', tokens: [{ id: 't1', entityId: 'e1', label: 'Eagle' }] } as unknown as ActiveMap
}

describe('token-customize-actions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('maps provided fields onto updateToken (elevation/fly/senses/visuals)', async () => {
    const { executeCustomizeToken } = await import('./token-customize-actions')
    const gs = makeGameStore()
    const action: DmAction = {
      action: 'customize_token',
      label: 'Eagle',
      elevation: 60,
      flySpeed: 80,
      color: '#88f',
      specialSenses: [{ type: 'blindsight', range: 30 }]
    }
    expect(executeCustomizeToken(action, gs, makeMap(), stores)).toBe(true)
    expect(gs.updateToken).toHaveBeenCalledWith('map-1', 't1', {
      elevation: 60,
      flySpeed: 80,
      color: '#88f',
      specialSenses: [{ type: 'blindsight', range: 30 }]
    })
  })

  it('only includes the fields that were provided', async () => {
    const { executeCustomizeToken } = await import('./token-customize-actions')
    const gs = makeGameStore()
    executeCustomizeToken({ action: 'customize_token', label: 'Eagle', floor: 2 }, gs, makeMap(), stores)
    expect(gs.updateToken).toHaveBeenCalledWith('map-1', 't1', { floor: 2 })
  })

  it('throws when the token is not found', async () => {
    const { executeCustomizeToken } = await import('./token-customize-actions')
    expect(() =>
      executeCustomizeToken(
        { action: 'customize_token', label: 'Ghost', color: '#fff' },
        makeGameStore(),
        makeMap(),
        stores
      )
    ).toThrow('Token not found')
  })

  it('throws without an active map', async () => {
    const { executeCustomizeToken } = await import('./token-customize-actions')
    expect(() =>
      executeCustomizeToken({ action: 'customize_token', label: 'Eagle', floor: 1 }, makeGameStore(), undefined, stores)
    ).toThrow('No active map')
  })
})
