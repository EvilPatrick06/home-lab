import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-mount' })

import { executeDismountToken, executeMountToken } from './mount-actions'
import type { ActiveMap, DmAction, GameStoreSnapshot, StoreAccessors } from './types'

function makeGameStore(overrides: Record<string, unknown> = {}) {
  return {
    setMounted: vi.fn(),
    dismountRider: vi.fn(),
    updateToken: vi.fn(),
    turnStates: {},
    ...overrides
  } as unknown as GameStoreSnapshot
}

function makeMap(): ActiveMap {
  return {
    id: 'm',
    tokens: [
      { id: 't1', entityId: 'e1', label: 'Aria', conditions: [] },
      { id: 't2', entityId: 'e2', label: 'Warhorse', conditions: [] }
    ]
  } as unknown as ActiveMap
}

let stores: StoreAccessors
let addChatMessage: ReturnType<typeof vi.fn>
let sendMessage: ReturnType<typeof vi.fn>

beforeEach(() => {
  addChatMessage = vi.fn()
  sendMessage = vi.fn()
  stores = {
    getGameStore: vi.fn(),
    getLobbyStore: vi.fn(() => ({ getState: () => ({ addChatMessage }) })),
    getNetworkStore: vi.fn(() => ({ getState: () => ({ sendMessage }) }))
  } as unknown as StoreAccessors
})

describe('mount-actions', () => {
  it('mount_token sets the rider mounted + the mount riderId (controlled default)', () => {
    const gs = makeGameStore()
    const ok = executeMountToken(
      { action: 'mount_token', riderLabel: 'Aria', mountLabel: 'Warhorse' } as DmAction,
      gs,
      makeMap(),
      stores
    )
    expect(ok).toBe(true)
    expect(gs.setMounted).toHaveBeenCalledWith('e1', 't2', 'controlled')
    expect(gs.updateToken).toHaveBeenCalledWith('m', 't2', { riderId: 'e1' })
  })

  it('mount_token honors an independent mount type', () => {
    const gs = makeGameStore()
    executeMountToken(
      { action: 'mount_token', riderLabel: 'Aria', mountLabel: 'Warhorse', mountType: 'independent' } as DmAction,
      gs,
      makeMap(),
      stores
    )
    expect(gs.setMounted).toHaveBeenCalledWith('e1', 't2', 'independent')
  })

  it('mount_token refuses a mount that already has a rider', () => {
    const gs = makeGameStore()
    const map = {
      id: 'm',
      tokens: [
        { id: 't1', entityId: 'e1', label: 'Aria', conditions: [] },
        { id: 't2', entityId: 'e2', label: 'Warhorse', conditions: [], riderId: 'someone' }
      ]
    } as unknown as ActiveMap
    expect(() =>
      executeMountToken(
        { action: 'mount_token', riderLabel: 'Aria', mountLabel: 'Warhorse' } as DmAction,
        gs,
        map,
        stores
      )
    ).toThrow('already has a rider')
  })

  it('mount_token throws when the rider or mount label does not resolve', () => {
    const gs = makeGameStore()
    expect(() =>
      executeMountToken(
        { action: 'mount_token', riderLabel: 'Ghost', mountLabel: 'Warhorse' } as DmAction,
        gs,
        makeMap(),
        stores
      )
    ).toThrow('Rider not found')
  })

  it('dismount_token clears the mount riderId and the rider mounted state', () => {
    const gs = makeGameStore({ turnStates: { e1: { entityId: 'e1', mountedOn: 't2', mountType: 'controlled' } } })
    const ok = executeDismountToken({ action: 'dismount_token', riderLabel: 'Aria' } as DmAction, gs, makeMap(), stores)
    expect(ok).toBe(true)
    expect(gs.updateToken).toHaveBeenCalledWith('m', 't2', { riderId: undefined })
    expect(gs.dismountRider).toHaveBeenCalledWith('e1')
  })

  it('dismount_token still clears state when the rider has no recorded mount', () => {
    const gs = makeGameStore()
    executeDismountToken({ action: 'dismount_token', riderLabel: 'Aria' } as DmAction, gs, makeMap(), stores)
    expect(gs.updateToken).not.toHaveBeenCalled()
    expect(gs.dismountRider).toHaveBeenCalledWith('e1')
  })
})
